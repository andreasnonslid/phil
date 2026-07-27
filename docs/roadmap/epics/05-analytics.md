# E5 — Analytics and coverage

Aggregate the index against itself. Two payoffs from one build: a genuinely interesting view
of the data, and an editorial roadmap — the coverage panel tells you exactly where the index
is thin, which is what feeds the next round of data work.

The measured skew is already stark: `hist-events` is 410/645 European and holds only 19
entries for everything before 500 CE; `hist-chars` has 12 entries from the 20th century
onward against 259 from the 19th. That is worth showing rather than hiding.

Independent of `E1` — this epic can run at any time.

Charts are **hand-rolled inline SVG**. No charting library, per guardrail 1 in
`AGENT_BRIEF.md`. Colour series from the existing `TL_PALETTE` array in the viewer, and never
encode meaning by colour alone.

---

### `E5-01` — Stats route and aggregation module

**Labels:** `epic:analytics`, `area:viewer`, `size:M`
**Branch:** `claude/e5-01-stats-route`
**Depends on:** none
**Blocks:** E5-02, E5-03, E5-04

**Context**

The foundation for the epic: a route, a container, and pure aggregation functions the three
following issues render. Shipping aggregation separately from charts keeps each session small
and makes the numbers testable from the console before any SVG exists.

Aggregation must be driven by `meta.filters`, not hardcoded to any topic's fields.

**Files**

- `viewer.html` — stats container
- `assets/viewer.js` — stats route and aggregation
- `assets/viewer.css` — layout

**Task**

1. Route as `?d=<topic>&mode=stats`, hiding the list UI and showing a stats container.
   Add an entry point from the list view near the view toggle.
2. Implement pure functions, each taking an entries array and returning plain data:
   - `statsByCentury(entries)` → per-century counts from `y`, handling BCE correctly and
     including empty centuries in the range so gaps are visible;
   - `statsByFilter(entries, filterConfig)` → counts per option value, handling both
     `multiValue` list fields and single-value fields, and counting entries whose value is
     missing or not in `options` under a `"(unclassified)"` key;
   - `statsCrossTab(entries, filterConfig, bucketSize)` → counts per filter value per time
     bucket, for the composition chart in `E5-03`.
3. Compute over **entries matching the current filters**, so stats are scoped by whatever the
   reader had selected. Show which scope is in use and offer a reset to all entries.
4. Render a summary header: total entries, year range, and the count of distinct values for
   each filter.
5. Attach the aggregation functions to a module-level object so later issues and the console
   can call them.
6. Render no charts in this issue — a plain definition list of the summary numbers is the
   deliverable.

**Acceptance criteria**

- [ ] `?d=<topic>&mode=stats` works on all three topics and shows correct totals.
- [ ] `statsByCentury` handles BCE: a topic with ancient entries produces negative-century
      buckets in the right order. State a checked example in the PR.
- [ ] `statsByFilter` on `phil` `fields` (multi-value) and `trad` (single-value) both return
      counts that sum correctly, with multi-value totals exceeding the entry count as expected.
- [ ] Unclassified values are counted, not dropped.
- [ ] Filtering the list before entering stats scopes the numbers, and reset restores all.
- [ ] The functions are callable from the console.

**Out of scope**

- Any chart or SVG.
- Cross-topic stats.

**Verify**

Call each function from the console on all three topics and check the totals by hand against
the audit report from `E6-01`.

---

### `E5-02` — Entries-per-century chart

**Labels:** `epic:analytics`, `area:viewer`, `size:M`
**Branch:** `claude/e5-02-century-chart`
**Depends on:** E5-01
**Blocks:** none

**Context**

The first chart, and the one that makes the shape of the index legible: a bar per century from
the earliest entry to the latest. It is also the clearest picture of where coverage collapses.

**Files**

- `assets/viewer.js` — chart rendering
- `assets/viewer.css` — chart styles

**Task**

1. Render `statsByCentury` output as a vertical bar chart in inline SVG, sized responsively
   with a `viewBox` rather than fixed pixels.
2. Label the x axis by century, BCE centuries marked as such, with labels thinned to avoid
   overlap on narrow screens rather than shrunk to unreadability.
3. Label the y axis with entry counts and draw gridlines at sensible round intervals.
4. Include empty centuries as gaps in the axis — an absent century is the finding.
5. Hovering or focusing a bar shows century and count; the same information must be reachable
   by keyboard, not hover alone.
6. Clicking a bar returns to the list view filtered to that century, using the existing
   grouping filter (`era` or `period`) where the bucket maps cleanly onto one option; where it
   does not, do nothing rather than applying a wrong filter.
7. Use `--accent` for bars and `--line`/`--ink-soft` for axes so both themes work. No hex
   colours outside `:root`.
8. Give the SVG a `role="img"` and an `aria-label` summarising the distribution, and provide
   the underlying numbers as a visually-hidden table.

**Acceptance criteria**

- [ ] Renders correctly on all three topics, including BCE ranges.
- [ ] Empty centuries appear as gaps, not as skipped labels.
- [ ] Labels stay readable at 375px width.
- [ ] Hover and keyboard focus both surface century and count.
- [ ] Correct in light and dark mode, with no hardcoded colours.
- [ ] A screen-reader-accessible table of the same numbers is present.

**Out of scope**

- Animation or transitions.
- Zoom or brushing.

**Verify**

Compare the chart's totals against `statsByCentury` output in the console, and check the
sparse ancient range on `hist-events`.

---

### `E5-03` — Composition-over-time chart

**Labels:** `epic:analytics`, `area:viewer`, `size:L`
**Branch:** `claude/e5-03-composition-chart`
**Depends on:** E5-01, E5-02
**Blocks:** none

**Context**

The century chart shows how many; this shows *what kind*, over time — traditions across
`phil`, regions across `hist-events`, roles across `hist-chars`. It is where the Eurocentrism
of the history topics becomes visible as a shape rather than a number.

**Files**

- `assets/viewer.js` — chart rendering
- `assets/viewer.css` — styles

**Task**

1. Render `statsCrossTab` as a stacked bar chart: one bar per time bucket, segmented by filter
   value.
2. Let the reader choose which filter to break down by, defaulting to the filter marked
   `grouping` in `meta`, and choose a bucket size of 100 or 500 years.
3. Offer absolute counts and percentage-of-bucket modes. Percentages are what expose skew in
   sparse periods, where absolute counts hide it.
4. Colour segments from `TL_PALETTE`, in a stable order so a value keeps its colour across
   mode and bucket changes.
5. Provide a legend where each item is clickable to toggle that series, and label segments
   directly where they are wide enough — colour must not be the only channel carrying meaning.
6. Cap the legend at the 8 largest values and group the remainder as "Other", so the chart
   stays legible on topics with many filter options.
7. Hover or focus on a segment shows value, bucket, count and share.
8. Include a visually-hidden data table, as in `E5-02`.

**Acceptance criteria**

- [ ] Works on all three topics with their different filters.
- [ ] Switching between count and percentage modes changes the chart correctly and the totals
      still reconcile with `statsCrossTab`.
- [ ] Colours are stable for a given value across mode and bucket changes.
- [ ] Legend toggling hides and restores series.
- [ ] The Europe-heavy skew of `hist-events` is visible in percentage mode. Screenshot it in
      the PR.
- [ ] Readable at 375px and correct in both themes.

**Out of scope**

- Streamgraphs, small multiples, or animated transitions.
- Cross-topic comparison.

**Verify**

Check one bucket's segment values by hand against a console call to `statsCrossTab`.

---

### `E5-04` — Coverage gaps panel

**Labels:** `epic:analytics`, `area:viewer`, `size:M`
**Branch:** `claude/e5-04-coverage-gaps`
**Depends on:** E5-01
**Blocks:** none

**Context**

The editorial payoff. The charts show the distribution; this states the conclusion in words:
which centuries, regions and categories are thin enough to be worth filling. It is the input
to the next round of data work, so it should be blunt.

**Files**

- `assets/viewer.js` — gap analysis and rendering
- `assets/viewer.css` — styles

**Task**

1. Add a "Coverage" panel to the stats view listing concrete, quantified findings.
2. Compute and report:
   - centuries within the topic's range holding fewer than 25% of the median century's count,
     named explicitly;
   - filter values holding under 3% of entries, per filter;
   - filter values with zero entries;
   - entries counted as `"(unclassified)"` by `statsByFilter`;
   - the single most over-represented filter value with its share.
3. Write each finding as a plain sentence with the number in it — "Only 19 of 645 events
   predate 500 CE" — not as a bare table.
4. Make each finding clickable, returning to the list filtered to that slice so the gap can be
   inspected immediately.
5. Do not editorialise about causes. Report what the data shows; the reason a period is thin
   is a judgment for the maintainer.
6. Add a "Copy as markdown" button producing a pasteable summary, so findings can be dropped
   straight into an issue.

**Acceptance criteria**

- [ ] The panel renders on all three topics with topic-appropriate findings.
- [ ] The `hist-events` ancient gap and Europe over-representation both appear.
- [ ] Every stated number is verifiable against `statsByFilter` and `statsByCentury`.
- [ ] Clicking a finding filters the list to that slice.
- [ ] "Copy as markdown" yields well-formed markdown; paste the `hist-events` output into the
      PR description.
- [ ] Correct in both themes and at 375px.

**Out of scope**

- Comparing against any external reference dataset.
- Automatically opening issues for gaps.
- Suggesting specific entries to add.

**Verify**

Run it on all three topics and hand-check three findings per topic against the console.
