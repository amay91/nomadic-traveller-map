// DOM layer: rendering, events, zoom/pan, animation, storage. Every rule
// (search ranking, year validation, the URL codec, import validation) lives
// in logic.js and is called through `Logic`; nothing here re-implements a
// rule logic.js already owns. Classic script (plan.md L1), so this and
// logic.js/countries.js/geo.js all share the same global scope by design.
const { search, exact, parseYears, esc, highlight, STATUS, yearsOf, statusOf, stats,
        encodeMap, decodeMap, validateImport, latestYear, formatYearsEdit, formatYearsDisplay, mergeYears,
        isBeen, heatClass, HEAT_BINS } = Logic;

const $ = (s) => document.querySelector(s);
const svg = $("#map");
const COUNTRY = new Map(COUNTRIES.map((c) => [c[0], { iso: c[0], name: c[2], cont: c[3], aliases: c.slice(4), official: true }]));
const TERRITORY = new Map(TERRITORIES.map((t) => [t[0], { iso: t[0], name: t[2], cont: t[3], aliases: t.slice(4), official: false }]));
const PLACE = new Map([...COUNTRY, ...TERRITORY]);
const PLACES = [...PLACE.values()];
const isKnown = (iso) => PLACE.has(iso);
const placeOf = (iso) => { const p = PLACE.get(iso); return p && { official: p.official, cont: p.cont }; };

let visits = {};
const reduce = matchMedia("(prefers-reduced-motion: reduce)");

/* ── the storage seam ─────────────────────────────────────────────────────
   THE ONLY PLACE THE APP TOUCHES PERSISTENCE. Everything else calls
   Store.load() / Store.save(visits) and knows nothing about how or where.
   Today that's the URL + localStorage, no account and no server. If accounts
   are ever wanted (plan.md L13), a remote adapter drops in HERE — same two
   methods, returning/accepting the same plain `visits` object — and no other
   part of the app changes. Don't let a localStorage or fetch call leak out. */
const KEY = "travelmap.v1";
const SAVED_KEY = "travelmap.savedCode";
const Store = {
  save(v) {
    const code = encodeMap(v);
    // replaceState, not pushState — the back button shouldn't walk your edits
    history.replaceState(null, "", code ? "#m=" + code : location.pathname + location.search);
    try { localStorage.setItem(KEY, JSON.stringify({ v: 1, visits: v })); } catch {}
    updateSavedState();
  },
  // What the user last actually kept (emailed/exported), so the app can tell
  // them when their kept copy has fallen behind. Safari deletes localStorage
  // after 7 days of not visiting a site, so "it's still in the browser" is
  // not a durability guarantee — the user needs to know when to re-save.
  markKept(v) { try { localStorage.setItem(SAVED_KEY, encodeMap(v)); } catch {} },
  keptCode() { try { return localStorage.getItem(SAVED_KEY) || ""; } catch { return ""; } },
  load() {
    const fromUrl = decodeMap(new URLSearchParams(location.hash.slice(1)).get("m"), isKnown);
    if (Object.keys(fromUrl).length) return fromUrl; // a link always wins
    try {
      const raw = JSON.parse(localStorage.getItem(KEY) || "null");
      if (raw?.visits && Object.keys(raw.visits).length) return raw.visits;
    } catch {}
    return null;
  },
};
const syncUrl = () => Store.save(visits);

/* ── map render ── */
function renderMap() {
  let h = `<defs><filter id="lift" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow id="liftShadow" dx="0" dy="1" stdDeviation="1.4" flood-color="#1e2d3c" flood-opacity=".28"/></filter></defs><g id="land">`;
  for (const [name, d] of GEO.t) h += `<path class="t" data-t="${esc(name)}" d="${d}"/>`;
  for (const iso in GEO.c) h += `<path class="c" data-iso="${iso}" d="${GEO.c[iso]}"/>`;
  h += `</g><g id="dots">`;
  for (const iso of GEO.d) h += `<circle class="c dot" data-iso="${iso}" cx="${GEO.a[iso][0]}" cy="${GEO.a[iso][1]}" r="2"/>`;
  // Country/territory name labels — the 240 tracked places only, not the 6
  // inert areas (consistent with everywhere else those are left out: search,
  // the "of 195" count, the table). One per place, centred on the exact same
  // anchor point dots and status glyphs already use. Hidden by default
  // (opacity 0, inline on the element) — sizeToScreen() reveals each one only
  // once its OWN country is large enough on screen to read, so the world view
  // isn't 240 names stacked on top of each other; pointer-events:none so a
  // label can never steal a click/hover meant for the shape underneath it.
  //
  // Text is stored LOWERCASE (name and, on the code text node, the iso too) —
  // `.lbl`'s `font-variant:small-caps` only touches lowercase letters, so
  // feeding it "France" would render a normal full-height "F" beside small
  // "rance". Lowercasing the source is what makes every letter, in either a
  // name or a code, the same small-caps height (spec request: "names and
  // codes should be in small caps" — plural, both forms, uniformly).
  h += `</g><g id="labels">`;
  for (const iso of PLACE.keys()) {
    const a = GEO.a[iso]; if (!a) continue;
    h += `<text class="lbl" data-iso="${iso}" data-code="${iso.toLowerCase()}" x="${a[0]}" y="${a[1]}" style="opacity:0">${esc(PLACE.get(iso).name.toLowerCase())}</text>`;
  }
  svg.innerHTML = h + `</g><g id="marks"></g><g id="fx"></g>`;
  // Queried once here rather than every sizeToScreen() call (every rAF tick
  // during a live gesture) — re-querying + recomputing all 240 labels' opacity
  // every single frame measurably cost real frame time under CPU throttling
  // (found by re-running the exact V3 profiling method after adding labels:
  // 3 dropped frames and two long tasks during pinch-zoom that weren't there
  // before). bboxW is cached alongside each element for the same reason —
  // GEO.a doesn't change after boot, so there's nothing to gain re-reading it.
  //
  // nameW/codeW: each label's own rendered width, measured ONCE here via
  // getBBox() (an SVG layout read — fine at boot across 240 elements, NOT
  // fine per frame, which is exactly why this isn't done at runtime) at a
  // fixed reference font-size of 10 user units — chosen to match the "10" in
  // sizeToScreen()'s own `10 / scale` formula, so estimating the width at
  // whatever font-size is ACTUALLY showing later reduces to one division
  // (refWidth / scale) instead of a font-size lookup and a multiply.
  // isDot: a dot marker has no real outline to "spill outside of" — "if a label
  // spills outside its border, use the code" is a SHAPE concept, so only places
  // drawn as an actual polygon (GEO.c) get the fits-or-doesn't check. A dot still
  // follows the zoomed-out code rule like everything else (see updateLabels); it
  // simply never switches to a code on FIT grounds once you're zoomed in.
  const dotSet = new Set(GEO.d);
  $("#labels").style.fontSize = "10px";
  labelEls = [...svg.querySelectorAll(".lbl")].map((el) => {
    const iso = el.dataset.iso, a = GEO.a[iso];
    return { el, bboxW: a[4] - a[2], isDot: dotSet.has(iso), nameW: el.getBBox().width, name: el.textContent, showingCode: false };
  });
}
let labelEls = [], lastLabelPass = 0, labelPassPending = null;
const els = (iso) => svg.querySelectorAll(`[data-iso="${iso}"]`);
// Small ink glyph at the centre of anywhere lived-in or home. Drawn in its own
// layer above the fills so it survives a selection raising a path to the top.
function renderMarks() {
  $("#marks").innerHTML = Object.keys(visits)
    .filter((iso) => (visits[iso].s === "lived" || visits[iso].s === "home") && GEO.a[iso])
    .map((iso) => `<circle class="mk mk-${statusOf(visits[iso])}" cx="${GEO.a[iso][0]}" cy="${GEO.a[iso][1]}" r="2"/>`)
    .join("");
  sizeToScreen();
}
function paint(stagger) {
  // Every place gets at most one of: a heat class h1–h5 (how many times you've
  // been — logic.js heatClass), or is-bucket (somewhere you haven't been yet).
  // The classes are applied whether or not the heatmap is switched on; CSS
  // decides what they look like (body.heat-off falls back to the one classic
  // red), so toggling it never has to rebuild any state.
  svg.querySelectorAll(".c").forEach((e) => {
    const rec = visits[e.dataset.iso], k = heatClass(rec);
    if (stagger && rec) e.style.transitionDelay = `${Math.random() * 700}ms`;
    e.classList.toggle("is-visited", isBeen(rec));
    e.classList.toggle("is-bucket", rec?.s === "bucket");
    for (let i = 1; i <= HEAT_BINS.length; i++) e.classList.toggle("h" + i, k === i);
  });
  if (stagger) setTimeout(() => svg.querySelectorAll(".c").forEach((e) => (e.style.transitionDelay = "")), 1400);
  // A label's own fill has to flip along with its country's — a dark label
  // reads fine on land but disappears on the dark red visited fill (measured:
  // 8.8:1 vs 1.7:1), so it needs the light variant .lbl.is-visited sets up in
  // CSS, exactly mirrored from the same state as the path itself. With the
  // heatmap there are now three cases, not two: the two PALE classes (1–2
  // visits) are too light for white text and take a deep ink instead; every
  // darker fill — heat 3–5, classic red, bucket indigo — takes white.
  // The h1..h5 tag added here (2026-09-15, F34) is what lets the DARK ramp use a
  // different ink split from the light one without this file knowing anything
  // about either palette. Light's ramp darkens as visits rise, so its two palest
  // classes need deep ink; dark's brightens, so its top two do. Encoding that
  // here would mean app.js reading the colour scheme and carrying a table of
  // which class is pale — a palette fact, in the one file that should hold none.
  // Tagging the class and letting CSS answer keeps colour entirely in CSS.
  svg.querySelectorAll(".lbl").forEach((t) => {
    const rec = visits[t.dataset.iso], k = heatClass(rec);
    const pale = heatOn && (k === 1 || k === 2);
    t.classList.toggle("on-pale", pale);
    t.classList.toggle("is-bucket", rec?.s === "bucket");
    for (let i = 1; i <= HEAT_BINS.length; i++) t.classList.toggle("h" + i, k === i);
    t.classList.toggle("is-visited", rec?.s === "bucket" || (k > 0 && !pale));
  });
  renderMarks();
  // Official-195-only, via logic.js's stats() — territories are tracked but
  // kept out of "of 195" (spec F16), and this is the one seam that rule has
  // to pass through, so it can't quietly drift between the pill and the table.
  $("#count").textContent = stats(visits, placeOf).count;
}

/* ── camera (viewBox) ── */
// tweenTo is the view an in-flight animation is heading for. Repeated taps of
// the +/− buttons compose from THAT rather than from the half-interpolated
// current view — otherwise each tap restarts from wherever the last animation
// happened to be, three quick taps deliver less than three steps, and the zoom
// only ever approaches its limit asymptotically instead of landing on it.
let base, view, tween, tweenTo = null;
const stopTween = () => { cancelAnimationFrame(tween); tweenTo = null; };
// The zoom CEILING — the narrowest the map can ever be shown at — pinned to a
// target ON-SCREEN SCALE (px per map unit), not a flat fraction of base.w.
// The old rule (`base.w / 12`) gave every screen the SAME absolute map-unit
// width at max zoom, which sounds fair and isn't: base.w itself is ~1040
// units on nearly every real viewport, phone included (fit()'s own
// `w < GEO.w*1.04` floor catches both a 1440px desktop window and a 390px
// phone — measured, not assumed). Dividing that into a 1440px screen gives
// 16.6 px per map unit; dividing it into a 390px screen gives 4.5 — a phone
// user's "fully zoomed in" was rendering everything, paths and labels both,
// at barely a quarter of desktop's density. That's the whole "we need more
// zoom" report. CEIL_SCALE is desktop's own long-standing ceiling density,
// measured directly (16.615), and now the target EVERY screen reaches — a
// narrower screen asks for a narrower SLICE of the map, not a blurrier one.
// Desktop is unchanged by construction: innerWidth/(innerWidth/CEIL_SCALE)
// is CEIL_SCALE at any width, so this is a no-op at 1440 and roughly a
// 3.5–4x deeper ceiling on a phone.
//
// One function, not a constant recomputed three or four ways — apply(),
// zoomTarget(), flyTo() and the label-sizing block below all have to agree
// on this EXACTLY, the same discipline the code already required of
// apply()/zoomTarget() ("matching apply()'s own clamp exactly… otherwise the
// anchor math drifts," found once already near Svalbard) — now extended to
// every OTHER place that used to hardcode its own copy of `base.w/12`, so a
// future change to CEIL_SCALE propagates everywhere instead of needing to be
// hunted down by hand.
const CEIL_SCALE = 16.615;
const zoomMin = () => innerWidth / CEIL_SCALE;
function fit() {
  const W = innerWidth, H = innerHeight, mobile = W <= 640;
  let h = GEO.h * (mobile ? 1.05 : 1.2), w = (h * W) / H;
  if (w < GEO.w * 1.04) { w = GEO.w * 1.04; h = (w * H) / W; }
  base = { x: (GEO.w - w) / 2, y: (GEO.h - h) / 2 + (mobile ? GEO.h * 0.12 : 0), w, h };
}
// The phone opens on YOUR map: the frame fits the places you've marked (or a
// Europe · Africa · South Asia band before you've marked any), centred in the
// stage between the header and the bottom chrome.
//
// The version this replaces scaled so the map's FULL height fell inside
// (H - 330) px — which, by construction, makes the viewBox taller than the map
// itself: at 430×800 it asked for 786 units of a map that is only 462 tall, so
// ~40 % of the screen was empty space past the poles. That was the "dead ocean
// band" in the V2 review (spec §4.7). Fitting a real content box and clamping
// the scale so the viewBox can never exceed the map's own height fixes the
// cause rather than nudging the offset.
// The resting frame shows as many of your own countries as it can hold: slide a
// window of the visible width across them and keep the position covering the
// most, centred on those it covers.
function focusX(w) {
  // frame the places you've actually BEEN — a bucket list is somewhere else by definition
  const xs = Object.keys(visits).filter((c) => isBeen(visits[c])).map((c) => GEO.a[c]?.[0]).filter((n) => n != null).sort((a, b) => a - b);
  if (!xs.length) return 545; // Europe · Africa · Middle East, before there's anything of yours to centre on
  let best = xs[0], most = 0;
  for (const x of xs) {
    const inWin = xs.filter((v) => v >= x - w / 2 && v <= x + w / 2);
    // the window is w wide and every member is inside it, so centring on the
    // midpoint of the ones covered can't push any of them back out
    if (inWin.length > most) { most = inWin.length; best = (inWin[0] + inWin[inWin.length - 1]) / 2; }
  }
  return best;
}
function home() {
  const W = innerWidth, H = innerHeight;
  // Desktop — and a phone turned landscape, where the screen's aspect finally
  // matches the map's 2.16 and the whole world fits edge to edge — get the world.
  if (W > 640 || H < W) return { ...base };
  // Portrait can't have both: at this aspect ratio the whole world is a ~180px
  // strip in a screen of empty blue, and a screen-filling map holds only ~80° of
  // longitude. This picks the screen-filling map — deriving the scale from the
  // viewport height, which also makes vertical dead space arithmetically
  // impossible (h lands on GEO.h exactly, so y is 0 and there's nothing past the
  // poles to show). Turn the phone, or pinch out, for all of it at once.
  const s = Math.max(W / base.w, H / GEO.h);
  const w = W / s, h = H / s;
  return { x: focusX(w) - w / 2, y: (GEO.h - h) / 2, w, h };
}
// Anything meant to stay a fixed size on screen (dots, status glyphs, the
// selected-country shadow) is counter-scaled against the current zoom here,
// in one place — so a new screen-sized element can't be forgotten on zoom.
function sizeToScreen() {
  if (!view) return;
  const scale = innerWidth / view.w; // px per map unit
  svg.querySelectorAll(".dot").forEach((d) => d.setAttribute("r", (3.4 / scale).toFixed(2)));
  svg.querySelectorAll(".mk").forEach((m) => m.setAttribute("r", (3.6 / scale).toFixed(2)));
  $("#liftShadow")?.setAttribute("stdDeviation", (3.2 / scale).toFixed(2));
  $("#liftShadow")?.setAttribute("dy", (1.6 / scale).toFixed(2));
  // Labels: sized by labelPx() — 10px at the resting frame, growing as you zoom
  // in (see labelPx) — and revealed only once the place's OWN on-screen width
  // clears a threshold, so a big country (Canada, Brazil…) can read one even at
  // world view while a small one needs real zoom before its label has room,
  // fading in over FADE_PX rather than popping. That's what "appears on zoom in"
  // asked for without a hand-picked per-country list.
  //
  // The width rule alone doesn't reach every country, though — measured, not
  // assumed: Vatican/Nauru/Tuvalu are drawn as dots with no real width at all,
  // and San Marino/Liechtenstein/Monaco are genuine shapes too small to ever
  // clear ANY sane pixel threshold even at this app's own 12x zoom ceiling
  // (5px wide at max zoom — smaller than a single character). For any place
  // that can NEVER cross REVEAL_PX no matter how far in you zoom, revealing
  // is keyed to the ZOOM LEVEL itself instead of a width that will never
  // arrive — the same idea a point-marker label uses on any map: show it once
  // you're looking closely at that area, not once it has grown wide enough.
  //
  // font-size is set ONCE, on the whole #labels group (SVG text inherits it),
  // rather than on each of the 240 elements — every label shares the same
  // scale, so 240 identical writes were 239 wasted ones. The opacity pass
  // is throttled to ~20/s rather than every rAF tick (see labelEls above for
  // why): a label doesn't need pixel-frame responsiveness the way the viewBox
  // or a dot's radius does, and this is what actually bought back the dropped
  // frames — the font-size line alone wasn't enough on its own.
  $("#labels").style.fontSize = (labelPx(scale) / scale).toFixed(3) + "px";
  // Throttled to ~20/s rather than every rAF tick (see labelEls above for
  // why) — but a PLAIN throttle can silently drop the one update that
  // mattered: a quick one-shot flyTo/animateTo settles in a single frame, and
  // if that frame lands inside the 50ms window, nothing else ever calls
  // sizeToScreen() again to correct it — the label is left showing whatever
  // the PREVIOUS view computed, indefinitely, until some unrelated later
  // interaction happens to fix it. Found exactly this way: chaining a few
  // quick flyTos in a row occasionally left a label stuck on a stale
  // name/code decision. A trailing call (below) guarantees the final state
  // is always eventually applied, the standard fix for this class of bug.
  const now = performance.now();
  if (now - lastLabelPass > 50) {
    lastLabelPass = now;
    clearTimeout(labelPassPending); labelPassPending = null;
    updateLabels(scale);
  } else if (!labelPassPending) {
    labelPassPending = setTimeout(() => {
      labelPassPending = null; lastLabelPass = performance.now();
      updateLabels(innerWidth / view.w); // re-read scale fresh — view may have kept moving until this fires
    }, 60);
  }
}
// Label font size in CSS pixels at a given zoom. Constant 10px was the original
// rule and it made zoomed-in labels look, in the owner's words, "way too small":
// at the 12x ceiling a country fills the screen and still carries the same text
// as it did at world view, so the label shrinks relative to everything around it
// — the map grows, the type doesn't, and the whole thing reads under-scaled.
//
// Growth is LINEAR IN ZOOM STEPS, not in the zoom factor. Each wheel notch
// multiplies the zoom by a constant (~1.197), so "linear in log(zoom)" is
// exactly "the same number of pixels per notch" — which is how the request was
// phrased ("increase font size by 0.5 for every step of zoom"). Growing linearly
// with the zoom FACTOR instead would spend almost the entire increase in the
// last few notches and leave the middle of the range looking untouched.
//
// Anchored to a fixed SPAN, NOT to a per-notch constant, because a notch is not
// a fixed quantity: this app's wheel handler turns one standard deltaY=100 notch
// into 1.197x, making the full range 14 notches (measured) — but the owner
// counted ~20 on their own mouse, and a high-resolution wheel emits finer, more
// frequent deltas. Hard-coding "+0.5 per notch" would hand different mice
// different maximum sizes. Pinning the ramp to the zoom range instead is
// device-independent, and on a standard notch it lands exactly on the requested
// half-pixel per step (7px spread over 14 notches — measured at 0.50–0.51).
//
// LBL_SPAN mirrors the 12x zoom range apply() clamps to on DESKTOP (base.w …
// zoomMin()) — desktop's own resting frame IS base.w, so 12 is exact there.
// On a phone the resting frame is narrower than base.w to begin with, and
// (since CEIL_SCALE, above) both it and the ceiling scale together with
// innerWidth, so every real phone width lands on the SAME ratio — measured at
// 360/390/430px: 9.6x, not 12x. Left at 12 anyway: labelPx()'s Math.min(1, …)
// clamp means slightly undershooting the span just means the ramp approaches
// LBL_MAX_PX without quite reaching it (16.3px, not 17), which is the
// intended, accepted outcome documented in labelPx() itself, not a bug to
// chase with a second platform-specific constant.
const LBL_MIN_PX = 10, LBL_MAX_PX = 17, LBL_SPAN = 12;
// Zoom ratio (from the resting frame) at which full names START being offered.
// Below it EVERY place shows its three-letter code, whether or not its name
// would have fitted — the zoomed-out map is a uniform field of short tags rather
// than a mix of "RUSSIA" and "GNQ" sized wildly differently. Above it, each place
// takes its full name as soon as that name actually fits inside its own borders,
// so names arrive in waves as you zoom rather than all at once.
const NAME_FROM = 2;
// The view the app RESTS at: base.w on desktop, the narrower portrait frame on a
// phone. This, not base.w, is the "fully zoomed out" the request means, and the
// two genuinely differ — a phone opens already framed on a band about 4.6x into
// the zoom range. Anchoring to each platform's own resting frame is what keeps
// the approved 10px resting look identical on both, and it is not a fudge: the
// phone squeezes that narrower band into 390px rather than 1440px, so a country
// covers about the same number of PIXELS at phone rest (1.73 px per map unit) as
// it does at desktop world view (1.39) — the two really are the same apparent
// size, which is exactly why they deserve the same 10px.
//
// Cached on the viewport size, which is safe precisely because home()'s WIDTH
// depends only on the viewport — focusX() reads the visits list, but only to
// choose the frame's horizontal CENTRE. So marking or removing a country moves
// the resting frame sideways and never changes its width, and a cache that
// ignores visits cannot go stale. (Were that ever to change, this would silently
// size labels against a frame the app no longer rests at.) Worth caching because
// labelPx runs on every frame of a live gesture and focusX is O(n^2) in visits.
let restW = 0, restKey = "";
function restWidth() {
  const key = innerWidth + "x" + innerHeight;
  if (key !== restKey) { restKey = key; restW = home().w; }
  return restW;
}
// How far in we are from the frame the app rests at: 1 at rest, LBL_SPAN at the
// ceiling on desktop, ~9.6 at a phone's (it opens already part-way in, and
// CEIL_SCALE — above — keeps that ratio the same on any real phone width).
const zoomFromRest = (scale) => restWidth() / (innerWidth / scale);
function labelPx(scale) {
  // Growth is measured against a FIXED span rather than each platform's own
  // available zoom, so a step of zoom is worth the same half-pixel everywhere.
  // Since CEIL_SCALE gives a phone the SAME on-screen density at its ceiling as
  // desktop gets at its own, a phone's ~9.6x of zoom above its resting frame
  // gets it to ~16.3px — close to LBL_MAX_PX, deliberately not forced to hit it
  // exactly (see LBL_SPAN's own comment). Before CEIL_SCALE existed, a phone's
  // ceiling was the same ABSOLUTE map-unit width as desktop's despite a much
  // narrower screen, so it only had ~2.6x of zoom above rest and topped out
  // around 12.7px; that gap is what CEIL_SCALE actually closes, not something
  // this function has to keep compensating for. Normalising over each
  // platform's own range instead of a fixed span (the first attempt at label
  // sizing, before CEIL_SCALE) drove phone labels to the full 17px over a map
  // that was still small, burying Europe in overlapping text — the same
  // platform-scaling trap the dot-reveal threshold fell into in V4 round 3,
  // wearing a different hat.
  //
  // Clamped at the bottom because a phone can pinch OUT past its resting frame
  // to the whole world, which would otherwise push the size under the 10px the
  // request asked to preserve.
  const t = Math.log(zoomFromRest(scale)) / Math.log(LBL_SPAN);
  return LBL_MIN_PX + (LBL_MAX_PX - LBL_MIN_PX) * Math.min(1, Math.max(0, t));
}
function updateLabels(scale) {
  const REVEAL_PX = 12, FADE_PX = 14;
  const fpx = labelPx(scale), zoom = zoomFromRest(scale);
  // Always CEIL_SCALE by construction now (maxScale = innerWidth/zoomMin() =
  // innerWidth/(innerWidth/CEIL_SCALE) = CEIL_SCALE), on every platform — kept
  // as an expression rather than hardcoding the constant so DOT_REVEAL/DOT_FADE
  // below stay correct automatically if CEIL_SCALE is ever tuned again.
  const maxScale = innerWidth / zoomMin();
  // DOT_REVEAL/DOT_FADE are fractions of maxScale, not an absolute scale —
  // maxScale is proportional to innerWidth (scale = innerWidth/view.w, and
  // the zoom clamp is a fixed RATIO of base.w regardless of screen size), so
  // a phone's own zoom ceiling is fundamentally lower than desktop's. Found
  // by checking, not assuming: a fixed DOT_REVEAL=6 (desktop's own max is
  // ~16.6) meant a 390px phone's max scale (~4.5) could never reach it —
  // Vatican and every other dot/degenerate place would never reveal AT ALL
  // on a phone, no matter how far zoomed in. 0.36/0.24 reproduce the exact
  // desktop numbers this was tuned against (16.6×0.36≈6, ×0.24≈4) while
  // scaling correctly for any screen width.
  const DOT_REVEAL = maxScale * 0.36, DOT_FADE = maxScale * 0.24;
  // The full name's estimated width IN MAP UNITS at whatever font-size is
  // actually showing right now: nameW was measured once at a reference size of
  // 10 user units (see renderMap()), the live size is fpx/scale user units, and
  // text width is linear in font-size — so the estimate is nameW * fpx /
  // (10 * scale). While the font was a constant 10px this collapsed to
  // nameW/scale; it has to carry fpx now that the size moves, or every label
  // would be fit-checked against the size it had at world view and a grown name
  // would quietly spill past its own border — the exact thing the code/name
  // fallback exists to prevent.
  const NAME_UNITS = fpx / (10 * scale);
  const FIT_MARGIN = 0.92; // a little breathing room, not flush against the border
  for (const entry of labelEls) {
    const { el, bboxW, isDot, nameW, name } = entry;
    const shown = bboxW * maxScale < REVEAL_PX
      ? Math.max(0, Math.min(1, (scale - DOT_REVEAL) / DOT_FADE))
      : Math.max(0, Math.min(1, (bboxW * scale - REVEAL_PX) / FADE_PX));
    // Reported 2026-09-14: "I don't see the country labels." They were
    // there, just too faint to register at a glance — 0.7/0.92 was checked
    // against FULL-strength colour earlier (8.8:1 / 6.98:1), but the
    // rendered contrast is against the BLENDED colour at that opacity,
    // which is a materially different number: 0.7 on land actually blends
    // down to 4.08:1, under the 4.5 minimum, on already-small ~10px text.
    // 0.9/0.95 blend to 6.8:1 / 6.0:1 — comfortably legible, still short of
    // full-strength "loud."
    el.style.opacity = shown * (el.classList.contains("is-visited") || el.classList.contains("on-pale") ? 0.95 : 0.9);
    // Name vs. code, three rules in priority order:
    //
    // 0. ON A PHONE, ALWAYS THE CODE — full stop, at any zoom. Reported
    //    2026-09-15: on mobile the Caribbean (and any other tight cluster of
    //    small places) turned unreadable once names started appearing, because
    //    the fit check below only asks "does THIS name fit THIS place's own
    //    border" — it has no idea a neighbour's name is about to land 4px away.
    //    That collision is invisible on a spacious desktop viewport and
    //    guaranteed on a 390px-wide one packed with dozens of small islands.
    //    A real fix is per-label collision avoidance (not attempted); the honest
    //    fix available today is to never let mobile reach the state that
    //    exposes the gap — codes are compact enough that neighbours very rarely
    //    collide even in a tight archipelago. Desktop/tablet keep the fit-check
    //    behaviour below, which has room to spare.
    // 1. ZOOMED OUT, EVERYTHING IS A CODE. Below NAME_FROM every place shows its
    //    three-letter code regardless of whether its name would have fitted.
    //    This is the later of the two requests and it overrides the fit check:
    //    letting big countries keep full names at world view while their
    //    neighbours showed codes was a legible map but a visually inconsistent
    //    one, mixing long words and short tags at the same size.
    // 2. ZOOMED IN, A NAME MUST STILL EARN ITS PLACE. Past NAME_FROM a shape
    //    takes its full name only once that name actually fits inside its own
    //    on-screen extent — the original round-3 rule, unchanged ("if a label
    //    spills outside its border, use the code instead"). So names arrive in
    //    waves as you zoom: the roomiest countries first, the tightest last or
    //    never. A dot marker has no real outline to spill out of, so rule 2
    //    never applies to it; rule 1 still does, so a dot is a code when zoomed
    //    out and its full name once you're in (desktop/tablet only, per rule 0).
    //
    // Only writes textContent when the decision actually FLIPS, not every
    // throttle tick — a text write forces the browser to re-lay-out that <text>.
    const wantsCode = phone() || zoom < NAME_FROM || (!isDot && nameW * NAME_UNITS > bboxW * FIT_MARGIN);
    if (wantsCode !== entry.showingCode) {
      el.textContent = wantsCode ? el.dataset.code : name;
      entry.showingCode = wantsCode;
    }
  }
}
// Whether a view is still (near enough) resting at home() to count as "not
// zoomed in" — shared by apply()'s own recentre-button toggle below and by
// the resize handler further down, so "should the recentre button show" and
// "did this resize start from home" can't drift into two different answers
// to what is really the same question. The 3%/5% slop matches how apply()
// already re-snaps a view that's landed almost exactly on home (float noise
// from repeated zoom/pan math) so that case doesn't itself count as zoomed.
function atHome(v, hm) {
  return Math.abs(v.w - hm.w) <= hm.w * 0.03 && Math.abs(v.x - hm.x) <= hm.w * 0.05;
}
function apply(v) {
  const max = base.w, min = zoomMin();
  const w = Math.min(max, Math.max(min, v.w)), h = (w * base.h) / base.w;
  const cx = Math.min(GEO.w, Math.max(0, v.x + v.w / 2)), cy = Math.min(GEO.h, Math.max(0, v.y + v.h / 2));
  view = { x: cx - w / 2, y: cy - h / 2, w, h };
  if (w === max) view = { ...base };
  svg.setAttribute("viewBox", `${view.x} ${view.y} ${view.w} ${view.h}`);
  sizeToScreen();
  $("#reset").classList.toggle("show", !atHome(view, home()));
  // dead controls at the ends of the range are worse than absent ones
  $("#zoomIn").disabled = view.w <= min + 1e-9;
  $("#zoomOut").disabled = view.w >= base.w - 1e-9;
}
// The clamped target view for a zoom of factor f anchored at screen point px,py.
// Split out so the wheel, the pinch and the +/− buttons all share ONE copy of
// the clamp-before-offset rule below, rather than three that can drift apart.
function zoomTarget(px, py, f, v = view) {
  const mx = v.x + (px / innerWidth) * v.w, my = v.y + (py / innerHeight) * v.h;
  // Clamp BEFORE computing the offset, matching apply()'s own clamp exactly —
  // otherwise, once a zoom request exceeds the min/max, the anchor math below
  // is computed against a width apply() is about to override, and the point
  // that's supposed to stay under the cursor silently drifts further every
  // tick (found scrolling in on Svalbard, near the map's very top edge, well
  // past the zoom cap: the view kept sliding south tick after tick).
  const w = Math.min(base.w, Math.max(zoomMin(), v.w / f)), h = (w * base.h) / base.w;
  return { x: mx - (px / innerWidth) * w, y: my - (py / innerHeight) * h, w, h };
}
function zoomAt(px, py, f) { apply(zoomTarget(px, py, f)); }
function animateTo(to, ms = 650) {
  cancelAnimationFrame(tween);
  if (reduce.matches) { tweenTo = null; return apply(to); }
  tweenTo = { ...to };
  const from = { ...view }, t0 = performance.now();
  const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
  const step = (now) => {
    // ms > 0 guard: a zero duration divides by zero, and rAF can hand back a
    // timestamp fractionally BEFORE t0 — either way, if the from/to delta on an
    // axis is also 0, the multiply is 0 × Infinity = NaN, which lands straight in
    // the viewBox and blanks the entire map. Cheap to prevent, ugly to hit.
    const t = ms > 0 ? Math.min(1, Math.max(0, (now - t0) / ms)) : 1, k = ease(t);
    apply({ x: from.x + (to.x - from.x) * k, y: from.y + (to.y - from.y) * k, w: from.w + (to.w - from.w) * k, h: from.h + (to.h - from.h) * k });
    if (t < 1) tween = requestAnimationFrame(step); else tweenTo = null;
  };
  tween = requestAnimationFrame(step);
}
function flyTo(iso) {
  const [, , x0, y0, x1, y1] = GEO.a[iso];
  const aspect = base.w / base.h;
  let w = Math.max((x1 - x0) * 2.4 + 16, ((y1 - y0) * 2.4 + 16) * aspect);
  // The floor (`2 * zoomMin()`, i.e. HALF the hard zoom ceiling's density — was
  // `base.w / 6`, exactly 2× the old `base.w / 12` ceiling, same relationship,
  // now screen-width-proportional like the ceiling itself) stops flyTo from
  // zooming in absurdly far for a tiny country — but on the OLD flat-map-unit
  // floor (173 units on every screen), it was the DOMINANT term for most small
  // and medium countries, not just an edge-case safety net: Croatia's own
  // padded bbox width is ~51 units, so `Math.max(51, 173)` always picked 173,
  // meaning clicking Croatia never actually framed Croatia — it framed however
  // much of the Balkans happened to fit in a 173-unit-wide box, every time, on
  // every screen. Measured, not assumed. Proportional to screen width now, so
  // it only binds for genuinely tiny places (Vatican, Monaco), the case it was
  // actually meant for.
  w = Math.min(base.w, Math.max(2 * zoomMin(), w));
  const h = w / aspect;
  animateTo({ x: (x0 + x1) / 2 - w / 2, y: (y0 + y1) / 2 - h * 0.46, w, h });
}

/* pan / pinch / wheel
   Panning and pinching are treated as two DIFFERENT gestures rather than one
   handler that inspects the pointer count each move. The version this replaces
   conflated them and had four bugs, all of which a real phone hits constantly:

   1. `moved = false` ran on EVERY pointerdown — so landing the second finger
      erased the fact that the first had already moved. A short pinch therefore
      ended with moved === false, the trailing click fired, and the map opened a
      country's popover instead of zooming. That is the "it thinks I'm tapping a
      country" report, and it is the main fix here.
   2. The second finger also overwrote `drag`, capturing its own start point and
      a fresh `drag.view` mid-gesture.
   3. Lifting ONE finger of a pinch left `drag` stale — pointerup only cleared it
      at zero pointers — so the remaining finger resumed panning from the other
      finger's start point against an out-of-date view, and the map jumped.
   4. pointercancel (which touch fires readily) deleted the pointer but left
      `drag` and the .panning class wedged.

   Now: one finger pans, two fingers pinch, a pinch can never become a click, and
   lifting back to one finger re-seeds the pan from the CURRENT view. */
const ptrs = new Map();
let drag = null, moved = false, pinch = null, gestureClick = false;
// restart a one-finger pan from whichever pointer is still down, against the
// view as it is NOW — this is what stops the jump after a pinch ends
function reseedPan() {
  const [p] = [...ptrs.values()];
  drag = p ? { x: p.x, y: p.y, view: { ...view } } : null;
}
svg.addEventListener("pointerdown", (e) => {
  ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (ptrs.size === 1) {
    moved = false; gestureClick = false; pinch = null;
    drag = { x: e.clientX, y: e.clientY, view: { ...view } };
  } else if (ptrs.size === 2) {
    const [a, b] = [...ptrs.values()];
    pinch = { dist: Math.hypot(a.x - b.x, a.y - b.y) };
    drag = null;          // a pinch is not a pan
    moved = true;         // ...and is never a tap,
    gestureClick = true;  // ...so the click that trails it must be swallowed
    cancelHold(); hideTip();
  }
});
addEventListener("pointermove", (e) => {
  if (!ptrs.has(e.pointerId)) return;
  ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pinch && ptrs.size >= 2) {
    const [a, b] = [...ptrs.values()], d = Math.hypot(a.x - b.x, a.y - b.y);
    // a zero distance (both fingers on the same pixel) would divide to Infinity
    if (d > 0 && pinch.dist > 0) { stopTween(); zoomAt((a.x + b.x) / 2, (a.y + b.y) / 2, d / pinch.dist); }
    pinch.dist = d;
    return;
  }
  if (!drag) return;
  const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
  if (!moved && Math.hypot(dx, dy) < 5) return;
  moved = true; svg.classList.add("panning"); hideTip(); cancelHold();
  const s = drag.view.w / innerWidth;
  stopTween();
  apply({ ...drag.view, x: drag.view.x - dx * s, y: drag.view.y - dy * s });
});
function endPointer(e) {
  ptrs.delete(e.pointerId);
  if (ptrs.size < 2) pinch = null;
  if (ptrs.size === 1) reseedPan();          // pinch → pan, without a jump
  if (!ptrs.size) { drag = null; svg.classList.remove("panning"); }
}
addEventListener("pointerup", endPointer);
addEventListener("pointercancel", endPointer);
svg.addEventListener("wheel", (e) => { e.preventDefault(); stopTween(); zoomAt(e.clientX, e.clientY, Math.exp(-e.deltaY * 0.0018)); }, { passive: false });
$("#reset").onclick = () => animateTo(home());

/* Zoom buttons — always present, so zooming never depends on a gesture landing
   cleanly. They zoom about the centre of the screen and animate, and they go
   disabled at the ends of the range rather than becoming dead taps. */
const zIn = $("#zoomIn"), zOut = $("#zoomOut");
const zoomStep = (f) => animateTo(zoomTarget(innerWidth / 2, innerHeight / 2, f, tweenTo || view), 260);
zIn.onclick = () => zoomStep(1.8);
zOut.onclick = () => zoomStep(1 / 1.8);

/* ── tooltip ── */
const tip = $("#tip");
function hideTip() { tip.classList.remove("show"); }
function tipHtml(t) {
  const iso = t.dataset?.iso, terr = t.dataset?.t;
  if (!iso && !terr) return null;
  const p = iso && PLACE.get(iso);
  const st = iso && statusOf(visits[iso]);
  const tag = [st && st !== "visited" && visits[iso] ? STATUS[st] : "", p?.official ? "" : "Territory"].filter(Boolean).join(" · ");
  const meta = [visits[iso] ? formatYearsDisplay(yearsOf(visits[iso])) : "", tag].filter(Boolean).join(" · ");
  return iso ? esc(p.name) + `<span>${meta}</span>` : esc(terr) + "<span>Not among the 195</span>";
}
// `above` centres the tip over the touch point so a fingertip doesn't cover it
function showTip(t, x, y, above) {
  const html = tipHtml(t);
  if (!html) return hideTip();
  tip.innerHTML = html;
  tip.classList.add("show");
  const w = tip.offsetWidth, h = tip.offsetHeight;
  const left = Math.min(innerWidth - w - 8, Math.max(8, above ? x - w / 2 : x + 14));
  const top = Math.max(8, above ? y - h - 22 : y + 16);
  tip.style.transform = `translate(${left}px,${top}px)`;
}
svg.addEventListener("pointermove", (e) => {
  if (e.pointerType !== "mouse" || (drag?.x !== undefined && moved)) return;
  showTip(e.target, e.clientX, e.clientY, false);
});
svg.addEventListener("pointerleave", hideTip);

/* Touch has no hover, so until now a phone had no way to ask "which country is
   this?" without committing to opening the popover — the sharpest desktop/mobile
   inequality in the V2 review (spec §4.7). Press and hold peeks: the same
   tooltip, released without opening anything. It can't fight panning, because a
   pan cancels the hold the moment the finger moves. */
let holdT = null, peeked = false, lastPointer = "mouse";
svg.addEventListener("pointerdown", (e) => {
  peeked = false; lastPointer = e.pointerType;
  if (e.pointerType === "mouse" || !(e.target.dataset?.iso || e.target.dataset?.t)) return;
  const { target, clientX, clientY } = e;
  holdT = setTimeout(() => { peeked = true; showTip(target, clientX, clientY, true); }, 300);
});
const cancelHold = () => { clearTimeout(holdT); holdT = null; };
addEventListener("pointermove", () => moved && cancelHold(), true);
addEventListener("pointerup", () => { cancelHold(); if (peeked) hideTip(); });
addEventListener("pointercancel", cancelHold);

/* ── selection + popover ── */
let selected = null;
function select(iso, withPop) {
  if (selected) els(selected).forEach((e) => e.classList.remove("is-selected"));
  selected = iso;
  if (!iso) return closePop();
  els(iso).forEach((e) => { e.parentNode.appendChild(e); getComputedStyle(e).transform; e.classList.add("is-selected"); });
  if (withPop) openPop(iso);
}
const pop = $("#pop");
// Set by whichever caller opened the popover through a keyboard-reachable
// path (currently only a table row — a raw map click has no keyboard-focus
// concept to return to, so it's left null and focus is simply left alone,
// same as clicking any other non-focusable point on the page).
let popTrigger = null;
let pendingStatus = "visited";
// The status control exists in TWO places — the popover and the entry bar — and
// they have to behave identically, or "type to add" and "click to add" stop
// being the equivalent paths the spec claims they are. One function paints both
// rather than two that drift: the wording and the placeholder are as much a part
// of the control as the buttons.
//   - "Year(s) visited" is the wrong words once it isn't a visit.
//   - Visited stays discrete trips (a comma list); Lived/Home are genuinely
//     continuous, so their placeholder teaches the period syntax right where it
//     is needed, instead of only in an error message after a failed guess.
function paintStatus(row, label, input, s) {
  document.querySelectorAll(`${row} button`).forEach((b) => b.setAttribute("aria-pressed", b.dataset.s === s));
  // Every status except Bucket list now says "— optional" (E1): years being
  // skippable is useless if nothing tells you so, and the field otherwise looks
  // required. Home already read this way; the other two now match it.
  $(label).textContent = s === "bucket" ? "Year(s) — not needed"
    : (s === "lived" ? "Year(s) lived there" : s === "visited" ? "Year(s) visited" : "Year(s)") + " — optional";
  const inp = $(input);
  inp.placeholder = s === "visited" ? "e.g. 2019, 2023" : s === "bucket" ? "Not needed — you haven't been yet"
    : "e.g. 2011-2014, or 2023- if ongoing";
  // There is no year you haven't been somewhere, so the field steps aside
  // rather than accepting text that would be silently thrown away on save.
  inp.disabled = s === "bucket";
  if (s === "bucket") inp.value = "";
}
// Bucket list is only for somewhere you HAVEN'T been. Offering it for a place
// already on the map would let a single tap convert a visit into a wish and
// quietly delete its years, so it's disabled there (the other direction —
// bucket → Visited — is always open: that's the day you finally go).
function lockBucket(row, iso) {
  const b = $(`${row} button[data-s="bucket"]`), been = isBeen(visits[iso]);
  b.disabled = been;
  b.title = been ? "Already on your map — the bucket list is for places you haven't been yet" : "";
}
function setStatus(s) {
  pendingStatus = s;
  paintStatus("#popStatus", "#popYearsLabel", "#popYears", s);
}
// The entry bar's own copy of the same state, plus whether the user actually
// CHOSE it. That second flag is a safety net, not bookkeeping: a country can be
// resolved without ever going through choose() — typing a full name and pressing
// Submit matches it exactly, with no dropdown selection — and on that path there
// is nothing to preselect the picker from. Without the flag the picker would sit
// on its "Visited" default and demote an existing Home country on submit, which
// is precisely the silent data loss the old status-preserving code avoided. So:
// an explicit pick wins; otherwise the record keeps the status it already had.
let barStatus = "visited", barStatusTouched = false;
function setBarStatus(s, byUser = false) {
  barStatus = s; barStatusTouched = byUser;
  paintStatus("#barStatus", "#yearsLabel", "#years", s);
}
function openPop(iso) {
  const c = PLACE.get(iso), rec = visits[iso], ys = yearsOf(rec);
  const st = statusOf(rec);
  $("#popName").textContent = c.name;
  // Lived/Home show their actual period here too — "lived there" alone said
  // nothing a range was even set, which undersold the point of having one.
  // Visited keeps its plain count; a trip count was never about dates.
  const note = !rec ? "not visited yet"
    : st === "bucket" ? "on your bucket list"
    : st === "home" ? "home country" + (ys.length ? " · " + formatYearsDisplay(ys) : "")
    : st === "lived" ? "lived there" + (ys.length ? " · " + formatYearsDisplay(ys) : "")
    : ys.length ? `visited ${ys.length}×` : "visited"; // "visited 0×" is nonsense for a yearless visit (E1)
  $("#popMeta").textContent = CONTINENTS[c.cont] + (c.official ? "" : " · Territory") + " · " + note;
  $("#popYears").value = formatYearsEdit(ys);
  $("#popErr").textContent = "";
  $("#popRemove").hidden = !rec;
  setStatus(st);
  lockBucket("#popStatus", iso);
  // anchor beside the country's on-screen box
  let r = null;
  els(iso).forEach((e) => { const b = e.getBoundingClientRect(); r = r ? { left: Math.min(r.left, b.left), right: Math.max(r.right, b.right), top: Math.min(r.top, b.top), bottom: Math.max(r.bottom, b.bottom) } : b; });
  const pw = 272, ph = 230, gap = 14;
  let left = r.right + gap;
  if (left + pw > innerWidth - 12) left = r.left - gap - pw;
  if (left < 12) left = Math.min(innerWidth - pw - 12, Math.max(12, (r.left + r.right) / 2 + 40));
  const top = Math.min(innerHeight - ph - 100, Math.max(72, (r.top + r.bottom) / 2 - ph / 2));
  pop.style.left = left + "px"; pop.style.top = top + "px";
  pop.classList.add("open"); pop.setAttribute("aria-hidden", "false"); pop.inert = false;
  // on a phone the popover IS a bottom sheet, so the resting controls stand down
  document.body.classList.add("pop-open");
  setTimeout(() => $("#popYears").focus({ preventScroll: true }), 60);
}
function closePop() {
  pop.classList.remove("open"); pop.setAttribute("aria-hidden", "true"); pop.inert = true;
  document.body.classList.remove("pop-open");
  if (popTrigger) { popTrigger.focus(); popTrigger = null; }
}
// A fingertip is far blunter than a cursor, and at world zoom a country can be
// a few pixels wide, so a tap that lands in open water looks for a place within
// a thumb's slack of it before giving up and deselecting.
function nearestPlace(x, y, maxPx) {
  const sx = innerWidth / view.w, sy = innerHeight / view.h;
  let best = null, bd = maxPx;
  for (const iso in GEO.a) {
    const a = GEO.a[iso];
    const d = Math.hypot((a[0] - view.x) * sx - x, (a[1] - view.y) * sy - y);
    if (d < bd) { bd = d; best = iso; }
  }
  return best;
}
svg.addEventListener("click", (e) => {
  if (moved || gestureClick) return; // a pan or a pinch must never land as a tap
  if (peeked) return;            // a press-and-hold peek must not also open the popover
  hideTip();
  if (phone() && bar.classList.contains("up")) closeBar();
  // not e.pointerType: `click` is only a PointerEvent in some engines, so the
  // pointer kind is recorded on pointerdown instead of inferred here
  const iso = e.target.dataset?.iso
    || (lastPointer !== "mouse" && !e.target.dataset?.t ? nearestPlace(e.clientX, e.clientY, 22) : null);
  if (!iso) return select(null);
  select(iso === selected && pop.classList.contains("open") ? null : iso, true);
});
$("#popClose").onclick = () => select(null);
document.querySelectorAll("#popStatus button").forEach((b) => (b.onclick = () => { setStatus(b.dataset.s); $("#popErr").textContent = ""; }));
document.querySelectorAll("#barStatus button").forEach((b) => (b.onclick = () => { setBarStatus(b.dataset.s, true); showErr(""); }));
$("#popForm").addEventListener("submit", (e) => {
  e.preventDefault();
  // Years are required for Visited and Lived, optional for Home — you don't
  // have a "year you visited" the country you're from. Periods (a range, or
  // an open "2023-" for ongoing) are only offered once status isn't Visited —
  // "visited continuously from X to Y" isn't a coherent idea the way "lived
  // there from X to Y" is, so Visited keeps its plain-years-only grammar.
  const raw = $("#popYears").value.trim();
  if (pendingStatus === "bucket" && isBeen(visits[selected])) { $("#popErr").textContent = "Already on your map — the bucket list is for places you haven't been yet"; return; }
  // An EMPTY field now means "no years on file" for every status, not just Home
  // (E1, 2026-09-15). Before this, Visited and Lived refused to save without a
  // year — so "I've been there, I don't remember when" had no way to be said,
  // and entering a long backlog in one sitting demanded a remembered year per
  // country, which in practice produces GUESSED years: worse data than an
  // honest blank, and it silently inflates F27's visit-count shading. Nothing
  // downstream needed changing to allow this — `y: []` is exactly what Home and
  // Bucket list have always stored, heatClass() already classes a yearless
  // visit as 1, and encodeMap/decodeMap/validateImport already round-trip it.
  // A non-empty field is still parsed and still rejects a bad token.
  const r = pendingStatus === "bucket" || !raw ? { years: [] }
    : parseYears(raw, new Date().getFullYear(), pendingStatus !== "visited");
  if (r.error) { $("#popErr").textContent = r.error; return; }
  const iso = selected; closePop(); save(iso, r.years, pendingStatus);
  setTimeout(() => selected === iso && select(null), 900);
});
$("#popRemove").onclick = () => { const iso = selected; select(null); remove(iso); };

/* ── save / remove / undo ── */
let undoFn = null, toastT;
function toast(msg, undo) {
  $("#toastMsg").textContent = msg; undoFn = undo;
  $("#toast").classList.add("show");
  clearTimeout(toastT); toastT = setTimeout(() => $("#toast").classList.remove("show"), 5000);
}
$("#undo").onclick = () => { undoFn?.(); $("#toast").classList.remove("show"); };
function commit(next) { visits = next; paint(); renderRows(); syncUrl(); }
function save(iso, years, status) {
  const prev = structuredClone(visits);
  const s = status ?? statusOf(visits[iso]); // typing in the entry bar never downgrades an existing Home/Lived
  const rec = s === "visited" ? { y: years } : { y: years, s };
  commit({ ...visits, [iso]: rec });
  ripple(iso);
  const n = $("#count"); n.classList.remove("bump"); void n.offsetWidth; n.classList.add("bump");
  const detail = formatYearsDisplay(years) || STATUS[s];
  toast(`${PLACE.get(iso).name} ${prev[iso] ? "updated" : "added"} · ${detail}`, () => commit(prev));
}
function remove(iso) {
  const prev = structuredClone(visits), next = { ...visits };
  delete next[iso]; commit(next);
  toast(`${PLACE.get(iso).name} removed`, () => commit(prev));
}
function ripple(iso) {
  if (reduce.matches) return;
  const [cx, cy, x0, y0, x1, y1] = GEO.a[iso];
  const scale = innerWidth / view.w;
  const r = Math.max(30 / scale, Math.hypot(x1 - x0, y1 - y0) * 0.55);
  const c = document.createElementNS("http://www.w3.org/2000/svg", "circle");
  c.setAttribute("class", "ripple"); c.setAttribute("cx", cx); c.setAttribute("cy", cy); c.setAttribute("r", r);
  c.addEventListener("animationend", () => c.remove());
  $("#fx").appendChild(c);
}

/* ── entry bar (combobox) ── */
const cIn = $("#country"), list = $("#list"), yIn = $("#years"), err = $("#err"), bar = $("#entry");
let opts = [], active = -1, chosen = null;
const combo = cIn.parentElement; // .field.combo — #list's positioning anchor on desktop
function renderList() {
  const open = !!cIn.value.trim();
  list.classList.toggle("open", open);
  cIn.setAttribute("aria-expanded", open);
  if (!open) return;
  // #list is a body-level element (index.html explains why) positioned here in
  // JS, recomputed on every keystroke — which also keeps it correctly placed
  // as the entry sheet shifts for the on-screen keyboard (§V2b) without any
  // extra wiring, since this just re-reads wherever things currently are.
  //
  // Desktop floats it above the combo FIELD (matching the old CSS-relative
  // behaviour exactly: left-aligned, capped at 340px wide). Mobile floats it
  // above the whole SHEET, not just the field — the sheet has its own title
  // bar above the field, and anchoring to the field alone floated the dropdown
  // right over that title instead of clear above the entire sheet.
  const onPhone = phone();
  const a = (onPhone ? bar : combo).getBoundingClientRect();
  list.style.left = a.left + "px";
  list.style.width = onPhone ? a.width + "px" : Math.min(340, innerWidth - 32) + "px";
  list.style.bottom = innerHeight - a.top + 12 + "px";
  list.innerHTML = opts.length
    ? opts.map((c, i) => `<li role="option" id="o${i}" data-iso="${c.iso}" aria-selected="${i === active}"><span>${highlight(c.name, cIn.value)}</span><small>${visits[c.iso] ? `<i class="${statusOf(visits[c.iso])}"></i>${formatYearsDisplay(yearsOf(visits[c.iso])) || STATUS[statusOf(visits[c.iso])]}` : CONTINENTS[c.cont]}${c.official ? "" : " · Territory"}</small></li>`).join("")
    : `<li class="none">No country matches “${esc(cIn.value.trim())}”</li>`;
  cIn.setAttribute("aria-activedescendant", active >= 0 ? "o" + active : "");
  list.querySelector("[aria-selected=true]")?.scrollIntoView({ block: "nearest" });
}
function closeList() { list.classList.remove("open"); cIn.setAttribute("aria-expanded", "false"); }
function choose(iso) {
  const c = PLACE.get(iso);
  cIn.value = c.name; chosen = iso; closeList(); showErr("");
  yIn.value = formatYearsEdit(yearsOf(visits[iso]));
  // Preselect the status this place ALREADY has, exactly as the popover does
  // when it opens. Without this the picker would sit on its "Visited" default
  // and submitting would silently demote a Home or Lived country — a worse bug
  // than the missing choice it was added to fix, since the old code at least
  // preserved an existing status. Changing it is now a deliberate act.
  setBarStatus(statusOf(visits[iso]));
  lockBucket("#barStatus", iso);
  closePop(); select(iso, false); flyTo(iso);
  yIn.focus();
}
// Retyping the country abandons the previous one, so the status it carried must
// go with it — otherwise picking India (Home), then clearing and typing Japan,
// would leave "Home" selected and quietly file Japan as a home country.
cIn.addEventListener("input", () => { chosen = null; setBarStatus("visited"); lockBucket("#barStatus", null); opts = search(cIn.value, PLACES); active = opts.length ? 0 : -1; showErr(""); renderList(); });
cIn.addEventListener("keydown", (e) => {
  if (!list.classList.contains("open")) return;
  if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); if (opts.length) { active = (active + (e.key === "ArrowDown" ? 1 : -1) + opts.length) % opts.length; renderList(); } }
  else if (e.key === "Enter" && active >= 0) { e.preventDefault(); choose(opts[active].iso); }
  else if (e.key === "Escape") closeList();
});
// Typing a full country name and clicking away resolves it here, without ever
// going through choose() — so the picker has to be brought in line here too, or
// it would show "Visited" for a country the app still holds as Home.
cIn.addEventListener("blur", () => setTimeout(() => { closeList(); if (!chosen) { const iso = exact(cIn.value, PLACES); if (iso) { chosen = iso; if (!barStatusTouched) setBarStatus(statusOf(visits[iso])); lockBucket("#barStatus", iso); } } }, 120));
cIn.addEventListener("focus", () => { if (cIn.value && !chosen) renderList(); });
list.addEventListener("mousedown", (e) => { e.preventDefault(); const li = e.target.closest("li[data-iso]"); if (li) choose(li.dataset.iso); });
function showErr(msg) {
  err.textContent = msg; err.classList.toggle("show", !!msg);
  if (msg) { bar.classList.remove("shake"); void bar.offsetWidth; bar.classList.add("shake"); }
}

/* ── the entry sheet on a phone (spec §4.7 / plan L14) ──
   On desktop the bar is always open: there's room, and a permanently visible
   entry point is the better desktop design. On a phone the same three rows held
   ~25 % of the screen hostage while empty, so here it's summoned. Both are the
   right answer for their own device, which is the whole point of L14. */
const addBtn = $("#addBtn");
const phone = () => innerWidth <= 640;
function openBar() {
  bar.classList.add("up"); addBtn.classList.add("off");
  document.body.classList.add("entry-open");
  closePop(); select(null);
  setTimeout(() => cIn.focus(), 140);
}
function closeBar() {
  bar.classList.remove("up"); addBtn.classList.remove("off");
  document.body.classList.remove("entry-open");
  closeList(); showErr(""); cIn.blur(); yIn.blur();
}
addBtn.onclick = openBar;
$("#barClose").onclick = closeBar;
addEventListener("keydown", (e) => { if (e.key === "Escape" && phone() && bar.classList.contains("up")) closeBar(); });
// Desktop has no sheet to close, so leaving mobile width must not strand it shut
addEventListener("resize", () => { if (!phone()) closeBar(); });

// Every docked bottom sheet that holds a text input — the entry bar AND a
// country's popover — must lift clear of the on-screen keyboard, or the
// keyboard covers the very field it was opened to fill. (Reported 2026-09-14:
// tapping a country brought up the popover, the keyboard covered its Year(s)
// field, and there was no way to see what you were typing.) The first version
// of this only tracked the entry bar and, worse, forced --kb to 0 whenever the
// bar itself was closed — which is exactly the popover's case, so the popover
// never got the lift at all. Tracked once here, on the root element, so every
// sheet reads the same value via CSS instead of duplicating this math per sheet.
if (window.visualViewport) {
  const vv = visualViewport;
  const track = () => {
    const kb = phone() ? Math.max(0, innerHeight - vv.height - vv.offsetTop) : 0;
    document.documentElement.style.setProperty("--kb", kb + "px");
  };
  vv.addEventListener("resize", track);
  vv.addEventListener("scroll", track);
}
bar.addEventListener("submit", (e) => {
  e.preventDefault();
  const iso = chosen || exact(cIn.value, PLACES);
  if (!iso) { showErr(cIn.value.trim() ? `“${cIn.value.trim()}” isn't one of the 195 countries. Pick one from the list` : "Choose a country first"); cIn.focus(); return; }
  const raw = yIn.value.trim();
  // The bar now carries its own status, so it gates periods on what the user
  // actually chose here — exactly as the popover does — rather than on whatever
  // the record happened to hold already. That also means this path can now SET
  // Lived/Home, and can deliberately change one back to Visited; before, it
  // silently preserved an existing status and could never assign one.
  const rec = visits[iso], existingStatus = statusOf(rec);
  const s = barStatusTouched ? barStatus : existingStatus;
  // Guard the one path the disabled button can't: picking Bucket list, then
  // typing a place that's already on the map and submitting straight away.
  if (s === "bucket" && isBeen(rec)) { showErr(`${PLACE.get(iso).name} is already on your map — the bucket list is for places you haven't been yet`); return; }
  const r = s === "bucket" || !raw ? { years: [] } : parseYears(raw, new Date().getFullYear(), s !== "visited"); // empty = no years, any status (E1 — see the popover's own submit)
  if (r.error) { showErr(r.error); yIn.focus(); return; }
  // ADD to what's already recorded rather than replace it (owner report,
  // 2026-09-15): typing a country a second time to fill in a year forgotten the
  // first time used to silently wipe the years already on file — Submit here
  // behaved exactly like the popover's, replacing the whole list, but with no
  // full-list view to make that obvious first. Merging is the entry bar's own
  // behaviour (`mergeYears`, logic.js); the popover still replaces outright,
  // since it always shows the complete list before you touch it.
  // Only merges when the status ISN'T also changing — a deliberate status
  // change replaces the years outright, same as before, so a Visited/Lived
  // switch can't leave old- and new-shaped entries mixed in one record.
  const years = rec && s === existingStatus ? mergeYears(yearsOf(rec), r.years) : r.years;
  if (selected !== iso) { select(iso, false); flyTo(iso); }
  save(iso, years, s);
  cIn.value = ""; yIn.value = ""; chosen = null; showErr(""); setBarStatus("visited");
  if (phone()) closeBar(); // hand the map back the screen as soon as the work is done
  setTimeout(() => selected === iso && select(null), 900);
});
[cIn, yIn].forEach((i) => i.addEventListener("input", () => err.classList.contains("show") && i === yIn && showErr("")));

/* ── side panel ── */
// Denominators for the per-continent progress (F13/E3), counted ONCE from
// COUNTRIES — which holds only the official 195, never TERRITORIES, so G6 is
// structural here rather than a filter someone has to remember to apply. The
// totals these produce are the ones `tests/data.test.mjs` already pins against
// Worldometers (Africa 54 · Asia 48 · Europe 44 · NA 23 · SA 12 · Oceania 14),
// so this needs no test of its own — it reads the same array that test guards.
const CONT_TOTAL = COUNTRIES.reduce((m, c) => ((m[c[3]] = (m[c[3]] || 0) + 1), m), {});
let sort = { col: "name", dir: 1 };
function renderRows(enter) {
  const rows = Object.entries(visits).map(([iso]) => {
    const c = PLACE.get(iso), rec = visits[iso], ys = yearsOf(rec), st = statusOf(rec);
    // "# times" only means something for a visit — for somewhere you live or
    // are from, a count of years-present isn't a count of trips.
    return { iso, name: c.name, official: c.official, ys, st, heat: heatClass(rec), times: st === "visited" && ys.length ? ys.length : null,
             cont: CONTINENTS[c.cont], last: latestYear(ys) };
  });
  const key = { name: (r) => r.name, years: (r) => r.last, times: (r) => r.times, cont: (r) => r.cont }[sort.col];
  rows.sort((a, b) => { const x = key(a), y = key(b); return (x < y ? -1 : x > y ? 1 : 0) * sort.dir || a.name.localeCompare(b.name); });
  // Places you've been first, then the bucket list as its own group — it's a
  // different list (somewhere you HAVEN'T been), so it never interleaves with
  // the visits whatever the sort, and never counts in the total below.
  const been = rows.filter((r) => r.st !== "bucket"), wish = rows.filter((r) => r.st === "bucket");
  const row = (r, i) => `<tr data-iso="${r.iso}" style="--i:${i}" tabindex="0" aria-label="${esc(r.name)}, ${r.st === "bucket" ? "on your bucket list, " : ""}edit or remove"><td class="name"><i class="${r.st} h${r.heat}"></i>${esc(r.name)}${r.st === "visited" ? "" : `<span class="tbadge on ${r.st}">${STATUS[r.st]}</span>`}${r.official ? "" : '<span class="tbadge">Territory</span>'}</td><td class="num">${formatYearsDisplay(r.ys) || "<span class=muted>—</span>"}</td><td class="r num">${r.times ?? "<span class=muted>—</span>"}</td><td class="muted cont">${r.cont}</td></tr>`;
  const tb = $("#rows");
  tb.innerHTML = been.map(row).join("")
    + (wish.length ? `<tr class="grp"><td colspan="4">Bucket list · ${wish.length}</td></tr>` + wish.map((r, i) => row(r, been.length + i)).join("") : "");
  if (enter && !reduce.matches) { tb.classList.remove("enter"); void tb.offsetWidth; tb.classList.add("enter"); }
  const { count: n, territoryCount: nt, bucketCount: nb, byContinent: bc } = stats(visits, placeOf);
  $("#pCount").textContent = n;
  // F13, shipped at last (E3). stats() has computed byContinent on every render
  // since the beginning and NOTHING consumed it — the arithmetic was being done
  // and thrown away. Hidden entirely until at least one of the 195 is recorded,
  // because six rows of "0/54" is noise on an empty map, not information.
  $("#byCont").hidden = !n;
  $("#byCont").innerHTML = !n ? "" : Object.keys(CONTINENTS).map((k) => {
    // The share is now STATED as well as drawn (E4, owner 2026-09-15). A bar
    // answers "some" where the reader wants "how much", and the number costs
    // nothing: it is the same value the bar already encodes. Countries only —
    // territories are excluded by construction, since CONT_TOTAL counts
    // COUNTRIES and stats() skips territories (G6), which is what the owner
    // asked for when scoping this to countries rather than land area.
    const v = bc[k] || 0, t = CONT_TOTAL[k], pct = Math.round((v / t) * 100);
    return `<div><span>${CONTINENTS[k]}</span><b>${v}/${t} · ${pct}%</b><i style="--p:${pct}%"></i></div>`;
  }).join("");
  $("#total").innerHTML = `Total &nbsp;<b class="num">${n}</b> of 195 countries <span class="muted">· ${((n / 195) * 100).toFixed(1)}%</span>`
    + (nt ? ` <span class="muted">· +${nt} ${nt === 1 ? "territory" : "territories"} visited</span>` : "")
    + (nb ? ` <span class="muted">· ${nb} on your bucket list</span>` : "");
  $("#empty").hidden = rows.length > 0;
  document.querySelectorAll("th[data-col]").forEach((th) => th.dataset.col === sort.col ? th.setAttribute("aria-sort", sort.dir > 0 ? "ascending" : "descending") : th.removeAttribute("aria-sort"));
}
function openPanel() { if (phone()) closeBar(); renderRows(true); $("#panel").inert = false; $("#panel").classList.add("open"); $("#panel").setAttribute("aria-hidden", "false"); $("#scrim").classList.add("open"); closePop(); $("#pClose").focus(); }
function closePanel() {
  $("#panel").classList.remove("open"); $("#panel").setAttribute("aria-hidden", "true"); $("#panel").inert = true; $("#scrim").classList.remove("open");
  // #countBtn is the panel's one and only opener, so it's always the right
  // place for focus to land — without this it fell through to <body> once
  // the panel (and whatever inside it had focus) went inert
  $("#countBtn").focus();
}
$("#countBtn").onclick = openPanel;
$("#pClose").onclick = closePanel;
$("#scrim").onclick = closePanel;
document.querySelectorAll("th[data-col] button").forEach((b) => (b.onclick = () => {
  const col = b.parentNode.dataset.col;
  sort = sort.col === col ? { col, dir: -sort.dir } : { col, dir: col === "times" || col === "years" ? -1 : 1 };
  renderRows();
}));
// A row is the only place to reach an already-saved country's Remove control
// (the map itself is mouse/touch-only, by design — spec §4.2), so unlike the
// map, a row genuinely CANNOT be mouse-only without also making removal
// keyboard-unreachable. tabindex + this keydown handler give it the same
// activation Enter/Space give a real <button>, without changing its role (a
// <tr role="button"> would strip its row semantics from the table).
function openRow(tr) {
  const iso = tr.dataset.iso; closePanel(); flyTo(iso);
  popTrigger = $("#countBtn"); // this is the one path into the popover a
  // keyboard user can actually take, so it's the one case worth restoring
  // focus for — a raw map click has no keyboard-focus concept to return to
  setTimeout(() => select(iso, true), reduce.matches ? 0 : 680);
}
$("#rows").addEventListener("click", (e) => { const tr = e.target.closest("tr[data-iso]"); if (tr) openRow(tr); });
$("#rows").addEventListener("keydown", (e) => {
  if (e.key !== "Enter" && e.key !== " ") return;
  const tr = e.target.closest("tr[data-iso]"); if (!tr) return;
  e.preventDefault(); openRow(tr);
});

/* ── save by link / clear / export / import ── */
// Manual saving only works if the app says when the kept copy is stale.
// Without this, the failure is silent: you add three countries, never re-send
// the link, and a browser cleanup takes them.
function updateSavedState() {
  const el = $("#savedState");
  if (!el) return;
  const now = encodeMap(visits), kept = Store.keptCode();
  const n = Object.keys(visits).length;
  // The same judgement drives two surfaces now: the sentence in the panel, and a
  // quiet outline on the Save button itself. The panel's copy is only read by
  // someone who already opened the panel — which is exactly the person who does
  // NOT need reminding. Since the button moved onto the map (2026-09-15), the
  // state can be shown where the action is.
  const mark = (stale, text) => {
    el.textContent = text;
    el.classList.toggle("stale", stale);
    $("#emailMap")?.classList.toggle("stale", stale);
  };
  if (!n) return mark(false, "Your map lives in its own link — no account, nothing stored on a server.");
  if (!kept) return mark(true, "Not saved yet — email yourself the link to keep this map.");
  if (kept !== now) return mark(true, "Changed since you last saved — email yourself the link again to keep it.");
  mark(false, "Saved — the link you emailed is up to date.");
}
// mailto: needs no server and no address on our side — it hands the user's own
// mail client a pre-filled message and gets out of the way. Nothing about the
// map or the address ever reaches us, because there is no "us".
//
// This whole scheme assumes `location.href` is a real, stable address — true
// on http(s), where reopening it later reproduces the exact page. It is NOT
// true once the app is a downloaded file: Android hands a tapped file to the
// browser as a `content://…` URI with no folder and often no long-term
// validity (it can go stale once the download entry is cleared), and even a
// desktop file:// path, while it DOES work reopened on the SAME machine
// (verified in Phase 1), is not something a mail app treats as a clickable
// link on a phone. Reported 2026-09-14: a real user got exactly this — a
// `content://downloads/...#m=...` string in their inbox, meaningless to
// anyone, including themselves days later. **Every phone user of the
// single-file build hits this**, not an edge case, since Android's normal
// "download and open" flow always produces a content:// origin. Detected and
// redirected to the one mechanism this app has that's already protocol-
// independent — Export/Import — rather than emailing a link that cannot work.
function exportJson() {
  const blob = new Blob([JSON.stringify({ v: 1, visits }, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const name = `travelmap-${new Date().toISOString().slice(0, 10)}.json`;
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return name;
}
$("#emailMap").onclick = () => {
  if (!Object.keys(visits).length) return toast("Add a country first — there's nothing to save yet", null);
  syncUrl();
  const n = stats(visits, placeOf).count;
  const subject = "My Nomadic Traveller Map";
  const linkWorks = location.protocol === "http:" || location.protocol === "https:";
  let body;
  if (linkWorks) {
    body = `My travel map — ${n} of 195 countries so far.\n\nOpen this link any time to see it or add to it:\n\n${location.href}\n\nKeep this email; the link is the map.`;
  } else {
    const name = exportJson();
    body = `My travel map — ${n} of 195 countries so far.\n\n` +
      `This copy of the app is running from a downloaded file, not a real web address, so it can't create a link you can click to reopen it — a backup file (${name}) was just saved to your Downloads instead.\n\n` +
      `Before sending: attach that file to this email.\n\n` +
      `To restore it later: open Nomadic Traveller Map, tap the menu (≡) at the top right, then Import, and choose the attached file.`;
  }
  location.href = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  Store.markKept(visits); updateSavedState();
  toast(linkWorks ? "Opening your email app — send it to yourself to keep this map" : "Opening your email app — attach the file that just downloaded, then send it to yourself", null);
};
$("#clearMap").onclick = () => {
  if (!Object.keys(visits).length) return toast("The map is already empty", null);
  const prev = structuredClone(visits);
  select(null); closePanel();
  commit({});
  // Destructive, so it gets the same Undo the rest of the app uses rather than
  // a confirm dialog — one click to undo beats one click to confirm every time.
  toast("Map cleared", () => commit(prev));
};
// Export: a real file download (this is a plain web app the user runs in
// their own browser, not a sandboxed preview — a download anchor works
// normally). Import: validated all-or-nothing through logic.js, never
// partially applied, with the same Undo pattern as everything else.
$("#exp").onclick = () => {
  if (!Object.keys(visits).length) return toast("Add a country first — there's nothing to export yet", null);
  exportJson();
};
const importFile = $("#importFile");
$("#imp").onclick = () => importFile.click();
importFile.addEventListener("change", async () => {
  const file = importFile.files[0]; importFile.value = "";
  if (!file) return;
  let parsed;
  try { parsed = JSON.parse(await file.text()); }
  catch { return toast("That file isn't valid JSON — nothing was changed", null); }
  const r = validateImport(parsed, isKnown);
  if (r.error) return toast(r.error + " Nothing was changed.", null);
  const prev = structuredClone(visits);
  commit(r.visits);
  toast(`Imported ${Object.keys(r.visits).length} places`, () => commit(prev));
});

/* ── "official count" corner card ── */
const aboutBtn = $("#aboutBtn"), aboutCard = $("#aboutCard");
function toggleAbout(open) {
  aboutCard.classList.toggle("open", open); aboutCard.setAttribute("aria-hidden", !open); aboutCard.inert = !open;
  aboutBtn.setAttribute("aria-expanded", open);
}
aboutBtn.onclick = () => toggleAbout(!aboutCard.classList.contains("open"));
addEventListener("click", (e) => { if (aboutCard.classList.contains("open") && !e.target.closest(".about")) toggleAbout(false); });

/* ── focus containment for the popover and panel ──
   `inert` (already used elsewhere) keeps Tab from reaching a CLOSED dialog's
   contents; this is the other half — keeping Tab from LEAVING an OPEN one.
   Without it, Tab out of the last field in the popover lands on the header
   pills or the zoom buttons behind it, which is exactly what "focus stays
   inside... while open" (this file's own V1 acceptance line) rules out. */
function trapTab(container, e) {
  if (e.key !== "Tab") return;
  const items = [...container.querySelectorAll('button,[href],input,select,textarea,[tabindex]:not([tabindex="-1"])')]
    .filter((el) => !el.disabled && el.offsetParent !== null);
  if (!items.length) return;
  const first = items[0], last = items[items.length - 1];
  if (e.shiftKey ? document.activeElement === first : document.activeElement === last) {
    e.preventDefault();
    (e.shiftKey ? last : first).focus();
  }
}
pop.addEventListener("keydown", (e) => trapTab(pop, e));
$("#panel").addEventListener("keydown", (e) => trapTab($("#panel"), e));

/* ── the wordmark's description ──
   CSS already shows it on hover and on keyboard focus. This adds the tap path,
   which is not a nicety: a phone has no hover state at all, so without it the
   sentence would be unreachable on the device half the audience uses. Toggling
   rather than showing means a second tap dismisses it, and it also closes on
   Escape and on a tap anywhere else — the same three ways every other
   dismissible surface in this app closes. */
const brandBtn = $("#brandBtn"), brandTip = $("#brandTip"), brandWrap = $(".brandWrap");
const showBrandTip = (on) => { brandTip.classList.toggle("show", on); if (on) brandWrap.classList.remove("hush"); };
brandBtn.onclick = (e) => { e.stopPropagation(); showBrandTip(!brandTip.classList.contains("show")); };
addEventListener("click", (e) => { if (!e.target.closest(".brandWrap")) showBrandTip(false); });
// A dismissal lasts until the user shows fresh intent: moving focus away, or
// deliberately hovering the wordmark again. NOT until the pointer merely moves —
// that was the first version, and it meant Escape appeared to do nothing at all,
// because sliding the mouse off cleared the hush while the button still held
// focus, and :focus-visible put the tooltip straight back.
brandBtn.addEventListener("blur", () => brandWrap.classList.remove("hush"));
brandBtn.addEventListener("pointerenter", () => brandWrap.classList.remove("hush"));

/* ── global keys ── */
addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  if ($("#panel").classList.contains("open")) closePanel();
  else if (pop.classList.contains("open")) select(null);
  else if (aboutCard.classList.contains("open")) toggleAbout(false);
  else if (+getComputedStyle(brandTip).opacity > 0) { showBrandTip(false); brandWrap.classList.add("hush"); }
});
// A window "resize" on a phone doesn't only mean the device rotated or the
// browser chrome resized — dismissing the on-screen keyboard does too, and
// so does the popover itself: it's a bottom sheet with its own focused input
// (openPop() below), and closing it (popClose, scrim, Escape) drops that
// focus and the keyboard with it. The old code called apply(home()) here
// unconditionally, so a phone user who'd zoomed into a country, tapped it,
// and closed the popover watched the map jump straight back to fully zoomed
// out on every such close — reported 2026-09-15 ("click close, the map
// resets back to zoomed out"). Recentre only if the view was ALREADY resting
// at home before this fired (the ordinary case: nothing has been zoomed into
// yet, so home() tracking the new dimensions is exactly what should happen,
// e.g. an actual orientation flip at rest). Otherwise keep the same view,
// just handed through apply() again so it's reclamped against whatever the
// new base/zoomMin() now are — preserving the zoom instead of discarding it.
addEventListener("resize", () => {
  // Number.isFinite(view?.w) guards two states where `view` isn't a real
  // view to preserve: undefined (a resize firing before boot's own first
  // apply(home()) at the bottom of this file has run — some browsers
  // dispatch an early resize during initial layout), and NaN (innerWidth/
  // innerHeight briefly read 0 — seen in an automated viewport-resize tool,
  // possibly a real device mid-rotation too — which sends fit()'s own
  // division-by-zero all the way into view.w). Either way there's nothing
  // valid to hold onto, and per-field atHome() comparisons against NaN are
  // always false, which would otherwise read as "diverged" and latch that
  // broken view in place forever instead of self-healing on the next resize.
  const wasHome = !Number.isFinite(view?.w) || atHome(view, home());
  fit();
  apply(wasHome ? home() : view);
});

/* ── heatmap on/off ──
   A per-device display preference, like a remembered sort order — NOT part of
   the map, so it lives in localStorage and never in the link: the same map
   link opens as a heatmap for one person and in classic red for another, and
   neither choice changes the data. On by default. try/catch because storage
   can be blocked outright (private windows, some embedded browsers). */
const HEAT_KEY = "travelmap.heat";
let heatOn = true;
try { heatOn = localStorage.getItem(HEAT_KEY) !== "0"; } catch {}
function applyHeat() {
  document.body.classList.toggle("heat-off", !heatOn);
  $("#heatToggle").checked = heatOn;
}
$("#heatToggle").onchange = (e) => {
  heatOn = e.target.checked;
  try { localStorage.setItem(HEAT_KEY, heatOn ? "1" : "0"); } catch {}
  applyHeat(); paint();
};
applyHeat();

/* ── boot ── */
$("#aboutExtraCount").textContent = $("#aboutExtraCount2").textContent = TERRITORIES.length;
// A link beats local storage beats an empty map.
visits = Store.load() || {};
syncUrl();
renderMap(); fit(); apply(home()); renderRows();
// Paint the entry bar's status row once at boot. Without this, paintStatus()
// only ever ran from an interaction (a status click, choosing a country, typing,
// blur, submit), so the Year(s) label kept index.html's STATIC text until the
// user touched something — and that text says "Year(s) visited", not
// "— optional". The one moment someone needs to know years are skippable (F32)
// is their first look at an empty map, which was the one moment it didn't say
// so. State-wise this is a no-op (barStatus already starts "visited"); it exists
// purely so paintStatus owns that label rather than sharing it with the markup.
setBarStatus("visited");
requestAnimationFrame(() => { svg.classList.add("ready"); setTimeout(() => paint(true), 250); });

/* ── installable (PWA) ──
   Offline + a home-screen icon are nice on their own, but the concrete reason
   this exists (spec F20): a browser TAB's localStorage is evicted by Safari
   after 7 days of not visiting the site — a real risk for an app opened a
   few times a year. A home-screen install is exempt from that eviction.
   file:// and http: (non-localhost) can't register a service worker at all,
   so this fails silently there by design — the map still works, just without
   the install/offline layer. */
// The hostname list mirrors what browsers actually treat as a "potentially
// trustworthy" origin, which is wider than the literal string "localhost":
// 127.0.0.1 and [::1] qualify too. Checking only for "localhost" made the app
// refuse to register on an origin where registration works perfectly — found
// while staging the Pages deploy, where a dry run served from 127.0.0.1 reported
// zero service workers and briefly looked like a deployment problem. Production
// was never affected (Pages is https), but a verification step that reports a
// false failure is worth fixing, since the next person to see it has to re-derive
// that it's benign.
const secureForSW =
  location.protocol === "https:" ||
  ["localhost", "127.0.0.1", "[::1]"].includes(location.hostname) ||
  location.hostname.endsWith(".localhost");
if ("serviceWorker" in navigator && secureForSW) {
  navigator.serviceWorker.register("service-worker.js").catch(() => {});
}
