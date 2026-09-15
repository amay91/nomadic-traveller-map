# Nomadic Traveller Map

A personal map of every country you've been to, and when.

Click a country (or type its name) to record the years you were there and whether you **visited**, **lived** there, or call it **home**. The map fills in, the count ticks up, and a side panel keeps the whole list sortable. 195 countries plus 45 territories, the territories tracked separately so they never inflate the official count.

**Live: [amay91.github.io/nomadic-traveller-map](https://amay91.github.io/nomadic-traveller-map/)**

---

## What makes it unusual

**There is no server, no database, and no account.** Your map is encoded directly into the page URL — a real map of 13 countries is about 104 characters. Bookmark the link and you've saved your map; email it to yourself and you've backed it up; open it on another device and it's there. Nothing is ever stored anywhere you don't control.

**It's also a single static page with zero runtime dependencies.** No framework, no bundler, no build step — the deploy workflow copies `app/` to GitHub Pages exactly as it sits in the repo. All the hand-written code is about 61 KB.

**It works offline and installs like an app.** A service worker caches the shell (network-first, so you always get the current version when online), and the manifest makes it installable to a phone home screen.

## Features

- Two inputs and a Submit button — that's the whole entry surface. Or click any country directly.
- **Visited / Lived / Home** status per place, marked with a small glyph rather than extra colours.
- **Year periods for Lived/Home** — `2011-2014`, or `2023-` for ongoing, which reads back as "2023–present".
- **Map labels** that switch between three-letter codes and full country names as you zoom, sized dynamically so they stay readable at every zoom level.
- Pinch/scroll zoom, pan, fly-to on selection, press-and-hold to peek a country name on touch.
- Sortable table with per-continent totals, plus Export / Import as JSON.
- Undo on every destructive action, including Clear map.
- Designed for phones as a first-class target, not as a shrunk desktop layout.

## Running it locally

No install, no dependencies:

```bash
python -m http.server 5180
```

Then open `http://localhost:5180/app/`. A real `http://` origin is needed only for the service worker and PWA install — everything else works from a double-clicked file.

To run the tests:

```bash
node --test tests/*.test.mjs
```

## The single-file build

`nomadic-traveller-map.html` is the entire app — markup, styles, scripts, geometry and icons — inlined into one ~400 KB file with zero external references. Copy it anywhere and open it; it works with no network and no setup. It exists because opening a multi-file app from a phone's Downloads folder doesn't work: Android hands the browser a `content://` URI with no directory, so every relative path resolves to nothing.

Regenerate it with `node tools/build-single.mjs`.

## Project docs

This repo carries its full design history, not just the code:

| File | What's in it |
|---|---|
| [`product_spec.md`](product_spec.md) | What the product is and why, plus the quality bar |
| [`plan.md`](plan.md) | Locked architectural decisions and how it's built |
| [`tasks.md`](tasks.md) | Status — the source of truth — with every task's acceptance criterion |
| [`handoff.md`](handoff.md) | Read first if you're picking this up cold; gotchas worth knowing |
| [`docs/design-studies/01-map/`](docs/design-studies/01-map/) | The nine-round interactive design study the build came from |

## How it's built

Vanilla HTML, CSS and JavaScript, as classic `<script>` tags rather than ES modules — modules and `fetch` both fail on `file://`, and opening by double-click was a requirement.

Geometry is pre-projected at development time rather than at runtime: [`tools/build-geo.mjs`](tools/build-geo.mjs) takes Natural Earth's 1:50m data (via `world-atlas`), projects it with d3-geo's **Equal Earth** projection, simplifies it, and writes plain SVG path strings to `app/geo.js`. Equal-area matters here — a map built to compare where you've been shouldn't exaggerate the countries nearest the poles.

The country list follows Worldometers' 195, with UN M49 continents split into North and South America.

## Credits

Map data from [Natural Earth](https://www.naturalearthdata.com/) (public domain) via [world-atlas](https://github.com/topojson/world-atlas), projected with [d3-geo](https://github.com/d3/d3-geo). Both are development-time dependencies only — nothing is loaded at runtime.
