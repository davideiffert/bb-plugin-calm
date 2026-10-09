// The Sea: a small sailboat on moving water. Inspired by the calm mode in
// Kun Chen's firstmate; the boat, water, and moments here are drawn fresh.
// Gags: a gull lands on the mast and the boat tips; a fish leaps into the
// boat and flops back out; the sail luffs and the boat drifts backward a
// moment, then catches the wind. Shown always and resting between runs, the
// boat lies at anchor with its sail furled, bobbing gently.
import { defineScene, type HitTarget, type Kit } from "../kit/engine";
import { ALERT_GROUND as AG, AMBER, rowOf, type AlertSpec } from "../kit/alert";
import { H, SUN, floatNote, seeded, snowfall, sprite, sunColor, type Motion, type Sprite } from "../kit/common";
import { SPEED, TIME, WATERLINE } from "../kit/style";
import type { ThemeMode } from "../kit/types";

const WATER = WATERLINE;   // the waterline row
const BOAT_W = 15;
const DRIFT = SPEED.drift; // boat, art px per second
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
/** The sail luffing: slack, flapping canvas. */
const BOAT_LUFF: Sprite = [
  ".......m.......",
  ".......mS......",
  "......smS......",
  ".....s.mSS.....",
  "....ss.mS.S....",
  "...s.s.mSSS....",
  "..ss.s.mS.SS...",
  ".......m.......",
  "hhhhhhhhhhhhhhh",
  ".rrrrrrrrrrrrr.",
  "..HHHHHHHHHHH..",
];
/** Moored: the sail furled along the boom. */
const BOAT_MOORED: Sprite = [
  ".......m.......",
  ".......m.......",
  ".......m.......",
  ".......m.......",
  ".......m.......",
  ".......m.......",
  "....sSSmSSs....",
  "...mmmmmmmmm...",
  "hhhhhhhhhhhhhhh",
  ".rrrrrrrrrrrrr.",
  "..HHHHHHHHHHH..",
];
const GULL_FLY: Sprite = ["u.....u", ".uu.uu.", "...u..."];
const GULL_GLIDE: Sprite = ["uuu.uuu", "...u..."];
const GULL_SIT: Sprite = [".uu.", "uuuk", ".uu."];
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
const NOTE_SECONDS = TIME.tap;
const WHALE_SECONDS = 3.4;

const FISH: Sprite = ["o...ooo.", "oo.ooooo", "ooooooeo", "oo.ooooo", "o...ooo."];
const ANCHOR: Sprite = ["..a..", ".aaa.", "..a..", "a.a.a", ".aaa."];

export const PALETTES: Record<ThemeMode, Record<string, string | null>> = {
  light: {
    m: "#6b4a2f", S: "#fbf8f1", s: "#ece5d6", h: "#8a5a36", r: "#c8553d", H: "#5e3d24",
    o: "#e88b9b", e: "#3b3540", a: "#6b6f7a", outline: "#9c958a", u: "#8f96a3", k: "#c9a46a",
    water: "#5b8fd9", ripple: "#9dbcea", star: "#8f86c9", g: "#6c7a8f", y: "#d9c27a",
  },
  dark: {
    m: "#a07b55", S: "#ece7dc", s: "#d6cfc0", h: "#b07a4e", r: "#d86a50", H: "#7d5536",
    o: "#f0a0b0", e: "#2d2833", a: "#a0a4ae", outline: null, u: "#e6e8ee", k: "#d2ae74",
    water: "#6f97e0", ripple: "#3d5f9e", star: "#e8e2ff", g: "#8a98ad", y: "#e9d48a",
  },
};

interface Fish { x: number; dir: 1 | -1; k: number }
/** A child thread, shown as a small boat in the fleet. */
interface Skiff { x: number; dir: 1 | -1; speed: number }

interface State {
  x: number;
  dir: 1 | -1;
  fish: Fish | null;
  anchor: number;       // 0 = stowed, 1 = on the bottom
  /** The sail is furled: at rest, and until the anchor is back up. */
  furled: boolean;
  stars: [number, number][];
  whale: { x: number; k: number } | null;
}
type K = Kit<State, Skiff>;
const LEAD = "boat";   // the tap reaction key for the boat's bell

/** A fish jumps somewhere in open water, away from the boat. Returns false if one is already in the air. */
function leap(s: State, k: K): boolean {
  if (s.fish) return false;
  k.stepped();
  const ahead = s.x + BOAT_W / 2 + s.dir * (24 + Math.random() * 30);
  const x = ahead > 4 && ahead < k.W - 12 ? ahead : s.x + BOAT_W / 2 - s.dir * (24 + Math.random() * 20);
  s.fish = { x: Math.max(4, Math.min(x, k.W - 12)), dir: Math.random() < 0.5 ? 1 : -1, k: 0 };
  return true;
}

/** A tap on a boat: a small bell and a note float up. Silent. */
function drawBell(k: K, x: number, y: number, p: number) {
  const v = k.ctx, view = k.view;
  const s = k.s3;
  const rise = view.reducedMotion ? 0 : p * 3;
  const c = sprite(BELL, PALETTES[view.theme]);
  v.globalAlpha = Math.max(0, 1 - Math.max(0, p - 0.6) / 0.4);
  v.drawImage(c, Math.round(x * s), Math.round((y - 5 - rise) * s), c.width * s, c.height * s);
  v.globalAlpha = 1;
  floatNote(v, view, "♪", x + 8, y - 1, p);
}

/** One quiet touch per season: snow, petals, a gull, or floating leaves. */
function drawSeason(k: K, crest: (x: number) => number) {
  const { W, t, season, reduced } = k;
  const v = k.ctx, view = k.view;
  const s = k.s3;
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

// -- The helper alert --------------------------------------------------------

const alert: AlertSpec = {
  layout: (members) => ({ width: 3 + members.length * 14, figures: rowOf(members, 3, 14, 9), extra: {} }),
  still(b, p) {
    const s = p.s, W = p.layout.width;
    const P = PALETTES[p.theme];
    b.fillStyle = P.water!;
    for (let x = 0; x < W; x += 6) b.fillRect(p.px(x), p.px(AG + (x % 12 ? 0 : -1) * 0), 4 * s, s);
    b.fillStyle = P.ripple!;
    for (let x = 3; x < W; x += 9) b.fillRect(p.px(x), p.px(AG + 1), 2 * s, s);
  },
  // A small boat bobbing, its lantern blinking amber; failed, under a rain cloud.
  moving(v, p) {
    const s = p.s, t = p.t, reduced = p.reduced;
    const P = PALETTES[p.theme];
    for (const [i, f] of p.layout.figures.entries()) {
      const bob = reduced ? 0 : Math.round(Math.sin(t * 2.2 + i * 1.3) * 0.6 * s) / s;
      const top = AG - 6 + bob;
      p.blit(v, sprite(SKIFF, { ...P }, false, "Ss"), f.x, top);
      if (f.member.kind === "waiting") {
        const on = reduced ? 1 : 0.5 + 0.5 * Math.sin(t * Math.PI * 1.6 + i);
        p.glow(v, f.x + 4, top - 1, 3, AMBER, on);
        v.fillStyle = AMBER; v.globalAlpha = 0.5 + 0.5 * on;
        v.fillRect(p.px(f.x + 4), p.px(top - 1), s, s);
        v.globalAlpha = 1;
      } else p.failed(v, f.x + 4, 0, t + i);
    }
  },
};

// -- The scene -------------------------------------------------------------

export const sea = defineScene<State, Skiff>({
  id: "sea",
  name: "Sea",
  state: () => ({ x: 0, dir: 1, fish: null, anchor: 0, furled: false, stars: [], whale: null }),

  layout(s, k, prevW) {
    const W = k.W;
    const ratio = prevW ? W / prevW : 1;
    s.x = Math.min(s.x * ratio, W - BOAT_W - 4);
    const rnd = seeded(W);
    s.stars = Array.from({ length: Math.floor(W / 30) }, () => [Math.floor(rnd() * W), Math.floor(rnd() * 6)]);
  },
  // Back to work from waiting or a rate limit: the anchor is simply up. From a rest it is hauled up in view.
  mood(s, k, was) { if (k.mood.kind === "working" && !k.resting && was !== "working") { s.anchor = 0; s.furled = false; } },
  /** A new run starts under way: mid-water, sailing, a fish already leaping. */
  start(s, k) {
    const running = k.mood.kind === "working" && !k.resting;
    const room = k.W - BOAT_W - 12;
    s.x = 6 + room * (0.2 + Math.random() * 0.5);
    s.dir = Math.random() < 0.5 ? 1 : -1;
    s.anchor = 0;
    s.furled = false;
    if (running) leap(s, k);   // opening a thread that isn't running shows no leap
  },

  focus: (s) => s.x + BOAT_W / 2,

  crew: {
    max: (k) => (k.narrow ? 2 : 4),
    // A small boat sails in from one edge.
    join(_s, k) {
      const fromLeft = Math.random() < 0.5;
      const b: Skiff = { x: fromLeft ? -SKIFF_W : k.W, dir: fromLeft ? 1 : -1, speed: 2.5 + Math.random() * 2 };
      if (k.reduced) b.x = 8 + Math.random() * (k.W - 24);
      return b;
    },
    // Finished: sail for the nearest edge, back to harbor.
    leave(_s, k, b) { b.dir = b.x < k.W / 2 ? -1 : 1; },
  },

  step: (s, k) => leap(s, k),

  // A whale breaches out in open water, away from the boat.
  surprise: {
    active: (s) => !!s.whale,
    start(s, k) {
      const x = s.x < k.W / 2 ? k.W * (0.62 + Math.random() * 0.2) : k.W * (0.08 + Math.random() * 0.2);
      s.whale = { x, k: 0 };
    },
  },

  hits(s, k) {
    const top = WATER - 9;
    const out: HitTarget[] = [{ target: "lead", box: [s.x, top - 2, BOAT_W, WATER + 2 - (top - 2)], at: [s.x + 7.5, top] }];
    for (const b of k.crew) if (!b.leaving) out.push({ target: "member", id: b.id, box: [b.x, WATER - 6, SKIFF_W, 8], at: [b.x + 4.5, WATER - 6] });
    return out;
  },
  // The boat or a crew boat rings a small bell.
  tap(_s, k, hit) {
    if (hit.target === "lead") k.react(LEAD, NOTE_SECONDS);
    const b = k.crew.find((o) => o.id === hit.id);
    if (b) k.react(b, NOTE_SECONDS);
  },

  errorCloudX: (s) => s.x + 1,

  update(s, k, dt) {
    const mk = k.mood.kind;
    for (const b of k.crew) {
      if (b.leaving) {
        b.x += b.dir * 14 * dt;
        if (b.x < -SKIFF_W - 2 || b.x > k.W + 2) b.alpha = 0;
        else if (b.x < 2 || b.x > k.W - SKIFF_W - 2) b.alpha = Math.max(0, b.alpha - dt / 0.8);
        continue;
      }
      const entering = b.x < 4 || b.x > k.W - SKIFF_W - 4;
      if (b.kind !== "working" && !entering) continue;   // waiting, paused, failed: holding still
      b.x += b.dir * (entering ? 12 : b.speed) * dt;
      // Boats keep their distance: one that sails up to another turns about.
      if (!entering) for (const o of k.crew) if (o !== b && !o.leaving && Math.abs(o.x - b.x) < SKIFF_W + 3 && (o.x - b.x) * b.dir > 0) b.dir = b.dir > 0 ? -1 : 1;
      const max = k.W - SKIFF_W - 4;
      if (b.x > max && b.dir > 0) b.dir = -1;
      if (b.x < 4 && b.dir < 0) b.dir = 1;
    }
    if (s.whale && ((s.whale.k += dt / WHALE_SECONDS) >= 1 || mk !== "working")) s.whale = null;
    if (s.fish) {
      s.fish.k += dt / FISH_SECONDS;
      if (s.fish.k >= 1) s.fish = null;
    }
    const anchored = mk === "waiting" || mk === "rate" || k.resting;
    s.anchor = anchored ? Math.min(1, s.anchor + dt / ANCHOR_SECONDS) : Math.max(0, s.anchor - dt / ANCHOR_SECONDS);
    if (k.resting) s.furled = true;
    else if (s.anchor === 0) s.furled = false;
    if (mk !== "working" || k.resting || s.anchor > 0) return;   // under way only once the anchor is up
    // Luffing: the boat slips backward a moment, then lurches ahead on the wind.
    const luff = k.gagging("luff");
    s.x += s.dir * DRIFT * dt * (luff === null ? 1 : luff < 0.55 ? -0.8 : 2.2);
    const max = k.W - BOAT_W - 4;
    if (s.x > max) { s.x = max; s.dir = -1; }
    if (s.x < 4) { s.x = 4; s.dir = 1; }
  },

  settle(s, k) {
    s.whale = null;
    k.crew = k.crew.filter((b) => !b.leaving);
    for (const b of k.crew) b.x = Math.max(4, Math.min(b.x, k.W - SKIFF_W - 4));
    s.fish = null;
    s.anchor = k.mood.kind === "waiting" || k.mood.kind === "rate" || k.resting ? 1 : 0;
    s.furled = k.resting;
  },

  draw(s, k) {
    const v = k.ctx;
    const P = PALETTES[k.view.theme];
    const W = k.W, mk = k.mood.kind, t = k.t;
    const s3 = k.s3;
    const px = (n: number) => k.px(n);
    const dot = (x: number, y: number, c: string) => k.dot(x, y, c);
    const blit = (c: HTMLCanvasElement, x: number, y: number) => k.blit(c, x, y);
    const pal = (flip = false) => sprite(BOAT, P, flip, "Ss");

    // The sun sets over a long run; stars come out at dusk.
    const e = k.evening();
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
        const w = 4 - i, wob = k.reduced ? 0 : Math.sin(t * 2 + i) * 0.6;
        v.fillStyle = sunColor(e);
        v.globalAlpha = (0.6 - i * 0.15) * glow;
        v.fillRect(px(sunX + 3 - w / 2 + wob), px(WATER + 1 + i * 2), w * s3, s3);
      }
      v.globalAlpha = 1;
    }
    if (e > 0.75) for (const [x, y] of s.stars) dot(x, y, P.star!);

    // The rare whale: its back rises and blows, then slips under.
    if (s.whale && !k.reduced) {
      const { x, k: wk } = s.whale;
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

    // The anchor line and anchor, under the bow. A moored boat rides the swell slowly.
    const bob = k.reduced || mk === "waiting" || mk === "rate" ? 0 : k.resting ? Math.sin(t * 1.1) * 0.5 : Math.sin(t * 2.2) * 0.8;
    const boatY = WATER - 9 + bob;
    const bowX = s.x + (s.dir > 0 ? BOAT_W - 3 : 2);
    if (s.anchor > 0) {
      const depth = (H - 5 - (WATER + 1)) * s.anchor;
      v.fillStyle = P.a!;
      for (let y = WATER + 1; y < WATER + 1 + depth; y++) v.fillRect(px(bowX + 2), px(y), s3, s3);
      blit(sprite(ANCHOR, P), bowX, WATER + depth - 1);
    }

    // The boat: tipped by a gull on the mast, or with its sail luffing.
    const gull = k.gagging("gull"), luff = k.gagging("luff");
    const perched = gull !== null && gull > 0.35 && gull < 0.78;
    const tip = perched ? (s.dir > 0 ? 1 : -1) * 0.16 * (1 - Math.min(1, (gull - 0.35) / 0.43) * 0.5) * (0.85 + 0.15 * Math.sin(t * 9)) : 0;
    const boatArt = s.furled ? sprite(BOAT_MOORED, P, s.dir < 0, "Ss")
      : luff !== null && luff < 0.55 && Math.floor(t * 8) % 2 ? sprite(BOAT_LUFF, P, s.dir < 0, "Ss") : pal(s.dir < 0);
    if (tip) {
      const cx = k.px(s.x + BOAT_W / 2), cy = k.px(boatY + 9);
      v.save(); v.translate(cx, cy); v.rotate(tip); v.translate(-cx, -cy);
      blit(boatArt, s.x - 1, boatY - 1);
      blit(sprite(GULL_SIT, P, s.dir < 0), s.x + 6 - 1, boatY - 3 - 1);
      v.restore();
    } else blit(boatArt, s.x - 1, boatY - 1);

    // The fleet: one small boat per child thread, hull striped in its color.
    for (const b of k.crew) {
      const by = WATER - 6 + (k.reduced || b.kind !== "working" ? 0 : Math.sin(t * 2.4 + b.speed) * 0.6);
      v.globalAlpha = b.alpha;
      blit(sprite(SKIFF, { ...P, r: b.color }, b.dir < 0, "Ss"), b.x - 1, by - 1);
      v.globalAlpha = 1;
      if (!b.leaving) k.marker(b.kind, b.x + 4, by - 6);
      const bell = k.reaction(b);
      if (bell !== null) drawBell(k, b.x + 2, by - 3, bell / NOTE_SECONDS);
    }

    // The lantern at the masthead: lit amber while waiting on you.
    if (mk === "waiting") k.signal(s.x + 6.5, boatY - 2);

    // A fish leaping clear of the water, with a splash at each end.
    if (s.fish) {
      const f = s.fish, fx = f.x + f.dir * 10 * f.k;
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

    drawSeason(k, crest);
    const bell = k.reaction(LEAD);
    if (bell !== null) drawBell(k, s.x + 5, boatY - 2, bell / NOTE_SECONDS);
  },

  motion(s, k): Motion {
    const mk = k.mood.kind;
    if (s.fish || s.whale) return "fast";
    if (k.resting) return s.anchor < 1 || k.crew.some((b) => b.leaving || b.kind === "working") ? "fast" : "slow";
    if (mk === "working") return "fast";
    if ((mk === "waiting" || mk === "rate") && s.anchor < 1) return "fast";
    if (k.crew.some((b) => b.leaving || b.kind === "working" || b.x < 4 || b.x > k.W - SKIFF_W - 4)) return "fast";
    // The water keeps rolling, the lantern blinks, the rain falls: gentle.
    return mk === "idle" ? "still" : "slow";
  },

  gags: [
    // A gull glides in and lands on the mast top; the boat tips under it.
    {
      id: "gull",
      seconds: 3.5,
      draw(s, k, p) {
        if (p > 0.35 && p < 0.78) return;   // perched: drawn with the tipped boat
        const P = PALETTES[k.view.theme];
        const mastX = s.x + 6, mastY = WATER - 12;
        const from = p <= 0.35 ? p / 0.35 : 0, away = p >= 0.78 ? (p - 0.78) / 0.22 : 0;
        const gx = p <= 0.35 ? k.W + 6 + (mastX - 1 - k.W - 6) * from : mastX - 1 - away * 50;
        const gy = p <= 0.35 ? 1 + (mastY - 1) * from : mastY - away * 8;
        k.blit(sprite(Math.floor(k.t * 8) % 2 ? GULL_FLY : GULL_GLIDE, P, p <= 0.35), gx - 1, gy - 1);
      },
    },
    // A fish leaps into the boat, flops about on deck, and leaps back out.
    {
      id: "fish",
      seconds: 3.5,
      draw(s, k, p) {
        const P = PALETTES[k.view.theme];
        const bob = Math.sin(k.t * 2.2) * 0.8, deck = WATER - 9 + bob + 6;
        const inX = s.x + BOAT_W / 2 + s.dir * 14, deckX = s.x + 4, outX = s.x + BOAT_W / 2 - s.dir * 14;
        let fx: number, fy: number, flip = s.dir > 0;
        if (p < 0.28) { const q = p / 0.28; fx = inX + (deckX - inX) * q; fy = WATER + 1 + (deck - WATER - 1) * q - Math.sin(Math.PI * q) * 6; }
        else if (p < 0.72) { fx = deckX + (Math.floor(k.t * 6) % 2); fy = deck - Math.abs(Math.sin(k.t * 12)) * 1.5; flip = Math.floor(k.t * 6) % 2 === 0; }
        else { const q = (p - 0.72) / 0.28; fx = deckX + (outX - deckX) * q; fy = deck + (WATER + 1 - deck) * q - Math.sin(Math.PI * q) * 6; flip = s.dir < 0; }
        k.blit(sprite(FISH, P, flip), fx - 1, fy - 3);
      },
    },
    // The sail goes slack and flaps; the boat slips back, then catches the wind (drawn with the boat).
    { id: "luff", seconds: 3.5 },
  ],

  alert,
});
