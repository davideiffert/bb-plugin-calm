// Train: a little steam train puffing across the countryside.
//
// Working: the train runs along the line, smoke rising from its stack, and
// comes round again. A step: a big white puff from the whistle. Waiting on
// you: it pulls up at a signal that glows amber, its headlamp dark. Rate-limited: stopped at a
// red signal, no steam. Error: the kit's rain cloud. Crew: a car for each
// helper, painted in its color, coupled behind the coach. Long run: the
// windows and the headlamp light up. Surprise: a far train on the hills.
// Taps: "♪ toot", "♪ moo" from the cows in the field. Seasons: the trees
// blossom in spring, go green in summer and orange in autumn, and snow
// covers the ground in winter. Gags: a cow stands on the tracks, so the
// train stops, toots, and waits for it to amble off; the conductor's hat
// blows off and lands on the last car; a long whistle puffs steam into a
// heart. At rest between runs (scenes shown always): it eases to a stop in
// plain view, headlamp off, with a thin wisp from the stack now and then.
import { defineScene, type HitTarget, type Kit } from "../kit/engine";
import { ALERT_GROUND as AG, rowOf, type AlertSpec } from "../kit/alert";
import { SNOW, floatNote, glow, seeded, sprite, type Motion, type Sprite } from "../kit/common";
import { CREAM, GROUND, SPEED, TIME } from "../kit/style";
import type { ThemeMode } from "../kit/types";

// -- Art ---------------------------------------------------------------------

const ENGINE: Sprite = [
  "..kk.........",
  "..kk....RRRR.",
  ".kkkk...RwwR.",
  "BBBBBBBBRRRRR",
  "BBBBBBBBBBBBB",
  "BlBBBBBBBBBBB",
  "BBBBBBBBBBBBB",
  ".oo...o..o...",
];
const ENGINE_W = 13;
const TENDER: Sprite = [".......", "BBBBBBB", "BBBBBBB", ".o...o."];
const CAR: Sprite = [
  "...........",
  "ccccccccccc",
  "cwwcwwcwwcc",
  "ccccccccccc",
  ".o.......o.",
];
const CAR_W = 11;
const COW: Sprite = [".mmmmh", "mKmmmhh", "mmmKm..", "k.k.k.."];
const FAR_TRAIN: Sprite = ["fff.ff.ff", "fff.ff.ff"];
const PUFF: Sprite = [".pp.", "pppp", ".pp."];
const BIG_PUFF: Sprite = ["..pp..", ".pppp.", "pppppp", ".pppp."];
const HEART: Sprite = [".pp.pp.", "ppppppp", "ppppppp", ".ppppp.", "..ppp..", "...p..."];
const SIGNAL: Sprite = ["kkkk", "kaak", "kaak", "kkkk", ".k..", ".k..", ".k..", ".k.."];
const TREE: Sprite = [".ttt.", "ttttt", "ttttt", ".ttt.", "..b..", "..b.."];

const PALETTES: Record<ThemeMode, Record<string, string | null>> = {
  light: {
    B: "#3f4a5a", R: "#c8553d", w: "#e9e4d6", l: "#d9cfae", k: "#5a5f6a", o: "#3b3540",
    c: "#8a7d6a", m: "#fbf8f1", K: "#3b3540", h: "#c9b28a", f: "#c3c7d3", p: "#b4b9c4",
    a: "#d9534f", t: "#5a9a5f", b: "#8a6440", hill: "#dfe6d8", rail: "#8a8a93", tie: "#a8875f", lit: CREAM.light,
    outline: "#8a8478",
  },
  dark: {
    B: "#55627a", R: "#d86a50", w: "#2d2833", l: "#8a8676", k: "#a0a4ae", o: "#22202a",
    c: "#a0927c", m: "#ece7dc", K: "#4a4452", h: "#b39d78", f: "#4a5060", p: "#d8d8de",
    a: "#e06a5f", t: "#4e8a55", b: "#a07b55", hill: "#2c3430", rail: "#8a8a93", tie: "#7d6040", lit: CREAM.dark,
    outline: null,
  },
};
const SEASON_TREE: Record<string, string> = { spring: "#f2a7c3", summer: "#3f8a4a", autumn: "#d9772b", winter: "#b9c7da", none: "#5a9a5f" };
const paint = (rows: Sprite, theme: ThemeMode, extra?: Record<string, string>, flip = false) =>
  sprite(rows, { ...PALETTES[theme], ...extra }, flip, "mwp");

// -- State -------------------------------------------------------------------

interface State {
  /** The engine's front, in art px; the train wraps around the strip. */
  x: number;
  speed: number;
  puffs: { x: number; y: number; k: number; big: boolean }[];
  sinceSmoke: number;
  cows: number[];
  trees: number[];
  hills: number[];
  farTrain: number | null;
  /** Where a gag's cow stands on the line (unwrapped, like `x`). */
  gagX: number;
}
/** A child thread, shown as a car in its color. */
interface Car { fade: number }
type K = Kit<State, Car>;

const RUN = SPEED.drift * 1.6;
const lengthOf = (k: K) => ENGINE_W + 8 + CAR_W + 1 + k.crew.length * (CAR_W + 1);
const wrapX = (s: State, k: K, x: number) => {
  const span = k.W + lengthOf(k) + 8;
  return ((x % span) + span) % span;
};
/** The funnel sits near the front of the engine. */
const FUNNEL = 3;
const whistle = (s: State) => s.puffs.push({ x: s.x - FUNNEL - 2, y: GROUND - 11, k: 0, big: true });

// -- The helper alert --------------------------------------------------------

const alert: AlertSpec = {
  layout: (members) => ({ width: 3 + members.length * (CAR_W + 3), figures: rowOf(members, 3, CAR_W + 3, CAR_W), extra: {} }),
  still(b, p) {
    const P = PALETTES[p.theme];
    b.fillStyle = P.rail!;
    b.fillRect(0, p.px(AG), p.layout.width * p.s, p.s);
    b.fillStyle = P.tie!;
    for (let x = 1; x < p.layout.width; x += 4) b.fillRect(p.px(x), p.px(AG + 1), 2 * p.s, p.s);
    for (const f of p.layout.figures) p.blit(b, paint(CAR, p.theme), f.x, AG - 5);
  },
  // A car with its amber "!"; failed, under a rain cloud.
  moving(v, p) {
    for (const [i, f] of p.layout.figures.entries()) {
      if (f.member.kind === "waiting") p.bang(v, f.x + 5, AG - 11, p.t + i * 0.4);
      else p.failed(v, f.x + 4, 0, p.t + i);
    }
  },
};

// -- The scene -------------------------------------------------------------

export const train = defineScene<State, Car>({
  id: "train",
  name: "Train",
  state: () => ({ x: 60, speed: RUN, puffs: [], sinceSmoke: 0, cows: [], trees: [], hills: [], farTrain: null, gagX: 0 }),

  layout(s, k) {
    const W = k.W;
    const rnd = seeded(W * 9 + 1);
    s.cows = [0.3, 0.68].map((f) => Math.floor(f * W + rnd() * 10));
    s.trees = [0.12, 0.48, 0.86].map((f) => Math.floor(f * W));
    s.hills = Array.from({ length: W }, (_, x) => 9 + Math.round(Math.sin(x * 0.04 + 1) * 1.2 + Math.sin(x * 0.11) * 0.5));
  },
  // A new run: the train already under way, mid-strip, puffing.
  start(s, k) {
    s.x = k.W * (0.35 + Math.random() * 0.4);
    s.speed = RUN;
    s.puffs = [{ x: s.x - FUNNEL - 4, y: GROUND - 10, k: 0.3, big: false }, { x: s.x - FUNNEL - 10, y: GROUND - 12, k: 0.6, big: false }];
  },

  focus: (s, k) => Math.max(0, Math.min(k.W, wrapX(s, k, s.x) - ENGINE_W / 2)),

  crew: {
    max: (k) => (k.narrow ? 2 : 4),
    // A new car couples on behind the coach, fading in.
    join: (_s, k) => ({ fade: k.reduced ? 1 : 0 }),
    // Finished: the car uncouples and fades away; the train closes up.
    leave() {},
  },

  step(s, k) {
    if (k.mood.kind !== "working" || s.puffs.some((p) => p.big)) return false;
    whistle(s);
    return true;
  },

  surprise: {
    active: (s) => s.farTrain !== null,
    start(s) { s.farTrain = 0; },
  },

  hits(s, k) {
    const front = wrapX(s, k, s.x);
    const out: HitTarget[] = [{ target: "lead", box: [front - ENGINE_W, GROUND - 8, ENGINE_W, 8], at: [front - ENGINE_W / 2, GROUND - 8] }];
    let x = front - ENGINE_W - 8 - (CAR_W + 1);
    for (const c of k.crew) {
      x -= CAR_W + 1;
      if (!c.leaving) out.push({ target: "member", id: c.id, box: [x, GROUND - 5, CAR_W, 5], at: [x + CAR_W / 2, GROUND - 5] });
    }
    s.cows.forEach((cx, i) => out.push({ target: "flock", id: String(i), box: [cx, GROUND - 5, 7, 4], at: [cx + 3, GROUND - 5] }));
    return out;
  },
  // "♪ toot" with a puff, "♪ moo", or a car's windows wink.
  tap(s, k, hit) {
    if (hit.target === "lead") { k.react("engine", TIME.tap); if (!k.reduced) whistle(s); }
    else if (hit.target === "member") { const c = k.crew.find((m) => m.id === hit.id); if (c) k.react(c, TIME.tap); }
    else k.react(`cow${hit.id}`, TIME.tap);
  },

  errorCloudX: (s, k) => wrapX(s, k, s.x) - ENGINE_W,

  update(s, k, dt) {
    const mk = k.mood.kind;
    // Running while working. Otherwise it rolls on until the engine is in
    // plain view, then eases to a stop.
    const front = wrapX(s, k, s.x);
    const inView = front > Math.min(k.W * 0.3, ENGINE_W + 30) && front < k.W - 8;
    // Coming round to be seen, it hurries a little.
    const cow = k.gagging("cow");
    const target = mk === "working" && !k.resting ? (cow !== null && cow < 0.82 ? 0 : RUN) : s.speed > 0 && !inView ? RUN * 2.2 : 0;
    s.speed += (target - s.speed) * Math.min(1, dt * (target ? 0.8 : 2.4));
    if (s.speed < 0.05 && !target) s.speed = 0;
    s.x += s.speed * dt;
    // Smoke from the stack while it runs.
    s.sinceSmoke += dt;
    if (s.speed > 0.3 && s.sinceSmoke > 0.7) { s.sinceSmoke = 0; s.puffs.push({ x: s.x - FUNNEL - 1, y: GROUND - 10, k: 0, big: false }); }
    // Standing at rest, the banked fire sends up a thin wisp every few seconds.
    if (k.resting && s.speed === 0 && s.sinceSmoke > 4) { s.sinceSmoke = 0; s.puffs.push({ x: s.x - FUNNEL - 1, y: GROUND - 10, k: 0.5, big: false }); }
    for (const p of s.puffs) { p.k += dt / (p.big ? 1.6 : 2.4); p.y -= dt * (p.big ? 2.5 : 2); p.x -= dt * (1 + s.speed * 0.3); }
    s.puffs = s.puffs.filter((p) => p.k < 1);
    for (const c of k.crew) {
      if (c.leaving) c.alpha -= dt / 1.2;
      else c.fade = Math.min(1, c.fade + dt);
    }
    if (s.farTrain !== null && ((s.farTrain += dt / 14) >= 1 || mk !== "working")) s.farTrain = null;
  },

  settle(s, k) {
    s.puffs = [];
    s.farTrain = null;
    s.speed = k.mood.kind === "working" && !k.resting ? RUN : 0;
    // A still picture shows the engine: bring it into view.
    const front = wrapX(s, k, s.x);
    if (front < ENGINE_W + 30 || front > k.W - 8) s.x = k.W * 0.6;
    k.crew = k.crew.filter((c) => !c.leaving);
    for (const c of k.crew) c.fade = 1;
  },

  draw(s, k) {
    const v = k.ctx, theme = k.theme, P = PALETTES[theme];
    const W = k.W, mk = k.mood.kind, t = k.t, e = k.evening(), season = k.season;

    // Hills, trees, the line: cached, they only change with size, theme, and season.
    const back = k.layer("land", `${W}:${theme}:${season}:${k.s3}`, v.canvas.width, v.canvas.height, (b) => {
      const s3 = k.s3;
      b.fillStyle = P.hill!;
      for (let x = 0; x < W; x++) b.fillRect(k.px(x), k.px(s.hills[x]), s3, (GROUND - s.hills[x]) * s3);
      for (const x of s.trees) { const c = paint(TREE, theme, { t: SEASON_TREE[season] ?? P.t! }); b.drawImage(c, k.px(x - 1), k.px(GROUND - 7), c.width * s3, c.height * s3); }
      if (season === "winter") { b.fillStyle = SNOW[theme]; b.fillRect(0, k.px(GROUND), W * s3, s3); }
      b.fillStyle = P.tie!;
      for (let x = 0; x < W; x += 4) b.fillRect(k.px(x), k.px(GROUND + 1), 2 * s3, s3);
      b.fillStyle = P.rail!;
      b.fillRect(0, k.px(GROUND), W * s3, s3);
    });
    // The far train on the hills, before the near layer.
    if (s.farTrain !== null && !k.reduced) {
      const fx = W + 4 - s.farTrain * (W + 20);
      const hy = s.hills[Math.max(0, Math.min(W - 1, Math.floor(fx)))] - 2;
      v.globalAlpha = 0.8;
      k.blit(paint(FAR_TRAIN, theme), fx, hy);
      v.globalAlpha = 1;
    }
    v.drawImage(back, 0, 0);

    // Cows in the field.
    for (const [i, cx] of s.cows.entries()) k.blit(paint(COW, theme), cx - 1, GROUND - 5);

    // The train: engine, tender, coach, then a car per helper.
    const front = wrapX(s, k, s.x);
    const span = W + lengthOf(k) + 8;
    const jig = k.reduced || s.speed < 0.3 ? 0 : (Math.floor(t * 6) % 2) * 0.34;
    const lit = e > 0.5;
    const lamp = lit && mk !== "waiting" && !k.resting;   // the headlamp goes dark while the signal is amber, and at rest
    const draw = (rows: Sprite, x: number, y: number, extra?: Record<string, string>, alpha = 1, flip = false) => {
      for (const off of [0, -span]) {   // drawn twice so it wraps cleanly off the right edge
        const xx = x + off;
        if (xx > W + 2 || xx + 14 < -2) continue;
        v.globalAlpha = alpha;
        k.blit(paint(rows, theme, extra, flip), xx - 1, y - 1);
        v.globalAlpha = 1;
      }
    };
    const win = lit ? { w: P.lit! } : undefined;
    // The engine faces its way: funnel and headlamp in front, the cab behind.
    draw(ENGINE, front - ENGINE_W, GROUND - 8 - jig, lit ? { w: P.lit!, ...(lamp ? { l: P.lit! } : {}) } : undefined, 1, true);
    if (lamp) glow(v, k.view, front - 2, GROUND - 3, 3, P.lit!, (e - 0.5) * 1.4);
    draw(TENDER, front - ENGINE_W - 8, GROUND - 4 - jig);
    let x = front - ENGINE_W - 8 - (CAR_W + 1);
    draw(CAR, x, GROUND - 5 - jig, win);
    for (const c of k.crew) {
      x -= CAR_W + 1;
      const wink = k.reaction(c) !== null && Math.floor(t * 8) % 2 === 0;
      draw(CAR, x, GROUND - 5 - jig, { c: c.color, ...(lit || wink ? { w: P.lit! } : {}) }, Math.max(0, Math.min(c.alpha, c.fade)));
      if (!c.leaving && x > -CAR_W && x < W) k.marker(c.kind, x + 5, GROUND - 11);
    }

    // The signal ahead of the engine: amber while waiting on you, red when resting.
    if (mk === "waiting" || mk === "rate") {
      const sx = Math.min(W - 5, front + 3);
      k.blit(paint(SIGNAL, theme, { a: mk === "waiting" ? P.o! : P.a! }), sx - 1, GROUND - 9);
      if (mk === "waiting") k.signal(sx, GROUND - 8);
      else glow(v, k.view, sx + 0.5, GROUND - 7.5, 2, P.a!, 0.8);
    }

    // Steam: small puffs from the stack, a big one from the whistle.
    for (const p of s.puffs) {
      v.globalAlpha = (1 - p.k) * 0.85;
      const px = wrapX(s, k, p.x);
      k.blit(paint(p.big ? BIG_PUFF : PUFF, theme), px - 1, p.y - 1);
      v.globalAlpha = 1;
    }
    if (season === "spring" && !k.reduced) {   // a blossom petal drifting
      k.dot((t * 4) % W, 5 + Math.sin(t) * 2, "#f2a7c3");
    }

    // Tap notes.
    k.note("engine", "♪ toot", front - 6, GROUND - 9);
    s.cows.forEach((cx, i) => k.note(`cow${i}`, "♪ moo", cx + 3, GROUND - 6));
  },

  motion(s, k): Motion {
    // Standing at rest, the odd wisp from the stack is a gentle change, not motion.
    if (k.resting && s.speed === 0 && s.farTrain === null && !k.crew.some((c) => c.leaving || c.fade < 1)) return "slow";
    if (s.speed > 0 || s.puffs.length || s.farTrain !== null) return "fast";
    if (k.crew.some((c) => c.leaving || c.fade < 1)) return "fast";
    // A blinking signal, the rain: gentle. A resting train at a red signal is still.
    const mk = k.mood.kind;
    return mk === "waiting" || mk === "error" || k.resting ? "slow" : "still";
  },

  gags: [
    // A cow wanders onto the line; the train stops, toots, and waits for it to amble off.
    {
      id: "cow",
      seconds: 4,
      ready: (s, k) => { const f = wrapX(s, k, s.x); return f > ENGINE_W + 10 && f < k.W - 40; },
      start(s) { s.gagX = s.x + 13; },
      draw(s, k, p) {
        const x0 = wrapX(s, k, s.gagX);
        // It steps down from the field onto the line, stands there, then ambles off ahead.
        const step = p > 0.62 ? (p - 0.62) * 40 : 0;
        const y = p < 0.2 ? GROUND - 5 + p / 0.2 : p > 0.62 ? GROUND - 4 - Math.min(1, (p - 0.62) / 0.3) : GROUND - 4;
        k.blit(paint(COW, k.theme), x0 + step - 1, y - 1);
        if (p > 0.3 && p < 0.62) floatNote(k.ctx, k.view, "♪ toot", wrapX(s, k, s.x) - 6, GROUND - 9, (p - 0.3) / 0.32);
      },
    },
    // A gust lifts the conductor's hat off the cab; it tumbles back and lands on the last car.
    {
      id: "hat",
      seconds: 3.5,
      draw(s, k, p) {
        const P = PALETTES[k.theme], front = wrapX(s, k, s.x);
        const cabX = front - ENGINE_W + 2, cabY = GROUND - 9;
        const lastX = front - ENGINE_W - 8 - (CAR_W + 1) * (1 + k.crew.length) + 4, lastY = GROUND - 6;
        let hx = cabX, hy = cabY;
        if (p > 0.12) {
          const q = Math.min(1, (p - 0.12) / 0.6);
          hx = cabX + (lastX - cabX) * q;
          hy = cabY + (lastY - cabY) * q - Math.sin(Math.PI * q) * 5;
        }
        const tumble = p > 0.12 && p < 0.72 && Math.floor(k.t * 8) % 2;
        k.dot(hx, hy, P.B!); k.dot(hx + 1, hy, P.B!); k.dot(hx + (tumble ? 0 : 2), hy + (tumble ? -1 : 0), P.B!);
        k.dot(hx + 1, hy - 1, P.B!);
      },
    },
    // A long whistle: the steam rises in the shape of a heart.
    {
      id: "heart",
      seconds: 3.5,
      draw(s, k, p) {
        if (p < 0.1) return;
        const front = wrapX(s, k, s.x), q = (p - 0.1) / 0.9;
        const v = k.ctx;
        v.globalAlpha = Math.min(1, (1 - q) * 1.6) * 0.9;
        k.blit(paint(HEART, k.theme), front - FUNNEL - 4 - q * 6, GROUND - 16 - q * 2);
        v.globalAlpha = 1;
        if (q < 0.6) floatNote(v, k.view, "♪ tooooot", front - 6, GROUND - 9, q / 0.6);
      },
    },
  ],

  alert,
});
