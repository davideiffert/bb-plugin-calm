// Amber means "needs you". Every scene shows waiting with the kit's shared
// signal; nothing else in Calm (scenes, the kit, crew colors, header icons,
// settings) paints amber or a near neighbor of it.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { COLORS, crewColor } from "../src/crew";
import { AMBER } from "../src/kit/style";

const root = join(__dirname, "..");
const walk = (dir: string): string[] => readdirSync(dir).flatMap((f) => {
  const p = join(dir, f);
  return statSync(p).isDirectory() ? walk(p) : /\.(ts|tsx|css)$/.test(f) ? [p] : [];
});
/** Every source file that can put color on screen. */
const files = [...walk(join(root, "src")), join(root, "app.tsx"), join(root, "docs/example/snail.ts")];
/** Only the style file may spell amber out; everything else imports AMBER. */
const DEFINES_AMBER = new Set(["src/kit/style.ts"]);

/** Hue (degrees), saturation, and lightness of a #rrggbb color. */
function hsl(hex: string): [number, number, number] {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, d = max - min;
  if (d === 0) return [0, 0, l];
  const s = d / (1 - Math.abs(2 * l - 1));
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [(h * 60 + 360) % 360, s, l];
}
/** Close enough to the waiting amber to be mistaken for it at 3 px: a saturated gold-orange. */
const looksAmber = (hex: string) => { const [h, s, l] = hsl(hex); return h >= 32 && h <= 44 && s >= 0.68 && l >= 0.45 && l <= 0.72; };

describe("the amber rule", () => {
  it("knows amber when it sees it", () => {
    expect(looksAmber(AMBER)).toBe(true);
    for (const c of ["#ffc04a", "#f2a33a", "#f0b050", "#e8a33d"]) expect(looksAmber(c)).toBe(true);
    for (const c of ["#f0dfae", "#ee6a3a", "#f2c94c", "#e88bb0", "#3e9ced"]) expect(looksAmber(c)).toBe(false);
  });

  for (const file of files) {
    const rel = relative(root, file);
    // The helper alert is about helpers that need you, so its words may be amber.
    const src = readFileSync(file, "utf8").split("\n").filter((l) => !l.includes("calm-alert-wait")).join("\n");
    it(`${rel} paints no amber of its own`, () => {
      if (DEFINES_AMBER.has(rel)) return;
      const hexes = [...src.matchAll(/#[0-9a-fA-F]{6}\b/g)].map((m) => m[0].toLowerCase());
      expect(hexes.filter(looksAmber)).toEqual([]);
    });
  }

  for (const f of readdirSync(join(root, "src/scenes")).filter((f) => f.endsWith(".ts") && f !== "index.ts" && !f.endsWith("-art.ts"))) {
    it(`${f} waits with k.signal and uses AMBER only in its helper alert`, () => {
      const src = readFileSync(join(root, "src/scenes", f), "utf8");
      expect(src).toContain("k.signal(");
      expect(src.slice(src.indexOf("// -- The scene"))).not.toMatch(/\bAMBER\b/);
    });
  }

  it("never gives a working helper an amber color", () => {
    for (const c of COLORS) expect(looksAmber(c)).toBe(false);
    for (let i = 0; i < 500; i++) expect(looksAmber(crewColor(`helper-${i}`))).toBe(false);
  });
});
