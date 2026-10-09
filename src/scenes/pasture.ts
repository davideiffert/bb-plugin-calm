// The Pasture: a sheepdog and its flock above the prompt box.
//
// Gags: a sheep gets stuck on the stile and the dog nudges it over; a sheep
// sneezes and topples, then gets back up; the dog chases its own tail.
// At rest between runs (scenes shown always): the flock stands and grazes
// where it is, and the dog lies down.
//
// The simulation runs in art pixels and seconds. Sprites are drawn at a
// whole-number scale so they stay crisp; only their positions move smoothly.
import type { CrewMember } from "../crew";
import { defineScene, type HitTarget, type Kit, type Member } from "../kit/engine";
import { ALERT_GROUND as AG, rowOf, type AlertSpec } from "../kit/alert";
import {
  H, SNOW, SUN, floatNote, snowfall, sprite as paint, sunColor, type Motion, type Sprite,
} from "../kit/common";
import { GROUND, SPEED, TIME } from "../kit/style";
import type { ThemeMode } from "../kit/types";
import { DOG, FOX, OUTLINED, PALETTES, SHEEP } from "./pasture-art";

const sprite = (rows: Sprite, theme: ThemeMode, flip: boolean, override?: Record<string, string>) =>
  paint(rows, { ...PALETTES[theme], ...override }, flip, OUTLINED);

const SHEEP_W = 13;
const HOP_SECONDS = 0.53;
const HOP_HEIGHT = 7;
const WALK = SPEED.walk;     // sheep, art px per second
const TROT = SPEED.trot;    // a sheep heading for the stile after a step
const HURRY = 7.5;          // slowest pace heading for the pen
const DOG_SPEED = 7.5;

const NOTE_SECONDS = TIME.tap;
const FOX_SPEED = SPEED.dash;

interface Sheep {
  x: number; tx: number; dir: 1 | -1; hop: { from: number; to: number; k: number } | null; phase: number; trot: boolean;
}
/** A child thread, shown as a sheep with a colored ear tag. */
type CrewSheep = Member<Sheep>;

interface State {
  n: number;
  fenceX: number;
  penW: number;
  penX: number;
  lastHopper: Sheep | null;
  sheep: Sheep[];
  fox: { x: number; pause: number } | null;
  dog: { x: number; dir: 1 | -1 };
  /** The sheep a gag is about, where it and the dog started, and how high it sits. */
  gag: { sheep: Sheep; x0: number; dog0: number; lift: number } | null;
}
type K = Kit<State, Sheep>;

// -- The flock -----------------------------------------------------------

/**
 * Spread the flock across the meadow, already ambling, with one sheep just
 * short of the stile so the first step can send it over within a second.
 */
function scatter(s: State) {
  const f = s.fenceX, far = s.penX - SHEEP_W - 4;
  const jitter = () => (Math.random() - 0.5) * 6;
  const xs = s.n === 2
    ? [Math.max(16, f - 24), f + 8 + (far - f - 8) * 0.5]
    : [18 + Math.random() * 6, f - 26 + jitter(), f + 8 + (far - f - 8) * (0.45 + Math.random() * 0.3)];
  s.sheep.forEach((sh, i) => { sh.x = sh.tx = xs[i]; sh.hop = null; sh.trot = false; });
  for (const sh of s.sheep) {
    sh.tx = wanderTarget(s, sh);
    sh.dir = sh.tx >= sh.x ? 1 : -1;
  }
  s.dog.x = Math.max(1, xs[0] - 20);
  s.dog.dir = 1;
}

/** Pen slots, front to back. `snap` places the flock there instantly. */
const slot = (s: State, i: number) => s.penX + 8 + i * 11;
function pen(s: State, snap = false) {
  s.sheep.forEach((sh, i) => { sh.tx = slot(s, i); if (snap) { sh.x = sh.tx; sh.hop = null; } });
}
const allPenned = (s: State) => s.sheep.every((sh) => sh.x >= s.penX + 6 && !sh.hop && Math.abs(sh.x - sh.tx) < 0.5);
const gateOpen = (s: State, k: K) => !(k.mood.kind === "rate" && allPenned(s));

/** The open spot nearest the dog where it can sit in plain view. */
function sitSpot(s: State): number {
  const f = s.fenceX;
  let best = s.dog.x, bestD = Infinity;
  for (let x = 1; x < s.penX - 14; x++) {
    const clear = s.sheep.every((sh) => sh.x + SHEEP_W < x || sh.x > x + 11) && (x + 11 < f - 1 || x > f + 6);
    const d = Math.abs(x - s.dog.x);
    if (clear && d < bestD) { best = x; bestD = d; }
  }
  return best;
}

/**
 * A new spot for a flock sheep to amble to: within the gap between its
 * neighbors on its side of the stile (so sheep never walk through each
 * other), and clear of any crew.
 */
function wanderTarget(s: State, sh: Sheep, crew: K["crew"] = []): number {
  const f = s.fenceX;
  const left = sh.x < f;
  let lo = left ? 18 : f + 8;   // leave the dog room behind the flock
  let hi = left ? f - 16 : s.penX - SHEEP_W - 4;
  for (const o of [...s.sheep, ...crew.filter((c) => !c.leaving)]) {
    if (o === sh || (o.x < f) !== left) continue;
    if (o.x < sh.x) lo = Math.max(lo, Math.max(o.x, o.tx) + SHEEP_W + 3);
    else hi = Math.min(hi, Math.min(o.x, o.tx) - SHEEP_W - 3);
  }
  if (hi < lo) return sh.x;   // no room: stay put and graze
  return lo + Math.random() * (hi - lo);
}

/**
 * A spot in [lo, hi] at least a sheep's width plus marker room from every
 * other sheep and crew member, so no two overlap; the best try if none fits.
 */
function clearSpot(s: State, k: K, lo: number, hi: number, self: Sheep | null): number {
  const others = [...s.sheep.flatMap((o) => [o.tx, o.x]), ...k.crew.filter((o) => o !== self && !o.leaving).map((o) => o.tx)];
  let best = lo, bestGap = -1;
  for (let i = 0; i < 10; i++) {
    const x = lo + Math.random() * Math.max(4, hi - lo);
    const gap = Math.min(99, ...others.map((o) => Math.abs(o - x)));
    if (gap > bestGap) { best = x; bestGap = gap; }
    if (gap >= SHEEP_W + 3) break;
  }
  return best;
}

function updateCrew(s: State, k: K, dt: number) {
  const f = s.fenceX;
  for (const c of k.crew) {
    if (c.hop) {
      c.hop.k = Math.min(1, c.hop.k + dt / HOP_SECONDS);
      c.x = c.hop.from + (c.hop.to - c.hop.from) * c.hop.k;
      if (c.hop.k >= 1) c.hop = null;
      continue;
    }
    if (c.leaving && c.x >= s.penX + 6) { c.alpha -= dt / 1.2; continue; }
    // Waiting, paused, failed: stand still, once in the meadow.
    if (!c.leaving && c.kind !== "working" && !c.trot) continue;
    if (!c.leaving && c.kind === "working" && Math.abs(c.x - c.tx) < 0.5 && Math.random() < 0.6 * dt) {
      const left = c.x < f;
      c.tx = clearSpot(s, k, left ? 18 : f + 8, left ? f - 16 : s.penX - SHEEP_W - 4, c);
    }
    const dx = c.tx - c.x;
    if (Math.abs(dx) < 0.5) continue;
    c.dir = dx > 0 ? 1 : -1;
    // New arrivals hurry in from the edge so they never linger half off the strip.
    const v = c.leaving ? Math.max(HURRY, s.penX / 6) : c.trot ? (c.x < 18 ? TROT * 2 : TROT) : WALK;
    const nx = c.x + c.dir * Math.min(Math.abs(dx), v * dt);
    if (Math.abs(c.tx - nx) < 0.5) c.trot = false;
    if (c.dir > 0 && c.x <= f - 14 && nx > f - 14) { c.x = f - 14; c.hop = { from: f - 14, to: f + 5, k: 0 }; continue; }
    if (c.dir < 0 && c.x >= f + 4 && nx < f + 4) { c.x = f + 4; c.hop = { from: f + 4, to: f - 15, k: 0 }; continue; }
    c.x = nx;
  }
}

// -- Drawing --------------------------------------------------------------

function drawBack(s: State, k: K, b: CanvasRenderingContext2D, e: number) {
  const { theme } = k.view;
  const P = PALETTES[theme];
  const W = k.W, f = s.fenceX, season = k.season, snow = SNOW[theme];
  if (e > 0.05) {
    b.drawImage(sprite(SUN, theme, false, { y: sunColor(e) }), Math.round((f + 6 + s.penX - 3) / 2) - 2, Math.round(1 + e * 12));
    if (e > 0.75) {
      b.fillStyle = P.star!;
      for (const [x, y] of [[12, 2], [40, 4], [W - 60, 1], [Math.floor(W * 0.6), 3]]) b.fillRect(x, y, 1, 1);
    }
  }
  b.fillStyle = k.view.muted;
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

function drawFront(s: State, k: K, fr: CanvasRenderingContext2D) {
  const P = PALETTES[k.view.theme];
  const snow = SNOW[k.view.theme];
  const p0 = s.penX, pe = p0 + s.penW;
  fr.fillStyle = P.f!;
  for (const x of [p0, p0 + 7, pe]) fr.fillRect(x, GROUND - 7, 1, 8);
  fr.fillRect(p0 + 7, GROUND - 6, pe - p0 - 6, 1); fr.fillRect(p0 + 7, GROUND - 3, pe - p0 - 6, 1);
  if (k.season === "winter") { fr.fillStyle = snow; fr.fillRect(p0 + 7, GROUND - 7, pe - p0 - 6, 1); fr.fillStyle = P.f!; }
  if (gateOpen(s, k)) {
    fr.fillRect(p0 - 3, GROUND - 6, 1, 6); fr.fillRect(p0 - 3, GROUND - 5, 3, 1); fr.fillRect(p0 - 3, GROUND - 2, 3, 1);
  } else {
    fr.fillRect(p0, GROUND - 6, 7, 1); fr.fillRect(p0, GROUND - 3, 7, 1);
    for (let i = 0; i < 4; i++) fr.fillRect((p0 + 1 + i * 1.5) | 0, GROUND - 3 - i, 1, 1);
  }
}

function sheepY(s: State, sh: Sheep) {
  let y = GROUND - 8 - (sh.x >= s.penX + 6 && sh.phase % 2 ? 1 : 0) - (s.gag?.sheep === sh ? s.gag.lift : 0);
  if (sh.hop) y -= Math.sin(Math.PI * sh.hop.k) * (sh.hop.from === sh.hop.to ? 3 : HOP_HEIGHT);
  return y;
}

// -- The helper alert --------------------------------------------------------

const alert: AlertSpec = {
  // The gate on the left, the sheep facing it, then the dog.
  layout(members: readonly CrewMember[]) {
    const first = 9;
    return { width: first + members.length * 17 + 11, figures: rowOf(members, first, 17, 13), extra: { dogX: first + members.length * 17 } };
  },
  still(b, p) {
    const s = p.s, W = p.layout.width, theme = p.theme;
    const P = PALETTES[theme];
    b.fillStyle = p.view.muted; b.globalAlpha = 0.6;
    b.fillRect(0, p.px(AG), W * s, s);
    b.globalAlpha = 1;
    b.fillStyle = P.grass!;
    for (let x = 3; x < W; x += 11) { b.fillRect(p.px(x), p.px(AG - 1), s, s); b.fillRect(p.px(x + 1), p.px(AG - 2), s, 2 * s); }
    // A closed gate: two posts and three rails.
    b.fillStyle = P.f!;
    b.fillRect(p.px(1), p.px(AG - 7), s, 7 * s); b.fillRect(p.px(6), p.px(AG - 7), s, 7 * s);
    for (const y of [AG - 6, AG - 4, AG - 2]) b.fillRect(p.px(1), p.px(y), 6 * s, s);
    for (const f of p.layout.figures) p.blit(b, paint(SHEEP.walk1, PALETTES[theme], true, OUTLINED), f.x, AG - 9);
    p.blit(b, paint(DOG.sit, P, false, OUTLINED), p.layout.extra.dogX, AG - 11);
  },
  // "!" above the sheep's back, or its own rain cloud.
  moving(v, p) {
    for (const [i, f] of p.layout.figures.entries()) {
      if (f.member.kind === "waiting") p.bang(v, f.x + 13, AG - 12, p.t + i * 0.4);
      else p.failed(v, f.x + 5, 0, p.t + i);
    }
  },
};

// -- The scene -------------------------------------------------------------

export const pasture = defineScene<State, Sheep>({
  id: "pasture",
  name: "Pasture",
  state: () => ({ n: 3, fenceX: 0, penW: 0, penX: 0, lastHopper: null, sheep: [], fox: null, dog: { x: 2, dir: 1 }, gag: null }),

  /** Lay the field out for the strip. Keeps animals in proportion. */
  layout(s, k, prevW) {
    const W = k.W;
    const ratio = prevW ? W / prevW : 1;
    const n = W < 130 ? 2 : 3;
    s.fenceX = Math.floor(W * (n === 2 ? 0.33 : 0.42));
    s.penW = 12 + n * 11;
    s.penX = W - s.penW - 2;
    if (s.sheep.length !== n) {
      s.n = n;
      s.sheep = Array.from({ length: n }, (_, i) => ({ x: 0, tx: 0, dir: 1, hop: null, phase: i, trot: false }));
      k.requestStart();
    } else {
      for (const sh of [...s.sheep, ...k.crew]) { sh.x *= ratio; sh.tx *= ratio; sh.hop = null; }
      s.dog.x *= ratio;
    }
  },
  afterLayout(s, k) { if (k.mood.kind === "rate") pen(s, true); },
  // A new run starts mid-scene rather than from the pen: most runs are short.
  start(s) { scatter(s); },

  focus: (s) => s.dog.x + 7,

  crew: {
    max: (k) => (k.narrow ? 2 : 4),
    // A new member ambles in from the left edge, to either side of the stile.
    // Several arriving at once come in single file, so they never pile up.
    join(s, k, _m, shown) {
      const c: Sheep = { x: Math.min(-14, Math.min(0, ...k.crew.map((o) => o.x)) - SHEEP_W - 3), tx: 0, dir: 1, hop: null, phase: k.crew.length + 3, trot: false };
      const right = shown % 2 === 0;
      const lo = right ? s.fenceX + 8 : 18, hi = right ? s.penX - SHEEP_W - 4 : s.fenceX - 16;
      c.tx = clearSpot(s, k, lo, hi, null);
      c.trot = true;   // trots in, then ambles
      if (k.reduced) c.x = c.tx;
      return c;
    },
    // Finished: walk into the pen, then fade out.
    leave(s, _k, c) {
      c.kind = "working";
      c.tx = s.penX + 8 + Math.random() * (s.penW - 20);
    },
  },

  // A sheep hops the stile. The hops are shared around the flock.
  step(s) {
    const f = s.fenceX;
    let free = s.sheep.filter((sh) => !sh.hop && sh.x < s.penX - 4);
    const others = free.filter((sh) => sh !== s.lastHopper && Math.abs(sh.x - f) < 40);
    if (others.length > 0) free = others;
    if (free.length === 0) return false;
    const sh = free.reduce((a, b) => (Math.abs(a.x - f) < Math.abs(b.x - f) ? a : b));
    s.lastHopper = sh;
    sh.trot = true;
    sh.tx = sh.x < f ? f + 10 + Math.random() * 14 : f - 22 - Math.random() * 12;
    sh.tx = Math.max(2, Math.min(sh.tx, s.penX - SHEEP_W - 4));
    return true;
  },

  // A fox trots along the fence.
  surprise: {
    active: (s) => !!s.fox,
    start(s) { s.fox = { x: -14, pause: 0 }; },
  },

  hits(s, k) {
    const d = s.dog;
    const out: HitTarget[] = [];
    const seated = k.mood.kind === "waiting";
    out.push({ target: "lead", box: seated ? [d.x + 2, GROUND - 10, 9, 11] : [d.x, GROUND - 8, 14, 9], at: [d.x + 7, GROUND - 9] });
    for (const c of k.crew) if (!c.leaving) out.push({ target: "member", id: c.id, box: [c.x, GROUND - 9, SHEEP_W, 10], at: [c.x + 6.5, GROUND - 9] });
    for (const sh of s.sheep) out.push({ target: "flock", box: [sh.x, GROUND - 9, SHEEP_W, 10], at: [sh.x + 6.5, GROUND - 9] });
    return out;
  },
  // A sheep says "♪ baa" and hops in place.
  tap(s, k, hit) {
    const ax = hit.x / k.scale;
    const sh = [...k.crew, ...s.sheep].find((o) => Math.abs(o.x + 6.5 - ax) < 1);
    if (!sh || hit.target === "lead") return;
    k.react(sh, NOTE_SECONDS);
    if (!k.reduced && !sh.hop) sh.hop = { from: sh.x, to: sh.x, k: 0 };
  },

  // The dog is the lead: its cloud.
  errorCloudX: (s) => s.dog.x + 1,

  update(s, k, dt) {
    const mk = k.mood.kind, f = s.fenceX;
    if (mk === "working" && !k.resting) {
      for (const sh of s.sheep)
        if (!sh.hop && Math.abs(sh.x - sh.tx) < 0.5 && Math.random() < 0.8 * dt) sh.tx = wanderTarget(s, sh, k.crew);
    }
    updateCrew(s, k, dt);
    if (s.fox) {
      // Trot along, stop once midway to look at the flock, trot on.
      const mid = k.W * 0.45;
      if (s.fox.pause < 1.2 && s.fox.x >= mid) s.fox.pause += dt;
      else s.fox.x += FOX_SPEED * dt;
      if (s.fox.x > k.W + 4 || mk !== "working") s.fox = null;
    }
    if (mk === "rate") pen(s);
    const frozen = mk === "waiting" || mk === "error" || mk === "idle" || k.resting;
    // Heading for the pen takes about five seconds on any strip width.
    const v = mk === "rate" ? Math.max(HURRY, s.penX / 5) : WALK;
    for (const sh of s.sheep) {
      if (s.gag?.sheep === sh) continue;   // a gag is moving this one
      if (sh.hop) {   // a hop already in the air always lands
        sh.hop.k = Math.min(1, sh.hop.k + dt / HOP_SECONDS);
        sh.x = sh.hop.from + (sh.hop.to - sh.hop.from) * sh.hop.k;
        if (sh.hop.k >= 1) { sh.hop = null; sh.trot = false; }
        continue;
      }
      if (frozen) continue;
      const dx = sh.tx - sh.x;
      if (Math.abs(dx) < 0.5) continue;
      sh.dir = dx > 0 ? 1 : -1;
      const nx = sh.x + sh.dir * Math.min(Math.abs(dx), (sh.trot ? Math.max(TROT, v) : v) * dt);
      if (sh.dir > 0 && sh.x <= f - 14 && nx > f - 14) { sh.x = f - 14; sh.hop = { from: f - 14, to: f + 5, k: 0 }; continue; }
      if (sh.dir < 0 && sh.x >= f + 4 && nx < f + 4) { sh.x = f + 4; sh.hop = { from: f + 4, to: f - 15, k: 0 }; continue; }
      sh.x = nx;
    }
    if (mk === "waiting") {   // trot to an open spot, then sit facing the viewer
      const dd = sitSpot(s) - s.dog.x;
      if (Math.abs(dd) > 0.5) {
        s.dog.dir = dd > 0 ? 1 : -1;
        s.dog.x += s.dog.dir * Math.min(Math.abs(dd), DOG_SPEED * 2 * dt);
      }
      return;
    }
    if (frozen || mk === "rate" || k.gagId) return;   // a gag moves the dog itself
    // The dog keeps loosely behind the flock, outside the pen.
    const rear = Math.min(...s.sheep.map((sh) => sh.x));
    let target = Math.min(s.penX - 18, rear - 20 + Math.sin(k.t / 2.7) * 4);
    if (target > f - 15 && target < f + 6) target = f - 15;   // never stop on the stile
    const dd = target - s.dog.x;
    if (Math.abs(dd) > 2) {
      s.dog.dir = dd > 0 ? 1 : -1;
      s.dog.x += s.dog.dir * Math.min(Math.abs(dd), Math.max(DOG_SPEED, v) * dt);
    }
    s.dog.x = Math.max(1, Math.min(s.dog.x, s.penX - 16));
  },

  /** Reduced motion: jump straight to the still picture for the mood. */
  settle(s, k) {
    const mk = k.mood.kind;
    for (const sh of [...s.sheep, ...k.crew]) sh.hop = null;
    for (const c of k.crew) if (c.leaving) c.alpha = 0; else c.x = c.tx > 0 ? c.tx : c.x;
    k.crew = k.crew.filter((c) => c.alpha > 0);
    s.fox = null;
    if (mk === "rate") pen(s, true);
    if (mk === "waiting") s.dog.x = sitSpot(s);
  },

  draw(s, k) {
    const { theme } = k.view;
    const P = PALETTES[theme];
    const v = k.ctx;
    const W = k.W, mk = k.mood.kind, season = k.season;
    const px = (x: number) => k.px(x);
    const s3 = k.s3;
    const e = k.evening();
    // Both layers are cached: they only change with size, theme, season, the
    // sun's height, and the gate.
    const sunRow = e > 0.05 ? Math.round(1 + e * 12) : -1;
    const back = k.layer("back", `${W}:${theme}:${season}:${sunRow}:${e > 0.75}:${sunColor(e)}:${k.view.muted}`, W, H, (b) => drawBack(s, k, b, e));
    // The front layer: the pen, drawn over the sheep so they stand inside it.
    const front = k.layer("front", `${W}:${theme}:${season}:${gateOpen(s, k)}`, W, H, (fr) => drawFront(s, k, fr));

    v.drawImage(back, 0, 0, W * s3, H * s3);
    const blit = (c: HTMLCanvasElement, x: number, y: number) => k.blit(c, x, y);

    const moving = !k.view.reducedMotion && mk === "working" && !k.resting;
    const beat = Math.floor(k.t / 0.27);
    if (s.fox && !k.reduced) {
      const trot = s.fox.pause > 0 && s.fox.pause < 1.2 ? FOX.stand : beat % 2 ? FOX.trot2 : FOX.trot1;
      blit(sprite(trot, theme, false), s.fox.x - 1, GROUND - 6);
    }
    const d = s.dog;
    const seated = mk === "waiting" && (k.reduced || Math.abs(sitSpot(s) - d.x) <= 0.5);
    if (mk === "rate" || k.resting) blit(sprite(DOG.lie, theme, false), d.x, GROUND - 4);
    else if (!seated) {
      const tail = k.gagging("tail");
      const trotting = (moving || mk === "waiting") && !k.view.reducedMotion && (tail !== null ? Math.floor(k.t * 10) % 2 === 1 : beat % 2 === 1);
      // Chasing its own tail: it whirls round and round, with a little hop.
      const dir = tail !== null && tail < 0.85 ? (Math.floor(k.t * 7) % 2 ? 1 : -1) : d.dir;
      const hop = tail !== null && tail < 0.85 ? Math.abs(Math.sin(k.t * 22)) * 1 : 0;
      blit(sprite(trotting ? DOG.trot2 : DOG.trot1, theme, dir < 0), d.x, GROUND - 7 - hop);
    }
    const drawSheep = (sh: Sheep, walking: boolean) => {
      let rows: Sprite = SHEEP.walk1;
      if (sh.hop) rows = SHEEP.hop;
      else if (walking && !k.view.reducedMotion && Math.abs(sh.x - sh.tx) >= 0.5 && (beat + sh.phase) % 2) rows = SHEEP.walk2;
      const c = sprite(rows, theme, sh.dir < 0);
      const sneeze = s.gag?.sheep === sh ? k.gagging("sneeze") : null;
      if (sneeze !== null && sneeze > 0.32 && sneeze < 0.7) {
        // Toppled onto its back, legs in the air.
        v.save();
        v.translate(px(sh.x - 1), px(GROUND - 9) + c.height * s3);
        v.scale(1, -1);
        v.drawImage(c, 0, 0, c.width * s3, c.height * s3);
        v.restore();
        return;
      }
      blit(c, sh.x - 1, sheepY(s, sh) - 1);
    };
    for (const sh of s.sheep) drawSheep(sh, moving);
    for (const c of k.crew as CrewSheep[]) {
      v.globalAlpha = Math.max(0, c.alpha);
      drawSheep(c, c.leaving || c.kind === "working");
      // The ear tag that marks a child thread.
      v.fillStyle = c.color;
      v.fillRect(px(c.x + (c.dir > 0 ? 7 : 4)), px(sheepY(s, c) + 1), 2 * s3, 2 * s3);
      v.globalAlpha = 1;
      if (!c.leaving) k.marker(c.kind, c.x + 6, sheepY(s, c) - 6);
    }
    if (seated) blit(sprite(DOG.sit, theme, false), d.x + 2, GROUND - 10);
    // Waiting on you: the amber tag on the dog's collar.
    if (mk === "waiting") k.signal(seated ? d.x + 6 : d.x + (d.dir > 0 ? 10 : 2), seated ? GROUND - 6 : GROUND - 9);
    v.drawImage(front, 0, 0, W * s3, H * s3);

    // Season touches drawn over everything, and kept sparse.
    const t = k.t;
    if (season === "winter") snowfall(v, k.view, W, t, 7, GROUND);
    if (season === "summer") {
      const bx = k.reduced ? W * 0.3 : ((t * 6) % (W + 20)) - 10;
      const by = 4 + (k.reduced ? 0 : Math.sin(t * 1.7) * 2);
      // A small butterfly: two wings that open and close around a dark body.
      const open = k.reduced || Math.floor(t * 6) % 2 === 0;
      v.fillStyle = "#ee8a6a";
      if (open) {
        v.fillRect(px(bx - 1), px(by - 1), 2 * s3, 2 * s3); v.fillRect(px(bx + 2), px(by - 1), 2 * s3, 2 * s3);
      } else {
        v.fillRect(px(bx), px(by - 1), s3, 2 * s3); v.fillRect(px(bx + 2), px(by - 1), s3, 2 * s3);
      }
      v.fillStyle = P.K!;
      v.fillRect(px(bx + 1), px(by - 1), s3, 2 * s3);
    }
    if (season === "autumn") {
      const ly = k.reduced ? GROUND - 1 : (t * 3) % GROUND;
      v.fillStyle = theme === "dark" ? "#e08a3a" : "#c8642a";
      v.fillRect(px(W * 0.55 + (k.reduced ? 0 : Math.sin(t) * 4)), px(ly), 2 * s3, s3);
    }

    for (const sh of [...s.sheep, ...k.crew]) {
      const baa = k.reaction(sh);
      if (baa !== null) floatNote(v, k.view, "♪ baa", sh.x + 6, sheepY(s, sh) - 1, baa / NOTE_SECONDS);
    }
    const sneeze = k.gagging("sneeze");
    if (sneeze !== null && s.gag && sneeze > 0.25 && sneeze < 0.65) floatNote(v, k.view, "♪ achoo", s.gag.sheep.x + 6, GROUND - 10, (sneeze - 0.25) / 0.4);
  },

  motion(s, k): Motion {
    const mk = k.mood.kind;
    const all = [...s.sheep, ...k.crew];
    if (s.fox || all.some((sh) => sh.hop)) return "fast";
    if (k.crew.some((c) => c.leaving || c.alpha < 1 || (c.kind === "working" && Math.abs(c.x - c.tx) >= 0.5))) return "fast";
    if (k.resting) return k.season !== "spring" ? "slow" : "still";   // lying down: only the season moves
    if (mk === "working") return "fast";   // the flock ambles and the dog keeps moving
    if (mk === "waiting" && Math.abs(sitSpot(s) - s.dog.x) > 0.5) return "fast";
    if (mk === "rate" && !allPenned(s)) return "fast";
    // Rain, a blinking marker, falling snow, a butterfly or leaf: gentle changes.
    const gentle = mk === "error" || k.crew.some((c) => c.kind === "waiting" || c.kind === "error") || k.season !== "spring";
    return mk === "idle" ? "still" : gentle ? "slow" : "still";
  },

  gags: [
    // A sheep gets stuck on top of the stile; the dog trots up and nudges it over.
    {
      id: "stuck",
      seconds: 4,
      ready: (s) => stileSheep(s) !== null,
      start(s) { const sh = stileSheep(s)!; s.gag = { sheep: sh, x0: sh.x, dog0: s.dog.x, lift: 0 }; sh.hop = null; },
      update(s, k, _dt, p) {
        const g = s.gag, f = s.fenceX;
        if (!g) return;
        const top = f - 5, over = f + 5;
        const sh = g.sheep;
        if (p < 0.2) { sh.dir = 1; sh.x = g.x0 + (top - g.x0) * (p / 0.2); g.lift = 5 * (p / 0.2); }
        else if (p < 0.62) { sh.x = top + Math.sin(k.t * 14) * 0.3; g.lift = 5; }   // stuck, wobbling
        else if (p < 0.8) { const q = (p - 0.62) / 0.18; sh.x = top + (over - top) * q; g.lift = 5 + Math.sin(Math.PI * q) * 2 - 5 * q; }
        else { sh.x = over; g.lift = 0; }
        // The dog trots up behind it, then gives it a push.
        const behind = top - 15;
        const dogAt = p < 0.45 ? g.dog0 + (behind - g.dog0) * Math.min(1, p / 0.4) : p < 0.66 ? behind + (p > 0.58 ? 2 : 0) : behind;
        s.dog.dir = dogAt >= s.dog.x - 0.01 ? 1 : -1;
        s.dog.x = Math.max(1, dogAt);
      },
      end(s) { if (s.gag) { s.gag.sheep.tx = s.gag.sheep.x; s.gag = null; } },
    },
    // A sheep stops, sneezes, topples onto its back, and gets back up.
    {
      id: "sneeze",
      seconds: 3.5,
      ready: (s) => s.sheep.some((sh) => !sh.hop),
      start(s) {
        const sh = s.sheep.filter((o) => !o.hop).reduce((a, b) => (Math.abs(b.x - s.fenceX) > Math.abs(a.x - s.fenceX) ? b : a));
        s.gag = { sheep: sh, x0: sh.x, dog0: s.dog.x, lift: 0 };
      },
      update(s, k, _dt, p) {
        const g = s.gag;
        if (!g) return;
        g.sheep.x = g.x0 + (p < 0.3 ? Math.sin(k.t * 20) * 0.3 : 0);   // the build-up: a little shiver
        g.lift = p > 0.7 && p < 0.85 ? Math.sin(Math.PI * (p - 0.7) / 0.15) * 2 : 0;   // a hop back onto its feet
      },
      end(s) { if (s.gag) { s.gag.sheep.tx = s.gag.sheep.x; s.gag = null; } },
    },
    // The dog chases its own tail, round and round (drawn with the dog).
    { id: "tail", seconds: 3 },
  ],

  alert,
});

/** A plain sheep near enough the stile, on the near side, to get stuck on it. */
function stileSheep(s: State): Sheep | null {
  const f = s.fenceX;
  const near = s.sheep.filter((sh) => !sh.hop && sh.x < f - 14 && sh.x > f - 50);
  return near.length ? near.reduce((a, b) => (b.x > a.x ? b : a)) : null;
}
