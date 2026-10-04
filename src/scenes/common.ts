// Pieces every scene shares: the pixel grid, sprite rendering, the evening
// clock, the rain cloud, and the rate-limit sign.
import type { Mood } from "../mood";
import type { DrawContext, ThemeMode } from "./types";

export const SCALE = 3;          // CSS pixels per art pixel
export const H = 16;             // art rows
export const STEP_DEBOUNCE = 1.7; // at most one step reaction per this many seconds

/**
 * Page-wide switches from Calm's settings. Every strip and preview on the
 * page shares them; the app updates them when the settings change.
 */
export const options = {
  /** Rare surprises: a fox, a whale, a comet. */
  surprises: true,
  /** Light that follows the local time of day, and a touch for each season. */
  ambient: true,
};

export type Sprite = readonly string[];
export type Palette = Readonly<Record<string, string | null>>;

const cache = new Map<string, HTMLCanvasElement>();

/**
 * Render a sprite once per palette and direction. Characters listed in
 * `outlined` get a 1px outline in `palette.outline`, so pale shapes read on a
 * light background.
 */
export function sprite(rows: Sprite, palette: Palette, flip = false, outlined = ""): HTMLCanvasElement {
  const key = `${rows.join("|")}:${JSON.stringify(palette)}:${flip}:${outlined}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const h = rows.length;
  const w = Math.max(...rows.map((r) => r.length));
  const c = document.createElement("canvas");
  c.width = w + 2;
  c.height = h + 2;
  const x = c.getContext("2d")!;
  const at = (i: number, j: number) => rows[j]?.[flip ? w - 1 - i : i] ?? ".";
  const outline = palette.outline;
  if (outline && outlined) {
    x.fillStyle = outline;
    for (let j = -1; j <= h; j++)
      for (let i = -1; i <= w; i++) {
        if (at(i, j) !== ".") continue;
        const near = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([a, b]) => outlined.includes(at(i + a, j + b)));
        if (near) x.fillRect(i + 1, j + 1, 1, 1);
      }
  }
  for (let j = 0; j < h; j++)
    for (let i = 0; i < w; i++) {
      const ch = at(i, j);
      if (ch === ".") continue;
      x.fillStyle = palette[ch] ?? "#000";
      x.fillRect(i + 1, j + 1, 1, 1);
    }
  cache.set(key, c);
  return c;
}

/**
 * How far into the evening the local clock is: 0 in the day (8am to 4pm),
 * rising to 1 by 9pm, night until 5am, then easing back by 8am.
 */
export function clockEvening(now: number): number {
  const d = new Date(now);
  const h = d.getHours() + d.getMinutes() / 60;
  if (h >= 8 && h < 16) return 0;
  if (h >= 16 && h < 21) return (h - 16) / 5;
  if (h >= 21 || h < 5) return 1;
  return 1 - (h - 5) / 3;
}

/**
 * Evening light: the local time of day, deepened by a long run. 0 is clear
 * day, 1 is full dusk. A run reaches full dusk after the evening setting.
 */
export function evening(mood: Mood, view: DrawContext): number {
  const running = mood.kind === "working" || mood.kind === "waiting";
  const run = running && mood.turnStartedAt
    ? Math.min(1, Math.max(0, (view.now - mood.turnStartedAt) / 60000 / view.duskMinutes))
    : 0;
  const clock = options.ambient ? clockEvening(view.now) : 0;
  return 1 - (1 - clock) * (1 - run);
}

export type Season = "winter" | "spring" | "summer" | "autumn" | "none";

/** The season from the local date (northern hemisphere months). */
export function seasonOf(now: number): Season {
  if (!options.ambient) return "none";
  const m = new Date(now).getMonth();
  if (m === 11 || m <= 1) return "winter";
  if (m <= 4) return "spring";
  if (m <= 7) return "summer";
  return "autumn";
}

export const SNOW: Record<ThemeMode, string> = { light: "#b9c7da", dark: "#e8eef7" };

/**
 * A few slow snowflakes. Positions come from a fixed seed, so a still frame
 * (reduced motion) shows the same quiet scatter.
 */
export function snowfall(v: CanvasRenderingContext2D, view: DrawContext, W: number, t: number, count: number, floor: number) {
  const s = (view.scale ?? SCALE) * view.dpr;
  const rnd = seeded(W * 13 + 7);
  v.fillStyle = SNOW[view.theme];
  for (let i = 0; i < count; i++) {
    const x0 = rnd() * W, speed = 2 + rnd() * 2, sway = rnd() * 6.3;
    const y = view.reducedMotion ? rnd() * floor : ((rnd() * floor + t * speed) % floor);
    const x = x0 + (view.reducedMotion ? 0 : Math.sin(t * 0.8 + sway) * 1.5);
    v.fillRect(Math.round(x * s), Math.round(y * s), s, s);
  }
}

/** A soft diamond of light around `x`,`y` (art px), so glows never look boxy. */
export function glow(v: CanvasRenderingContext2D, view: DrawContext, x: number, y: number, r: number, color: string, alpha: number) {
  const s = (view.scale ?? SCALE) * view.dpr;
  v.fillStyle = color;
  for (let ring = r; ring >= 1; ring--) {
    v.globalAlpha = alpha * (1 - (ring - 1) / r) * 0.6;
    for (let dy = -ring; dy <= ring; dy++) {
      const w = ring - Math.abs(dy);
      v.fillRect(Math.round((x - w) * s), Math.round((y + dy) * s), (2 * w + 1) * s, s);
    }
  }
  v.globalAlpha = 1;
}

/** A small marker drawn over a crew member: waiting, failed, or paused. */
export function crewMarker(v: CanvasRenderingContext2D, view: DrawContext, kind: string, x: number, y: number, t: number) {
  const s = (view.scale ?? SCALE) * view.dpr;
  const px = (n: number) => Math.round(n * s);
  if (kind === "waiting") {
    const on = view.reducedMotion ? 1 : 0.55 + 0.45 * Math.sin(t * Math.PI * 1.6);
    v.globalAlpha = on;
    v.fillStyle = "#f5a524";
    v.fillRect(px(x), px(y), s, 3 * s);
    v.fillRect(px(x), px(y + 4), s, s);
    v.globalAlpha = 1;
  } else if (kind === "error") {
    const c = CLOUD_COLORS[view.theme];
    v.fillStyle = c.g;
    v.fillRect(px(x - 2), px(y + 1), 6 * s, 2 * s);
    v.fillRect(px(x - 1), px(y), 4 * s, s);
    v.fillStyle = c.d;
    const drop = view.reducedMotion ? 0 : (t * 6) % 2;
    v.fillRect(px(x - 1), px(y + 3 + drop), s, s);
    v.fillRect(px(x + 2), px(y + 4 - drop), s, s);
  } else if (kind === "rate") {
    v.fillStyle = view.muted;
    v.fillRect(px(x - 1), px(y + 1), s, 3 * s);
    v.fillRect(px(x + 1), px(y + 1), s, 3 * s);
  }
}



/**
 * When a rare surprise may start: only while working, after a few minutes,
 * about once per half hour, never twice within 25 minutes.
 */
export class SurpriseClock {
  private working = 0;
  private last = -Infinity;
  tick(dt: number, kind: string, reduced: boolean, busy: boolean): boolean {
    if (kind !== "working" || reduced || !options.surprises) return false;
    this.working += dt;
    if (busy || this.working < 240 || this.working - this.last < 1500) return false;
    if (Math.random() < dt / 1800) { this.last = this.working; return true; }
    return false;
  }
}


export const SUN: Sprite = [".yyy.", "yyyyy", "yyyyy", "yyyyy", ".yyy."];
/** The sun warms and reddens as the evening goes on. */
export const sunColor = (e: number) => (e < 0.5 ? "#f2b13a" : e < 0.8 ? "#ef8a3a" : "#e0604a");

export const CLOUD: Sprite = [
  "....gggg.....",
  "..gggggggg...",
  ".gggggggggggg",
  "ggggggggggggg",
  ".ggggggggggg.",
];

export const CLOUD_COLORS: Record<ThemeMode, { g: string; d: string }> = {
  light: { g: "#a3a6b0", d: "#4f7fd6" },
  dark: { g: "#7d808b", d: "#7fa7e8" },
};

/** The error cloud: a small grey cloud raining over `x` (art px). */
export function rainCloud(v: CanvasRenderingContext2D, view: DrawContext, x: number, t: number) {
  const s = (view.scale ?? SCALE) * view.dpr;
  const px = (n: number) => Math.round(n * s);
  const colors = CLOUD_COLORS[view.theme];
  const cx = x + (view.reducedMotion ? 0 : Math.sin(t / 2) * 2);
  const c = sprite(CLOUD, { g: colors.g });
  v.drawImage(c, px(cx - 1), px(-1), c.width * s, c.height * s);
  v.fillStyle = colors.d;
  for (let i = 0; i < 6; i++) {
    const y = 6 + ((view.reducedMotion ? i * 3 : t * 15 + i * 3) % 8);
    v.fillRect(px(cx + 2 + i * 2), px(y), s, 2 * s);
  }
}


export function formatTime(ms: number): string {
  return new Date(ms)
    .toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
    .replace(/\s?([AP]M)$/i, (_, a: string) => a.toLowerCase());
}

/** A small deterministic random source, so a scene looks the same each frame. */
export function seeded(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13; s ^= s >>> 17; s ^= s << 5;
    return ((s >>> 0) % 10000) / 10000;
  };
}

// ---------------------------------------------------------------------------
// What a frame hands back besides pixels. The canvas is drawn at one canvas
// pixel per CSS pixel and scaled up crisply by the browser, so text goes to
// sharp page text instead, and the sky goes to a CSS layer behind the canvas
// whose top and sides fade into whatever is behind the strip.

export interface Label {
  text: string;
  /** CSS pixels from the strip's left edge. */
  x: number;
  /** CSS pixels from the top; meaning depends on `anchor`. */
  y: number;
  align: "left" | "center" | "right";
  anchor: "top" | "baseline" | "bottom";
  size: number;
  weight: number;
  mono: boolean;
  alpha: number;
}

const frame = { labels: [] as Label[], glow: [] as Hsla[] };

/** Start collecting a frame's labels and sky. */
export function beginFrame() { frame.labels = []; frame.glow = []; }
/** The frame's labels and sky, as CSS. */
export function endFrame(): { labels: Label[]; glow: Hsla[] } {
  return { labels: frame.labels, glow: frame.glow };
}


function cssScale(view: DrawContext) { return view.scale ?? SCALE; }

export type Hsla = [number, number, number, number];

/**
 * The sky is a faint ambient glow near the ground: atmosphere, not a panel.
 * "none" draws no sky at all; "faint" is a low glow in the time of day's hue;
 * "warm" leans the same glow a little warmer. Opacity stays in single digits
 * to low teens of a percent.
 */
export type SkyStyle = "none" | "faint" | "warm";
let skyStyle: SkyStyle = "faint";
export function setSkyStyle(style: SkyStyle) { skyStyle = style; }

// Glow color by time of day: [hue, saturation, lightness] for day, dusk, night.
type Glow = Record<"day" | "dusk" | "night", [number, number, number]>;
const GLOW: Record<ThemeMode, Glow> = {
  light: { day: [205, 60, 60], dusk: [26, 70, 60], night: [255, 40, 62] },
  dark: { day: [208, 55, 55], dusk: [24, 65, 55], night: [254, 40, 58] },
};
// The warmer option: peach-gold by day, amber at dusk, a warm lavender at night.
const WARM: Record<ThemeMode, Glow> = {
  light: { day: [36, 70, 62], dusk: [22, 75, 60], night: [282, 35, 64] },
  dark: { day: [36, 60, 56], dusk: [20, 70, 55], night: [280, 35, 58] },
};
const ALPHA: Record<ThemeMode, Record<Exclude<SkyStyle, "none">, number>> = {
  light: { faint: 0.07, warm: 0.09 },
  dark: { faint: 0.09, warm: 0.12 },
};
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const lerpHue = (a: number, b: number, t: number) => { const d = ((b - a + 540) % 360) - 180; return (a + d * t + 360) % 360; };

/** The glow's color for evening progress `e`, or null when the sky is off. */
export function skyGlow(e: number, theme: ThemeMode): Hsla | null {
  if (skyStyle === "none") return null;
  const g = (skyStyle === "warm" ? WARM : GLOW)[theme];
  const [from, to, t] = e <= 0.5 ? [g.day, g.dusk, e * 2] : [g.dusk, g.night, (e - 0.5) * 2];
  return [lerpHue(from[0], to[0], t), lerp(from[1], to[1], t), lerp(from[2], to[2], t), ALPHA[theme][skyStyle]];
}

/** Add the time of day's glow behind the scene. */
export function skyTint(_v: CanvasRenderingContext2D, e: number, theme: ThemeMode) {
  const c = skyGlow(e, theme);
  if (c) frame.glow.push(c);
}

/** Add another glow color (the Night sky's spring tint). */
export function skyLayer(c: Hsla) { frame.glow.push(c); }

/**
 * The glow's shape. One line to switch:
 * "linear": a band across the whole pane, peaking just above the ground.
 * "radial": a soft wide, short ellipse centered behind the scene.
 * "follow": the same ellipse, drifting slowly after the dog, boat, or moon.
 */
export type GlowShape = "linear" | "radial" | "follow";
export const GLOW_SHAPE: GlowShape = "radial";

/** How far the glow layer reaches above the strip, in CSS px (matches the CSS). */
export const SKY_REACH = 32;

const hsla = ([h, s, l, a]: Hsla, k = 1) => `hsla(${h.toFixed(0)},${s.toFixed(0)}%,${l.toFixed(0)}%,${(a * k).toFixed(4)})`;

/**
 * The glow as a CSS background for the sky layer. `stripW` and `stripH` are
 * the strip's CSS size; `reach` is how far the layer starts above it.
 */
export function glowBackground(glow: readonly Hsla[], shape: GlowShape, stripW: number, stripH: number, reach: number): string {
  if (shape === "linear") return glow.map((c) => `linear-gradient(${hsla(c)}, ${hsla(c)})`).join(", ");
  // An eased falloff with many stops, so the ellipse has no visible rim.
  const rx = Math.round(Math.max(140, stripW * 0.42)), ry = Math.round(stripH * 0.62);
  const cy = Math.round(reach + stripH * 0.84);
  const stops: [number, number][] = [[1, 0], [0.86, 18], [0.62, 36], [0.38, 54], [0.19, 70], [0.07, 84], [0.015, 94], [0, 100]];
  return glow
    .map((c) => `radial-gradient(ellipse ${rx}px ${ry}px at 50% ${cy}px, ${stops.map(([k, p]) => `${hsla(c, k)} ${p}%`).join(", ")})`)
    .join(", ");
}

/** "+3" for crew beyond what the scene shows, at `x` (art px), right-aligned. */
export function overflowLabel(_v: CanvasRenderingContext2D, view: DrawContext, extra: number, x: number) {
  if (extra <= 0) return;
  frame.labels.push({ text: `+${extra}`, x: x * cssScale(view), y: 2, align: "right", anchor: "top", size: 10, weight: 600, mono: true, alpha: 1 });
}

/** A short floating note ("♪ baa", "♪") rising from `x`,`y` (art px). */
export function floatNote(_v: CanvasRenderingContext2D, view: DrawContext, text: string, x: number, y: number, k: number) {
  const rise = view.reducedMotion ? 0 : k * 3;
  frame.labels.push({
    text, x: x * cssScale(view), y: (y - rise) * cssScale(view), align: "center", anchor: "bottom",
    size: 10, weight: 600, mono: false, alpha: Math.max(0, 1 - Math.max(0, k - 0.6) / 0.4),
  });
}

/** The rate-limit sign at `x` (art px), aligned to that edge. */
export function rateSign(
  _v: CanvasRenderingContext2D, view: DrawContext, mood: Mood, x: number, align: "left" | "right" = "right",
) {
  const text = mood.resetsAt ? `back at ${formatTime(mood.resetsAt)}` : "resting";
  frame.labels.push({ text, x: x * cssScale(view), y: 15, align, anchor: "baseline", size: 11, weight: 400, mono: true, alpha: 1 });
}

/**
 * A small cache for static layers: redrawn only when `key` changes (size,
 * theme, season, time of day), then copied in one call per frame.
 */
export class LayerCache {
  private canvas: HTMLCanvasElement | null = null;
  private key = "";
  get(key: string, width: number, height: number, draw: (ctx: CanvasRenderingContext2D) => void): HTMLCanvasElement {
    if (!this.canvas) this.canvas = document.createElement("canvas");
    if (key !== this.key || this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width; this.canvas.height = height;
      const ctx = this.canvas.getContext("2d")!;
      ctx.imageSmoothingEnabled = false;
      draw(ctx);
      this.key = key;
    }
    return this.canvas;
  }
}

/** How often a scene needs a new frame right now. */
export type Motion = "fast" | "slow" | "still";
