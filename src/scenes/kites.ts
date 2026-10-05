// Kites: a child flying a kite from a grassy hill on a breezy day.
//
// Working: the kite sways on the wind, its tail waving, the child holding
// the string. A step: the kite loops the loop. Waiting on you: the kite
// holds steady, the child faces you, and the kite's light glows amber.
// Rate-limited: the kite rests on the grass and the child sits by it.
// Error: the kit's rain cloud. Crew: more kites in each helper's color.
// Long run: the kite glows cream at dusk. Surprise: a long dragon kite drifts
// over. Taps: the kite loops, "♪ whee". Seasons: blossom petals, summer
// clouds, autumn leaves, and snow, all blowing on the breeze. Gags: the kite
// snags in the tree and the kid tugs and tugs; a bird chases the kite; a
// gust lifts the kid an inch off the ground.
import { defineScene, type HitTarget, type Kit } from "../kit/engine";
import { ALERT_GROUND as AG, rowOf, type AlertSpec } from "../kit/alert";
import { SNOW, glow, seeded, sprite, type Motion, type Sprite } from "../kit/common";
import { GROUND, TIME } from "../kit/style";
import type { ThemeMode } from "../kit/types";

// -- Art ---------------------------------------------------------------------

const KID = {
  stand: [".hh..", "hhhh.", ".ss..", ".sK.s", "cccs.", "cccc.", ".pp..", ".p.p."],
  front: [".hhh.", "hhhhh", ".sss.", ".KsK.", "sccc.", ".ccc.", ".pp..", ".p.p."],
  sit: [".....", ".hh..", "hhhh.", ".ss..", ".sK..", "cccc.", "ppppp", "....."],
} satisfies Record<string, Sprite>;
const KITE: Sprite = ["..r..", ".rYr.", "rYyYr", ".rYr.", "..r.."];
const KITE_DOWN: Sprite = ["..rYyYr..", ".....r..."];
const SMALL: Sprite = [".c.", "cCc", ".c."];
/** A lone tree on the hill, under the kite string. */
const TREE: Sprite = [".eee.", "eeeee", "eeeee", "eeeee", ".eee.", "..w..", "..w..", "..w.."];
const DRAGON_HEAD: Sprite = ["gg.", "gKg", "ggg"];

const PALETTES: Record<ThemeMode, Record<string, string | null>> = {
  light: {
    h: "#8a6440", s: "#e8b48a", K: "#3b3540", c: "#4f8fd6", p: "#5a5a6a", r: "#d9534f", Y: "#f0dfae", y: "#fbf8f1",
    C: "#fbf8f1", g: "#5a9a5f", string: "#9a9aa2", hill: "#a8c98a", tail: "#d9534f", e: "#5a9a5f", w: "#8a6440",
    outline: "#9c958a",
  },
  dark: {
    h: "#a07b55", s: "#d9a57c", K: "#2d2833", c: "#6fa3e8", p: "#6a6a7a", r: "#e06a5f", Y: "#fbeccb", y: "#ece7dc",
    C: "#ece7dc", g: "#6aa86a", string: "#6a6a72", hill: "#3a4a34", tail: "#e06a5f", e: "#3f7a46", w: "#a07b55",
    outline: null,
  },
};
const paint = (rows: Sprite, theme: ThemeMode, flip = false, extra?: Record<string, string>) =>
  sprite(rows, { ...PALETTES[theme], ...extra }, flip, "syYC");

// -- State -------------------------------------------------------------------

interface State {
  kidX: number;
  /** The kite's resting place on the wind, and its loop (seconds in, or null). */
  homeX: number;
  homeY: number;
  loop: number | null;
  /** 0 = flying, 1 = down on the grass. */
  down: number;
  dragon: number | null;
  treeX: number;
}
/** A child thread, shown as another kite in its color. */
interface Kite { x: number; y: number; phase: number; rise: number }
type K = Kit<State, Kite>;

const LOOP_SECONDS = 0.9;
const loopIt = (s: State) => { if (s.loop !== null) return false; s.loop = 0; return true; };
/** Where the kite is now, in art px (its top-left). */
function kitePos(s: State, k: K): [number, number] {
  const still = k.reduced || k.mood.kind === "waiting";
  let x = s.homeX + (still ? 0 : Math.sin(k.t * 0.7) * 6);
  let y = s.homeY + (still ? 0 : Math.sin(k.t * 1.1) * 1.5);
  if (s.loop !== null && !k.reduced) {
    const a = (s.loop / LOOP_SECONDS) * Math.PI * 2;
    x += Math.sin(a) * 4;
    y += (1 - Math.cos(a)) * 2.5;
  }
  // Gags: snagged in the tree, dodging a bird, yanked up by a gust.
  const snag = k.gagging("snag");
  if (snag !== null) {
    const tx = s.treeX, ty = GROUND - 11;
    const q = snag < 0.25 ? snag / 0.25 : snag < 0.8 ? 1 : 1 - (snag - 0.8) / 0.2;
    x += (tx - x) * q + (snag > 0.25 && snag < 0.8 ? Math.sin(k.t * 18) * 0.5 : 0);
    y += (ty - y) * q;
  }
  const bird = k.gagging("bird");
  if (bird !== null) { x += Math.sin(k.t * 5) * 5 * Math.sin(Math.PI * bird); y += Math.sin(k.t * 7) * 1.5 * Math.sin(Math.PI * bird); }
  const gust = k.gagging("gust");
  if (gust !== null) y -= Math.sin(Math.PI * gust) * 2;
  const groundX = s.kidX + 8, groundY = GROUND - 2;
  return [x + (groundX - x) * s.down, y + (groundY - y) * s.down];
}

// -- The helper alert --------------------------------------------------------

const alert: AlertSpec = {
  layout: (members) => ({ width: 4 + members.length * 10, figures: rowOf(members, 4, 10, 3), extra: {} }),
  still(b, p) {
    const P = PALETTES[p.theme];
    b.fillStyle = P.hill!;
    b.fillRect(0, p.px(AG), p.layout.width * p.s, p.s);
    b.fillStyle = P.string!;
    for (const f of p.layout.figures) for (let r = 7; r < AG; r += 2) b.fillRect(p.px(f.x + 1), p.px(r), p.s, p.s);
  },
  // A small kite on its string with the amber "!"; failed, under a rain cloud.
  moving(v, p) {
    for (const [i, f] of p.layout.figures.entries()) {
      const sway = p.reduced ? 0 : Math.round(Math.sin(p.t * 1.4 + i) * 0.8 * p.s) / p.s;
      p.blit(v, paint(SMALL, p.theme, false, { c: "#d9534f" }), f.x + sway, 4);
      if (f.member.kind === "waiting") p.bang(v, f.x + 5, 1, p.t + i * 0.4);
      else p.failed(v, f.x, 0, p.t + i);
    }
  },
};

// -- The scene -------------------------------------------------------------

export const kites = defineScene<State, Kite>({
  id: "kites",
  name: "Kites",
  state: () => ({ kidX: 30, homeX: 60, homeY: 2, loop: null, down: 0, dragon: null, treeX: 0 }),

  layout(s, k) {
    const W = k.W;
    s.kidX = Math.floor(W * 0.2);
    s.homeX = Math.floor(W * (k.narrow ? 0.55 : 0.45));
    s.homeY = 2;
    s.treeX = Math.floor(W * (k.narrow ? 0.37 : 0.33));
  },
  mood(s, k) { if (k.mood.kind !== "rate") s.down = 0; },
  // A new run: the kite already up, mid-loop.
  start(s, k) { s.down = 0; if (k.mood.kind === "working") loopIt(s); },

  focus: (s, k) => kitePos(s, k)[0] + 2,

  crew: {
    max: (k) => (k.narrow ? 2 : 4),
    // Another kite rises into the sky at its own place on the wind.
    join(_s, k, _m, shown) {
      const spots = [0.62, 0.78, 0.9, 0.7].map((f) => Math.floor(f * k.W));
      return { x: spots[(shown - 1) % spots.length], y: [6, 8, 7, 6][(shown - 1) % 4], phase: Math.random() * 6, rise: k.reduced ? 1 : 0 };
    },
    // Finished: it drifts down and fades.
    leave() {},
  },

  step(s, k) { return k.mood.kind === "working" && loopIt(s); },

  surprise: {
    active: (s) => s.dragon !== null,
    start(s) { s.dragon = 0; },
  },

  hits(s, k) {
    const [kx, ky] = kitePos(s, k);
    const out: HitTarget[] = [
      { target: "lead", box: [kx, ky, 5, 5], at: [kx + 2, ky] },
      { target: "flock", id: "kid", box: [s.kidX, GROUND - 8, 5, 8], at: [s.kidX + 2, GROUND - 8] },
    ];
    for (const c of k.crew) if (!c.leaving) out.push({ target: "member", id: c.id, box: [c.x - 1, c.y - 1, 5, 5], at: [c.x + 1, c.y] });
    return out;
  },
  // The kite loops; the child shouts "♪ whee"; a crew kite flutters.
  tap(s, k, hit) {
    if (hit.target === "member") { const c = k.crew.find((m) => m.id === hit.id); if (c) k.react(c, TIME.tap); return; }
    if (hit.target === "lead") { k.react("kite", TIME.tap); if (!k.reduced && s.down === 0) loopIt(s); }
    else k.react("kid", TIME.tap);
  },

  errorCloudX: (s, k) => kitePos(s, k)[0] - 4,

  update(s, k, dt) {
    const mk = k.mood.kind;
    if (s.loop !== null && (s.loop += dt) > LOOP_SECONDS) s.loop = null;
    s.down = mk === "rate" ? Math.min(1, s.down + dt / 2.5) : 0;
    for (const c of k.crew) {
      if (c.leaving) { c.y += dt * 3; c.alpha -= dt / 1.5; continue; }
      c.rise = Math.min(1, c.rise + dt / 2);
    }
    if (s.dragon !== null && ((s.dragon += dt / 12) >= 1 || mk !== "working")) s.dragon = null;
  },

  settle(s, k) {
    s.loop = null;
    s.dragon = null;
    s.down = k.mood.kind === "rate" ? 1 : 0;
    k.crew = k.crew.filter((c) => !c.leaving);
    for (const c of k.crew) c.rise = 1;
  },

  draw(s, k) {
    const v = k.ctx, theme = k.theme, P = PALETTES[theme];
    const W = k.W, mk = k.mood.kind, t = k.t, e = k.evening(), season = k.season;
    const still = k.reduced || mk === "waiting";

    // The hill and the grass: cached.
    const back = k.layer("hill", `${W}:${theme}:${season}:${k.s3}`, v.canvas.width, v.canvas.height, (b) => {
      b.fillStyle = season === "winter" ? SNOW[theme] : P.hill!;
      for (let x = 0; x < W; x++) {
        const top = GROUND - Math.max(0, Math.round(3 - Math.abs(x - W * 0.2) * 0.06));
        b.fillRect(k.px(x), k.px(top), k.s3, (GROUND + 1 - top) * k.s3);
      }
      b.fillStyle = k.view.muted;
      b.globalAlpha = 0.35;
      b.fillRect(0, k.px(GROUND + 1), W * k.s3, k.s3);
      b.globalAlpha = 1;
      const tree = paint(TREE, theme, false, season === "winter" ? { e: SNOW[theme] } : season === "autumn" ? { e: "#d9772b" } : undefined);
      b.drawImage(tree, k.px(s.treeX - 3), k.px(GROUND - 9), tree.width * k.s3, tree.height * k.s3);
    });
    v.drawImage(back, 0, 0);
    if (e > 0.8) for (const [x, y] of [[W * 0.1, 1], [W * 0.34, 2], [W * 0.66, 1], [W - 7, 3]]) k.dot(Math.floor(x), y, theme === "dark" ? "#e8e2ff" : "#8f86c9");

    // The dragon kite: a long body of segments rippling behind its head.
    if (s.dragon !== null && !k.reduced) {
      const hx = W + 6 - s.dragon * (W + 40), hy = 2;
      for (let i = 1; i < 14; i++) k.dot(hx + 3 + i * 1.5, hy + 1 + Math.sin(t * 3 - i * 0.6) * 1.2, i % 3 ? P.g! : P.Y!);
      k.blit(paint(DRAGON_HEAD, theme), hx - 1, hy - 1 + Math.sin(t * 3) * 0.5);
    }

    // Crew kites on strings that run off the bottom of the strip.
    for (const c of k.crew) {
      const y = c.y + (1 - c.rise) * 8 + (still || c.kind !== "working" ? 0 : Math.sin(t * 1.3 + c.phase));
      const x = c.x + (still || c.kind !== "working" ? 0 : Math.sin(t * 0.9 + c.phase) * 2);
      const flutter = k.reaction(c) !== null ? Math.sin(t * 20) : 0;
      v.globalAlpha = Math.max(0, c.alpha) * 0.7;
      for (let r = Math.ceil(y + 3); r < GROUND + 2; r += 2) k.dot(x + 1 + (r - y) * 0.15, r, P.string!);
      v.globalAlpha = Math.max(0, Math.min(c.alpha, c.rise));
      k.blit(paint(SMALL, theme, false, { c: c.color }), x - 1 + flutter, y - 1);
      v.globalAlpha = 1;
      if (!c.leaving) k.marker(c.kind, x + 1, y - 5);
    }

    // The child, holding the string.
    const pose = mk === "rate" ? KID.sit : mk === "waiting" ? KID.front : KID.stand;
    const snag = k.gagging("snag"), gust = k.gagging("gust");
    const tug = snag !== null && snag > 0.25 && snag < 0.8 && Math.floor(k.t * 4) % 2 ? -1 : 0;   // leaning back, tugging
    const lift = gust !== null ? Math.round(Math.sin(Math.PI * gust) * 2) : 0;
    k.blit(paint(pose, theme, false, season === "winter" ? { c: "#c8553d" } : undefined), s.kidX - 1 + tug, GROUND - 8 - lift);
    if (gust !== null) {   // gusts streaking past
      v.fillStyle = k.view.muted;
      for (let i = 0; i < 4; i++) {
        v.globalAlpha = 0.5 * Math.sin(Math.PI * gust);
        const gx = ((gust * 2 + i * 0.27) % 1) * (W + 20) - 10, gy = 3 + i * 3;
        for (let d = 0; d < 5; d++) k.dot(gx + d, gy);
      }
      v.globalAlpha = 1;
    }

    // The string and the kite.
    const [kx, ky] = kitePos(s, k);
    if (s.down < 1) {
      const hx = s.kidX + 4, hy = GROUND - 5;
      const n = Math.ceil(Math.hypot(kx + 2 - hx, ky + 4 - hy) / 2);
      v.globalAlpha = 0.8;
      for (let i = 1; i < n; i++) {
        const f = i / n;
        const sag = Math.sin(Math.PI * f) * 2 * (1 - s.down);
        k.dot(hx + (kx + 2 - hx) * f, hy + (ky + 4 - hy) * f + sag, P.string!);
      }
      v.globalAlpha = 1;
      // The tail ribbon, waving.
      for (let i = 1; i <= 5; i++) k.dot(kx + 2 - i * 0.6, ky + 4 + i + (still ? 0 : Math.sin(t * 4 - i) * 0.8), P.tail!);
      if (mk !== "waiting" && e > 0.6) glow(v, k.view, kx + 2, ky + 2, 3, P.Y!, 0.6);
      k.blit(paint(KITE, theme), kx - 1, ky - 1);
      if (mk === "waiting") k.signal(kx + 2, ky + 2);
    } else {
      k.blit(paint(KITE_DOWN, theme), s.kidX + 5, GROUND - 2);
    }

    // The season, blowing past on the breeze.
    const drift: Record<string, [string, number]> = { spring: ["#f2a7c3", 4], autumn: ["#d9772b", 3], winter: [SNOW[theme], 6] };
    const d = drift[season];
    if (d) {
      const rnd = seeded(W + 21);
      for (let i = 0; i < d[1]; i++) {
        const x = k.reduced ? rnd() * W : (rnd() * W + t * 10) % W, y = 1 + rnd() * 11 + (k.reduced ? 0 : Math.sin(t + i) * 1.5);
        k.dot(x, y, d[0]);
      }
    }

    k.note("kite", "♪", kx + 2, ky - 1);
    k.note("kid", "♪ whee", s.kidX + 2, GROUND - 9);
    for (const c of k.crew) k.note(c, "♪", c.x + 1, c.y - 1);
  },

  motion(s, k): Motion {
    const mk = k.mood.kind;
    if (s.loop !== null || s.dragon !== null) return "fast";
    if (k.crew.some((c) => c.leaving || c.rise < 1)) return "fast";
    if (mk === "working") return "fast";
    if (mk === "rate") return s.down < 1 ? "fast" : "still";
    return mk === "idle" ? "still" : "slow";
  },

  gags: [
    // The kite dips into the tree and snags; the kid tugs and tugs until it pops free (see kitePos).
    { id: "snag", seconds: 4, ready: (s) => s.down === 0 },
    // A bird gives chase; the kite zigzags to dodge it.
    {
      id: "bird",
      seconds: 3.5,
      ready: (s) => s.down === 0,
      draw(s, k, p) {
        const [kx, ky] = kitePos(s, k);
        const lag = p < 0.15 ? (1 - p / 0.15) * 30 : p > 0.85 ? (p - 0.85) * 120 : 0;
        const bx = kx + 7 + lag + Math.sin(k.t * 5 - 0.6) * 2, by = ky + Math.sin(k.t * 7 - 0.6) - (p > 0.85 ? (p - 0.85) * 20 : 0);
        k.ctx.fillStyle = k.view.muted;
        const flap = Math.floor(k.t * 10) % 2;
        k.dot(bx, by + flap); k.dot(bx + 1, by + 1 - flap); k.dot(bx + 2, by + flap);
      },
    },
    // A gust lifts the kid a little off the ground (drawn with the kid).
    { id: "gust", seconds: 3, ready: (s) => s.down === 0 },
  ],

  alert,
});
