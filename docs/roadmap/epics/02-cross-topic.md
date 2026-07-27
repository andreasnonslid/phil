# E2 — Cross-topic time context

Three topics, 1,712 entries, all carrying a signed integer year in `y`, and they never speak
to each other. Kant's page can say what else was happening in 1781; the index can be searched
as one thing rather than three. This is the feature a Wikipedia tab cannot give you, and the
data to build it already exists.

Depends on `E1` because the detail view is where the context lives.

---

### `E2-01` — Load and index all topics into a shared corpus

**Labels:** `epic:cross-topic`, `area:viewer`, `size:M`
**Branch:** `claude/e2-01-corpus-loader`
**Depends on:** E1-01, E8-02
**Blocks:** E2-02, E2-03, E2-04

**Context**

`loadData()` fetches exactly one topic file and the viewer never sees the others. Cross-topic
features need all of them, but the three files together are about 1.1MB uncompressed, so they
must not be pulled in on first paint.

**Files**

- `assets/viewer.js` — new corpus module

**Task**

1. Add a section delimited by `// ---- corpus ----` / `// ---- end corpus ----` exposing
   `async function loadCorpus()`.
2. `loadCorpus()` fetches every topic in `TOPICS` **except the one already loaded**, in
   parallel, and caches the result on a module-level variable. Calling it twice must issue no
   second round of requests; concurrent calls must share one in-flight promise.
3. Build a flat array where each element is `{ topic, meta, entry }` so a consumer always
   knows which topic an entry came from and can read that topic's `meta` for labels.
4. Expose `corpusByYear(minY, maxY, opts)` returning entries whose `y` falls in the inclusive
   range, sorted by `y` then `name`, with an option to exclude a given topic and an option to
   exclude a given entry id.
5. Expose `corpusFindByUrl(url)` returning every corpus element sharing that Wikipedia `url`.
   `E2-04` uses it; `url` is the natural join key between topics.
6. Never call `loadCorpus()` during initial page load. It is called lazily by the features
   that need it.
7. On fetch failure, resolve with whatever loaded, log a warning, and let callers degrade —
   a missing topic must never break the page.

**Acceptance criteria**

- [ ] Loading `?d=phil` issues no request for the other two topic files, confirmed in the
      network panel.
- [ ] Calling `loadCorpus()` from the console fetches the other two once; calling it again
      fetches nothing.
- [ ] `corpusByYear(1700, 1800)` returns entries from more than one topic, sorted by year.
- [ ] Excluding a topic and excluding an id both work.
- [ ] Blocking one topic file still leaves the page working with a console warning.

**Out of scope**

- Any UI. This issue ships no visible change.
- Caching in localStorage or a service worker.

**Verify**

Exercise every exposed function from the console on `?d=phil` and confirm the network
behaviour above.

---

### `E2-02` — "Meanwhile" contemporaries section on the detail view

**Labels:** `epic:cross-topic`, `area:viewer`, `size:L`
**Branch:** `claude/e2-02-meanwhile`
**Depends on:** E2-01, E1-03
**Blocks:** E2-04

**Context**

`E1-03` left `<div id="detail-extras">` as the insertion point. This issue fills it with the
epic's headline feature: on any entry, what else was happening around then, drawn from all
three topics.

`y` means different things per topic — birth year for people, occurrence year for events — so
the section heading must not overclaim. Use "Meanwhile" and label each result with its topic.

**Files**

- `assets/viewer.js` — new section rendered into `#detail-extras`
- `assets/viewer.css` — styles

**Task**

1. In detail view, after first paint, call `loadCorpus()` and render a "Meanwhile" section
   into `#detail-extras`. Render the rest of the page first — this must never delay the entry
   itself.
2. Select entries with `y` within **±25 years** of the current entry's `y`, excluding the
   entry itself. If that yields fewer than 5 results, widen to ±50, then ±100, and say which
   window was used, e.g. "within 50 years".
3. Group results by topic, using each topic's own `meta.title` as the group heading and
   `meta.itemNounSingular` where a noun is needed.
4. Show at most **6 per topic**, chosen as those closest in year to the current entry. If more
   exist, add a link that opens that topic's list view filtered to the period.
5. Each result shows `name`, `dates`, and a one-line `desc` clamped to a single line, linking
   to that entry's detail view **in its own topic** — `viewer.html?d=<topic>&id=<id>`.
6. While loading, show a lightweight placeholder. If the corpus fails, render nothing rather
   than an error.
7. Do not render the section for an entry with no usable `y`.

**Acceptance criteria**

- [ ] `?d=phil&id=<a 17th-century philosopher>` shows contemporaries from all three topics.
- [ ] The current entry never appears in its own Meanwhile list.
- [ ] An entry in a sparse period widens the window and says so in the heading.
- [ ] Clicking a result navigates to that entry's detail view in the correct topic, and the
      back button returns.
- [ ] The entry's own content renders before the corpus finishes loading — verify with
      throttled network.
- [ ] Works from every topic, in both themes, and at 375px width.

**Out of scope**

- A combined cross-topic timeline visualisation.
- Relevance ranking beyond year proximity.

**Verify**

Compare an entry from a dense period (1750–1800) with one from a sparse period (before 500
CE) and confirm both read sensibly.

---

### `E2-03` — Cross-topic search

**Labels:** `epic:cross-topic`, `area:viewer`, `size:L`
**Branch:** `claude/e2-03-global-search`
**Depends on:** E2-01
**Blocks:** none

**Context**

Searching for "Aristotle" in `?d=phil` cannot find the `hist-chars` entry, and there is no way
to search the index as a whole. This adds an opt-in cross-topic mode to the existing search
box rather than a separate page, so there is one search to learn.

**Files**

- `viewer.html` — search bar control
- `assets/viewer.js` — search-mode handling
- `assets/viewer.css` — result grouping styles

**Task**

1. Add a checkbox beside the search box labelled `Search all topics`, styled like the existing
   "No repeats" control.
2. When it is checked and the query is non-empty, call `loadCorpus()` and search every topic
   using each topic's own `meta.searchKeys`.
3. Render results grouped by topic under each topic's `meta.title`, with a count per group.
   Reuse the existing card markup; add a small topic label to cards from other topics.
4. Filters, sorts and the timeline apply to the current topic only. When cross-topic mode is
   active, disable the filter dropdowns and the view toggle and explain why in one short line
   rather than silently ignoring them.
5. Unchecking the box, or clearing the query, restores the normal single-topic list exactly as
   before.
6. Persist the checkbox state in the hash as `all=1` so a cross-topic search is shareable, and
   keep it out of the hash when off.

**Acceptance criteria**

- [ ] Searching "Aristotle" with the box checked returns hits from both `phil` and
      `hist-chars`, grouped and labelled.
- [ ] Unchecking restores the previous single-topic result set unchanged.
- [ ] Filter dropdowns are visibly disabled in cross-topic mode with a stated reason.
- [ ] `#q=aristotle&all=1` restores cross-topic mode on load.
- [ ] Clicking any result opens the right entry in the right topic.
- [ ] With the box checked and an empty query, nothing is fetched and the normal list shows.

**Out of scope**

- Fuzzy matching, stemming, or ranking changes.
- Cross-topic sorting or filtering.

**Verify**

Test a query hitting all three topics, a query hitting one, and a query hitting none.

---

### `E2-04` — Link the same person across topics

**Labels:** `epic:cross-topic`, `area:viewer`, `size:M`
**Branch:** `claude/e2-04-same-entity-links`
**Depends on:** E2-01, E2-02
**Blocks:** none

**Context**

Aristotle is in `phil` and also in `hist-chars`; the same is true of dozens of figures. Today
they are unconnected records. The Wikipedia `url` is present on every entry in every topic and
is the reliable join key — names differ in format (`"Abelard, Peter"` versus `"Peter
Abelard"`), URLs do not.

**Files**

- `assets/viewer.js` — cross-reference rendering

**Task**

1. In the detail view, use `corpusFindByUrl(entry.url)` to find entries in **other** topics
   sharing this entry's Wikipedia URL.
2. Normalise before comparing: compare lowercased, ignore a trailing slash, ignore
   `http` versus `https`, and ignore any query string or fragment.
3. When matches exist, render a line above the Meanwhile section: `Also in: <topic title>`,
   linking to that entry's detail view.
4. In cross-topic search results from `E2-03`, mark entries that also exist in another topic so
   the same person does not read as two unrelated hits.
5. Do nothing when there are no matches — no empty heading, no placeholder.
6. Report in the PR how many entries have a cross-topic match, per topic pair.

**Acceptance criteria**

- [ ] An entry present in both `phil` and `hist-chars` shows an "Also in" link on both sides.
- [ ] The link opens the counterpart entry's detail view in the other topic.
- [ ] Entries with no counterpart show nothing extra.
- [ ] URL normalisation is proven: state in the PR a case that matches only because of it, or
      state that none exists.
- [ ] No measurable delay added to detail rendering.

**Out of scope**

- Merging duplicate entries across topics — they stay separate by design.
- Matching on name similarity. URL only; a wrong link is worse than a missing one.

**Verify**

Find three figures present in two topics and check the link works in both directions.
