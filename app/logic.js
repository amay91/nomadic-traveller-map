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
// `minYear` (added 2026-09-16 for Upcoming) defaults to 1900 — every existing
// caller is unaffected. Upcoming is the one status where the USEFUL bound is
// the other direction: a booking can't be in the past (that's just a visit),
// so its caller passes `minYear` as this year and `maxYear` as a few years out
// instead of leaving 1900 as the floor.
function parseYears(s, maxYear = new Date().getFullYear(), allowRange = false, minYear = 1900) {
  const toks = (s || "").split(/[\s,;]+/).filter(Boolean);
  if (!toks.length) return { error: "Add at least one year, e.g. 2019" };
  const inRange = (y) => y >= minYear && y <= maxYear;
  const years = [];
  for (const t of toks) {
    if (allowRange && t.includes("-")) {
      const m = /^(\d{4})-(\d{4})?$/.exec(t);
      if (!m) return { error: `“${t}” isn't a year or a period. Use four digits, e.g. 2019 — or a period, e.g. 2011-2014, or 2023- if it's still ongoing` };
      const from = +m[1], to = m[2] ? +m[2] : null;
      if (!inRange(from) || (to !== null && !inRange(to))) return { error: `${t} is outside ${minYear}–${maxYear}` };
      if (to !== null && to < from) return { error: `${t} has its years backwards — the second year should be later` };
      years.push({ from, to });
    } else if (/^\d{4}$/.test(t)) {
      if (!inRange(+t)) return { error: `${t} is outside ${minYear}–${maxYear}` };
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
// "upcoming" (2026-09-16) is a trip already BOOKED — distinct from bucket list,
// which is somewhere you merely want to go, not somewhere with a date. Like
// bucket it means you haven't been, so it never counts toward "of 195"; unlike
// bucket it carries a year, because a booking has one.
//
// It is also the ONE status that can coexist with another, per the owner: you
// can have been somewhere AND have a return trip booked. That combination is
// carried by a separate `u` field rather than by `s`, which stays strictly
// single-valued:
//   { y:[2026], s:"upcoming" }  booked, never been — y holds the booked year(s)
//   { y:[2019], u:2027 }        been in 2019, AND a trip booked for 2027
// `u` holds the booked YEAR itself, not a boolean — it must NOT live inside `y`
// alongside real past visits, or a trip that hasn't happened yet would silently
// count as one (inflating "# times visited" and the heatmap shade before the
// trip has even occurred — caught designing this, not after shipping it). `u`
// is only ever valid alongside the default Visited status — choosing Lived,
// Home or Bucket clears it (app.js enforces it in the UI, validateImport at the
// data boundary).
//
// Both `s:"upcoming"` and `u` accept years up to UPCOMING_YEARS_AHEAD past the
// current one — "imminent," not "someday" (which is what Bucket list is for) —
// but decoding/import are deliberately more LIBERAL than that on the low end:
// a link saved while a trip was still upcoming keeps decoding correctly after
// the date has quietly passed, rather than becoming "corrupt" the day the trip
// would have happened. The entry UI is what actually enforces "not in the
// past" at write time (app.js), not the codec.
const UPCOMING_YEARS_AHEAD = 5;
const STATUS = { visited: "Visited", lived: "Lived", home: "Home", bucket: "Bucket list", upcoming: "Upcoming" };
const yearsOf = (rec) => rec?.y ?? [];
const statusOf = (rec) => rec?.s ?? "visited";
// Somewhere you have actually been. Both "not been yet" statuses are excluded;
// a visited record carrying an upcoming trip (`u`) is still a place you've been.
const isBeen = (rec) => !!rec && rec.s !== "bucket" && rec.s !== "upcoming";
// Somewhere with a booked trip ahead — either kind of record above.
const isUpcoming = (rec) => !!rec && (rec.s === "upcoming" || typeof rec.u === "number");
// The booked year(s), whichever of the two shapes above holds them — what the
// UI actually displays ("upcoming: 2027"), so it doesn't need to know which
// representation a given record uses.
const upcomingYearsOf = (rec) => rec?.s === "upcoming" ? (rec.y || []) : typeof rec?.u === "number" ? [rec.u] : [];

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
  // Neither "not been yet" status takes a heat shade; a visited record that also
  // has a trip booked (`u`) keeps the shade its visits earned.
  if (!rec || rec.s === "bucket" || rec.s === "upcoming") return 0;
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
  let count = 0, territoryCount = 0, bucketCount = 0, upcomingCount = 0;
  for (const iso of Object.keys(visits)) {
    const p = placeOf(iso);
    if (!p) continue; // shouldn't happen — decodeMap/validateImport gate unknown codes
    const rec = visits[iso];
    // Counted independently of everything else, because a booked trip can sit
    // on a place you've already been — so it is NOT a `continue` for the others.
    if (isUpcoming(rec)) upcomingCount++;
    if (rec.s === "bucket") { bucketCount++; continue; }
    if (rec.s === "upcoming") continue;  // booked but not been: like bucket, outside every count
    if (p.official) { count++; byContinent[p.cont] = (byContinent[p.cont] || 0) + 1; }
    else territoryCount++;
  }
  return { count, pct: (count / 195) * 100, byContinent, territoryCount, bucketCount, upcomingCount };
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
// The two 2026-09-16 additions extend the underscore rather than reaching for a
// new character, because the safe set is nearly exhausted: "-" separates places,
// "~" wraps a period, "!" and "*" are Lived and Home, and every other obvious
// punctuation mark gets stripped by mail-client auto-linkers at the end of a
// link (the exact hazard that made bucket an underscore in the first place).
// Counting leading underscores is unambiguous and stays URL-unreserved:
//   _   bucket list        (never been, no years)
//   __  upcoming           (never been; the booked year(s) follow as ordinary
//                            plain years — Upcoming never takes a period)
//   ___ visited + upcoming (been; followed by EXACTLY ONE 2-char chunk for the
//                            single booked year `u`, then the past visit years
//                            exactly as an ordinary Visited record would encode)
const MARK = { lived: "!", home: "*", bucket: "_" };
const upMark = (r) => (r.s === "upcoming" ? "__" : !r.s && typeof r.u === "number" ? "___" : MARK[r.s] || "");
function encodeMap(v) {
  return Object.keys(v).sort().map((iso) => {
    const r = v[iso], mark = upMark(r);
    const upChunk = mark === "___" ? enc36(r.u - Y0) : "";
    return iso + mark + upChunk + (r.s === "bucket" ? "" : (r.y || []).map(encYear).join(""));
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
    let rest = part.slice(3), s, u = null;
    if (rest[0] === "!") { s = "lived"; rest = rest.slice(1); }
    else if (rest[0] === "*") { s = "home"; rest = rest.slice(1); }
    else if (rest[0] === "_") {
      // 1, 2 or 3+ underscores — see upMark above. A longer run than the codec
      // ever writes is a mangled link; treated as the split case (3) rather
      // than inventing a status, same "nearest thing it can be" principle as
      // every other decoder here.
      const n = /^_+/.exec(rest)[0].length;
      rest = rest.slice(n);
      if (n === 1) { s = "bucket"; rest = ""; }   // never has years
      else if (n === 2) s = "upcoming";           // booked years follow below, as plain years
      else {
        // Split: exactly one 2-char chunk is the booked year, THEN the past
        // visit years, decoded the ordinary way (never a period — Visited
        // never takes one). Liberal upper bound (see UPCOMING_YEARS_AHEAD's
        // own comment) so an old link whose trip has since passed still decodes.
        const chunk = rest.slice(0, 2); rest = rest.slice(2);
        const n2 = parseInt(chunk, 36);
        if (Number.isFinite(n2)) { const yr = Y0 + n2; if (yr >= Y0 && yr <= max + UPCOMING_YEARS_AHEAD) u = yr; }
      }
    }
    const y = decodeYears(rest, s === "upcoming" ? max + UPCOMING_YEARS_AHEAD : max);
    out[iso] = s ? { y, s } : u !== null ? { y, u } : { y };
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
  const upMax = max + UPCOMING_YEARS_AHEAD; // liberal on purpose — see UPCOMING_YEARS_AHEAD's own comment
  const valid = (n) => Number.isInteger(n) && n >= 1900 && n <= max;
  const validUp = (n) => Number.isInteger(n) && n >= 1900 && n <= upMax;
  const visits = {};
  for (const [iso, rec] of Object.entries(obj.visits)) {
    if (!/^[A-Z]{3}$/.test(iso) || !isKnown(iso)) return { error: `"${iso}" isn't a country or territory this map knows about.` };
    if (!rec || typeof rec !== "object" || !Array.isArray(rec.y)) return { error: `${iso}'s entry is malformed.` };
    if (rec.s !== undefined && rec.s !== "lived" && rec.s !== "home" && rec.s !== "bucket" && rec.s !== "upcoming") return { error: `${iso} has an invalid status "${rec.s}".` };
    // `u` holds the booked YEAR for "been, and going again" — coherent only on
    // a Visited record, the one combination the owner allowed. Rejected rather
    // than silently dropped: a file claiming Lived+upcoming means something
    // this app cannot represent, and guessing which half to keep would be worse.
    if (rec.u !== undefined && !validUp(rec.u)) return { error: `${iso} has an invalid upcoming year "${rec.u}".` };
    if (rec.u !== undefined && rec.s !== undefined) return { error: `${iso} combines "${rec.s}" with an upcoming trip, which isn't a combination this map allows.` };
    if (rec.s === "bucket") { visits[iso] = { y: [], s: "bucket" }; continue; } // somewhere you haven't been has no years
    // Upcoming's OWN booked year(s) get the liberal future-inclusive bound;
    // every other status keeps the strict "not in the future" bound unchanged.
    const yearOk = rec.s === "upcoming" ? validUp : valid;
    const y = [];
    for (const e of rec.y) {
      if (typeof e === "number") {
        if (!yearOk(e)) return { error: `${iso} has an invalid year "${e}".` };
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
    visits[iso] = rec.s ? { y, s: rec.s } : rec.u !== undefined ? { y, u: rec.u } : { y };
  }
  return { visits };
}

window.Logic = {
  normalize, wordNormalize, search, exact, parseYears, esc, highlight,
  STATUS, yearsOf, statusOf, isBeen, isUpcoming, upcomingYearsOf, UPCOMING_YEARS_AHEAD,
  stats, encodeMap, decodeMap, validateImport,
  latestYear, formatYearsEdit, formatYearsDisplay, mergeYears, HEAT_BINS, heatClass,
};

})();
