#!/usr/bin/env node
// Scene gallery: every moment of each scene in light, dark, phone width, and
// at night, as a person sees it (page color, sky glow, labels), plus the
// helper alert and a short clip per scene. Writes an index.html to open.
//
//   node tools/gallery/run.mjs [out-dir] [scene-id,scene-id,...] [--inline]
//
// Writes index.html (a contact sheet of every scene side by side, and the
// clips) and one page per scene with every moment. --inline puts the images
// inside the pages instead of an img/ folder, for hosts that want few files.
// Clips need ffmpeg on the PATH; without it the gallery has stills only.
import { build } from "esbuild";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, "../..");
const args = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const inline = process.argv.includes("--inline");
const out = resolve(args[0] ?? join(repo, ".gallery"));
const only = args[1]?.split(",");
mkdirSync(join(out, "img"), { recursive: true });

const js = (await build({
  entryPoints: [join(repo, "tools/parity/harness.ts")], bundle: true, format: "iife", write: false, logLevel: "error",
  alias: { "@calm": join(repo, "src"), "@adapter": join(here, "adapter-gallery.ts") }, define: { CALM_NAME: '"G"' },
  nodePaths: [join(repo, "node_modules")],
})).outputFiles[0].text;
writeFileSync(join(out, "page.html"), `<!doctype html><meta charset="utf-8"><body><script>${js}</script>`);

const { chromium } = await import("playwright-core");
const exe = process.env.CHROME ?? (existsSync("/usr/bin/google-chrome") ? "/usr/bin/google-chrome" : undefined);
const browser = await chromium.launch(exe ? { executablePath: exe } : {});
const page = await browser.newPage({ timezoneId: "America/Denver", locale: "en-US" });
page.on("pageerror", (e) => console.error("page error:", e.message));
await page.goto("file://" + join(out, "page.html"));
const scenes = (await page.evaluate(() => window.CALM_G.scenes)).filter((s) => !only || only.includes(s.id));
const VIEWS = ["light-600", "dark-600", "dark-360", "dark-600-night", "light-600-winter", "dark-600-summer", "light-600-autumn"];
const save = (name, dataUrl) => {
  if (inline) return dataUrl;
  writeFileSync(join(out, "img", name), Buffer.from(dataUrl.split(",")[1], "base64"));
  return `img/${name}`;
};
const hasFfmpeg = (() => { try { execFileSync("ffmpeg", ["-version"], { stdio: "ignore" }); return true; } catch { return false; } })();
const STYLE = `<meta charset="utf-8"><meta name=viewport content="width=device-width,initial-scale=1">
<style>body{font:14px/1.5 system-ui;margin:16px;background:#f0f0f2;color:#222}h2{margin-top:30px}h3{margin:18px 0 6px;font-size:14px}
.grid{display:flex;flex-wrap:wrap;gap:14px}.cell{display:flex;flex-direction:column;gap:3px;font-size:12px;color:#555}
img,video{display:block;border-radius:6px;border:1px solid #ccc;image-rendering:pixelated;max-width:100%}
table.sheet{border-collapse:collapse}table.sheet td{padding:4px 6px;vertical-align:middle}table.sheet td:first-child{font-weight:600;white-space:nowrap}
a{color:#2456c8}</style>`;
const MOMENT_NAMES = {
  "working-0.5s": "working, just started", "working-4s": "working", "step": "a step", "step-burst": "a burst of steps",
  "waiting": "waiting on you", "waiting-resolved": "answered, working again", "rate": "rate-limited", "rate-no-reset": "rate-limited, no reset time",
  "error": "error", "idle-after-run": "run finished", "dusk-20min": "long run, 20 min", "dusk-40min": "long run, 40 min",
  "crew-3": "crew: working, waiting, failed", "crew-overflow": "crew of 7 (+N)", "crew-leaving": "a helper finishing", "crew-rate": "crew, rate-limited",
  "tap-lead": "tap the lead", "tap-flock": "tap the scene", "tap-member": "tap a helper", "surprise": "rare surprise", "surprise-late": "rare surprise, later",
};
const VIEW_NAMES = { "light-600": "Light", "dark-600": "Dark", "dark-360": "Phone (360 px, dark)", "dark-600-night": "Night (10:30pm)", "light-600-winter": "Winter", "dark-600-summer": "Summer", "light-600-autumn": "Autumn, dusk" };

// One page per scene: the clip, then every moment in every view.
const sheet = {};
for (const sc of scenes) {
  let html = `<!doctype html>${STYLE}<title>Calm: ${sc.name}</title><p><a href="index.html">All scenes</a></p><h1>${sc.name}</h1>`;
  if (hasFfmpeg) {
    const frames = await page.evaluate(([id]) => window.CALM_G.clip(id, "dark", 600), [sc.id]);
    const dir = join(out, "frames", sc.id); mkdirSync(dir, { recursive: true });
    frames.forEach((f, i) => writeFileSync(join(dir, `${String(i).padStart(4, "0")}.png`), Buffer.from(f.split(",")[1], "base64")));
    execFileSync("ffmpeg", ["-loglevel", "error", "-y", "-framerate", "15", "-i", join(dir, "%04d.png"), "-vf", "scale=iw*2:ih*2:flags=neighbor", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "20", "-movflags", "+faststart", join(out, `${sc.id}.mp4`)]);
    html += `<h3>Clip (18 s): working, steps, crew joining, a helper waiting and one failing, waiting on you, a surprise, a tap, a helper finishing, error, rate-limited</h3><video src="${sc.id}.mp4" controls muted loop playsinline width="1200"></video>`;
    // The scene's gags, forced one after another (each normally comes every few minutes of work).
    const gags = await page.evaluate(([id]) => window.CALM_G.gagClip(id, "dark", 600), [sc.id]);
    if (gags.length) {
      const gdir = join(out, "frames", `${sc.id}-gags`); mkdirSync(gdir, { recursive: true });
      gags.flatMap((g) => g.frames).forEach((f, i) => writeFileSync(join(gdir, `${String(i).padStart(4, "0")}.png`), Buffer.from(f.split(",")[1], "base64")));
      execFileSync("ffmpeg", ["-loglevel", "error", "-y", "-framerate", "15", "-i", join(gdir, "%04d.png"), "-vf", "scale=iw*2:ih*2:flags=neighbor", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "20", "-movflags", "+faststart", join(out, `${sc.id}-gags.mp4`)]);
      html += `<h3>Gags (forced, about 5.6 s each, in this order): ${gags.map((g) => g.id).join(", ")}</h3><video src="${sc.id}-gags.mp4" controls muted loop playsinline width="1200"></video>`;
    }
  }
  for (const view of VIEWS) {
    const shots = await page.evaluate(([id, v]) => window.CALM_G.runAll(id + "/", { views: [v], compose: true, alerts: false }), [sc.id, view]);
    if (!shots.length) continue;
    const seasonal = !["light-600", "dark-600", "dark-360"].includes(view);
    html += `<h2>${VIEW_NAMES[view] ?? view}</h2><div class="grid">`;
    for (const s of shots.filter((x) => x.key.startsWith(sc.id + "/"))) {
      const moment = s.key.split("/")[2];
      const gagMatch = /^gag-(\d)-(a|b)$/.exec(moment);
      const label = gagMatch ? `gag: ${sc.gags?.[Number(gagMatch[1]) - 1] ?? moment} (${gagMatch[2] === "a" ? "early" : "late"})` : MOMENT_NAMES[moment] ?? moment;
      if (seasonal && !["working-4s", "waiting", "dusk-40min", "crew-3", "error"].includes(moment)) continue;
      const src = save(s.key.replace(/\//g, "_") + ".png", s.png);
      if (moment === "working-4s") (sheet[sc.id] ??= {})[view] = src;
      html += `<div class="cell">${label}<img src="${src}" width="${view.endsWith("360") ? 360 : 600}"></div>`;
    }
    html += `</div>`;
  }
  const alerts = await page.evaluate(([id]) => window.CALM_G.runAll("alert/" + id + "/", { views: [] }), [sc.id]);
  html += `<h2>Helper alert</h2><div class="grid">`;
  for (const a of alerts) html += `<div class="cell">${a.key.split("/").slice(2).join(" ")}<img src="${save(a.key.replace(/\//g, "_") + ".png", a.png)}" style="height:52px"></div>`;
  html += `</div>`;
  writeFileSync(join(out, `${sc.id}.html`), html);
}
await browser.close();

// The index: every scene's working state side by side, then links and clips.
let index = `<!doctype html>${STYLE}<title>Calm scenes</title><h1>Calm: all ${scenes.length} scenes</h1>
<h2>Contact sheet: each scene working</h2><p>Same moment (working, 4 seconds in), same clock (a spring afternoon), for judging the set's consistency.</p>
<table class="sheet"><tr><td></td><td>Light</td><td>Dark</td><td>Night</td></tr>`;
for (const sc of scenes) {
  const r = sheet[sc.id] ?? {};
  index += `<tr><td><a href="${sc.id}.html">${sc.name}</a></td>${["light-600", "dark-600", "dark-600-night"].map((v) => `<td>${r[v] ? `<img src="${r[v]}" width="420">` : ""}</td>`).join("")}</tr>`;
}
index += `</table><h2>Phone width (360 px)</h2><div class="grid">`;
for (const sc of scenes) if (sheet[sc.id]?.["dark-360"]) index += `<div class="cell">${sc.name}<img src="${sheet[sc.id]["dark-360"]}" width="360"></div>`;
index += `</div><h2>Every scene: every moment, clips, helper alert</h2><ul>${scenes.map((sc) => `<li><a href="${sc.id}.html">${sc.name}</a></li>`).join("")}</ul>`;
writeFileSync(join(out, "index.html"), index);
console.log(`Gallery: ${join(out, "index.html")} (${scenes.map((s) => s.id).join(", ")})${hasFfmpeg ? "" : " (no ffmpeg: stills only)"}`);
