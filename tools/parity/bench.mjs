#!/usr/bin/env node
// Frame cost check: animates every scene in a baseline build and in the
// working tree, the way the strip does (30 fps, one canvas per scene), and
// reports main-thread time per frame for each.
//
//   node tools/parity/bench.mjs <baseline-src-dir> [seconds]
import { build } from "esbuild";
import { writeFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, "../..");
const [baseSrc, secondsArg] = process.argv.slice(2);
const seconds = Number(secondsArg ?? 8);
const entry = join(tmpdir(), "calm-bench-entry.ts");
writeFileSync(entry, `
import { SCENES } from "@calm/scenes/index";
import { beginFrame, endFrame } from "@calm/kit/common";
(window as any).sceneIds = () => SCENES.map((s) => s.id);
(window as any).bench = (sceneId: string, theme: "light" | "dark", frames: number) => {
  const scene = SCENES.find((s) => s.id === sceneId)!;
  const c = document.createElement("canvas"); const ctx = c.getContext("2d")!;
  c.width = 600; c.height = scene.height;
  const inst = scene.create();
  const now = new Date(2026, 3, 15, 13).getTime();
  inst.setMood({ kind: "working", turnStartedAt: now, resetsAt: null, since: now, run: 1 });
  inst.setCrew([{ id: "a1", kind: "working", title: "a" }, { id: "b2", kind: "waiting", title: "b" }]);
  const view = { width: 600, dpr: 1, theme, muted: "#888", reducedMotion: false, now, duskMinutes: 40, scale: 3 };
  const t0 = performance.now();
  for (let i = 0; i < frames; i++) { inst.update(1 / 30); if (i % 45 === 0) inst.step(); beginFrame(); inst.draw(ctx, view); endFrame(); }
  return (performance.now() - t0) / frames;
};`);
async function bundle(src) {
  // Older builds keep the shared helpers in scenes/common.
  const common = existsSync(join(src, "kit/common.ts")) ? "kit/common" : "scenes/common";
  const text = (await import("node:fs")).readFileSync(entry, "utf8").replace("@calm/kit/common", "@calm/" + common);
  const tmp = entry.replace(".ts", common.replace("/", "-") + ".ts"); writeFileSync(tmp, text);
  const r = await build({ entryPoints: [tmp], bundle: true, format: "iife", write: false, logLevel: "error", alias: { "@calm": src }, nodePaths: [join(repo, "node_modules")] });
  return r.outputFiles[0].text;
}
const { chromium } = await import("playwright-core");
const exe = process.env.CHROME ?? (existsSync("/usr/bin/google-chrome") ? "/usr/bin/google-chrome" : undefined);
const browser = await chromium.launch(exe ? { executablePath: exe } : {});
const rows = [];
for (const [name, src] of [["baseline", resolve(baseSrc)], ["working tree", join(repo, "src")]]) {
  const page = await browser.newPage();
  await page.setContent(`<script>${await bundle(src)}</script>`);
  const ids = await page.evaluate(() => window.sceneIds());
  for (const id of ids) {
    await page.evaluate(([id]) => window.bench(id, "dark", 60), [id]);   // warm up
    const ms = await page.evaluate(([id, f]) => window.bench(id, "dark", f), [id, seconds * 30]);
    rows.push({ name, id, ms });
  }
  await page.close();
}
await browser.close();
for (const id of [...new Set(rows.map((r) => r.id))]) {
  const a = rows.find((r) => r.id === id && r.name === "baseline"), b = rows.find((r) => r.id === id && r.name !== "baseline");
  console.log(`${id.padEnd(9)} ${a ? `baseline ${a.ms.toFixed(3)} ms/frame   ` : "new scene                  "}now ${b.ms.toFixed(3)} ms/frame${a ? `   (${((b.ms / a.ms - 1) * 100).toFixed(0)}%)` : ""}`);
}
