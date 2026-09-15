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

// ── text helpers ────────────────────────────────────────────────────────
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
function highlight(name, q) {
  const n = normalize(q).trim(), s = normalize(name);
  const i = s.startsWith(n) ? 0 : s.indexOf(" " + n) + 1 || s.indexOf("-" + n) + 1 || s.indexOf(n);
  if (!n || i < 0) return esc(name);
  return esc(name.slice(0, i)) + "<mark>" + esc(name.slice(i, i + n.length)) + "</mark>" + esc(name.slice(i + n.length));
}

// ── the visited record ──────────────────────────────────────────────────
// visits[code] = { y: number[], s?: "lived" | "home" }. `s` is a LABEL, never
// a filter — Visited/Lived/Home all count toward "of 195" identically (spec
// F16) — so it's omitted entirely for the default Visited, keeping the
// common case's stored shape as small as it was before status existed.
const STATUS = { visited: "Visited", lived: "Lived", home: "Home" };
const yearsOf = (rec) => rec?.y ?? [];
const statusOf = (rec) => rec?.s ?? "visited";

// stats(): count/pct/byContinent are OFFICIAL-195-ONLY (what the header pill
// and "of 195" line show); territoryCount is the separate "+N territories
// visited" line (spec F7) and never merges into the others. `placeOf(iso)`
// resolves a code to {official, cont} — status never enters this function,
// so there is no status filter here to get wrong.
function stats(visits, placeOf) {
  const byContinent = {};
  let count = 0, territoryCount = 0;
  for (const iso of Object.keys(visits)) {
    const p = placeOf(iso);
    if (!p) continue; // shouldn't happen — decodeMap/validateImport gate unknown codes
    if (p.official) { count++; byContinent[p.cont] = (byContinent[p.cont] || 0) + 1; }
    else territoryCount++;
  }
  return { count, pct: (count / 195) * 100, byContinent, territoryCount };
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
function encodeMap(v) {
  return Object.keys(v).sort().map((iso) => {
    const mark = v[iso].s === "lived" ? "!" : v[iso].s === "home" ? "*" : "";
    return iso + mark + (v[iso].y || []).map(encYear).join("");
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
    return { error: "That doesn't look like a Nomad Travel Map backup file." };
  }
  const max = new Date().getFullYear();
  const valid = (n) => Number.isInteger(n) && n >= 1900 && n <= max;
  const visits = {};
  for (const [iso, rec] of Object.entries(obj.visits)) {
    if (!/^[A-Z]{3}$/.test(iso) || !isKnown(iso)) return { error: `"${iso}" isn't a country or territory this map knows about.` };
    if (!rec || typeof rec !== "object" || !Array.isArray(rec.y)) return { error: `${iso}'s entry is malformed.` };
    if (rec.s !== undefined && rec.s !== "lived" && rec.s !== "home") return { error: `${iso} has an invalid status "${rec.s}".` };
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
  STATUS, yearsOf, statusOf, stats, encodeMap, decodeMap, validateImport,
  latestYear, formatYearsEdit, formatYearsDisplay,
};

})();
