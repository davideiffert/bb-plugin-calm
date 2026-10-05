#!/usr/bin/env node
// Design audit pack: plain labeled PNGs for reviewers.
//   00-contact-sheet.png   every scene working, in light, dark, and at night
//   <scene>-moments.png    one scene's key moments (dark), plus light and phone working
//   <scene>-gags.png       each of the scene's gags, early and late in its beat
//
//   node tools/gallery/audit-pack.mjs <out-dir> [scene-id,scene-id,...]
import { build } from "esbuild";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, "../..");
const out = resolve(process.argv[2] ?? join(repo, ".audit"));
mkdirSync(out, { recursive: true });
const js = (await build({
  entryPoints: [join(repo, "tools/parity/harness.ts")], bundle: true, format: "iife", write: false, logLevel: "error",
  alias: { "@calm": join(repo, "src"), "@adapter": join(repo, "tools/parity/adapter-new.ts") }, define: { CALM_NAME: '"A"' },
  nodePaths: [join(repo, "node_modules")],
})).outputFiles[0].text;
const pagePath = join(out, ".page.html");
writeFileSync(pagePath, `<!doctype html><meta charset="utf-8"><body><script>${js}</script>`);
const { chromium } = await import("playwright-core");
const exe = process.env.CHROME ?? (existsSync("/usr/bin/google-chrome") ? "/usr/bin/google-chrome" : undefined);
const browser = await chromium.launch(exe ? { executablePath: exe } : {});
const page = await browser.newPage({ timezoneId: "America/Denver", locale: "en-US" });
page.on("pageerror", (e) => console.error("page error:", e.message));
await page.goto("file://" + pagePath);

// In the page: render shots, then lay them out on one labeled canvas.
await page.evaluate(() => {
  const load = (src) => new Promise((ok) => { const i = new Image(); i.onload = () => ok(i); i.src = src; });
  window.shot = (key) => {
    const [scene, view, moment] = key.split("/");
    if (scene === "alert") return window.CALM_A.runAll(key, { views: [] })[0]?.png;   // drawn on dark below
    return window.CALM_A.runAll(`${scene}/${view}/${moment}`, { views: [view], compose: true, alerts: false }).find((s) => s.key === key)?.png;
  };
  // cells: [{ label, src }], laid out in `cols` columns, each `cellW` wide.
  window.grid = async (title, cells, cols, rowLabels) => {
    const imgs = await Promise.all(cells.map((c) => (c.src ? load(c.src) : null)));
    const cellW = Math.max(...imgs.filter(Boolean).map((i) => i.width)), cellH = Math.max(...imgs.filter(Boolean).map((i) => i.height));
    const left = rowLabels ? 150 : 0, gap = 10, lab = 18, top = title ? 34 : 6;
    const rows = Math.ceil(cells.length / cols);
    const c = document.createElement("canvas");
    c.width = left + cols * (cellW + gap) + gap; c.height = top + rows * (cellH + lab + gap) + gap;
    const g = c.getContext("2d");
    g.fillStyle = "#e9e9ec"; g.fillRect(0, 0, c.width, c.height);
    g.fillStyle = "#222"; g.font = "600 18px system-ui, sans-serif"; g.textBaseline = "top";
    if (title) g.fillText(title, gap, 8);
    g.imageSmoothingEnabled = false;
    cells.forEach((cell, i) => {
      const r = Math.floor(i / cols), col = i % cols;
      const x = left + gap + col * (cellW + gap), y = top + r * (cellH + lab + gap);
      g.fillStyle = "#444"; g.font = "13px system-ui, sans-serif"; g.fillText(cell.label, x, y + 1);
      if (cell.dark) { g.fillStyle = "#18181b"; g.fillRect(x, y + lab, cellW, imgs[i] ? imgs[i].height + 12 : cellH); }
      if (imgs[i]) g.drawImage(imgs[i], x + (cell.dark ? 8 : 0), y + lab + (cell.dark ? 6 : 0));
      if (rowLabels && col === 0) { g.fillStyle = "#222"; g.font = "600 14px system-ui, sans-serif"; g.fillText(rowLabels[r], gap, y + lab + cellH / 2 - 7); }
    });
    return c.toDataURL("image/png");
  };
});
const only = process.argv[3]?.split(",");
const scenes = (await page.evaluate(() => window.CALM_A.scenes)).filter((s) => !only || only.includes(s.id));
const save = (name, dataUrl) => writeFileSync(join(out, name), Buffer.from(dataUrl.split(",")[1], "base64"));

// The contact sheet (only for a full pack).
if (!only) {
const sheet = await page.evaluate(async (scenes) => {
  const cells = [];
  for (const s of scenes) for (const [view, label] of [["light-600", "Light"], ["dark-600", "Dark"], ["dark-600-night", "Night, 10:30pm"]])
    cells.push({ label: `${s.name}: ${label}`, src: window.shot(`${s.id}/${view}/working-4s`) });
  return window.grid("Calm: every scene working (4 s in, a spring afternoon; night at 10:30pm)", cells, 3, scenes.map((s) => s.name));
}, scenes);
save("00-contact-sheet.png", sheet);
}

// One moments sheet per scene.
const MOMENTS = [
  ["dark-600/working-4s", "Working"], ["dark-600/step", "Step reaction"], ["dark-600/crew-3", "Crew of 3 (working, waiting, failed)"],
  ["dark-600/waiting", "Waiting on you"], ["alert/dark/failed", "Helper alert: failed (main agent idle)"], ["alert/dark/waiting", "Helper alert: waiting"],
  ["dark-600/rate", "Rate-limited"], ["dark-600/error", "Error"], ["dark-600/dusk-40min", "Long-run light (40 min)"],
  ["dark-600/surprise", "Rare surprise"], ["dark-600/tap-lead", "Tap on the lead"], ["dark-600/tap-flock", "Tap on the scene"],
  ["light-600/working-4s", "Light mode: working"], ["dark-360/working-4s", "Phone (360 px): working"],
];
for (const s of scenes) {
  const png = await page.evaluate(async ([s, moments]) => {
    const cells = moments.map(([k, label]) => k.startsWith("alert/") ? { label, dark: true, src: window.shot(`alert/${s.id}/${k.slice(6)}`) } : { label, src: window.shot(`${s.id}/${k}`) });
    return window.grid(`${s.name}: key moments (dark mode unless noted)`, cells, 2);
  }, [s, MOMENTS]);
  save(`${s.id}-moments.png`, png);
  const gags = s.gags ?? [];
  if (gags.length) {
    const g = await page.evaluate(async ([s, gags]) => {
      const cells = [];
      gags.forEach((id, n) => {
        for (const [part, when] of [["a", "early"], ["b", "late"]]) {
          cells.push({ label: `${id} (${when}), dark`, src: window.shot(`${s.id}/dark-600/gag-${n + 1}-${part}`) });
          cells.push({ label: `${id} (${when}), light`, src: window.shot(`${s.id}/light-600/gag-${n + 1}-${part}`) });
        }
      });
      return window.grid(`${s.name}: gags`, cells, 2);
    }, [s, gags]);
    save(`${s.id}-gags.png`, g);
  }
}
await browser.close();
(await import("node:fs")).rmSync(pagePath);
console.log(`Audit pack: ${out} (${scenes.length} scenes)`);
