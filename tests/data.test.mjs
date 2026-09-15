// Data-integrity tests. Run: node --test tests/   (zero dependencies)
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
const { GEO } = load("geo.js");

test("exactly the 195 countries, no duplicate codes or names", () => {
  assert.equal(COUNTRIES.length, 195);
  assert.equal(new Set(COUNTRIES.map((c) => c[0])).size, 195);
  assert.equal(new Set(COUNTRIES.map((c) => c[1])).size, 195);
  assert.equal(new Set(COUNTRIES.map((c) => c[2].toLowerCase())).size, 195);
});

test("continent totals match Worldometers' published region counts", () => {
  const n = (k) => COUNTRIES.filter((c) => c[3] === k).length;
  // Worldometers: Africa 54, Asia 48, Europe 44, Oceania 14,
  // Latin America & Caribbean 33 + Northern America 2 = 35 (NA 23 + SA 12)
  assert.deepEqual(
    { AF: n("AF"), AS: n("AS"), EU: n("EU"), NA: n("NA"), SA: n("SA"), OC: n("OC") },
    { AF: 54, AS: 48, EU: 44, NA: 23, SA: 12, OC: 14 },
  );
  for (const c of COUNTRIES) assert.ok(CONTINENTS[c[3]], `${c[0]} has unknown continent`);
});

test("no alias collides with another country's name or alias", () => {
  const seen = new Map();
  for (const c of COUNTRIES)
    for (const term of [c[2], ...c.slice(4)]) {
      const k = term.toLowerCase();
      assert.ok(!seen.has(k) || seen.get(k) === c[0], `"${term}" used by ${seen.get(k)} and ${c[0]}`);
      seen.set(k, c[0]);
    }
});

test("every country is clickable on the map (shape or dot)", () => {
  for (const [iso] of COUNTRIES) {
    assert.ok(GEO.c[iso] || GEO.d.includes(iso), `${iso} has no shape and no dot`);
    assert.equal(GEO.a[iso]?.length, 6, `${iso} has no anchor`);
  }
});

test("territories: no duplicate codes/names, no collision with the 195, every one clickable", () => {
  assert.equal(new Set(TERRITORIES.map((t) => t[0])).size, TERRITORIES.length, "duplicate territory code");
  assert.equal(new Set(TERRITORIES.map((t) => t[2].toLowerCase())).size, TERRITORIES.length, "duplicate territory name");
  const countryCodes = new Set(COUNTRIES.map((c) => c[0]));
  for (const t of TERRITORIES) assert.ok(!countryCodes.has(t[0]), `${t[0]} (${t[2]}) reuses one of the 195's codes`);
  const seen = new Map();
  for (const t of TERRITORIES)
    for (const term of [t[2], ...t.slice(4)]) {
      const k = term.toLowerCase();
      assert.ok(!seen.has(k) || seen.get(k) === t[0], `"${term}" used by ${seen.get(k)} and ${t[0]}`);
      seen.set(k, t[0]);
    }
  for (const t of TERRITORIES) assert.ok(CONTINENTS[t[3]], `${t[0]} has unknown continent`);
  for (const [iso] of TERRITORIES) {
    assert.ok(GEO.c[iso] || GEO.d.includes(iso), `${iso} has no shape and no dot`);
    assert.equal(GEO.a[iso]?.length, 6, `${iso} has no anchor`);
  }
});

test("GEO.c has no keys outside the 195 + territories", () => {
  const known = new Set([...COUNTRIES.map((c) => c[0]), ...TERRITORIES.map((t) => t[0])]);
  assert.deepEqual(Object.keys(GEO.c).filter((k) => !known.has(k)), []);
});

// Added 2026-09-15 (owner: "make sure country names are actually on the
// country in question — Croatia looks off"). GEO.a[iso][0,1] is the LABEL
// point (build-geo.mjs's anchor(), via polylabel — see its own comment for
// why a plain geographic centroid isn't safe for a non-convex shape). The
// only check that would have caught the original bug is a real point-in-
// polygon test against the SHIPPED path — a shape existing (the test above)
// says nothing about where its label point actually falls inside it.
//
// Minimal SVG-path parser for build-geo.mjs's own compact relative-path
// format (M absolute start, then implicit relative lineto pairs, z closes a
// ring) — intentionally not a general SVG parser, just enough for the
// straight-line paths this pipeline ever emits.
function ringsOf(d) {
  const toks = d.match(/[Mlz]|-?\.?\d+\.?\d*/g) || [];
  const rings = []; let ring = [], cx = 0, cy = 0, mode = null, started = false, i = 0;
  while (i < toks.length) {
    const t = toks[i];
    if (t === "M") { if (started) rings.push(ring); ring = []; mode = "M"; i++; continue; }
    if (t === "l") { mode = "l"; i++; continue; }
    if (t === "z") { rings.push(ring); ring = []; started = false; mode = null; i++; continue; }
    const x = +toks[i], y = +toks[i + 1]; i += 2;
    if (mode === "M") { cx = x; cy = y; ring.push([cx, cy]); started = true; mode = "l"; }
    else { cx += x; cy += y; ring.push([cx, cy]); }
  }
  if (ring.length) rings.push(ring);
  return rings;
}
function insideAnyRing(pt, rings) {
  return rings.some((ring) => {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i], [xj, yj] = ring[j];
      if (yi > pt[1] !== yj > pt[1] && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  });
}
test("every place with a real shape has its label anchor INSIDE that shape, not just somewhere on the map", () => {
  const all = [...COUNTRIES, ...TERRITORIES];
  const dots = new Set(GEO.d);
  const failures = [];
  for (const [iso] of all) {
    // A dot place (app.js renders it as a <circle>, not its GEO.c path — see
    // renderMap()) can still have a NON-EMPTY GEO.c entry: a country this
    // small often simplifies to a 2-3-point sliver with essentially zero
    // real area, which build-geo.mjs still writes a path string for even
    // though the app never draws it. "Inside the polygon" isn't a meaningful
    // question for a shape with no real interior — the anchor there is a
    // POINT location for the dot/label, not a label placed within a border,
    // exactly how app.js's own isDot branch already treats it.
    if (dots.has(iso)) continue;
    const path = GEO.c[iso];
    if (!path) continue; // no path at all — nothing to check either
    const [cx, cy] = GEO.a[iso];
    if (!insideAnyRing([cx, cy], ringsOf(path))) failures.push(iso);
  }
  assert.deepEqual(failures, [], `label anchor lands OUTSIDE its own shape for: ${failures.join(", ")}`);
});
