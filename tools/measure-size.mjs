// Measure app/ against spec §4.1's code-excluding-comments budget (80 KB).
// Comments are free — the budget was re-anchored 2026-09-14 specifically so
// documentation stops competing with the number. Re-run after any change to
// app/index.html, app/app.js, app/logic.js, or app/styles.css.
//
//   node tools/measure-size.mjs

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const APP = join(dirname(fileURLToPath(import.meta.url)), "..", "app");
const BUDGET = 80 * 1024;

const files = [
  ["index.html", (s) => [...s.matchAll(/<!--[\s\S]*?-->/g)]],
  ["styles.css", (s) => [...s.matchAll(/\/\*[\s\S]*?\*\//g)]],
  ["logic.js", (s) => [...s.matchAll(/\/\*[\s\S]*?\*\/|(^|\s)\/\/.*$/gm)]],
  ["app.js", (s) => [...s.matchAll(/\/\*[\s\S]*?\*\/|(^|\s)\/\/.*$/gm)]],
];

let total = 0, comments = 0;
const rows = files.map(([name, findComments]) => {
  const s = readFileSync(join(APP, name), "utf8");
  const bytes = Buffer.byteLength(s);
  const c = findComments(s).reduce((n, m) => n + Buffer.byteLength(m[0]), 0);
  total += bytes; comments += c;
  return { name, bytes, c, code: bytes - c };
});

const kb = (n) => (n / 1024).toFixed(1);
for (const r of rows) console.log(`${r.name.padEnd(12)} ${kb(r.bytes).padStart(6)} KB total  ${kb(r.c).padStart(6)} KB comments  ${kb(r.code).padStart(6)} KB code`);
const code = total - comments;
console.log("-".repeat(58));
console.log(`${"total".padEnd(12)} ${kb(total).padStart(6)} KB total  ${kb(comments).padStart(6)} KB comments  ${kb(code).padStart(6)} KB code`);
console.log(`\ncode-excluding-comments: ${kb(code)} KB of an 80 KB budget (${kb(BUDGET - code)} KB headroom)`);
if (code > BUDGET) {
  console.error(`\n⚠ OVER BUDGET by ${kb(code - BUDGET)} KB — see product_spec.md §4.1 before adding more.`);
  process.exitCode = 1;
}
