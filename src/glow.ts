// Paints the scene's faint glow onto the sky layer. The gradient only changes
// when its colors or the strip's size change; a "follow" glow then slides
// after the main character with a CSS transform, which the browser moves
// without repainting anything.
import { GLOW_SHAPE, glowBackground, type GlowShape, type Hsla } from "./kit/common";

const FOLLOW_RATE = 0.8;   // how quickly the glow catches up, per second (slow and calm)

export class GlowLayer {
  private bg = "";
  private shape = "";
  private offset: number | null = null;
  private moved = "";
  constructor(private el: HTMLElement, private reach: number, private shape0: GlowShape = GLOW_SHAPE) {}

  /** Returns true while the glow is still drifting toward the character. */
  update(glow: readonly Hsla[], stripW: number, stripH: number, focusX: number, dt: number, still: boolean): boolean {
    const shape = this.shape0;
    if (shape !== this.shape) { this.shape = shape; this.el.dataset.shape = shape; }
    const bg = glowBackground(glow, shape, stripW, stripH, this.reach);
    if (bg !== this.bg) { this.bg = bg; this.el.style.background = bg; }
    if (shape !== "follow") return false;
    const target = focusX - stripW / 2;
    if (this.offset === null || still) this.offset = target;
    else this.offset += (target - this.offset) * Math.min(1, dt * FOLLOW_RATE);
    const t = `translateX(calc(-50% + ${this.offset.toFixed(1)}px))`;
    if (t !== this.moved) { this.moved = t; this.el.style.transform = t; }
    return Math.abs(target - this.offset) > 0.5;
  }
}
