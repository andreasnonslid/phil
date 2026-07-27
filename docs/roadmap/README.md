# Roadmap — LLM-executable work program

This directory is the source of truth for planned work on The Index. It exists so that
**cheap/small models can create and implement the work without making design decisions.**
All architectural choices have already been made and are written down here explicitly.

## The three roles

| Role | Reads | Does |
|---|---|---|
| **Planner** (expensive model, already done) | the codebase | wrote this directory |
| **Issue creator** (cheap model) | `CREATE_ISSUES_PROMPT.md` + `epics/*.md` | opens one GitHub issue per issue block |
| **Implementer** (cheap model, one issue per session) | `IMPLEMENT_PROMPT.md` + `AGENT_BRIEF.md` + one issue | writes the code, opens one PR |

Each implementer session handles **exactly one issue**. Issues are sized so that a single
session can finish one without running out of budget. If an issue turns out to be too big,
the implementer is instructed to split it rather than half-finish it.

## Files

- `AGENT_BRIEF.md` — shared repo context + hard guardrails. **Every implementer reads this first.**
- `ISSUE_TEMPLATE.md` — the canonical issue shape. All issue blocks in `epics/` follow it.
- `CREATE_ISSUES_PROMPT.md` — paste this into the issue-creating model.
- `IMPLEMENT_PROMPT.md` — paste this into each implementing model.
- `epics/` — one file per epic, containing ready-to-post issue blocks.

## Epics

Epic numbers match the original idea numbers, so `E7` is intentionally absent
(the CI schema-check idea was not selected).

| Epic | File | Blocks | Issues created | Depends on |
|---|---|---|---|---|
| `E0` | `00-foundation.md` | 3 | 3 | — |
| `E8` | `08-topic-manifest.md` | 4 | 4 | — |
| `E6` | `06-data-quality.md` | 7 | **21** | — |
| `E1` | `01-entity-pages.md` | 6 | 6 | `E6-04` |
| `E2` | `02-cross-topic.md` | 4 | 4 | `E1`, `E8` |
| `E3` | `03-influence-graph.md` | 4 | 4 | `E1` |
| `E4` | `04-learning-mode.md` | 4 | 4 | `E1` |
| `E5` | `05-analytics.md` | 4 | 4 | — |

**50 issues total.** Three blocks in `E6` are *batch templates* — one block that the issue
creator expands into several numbered issues covering disjoint slices of the data. That is why
its two counts differ.

## Execution waves

Run waves in order. **Within a wave, issues are independent and can be done in any order** —
that is what lets you spread the work across many small sessions.

### Wave 1 — no dependencies, start here
`E0-01` → `E0-02` → `E0-03`; `E8-01` → `E8-02` → `E8-03` → `E8-04`; `E6-01` then all other
`E6` issues; and all of `E5`.

`E6` is pure JSON editing with no code risk — the best filler work for the cheapest sessions,
and it can run in parallel with everything else indefinitely.

### Wave 2 — the keystone
All of `E1`, in numeric order. **`E1-01` blocks three of the four remaining epics**, so do it
first and do it carefully. It needs `E6-04` (deduplicate `hist-chars`) closed first, because
ids are generated from names and must be unique and permanent.

### Wave 3 — parallel feature work
`E2`, `E3`, `E4` — three independent tracks. Any number of sessions can work these
concurrently as long as each takes a different issue.

## Dependency graph

```
E0-01 ──> E0-02 ──> E0-03                  (foundation; soft dep for all code work)
E8-01 ──> E8-02 ──> E8-03 ──> E8-04        (manifest)
E5-01 ──> E5-02 ──> E5-03                  (analytics; independent of E1)
      └─> E5-04

E6-01 ──┬──> E6-02a..f  (desc batches)
        ├──> E6-03a..h  (tldr batches)
        ├──> E6-04 ──> E6-05                     ──┐
        └──> E6-06a..c                             │  all ──> E6-07
                                                   │
E6-04 ──> E1-01 (ids) ──┬──> E1-02 ──> E1-03 ──> E1-04 ──┬──> E1-05
                        │                                └──> E1-06
                        ├──> E2-01 ──> E2-02 ──> E2-04
                        │          └─> E2-03
                        ├──> E3-01 ──> E3-02 ──> E3-03 ──> E3-04
                        └──> E4-01 ──┬──> E4-02
                                     ├──> E4-03
                                     └──> E4-04
```

## Sizing key

| Size | Meaning |
|---|---|
| `S` | One file, small diff. Safe for the cheapest model. |
| `M` | Two or three files, or one new module. Standard. |
| `L` | Touches core rendering or adds a new view. Use a stronger model, or split first. |

## Labels to create in the repo before starting

```
epic:foundation  epic:entity-pages  epic:cross-topic  epic:influence-graph
epic:learning    epic:analytics     epic:data-quality epic:manifest
area:viewer  area:data  area:tools  area:docs
size:S  size:M  size:L
blocked
```
