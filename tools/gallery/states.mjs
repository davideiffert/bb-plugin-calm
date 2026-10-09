#!/usr/bin/env node
// Run and rest: one HTML file with every scene running live, each with a
// switch between a run and a rest, to open in any browser. No bb,
// Playwright, or ffmpeg needed.
//
//   node tools/gallery/states.mjs [out.html]      (default: .gallery/states.html)
import { build } from "esbuild";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, "../..");
const out = resolve(process.argv[2] ?? join(repo, ".gallery/states.html"));
mkdirSync(dirname(out), { recursive: true });
const js = (await build({
  entryPoints: [join(here, "states.ts")], bundle: true, format: "iife", write: false, logLevel: "error",
  alias: { "@calm": join(repo, "src") }, nodePaths: [join(repo, "node_modules")],
})).outputFiles[0].text;
writeFileSync(out, `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><script>${js}</script></body></html>`);
console.log(out);
