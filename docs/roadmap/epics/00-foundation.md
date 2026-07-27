# E0 — Foundation

**Not one of the seven selected ideas.** It is included because every selected epic adds code
to `viewer.html`, which is already a 49KB single file holding all HTML, CSS and JS. Seven
epics of additions land it well past 150KB, and a small model editing a file that size is the
most likely way this program produces a broken page.

`E0-01` and `E0-02` are pure mechanical extraction with no behaviour change. `E0-03` is the
only automated safety net in the program — with no human reviewing each PR, it is what stops
a silent regression from surviving ten sessions.

Skip this epic if you disagree; nothing else strictly requires it. If you skip it, every
later issue that says "add to `assets/…`" means "add to the corresponding section of
`viewer.html`, inside `// ---- feature ----` comment delimiters".

---

### `E0-01` — Extract viewer CSS into assets/viewer.css

**Labels:** `epic:foundation`, `area:viewer`, `size:S`
**Branch:** `claude/e0-01-extract-css`
**Depends on:** none
**Blocks:** E0-02

**Context**

`viewer.html` contains a single `<style>` block of roughly 300 lines starting near line 11,
followed by the page markup and a large inline `<script>`. Splitting the CSS out is the
lowest-risk half of making the file editable by small models. `index.html` has its own
smaller `<style>` block and is **not** part of this issue.

**Files**

- `viewer.html` — remove the `<style>` block, add a stylesheet link
- `assets/viewer.css` — new file, receives the extracted rules

**Task**

1. Create `assets/viewer.css`.
2. Move the entire contents of the `<style>` element in `viewer.html` into it, byte for byte.
   Do not reorder, reformat, merge, or minify any rule. Keep the `:root` and
   `:root[data-theme="dark"]` blocks exactly as they are.
3. Replace the `<style>` element in `viewer.html` with
   `<link rel="stylesheet" href="assets/viewer.css">`, in the same position in `<head>`.
4. Leave the inline `<script>` in `<head>` (the theme bootstrap) untouched — it must keep
   running before first paint to avoid a flash of the wrong theme.

**Acceptance criteria**

- [ ] `viewer.html` contains no `<style>` element.
- [ ] `assets/viewer.css` exists and the diff shows the rules moved unchanged, not rewritten.
- [ ] All three topics render identically to before, in light and dark mode.
- [ ] Timeline view renders identically, including lane colours.
- [ ] No flash of light theme when loading with dark mode active.

**Out of scope**

- `index.html` (keeps its inline styles).
- Any CSS cleanup, deduplication, or renaming of custom properties.
- Extracting the JS — that is `E0-02`.

**Verify**

Open `?d=phil`, `?d=hist-events`, `?d=hist-chars` in both themes and at 375px width.
Toggle to timeline view on `?d=phil` and confirm lane colours are unchanged.

---

### `E0-02` — Extract viewer JS into assets/viewer.js

**Labels:** `epic:foundation`, `area:viewer`, `size:M`
**Branch:** `claude/e0-02-extract-js`
**Depends on:** E0-01
**Blocks:** E0-03

**Context**

After `E0-01`, `viewer.html` is markup plus one large inline `<script>` (~700 lines, running
from roughly line 346 to the end). Extracting it to a plain classic script keeps every later
feature issue editing a JS file instead of an HTML file.

Use a **classic script**, not an ES module: `type="module"` is subject to CORS and would stop
the page working when opened directly from disk, and nothing here needs module scope.

**Files**

- `viewer.html` — replace the inline script with a `<script src>` tag
- `assets/viewer.js` — new file, receives the extracted code

**Task**

1. Create `assets/viewer.js` and move the entire contents of the body-level `<script>`
   element into it, unchanged. Preserve the `// ---- feature ----` section comments exactly;
   later issues use them as insertion points.
2. Replace that element in `viewer.html` with `<script src="assets/viewer.js"></script>` in
   the same position, at the end of `<body>`.
3. Do **not** move the small theme-bootstrap `<script>` in `<head>`; it must stay inline.
4. Confirm no code depended on being inline — in particular the script must still run after
   the DOM exists. If it does not, add `defer` to the tag rather than restructuring the code.

**Acceptance criteria**

- [ ] `viewer.html` contains exactly one inline `<script>` (the head theme bootstrap) and one
      `<script src="assets/viewer.js">`.
- [ ] The diff for `assets/viewer.js` is a move, not a rewrite.
- [ ] Search, every filter dropdown, every sort option, favourites, random, copy-link,
      glossary bars, and timeline all still work on `?d=phil`.
- [ ] An existing deep link such as
      `viewer.html?d=phil#q=kant&fields=Ethics&view=timeline` still restores that state.
- [ ] Browser console is free of errors on all three topics.

**Out of scope**

- Splitting `viewer.js` into feature modules, converting to ES modules, or reordering
  functions.
- Any behaviour change whatsoever, including bug fixes.

**Verify**

Load each topic, exercise one filter of each kind (multi-value and grouping), switch sorts,
star a favourite and reload, then open the deep link above and confirm state is restored.

---

### `E0-03` — Add a Playwright smoke test

**Labels:** `epic:foundation`, `area:tools`, `size:M`
**Branch:** `claude/e0-03-smoke-test`
**Depends on:** E0-02
**Blocks:** none

**Context**

This program runs dozens of unreviewed sessions against a shared file. There is currently no
automated check that the page still works. This issue adds a single smoke test that any later
implementer can run in one command before opening a PR.

Playwright and Chromium are available in the agent environment. The test must not become a
required build step for the site itself — the site stays dependency-free; the test is a
developer tool that lives beside it.

**Files**

- `tools/smoke_test.py` — new file, Playwright-driven smoke test
- `docs/roadmap/AGENT_BRIEF.md` — add the command to the verification checklist
- `README.md` — one line under Stack noting the optional test

**Task**

1. Write `tools/smoke_test.py` using Playwright's sync API. It starts
   `python3 -m http.server` on a free port serving the repo root, drives a headless
   Chromium, and shuts the server down at the end.
2. For each of `phil`, `hist-events`, `hist-chars`, assert:
   - the page loads and the entry-count kicker shows a non-zero number;
   - at least one result card is rendered;
   - typing a query into `#q` reduces the number of cards;
   - no `console.error` and no uncaught page error fired at any point.
3. On `?d=phil` additionally assert: the timeline view renders at least one item; the random
   button changes the visible result; toggling dark mode sets `data-theme="dark"` on `<html>`.
4. Assert `index.html` renders one card per topic listed in the viewer's topic list.
5. Exit non-zero with a readable failure summary naming the topic and assertion that failed.
6. Print `SMOKE OK` and exit zero on success.

**Acceptance criteria**

- [ ] `python3 tools/smoke_test.py` passes on a clean checkout and prints `SMOKE OK`.
- [ ] Temporarily breaking a selector in `assets/viewer.js` makes it fail with a message that
      names the failing assertion. State in the PR that you actually tried this.
- [ ] The script cleans up its HTTP server even when an assertion fails.
- [ ] No new runtime dependency is introduced for the site itself.
- [ ] The verification checklist in `AGENT_BRIEF.md` mentions the command.

**Out of scope**

- CI workflows or GitHub Actions.
- Unit tests, snapshot tests, or coverage tooling.
- Testing data quality — that is `E6-01`'s audit script.

**Verify**

Run the script on a clean checkout, then again with a deliberate breakage, and report both
outcomes in the PR.
