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

// ── Compact relative path serializer (integer tenths → no float drift) ──
const fmt = (n) => { const s = (n / 10).toFixed(n % 10 ? 1 : 0); return s.replace(/^(-?)0\./, "$1."); };
function pathOf(feature) {
  let out = "", cx = 0, cy = 0, sx = 0, sy = 0, ring = [];
  const flush = () => {
    // drop rings that collapse to < 3 distinct points after rounding
    const pts = ring.filter((p, i) => i === 0 || p[0] !== ring[i - 1][0] || p[1] !== ring[i - 1][1]);
    ring = [];
    if (pts.length < 3) return;
    out += `M${fmt(pts[0][0])} ${fmt(pts[0][1])}`;
    cx = pts[0][0]; cy = pts[0][1];
    let body = "";
    for (let i = 1; i < pts.length; i++) {
      const dx = pts[i][0] - cx, dy = pts[i][1] - cy;
      cx = pts[i][0]; cy = pts[i][1];
      const a = fmt(dx), b = fmt(dy);
      body += (body && !a.startsWith("-") ? " " : "") + a + (b.startsWith("-") ? "" : " ") + b;
    }
    out += "l" + body + "z";
  };
  const ctx2 = {
    moveTo(x, y) { if (ring.length) flush(); ring.push([Math.round(x * 10), Math.round(y * 10)]); },
    lineTo(x, y) { ring.push([Math.round(x * 10), Math.round(y * 10)]); },
    closePath() { flush(); },
    arc() {},
  };
  geoPath(projection, ctx2)(feature);
  if (ring.length) flush();
  return out;
}

// Anchor per country: [cx, cy, x0, y0, x1, y1]. The centre is the centroid of the
// LARGEST polygon (a whole-feature centroid puts Kiribati/Norway/Fiji in open sea);
// the box is the union of polygons ≥10% of the largest, so fly-to frames the
// mainland US + Alaska rather than half the Pacific for Hawaii.
const areaPath = geoPath(projection);
const r1 = (v) => Math.round(v * 10) / 10;
function anchor(feature) {
  const polys = (feature.geometry.type === "Polygon" ? [feature.geometry.coordinates] : feature.geometry.coordinates)
    .map((p) => ({ type: "Feature", geometry: { type: "Polygon", coordinates: p } }));
  const areas = polys.map((p) => geoArea(p));
  const max = Math.max(...areas);
  const main = polys.filter((_, i) => areas[i] >= max * 0.1);
  const [[x0, y0], [x1, y1]] = areaPath.bounds({ type: "FeatureCollection", features: main });
  return [...projection(geoCentroid(polys[areas.indexOf(max)])), x0, y0, x1, y1].map(r1);
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
