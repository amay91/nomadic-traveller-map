// Tests for the PURE logic in app/logic.js. Zero dependencies — loaded via
// Node's vm exactly like tests/data.test.mjs loads countries.js/geo.js.
//
// EVERY fixture in this file is fictional. Three of them were not: they carried
// the owner's actual residency timeline (exact years for where they had lived
// and when), which survived the D0 privacy scrub only because that scan covered
// .md, .html and app/ and never thought to look at tests/. It was caught while
// staging the first push to a PUBLIC repo — where a git history is permanent.
// If you add a fixture here, invent the data; the shape is all a test needs.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const load = (f) => {
  const ctx = { window: {} };
  vm.runInNewContext(fs.readFileSync(new URL(`../app/${f}`, import.meta.url), "utf8"), ctx);
  return ctx.window;
};
const { COUNTRIES, TERRITORIES, CONTINENTS } = load("countries.js");
const { Logic } = load("logic.js");
const { search, exact, parseYears, highlight, esc, stats, encodeMap, decodeMap, validateImport, yearsOf, statusOf, STATUS, latestYear, formatYearsEdit, formatYearsDisplay, mergeYears, heatClass, HEAT_BINS, isBeen, isUpcoming, upcomingYearsOf } = Logic;

const PLACES = [
  ...COUNTRIES.map((c) => ({ iso: c[0], name: c[2], cont: c[3], aliases: c.slice(4), official: true })),
  ...TERRITORIES.map((t) => ({ iso: t[0], name: t[2], cont: t[3], aliases: t.slice(4), official: false })),
];
const isKnown = (iso) => PLACES.some((p) => p.iso === iso);
const placeOf = (iso) => { const p = PLACES.find((x) => x.iso === iso); return p && { official: p.official, cont: p.cont }; };
// Logic's functions run inside the vm context, so the plain objects/arrays
// they return are constructed with THAT realm's Object/Array — structurally
// identical to an outer-realm literal but not prototype-equal, which trips
// assert/strict's deepEqual. Everything here is plain JSON-shaped data, so a
// JSON round-trip is the simplest way to compare by value, not by realm.
const j = (v) => JSON.parse(JSON.stringify(v));

test("search: ranking fixtures", () => {
  assert.equal(search("uk", PLACES)[0].name, "United Kingdom");
  const congo = search("congo", PLACES).map((p) => p.name);
  assert.ok(congo.includes("Congo") && congo.includes("DR Congo"), "both Congos should match");
  assert.equal(search("ivory", PLACES)[0].name, "Côte d'Ivoire");
  assert.equal(search("cote", PLACES)[0].name, "Côte d'Ivoire");
  assert.equal(search("sao", PLACES)[0].name, "São Tomé and Príncipe");
  assert.equal(search("burma", PLACES)[0].name, "Myanmar");
  assert.equal(search("", PLACES).length, 0);
  assert.equal(search("   ", PLACES).length, 0);
  assert.equal(search("zzzznotaplace", PLACES).length, 0);
  assert.ok(search("a", PLACES).length <= 8, "capped at 8 results");
});

test("search: a country ranks above a territory on an equal match", () => {
  // "Georgia" the country vs no territory alias collision expected, but
  // verify the tie-break rule directly: two places with an identical best
  // rank sort country-before-territory, then alphabetically.
  const tie = [
    { iso: "ZZT", name: "Zed Land", cont: "EU", aliases: [], official: false },
    { iso: "ZZC", name: "Zed Land", cont: "EU", aliases: [], official: true },
  ];
  assert.equal(search("zed", tie)[0].iso, "ZZC");
});

test("exact: matches a full name or alias, case/accent-insensitive", () => {
  assert.equal(exact("united kingdom", PLACES), "GBR");
  assert.equal(exact("UK", PLACES), "GBR");
  assert.equal(exact("cote d ivoire", PLACES), "CIV");
  assert.equal(exact("Narnia", PLACES), null);
});

test("parseYears: valid and invalid inputs", () => {
  assert.deepEqual(j(parseYears("2019", 2026)), { years: [2019] });
  assert.deepEqual(j(parseYears("2019, 2023", 2026)), { years: [2019, 2023] });
  assert.deepEqual(j(parseYears("2023,2019", 2026)), { years: [2019, 2023] }, "sorted regardless of input order");
  assert.deepEqual(j(parseYears("2019 2019", 2026)), { years: [2019, 2019] }, "a repeated year is kept — two visits");
  assert.deepEqual(j(parseYears("2019;2020", 2026)), { years: [2019, 2020] });
  assert.deepEqual(j(parseYears("2019,,2020", 2026)), { years: [2019, 2020] }, "empty tokens from double separators are dropped");
  assert.match(parseYears("", 2026).error, /at least one year/);
  assert.match(parseYears("   ", 2026).error, /at least one year/);
  assert.match(parseYears("20199", 2026).error, /20199/);
  assert.match(parseYears("1899", 2026).error, /outside/);
  assert.match(parseYears("2027", 2026).error, /outside/, "a year after maxYear is rejected");
  assert.match(parseYears("2019-2020", 2026).error, /isn't a year/, "a range is not two years — unless allowRange is set (see below)");
});

test("parseYears: periods, only when allowRange is set (Lived/Home, spec F16 extended 2026-09-14)", () => {
  assert.deepEqual(j(parseYears("2011-2014", 2026, true)), { years: [{ from: 2011, to: 2014 }] });
  assert.deepEqual(j(parseYears("2023-", 2026, true)), { years: [{ from: 2023, to: null }] }, "a trailing dash means ongoing");
  assert.deepEqual(j(parseYears("2015, 2011-2014", 2026, true)), { years: [{ from: 2011, to: 2014 }, 2015] }, "a plain year and a period mix freely, sorted by their own start");
  assert.deepEqual(j(parseYears("2011-2014, 2023-", 2026, true)), { years: [{ from: 2011, to: 2014 }, { from: 2023, to: null }] }, "an ongoing period always sorts last, even against a later closed one");
  assert.match(parseYears("2014-2011", 2026, true).error, /backwards/, "end before start");
  assert.deepEqual(j(parseYears("2019-2020", 2026, true)), { years: [{ from: 2019, to: 2020 }] }, "a valid period parses fine once allowRange is true");
  assert.match(parseYears("1899-2010", 2026, true).error, /outside/);
  assert.match(parseYears("2011-2030", 2026, true).error, /outside/, "the end year can't be past maxYear either");
  assert.match(parseYears("2011-2014-2016", 2026, true).error, /isn't a year or a period/);
  assert.match(parseYears("2019-2020", 2026, false).error, /isn't a year\./, "allowRange still off by default — Visited's own wording is untouched");
});

test("parseYears: minYear (added for Upcoming, 2026-09-16) — every existing caller is unaffected by its default", () => {
  assert.deepEqual(j(parseYears("2019", 2026)), { years: [2019] }, "no minYear argument: identical to before, floor stays 1900");
  assert.deepEqual(j(parseYears("2027", 2031, false, 2026)), { years: [2027] }, "a future window: 2027 is within [2026,2031]");
  assert.match(parseYears("2019", 2031, false, 2026).error, /outside 2026–2031/, "a PAST year is refused once minYear is raised — the exact bound a booking can't precede");
  assert.match(parseYears("2050", 2031, false, 2026).error, /outside 2026–2031/, "and the ceiling still applies — not just the floor");
});

test("parseYears: round-trips through formatYearsEdit exactly, including mixed and ongoing entries", () => {
  for (const input of ["2019", "2019, 2023", "2011-2014", "2023-", "2015, 2011-2014, 2023-"]) {
    const { years } = parseYears(input, 2026, true);
    assert.deepEqual(j(parseYears(formatYearsEdit(years), 2026, true).years), j(years), `round-trip failed for "${input}"`);
  }
});

test("formatYearsDisplay: an en dash and 'present' for an ongoing period, reader-facing only", () => {
  assert.equal(formatYearsDisplay([2019, 2023]), "2019, 2023");
  assert.equal(formatYearsDisplay([{ from: 2011, to: 2014 }]), "2011–2014");
  assert.equal(formatYearsDisplay([{ from: 2023, to: null }]), "2023–present");
  assert.equal(formatYearsDisplay([2015, { from: 2011, to: 2014 }, { from: 2023, to: null }]), "2015, 2011–2014, 2023–present");
});

test("mergeYears: adds a new year without disturbing what's already there (owner report 2026-09-15)", () => {
  assert.deepEqual(j(mergeYears([2019], [2023])), [2019, 2023], "a genuinely new year is appended");
  assert.deepEqual(j(mergeYears([2019, 2023], [2021])), [2019, 2021, 2023], "appended and re-sorted, not just tacked on the end");
  assert.deepEqual(j(mergeYears([], [2019, 2023])), [2019, 2023], "nothing existing yet: incoming years pass straight through");
});
test("mergeYears: an incoming year that's already on file is dropped, not duplicated", () => {
  assert.deepEqual(j(mergeYears([2019], [2019])), [2019], "resubmitting the same single year is a no-op");
  assert.deepEqual(j(mergeYears([2019], [2019, 2019])), [2019], "even a deliberately-doubled resubmission doesn't duplicate an existing entry");
  assert.deepEqual(j(mergeYears([2018], [2018, 2019])), [2018, 2019], "the new year in a mixed resubmission still gets added");
});
test("mergeYears: periods merge and dedupe by deep equality, not by reference", () => {
  assert.deepEqual(j(mergeYears([{ from: 2011, to: 2014 }], [{ from: 2011, to: 2014 }])), [{ from: 2011, to: 2014 }], "an identical period, freshly parsed (a different object), is still recognised as a duplicate");
  assert.deepEqual(j(mergeYears([{ from: 2011, to: 2014 }], [{ from: 2023, to: null }])), [{ from: 2011, to: 2014 }, { from: 2023, to: null }], "a genuinely different period is appended");
  assert.deepEqual(j(mergeYears([{ from: 2023, to: null }], [{ from: 2023, to: 2024 }])), [{ from: 2023, to: 2024 }, { from: 2023, to: null }], "same start, different end: NOT a duplicate (ongoing always sorts last, per yearKey)");
  assert.deepEqual(j(mergeYears([2019], [{ from: 2011, to: 2014 }])), [{ from: 2011, to: 2014 }, 2019], "a plain year and a period never collide as duplicates of each other");
});

test("heatClass: fixed breaks 1 · 2 · 3 · 4–5 · 6+ (prototype 2026-09-15)", () => {
  const v = (n) => ({ y: Array.from({ length: n }, (_, i) => 2000 + i) });
  assert.deepEqual(j(HEAT_BINS), [1, 2, 3, 4, 6]);
  assert.equal(heatClass(undefined), 0, "not on the map: no shade");
  assert.deepEqual([1, 2, 3, 4, 5, 6, 7, 20].map((n) => heatClass(v(n))), [1, 2, 3, 4, 4, 5, 5, 5]);
  assert.equal(heatClass({ y: [2019, 2019] }), 2, "a repeated year is a second visit (F3), so it deepens the shade");
  assert.equal(heatClass({ y: [] }), 1, "a visit with no years (an ordinary entry since E1) is still a visit");
  assert.equal(heatClass({ y: [{ from: 2011, to: 2014 }], s: "lived" }), 5, "Lived takes the top class — no trip count, more exposure than any");
  assert.equal(heatClass({ y: [], s: "home" }), 5, "Home too, even with no years");
  assert.equal(heatClass({ y: [], s: "bucket" }), 0, "a bucket-list place is somewhere you haven't been: no heat");
});
test("bucket list: never counted, never shaded, never given years", () => {
  const visits = { JPN: { y: [2019] }, PER: { y: [], s: "bucket" }, BRA: { y: [], s: "bucket" }, PRI: { y: [], s: "bucket" } /* territory */ };
  const s = stats(visits, placeOf);
  assert.equal(s.count, 1, "only JPN counts toward of 195");
  assert.equal(s.territoryCount, 0, "a bucket-list territory isn't a visited territory either");
  assert.equal(s.bucketCount, 3);
  assert.equal(s.byContinent.SA, undefined, "no continent credit for somewhere you haven't been");
  assert.equal(isBeen(visits.JPN), true);
  assert.equal(isBeen(visits.PER), false);
  assert.equal(isBeen(undefined), false);
});
test("bucket list round-trips through the link, and its mark survives being the last character", () => {
  const visits = { JPN: { y: [2019] }, ZWE: { y: [], s: "bucket" } };
  const code = encodeMap(visits);
  assert.ok(code.endsWith("ZWE_"), `ZWE sorts last, so the bucket mark is the link's final character: ${code}`);
  assert.deepEqual(j(decodeMap(code, isKnown)), visits);
  // the app reads the link through URLSearchParams — "+" would decode to a space there; "_" must not
  assert.deepEqual(j(decodeMap(new URLSearchParams("m=" + code).get("m"), isKnown)), visits);
  assert.deepEqual(j(decodeMap("PER_3b", isKnown)), { PER: { y: [], s: "bucket" } }, "years after a bucket mark are ignored, not trusted");
  assert.equal(encodeMap({ PER: { y: [2019], s: "bucket" } }), "PER_", "a bucket entry never writes years, even if handed some");
});
test("validateImport: bucket list accepted, and normalised to no years", () => {
  const r = validateImport({ v: 1, visits: { PER: { y: [2019], s: "bucket" }, JPN: { y: [2019] } } }, isKnown);
  assert.deepEqual(j(r), { visits: { PER: { y: [], s: "bucket" }, JPN: { y: [2019] } } });
  assert.match(validateImport({ v: 1, visits: { PER: { y: [], s: "wishlist" } } }, isKnown).error, /invalid status/);
});

test("latestYear: the largest sortable year, ongoing periods always winning", () => {
  assert.equal(latestYear([2019, 2023]), 2023);
  assert.equal(latestYear([{ from: 2011, to: 2014 }]), 2014);
  assert.ok(latestYear([{ from: 2023, to: null }]) > latestYear([2025]), "an ongoing period outranks even a later plain year");
  assert.equal(latestYear([]), 0);
});

test("highlight: wraps the matched substring in <mark>, escapes the rest", () => {
  assert.equal(highlight("United Kingdom", "uk"), "United Kingdom"); // "uk" doesn't literally occur
  assert.equal(highlight("United Kingdom", "United"), "<mark>United</mark> Kingdom");
  assert.equal(highlight("Côte d'Ivoire", "ivoire"), "Côte d'<mark>Ivoire</mark>", "accented letters outside the match survive untouched");
});

test("esc: escapes &, <, and \" but not ' or > (unescaped > can't break out of a tag on its own)", () => {
  assert.equal(esc(`Côte d'Ivoire <script> & "quotes"`), `Côte d'Ivoire &lt;script> &amp; &quot;quotes&quot;`);
});

test("stats: official-only count/pct/byContinent, territories counted separately, status never a filter", () => {
  const visits = { JPN: { y: [2019] }, PER: { y: [2026], s: "lived" }, PRI: { y: [2022] } /* territory */ };
  const s = stats(visits, placeOf);
  assert.equal(s.count, 2, "JPN + PER, both official — PER's Lived status still counts");
  assert.equal(s.territoryCount, 1, "PRI is a territory, kept separate");
  assert.ok(Math.abs(s.pct - (2 / 195) * 100) < 1e-9);
  assert.equal(s.byContinent.AS, 1);
  assert.equal(s.byContinent.SA, 1);
});

// E1 (2026-09-15, owner-agreed backlog): a Visited place carrying NO years is
// something the UI can now actually produce — previously only a hand-edited
// link could make one, which is why the heatClass case above used to describe
// it that way. Nothing in logic.js had to change to permit it, and that is
// precisely why it needs pinning: every one of these behaviours is now
// load-bearing for an ordinary entry path, and each would fail silently rather
// than loudly (a yearless visit painting as unvisited land, or vanishing from
// the count, or being dropped by its own save-link).
test("a visit with no years counts, shades and round-trips like any other (E1)", () => {
  const visits = { JPN: { y: [] }, PER: { y: [2019] }, PRI: { y: [] } /* territory */ };
  const s = stats(visits, placeOf);
  assert.equal(s.count, 2, "a yearless visit still counts toward the 195");
  assert.equal(s.territoryCount, 1, "and a yearless territory still counts as a territory, separately");
  assert.equal(s.byContinent.AS, 1, "it lands in its continent too — F13's per-continent bars read this");
  assert.ok(isBeen(visits.JPN), "it is somewhere you have been");
  assert.equal(heatClass(visits.JPN), 1, "and shades as one visit, never as unvisited land");
  assert.equal(encodeMap({ JPN: { y: [] } }), "JPN", "encodes as a bare code — no status mark, no years");
  assert.deepEqual(j(decodeMap(encodeMap(visits), isKnown)), visits, "and survives the round-trip through the link");
  // j() (the JSON round-trip helper every other test here uses) is not cosmetic:
  // logic.js is loaded through vm.runInNewContext, so the objects it builds carry
  // that realm's Object/Array prototypes, and deepStrictEqual compares prototypes.
  // Without it this assertion fails with an "actual" and "expected" that print
  // identically, which is a genuinely confusing five minutes if you hit it.
  assert.deepEqual(
    j(validateImport({ v: 1, visits: { JPN: { y: [] } } }, isKnown).visits),
    { JPN: { y: [] } },
    "Import accepts it rather than rejecting the whole file",
  );
});

// "Upcoming" (2026-09-16, owner: a trip already booked, distinct from a bucket
// -list wish). It is the one status that can coexist with another, so it has
// TWO stored representations — s:"upcoming" for booked-but-never-been (the
// booked year(s) in `y`), and a `u` field holding the booked YEAR riding on a
// Visited record for "been, and going again". `u` is a year, not a boolean:
// putting the future trip inside the same `y` array as real past visits would
// silently count a trip that hasn't happened yet, inflating both "# times
// visited" and the heatmap shade before it occurs — caught designing this,
// not after shipping it, which is exactly why it's pinned here.
const thisYear = new Date().getFullYear();
test("upcoming: booked-but-not-been stays out of the 195, visited+upcoming still counts", () => {
  const visits = {
    MAR: { y: [thisYear + 1], s: "upcoming" }, // booked, never been
    JPN: { y: [2019], u: thisYear + 1 },       // been once, a return trip booked
    PER: { y: [2015] },                        // a plain visit
    NZL: { y: [], s: "bucket" },               // a wish, not a booking
  };
  const s = stats(visits, placeOf);
  assert.equal(s.count, 2, "JPN + PER count; MAR is booked but not been, NZL is only a wish");
  assert.equal(s.upcomingCount, 2, "both kinds of upcoming are counted — MAR and JPN");
  assert.equal(s.bucketCount, 1, "and a booking is never mistaken for a bucket-list entry");
  assert.equal(s.byContinent.AF ?? 0, 0, "a booked-but-not-been place never lands in a continent tally");
  assert.ok(!isBeen(visits.MAR), "booked is not been");
  assert.ok(isBeen(visits.JPN), "been, with a return trip booked, is still been");
  assert.ok(isUpcoming(visits.MAR) && isUpcoming(visits.JPN), "both forms read as upcoming");
  assert.ok(!isUpcoming(visits.NZL), "a bucket-list wish is not a booking");
  assert.equal(heatClass(visits.MAR), 0, "booked-but-not-been takes no heat shade");
  assert.equal(heatClass(visits.JPN), 1, "a visited record keeps the shade ITS PAST VISITS earned — the booked trip doesn't count yet");
  assert.deepEqual(j(upcomingYearsOf(visits.MAR)), [thisYear + 1]);
  assert.deepEqual(j(upcomingYearsOf(visits.JPN)), [thisYear + 1], "reads the booked year regardless of which of the two shapes holds it");
  assert.deepEqual(j(upcomingYearsOf(visits.PER)), []);
});

test("upcoming round-trips through the link, and every older mark still decodes", () => {
  const visits = { MAR: { y: [thisYear + 1], s: "upcoming" }, JPN: { y: [2019, 2023], u: thisYear + 2 }, NZL: { y: [], s: "bucket" } };
  const code = encodeMap(visits);
  assert.match(code, /MAR__/, "upcoming is two underscores");
  assert.match(code, /JPN___/, "visited + upcoming is three");
  assert.match(code, /NZL_/, "bucket stays one");
  assert.deepEqual(j(decodeMap(code, isKnown)), visits);
  // Links already sitting in mailboxes must keep working — F17's hard rule.
  assert.deepEqual(j(decodeMap("NZL_-IND*-GBR!3c", isKnown)),
    { NZL: { y: [], s: "bucket" }, IND: { y: [], s: "home" }, GBR: { y: [2020], s: "lived" } },
    "a link written before upcoming existed decodes exactly as it always did");
});

test("upcoming years: within the imminent window, not the distant future; decode stays liberal once a trip's date has passed", () => {
  // The entry UI enforces "not too far out" (parseYears' own bound); a decoded
  // link is allowed to be MORE liberal, because a link saved while a trip was
  // still upcoming must keep decoding correctly after that date quietly passes.
  const iso = "MAR", farFuture = thisYear + 20;
  assert.ok(validateImport({ v: 1, visits: { [iso]: { y: [farFuture], s: "upcoming" } } }, isKnown).error,
    "a booking 20 years out is refused — that's what Bucket list is for");
  assert.ok(validateImport({ v: 1, visits: { [iso]: { y: [2019], u: farFuture } } }, isKnown).error,
    "same bound applies to the split form's own booked year");
  // A trip booked for last year (relative to "now") still decodes — the link
  // doesn't become corrupt just because time passed it.
  const stale = decodeMap(`${iso}__${(thisYear - 1 - 1900).toString(36).padStart(2, "0")}`, isKnown);
  assert.deepEqual(j(stale[iso].y), [thisYear - 1], "a link whose booked trip has already passed still decodes, not silently dropped");
});

test("validateImport: accepts upcoming, refuses the combinations the model forbids", () => {
  const ok = validateImport({ v: 1, visits: { MAR: { y: [thisYear + 1], s: "upcoming" }, JPN: { y: [2019], u: thisYear + 1 } } }, isKnown);
  assert.deepEqual(j(ok.visits), { MAR: { y: [thisYear + 1], s: "upcoming" }, JPN: { y: [2019], u: thisYear + 1 } });
  assert.ok(validateImport({ v: 1, visits: { JPN: { y: [2019], s: "lived", u: thisYear + 1 } } }, isKnown).error, "Lived + upcoming is refused, not silently halved");
  assert.ok(validateImport({ v: 1, visits: { JPN: { y: [], s: "bucket", u: thisYear + 1 } } }, isKnown).error, "Bucket + upcoming is refused");
  assert.ok(validateImport({ v: 1, visits: { JPN: { y: [2019], u: 1 } } }, isKnown).error, "u must be a real year, not a boolean-ish 1");
  assert.ok(validateImport({ v: 1, visits: { JPN: { y: [2019], u: 1899 } } }, isKnown).error, "u out of range is refused");
});

test("encodeMap/decodeMap: lossless round-trip, including status and empty-years Home", () => {
  const visits = {
    NZL: { y: [2013, 2014, 2017, 2022, 2023] },
    KEN: { y: [2014, 2015, 2016, 2023, 2024, 2025, 2026], s: "lived" },
    BRA: { y: [], s: "home" },
  };
  assert.deepEqual(j(decodeMap(encodeMap(visits), isKnown)), visits);
});
test("decodeMap: a mangled or hand-edited link can't invent a place", () => {
  assert.deepEqual(j(decodeMap("ZZZ99-QQ-IND*", isKnown)), { IND: { y: [], s: "home" } });
  assert.deepEqual(j(decodeMap("", isKnown)), {});
  assert.deepEqual(j(decodeMap(null, isKnown)), {});
  assert.deepEqual(j(decodeMap("GBR99999999999999", isKnown).GBR.y), [], "out-of-range decoded years are dropped, not thrown");
});

test("encodeMap/decodeMap: periods round-trip losslessly, including ongoing and a mix with plain years", () => {
  const visits = {
    NZL: { y: [{ from: 2011, to: 2014 }], s: "lived" },
    BRA: { y: [{ from: 2023, to: null }], s: "home" },
    KEN: { y: [2015, { from: 2016, to: 2018 }, { from: 2023, to: null }], s: "lived" },
  };
  const code = encodeMap(visits);
  assert.deepEqual(j(decodeMap(code, isKnown)), visits);
  assert.doesNotMatch(code, /--/, "a period's internal ~ never collides with the place separator -");
});
test("decodeMap: an unterminated period (a mangled link) is dropped, not misparsed into the next place", () => {
  // GBR's period is missing its closing ~ — decodeYears must stop cleanly on
  // GBR's own part rather than throw. Each place is already a separate
  // "-"-delimited part by the time decodeYears runs, so this can't bleed into
  // a DIFFERENT place either way — this test just confirms it doesn't throw
  // and yields nothing usable for the malformed entry itself.
  const out = decodeMap("GBR~3c", isKnown);
  assert.deepEqual(j(out.GBR?.y ?? []), []);
});
// Deliberately fictional, like every other fixture here — see the note at the
// top of this file. The shape is what matters: 12 places, two of them with a
// long run of years and a Lived status, one Home with no years at all.
test("encodeMap: a realistically-sized 12-place map stays small (spec §4.5's F17 sizing claim)", () => {
  const twelve = {
    NZL: { y: [2013, 2014, 2017, 2022, 2023] }, NOR: { y: [2013] },
    KEN: { y: [2014, 2015, 2016, 2017, 2018, 2019, 2020], s: "lived" },
    CHL: { y: [2014, 2015, 2016, 2023, 2024, 2025, 2026], s: "lived" },
    IDN: { y: [2018] }, ITA: { y: [2018] }, LUX: { y: [2017] }, VNM: { y: [2019] },
    LKA: { y: [2023] }, PRT: { y: [2025] }, PER: { y: [2026] }, BRA: { y: [], s: "home" },
  };
  assert.ok(encodeMap(twelve).length < 200, "a 12-place map should encode well under 200 chars");
});

test("validateImport: accepts a well-formed backup, all-or-nothing on any bad entry", () => {
  const good = { v: 1, visits: { JPN: { y: [2019, 2023] }, IND: { y: [], s: "home" } } };
  assert.deepEqual(j(validateImport(good, isKnown)), { visits: good.visits });

  assert.match(validateImport({ v: 2, visits: {} }, isKnown).error, /backup/, "wrong version rejected");
  assert.match(validateImport(null, isKnown).error, /backup/);
  assert.match(validateImport({ v: 1, visits: { ZZZ: { y: [2019] } } }, isKnown).error, /ZZZ/, "unknown code rejected");
  assert.match(validateImport({ v: 1, visits: { JPN: { y: [2019] }, ZZZ: { y: [2020] } } }, isKnown).error, /ZZZ/,
    "one bad entry rejects the WHOLE file, even with a good entry present");
  assert.match(validateImport({ v: 1, visits: { JPN: { y: ["oops"] } } }, isKnown).error, /invalid year/);
  assert.match(validateImport({ v: 1, visits: { JPN: { y: [1899] } } }, isKnown).error, /invalid year/);
  assert.match(validateImport({ v: 1, visits: { JPN: { y: [2019], s: "visiting" } } }, isKnown).error, /invalid status/);
});

test("validateImport: periods (from/to), mixed with plain years, same all-or-nothing discipline", () => {
  const good = { v: 1, visits: {
    NZL: { y: [{ from: 2011, to: 2014 }], s: "lived" },
    BRA: { y: [{ from: 2023, to: null }], s: "home" },
    JPN: { y: [2019, { from: 2020, to: 2021 }] },
  } };
  assert.deepEqual(j(validateImport(good, isKnown)), { visits: good.visits });

  assert.match(validateImport({ v: 1, visits: { JPN: { y: [{ from: 2020, to: 2010 }] } } }, isKnown).error, /invalid period/, "end before start");
  assert.match(validateImport({ v: 1, visits: { JPN: { y: [{ from: 1800, to: 2010 }] } } }, isKnown).error, /invalid period/, "from before 1900");
  assert.match(validateImport({ v: 1, visits: { JPN: { y: [{ from: 2020, to: 9999 }] } } }, isKnown).error, /invalid period/, "to past the current year");
  assert.match(validateImport({ v: 1, visits: { JPN: { y: ["oops"] } } }, isKnown).error, /invalid year/, "a non-number, non-period entry");
});

test("yearsOf/statusOf/STATUS: default Visited when status is omitted", () => {
  assert.deepEqual(j(yearsOf({ y: [2019] })), [2019]);
  assert.deepEqual(j(yearsOf(undefined)), []);
  assert.equal(statusOf({ y: [2019] }), "visited");
  assert.equal(statusOf({ y: [], s: "home" }), "home");
  assert.equal(STATUS.visited, "Visited");
});

test("continent grouping used by stats() matches CONTINENTS (sanity cross-check with data.test.mjs)", () => {
  for (const c of COUNTRIES) assert.ok(CONTINENTS[c[3]]);
});
