// PURE logic — no DOM, no window/document reads, no fetch. Everything here is
// a plain function of its arguments, so `tests/logic.test.mjs` can load this
// file with zero dependencies (via Node's vm, exactly like countries.js/geo.js)
// and exercise it without a browser. app.js is the only thing that touches
// the DOM; it calls into `Logic` and nothing here calls back into it.
//
// Classic script, not a module (plan.md L1 — file:// blocks type="module"),
// so this attaches one object, `window.Logic`, rather than many bare globals.
// The IIFE isn't decoration: a top-level `function` declaration in a classic
// script IS a global, var-like binding — even across separate <script> tags —
// so without this wrapper, app.js's `const { search, ... } = Logic` collides
// with logic.js's own top-level `function search` and throws a SyntaxError
// ("has already been declared") that silently kills the whole page before
// anything renders. Found exactly that way: the map rendered zero shapes,
// with no visible error until console output was checked directly.
(function () {

// ── country/territory lookup ────────────────────────────────────────────
const normalize = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const wordNormalize = (s) => normalize(s).replace(/[^a-z0-9]+/g, " ").trim();

// `places`: an array of {iso, name, cont, aliases, official}. Seven tiers,
// tightest first: exact-name < exact-alias < name-prefix < alias-prefix <
// name-substring < alias-substring < general substring (len > 2 only, to
// avoid two-letter noise matches). Ties between a country and a territory
// favour the country, since the 195 are the primary list. Returns at most 8.
//
// The exact tiers exist because a *complete* typed alias is a stronger
// signal than a mere prefix hit on some other country's real name — found
// by testing, not assumed: without them, "uk" ranked Ukraine (whose own name
// starts with "Uk...") above United Kingdom (whose alias "UK" is an exact,
// complete match), which is backwards from what anyone typing "uk" wants.
function search(q, places) {
  const n = wordNormalize(q);
  if (!n) return [];
  const NONE = 99;
  const out = [];
  for (const c of places) {
    let best = NONE;
    [c.name, ...c.aliases].forEach((t, i) => {
      const s = wordNormalize(t), primary = i === 0;
      const r = s === n ? (primary ? 0 : 1)
        : s.startsWith(n) ? (primary ? 2 : 3)
        : (" " + s).includes(" " + n) ? (primary ? 4 : 5)
        : n.length > 2 && s.includes(n) ? 6 : NONE;
      best = Math.min(best, r);
    });
    if (best < NONE) out.push([best, c]);
  }
  return out.sort((a, b) => a[0] - b[0] || (b[1].official - a[1].official) || a[1].name.localeCompare(b[1].name))
    .slice(0, 8).map((x) => x[1]);
}
// An exact typed name or alias, even if nothing was picked from the dropdown.
function exact(q, places) {
  const n = wordNormalize(q);
  for (const c of places) if ([c.name, ...c.aliases].some((t) => wordNormalize(t) === n)) return c.iso;
  return null;
}

// ── year parsing ────────────────────────────────────────────────────────
// Splits on comma/semicolon/whitespace; every token is EITHER a plain 4-digit
// year, or — only when `allowRange` is true — a period: "2011-2014" (closed)
// or "2023-" (open: still ongoing, ADDED 2026-09-14 for Lived/Home, which are
// genuinely continuous stretches rather than discrete trips; Visited stays
// plain years only, since "visited continuously from X to Y" isn't a
// coherent idea the way "lived there from X to Y" is — `allowRange` is what
// the caller sets from the record's OWN status, not a per-token choice).
// All-or-nothing: the first bad token names itself in the error and nothing
// is returned as partially valid. A parsed entry is a plain `number` for a
// single year, or `{from, to}` for a period — `to` is `null` for "ongoing".
function parseYears(s, maxYear = new Date().getFullYear(), allowRange = false) {
  const toks = (s || "").split(/[\s,;]+/).filter(Boolean);
  if (!toks.length) return { error: "Add at least one year, e.g. 2019" };
  const inRange = (y) => y >= 1900 && y <= maxYear;
  const years = [];
  for (const t of toks) {
    if (allowRange && t.includes("-")) {
      const m = /^(\d{4})-(\d{4})?$/.exec(t);
      if (!m) return { error: `“${t}” isn't a year or a period. Use four digits, e.g. 2019 — or a period, e.g. 2011-2014, or 2023- if it's still ongoing` };
      const from = +m[1], to = m[2] ? +m[2] : null;
      if (!inRange(from) || (to !== null && !inRange(to))) return { error: `${t} is outside 1900–${maxYear}` };
      if (to !== null && to < from) return { error: `${t} has its years backwards — the second year should be later` };
      years.push({ from, to });
    } else if (/^\d{4}$/.test(t)) {
      if (!inRange(+t)) return { error: `${t} is outside 1900–${maxYear}` };
      years.push(+t);
    } else {
      return {
        error: allowRange
          ? `“${t}” isn't a year or a period. Use four digits, e.g. 2019 — or a period, e.g. 2011-2014, or 2023- if it's still ongoing`
          : `“${t}” isn't a year. Use four digits, e.g. 2019`,
      };
    }
  }
  return { years: years.sort((a, b) => yearKey(a) - yearKey(b)) };
}
// A single sortable number for either kind of entry — a plain year is its own
// key; a period sorts by its start, EXCEPT an ongoing one, which always sorts
// as the most recent (it's still happening, so nothing should outrank it).
const ONGOING = 9999;
const yearKey = (e) => typeof e === "number" ? e : e.to === null ? ONGOING + e.from / 10000 : e.from;
// The largest sortable year across a whole record — what the table's "Year(s)"
// column actually sorts by (a place can hold several years/periods).
const latestYear = (y) => y.length ? Math.max(...y.map((e) => typeof e === "number" ? e : e.to ?? ONGOING)) : 0;
// Compact, ROUND-TRIPPABLE text — what goes back into the input field for
// re-editing. A plain hyphen, no "present": typing this back in must parse
// to the exact same value.
const formatYearsEdit = (y) => y.map((e) => typeof e === "number" ? e : `${e.from}-${e.to ?? ""}`).join(", ");
// Reader-facing text — an en dash and the word "present" for an ongoing
// period, since a bare trailing hyphen or today's year (which would look
// like a single, already-ended year, and silently go stale every January)
// both read as typos or errors to someone who isn't the one who typed it.
const formatYearsDisplay = (y) => y.map((e) => typeof e === "number" ? e : `${e.from}–${e.to ?? "present"}`).join(", ");
// Two entries are "the same visit" if they're the identical plain year, or the
// identical period — used only by mergeYears below, never by parseYears, so a
// SINGLE submission that repeats a year on purpose ("2019, 2019", one entry per
// visit — F3, a real feature with its own test) is completely unaffected.
const yearEq = (a, b) =>
  typeof a === "number" && typeof b === "number" ? a === b
  : typeof a === "object" && a && typeof b === "object" && b ? a.from === b.from && a.to === b.to
  : false;
// Added 2026-09-15 (owner report: typing a country a second time to add a year
// you forgot the first time silently WIPED the years already on file, because
// the entry bar's Submit — like the popover's — replaced the whole list).
// mergeYears folds newly-typed years INTO whatever a place already holds,
// rather than replacing it, and drops any incoming entry that's an EXACT repeat
// of one already on file — "if I type a year that's already there, don't add
// it again." Only the entry bar uses this (app.js): the popover keeps replacing
// outright, because it always shows the complete existing list before you touch
// it (spec F4/J3 — the actual edit-and-remove surface), so anything you submit
// there is already a deliberate, fully-visible edit, not a forgotten append.
//
// Only ever called when the record's STATUS is staying the same. A status
// change (Visited -> Lived, say) replaces the years outright instead — merging
// old-status entries into a new one could leave, say, a Visited record holding
// a period, which nothing else here expects ("Visited never mixes in a
// period," spec §5.3) and would silently corrupt the "# times visited" count.
function mergeYears(existing, incoming) {
  const merged = existing.slice();
  for (const e of incoming) if (!merged.some((m) => yearEq(m, e))) merged.push(e);
  return merged.sort((a, b) => yearKey(a) - yearKey(b));
}

// ── text helpers ────────────────────────────────────────────────────────
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
function highlight(name, q) {
  const n = normalize(q).trim(), s = normalize(name);
  const i = s.startsWith(n) ? 0 : s.indexOf(" " + n) + 1 || s.indexOf("-" + n) + 1 || s.indexOf(n);
  if (!n || i < 0) return esc(name);
  return esc(name.slice(0, i)) + "<mark>" + esc(name.slice(i, i + n.length)) + "</mark>" + esc(name.slice(i + n.length));
}

// ── the visited record ──────────────────────────────────────────────────
// visits[code] = { y: number[], s?: "lived" | "home" | "bucket" }. For the
// first three, `s` is a LABEL, never a filter — Visited/Lived/Home all count
// toward "of 195" identically (spec F16) — so it's omitted entirely for the
// default Visited, keeping the common case's stored shape as small as it was
// before status existed.
//
// "bucket" (added 2026-09-15, prototype) is the one exception, and it is a
// different KIND of thing, not a fourth flavour of "been there": a bucket-list
// place is somewhere you have NOT been. So it is the only status that is a
// filter — it never counts toward "of 195", a continent, or the territory line
// (stats() below), it never carries years (there's no year you haven't been
// somewhere), and it is never offered for a place already recorded as
// Visited/Lived/Home (app.js). Marking it Visited later is simply a status
// change, which is exactly what should happen the day you finally go.
const STATUS = { visited: "Visited", lived: "Lived", home: "Home", bucket: "Bucket list" };
const yearsOf = (rec) => rec?.y ?? [];
const statusOf = (rec) => rec?.s ?? "visited";
const isBeen = (rec) => !!rec && rec.s !== "bucket";

// ── the heatmap (added 2026-09-15, prototype) ───────────────────────────
// A CLASSED choropleth — the standard for maps meant to be read value-by-value:
// a small, fixed number of shades (5 — the cartographic guidance is 3–7, and
// five or fewer for general readers) mapped to a single-hue sequential ramp
// whose lightness falls steadily, darker meaning more.
//
// The breaks are FIXED and meaningful — 1 · 2 · 3 · 4–5 · 6+ — rather than
// computed from the data (quantiles, Jenks natural breaks). Data-driven breaks
// are the norm for a one-off statistical map, but on a personal map that grows
// by one trip at a time they would silently move: adding a single trip could
// shift a break and repaint countries you didn't touch, and "this shade means
// three visits" would stop being true from one week to the next. Fixed
// integer breaks keep every shade's meaning stable, which is what makes the
// legend readable at all. Equal-interval is avoided for the usual reason: trip
// counts are heavily skewed (most places 1–2, a few 10+), so the top class is
// open-ended instead.
//
// A visit is a year entry (a repeated year counts as a second visit — F3), so
// the count is exactly the table's "# Times". Lived and Home have no trip
// count ("a count of years-present isn't a count of trips", F16), and living
// somewhere is more exposure than any number of trips, so both take the top
// class — their ink glyph still says which one it is. A Visited record with no
// years at all (possible only via a hand-edited link) is still a visit: class 1.
const HEAT_BINS = [1, 2, 3, 4, 6]; // lower bound of each class; 6 is "6+"
function heatClass(rec) {
  if (!rec || rec.s === "bucket") return 0;
  if (rec.s === "lived" || rec.s === "home") return HEAT_BINS.length;
  const n = Math.max(1, (rec.y || []).length);
  let k = 0;
  while (k < HEAT_BINS.length && n >= HEAT_BINS[k]) k++;
  return k;
}

// stats(): count/pct/byContinent are OFFICIAL-195-ONLY (what the header pill
// and "of 195" line show); territoryCount is the separate "+N territories
// visited" line (spec F7) and never merges into the others. `placeOf(iso)`
// resolves a code to {official, cont}. Status enters this function in exactly
// one way: a bucket-list place is somewhere you HAVEN'T been, so it is skipped
// by every count and tallied only as bucketCount. Visited/Lived/Home are still
// never filtered against each other.
function stats(visits, placeOf) {
  const byContinent = {};
  let count = 0, territoryCount = 0, bucketCount = 0;
  for (const iso of Object.keys(visits)) {
    const p = placeOf(iso);
    if (!p) continue; // shouldn't happen — decodeMap/validateImport gate unknown codes
    if (visits[iso].s === "bucket") { bucketCount++; continue; }
    if (p.official) { count++; byContinent[p.cont] = (byContinent[p.cont] || 0) + 1; }
    else territoryCount++;
  }
  return { count, pct: (count / 195) * 100, byContinent, territoryCount, bucketCount };
}

// ── the map IS the URL ──────────────────────────────────────────────────
// Every place is 3 letters + an optional status mark + 2 base-36 chars per
// year (offset from 1900). A real 12-country map encodes to ~104 characters;
// 100 countries × 3 years each is ~1,000 — still inside the ~2,000-char
// limit browsers and mail clients handle comfortably. So the whole map fits
// in the link: no server, no database, no account (plan.md L12).
const Y0 = 1900;
const enc36 = (n) => n.toString(36).padStart(2, "0");
// A plain year is still exactly 2 base-36 chars, byte-identical to every link
// saved before periods existed. A period is wrapped in `~` on both sides —
// `~` never otherwise appears in this codec (place entries are joined by
// `-`, not `~`) — with 2 chars (from) alone meaning ongoing, or 4 (from+to)
// meaning closed: `~4x~` vs `~4x5a~`. That's what makes an open period
// unambiguous without a dedicated "ongoing" flag: the closing `~` is the only
// thing that has to mark where it ends, so nothing after it is swallowed.
function encYear(e) {
  if (typeof e === "number") return enc36(e - Y0);
  return "~" + enc36(e.from - Y0) + (e.to === null ? "" : enc36(e.to - Y0)) + "~";
}
// Status marks: "!" Lived, "*" Home, "_" Bucket list. The bucket mark is an
// underscore specifically: a bucket-list place never has years, so its mark
// is ALWAYS the last character of its entry — and if that entry sorts last,
// the last character of the whole link. Mail clients' auto-linkers routinely
// strip trailing punctuation like "." or "!" off a link (they read it as the
// end of a sentence), which would silently turn a bucket-list place into a
// visit. "_" is an unreserved URL character that auto-linkers treat as part of
// the word, and it is safe inside URLSearchParams (unlike "+", which decodes
// to a space).
const MARK = { lived: "!", home: "*", bucket: "_" };
function encodeMap(v) {
  return Object.keys(v).sort().map((iso) => {
    const mark = MARK[v[iso].s] || "";
    return iso + mark + (v[iso].s === "bucket" ? "" : (v[iso].y || []).map(encYear).join(""));
  }).join("-");
}
function decodeYears(rest, max) {
  const y = [];
  const dec = (chunk) => { const n = parseInt(chunk, 36); return Number.isFinite(n) ? Y0 + n : null; };
  const valid = (n) => n !== null && n >= Y0 && n <= max;
  let i = 0;
  while (i < rest.length) {
    if (rest[i] === "~") {
      const j = rest.indexOf("~", i + 1);
      if (j === -1) break; // an unterminated period — a mangled link; stop rather than misparse the rest
      const inner = rest.slice(i + 1, j);
      const from = dec(inner.slice(0, 2));
      const to = inner.length > 2 ? dec(inner.slice(2, 4)) : null;
      if (valid(from) && (to === null || (valid(to) && to >= from))) y.push({ from, to });
      i = j + 1;
    } else {
      const n = dec(rest.slice(i, i + 2));
      if (valid(n)) y.push(n);
      i += 2;
    }
  }
  return y.sort((a, b) => yearKey(a) - yearKey(b));
}
// `isKnown(iso)` gates every decoded code — a mangled or hand-edited link
// can't invent a place that isn't one of the 195 + territories.
function decodeMap(str, isKnown) {
  const out = {};
  const max = new Date().getFullYear();
  for (const part of (str || "").split("-")) {
    if (part.length < 3) continue;
    const iso = part.slice(0, 3).toUpperCase();
    if (!isKnown(iso)) continue;
    let rest = part.slice(3), s;
    if (rest[0] === "!") { s = "lived"; rest = rest.slice(1); }
    else if (rest[0] === "*") { s = "home"; rest = rest.slice(1); }
    else if (rest[0] === "_") { s = "bucket"; rest = ""; } // never has years; ignore anything after the mark
    const y = decodeYears(rest, max);
    out[iso] = s ? { y, s } : { y };
  }
  return out;
}

// ── import validation (spec §5.3, F9) ────────────────────────────────────
// All-or-nothing: one bad entry rejects the whole file, and nothing is
// partially applied. Deliberately re-checks everything encodeMap/decodeMap
// would also enforce (shape, known codes, valid years, valid status) rather
// than trusting the file was produced by this app's own Export.
function validateImport(obj, isKnown) {
  if (!obj || typeof obj !== "object" || obj.v !== 1 || !obj.visits || typeof obj.visits !== "object") {
    return { error: "That doesn't look like a Nomadic Traveller Map backup file." };
  }
  const max = new Date().getFullYear();
  const valid = (n) => Number.isInteger(n) && n >= 1900 && n <= max;
  const visits = {};
  for (const [iso, rec] of Object.entries(obj.visits)) {
    if (!/^[A-Z]{3}$/.test(iso) || !isKnown(iso)) return { error: `"${iso}" isn't a country or territory this map knows about.` };
    if (!rec || typeof rec !== "object" || !Array.isArray(rec.y)) return { error: `${iso}'s entry is malformed.` };
    if (rec.s !== undefined && rec.s !== "lived" && rec.s !== "home" && rec.s !== "bucket") return { error: `${iso} has an invalid status "${rec.s}".` };
    if (rec.s === "bucket") { visits[iso] = { y: [], s: "bucket" }; continue; } // somewhere you haven't been has no years
    const y = [];
    for (const e of rec.y) {
      if (typeof e === "number") {
        if (!valid(e)) return { error: `${iso} has an invalid year "${e}".` };
        y.push(e);
      } else if (e && typeof e === "object" && "from" in e) {
        if (!valid(e.from) || (e.to !== null && !valid(e.to)) || (e.to !== null && e.to < e.from)) {
          return { error: `${iso} has an invalid period "${e.from}-${e.to ?? ""}".` };
        }
        y.push({ from: e.from, to: e.to ?? null });
      } else {
        return { error: `${iso} has an invalid year "${e}".` };
      }
    }
    y.sort((a, b) => yearKey(a) - yearKey(b));
    visits[iso] = rec.s ? { y, s: rec.s } : { y };
  }
  return { visits };
}

window.Logic = {
  normalize, wordNormalize, search, exact, parseYears, esc, highlight,
  STATUS, yearsOf, statusOf, isBeen, stats, encodeMap, decodeMap, validateImport,
  latestYear, formatYearsEdit, formatYearsDisplay, mergeYears, HEAT_BINS, heatClass,
};

})();
