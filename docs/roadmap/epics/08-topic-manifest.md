# E8 — Topic manifest

The topic list currently lives in two places: the hardcoded `<a class="topic">` cards in
`index.html` (lines 76–93) and the `DATASETS` array in the viewer (`viewer.html:350`). Adding
a topic means editing both and keeping the descriptions in sync by hand. This epic makes a
topic a single-file operation, which is the whole promise of the data-agnostic engine.

Do this early: several later epics iterate over "all topics", and they should read the
manifest rather than hardcode a fourth list.

---

### `E8-01` — Add data/topics.json manifest

**Labels:** `epic:manifest`, `area:data`, `size:S`
**Branch:** `claude/e8-01-topics-manifest`
**Depends on:** none
**Blocks:** E8-02, E8-03

**Context**

There is no single place that lists the site's topics. This issue creates one. It only adds
the file — no consumer changes yet, so it cannot break anything.

**Files**

- `data/topics.json` — new file

**Task**

1. Create `data/topics.json` with this exact shape:

   ```json
   {
     "topics": [
       {
         "id": "phil",
         "kicker": "Philosophy",
         "title": "The Philosophers' Index",
         "blurb": "317 thinkers across twenty-six centuries — by field, tradition, era, and popularity.",
         "status": "live"
       }
     ]
   }
   ```

2. Include all three topics in this order: `phil`, `hist-events`, `hist-chars`.
3. Take `kicker`, `title` and `blurb` verbatim from the existing cards in `index.html`
   lines 76–93 so the landing page copy is unchanged when `E8-03` starts reading this file.
4. Set `"status": "live"` for all three. The field exists so a future topic can be listed as
   `"soon"` and rendered with the existing `.soon` CSS class.
5. `id` must equal the data filename without `.json`, because the viewer resolves
   `data/<id>.json`.

**Acceptance criteria**

- [ ] `data/topics.json` parses as JSON and contains exactly three topics.
- [ ] Each `id` corresponds to an existing `data/<id>.json`.
- [ ] `title` and `blurb` match the current `index.html` cards character for character.
- [ ] Nothing else in the repo changed.

**Out of scope**

- Reading the manifest anywhere — that is `E8-02` and `E8-03`.
- Adding new topics.

**Verify**

`python3 -c "import json;print(len(json.load(open('data/topics.json'))['topics']))"` prints 3.

---

### `E8-02` — Viewer reads the topic list from the manifest

**Labels:** `epic:manifest`, `area:viewer`, `size:M`
**Branch:** `claude/e8-02-viewer-manifest`
**Depends on:** E8-01
**Blocks:** E8-03

**Context**

`viewer.html:350` (or `assets/viewer.js` if `E0-02` landed) has
`const DATASETS=["phil","hist-events","hist-chars"];`, used by `currentDataset()` to validate
the `?d=` param and fall back to a default. It should come from `data/topics.json` instead.

The validation matters: an unknown `?d=` value must not cause an unhandled fetch failure.

**Files**

- `assets/viewer.js` (or `viewer.html` if `E0-02` has not landed) — replace `DATASETS`

**Task**

1. Fetch `data/topics.json` before the topic data is loaded, in `initApp()`.
2. Derive the valid topic id list from `topics[].id` and use it wherever `DATASETS` was used.
3. Keep `phil` as the default when `?d=` is absent, and keep the existing behaviour when
   `?d=` names an unknown topic — fall back to the default rather than erroring.
4. If `data/topics.json` cannot be fetched, fall back to the hardcoded three ids so the
   viewer still works. Log a console warning, do not throw.
5. Store the loaded manifest on a module-level `TOPICS` constant; later epics consume it.

**Acceptance criteria**

- [ ] No hardcoded topic array remains except the documented fallback.
- [ ] `?d=phil`, `?d=hist-events`, `?d=hist-chars` all load normally.
- [ ] `?d=nonsense` falls back to the default topic with no console error.
- [ ] Omitting `?d=` entirely loads `phil`.
- [ ] `TOPICS` is reachable from other code in the file.

**Out of scope**

- Changing `index.html`.
- Adding UI for switching topics from inside the viewer.

**Verify**

Load all three topics, then `?d=nonsense`, then no param at all. Console must stay clean.

---

### `E8-03` — Landing page builds cards from the manifest

**Labels:** `epic:manifest`, `area:viewer`, `size:M`
**Branch:** `claude/e8-03-index-manifest`
**Depends on:** E8-01, E8-02
**Blocks:** E8-04

**Context**

`index.html` hardcodes three `<a class="topic">` cards (lines 76–93). They should be rendered
from `data/topics.json` so adding a topic touches one file. The existing CSS classes
(`.topic`, `.t-kicker`, `.arrow`, `.soon`) already cover everything needed.

**Files**

- `index.html` — replace static cards with rendered ones

**Task**

1. Replace the three static cards inside `.grid` with an empty container, then populate it at
   runtime from `data/topics.json`.
2. Produce exactly the same DOM structure as the current cards, so no CSS changes are needed:
   an `<a class="topic" href="viewer.html?d=<id>">` containing `.t-kicker`, `<h2>`, `<p>`, and
   `<span class="arrow">Browse &rarr;</span>`.
3. For a topic with `"status": "soon"`, add the `soon` class to the anchor and use
   `Coming soon` as the arrow text instead of `Browse →`. Keep it a link.
4. Escape all interpolated manifest values before inserting them as HTML.
5. If the fetch fails, render a single line of fallback text linking to `viewer.html?d=phil`
   so the site is never a blank page.
6. Do not touch the head theme bootstrap or the legacy `#hash` redirect at lines 56–60.

**Acceptance criteria**

- [ ] The landing page looks pixel-identical to before for the three live topics.
- [ ] Adding a fourth entry to `data/topics.json` makes a fourth card appear with no other
      edit. State in the PR that you tested this and then reverted it.
- [ ] A `"soon"` topic renders dimmed with `Coming soon`.
- [ ] Blocking the fetch shows the fallback link instead of an empty page.
- [ ] Legacy links like `index.html#q=kant` still redirect to `viewer.html?d=phil#q=kant`.

**Out of scope**

- Restyling the landing page.
- Search or filtering on the landing page.

**Verify**

Compare the rendered page against the pre-change version side by side. Test the legacy
redirect explicitly.

---

### `E8-04` — Document how to add a topic

**Labels:** `epic:manifest`, `area:docs`, `size:S`
**Branch:** `claude/e8-04-docs-add-topic`
**Depends on:** E8-03
**Blocks:** none

**Context**

Once the manifest is wired up, adding a topic is a two-file operation, but nothing says so.
`README.md` currently describes the architecture but not the procedure.

**Files**

- `README.md` — add a "Adding a topic" section

**Task**

1. Add a section after "How it works" giving the exact steps: create `data/<id>.json` with
   `meta` and `entries`, add an entry to `data/topics.json`, done.
2. Document every `meta` key with a one-line description and say which are optional. Use the
   table in `docs/roadmap/AGENT_BRIEF.md` as the source — do not invent keys.
3. Document the required entry keys (`name`, `dates`, `y`, `desc`, `url`) and note that `y`
   is a signed integer where negative means BCE.
4. Include a minimal but complete copy-pasteable example with two entries.
5. Note that keys prefixed `_` are pipeline internals and are not rendered.

**Acceptance criteria**

- [ ] Following the section from scratch produces a working topic. Prove it: add a throwaway
      topic, confirm it loads, remove it, and say so in the PR.
- [ ] Every `meta` key used by the viewer is documented.
- [ ] The example is valid JSON.
- [ ] The existing README sections are unchanged apart from the insertion.

**Out of scope**

- Rewriting the rest of the README.
- Documenting the `tools/` pipeline.

**Verify**

Paste the example into `data/test.json`, add it to the manifest, load it, then revert.
