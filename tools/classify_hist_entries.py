#!/usr/bin/env python3
"""LLM classification pass for raw historical entries.

Takes raw JSON from fetch_hist_figures.py or fetch_hist_events.py (via stdin
or --input flag) and uses Claude to fix/assign region and roles fields where
heuristics left gaps or made poor choices.

Usage:
  python tools/classify_hist_entries.py --type figures < /tmp/figures_raw.json > /tmp/figures_classified.json
  python tools/classify_hist_entries.py --type events  < /tmp/events_raw.json  > /tmp/events_classified.json

Requires ANTHROPIC_API_KEY env var.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import time
import urllib.request

VALID_ROLES = ["Ruler", "Military", "Scientist", "Artist", "Writer", "Explorer", "Religious", "Reformer"]
VALID_REGIONS = ["Africa", "Americas", "East Asia", "Europe", "Middle East", "South Asia", "Oceania"]
VALID_ERAS = ["Ancient (to 500 CE)", "Medieval (500–1500)", "Early modern (1500–1800)", "19th century", "20th century onward"]

MODEL = "claude-haiku-4-5-20251001"
API_URL = "https://api.anthropic.com/v1/messages"
BATCH_SIZE = 20
SLEEP = 1.0


def claude(prompt: str, api_key: str) -> str:
    body = json.dumps({
        "model": MODEL,
        "max_tokens": 2048,
        "messages": [{"role": "user", "content": prompt}],
    }).encode()
    req = urllib.request.Request(
        API_URL,
        data=body,
        headers={
            "x-api-key": api_key,
            "anthropic-version": "2023-06-01",
            "content-type": "application/json",
        },
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=60) as resp:
        data = json.loads(resp.read())
    return data["content"][0]["text"].strip()


def classify_figures_batch(entries: list[dict], api_key: str) -> list[dict]:
    items = []
    for e in entries:
        items.append({
            "name": e["name"],
            "desc": e["desc"],
            "current_roles": e.get("roles", []),
            "current_region": e.get("_country_qids", []),
        })

    prompt = f"""You are classifying historical figures for a reference website.

For each figure, assign:
1. "roles": 1-3 roles from {VALID_ROLES}
2. "region": one region from {VALID_REGIONS} — the region most associated with their life and work

Return ONLY a JSON array with one object per figure, each with "name", "roles", "region".
No explanation, no markdown fences.

Figures:
{json.dumps(items, ensure_ascii=False, indent=2)}"""

    result = claude(prompt, api_key)
    # Strip markdown if model adds it
    result = result.strip().lstrip("```json").lstrip("```").rstrip("```").strip()
    return json.loads(result)


def classify_events_batch(entries: list[dict], api_key: str) -> list[dict]:
    items = []
    for e in entries:
        items.append({
            "name": e["name"],
            "desc": e["desc"],
            "current_region": e.get("region", ""),
            "year": e.get("y", 0),
        })

    prompt = f"""You are classifying historical events for a reference website.

For each event, assign:
1. "region": one region from {VALID_REGIONS} — the region where the event primarily occurred

Return ONLY a JSON array with one object per event, each with "name" and "region".
No explanation, no markdown fences.

Events:
{json.dumps(items, ensure_ascii=False, indent=2)}"""

    result = claude(prompt, api_key)
    result = result.strip().lstrip("```json").lstrip("```").rstrip("```").strip()
    return json.loads(result)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--type", choices=["figures", "events"], required=True)
    parser.add_argument("--input", default="-", help="Input file path (default: stdin)")
    args = parser.parse_args()

    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        print("Error: ANTHROPIC_API_KEY not set", file=sys.stderr)
        sys.exit(1)

    if args.input == "-":
        raw = sys.stdin.read()
    else:
        with open(args.input) as f:
            raw = f.read()

    entries: list[dict] = json.loads(raw)
    print(f"Classifying {len(entries)} {args.type}...", file=sys.stderr)

    classified_map: dict[str, dict] = {}

    for i in range(0, len(entries), BATCH_SIZE):
        batch = entries[i : i + BATCH_SIZE]
        print(f"  batch {i//BATCH_SIZE + 1} ({len(batch)} items)...", file=sys.stderr)
        try:
            if args.type == "figures":
                results = classify_figures_batch(batch, api_key)
            else:
                results = classify_events_batch(batch, api_key)
            for r in results:
                classified_map[r["name"]] = r
        except Exception as e:
            print(f"  WARNING: batch failed: {e}", file=sys.stderr)
        time.sleep(SLEEP)

    # Merge classifications back into entries, strip _meta fields
    output: list[dict] = []
    for entry in entries:
        name = entry["name"]
        cls = classified_map.get(name, {})
        entry = {k: v for k, v in entry.items() if not k.startswith("_")}
        if args.type == "figures":
            if cls.get("roles"):
                roles = [r for r in cls["roles"] if r in VALID_ROLES]
                if roles:
                    entry["roles"] = roles
            if cls.get("region") in VALID_REGIONS:
                entry["region"] = cls["region"]
        else:
            if cls.get("region") in VALID_REGIONS:
                entry["region"] = cls["region"]
        output.append(entry)

    print(json.dumps(output, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
