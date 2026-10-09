// Garden: a gardener tending a flower bed in front of a picket fence.
//
// Working: the gardener walks the bed and stops to water. A step: a flower
// blooms. Waiting on you: the gardener faces you holding a lantern that glows
// amber. Rate-limited: a nap on the bench, hat over the eyes. Error: the
// kit's rain cloud. Crew: bees in each helper's color, visiting the flowers.
// Long run: fireflies come out. Surprise: a hedgehog
// shuffles through. Taps: a wave, a flower sways, a bee buzzes. Seasons:
// snow on the fence, tulips in spring, sunflowers in summer, pumpkins in
// autumn. Gags: a mole pops up and steals a carrot behind the gardener's
// back; a hidden sprinkler surprises the gardener; the gardener sniffs a
// flower and sneezes. At rest between runs (scenes shown always): a nap on
// the bench, as when rate-limited.
import { defineScene, type HitTarget, type Kit } from "../kit/engine";
import { ALERT_GROUND as AG, rowOf, type AlertSpec } from "../kit/alert";
import { SNOW, floatNote, sprite, type Motion, type Sprite } from "../kit/common";
import { GROUND, SPEED, TIME } from "../kit/style";
import type { ThemeMode } from "../kit/types";

// -- Art ---------------------------------------------------------------------

const GARDENER = {
  walk1: [
    "..hhh...",
    ".hhhhh..",
    "..sss...",
    "..ssK...",
    "...s....",
    "..ggg.cc",
    ".gggggcc",
    "..ggg.c.",
    "..jjj...",
    "..j.j...",
    "..j.j...",
    ".bb.bb..",
  ],
  walk2: [
    "..hhh...",
    ".hhhhh..",
    "..sss...",
    "..ssK...",
    "...s....",
    "..ggg.cc",
    ".gggggcc",
    "..ggg.c.",
    "..jjj...",
    "..jj....",
    "..j.j...",
    "..bbb...",
  ],
  /** Watering: the can tipped forward. */
  water: [
    "..hhh....",
    ".hhhhh...",
    "..sss....",
    "..ssK....",
    "...s.....",
    "..gggg...",
    ".gggggccc",
    "..ggg.cc.",
    "..jjj....",
    "..j.j....",
    "..j.j....",
    ".bb.bb...",
  ],
  /** Facing you. */
  front: [
    "..hhhh..",
    ".hhhhhh.",
    "..ssss..",
    "..KssK..",
    "...ss...",
    ".gggggg.",
    "sggggggs",
    "..gggg..",
    "..jjjj..",
    "..j..j..",
    "..j..j..",
    ".bb..bb.",
  ],
  /** Napping on the bench, hat over the eyes. */
  nap: [
    "..........",
    "...hhhh...",
    "..hhhhhh..",
    "...sss....",
    "..gggg....",
    ".gggggg...",
    "..gggjjjj.",
    "wwwwwwwwjw",
    ".w....b.bw",
    ".w......w.",
  ],
} satisfies Record<string, Sprite>;
const GARDENER_W = 8;
const BUD: Sprite = [".q.", ".q.", ".e.", "le.", ".e."];
const BLOOM: Sprite = [".p.", "pyp", ".p.", "le.", ".e."];
const SUNFLOWER: Sprite = [".yyy.", "yynyy", ".yyy.", "..e..", ".le..", "..el.", "..e..", "..e.."];
const PUMPKIN: Sprite = [".e.", "ooo", "ooo"];
const BEE: Sprite = [".w.w.", "cKcKc", ".ccc."];
const HEDGEHOG: Sprite = ["..dddd..", ".dddddds", "ddddddKs", ".k...k.."];
const MOLE: Sprite = [".MM.", "MKMM", "MMMM"];
const CARROT: Sprite = ["e.e", ".e.", ".o."];
const SPRINKLER: Sprite = [".k.", "kkk"];

const PALETTES: Record<ThemeMode, Record<string, string | null>> = {
  light: {
    h: "#d9b45a", s: "#e8b48a", K: "#3b3540", g: "#5a8fc8", c: "#8a8f9a", j: "#4a5a7a", b: "#6b4a2f",
    w: "#a8875f", q: "#7aa35a", e: "#5a9a5f", l: "#7aa35a", y: "#f2c94c", n: "#8a6440", o: "#e8873a",
    d: "#9a7a5a", k: "#5a5f6a", M: "#5e5248", fence: "#d6cfbf", soil: "#b8936a", drop: "#7fb6f0",
    outline: "#9c958a",
  },
  dark: {
    h: "#e0c06a", s: "#d9a57c", K: "#2d2833", g: "#6fa3e8", c: "#a0a4ae", j: "#5f6f92", b: "#8a6440",
    w: "#c0915e", q: "#8fbf6a", e: "#4e8a55", l: "#6d9450", y: "#f2d06a", n: "#a07b55", o: "#f09a50",
    d: "#b8956a", k: "#a0a4ae", M: "#8a7a6c", fence: "#33333a", soil: "#5a4636", drop: "#a8d4ff",
    outline: null,
  },
};
/** Flower colors along the bed; tulip reds and pinks in spring. */
const PETALS = ["#e88bb0", "#d9534f", "#b07ad9", "#ee8a5a", "#f7f3e8"];
const TULIPS = ["#d9534f", "#e88bb0", "#ee8a5a", "#d9534f", "#f7c6d8"];
const paint = (rows: Sprite, theme: ThemeMode, flip = false, extra?: Record<string, string>) =>
  sprite(rows, { ...PALETTES[theme], ...extra }, flip, "sh");

// -- State -------------------------------------------------------------------

interface Flower { x: number; open: boolean; pop: number | null }
interface State {
  x: number;
  dir: 1 | -1;
  /** The flower the gardener is heading for, and how long it has watered there. */
  target: number;
  watering: number;
  flowers: Flower[];
  benchX: number;
  hedgehog: number | null;
}
/** A child thread, shown as a bee in its color. */
interface Bee { flower: number; phase: number; x: number; y: number }
type K = Kit<State, Bee>;

const WATER_SECONDS = 2.2;
/** Where the gardener stands to sit down: at the bench. */
const benchSpot = (s: State) => s.benchX;
/** On the bench: rate-limited, or resting between runs and arrived there. */
const napping = (s: State, k: K) => k.mood.kind === "rate" || (k.resting && (k.reduced || Math.abs(benchSpot(s) - s.x) <= 0.3));
const BLOOM_SECONDS = TIME.reaction;
const beeSpot = (s: State, b: Bee, t: number, still: boolean): [number, number] => {
  const f = s.flowers[b.flower % s.flowers.length];
  if (!f) return [b.x, b.y];
  const a = still ? b.phase : t * 1.4 + b.phase;
  return [f.x + 1 + Math.cos(a) * 4, GROUND - 7 + Math.sin(a * 2) * 1.5];
};
const bloom = (s: State) => {
  const buds = s.flowers.filter((f) => !f.open);
  if (buds.length === 0) {   // a full bed: a couple fade back to buds, so steps keep showing
    for (const f of [...s.flowers].sort(() => Math.random() - 0.5).slice(0, 2)) f.open = false;
    return bloom(s);
  }
  const f = buds.reduce((a, b) => (Math.abs(b.x - s.x) < Math.abs(a.x - s.x) ? b : a));
  f.open = true;
  f.pop = 0;
  return true;
};

// -- The helper alert --------------------------------------------------------

const alert: AlertSpec = {
  layout: (members) => ({ width: 4 + members.length * 11, figures: rowOf(members, 4, 11, 5), extra: {} }),
  still(b, p) {
    const P = PALETTES[p.theme];
    b.fillStyle = P.soil!;
    b.fillRect(0, p.px(AG), p.layout.width * p.s, p.s);
    for (const f of p.layout.figures) p.blit(b, paint(BLOOM, p.theme, false, { p: PETALS[0] }), f.x + 1, AG - 5);
  },
  // A bee over its flower with the amber "!"; failed, under a rain cloud.
  moving(v, p) {
    for (const [i, f] of p.layout.figures.entries()) {
      const hover = p.reduced ? 0 : Math.round(Math.sin(p.t * 3 + i) * 0.6 * p.s) / p.s;
      p.blit(v, paint(BEE, p.theme, false, { c: "#f2c94c" }), f.x, AG - 8 + hover);
      if (f.member.kind === "waiting") p.bang(v, f.x + 7, AG - 12, p.t + i * 0.4);
      else p.failed(v, f.x + 2, 0, p.t + i);
    }
  },
};

// -- The scene -------------------------------------------------------------

export const garden = defineScene<State, Bee>({
  id: "garden",
  name: "Garden",
  state: () => ({ x: 30, dir: 1, target: 0, watering: 0, flowers: [], benchX: 4, hedgehog: null }),

  layout(s, k) {
    const W = k.W;
    s.benchX = 3;
    const n = Math.max(4, Math.floor((W - 30) / 14));
    const opened = new Set(s.flowers.flatMap((f, i) => (f.open ? [i] : [])));
    s.flowers = Array.from({ length: n }, (_, i) => ({ x: Math.floor(18 + i * ((W - 36) / (n - 1 || 1))), open: opened.has(i) || i % 3 === 0, pop: null }));
    s.target = Math.min(s.target, n - 1);
    s.x = Math.min(s.x, W - GARDENER_W - 12);
  },
  // A new run: the gardener mid-bed, walking to the next flower, one just opening.
  start(s, k) {
    s.target = Math.floor(Math.random() * s.flowers.length);
    s.x = Math.max(12, Math.min(k.W - GARDENER_W - 12, s.flowers[s.target].x + (Math.random() < 0.5 ? -24 : 24)));
    s.dir = s.flowers[s.target].x > s.x ? 1 : -1;
    s.watering = 0;
    if (k.mood.kind === "working") bloom(s);
  },

  focus: (s, k) => (napping(s, k) ? s.benchX + 5 : s.x + GARDENER_W / 2),

  crew: {
    max: (k) => (k.narrow ? 2 : 4),
    // A bee flies in and visits a flower.
    join: (s, k, _m, shown) => ({ flower: (shown * 2 + 1) % Math.max(1, s.flowers.length), phase: Math.random() * 6, x: k.reduced ? k.W / 2 : -4, y: 3 }),
    // Finished: it flies off upward and fades.
    leave() {},
  },

  step(s, k) { return k.mood.kind === "working" && bloom(s); },

  surprise: {
    active: (s) => s.hedgehog !== null,
    start(s) { s.hedgehog = 0; },
  },

  hits(s, k) {
    const out: HitTarget[] = [napping(s, k)
      ? { target: "lead", box: [s.benchX, GROUND - 10, 10, 10], at: [s.benchX + 5, GROUND - 10] }
      : { target: "lead", box: [s.x, GROUND - 12, GARDENER_W, 12], at: [s.x + 4, GROUND - 12] }];
    for (const c of k.crew) if (!c.leaving) out.push({ target: "member", id: c.id, box: [c.x - 1, c.y - 1, 6, 4], at: [c.x + 2, c.y - 1] });
    s.flowers.forEach((f, i) => out.push({ target: "flock", id: String(i), box: [f.x, GROUND - 5, 3, 5], at: [f.x + 1, GROUND - 5] }));
    return out;
  },
  // A wave, a flower sways, a bee buzzes.
  tap(s, k, hit) {
    if (hit.target === "lead") k.react("gardener", TIME.tap);
    else if (hit.target === "member") { const c = k.crew.find((m) => m.id === hit.id); if (c) k.react(c, TIME.tap); }
    else { const f = s.flowers[Number(hit.id)]; if (f) k.react(f, TIME.tap); }
  },

  errorCloudX: (s, k) => (napping(s, k) ? s.benchX : s.x - 2),

  // Below the bed: soil, with the flowers' roots reaching down and a worm.
  below(s, k, b) {
    const P = PALETTES[k.theme], v = b.v, dark = k.theme === "dark", t = k.t;
    const rows = Math.round(Math.min(b.H, 10) * b.level);
    for (let y = 0; y < rows; y++) {
      v.globalAlpha = (dark ? 0.45 : 0.35) * (1 - y / 10);
      v.fillStyle = P.soil!;
      v.fillRect(0, b.px(y), b.W * b.s3, b.s3);
    }
    if (rows <= 0) return;
    v.globalAlpha = (dark ? 0.4 : 0.35) * b.level;
    v.fillStyle = P.l!;
    for (const f of s.flowers) for (let y = 0; y < Math.min(rows, 4); y++) b.dot(f.x + 1 + (y % 2 ? (f.x % 2 ? 1 : -1) : 0), y);
    if (rows > 5) {
      v.fillStyle = P.o!;
      const wx = (t * 1.5) % (b.W + 8) - 4;
      for (let i = 0; i < 4; i++) b.dot(wx + i, 6 + (Math.floor(t * 2 + i) % 2));
    }
    v.globalAlpha = 1;
  },

  update(s, k, dt) {
    const mk = k.mood.kind;
    for (const f of s.flowers) if (f.pop !== null && (f.pop += dt / BLOOM_SECONDS) >= 1) f.pop = null;
    if (mk === "working" && k.gagId) {
      // A gag holds the gardener still.
    } else if (mk === "working" && !k.resting) {
      const goal = s.flowers[s.target]?.x ?? s.x;
      const stand = goal - (s.dir > 0 ? GARDENER_W + 1 : -3);
      const dx = stand - s.x;
      if (Math.abs(dx) > 0.5 && s.watering === 0) {
        s.dir = dx > 0 ? 1 : -1;
        s.x += s.dir * Math.min(Math.abs(dx), SPEED.walk * 0.8 * dt);
      } else {
        // Arrived: water for a moment, then move on to another flower.
        s.watering += dt;
        if (s.watering > WATER_SECONDS) {
          s.watering = 0;
          let next = s.target;
          while (next === s.target && s.flowers.length > 1) next = Math.floor(Math.random() * s.flowers.length);
          s.target = next;
          s.dir = s.flowers[next].x > s.x ? 1 : -1;
        }
      }
    } else if (k.resting) {   // off to the bench for a nap
      s.watering = 0;
      const dx = benchSpot(s) - s.x;
      if (Math.abs(dx) > 0.3) { s.dir = dx > 0 ? 1 : -1; s.x += s.dir * Math.min(Math.abs(dx), SPEED.trot * dt); }
    }
    for (const c of k.crew) {
      if (c.leaving) { c.y -= dt * 4; c.alpha -= dt / 1.2; continue; }
      // Waiting or failed: it flies to its flower and holds there.
      const [tx, ty] = beeSpot(s, c, k.t, c.kind !== "working");
      c.x += (tx - c.x) * Math.min(1, dt * 3);
      c.y += (ty - c.y) * Math.min(1, dt * 3);
    }
    if (s.hedgehog !== null && ((s.hedgehog += dt / 12) >= 1 || mk !== "working")) s.hedgehog = null;
  },

  settle(s, k) {
    for (const f of s.flowers) f.pop = null;
    s.hedgehog = null;
    s.watering = 0;
    if (k.resting) s.x = benchSpot(s);
    k.crew = k.crew.filter((c) => !c.leaving);
    for (const c of k.crew) [c.x, c.y] = beeSpot(s, c, 0, true);
  },

  draw(s, k) {
    const v = k.ctx, theme = k.theme, P = PALETTES[theme];
    const W = k.W, mk = k.mood.kind, t = k.t, e = k.evening(), season = k.season;

    // The fence, the bed, the bench: cached.
    const back = k.layer("garden", `${W}:${theme}:${season}:${k.s3}`, v.canvas.width, v.canvas.height, (b) => {
      const s3 = k.s3;
      // The fence in short sections with gaps, kept soft behind the bed.
      b.fillStyle = P.fence!;
      b.globalAlpha = 0.75;
      for (let x0 = 1; x0 < W; x0 += 30) {
        const x1 = Math.min(W, x0 + 19);
        for (let x = x0; x < x1 - 1; x += 5) b.fillRect(k.px(x), k.px(GROUND - 8), 2 * s3, 8 * s3);
        b.fillRect(k.px(x0), k.px(GROUND - 6), (x1 - x0 - 1) * s3, s3);
        b.fillRect(k.px(x0), k.px(GROUND - 3), (x1 - x0 - 1) * s3, s3);
        if (season === "winter") { b.fillStyle = SNOW[theme]; for (let x = x0; x < x1 - 1; x += 5) b.fillRect(k.px(x), k.px(GROUND - 9), 2 * s3, s3); b.fillStyle = P.fence!; }
      }
      b.globalAlpha = 1;
      b.fillStyle = season === "winter" ? SNOW[theme] : P.soil!;
      b.fillRect(0, k.px(GROUND), W * s3, s3);
      b.fillStyle = k.view.muted;
      b.globalAlpha = 0.35;
      b.fillRect(0, k.px(GROUND + 1), W * s3, s3);
      b.globalAlpha = 1;
      const bench = paint(["wwwwwwwwww", ".w......w.", ".w......w."], theme);
      b.drawImage(bench, k.px(s.benchX - 1), k.px(GROUND - 4), bench.width * s3, bench.height * s3);
      if (season === "autumn") for (const x of [W * 0.3, W * 0.62]) { const c = paint(PUMPKIN, theme); b.drawImage(c, k.px(Math.floor(x) - 1), k.px(GROUND - 3), c.width * s3, c.height * s3); }
    });
    v.drawImage(back, 0, 0);

    // The flowers: buds and blooms, sunflowers at the ends in summer.
    const petals = season === "spring" ? TULIPS : PETALS;
    for (const [i, f] of s.flowers.entries()) {
      const sway = k.reaction(f);
      const dx = sway === null ? 0 : Math.round(Math.sin((sway / TIME.tap) * Math.PI * 4) * (1 - sway / TIME.tap));
      const big = season === "summer" && (i === 0 || i === s.flowers.length - 1);
      if (big) { k.blit(paint(SUNFLOWER, theme), f.x - 2 + dx, GROUND - 8); continue; }
      const grow = f.pop === null ? 1 : f.pop;
      k.blit(paint(f.open && grow > 0.3 ? BLOOM : BUD, theme, false, { p: petals[i % petals.length] }), f.x - 1 + dx, GROUND - 5);
      if (f.pop !== null) {   // a little sparkle as it opens
        v.globalAlpha = 1 - f.pop;
        for (const [ox, oy] of [[-1, -1], [3, -1], [1, -2]]) k.dot(f.x + ox, GROUND - 5 + oy - f.pop * 2, P.y!);
        v.globalAlpha = 1;
      }
      if (season === "winter") k.dot(f.x + 1, GROUND - 5, SNOW[theme]);
    }

    // The rare hedgehog, shuffling along the front.
    if (s.hedgehog !== null && !k.reduced) k.blit(paint(HEDGEHOG, theme), -8 + s.hedgehog * (W + 16), GROUND - 4);

    // The gardener: walking, watering, facing you, or napping on the bench.
    if (napping(s, k)) {
      k.blit(paint(GARDENER.nap, theme), s.benchX - 1, GROUND - 11);
    } else {
      const watering = mk === "working" && !k.resting && s.watering > 0;
      const walking = mk === "working" && !watering && !k.reduced;   // including the walk to the bench
      const mole = k.gagging("mole"), sprinkler = k.gagging("sprinkler"), sneeze = k.gagging("sneeze");
      const facing = (mole !== null && mole > 0.85) || (sprinkler !== null && sprinkler > 0.3);
      const leaning = sneeze !== null && sneeze > 0.15 && sneeze < 0.5;
      const pose = mk === "waiting" || facing ? GARDENER.front : leaning ? GARDENER.water
        : watering && !k.gagId ? GARDENER.water : walking && !k.gagId && Math.floor(t / TIME.beat) % 2 ? GARDENER.walk2 : GARDENER.walk1;
      // A start at the sprinkler, a jolt back from a sneeze.
      const jump = sprinkler !== null && sprinkler > 0.3 && sprinkler < 0.45 ? 2 : 0;
      const jolt = sneeze !== null && sneeze > 0.5 && sneeze < 0.65 ? -s.dir * 2 : 0;
      k.blit(paint(pose, theme, mk !== "waiting" && !facing && s.dir < 0), s.x - 1 + jolt, GROUND - 12 - jump);
      if (mk === "waiting") {   // a lantern held out in the right hand, glowing amber
        k.dot(s.x + 7, GROUND - 6, P.k!);
        k.signal(s.x + 7, GROUND - 5);
      }
      if (watering && !k.reduced && !k.gagId) {   // drops from the can's spout
        const sx = s.dir > 0 ? s.x + 9 : s.x - 2;
        v.fillStyle = P.drop!;
        for (let i = 0; i < 3; i++) k.dot(sx + (s.dir > 0 ? i % 2 : -(i % 2)), GROUND - 6 + ((t * 8 + i * 1.3) % 4));
      }
    }

    // The crew: bees in each helper's color.
    for (const c of k.crew) {
      v.globalAlpha = Math.max(0, c.alpha);
      const buzz = k.reaction(c) !== null ? Math.sin(t * 30) * 0.6 : 0;
      k.blit(paint(BEE, theme, false, { c: c.color }), c.x - 1 + buzz, c.y - 1);
      v.globalAlpha = 1;
      if (!c.leaving) k.marker(c.kind, c.x + 2, c.y - 5);
    }

    // Fireflies at dusk.
    if (e > 0.5) k.fireflies(23, 4, 3, 6);

    // Tap notes.
    k.note("gardener", "♪ hello", napping(s, k) ? s.benchX + 5 : s.x + 4, GROUND - 13);
    for (const f of s.flowers) k.note(f, "♪", f.x + 1, GROUND - 6);
    for (const c of k.crew) k.note(c, "♪ bzz", c.x + 2, c.y - 2);
  },

  motion(s, k): Motion {
    const mk = k.mood.kind;
    if (s.flowers.some((f) => f.pop !== null) || s.hedgehog !== null) return "fast";
    if (k.crew.some((c) => c.leaving) || (mk !== "idle" && k.crew.some((c) => c.kind === "working"))) return "fast";
    if (k.resting) return napping(s, k) ? (k.evening() > 0.5 ? "slow" : "still") : "fast";   // napping: only the fireflies move
    if (mk === "working") return "fast";
    // The held lantern's pulse, the rain: gentle. A nap on the bench is still.
    return mk === "waiting" || mk === "error" ? "slow" : "still";
  },

  gags: [
    // Behind the gardener's back, a mole pops up and makes off with a carrot.
    {
      id: "mole",
      seconds: 3.5,
      draw(s, k, p) {
        const x = s.dir > 0 ? s.x - 8 : s.x + GARDENER_W + 4;
        if (p < 0.55) k.blit(paint(CARROT, k.theme), x - 1, GROUND - 4);
        const up = p < 0.2 ? p / 0.2 : p < 0.55 ? 1 : p < 0.75 ? 1 - (p - 0.55) / 0.2 : 0;
        if (up > 0) {
          const rows = Math.max(1, Math.round(up * 3));
          const c = paint(MOLE, k.theme);
          k.ctx.drawImage(c, 0, 0, c.width, rows + 1, k.px(x - 2), k.px(GROUND - rows - 1), c.width * k.s3, (rows + 1) * k.s3);
          if (p > 0.55) k.dot(x, GROUND - rows, PALETTES[k.theme].o!);   // the carrot going down with it
        }
        // The hole it leaves.
        if (p > 0.15) { k.dot(x - 1, GROUND, PALETTES[k.theme].d!); k.dot(x, GROUND, PALETTES[k.theme].d!); k.dot(x + 1, GROUND, PALETTES[k.theme].d!); }
      },
    },
    // A sprinkler hidden in the bed pops up and sprays the gardener.
    {
      id: "sprinkler",
      seconds: 3,
      draw(s, k, p) {
        const P = PALETTES[k.theme], x = s.x + GARDENER_W / 2 + s.dir * 7;
        if (p < 0.12) return;
        k.blit(paint(SPRINKLER, k.theme), x - 2, GROUND - 2);
        if (p > 0.85) return;
        k.ctx.fillStyle = P.drop!;
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI + k.t * 3, r = 2 + ((k.t * 9 + i * 1.7) % 5);
          k.dot(x + Math.cos(a) * r, GROUND - 2 - Math.abs(Math.sin(a)) * r * 1.2);
        }
      },
    },
    // The gardener leans in to sniff a flower, then sneezes.
    {
      id: "sneeze",
      seconds: 3.5,
      draw(s, k, p) {
        if (p > 0.48 && p < 0.9) floatNote(k.ctx, k.view, "♪ achoo", s.x + 4, GROUND - 13, (p - 0.48) / 0.42);
        if (p > 0.5 && p < 0.75) {   // a couple of petals blown off
          const q = (p - 0.5) / 0.25, fx = s.dir > 0 ? s.x + GARDENER_W + 2 : s.x - 3;
          for (let i = 0; i < 2; i++) k.dot(fx + s.dir * q * (4 + i * 3), GROUND - 5 - q * 3 + i, PETALS[0]);
        }
      },
    },
  ],

  alert,
});
