# Issue template

Every issue block in `epics/*.md` uses exactly this shape. The issue-creating model copies a
block verbatim into a GitHub issue; the implementing model reads it as its complete spec.

The design rule behind this template: **an implementer with no prior context and no ability
to ask questions must be able to finish the issue.** Every section exists to remove a
decision from the implementer.

---

## The shape

````markdown
### `E<epic>-<nn>` — <imperative title, max ~60 chars>

**Labels:** `epic:<name>`, `area:<name>`, `size:<S|M|L>`
**Branch:** `claude/e<epic>-<nn>-<short-slug>`
**Depends on:** <issue ids, or `none`>
**Blocks:** <issue ids, or `none`>

**Context**

<2–5 sentences. Why this exists and what currently happens instead. Name the exact files and
line numbers the implementer needs. Never assume the reader has seen another issue.>

**Files**

- `path/to/file` — <what changes here>

**Task**

1. <Numbered, imperative, unambiguous steps. Any naming, routing, format, or algorithm
   decision is made *here*, not left to the implementer.>

**Acceptance criteria**

- [ ] <Observable, checkable statements. A reviewer must be able to verify each one by
      looking at the running page or the diff — no "works well" or "is clean".>

**Out of scope**

- <Things a reasonable implementer might drift into. Name them so they don't.>

**Verify**

- <Concrete steps beyond the standard checklist in AGENT_BRIEF.md, e.g. the exact URL to
  open and what should appear.>
````

---

## Rules for writing issue blocks

1. **Self-contained.** Assume the implementer has read `AGENT_BRIEF.md` and nothing else.
   Repeat any data shape or file path it needs. Do not write "as discussed in E1-02".
2. **Decisions are pre-made.** If there is a choice (query param vs hash, key name, file
   location, sort order, batch size), the issue states the answer. "Use your judgment" is a
   bug in the issue.
3. **Acceptance criteria are observable.** `- [ ] Opening ?d=phil&id=kant-immanuel renders
   the detail view for Kant` is good. `- [ ] Routing works correctly` is not.
4. **Size honestly.** If a block has more than ~8 task steps or touches more than 3 files,
   split it into two issues.
5. **Out of scope is mandatory** for anything touching `viewer.html`, because the file is
   large and scope creep there is the main failure mode.
6. **Batch issues** (`E6`) are parameterised: one template block plus an explicit list of
   ranges, so the creator emits N near-identical issues that never overlap.
