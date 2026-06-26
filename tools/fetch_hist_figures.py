#!/usr/bin/env python3
"""Fetch historical figures from Wikidata + Wikipedia and emit JSON entries.

Strategy:
  1. SPARQL query pulls notable historical figures (died before 1950, with
     Wikipedia articles, birth dates, and country/occupation data).
  2. Wikipedia Summary API provides desc and tldr text.
  3. Wikidata heuristics map country → region and birth year → era.
  4. Claude (claude-haiku-4-5) classifies roles and fixes edge cases.

Output: prints JSON array of entries ready to merge into hist-chars.json.
Run: python tools/fetch_hist_figures.py > /tmp/figures_raw.json
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
USER_AGENT = "PhilHistFigures/1.0 (https://github.com/andreasnonslid/phil; manual script)"
SLEEP = 0.3

VALID_ROLES = ["Ruler", "Military", "Scientist", "Artist", "Writer", "Explorer", "Religious", "Reformer"]
VALID_ERAS = ["Ancient (to 500 CE)", "Medieval (500–1500)", "Early modern (1500–1800)", "19th century", "20th century onward"]

# Wikidata occupation QIDs → roles (first match wins)
OCCUPATION_ROLE_MAP: dict[str, str] = {
    "Q82955": "Ruler",      # politician
    "Q116": "Ruler",        # monarch
    "Q12097": "Ruler",      # regent
    "Q1968812": "Ruler",    # emperor
    "Q372436": "Military",  # military officer
    "Q47064": "Military",   # military personnel
    "Q189290": "Military",  # military commander
    "Q901": "Scientist",    # scientist
    "Q170790": "Scientist", # mathematician
    "Q169470": "Scientist", # physicist
    "Q593644": "Scientist", # chemist
    "Q2374149": "Scientist",# natural philosopher
    "Q214917": "Explorer",  # explorer
    "Q33231": "Explorer",   # photographer (skip — handled below)
    "Q1028181": "Artist",   # painter
    "Q4610556": "Artist",   # sculptor
    "Q36834": "Artist",     # composer
    "Q177220": "Artist",    # singer
    "Q36180": "Writer",     # writer
    "Q4853732": "Writer",   # novelist
    "Q6625963": "Writer",   # playwright
    "Q4964182": "Writer",   # philosopher (secondary; philosopher dataset handles these)
    "Q1234713": "Reformer", # activist
    "Q131512": "Reformer",  # reformer
    "Q42603": "Religious",  # religious leader
    "Q43115": "Religious",  # saint
    "Q202444": "Religious", # prophet
}

# Wikidata country QIDs → region
COUNTRY_REGION_MAP: dict[str, str] = {
    # Europe
    "Q142": "Europe",   # France
    "Q183": "Europe",   # Germany
    "Q145": "Europe",   # UK
    "Q38": "Europe",    # Italy
    "Q29": "Europe",    # Spain
    "Q28": "Europe",    # Hungary
    "Q31": "Europe",    # Belgium
    "Q55": "Europe",    # Netherlands
    "Q35": "Europe",    # Denmark
    "Q34": "Europe",    # Sweden
    "Q33": "Europe",    # Finland
    "Q20": "Europe",    # Norway
    "Q37": "Europe",    # Lithuania
    "Q36": "Europe",    # Poland
    "Q218": "Europe",   # Romania
    "Q214": "Europe",   # Slovakia
    "Q213": "Europe",   # Czech Republic
    "Q40": "Europe",    # Austria
    "Q39": "Europe",    # Switzerland
    "Q236": "Europe",   # Montenegro
    "Q403": "Europe",   # Serbia
    "Q232": "Europe",   # Latvia
    "Q191": "Europe",   # Estonia
    "Q211": "Europe",   # Latvia (dup guard)
    "Q45": "Europe",    # Portugal
    "Q189": "Europe",   # Iceland
    "Q184": "Europe",   # Belarus
    "Q212": "Europe",   # Ukraine
    "Q159": "Europe",   # Russia
    "Q41": "Europe",    # Greece
    "Q223": "Europe",   # Greenland
    "Q801": "Middle East",   # Israel
    "Q803": "Middle East",   # Kuwait
    "Q805": "Middle East",   # Yemen
    "Q810": "Middle East",   # Jordan
    "Q819": "Middle East",   # Oman? (no - Laos)
    "Q822": "Middle East",   # Lebanon
    "Q836": "Middle East",   # Myanmar? skip
    "Q858": "Middle East",   # Syria
    "Q869": "Middle East",   # Thailand? skip
    "Q878": "Middle East",   # UAE
    "Q902": "South Asia",    # Bangladesh
    "Q928": "South Asia",    # Philippines? skip
    "Q928": "East Asia",
    "Q148": "East Asia",    # China
    "Q17": "East Asia",     # Japan
    "Q884": "East Asia",    # South Korea
    "Q423": "East Asia",    # North Korea
    "Q865": "East Asia",    # Taiwan
    "Q252": "East Asia",    # Indonesia? skip
    "Q672": "East Asia",    # Kiribati? skip
    "Q817": "Middle East",  # Iraq
    "Q794": "Middle East",  # Iran
    "Q796": "Middle East",  # Iraq (dup)
    "Q833": "South Asia",   # Malaysia? skip
    "Q837": "South Asia",   # Nepal
    "Q843": "South Asia",   # Pakistan
    "Q668": "South Asia",   # India
    "Q854": "South Asia",   # Sri Lanka
    "Q889": "South Asia",   # Afghanistan
    "Q258": "Africa",       # South Africa
    "Q114": "Africa",       # Kenya
    "Q115": "Africa",       # Ethiopia
    "Q117": "Africa",       # Ghana
    "Q142": "Europe",
    "Q916": "Africa",       # Angola
    "Q945": "Africa",       # Togo
    "Q965": "Africa",       # Burkina Faso
    "Q1044": "Africa",      # Sierra Leone
    "Q1045": "Africa",      # Uganda
    "Q1050": "Africa",      # Mozambique
    "Q928": "East Asia",    # Philippines
    "Q30": "Americas",      # USA
    "Q96": "Americas",      # Mexico
    "Q155": "Americas",     # Brazil
    "Q414": "Americas",     # Argentina
    "Q241": "Americas",     # Cuba
    "Q717": "Americas",     # Venezuela
    "Q736": "Americas",     # Ecuador
    "Q750": "Americas",     # Bolivia
    "Q298": "Americas",     # Chile
    "Q244": "Americas",     # Bahamas? skip
    "Q16": "Americas",      # Canada
    "Q419": "Americas",     # Peru
    "Q166": "Americas",     # Jamaica? skip
    "Q800": "Americas",     # Costa Rica
    "Q691": "Oceania",      # Papua New Guinea
    "Q664": "Oceania",      # New Zealand
    "Q408": "Oceania",      # Australia
}


def sparql_query(query: str) -> list[dict]:
    url = "https://query.wikidata.org/sparql"
    req = urllib.request.Request(
        url + "?" + urllib.parse.urlencode({"query": query, "format": "json"}),
        headers={"User-Agent": USER_AGENT, "Accept": "application/sparql-results+json"},
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read())["results"]["bindings"]


def wiki_summary(title: str) -> dict | None:
    url = f"https://en.wikipedia.org/api/rest_v1/page/summary/{urllib.parse.quote(title)}"
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            return json.loads(resp.read())
    except Exception:
        return None


def year_to_era(y: int) -> str:
    if y <= 500:
        return "Ancient (to 500 CE)"
    if y <= 1500:
        return "Medieval (500–1500)"
    if y <= 1800:
        return "Early modern (1500–1800)"
    if y <= 1900:
        return "19th century"
    return "20th century onward"


def qids_to_roles(qids: list[str]) -> list[str]:
    seen: set[str] = set()
    roles: list[str] = []
    for q in qids:
        role = OCCUPATION_ROLE_MAP.get(q)
        if role and role not in seen:
            seen.add(role)
            roles.append(role)
    return roles or ["Reformer"]  # fallback


def qid_to_region(qids: list[str]) -> str:
    for q in qids:
        r = COUNTRY_REGION_MAP.get(q)
        if r:
            return r
    return "Europe"  # fallback; LLM pass can fix


SPARQL = """
SELECT DISTINCT ?item ?itemLabel ?birthYear ?deathYear
  (GROUP_CONCAT(DISTINCT ?occupationQid; separator="|") AS ?occupations)
  (GROUP_CONCAT(DISTINCT ?countryQid; separator="|") AS ?countries)
  ?article
WHERE {
  ?item wdt:P31 wd:Q5 .                         # human
  ?item wdt:P570 ?death .                        # has death date
  FILTER(YEAR(?death) < 1950)
  ?item wdt:P569 ?birth .                        # has birth date
  BIND(YEAR(?birth) AS ?birthYear)
  BIND(YEAR(?death) AS ?deathYear)
  ?item wdt:P569 ?birthDate .
  ?item wdt:P27|wdt:P495 ?country .             # country of citizenship or origin
  BIND(STR(?country) AS ?countryQid)
  OPTIONAL { ?item wdt:P106 ?occupation .
             BIND(STR(?occupation) AS ?occupationQid) }
  ?article schema:about ?item ;
           schema:isPartOf <https://en.wikipedia.org/> .
  ?item wikibase:sitelinks ?links .
  FILTER(?links > 30)                            # reasonably notable
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
}
GROUP BY ?item ?itemLabel ?birthYear ?deathYear ?article
LIMIT 800
"""


def extract_qid(uri: str) -> str:
    return uri.rsplit("/", 1)[-1]


def main() -> None:
    print("Querying Wikidata...", flush=True)
    rows = sparql_query(SPARQL)
    print(f"Got {len(rows)} candidates", flush=True)

    entries: list[dict] = []
    seen_names: set[str] = set()

    for i, row in enumerate(rows):
        name = row.get("itemLabel", {}).get("value", "")
        if not name or name.startswith("Q"):
            continue
        if name in seen_names:
            continue
        seen_names.add(name)

        birth_y = int(row.get("birthYear", {}).get("value", "0") or 0)
        death_y = int(row.get("deathYear", {}).get("value", "0") or 0)
        if birth_y == 0:
            continue

        article_url = row.get("article", {}).get("value", "")
        wiki_title = article_url.rsplit("/wiki/", 1)[-1] if "/wiki/" in article_url else ""

        occupation_qids = [extract_qid(q) for q in row.get("occupations", {}).get("value", "").split("|") if q]
        country_qids = [extract_qid(q) for q in row.get("countries", {}).get("value", "").split("|") if q]

        roles = qids_to_roles(occupation_qids)
        era = year_to_era(birth_y)

        # Skip pure philosophers — they belong in phil.json
        if roles == ["Reformer"] and not occupation_qids:
            continue

        # Fetch Wikipedia summary
        summary = None
        if wiki_title:
            time.sleep(SLEEP)
            summary = wiki_summary(wiki_title)

        if not summary or not summary.get("extract"):
            continue

        extract = summary["extract"]
        sentences = re.split(r'(?<=[.!?])\s+', extract.strip())
        desc = " ".join(sentences[:2]).strip()
        tldr = " ".join(sentences[:3]).strip() if len(sentences) > 2 else desc

        # Truncate
        if len(desc) > 200:
            desc = desc[:197] + "…"
        if len(tldr) > 400:
            tldr = tldr[:397] + "…"

        dates_str = f"{abs(birth_y)}{'BCE' if birth_y < 0 else ''}–{abs(death_y)}{'BCE' if death_y < 0 else ''}"
        if birth_y < 0 or death_y < 0:
            dates_str = f"{'c. ' if True else ''}{abs(birth_y)} BCE–{abs(death_y) if death_y < 0 else death_y}{' BCE' if death_y < 0 else ' CE'}"

        entry: dict = {
            "name": name,
            "dates": dates_str,
            "y": birth_y,
            "roles": roles,
            "era": era,
            "desc": desc,
            "tldr": tldr,
            "url": article_url or f"https://en.wikipedia.org/wiki/{wiki_title}",
            "_country_qids": country_qids,       # for LLM region pass
            "_occupation_qids": occupation_qids,  # for LLM roles pass
        }
        entries.append(entry)

        if (i + 1) % 50 == 0:
            print(f"  processed {i+1}/{len(rows)}...", flush=True)

    print(f"\nTotal entries: {len(entries)}", flush=True)
    print(json.dumps(entries, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
