// The helper alert's mini scene, run by the kit: half the strip's height, in
// the current scene's style, shown while the main agent is idle and a helper
// waits on you or has failed. The kit picks the figures (waiting first, at
// most three, "+N" for the rest), caches everything that does not move, runs
// the gentle pulse at the slow frame rate, and maps taps to figures. A scene
// supplies the layout and the drawing.
import type { CrewMember } from "../crew";
import { LayerCache, crewMarker, glow, type Motion } from "./common";
import { AMBER } from "./style";
import type { DrawContext, ThemeMode } from "./types";

export const VIGNETTE_SCALE = 2;
export const VIGNETTE_ROWS = 13;
export const MAX_FIGURES = 3;
/** The ground or water row of the mini scene. */
export const ALERT_GROUND = 12;
export { AMBER } from "./style";

/** A figure's place in art px. */
export interface Figure { member: CrewMember; x: number; w: number }

export interface AlertLayout {
  /** Width in art px. */
  width: number;
  figures: Figure[];
  /** Any other positions the scene wants to remember (the Pasture's dog). */
  extra: Record<string, number>;
}

/** What a scene's alert drawing can use. */
export interface AlertPainter {
  readonly view: DrawContext;
  readonly theme: ThemeMode;
  readonly layout: AlertLayout;
  /** Seconds since the alert appeared. */
  readonly t: number;
  readonly reduced: boolean;
  /** Canvas pixels per art pixel (2). */
  readonly s: number;
  px(n: number): number;
  /** Draw a sprite canvas (with its 1px border) so its art sits at `x`,`y`. */
  blit(ctx: CanvasRenderingContext2D, c: HTMLCanvasElement, x: number, y: number): void;
  /** The failed rain cloud above `x`, `y`. */
  failed(ctx: CanvasRenderingContext2D, x: number, y: number, t: number): void;
  /** A small amber "!" with a soft glow, pulsing gently. */
  bang(ctx: CanvasRenderingContext2D, x: number, y: number, t: number): void;
  /** A soft diamond of light. */
  glow(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string, alpha: number): void;
}

export interface AlertSpec {
  /** Place `members` (already capped at MAX_FIGURES, waiting first). */
  layout(members: readonly CrewMember[]): AlertLayout;
  /** The parts that do not move: drawn once per change. */
  still(ctx: CanvasRenderingContext2D, p: AlertPainter): void;
  /** The parts that move (pulses, drops, bobbing): drawn every frame. */
  moving(ctx: CanvasRenderingContext2D, p: AlertPainter): void;
}

/** One alert strip for one scene. */
export class AlertScene implements AlertPainter {
  t = 0;
  layout: AlertLayout = { width: 0, figures: [], extra: {} };
  view!: DrawContext;
  readonly s = VIGNETTE_SCALE;
  private cache = new LayerCache();
  private key = "";
  constructor(readonly sceneId: string, private spec: AlertSpec) {}

  get theme() { return this.view.theme; }
  get reduced() { return this.view.reducedMotion; }

  set(members: readonly CrewMember[]) {
    const key = members.slice(0, MAX_FIGURES).map((m) => `${m.id}:${m.kind}`).join(",");
    if (key !== this.key) { this.key = key; this.layout = this.spec.layout(members.slice(0, MAX_FIGURES)); }
  }
  /** Width in CSS px. */
  get width() { return this.layout.width * VIGNETTE_SCALE; }
  get figures(): readonly Figure[] { return this.layout.figures; }

  update(dt: number) { this.t += dt; }

  draw(v: CanvasRenderingContext2D, theme: ThemeMode, muted: string, reduced: boolean) {
    const s = VIGNETTE_SCALE, W = this.layout.width;
    this.view = { width: W * s, dpr: 1, theme, muted, reducedMotion: reduced, now: Date.now(), duskMinutes: 40, scale: s };
    const back = this.cache.get(`${this.sceneId}:${theme}:${muted}:${this.key}`, W * s, VIGNETTE_ROWS * s, (b) => this.spec.still(b, this));
    v.clearRect(0, 0, v.canvas.width, v.canvas.height);
    v.drawImage(back, 0, 0);
    this.spec.moving(v, this);
  }

  motion(reduced: boolean): Motion {
    return reduced || this.layout.figures.length === 0 ? "still" : "slow";
  }

  /** Which helper sits at `xCss` (CSS px from the canvas's left), if any. */
  hit(xCss: number): CrewMember | null {
    const x = xCss / VIGNETTE_SCALE;
    const f = this.layout.figures.find((g) => x >= g.x - 2 && x <= g.x + g.w + 2);
    return f?.member ?? null;
  }

  px(n: number) { return Math.round(n * VIGNETTE_SCALE); }
  blit(b: CanvasRenderingContext2D, c: HTMLCanvasElement, x: number, y: number) {
    const s = VIGNETTE_SCALE;
    b.drawImage(c, Math.round((x - 1) * s), Math.round((y - 1) * s), c.width * s, c.height * s);
  }
  failed(v: CanvasRenderingContext2D, x: number, y: number, t: number) { crewMarker(v, this.view, "error", x, y, t); }
  glow(v: CanvasRenderingContext2D, x: number, y: number, r: number, color: string, alpha: number) { glow(v, this.view, x, y, r, color, alpha); }
  bang(v: CanvasRenderingContext2D, x: number, y: number, t: number) {
    const s = VIGNETTE_SCALE;
    const on = this.view.reducedMotion ? 1 : 0.5 + 0.5 * Math.sin(t * Math.PI * 1.2);
    glow(v, this.view, x, y + 2, 2, AMBER, 0.25 + 0.25 * on);
    v.fillStyle = AMBER;
    v.globalAlpha = 0.75 + 0.25 * on;
    v.fillRect(Math.round(x * s), Math.round(y * s), s, 3 * s);
    v.fillRect(Math.round(x * s), Math.round((y + 4) * s), s, s);
    v.globalAlpha = 1;
  }
}

/** Space figures evenly: `first` art px in, one every `step`, each `w` wide. */
export function rowOf(members: readonly CrewMember[], first: number, step: number, w: number): Figure[] {
  return members.map((m, i) => ({ member: m, x: first + i * step, w }));
}
