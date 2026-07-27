#!/usr/bin/env python3
"""Reclassify data/hist-chars.json `roles` from Wikidata occupation QIDs.

Every entry carries `_occupation_qids`, the Wikidata occupation QIDs it was
fetched with. QID_ROLES below maps each occupation QID to the role(s) it
implies, chosen from the eight options in `meta.filters[roles].options`.
Each entry's final `roles` is the union of its existing roles with whatever
the mapping adds — nothing is ever removed, so an entry can only gain roles.

The table was built empirically: for each frequent QID, the entries that
carry it were read (name + desc) to see what role they actually describe,
rather than guessing from the QID number alone. QIDs left mapped to None
below were sampled and found too heterogeneous to assign a single role with
confidence (e.g. Q1622272 "university teacher" covers scientists, a banker,
a cardinal and a composer) — they are reported in the unmapped-QID summary
instead of guessed.

Usage:
  python3 tools/reclassify_roles.py           # apply and write the file
  python3 tools/reclassify_roles.py --dry-run # report only, write nothing
"""
import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA_PATH = ROOT / "data" / "hist-chars.json"

VALID_ROLES = ["Ruler", "Military", "Scientist", "Artist", "Writer", "Explorer", "Religious", "Reformer"]

# QID -> list of roles it implies, or None if sampled and left unmapped
# (reported separately rather than guessed). Built from data/hist-chars.json
# occupation-QID co-occurrence, not from memorized Wikidata labels.
QID_ROLES = {
    "Q36180": ["Writer"],          # writer
    "Q82955": ["Ruler"],           # politician / statesman
    "Q49757": ["Writer"],          # poet
    "Q116": ["Ruler"],             # monarch
    "Q1028181": ["Artist"],        # painter
    "Q47064": ["Military"],        # military officer
    "Q4964182": ["Writer"],        # philosopher
    "Q201788": ["Writer"],         # historian
    "Q1930187": ["Writer"],        # journalist
    "Q36834": ["Artist"],          # composer
    "Q193391": ["Ruler"],          # statesman
    "Q170790": ["Scientist"],      # mathematician
    "Q169470": ["Scientist"],      # physicist
    "Q333634": ["Writer"],         # philologist
    "Q189290": ["Military"],       # military personnel
    "Q39631": ["Scientist"],       # physician
    "Q15296811": ["Artist"],       # painter (variant)
    "Q2304859": ["Ruler"],         # monarch
    "Q2374149": ["Scientist"],     # (polymath/scholar cluster)
    "Q372436": ["Ruler"],          # queen / king
    "Q250867": ["Religious"],      # priest
    "Q6625963": ["Writer"],        # novelist
    "Q2478141": ["Ruler"],         # monarch
    "Q11063": ["Scientist"],       # astronomer
    "Q593644": ["Scientist"],      # chemist
    "Q18805": ["Scientist"],       # scholar (polymath cluster)
    "Q37226": None,                # heterogeneous — teacher-ish, no single role fits
    "Q1097498": ["Ruler"],         # monarch
    "Q214917": ["Writer"],         # playwright
    "Q205375": ["Scientist"],      # inventor
    "Q185351": ["Ruler"],          # monarch
    "Q611644": ["Ruler"],          # sovereign
    "Q14467526": ["Writer"],       # linguist
    "Q1234713": ["Religious"],     # theologian
    "Q81096": ["Scientist"],       # engineer
    "Q158852": ["Artist"],         # composer (variant)
    "Q33231": None,                # photographer — heterogeneous, includes writers/journalists
    "Q132050": ["Ruler"],          # caliph
    "Q483501": ["Artist"],         # painter (variant)
    "Q3391743": ["Artist"],        # visual artist
    "Q11900058": ["Explorer"],     # explorer
    "Q4263842": ["Writer"],        # literary critic
    "Q1925963": ["Artist"],        # sculptor
    "Q639669": ["Artist"],         # composer / musician
    "Q2079935": ["Artist"],        # sculptor (variant)
    "Q248577": None,               # lawyer — cluster is US presidents already tagged
    "Q18939491": ["Writer"],       # essayist
    "Q42973": ["Artist"],          # architect
    "Q350979": ["Scientist"],      # naturalist
    "Q8178443": ["Writer"],        # poet (variant)
    "Q644687": ["Artist"],         # painter (variant)
    "Q486748": ["Artist"],         # pianist
    "Q11774202": ["Writer"],       # essayist (variant)
    "Q98544732": ["Scientist"],    # researcher / naturalist
    "Q2083925": ["Scientist"],     # botanist
    "Q1281618": ["Artist"],        # sculptor (variant)
    "Q11569986": ["Artist"],       # portrait painter
    "Q6051619": ["Reformer"],      # revolutionary
    "Q40348": None,                # lawyer — heterogeneous
    "Q10732476": ["Ruler"],        # monarch
    "Q1792450": ["Writer"],        # art historian
    "Q5322166": ["Artist"],        # painter (variant)
    "Q33999": ["Artist"],          # actor
    "Q2306091": ["Writer"],        # social theorist
    "Q10800557": ["Artist"],       # actor (variant)
    "Q39018": ["Ruler"],           # emperor
    "Q1402561": ["Military"],      # military commander
    "Q10872101": ["Scientist"],    # anatomist
    "Q14915627": ["Artist"],       # musician
    "Q2526255": ["Artist"],        # entertainer
    "Q765778": ["Artist"],         # organist
    "Q6430706": ["Writer"],        # literary figure
    "Q520549": ["Scientist"],      # geologist / naturalist
}


def load():
    return json.loads(DATA_PATH.read_text(encoding="utf-8"))


def reclassify(entries):
    """Mutate entries' `roles` in place. Returns (changed_count, unmapped_counter, empty_roles)."""
    unmapped = {}
    empty_roles = []
    changed = 0
    for e in entries:
        qids = e.get("_occupation_qids") or []
        original = e.get("roles") or []
        new_roles = set(original)
        for qid in qids:
            roles = QID_ROLES.get(qid)
            if roles:
                new_roles.update(roles)
            else:
                unmapped[qid] = unmapped.get(qid, 0) + 1

        if not new_roles:
            empty_roles.append(e.get("name", "?"))
            continue  # keep whatever roles it already had (none), reported separately

        ordered = [r for r in original if r in new_roles]
        ordered += [r for r in VALID_ROLES if r in new_roles and r not in ordered]
        if ordered != original:
            changed += 1
        e["roles"] = ordered
    return changed, unmapped, empty_roles


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true", help="report only, do not write the file")
    args = parser.parse_args()

    doc = load()
    entries = doc["entries"]
    role_options = None
    for f in doc["meta"]["filters"]:
        if f["key"] == "roles":
            role_options = f["options"]
    assert role_options == VALID_ROLES, "meta.filters roles options changed — update VALID_ROLES"

    before = {r: sum(1 for e in entries if r in (e.get("roles") or [])) for r in VALID_ROLES}
    changed, unmapped, empty_roles = reclassify(entries)
    after = {r: sum(1 for e in entries if r in (e.get("roles") or [])) for r in VALID_ROLES}

    print(f"Entries: {len(entries)}", file=sys.stderr)
    print(f"Entries with changed roles: {changed}", file=sys.stderr)
    print("Role distribution before -> after:", file=sys.stderr)
    for r in VALID_ROLES:
        print(f"  {r:10s} {before[r]:4d} -> {after[r]:4d}", file=sys.stderr)
    if empty_roles:
        print(f"WARNING: {len(empty_roles)} entries have no role at all: {empty_roles}", file=sys.stderr)
    if unmapped:
        print("Unmapped occupation QIDs (qid: entry count):", file=sys.stderr)
        for qid, count in sorted(unmapped.items(), key=lambda kv: -kv[1]):
            print(f"  {qid}: {count}", file=sys.stderr)

    if args.dry_run:
        print("Dry run — not writing.", file=sys.stderr)
        return

    with open(DATA_PATH, "w", encoding="utf-8") as f:
        json.dump(doc, f, ensure_ascii=False, indent=2)
        f.write("\n")
    print(f"Wrote {DATA_PATH}", file=sys.stderr)


if __name__ == "__main__":
    main()
