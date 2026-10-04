// The helper alert's mini scene: half the strip's height, in the current
// scene's style. Pasture: sheep at a closed gate with the dog sitting by,
// facing you. Sea: small boats with a lantern blinking. Night sky: stars
// pulsing amber. A helper waiting on you gets the amber signal; one that
// failed sits under its own little rain cloud. Everything that does not move
// is drawn once into a cached layer; only the pulses and drops are redrawn,
// at the slow frame rate.
import type { CrewMember } from "./crew";
import { CLOUD, CLOUD_COLORS, LayerCache, crewMarker, glow, sprite, type Motion } from "./scenes/common";
import { DOG, OUTLINED, PALETTES as PASTURE, SHEEP } from "./scenes/pasture-art";
import { PALETTES as SEA, SKIFF } from "./scenes/sea";
import { PALETTES as NIGHT } from "./scenes/night";
import type { DrawContext, ThemeMode } from "./scenes/types";

export const VIGNETTE_SCALE = 2;
export const VIGNETTE_ROWS = 13;
export const MAX_FIGURES = 3;
const AMBER = "#f5a524";
const GROUND = 12;   // the ground or water row

/** A figure's place in art px, for taps. */
export interface Figure { member: CrewMember; x: number; w: number }

interface Layout { width: number; figures: Figure[]; dogX: number }

function layout(sceneId: string, members: readonly CrewMember[]): Layout {
  const shown = members.slice(0, MAX_FIGURES);
  if (sceneId === "sea") {
    return { width: 3 + shown.length * 14, figures: shown.map((m, i) => ({ member: m, x: 3 + i * 14, w: 9 })), dogX: 0 };
  }
  if (sceneId === "night") {
    return { width: 4 + shown.length * 16, figures: shown.map((m, i) => ({ member: m, x: 6 + i * 16, w: 9 })), dogX: 0 };
  }
  // Pasture: the gate on the left, the sheep facing it, then the dog.
  const first = 9;
  const figures = shown.map((m, i) => ({ member: m, x: first + i * 17, w: 13 }));
  return { width: first + shown.length * 17 + 11, figures, dogX: first + shown.length * 17 };
}

export class Vignette {
  private t = 0;
  private cache = new LayerCache();
  private lay: Layout = { width: 0, figures: [], dogX: 0 };
  private key = "";
  constructor(readonly sceneId: string) {}

  set(members: readonly CrewMember[]) {
    const key = members.slice(0, MAX_FIGURES).map((m) => `${m.id}:${m.kind}`).join(",");
    if (key !== this.key) { this.key = key; this.lay = layout(this.sceneId, members); }
  }
  /** Width in CSS px. */
  get width() { return this.lay.width * VIGNETTE_SCALE; }
  get figures(): readonly Figure[] { return this.lay.figures; }

  update(dt: number) { this.t += dt; }

  draw(v: CanvasRenderingContext2D, theme: ThemeMode, muted: string, reduced: boolean) {
    const s = VIGNETTE_SCALE;
    const W = this.lay.width;
    const view: DrawContext = { width: W * s, dpr: 1, theme, muted, reducedMotion: reduced, now: Date.now(), duskMinutes: 40, scale: s };
    const back = this.cache.get(`${this.sceneId}:${theme}:${muted}:${this.key}`, W * s, VIGNETTE_ROWS * s, (b) => this.drawStill(b, view));
    v.clearRect(0, 0, v.canvas.width, v.canvas.height);
    v.drawImage(back, 0, 0);
    this.drawMoving(v, view);
  }

  motion(reduced: boolean): Motion {
    return reduced || this.lay.figures.length === 0 ? "still" : "slow";
  }

  private blit(b: CanvasRenderingContext2D, c: HTMLCanvasElement, x: number, y: number) {
    const s = VIGNETTE_SCALE;
    b.drawImage(c, Math.round((x - 1) * s), Math.round((y - 1) * s), c.width * s, c.height * s);
  }

  /** Ground, gate, dog, sheep, hills, still stars: drawn once per change. */
  private drawStill(b: CanvasRenderingContext2D, view: DrawContext) {
    const s = VIGNETTE_SCALE, W = this.lay.width, theme = view.theme;
    const px = (n: number) => Math.round(n * s);
    if (this.sceneId === "sea") {
      const P = SEA[theme];
      b.fillStyle = P.water!;
      for (let x = 0; x < W; x += 6) b.fillRect(px(x), px(GROUND + (x % 12 ? 0 : -1) * 0), 4 * s, s);
      b.fillStyle = P.ripple!;
      for (let x = 3; x < W; x += 9) b.fillRect(px(x), px(GROUND + 1), 2 * s, s);
      return;
    }
    if (this.sceneId === "night") {
      const P = NIGHT[theme];
      b.fillStyle = P.hill;
      for (let x = 0; x < W; x++) {
        const h = 1 + Math.round(1 + Math.sin(x / 5) + Math.sin(x / 2.3) * 0.5);
        b.fillRect(px(x), px(VIGNETTE_ROWS - h), s, h * s);
      }
      b.fillStyle = P.star;
      b.globalAlpha = 0.5;
      for (const [x, y] of [[2, 2], [W - 3, 1], [Math.floor(W / 2), 9], [W - 8, 7]]) b.fillRect(px(x), px(y), s, s);
      b.globalAlpha = 1;
      return;
    }
    // Pasture.
    const P = PASTURE[theme];
    b.fillStyle = view.muted; b.globalAlpha = 0.6;
    b.fillRect(0, px(GROUND), W * s, s);
    b.globalAlpha = 1;
    b.fillStyle = P.grass!;
    for (let x = 3; x < W; x += 11) { b.fillRect(px(x), px(GROUND - 1), s, s); b.fillRect(px(x + 1), px(GROUND - 2), s, 2 * s); }
    // A closed gate: two posts and three rails.
    b.fillStyle = P.f!;
    b.fillRect(px(1), px(GROUND - 7), s, 7 * s); b.fillRect(px(6), px(GROUND - 7), s, 7 * s);
    for (const y of [GROUND - 6, GROUND - 4, GROUND - 2]) b.fillRect(px(1), px(y), 6 * s, s);
    for (const f of this.lay.figures) this.blit(b, sprite(SHEEP.walk1, PASTURE[theme], true, OUTLINED), f.x, GROUND - 9);
    this.blit(b, sprite(DOG.sit, P, false, OUTLINED), this.lay.dogX, GROUND - 11);
  }

  /** The amber signals, the rain, the bobbing boats, the pulsing stars. */
  private drawMoving(v: CanvasRenderingContext2D, view: DrawContext) {
    const s = VIGNETTE_SCALE, t = this.t, reduced = view.reducedMotion, theme = view.theme;
    const px = (n: number) => Math.round(n * s);
    for (const [i, f] of this.lay.figures.entries()) {
      const waiting = f.member.kind === "waiting";
      if (this.sceneId === "sea") {
        const P = SEA[theme];
        const bob = reduced ? 0 : Math.round(Math.sin(t * 2.2 + i * 1.3) * 0.6 * s) / s;
        const top = GROUND - 6 + bob;
        this.blit(v, sprite(SKIFF, { ...P }, false, "Ss"), f.x, top);
        if (waiting) {
          // The lantern at the masthead, blinking amber.
          const on = reduced ? 1 : 0.5 + 0.5 * Math.sin(t * Math.PI * 1.6 + i);
          glow(v, view, f.x + 4, top - 1, 3, AMBER, on);
          v.fillStyle = AMBER; v.globalAlpha = 0.5 + 0.5 * on;
          v.fillRect(px(f.x + 4), px(top - 1), s, s);
          v.globalAlpha = 1;
        } else crewMarker(v, view, "error", f.x + 4, 0, t + i);
      } else if (this.sceneId === "night") {
        const P = NIGHT[theme];
        const y = waiting ? 6 : 4;
        const cx = f.x + 4;
        const plus = (color: string, a: number) => {
          v.globalAlpha = a; v.fillStyle = color;
          for (const [dx, dy] of [[0, 0], [-1, 0], [1, 0], [0, -1], [0, 1]]) v.fillRect(px(cx + dx), px(y + dy), s, s);
          v.globalAlpha = 1;
        };
        if (waiting) {
          const on = reduced ? 1 : 0.55 + 0.45 * Math.sin(t * Math.PI * 1.2 + i);
          glow(v, view, cx, y, 4, AMBER, 0.8 * on);
          plus(AMBER, 0.6 + 0.4 * on);
        } else {
          // A star behind a small cloud that drifts a little.
          plus(P.star, 0.7);
          const c = sprite(CLOUD, { g: CLOUD_COLORS[theme].g });
          const dx = reduced ? 0 : Math.round(Math.sin(t / 2 + i) * 1.5 * s) / s;
          v.globalAlpha = 0.95;
          this.blit(v, c, cx - 3 + dx, y + 1);
          v.globalAlpha = 1;
        }
      } else {
        // Pasture: "!" above the sheep's back, or its own rain cloud.
        if (waiting) this.bang(v, view, f.x + 13, GROUND - 12, t + i * 0.4);
        else crewMarker(v, view, "error", f.x + 5, 0, t + i);
      }
    }
  }

  /** A small amber "!" with a soft glow, pulsing gently. */
  private bang(v: CanvasRenderingContext2D, view: DrawContext, x: number, y: number, t: number) {
    const s = VIGNETTE_SCALE;
    const on = view.reducedMotion ? 1 : 0.5 + 0.5 * Math.sin(t * Math.PI * 1.2);
    glow(v, view, x, y + 2, 2, AMBER, 0.25 + 0.25 * on);
    v.fillStyle = AMBER;
    v.globalAlpha = 0.75 + 0.25 * on;
    v.fillRect(Math.round(x * s), Math.round(y * s), s, 3 * s);
    v.fillRect(Math.round(x * s), Math.round((y + 4) * s), s, s);
    v.globalAlpha = 1;
  }

  /** Which helper sits at `xCss` (CSS px from the canvas's left), if any. */
  hit(xCss: number): CrewMember | null {
    const x = xCss / VIGNETTE_SCALE;
    const f = this.lay.figures.find((g) => x >= g.x - 2 && x <= g.x + g.w + 2);
    return f?.member ?? null;
  }
}
