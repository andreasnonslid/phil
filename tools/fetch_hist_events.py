#!/usr/bin/env python3
"""Fetch historical events from Wikidata + Wikipedia and emit JSON entries.

Strategy:
  1. SPARQL query pulls notable historical events (before 1950, with
     Wikipedia articles, point-in-time or start dates, and location data).
  2. Wikipedia Summary API provides desc and tldr text.
  3. Wikidata heuristics map location → region and date → period.
  4. Output includes _meta fields for a subsequent LLM classification pass.

Output: prints JSON array of entries ready to merge into hist-events.json.
Run: python tools/fetch_hist_events.py > /tmp/events_raw.json
Then review, prune, and merge manually.
"""
from __future__ import annotations

import json
import re
import time
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
USER_AGENT = "PhilHistEvents/1.0 (https://github.com/andreasnonslid/phil; manual script)"
SLEEP = 0.3

VALID_PERIODS = [
    "Ancient (to 500 CE)",
    "Medieval (500–1500)",
    "Early modern (1500–1800)",
    "19th century",
    "20th century onward",
]
VALID_REGIONS = ["Africa", "Americas", "East Asia", "Europe", "Middle East", "South Asia", "Oceania"]

# Country/location QIDs → region
LOCATION_REGION_MAP: dict[str, str] = {
    "Q142": "Europe",   # France
    "Q183": "Europe",   # Germany
    "Q145": "Europe",   # UK
    "Q38": "Europe",    # Italy
    "Q29": "Europe",    # Spain
    "Q159": "Europe",   # Russia
    "Q41": "Europe",    # Greece
    "Q40": "Europe",    # Austria
    "Q39": "Europe",    # Switzerland
    "Q36": "Europe",    # Poland
    "Q37": "Europe",    # Lithuania
    "Q35": "Europe",    # Denmark
    "Q34": "Europe",    # Sweden
    "Q33": "Europe",    # Finland
    "Q20": "Europe",    # Norway
    "Q45": "Europe",    # Portugal
    "Q55": "Europe",    # Netherlands
    "Q31": "Europe",    # Belgium
    "Q28": "Europe",    # Hungary
    "Q213": "Europe",   # Czech Republic
    "Q214": "Europe",   # Slovakia
    "Q218": "Europe",   # Romania
    "Q212": "Europe",   # Ukraine
    "Q184": "Europe",   # Belarus
    "Q403": "Europe",   # Serbia
    "Q189": "Europe",   # Iceland
    "Q233": "Europe",   # Monaco
    # Americas
    "Q30": "Americas",
    "Q96": "Americas",
    "Q155": "Americas",
    "Q414": "Americas",
    "Q241": "Americas",
    "Q717": "Americas",
    "Q736": "Americas",
    "Q750": "Americas",
    "Q298": "Americas",
    "Q16": "Americas",
    "Q419": "Americas",
    "Q800": "Americas",
    # East Asia
    "Q148": "East Asia",
    "Q17": "East Asia",
    "Q884": "East Asia",
    "Q423": "East Asia",
    "Q865": "East Asia",
    "Q928": "East Asia",
    # Middle East
    "Q801": "Middle East",
    "Q822": "Middle East",
    "Q858": "Middle East",
    "Q878": "Middle East",
    "Q817": "Middle East",
    "Q794": "Middle East",
    "Q805": "Middle East",
    "Q810": "Middle East",
    "Q796": "Middle East",
    # South Asia
    "Q668": "South Asia",
    "Q843": "South Asia",
    "Q837": "South Asia",
    "Q854": "South Asia",
    "Q889": "South Asia",
    "Q902": "South Asia",
    # Africa
    "Q258": "Africa",
    "Q114": "Africa",
    "Q115": "Africa",
    "Q117": "Africa",
    "Q916": "Africa",
    "Q945": "Africa",
    "Q1044": "Africa",
    "Q1045": "Africa",
    "Q1050": "Africa",
    # Oceania
    "Q408": "Oceania",
    "Q664": "Oceania",
    "Q691": "Oceania",
    # Ancient empires / civilisations (map to region by geography)
    "Q11768": "Europe",      # Roman Republic
    "Q12548": "Europe",      # Roman Empire
    "Q7205": "Middle East",  # Persian Empire (Achaemenid)
    "Q8733": "Middle East",  # Ottoman Empire
    "Q844653": "Middle East",# Byzantine Empire → Middle East/Europe (use Europe)
    "Q844653": "Europe",
    "Q6256": "Europe",       # country (generic fallback)
}


def sparql_query(query: str) -> list[dict]:
    url = "https://query.wikidata.org/sparql"
    req = urllib.request.Request(
        url + "?" + urllib.parse.urlencode({"query": query, "format": "json"}),
        headers={"User-Agent": USER_AGENT, "Accept": "application/sparql-results+json"},
    )
    with urllib.request.urlopen(req, timeout=45) as resp:
        return json.loads(resp.read())["results"]["bindings"]


def wiki_summary(title: str) -> dict | None:
    url = f"https://en.wikipedia.org/api/rest_v1/page/summary/{urllib.parse.quote(title)}"
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            return json.loads(resp.read())
    except Exception:
        return None


def year_to_period(y: int) -> str:
    if y <= 500:
        return "Ancient (to 500 CE)"
    if y <= 1500:
        return "Medieval (500–1500)"
    if y <= 1800:
        return "Early modern (1500–1800)"
    if y <= 1900:
        return "19th century"
    return "20th century onward"


def format_dates(y: int) -> str:
    if y < 0:
        return f"{abs(y)} BCE"
    return str(y)


def extract_qid(uri: str) -> str:
    return uri.rsplit("/", 1)[-1]


def qids_to_region(qids: list[str]) -> str:
    for q in qids:
        r = LOCATION_REGION_MAP.get(q)
        if r:
            return r
    return ""  # unknown — LLM pass will fill


# Pull battles, wars, revolutions, treaties, discoveries, founding events
SPARQL = """
SELECT DISTINCT ?item ?itemLabel ?pointInTime ?startTime
  (GROUP_CONCAT(DISTINCT ?locationQid; separator="|") AS ?locations)
  ?article
WHERE {
  ?item wdt:P31 ?type .
  VALUES ?type {
    wd:Q178561   # battle
    wd:Q198      # war
    wd:Q7283     # revolution
    wd:Q131569   # treaty
    wd:Q1656682  # event
    wd:Q13418847 # historical event
    wd:Q1190554  # occurrence
    wd:Q3839081  # military operation
    wd:Q891723   # public policy
    wd:Q2627975  # armed conflict
  }
  OPTIONAL { ?item wdt:P585 ?pointInTime . }
  OPTIONAL { ?item wdt:P580 ?startTime . }
  FILTER(BOUND(?pointInTime) || BOUND(?startTime))
  BIND(COALESCE(?pointInTime, ?startTime) AS ?eventDate)
  FILTER(YEAR(?eventDate) < 1950)
  OPTIONAL {
    ?item wdt:P276|wdt:P17|wdt:P495 ?location .
    BIND(STR(?location) AS ?locationQid)
  }
  ?article schema:about ?item ;
           schema:isPartOf <https://en.wikipedia.org/> .
  ?item wikibase:sitelinks ?links .
  FILTER(?links > 20)
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
}
GROUP BY ?item ?itemLabel ?pointInTime ?startTime ?article
LIMIT 800
"""


def main() -> None:
    print("Querying Wikidata...", flush=True)
    rows = sparql_query(SPARQL)
    print(f"Got {len(rows)} candidates", flush=True)

    entries: list[dict] = []
    seen_names: set[str] = set()

    for i, row in enumerate(rows):
        name = row.get("itemLabel", {}).get("value", "")
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

        location_qids = [extract_qid(q) for q in row.get("locations", {}).get("value", "").split("|") if q]
        region = qids_to_region(location_qids)
        period = year_to_period(y)

        article_url = row.get("article", {}).get("value", "")
        wiki_title = article_url.rsplit("/wiki/", 1)[-1] if "/wiki/" in article_url else ""

        # Fetch Wikipedia summary
        time.sleep(SLEEP)
        summary = wiki_summary(wiki_title) if wiki_title else None
        if not summary or not summary.get("extract"):
            continue

        extract = summary["extract"]
        sentences = re.split(r'(?<=[.!?])\s+', extract.strip())
        desc = " ".join(sentences[:2]).strip()
        tldr = " ".join(sentences[:3]).strip() if len(sentences) > 2 else desc

        if len(desc) > 200:
            desc = desc[:197] + "…"
        if len(tldr) > 400:
            tldr = tldr[:397] + "…"

        entry: dict = {
            "name": name,
            "dates": format_dates(y),
            "y": y,
            "region": region or "Europe",  # placeholder; LLM pass fixes blanks
            "period": period,
            "desc": desc,
            "tldr": tldr,
            "url": article_url,
            "_location_qids": location_qids,  # for LLM region pass
        }
        entries.append(entry)

        if (i + 1) % 50 == 0:
            print(f"  processed {i+1}/{len(rows)}...", flush=True)

    print(f"\nTotal entries: {len(entries)}", flush=True)
    print(json.dumps(entries, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
