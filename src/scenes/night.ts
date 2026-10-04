// The Night sky: twinkling stars over a quiet line of hills.
import { crewColor, type CrewMember } from "../crew";
import type { Mood, MoodKind } from "../mood";
import type { DrawContext, Hit, Scene, SceneInstance, ThemeMode } from "./types";
import {
  CLOUD, CLOUD_COLORS, H, LayerCache, SCALE, SNOW, STEP_DEBOUNCE, SurpriseClock, crewMarker, evening, glow, overflowLabel, skyGlow, skyLayer, type Motion,
  rainCloud, rateSign, seasonOf, seeded, snowfall, sprite, type Season, type Sprite,
} from "./common";

const STAR_DRIFT = 0.6;    // the sky turns this many art px per second
const STREAK_SECONDS = 0.55;
const STREAK_SPEED = 70;   // art px per second
const TWINKLE_SECONDS = 0.9;
const COMET_SECONDS = 6;
/** Where crew stars sit, as fractions of the width, and their rows. */
const CREW_SLOTS: [number, number][] = [[0.1, 3], [0.24, 6], [0.38, 2], [0.52, 5], [0.64, 3], [0.92, 4]];
const MOON_X = 0.78;

const MOON: Sprite = ["..mmm..", ".mmmm..", "mmm....", "mmm....", "mmm....", ".mmmm..", "..mmm.."];
const PINE: Sprite = ["..t..", ".ttt.", "ttttt", ".ttt.", "ttttt", "..t.."];

export const PALETTES: Record<ThemeMode, { star: string; moon: string; hill: string; wash: string; m: string; t: string }> = {
  light: { star: "#6f66b8", moon: "#d9a93a", hill: "#c9cddb", wash: "rgba(110,100,200,0.10)", m: "#d9a93a", t: "#b8bdcd" },
  dark: { star: "#e8e2ff", moon: "#f3e2a0", hill: "#2a2f3e", wash: "rgba(70,80,160,0.16)", m: "#f3e2a0", t: "#232838" },
};

interface Star { x: number; y: number; big: boolean; speed: number; phase: number }
interface Streak { x: number; y: number; k: number }
/** A child thread, shown as a bright star in its own color. */
interface CrewStar { id: string; kind: MoodKind; color: string; slot: number; alpha: number; leaving: boolean; twinkle: number | null }

export class Night implements SceneInstance {
  private W = 0;
  private t = 0;
  private drift = 0;
  private mood: Mood = { kind: "idle", turnStartedAt: null, resetsAt: null, since: 0 };
  private stars: Star[] = [];
  private hills: number[] = [];
  private pines: number[] = [];
  private streak: Streak | null = null;
  private lastStreak = -99;
  private reduced = false;
  private startPending = true;
  private crew: CrewStar[] = [];
  private crewExtra = 0;
  private lastCrew: readonly CrewMember[] = [];
  private seats = 6;
  private twinkles = new Map<Star, number>();
  private comet: number | null = null;
  private surprises = new SurpriseClock();
  private scale = SCALE;
  private season: Season = seasonOf(Date.now());
  private moonY = 5;
  private horizon = new LayerCache();

  layout(cssWidth: number, scale = SCALE) {
    const W = Math.max(60, Math.floor(cssWidth / scale));
    if (W === this.W) return;
    this.W = W;
    const rnd = seeded(W * 7 + 3);
    this.stars = Array.from({ length: Math.floor(W / 7) }, () => ({
      x: rnd() * W, y: Math.floor(rnd() * 10), big: rnd() < 0.12, speed: 0.8 + rnd() * 1.6, phase: rnd() * 6.3,
    }));
    this.hills = Array.from({ length: W }, (_, x) => 13 + Math.round(Math.sin(x * 0.045) * 1.3 + Math.sin(x * 0.13 + 1) * 0.6));
    this.pines = [0.12, 0.31, 0.36, 0.58, 0.86].map((f) => Math.floor(f * W)).filter((x) => x < W - 6);
    if (this.startPending) this.start();
    // A narrower or wider strip has fewer or more places for crew stars: seat them again.
    if (this.maxCrew() !== this.seats) {
      this.seats = this.maxCrew();
      this.crew = this.crew.filter((c) => c.slot < this.seats);
      this.setCrew(this.lastCrew);
    }
  }

  setMood(mood: Mood) {
    const was = this.mood.kind;
    this.mood = mood;
    if (mood.kind === was) return;
    if (mood.kind === "working" && was !== "waiting") this.startPending = true;
    if (this.W && this.startPending) this.start();
  }

  private maxCrew() { return this.W && this.W < 130 ? 3 : 6; }
  private slotXY(slot: number): [number, number] {
    const slots: readonly [number, number][] = this.maxCrew() === 3 ? [[0.12, 3], [0.42, 5], [0.92, 3]] : CREW_SLOTS;
    const [fx, y] = slots[Math.min(slot, slots.length - 1)];
    return [Math.floor(fx * this.W), y];
  }

  setCrew(list: readonly CrewMember[]) {
    this.lastCrew = list;
    const ids = new Set(list.map((m) => m.id));
    for (const c of this.crew) if (!ids.has(c.id)) c.leaving = true;   // finished: fade out
    const taken = new Set(this.crew.filter((c) => !c.leaving).map((c) => c.slot));
    let shown = taken.size;
    for (const m of list) {
      const have = this.crew.find((c) => c.id === m.id && !c.leaving);
      if (have) { have.kind = m.kind; continue; }
      if (shown >= this.maxCrew()) continue;
      let slot = 0;
      while (taken.has(slot) || this.crew.some((c) => c.slot === slot)) slot++;
      if (slot >= this.maxCrew()) continue;
      taken.add(slot); shown++;
      this.crew.push({ id: m.id, kind: m.kind, color: crewColor(m.id), slot, alpha: this.reduced ? 1 : 0, leaving: false, twinkle: null });
    }
    this.crewExtra = Math.max(0, list.length - shown);
  }

  hit(x: number, y: number): Hit | null {
    const sc = this.scale, ax = x / sc, ay = y / sc;
    const mx = Math.round(this.W * MOON_X);
    if (ax >= mx - 1 && ax <= mx + 8 && ay >= this.moonY - 1 && ay <= this.moonY + 8) {
      return { target: "lead", x: (mx + 3.5) * sc, y: this.moonY * sc };
    }
    for (const c of this.crew) {
      const [cx, cy] = this.slotXY(c.slot);
      if (!c.leaving && Math.abs(ax - cx) <= 3 && Math.abs(ay - cy) <= 3) return { target: "member", id: c.id, x: (cx + 0.5) * sc, y: (cy - 1) * sc };
    }
    let best: Star | null = null, bestD = 9;
    for (const s of this.stars) {
      const d = (this.starX(s) - ax) ** 2 + (s.y - ay) ** 2;
      if (d < bestD) { best = s; bestD = d; }
    }
    return best ? { target: "flock", id: String(this.stars.indexOf(best)), x: (this.starX(best) + 0.5) * sc, y: (best.y - 1) * sc } : null;
  }

  poke(hit: Hit) {
    if (hit.target === "member") { const c = this.crew.find((o) => o.id === hit.id); if (c) c.twinkle = 0; }
    if (hit.target === "flock") { const s = this.stars[Number(hit.id)]; if (s) this.twinkles.set(s, 0); }
  }

  surprise() { if (this.W && this.comet === null) this.comet = 0; }

  /** A new run opens with a shooting star already crossing the sky. */
  private start() {
    this.startPending = false;
    this.lastStreak = -99;
    if (this.mood.kind === "working") this.shoot();
  }

  step() {
    if (this.mood.kind !== "working" || this.t - this.lastStreak < STEP_DEBOUNCE || !this.W) return;
    this.shoot();
  }

  private shoot() {
    if (this.streak) return;
    this.lastStreak = this.t;
    this.streak = { x: 4 + Math.random() * this.W * 0.6, y: 1 + Math.random() * 3, k: 0 };
  }

  update(dt: number) {
    if (!this.W) return;
    for (const [s, k] of this.twinkles) { if (k + dt > TWINKLE_SECONDS) this.twinkles.delete(s); else this.twinkles.set(s, k + dt); }
    for (const c of this.crew) if (c.twinkle !== null && (c.twinkle += dt) > TWINKLE_SECONDS) c.twinkle = null;
    if (this.reduced) { this.streak = null; this.comet = null; this.settleCrew(); return; }
    this.t += dt;
    for (const c of this.crew) c.alpha = c.leaving ? c.alpha - dt / 1.5 : Math.min(1, c.alpha + dt);
    this.crew = this.crew.filter((c) => c.alpha > 0 || !c.leaving);
    if (this.surprises.tick(dt, this.mood.kind, this.reduced, this.comet !== null)) this.surprise();
    if (this.comet !== null && ((this.comet += dt / COMET_SECONDS) >= 1 || this.mood.kind !== "working")) this.comet = null;
    if (this.streak) {
      this.streak.k += dt / STREAK_SECONDS;
      if (this.streak.k >= 1) this.streak = null;
    }
    // Waiting on you: the sky holds still.
    if (this.mood.kind !== "waiting") this.drift += STAR_DRIFT * dt;
  }

  private settleCrew() {
    this.crew = this.crew.filter((c) => !c.leaving);
    for (const c of this.crew) c.alpha = 1;
  }

  /** The star that glows while waiting: the brightest near the middle. */
  private beacon(): Star | undefined {
    const mid = this.W / 2;
    const near = (list: Star[]) =>
      list.sort((a, b) => Math.abs(this.starX(a) - mid) - Math.abs(this.starX(b) - mid))[0];
    const band = this.stars.filter((s) => s.y >= 2 && s.y <= 7);
    return near(band.filter((s) => s.big)) ?? near(band);
  }
  private starX(s: Star) { return ((s.x - this.drift) % this.W + this.W) % this.W; }

  draw(v: CanvasRenderingContext2D, view: DrawContext) {
    this.layout(view.width, view.scale ?? SCALE);
    this.scale = view.scale ?? SCALE;
    this.season = seasonOf(view.now);
    this.reduced = view.reducedMotion;
    if (this.reduced) { this.streak = null; this.comet = null; this.settleCrew(); }
    const P = PALETTES[view.theme];
    const W = this.W, k = this.mood.kind, t = this.t;
    const s3 = (view.scale ?? SCALE) * view.dpr;
    const px = (n: number) => Math.round(n * s3);
    const dot = (x: number, y: number) => v.fillRect(px(x), px(y), s3, s3);
    const blit = (c: HTMLCanvasElement, x: number, y: number) => v.drawImage(c, px(x), px(y), c.width * s3, c.height * s3);

    v.setTransform(1, 0, 0, 1, 0, 0);
    v.clearRect(0, 0, v.canvas.width, v.canvas.height);
    v.imageSmoothingEnabled = false;
    if (this.season === "spring" && skyGlow(1, view.theme)) skyLayer([330, 70, 78, 0.05]);   // a faint pink tint
    // Always night here: the faint night glow over the hills.
    const glowColor = skyGlow(1, view.theme);
    if (glowColor) skyLayer(glowColor);

    // Stars twinkle and the sky turns slowly. Waiting: everything holds, and
    // one star glows. Rate-limited: clouds roll in and the stars dim.
    const still = this.reduced || k === "waiting";
    const dim = k === "rate" ? 0.3 : 1;
    const beacon = k === "waiting" ? this.beacon() : undefined;
    v.fillStyle = P.star;
    for (const s of this.stars) {
      if (s === beacon) continue;
      const x = this.starX(s);
      v.globalAlpha = dim * (still ? 0.8 : 0.55 + 0.45 * Math.sin(t * s.speed + s.phase));
      dot(x, s.y);
      if (s.big) { v.globalAlpha *= 0.5; dot(x - 1, s.y); dot(x + 1, s.y); dot(x, s.y - 1); dot(x, s.y + 1); }
    }
    v.globalAlpha = 1;
    for (const [s, tk] of this.twinkles) this.sparkle(v, view, P.star, this.starX(s), s.y, tk / TWINKLE_SECONDS);

    // The crew: bright stars in their own colors, fading in and out.
    for (const c of this.crew) {
      const [x, y] = this.slotXY(c.slot);
      const pulse = this.reduced || c.kind !== "working" ? 1 : 0.8 + 0.2 * Math.sin(t * 1.6 + c.slot);
      glow(v, view, x, y, 3, c.color, Math.max(0, c.alpha) * 0.5);
      v.globalAlpha = Math.max(0, c.alpha) * pulse;
      v.fillStyle = P.star;
      dot(x - 1, y); dot(x + 1, y); dot(x, y - 1); dot(x, y + 1);
      v.fillStyle = c.color;
      dot(x, y);
      v.globalAlpha = 1;
      if (c.twinkle !== null) this.sparkle(v, view, c.color, x, y, c.twinkle / TWINKLE_SECONDS);
      if (!c.leaving) crewMarker(v, view, c.kind, x + 3, y - 2, t);
    }
    if (beacon) {
      const x = this.starX(beacon), y = beacon.y;
      const pulse = this.reduced ? 1 : 0.6 + 0.4 * Math.sin(t * 2.4);
      glow(v, view, x, y, 4, P.star, 0.45 * pulse);
      v.fillStyle = P.star;
      dot(x, y); dot(x - 1, y); dot(x + 1, y); dot(x, y - 1); dot(x, y + 1);
      v.globalAlpha = 0.6 * pulse;
      dot(x - 2, y); dot(x + 2, y); dot(x, y - 2); dot(x, y + 2);
      v.globalAlpha = 1;
    }

    // A shooting star with a fading tail.
    if (this.streak) {
      const s = this.streak, travel = STREAK_SPEED * STREAK_SECONDS * s.k;
      for (let i = 0; i < 7; i++) {
        const back = travel - i * 1.6;
        if (back < 0) break;
        v.globalAlpha = (1 - i / 7) * (1 - Math.max(0, s.k - 0.7) / 0.3);
        dot(s.x + back, s.y + back * 0.35);
      }
      v.globalAlpha = 1;
    }

    // The rare comet: a slow head with a long tail across the top.
    if (this.comet !== null && !this.reduced) {
      const hx = -10 + this.comet * (W + 30), hy = 1.5 + this.comet * 3;
      for (let i = 0; i < 16; i++) {
        v.globalAlpha = (1 - i / 16) * 0.9;
        v.fillStyle = i < 2 ? P.star : P.m;
        dot(hx - i, hy - i * 0.18);
      }
      v.globalAlpha = 1;
    }

    // The moon follows the local time and climbs on a long run, rising from
    // behind the hills. An autumn moon is a warm harvest moon.
    const e = evening(this.mood, view);
    this.moonY = 6 - e * 5.5;
    const harvest = this.season === "autumn";
    const moonColor = harvest ? (view.theme === "dark" ? "#f0b05a" : "#e09a3a") : P.m;
    const mx = Math.round(W * MOON_X);
    if (harvest) glow(v, view, mx + 3, this.moonY + 3, 6, moonColor, 0.35);
    blit(sprite(MOON, { m: moonColor }), mx, this.moonY - 1);

    // The horizon: hills and a few pines, drawn over the rising moon.
    // Cached: it only changes with the size, theme, or scale.
    const horizon = this.horizon.get(`${W}:${view.theme}:${s3}`, v.canvas.width, v.canvas.height, (h) => {
      h.fillStyle = P.hill;
      for (let x = 0; x < W; x++) h.fillRect(px(x), px(this.hills[x]), s3, (H - this.hills[x]) * s3);
      for (const x of this.pines) { const c = sprite(PINE, { t: P.hill }); h.drawImage(c, px(x - 1), px(this.hills[x + 2] - 6), c.width * s3, c.height * s3); }
    });
    v.drawImage(horizon, 0, 0);
    if (this.season === "winter") {
      v.fillStyle = SNOW[view.theme];
      for (const x of this.pines) { dot(x + 2, this.hills[x + 2] - 6); dot(x + 1, this.hills[x + 2] - 4); dot(x + 3, this.hills[x + 2] - 4); }
      snowfall(v, view, W, t, 6, 12);
    }
    if (this.season === "summer") {   // a few fireflies over the hills
      const rnd = seeded(W + 91);
      v.fillStyle = view.theme === "dark" ? "#d7f27a" : "#8fb33a";
      for (let i = 0; i < 4; i++) {
        const fx = rnd() * W, fy = 9 + rnd() * 2, ph = rnd() * 6.3;
        v.globalAlpha = this.reduced ? 0.8 : Math.max(0, Math.sin(t * 1.3 + ph));
        dot(fx + (this.reduced ? 0 : Math.sin(t * 0.7 + ph) * 2), fy);
      }
      v.globalAlpha = 1;
    }
    overflowLabel(v, view, this.crewExtra, W - 2);

    if (k === "rate") {
      const c = sprite(CLOUD, { g: CLOUD_COLORS[view.theme].g });
      const roll = this.reduced ? 0 : t * 1.2;
      for (const [i, base] of [0.08, 0.38, 0.66].entries()) {
        const x = ((base * W + roll * (1 + i * 0.3)) % (W + 14)) - 14;
        v.globalAlpha = 0.85;
        blit(c, x, 1 + (i % 2) * 2);
      }
      v.globalAlpha = 1;
      rateSign(v, view, this.mood, W - 4);
    }
    if (k === "error") rainCloud(v, view, W / 2 - 6, t);
  }

  focusX() { return (Math.round(this.W * MOON_X) + 3.5) * this.scale; }

  motion(): Motion {
    const k = this.mood.kind;
    if (this.twinkles.size > 0 || this.crew.some((c) => c.twinkle !== null)) return this.reduced ? "slow" : "fast";
    if (this.reduced) return "still";
    // A shooting star, comet, tapped star, or crew fading in or out moves fast.
    if (this.streak || this.comet !== null || this.twinkles.size > 0 || this.crew.some((c) => c.twinkle !== null || c.alpha < 1)) return "fast";
    // Twinkling, drifting, a glowing star, rain, clouds: gentle changes.
    return k === "idle" ? "still" : "slow";
  }

  /** A tapped star flares: its arms stretch out, then settle. */
  private sparkle(v: CanvasRenderingContext2D, view: DrawContext, color: string, x: number, y: number, k: number) {
    const s = (view.scale ?? SCALE) * view.dpr;
    const reach = view.reducedMotion ? 2 : 1 + Math.round(Math.sin(Math.PI * k) * 3);
    v.fillStyle = color;
    for (let i = 1; i <= reach; i++) {
      v.globalAlpha = (1 - i / (reach + 1)) * (view.reducedMotion ? 1 : 1 - k * 0.5);
      for (const [dx, dy] of [[i, 0], [-i, 0], [0, i], [0, -i]]) v.fillRect(Math.round((x + dx) * s), Math.round((y + dy) * s), s, s);
    }
    v.globalAlpha = 1;
  }
}

export const night: Scene = { id: "night", name: "Night sky", height: H * SCALE, create: () => new Night() };
