# Tasks: TravelMap

Generated from [`plan.md`](./plan.md) §5. **This file is the source of truth for status.** Each task has an acceptance criterion. A task is ✅ only when that criterion is met *and* verified, never on "the code is written".

## Progress
| Phase | Task | Status |
|---|---|---|
| 0 Foundations | T0 Docs (spec, plan, tasks, handoff) | ✅ |
| | T1 Country dataset + data tests | ✅ |
| | T2 Geometry pipeline + detail level | ✅ |
| | T2a Territories: 45 extras, clickable + tracked | ✅ |
| | T3 Design study 01: interactive map mockup, round 9 | ✅ **approved 2026-09-14** (L4 gate) |
| 1 Build | B1 Shell + map render | ✅ |
| | B2 Hover, tooltip, select, popover | ✅ |
| | B3 Country combobox + year validation (`logic.js` + tests) | ✅ |
| | B4 Save, persist, animate | ✅ |
| | B5 Side panel + table | ✅ |
| | B6 Dots, zoom/pan, fly-to | ✅ |
| | B7 Undo, export, import | ✅ |
| | B8 "About the counts" corner card | ✅ |
| | B9 Status: Visited · Lived · Home | ✅ |
| | B10 Save-by-link, email, Clear map | ✅ |
| | B11 Durability: save-state + installable PWA | ✅ |
| 2 Polish + verify | V1 Accessibility pass | ✅ **2026-09-14** — 3 real gaps found and fixed (rows unreachable, no focus containment, no focus return); contrast verified against the shipped CSS |
| | V2 **Mobile: design, not adaptation** | ✅ **2026-09-14** — built, verified, **and owner-approved** ("Looks great" — pinch/zoom + keyboard-avoidance confirmed on-device). The real gate (spec R5) is now met |
| | V3 Size + performance audit | ✅ **2026-09-14** — 61.4 KB of 80 KB code-excluding-comments as of V4 round 6 (re-measured; was 54.4 KB when this row was last edited — size is re-checked after every round, see `tools/measure-size.mjs`); `geo.js` 297.5 KB raw / 86.4 KB gzip, both within budget; zero dropped frames and zero long tasks across pinch/pan/save/hover under 4× CPU throttle (headless-proxy caveat noted, spec §4.1) |
| | V4 User inspection round → **v1.0** | ✅ **signed off 2026-09-14** — 6 rounds, 9 findings (4 + 1 + 1 + 1 + 1 + 1), all fixed at the root; round 4 = the stale service-worker cache that had been silently hiding every change. **v1.0 tagged in `handoff.md`.** |
| 3 Go-live | D0 Privacy scrub (required before any of D1+ is safe) | ✅ **2026-09-14** |
| | D1 Initialize git + create the GitHub repo | ⏸ |
| | D2 GitHub Actions workflow to publish `app/` | ⏸ |
| | D3 Enable GitHub Pages (repo settings) | ⏸ |
| | D4 Verify the live deployment | ⏸ |
| | D5 Custom domain *(optional)* | ⏸ |
| | D6 Point "Email me this map" / the single-file build at the new canonical URL | ⏸ |

Legend: ✅ done · 🔄 in progress / in review · ⏸ not started

---

## Phase 0: Foundations

### T0 · Docs ✅
`product_spec.md`, `plan.md`, `tasks.md`, `handoff.md`, plus `docs/design-studies/01-map/NOTES.md`.
**Accept:** a fresh session can pick up from `handoff.md` alone.

### T1 · Country dataset + data tests ✅
`app/countries.js`: 195 rows `[iso3, isoNum, name, continent, ...aliases]`, following Worldometers' list (checked 2026-09-13) and UN M49 continents with the North/South America split. `tests/data.test.mjs` runs with zero dependencies (`node --test tests/*.test.mjs`).
**Accept:** 195 rows, no duplicate codes or names; continent totals AF 54 · AS 48 · EU 44 · NA 23 · SA 12 · OC 14, which reconcile with Worldometers' published 54/48/44/(33+2)/14; no alias shared between two countries. **4/4 tests pass.**

### T2 · Geometry pipeline + detail level ✅
`tools/build-geo.mjs` (dev-only dependencies in `tools/package.json`) → `app/geo.js`. Details in plan.md §2.
**Accept:** every one of the 195 has a shape or a dot, plus an anchor (tested). Overseas France and Netherlands are split off. Somaliland and N. Cyprus are dissolved into their countries. Size is within the budget (≤ 300 KB raw / ≤ 90 KB gzip).
**Measured** (1000 × 462 viewBox, 0.1-unit precision, at the original countries-only pipeline):

| KEEP (vertices kept) | geo.js raw | gzip | territories that survive |
|---|---|---|---|
| 1.0 (full 1:50m) | 540 KB | 125 KB | 51 |
| **0.5 ← chosen** | **297 KB** | **88 KB** | **46** |
| 0.35 | 220 KB | ~68 KB | 37 |
| 0.25 | 167 KB | ~54 KB | 28 |

The choice was made by rendering all four side by side at world, Europe, Caribbean, and SE-Asia zoom (see T2 notes in `docs/design-studies/01-map/NOTES.md`). 33 countries get dots: every one with projected area < 6 units², plus Tuvalu, which is too small for Natural Earth's 1:50m data. (T2a below re-measures `geo.js` after adding the territories.)

### T2a · Territories: 45 extras, clickable + tracked ✅ *(added 2026-09-13, user round-3 feedback; Svalbard added round 4 same day)*
`app/countries.js` gains a `TERRITORIES` array (45 rows, same shape as `COUNTRIES`); `tools/build-geo.mjs` restructured from a binary countries/territories split into three (`countries` / clickable `extras` / inert `territories`), with one shared placement function so extras get the exact same path-or-dot treatment as the 195 (detail in plan.md §2). Full rule, list, and the 6 exclusions in spec §5.2.
**Accept:** every one of the 45 has a shape or a dot plus an anchor (tested, `tests/data.test.mjs` — 6/6 green); no code collides with the 195; the build throws if a `TERRITORIES` row never matches a real feature. **Three real bugs found and fixed while building this, not after:** (1) three real places — Saint Barthélemy, Pitcairn Islands, Norfolk Island — were silently vanishing at KEEP 0.5 because the old inert-territory path had no dot fallback; fixed by routing extras through the same placement function as countries. (2) Caribbean Netherlands' Sint Eustatius/Saba polygons were being nearest-point-matched into *Guadeloupe* instead (found via a duplicate-code check on the built output, then confirmed by inspecting real per-polygon centroids); fixed with a second anchor point for the same territory. (3) **Svalbard, first reported to the user as an unfixable gap, turned out to be fixable** — its coastline was fused into Norway's shape the same way French Guiana was fused into France; split out with a dedicated rule (`lon < 0° OR lat > 72.5°`, verified against every real polygon centroid, since Norway's own mainland runs too far north for a plain nearest-point split to work) — `plan.md` §2. **Measured:** `geo.js` 298 KB raw / ~89 KB gzip (KEEP still 0.5) — 233 real paths + 69 dots across 240 clickable places (195 + 45), within the same §4.1 budget.

### T3 · Design study 01: interactive map mockup, round 9 ✅
`docs/design-studies/01-map/index.html`, built on the real geometry and the real 195 + 45. Round 1 covered every surface and motion in spec §6; round 2 widened the palette from 3 options to 5 (`NOTES.md`). **Round 3 (2026-09-13), on the user's direct feedback:**
- **Atlas locked as the default palette**, with a darker "chart-ink" border (`--border-line`, per-palette token) replacing translucent white — chosen by testing several dark warm tones for contrast against both Atlas's water and land, not by eye alone (§6.2).
- **Territories (T2a) wired into every surface**: clickable on the map (identical interaction to a country), tagged "Territory" in the dropdown/popover/table, a separate "+N territories visited" table line, and a new bottom-right "195 countries · 45 territories" card (click to expand) stating the official-vs-shown distinction the user asked for.
- **The wordmark is now "Nomad Travel Map"** (project files/folder stay `TravelMap`, matching Pāntha's own display-name-vs-repo-name precedent).
- **Sample data replaced with the user's real trips** (12 countries; methodology and two flagged judgment calls in spec §5.4), with the "illustrative" caption changed to reflect that.

**Round 4 (same day), on the user's follow-up feedback:** India confirmed trackable (the year question was then dissolved by round 5 below) and the Germany day-trip removed, both per the same-day methodology in spec §5.4 — sample data is now 11 countries. The user asked what the Svalbard gap actually was; re-checking to answer properly found it wasn't a real gap (T2a, above) — fixed rather than left open. That work also surfaced a genuine, unrelated bug: zooming in past the map's cap near the top edge (where Svalbard sits) made the view drift steadily away from the cursor instead of staying put, because the zoom-toward-cursor offset was computed from the pre-clamp size while the clamp itself used a different, post-clamp size. Fixed in `zoomAt` (plan.md §3); re-verified with a tick-by-tick log showing the drift is gone.

**Round 5 (same day):** the user asked how to handle a home country and a country of residence. Rather than a second "Countries lived" input (which would double-enter Canada, both visited and lived in, and break G4's two-input rule), added a **status label per place — Visited · Lived · Home** (spec F16, plan L11, task B9): set in the popover, counted identically, years unchanged, marked on the map with a small ink glyph instead of new fill colours. India is now `Home` with no years — which also dissolved the pending "what year for India?" question rather than answering it. Sample data is 13 places (12 countries + Canada/India statuses).

**Round 6 (same day):** **projection changed to Equal Earth** at the user's request (plan.md L7). Worth recording that the user's premise — "I don't want Mercator" — was mistaken: the map was on Natural Earth 1, a *compromise* projection, never Mercator. Said so plainly rather than quietly agreeing, then made the change anyway, because equal-area genuinely is the better basis for a map built to compare where you've been. Verified by measurement, not assertion: Greenland ÷ DR Congo drawn area is **0.92** under Equal Earth against a true ratio of 0.92 (Natural Earth 1 gave 1.96; Mercator would give 15.00). Nothing else needed touching — `geo.js` got marginally smaller (297 KB), viewBox stayed 1000 × 462, 6/6 tests still green. Also: **one entry upgraded to `Lived`** (Q10 resolved — the user confirmed the residency read; specific country/years scrubbed 2026-09-14 ahead of this repo going public, spec §5.4).

**Round 7 (same day): saving a map — the URL *is* the map** (spec F17/F18/§4.5, plan L12, task B10). The user asked for unique-URL-plus-email saving; measuring first showed it needs no server — their real map encodes to 104 chars, 100 countries × 3 years to ~1,000, inside URL limits. `mailto:` covers "email it to me." The "delete unclaimed maps" rule became unnecessary rather than unimplemented, since nothing is ever stored off-device. Verified by restoring a full map in a fresh browser from the link alone. **Clear map** added beside it, with Undo instead of a confirm dialog.

**Round 8 (same day): multi-user deferred with hedges, not designed out** (plan L13, spec §4.6). The owner wants others to use it later and asked whether to re-architect now. Measured the coupling: persistence goes through **one object, two methods** (`Store.load`/`Store.save`), and the data model is identical either way, so accounts are a storage-adapter swap, not a rewrite — and other people can already use the no-account version today. Three hedges taken instead of a rewrite: the `Store` seam (below), host on Cloudflare Pages/Netlify rather than GitHub Pages, keep the blob versioned/portable. A written trigger governs when to revisit (L13), so this is a decision, not a drift.

**Approved 2026-09-14 — the user approved the study as-is.** Decisions recorded across `NOTES.md`'s rounds 1–8; spec §9/§10 reflect every resolved/open question. Phase 1 build started the same session.

---

## Phase 1: Build ✅ *(2026-09-14, one session — B1–B11 built and verified together, not sequentially, since the study already proved every surface; this section records what building the REAL `app/` turned up)*

`app/index.html` (markup only) + `styles.css` (Atlas tokens baked in directly — the palette switcher was study-only and isn't shipped) + `logic.js` (pure, `window.Logic`) + `app.js` (DOM/events/camera/storage) + the existing `countries.js`/`geo.js`. `tests/logic.test.mjs` (19 cases) plus the existing `tests/data.test.mjs` (6 cases) — **25/25 green.**

**Two real bugs found by this pass, neither visible in the study's own screenshots, both fixed at the source:**
1. **`search("uk", …)` ranked *Ukraine* above *United Kingdom*.** The old 5-tier ranking had no tier for an *exact* match — a complete alias match ("UK") and a mere prefix match on some other country's real name ("Uk-raine") landed in the same bucket, and Ukraine's primary-name prefix outranked United Kingdom's alias match on tie-break order. Caught the moment `tests/logic.test.mjs` asserted `search("uk", …)[0].name === "United Kingdom"` — a case the study's manual click-throughs never happened to exercise. Fixed with two new exact-match tiers (name and alias) ranked above every prefix/substring tier (`logic.js`).
2. **`logic.js`'s functions leaked as bare globals**, and `app.js`'s `const { search, … } = Logic` then tried to redeclare `search` over the identically-named global `function search` from `logic.js` — a `SyntaxError` at parse time that silently killed the *entire* page before anything rendered (0 map shapes, no console output visible without checking directly). This is a real, general gotcha for classic (non-module) multi-file scripts sharing one global scope, not specific to this app: a top-level `function` declaration is a `var`-like global even across separate `<script>` tags, and a later `const` of the same name anywhere in that scope throws. Fixed by wrapping all of `logic.js`'s internals in one IIFE, exposing only `window.Logic`.

**Every journey (J1–J5) verified against the real build, not the study, over `http://localhost`:** typing to add (Japan, with years), clicking to add with a status (France → Lived), edit/remove/undo (years and status both restored correctly), the panel with live sort and the territory total line, and a territory (Puerto Rico) saved as Home with no years — **the header count and the panel's "of 195" line both stayed exactly unchanged**, confirming status and territories really don't leak into the official count anywhere in the real code, not just in the parts that were being watched. Zero console errors, zero network requests after the initial load. Export produced a valid, correctly-sized JSON file via a real browser download event.

**Mobile, tested for real, with one thing worth remembering for whoever tests this next:** the phone "home" view is deliberately zoomed to Europe/Africa, not the whole world (spec §6.4) — a country outside that band (e.g. Brazil) is off-screen at rest by design, not a bug. A test clicking an out-of-frame country will genuinely miss; use a country the default framing actually shows (France, Nigeria, …) or reset first.

**PWA, re-verified against the real `app/` build (not just the study's copy):** manifest valid, all 3 icons resolve, service worker registers/activates/controls the page, and — the test that matters — **a fully offline hard reload still renders the complete map.** `manifest.webmanifest`/`service-worker.js`/`icons/` moved into `app/` itself (paths simplified to same-directory, no more `../../../`).

**A real, honest budget correction, not hidden:** spec §4.1's original 30 KB hand-written-code budget was set in Phase 0, before territories, the status model, save-by-link, the About card, or real Export/Import existed. The real build measures **56.5 KB** (HTML+CSS+JS). Traced every KB to a named, user-requested feature rather than assumed it was fine — spec §4.1 now carries the real number, a revised 70 KB target, and the reasoning.

**B1** shell+render, **B2** hover/tooltip/select/popover, **B3** combobox+years (`logic.js`+tests), **B4** save/persist/animate, **B5** panel+table, **B6** dots/zoom/pan/fly-to (incl. the pre-existing zoom-clamp fix from the study, re-verified in the real build), **B7** undo+export+import (import is real now — file picker + `validateImport`, not the study's toast placeholder), **B8** the About card (bottom-right pill, counts read from `COUNTRIES.length`/`TERRITORIES.length` so it can't drift from the data; opens/closes on click, Esc and outside click, and **V2 confirmed it clears the reset button at 360/390/430**), **B9** status model, **B10** save-by-link/email/Clear map, **B11** save-state indicator + installable PWA — all ✅, all in the file list above, all covered by the verification described here.

**Owed, not done (moved to Phase 2, V2/V3):** ~~a dedicated 360/390/430 px sweep~~ **done in V2**; frame-time profiling of hover/zoom/save under load (**V3, still owed**); a full WCAG contrast pass on the shipped Atlas palette (**V1, still owed** — spot-checked during the design study, never re-verified against the final built CSS).

---

## Phase 2: Polish + verify

### V1 · Accessibility pass ✅ *(2026-09-14)*
Keyboard-only run of J1, J3, J4. Focus stays inside the popover and panel while open and returns afterwards. Contrast is checked for every text/background pair in the chosen palette. The map `<svg>` has a label, and the table carries the same information as the map.
**Accept:** no keyboard traps; all text ≥ 4.5:1.

**Three real gaps found running J1/J3/J4 keyboard-only, none of them "the code is written but untested" — genuine holes in what keyboard access this app offered:**

1. **A table row was the only route to an already-saved country's Remove control, and rows had no `tabindex` or keyboard handler at all.** The map itself is deliberately mouse/touch-only (spec §4.2 already calls this out as acceptable, since the typed combobox reaches every country without it) — but removal has no OTHER path once a country is in the table, so this wasn't the same kind of gap. Fixed: rows get `tabindex="0"` plus an `aria-label` ("*Country*, edit or remove"), and Enter/Space on a focused row does what a click does — factored into one `openRow(tr)` function so the click and keydown listeners can't drift apart. Kept the `<tr>` itself (no `role="button"`, which would have stripped its row semantics from the table).
2. **Neither the popover nor the panel contained Tab while open.** `inert` was already used to keep Tab from reaching a *closed* dialog's contents (a fix from the design-study phase) — but nothing stopped Tab from *leaving* an *open* one, so tabbing past the popover's last field landed on the header pills or zoom buttons behind it. Fixed with one small `trapTab(container, e)` used by both dialogs, rather than writing the cycling logic twice.
3. **Closing either dialog could drop focus to nowhere in particular.** `inert`-ing a container blurs whatever was focused inside it, and neither `closePop()` nor `closePanel()` did anything after that — focus fell through to `<body>`. Fixed: `closePanel()` always returns focus to `#countBtn` (its one and only opener); `closePop()` restores focus only when it was opened through the one keyboard-reachable path (a table row) — a raw map click has no keyboard-focus concept to return to, so that case is deliberately left alone rather than forcing focus somewhere arbitrary for a mouse user.

**Accept, verified with real keyboard-only interaction (Tab/Enter/type, no mouse) and a script-computed contrast audit, both re-run after an initial pass whose two "failures" turned out to be the test script's own mistakes** (a stray extra `Tab` press, and reading a dialog's leftover text without confirming it was actually open — re-isolated and confirmed the app was correct both times, worth recording as a reminder to verify a suspicious result before reporting it as a defect):
- J1 (typed add): reaches `#country` by Tab, choosing from the list moves focus straight to Year(s) (already true, not new), typing + Enter submits natively.
- J3 (row → popover): a row is reachable and focusable, Enter opens the right country's popover (verified against `document.activeElement.dataset.iso` immediately before the keypress, not just the visible text afterward), editing years via keyboard and submitting saves correctly, and focus returns to `#countBtn`.
- **Tab-containment:** 40 consecutive Tab presses inside the open panel, and 20 inside the open popover, never once left the container.
- **No traps:** Escape closes either dialog from any focus position inside it.
- **Contrast:** every real text/background pair in the shipped CSS — including bold and muted text on the translucent `.glass` chrome blended over the map's own water and land colours, not just solid white — clears 4.5:1 (5.4:1 to 12.3:1). The only two pairs under 4.5 (placeholder text at 3.5:1, a disabled button's glyph at 1.9:1) are both explicitly out of WCAG 1.4.3's scope, not silently ignored.
- Full regression: 19/19 tests, all mobile/desktop journeys, the pinch-gesture and keyboard-avoidance fixes — all still pass.

### V2 · Mobile: design, not adaptation *(re-scoped 2026-09-14 on the owner's directive — spec §4.7)*
**This was a checklist task and is now a design task.** The old criteria ("no horizontal overflow, touch targets ≥ 44 px, J1/J2/J4/J5 work on each width") are kept as the *floor*, but they could never have failed on the grounds that actually matter — nothing in them can catch *ugly* or *janky*, which is precisely why the defects in spec §4.7 survived Phase 1 with mobile nominally "verified."

**Work items, each traced to a real defect found at 360/390/430 px (§4.7), not invented:**
1. **Re-frame the map vertically** — kill the ~200 px dead ocean band; the map should use the height a phone actually has.
2. **Give the entry bar an idle state** — it should not hold ~25 % of the screen hostage while empty. (A collapsed single-tap affordance that expands into the current three-row sheet is the obvious candidate; needs designing and trying, not assuming.)
3. **Fix the 360 px crop** so the default framing doesn't clip a country the owner has actually marked — India is clipped today.
4. **Anchor the about pill** instead of leaving it mid-ocean.
5. **Rethink the table for a phone** — four desktop columns at 360 px force two-line wraps and jumping row heights. Decide what a phone row *is*, rather than shrinking a desktop row.
6. **Design a touch equivalent for hover.** Desktop reveals a country's name on hover before you commit; touch has no such state today (`app.js` returns early unless `pointerType === "mouse"`), so a phone user must open a popover to learn what they're looking at. This is the sharpest inequality between the two experiences.
7. **Profile on a phone**, per the corrected §4.1 budget — pinch-zoom and the save animation, not just hover.

**Accept — deliberately written so that "it works" is not a passing grade:**
- Side-by-side screenshots at 360/390/430 and desktop, **judged by the owner** (spec R5), with mobile held to the same standard as desktop rather than graded on a curve. This is the real gate; the rest are floors.
- The map occupies a defensible share of the viewport at rest at every width, with no dead band and nothing the owner has marked clipped out of the default frame.
- Identifying an unlabeled country on touch takes no more commitment than it does on desktop.
- 60 fps through pinch-zoom, pan, and save on a mid-range phone profile — measured, not eyeballed.
- The old floor still holds: no horizontal overflow, touch targets ≥ 44 px, J1/J2/J4/J5 pass at each width.

**Built and verified 2026-09-14.** Every work item above is done. Verified at 360 / 390 / 430 × 800 and in landscape, against the real `app/` build:
- **Dead band gone, and by construction rather than by nudging.** The old framing squeezed the map's full height into `(H − 330) px`, which forces a viewBox *taller than the map* — at 430 × 800 it asked for 786 units of a 462-unit map, so ~40 % of the screen was necessarily void. The scale now derives from the viewport height, so the viewBox lands on `GEO.h` exactly (verified: `y=0.0 h=462.0`) and there is no arithmetic room for a gap.
- **Idle entry cost: ~25 % of the screen → 0.** The sheet is summoned by a pill and slides away on submit, ✕, Escape, or a map tap.
- **Corner chrome is in the corners** — the `bottom:236px` / `bottom:288px` magic numbers (measured off the parked sheet) are gone.
- **Phone table rows** — no wrapping at 360 (`rows-fit=true` at all three widths), sort chips scroll, *# Times* dropped on phones only.
- **Hover has a touch equivalent**: press-and-hold peeks the name (verified: shows "France"), and the release is suppressed so a peek never opens the popover.
- **Forgiving tap**: a tap 14 px into open water beside Malta still opens Malta.
- **Touch targets** all ≥ 44 px with everything visible (`#addBtn` 48, `#reset` 44, `#countBtn` 44, `#aboutBtn` 52, `#popClose` 45, `#pClose` 46, `#exp` 47, sort chips 44) — the compact controls grew invisible hit areas rather than visual bulk.
- **Journeys J1/J2/J4/J5 pass at all three widths**, no horizontal overflow, zero console or page errors; a territory still moves neither the header count nor "of 195" (`6→6` at every width).
- **Desktop is unregressed** — world view at rest, hover tooltip works, popover still anchors *beside* the country at 272 px rather than docking, entry bar still permanently open, add pill absent.
- **Reduced motion** and an **offline reload** (302 shapes) both still correct on mobile.

**Three real defects were introduced during V2 and caught by looking at the screenshots, not by the assertions** — worth recording because all three passed every programmatic check at the time: (1) the first framing attempt silently zoomed to ~75° of longitude because a `Math.max` clamp overrode the content fit; (2) a touch-target rule set `position:relative` on `.x`, overriding its `absolute` and dropping the popover and panel close buttons out of their corners into the flex flow; (3) the "+ Add a country" pill floated on top of the popover's Submit button, because hiding it was wired to the entry sheet only. **Programmatic checks confirm what you thought to assert; the screenshots catch what you didn't.**

**A latent bug fixed in passing:** `animateTo(to, 0)` produced `NaN` in the viewBox — a zero duration divides by zero, and rAF can return a timestamp fractionally *before* `t0`, so when an axis's from/to delta is also 0 the multiply is `0 × Infinity`. Nothing in the app passes 0 today, but the failure mode is a completely blank map, so it's guarded now.

### V2a · Zoom buttons + the pinch-gesture rewrite ✅ *(2026-09-14, owner report: "pinch to zoom is glitchy — sometimes it thinks I'm clicking on a country")*
Permanent `+` / `−` controls: bottom-left on a phone (add pill centre, reset right — a control under each thumb), bottom-right on desktop as a column with reset above and the counts pill beside it. They zoom about the screen centre, animate, and disable at the ends of the range instead of becoming dead taps.

**The report was a symptom of four real bugs in the pointer handling, all fixed** (`app.js`, "pan / pinch / wheel"), which is why this wasn't just a button task:
1. **`moved = false` ran on every `pointerdown`, including the second finger** — so landing finger two erased the fact that finger one had already moved. A short pinch ended with `moved === false`, the trailing click fired, and a country's popover opened. **This is precisely the reported symptom.**
2. The second finger also overwrote `drag`, capturing its own start point and a fresh `drag.view` mid-gesture.
3. **Lifting one finger of a pinch left `drag` stale** (it was only cleared at zero pointers), so the remaining finger resumed panning from the *other* finger's start point against an out-of-date view — the map jumped. That's the "glitchy".
4. `pointercancel`, which touch fires readily, deleted the pointer but left `drag` and the `.panning` class wedged.

Now one finger pans, two fingers pinch, a pinch sets `gestureClick` so it can never land as a tap, and dropping back to one finger re-seeds the pan against the *current* view. Also fixed while here: rapid `+` taps used to compose from the half-interpolated view, so three quick taps delivered less than three steps and the zoom only approached its limit asymptotically — taps now compose from any in-flight animation's target (`tweenTo`), so they land exactly on the clamp and the button disables.

**Accept, verified by dispatching real CDP touch events at 390 px:** a pinch zooms (viewBox 225 → 87) and opens **no** popover; a tiny/aborted pinch opens no popover; lifting one finger of a pinch then panning 4 px shifts the view **0.00 map units** (no jump); a plain tap still opens the popover; 12 rapid `+` taps land exactly on `base.w/12` and disable `+`; 16 rapid `−` taps land on `base.w` and disable `−`; targets 44×44; **no overlap between any pair of bottom controls on phone or desktop**; 19/19 tests and all journeys still pass at 360/390/430 and desktop.

**Still owed (V3, not V2):** frame-time profiling on a throttled mobile CPU. V2 verified correctness, layout, and input on mobile; it did **not** measure the 60 fps criterion, which needs a throttled profile rather than a headless desktop GPU. That criterion is explicitly **not** claimed as met.

### V2b · Keyboard-avoidance for the popover ✅ *(2026-09-14, owner report: "when I click a country the phone's auto pop-up keyboard overlaps and covers the text box entry fields")*
The entry sheet already lifted clear of the on-screen keyboard (`--kb`, tracked via `visualViewport`) — but that tracking was gated on `bar.classList.contains("up")`, so it forced `--kb` back to 0 whenever the entry sheet was closed. **A country's popover has its own text input and is *also* a docked bottom sheet, and the popover being open is exactly the case that gating zeroed out** — so the one sheet a phone user opens most often (tap a country → fill in years) got no keyboard avoidance at all. That mismatch, not a missing feature, was the bug.

Fixed by tracking `--kb` unconditionally (whenever the viewport is phone-width) on the root element rather than on the bar itself, so every docked sheet reads the same value: `.pop`'s mobile rule now uses `bottom:var(--kb,0px)` exactly like `.bar` already did. Also added, since the same fix touches the same surface: both sheets now cap `max-height` to the space actually left above the keyboard and scroll their own content (`overflow-y:auto`), so a short phone in landscape with the keyboard up degrades to a scrollable sheet instead of pushing Submit off the top of the screen.

**A regression caught before delivery, worth recording:** tracking `--kb` unconditionally (rather than gated on the bar being open) broke the entry sheet's *closed* state. That state hides the sheet with a fixed `translateY(calc(100% + 28px))`, which assumes the sheet's untranslated resting position is exactly the true viewport bottom (`bottom:0`). Once `--kb` could be nonzero while closed, the resting position moved *up* by the keyboard height, the same fixed `translateY` no longer cleared it, and opening a country's popover while a keyboard was up dragged the dismissed entry sheet visibly back into view underneath it. Fixed by keeping `.bar`'s closed `bottom` hardcoded at `0` and moving the `var(--kb,0px)` read into `.bar.up` only, where the transform is cancelled and `bottom` starts actually meaning something on screen. `.pop` needed no such split — its closed state hides via `opacity:0`, not a position-based offset, so tracking `--kb` unconditionally was always safe there.

**Accept, verified by overriding `visualViewport.height` and dispatching the real `resize` event the app listens for** (exercising the production code path, not just the CSS): opening a country's popover then faking a 300px keyboard lifts the popover exactly 300px clear, landing its input inside the unobscured area, **and leaves the closed entry sheet fully off-screen** (top ≥ viewport height); the popover returns to the bottom when the keyboard closes; the entry sheet, opened, lifts the same way (320px keyboard → sheet bottom at exactly `screenHeight − 320`) and returns to the true bottom when the keyboard closes; an extreme 650px keyboard caps the sheet's height and makes it scroll rather than clipping Submit off-screen; desktop's `--kb` stays unset and is untouched. 19/19 tests and all journeys still pass.

### V3 · Size + performance audit ✅ *(2026-09-14)*
Record byte counts for `app/*` against spec §4.1. Profile hover, zoom, pan, and the save animation — **on a throttled mobile profile, per §4.1's corrected budget**, since the laptop figure was never the binding one.
**Accept:** hand-written code ≤ 80 KB code-excluding-comments (§4.1); `geo.js` within budget; no long tasks > 50 ms during interaction.

**Size, via `tools/measure-size.mjs`:** 54.4 KB of 80 KB — 25.6 KB headroom. `geo.js` (generated, not hand-written, so it isn't part of that count): 297.5 KB raw / 86.4 KB gzip, both inside the ≤300 KB / ≤90 KB budget with a small margin.

**Performance, profiled under Chrome DevTools' own 4× CPU throttle — the standard proxy for "mid-tier mobile," per spec §4.1's corrected wording (a laptop was never the binding constraint):** pinch-zoom, pan/drag, and the save-and-ripple animation, all on a mobile-emulated context with a real seeded map (13 countries, so dots/glyphs and fills are actually rendering, not an empty map); hover swept separately on desktop, since it has no touch equivalent. Measured two things directly rather than eyeballing smoothness: a `requestAnimationFrame`-driven frame-time recorder (looking for any frame that missed a WHOLE extra vsync — ≥30 ms — since single-frame deltas a fraction of a millisecond either side of 16.7 ms are normal measurement jitter, not real jank, and a first pass using that tighter cutoff produced noise rather than signal), and a `PerformanceObserver` buffering every `longtask` entry (>50 ms) for the page's whole life.

**Result: zero dropped frames (>30 ms) and zero long tasks (>50 ms) across all four interactions**, every single frame landing within ~16.8 ms even under 4× throttling. The likely reason, and it's a real property of the code rather than a lucky measurement: `apply()`/`sizeToScreen()` do very little CPU work per frame — a viewBox attribute write plus resizing ~100 dot/marker elements — so there isn't much for a CPU throttle to reveal in the first place; the cost of 302 SVG paths is mostly a paint/composite cost, which `Emulation.setCPUThrottlingRate` doesn't scale (it throttles script execution, not GPU compositing).

**Honestly not verified, stated rather than assumed, matching B11's own precedent for this kind of caveat:** this is a *headless* Chromium proxy for a mid-range phone, not a physical device — no real GPU/thermal/memory-pressure behavior, no real touchscreen latency. It's the right tool for catching an actual JS-side regression (a runaway per-frame computation, a memory leak under repeated gestures) and it found none; it cannot promise the same numbers on an actual three-year-old Android phone in someone's pocket. That gap is exactly what V4's real-device use is for.

### V4 · User inspection round → v1.0 ✅ *(signed off 2026-09-14)*
The user uses the real app with real data. Expect at least one round of feedback; fix root causes, not symptoms.
**Accept:** the user signs off. Tag v1.0 in `handoff.md`.

**✅ ACCEPTED — "V4 signed off" (owner, 2026-09-14). v1.0 tagged in `handoff.md`.** Six rounds, nine findings, every one traced to a root cause rather than patched at the symptom. Worth recording what the round structure actually bought, since the estimate at the top of this task was "at least one round" and it took six: rounds 1–3 were features and refinements the owner could only ask for once the app was in their hands (year periods, labels, the name/code fallback); **round 4 was a bug that had made rounds 2–3 partly invisible to them and would have hit every future visitor after every deploy**; rounds 5–6 were design corrections to round 3's own work, both of which needed the owner's eye rather than any check available here. Two of the nine findings were reported as "I don't see the labels" and had *different* causes — the value of V4 was not the count of bugs but that the reports came from someone using the app rather than testing it.

**Explicitly NOT claimed by this sign-off, and carried forward rather than quietly closed:** frame-time profiling on a **physical** phone (V3 measured Chrome's 4× CPU-throttle proxy and said so), and the iOS 7-day-eviction exemption for an installed PWA (asserted in B11, never verified). Neither was ever a blocker; sign-off doesn't retroactively verify them.

**Round 1 (2026-09-14) — four findings from real use, all fixed at the root, not patched at the symptom:**

**1. Year PERIODS for Lived/Home** *(new feature, spec F21)*. "UK 2011-2014", "Canada 2023- (to present)" — a genuinely continuous stretch, which the old model (a flat list of individual years, meant for discrete trips) couldn't express at all. Visited keeps plain years only — "visited continuously from X to Y" isn't a coherent idea the way "lived there from X to Y" is — so a period is only accepted once the record's own status isn't Visited (the popover gates on `pendingStatus`; the entry bar, which has no status picker, gates on the EXISTING status of that country, matching how it already never downgrades an existing Lived/Home).
- **Data model:** `y` entries are now `number | {from, to}`, `to: null` meaning ongoing. Every consumer updated: `parseYears` (grammar extended, `allowRange` param), the URL codec (`~FF~` / `~FFTT~`, tilde never collides with the `-` place-separator — verified `doesNotMatch(/--/, …)`), `validateImport`, table sort (`latestYear` — an ongoing period always sorts as most recent), and two new display helpers: `formatYearsEdit` (round-trips through the input field exactly) and `formatYearsDisplay` (an en dash and "present" for reading, e.g. "2011–2014", "2023–present").
- **Accept, verified:** 5 new pure-logic tests (parsing, formatting, the codec, `validateImport`) plus a full browser round-trip — set via the popover, reopened (edit value and display meta both correct), saved-by-link through a real reload, exported and re-imported — all lossless. An ongoing period correctly outranks even a later plain year when sorting the table. A period typed while Visited is selected is rejected with the old, unchanged error wording (existing behaviour untouched). 26/26 unit tests pass.

**2. Mobile: typing a country manually truncated the dropdown list.** Root cause: the dropdown (`#list`) lived nested inside the entry sheet (`#entry`), and the sheet gained `max-height` + `overflow-y:auto` for keyboard-avoidance (§V2b) — since the dropdown floats entirely ABOVE the input, outside the sheet's own box, that clip silently ate it (measured: 0% of the list rendered inside the sheet's clip region). Making it `position:fixed` with an explicit z-index was not enough on its own — reparenting it confirmed the real fix, empirically: **`#list` is now a body-level sibling of `#entry`**, matching every other floating surface in this app (`#pop`, `#tip`, `#toast`, `.panel`), positioned in JS from the field's (desktop) or the whole sheet's (mobile — the sheet has its own title bar above the field, so anchoring to the field alone floated the dropdown over that title) on-screen position, recomputed on every keystroke.
- **Accept, verified:** the dropdown renders as a proper card, all results visible and tappable, at 360/390/430 and desktop; still correctly repositions when a simulated keyboard raises the sheet; a tap on a result opens/chooses it (this failed outright before — Playwright's own hit-test agreed with the browser's, the map underneath was receiving the tap); desktop's positioning and search ranking unregressed. 26/26 tests, full journey/gesture/keyboard/a11y regression all still pass.

**3. Country/territory name labels on the map** *(new feature)*. One label per tracked place (240 — the 195 + 45 territories, not the 6 inert areas, consistent with how those are already excluded everywhere else), centred on the same anchor point dots and status glyphs use, `pointer-events:none` so a label can never steal a tap meant for the shape beneath it. Font size is a constant ~10px on screen (the same counter-scaling trick as dots), and each label reveals only once its own place is large enough on screen to read — no hand-picked per-country list.
- **A width-only reveal rule doesn't reach every country — measured, not assumed:** Vatican/Nauru/Tuvalu are dots with no real width at all, and San Marino/Liechtenstein/Monaco are genuine shapes too small to EVER clear a sane pixel threshold even at this app's own 12× zoom ceiling (5px wide at max zoom). Any place that can never cross the width threshold falls back to revealing by ZOOM LEVEL alone instead — the same idea a point-marker label uses on any map.
- **Colour has to flip with the fill, not just size** — `--border-line` reads at 8.8:1 on land but only 1.7:1 on the dark red visited fill (measured); `paint()` now mirrors the same `.is-visited` toggle onto each place's label that it already puts on the shape, swapping to a warm off-white (6.5:1 on visited).
- **A real performance regression, found and fixed before delivery, not after:** re-running V3's own throttled-CPU profiling method after adding labels showed 3 dropped frames and two long tasks during pinch-zoom that weren't there before — a per-frame cost from re-querying and restyling 240 elements every rAF tick. Fixed: the label list is queried once at render time (not every frame), font-size is set ONCE on the group via CSS inheritance instead of 240 times, and the opacity pass is throttled to ~20/s rather than every tick. **Re-profiling after that fix still showed the same 3 dropped frames — but disabling the label code ENTIRELY reproduced the identical result**, proving labels aren't the actual cause; most likely accumulated load from a very long test session (many Chromium launches). Reported honestly rather than either hidden or wrongly blamed on the new feature; a fresh, isolated V3 re-check would settle it definitively but isn't blocking.
- **Accept, verified with real screenshots, not just measured numbers:** at world view, large countries (Russia, Brazil, Canada, USA, China…) show readable names immediately; small ones stay hidden; visited countries' labels read clearly in the light colour on the dark red fill. Zoomed into Europe, most countries reveal cleanly (a few very small, tightly-clustered ones — the Balkans — overlap at that zoom, a known limit of a threshold with no cross-label collision avoidance, not attempted here). Force-zoomed on Vatican, San Marino, and Luxembourg individually at the app's own max zoom: every one now reveals its label, which a first version of this threshold did not (Luxembourg sat at 29.9px against a 30px cutoff — just short, forever).

**4. "Email me this map" sent a nonsense link.** Reported: `content://downloads/all_downloads/2553#m=…` in the user's inbox. Root cause: the mailto body embeds `location.href` directly, which assumes the page has a real, stable address — true on http(s), but **not on a downloaded file**: Android hands a tapped local file to the browser as a `content://` URI with no folder and no guaranteed long-term validity, and this is not an edge case — it's the standard result of the normal "download and open" flow every phone user of the single-file build goes through. Fixed: `location.protocol` is checked, and on anything other than `http:`/`https:`, the button now triggers the already-proven Export download and opens a mailto draft explaining that a link isn't possible from this copy of the app and asking the user to attach the file that just downloaded, with plain instructions for restoring it later via Import — reusing the protocol-independent mechanism this app already had, rather than emailing something that cannot work.
- **Accept, verified:** on `http://`, the mailto body is byte-identical to before (a real, working link). Loaded over a REAL `file://` URL (not simulated): the mailto body contains no broken link, a genuine file download fires (`travelmap-2026-09-14.json`), and the body explains what to do with it.

**Round 2 (2026-09-14) — one finding, a real design gap in round 1's own new feature, caught immediately rather than dismissed as "check your file":**

**5. "I don't see the country labels."** F22 (round 1) was verified with real screenshots and looked fine on inspection — so the first instinct to check was whether the report meant an old file, not a bug. It wasn't. **The contrast check done while building F22 measured the label colours at FULL strength** (border-line on land: 8.8:1; the light swap on visited: 6.98:1) **— but labels render at reduced opacity** (0.7 / 0.92), and the contrast that actually reaches the eye is against the *opacity-blended* colour, a materially different number: 0.7 on land blends down to **4.08:1, under the 4.5 minimum**, on an already-small ~10px label. Technically present, genuinely easy to miss at a glance — which is exactly what got reported. Raised the resting opacities to 0.9/0.95 (blending to 6.8:1 / 6.0:1) — legible without being loud, still short of full-strength "shouting."
**Accept, verified:** the same real single-file build, on a fresh mobile viewport, with sample opacity confirmed at 0.9 (not 0.7) — a visible strength increase in the screenshot, not just a number. 26/26 tests still pass; size 59.7 KB unchanged (a CSS/JS constant, not new code).
**Lesson for next time a reveal/opacity threshold gets tuned: check contrast at the RENDERED opacity, not the swatch's full-strength colour** — the earlier F22 verification checked the right thing (colour swap for visited/unvisited) but the wrong number (100% instead of what actually ships).

**Round 3 (2026-09-14) — a name/code fallback + small caps, requested as a refinement to F22; two real bugs found and fixed while building it, both would have shown up first on a phone:**

**6. Name-vs-code fallback + small caps** *(F22 extended)*. "If a country label spills outside its border, use the ISO code instead; names and codes both in small caps; confirm it works on both platforms." Implemented as a real geometric fit-check, not a guess: each label's full-name width is measured ONCE at boot (`getBBox()` at a fixed 10-unit reference font-size — an SVG layout read, fine once for 240 elements, not fine every frame, which is exactly why it's cached rather than done live); at the throttled per-frame pass, the estimated current width (`refWidth / scale`, since text scales linearly with font-size) is compared against the place's own on-screen extent, and the label swaps to its lowercase ISO code the moment the full name would overflow. Small caps (`font-variant:small-caps`) only affects lowercase letters, so both the name and the code are stored lowercase in the DOM — feeding it "France" would render one full-height "F" beside small "rance"; every letter needs to start lowercase for a uniform small-caps look. A dot-rendered place (no real outline — Vatican, Nauru, Tuvalu) always shows its full name; "spills outside its border" is a shape concept, and a point marker has no border to spill out of.

- **Bug 1, a latent throttle gap, found by chaining several quick flyTos in a test rather than assumed away:** the ~20/s label throttle (added for performance in round 1) could permanently strand a label on a stale decision. A one-shot `flyTo`/`animateTo` settles in a single frame; if that frame lands inside the 50ms throttle window, nothing else calls `sizeToScreen()` again to correct it, and the label is stuck wrong until some unrelated later interaction happens to fix it. Confirmed directly: Vatican's label stayed hidden after a quick fly-to that should have revealed it. **Fixed with a trailing call** — the standard fix for this class of bug — guaranteeing the final state is always eventually applied a short delay after the last real update, without giving up the original throttling during a continuous gesture (pinch/pan still only run the full per-label loop ~20 times/sec).
- **Bug 2, a platform-scaling bug, found by computing the real numbers rather than trusting a desktop-only screenshot:** the constant that decides when a dot/degenerate place (Vatican, San Marino, Monaco…) reveals by zoom level was a fixed scale value (6), tuned against desktop's own achievable max scale (~16.6). Since `scale = innerWidth / view.w` and the zoom ceiling is a fixed ratio of `base.w` regardless of screen width, **a narrower phone's own maximum achievable scale is proportionally lower** — measured directly: 4.5 at 390px wide, 4.96 at 430px, both *below* the fixed threshold of 6. Vatican's label could never reveal on a phone, at any zoom, full stop. Fixed by expressing the threshold as a **fraction of each platform's own max scale** (0.36/0.24, chosen to reproduce the exact desktop numbers this was tuned against) rather than an absolute value — the same principle the width-based reveal already used correctly, just missed for the zoom-based fallback.
- **Accept, verified with real numbers and real screenshots, not just "looks fine on desktop":** Bosnia and Herzegovina (small, long name) correctly shows its code ("bih") at rest and swaps to the full name once truly zoomed in on desktop (measured: estimated width 7.04 map units against an 8.83 limit — fits) and correctly *stays* on its code on a 390px phone even at that platform's own max zoom (estimated width 26.0 against the same limit — genuinely doesn't fit on a narrower screen, which is the physically correct outcome, not a bug: the same on-screen pixel budget covers less of the map on a narrower screen, so a fixed-size label is relatively larger against it). Vatican (dot) now reveals correctly at each platform's own max zoom — desktop, 390px, and 430px all confirmed directly. Small caps renders uniformly (verified via `getComputedStyle().fontVariant`). Full regression (26/26 tests, every prior V4 fix, V3's own frame-time profiling) still passes; size 60.8 KB of 80.
- **Lesson, twice over in one round: verify against the ACTUAL device class being designed for, not just the one already open.** Both bugs here — the throttle gap and the platform-scale gap — were invisible from repeated desktop-only spot checks and only surfaced once a phone-width viewport (or a deliberately adversarial test sequence) was actually exercised end to end.

**Round 4 (2026-09-14) — the most important finding of the whole V4 process, and the one that invalidates part of how rounds 2–3 were diagnosed:**

**7. "I still don't see country labels on my desktop at localhost:5180/app/."** Labels demonstrably worked in every automated check against that exact URL. The difference was never in the code — **the service worker was serving a frozen copy of `app.js` and `styles.css`.**

- **Root cause:** `service-worker.js` was cache-first over an app shell keyed to a hand-maintained version string (`nomad-travel-map-v1`), with a comment instructing "bump CACHE when any precached file changes." Across this session `app.js`/`styles.css` changed roughly twenty times and CACHE was **never bumped once**. Any browser that had loaded the app even once kept serving the version it first saw — silently, no error, no visible clue, indefinitely.
- **Reproduced before fixing, not assumed:** persistent browser profile → load (SW caches version A) → edit the file on disk → reload → still version A, with version B never reaching the page. Confirmed directly rather than argued from the code.
- **Fixed by changing the strategy, not just bumping the number** (bumping alone would have fixed today and re-broken on the next edit): **network-first with cache fallback**, plus CACHE → v2 so existing poisoned installs drop v1 on activate. The original reasoning ("files never change without a new CACHE name, so there's nothing to gain from a network race, only latency to lose") was internally sound but depended on a discipline that demonstrably did not survive real development — and its failure mode (a permanently stale app, invisibly) is far worse than the cost it was avoiding (one round-trip on a ~400 KB app served from localhost or a CDN). What F20 actually requires is that the cache EXIST when the network is gone, not that it win when the network is right there.
- **Recovery path measured, not guessed:** starting from the exact poisoned state, **two reloads** — the first fetches and installs the new worker, the second serves fresh files and deletes the v1 cache.
- **Accept, verified:** offline still fully works under network-first (offline hard reload renders 302 shapes, 128 labels, "russia" reading correctly, zero errors) — F20's guarantee is intact; only successful same-origin responses are cached, so an error page can't poison the cache the way a stale 200 just did; 26/26 tests and the full journey/label/dropdown regression all still pass; labels confirmed rendering in a real (non-headless) browser at the reported URL.

**The methodological lesson, which matters more than the bug:** every automated check in this project launches a **fresh browser context**, which by construction has no service worker and no persistent cache. That environment is *structurally incapable* of reproducing any persistent-state bug — stale SW caches, corrupted localStorage, an old IndexedDB schema. For a whole session "verified in a fresh browser" was treated as equivalent to "works for the owner," and it simply isn't: the owner's browser carries state mine never had. **Round 2's contrast finding (4.08:1, genuinely below AA, a real defect worth fixing on its own) may well not have been what they were actually hitting** — the stale cache plausibly explains that report too, and the honest position is that the contrast fix stands on its own merits while its diagnosis of *that specific report* is now uncertain. Any future "it doesn't work for me but passes here" report should check persistent client state **first**, before re-examining the code.

**Round 5 (2026-09-14) — one finding, a refinement to F22 that turned into a second lesson about the same platform trap:**

**8. "The country labels have a static font size — upon zooming in the font looks way too small."** Correct, and by design rather than by accident: labels were counter-scaled to a constant ~10px on screen, exactly like the dots and status glyphs, so zooming in grew the country and left the type alone. At the 12× ceiling a country fills the screen under the same small text it carried at world view, which reads as under-scaled next to everything around it. Requested: keep the zoomed-out size, grow continuously on the way in, "perhaps 0.5 for every step of zoom… test and see what works best."

- **Measured the premise first.** The owner counted "around 20" wheel steps across the zoom range; the real number is **14** (the wheel handler turns one standard `deltaY=100` notch into 1.197×, and ln(12)/ln(1.197) = 13.8). Neither figure is wrong — high-resolution wheels emit finer, more frequent deltas — but it means **"+0.5px per notch" is not a device-independent specification**: the same rule would hand a different maximum size to a different mouse. The ramp is therefore pinned to the zoom *range* (10px → 17px), which is identical on any pointing device and works out to the requested 0.5px/step on a standard notch — measured at 0.50–0.51 across all 14.
- **Linear in zoom STEPS, not in the zoom factor.** Each notch multiplies zoom by a constant, so "equal pixels per notch" is a log ramp. Growing linearly with the zoom factor instead would have spent almost the whole increase in the last two or three notches and left the middle of the range looking untouched.
- **The first attempt was wrong, in the project's own established failure mode, and the screenshots caught it.** Normalising the ramp over *each platform's own* available zoom gave both desktop and phone the same 10 → 17px endpoints. That looks symmetrical and is visually wrong: at its ceiling a phone shows the **same slice of the world** as desktop-at-ceiling in a third of the pixels, so every country there is ~3.7× smaller on screen. 17px labels over a map that small buried Europe in overlapping text — verified by looking at the render, not the numbers. **This is the V4-round-3 platform-scaling trap wearing a different hat** (there: a reveal threshold tuned to desktop's max scale that a phone could never reach; here: an endpoint tuned to desktop's zoom depth that a phone shouldn't reach). Fixed by normalising over a **fixed** span instead, so a step of zoom is worth the same half-pixel everywhere and the phone simply stops at ~12.7px, having only ~2.6× of zoom above its resting frame.
- **The fit check had to learn about the new size.** F22's name → ISO-code fallback estimated a label's width as `nameW / scale`, which silently assumed the font was always the reference 10px. Left alone, every label would have been fit-checked against a size it no longer had, and a grown name would have spilled past its own border — precisely what the fallback exists to prevent. It now carries the live size (`nameW × fpx / (10 × scale)`), which collapses to the old expression exactly when `fpx` is 10, so resting behaviour is unchanged by construction.
- **The resting frame is the right anchor, and the numbers say so rather than the convenience.** "Fully zoomed out" means the frame the app rests at, which is `base.w` on desktop but a band ~4.6× in on a phone. Anchoring each platform to its own rest is what keeps the approved 10px look identical on both — and it isn't a fudge: a country covers about the same number of pixels at phone rest (1.73 px/map unit) as at desktop world view (1.39), so the two really are the same apparent size. A phone that pinches *out* past its resting frame is clamped at 10px rather than shrinking below the size the request asked to preserve.
- **Performance: the honest version.** Re-running V3's method showed desktop wheel-zoom dropping 0/1/2 frames across three runs with the ramp live against 0/0/0 with it neutralised — a difference small enough to be either a real regression or noise, and this project has already once blamed labels for jank that wasn't theirs. Settled it by direct instrumentation instead of more repetitions: the ramp costs **0.07 ms per frame** (`sizeToScreen` 0.49 ms vs 0.42 ms; `updateLabels` 0.45 ms vs 0.42 ms over a 28-notch sweep). A 0.07 ms addition cannot produce a 33 ms frame, so those counts are noise. Label text rewrites actually went **down** (206 vs 241 per sweep) — a growing font moves the fit ratio more slowly, so labels settle instead of thrashing. Mobile pinch dropped exactly 3 frames in *both* arms, 3 runs each, confirming that long-standing artifact is still not the labels.
- **Accept, verified across every width this project holds itself to** (360/390/430/800×600/1280/1440/1920, plus landscape 800×390): **10px at rest on every single one** — the request's own constraint, preserved exactly — 10px again when zoomed fully out past the resting frame, 17px at every desktop ceiling, 12.5–13px at each phone's, ~0.5px per notch throughout, 239–240 labels visible at the ceiling, zero console or page errors. Confirmed in a real (non-headless) browser at the owner's own URL: 17px, 240 labels, the code fallback still correct (Equatorial Guinea → "gnq" while its larger neighbours keep full names). 26/26 tests pass; size 61.3 KB of 80.
- **One consequence worth stating plainly rather than leaving to be discovered:** a bigger font genuinely doesn't fit where a smaller one did, so a few narrow countries that used to show their full name at maximum zoom now show their code instead — Bosnia and Herzegovina is the clearest case. That is F22's own requested rule ("if a label spills outside its border, use the ISO code") applying honestly to the new size, not a regression; at the desktop ceiling 228 of 240 labels show full names and 12 show codes. Keeping Bosnia's full name would have meant capping the ramp near 12px and giving up most of what this round was asked to do.

**Round 6 (2026-09-14) — a change of direction on F22's name/code rule, requested immediately after round 5 landed:**

**9. "Let every single country use a 3-letter code when zoomed out, which changes to full form when zooming in."** Round 3 made the code a per-country *fallback* — shown only where a full name wouldn't fit — so the zoomed-out map was a mix: "RUSSIA" and "BRAZIL" in full beside "GNQ" and "LUX", all at the same size. Legible, but visually inconsistent. This round makes the code the default **state** rather than an exception.

- **Two rules in priority order**, which is what keeps this from undoing round 3: (1) below `NAME_FROM` (2× zoom from the resting frame) every place shows its code, fit or no fit; (2) above it, a shape takes its full name only once that name actually fits inside its own on-screen extent — round 3's rule verbatim, simply no longer consulted below the threshold. So names arrive in **waves** rather than all at once: 93 of 240 at the changeover on desktop, then more at every notch, 228 at the ceiling.
- **Dot-marker places follow rule 1 but never rule 2.** A dot has no outline to spill out of, so it can't be fit-checked — but "every single country" includes it, so a dot is a code when zoomed out and its full name once you're in, the same two states as everything else. Previously dots were exempt from the whole mechanism and always showed full names.
- **This is the same alpha-3 code the owner approved in round 3** (`gbr`, `bih`), not ISO 3166-1 *numeric* (`826`), which is the other thing "3-digit code" can mean. Kept consistent with what's already on screen rather than silently reinterpreted.
- **The changeover burst was measured, not waved through.** Crossing the threshold rewrites 93 (desktop) / 163 (phone) text nodes in a single pass, and a `textContent` write forces that `<text>` element to re-lay-out — a plausible source of a dropped frame. Measured under 4× CPU throttle while crossing the threshold six times: worst single `updateLabels` call **1.2 ms desktop / 1.6 ms phone**, biggest burst **176 labels in 1.2 ms**, **zero dropped frames, zero long tasks** on both. The cost is real but two orders of magnitude below a frame budget.
- **Accept, verified across all eight viewports** (360/390/430/800×600/1280/1440/1920/landscape 800×390): **zero names and 100% codes at rest on every one**, names present at every ceiling (175–234 of them), and **back to zero names after zooming all the way out again** — the state is driven by the live view, not latched. Round 5's sizing is untouched and re-confirmed in the same runs (10px at rest everywhere, 17px at desktop ceilings, 12.5–13px at phone ceilings). Confirmed in a real non-headless browser at the owner's own URL: at rest 137 labels, 0 names, Russia reading "rus"; zoomed in 228 names / 12 codes at 17px, Russia reading "russia". 26/26 tests pass; size 61.4 KB of 80.

---

## Phase 3: Go-live (GitHub Pages)

**Requested 2026-09-14** — the owner wants this hosted on GitHub Pages, matching how PortfolioDashboard is already deployed. Full architectural reasoning (why it's a good fit, what hosting fixes that `file://`/`content://` couldn't, the case-sensitivity gotcha, the repo-structure decision) is in `plan.md` §6 — this section is the actual task checklist.

**D1 onward are real, outward-facing, partly-irreversible actions** — creating a public repo is a disclosure, pushing and enabling Pages makes the app reachable by anyone with the URL. They're written here as ready-to-run instructions; they don't execute themselves, and shouldn't, as a side effect of writing this plan. Run them yourself, or ask for them to be run, whichever you'd rather.

### D0 · Privacy scrub ✅ *(2026-09-14, done — required before D1 could be safe)*
GitHub Pages' free tier requires the source repo to be public. A scan of the docs (prompted by this go-live request, not found earlier) turned up the owner's actual real travel/residency history baked into the design study's demo fixture and narrated in three other docs: exact residency years, a real personal file path, a specific city.
**What was scrubbed:** `docs/design-studies/01-map/index.html`'s `SAMPLE` fixture replaced with fictional example data (different countries, different years, still exercises Home/Lived/Visited). Narrative mentions in `product_spec.md` §5.4 and its Q10 row, `tasks.md`'s round-6 note, and `docs/design-studies/01-map/NOTES.md` (three spots) rewritten to keep the **design reasoning** (why real data was used originally, the privacy discipline applied reading it, the India/Germany judgment calls as concepts) without the **personal specifics** that used to illustrate it.
**What was deliberately left alone:** running mentions of India/Canada/USA as the illustrative example threaded through unrelated feature write-ups (F16, L11, and others) — nationality and country of residence, without exact years or file paths, is a materially lower sensitivity bar than a granular residency timeline, and rewriting every such mention across the whole doc set for that would be disruptive to their own internal coherence for little real privacy benefit. This was a judgment call, stated rather than silently made — revisit it if it doesn't sit right.
**Accept:** confirmed by direct search (`grep`) across every `.md`/`.html` file in the repo, plus `app/` itself (which never held any of this — `visits = Store.load() || {}` always starts empty) — zero remaining matches for the specific years, file path, or city name. The design study reloaded and still renders (302 shapes, zero errors) with the new fixture.

### D1 · Initialize git + create the GitHub repository
```bash
cd D:\Claude\TravelMap
git init
git branch -M main
```
Add a `.gitignore` first (this repo has never had one):
```
tools/node_modules/
```
(`tools/node_modules` exists from `npm install`ing `build-geo.mjs`'s topojson/d3 dependencies — a dev-only tool dependency, not app code, and large enough not to want in history. Add `.claude/` too if you'd rather this tool's own local config not be public — it's harmless either way, purely a preference.)

Create the GitHub repo (pick one):
```bash
# via gh CLI, if installed — creates the repo and adds it as `origin` in one step
gh repo create TravelMap --public --source=. --remote=origin
```
or via the GitHub website (New repository → name it, e.g. `TravelMap` or `nomad-travel-map` → **do not** initialize with a README/`.gitignore`/license, since this repo already has all three's worth of content → then locally:
```bash
git remote add origin https://github.com/<your-username>/<repo-name>.git
```

First commit and push:
```bash
git add .
git commit -m "Initial commit — Nomad Travel Map, ready for GitHub Pages"
git push -u origin main
```
**Accept:** the repo exists on GitHub, public, with this project's full history as one commit (or however many you prefer); `git remote -v` shows `origin` pointing at it; nothing in `.gitignore` (`tools/node_modules/`) made it into the push.

### D2 · GitHub Actions workflow to publish `app/`
No build step (L1) — the workflow's only job is to hand GitHub Pages the `app/` folder as-is. Create `.github/workflows/deploy.yml`:
```yaml
name: Deploy to GitHub Pages

on:
  push:
    branches: [main]
  workflow_dispatch: {}

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: true

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - run: node --test tests/*.test.mjs

  deploy:
    needs: test
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/configure-pages@v5
      - uses: actions/upload-pages-artifact@v3
        with: { path: app }
      - id: deployment
        uses: actions/deploy-pages@v4
```
**Why a `test` job gates `deploy` (`needs: test`):** matches this project's own standing discipline ("a task is ✅ only when verified") — a push that breaks a test shouldn't go live silently. `workflow_dispatch` is there so a deploy can be re-run by hand (from the Actions tab) without needing an empty commit, e.g. after changing a Pages setting.
**Accept:** the workflow file is committed and pushed; a push to `main` triggers it (visible under the repo's **Actions** tab); the `test` job runs the real 26-test suite and the `deploy` job only starts once it passes.

### D3 · Enable GitHub Pages
Repo → **Settings → Pages → Build and deployment → Source: GitHub Actions** (not "Deploy from a branch" — that's the other, workflow-free option this plan deliberately isn't using, per `plan.md` §6's repo-structure reasoning). Saving this, or the next push to `main`, runs D2's workflow for the first time.
**Accept:** Settings → Pages shows "Your site is live at `https://<username>.github.io/<repo-name>/`" (or the repo-root form `https://<username>.github.io/` if the repo is literally named `<username>.github.io` — a *user* site rather than a *project* site, one specific option worth knowing about but not required here).

### D4 · Verify the live deployment
Everything below is against the **real, public URL** — not `localhost`, not `file://` — since that's the whole point of this phase.
- Loads with **zero console errors**, 302 map shapes render, no failed network requests after load (unchanged from every prior verification in this project, now against the real address).
- **Case sensitivity** (`plan.md` §6's Windows-vs-Linux-server gotcha): open the Network tab / `read_network_requests` and confirm every asset (CSS, the three scripts, the icons, the manifest, the service worker) returns 200, not 404 — GitHub's servers are case-sensitive, this dev machine's filesystem wasn't, so this is the one class of bug that genuinely can't be caught before the first real deploy.
- **F17 (save-by-link) on a REAL address:** add a country, copy the URL, open it in a fresh, unauthenticated context (a private/incognito window, or a different device) — confirm it restores the exact map. This is the same check done throughout Phase 1/V-phases against `localhost`; the only thing that changes here is that it's finally the real thing the feature was designed for.
- **"Email me this map" takes the real-link branch, not the fallback:** click it, confirm the mailto body contains an actual `https://…` link (not an Export-and-attach fallback message) — this is `L15`'s fix behaving exactly as designed once `location.protocol` is genuinely `https:`.
- **F20 (PWA) actually installs:** the manifest resolves, the service worker registers (DevTools → Application → Service Workers shows it active), "Add to Home Screen" / the install prompt appears, and a hard offline reload after that first visit still renders the complete map — the exact check B11 could only do against `localhost` before.
- **Nothing mobile-specific regressed:** the pinch-gesture fix, the keyboard-avoidance fix, and the dropdown reparent (all `V2a`/`V2b`/V4's own fixes) are pure client-side JS/CSS behavior, unrelated to hosting — but worth one real confirmation pass on the live URL rather than assuming "it worked on localhost" transfers perfectly.
- **⚠ Deploy an UPDATE and confirm a returning visitor actually receives it.** This is the check that would have caught V4 round 4's stale-service-worker bug, and hosting makes it everyone's problem rather than just the developer's: with the old cache-first worker, every returning visitor would have kept whatever version they first loaded, permanently, after every deploy. The worker is network-first now, so a returning visitor gets fresh files while still working offline — but verify it on the real site rather than trusting it: load the site, deploy a visible change, reload **in the same browser profile** (not a fresh/incognito one, which cannot reproduce this), and confirm the change appears. A fresh-context check proves nothing here, by construction.
**Accept:** every bullet above confirmed on the real deployed URL, with the same rigor (screenshots/explicit checks, not "looks fine") this project has used throughout.

### D5 · Custom domain *(optional)*
Only if wanted — the `github.io` URL is a complete, working answer on its own. If a custom domain is preferred: add a `CNAME` file to `app/` containing just the domain (e.g. `map.yourname.com`), add a `CNAME` DNS record at the domain registrar pointing at `<username>.github.io`, then Settings → Pages → Custom domain → enter it → wait for DNS to propagate → **check "Enforce HTTPS"** once GitHub shows the certificate as issued (this can take a few minutes to a few hours).
**Accept, if done:** the custom domain loads the app over HTTPS with a valid certificate; the plain `github.io` URL still works too (GitHub keeps both live by default) or is deliberately redirected, whichever is preferred.

### D6 · Point "Email me this map" and the single-file build at the new canonical URL
Nothing code-side needs to change (F17 already uses `location.href`, which will correctly be the new real address once hosted there) — this task is about the **docs and the user's own habits**, not the app:
- Update `handoff.md`'s "where things stand" with the live URL once D3 is done, so a future session doesn't have to rediscover it.
- Decide what becomes of `nomad-travel-map.html` / `tools/build-single.mjs` now that a real hosted URL exists — `plan.md` §6 recommends keeping it as an offline/no-install fallback rather than retiring it, since it still solves a real problem (using the app with zero setup, no network) the hosted version doesn't.
**Accept:** `handoff.md` names the live URL; a decision on the single-file build's ongoing role is recorded (keep as fallback, or retire it — either is fine, just say which).
