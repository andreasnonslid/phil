# E1 — Entity pages

**This is the keystone epic. Do it before E2, E3 and E4.**

Right now there is no such thing as a page for a single entry. Everything is a card in a
filtered list, and the "Random" button proves it: it works by writing the picked entry's name
into the search box (`state.q = pick.name.toLowerCase()`) so the list filters down to one
card. There is nowhere to put anything that belongs to *one* entry — influences,
contemporaries, works, quotes — and no canonical URL to share or for a crawler to index.

`E1-01` gives every entry a stable id. Every later epic depends on it, so it is worth being
slow and careful there.

Terminology used below: **detail view** is the single-entry UI; **list view** is the existing
grid/timeline of cards.

---

### `E1-01` — Add stable slug ids to every entry

**Labels:** `epic:entity-pages`, `area:data`, `area:tools`, `size:M`
**Branch:** `claude/e1-01-entry-ids`
**Depends on:** E6-04 (hist-chars must be deduplicated first)
**Blocks:** E1-02, E2-01, E3-01, E4-01

**Context**

Entries are currently identified by `name` alone — that is what `data/popularity.json`,
favourites (`phil_favs_v1`) and the random seen-set (`phil_seen_v1`) all key on. Names are
long, contain commas and accents, and are not URL-safe. Every feature from here on needs a
short, stable, URL-safe identifier.

**Stability is the whole point.** Once an id is published in a URL it must never change, even
if the entry's name is later corrected. That is why ids are generated once, committed to the
data files, and never regenerated wholesale.

**Files**

- `tools/add_ids.py` — new file
- `data/phil.json`, `data/hist-events.json`, `data/hist-chars.json` — add `id` to each entry

**Task**

1. Write `tools/add_ids.py` implementing exactly this slug rule:
   - Unicode NFKD-normalise the `name`, drop combining marks (so `Ibn Sīnā` → `ibn sina`).
   - Lowercase.
   - Replace every run of characters outside `[a-z0-9]` with a single `-`.
   - Strip leading and trailing `-`.
   - Truncate to 60 characters at a `-` boundary.
   - Example: `"Abelard, Peter"` → `abelard-peter`.
2. On collision within a topic, append `-2`, `-3`, … in the order entries appear in the file.
   Report every collision it resolves.
3. **The script must never change an `id` that already exists.** It only fills in missing ones.
   Make this explicit in the code and print a count of entries skipped because they already
   had an id.
4. Add `id` as the **first key** of each entry object, so the diff reads cleanly.
5. Run it across all three topics and commit the result.
6. Print a summary: entries processed, ids added, collisions resolved, ids left untouched.

**Acceptance criteria**

- [ ] Every entry in all three topics has a non-empty `id` matching `^[a-z0-9]+(-[a-z0-9]+)*$`.
- [ ] Ids are unique within each topic.
- [ ] Entry counts are unchanged in all three files.
- [ ] Running the script a second time adds zero ids and produces an empty `git diff`.
- [ ] Files contain no `\uXXXX` escapes and end with a newline.
- [ ] The PR states how many collisions occurred and lists them.

**Out of scope**

- Using the id anywhere in the viewer — that is `E1-02`.
- Migrating `popularity.json`, favourites or the seen-set from name keys to id keys. They keep
  working on names for now; a later issue can migrate them.

**Verify**

`python3 -c "import json;e=json.load(open('data/phil.json'))['entries'];ids=[x['id'] for x in e];print(len(e),len(set(ids)))"` prints `317 317`.

---

### `E1-02` — Route entity deep links via ?d=<topic>&id=<slug>

**Labels:** `epic:entity-pages`, `area:viewer`, `size:M`
**Branch:** `claude/e1-02-entity-router`
**Depends on:** E1-01
**Blocks:** E1-03

**Context**

The viewer reads the topic from the `?d=` query param and all view state from the location
hash (`#q=…&fields=…&view=timeline`). Entity routing uses a **query parameter, not the hash**:
`viewer.html?d=phil&id=abelard-peter`. Query params are crawlable and survive being pasted
into places that strip fragments; the hash stays reserved for list-view filter state.

This issue adds routing and state only — no visible detail UI yet, so it cannot break the
existing page.

**Files**

- `assets/viewer.js` — routing, state, history handling

**Task**

1. Add `entryId` to the global `state` object, defaulting to `null`.
2. On load, read the `id` query param. If present and it matches an entry's `id` in the
   current topic, set `state.entryId`. If it does not match any entry, ignore it, leave
   `state.entryId` null, and log a console warning — never throw or blank the page.
3. Add `function currentEntry()` returning the matching entry object or `null`.
4. Add `function navigateToEntry(id)` and `function navigateToList()` which update
   `state.entryId`, push a new history entry with `history.pushState`, and call `render()`.
   `navigateToEntry` writes `?d=<topic>&id=<slug>` and drops the hash. `navigateToList`
   removes the `id` param and restores the hash from `encodeHash()`.
5. Handle `popstate` so browser back and forward move between detail and list correctly.
6. `encodeHash()` must not run while `state.entryId` is set — filter state does not belong in
   an entity URL.
7. Add the section between `// ---- entity routing ----` and `// ---- end entity routing ----`
   comments, following the file's existing convention.

**Acceptance criteria**

- [ ] `?d=phil&id=abelard-peter` loads with `state.entryId === "abelard-peter"` and
      `currentEntry().name === "Abelard, Peter"`, verifiable from the console.
- [ ] `?d=phil&id=does-not-exist` loads the normal list view with a console warning and no
      error.
- [ ] Calling `navigateToEntry("kant-immanuel")` then browser-back returns to the list with
      the previous filters intact.
- [ ] Existing hash deep links still work exactly as before when no `id` is present.
- [ ] No visual change to the page in this issue.

**Out of scope**

- Rendering anything. `E1-03` builds the UI.
- Changing the hash format.

**Verify**

Exercise all four cases above from the console and the address bar, and confirm the back
button behaves correctly across three navigations.

---

### `E1-03` — Render the entity detail view

**Labels:** `epic:entity-pages`, `area:viewer`, `size:L`
**Branch:** `claude/e1-03-detail-view`
**Depends on:** E1-02
**Blocks:** E1-04, E2-02, E3-02

**Context**

With routing in place, `render()` must draw a single-entry view when `state.entryId` is set.
This is the container every later epic hangs content off: `E2-02` adds a contemporaries
section, `E3-02` adds influences. Build it so those are drop-in sections.

The view must be **data-agnostic** — the same code renders a philosopher, an event and a
figure, driven by `meta` exactly like the list view is. Do not special-case `phil`.

**Files**

- `assets/viewer.css` — detail view styles
- `assets/viewer.js` — detail rendering

**Task**

1. Add a `<div id="detail" hidden>` container to `viewer.html` directly after the results
   container.
2. In `render()`, branch: if `state.entryId` is set, hide the list UI (search bar, filter
   dropdowns, sort, view toggle, random bar, results, timeline) and show `#detail`; otherwise
   restore the previous behaviour exactly.
3. Render, in this order, skipping any block whose data is absent:
   - a back link reading `← All <meta.itemNoun>`, calling `navigateToList()`;
   - `name` as an `<h1>`, with `dates` beneath it;
   - tag chips built from `meta.cardTags`, reusing the existing card chip classes;
   - `desc` as a lead paragraph;
   - `tldr` as body prose, always expanded — the collapsible is a list-view affordance and
     has no place here;
   - popularity, if `meta.popularity` is true and the entry has a value, formatted with the
     existing `formatViews` helper;
   - outbound links: Wikipedia from `url`, and Stanford Encyclopedia from `sep_url` where
     present, both `target="_blank" rel="noopener"`;
   - an empty `<div id="detail-extras"></div>` as the documented insertion point for later
     epics. Say so in a comment.
4. Escape every interpolated value with `esc()`.
5. Set `document.title` to `<entry name> — <meta.title>` in detail view, and restore it to
   `meta.title` on return to the list.
6. Clicking a tag chip navigates back to the list filtered by that value, reusing the existing
   `addFilter(grp, val)` helper.

**Acceptance criteria**

- [ ] `?d=phil&id=abelard-peter` shows name, dates, field and tradition chips, desc, the full
      tl;dr, a Wikipedia link and a SEP link.
- [ ] `?d=hist-events&id=<any>` renders correctly with no tl;dr, no SEP link and no popularity
      block, and nothing looks broken by their absence.
- [ ] `?d=hist-chars&id=<any>` renders with role and era chips.
- [ ] Clicking a field chip on a philosopher returns to the list filtered by that field.
- [ ] The back link returns to the list with prior filters intact.
- [ ] Browser tab title changes on the detail view and reverts on the way back.
- [ ] Correct in light and dark mode and at 375px width.
- [ ] `#detail-extras` is present and empty in the DOM.

**Out of scope**

- Navigating to the detail view by clicking a card — that is `E1-04`.
- Contemporaries, influences, quotes, or works.
- Changing the list view's appearance in any way.

**Verify**

Open one entry from each of the three topics and confirm each renders sensibly despite their
different fields.

---

### `E1-04` — Open the detail view from result cards

**Labels:** `epic:entity-pages`, `area:viewer`, `size:M`
**Branch:** `claude/e1-04-card-navigation`
**Depends on:** E1-03
**Blocks:** E1-05, E1-06

**Context**

`row(r)` builds each result card. Cards currently link straight out to Wikipedia. After this
issue the card title opens the in-site detail view, and the external link stays available as a
distinct, clearly-marked link so the outbound path is not lost.

Timeline items should navigate too — `wireTimeline()` handles their click and hover behaviour.

**Files**

- `assets/viewer.js` — `row()`, timeline item handling
- `assets/viewer.css` — link affordance styles

**Task**

1. In `row(r)`, make the entry name an `<a href="viewer.html?d=<topic>&id=<id>">`. Give it a
   real `href` so middle-click and open-in-new-tab work, and intercept plain left-clicks to
   call `navigateToEntry(r.id)` without a page load.
2. Do not intercept a click carrying a modifier key (`ctrl`, `meta`, `shift`, `alt`) or a
   non-primary button — those must fall through to normal browser behaviour.
3. Keep the existing external Wikipedia link on the card as a separate, visually distinct
   element so nothing that worked before is lost.
4. Make timeline items navigate the same way on click. Leave the existing hover tooltip
   behaviour untouched.
5. Ensure the name link is keyboard-focusable and activates on Enter.

**Acceptance criteria**

- [ ] Clicking a card title opens the detail view without a full page reload.
- [ ] Ctrl/Cmd-clicking a card title opens the entity URL in a new tab, and that URL loads the
      detail view directly.
- [ ] The Wikipedia link still works and is visibly distinguishable from the title link.
- [ ] Clicking a timeline item opens that entry's detail view.
- [ ] Tabbing to a card title and pressing Enter opens the detail view.
- [ ] Search highlighting inside card titles still renders correctly.

**Out of scope**

- Changing card layout beyond what the link affordance requires.
- Prev/next navigation — that is `E1-06`.

**Verify**

Test plain click, ctrl-click, middle-click and keyboard Enter on `?d=phil`, then click a
timeline item in timeline view.

---

### `E1-05` — Make Random navigate to the entity page

**Labels:** `epic:entity-pages`, `area:viewer`, `size:S`
**Branch:** `claude/e1-05-random-navigate`
**Depends on:** E1-04
**Blocks:** none

**Context**

The Random button currently fakes a single-entry view by clearing the search box and then
writing the picked entry's name into it, so the list filters down to one card. With a real
detail view this hack can go. Its "no repeats" seen-set and history-clearing behaviour are
good and must be preserved unchanged.

The randomness itself is `Math.random()` and stays that way — unseeded, non-reproducible, and
entirely adequate for picking an entry.

**Files**

- `assets/viewer.js` — the `// ---- random philosopher ----` section

**Task**

1. In the `#randBtn` handler, keep the existing candidate-pool logic: filter by `match`,
   apply the no-repeats set, and show the "all seen" message when the pool is empty.
2. Replace the three lines that clear `state.q`, set `state.q = pick.name.toLowerCase()` and
   assign `$("#q").value` with a single `navigateToEntry(pick.id)` call.
3. Keep recording the pick in the seen-set and keep the seen-count UI updating.
4. Because the pool is drawn from `match`, an active filter still constrains the pick — keep
   that, and leave the existing search query untouched rather than clearing it.
5. Rename the section comment from `random philosopher` to `random entry`, since it serves all
   three topics.

**Acceptance criteria**

- [ ] Clicking Random opens a detail view and the address bar shows `?d=<topic>&id=<slug>`.
- [ ] The search box is no longer modified by the Random button.
- [ ] "No repeats" still excludes previously seen entries and the seen count still increments.
- [ ] The "all seen" message still appears when the filtered pool is exhausted, and "Clear
      history" still resets it.
- [ ] With a field filter active, Random only picks entries matching that filter.
- [ ] Random works on all three topics.

**Out of scope**

- Seeding, daily picks, or weighting the selection.
- Changing the no-repeats storage format.

**Verify**

Filter to one field, click Random ten times, and confirm every result matches the filter and
none repeats with "no repeats" enabled.

---

### `E1-06` — Previous/next navigation within the current result set

**Labels:** `epic:entity-pages`, `area:viewer`, `size:M`
**Branch:** `claude/e1-06-prev-next`
**Depends on:** E1-04
**Blocks:** none

**Context**

Arriving at a detail view from a filtered list, the only way onward is back and then click.
Prev/next turns the index into something you can read through — page through every Stoic, or
every event of the 19th century, in the sort order you chose.

The neighbours are defined by the **current filter and sort state**, which the detail view
preserves in memory even though it is not in the URL. If the entry is not in the current
result set — arriving from a bare entity URL, for example — show no prev/next controls.

**Files**

- `assets/viewer.js` — detail rendering
- `assets/viewer.css` — control styles

**Task**

1. In the detail view, compute the current result set with the existing `match` and
   `sortRecs` helpers and find the current entry's index in it.
2. If the entry is absent from that set, render no prev/next controls at all.
3. Otherwise render Previous and Next controls showing the neighbouring entry's `name`, each
   calling `navigateToEntry`. Disable Previous on the first entry and Next on the last; do not
   wrap around.
4. Show a position indicator, e.g. `12 of 317`, using `meta.itemNoun` where a noun is needed.
5. Bind the left and right arrow keys to the same actions, but only in detail view and only
   when focus is not in a text input.
6. Place the controls below `#detail-extras` so later epics' sections sit above them.

**Acceptance criteria**

- [ ] From a list filtered to one field, opening an entry and pressing Next moves to the next
      entry **in that filtered set**, not the next in the full topic.
- [ ] Changing sort to chronological changes what Next means, verifiably.
- [ ] Previous is disabled on the first entry and Next on the last, with no wraparound.
- [ ] Loading a bare `?d=phil&id=<slug>` in a fresh tab shows sensible controls or none, and
      never a broken position indicator.
- [ ] Arrow keys work in detail view and do nothing while focus is in the search box.
- [ ] Works on all three topics.

**Out of scope**

- Preserving filter state in the entity URL.
- Swipe gestures.

**Verify**

Filter `?d=phil` to Ethics, open the first result, and page through with Next to the end of
that filtered set.
