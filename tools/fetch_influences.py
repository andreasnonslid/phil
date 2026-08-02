#!/usr/bin/env python3
"""Fetch influence edges (Wikidata P737, "influenced by") for topic entries.

Writes incrementally to a .jsonl checkpoint so re-runs resume where they left
off, then writes data/influences.json.

Direction: P737 on entry X lists people who influenced X. So for each QID Y in
X's P737 list we emit an edge from=Y (the influencer) to=X (the influenced).
We only ever fetch P737 — the reverse direction ("influenced") is implied by
inverting from/to locally and is not fetched as P738.

Run:
  python tools/fetch_influences.py
  # Re-run safely — QID/claims lookups are cached via checkpoint, and the
  # output file is only rewritten if the computed edge set actually changed.
"""
from __future__ import annotations

import json
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CHECKPOINT = Path(__file__).resolve().parent / ".influences_checkpoint.jsonl"
OUTPUT = ROOT / "data" / "influences.json"

WIKIPEDIA_API = "https://en.wikipedia.org/w/api.php"
WIKIDATA_API = "https://www.wikidata.org/w/api.php"
USER_AGENT = "PhilInfluences/1.0 (andy.reinkarnert@gmail.com; manual script)"
SLEEP = 0.3

TOPICS = ["phil"]


def api_get(base: str, params: dict) -> dict:
    url = base + "?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    for attempt in range(6):
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                return json.loads(resp.read())
        except urllib.error.HTTPError as e:
            if e.code == 429:
                wait = 20 * (attempt + 1)
                print(f"  429, waiting {wait}s...", file=sys.stderr, flush=True)
                time.sleep(wait)
            else:
                raise
    raise RuntimeError(f"request failed after retries: {url}")


def title_from_url(url: str) -> str | None:
    path = urllib.parse.urlparse(url).path
    if "/wiki/" not in path:
        return None
    return urllib.parse.unquote(path.split("/wiki/", 1)[1]).replace("_", " ")


def resolve_qid(title: str) -> str | None:
    data = api_get(WIKIPEDIA_API, {
        "action": "query",
        "titles": title,
        "prop": "pageprops",
        "ppprop": "wikibase_item",
        "redirects": 1,
        "format": "json",
        "formatversion": 2,
    })
    pages = data.get("query", {}).get("pages", [])
    if not pages:
        return None
    return pages[0].get("pageprops", {}).get("wikibase_item")


def fetch_influenced_by(qid: str) -> list[str]:
    data = api_get(WIKIDATA_API, {
        "action": "wbgetclaims",
        "entity": qid,
        "property": "P737",
        "format": "json",
    })
    claims = data.get("claims", {}).get("P737", [])
    result = []
    for c in claims:
        value = c.get("mainsnak", {}).get("datavalue", {}).get("value")
        if isinstance(value, dict) and value.get("id"):
            result.append(value["id"])
    return result


def load_checkpoint() -> dict[str, dict]:
    if not CHECKPOINT.exists():
        return {}
    records: dict[str, dict] = {}
    with CHECKPOINT.open(encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                rec = json.loads(line)
                records[rec["id"]] = rec
            except Exception:
                pass
    return records


def append_checkpoint(record: dict) -> None:
    with CHECKPOINT.open("a", encoding="utf-8") as f:
        f.write(json.dumps(record, ensure_ascii=False) + "\n")


def load_topic_entries(topic: str) -> list[dict]:
    path = ROOT / "data" / f"{topic}.json"
    data = json.loads(path.read_text(encoding="utf-8"))
    return data["entries"]


def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8")  # type: ignore[attr-defined]

    print("Loading checkpoint...", file=sys.stderr, flush=True)
    checkpoint = load_checkpoint()
    print(f"  {len(checkpoint)} records cached", file=sys.stderr, flush=True)

    all_entries: dict[str, list[dict]] = {t: load_topic_entries(t) for t in TOPICS}

    new_count = 0
    for topic, entries in all_entries.items():
        print(f"Resolving QIDs for {topic} ({len(entries)} entries)...", file=sys.stderr, flush=True)
        for i, entry in enumerate(entries):
            eid = entry["id"]
            if eid in checkpoint:
                continue

            title = title_from_url(entry.get("url", ""))
            qid = None
            influenced_by: list[str] = []
            if title:
                time.sleep(SLEEP)
                try:
                    qid = resolve_qid(title)
                except Exception as e:
                    print(f"  QID resolve failed for {eid!r}: {e}", file=sys.stderr, flush=True)
                if qid:
                    time.sleep(SLEEP)
                    try:
                        influenced_by = fetch_influenced_by(qid)
                    except Exception as e:
                        print(f"  P737 fetch failed for {eid!r} ({qid}): {e}", file=sys.stderr, flush=True)

            record = {"id": eid, "topic": topic, "qid": qid, "influenced_by": influenced_by}
            append_checkpoint(record)
            checkpoint[eid] = record
            new_count += 1

            if (i + 1) % 25 == 0:
                print(f"  {i+1}/{len(entries)} ({new_count} new this run)...", file=sys.stderr, flush=True)

    # Build qid -> (topic, id) map, restricted to entries actually present in a topic file.
    qid_to_entry: dict[str, tuple[str, str]] = {}
    for topic, entries in all_entries.items():
        valid_ids = {e["id"] for e in entries}
        for eid, rec in checkpoint.items():
            if rec.get("topic") == topic and rec.get("qid") and eid in valid_ids:
                qid_to_entry[rec["qid"]] = (topic, eid)

    edge_set: set[tuple[str, str, str]] = set()  # (topic, from, to)
    for topic, entries in all_entries.items():
        valid_ids = {e["id"] for e in entries}
        for eid in valid_ids:
            rec = checkpoint.get(eid)
            if not rec or rec.get("topic") != topic:
                continue
            for influencer_qid in rec.get("influenced_by", []):
                target = qid_to_entry.get(influencer_qid)
                if not target:
                    continue
                src_topic, src_id = target
                if src_topic != topic:
                    continue
                if src_id == eid:
                    continue
                edge_set.add((topic, src_id, eid))

    edges = [
        {"topic": t, "from": f, "to": to}
        for (t, f, to) in sorted(edge_set, key=lambda e: (e[0], e[1], e[2]))
    ]

    resolved = sum(1 for r in checkpoint.values() if r.get("qid"))
    total = len(checkpoint)
    print(f"\nQID resolution: {resolved}/{total}", file=sys.stderr, flush=True)
    print(f"Edges: {len(edges)}", file=sys.stderr, flush=True)

    existing_edges = None
    generated = None
    if OUTPUT.exists():
        try:
            existing = json.loads(OUTPUT.read_text(encoding="utf-8"))
            existing_edges = existing.get("edges")
            generated = existing.get("meta", {}).get("generated")
        except Exception:
            pass

    if existing_edges == edges:
        print("No change in edges — leaving data/influences.json untouched.", file=sys.stderr, flush=True)
        return

    generated = time.strftime("%Y-%m-%d")
    output = {
        "meta": {
            "generated": generated,
            "source": "Wikidata P737",
            "topics": TOPICS,
            "direction": "from is the influencer, to is the influenced (P737 = 'influenced by', read on the 'to' side)",
        },
        "edges": edges,
    }
    OUTPUT.write_text(json.dumps(output, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {OUTPUT}", file=sys.stderr, flush=True)


if __name__ == "__main__":
    main()
