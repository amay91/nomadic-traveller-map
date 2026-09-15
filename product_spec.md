# Product Specification: Nomadic Traveller Map
### A personal map of every country you've been to, and when

**Date:** 2026-09-14
**Author / Product Owner:** Amay Narayan
**Version:** **1.0.0 — signed off by the owner 2026-09-14.** Phases 0–2 are all complete and verified: the 9-round design study, the build (B1–B11), and the full polish/verify pass (V1 accessibility, V2/V2a/V2b mobile, V3 size + performance, V4 six rounds of real-use inspection producing nine findings — year periods for Lived/Home (F21), map labels and their three refinement rounds (F22), a mobile dropdown-rendering bug, a broken save-by-link on the single-file build (§4.5), and a stale cache-first service worker that had been silently serving a frozen app). Full detail in `tasks.md`.
**Status:** **Done and in active use.** `app/` is the real, running app. 26/26 automated tests pass. Size: 68.8 KB of an 80 KB code-excluding-comments budget (§4.1). **Live at https://amay91.github.io/nomadic-traveller-map/ since 2026-09-15** (`plan.md` §6, `tasks.md` Phase 3). Phase 3 is complete apart from D5, an optional custom domain.
**Not claimed at 1.0, stated rather than buried:** performance is verified against Chrome's 4× CPU-throttle proxy, **not a physical phone** (§4.1), and B11's claim that an installed PWA is exempt from iOS's 7-day storage eviction has never been verified. Neither blocked sign-off; neither should be read as measured.

> **Document hierarchy**
> - **`product_spec.md` (this file)**: *what* the product is and *why*, plus the quality bar.
> - **`plan.md`**: *how*. Locked decisions (§0), stack, file layout, the geometry pipeline, sequencing.
> - **`tasks.md`**: numbered tasks with acceptance criteria. **The** source of truth for status.
> - **`handoff.md`**: session bootstrap for the next session.
> - **`docs/design-studies/`**: every mockup, archived with its decisions.

---

## 1. Summary and objectives

### 1.1 What it is
A **single-screen, clickable world map** that records which countries the user has visited and in which years. Each visited country is filled with a colour, so over time the map becomes a picture of the user's travel life. There's one sibling view: a table of every visited country, with a count out of the 195.

It is deliberately *not* Pāntha. Pāntha plans trips that are coming up. This app remembers trips that have happened. It's small, quiet, and pleasant to open.

### 1.2 Objectives
| # | Objective | Measured by |
|---|---|---|
| O1 | Record a visit in under 10 seconds, by typing or by clicking | Journey J1/J2 timed in the design study |
| O2 | **Lightweight to run and to maintain** | §4.1 budgets: zero runtime dependencies, no build step, no server, tiny payload |
| O3 | **Design as a first-class requirement.** Modern minimalism, a two-colour map, motion that feels polished and a little playful | Design-study approval (L4); the §6 motion spec is followed exactly |
| O4 | Correct geography: the 195 countries, the right continents, every country clickable | `tests/data.test.mjs` (count, continent totals, alias uniqueness, geometry coverage) |
| O5 | The user's data never leaves their device, and they can always get it back out | localStorage + JSON export/import (F9) |

### 1.3 Non-goals
Trip planning, itineraries, and bookings (that's Pāntha). Cities, regions, or states. Photos and notes. Accounts, sync, sharing, social features. Map tiles, satellite imagery, or street-level zoom. Analytics of any kind. See §8.

---

## 2. User and core journeys

**Persona:** one person, a frequent traveller, recording ~20–80 countries across decades. **Uses desktop and phone both, and expects the same quality from each** (owner's directive, 2026-09-14 — this line previously read "desktop most of the time and a phone occasionally," which quietly licensed every mobile shortcut in §6.4 and V2; see §4.7).

| # | Journey | Steps |
|---|---|---|
| J1 | **Type to add** | Focus **Country**, type "jap" → dropdown filters to *Japan* → Enter/click selects it and the map flies to Japan → type "2019, 2023" in **Year(s) visited** → **Submit** → Japan fills with the visited colour, a ripple plays, the counter ticks 11 → 12 |
| J2 | **Click to add** | Click Japan on the map → it lifts and enlarges slightly → a popover opens beside it with a Year(s) field (focused) → type → Submit (or Enter) → same fill/ripple/counter |
| J3 | **Edit or remove** | Click a visited country (or its table row) → the popover opens with its years prefilled → edit and Submit, or **Remove** → an *Undo* toast appears for 5 s |
| J4 | **Review** | Click the counter / list button → the side panel slides in → table sorted A–Z, columns sortable → footer shows "**12** of 195 countries · 6%" |
| J5 | **Explore small places** | Scroll-wheel or pinch to zoom, drag to pan. Microstates and small island nations show as dots that are always clickable |

---

## 3. Functional requirements

MoSCoW: **M** must, **S** should, **C** could.

| # | Requirement | Pri |
|---|---|---|
| F1 | **World map.** High-definition vector map (Natural Earth 1:50m data, **Equal Earth projection** — equal-area, so country sizes are proportionally true; Antarctica omitted). Two colours at rest: soft blue water and one complementary land colour. Hairline borders in a colour distinct from both — not necessarily white; the chosen palette (Atlas, §6.2) uses a dark "chart-ink" tone, chosen specifically for clarity, over the softer translucent-white tried first. | M |
| F2 | **Country entry (combobox).** Text box labelled *Country*. As the user types, a dropdown lists matching countries: case- and accent-insensitive, matching the start of any word in the name or an alias (*"ivory"* → Côte d'Ivoire, *"uk"* → United Kingdom, *"burma"* → Myanmar). Prefix matches rank above substring matches. Arrow keys, Enter, and Esc work. Submit is refused for anything that isn't one of the 195, and an inline message says why. | M |
| F3 | **Year(s) entry.** Text box labelled *Year(s) visited*. Accepts one or more four-digit years separated by commas (spaces and semicolons are tolerated). Each year must fall between 1900 and the current year. Order doesn't matter; the app stores years sorted. A repeated year counts as a second visit that year. Invalid tokens are named in the error ("'20199' isn't a year"). | M |
| F4 | **Submit.** Validates both fields, saves, and animates the country from land to visited (§6.3). If the country is already recorded, the Years field shows the existing years before submission, so Submit *replaces* the list. The user sees exactly what will be saved, and nothing is merged silently. | M |
| F5 | **Click a country.** Hovering shows a name tooltip. Clicking lifts and enlarges the country (~6%, with a soft shadow) and opens a popover anchored to it: name, continent, Year(s) field, Submit, and Remove (if visited). Esc, clicking outside, or clicking another country closes or switches it. | M |
| F6 | **Visited colour.** Visited countries render in a third, deeper tone from the same palette family. The change is animated (§6.3). | M |
| F7 | **Side panel + table.** Opened by a small menu button that also shows the running count. Columns: **Country · Year(s) visited · # of times visited · Continent**. Sortable by any column. A visited territory carries a small "Territory" tag next to its name. The footer shows the total: "*N* of 195 countries · *p*%", plus, only if any are visited, "*· +T territories visited*" — the header pill and this line both count official countries only (F12 territories are tracked, never folded into "of 195"). Clicking a row flies the map to that country and opens its popover. | M |
| F8 | **Small-place dots.** Anywhere too small to click (projected area < 6 units², plus Tuvalu, below the 1:50m resolution) gets a small circular hit target instead of a shape: 33 among the 195, 36 among the territories (F12) — 69 in total. Dots follow the same land/visited colours. | M |
| F9 | **Persistence and backup.** Every change saves to `localStorage` immediately. The panel footer offers **Export** (downloads `travelmap-YYYY-MM-DD.json`) and **Import** (validates, then replaces). | S |
| F17 | **The map is the link.** Every change re-encodes the whole map into the URL fragment (`#m=…`) via `replaceState`, so the address bar always holds a complete, shareable copy of the map. Opening that URL anywhere — any browser, any device, no account — restores it exactly. **Email me this map** opens the user's own mail client via `mailto:` with the link pre-filled; **Clear map** wipes everything with an Undo. Encoding: 3-letter code + optional status mark + 2 base-36 chars per year (offset from 1900), or a period wrapped in `~…~` (F21). The user's real map is **104 characters**; 100 countries × 3 years is ~1,000, inside the ~2,000 browsers and mail clients handle comfortably. Decoding rejects any code that isn't a known place, so a mangled link can't invent entries. **This keeps G1/G2/G3 intact — no server, no database, no account, no email address ever leaving the user's machine** (§4.5). **Real-use finding, 2026-09-14:** the mailto body used to embed `location.href` unconditionally, which is meaningless on a `content://` URI (what Android hands a downloaded file when opened from Downloads — the normal path for every phone user of the single-file build, not an edge case). Fixed in §4.5 below. | M |
| F19 | **Save-state indicator.** The panel footer says which of three states the map is in: *not saved yet* · *saved, link up to date* · *changed since you last saved* (the last two in the error colour). Manual saving only works if the app says when the kept copy is stale — otherwise the failure is silent. This matters specifically because **Safari deletes localStorage after 7 days of not visiting a site**, so "it's still in the browser" is not a durability guarantee for an app used a few times a year. | M |
| F20 | **Installable (PWA).** A web-app manifest and a minimal service worker, so the map can be added to a home screen. Beyond offline use, this is the concrete fix for the Safari eviction above: home-screen web apps are **exempt** from the 7-day deletion. | S |
| F18 | **Clear map.** Beside the email button in the panel footer. Wipes all entries, resets the URL, and shows the standard 5-second Undo toast rather than a confirm dialog — one click to undo beats one click to confirm. | M |
| F10 | **Zoom and pan.** Wheel / pinch / drag / double-click to zoom, 1×–12×. Choosing a country from the dropdown or table flies there. A small ⟲ reset appears whenever the map is zoomed. | S |
| F11 | **Undo.** Every add, edit, or remove shows a toast with *Undo* for 5 s. | S |
| F12 | **Territories are clickable and trackable, kept separate from "of 195."** 45 real, inhabited, non-sovereign places (Greenland, Taiwan, Hong Kong, Puerto Rico, French Guiana, …) — full list and inclusion rule in §5.2 — behave exactly like a country (hover, click, popover, save, undo, search, table row) but are tagged "Territory" everywhere they appear, and never count toward the header pill or "of 195." A handful of remaining non-country areas (Ashmore & Cartier Is., British Indian Ocean Territory, French Southern Lands, Heard & McDonald Is., Siachen Glacier, South Georgia — none with a real permanent population) stay drawn as inert land, tooltip "Not among the 195," not clickable. | M |
| F16 | **Status: Visited · Lived · Home.** Every recorded place carries one of three statuses, set by three chips in its popover (so the main screen still has exactly two text inputs, G4). *Visited* is the default and current behaviour. *Lived* is anywhere resided at some point. *Home* is where you're from. **Status is a label, never a filter:** all three count toward "of 195" identically — a travel map that left out where you're from would read as a bug, not a statement. Years mean the same thing in all three (years you were there), so there's no second input and no new format; years are required for Visited/Lived and optional for Home. On the map, Lived and Home are marked with a small ink glyph at the place's centre (a ring, and a filled ring) — **not** a fourth and fifth fill colour, so the palette stays water + land + visited. In the table they appear as a tag beside the name, and "# times" shows "—", since a count of years-present isn't a count of trips. **There is deliberately no "currently resident" status**: it would silently go stale the day you move, whereas years that run to the present already say it and can't rot. | M |
| F23 | **Save and Clear live on the map** *(moved out of the side panel 2026-09-15)*. **Clear map** sits immediately left of the entry bar, **Save / email map** immediately right of Submit. They were in the panel footer, one menu click away — wrong for an app where the map *is* the link, since an unsaved map is a lost one and the action that prevents that shouldn't need finding. Both are quieter than Submit (occasional actions, and Clear is destructive even with Undo). The Save button also carries the saved-state signal: it outlines itself when there's unsaved work, so the state shows where the action is rather than only in a sentence inside the panel. On a phone they flank at 112px from the bottom — above the zoom column, which is 88px tall — with shortened labels, and they stand down when a bottom sheet owns the screen. Between 641–900px they sit on a row above the bar, since flanking would squeeze it below a usable width. | M |
| F24 | **The app explains itself, in two places** *(added 2026-09-15)*. The wordmark carries its own one-line description — "A personal map of every country you've been to, and when." — shown on hover, on keyboard focus, and **on tap**, since a phone has no hover state and the sentence must still be reachable there. It is a real element, not a `title` attribute: native tooltips are slow, unstyleable, and never appear on touch at all. Escape dismisses it, per WAI-ARIA. Separately, the side panel gains a collapsed **"About this map"** section explaining what the app records, that the URL *is* the map (no account, no server, nothing leaving the device), that it works offline, why the projection is equal-area, and how the 45 territories stay out of the count of 195. Collapsed by default, because the panel's job is the table. | S |
| F25 | **The status picker is on the entry bar too** *(added 2026-09-15, owner: "a major gap")*. F16's Visited / Lived / Home control existed only in the map-click popover, so **typing a country could only ever record a Visit** — Lived and Home were unreachable by keyboard, and J1 and J2 were not the equivalent paths §2 presents them as. The entry bar now carries the same control, driving the same label and placeholder changes ("Year(s) lived there", the period hint). **This does not breach the brief's "two text inputs and one Submit button"** — a segmented toggle is neither — but it is a deliberate addition to the entry surface and is recorded as such rather than slipped in. Choosing a country preselects the status it already has, so the picker can never silently demote an existing Home; changing it is a deliberate act. | M |
| F15 | **"About the counts" corner card.** A small pill, bottom-right, reading "195 countries · 45 territories." Click to expand a two-line explanation: 195 is the official UN/Worldometers count (what the header pill tracks); the extra territories are shown and trackable but kept separate. Directly answers "what's shown vs. what's official." | M |
| F13 | Per-continent progress in the panel (e.g. *Europe 9/44*). | C |
| F14 | Dark theme. | C |
| F21 | **Periods, for Lived and Home** *(added 2026-09-14, real-use feedback: "UK 2011-2014", "Canada 2023- (to present)")*. Extends F16 rather than replacing it: Visited stays plain years (discrete trips), but Lived/Home also accept a period — "2011-2014" (closed) or "2023-" (open, still ongoing) — since a residency is a genuinely continuous stretch, not a list of separate visits. Read back as "2011–2014" / "2023–present"; an ongoing period always sorts as the most recent in the table, ahead of even a later closed year. A period typed while Visited is selected is rejected — that combination isn't coherent the way it is for Lived/Home. | M |
| F22 | **Country/territory name labels on the map** *(added 2026-09-14, round 1; contrast fixed round 2; name/code fallback + small caps added round 3, same day)*. A small label at the centre of every tracked place (the 240 — not the 6 inert areas), revealed only once that place is large enough on screen to read: a big country shows its name even at world view, a small one needs real zoom, and the very smallest (Vatican, San Marino, Monaco…) reveal by zoom level once a width-based rule alone could never reach them. Labels never intercept a click, hover, or tap meant for the map underneath. **Round 2** ("I don't see the country labels"): legibility had been checked at full-strength colour, but labels render at reduced opacity, and the *blended* contrast that actually reaches the eye was under the 4.5 minimum at the original opacity — raised to 6.8:1/6.0:1 rendered, legible at a glance rather than just under close inspection. **Round 3** ("if a label spills outside its border, use the ISO code; names and codes in small caps; confirm both platforms"): each label's rendered width is measured once at boot and compared against its place's own on-screen extent every frame, swapping to the lowercase ISO code the instant the full name would overflow (a dot-marker place has no real outline to spill out of, so it always shows its full name); both forms render in small caps by storing the source text lowercase, since `font-variant:small-caps` only touches lowercase letters. Two real platform-specific bugs surfaced and fixed building this: a throttle that could permanently strand a label mid-transition after a single quick fly-to (fixed with a trailing update), and a reveal threshold tuned only against desktop's own achievable zoom range, which meant a narrower phone could never reach it at all (fixed by expressing the threshold as a fraction of each platform's own max scale, not a fixed number) — full detail, `tasks.md` V4 round 3. **Round 5** ("upon zooming in the font looks way too small — make the size dynamic"): the label size is no longer a constant 10px. It stays 10px at the resting frame — unchanged, on every width — and grows by **half a pixel per step of zoom**, reaching 17px at the desktop ceiling, so a country that fills the screen carries type scaled to match instead of the same small text it had at world view. Growth is pinned to the zoom *range* rather than to a per-notch constant, because a wheel notch isn't a fixed quantity across mice; a phone, which has far less zoom available above its own resting frame, tops out near 13px at the same half-pixel-per-step rate rather than being force-fitted to the desktop endpoint. **Round 6** ("let every single country use a 3-letter code when zoomed out, changing to full form when zooming in"): the code is now the map's default state rather than a per-country fallback. Below 2× zoom from the resting frame **every** place shows its three-letter code, whichever way its name would have fitted — a uniform field of short tags instead of a mix of long words and short ones at the same size. Past that point each place takes its full name as soon as that name genuinely fits inside its own borders, so names arrive in waves as you zoom: the roomiest countries first, the tightest last. Round 3's rule is unchanged, it simply no longer applies below the threshold. | S |

**Entries (a hard constraint from the brief):** the main screen has exactly **two text inputs and one Submit button**. Everything else is display, direct manipulation on the map, or tucked into the side panel.

---

## 4. Non-functional requirements

### 4.1 Lightweight budgets (the headline NFR)
| Budget | Target | Why |
|---|---|---|
| Runtime dependencies | **0** (no framework, no d3, no map library) | Nothing to update, audit, or break |
| Build step for the app | **None**. The files the browser runs are the source files | Nothing to maintain between edits |
| Hand-written app code, **excluding comments** (HTML + CSS + JS) | **≤ 80 KB** unminified — **re-anchored 2026-09-14** (owner decision), was a flat 30 KB → 70 KB that counted comments as weight | Stays readable in one sitting; a budget that penalizes documentation was measuring the wrong thing |
| Map geometry (`geo.js`, generated) | **≤ 300 KB raw / ≤ 90 KB gzip** | HD coastlines without a heavy payload; exact figure set at T2 |
| Network requests after load | **0**. No fonts, CDNs, tiles, or telemetry | Works offline and from `file://` |
| Hosting | None needed: **double-click `index.html`**. Also works on any static host | No server to run |
| Interaction | Hover/select ≤ 16 ms per frame; zoom, pan, and the save animation hold 60 fps **on a mid-range phone, which is the binding constraint — not a laptop** (this line said "laptop" until 2026-09-14; a phone is where 302 SVG paths, shadows, and pinch-zoom actually cost something, so the laptop bar proved nothing) — **verified 2026-09-14 (V3), with an honest limit on what that verification means:** zero frames missed a whole vsync (≥30 ms) and zero long tasks (>50 ms) across pinch-zoom, pan, the save/ripple animation, and a hover sweep, under Chrome's own 4× CPU-throttle proxy for a mid-tier phone. That's real evidence the app's own JS isn't the problem; it isn't a physical-device result — no real GPU, thermal, or touch-latency behavior — so it can't promise the same numbers on an actual phone the way V4's real use will | Polish (O3), §4.7 |

**History of this number, briefly, because it moved three times and the reasoning at each step is worth keeping:** a flat 30 KB was set in Phase 0 before the app had most of its features, and by the end of Phase 1 (territories, the status model, save-by-link, real import) the real build measured 56.5 KB — raised to a flat 70 KB, with every added KB traced to a named feature rather than waved through. V2 (mobile redesign) plus the zoom-button/pinch-gesture fix pushed it to 72.0 KB, *over* that second number. Rather than raise a flat count a second time in two phases — which would mean the number had stopped constraining anything — the metric itself was re-examined: at that point **26 % of the file bytes were comments**, and the comments are exactly the documentation that explains *why* the search has seven tiers, why `logic.js` is wrapped in an IIFE, why a pinch can never become a tap. A budget that counts that prose as weight rewards deleting it, which works against the budget's own stated purpose ("stays readable in one sitting").

**Resolved 2026-09-14 (owner decision):** the budget now measures **code excluding comments**, ceiling **80 KB**. Comments are free — write as many as the code needs, never trim one to make a number.

| File | Total | Comments | **Counted (code only)** |
|---|---|---|---|
| `index.html` | 11.1 KB | 2.6 KB | 8.5 KB |
| `styles.css` | 31.7 KB | 11.9 KB | 19.8 KB |
| `logic.js` | 13.8 KB | 6.6 KB | 7.2 KB |
| `app.js` | 65.5 KB | 32.2 KB | 33.3 KB |
| **Total** | **122.1 KB** | **53.4 KB** | **68.8 KB of 80 KB — 11.2 KB headroom** |

(Re-measured 2026-09-14 after V4 rounds 1–5 — year periods, F22 and its three follow-up rounds, the dropdown reparent, the email fallback, the service-worker strategy change. `tools/measure-size.mjs` is the source of this table; re-run it rather than hand-updating after any further change to `app/`.)

(`countries.js`, hand-written *data* rather than app code, still isn't counted here — same as `geo.js`.) Re-measure this table whenever a change touches `app/`; if the counted total doubles without a proportional new feature to explain it, that's the same signal the original 30 KB number was watching for, just re-anchored to what the app actually is now.

### 4.2 Accessibility — **V1 pass done and verified 2026-09-14** (`tasks.md` V1)
- The typed path (J1) is **fully keyboard-accessible** and covers all 195 countries, so the map is a convenience, never the only way in. Country input follows the WAI-ARIA combobox pattern (`role="combobox"`, `aria-expanded`, `aria-activedescendant`, listbox options).
- Visible focus rings. `prefers-reduced-motion` turns every animation into an instant state change.
- Map colours are never the only signal: the table and the counter carry the same information as text.
- **A real gap the pass found and fixed:** a table row was the *only* way to reach an already-saved country's Remove control (the map itself is deliberately mouse/touch-only, but that's fine because the typed path never needs the map — removal, however, had no other route at all), and rows had no `tabindex` or keyboard handler. Fixed: rows are keyboard-operable (Enter/Space), and their own accessible name states what activating one does. **Two more found alongside it, both about focus rather than reach:** neither the popover nor the panel contained Tab while open (it could leak to the header/zoom controls behind them), and closing either could drop focus to nowhere in particular rather than back to whatever opened it. Both fixed generically — `trapTab()` (one function, used by both) and a stored return-focus target — rather than patched per-dialog.
- **Contrast, measured against the final shipped CSS, not the design study's copy** (this line previously just asserted "≥ 4.5:1"; verified with a small script computing WCAG ratios for every real text/background pair, including the translucent `.glass` chrome blended over the map's own water and land): every informational pair clears 4.5:1, from 5.4:1 (error text) up to 12.3:1 (primary ink on white). Two pairs fall under 4.5 and are both explicitly out of WCAG 1.4.3's scope rather than silently ignored: input placeholder text (3.5:1 — a hint, not the field's actual label, which already exists separately) and a disabled zoom button's glyph (1.9:1 — disabled controls are exempt).

### 4.3 Privacy
No accounts, no network, no analytics. The data lives in the browser's localStorage under one key. Export is the backup story (§8 G3).

### 4.5 Saving a map without a backend (the F17 decision, 2026-09-13)
The user asked for: a unique URL per map, created on first entry; the option to email it to themselves; clicking it later to update; and **no orphaned data** — if a map is never emailed and gets cleared, its URL and contents should disappear.

The obvious reading of that is a server: mint a token, store the map against it, send mail, expire unclaimed rows. That would mean a backend, a database, an email provider, hosting, and a maintenance and privacy burden — overturning L1/L8 and G1/G2/G3, against a brief whose *first* stated priority is that running and maintaining this should cost almost nothing.

**Every one of those requirements is met with no backend at all by making the URL itself the storage** (F17):

| Requirement | How it's met |
|---|---|
| Unique URL as soon as a country is entered | The URL is rewritten on every change; a different map is a different URL, inherently |
| Email it to yourself | `mailto:` hands the link to the user's own mail client — no mail service, no address stored, nothing sent through us |
| Click it later to update | Opening the link rehydrates the map exactly, on any device or browser |
| No email → nothing left behind | **Stronger than asked**: nothing is ever stored off the user's machine, so there is nothing to expire or delete. The cleanup job isn't skipped — it's unnecessary |

**What this design does not give**, stated honestly: the URL is ~100–1,000 characters rather than a short token; and there is no sync — editing on a phone produces a new link, so an older link on a laptop shows the older map. A backend would fix both, and the server route stays available if those matter more than the cost. Until then, this is the version consistent with the brief.

**Hosting note:** the app still needs no server-side code, but for an emailed link to open on another device it should sit on **static hosting**. Prefer **Cloudflare Pages or Netlify over GitHub Pages** — all three are free and serve static files identically, but the first two can also run serverless functions on the same domain if §4.6 is ever triggered. Static file hosting is not a backend: no database, no runtime, nothing to patch.

**A real gap this design had until 2026-09-14, found by actual use, not theorized:** "Email me this map" embeds `location.href` in the message — sound reasoning on http(s), where the address bar holds a real, stable, shareable link, exactly as designed above. **It silently breaks on a downloaded file**, and not as a rare edge case: opening a downloaded `.html` file from Android's Downloads app (the ordinary way to use the single-file build, `nomadic-traveller-map.html`) hands the browser a `content://` URI — no folder, no guaranteed long-term validity, meaningless to anyone it's emailed to, including the same user days later. The app now checks `location.protocol`, and on anything other than `http:`/`https:` it falls back to the mechanism that's always been protocol-independent — **Export**, triggered automatically, with the mailto draft asking the user to attach the file that just downloaded and explaining how to restore it via Import. **This is the honest reminder of why §4.5's hosting note exists**: the URL-as-storage design is real and works exactly as specified once the app is actually served over http(s); a downloaded single file is a deliberate convenience for getting onto a phone at all (§4.5's own gotcha, `handoff.md`), not a substitute for hosting it.

### 4.6 Other people using it (the L13 deferral, 2026-09-13)
The owner intends to open this up to others eventually, and asked whether the architecture should change now. **It shouldn't** — and the reason is measurable rather than a matter of taste.

**Other people can already use it.** There are no accounts, so anyone who opens the hosted link gets their own map, kept in their own browser and their own link. Nothing about that needs building. What's missing is *accounts and sync*, which is a narrower question than "multi-user."

**The retrofit is small, and stays small on purpose.** The entire app touches persistence in **one object, two methods** (`Store.load()` / `Store.save(visits)`), called from three places; the data model (`{code: {y, s}}`) is byte-identical in a single- or multi-user world. So going multi-user means writing a remote adapter behind that seam — roughly a day against a backend-as-a-service free tier — while the map, table, search, status model, geometry, and palette are untouched. **Keeping that seam one object wide is the concrete cost of deferring, and it has already been paid.**

**What building it now would actually cost:** a database and auth to run and patch for a user base of one; a privacy policy and deletion path for other people's travel history; and a guess at which product this becomes — private maps, shared/comparable maps, and public profiles are three different builds, and nothing yet says which. The no-backend version is the cheapest way to find out which one anyone wants.

**Trigger to revisit (write it down so it's a decision, not a drift):** someone other than the owner asks for sync, or loses a map, or more than a handful of people are using it regularly. At that point: backend-as-a-service (Supabase/Firebase free tier) before a hand-rolled server, and the existing versioned export (§5.3) makes migrating current maps an upload rather than a conversion.

### 4.4 Browser support
Current Chrome, Edge, Firefox, and Safari (desktop and mobile). Nothing needs a polyfill.

### 4.7 Mobile parity (owner directive, 2026-09-14) — **a first-class requirement, not a fallback**
**The bar: the phone experience must be as user-friendly, as aesthetically appealing, and as smooth as the desktop one.** Not "works at 390 px." Not "nothing overflows." Equal.

**Honest assessment of where the project stood when this was raised: mobile was accounted for as *adaptation* and as a *correctness checklist*, never as a quality target.** Four pieces of evidence, all from the project's own documents and code rather than impression:
1. **§2's persona** read "desktop most of the time and a phone occasionally" — which silently authorised every shortcut below. Now corrected.
2. **§6.4 described mobile as three substitutions** ("stacks into", "is full-screen", "docks to the bottom") against a desktop layout given real compositional detail (a 420 px panel, a floating bar, deliberate positions). Substitution is reflow, not design.
3. **§4.1's interaction budget named a "mid-range laptop"** — the one device class where this app's cost is irrelevant. Now corrected to a phone.
4. **`tasks.md` V2's acceptance criteria were pass/fail plumbing** — "no horizontal overflow, touch targets ≥ 44 px, J1/J2/J4/J5 work." Nothing in there could ever fail on grounds of *ugly* or *janky*, so nothing enforced the actual goal.

The build reflects exactly that: **17 of `styles.css`'s 204 lines are the mobile block.** 8% of the stylesheet carries a device that's supposed to be half the audience.

**Real defects found by inspecting the built app at 360 / 390 / 430 px (2026-09-14), which no existing acceptance criterion would have caught:**
- **~200 px of dead ocean** sits between the map and the entry sheet at every width — the map is vertically mis-framed, wasting the scarcest resource on a phone.
- **The idle entry bar consumes ~25 % of the screen** (three stacked full-width rows) even when nobody is typing. On desktop the same control is one compact floating bar. The map — the entire point of the app — pays for a form that is idle almost all of the time.
- **India is clipped at 360 px** — the owner's own Home country, half off-screen at rest.
- **The "195 countries · 45 territories" pill is stranded mid-ocean** rather than anchored as it is on desktop.
- **The table keeps all four desktop columns at 360 px**, so "United States" and "South America" wrap to two lines and row heights jump, while "# Times" is a column of em-dashes and single digits.
- **Hover has no touch equivalent** (`app.js`: the tooltip returns early unless `pointerType === "mouse"`). On desktop you hover to identify a country *before* committing; on a phone that affordance doesn't exist, so identifying an unlabeled country requires opening its popover. This is the clearest case of the two experiences not being equal — and it is a design gap, not a bug.

**What this requirement changes going forward:** mobile gets *designed*, at its own widths, with its own compositional decisions — not derived by collapsing the desktop layout. V2 is re-scoped accordingly (`tasks.md`), and its acceptance criteria are rewritten so that "works" is no longer a passing grade.

**Outcome (V2, 2026-09-14).** Every defect above is fixed; §6.4 now describes a phone composition rather than a list of substitutions, and the stylesheet's mobile share went from **17 of 204 lines (8 %) to 87 of 284 (31 %)** — a rough proxy, but the direction is the point. The one criterion that could not be met as written is recorded honestly below rather than quietly dropped.

**Owner sign-off received, same day, after two follow-up fixes done live on-device** (V2a: the pinch-to-zoom gesture and permanent +/− buttons; V2b: keyboard avoidance for the popover — both in `tasks.md`). "Looks great." **R5's real gate for V2 is now met, not just the built-and-verified bar.**

**The criterion that could not be met, and why.** V2's acceptance list said *"nothing the owner has marked is clipped out of the default frame."* On a phone in portrait that is arithmetically impossible for a globe-spanning traveller: at a 390 × 800 viewport the map's 2.16 aspect means showing all of it at once yields a ~180 px strip with roughly three-quarters of the screen empty. Both halves of "as good as desktop" cannot hold at once here, so the frame optimises for a screen-filling map centred on the densest cluster of your own countries, and completeness moves one gesture away — **rotate to landscape, where the whole world genuinely fits edge to edge, or pinch out.** That is a trade the owner should see and can overrule, not a silent failure.

---

## 5. Data

### 5.1 The country list
**195 countries**, exactly [Worldometers' list](https://www.worldometers.info/geography/how-many-countries-are-there-in-the-world/): 193 UN member states plus the two UN observer states, the Holy See and the State of Palestine. Display names are the common English short forms (*Czechia*, *DR Congo*, *Vatican City*, *Côte d'Ivoire*). Official, former, and colloquial names are kept as **search aliases** (*Czech Republic*, *Zaire*, *Holy See*, *Ivory Coast*, *Burma*, *Swaziland*, *UK*, *Holland*, *Türkiye* …). Source of truth: `app/countries.js`.

**Continents** follow the UN M49 geoscheme, which is what Worldometers' own regional totals use. Worldometers' *Latin America & Caribbean* (33) plus *Northern America* (2) are split into **North America (23**, including Central America and the Caribbean**)** and **South America (12)**. Totals, pinned by test: Africa 54 · Asia 48 · Europe 44 · North America 23 · South America 12 · Oceania 14.

M49 choices worth knowing (open question Q2): **Russia → Europe; Turkey, Cyprus, Georgia, Armenia, Azerbaijan, Kazakhstan → Asia; Egypt → Africa; Panama and the Caribbean → North America.**

### 5.2 Territories: which of Natural Earth's ~50 non-country areas are trackable
Natural Earth draws real land wherever a country doesn't reach, so leaving all of it inert would look like missing geography for anywhere without a seat at the UN. Resolved 2026-09-13 (was Q1): a named area is promoted from inert land to a **clickable, trackable territory** — same interactions as a country, tagged "Territory" everywhere (F12) — if it passes one rule, checked against every named area Natural Earth actually draws, not decided in the abstract:

> Has its own ISO 3166-1 code (official, or for **Kosovo** the widely-used unofficial `XK`/`XKX`) that's distinct from any of the 195, **and** has a real permanent civilian population, **and** is large enough to render (a shape or a dot) from what's already on the map.

**45 pass** — the full list, with continent and search aliases, is `app/countries.js`'s `TERRITORIES` array: American Samoa, Anguilla, Aruba, Bermuda, British Virgin Islands, Caribbean Netherlands (Bonaire/Sint Eustatius/Saba), Cayman Islands, Christmas & Cocos Islands, Cook Islands, Curaçao, Falkland Islands, Faroe Islands, French Guiana, French Polynesia, Greenland, Guadeloupe, Guam, Guernsey, Hong Kong, Isle of Man, Jersey, Kosovo, Macao, Martinique, Mayotte, Montserrat, New Caledonia, Niue, Norfolk Island, Northern Mariana Islands, Pitcairn Islands, Puerto Rico, Réunion, Saint Barthélemy, Saint Helena, Saint Martin, Saint Pierre and Miquelon, Sint Maarten, **Svalbard and Jan Mayen**, Taiwan, Turks and Caicos Islands, U.S. Virgin Islands, Wallis and Futuna, Western Sahara, Åland.

**6 fail** on "no real permanent population" and stay inert: Ashmore & Cartier Islands (uninhabited), British Indian Ocean Territory (military base only), French Southern & Antarctic Lands (research stations only), Heard & McDonald Islands (uninhabited), Siachen Glacier (a restricted India/Pakistan military zone, no civilians), South Georgia (~30 rotating government/scientific staff, no permanent residents — a genuine borderline call, flagged for the user rather than assumed).

**Two real geometry bugs found and fixed while building this, worth recording:**
1. The Dutch Caribbean territory Caribbean Netherlands (Bonaire + Sint Eustatius + Saba, one ISO code) is drawn as three separate polygons inside the Netherlands' raw shape. Bonaire sits far south near Venezuela; Sint Eustatius and Saba sit ~500 km north, close enough to Guadeloupe's location that a single nearest-point anchor incorrectly pulled them into *Guadeloupe's* shape instead. Caught by inspecting the actual per-polygon centroids after simplification (not assumed), fixed by giving Caribbean Netherlands a second anchor point.
2. **Svalbard, first reported as a hard gap, turned out to be fixable** — its coastline is in the data, just fused into Norway's shape (never separately extracted), the same way French Guiana used to be fused into France. Splitting it needed its own rule rather than reusing the France/Netherlands nearest-point method: Norway's own mainland runs so far north (Nordkapp, 71.17°N) that raw distance would pull real Norwegian polygons toward Svalbard's location. Verified against every real polygon centroid instead of assumed: `longitude < 0° OR latitude > 72.5°` cleanly separates 10 Svalbard/Jan Mayen polygons from Norway's 22 mainland ones, with a genuine gap on both sides. Now its own territory, `SJM`.

The general lesson from both (one anchor per real geographic cluster, not one per territory; and a shape's own extent can make a generic method fail even when it worked elsewhere) is recorded in `plan.md`/`tools/build-geo.mjs`.

France's and the Netherlands' overseas regions (French Guiana, Guadeloupe, Martinique, Réunion, Mayotte, Caribbean Netherlands) are **split off from the sovereign shape** at build time and treated as their own territories, so recording a trip to Paris doesn't paint French Guiana, and vice versa.

### 5.3 Stored model
```json
{ "v": 1, "visits": {
  "JPN": { "y": [2019, 2023] },
  "GBR": { "y": [{ "from": 2011, "to": 2014 }], "s": "lived" },
  "CAN": { "y": [{ "from": 2023, "to": null }], "s": "home" },
  "IND": { "y": [], "s": "home" }
} }
```
- Key: ISO 3166-1 alpha-3 for a country, the same shape's code for a territory (§5.2) — one flat namespace, since a country and a territory never share a code.
- `y`: an array of years (ascending, repeats allowed) **and/or periods** — added 2026-09-14, F21. A plain entry is a single year (`2019`); a period is `{from, to}`, with `to: null` meaning still ongoing. Visited only ever holds plain years; Lived/Home may hold either, since a period is only meaningful once the status isn't a discrete trip. **# of times visited = `y.length`**, but only meaningful when the status is Visited (F16) — Visited never mixes in a period, so this count is never ambiguous.
- `s`: `"lived"` or `"home"`; **omitted entirely for the default Visited**, so the common case stays as small as it was. The `y` shape changed once, for F21 — after real use, not before shipping — and stayed backward-compatible on purpose: a plain number is still a plain number, so every map saved before F21 decodes identically today.
- One `localStorage` key: `travelmap.v1`. `v` exists so a future shape change can migrate.
- Import accepts only this shape, only known codes (country or territory), and only valid years. Anything else is rejected with a message, and nothing is partially applied.

### 5.4 Real trip data (resolved 2026-09-13, was Q5; **specifics scrubbed 2026-09-14 ahead of making this repo public**, D-tasks in `tasks.md`)
Design study 01's demo data was originally the owner's own real trips, not an illustrative sample — pieced together from their real booking records (filenames only were ever read, never a document's contents, to keep this to the minimum needed: destination + date) and Pāntha's completed Peru fixture. That real list has since been **replaced with fictional example data** (`docs/design-studies/01-map/index.html`'s `SAMPLE`) now that this repo is heading to public GitHub Pages hosting — the methodology below is worth keeping on record; the specific countries, years, and file paths it once named are not.

**Two judgment calls, resolved 2026-09-13 (were Q6/Q7), kept here as the reasoning rather than the personal specifics that originally illustrated them:**
- **A home country is tracked as `Home`, with no years** (Q6/Q9 resolved). The year question dissolved rather than got answered: asking it surfaced that a home country doesn't have a "year visited" at all, which is what produced the status model in F16. It counts toward the 195 like anywhere else, carries a Home tag, and shows "—" where years would go.
- **A country of residence is `Lived`**, even when it was also genuinely visited before the move — which is exactly why status is a label on a country rather than a separate list: the same place can be both, and the years already tell that story.
- **A single day-trip does NOT count** as a real stay (Q7 resolved) — removed from the data. The rule: nothing in this list rests on anything less than a real multi-day stay.

**Deliberately excluded, not missed:** Mexico, Morocco, and Japan all have real, detailed Pāntha trip data in the same archive — but each trip's own dates are *after* today (2026-09-13): Mexico Sept 24–30 2026, Morocco Dec 24 2026–Jan 4 2027, Japan Apr–May 2027. They haven't happened yet, so a "visited countries" tracker doesn't mark them, regardless of how completely they're planned.

---

## 6. Design system

### 6.1 Principles
1. **The map is the interface.** Chrome is minimal and floats above the map. Nothing boxes it in.
2. **Two colours at rest, three once you've travelled.** Water, land, and the visited tone. Every other colour is a neutral for text.
3. **Motion explains state.** Every animation says *what just changed* (selected, saved, removed). None of it is decoration for its own sake.
4. **Quiet typography.** The system UI font, so no webfont bytes. Tabular numerals for counts.

### 6.2 Palette — **C · Atlas, LOCKED 2026-09-13** (was Q3)
Round 1 offered three pastel pairs so close in lightness they read as one map slightly retinted. Round 2 (2026-09-13) replaced them with five options spanning soft to vibrant, each with a real lightness gap between water, land, and visited; the study still switches between all five live for reference, but **Atlas is the chosen default and what design study 01 now opens to**:

| Token | A · Sand & Sea | B · Coastal | C · Atlas **← chosen** | D · Jewel | E · Tropic |
|---|---|---|---|---|---|
| `--water` | `#A9CFDD` | `#4FAFC4` | `#7C99B4` | `#33678F` | `#4FD1E0` |
| `--land` | `#F1E0C3` | `#F6E4BE` | `#E9DCC3` | `#EDE2CB` | `#FFEAC2` |
| `--visited` | `#C2603C` | `#E4602A` | `#9C3826` | `#B23A44` | `#FF5A3C` |
| Mood | soft, the brief's original pairing | vibrant teal + coral | deeper, editorial/nautical | richest, most saturated | most vibrant/playful |
| `--border-line` | `rgba(255,255,255,.85)` | same | **`#3F3529`** (dark warm "chart ink") | `rgba(255,255,255,.8)` | `rgba(255,255,255,.85)` |

**Borders were the one thing the user asked to change about Atlas**, wanting them "in a clearer way… a slightly darker colour rather than white." Tested several dark warm tones against Atlas's water and land and picked the one with the best contrast against *both* (`#3F3529`: 4.04:1 on water, 8.84:1 on land — every other candidate traded one for the other). Every palette now carries its own `--border-line` token rather than one hardcoded white value, so this is a per-palette choice, not a global one — A/B/E keep translucent white (already high-contrast against their paler water), D keeps it too (untouched this round, not asked about).

Neutrals shared by all five: ink `#2B3640`, muted `#55636E`, surface `#FFFFFF` at 92% with a light backdrop blur, hairline `#E3E8EC`, error `#A94F3A`. Measured contrast: ink on white 12.3:1; muted on white 6.2:1; error on white 5.4:1. White text on the visited tones fails AA (2.2–3.0:1 across all five), so **buttons are ink, never the visited colour**. The wordmark sits in a glass pill (not bare on the map) specifically because C and D's deeper water fails contrast for unboxed text (ink-on-water 4.15:1 / 2.04:1, against 4.5 required) — one fix that covers every palette rather than five one-off text colours. The one deliberate exception is input placeholders (`#7D8A95`, 3.5:1), which are hints under an always-visible label (design study 01 NOTES).

### 6.3 Motion
| Moment | Spec |
|---|---|
| Hover | fill → slightly deeper tone, 120 ms ease-out; tooltip fades in 100 ms |
| Select (click) | country scales to **1.06** about its own centre, 280 ms `cubic-bezier(.34,1.56,.64,1)` (a gentle overshoot); soft drop shadow; moved to the top of the draw order |
| Popover | fades and rises 6 px, 180 ms |
| **Save** | fill animates land → visited over 500 ms; a **ripple** ring expands from the country's centre (r 0 → 28, opacity .55 → 0, 700 ms); the counter number pops (scale 1 → 1.18 → 1, 300 ms) |
| Remove | fill fades back to land over 400 ms; no ripple |
| Fly-to | viewBox tween, 650 ms ease-in-out, to the country's bounds with padding (zoom capped at 6× for small countries) |
| Side panel | slides in from the right, 320 ms `cubic-bezier(.2,.8,.2,1)`; rows fade in with a 15 ms stagger (capped at 300 ms total) |
| Dropdown | fades in 120 ms; the active row is highlighted with a tint of `--visited` |
| Reduced motion | all of the above become instant |

### 6.4 Layout
- **Desktop:** the map fills the viewport. Top left: wordmark and a small caption. Top right: the counter/menu pill (*"12 / 195"*). **Bottom centre: a floating entry bar**: *Country* combobox · *Year(s) visited* · **Submit**. The side panel is 420 px wide and overlays from the right.
- **Mobile (≤ 640 px):** designed at phone widths, not derived from the desktop layout (plan L14). **The map keeps the whole screen at rest.** Entry is summoned: a single *"+ Add a country"* pill sits in the bottom centre, and tapping it raises the entry sheet, which slides back out of the way on submit, on ✕, on Escape, or on a tap to the map. The popover and the side panel are full-width bottom sheets, and whichever one owns the lower screen makes the resting controls (the add pill, the reset button, the counts pill) stand down rather than float over its buttons. The table becomes phone rows — name and status badges on a strong first line, years and continent on a quiet second one — and its sort controls become a scrollable row of chips. *# Times* is dropped **on phones only**, because for a visit it merely counts the years already printed next to it, so it spent a column saying nothing; its sort chip stays.
- **Mobile framing:** at a phone's aspect ratio the map cannot both fill the screen and show the whole world — the world fitted to a 390 px width is a ~180 px strip in a field of empty blue, while a screen-filling map holds roughly 80° of longitude. Portrait takes the screen-filling map, framed on **your** countries: a window of the visible width slides across the places you've marked and settles where it covers the most of them. **Turning the phone to landscape gives the whole world edge to edge** — at that orientation the screen's aspect finally matches the map's 2.16 — and so does pinching out. Before you've marked anything, the resting frame is Europe · Africa · South Asia.
- **Touch:** press and hold peeks a country's name without opening anything (the touch answer to hover); a tap that lands in open water within a thumb's slack of a place still finds it, so small countries don't demand precision; every control clears 44 px, the compact ones by growing an invisible hit area rather than by getting visually chunky.

---

## 7. Release plan and risks

**Phases** (full detail in `tasks.md`): **0: Foundations** (data, geometry pipeline, docs, design study; *done except study approval*) → **1: Build** (app to spec) → **2: Polish and verify** (motion pass, a11y, mobile, performance, user inspection) → **v1.0**.

| # | Risk | Mitigation |
|---|---|---|
| R1 | Small countries are impossible to click | Dots (F8) + zoom (F10) + the typed path (F2), three independent routes |
| R2 | The payload grows as detail rises | geo.js budget (§4.1), simplification level chosen by side-by-side comparison (T2), not by guesswork |
| R3 | localStorage is cleared and data is lost | **Largely resolved by F17**: the map lives in its own URL, which the user can email to themselves, bookmark, or open on any device. Export/Import (F9) remains as the archival belt-and-braces |
| R4 | Geographic or political edge cases (disputed areas, continent assignment) | One documented rule each for the 195 (Worldometers), continents (UN M49), and territories (§5.2's ISO-code + population + geometry test) — applied uniformly, not decided case by case |
| R5 | Polish slips because "it's a small app" | Motion is spec'd numerically (§6.3); the user inspects the real thing before v1 (T9) |

---

## 8. Guardrails: what this app must not do
- **G1** Add a runtime dependency, framework, or build step to the app. `tools/` may have dev-only dependencies for regenerating geometry.
- **G2** Make any network request at runtime.
- **G3** Store data anywhere but the user's own browser (plus files the user explicitly exports).
- **G4** Add inputs to the main screen beyond the two text boxes and Submit.
- **G5** Grow into a trip planner (Pāntha's job).
- **G6** Let a territory (F12) count toward "of 195," in the header pill, the table's official total, or anywhere else that number appears.

---

## 9. Decisions resolved
| # | Question | Resolved |
|---|---|---|
| Q1 | Track territories as optional extras outside the 195? | **Yes** — 45 of them, by the rule in §5.2; F12/F15 |
| Q2 | Keep UN M49 continents (Russia = Europe, Turkey/Cyprus/Caucasus = Asia)? | **Confirmed, yes** |
| Q3 | Which palette? | **C · Atlas**, with darker chart-ink borders (§6.2) |
| Q4 | Product name? | **Nomadic Traveller Map** — repo/files stay `TravelMap` (Pāntha's own precedent: display wordmark vs. ASCII project name) |
| Q5 | Pre-fill from known trips? | **Yes** — real countries, methodology in §5.4 |
| Q6 | Should the user's home country (India) be tracked? | **Yes** (2026-09-13) — as `Home`, no years, §5.4/F16 |
| Q7 | Does a single day-trip (Germany 2017) count as "visited"? | **No** (2026-09-13) — removed from the data, §5.4 |
| ~~Q8~~ | ~~Svalbard is a real gap — worth fixing?~~ | **Not a gap after all — fixed** (2026-09-13, §5.2): its geometry existed, fused into Norway's shape; split out the same way France's overseas regions were |

| Q9 | What year(s) should India show? | **Dissolved, not answered** (2026-09-13) — the right answer was that a home country has no "year visited", which produced the Visited/Lived/Home model in F16 |
| Q10 | Did the archive's pattern for one country read like residence rather than a visit? | **Yes** (2026-09-13) — confirmed by the user; that entry is `Lived` (specific country/years scrubbed 2026-09-14 ahead of going public — see §5.4) |
| Q12 | Which projection? | **Equal Earth** (2026-09-13, user request) — equal-area; plan.md L7 has the measured comparison |

## 10. Open questions
| # | Question | Status |
|---|---|---|
| Q11 | Worth a fourth status for airport-only transits (e.g. the 2024 London layover), so they can be recorded without counting? | No — three states is the useful minimum; easy to add later if it's missed |
