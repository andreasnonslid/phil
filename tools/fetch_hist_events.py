#!/usr/bin/env python3
"""Fetch historical events from Wikidata (via QLever) + Wikipedia.

Writes incrementally to a .jsonl checkpoint file so re-runs resume where they
left off. Final output (stdout) is a JSON array ready to merge into hist-events.json.

Run:
  python tools/fetch_hist_events.py > events_raw.json
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

CHECKPOINT = Path(__file__).resolve().parent / ".events_checkpoint.jsonl"
ENDPOINT = "https://qlever.dev/api/wikidata"
USER_AGENT = "PhilHistEvents/1.0 (andy.reinkarnert@gmail.com; manual script)"
SLEEP = 0.3

VALID_PERIODS = [
    "Ancient (to 500 CE)", "Medieval (500–1500)", "Early modern (1500–1800)",
    "19th century", "20th century onward",
]
VALID_REGIONS = ["Africa", "Americas", "East Asia", "Europe", "Middle East", "South Asia", "Oceania"]

LOCATION_REGION_MAP: dict[str, str] = {
    "Q142": "Europe", "Q183": "Europe", "Q145": "Europe", "Q38": "Europe",
    "Q29": "Europe", "Q159": "Europe", "Q41": "Europe", "Q40": "Europe",
    "Q39": "Europe", "Q36": "Europe", "Q37": "Europe", "Q35": "Europe",
    "Q34": "Europe", "Q33": "Europe", "Q20": "Europe", "Q45": "Europe",
    "Q55": "Europe", "Q31": "Europe", "Q28": "Europe", "Q213": "Europe",
    "Q214": "Europe", "Q218": "Europe", "Q212": "Europe", "Q184": "Europe",
    "Q403": "Europe", "Q189": "Europe", "Q233": "Europe",
    "Q11768": "Europe", "Q12548": "Europe", "Q844653": "Europe",
    "Q30": "Americas", "Q96": "Americas", "Q155": "Americas", "Q414": "Americas",
    "Q241": "Americas", "Q717": "Americas", "Q736": "Americas", "Q750": "Americas",
    "Q298": "Americas", "Q16": "Americas", "Q419": "Americas", "Q800": "Americas",
    "Q148": "East Asia", "Q17": "East Asia", "Q884": "East Asia",
    "Q423": "East Asia", "Q865": "East Asia", "Q928": "East Asia",
    "Q801": "Middle East", "Q822": "Middle East", "Q858": "Middle East",
    "Q878": "Middle East", "Q817": "Middle East", "Q794": "Middle East",
    "Q805": "Middle East", "Q810": "Middle East", "Q796": "Middle East",
    "Q7205": "Middle East", "Q8733": "Middle East",
    "Q668": "South Asia", "Q843": "South Asia", "Q837": "South Asia",
    "Q854": "South Asia", "Q889": "South Asia", "Q902": "South Asia",
    "Q258": "Africa", "Q114": "Africa", "Q115": "Africa", "Q117": "Africa",
    "Q916": "Africa", "Q945": "Africa", "Q1044": "Africa", "Q1045": "Africa",
    "Q1050": "Africa",
    "Q408": "Oceania", "Q664": "Oceania", "Q691": "Oceania",
}

SPARQL = """\
PREFIX wdt: <http://www.wikidata.org/prop/direct/>
PREFIX wd: <http://www.wikidata.org/entity/>
PREFIX wikibase: <http://wikiba.se/ontology#>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
SELECT DISTINCT ?item ?label ?pointInTime ?startTime
  (GROUP_CONCAT(DISTINCT ?locationQid; separator="|") AS ?locations)
WHERE {
  ?item wdt:P31 ?type .
  VALUES ?type {
    wd:Q178561 wd:Q198 wd:Q7283 wd:Q131569 wd:Q13418847
    wd:Q3839081 wd:Q2627975
  }
  OPTIONAL { ?item wdt:P585 ?pointInTime . }
  OPTIONAL { ?item wdt:P580 ?startTime . }
  FILTER(BOUND(?pointInTime) || BOUND(?startTime))
  BIND(COALESCE(?pointInTime, ?startTime) AS ?eventDate)
  FILTER(YEAR(?eventDate) < 1950)
  OPTIONAL {
    ?item wdt:P276|wdt:P17|wdt:P495 ?location .
    BIND(STRAFTER(STR(?location), "http://www.wikidata.org/entity/") AS ?locationQid)
  }
  ?item rdfs:label ?label .
  FILTER(LANG(?label) = "en")
  ?item wikibase:sitelinks ?links .
  FILTER(?links > 20)
}
GROUP BY ?item ?label ?pointInTime ?startTime
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


def year_to_period(y: int) -> str:
    if y <= 500: return "Ancient (to 500 CE)"
    if y <= 1500: return "Medieval (500–1500)"
    if y <= 1800: return "Early modern (1500–1800)"
    if y <= 1900: return "19th century"
    return "20th century onward"


def qids_to_region(qids: list[str]) -> str:
    for q in qids:
        r = LOCATION_REGION_MAP.get(q)
        if r:
            return r
    return ""


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
        if not name or re.match(r'^Q\d+$', name):
            continue
        if name in seen_names:
            continue
        seen_names.add(name)

        pit = row.get("pointInTime", {}).get("value", "") or row.get("startTime", {}).get("value", "")
        if not pit:
            continue
        try:
            y = int(pit[:5].lstrip("+").split("-")[0])
            if pit.startswith("-"):
                y = -y
        except (ValueError, IndexError):
            continue

        location_qids = [q for q in row.get("locations", {}).get("value", "").split("|") if q]
        region = qids_to_region(location_qids)
        period = year_to_period(y)

        wiki_title = name.replace(" ", "_")
        time.sleep(SLEEP)
        summary = wiki_summary(wiki_title)
        if not summary or not summary.get("extract"):
            continue

        canonical = summary.get("title", name)
        article_url = f"https://en.wikipedia.org/wiki/{urllib.parse.quote(canonical.replace(' ', '_'))}"

        extract = summary["extract"]
        sentences = re.split(r'(?<=[.!?])\s+', extract.strip())
        desc = " ".join(sentences[:2]).strip()
        tldr = " ".join(sentences[:3]).strip() if len(sentences) > 2 else desc
        if len(desc) > 200: desc = desc[:197] + "…"
        if len(tldr) > 400: tldr = tldr[:397] + "…"

        entry: dict = {
            "name": name,
            "dates": str(abs(y)) + (" BCE" if y < 0 else ""),
            "y": y,
            "region": region or "Europe",
            "period": period,
            "desc": desc,
            "tldr": tldr,
            "url": article_url,
            "_location_qids": location_qids,
        }
        append_checkpoint(entry)
        new_count += 1

        if (i + 1) % 50 == 0:
            print(f"  processed {i+1}/{len(rows)} ({new_count} new)...", file=sys.stderr, flush=True)

    all_entries = load_checkpoint()
    print(f"\nTotal entries: {len(all_entries)} ({new_count} new this run)", file=sys.stderr, flush=True)
    print(json.dumps(list(all_entries.values()), ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
