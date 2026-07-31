#!/usr/bin/env python3
"""Add stable slug ids to every entry in the topic data files.

Slug rule:
  - Unicode NFKD-normalise the name, drop combining marks.
  - Lowercase.
  - Replace every run of characters outside [a-z0-9] with a single '-'.
  - Strip leading and trailing '-'.
  - Truncate to 60 characters at a '-' boundary.

On collision within a topic, "-2", "-3", ... is appended in file order.

This script never changes an id that already exists — it only fills in
missing ones. Safe to re-run: a second run adds zero ids and produces an
empty git diff.

Run:
  python3 tools/add_ids.py
"""
from __future__ import annotations

import json
import re
import unicodedata
from pathlib import Path

DATA_DIR = Path(__file__).resolve().parent.parent / "data"
TOPIC_FILES = ["phil.json", "hist-events.json", "hist-chars.json"]

MAX_LEN = 60


def slugify(name: str) -> str:
    normalised = unicodedata.normalize("NFKD", name)
    without_marks = "".join(c for c in normalised if not unicodedata.combining(c))
    lowered = without_marks.lower()
    slug = re.sub(r"[^a-z0-9]+", "-", lowered).strip("-")
    if len(slug) > MAX_LEN:
        slug = slug[:MAX_LEN].rsplit("-", 1)[0]
    return slug


def dedupe(slug: str, used: set[str]) -> str:
    if slug not in used:
        return slug
    n = 2
    while f"{slug}-{n}" in used:
        n += 1
    return f"{slug}-{n}"


def process_topic(path: Path) -> None:
    data = json.loads(path.read_text(encoding="utf-8"))
    entries = data["entries"]

    used_ids = {e["id"] for e in entries if "id" in e}
    skipped = 0
    added = 0
    collisions = []

    for entry in entries:
        if "id" in entry:
            skipped += 1
            continue
        base_slug = slugify(entry["name"])
        slug = dedupe(base_slug, used_ids)
        if slug != base_slug:
            collisions.append((entry["name"], base_slug, slug))
        used_ids.add(slug)
        entry["id"] = slug
        added += 1
        # Move id to be the first key of the entry object.
        reordered = {"id": entry.pop("id")}
        reordered.update(entry)
        entry.clear()
        entry.update(reordered)

    path.write_text(
        json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )

    print(f"{path.name}: {len(entries)} entries processed, {added} ids added, "
          f"{len(collisions)} collisions resolved, {skipped} ids left untouched")
    for name, base_slug, slug in collisions:
        print(f"  collision: {name!r} -> {base_slug!r} resolved to {slug!r}")


def main() -> None:
    for filename in TOPIC_FILES:
        process_topic(DATA_DIR / filename)


if __name__ == "__main__":
    main()
