# Design study 01: the map (one screen, every surface)

**Status: APPROVED 2026-09-14.** This study drove Phase 1's real build (`app/`) and is now historical — it stays in the repo as the record of *why* each decision below was made, but the study's own HTML/JS is no longer maintained; `app/index.html` is the live app. Two things the real build found that this mockup's own testing never caught, both fixed at the source (`plan.md` L1, `tasks.md` Phase 1): a search-ranking gap ("uk" → Ukraine, not United Kingdom) and a classic-script global-scope collision between `logic.js` and `app.js`. Neither changes anything described below — they're implementation bugs in code this study didn't have (logic.js didn't exist as a separate file until Phase 1), not design reversals.
**Open it:** double-click `index.html`. It reads `../../../app/countries.js` and `../../../app/geo.js`, so it works from `file://` with no server.

## What it demonstrates
Everything in product_spec §3/§6, on the **real** 1:50m geometry and the **real** 195 countries + 45 territories:

| Surface | Try |
|---|---|
| Map at rest: two colours plus the visited tone, dark chart-ink borders | Load it. Visited places paint in with a short stagger |
| Hover tooltip: a country, a territory (tagged), or one of the 6 still-inert areas | Hover Brazil (a country); hover Greenland ("Territory"); hover Antarctica's neighbor South Georgia ("Not among the 195") |
| Click → lift (scale 1.06 + shadow) → popover | Click Brazil → type `2018, 2024` → Enter. Click Puerto Rico — same interaction, popover says "Territory" |
| Save: fill transition + ripple + counter pop + undo toast | (as above) |
| Edit / remove | Click a visited country: years are prefilled; Remove → Undo |
| Combobox dropdown, territories tagged | Type `ind`, `uk`, `ivory`, `sao`, `congo`, `tai` (Taiwan, tagged "Territory") |
| Fly-to on choose | Choose India from the dropdown |
| Validation: inline message + shake | Country `Narnia` → Submit; years `20199` |
| Side panel + sortable table + total, territories tagged + counted separately | Click the `12 / 195` pill; visit a territory and reopen it — a second "+N territories visited" line appears |
| "About the counts" card | Click the "195 countries · 45 territories" pill, bottom right |
| Zoom / pan / reset; microstate dots (countries AND territories) | Wheel over Europe: San Marino, Vatican, Monaco are country dots; hover the tiny Caribbean cluster for territory dots (Saint Barthélemy, Sint Maarten, …) |
| Mobile | Narrow the window below 640 px: bottom-sheet bar, docked popover, full-screen panel |

**Study-only controls** (dashed box, bottom left): switch between all 5 palettes (Atlas is the default/chosen one), and clear or restore the real trip data. The map opens with the user's **real** trips (§ "Real trip data" below), not an illustrative sample.

## Palette round 2 (2026-09-13): five real "looks," not three near-identical ones
The first round's three options were all pale, low-saturation pastels — different hues, but close enough in lightness that side by side they read as "the same map, slightly tinted," not real alternatives. This round pushes real contrast into the water/land/visited relationship and spans soft → vibrant so you can tell what register you actually want:

| | Water | Land | Visited | Mood |
|---|---|---|---|---|
| **A · Sand & Sea** | `#A9CFDD` | `#F1E0C3` | `#C2603C` | The brief's original pairing, kept soft — but with the lightness gap the first round was missing |
| **B · Coastal** | `#4FAFC4` | `#F6E4BE` | `#E4602A` | Vibrant teal water, warm cream land, punchy coral-orange |
| **C · Atlas** | `#7C99B4` | `#E9DCC3` | `#9C3826` | Deeper, more editorial — a working nautical-chart feel |
| **D · Jewel** | `#33678F` | `#EDE2CB` | `#B23A44` | The most saturated/rich: sapphire water, garnet visited |
| **E · Tropic** | `#4FD1E0` | `#FFEAC2` | `#FF5A3C` | The most vibrant and playful: bright turquoise + coral |

Switch between all five live in the study (bottom-left box). One real fix this needed: the wordmark ("TravelMap") used to sit directly on the water with no background. That was invisible math for the pale palettes but genuinely failed contrast for C and D's deeper water (ink-on-water dropped to 4.15:1 and 2.04:1 against the required 4.5). Fixed by giving it the same glass pill the counter already has — solves it for every palette at once rather than tuning text color per option.

## Decisions taken while building it (for you to confirm or overturn)
1. **Map detail: KEEP = 0.5** (half the 1:50m vertices). Rendered side by side with 1.0, 0.35, and 0.25 at world, Europe, Caribbean, and SE-Asia zoom. 0.5 can't be told apart from full detail even zoomed into Europe, and it's 297 KB instead of 540 KB (88 KB gzip). At 0.25 the coastlines turn visibly angular, and small islands disappear at 0.35.
2. **No country labels on the map.** Names appear on hover, in the dropdown, and in the popover. Printed labels (as in both reference images) would clutter the two-colour look and collide everywhere in Europe and the Caribbean.
3. **Dots** for the 33 countries too small to click (projected area < 6 units², plus Tuvalu).
4. **The Submit button is dark ink, not the visited colour.** White text on any of the three visited tones fails WCAG AA contrast (measured 2.8 / 2.2 / 3.0 : 1 for A / B / C, against the 4.5 required). Ink stays legible and doesn't compete with the map.
5. **Submit replaces rather than merges.** An already-visited country shows its current years in the field, so what you see is what gets saved.
6. **Toast at top centre.** First render had it above the entry bar, where it collided with the dropdown and the error message (caught in the screenshot review, fixed before delivery).

## Round 3 (2026-09-13): everything from your feedback

**Colour — Atlas, locked, with darker borders.** You picked Atlas and asked for borders "in a clearer way… a slightly darker colour rather than white." Tested several dark warm tones against Atlas's actual water (`#7C99B4`) and land (`#E9DCC3`) rather than eyeballing one — `#3F3529` won on contrast against *both* (4.04:1 / 8.84:1; every other candidate traded one for the other). Every palette now carries its own `--border-line` token, so this was a real per-palette choice, not a global override — the other four keep translucent white, which already had good contrast against their paler water.

**Territories — 45 of them, real and clickable, kept out of "of 195."** You said the 195 list was "a reference point, not authoritative" and to add anything missing. Rather than hand-picking names, I applied one rule to every one of the ~50 non-country areas Natural Earth actually draws: **real ISO 3166-1 code (or Kosovo's unofficial XKX) + real permanent population + geometry that exists at this detail level.** 45 pass, including Svalbard and Jan Mayen — see round 4 below for that one, since I got it wrong the first time round (full list in `product_spec.md` §5.2); 6 fail on "no permanent population" (Ashmore & Cartier, British Indian Ocean Territory, French Southern Lands, Heard & McDonald Islands, Siachen Glacier, and South Georgia — the last one a genuine borderline call, ~30 rotating staff, no permanent residents, flagged rather than assumed).

Two real bugs surfaced while building this, both explained in full in `plan.md` §2 and `tasks.md` T2a: three real places (Saint Barthélemy, Pitcairn, Norfolk Island) were silently vanishing at this map's detail level because the old "just draw inert land" path had no small-feature fallback; and Sint Eustatius/Saba were being mis-attributed into *Guadeloupe's* shape because one nearest-point anchor doesn't work when a single territory's population is split across two distant island clusters.

Territories behave exactly like a country everywhere (search, click, popover, save, table row) but are tagged "Territory," and a new bottom-right pill ("195 countries · 45 territories," click to expand) states the official-vs-shown distinction directly — this is what you asked to see "somewhere in the right bottom corner."

**Name — Nomad Travel Map.** Applied as the wordmark and `<title>`; the project folder and files stay `TravelMap` (ASCII, dev-facing), the same split Pāntha uses between its Sanskrit display name and its `TravelPlanningApp` folder. Some other directions with "nomad" or a synonym, if you want to reconsider: **Nomad Atlas** (ties neatly to the palette name you picked), **Wayfarer** (a classic synonym, one word), **Roam** (short, modern), **Nomad's Log**.

**Real trip data.** The study's demo data was, at the time, no longer an illustrative sample — it was pieced together from your real booking archive (filenames only — no document content opened) and Pāntha's completed Peru trip. Full methodology and two flagged judgment calls in `product_spec.md` §5.4 — summary below. **Scrubbed 2026-09-14** ahead of making this repo public for GitHub Pages: the specific countries/years and the archive's file path have been replaced with fictional example data (`docs/design-studies/01-map/index.html`'s `SAMPLE`); this paragraph keeps the methodology on record without the personal specifics.

## Round 4 (2026-09-13, same day): India, Germany, and the real Svalbard story

**India: yes, tracked** — added conceptually, but the year(s) are a real open input, not a guess: nothing in the booking archive marks a "first visit" (it predates every record there), so I asked rather than picked a placeholder. **What year(s) should I use?**

**Germany: no, a day-trip doesn't count** — removed from the sample data. Checked whether any of the other 11 rested on similarly thin evidence before just removing the one flagged entry: no, everything else is a real multi-day stay (hostel bookings, multi-city itineraries, a visa, a real residence-length stretch), so nothing else needed re-examining under the same rule.

**Svalbard: not actually a gap — I was wrong the first time, and checked properly this time.** Asked what the gap was, and reverifying the raw data to answer that honestly turned up that Svalbard's coastline *is* in the map data — fused into Norway's outline, the same way French Guiana used to be fused into France, just never split out. Splitting it needed its own rule rather than reusing the existing French/Dutch one: Norway's own mainland reaches so far north (Nordkapp, 71.17°N) that a plain "nearest anchor point" split would have pulled real Norwegian territory toward Svalbard's location. Checked against every real polygon centroid instead of assumed — `longitude < 0° OR latitude > 72.5°` cleanly separates the two, with a genuine gap on both sides. It's now its own real, clickable territory (`SJM`, "Svalbard and Jan Mayen"), taking the count to **45**.

**A second, unrelated real bug, found while verifying the Svalbard fix:** zooming in past the map's zoom cap near the very top edge made the view drift steadily south, tick after tick, ending up thousands of kilometres away — reproduced with a tick-by-tick log before touching any code. Root cause: the zoom math computed where to re-center using the *requested* (over-the-cap) size, while the clamp then silently substituted a different, smaller size — the two disagreed by a small amount every tick, and it compounded. Fixed by clamping before computing the offset, verified the same way (the log now shows the view holding perfectly still once it hits the cap).

## Round 5 (2026-09-13, same day): Visited · Lived · Home

You asked how to handle a home country and a country of residence — whether that needs a "Countries Lived" input. **My recommendation, now built into the study so you can judge it rather than picture it: make it a status label on a place, not a second list.**

Three chips in a place's popover: **Visited** (default, unchanged) · **Lived** · **Home**. The reasoning, in the order it actually matters:

1. **A second list would double-enter the interesting cases.** Canada is both — you visited in 2014–2016 and live there now. In a separate "lived" list it appears twice with no relationship between the entries; as a label it's one place whose years tell the whole story.
2. **Status is a label, never a filter — all three still count toward "of 195."** A travel map that excluded where you're from would read as a bug, not a statement. India counts like anywhere else; it just carries a Home tag.
3. **Years keep exactly one meaning** (years you were there), so there's no new input and no new format. Required for Visited and Lived, optional for Home — because there is no "year you visited" the country you're from. That's what dissolved the India-year question rather than answering it.
4. **There is deliberately no "Resident" or "Currently living" status.** It would go stale the day you move, silently, and nothing would prompt you to fix it. Years that run to the present already say "I'm there now" and can't rot — a country of residence reading years-through-today + Lived says it precisely.
5. **On the map: a small ink glyph, not new fill colours** — a ring for Lived, a filled ring for Home, at the place's centre. Two more fills would wreck the two-colours-plus-visited discipline the whole palette rests on; a glyph reads instantly, stays the same size at any zoom, and disappears entirely if you never use the feature.
6. **In the table:** a tag beside the name, and "—" under *# Times*, since a count of years-present isn't a count of trips.

The entry bar still has exactly two text boxes and Submit (your original hard constraint) — status lives in the popover, which already had a Remove button, so it was already more than a years field.

**Your data now:** India = Home (no years), Canada = Lived (2014–2016 visits, then 2023–2026), everything else Visited.

## Round 6 (2026-09-13, same day): Equal Earth, and the USA as Lived

**Projection is now Equal Earth**, as asked. One correction worth stating plainly, since it changes what the switch bought: **the map was never Mercator.** It was Natural Earth 1 — a *compromise* projection, which distorts far less than Mercator but still isn't equal-area. So this wasn't a rescue from Mercator's famous distortion; it's a move from "gentle compromise" to "areas are literally true," which for this map is the better principle anyway: the whole point is comparing where you've been, and that comparison should be honest.

Measured on the real geometry, Greenland ÷ DR Congo drawn area (true ratio **0.92**):

| Projection | Drawn ratio |
|---|---|
| **Equal Earth** (now) | **0.92** ✅ |
| Natural Earth 1 (before) | 1.96 — Greenland ~2× too big |
| Mercator (never used here) | 15.00 |

Nothing else needed changing: the 11°E centre still keeps Chukotka and Fiji whole, the viewBox stayed 1000 × 462, and `geo.js` actually got marginally *smaller* (297 KB). All 6 data tests still pass, and the map re-verified clean at desktop and at a Europe-level zoom.

**One entry is now `Lived`** — you confirmed the residency read (specific country scrubbed 2026-09-14 ahead of going public). Your map shows all three status glyphs: a Home country, and two Lived countries.

## Round 7 (2026-09-13, same day): saving a map — the link *is* the map

You asked for a unique URL per map, the option to email it to yourself, clicking it later to update, and no orphaned data if a map is never claimed. The obvious way to build that is a server: mint a token, store the map, send mail, expire unclaimed rows. That means a backend, a database, an email provider, hosting, and a permanent maintenance and privacy burden — against a brief whose first line is that this should cost almost nothing to run.

**So I checked the alternative before building anything: put the whole map in the URL.** Your real map encodes to **104 characters**. A hypothetical you with 100 countries × 3 years each is ~1,000 — still inside the ~2,000 browsers and mail clients handle comfortably. It fits, easily.

| What you asked for | How it works with no server |
|---|---|
| A unique URL as soon as you enter a country | The URL rewrites on every change — a different map *is* a different URL |
| Email it to your own address | `mailto:` hands the link to your mail app. No mail service, no address stored, nothing routed through anyone |
| Click it later to update | Opening the link rebuilds the map exactly — any browser, any device, no account |
| No email → nothing left behind | **Stronger than you asked:** nothing is ever stored off your machine, so there's nothing to expire. The cleanup rule isn't skipped, it's unnecessary |

Verified end to end, including the part that matters most: **opening the link in a completely fresh browser with no stored data restored all 13 places, with statuses and years intact.**

**What this doesn't give you, honestly:** the link is ~100–1,000 characters, not a short token; and there's no sync — edit on your phone and you get a new link, so an older link on your laptop shows the older map. A backend would fix both. Say the word if those matter more than the running cost, and I'll scope the server version properly rather than half-doing it.

**One hosting note:** still no server-side code, but for an emailed link to open on another device the app should sit on **static hosting** (GitHub Pages, Cloudflare Pages, Netlify — free). Static hosting isn't a backend: no database, no runtime, nothing to patch.

**Clear map** is in, right beside **Email me this map** in the panel footer. It wipes everything and resets the URL — with a 5-second Undo instead of a confirm dialog, since one click to undo beats one click to confirm.

## Round 8 (2026-09-13, same day): building for others later, without building it now

You said you're building this for yourself but want others to use it eventually, and asked whether to change the architecture now. **My recommendation: don't — and here's the measurement behind that, not just an opinion.**

**Other people can already use it.** There are no accounts, so anyone who opens the hosted link gets their own map, in their own browser, in their own link. That part needs nothing built. What's missing is *accounts and sync* — a narrower question than "multi-user."

**The retrofit is genuinely small.** The whole app touches storage in **one object with two methods**, and the data model (`{code: {y, s}}`) is byte-identical whether there's a server or not. Adding accounts means writing a remote adapter behind that seam — roughly a day against a Supabase/Firebase free tier — while the map, table, search, status model, geometry, and palette stay untouched.

**What building it now would actually cost:** a database and auth to run and patch for a user base of one; a privacy policy and a deletion path for other people's travel history; and a guess at which product this becomes — private maps, shared/comparable maps, and public profiles are three different builds, and nothing yet tells you which one you want.

**So: three cheap hedges instead of a rewrite** (plan.md L13):
1. **The `Store` seam** — done this round. All persistence goes through `Store.load()` / `Store.save()`, with a comment saying exactly that a remote adapter drops in there. This is the concrete price of deferring, and it's now paid.
2. **Host on Cloudflare Pages or Netlify, not GitHub Pages.** All free, all serve static files identically — but the first two can add serverless functions on the same domain later. Costs nothing to choose well now.
3. **Keep the blob versioned and portable** (`{v:1, visits}` — already true), so migrating existing maps to a server is an upload, not a conversion.

**And a written trigger, so this is a decision rather than a drift:** revisit when someone other than you asks for sync, or loses a map, or more than a handful of people are using it regularly.

**One real durability gap, found while thinking this through.** Safari deletes localStorage after **7 days of not visiting a site** — precisely the usage pattern of an app you touch a few times a year. So manual save-by-link could fail silently. **Fixed this round:** the footer now says *not saved yet* / *saved, link up to date* / *changed since you last saved* (the last two in red), verified in all three states. **Still to do (B11):** make it installable as a PWA — home-screen web apps are exempt from that deletion, which is the actual fix rather than a warning about it.

## Open questions (unaffected by approval — still real, still yours to decide)
- **Q11:** worth a fourth status for airport-only transits (that 2024 London layover), so they're recorded without counting? I'd say no — three is the useful minimum — but it's easy to add.
- **Q13:** superseded by L13 — the backend question now has a written trigger rather than an open answer.
- Anything about the territories list, the border colour, or the corner card you'd change?
- Anything about layout, motion, or density you'd change?

## Review log
- 2026-09-13, self-review from headless screenshots (desktop 1440×900, mobile 390×844). Fixed before delivery: toast overlapping the dropdown and error; a selected but not-yet-visited country was hard to see (now land-hi fill + stronger shadow); the tooltip stayed up after a click; the table's continent column wrapped ("South / America"). Panel widened 440 → 480 px.
- 2026-09-13, second render. Three more fixes:
  - **Mobile started as a thin strip of world in an empty screen.** A phone in portrait now opens zoomed (~3×) so the map fills the space between the header and the bottom sheet, centred on Europe/Africa. Pinch out for the whole world, and ⟲ returns to this starting view.
  - **Table:** the visited dot is now absolutely positioned, so long names wrap cleanly beside it (no more "● / Morocco"). Tighter cell padding on mobile.
  - **Accessibility:** the closed popover and panel were invisible but their inputs were still reachable with Tab. Both are now `inert` while closed; verified that nothing inside the closed popover is focusable.
  - **Contrast:** muted text `#6F7E89` measured 4.18:1 on white and 3.21:1 on the water, failing AA. It's now `#55636E`: 6.18 on white, ≥ 4.70 on all three water tones. *Known exception, for you to rule on:* input placeholders are `#7D8A95` (3.5:1). They're hints under an always-visible label; darkening them to 4.5:1 makes them easy to mistake for typed text.
- 2026-09-13, round 3 (territories + borders + name + real data). Verified with headless screenshots at desktop 1440×900 and mobile 390×844 across 7 + 3 states (initial, zoomed-in border close-up, a territory's popover, the dropdown's territory tag, the table with real data, the table after visiting a territory, the "about" card, plus the mobile equivalents) — zero console errors, zero page errors, zero external requests in every state. One thing double-checked explicitly rather than assumed: visiting a territory (Puerto Rico) left the header pill at its prior value, confirming the official-count/territory-count separation actually holds at runtime, not just in the code's intent.
- 2026-09-13, round 4 (India/Germany/Svalbard). Re-checking the Svalbard claim surfaced the zoom-drift bug (above) via a real reproduction, not a hunch: zoomed a headless browser in on Svalbard's actual anchor point (`GEO.a.SJM`, projected to screen coordinates via the SVG's own CTM — not a bounding-box guess, which for a multi-island shape can land in open water between islands) and logged the viewBox after every wheel tick. First run showed it sliding steadily south past the zoom cap, ending near the Falklands after 11 ticks; fixed, then the exact same log showed the view holding at a fixed point once clamped. Popover confirmed by text content, not just a screenshot: `"Svalbard and Jan Mayen | Europe · Territory · not visited yet"`. Mainland Norway's coastline re-inspected after the split — intact, no visible gap where Svalbard used to be fused in (expected, since the split only reorganizes which named feature the far-north polygons belong to, never removes them from the map).
