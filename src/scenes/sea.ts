// The Sea: a small sailboat on moving water. Inspired by the calm mode in
// Kun Chen's firstmate; the boat, water, and moments here are drawn fresh.
import { crewColor, type CrewMember } from "../crew";
import type { Mood, MoodKind } from "../mood";
import type { DrawContext, Hit, Scene, SceneInstance, ThemeMode } from "./types";
import {
  H, SCALE, STEP_DEBOUNCE, SUN, SurpriseClock, crewMarker, evening, floatNote, overflowLabel, rainCloud,
  rateSign, seasonOf, seeded, skyTint, snowfall, sprite, sunColor, type Motion, type Season, type Sprite,
} from "./common";

const WATER = 10;          // the waterline row
const BOAT_W = 15;
const DRIFT = 4.5;         // boat, art px per second
const FISH_SECONDS = 0.9;
const FISH_HEIGHT = 8;
const ANCHOR_SECONDS = 0.8;

const BOAT: Sprite = [
  ".......m.......",
  ".......mS......",
  "......smSS.....",
  ".....ssmSSS....",
  "....sssmSSSS...",
  "...ssssmSSSSS..",
  "..sssssmSSSSSS.",
  ".......m.......",
  "hhhhhhhhhhhhhhh",
  ".rrrrrrrrrrrrr.",
  "..HHHHHHHHHHH..",
];
const SKIFF_W = 9;
export const SKIFF: Sprite = [
  "....m....",
  "....mS...",
  "...smSS..",
  "..ssmSSS.",
  "....m....",
  "hhhhhhhhh",
  ".rrrrrrr.",
];
const BELL: Sprite = ["..y..", ".yyy.", ".yyy.", "yyyyy", "..y.."];
const WHALE: Sprite = [".......g.......", ".....ggggg.....", "..ggggggggggg..", ".gggggggggggggg", "gggggggggggggggg"];
const TAIL: Sprite = ["g...g", "gg.gg", ".ggg.", "..g.."];
const NOTE_SECONDS = 1.2;
const WHALE_SECONDS = 3.4;

const FISH: Sprite = ["o...ooo.", "oo.ooooo", "ooooooeo", "oo.ooooo", "o...ooo."];
const ANCHOR: Sprite = ["..a..", ".aaa.", "..a..", "a.a.a", ".aaa."];

export const PALETTES: Record<ThemeMode, Record<string, string | null>> = {
  light: {
    m: "#6b4a2f", S: "#fbf8f1", s: "#ece5d6", h: "#8a5a36", r: "#c8553d", H: "#5e3d24",
    o: "#e08a3c", e: "#3b3540", a: "#6b6f7a", outline: "#9c958a",
    water: "#5b8fd9", ripple: "#9dbcea", lamp: "#f5b83d", star: "#8f86c9", g: "#6c7a8f", y: "#f5b83d",
  },
  dark: {
    m: "#a07b55", S: "#ece7dc", s: "#d6cfc0", h: "#b07a4e", r: "#d86a50", H: "#7d5536",
    o: "#f0a050", e: "#2d2833", a: "#a0a4ae", outline: null,
    water: "#6f97e0", ripple: "#3d5f9e", lamp: "#ffd36a", star: "#e8e2ff", g: "#8a98ad", y: "#ffd36a",
  },
};

interface Fish { x: number; dir: 1 | -1; k: number }
/** A child thread, shown as a small boat in the fleet. */
interface Skiff { id: string; kind: MoodKind; color: string; x: number; dir: 1 | -1; speed: number; leaving: boolean; alpha: number; bell: number | null }

export class Sea implements SceneInstance {
  private W = 0;
  private t = 0;
  private x = 0;
  private dir: 1 | -1 = 1;
  private mood: Mood = { kind: "idle", turnStartedAt: null, resetsAt: null, since: 0 };
  private fish: Fish | null = null;
  private lastFish = -99;
  private anchor = 0;       // 0 = stowed, 1 = on the bottom
  private reduced = false;
  private startPending = true;
  private stars: [number, number][] = [];
  private fleet: Skiff[] = [];
  private fleetExtra = 0;
  private bell: number | null = null;
  private whale: { x: number; k: number } | null = null;
  private surprises = new SurpriseClock();
  private scale = SCALE;
  private season: Season = seasonOf(Date.now());

  layout(cssWidth: number, scale = SCALE) {
    const W = Math.max(60, Math.floor(cssWidth / scale));
    if (W === this.W) return;
    const ratio = this.W ? W / this.W : 1;
    this.W = W;
    this.x = Math.min(this.x * ratio, W - BOAT_W - 4);
    const rnd = seeded(W);
    this.stars = Array.from({ length: Math.floor(W / 30) }, () => [Math.floor(rnd() * W), Math.floor(rnd() * 6)]);
    if (this.startPending) this.start();
  }

  setMood(mood: Mood) {
    const was = this.mood.kind;
    this.mood = mood;
    if (mood.kind === was) return;
    if (mood.kind === "working" && was !== "waiting") this.startPending = true;
    if (mood.kind === "working") this.anchor = 0;
    if (this.W && this.startPending) this.start();
  }

  private maxFleet() { return this.W && this.W < 130 ? 2 : 4; }

  setCrew(list: readonly CrewMember[]) {
    const ids = new Set(list.map((m) => m.id));
    for (const b of this.fleet) if (!ids.has(b.id) && !b.leaving) {
      // Finished: sail for the nearest edge, back to harbor.
      b.leaving = true; b.dir = b.x < this.W / 2 ? -1 : 1;
    }
    let shown = this.fleet.filter((b) => !b.leaving).length;
    for (const m of list) {
      const have = this.fleet.find((b) => b.id === m.id && !b.leaving);
      if (have) { have.kind = m.kind; continue; }
      if (shown >= this.maxFleet()) continue;
      shown++;
      const fromLeft = Math.random() < 0.5;
      const b: Skiff = {
        id: m.id, kind: m.kind, color: crewColor(m.id), x: fromLeft ? -SKIFF_W : this.W, dir: fromLeft ? 1 : -1,
        speed: 2.5 + Math.random() * 2, leaving: false, alpha: 1, bell: null,
      };
      if (this.reduced) b.x = 8 + Math.random() * (this.W - 24);
      this.fleet.push(b);
    }
    this.fleetExtra = Math.max(0, list.length - shown);
  }

  hit(x: number, y: number): Hit | null {
    const ax = x / this.scale, ay = y / this.scale;
    const top = WATER - 9;
    if (ax >= this.x && ax <= this.x + BOAT_W && ay >= top - 2 && ay <= WATER + 2) {
      return { target: "lead", x: (this.x + 7.5) * this.scale, y: top * this.scale };
    }
    for (const b of this.fleet) {
      if (!b.leaving && ax >= b.x && ax <= b.x + SKIFF_W && ay >= WATER - 6 && ay <= WATER + 2) {
        return { target: "member", id: b.id, x: (b.x + 4.5) * this.scale, y: (WATER - 6) * this.scale };
      }
    }
    return null;
  }

  poke(hit: Hit) {
    if (hit.target === "lead") this.bell = 0;
    const b = this.fleet.find((o) => o.id === hit.id);
    if (b) b.bell = 0;
  }

  surprise() {
    if (!this.W || this.whale) return;
    // Out in open water, away from the boat.
    const x = this.x < this.W / 2 ? this.W * (0.62 + Math.random() * 0.2) : this.W * (0.08 + Math.random() * 0.2);
    this.whale = { x, k: 0 };
  }

  /** A new run starts under way: mid-water, sailing, a fish already leaping. */
  private start() {
    const running = this.mood.kind === "working";
    this.startPending = false;
    const room = this.W - BOAT_W - 12;
    this.x = 6 + room * (0.2 + Math.random() * 0.5);
    this.dir = Math.random() < 0.5 ? 1 : -1;
    this.anchor = 0;
    this.lastFish = -99;
    if (running) this.leap();   // opening a thread that isn't running shows no leap
  }

  step() {
    if (this.mood.kind !== "working" || this.t - this.lastFish < STEP_DEBOUNCE || !this.W) return;
    this.leap();
  }

  private leap() {
    if (this.fish) return;
    this.lastFish = this.t;
    // Somewhere in open water, away from the boat.
    const ahead = this.x + BOAT_W / 2 + this.dir * (24 + Math.random() * 30);
    const x = ahead > 4 && ahead < this.W - 12 ? ahead : this.x + BOAT_W / 2 - this.dir * (24 + Math.random() * 20);
    this.fish = { x: Math.max(4, Math.min(x, this.W - 12)), dir: Math.random() < 0.5 ? 1 : -1, k: 0 };
  }

  update(dt: number) {
    if (!this.W) return;
    const k = this.mood.kind;
    if (this.reduced) {
      this.settle();
      if (this.bell !== null && (this.bell += dt) > NOTE_SECONDS) this.bell = null;
      for (const b of this.fleet) if (b.bell !== null && (b.bell += dt) > NOTE_SECONDS) b.bell = null;
      return;
    }
    this.t += dt;
    if (this.bell !== null && (this.bell += dt) > NOTE_SECONDS) this.bell = null;
    this.updateFleet(dt);
    if (this.surprises.tick(dt, k, this.reduced, !!this.whale)) this.surprise();
    if (this.whale && ((this.whale.k += dt / WHALE_SECONDS) >= 1 || k !== "working")) this.whale = null;
    if (this.fish) {
      this.fish.k += dt / FISH_SECONDS;
      if (this.fish.k >= 1) this.fish = null;
    }
    const anchored = k === "waiting" || k === "rate";
    this.anchor = anchored ? Math.min(1, this.anchor + dt / ANCHOR_SECONDS) : 0;
    if (k !== "working") return;
    this.x += this.dir * DRIFT * dt;
    const max = this.W - BOAT_W - 4;
    if (this.x > max) { this.x = max; this.dir = -1; }
    if (this.x < 4) { this.x = 4; this.dir = 1; }
  }

  private updateFleet(dt: number) {
    for (const b of this.fleet) {
      if (b.bell !== null && (b.bell += dt) > NOTE_SECONDS) b.bell = null;
      if (b.leaving) {
        b.x += b.dir * 14 * dt;
        if (b.x < -SKIFF_W - 2 || b.x > this.W + 2) b.alpha = 0;
        else if (b.x < 2 || b.x > this.W - SKIFF_W - 2) b.alpha = Math.max(0, b.alpha - dt / 0.8);
        continue;
      }
      const entering = b.x < 4 || b.x > this.W - SKIFF_W - 4;
      if (b.kind !== "working" && !entering) continue;   // waiting, paused, failed: holding still
      b.x += b.dir * (entering ? 12 : b.speed) * dt;
      const max = this.W - SKIFF_W - 4;
      if (b.x > max && b.dir > 0) b.dir = -1;
      if (b.x < 4 && b.dir < 0) b.dir = 1;
    }
    this.fleet = this.fleet.filter((b) => b.alpha > 0);
  }

  private settle() {
    this.whale = null;
    this.fleet = this.fleet.filter((b) => !b.leaving);
    for (const b of this.fleet) b.x = Math.max(4, Math.min(b.x, this.W - SKIFF_W - 4));
    this.fish = null;
    this.anchor = this.mood.kind === "waiting" || this.mood.kind === "rate" ? 1 : 0;
  }

  draw(v: CanvasRenderingContext2D, view: DrawContext) {
    this.layout(view.width, view.scale ?? SCALE);
    this.scale = view.scale ?? SCALE;
    this.season = seasonOf(view.now);
    this.reduced = view.reducedMotion;
    if (this.reduced) this.settle();
    const P = PALETTES[view.theme];
    const W = this.W, k = this.mood.kind, t = this.t;
    const s3 = (view.scale ?? SCALE) * view.dpr;
    const px = (n: number) => Math.round(n * s3);
    const dot = (x: number, y: number, c: string) => { v.fillStyle = c; v.fillRect(px(x), px(y), s3, s3); };
    const blit = (c: HTMLCanvasElement, x: number, y: number) => v.drawImage(c, px(x), px(y), c.width * s3, c.height * s3);
    const pal = (flip = false) => sprite(BOAT, P, flip, "Ss");

    v.setTransform(1, 0, 0, 1, 0, 0);
    v.clearRect(0, 0, v.canvas.width, v.canvas.height);
    v.imageSmoothingEnabled = false;

    // The sun sets over a long run; stars come out at dusk.
    const e = evening(this.mood, view);
    skyTint(v, e, view.theme);
    const sunX = Math.round(W * 0.72);
    if (e > 0.05) {
      const sy = 1 + e * 12;
      const sun = sprite(SUN, { y: sunColor(e) });
      // Only the part above the waterline shows.
      const visible = Math.max(0, Math.min(sun.height, WATER - sy + 1));
      if (visible > 0) v.drawImage(sun, 0, 0, sun.width, visible, px(sunX), px(sy), sun.width * s3, visible * s3);
      // Its reflection fades as it goes under.
      const glow = visible / sun.height;
      for (let i = 0; i < 3 && glow > 0; i++) {
        const w = 4 - i, wob = this.reduced ? 0 : Math.sin(t * 2 + i) * 0.6;
        v.fillStyle = sunColor(e);
        v.globalAlpha = (0.6 - i * 0.15) * glow;
        v.fillRect(px(sunX + 3 - w / 2 + wob), px(WATER + 1 + i * 2), w * s3, s3);
      }
      v.globalAlpha = 1;
    }
    if (e > 0.75) for (const [x, y] of this.stars) dot(x, y, P.star!);

    // The rare whale: its back rises and blows, then slips under.
    if (this.whale && !this.reduced) {
      const { x, k: wk } = this.whale;
      const rise = Math.sin(Math.PI * Math.min(1, wk * 1.4)) * 5;
      const c = sprite(WHALE, P);
      const wy = WATER + 2 - rise;
      const rows = Math.max(0, Math.min(c.height, WATER + 1 - wy + 1));
      if (rows > 0) v.drawImage(c, 0, 0, c.width, rows, px(x), px(wy), c.width * s3, rows * s3);
      if (wk > 0.3 && wk < 0.75) {
        const sk = (wk - 0.3) / 0.45;
        v.fillStyle = P.ripple!;
        for (const [dx, h] of [[6, 1], [7, 0], [8, 1]]) v.fillRect(px(x + dx), px(wy - 2 - sk * 4 + h), s3, s3);
        if (sk > 0.5) { v.fillRect(px(x + 4), px(wy - 4), s3, s3); v.fillRect(px(x + 10), px(wy - 4), s3, s3); }
      }
      if (wk > 0.72) {   // the tail flicks up as it dives
        const tk = (wk - 0.72) / 0.28;
        const ty = WATER + 1 - Math.sin(Math.PI * tk) * 5;
        const tail = sprite(TAIL, P);
        const trows = Math.max(0, Math.min(tail.height, WATER + 1 - ty + 1));
        if (trows > 0) v.drawImage(tail, 0, 0, tail.width, trows, px(x + 12), px(ty), tail.width * s3, trows * s3);
      }
    }

    // Water: a rolling crest line with ripples drifting beneath it.
    const crest = (x: number) => WATER + Math.round(Math.sin(x * 0.35 + t * 1.6) * 0.55 + Math.sin(x * 0.11 - t * 0.9) * 0.5);
    v.fillStyle = P.water!;
    for (let x = 0; x < W; x++) v.fillRect(px(x), px(crest(x)), s3, s3);
    v.fillStyle = P.ripple!;
    for (let i = 0; i < W / 14; i++) {
      const row = WATER + 2 + (i % 3) * 1.5;
      const x = ((i * 53 + (i % 2 ? 1 : -1) * t * (2 + (i % 3))) % W + W) % W;
      v.fillRect(px(x), px(Math.round(row)), 3 * s3, s3);
    }

    // The anchor line and anchor, under the bow.
    const bob = this.reduced || k === "waiting" || k === "rate" ? 0 : Math.sin(t * 2.2) * 0.8;
    const boatY = WATER - 9 + bob;
    const bowX = this.x + (this.dir > 0 ? BOAT_W - 3 : 2);
    if (this.anchor > 0) {
      const depth = (H - 5 - (WATER + 1)) * this.anchor;
      v.fillStyle = P.a!;
      for (let y = WATER + 1; y < WATER + 1 + depth; y++) v.fillRect(px(bowX + 2), px(y), s3, s3);
      blit(sprite(ANCHOR, P), bowX, WATER + depth - 1);
    }

    blit(pal(this.dir < 0), this.x - 1, boatY - 1);

    // The fleet: one small boat per child thread, hull striped in its color.
    for (const b of this.fleet) {
      const by = WATER - 6 + (this.reduced || b.kind !== "working" ? 0 : Math.sin(t * 2.4 + b.speed) * 0.6);
      v.globalAlpha = b.alpha;
      blit(sprite(SKIFF, { ...P, r: b.color }, b.dir < 0, "Ss"), b.x - 1, by - 1);
      v.globalAlpha = 1;
      if (!b.leaving) crewMarker(v, view, b.kind, b.x + 4, by - 6, t);
      if (b.bell !== null) this.drawBell(v, view, b.x + 2, by - 3, b.bell / NOTE_SECONDS);
    }

    // The lantern at the masthead: blinks while waiting on you.
    const mastX = this.x + 7;
    if (k === "waiting") {
      const on = this.reduced ? 1 : 0.5 + 0.5 * Math.sin(t * Math.PI * 1.6);
      v.fillStyle = P.lamp!;
      v.globalAlpha = 0.18 * on;
      v.fillRect(px(mastX - 2), px(boatY - 3), 5 * s3, 5 * s3);
      v.globalAlpha = 0.35 * on;
      v.fillRect(px(mastX - 1), px(boatY - 2), 3 * s3, 3 * s3);
      v.globalAlpha = 0.5 + 0.5 * on;
      v.fillRect(px(mastX), px(boatY - 1), s3, s3);
      v.fillRect(px(mastX), px(boatY - 2), s3, s3);
      v.globalAlpha = 1;
    }

    // A fish leaping clear of the water, with a splash at each end.
    if (this.fish) {
      const f = this.fish, fx = f.x + f.dir * 10 * f.k;
      const fy = WATER + 1 - Math.sin(Math.PI * f.k) * FISH_HEIGHT;
      blit(sprite(FISH, P, f.dir < 0), fx - 1, fy - 3);
      for (const [edge, at] of [[0, f.x], [1, f.x + f.dir * 10]] as const) {
        const near = Math.abs(f.k - edge);
        if (near > 0.18) continue;
        v.globalAlpha = 1 - near / 0.18;
        for (const [dx, dy] of [[-1, -1], [1, -2], [3, -1], [5, -2]]) dot(at + dx, WATER + dy, P.ripple!);
        v.globalAlpha = 1;
      }
    }

    this.drawSeason(v, view, crest);
    if (this.bell !== null) this.drawBell(v, view, this.x + 5, boatY - 2, this.bell / NOTE_SECONDS);
    overflowLabel(v, view, this.fleetExtra, W - 2);
    if (k === "error") rainCloud(v, view, this.x + 1, t);
    if (k === "rate") {
      const boatLeft = this.x + BOAT_W / 2 < W / 2;
      rateSign(v, view, this.mood, boatLeft ? W - 4 : 4, boatLeft ? "right" : "left");
    }
  }

  focusX() { return (this.x + BOAT_W / 2) * this.scale; }

  motion(): Motion {
    if (this.bell !== null || this.fleet.some((b) => b.bell !== null)) return this.reduced ? "slow" : "fast";
    if (this.reduced) return "still";
    const k = this.mood.kind;
    if (k === "working" || this.fish || this.whale || this.bell !== null) return "fast";
    if ((k === "waiting" || k === "rate") && this.anchor < 1) return "fast";
    if (this.fleet.some((b) => b.leaving || b.bell !== null || b.kind === "working" || b.x < 4 || b.x > this.W - SKIFF_W - 4)) return "fast";
    // The water keeps rolling, the lantern blinks, the rain falls: gentle.
    return k === "idle" ? "still" : "slow";
  }

  /** A tap on a boat: a small bell and a note float up. Silent. */
  private drawBell(v: CanvasRenderingContext2D, view: DrawContext, x: number, y: number, k: number) {
    const s = (view.scale ?? SCALE) * view.dpr;
    const rise = view.reducedMotion ? 0 : k * 3;
    const c = sprite(BELL, PALETTES[view.theme]);
    v.globalAlpha = Math.max(0, 1 - Math.max(0, k - 0.6) / 0.4);
    v.drawImage(c, Math.round(x * s), Math.round((y - 5 - rise) * s), c.width * s, c.height * s);
    v.globalAlpha = 1;
    floatNote(v, view, "♪", x + 8, y - 1, k);
  }

  /** One quiet touch per season: snow, petals, a gull, or floating leaves. */
  private drawSeason(v: CanvasRenderingContext2D, view: DrawContext, crest: (x: number) => number) {
    const { W, t, season, reduced } = this;
    const s = (view.scale ?? SCALE) * view.dpr;
    const px = (n: number) => Math.round(n * s);
    if (season === "winter") snowfall(v, view, W, t, 6, WATER);
    if (season === "spring" || season === "autumn") {
      const colors = season === "spring" ? ["#f2a7c3", "#f7c6d8"] : ["#d9772b", "#c8a03a"];
      for (let i = 0; i < 3; i++) {
        const x = (i * 71 + 23 + (reduced ? 0 : t * 1.5)) % W;
        v.fillStyle = colors[i % 2];
        v.fillRect(px(x), px(crest(Math.floor(x)) - 1), (season === "autumn" ? 2 : 1) * s, s);
      }
    }
    if (season === "summer") {
      const gx = reduced ? W * 0.3 : ((t * 5) % (W + 10)) - 5;
      const flap = reduced || Math.floor(t * 3) % 3 !== 0;
      v.fillStyle = view.muted;
      v.fillRect(px(gx), px(flap ? 3 : 2), s, s); v.fillRect(px(gx + 1), px(flap ? 2 : 3), s, s);
      v.fillRect(px(gx + 2), px(flap ? 3 : 2), s, s);
    }
  }
}

export const sea: Scene = { id: "sea", name: "Sea", height: H * SCALE, create: () => new Sea() };
