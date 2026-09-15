// One-time build: Natural Earth 50m (via world-atlas) → pre-projected SVG path
// strings in app/geo.js. Run with `node build-geo.mjs` from tools/.
//
// Why pre-project: the browser then needs no d3/topojson at all — the app ships
// plain path strings and does zero geometry work at runtime.
import fs from "node:fs";
import vm from "node:vm";
import * as topojson from "topojson-client";
import { presimplify, simplify, quantile, sphericalTriangleArea } from "topojson-simplify";
import { geoEqualEarth, geoPath, geoCentroid, geoArea } from "d3-geo";
import polylabel from "polylabel";

const W = 1000;                        // viewBox width; height derived from the fit
const KEEP = Number(process.env.KEEP ?? 0.5); // fraction of vertices kept by simplification
const DOT_AREA = Number(process.env.DOT_AREA ?? 6); // projected units² below which a country also gets a dot

const here = (p) => new URL(p, import.meta.url);
const topo = JSON.parse(fs.readFileSync(here("./node_modules/world-atlas/countries-50m.json")));
const ctx = { window: {} };
vm.runInNewContext(fs.readFileSync(here("../app/countries.js"), "utf8"), ctx);
const COUNTRIES = ctx.window.COUNTRIES;
const TERRITORIES = ctx.window.TERRITORIES;

// ── Simplify (spherical area weights, keep the top KEEP fraction of vertices) ──
const pre = presimplify(topo, sphericalTriangleArea);
const simple = simplify(pre, quantile(pre, KEEP));

// ── Group atlas geometries into output features ──
const byNumeric = new Map(COUNTRIES.map((c) => [c[1], c[0]]));
const MERGE_BY_NAME = { Somaliland: "SOM", "N. Cyprus": "CYP" }; // no ISO id; drawn as part of the country
const TERRITORY_NAMES = {
  "W. Sahara": "Western Sahara", "Faeroe Is.": "Faroe Islands", "N. Mariana Is.": "Northern Mariana Islands",
  "U.S. Virgin Is.": "U.S. Virgin Islands", "British Virgin Is.": "British Virgin Islands",
  "Br. Indian Ocean Ter.": "British Indian Ocean Territory", "Fr. Polynesia": "French Polynesia",
  "Fr. S. Antarctic Lands": "French Southern Lands", "S. Geo. and the Is.": "South Georgia",
  "St. Pierre and Miquelon": "Saint Pierre and Miquelon", "St-Martin": "Saint Martin",
  "St-Barthélemy": "Saint Barthélemy", "Heard I. and McDonald Is.": "Heard and McDonald Islands",
  "Indian Ocean Ter.": "Christmas and Cocos Islands", "Wallis and Futuna Is.": "Wallis and Futuna",
  "Turks and Caicos Is.": "Turks and Caicos Islands", "Cayman Is.": "Cayman Islands",
  "Falkland Is.": "Falkland Islands", "Pitcairn Is.": "Pitcairn Islands", "Cook Is.": "Cook Islands",
};
// Territories clickable as their own place (app/countries.js TERRITORIES),
// matched by their DISPLAY name (post TERRITORY_NAMES remap) since they have
// no numeric id to key on the way the 195 do.
const byExtraName = new Map(TERRITORIES.map((t) => [t[2], t[0]]));

const groups = new Map();   // key → { iso?, extra?, name?, geoms[] }
for (const g of simple.objects.countries.geometries) {
  const name = g.properties.name;
  if (name === "Antarctica") continue;
  const iso = MERGE_BY_NAME[name] ?? (name === "Ashmore and Cartier Is." ? null : byNumeric.get(g.id));
  const displayName = TERRITORY_NAMES[name] ?? name;
  const extra = iso ? null : byExtraName.get(displayName) ?? null;
  const key = iso ?? (extra ? `x:${extra}` : `t:${displayName}`);
  if (!groups.has(key)) groups.set(key, { iso, extra, name: iso || extra ? null : displayName, geoms: [] });
  groups.get(key).geoms.push(g);
}
const toFeature = (geoms) =>
  geoms.length === 1 ? topojson.feature(simple, geoms[0]) : { type: "Feature", geometry: topojson.merge(simple, geoms) };

// Overseas regions that Natural Earth folds into France / the Netherlands are
// split out as territories, so visiting Paris doesn't paint French Guiana.
// Caribbean Netherlands (BES) gets TWO anchor points: Bonaire sits far south
// near Venezuela, while Sint Eustatius and Saba sit ~500km north near
// Guadeloupe — both real, both the same ISO territory. One anchor caught
// only Bonaire and mis-attributed Sint Eustatius/Saba into Guadeloupe's
// shape (nearest-point, not nearest-territory); found by inspecting the
// actual per-polygon centroids after simplification, not assumed.
const OVERSEAS = [
  ["French Guiana", -53, 4], ["Guadeloupe", -61.5, 16.2], ["Martinique", -61, 14.6],
  ["Réunion", 55.5, -21.1], ["Mayotte", 45.1, -12.8],
  ["Caribbean Netherlands", -68.3, 12.2], ["Caribbean Netherlands", -63.1, 17.55],
];
const inEurope = ([lon, lat]) => lon > -12 && lon < 45 && lat > 34 && lat < 72;
function splitOverseas(feature) {
  const polys = feature.geometry.type === "Polygon" ? [feature.geometry.coordinates] : feature.geometry.coordinates;
  const home = [], away = new Map();
  for (const p of polys) {
    const c = geoCentroid({ type: "Polygon", coordinates: p });
    if (inEurope(c)) { home.push(p); continue; }
    const [name] = OVERSEAS.reduce((best, o) => {
      const d = (o[1] - c[0]) ** 2 + (o[2] - c[1]) ** 2;
      return d < best[1] ? [o[0], d] : best;
    }, [null, Infinity]);
    if (!away.has(name)) away.set(name, []);
    away.get(name).push(p);
  }
  const mp = (ps) => ({ type: "Feature", geometry: { type: "MultiPolygon", coordinates: ps } });
  return { home: mp(home), away: [...away].map(([name, ps]) => ({ name, feature: mp(ps) })) };
}

// Svalbard and Jan Mayen are likewise fused into Norway's raw shape (two
// clusters, not one — Jan Mayen sits alone at ~71°N/-8.4°E, physically
// nowhere near mainland Norway despite similar latitude to Norway's own
// northernmost tip). A nearest-point split like splitOverseas's doesn't
// hold up here: Norway's own shape runs so far north (Nordkapp is 71.17°N)
// that raw lon/lat distance would pull real Norwegian polygons toward the
// Svalbard anchor. Verified instead against every real polygon centroid at
// this simplification level: `lon < 0 || lat > 72.5` cleanly separates 10
// Svalbard/Jan Mayen polygons from 22 mainland ones, with a real gap on
// both sides (mainland tops out at 71.05°N; Svalbard starts at 74.45°N).
function splitNorway(feature) {
  const polys = feature.geometry.type === "Polygon" ? [feature.geometry.coordinates] : feature.geometry.coordinates;
  const home = [], away = [];
  for (const p of polys) {
    const [lon, lat] = geoCentroid({ type: "Polygon", coordinates: p });
    (lon < 0 || lat > 72.5 ? away : home).push(p);
  }
  const mp = (ps) => ({ type: "Feature", geometry: { type: "MultiPolygon", coordinates: ps } });
  return { home: mp(home), away: away.length ? [{ name: "Svalbard and Jan Mayen", feature: mp(away) }] : [] };
}

const countries = [], extras = [], territories = [];
for (const { iso, extra, name, geoms } of groups.values()) {
  let f = toFeature(geoms);
  if (iso === "FRA" || iso === "NLD" || iso === "NOR") {
    const { home, away } = iso === "NOR" ? splitNorway(f) : splitOverseas(f);
    f = home;
    // Each split-off region (French Guiana, Guadeloupe, …) is itself one of
    // TERRITORIES, so it goes to `extras`, never the inert `territories` pile.
    for (const a of away) {
      const awayIso = byExtraName.get(a.name);
      if (!awayIso) throw new Error(`Overseas split produced "${a.name}", which isn't in TERRITORIES`);
      extras.push({ iso: awayIso, feature: a.feature });
    }
  }
  if (iso) countries.push({ iso, feature: f });
  else if (extra) extras.push({ iso: extra, feature: f });
  else territories.push({ name, feature: f });
}

// ── Projection: Equal Earth, centred on 11°E so Chukotka and Fiji stay whole ──
// Equal-area (Šavrič/Patterson/Jenny, 2018): every country's drawn area is
// proportional to its real area. For a map whose whole point is comparing
// where you've been, an honest size relationship matters more than the
// slightly gentler shapes of a compromise projection — Greenland reads as
// smaller than the DR Congo here, which is the truth.
const projection = geoEqualEarth().rotate([-11, 0]).precision(0.1);
const all = { type: "FeatureCollection", features: [...countries, ...extras, ...territories].map((x) => x.feature) };
projection.fitWidth(W, all);
const [[, y0], [, y1]] = geoPath(projection).bounds(all);
projection.translate([projection.translate()[0], projection.translate()[1] - y0 + 4]);
const H = Math.ceil(y1 - y0 + 8);

// ── Rendered rings, shared by the path serializer AND the label anchor ──
// Rounds to integer tenths (0.1-unit precision — the same precision the
// compact path format itself stores) and drops any ring that collapses to
// fewer than 3 distinct points after rounding, EXACTLY matching what the
// serialized path below actually draws. anchor() (further down) reuses this
// rather than computing its label point against the pre-rounding geometry —
// found necessary, not theoretical: for the smallest real territories
// (Monaco, Bermuda, Saint Martin, the Marshall Islands, Macau — all under
// ~0.2 map units across), running polylabel on the UNROUNDED coordinates
// occasionally placed the label point a few hundredths of a unit inside the
// TRUE shape but just outside the shape once IT got rounded to the same
// precision the rendered path uses — the anchor and the outline it's
// supposed to sit inside were each individually correct against a slightly
// different version of the same country. One shared source of rounded rings
// makes that impossible by construction: whatever anchor() centres a label
// in is the identical set of points pathOf() is about to draw.
function renderedRings(feature) {
  const rings = []; let ring = [];
  const flush = () => {
    const pts = ring.filter((p, i) => i === 0 || p[0] !== ring[i - 1][0] || p[1] !== ring[i - 1][1]);
    ring = [];
    if (pts.length >= 3) rings.push(pts.map(([x, y]) => [x / 10, y / 10]));
  };
  const ctx2 = {
    moveTo(x, y) { if (ring.length) flush(); ring.push([Math.round(x * 10), Math.round(y * 10)]); },
    lineTo(x, y) { ring.push([Math.round(x * 10), Math.round(y * 10)]); },
    closePath() { flush(); },
    arc() {},
  };
  geoPath(projection, ctx2)(feature);
  if (ring.length) flush();
  return rings;
}
// ── Compact relative path serializer (integer tenths → no float drift) ──
const fmt = (n) => { const s = (n / 10).toFixed(n % 10 ? 1 : 0); return s.replace(/^(-?)0\./, "$1."); };
function pathOf(feature) {
  let out = "";
  for (const pts of renderedRings(feature)) {
    out += `M${fmt(pts[0][0] * 10)} ${fmt(pts[0][1] * 10)}`;
    let cx = pts[0][0] * 10, cy = pts[0][1] * 10, body = "";
    for (let i = 1; i < pts.length; i++) {
      const px = pts[i][0] * 10, py = pts[i][1] * 10, dx = px - cx, dy = py - cy;
      cx = px; cy = py;
      const a = fmt(dx), b = fmt(dy);
      body += (body && !a.startsWith("-") ? " " : "") + a + (b.startsWith("-") ? "" : " ") + b;
    }
    out += "l" + body + "z";
  }
  return out;
}

// Anchor per country: [cx, cy, x0, y0, x1, y1]. cx,cy is the LABEL POINT — the
// pole of inaccessibility (the point inside the shape farthest from any edge)
// of the LARGEST polygon, computed on the shape as actually PROJECTED and
// rendered, via polylabel — Mapbox's own tool, built for exactly this: label
// placement on non-convex map shapes. x0,y0,x1,y1 is the bounding box of the
// union of polygons ≥10% of the largest, so fly-to frames the mainland US +
// Alaska rather than half the Pacific for Hawaii.
//
// This REPLACED a geographic centroid (d3's geoCentroid, computed on the
// sphere, then projected) — added 2026-09-15, owner: "make sure country
// names are actually on the country in question. Croatia looks off." A
// centroid is the shape's CENTRE OF MASS, which for a genuinely non-convex
// country — Croatia's coastline is a long crescent wrapped around three
// sides of Bosnia — can land right at the edge of a thin part, or outside
// the polygon altogether. Measured, not assumed: Croatia's old centroid sat
// just 0.36 map units from the nearest boundary vertex, in the narrow Istria
// neck at the shape's northern tip — technically still inside the polygon,
// but nowhere near where a reader's eye would call "the middle of Croatia,"
// and a real label (several units wide once rendered) spilled straight over
// the Slovenian border. polylabel instead finds the point that MAXIMISES
// distance to the boundary, which is both guaranteed inside the shape and
// visually the natural centre a reader would point to — the same reasoning
// this file already used once for the ANCHOR BOX ("a whole-feature centroid
// puts Kiribati/Norway/Fiji in open sea"), now applied to the point itself,
// not just which polygon it's allowed to be computed from. Every place's
// anchor moved slightly by this change, not just Croatia's — any other
// non-convex shape (Chile's ribbon, Vietnam's own coastal curve, Norway's
// fjords) had exactly the same latent risk, just not yet reported.
const areaPath = geoPath(projection);
const r1 = (v) => Math.round(v * 10) / 10;
function anchor(feature) {
  const polys = (feature.geometry.type === "Polygon" ? [feature.geometry.coordinates] : feature.geometry.coordinates)
    .map((p) => ({ type: "Feature", geometry: { type: "Polygon", coordinates: p } }));
  const areas = polys.map((p) => geoArea(p));
  const max = Math.max(...areas);
  const main = polys.filter((_, i) => areas[i] >= max * 0.1);
  const [[x0, y0], [x1, y1]] = areaPath.bounds({ type: "FeatureCollection", features: main });
  // Every ring of the LARGEST polygon (the exterior plus any holes, e.g. South
  // Africa's own hole for Lesotho) — via renderedRings(), the SAME rounding
  // pathOf() applies, not a fresh projection of the raw coordinates. That
  // reuse is load-bearing, found by a test failure, not by inspection: the
  // first version of this projected the raw geometry directly, and for the
  // very smallest real territories (Monaco, Bermuda, Saint Martin, the
  // Marshall Islands, Macau — all under ~0.2 map units across), polylabel's
  // point could sit correctly inside the UNROUNDED shape and still land just
  // outside the shape once its own boundary got rounded to the same 0.1-unit
  // precision the rendered path stores. The anchor and the outline it's
  // supposed to sit inside were each individually correct against a subtly
  // different version of the same country. Sharing renderedRings() makes that
  // impossible by construction: whatever polylabel centres a label in is the
  // identical set of points pathOf() is about to draw — a real, systemic
  // point-in-polygon test across all 240 places (tests/data.test.mjs) is what
  // caught this, not eyeballing Croatia alone.
  const largestRings = renderedRings(polys[areas.indexOf(max)]);
  // A place small enough that its ENTIRE feature renders no path at all (every
  // ring collapses under the same 0.1-unit rounding renderedRings applies) is
  // a dot-fallback place regardless of what anchor() returns (place(), below,
  // checks pathOf(feature) itself) — there is no polygon left for "farthest
  // from the boundary" to mean anything, so polylabel has nothing to work
  // with. A plain projected centroid is exactly correct there: a dot's anchor
  // IS its on-screen point, not a label position relative to a shape.
  const [cx, cy] = largestRings.length ? polylabel(largestRings, 0.1) : projection(geoCentroid(polys[areas.indexOf(max)]));
  return [cx, cy, x0, y0, x1, y1].map(r1);
}

// One shared placement pass for the sovereign 195 AND the clickable extras —
// mechanically identical (path + anchor, dot-fallback if small or empty).
// Nothing in either list is ever silently dropped the way a plain inert
// territory can be; that's what recovered Saint Barthélemy/Pitcairn/Norfolk
// Island, which vanished at this simplification level under the old
// territories-only path (no dot fallback existed for them).
const C = {}, A = {}, D = [];
const report = [];
function place(iso, feature) {
  const d = pathOf(feature);
  if (d) C[iso] = d;
  A[iso] = anchor(feature);
  const a = areaPath.area(feature);
  report.push([iso, a]);
  if (a < DOT_AREA || !d) D.push(iso);
}
for (const { iso, feature } of countries) place(iso, feature);
for (const { iso, feature } of extras) place(iso, feature);
// Tuvalu is below Natural Earth 50m's resolution — dot only, hand-placed.
const tuv = projection([179.2, -8.52]).map(r1);
A.TUV = [...tuv, ...tuv, ...tuv];
D.push("TUV");

const T = territories.map(({ name, feature }) => [name, pathOf(feature)]).filter(([, d]) => d);

const missing = [...COUNTRIES, ...TERRITORIES].filter((c) => !C[c[0]] && !D.includes(c[0])).map((c) => c[0]);
if (missing.length) throw new Error("No geometry for: " + missing.join(", "));
const unmatchedExtras = TERRITORIES.filter((t) => !extras.some((e) => e.iso === t[0]));
if (unmatchedExtras.length) throw new Error("TERRITORIES entries never matched to a feature: " + unmatchedExtras.map((t) => t[2]).join(", "));

const js =
  "// GENERATED by tools/build-geo.mjs from Natural Earth 50m (world-atlas@2). Do not edit.\n" +
  `window.GEO=${JSON.stringify({ w: W, h: H, c: C, a: A, d: D, t: T })};\n`;
fs.writeFileSync(here("../app/geo.js"), js);

report.sort((a, b) => a[1] - b[1]);
console.log(`viewBox 0 0 ${W} ${H} · keep ${KEEP} · ${countries.length} countries · ${extras.length} clickable territories · ${T.length} inert land features · ${D.length} dots`);
console.log("smallest:", report.slice(0, 45).map(([i, a]) => `${i}:${a.toFixed(2)}`).join(" "));
console.log("inert land (not clickable):", territories.map((t) => t.name).sort().join(" | ") || "(none)");
console.log("geo.js bytes:", Buffer.byteLength(js));
