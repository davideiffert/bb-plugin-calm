// The Pasture: a sheepdog and its flock above the prompt box.
//
// The simulation runs in art pixels and seconds. Sprites are drawn at a
// whole-number scale so they stay crisp; only their positions move smoothly.
import { crewColor, type CrewMember } from "../crew";
import type { Mood, MoodKind } from "../mood";
import type { DrawContext, Hit, Scene, SceneInstance, ThemeMode } from "./types";
import { DOG, FOX, OUTLINED, PALETTES, SHEEP } from "./pasture-art";
import {
  H, SCALE, SNOW, STEP_DEBOUNCE, SUN, SurpriseClock, crewMarker, evening, floatNote, overflowLabel,
  rainCloud, rateSign, seasonOf, skyTint, snowfall, sprite as paint, sunColor, type Motion, type Sprite,
} from "./common";

const sprite = (rows: Sprite, theme: ThemeMode, flip: boolean, override?: Record<string, string>) =>
  paint(rows, { ...PALETTES[theme], ...override }, flip, OUTLINED);

const GROUND = 14;        // the row sprites stand on
const SHEEP_W = 13;
const HOP_SECONDS = 0.53;
const HOP_HEIGHT = 7;
const WALK = 3.75;          // sheep, art px per second
const TROT = 12;            // a sheep heading for the stile after a step
const HURRY = 7.5;          // slowest pace heading for the pen
const DOG_SPEED = 7.5;

const NOTE_SECONDS = 1.2;
const FOX_SPEED = 14;

interface Sheep {
  x: number; tx: number; dir: 1 | -1; hop: { from: number; to: number; k: number } | null; phase: number; trot: boolean;
  /** Seconds into a tap's "♪ baa", or null. */
  baa: number | null;
}
/** A child thread, shown as a sheep with a colored ear tag. */
interface CrewSheep extends Sheep { id: string; kind: MoodKind; color: string; leaving: boolean; alpha: number }

export class Pasture implements SceneInstance {
  private W = 0;
  private n = 3;
  private fenceX = 0;
  private penW = 0;
  private penX = 0;
  private t = 0;
  private lastHop = -99;
  private lastHopper: Sheep | null = null;
  private mood: Mood = { kind: "idle", turnStartedAt: null, resetsAt: null, since: 0 };
  private sheep: Sheep[] = [];
  private crew: CrewSheep[] = [];
  private crewExtra = 0;
  private fox: { x: number; pause: number } | null = null;
  private surprises = new SurpriseClock();
  private dog = { x: 2, dir: 1 as 1 | -1 };
  private reduced = false;
  private backKey = "";
  private frontKey = "";
  private scale = SCALE;
  private season = seasonOf(Date.now());
  private scatterPending = true;
  private back = typeof document === "undefined" ? null : document.createElement("canvas");
  private front = typeof document === "undefined" ? null : document.createElement("canvas");

  /** Lay the field out for a strip `cssWidth` wide. Keeps animals in proportion. */
  layout(cssWidth: number, scale = SCALE) {
    const W = Math.max(60, Math.floor(cssWidth / scale));
    if (W === this.W) return;
    const ratio = this.W ? W / this.W : 1;
    this.W = W;
    const n = W < 130 ? 2 : 3;
    this.fenceX = Math.floor(W * (n === 2 ? 0.33 : 0.42));
    this.penW = 12 + n * 11;
    this.penX = W - this.penW - 2;
    if (this.sheep.length !== n) {
      this.n = n;
      this.sheep = Array.from({ length: n }, (_, i) => ({ x: 0, tx: 0, dir: 1, hop: null, phase: i, trot: false, baa: null }));
      this.scatterPending = true;
    } else {
      for (const s of [...this.sheep, ...this.crew]) { s.x *= ratio; s.tx *= ratio; s.hop = null; }
      this.dog.x *= ratio;
    }
    if (this.scatterPending) this.scatter();
    if (this.mood.kind === "rate") this.pen(true);
  }

  setMood(mood: Mood) {
    const was = this.mood.kind;
    this.mood = mood;
    if (mood.kind === was) return;
    // A new run starts mid-scene rather than from the pen: most runs are short.
    if (mood.kind === "working" && was !== "waiting") this.scatterPending = true;
    if (this.W && this.scatterPending) this.scatter();
  }

  private maxCrew() { return this.W && this.W < 130 ? 2 : 4; }

  setCrew(list: readonly CrewMember[]) {
    const ids = new Set(list.map((m) => m.id));
    for (const c of this.crew) if (!ids.has(c.id) && !c.leaving) {
      // Finished: walk into the pen, then fade out.
      c.leaving = true; c.kind = "working";
      c.tx = this.penX + 8 + Math.random() * (this.penW - 20);
    }
    let shown = this.crew.filter((c) => !c.leaving).length;
    for (const m of list) {
      const have = this.crew.find((c) => c.id === m.id && !c.leaving);
      if (have) { have.kind = m.kind; continue; }
      if (shown >= this.maxCrew()) continue;
      shown++;
      // A new member ambles in from the left edge.
      const c: CrewSheep = {
        id: m.id, kind: m.kind, color: crewColor(m.id), leaving: false, alpha: 1,
        x: -14, tx: 0, dir: 1, hop: null, phase: this.crew.length + 3, trot: false, baa: null,
      };
      // Spread out across the meadow, on either side of the stile.
      const right = shown % 2 === 0;
      const lo = right ? this.fenceX + 8 : 18, hi = right ? this.penX - SHEEP_W - 4 : this.fenceX - 16;
      c.tx = lo + Math.random() * Math.max(4, hi - lo);
      c.trot = true;   // trots in, then ambles
      if (this.reduced) c.x = c.tx;
      this.crew.push(c);
    }
    this.crewExtra = Math.max(0, list.length - shown);
  }

  hit(x: number, y: number): Hit | null {
    const scale = this.scale, ax = x / scale, ay = y / scale;
    const inBox = (bx: number, by: number, w: number, h: number) => ax >= bx && ax <= bx + w && ay >= by && ay <= by + h;
    const d = this.dog;
    const seated = this.mood.kind === "waiting";
    if (seated ? inBox(d.x + 2, GROUND - 10, 9, 11) : inBox(d.x, GROUND - 8, 14, 9)) {
      return { target: "lead", x: (d.x + 7) * scale, y: (GROUND - 9) * scale };
    }
    const at = (s: Sheep) => ({ x: (s.x + 6.5) * scale, y: (GROUND - 9) * scale });
    for (const c of this.crew) if (!c.leaving && inBox(c.x, GROUND - 9, SHEEP_W, 10)) return { target: "member", id: c.id, ...at(c) };
    for (const s of this.sheep) if (inBox(s.x, GROUND - 9, SHEEP_W, 10)) return { target: "flock", ...at(s) };
    return null;
  }

  poke(hit: Hit) {
    const ax = hit.x / this.scale;
    const s = [...this.crew, ...this.sheep].find((o) => Math.abs(o.x + 6.5 - ax) < 1);
    if (!s || hit.target === "lead") return;
    s.baa = 0;
    if (!this.reduced && !s.hop) s.hop = { from: s.x, to: s.x, k: 0 };   // a little hop in place
  }

  surprise() { if (this.W && !this.fox) this.fox = { x: -14, pause: 0 }; }

  /**
   * Spread the flock across the meadow, already ambling, with one sheep just
   * short of the stile so the first step can send it over within a second.
   */
  private scatter() {
    this.scatterPending = false;
    const f = this.fenceX, far = this.penX - SHEEP_W - 4;
    const jitter = () => (Math.random() - 0.5) * 6;
    const xs = this.n === 2
      ? [Math.max(16, f - 24), f + 8 + (far - f - 8) * 0.5]
      : [18 + Math.random() * 6, f - 26 + jitter(), f + 8 + (far - f - 8) * (0.45 + Math.random() * 0.3)];
    this.sheep.forEach((s, i) => {
      s.x = xs[i]; s.hop = null; s.trot = false;
      s.tx = this.wanderTarget(s);
      s.dir = s.tx >= s.x ? 1 : -1;
    });
    this.dog.x = Math.max(1, xs[0] - 20);
    this.dog.dir = 1;
    this.lastHop = -99;
  }

  step() {
    if (this.mood.kind !== "working" || this.t - this.lastHop < STEP_DEBOUNCE || !this.W) return;
    const f = this.fenceX;
    let free = this.sheep.filter((s) => !s.hop && s.x < this.penX - 4);
    // Share the hops around when another sheep is close enough to the stile.
    const others = free.filter((s) => s !== this.lastHopper && Math.abs(s.x - f) < 40);
    if (others.length > 0) free = others;
    if (free.length === 0) return;
    const s = free.reduce((a, b) => (Math.abs(a.x - f) < Math.abs(b.x - f) ? a : b));
    this.lastHop = this.t;
    this.lastHopper = s;
    s.trot = true;
    s.tx = s.x < f ? f + 10 + Math.random() * 14 : f - 22 - Math.random() * 12;
    s.tx = Math.max(2, Math.min(s.tx, this.penX - SHEEP_W - 4));
  }

  /** Pen slots, front to back. `snap` places the flock there instantly. */
  private slot(i: number) { return this.penX + 8 + i * 11; }
  private pen(snap = false) {
    this.sheep.forEach((s, i) => { s.tx = this.slot(i); if (snap) { s.x = s.tx; s.hop = null; } });
  }
  private allPenned() { return this.sheep.every((s) => s.x >= this.penX + 6 && !s.hop && Math.abs(s.x - s.tx) < 0.5); }
  private gateOpen() {
    const k = this.mood.kind;
    return !(k === "rate" && this.allPenned());
  }
  /** The open spot nearest the dog where it can sit in plain view. */
  private sitSpot(): number {
    const f = this.fenceX;
    let best = this.dog.x, bestD = Infinity;
    for (let x = 1; x < this.penX - 14; x++) {
      const clear = this.sheep.every((s) => s.x + SHEEP_W < x || s.x > x + 11) && (x + 11 < f - 1 || x > f + 6);
      const d = Math.abs(x - this.dog.x);
      if (clear && d < bestD) { best = x; bestD = d; }
    }
    return best;
  }

  private wanderTarget(s: Sheep): number {
    const f = this.fenceX;
    const left = s.x < f;
    const lo = left ? 18 : f + 8;   // leave the dog room behind the flock
    const hi = left ? f - 16 : this.penX - SHEEP_W - 4;
    let tx = s.tx;
    for (let k = 0; k < 6; k++) {
      const c = lo + Math.random() * Math.max(1, hi - lo);
      if (this.sheep.every((o) => o === s || Math.abs(o.tx - c) > 15)) { tx = c; break; }
    }
    return tx;
  }

  update(dt: number) {
    if (!this.W) return;
    const k = this.mood.kind, f = this.fenceX;
    if (this.reduced) {   // no motion: hold the still picture for the mood
      this.settle();
      for (const s of [...this.sheep, ...this.crew]) if (s.baa !== null && (s.baa += dt) > NOTE_SECONDS) s.baa = null;
      return;
    }
    this.t += dt;
    for (const s of [...this.sheep, ...this.crew]) if (s.baa !== null && (s.baa += dt) > NOTE_SECONDS) s.baa = null;
    if (k === "working") {
      for (const s of this.sheep)
        if (!s.hop && Math.abs(s.x - s.tx) < 0.5 && Math.random() < 0.8 * dt) s.tx = this.wanderTarget(s);
    }
    this.updateCrew(dt);
    if (this.surprises.tick(dt, k, this.reduced, !!this.fox)) this.surprise();
    if (this.fox) {
      // Trot along, stop once midway to look at the flock, trot on.
      const mid = this.W * 0.45;
      if (this.fox.pause < 1.2 && this.fox.x >= mid) this.fox.pause += dt;
      else this.fox.x += FOX_SPEED * dt;
      if (this.fox.x > this.W + 4 || k !== "working") this.fox = null;
    }
    if (k === "rate") this.pen();
    const frozen = k === "waiting" || k === "error" || k === "idle";
    // Heading for the pen takes about five seconds on any strip width.
    const v = k === "rate" ? Math.max(HURRY, this.penX / 5) : WALK;
    for (const s of this.sheep) {
      if (s.hop) {   // a hop already in the air always lands
        s.hop.k = Math.min(1, s.hop.k + dt / HOP_SECONDS);
        s.x = s.hop.from + (s.hop.to - s.hop.from) * s.hop.k;
        if (s.hop.k >= 1) { s.hop = null; s.trot = false; }
        continue;
      }
      if (frozen) continue;
      const dx = s.tx - s.x;
      if (Math.abs(dx) < 0.5) continue;
      s.dir = dx > 0 ? 1 : -1;
      const nx = s.x + s.dir * Math.min(Math.abs(dx), (s.trot ? Math.max(TROT, v) : v) * dt);
      if (s.dir > 0 && s.x <= f - 14 && nx > f - 14) { s.x = f - 14; s.hop = { from: f - 14, to: f + 5, k: 0 }; continue; }
      if (s.dir < 0 && s.x >= f + 4 && nx < f + 4) { s.x = f + 4; s.hop = { from: f + 4, to: f - 15, k: 0 }; continue; }
      s.x = nx;
    }
    if (k === "waiting") {   // trot to an open spot, then sit facing the viewer
      const dd = this.sitSpot() - this.dog.x;
      if (Math.abs(dd) > 0.5) {
        this.dog.dir = dd > 0 ? 1 : -1;
        this.dog.x += this.dog.dir * Math.min(Math.abs(dd), DOG_SPEED * 2 * dt);
      }
      return;
    }
    if (frozen || k === "rate") return;
    // The dog keeps loosely behind the flock, outside the pen.
    const rear = Math.min(...this.sheep.map((s) => s.x));
    let target = Math.min(this.penX - 18, rear - 20 + Math.sin(this.t / 2.7) * 4);
    if (target > f - 15 && target < f + 6) target = f - 15;   // never stop on the stile
    const dd = target - this.dog.x;
    if (Math.abs(dd) > 2) {
      this.dog.dir = dd > 0 ? 1 : -1;
      this.dog.x += this.dog.dir * Math.min(Math.abs(dd), Math.max(DOG_SPEED, v) * dt);
    }
    this.dog.x = Math.max(1, Math.min(this.dog.x, this.penX - 16));
  }

  private updateCrew(dt: number) {
    const f = this.fenceX;
    for (const c of this.crew) {
      if (c.hop) {
        c.hop.k = Math.min(1, c.hop.k + dt / HOP_SECONDS);
        c.x = c.hop.from + (c.hop.to - c.hop.from) * c.hop.k;
        if (c.hop.k >= 1) c.hop = null;
        continue;
      }
      if (c.leaving && c.x >= this.penX + 6) { c.alpha -= dt / 1.2; continue; }
      // Waiting, paused, failed: stand still, once in the meadow.
      if (!c.leaving && c.kind !== "working" && !c.trot) continue;
      if (!c.leaving && c.kind === "working" && Math.abs(c.x - c.tx) < 0.5 && Math.random() < 0.6 * dt) c.tx = this.wanderTarget(c);
      const dx = c.tx - c.x;
      if (Math.abs(dx) < 0.5) continue;
      c.dir = dx > 0 ? 1 : -1;
      const v = c.leaving ? Math.max(HURRY, this.penX / 6) : c.trot ? TROT : WALK;
      const nx = c.x + c.dir * Math.min(Math.abs(dx), v * dt);
      if (Math.abs(c.tx - nx) < 0.5) c.trot = false;
      if (c.dir > 0 && c.x <= f - 14 && nx > f - 14) { c.x = f - 14; c.hop = { from: f - 14, to: f + 5, k: 0 }; continue; }
      if (c.dir < 0 && c.x >= f + 4 && nx < f + 4) { c.x = f + 4; c.hop = { from: f + 4, to: f - 15, k: 0 }; continue; }
      c.x = nx;
    }
    this.crew = this.crew.filter((c) => c.alpha > 0);
  }

  draw(v: CanvasRenderingContext2D, view: DrawContext) {
    this.layout(view.width, view.scale ?? SCALE);
    this.scale = view.scale ?? SCALE;
    this.season = seasonOf(view.now);
    this.reduced = view.reducedMotion;
    if (this.reduced) this.settle();
    const { theme, dpr } = view;
    const P = PALETTES[theme];
    const W = this.W, f = this.fenceX, k = this.mood.kind;
    const s3 = (view.scale ?? SCALE) * dpr;
    const px = (x: number) => Math.round(x * s3);
    const back = this.back!, front = this.front!;
    const e = evening(this.mood, view);
    const season = this.season, snow = SNOW[theme];
    // Both layers are cached: they only change with size, theme, season, the
    // sun's height, and the gate.
    const sunRow = e > 0.05 ? Math.round(1 + e * 12) : -1;
    const backKey = `${W}:${theme}:${season}:${sunRow}:${e > 0.75}:${sunColor(e)}:${view.muted}`;
    const frontKey = `${W}:${theme}:${season}:${this.gateOpen()}`;
    const redrawBack = backKey !== this.backKey;
    const redrawFront = frontKey !== this.frontKey;
    if (redrawBack) { back.width = W; back.height = H; this.backKey = backKey; }
    if (redrawFront) { front.width = W; front.height = H; this.frontKey = frontKey; }

    // Back layer: sun and stars, ground, grass, the stile.
    const b = back.getContext("2d")!;
    if (redrawBack) this.drawBack(b, view, e, W, f, season, snow);
    // Front layer: the pen, drawn over the sheep so they stand inside it.
    const fr = front.getContext("2d")!;
    if (redrawFront) this.drawFront(fr, view, season, snow);

    this.drawFrame(v, view, e, s3, px, season);
  }

  private drawBack(b: CanvasRenderingContext2D, view: DrawContext, e: number, W: number, f: number, season: string, snow: string) {
    const { theme } = view;
    const P = PALETTES[theme];
    if (e > 0.05) {
      b.drawImage(sprite(SUN, theme, false, { y: sunColor(e) }), Math.round((f + 6 + this.penX - 3) / 2) - 2, Math.round(1 + e * 12));
      if (e > 0.75) {
        b.fillStyle = P.star!;
        for (const [x, y] of [[12, 2], [40, 4], [W - 60, 1], [Math.floor(W * 0.6), 3]]) b.fillRect(x, y, 1, 1);
      }
    }
    b.fillStyle = view.muted;
    b.globalAlpha = 0.35;
    b.fillRect(0, GROUND + 1, W, 1);
    b.globalAlpha = 1;
    if (season === "winter") { b.fillStyle = snow; b.fillRect(0, GROUND, W, 1); }
    // Grass: green, autumn gold, or snowed under; spring adds a few flowers.
    const tuft = season === "autumn" ? (theme === "dark" ? "#d0903f" : "#c07a30") : P.grass!;
    let n = 0;
    for (let i = 7; i < W - 4; i += 23, n++) {
      const x = ((i * 37) % (W - 6)) + 2;
      if (season === "winter") { b.fillStyle = snow; b.fillRect(x + 1, GROUND - 1, 2, 1); continue; }
      b.fillStyle = tuft;
      b.fillRect(x, GROUND, 1, 1); b.fillRect(x + 1, GROUND - 1, 1, 2); b.fillRect(x + 3, GROUND, 1, 1);
      if (season === "spring" && n % 2 === 0) { b.fillStyle = n % 4 ? "#f2c94c" : "#e88bb0"; b.fillRect(x + 1, GROUND - 2, 1, 1); }
    }
    b.fillStyle = P.f!;
    b.fillRect(f, GROUND - 6, 1, 7); b.fillRect(f + 4, GROUND - 6, 1, 7);
    b.fillRect(f - 1, GROUND - 5, 7, 1); b.fillRect(f - 1, GROUND - 2, 7, 1);
    if (season === "winter") { b.fillStyle = snow; b.fillRect(f - 1, GROUND - 6, 7, 1); }
  }

  private drawFront(fr: CanvasRenderingContext2D, view: DrawContext, season: string, snow: string) {
    const P = PALETTES[view.theme];
    const p0 = this.penX, pe = p0 + this.penW;
    fr.fillStyle = P.f!;
    for (const x of [p0, p0 + 7, pe]) fr.fillRect(x, GROUND - 7, 1, 8);
    fr.fillRect(p0 + 7, GROUND - 6, pe - p0 - 6, 1); fr.fillRect(p0 + 7, GROUND - 3, pe - p0 - 6, 1);
    if (season === "winter") { fr.fillStyle = snow; fr.fillRect(p0 + 7, GROUND - 7, pe - p0 - 6, 1); fr.fillStyle = P.f!; }
    if (this.gateOpen()) {
      fr.fillRect(p0 - 3, GROUND - 6, 1, 6); fr.fillRect(p0 - 3, GROUND - 5, 3, 1); fr.fillRect(p0 - 3, GROUND - 2, 3, 1);
    } else {
      fr.fillRect(p0, GROUND - 6, 7, 1); fr.fillRect(p0, GROUND - 3, 7, 1);
      for (let i = 0; i < 4; i++) fr.fillRect((p0 + 1 + i * 1.5) | 0, GROUND - 3 - i, 1, 1);
    }
  }

  private drawFrame(v: CanvasRenderingContext2D, view: DrawContext, e: number, s3: number, px: (x: number) => number, season: string) {
    const { theme } = view;
    const P = PALETTES[theme];
    const W = this.W, k = this.mood.kind;
    const back = this.back!, front = this.front!;

    // Compose.
    v.setTransform(1, 0, 0, 1, 0, 0);
    v.clearRect(0, 0, v.canvas.width, v.canvas.height);
    v.imageSmoothingEnabled = false;
    skyTint(v, e, theme);
    v.drawImage(back, 0, 0, W * s3, H * s3);
    const blit = (c: HTMLCanvasElement, x: number, y: number) => v.drawImage(c, px(x), px(y), c.width * s3, c.height * s3);

    const moving = !view.reducedMotion && k === "working";
    const beat = Math.floor(this.t / 0.27);
    if (this.fox && !this.reduced) {
      const trot = this.fox.pause > 0 && this.fox.pause < 1.2 ? FOX.stand : beat % 2 ? FOX.trot2 : FOX.trot1;
      blit(sprite(trot, theme, false), this.fox.x - 1, GROUND - 6);
    }
    const d = this.dog;
    const seated = k === "waiting" && (this.reduced || Math.abs(this.sitSpot() - d.x) <= 0.5);
    if (k === "rate") blit(sprite(DOG.lie, theme, false), d.x, GROUND - 4);
    else if (!seated) {
      const trotting = (moving || k === "waiting") && !view.reducedMotion && beat % 2 === 1;
      blit(sprite(trotting ? DOG.trot2 : DOG.trot1, theme, d.dir < 0), d.x, GROUND - 7);
    }
    const sheepY = (s: Sheep) => {
      let y = GROUND - 8 - (s.x >= this.penX + 6 && s.phase % 2 ? 1 : 0);
      if (s.hop) y -= Math.sin(Math.PI * s.hop.k) * (s.hop.from === s.hop.to ? 3 : HOP_HEIGHT);
      return y;
    };
    const drawSheep = (s: Sheep, walking: boolean) => {
      let rows: Sprite = SHEEP.walk1;
      if (s.hop) rows = SHEEP.hop;
      else if (walking && !view.reducedMotion && Math.abs(s.x - s.tx) >= 0.5 && (beat + s.phase) % 2) rows = SHEEP.walk2;
      blit(sprite(rows, theme, s.dir < 0), s.x - 1, sheepY(s) - 1);
    };
    for (const s of this.sheep) drawSheep(s, moving);
    for (const c of this.crew) {
      v.globalAlpha = Math.max(0, c.alpha);
      drawSheep(c, c.leaving || c.kind === "working");
      // The ear tag that marks a child thread.
      v.fillStyle = c.color;
      v.fillRect(px(c.x + (c.dir > 0 ? 7 : 4)), px(sheepY(c) + 1), 2 * s3, 2 * s3);
      v.globalAlpha = 1;
      if (!c.leaving) crewMarker(v, view, c.kind, c.x + 6, sheepY(c) - 6, this.t);
    }
    if (seated) blit(sprite(DOG.sit, theme, false), d.x + 2, GROUND - 10);
    v.drawImage(front, 0, 0, W * s3, H * s3);

    // Season touches drawn over everything, and kept sparse.
    if (season === "winter") snowfall(v, view, W, this.t, 7, GROUND);
    if (season === "summer") {
      const bx = this.reduced ? W * 0.3 : ((this.t * 6) % (W + 20)) - 10;
      const by = 4 + (this.reduced ? 0 : Math.sin(this.t * 1.7) * 2);
      // A small butterfly: two wings that open and close around a dark body.
      const open = this.reduced || Math.floor(this.t * 6) % 2 === 0;
      v.fillStyle = "#f2a33a";
      if (open) {
        v.fillRect(px(bx - 1), px(by - 1), 2 * s3, 2 * s3); v.fillRect(px(bx + 2), px(by - 1), 2 * s3, 2 * s3);
      } else {
        v.fillRect(px(bx), px(by - 1), s3, 2 * s3); v.fillRect(px(bx + 2), px(by - 1), s3, 2 * s3);
      }
      v.fillStyle = P.K!;
      v.fillRect(px(bx + 1), px(by - 1), s3, 2 * s3);
    }
    if (season === "autumn") {
      const ly = this.reduced ? GROUND - 1 : (this.t * 3) % GROUND;
      v.fillStyle = theme === "dark" ? "#e08a3a" : "#c8642a";
      v.fillRect(px(W * 0.55 + (this.reduced ? 0 : Math.sin(this.t) * 4)), px(ly), 2 * s3, s3);
    }

    for (const s of [...this.sheep, ...this.crew]) if (s.baa !== null) floatNote(v, view, "♪ baa", s.x + 6, sheepY(s) - 1, s.baa / NOTE_SECONDS);
    overflowLabel(v, view, this.crewExtra, W - 2);
    if (k === "error") rainCloud(v, view, this.sheep[Math.min(1, this.n - 1)].x - 4, this.t);
    if (k === "rate") rateSign(v, view, this.mood, this.penX - 5);
  }

  focusX() { return (this.dog.x + 7) * this.scale; }

  motion(): Motion {
    // A tap's note shows (and fades) even with reduced motion.
    if ([...this.sheep, ...this.crew].some((s) => s.baa !== null)) return this.reduced ? "slow" : "fast";
    if (this.reduced) return "still";
    const k = this.mood.kind;
    const all = [...this.sheep, ...this.crew];
    if (this.fox || all.some((s) => s.hop || s.baa !== null)) return "fast";
    if (this.crew.some((c) => c.leaving || c.alpha < 1 || (c.kind === "working" && Math.abs(c.x - c.tx) >= 0.5))) return "fast";
    if (k === "working") return "fast";   // the flock ambles and the dog keeps moving
    if (k === "waiting" && Math.abs(this.sitSpot() - this.dog.x) > 0.5) return "fast";
    if (k === "rate" && !this.allPenned()) return "fast";
    // Rain, a blinking marker, falling snow, a butterfly or leaf: gentle changes.
    const gentle = k === "error" || this.crew.some((c) => c.kind === "waiting" || c.kind === "error") || this.season !== "spring";
    return k === "idle" ? "still" : gentle ? "slow" : "still";
  }

  /** Reduced motion: jump straight to the still picture for the mood. */
  private settle() {
    const k = this.mood.kind;
    for (const s of [...this.sheep, ...this.crew]) s.hop = null;
    for (const c of this.crew) if (c.leaving) c.alpha = 0; else c.x = c.tx > 0 ? c.tx : c.x;
    this.crew = this.crew.filter((c) => c.alpha > 0);
    this.fox = null;
    if (k === "rate") this.pen(true);
    if (k === "waiting") this.dog.x = this.sitSpot();
  }
}

export const pasture: Scene = {
  id: "pasture",
  name: "Pasture",
  height: H * SCALE,
  create: () => new Pasture(),
};
