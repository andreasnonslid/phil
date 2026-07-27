# E3 — Influence graph

Philosophy is the domain where "who shaped whom" is the actual subject, and there is no good
browsable version of it anywhere. Wikidata publishes it as property **P737 (influenced by)**,
and this repo's pipeline already talks to Wikidata — `hist-chars` entries carry
`_occupation_qids` and `_country_qids`, so the plumbing exists.

The graph is only interesting where it is dense, which is `phil`. Build it there first; the
same data file supports the other topics if their coverage turns out to be good.

---

### `E3-01` — Fetch influence edges from Wikidata

**Labels:** `epic:influence-graph`, `area:tools`, `area:data`, `size:L`
**Branch:** `claude/e3-01-fetch-influences`
**Depends on:** E1-01
**Blocks:** E3-02

**Context**

Nothing in the repo records influence relationships. This issue builds the dataset offline and
commits it, so the viewer stays a static site with no runtime API calls.

Entries have a Wikipedia `url` but not a Wikidata QID, except in `hist-chars` where only
occupation and country QIDs are stored. The subject QID must be resolved from the Wikipedia
title.

**Files**

- `tools/fetch_influences.py` — new file
- `data/influences.json` — new generated file

**Task**

1. Write `tools/fetch_influences.py`, standard library plus `requests`, following the
   checkpointing and rate-limiting pattern already used in `tools/fetch_hist_figures.py`.
2. Resolve each entry's Wikidata QID from its Wikipedia `url` title via the MediaWiki API, and
   cache the mapping in a `.jsonl` checkpoint so reruns are cheap. `.jsonl` files are
   gitignored except where explicitly allowlisted — follow the existing convention in
   `.gitignore`.
3. For each resolved QID, fetch **P737 (influenced by)**. Derive the reverse direction by
   inverting the edge set locally; do not fetch P738 separately.
4. Keep only edges where **both** ends resolve to an entry id in a topic in this repo. An edge
   to someone not in the index is not useful and must be dropped.
5. Write `data/influences.json` in exactly this shape, with edges sorted by `from` then `to`
   so reruns produce stable diffs:

   ```json
   {
     "meta": { "generated": "2026-07-27", "source": "Wikidata P737", "topics": ["phil"] },
     "edges": [ { "topic": "phil", "from": "aquinas-thomas", "to": "aristotle" } ]
   }
   ```

   `from` is the influencer, `to` is the influenced. State this direction in a comment in the
   file's `meta` and in the script.
6. Run it for `phil` at minimum. Report coverage in the PR: entries with a resolved QID,
   entries with at least one edge, total edges, and the ten most-influential entries by
   out-degree.
7. The script must be idempotent and must never modify a topic data file.

**Acceptance criteria**

- [ ] `data/influences.json` exists, parses, and every `from`/`to` matches a real entry `id`
      in the named topic.
- [ ] Edge direction is verified against a known case and stated in the PR: Aristotle
      influenced Aquinas, so the edge is `from: aristotle, to: aquinas-thomas`.
- [ ] Rerunning the script produces no diff.
- [ ] No self-edges and no duplicate edges.
- [ ] Coverage numbers are reported. If fewer than 30% of `phil` entries have any edge, say so
      plainly — it changes whether `E3-03` is worth building.
- [ ] No topic data file was modified.

**Out of scope**

- Rendering anything.
- Inferring edges from prose, or hand-authoring edges Wikidata does not have.
- Other relation types such as student-of or doctoral advisor.

**Verify**

Spot-check five edges against the Wikidata pages and quote them in the PR.

---

### `E3-02` — Show influences on the detail view

**Labels:** `epic:influence-graph`, `area:viewer`, `size:M`
**Branch:** `claude/e3-02-influence-lists`
**Depends on:** E3-01, E1-03
**Blocks:** E3-03

**Context**

The simplest and most useful presentation of the graph: two lists on an entry's page. This
lands the value of `E3-01` before any visualisation work, and is worth having even if graph
density turns out to be low.

**Files**

- `assets/viewer.js` — influence loading and rendering
- `assets/viewer.css` — styles

**Task**

1. Lazily fetch `data/influences.json` the first time a detail view renders, and cache it.
   Never fetch it on the list view.
2. Render into `#detail-extras`, above the Meanwhile section: **Influenced by** (entries where
   this entry is `to`) and **Influenced** (entries where this entry is `from`).
3. Each name links to that entry's detail view. Sort each list by year `y`, oldest first.
4. Show a count in each heading. Above 12 entries, show the first 12 and a "show all" toggle.
5. Render neither heading when the entry has no edges — no empty state, no placeholder.
6. If the fetch fails or the file is absent, render nothing and log a warning. The detail view
   must work unchanged without it.

**Acceptance criteria**

- [ ] An entry with known influences shows both lists correctly, with the directions the right
      way round — check one case by hand and state it in the PR.
- [ ] An entry with no edges shows nothing extra.
- [ ] Links navigate to the right entries and the back button works.
- [ ] Deleting `data/influences.json` locally leaves the detail view fully functional.
- [ ] Lists over 12 entries collapse and expand.
- [ ] Correct in both themes and at 375px.

**Out of scope**

- Graph visualisation (`E3-03`) and filtering (`E3-04`).
- Editing influence data by hand.

**Verify**

Open Aquinas and Aristotle and confirm the relationship appears on both, in opposite lists.

---

### `E3-03` — Lineage path between two entries

**Labels:** `epic:influence-graph`, `area:viewer`, `size:L`
**Branch:** `claude/e3-03-lineage-path`
**Depends on:** E3-02
**Blocks:** E3-04

**Context**

The lists in `E3-02` show one hop. The interesting question is longer range: how do you get
from the Stoics to Nietzsche? This adds a path finder over the influence edges.

**Only build this if `E3-01` reported reasonable graph density.** If fewer than 30% of entries
have edges, most path queries return nothing and the feature is a dead end — comment on the
issue with the coverage number and close it rather than shipping something that mostly fails.

**Files**

- `viewer.html` — lineage UI container
- `assets/viewer.js` — graph search and rendering
- `assets/viewer.css` — styles

**Task**

1. Add a `lineage` mode to the viewer, routed as `?d=phil&mode=lineage`, with two entry
   pickers (from, to) that filter as you type over the current topic's entries.
2. Implement breadth-first search over the edge set, treating edges as **directed** from
   influencer to influenced, and find the shortest path.
3. Render the path as a horizontal chain of entries with arrows, each linking to its detail
   view, and show the hop count.
4. When no directed path exists, say so and offer to search ignoring direction; if that finds
   one, render it and mark it as undirected.
5. Cap the search at 6 hops and report when the cap is hit rather than returning nothing.
6. Encode both endpoints in the URL so a found lineage is shareable.
7. Link into this mode from the influence section built in `E3-02`.

**Acceptance criteria**

- [ ] A known multi-hop pair resolves to a correct path; quote it in the PR.
- [ ] An impossible pair reports no path and offers the undirected fallback.
- [ ] The shared URL reproduces the same result in a fresh tab.
- [ ] Search over ~300 nodes returns instantly with no visible lag.
- [ ] Every entry in a rendered path links to the right detail view.
- [ ] Correct in both themes and at 375px.

**Out of scope**

- All paths, weighted paths, or path ranking.
- A force-directed network diagram.

**Verify**

Try five pairs of varying distance, including one with no path.

---

### `E3-04` — Filter the list to an entry's influence neighbourhood

**Labels:** `epic:influence-graph`, `area:viewer`, `size:M`
**Branch:** `claude/e3-04-influence-filter`
**Depends on:** E3-02
**Blocks:** none

**Context**

Reading an entry, the natural next move is "show me everyone downstream of this person" as a
browsable list you can then filter and sort like any other. This connects the graph to the
existing list machinery instead of keeping it siloed on the detail page.

**Files**

- `assets/viewer.js` — filter state and `match()` integration
- `assets/viewer.css` — active-filter chip styling

**Task**

1. Add optional list-view state: an influence root id plus a direction of `upstream`,
   `downstream`, or `both`, and a depth of 1 or 2.
2. Extend `match(r)` so that when a root is set, only entries reachable from it in that
   direction within that depth are included. The root itself is included.
3. Render an active-filter chip describing the constraint, e.g.
   `Influenced by Kant, Immanuel (2 hops)`, dismissible like the existing filter chips.
4. Compose with existing filters and sorts rather than replacing them — field and era filters
   must still apply on top.
5. Encode in the hash as `inf=<id>:<direction>:<depth>` so it is shareable, and restore it in
   `decodeHash()`.
6. Add "Show everyone they influenced" and "Show everyone who influenced them" links to the
   influence section on the detail view.
7. Ensure `resetAll()` clears it.

**Acceptance criteria**

- [ ] From an entry's detail view, "show everyone they influenced" returns to the list showing
      only downstream entries plus the root.
- [ ] Depth 2 returns strictly more entries than depth 1 for an entry with a deep subtree.
- [ ] The constraint composes with a field filter and with sort changes.
- [ ] The chip removes the constraint when dismissed, and "clear all" clears it.
- [ ] `#inf=kant-immanuel:downstream:2` restores the state on load.
- [ ] Timeline view respects the constraint too.

**Out of scope**

- Visualising the neighbourhood as a graph.
- Depths beyond 2.

**Verify**

Pick a well-connected entry, check depth 1 and 2 in both directions, and combine with a field
filter.
