// The scene kit's engine. It runs everything every scene shares, so a scene
// module only declares its art and what happens in each moment:
//
// - the mood, and starting each new run mid-action
// - the crew roster: who joins, who leaves, the cap, and "+N"
// - steps, at most one reaction every STEP_DEBOUNCE seconds
// - rare surprises, scheduled by one shared clock
// - little gags while working, on a per-thread clock that rotates them
// - tap reactions and their timers
// - reduced motion: a still picture for each moment
// - hit-testing for tooltips and taps
// - cached layers, the frame, the sky glow, and the error and rate overlays
// - how often the scene needs a frame
//
// A scene supplies its own update and draw hooks for anything the kit does
// not cover (water shimmer, a sheep hopping a stile, firelight). When two or
// more scenes need the same behavior, it moves into the kit.
import { crewColor, type CrewMember } from "../crew";
import type { Mood, MoodKind } from "../mood";
import {
  GagClock, LayerCache, SCALE, STEP_DEBOUNCE, SurpriseClock, crewMarker, evening, floatNote, glow, overflowLabel, rainCloud, rateSign,
  seasonOf, seeded, skyTint, type Motion, type Season,
} from "./common";
import { AMBER, TIME } from "./style";
import type { AlertSpec } from "./alert";
import type { DrawContext, GagTimer, Hit, Scene, SceneInstance, SurpriseTimer, ThemeMode } from "./types";

/** One crew member as the kit tracks it, plus the scene's own fields. */
export interface CrewBase {
  id: string;
  kind: MoodKind;
  /** The member's tag color. */
  color: string;
  /** Finished: on its way out of the scene. */
  leaving: boolean;
  /** Fades out (and, for some scenes, in). Removed once a leaving member reaches 0. */
  alpha: number;
}
export type Member<C> = CrewBase & C;

/**
 * A little comedic gag: a 2 to 4 second beat that plays now and then while
 * the agent works. The kit schedules it, ends it the moment the mood leaves
 * "working", never plays it with reduced motion, and draws the crew's
 * markers on top of it. A scene can also ask `k.gagging(id)` in its own
 * update and draw to change what its characters do while it plays.
 */
export interface GagSpec<S, C = object> {
  id: string;
  /** How long it lasts, 2 to 4 seconds. */
  seconds: number;
  /** Whether it can play right now (say, it needs the flowerpot in view). */
  ready?(s: S, k: Kit<S, C>): boolean;
  start?(s: S, k: Kit<S, C>): void;
  /** Each frame while it plays; `p` runs from 0 to 1. */
  update?(s: S, k: Kit<S, C>, dt: number, p: number): void;
  /** Draws on top of the scene (and under the crew's markers). */
  draw?(s: S, k: Kit<S, C>, p: number): void;
  /** It finished, or was cut short: put things back. */
  end?(s: S, k: Kit<S, C>): void;
}

/** Something a tap or a hover can land on, in art pixels. */
export type HitTarget =
  | { target: Hit["target"]; id?: string; box: [x: number, y: number, w: number, h: number]; at: [x: number, y: number] }
  /** The nearest of these within `r` art px wins, after every box has been tried. */
  | { target: Hit["target"]; id?: string; near: [x: number, y: number]; r: number; at: [x: number, y: number] };

/**
 * A scene module. `S` is the scene's own state (positions, timers); `C` is
 * what it keeps per crew member. Every hook receives the state and the kit.
 */
export interface SceneSpec<S, C = object> {
  id: string;
  name: string;
  /** The scene's starting state. */
  state(): S;
  /** Fit the scene to a strip `k.W` art pixels wide. `prevW` is 0 the first time. */
  layout?(s: S, k: Kit<S, C>, prevW: number): void;
  /** Runs right after a new run starts (after `layout` when the width is new). */
  afterLayout?(s: S, k: Kit<S, C>): void;
  /** A new run begins: set the scene up mid-action, because most runs are short. */
  start?(s: S, k: Kit<S, C>): void;
  /** The mood changed; `was` is the previous kind. Runs before `start`. */
  mood?(s: S, k: Kit<S, C>, was: MoodKind): void;

  /** Where the lead character is, in art px from the left (for the sky glow). */
  focus(s: S, k: Kit<S, C>): number;

  crew: {
    /** How many members fit on a strip this wide. */
    max(k: Kit<S, C>): number;
    /** A member joins: return its scene fields, or null when there is no room. `shown` counts it. */
    join(s: S, k: Kit<S, C>, m: CrewMember, shown: number): (C & Partial<CrewBase>) | null;
    /** A member finished and is leaving (`leaving` is already set). */
    leave?(s: S, k: Kit<S, C>, c: Member<C>): void;
  };

  /** A step happened while working: react, and return true if the scene reacted. */
  step(s: S, k: Kit<S, C>): boolean;

  surprise: {
    /** True while a surprise is playing. */
    active(s: S): boolean;
    /** Start the surprise. */
    start(s: S, k: Kit<S, C>): void;
  };

  /** The scene's little gags (three, by the house style). */
  gags?: GagSpec<S, C>[];

  /** What can be hovered or tapped right now. */
  hits(s: S, k: Kit<S, C>): HitTarget[];
  /** A tap landed on `hit`: start its reaction (see `k.react`). */
  tap(s: S, k: Kit<S, C>, hit: Hit): void;

  /** Where the error's rain cloud sits, in art px. */
  errorCloudX(s: S, k: Kit<S, C>): number;

  /** The sky glow. Default: the time of day's glow. */
  sky?(s: S, k: Kit<S, C>): void;
  /** Advance the scene's own motion by `dt` seconds (not called with reduced motion). */
  update(s: S, k: Kit<S, C>, dt: number): void;
  /** Reduced motion: jump straight to the still picture for the mood. */
  settle(s: S, k: Kit<S, C>): void;
  /** Draw the scene. The kit then adds "+N", the rain cloud, and the rate sign. */
  draw(s: S, k: Kit<S, C>): void;
  /** How often the scene needs a frame (taps and reduced motion are already handled). */
  motion(s: S, k: Kit<S, C>): Motion;

  /** The helper alert: this scene's half-height mini scene. */
  alert: AlertSpec;
}

/** What a scene's hooks can read and use. */
export interface Kit<S, C> {
  readonly W: number;
  /** A phone-width strip (under 130 art px). False until the width is known. */
  readonly narrow: boolean;
  readonly t: number;
  readonly mood: Mood;
  readonly scale: number;
  readonly season: Season;
  readonly reduced: boolean;
  /** The current crew, in join order. Hooks may filter or replace it. */
  crew: Member<C>[];
  readonly crewExtra: number;
  /** The last crew list the thread reported, for reseating after a resize. */
  readonly lastCrew: readonly CrewMember[];
  setCrew(list: readonly CrewMember[]): void;
  /** Ask for the scene to be set up afresh (as at a new run) once the layout is done. */
  requestStart(): void;
  /** Mark that the scene just reacted to a step (starts the debounce). */
  stepped(): void;

  /** Start a tap reaction on `key` lasting `seconds`. */
  react(key: unknown, seconds: number): void;
  /** Seconds into `key`'s reaction, or null. */
  reaction(key: unknown): number | null;
  /** Every running reaction, as [key, seconds]. */
  reactions(): IterableIterator<[unknown, number]>;
  /** While gag `id` plays, how far along it is (0 to 1); otherwise null. */
  gagging(id: string): number | null;
  /** The playing gag's id, or null. */
  readonly gagId: string | null;

  // Drawing, valid inside `draw`.
  readonly view: DrawContext;
  readonly theme: ThemeMode;
  readonly ctx: CanvasRenderingContext2D;
  /** Canvas pixels per art pixel. */
  readonly s3: number;
  /** Art px to canvas px, rounded. */
  px(n: number): number;
  /** Draw a sprite canvas (with its 1px border) at art px `x`,`y`. */
  blit(c: HTMLCanvasElement, x: number, y: number): void;
  /** Fill one art pixel. */
  dot(x: number, y: number, color?: string): void;
  /** Evening light: 0 day to 1 full dusk, from the clock and the run length. */
  evening(): number;
  /** A crew member's state marker: the waiting "!", the failed cloud, the paused bars. */
  marker(kind: string, x: number, y: number): void;
  /** A cached layer, redrawn only when `key` changes. */
  layer(name: string, key: string, w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void): HTMLCanvasElement;
  /**
   * The waiting signal, the same in every scene: a 2 x 2 amber light with a
   * soft glow at art px `x`,`y` (its top-left), next to the lead. It reads as
   * a still frame; only the glow breathes.
   */
  signal(x: number, y: number): void;
  /** While `key`'s tap reaction runs, float `text` ("♪ quack") up from `x`,`y`. */
  note(key: unknown, text: string, x: number, y: number, seconds?: number): void;
  /** A few fireflies blinking in rows `top` to `top + rows`, placed by `seed`. */
  fireflies(seed: number, count: number, top: number, rows: number): void;
}

const IDLE: Mood = { kind: "idle", turnStartedAt: null, resetsAt: null, since: 0 };

class KitScene<S, C> implements SceneInstance, Kit<S, C> {
  W = 0;
  t = 0;
  mood: Mood = IDLE;
  scale = SCALE;
  season: Season = seasonOf(Date.now());
  reduced = false;
  crew: Member<C>[] = [];
  crewExtra = 0;
  lastCrew: readonly CrewMember[] = [];
  view!: DrawContext;
  ctx!: CanvasRenderingContext2D;
  s3 = SCALE;
  private s: S;
  private startPending = true;
  private lastStep = -99;
  private taps = new Map<unknown, { t: number; dur: number }>();
  private surprises: SurpriseTimer;
  private gags: GagTimer;
  private playing: { gag: GagSpec<S, C>; t: number } | null = null;
  private markers: [kind: string, x: number, y: number][] = [];
  private signals: [x: number, y: number][] = [];
  private layers = new Map<string, LayerCache>();

  constructor(private spec: SceneSpec<S, C>, surprises?: SurpriseTimer, gags?: GagTimer) {
    this.s = spec.state();
    this.surprises = surprises ?? new SurpriseClock();
    this.gags = gags ?? new GagClock();
  }

  get theme() { return this.view.theme; }
  get narrow() { return this.W > 0 && this.W < 130; }
  /** The scene's own state, for tests and tools. */
  get state(): S { return this.s; }

  // -- The mood and runs ----------------------------------------------------

  setMood(mood: Mood) {
    const was = this.mood.kind;
    this.mood = mood;
    if (mood.kind === was) return;
    if (mood.kind !== "working") this.endGag();   // a gag never plays over waiting, an error, or a rest
    // A new run starts mid-scene; coming back from waiting on you is the same run.
    if (mood.kind === "working" && was !== "waiting") this.startPending = true;
    this.spec.mood?.(this.s, this, was);
    if (this.W && this.startPending) this.start();
  }

  private start() {
    this.startPending = false;
    this.lastStep = -99;
    this.spec.start?.(this.s, this);
  }

  /** Fit the scene to a strip `cssWidth` CSS px wide (draw does this too). */
  layout(cssWidth: number, scale = SCALE) {
    const W = Math.max(60, Math.floor(cssWidth / scale));
    if (W === this.W) return;
    const prev = this.W;
    this.W = W;
    this.spec.layout?.(this.s, this, prev);
    if (this.startPending) this.start();
    this.spec.afterLayout?.(this.s, this);
  }

  // -- The crew --------------------------------------------------------------

  setCrew(list: readonly CrewMember[]) {
    this.lastCrew = list;
    const ids = new Set(list.map((m) => m.id));
    for (const c of this.crew) if (!ids.has(c.id) && !c.leaving) {
      c.leaving = true;
      this.spec.crew.leave?.(this.s, this, c);
    }
    let shown = this.crew.filter((c) => !c.leaving).length;
    const max = this.spec.crew.max(this);
    for (const m of list) {
      const have = this.crew.find((c) => c.id === m.id && !c.leaving);
      if (have) { have.kind = m.kind; continue; }
      if (shown >= max) continue;
      const part = this.spec.crew.join(this.s, this, m, shown + 1);
      if (!part) continue;
      shown++;
      this.crew.push({ id: m.id, kind: m.kind, color: crewColor(m.id), leaving: false, alpha: 1, ...part } as Member<C>);
    }
    this.crewExtra = Math.max(0, list.length - shown);
  }

  // -- Steps, surprises, taps ---------------------------------------------

  step() {
    if (this.mood.kind !== "working" || this.t - this.lastStep < STEP_DEBOUNCE || !this.W) return;
    if (this.spec.step(this.s, this)) this.lastStep = this.t;
  }
  stepped() { this.lastStep = this.t; }
  requestStart() { this.startPending = true; }

  surprise() {
    if (this.W && !this.spec.surprise.active(this.s)) this.spec.surprise.start(this.s, this);
  }

  gagIds() { return (this.spec.gags ?? []).map((g) => g.id); }
  get gagId() { return this.playing?.gag.id ?? null; }
  gagging(id: string) { return this.playing?.gag.id === id ? Math.min(1, this.playing.t / this.playing.gag.seconds) : null; }
  gag(id?: string): boolean {
    const list = this.spec.gags ?? [];
    if (!this.W || this.mood.kind !== "working" || this.reduced || this.playing || list.length === 0) return false;
    if (id !== undefined) {
      const i = list.findIndex((g) => g.id === id);
      if (i < 0 || list[i].ready?.(this.s, this) === false) return false;
      this.gags.played(this.spec.id, i);
      return this.startGag(list[i]);
    }
    // The next in the rotation that can play now.
    for (let tries = 0; tries < list.length; tries++) {
      const g = list[this.gags.pick(this.spec.id, list.length)];
      if (g.ready?.(this.s, this) !== false) return this.startGag(g);
    }
    return false;
  }
  private startGag(gag: GagSpec<S, C>) {
    this.playing = { gag, t: 0 };
    gag.start?.(this.s, this);
    return true;
  }
  private endGag() {
    const p = this.playing;
    if (!p) return;
    this.playing = null;
    p.gag.end?.(this.s, this);
  }

  react(key: unknown, seconds: number) { this.taps.set(key, { t: 0, dur: seconds }); }
  reaction(key: unknown) { return this.taps.get(key)?.t ?? null; }
  *reactions(): IterableIterator<[unknown, number]> { for (const [k, r] of this.taps) yield [k, r.t]; }

  hit(x: number, y: number): Hit | null {
    const ax = x / this.scale, ay = y / this.scale;
    let best: Hit | null = null, bestD = Infinity;
    for (const h of this.spec.hits(this.s, this)) {
      const at = { target: h.target, ...(h.id === undefined ? {} : { id: h.id }), x: h.at[0] * this.scale, y: h.at[1] * this.scale };
      if ("box" in h) {
        const [bx, by, w, hh] = h.box;
        if (ax >= bx && ax <= bx + w && ay >= by && ay <= by + hh) return at;
      } else {
        const d = (h.near[0] - ax) ** 2 + (h.near[1] - ay) ** 2;
        if (d < h.r * h.r && d < bestD) { best = at; bestD = d; }
      }
    }
    return best;
  }

  poke(hit: Hit) { this.spec.tap(this.s, this, hit); }

  // -- Time -------------------------------------------------------------------

  update(dt: number) {
    if (!this.W) return;
    for (const [key, r] of this.taps) if ((r.t += dt) > r.dur) this.taps.delete(key);
    if (this.reduced) { this.endGag(); this.spec.settle(this.s, this); return; }
    this.t += dt;
    if (this.playing) {
      this.playing.t += dt;
      const p = this.playing;
      p.gag.update?.(this.s, this, dt, Math.min(1, p.t / p.gag.seconds));
      if (this.playing === p && p.t >= p.gag.seconds) this.endGag();
    }
    this.spec.update(this.s, this, dt);
    this.crew = this.crew.filter((c) => c.alpha > 0 || !c.leaving);
    const surprising = this.spec.surprise.active(this.s);
    if (this.surprises.tick(dt, this.mood.kind, this.reduced, surprising || this.playing !== null)) this.surprise();
    if (this.gags.tick(dt, this.mood.kind, this.reduced, surprising || this.playing !== null)) this.gag();
  }

  motion(): Motion {
    // A tap's reaction shows (and fades) even with reduced motion.
    if (this.taps.size > 0) return this.reduced ? "slow" : "fast";
    if (this.reduced) return "still";
    if (this.playing) return "fast";
    return this.spec.motion(this.s, this);
  }

  focusX() { return this.spec.focus(this.s, this) * this.scale; }

  // -- Drawing -------------------------------------------------------------

  draw(ctx: CanvasRenderingContext2D, view: DrawContext) {
    this.layout(view.width, view.scale ?? SCALE);
    this.scale = view.scale ?? SCALE;
    this.season = seasonOf(view.now);
    this.reduced = view.reducedMotion;
    this.view = view;
    this.ctx = ctx;
    this.s3 = (view.scale ?? SCALE) * view.dpr;
    if (this.reduced) { this.endGag(); this.spec.settle(this.s, this); }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    ctx.imageSmoothingEnabled = false;
    if (this.spec.sky) this.spec.sky(this.s, this);
    else skyTint(ctx, this.evening(), view.theme);
    this.markers = [];
    this.signals = [];
    this.spec.draw(this.s, this);
    if (this.playing) this.playing.gag.draw?.(this.s, this, Math.min(1, this.playing.t / this.playing.gag.seconds));
    // The waiting signal and the crew's markers go on last, so nothing (a
    // character walking past, a gag) ever covers them.
    ctx.globalAlpha = 1;
    for (const [x, y] of this.signals) this.paintSignal(x, y);
    for (const [kind, x, y] of this.markers) crewMarker(ctx, view, kind, x, y, this.t);
    overflowLabel(ctx, view, this.crewExtra, this.W - 2);
    const k = this.mood.kind;
    if (k === "error") rainCloud(ctx, view, this.spec.errorCloudX(this.s, this), this.t);
    if (k === "rate") rateSign(ctx, view, this.mood);
  }

  px(n: number) { return Math.round(n * this.s3); }
  blit(c: HTMLCanvasElement, x: number, y: number) { this.ctx.drawImage(c, this.px(x), this.px(y), c.width * this.s3, c.height * this.s3); }
  dot(x: number, y: number, color?: string) {
    if (color) this.ctx.fillStyle = color;
    this.ctx.fillRect(this.px(x), this.px(y), this.s3, this.s3);
  }
  evening() { return evening(this.mood, this.view); }
  marker(kind: string, x: number, y: number) { this.markers.push([kind, x, y]); }
  signal(x: number, y: number) { this.signals.push([x, y]); }
  private paintSignal(x: number, y: number) {
    const breathe = this.reduced ? 0.85 : 0.65 + 0.3 * Math.sin(this.t * Math.PI * 1.2);
    glow(this.ctx, this.view, x + 0.5, y + 0.5, 4, AMBER, breathe);
    this.ctx.fillStyle = AMBER;
    this.ctx.fillRect(this.px(x), this.px(y), 2 * this.s3, 2 * this.s3);
  }
  note(key: unknown, text: string, x: number, y: number, seconds = TIME.tap) {
    const r = this.reaction(key);
    if (r !== null) floatNote(this.ctx, this.view, text, x, y, r / seconds);
  }
  fireflies(seed: number, count: number, top: number, rows: number) {
    const v = this.ctx, rnd = seeded(this.W + seed);
    v.fillStyle = this.theme === "dark" ? "#d7f27a" : "#8fb33a";
    for (let i = 0; i < count; i++) {
      const fx = rnd() * this.W, fy = top + rnd() * rows, ph = rnd() * 6.3;
      v.globalAlpha = this.reduced ? 0.8 : Math.max(0, Math.sin(this.t * 1.3 + ph));
      this.dot(fx + (this.reduced ? 0 : Math.sin(this.t * 0.6 + ph) * 2), fy);
    }
    v.globalAlpha = 1;
  }
  layer(name: string, key: string, w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void) {
    let cache = this.layers.get(name);
    if (!cache) this.layers.set(name, (cache = new LayerCache()));
    return cache.get(key, w, h, draw);
  }
}

/** Turn a scene module into a scene the app can show. */
export function defineScene<S, C = object>(spec: SceneSpec<S, C>): Scene & { spec: SceneSpec<S, C> } {
  return { id: spec.id, name: spec.name, height: 16 * SCALE, create: (opts) => new KitScene(spec, opts?.surprises, opts?.gags), alert: spec.alert, spec };
}
