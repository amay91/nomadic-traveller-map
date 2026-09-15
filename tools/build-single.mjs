// Build one self-contained HTML file: nomadic-traveller-map.html
//
// Why this exists (2026-09-14): opening app/index.html on a phone showed the
// raw, unstyled HTML with no map — every one of its five sibling files failed to
// load. Two environments do that, and a phone hits both easily:
//
//   1. Only index.html got copied to the device. The siblings simply aren't there.
//   2. Android hands a tapped local file to the browser as a `content://` URI
//      (from a file manager, Drive, Gmail, a messenger…). A content:// URI has no
//      directory, so EVERY relative path resolves to nothing. Nothing is wrong
//      with the paths; there is no folder for them to be relative to.
//
// A single file removes the whole class of problem: no siblings to lose, no
// relative paths to resolve. It's a DEV-TIME tool, like build-geo.mjs — the app
// in app/ is still the plain, readable, no-build source of truth (plan L1). This
// just staples a copy together for carrying around.
//
//   node tools/build-single.mjs
//
// The PWA layer is deliberately dropped from this build: a service worker can't
// register from file:// (or content://) at all, and a manifest/icon link would
// only produce failed requests. Install-to-home-screen needs real hosting — see
// spec §4.5. The single file is for "open it anywhere, offline, no server".

import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const APP = join(dirname(fileURLToPath(import.meta.url)), "..", "app");
const OUT = join(APP, "..", "nomadic-traveller-map.html");
const read = (f) => readFile(join(APP, f), "utf8");

// `</script` anywhere inside an inlined script would close the tag early. None of
// the current files contain it, but a future edit could, so it's neutralised
// rather than assumed away.
const safe = (js) => js.replace(/<\/script/gi, "<\\/script");

const [html, css, countries, geo, logic, app] = await Promise.all(
  ["index.html", "styles.css", "countries.js", "geo.js", "logic.js", "app.js"].map(read)
);

const out = html
  .replace(/^.*<link rel="manifest".*$\n?/m, "")
  .replace(/^.*<link rel="icon".*$\n?/m, "")
  .replace(/^.*<link rel="apple-touch-icon".*$\n?/m, "")
  .replace(
    '<link rel="stylesheet" href="styles.css">',
    `<style>\n${css}\n</style>`
  )
  .replace(
    /<script src="countries\.js"><\/script>\s*<script src="geo\.js"><\/script>\s*<script src="logic\.js"><\/script>\s*<script src="app\.js"><\/script>/,
    [countries, geo, logic, app].map((s) => `<script>\n${safe(s)}\n</script>`).join("\n")
  );

// Fail loudly rather than shipping a file that silently lost a script tag.
for (const [name, needle] of [["stylesheet", "<style>"], ["countries", "COUNTRIES"], ["geo", "GEO"], ["logic", "window.Logic"], ["app", "renderMap"]]) {
  if (!out.includes(needle)) throw new Error(`build-single: ${name} was not inlined (looked for ${needle})`);
}
if (/src="|href="(?!#|mailto:|https?:)/.test(out.replace(/href="#[^"]*"/g, ""))) {
  throw new Error("build-single: a relative resource reference survived — it would break from content://");
}

await writeFile(OUT, out, "utf8");
console.log(`nomadic-traveller-map.html — ${(Buffer.byteLength(out) / 1024).toFixed(0)} KB, one file, zero external references`);
