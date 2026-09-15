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
