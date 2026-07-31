# The Index

A multi-topic browsable reference. A landing page (`index.html`) links to topics,
each rendered by one shared, data-agnostic viewer (`viewer.html?d=<topic>`):

- **Philosophers** (`?d=phil`) — browse, filter, and sort 317 philosophers by
  field, tradition, era, and popularity.
- **Historical Events** (`?d=hist-events`) — browse 645 turning points across world
  history by region and period.
- **Historical Figures** (`?d=hist-chars`) — browse 730 figures who shaped the
  historical record by role and era.

**Live:** https://andreasnonslid.github.io/phil/

## How it works

Each topic is a single JSON file under `data/` shaped as `{ "meta": …, "entries": [ … ] }`.
The `meta` block is the topic's config: title/subtitle/kicker, its filters and
filter-explanation glossaries, sort options, and flavour text. The viewer reads
the `?d=` URL param, fetches `data/<topic>.json`, and builds the whole UI from
that config — so topics can differ (number of filters, glossaries, text) while
sharing one engine.

## Adding a topic

Adding a topic is a two-file operation:

1. Create `data/<id>.json` shaped as `{ "meta": { … }, "entries": [ … ] }`.
2. Add an entry for `<id>` to `data/topics.json`.

Done — no build step, no code changes. `index.html` renders a card from the manifest entry,
and `viewer.html?d=<id>` builds its entire UI from your `meta` block.

### `data/topics.json` entry

Each entry in the top-level `topics` array needs:

| Key | Purpose |
|---|---|
| `id` | matches the topic's data filename (`data/<id>.json`) and the `?d=` URL param |
| `kicker` | short label above the card title (e.g. `"Philosophy"`) |
| `title` | card heading |
| `blurb` | one-sentence description shown on the card |
| `status` | `"live"` for a normal card, or `"soon"` to render it dimmed with "Coming soon" |

### `meta` keys

| Key | Purpose | Optional? |
|---|---|---|
| `title` | page `<title>` and heading text | recommended |
| `subtitle` | one-line subheading under the title | optional |
| `kicker` | small label above the title; `{n}` is replaced with the entry count | recommended |
| `footer` | HTML note shown in the page footer | optional |
| `itemNoun` | plural noun for entries, e.g. `"philosophers"` | recommended |
| `itemNounSingular` | singular noun, e.g. `"philosopher"` | recommended |
| `searchKeys` | entry keys the search box matches against | optional (falls back to `name`, `desc`, and filter keys) |
| `filters` | array of filter configs: `id`, `label`, `key`, `multiValue`, `options[]`, optional `glossary`, optional `grouping` | optional (omit for no filter UI) |
| `sorts` | array of `[id, label]` sort option pairs | optional |
| `defaultSort` | which sort `id` is active on load | optional (falls back to `"az"`) |
| `cardTags` | which entry keys render as tag chips on a card | optional |
| `yearKey` | the numeric year field name | optional (defaults to `"y"`; every topic so far uses `"y"`) |
| `timeline` | boolean, enables the timeline view for this topic | optional (default off) |
| `popularity` | boolean, enables popularity badges for this topic | optional (default off) |
| `timelineLaneFilterId` | which filter `id` groups timeline lanes | optional, only used when `timeline` is `true` |

### Entry keys

Every entry needs: `name`, `dates` (a display string), `y` (signed integer year — negative
means BCE), `desc`, and `url` (a source link, typically Wikipedia). Most entries should also
have `tldr`. Any other keys are topic-specific, referenced by your `filters`, `searchKeys`,
and `cardTags` config.

Keys prefixed with `_` (e.g. `_country_qids`) are pipeline internals and are never rendered.

### Minimal example

`data/example.json`:

```json
{
  "meta": {
    "title": "Example Topic",
    "subtitle": "A minimal two-entry topic",
    "kicker": "Example · {n} entries",
    "itemNoun": "entries",
    "itemNounSingular": "entry",
    "searchKeys": ["name", "desc"],
    "filters": [
      {
        "id": "field",
        "label": "Field",
        "key": "field",
        "multiValue": false,
        "options": ["Logic", "Ethics"]
      }
    ],
    "sorts": [["az", "Alphabetical"], ["old", "Chronological"]],
    "defaultSort": "az",
    "cardTags": [{ "id": "field" }],
    "yearKey": "y",
    "timeline": true,
    "popularity": false,
    "timelineLaneFilterId": "field"
  },
  "entries": [
    {
      "name": "Ada Lovelace",
      "dates": "1815–1852",
      "y": 1815,
      "desc": "Mathematician known for early work on Charles Babbage's Analytical Engine.",
      "url": "https://en.wikipedia.org/wiki/Ada_Lovelace",
      "tldr": "Wrote the first published algorithm intended for a machine.",
      "field": "Logic"
    },
    {
      "name": "Zeno of Citium",
      "dates": "c. 334 – c. 262 BCE",
      "y": -334,
      "desc": "Founder of Stoicism, a school of Hellenistic philosophy.",
      "url": "https://en.wikipedia.org/wiki/Zeno_of_Citium",
      "tldr": "Taught that virtue is the only true good.",
      "field": "Ethics"
    }
  ]
}
```

Then add `{ "id": "example", "kicker": "Example", "title": "Example Topic", "blurb": "A minimal two-entry topic.", "status": "live" }`
to `data/topics.json`, and `viewer.html?d=example` will render it.

## Stack

Static HTML/CSS/JS. No build step. Optional smoke test: `python3 tools/smoke_test.py` (requires Playwright).

## License

MIT
