// The scene spills into the prompt box: a translucent layer behind the
// editor's text, found through bb's markup (see composer-dom.ts), that the
// scene paints with what lies below its ground line: water, stars, grass.
// It rises in while the strip is up and drains when it closes, and does
// nothing when the markup isn't recognized. Experimental.
import { findComposerSurface } from "./composer-dom";

/** Time for the spill to fill from nothing (draining takes the same). */
export const SPILL_MS = 900;
const FRAME_MS = 33;
const STILL_FRAME_MS = 500;

export interface SpillOptions {
  /** Paint the layer: `level` is how far in the spill is, 0 to 1 (eased). */
  draw: (ctx: CanvasRenderingContext2D, cssWidth: number, cssHeight: number, level: number) => void;
  isReducedMotion: () => boolean;
}

/** Moves the level toward its target at a constant rate. */
export function approach(level: number, target: number, dt: number, durationMs = SPILL_MS): number {
  const step = dt / durationMs;
  return level < target ? Math.min(target, level + step) : Math.max(target, level - step);
}
/** Smoothstep, so the spill slows as it settles. */
export const easeLevel = (level: number) => level * level * (3 - 2 * level);

const spills = new WeakMap<HTMLElement, Spill>();

/**
 * Starts the spill into the prompt box next to `from`. Returns a function
 * that drains it, or null when no prompt box can be found.
 */
export function spill(from: Element, options: SpillOptions): (() => void) | null {
  const surface = findComposerSurface(from);
  if (!surface) return null;
  let current = spills.get(surface);
  if (!current) spills.set(surface, (current = new Spill(surface)));
  const owner = current;
  owner.fill(options);
  return () => owner.drain();
}

class Spill {
  private readonly layer: HTMLDivElement;
  private readonly canvas: HTMLCanvasElement;
  private options: SpillOptions | null = null;
  private level = 0;
  private target = 0;
  private frame = 0;
  private lastTick = 0;
  private lastDraw = 0;

  constructor(private readonly surface: HTMLElement) {
    const layer = document.createElement("div");
    layer.dataset.calmSpill = "";
    layer.setAttribute("aria-hidden", "true");
    // Below the editor's content but above the form's own background, inside
    // the stacking context that `isolation: isolate` gives the form.
    Object.assign(layer.style, { position: "absolute", inset: "0", zIndex: "-1", borderRadius: "inherit", overflow: "hidden", pointerEvents: "none" });
    const canvas = document.createElement("canvas");
    Object.assign(canvas.style, { display: "block", width: "100%", height: "100%", imageRendering: "pixelated" });
    layer.append(canvas);
    this.layer = layer;
    this.canvas = canvas;
  }

  fill(options: SpillOptions) {
    this.options = options;
    this.target = 1;
    if (!this.layer.isConnected) {
      // The original value lives on the element, so an older bundle's drain
      // after a plugin reload still restores it.
      const s = this.surface;
      s.dataset.calmIsolation ??= s.style.isolation;
      s.style.isolation = "isolate";
      s.append(this.layer);
    }
    this.start();
  }

  drain() { this.target = 0; this.start(); }

  private start() {
    if (this.frame !== 0) return;
    this.lastTick = performance.now();
    this.frame = requestAnimationFrame(this.tick);
  }

  private remove() {
    cancelAnimationFrame(this.frame);
    this.frame = 0;
    this.layer.remove();
    spills.delete(this.surface);
    const s = this.surface;
    if (!s.querySelector("[data-calm-spill]") && s.dataset.calmIsolation !== undefined) {
      s.style.isolation = s.dataset.calmIsolation;
      delete s.dataset.calmIsolation;
    }
  }

  private readonly tick = (now: number) => {
    this.frame = 0;
    if (!this.surface.isConnected) { this.remove(); return; }
    const reduced = this.options?.isReducedMotion() ?? false;
    const dt = now - this.lastTick;
    this.lastTick = now;
    this.level = reduced ? this.target : approach(this.level, this.target, dt);
    if (this.level === 0 && this.target === 0) { this.remove(); return; }
    const interval = reduced ? STILL_FRAME_MS : FRAME_MS;
    if (now - this.lastDraw >= interval && document.visibilityState === "visible") {
      this.lastDraw = now;
      const ctx = this.canvas.getContext("2d");
      if (ctx) this.options?.draw(ctx, this.layer.clientWidth, this.layer.clientHeight, easeLevel(this.level));
    }
    this.frame = requestAnimationFrame(this.tick);
  };
}
