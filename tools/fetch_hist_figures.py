#!/usr/bin/env python3
"""Fetch historical figures from Wikidata (via QLever) + Wikipedia.

Writes incrementally to a .jsonl checkpoint file so re-runs resume where they
left off. Final output (stdout) is a JSON array ready to merge into hist-chars.json.

Run:
  python tools/fetch_hist_figures.py > figures_raw.json
  # Re-run safely — already-fetched entries are skipped via checkpoint.
"""
from __future__ import annotations

import json
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

CHECKPOINT = Path(__file__).resolve().parent / ".figures_checkpoint.jsonl"
ENDPOINT = "https://qlever.dev/api/wikidata"
USER_AGENT = "PhilHistFigures/1.0 (andy.reinkarnert@gmail.com; manual script)"
SLEEP = 0.3

VALID_ROLES = ["Ruler", "Military", "Scientist", "Artist", "Writer", "Explorer", "Religious", "Reformer"]
VALID_ERAS = ["Ancient (to 500 CE)", "Medieval (500–1500)", "Early modern (1500–1800)", "19th century", "20th century onward"]

OCCUPATION_ROLE_MAP: dict[str, str] = {
    "Q82955": "Ruler",
    "Q116": "Ruler",
    "Q12097": "Ruler",
    "Q1968812": "Ruler",
    "Q372436": "Military",
    "Q47064": "Military",
    "Q189290": "Military",
    "Q901": "Scientist",
    "Q170790": "Scientist",
    "Q169470": "Scientist",
    "Q593644": "Scientist",
    "Q2374149": "Scientist",
    "Q214917": "Explorer",
    "Q1028181": "Artist",
    "Q4610556": "Artist",
    "Q36834": "Artist",
    "Q177220": "Artist",
    "Q36180": "Writer",
    "Q4853732": "Writer",
    "Q6625963": "Writer",
    "Q4964182": "Writer",
    "Q1234713": "Reformer",
    "Q131512": "Reformer",
    "Q42603": "Religious",
    "Q43115": "Religious",
    "Q202444": "Religious",
}

COUNTRY_REGION_MAP: dict[str, str] = {
    "Q142": "Europe", "Q183": "Europe", "Q145": "Europe", "Q38": "Europe",
    "Q29": "Europe", "Q28": "Europe", "Q31": "Europe", "Q55": "Europe",
    "Q35": "Europe", "Q34": "Europe", "Q33": "Europe", "Q20": "Europe",
    "Q37": "Europe", "Q36": "Europe", "Q218": "Europe", "Q214": "Europe",
    "Q213": "Europe", "Q40": "Europe", "Q39": "Europe", "Q236": "Europe",
    "Q403": "Europe", "Q232": "Europe", "Q191": "Europe", "Q211": "Europe",
    "Q45": "Europe", "Q189": "Europe", "Q184": "Europe", "Q212": "Europe",
    "Q159": "Europe", "Q41": "Europe", "Q223": "Europe",
    "Q801": "Middle East", "Q803": "Middle East", "Q805": "Middle East",
    "Q810": "Middle East", "Q822": "Middle East", "Q858": "Middle East",
    "Q878": "Middle East", "Q817": "Middle East", "Q794": "Middle East",
    "Q796": "Middle East",
    "Q148": "East Asia", "Q17": "East Asia", "Q884": "East Asia",
    "Q423": "East Asia", "Q865": "East Asia", "Q928": "East Asia",
    "Q668": "South Asia", "Q843": "South Asia", "Q837": "South Asia",
    "Q854": "South Asia", "Q889": "South Asia", "Q902": "South Asia",
    "Q258": "Africa", "Q114": "Africa", "Q115": "Africa", "Q117": "Africa",
    "Q916": "Africa", "Q945": "Africa", "Q1044": "Africa", "Q1045": "Africa",
    "Q1050": "Africa",
    "Q30": "Americas", "Q96": "Americas", "Q155": "Americas", "Q414": "Americas",
    "Q241": "Americas", "Q717": "Americas", "Q736": "Americas", "Q750": "Americas",
    "Q298": "Americas", "Q16": "Americas", "Q419": "Americas", "Q800": "Americas",
    "Q691": "Oceania", "Q664": "Oceania", "Q408": "Oceania",
}

SPARQL = """\
PREFIX wdt: <http://www.wikidata.org/prop/direct/>
PREFIX wd: <http://www.wikidata.org/entity/>
PREFIX wikibase: <http://wikiba.se/ontology#>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
SELECT DISTINCT ?item ?label ?birthYear ?deathYear
  (GROUP_CONCAT(DISTINCT ?occupationQid; separator="|") AS ?occupations)
  (GROUP_CONCAT(DISTINCT ?countryQid; separator="|") AS ?countries)
WHERE {
  ?item wdt:P31 wd:Q5 .
  ?item wdt:P570 ?death .
  FILTER(YEAR(?death) < 1950)
  ?item wdt:P569 ?birth .
  BIND(YEAR(?birth) AS ?birthYear)
  BIND(YEAR(?death) AS ?deathYear)
  ?item wdt:P27|wdt:P495 ?country .
  BIND(STRAFTER(STR(?country), "http://www.wikidata.org/entity/") AS ?countryQid)
  OPTIONAL {
    ?item wdt:P106 ?occupation .
    BIND(STRAFTER(STR(?occupation), "http://www.wikidata.org/entity/") AS ?occupationQid)
  }
  ?item rdfs:label ?label .
  FILTER(LANG(?label) = "en")
  ?item wikibase:sitelinks ?links .
  FILTER(?links > 30)
}
GROUP BY ?item ?label ?birthYear ?deathYear
LIMIT 800
"""


def sparql_query(query: str) -> list[dict]:
    req = urllib.request.Request(
        ENDPOINT + "?" + urllib.parse.urlencode({"query": query}),
        headers={"User-Agent": USER_AGENT, "Accept": "application/sparql-results+json"},
    )
    for attempt in range(6):
        try:
            with urllib.request.urlopen(req, timeout=60) as resp:
                return json.loads(resp.read())["results"]["bindings"]
        except urllib.error.HTTPError as e:
            if e.code == 429:
                wait = 30 * (attempt + 1)
                print(f"  QLever 429, waiting {wait}s...", file=sys.stderr, flush=True)
                time.sleep(wait)
            else:
                raise
    raise RuntimeError("SPARQL query failed after retries")


def wiki_summary(title: str) -> dict | None:
    url = f"https://en.wikipedia.org/api/rest_v1/page/summary/{urllib.parse.quote(title)}"
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            return json.loads(resp.read())
    except Exception:
        return None


def year_to_era(y: int) -> str:
    if y <= 500: return "Ancient (to 500 CE)"
    if y <= 1500: return "Medieval (500–1500)"
    if y <= 1800: return "Early modern (1500–1800)"
    if y <= 1900: return "19th century"
    return "20th century onward"


def qids_to_roles(qids: list[str]) -> list[str]:
    seen: set[str] = set()
    roles: list[str] = []
    for q in qids:
        role = OCCUPATION_ROLE_MAP.get(q)
        if role and role not in seen:
            seen.add(role)
            roles.append(role)
    return roles or ["Reformer"]


def qid_to_region(qids: list[str]) -> str:
    for q in qids:
        r = COUNTRY_REGION_MAP.get(q)
        if r:
            return r
    return "Europe"


def load_checkpoint() -> dict[str, dict]:
    if not CHECKPOINT.exists():
        return {}
    entries = {}
    with CHECKPOINT.open(encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line:
                try:
                    e = json.loads(line)
                    entries[e["name"]] = e
                except Exception:
                    pass
    return entries


def append_checkpoint(entry: dict) -> None:
    with CHECKPOINT.open("a", encoding="utf-8") as f:
        f.write(json.dumps(entry, ensure_ascii=False) + "\n")


def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8")  # type: ignore[attr-defined]
    print("Loading checkpoint...", file=sys.stderr, flush=True)
    done = load_checkpoint()
    print(f"  {len(done)} entries already fetched", file=sys.stderr, flush=True)

    print("Querying QLever (Wikidata)...", file=sys.stderr, flush=True)
    rows = sparql_query(SPARQL)
    print(f"Got {len(rows)} candidates", file=sys.stderr, flush=True)

    seen_names: set[str] = set(done.keys())
    new_count = 0

    for i, row in enumerate(rows):
        name = row.get("label", {}).get("value", "")
        if not name or name.startswith("Q"):
            continue
        if name in seen_names:
            continue
        seen_names.add(name)

        birth_y = int(row.get("birthYear", {}).get("value", "0") or 0)
        death_y = int(row.get("deathYear", {}).get("value", "0") or 0)
        if birth_y == 0:
            continue

        occupation_qids = [q for q in row.get("occupations", {}).get("value", "").split("|") if q]
        country_qids = [q for q in row.get("countries", {}).get("value", "").split("|") if q]

        roles = qids_to_roles(occupation_qids)
        era = year_to_era(birth_y)

        wiki_title = name.replace(" ", "_")
        time.sleep(SLEEP)
        summary = wiki_summary(wiki_title)
        if not summary or not summary.get("extract"):
            # Try canonical title from summary redirect
            continue

        # Use canonical title from Wikipedia response if available
        canonical = summary.get("title", name)
        article_url = f"https://en.wikipedia.org/wiki/{urllib.parse.quote(canonical.replace(' ', '_'))}"

        extract = summary["extract"]
        sentences = re.split(r'(?<=[.!?])\s+', extract.strip())
        desc = " ".join(sentences[:2]).strip()
        tldr = " ".join(sentences[:3]).strip() if len(sentences) > 2 else desc
        if len(desc) > 200: desc = desc[:197] + "…"
        if len(tldr) > 400: tldr = tldr[:397] + "…"

        dates_str = f"{abs(birth_y)}{'BCE' if birth_y < 0 else ''}–{abs(death_y)}{'BCE' if death_y < 0 else ''}"

        entry: dict = {
            "name": name,
            "dates": dates_str,
            "y": birth_y,
            "roles": roles,
            "era": era,
            "desc": desc,
            "tldr": tldr,
            "url": article_url,
            "_country_qids": country_qids,
            "_occupation_qids": occupation_qids,
        }
        append_checkpoint(entry)
        new_count += 1

        if (i + 1) % 50 == 0:
            print(f"  processed {i+1}/{len(rows)} ({new_count} new)...", file=sys.stderr, flush=True)

    # Merge checkpoint (preserves entries from prior runs not in current SPARQL batch)
    all_entries = load_checkpoint()
    print(f"\nTotal entries: {len(all_entries)} ({new_count} new this run)", file=sys.stderr, flush=True)
    print(json.dumps(list(all_entries.values()), ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
