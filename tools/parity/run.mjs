#!/usr/bin/env node
// Scene parity check: renders every moment of every scene in a baseline build
// and in the working tree, then lists every difference with a diff image.
//
//   node tools/parity/run.mjs <baseline-src-dir> [out-dir] [filter]
//
// <baseline-src-dir> is the src/ folder of the build to compare against (for
// example a `git archive` of the last release), from before the kit or on
// it. Needs esbuild (a dependency of the plugin SDK) and Playwright with a
// Chromium or Chrome.
import { build } from "esbuild";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, "../..");
const [baseSrc, outArg, filter = ""] = process.argv.slice(2);
if (!baseSrc) { console.error("usage: node tools/parity/run.mjs <baseline-src-dir> [out-dir] [filter]"); process.exit(2); }
const out = resolve(outArg ?? join(repo, ".parity"));
mkdirSync(join(out, "diff"), { recursive: true });

async function bundle(name, src, adapter) {
  const r = await build({
    entryPoints: [join(here, "harness.ts")], bundle: true, format: "iife", write: false, logLevel: "error",
    alias: { "@calm": src, "@adapter": join(here, adapter) }, define: { CALM_NAME: JSON.stringify(name) },
    nodePaths: [join(repo, "node_modules")],
  });
  return r.outputFiles[0].text;
}
// A baseline already on the kit (it has src/kit/engine.ts) is read the same way as the working tree.
const baseOnKit = (await import("node:fs")).existsSync(join(resolve(baseSrc), "kit", "engine.ts"));
const base = await bundle("BASE", resolve(baseSrc), baseOnKit ? "adapter-new.ts" : "adapter-base.ts");
const work = await bundle("WORK", join(repo, "src"), "adapter-new.ts");
writeFileSync(join(out, "page.html"), `<!doctype html><meta charset="utf-8"><body><script>${base}</script><script>${work}</script>`);

const { chromium } = await import("playwright-core");
const exe = process.env.CHROME ?? (await import("node:fs")).existsSync("/usr/bin/google-chrome") ? "/usr/bin/google-chrome" : undefined;
const browser = await chromium.launch(exe ? { executablePath: exe } : {});
const page = await browser.newPage({ timezoneId: "America/Denver", locale: "en-US" });
page.on("pageerror", (e) => console.error("page error:", e.message));
await page.goto("file://" + join(out, "page.html"));
const result = await page.evaluate(async (filter) => {
  const a = window.CALM_BASE.runAll(filter), b = window.CALM_WORK.runAll(filter);
  const byKey = new Map(b.map((s) => [s.key, s]));
  const load = (src) => new Promise((ok) => { const i = new Image(); i.onload = () => ok(i); i.src = src; });
  const rows = [];
  for (const x of a) {
    const y = byKey.get(x.key);
    if (!y) { rows.push({ key: x.key, missing: true }); continue; }
    byKey.delete(x.key);
    const fields = ["labels", "glow", "motion", "focus", "hits"].filter((f) => x[f] !== y[f]);
    let pixels = 0, diff = null;
    if (x.png !== y.png) {
      const [ia, ib] = await Promise.all([load(x.png), load(y.png)]);
      const w = Math.max(ia.width, ib.width), h = Math.max(ia.height, ib.height);
      const c = document.createElement("canvas"); c.width = w; c.height = h * 3;
      const g = c.getContext("2d");
      g.fillStyle = "#808080"; g.fillRect(0, 0, w, h * 3);
      g.drawImage(ia, 0, 0); g.drawImage(ib, 0, h);
      const da = g.getImageData(0, 0, w, h).data, db = g.getImageData(0, h, w, h).data;
      const d = g.createImageData(w, h);
      for (let i = 0; i < da.length; i += 4) {
        const same = da[i] === db[i] && da[i + 1] === db[i + 1] && da[i + 2] === db[i + 2] && da[i + 3] === db[i + 3];
        if (!same) pixels++;
        d.data[i] = same ? 0 : 255; d.data[i + 3] = same ? 0 : 255;
      }
      g.putImageData(d, 0, h * 2);
      diff = c.toDataURL();
    }
    if (pixels || fields.length) rows.push({ key: x.key, pixels, fields, diff, a: Object.fromEntries(fields.map((f) => [f, x[f]])), b: Object.fromEntries(fields.map((f) => [f, y[f]])) });
  }
  for (const k of byKey.keys()) rows.push({ key: k, extra: true });
  // A gag must never paint the waiting amber, in either build.
  const amber = b.filter((s) => s.amber).map((s) => `${s.key}: ${s.amber} px`);
  return { total: a.length, rows, amber };
}, filter);
await browser.close();

// Scenes the baseline doesn't have are new, not differences.
const added = result.rows.filter((r) => r.extra).length;
result.rows = result.rows.filter((r) => !r.extra);
const lines = [`# Scene parity`, ``, `${result.total} moments compared. ${result.rows.length} differ.${added ? ` ${added} moments are new scenes, not compared.` : ""}`, ``];
for (const r of result.rows) {
  const file = r.key.replace(/[^a-z0-9-]+/gi, "_") + ".png";
  if (r.diff) writeFileSync(join(out, "diff", file), Buffer.from(r.diff.split(",")[1], "base64"));
  lines.push(`- ${r.key}: ${r.missing ? "missing in working tree" : r.extra ? "new in working tree" : `${r.pixels} px${r.fields.length ? `; ${r.fields.join(", ")} differ` : ""}${r.diff ? ` (diff/${file}: baseline, new, changed pixels)` : ""}`}`);
  for (const f of r.fields ?? []) lines.push(`  - ${f}: ${String(r.a[f]).slice(0, 300)}\n    vs ${String(r.b[f]).slice(0, 300)}`);
}
lines.splice(3, 0, result.amber.length ? `Gag moments with amber pixels (must be none): ${result.amber.join("; ")}` : "No gag moment paints amber.", "");
writeFileSync(join(out, "report.md"), lines.join("\n") + "\n");
console.log(lines.slice(0, 5).join("\n"));
process.exit(result.rows.length || result.amber.length ? 1 : 0);
