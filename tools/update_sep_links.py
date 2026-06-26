#!/usr/bin/env python3
"""Add Stanford Encyclopedia of Philosophy links to philosopher data.

Uses Wikidata property P3123 (Stanford Encyclopedia of Philosophy ID)
for exact, curated SEP identifiers. No fuzzy matching.
"""
from __future__ import annotations

import json
import time
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PHILOSOPHERS_PATH = ROOT / "data" / "phil.json"
USER_AGENT = "PhilSEPLinkUpdater/1.0 (https://github.com/andreas/phil; manual script)"
SLEEP_SECONDS = 0.2


def wikipedia_title(url: str) -> str:
    return urllib.parse.unquote(url.rsplit("/wiki/", 1)[1])


def fetch_sep_id(title: str) -> str | None:
    params = {
        "action": "wbgetentities",
        "format": "json",
        "sites": "enwiki",
        "props": "claims",
        "titles": title,
    }
    url = "https://www.wikidata.org/w/api.php?" + urllib.parse.urlencode(params)
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(request, timeout=45) as response:
        payload = json.load(response)

    for entity in payload.get("entities", {}).values():
        claims = entity.get("claims", {}).get("P3123", [])
        if not claims:
            continue
        sep_id = claims[0].get("mainsnak", {}).get("datavalue", {}).get("value")
        if sep_id:
            return sep_id
    return None


def main() -> None:
    topic = json.loads(PHILOSOPHERS_PATH.read_text(encoding="utf-8"))
    philosophers = topic["entries"]
    sep_ids: dict[str, str] = {}

    for idx, philosopher in enumerate(philosophers, start=1):
        title = wikipedia_title(philosopher["url"])
        sep_id = fetch_sep_id(title)
        if sep_id:
            sep_ids[title] = sep_id
        print(f"Fetched SEP ID for {idx}/{len(philosophers)} Wikipedia titles")
        time.sleep(SLEEP_SECONDS)

    linked = 0
    for philosopher in philosophers:
        title = wikipedia_title(philosopher["url"])
        sep_id = sep_ids.get(title)
        if sep_id:
            philosopher["sep_url"] = f"https://plato.stanford.edu/entries/{sep_id}/"
            linked += 1
        else:
            philosopher.pop("sep_url", None)

    PHILOSOPHERS_PATH.write_text(json.dumps(topic, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"Wrote {linked}/{len(philosophers)} SEP links to {PHILOSOPHERS_PATH.relative_to(ROOT)}.")


if __name__ == "__main__":
    main()
