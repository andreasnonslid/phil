# E6 — History data quality

`data/phil.json` is hand-curated and good. The two history topics are machine-dumped and it
shows. Measured on the current data:

| Problem | `hist-events` (645) | `hist-chars` (750) |
|---|---|---|
| `desc` is a truncated Wikipedia extract ending in `…` | 120 | 236 |
| `tldr` missing entirely | 645 (all) | 274 |
| `tldr` is a verbatim copy of `desc` | — | 99 |
| Duplicate `name` values | 0 | 20 |
| Miscategorised filter values | unmeasured | e.g. Hor-Aha, a First Dynasty pharaoh, tagged only `Reformer` |
| Coverage skew | Europe 410/645 (64%); Ancient only 19 | 20th century onward only 12/750 |

Both topics' `meta.footer` still describes them as placeholders seeded with sample data.

**These issues touch no code.** They are the safest possible work for the cheapest models and
can run in parallel with every other epic, indefinitely. Several are *batch templates*: one
block that the issue creator expands into N numbered issues covering disjoint slices.

The overriding rule for this epic is guardrail 2 in `AGENT_BRIEF.md`: **read, modify in
place, write back, assert the entry count.** This repo has already lost a data file to a
wholesale overwrite.

---

### `E6-01` — Add tools/audit_data.py and generate the batch report

**Labels:** `epic:data-quality`, `area:tools`, `size:M`
**Branch:** `claude/e6-01-audit-script`
**Depends on:** none
**Blocks:** every other E6 issue

**Context**

Every batch issue in this epic refers to "batch N" of a named defect. This script is what
defines those batches, deterministically, so that parallel sessions never touch the same
entry. It also measures progress: rerunning it shows the defect counts falling.

**Files**

- `tools/audit_data.py` — new file
- `docs/roadmap/DATA_AUDIT.md` — new file, generated report (committed)

**Task**

1. Write `tools/audit_data.py`, standard library only. It loads every topic listed in
   `data/topics.json` (falling back to the three known ids) and reports per topic:
   - entry count;
   - entries whose `desc`, after stripping whitespace, ends with `…` or `...`;
   - entries with no `tldr`, and entries where `tldr == desc`;
   - duplicate `name` values;
   - entries missing any of `name`, `dates`, `y`, `desc`, `url`;
   - entries whose value for a filter `key` is absent, empty, or not in that filter's
     `options` list in `meta`;
   - distribution counts for every filter, so coverage skew is visible.
2. Define batching with this exact rule, so it is reproducible by anyone: take the affected
   entries, **sort by `name` using plain Unicode code-point ordering**, then chunk into
   groups of **40** for `desc` defects and **50** for `tldr` defects. Batch numbers start
   at 1.
3. Write `docs/roadmap/DATA_AUDIT.md` containing the summary tables plus, for each batched
   defect, a heading per batch listing the exact `name` of every entry in it.
4. Support `--check`, which exits non-zero if any defect count is above zero. Later issues use
   it to confirm progress; it is not wired into CI.
5. The script must never modify a data file.

**Acceptance criteria**

- [ ] `python3 tools/audit_data.py` regenerates `docs/roadmap/DATA_AUDIT.md` and running it
      twice produces a byte-identical file.
- [ ] The report's counts match the table at the top of this epic file.
- [ ] Batch listings are disjoint and together cover every affected entry.
- [ ] `--check` exits non-zero today, and prints a readable summary of what failed.
- [ ] No file under `data/` is modified by running the script.

**Out of scope**

- Fixing any data.
- CI integration.

**Verify**

Run it twice; `git diff` after the second run must be empty. Confirm the batch listings for
`hist-chars` truncated descriptions total 236 entries across 6 batches.

---

### `E6-02` — BATCH TEMPLATE: un-truncate hist-chars descriptions

> **To the issue creator:** expand this block into **6** issues, numbered
> `E6-02a` … `E6-02f`, one per batch. In each, replace `<N>` with the batch number 1–6 and
> `<LETTER>` with a–f. Everything else is identical. Do not create a single combined issue.

**Labels:** `epic:data-quality`, `area:data`, `size:M`
**Branch:** `claude/e6-02<LETTER>-hist-chars-desc-batch-<N>`
**Depends on:** E6-01
**Blocks:** E6-07

**Context**

236 of the 750 entries in `data/hist-chars.json` have a `desc` that is a Wikipedia extract cut
mid-sentence and ending in `…`, for example:

> "Hor-Aha is considered the second pharaoh of the First Dynasty of Egypt by most
> Egyptologists, while others consider him the first one and corresponding to Menes. He lived
> around the 31st century BC…"

`desc` is the one-line summary shown on every card and matched by search, so a truncated one
is both ugly and less findable. This issue fixes **batch `<N>` only** — the entries listed
under "hist-chars — truncated desc — batch `<N>`" in `docs/roadmap/DATA_AUDIT.md`.

**Files**

- `data/hist-chars.json` — edit `desc` on the listed entries only

**Task**

1. Read the entry names for batch `<N>` from `docs/roadmap/DATA_AUDIT.md`. Work on exactly
   those entries and no others.
2. For each, rewrite `desc` as **one or two complete sentences, at most 200 characters**,
   naming who the person was and what they are known for. Write it as prose, not a fragment.
   It must end with a full stop and must not end in `…`.
3. Base the rewrite on the entry's existing `desc` and `tldr` text. If those are too thin to
   say anything accurate, consult the entry's `url`. **Do not invent dates, titles, or
   achievements** — if you cannot establish a fact, leave it out and write a shorter summary.
4. Keep the entry's own voice consistent with `data/phil.json`, which is the quality bar:
   plain, factual, no hype, no "renowned" or "legendary".
5. Change nothing else on the entry — not `name`, `dates`, `y`, `roles`, `era`, `region`,
   `url`, `tldr`, or any `_`-prefixed key.
6. Write the file back with `json.dump(..., ensure_ascii=False, indent=2)` plus a trailing
   newline, so the diff contains only the lines you changed.

**Acceptance criteria**

- [ ] Exactly the entries in batch `<N>` have a changed `desc`. `git diff --stat` shows no
      other entry touched.
- [ ] No `desc` in the batch ends with `…` or `...`, and each is at most 200 characters.
- [ ] Entry count of `data/hist-chars.json` is still exactly 750.
- [ ] The file still parses and contains no `\uXXXX` escape sequences.
- [ ] `python3 tools/audit_data.py` shows the truncated-desc count for `hist-chars` reduced by
      the size of this batch and no other count worsened.

**Out of scope**

- Any entry not in batch `<N>`.
- Fixing `tldr` (that is `E6-03`), roles (`E6-05`), or duplicates (`E6-04`).
- Regenerating `docs/roadmap/DATA_AUDIT.md` — leave it stale; `E6-07` refreshes it.

**Verify**

Spot-check five rewritten entries against their `url` for factual accuracy and quote them in
the PR description.

---

### `E6-03` — BATCH TEMPLATE: write hist-chars tldr summaries

> **To the issue creator:** expand this block into **8** issues, numbered
> `E6-03a` … `E6-03h`, one per batch, replacing `<N>` with 1–8 and `<LETTER>` with a–h.

**Labels:** `epic:data-quality`, `area:data`, `size:M`
**Branch:** `claude/e6-03<LETTER>-hist-chars-tldr-batch-<N>`
**Depends on:** E6-01
**Blocks:** E6-07

**Context**

`tldr` is the expandable paragraph behind the "tl;dr" button on a card — the bit that makes an
entry worth reading rather than just listing. In `data/hist-chars.json`, 274 entries have no
`tldr` at all and another 99 have a `tldr` that is a verbatim copy of `desc`, which renders as
the same sentence twice. 373 entries need one written.

The quality bar is `data/phil.json`, where every entry has a real one, for example:

> "Medieval France's sharpest logician and one of its most dramatic figures. He argued that
> universals are just words, not real things. His ethics turned on intention: what makes an
> act wrong is inner consent to evil, not the deed itself. His catastrophic love affair with
> Héloïse and subsequent castration by her uncle made him a legend in his own time."

This issue covers **batch `<N>` only** — the entries listed under "hist-chars — tldr — batch
`<N>`" in `docs/roadmap/DATA_AUDIT.md`.

**Files**

- `data/hist-chars.json` — add or replace `tldr` on the listed entries only

**Task**

1. Read the entry names for batch `<N>` from `docs/roadmap/DATA_AUDIT.md`.
2. For each, write a `tldr` of **three to five sentences, 300–600 characters**: who they were,
   what they actually did, why it mattered, and one concrete or memorable detail.
3. It must not duplicate `desc`. `desc` is the one-line label; `tldr` is the paragraph that
   earns the click.
4. **Do not invent facts.** Use the entry's `url` and existing text. Where scholarship is
   genuinely disputed, say so briefly ("traditionally dated to…", "most Egyptologists hold…")
   rather than picking a side.
5. Insert `tldr` immediately after `desc` in the entry object, matching the key order used in
   `data/phil.json`.
6. Change nothing else on the entry. Write the file back with `ensure_ascii=False, indent=2`
   and a trailing newline.

**Acceptance criteria**

- [ ] Every entry in batch `<N>` has a `tldr` of 300–600 characters, and none equals its
      `desc`.
- [ ] No entry outside batch `<N>` is modified.
- [ ] Entry count is still exactly 750 and the file parses.
- [ ] Expanding the tl;dr on one of these cards in the running viewer renders correctly, with
      no raw HTML or broken characters.
- [ ] `python3 tools/audit_data.py` shows the `hist-chars` tldr defect count reduced by the
      batch size.

**Out of scope**

- Editing `desc` (that is `E6-02`).
- Adding `tldr` to `hist-events` (that is `E6-06`).

**Verify**

Load `?d=hist-chars`, find three entries from this batch, expand each tl;dr, screenshot one
in the PR.

---

### `E6-04` — Resolve the 20 duplicate names in hist-chars

**Labels:** `epic:data-quality`, `area:data`, `size:M`
**Branch:** `claude/e6-04-dedupe-hist-chars`
**Depends on:** E6-01
**Blocks:** E6-07

**Context**

`data/hist-chars.json` contains 750 entries but only 730 distinct `name` values. Duplicates
are a real defect: `data/popularity.json` is keyed by name, favourites are stored by name
(`phil_favs_v1`), and the random feature's seen-set is keyed by name — so two entries sharing
a name interfere with each other. `E1-01` will also generate slugs from names, which makes
this blocking for entity pages.

**Files**

- `data/hist-chars.json` — remove or disambiguate duplicate entries

**Task**

1. Get the 20 duplicated names from `docs/roadmap/DATA_AUDIT.md`.
2. For each pair, compare the two entries and classify:
   - **Same person, fetched twice** — merge into one entry, keeping the richer `desc`/`tldr`
     and the union of `roles`; delete the other. This is the expected common case.
   - **Genuinely different people who share a name** — keep both and disambiguate the `name`
     with a parenthetical, e.g. `"John Smith (explorer)"`. Use the shortest qualifier that
     distinguishes them.
3. Record every decision in the PR description as a table: name, verdict, action taken.
4. After merging, the entry count will be **below 750**. State the exact final count in the PR
   and confirm it equals 750 minus the number of merges you performed.
5. Write the file back with `ensure_ascii=False, indent=2` and a trailing newline.

**Acceptance criteria**

- [ ] `data/hist-chars.json` has no duplicate `name` values.
- [ ] The final entry count equals 750 minus the number of documented merges, and no entry was
      removed without appearing in the PR table.
- [ ] No merged entry lost information that existed on the deleted twin.
- [ ] `meta.kicker` still renders the correct count on the page (it uses `{n}`, so this should
      need no edit — confirm it).
- [ ] The file parses and `python3 tools/audit_data.py` reports zero duplicates.

**Out of scope**

- Deduplicating across topics — a person appearing in both `hist-chars` and `phil` is expected
  and is handled by `E2-04`.
- Fixing `desc` or `tldr` beyond what merging requires.

**Verify**

Rerun the audit; the duplicates section must be empty. Load `?d=hist-chars` and confirm the
header count matches the new entry count.

---

### `E6-05` — Reclassify hist-chars roles from Wikidata occupations

**Labels:** `epic:data-quality`, `area:tools`, `size:L`
**Branch:** `claude/e6-05-reclassify-roles`
**Depends on:** E6-01, E6-04
**Blocks:** E6-07

**Context**

`roles` is one of the two filters on `hist-chars`, so a wrong role makes an entry
unfindable. The current classification is visibly unreliable — Hor-Aha, a First Dynasty
pharaoh, carries only `Reformer` and not `Ruler`. Distribution is also lopsided: `Ruler` 342,
`Explorer` 17.

Every entry already carries `_occupation_qids`, the Wikidata occupation QIDs it was built
from, so the mapping can be redone systematically instead of by hand.

**Files**

- `tools/reclassify_roles.py` — new file
- `data/hist-chars.json` — updated `roles` values
- `docs/roadmap/DATA_AUDIT.md` — no change (regenerated in `E6-07`)

**Task**

1. Write `tools/reclassify_roles.py` that builds an explicit, committed mapping table from
   Wikidata occupation QID to one or more of the eight allowed roles in
   `meta.filters[roles].options`: `Ruler`, `Military`, `Scientist`, `Artist`, `Writer`,
   `Explorer`, `Religious`, `Reformer`.
2. The mapping table lives **in the script as a literal dict**, so it is reviewable in the
   diff. Do not fetch a mapping at runtime.
3. Cover at minimum the QIDs that account for 90% of entries. Print any unmapped QID with its
   entry count so the tail is visible and can be extended later.
4. Assign the union of roles implied by an entry's occupations. An entry that ends with **no**
   role must keep its existing roles rather than becoming empty — report those separately.
5. The script must be idempotent and must not touch any key other than `roles`.
6. Run it, and in the PR include the before/after distribution across all eight roles plus a
   sample of 15 entries whose roles changed.

**Acceptance criteria**

- [ ] Every entry has at least one role, and every role value appears in the `meta` options
      list.
- [ ] Hor-Aha includes `Ruler`.
- [ ] Entry count is unchanged from whatever `E6-04` left it at.
- [ ] Running the script twice produces no diff on the second run.
- [ ] Unmapped occupation QIDs are printed with counts, not silently dropped.
- [ ] The role filter on `?d=hist-chars` still works and the counts in the dropdown reflect
      the new distribution.

**Out of scope**

- Changing the set of eight allowed roles or adding new ones.
- Reclassifying `era` or `region`.
- Fetching anything new from Wikidata — use the QIDs already stored.

**Verify**

Load `?d=hist-chars`, filter by `Ruler`, confirm Hor-Aha appears. Filter by `Explorer` and
confirm the results are actually explorers.

---

### `E6-06` — BATCH TEMPLATE: un-truncate hist-events descriptions

> **To the issue creator:** expand this block into **3** issues, numbered
> `E6-06a` … `E6-06c`, replacing `<N>` with 1–3 and `<LETTER>` with a–c.

**Labels:** `epic:data-quality`, `area:data`, `size:M`
**Branch:** `claude/e6-06<LETTER>-hist-events-desc-batch-<N>`
**Depends on:** E6-01
**Blocks:** E6-07

**Context**

120 of the 645 entries in `data/hist-events.json` have a `desc` truncated mid-sentence ending
in `…`. Unlike `hist-chars`, no entry in this topic has a `tldr` at all, so `desc` is the only
text a reader ever sees — a truncated one is the whole card. This issue fixes **batch `<N>`
only**, per `docs/roadmap/DATA_AUDIT.md`.

**Files**

- `data/hist-events.json` — edit `desc` on the listed entries only

**Task**

1. Read the entry names for batch `<N>` from `docs/roadmap/DATA_AUDIT.md`.
2. Rewrite each `desc` as one or two complete sentences, at most 220 characters, saying what
   happened and why it mattered. It must end with a full stop, never `…`.
3. Events need consequence, not just occurrence — "X besieged Y" is weaker than "X besieged Y,
   ending Z". Keep it factual and avoid dramatising.
4. Do not invent dates, casualty figures, or outcomes. Where the traditional date is legendary
   rather than attested — as with the founding of Rome — say so.
5. Change nothing else: not `name`, `dates`, `y`, `region`, `period`, or `url`.
6. Write back with `ensure_ascii=False, indent=2` and a trailing newline.

**Acceptance criteria**

- [ ] Exactly the batch `<N>` entries have a changed `desc`, each ≤220 characters and none
      ending in `…`.
- [ ] Entry count is still exactly 645 and the file parses.
- [ ] `python3 tools/audit_data.py` shows the `hist-events` truncated count reduced by the
      batch size.
- [ ] Cards on `?d=hist-events` render the new text without overflow at 375px width.

**Out of scope**

- Adding `tldr` to this topic.
- Adding new events or fixing the Europe/Ancient coverage skew — that is editorial work fed by
  `E5-04`.

**Verify**

Load `?d=hist-events`, search for three entries from this batch, confirm the cards read as
complete sentences.

---

### `E6-07` — Refresh the audit and drop the placeholder framing

**Labels:** `epic:data-quality`, `area:data`, `area:docs`, `size:S`
**Branch:** `claude/e6-07-drop-placeholder-copy`
**Depends on:** E6-02, E6-03, E6-04, E6-05, E6-06
**Blocks:** none

**Context**

Both history topics' `meta.footer` currently describes them as placeholder topics seeded with
sample data, and `README.md` calls them "placeholder topics, populated later". Once the rest of
this epic has landed, that is no longer true and the copy undersells the content.

**Files**

- `data/hist-events.json` — `meta.footer` only
- `data/hist-chars.json` — `meta.footer` only
- `README.md` — topic descriptions
- `docs/roadmap/DATA_AUDIT.md` — regenerated

**Task**

1. Confirm all dependencies are closed, then run `python3 tools/audit_data.py` and commit the
   regenerated report.
2. If any defect count is still above zero, **stop and comment on the issue** with the
   remaining counts instead of changing the copy. The copy change must not outrun the data.
3. Rewrite both `meta.footer` strings to describe the topic honestly: what it covers, where
   the data comes from (Wikipedia and Wikidata), and that dates are scholarly estimates where
   sources disagree. Keep the tone of the `phil` footer.
4. Update the three topic bullets in `README.md` to give real entry counts and drop
   "placeholder ... populated later".
5. Update the `blurb` values in `data/topics.json` if the counts they quote are now wrong.

**Acceptance criteria**

- [ ] `python3 tools/audit_data.py --check` exits zero.
- [ ] Neither history topic's footer contains the word "placeholder" or "sample".
- [ ] README entry counts match the actual entry counts in the data files.
- [ ] No `entries` array was modified by this issue.
- [ ] The regenerated `DATA_AUDIT.md` is committed.

**Out of scope**

- Any further data edits. If the audit is not clean, this issue is blocked, not a licence to
  fix the remainder.

**Verify**

Load both history topics and read the footer on each.
