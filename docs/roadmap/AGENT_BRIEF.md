# Agent brief — read this before touching the repo

You are implementing **one issue** from `docs/roadmap/epics/`. This file gives you everything
you need to know about the project. Do not go exploring beyond what your issue names.

## What this project is

A static, browsable multi-topic reference. One landing page links to topics; **one shared
data-agnostic viewer renders all of them.**

```
index.html          landing page, topic cards
viewer.html         the entire viewer — HTML + CSS + JS in one file (~49KB)
data/phil.json          317 philosophers   (hand-curated, high quality)
data/hist-events.json   645 events         (machine-generated, needs quality work)
data/hist-chars.json    750 figures        (machine-generated, needs quality work)
data/popularity.json    Wikipedia pageview stats, keyed by entry name
tools/*.py              offline data pipeline (Wikipedia/Wikidata fetchers)
```

Live at https://andreasnonslid.github.io/phil/ via GitHub Pages from the default branch.

## The data contract

Every topic file is exactly:

```json
{ "meta": { ... }, "entries": [ { ... }, ... ] }
```

`meta` is the topic's **config** — the viewer builds the entire UI from it. Keys:

| Key | Purpose |
|---|---|
| `title`, `subtitle`, `kicker`, `footer` | page copy (`{n}` in `kicker` is replaced with the entry count) |
| `itemNoun`, `itemNounSingular` | e.g. `"philosophers"` / `"philosopher"` |
| `searchKeys` | entry keys the search box matches against |
| `filters` | array of filter configs: `id`, `label`, `key`, `multiValue`, `options[]`, optional `glossary`, optional `grouping` |
| `sorts`, `defaultSort` | array of `[id, label]` pairs |
| `cardTags` | which entry keys render as tag chips on a card |
| `yearKey` | the numeric year field, always `"y"` |
| `timeline`, `popularity` | booleans enabling those features for this topic |
| `timelineLaneFilterId` | which filter id groups timeline lanes |

Entries differ per topic but **always** have: `name`, `dates` (display string), `y` (signed
integer year, negative = BCE), `desc`, `url` (Wikipedia). Most have `tldr`. Topic-specific:
`phil` has `fields[]`, `trad`, `tgroup`, `era`, `sep_url`; `hist-events` has `region`,
`period`; `hist-chars` has `roles[]`, `era`, `region`, `_country_qids[]`, `_occupation_qids[]`.

Keys prefixed `_` are pipeline internals, not rendered.

## Hard guardrails — violating any of these fails the PR

1. **No build step. No npm. No bundler. No framework. No CDN dependencies.**
   The only external resource in the project is the Google Fonts stylesheet already present.
   Everything must work as plain files served statically.
2. **Never write a whole data file from a template or from memory.**
   The repo has already lost `data/phil.json` once to a placeholder overwrite (commit
   `7e3c71e`). Always read → modify in place → write back, and **assert the entry count is
   unchanged** (or changed by exactly the amount your issue specifies) before saving.
3. **Data files are UTF-8 with real accented characters, 2-space indent.**
   When writing JSON from Python use `json.dump(data, f, ensure_ascii=False, indent=2)` and
   end the file with a newline. Never emit `\uXXXX` escapes — it would rewrite every line of
   the file and make the diff unreviewable.
4. **Preserve existing deep links.** The hash format
   `#q=…&fields=…&trads=…&favs=1&view=timeline` is public and shared. `index.html` also
   redirects legacy `index.html#…` links to `viewer.html?d=phil#…`. Do not break either.
5. **Keep the diff minimal.** Do not reformat, re-indent, or "tidy" code you were not asked
   to change. Do not rename existing functions or CSS variables.
6. **Theme support is not optional.** Every new UI element must use the existing CSS custom
   properties (`--paper`, `--paper-2`, `--ink`, `--ink-soft`, `--line`, `--line-soft`,
   `--accent`, `--accent-soft`, `--gold`, `--card`, `--shadow`) so it works in both light and
   dark. Never hardcode a hex colour outside a `:root` block.
7. **Charts and graphs are hand-rolled inline SVG.** No charting library. Colour series from
   the existing `TL_PALETTE` array in `viewer.html`, and never encode meaning by colour alone.
8. **One issue = one branch = one PR.** Do not bundle unrelated changes.
9. **If the issue is ambiguous or bigger than it looks, stop and say so** in a comment on the
   issue instead of guessing. A blocked issue is cheap; a wrong architectural choice
   propagates to every issue after it.

## Code conventions in `viewer.html`

- Vanilla ES2020+. No transpilation, no polyfills.
- `$` is `document.querySelector`. `esc()` escapes HTML — **use it for every interpolated
  data value**, entries contain user-facing text with `&`, `<`, quotes.
- Global `state` object (`viewer.html:346`) holds `q`, `filters`, `sort`, `showFavs`, `view`.
- `DATA` is the loaded entries array; `META` the topic config; `FILTERS` the filter configs.
- `match(r)` decides filter/search inclusion; `sortRecs(a)` sorts; `render()` redraws.
- Feature blocks are delimited by `// ---- feature ----` / `// ---- end feature ----`
  comments. **Follow this convention for anything you add.**
- localStorage keys are namespaced `phil_*` (`phil_theme`, `phil_favs_v1`, `phil_seen_v1`).
  New keys follow the same pattern and end with a version suffix.
- Indentation is 2 spaces. Strings are double-quoted.

## Python conventions in `tools/`

- Standard library plus `requests` only. Scripts are run manually, not in CI.
- Long-running fetchers write a `.jsonl` checkpoint so they can resume; see
  `fetch_hist_figures.py` for the pattern. Respect the same rate limiting.
- A script must be idempotent: running it twice must not duplicate or corrupt data.

## How to verify your work

Verify manually:

```bash
python3 -m http.server 8000     # then open http://localhost:8000/
```

If `tools/smoke_test.py` exists, also run it (Playwright, headless Chromium):

```bash
python3 tools/smoke_test.py
```

It prints `SMOKE OK` and exits zero on success, or a readable failure naming the topic and
assertion that failed. It is a developer tool, not a required build step or CI gate.

Every PR must confirm, in its description:

- [ ] Landing page loads; all three topic cards work.
- [ ] `viewer.html?d=phil`, `?d=hist-events`, `?d=hist-chars` all load and render entries.
- [ ] Search, at least one filter, and sort still work.
- [ ] Timeline view still renders (`?d=phil#view=timeline`).
- [ ] Light **and** dark mode both look right.
- [ ] Layout is not broken at 375px width.
- [ ] Browser console has no errors.
- [ ] If you touched a data file: entry count before and after is as expected, and
      `python3 -c "import json;json.load(open('data/<file>.json'))"` succeeds.

## Git workflow

```bash
git checkout -b <branch-from-the-issue>
# ... work ...
git add -A && git commit -m "<type>: <summary> (#<issue-number>)"
git push -u origin <branch>
```

Commit type is `feat`, `fix`, `refactor`, `data`, `docs`, or `chore`. Reference the issue
number in the commit subject — this repo's history already follows that convention.
Open a PR that closes the issue with `Closes #<n>`.
