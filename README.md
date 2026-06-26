# The Index

A multi-topic browsable reference. A landing page (`index.html`) links to topics,
each rendered by one shared, data-agnostic viewer (`viewer.html?d=<topic>`):

- **Philosophers** (`?d=phil`) — browse, filter, and sort 317 philosophers by
  field, tradition, era, and popularity.
- **Historical Events** (`?d=hist-events`) and **Historical Figures**
  (`?d=hist-chars`) — placeholder topics, populated later.

**Live:** https://andreasnonslid.github.io/phil/

## How it works

Each topic is a single JSON file under `data/` shaped as `{ "meta": …, "entries": [ … ] }`.
The `meta` block is the topic's config: title/subtitle/kicker, its filters and
filter-explanation glossaries, sort options, and flavour text. The viewer reads
the `?d=` URL param, fetches `data/<topic>.json`, and builds the whole UI from
that config — so topics can differ (number of filters, glossaries, text) while
sharing one engine.

## Stack

Static HTML/CSS/JS. No build step.

## License

MIT
