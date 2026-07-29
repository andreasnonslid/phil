# Prompt — issue creator

Paste the block below into the model that will open the GitHub issues. It creates issues
only; it writes no code.

Run it **one epic at a time** so a failure never leaves a half-created epic.

---

```
You are creating GitHub issues in the repository `andreasnonslid/phil`.
You will NOT write any code. You will NOT modify any file. You only open issues.

INPUT
Read the file `docs/roadmap/epics/<EPIC-FILE>.md` in the repo.
It contains a series of issue blocks, each starting with a heading of the form
`### \`E<epic>-<nn>\` — <title>`.

BEFORE YOU START
1. Read `docs/roadmap/README.md` for the label list.
2. List the repository's existing labels. Create any label from that list that is missing.
   Use these colours: epic:* = #5319e7, area:* = #0e8a16, size:* = #fbca04, blocked = #b60205.
3. List existing open AND closed issues in the repo. If an issue whose title already starts
   with the same `E<epic>-<nn>` identifier exists, SKIP that block — do not create duplicates.

FOR EACH ISSUE BLOCK, IN THE ORDER THEY APPEAR IN THE FILE
1. Title  = the heading text with the backticks removed, e.g.
             `E1-02 — Route entity deep links via ?d=<topic>&id=<slug>`
2. Body   = the entire block below the heading, copied VERBATIM, with one addition:
            prepend this line, then a blank line:

              > Implementer: read `docs/roadmap/AGENT_BRIEF.md` first, then follow this issue exactly.

3. Labels = exactly the labels listed on the block's `**Labels:**` line.
4. Create the issue.
5. Record the resulting issue number next to the identifier.

AFTER CREATING ALL ISSUES IN THE FILE
Post one summary comment on the FIRST issue you created for this epic, listing every
identifier and its issue number, and replacing each `**Depends on:**` / `**Blocks:**`
identifier with the real issue number, like:

  E1-01 -> #12
  E1-02 -> #13  (depends on #12)

Then edit each issue body, replacing bare identifiers in the `**Depends on:**` and
`**Blocks:**` lines with `E1-01 (#12)` style references. Leave the rest of the body untouched.

BATCH TEMPLATES
Some blocks begin with a blockquote line starting "To the issue creator:". These are batch
templates. For those blocks ONLY:
- Create the stated number of issues, not one.
- In each copy, substitute every `<N>` and `<LETTER>` placeholder with that copy's values as
  the instruction specifies. Check the title, the Branch line and the body text — placeholders
  appear in all three.
- If the blockquote says to "freeze the batch list": before creating these issues, run
  `python3 tools/audit_data.py` fresh, then replace the Task section's step 1 (which says to
  "read the entry names for batch `<N>` from `docs/roadmap/DATA_AUDIT.md`") with the exact,
  literal `name` list for that batch, copied straight out of the regenerated report. Each
  issue must be self-contained — do not leave a live reference to `DATA_AUDIT.md` in the
  Task section, since sibling batches merging later renumber it out from under you. This
  matters even if you are creating all batches in one run: the freeze protects whoever
  implements batch 3 after batches 1 and 2 have already merged, days or weeks later.
- Delete the "To the issue creator" blockquote itself from the issue body. It is an
  instruction to you, not to the implementer.
- Everything else in the block is copied verbatim into every copy.

RULES
- Copy issue bodies verbatim. Do not summarise, improve, reword, or reformat them.
- Do not invent issues that are not in the file.
- Do not close, reopen, or edit any issue that you did not create in this run.
- If a block is malformed or missing a required section, skip it and report which one at the
  end. Do not guess the missing content.
- Report at the end: issues created, issues skipped as duplicates, blocks skipped as
  malformed.
```

---

## Suggested order

Create epics in this order so that dependency numbers referenced by later epics already exist:

```
epics/00-foundation.md
epics/08-topic-manifest.md
epics/06-data-quality.md
epics/01-entity-pages.md
epics/02-cross-topic.md
epics/03-influence-graph.md
epics/04-learning-mode.md
epics/05-analytics.md
```
