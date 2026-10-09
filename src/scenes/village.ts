// Snowy village: a child with a sled among snow-roofed cottages and a
// little clock tower, snow always falling.
//
// Working: the child walks the lane, sled behind, chimneys smoking. A step:
// a snowball arcs and lands with a puff. Waiting on you: the child runs to
// the clock tower and faces you, and the tower's window glows amber. Rate-limited: everyone's gone
// indoors; one window glows. Error: the kit's rain cloud. Crew: snowmen in
// each helper's colored scarf. Long run: the windows and the lamp light up.
// Surprise: a sleigh crosses the sky. Taps: "♪ wheee", a snowman's scarf
// flutters, a chimney puffs. Seasons: it is always winter here. Gags: a
// snowball knocks snow off a roof onto a cat; the kid slips on ice, lands on
// the sled, and slides off; a snowman's head rolls off and the kid puts it
// back on. At rest between runs (scenes shown always): everyone's indoors
// and a window glows, as when rate-limited, while the snow and the chimney
// smoke carry on.
import { defineScene, type HitTarget, type Kit } from "../kit/engine";
import { ALERT_GROUND as AG, rowOf, type AlertSpec } from "../kit/alert";
import { SNOW, glow, seeded, sprite, type Motion, type Sprite } from "../kit/common";
import { CREAM, GROUND, SPEED, TIME } from "../kit/style";
import type { ThemeMode } from "../kit/types";

// -- Art ---------------------------------------------------------------------

const CHILD = {
  walk1: [".hh..", "hhhh.", ".ss..", ".sK..", "cccc.", "ccccs", ".cc..", ".b.b."],
  walk2: [".hh..", "hhhh.", ".ss..", ".sK..", "cccc.", "ccccs", ".cc..", "..bb."],
  front: [".hhh.", "hhhhh", ".sss.", ".KsK.", "ccccc", "sccccs", ".ccc.", ".b.b."],
  /** Sitting on the sled, feet out front. */
  sit: [".hh...", "hhhh..", ".ss...", ".sK...", "cccc..", "ccccbb"],
} satisfies Record<string, Sprite>;
const CHILD_W = 5;
const SLED: Sprite = ["kwwwww", ".k...k"];
const HOUSE: Sprite = [
  "....nn.......",
  "..snnsssss...",
  ".sssssssssss.",
  "sssssssssssss",
  ".rrrrrrrrrrr.",
  ".rwwrrrrwwrr.",
  ".rwwrrddrwwr.",
  ".rrrrrddrrrr.",
];
const TOWER: Sprite = [
  "..ss..",
  ".ssss.",
  "ssssss",
  ".tttt.",
  ".taat.",
  ".taat.",
  ".tttt.",
  ".tddt.",
  ".tddt.",
];
const SNOWMAN: Sprite = [".kk.", ".kk.", ".mm.", "mKmm", ".cc.", "mmmm", "mmmm", ".mm."];
const SNOWMAN_W = 4;
const CAT: Sprite = ["g..g", "gggg", "gKgK", "gggg"];
const SNOWMAN_PLAIN: Sprite = [".mm.", "mKmm", ".mm.", "mmmm", "mmmm", ".mm."];
const LAMP: Sprite = ["kkk", "klk", ".k.", ".k.", ".k.", ".k.", ".k.", "kkk"];
const SLEIGH: Sprite = ["d.d....", "ddd.rrr", ".d..rrr", "d.d.k.k"];
const PUFF: Sprite = [".pp", "ppp", "pp."];

const PALETTES: Record<ThemeMode, Record<string, string | null>> = {
  light: {
    h: "#c8553d", s: "#f4f6f9", K: "#3b3540", c: "#c8553d", b: "#4a3f3a", k: "#6b4a2f", w: "#8a6440",
    n: "#8a8f9a", r: "#cbb8a8", d: "#8a6a50", t: "#a8a0b8", a: "#c9cdd8", m: "#fbfbfd", l: "#c9cdd8",
    p: "#dfe3ea", lit: CREAM.light, outline: "#9c958a", g: "#6e6a74", i: "#b9d4ea",
  },
  dark: {
    h: "#d86a50", s: "#e4e8f0", K: "#2d2833", c: "#d86a50", b: "#5e504a", k: "#a07b55", w: "#a07b55",
    n: "#7a7f8a", r: "#5a4a40", d: "#3e2e24", t: "#5a5470", a: "#3a3a4a", m: "#e4e8f0", l: "#3a3a4a",
    p: "#9aa0ac", lit: CREAM.dark, outline: null, g: "#9a96a6", i: "#5a7896",
  },
};
/** The child's skin, which the snow palette shares a letter with in the houses. */
const SKIN: Record<ThemeMode, string> = { light: "#e8b48a", dark: "#d9a57c" };
const paint = (rows: Sprite, theme: ThemeMode, flip = false, extra?: Record<string, string>) =>
  sprite(rows, { ...PALETTES[theme], ...extra }, flip, "sm");
const person = (rows: Sprite, theme: ThemeMode, flip = false) => paint(rows, theme, flip, { s: SKIN[theme] });

// -- State -------------------------------------------------------------------

interface State {
  x: number;
  dir: 1 | -1;
  houses: number[];
  towerX: number;
  lampX: number;
  ball: { x0: number; x1: number; k: number } | null;
  splat: { x: number; k: number } | null;
  smoke: { x: number; y: number; k: number }[];
  sinceSmoke: number;
  sleigh: number | null;
  /** Where a gag takes place: the house, the ice, or the snowman. */
  gagX: number;
  /** Resting: the child has gone in at the first cottage. */
  inside: boolean;
}
/** A child thread, shown as a snowman in a colored scarf. */
interface Snowman { x: number; built: number }
type K = Kit<State, Snowman>;

const throwBall = (s: State, k: K) => {
  if (s.ball) return false;
  const dist = 14 + Math.random() * 16;
  const x1 = s.dir > 0 ? Math.min(k.W - 4, s.x + 5 + dist) : Math.max(2, s.x - dist);
  s.ball = { x0: s.x + (s.dir > 0 ? 4 : 0), x1, k: 0 };
  return true;
};

/** Indoors: rate-limited, or resting between runs and gone in. */
const indoors = (s: State, k: K) => k.mood.kind === "rate" || s.inside;
/** Where the child stands to go in: at the first cottage's door. */
const doorSpot = (s: State) => s.houses[0] + 4;
/** Where the child stands while waiting: just beside the clock tower. */
const towerSpot = (s: State) => s.towerX - CHILD_W - 1;

// -- The helper alert --------------------------------------------------------

const alert: AlertSpec = {
  layout: (members) => ({ width: 4 + members.length * 10, figures: rowOf(members, 4, 10, SNOWMAN_W), extra: {} }),
  still(b, p) {
    b.fillStyle = SNOW[p.theme];
    b.fillRect(0, p.px(AG), p.layout.width * p.s, p.s);
    for (const f of p.layout.figures) p.blit(b, paint(SNOWMAN, p.theme, false, { c: "#c8553d" }), f.x, AG - 8);
  },
  // A snowman with the amber "!"; failed, under a rain cloud.
  moving(v, p) {
    for (const [i, f] of p.layout.figures.entries()) {
      if (f.member.kind === "waiting") p.bang(v, f.x + 5, AG - 13, p.t + i * 0.4);
      else p.failed(v, f.x + 1, 0, p.t + i);
    }
  },
};

// -- The scene -------------------------------------------------------------

export const village = defineScene<State, Snowman>({
  id: "village",
  name: "Snowy village",
  state: () => ({ x: 30, dir: 1, houses: [], towerX: 0, lampX: 0, ball: null, splat: null, smoke: [], sinceSmoke: 0, sleigh: null, gagX: 0, inside: false }),

  layout(s, k) {
    const W = k.W;
    s.houses = (k.narrow ? [0.05, 0.6] : [0.04, 0.3, 0.62, 0.82]).map((f) => Math.floor(f * W));
    s.towerX = Math.floor(W * (k.narrow ? 0.4 : 0.5));
    s.lampX = Math.floor(W * (k.narrow ? 0.9 : 0.2));
    s.x = Math.min(s.x, W - CHILD_W - 4);
  },
  // A new run: out in the lane, a snowball already flying.
  start(s, k) {
    s.x = 10 + Math.random() * (k.W - 30);
    s.dir = Math.random() < 0.5 ? 1 : -1;
    s.inside = false;
    if (k.mood.kind === "working") throwBall(s, k);
  },

  focus: (s, k) => (indoors(s, k) ? s.houses[0] + 6 : s.x + CHILD_W / 2),

  crew: {
    max: (k) => (k.narrow ? 2 : 4),
    // A snowman appears, built where there's room, in the helper's scarf.
    join(s, k, _m, shown) {
      const spots = [0.18, 0.42, 0.74, 0.94].map((f) => Math.floor(f * k.W) - 2);
      return { x: spots[(shown - 1) % spots.length], built: k.reduced ? 1 : 0 };
    },
    // Finished: it melts away.
    leave() {},
  },

  step(s, k) { return k.mood.kind === "working" && throwBall(s, k); },

  surprise: {
    active: (s) => s.sleigh !== null,
    start(s) { s.sleigh = 0; },
  },

  hits(s, k) {
    const out: HitTarget[] = [];
    if (!indoors(s, k)) out.push({ target: "lead", box: [s.x, GROUND - 8, CHILD_W, 8], at: [s.x + 2, GROUND - 8] });
    else out.push({ target: "lead", box: [s.houses[0], GROUND - 8, 13, 8], at: [s.houses[0] + 6, GROUND - 8] });
    for (const c of k.crew) if (!c.leaving) out.push({ target: "member", id: c.id, box: [c.x, GROUND - 8, SNOWMAN_W, 8], at: [c.x + 2, GROUND - 8] });
    s.houses.forEach((hx, i) => out.push({ target: "flock", id: String(i), box: [hx, GROUND - 8, 13, 8], at: [hx + 5, GROUND - 8] }));
    return out;
  },
  // "♪ wheee", a scarf flutters, a chimney puffs.
  tap(s, k, hit) {
    if (hit.target === "member") { const c = k.crew.find((m) => m.id === hit.id); if (c) k.react(c, TIME.tap); return; }
    if (hit.target === "lead") { k.react("child", TIME.tap); return; }
    const hx = s.houses[Number(hit.id)];
    if (hx !== undefined && !k.reduced) for (let i = 0; i < 3; i++) s.smoke.push({ x: hx + 5, y: GROUND - 9 - i, k: i * 0.15 });
  },

  errorCloudX: (s, k) => (indoors(s, k) ? s.houses[0] : s.x - 4),

  update(s, k, dt) {
    const mk = k.mood.kind;
    if (mk === "working" && k.gagId) {
      // A gag moves the child (see the gags below).
    } else if (mk === "working" && !k.resting) {
      s.x += s.dir * SPEED.walk * 0.8 * dt;
      if (s.x > k.W - CHILD_W - 8) s.dir = -1;
      if (s.x < 8) s.dir = 1;
    } else if (mk === "waiting" || k.resting) {   // it runs to the clock tower, or home to the first cottage
      const dx = (k.resting ? doorSpot(s) : towerSpot(s)) - s.x;
      if (Math.abs(dx) > 0.3) { s.dir = dx > 0 ? 1 : -1; s.x += s.dir * Math.min(Math.abs(dx), SPEED.trot * dt); }
    }
    s.inside = k.resting && Math.abs(doorSpot(s) - s.x) <= 0.3;
    if (s.ball && (s.ball.k += dt / 0.7) >= 1) { s.splat = { x: s.ball.x1, k: 0 }; s.ball = null; }
    if (s.splat && (s.splat.k += dt / 0.6) >= 1) s.splat = null;
    s.sinceSmoke += dt;
    if (s.sinceSmoke > 1.6) {
      s.sinceSmoke = 0;
      const hx = s.houses[Math.floor(Math.random() * s.houses.length)];
      if (hx !== undefined) s.smoke.push({ x: hx + 5, y: GROUND - 9, k: 0 });
    }
    for (const p of s.smoke) { p.k += dt / 3; p.y -= dt * 1.5; p.x += dt * 0.8; }
    s.smoke = s.smoke.filter((p) => p.k < 1);
    for (const c of k.crew) {
      if (c.leaving) c.alpha -= dt / 1.5;
      else c.built = Math.min(1, c.built + dt / 1.2);
    }
    if (s.sleigh !== null && ((s.sleigh += dt / 10) >= 1 || mk !== "working")) s.sleigh = null;
  },

  settle(s, k) {
    s.ball = null;
    s.splat = null;
    s.smoke = [];
    s.sleigh = null;
    if (k.mood.kind === "waiting") s.x = towerSpot(s);
    if (k.resting) { s.x = doorSpot(s); s.inside = true; }
    k.crew = k.crew.filter((c) => !c.leaving);
    for (const c of k.crew) c.built = 1;
  },

  draw(s, k) {
    const v = k.ctx, theme = k.theme, P = PALETTES[theme];
    const W = k.W, mk = k.mood.kind, t = k.t, e = k.evening();
    const lit = e > 0.45;

    if (e > 0.75) for (const [x, y] of [[10, 1], [W * 0.38, 2], [W * 0.7, 1], [W - 8, 3]]) k.dot(Math.floor(x), y, theme === "dark" ? "#e8e2ff" : "#8f86c9");
    // The sleigh crossing the sky.
    if (s.sleigh !== null && !k.reduced) k.blit(paint(SLEIGH, theme), -8 + s.sleigh * (W + 16), 1 + Math.sin(t * 2) * 0.6);

    // Cottages, the clock tower, the lamp, and the snow: cached by time of day.
    const back = k.layer("village", `${W}:${theme}:${lit}:${indoors(s, k)}:${k.s3}`, v.canvas.width, v.canvas.height, (b) => {
      const s3 = k.s3;
      const blit = (c: HTMLCanvasElement, x: number, y: number) => b.drawImage(c, k.px(x - 1), k.px(y - 1), c.width * s3, c.height * s3);
      b.globalAlpha = 0.8;   // the cottages sit back so the child reads in front
      s.houses.forEach((hx, i) => blit(paint(HOUSE, theme, i % 2 === 1, lit || (indoors(s, k) && i === 0) ? { w: P.lit! } : undefined), hx, GROUND - 8));
      b.globalAlpha = 1;
      blit(paint(TOWER, theme), s.towerX, GROUND - 9);
      blit(paint(LAMP, theme, false, lit ? { l: P.lit! } : undefined), s.lampX, GROUND - 8);
      b.fillStyle = SNOW[theme];
      b.fillRect(0, k.px(GROUND), W * s3, 2 * s3);
    });
    v.drawImage(back, 0, 0);
    if (lit) glow(v, k.view, s.lampX + 1, GROUND - 7, 3, P.lit!, 0.6 * Math.min(1, (e - 0.45) * 2));

    // The clock tower's window glows amber while waiting on you.
    if (mk === "waiting") k.signal(s.towerX + 2, GROUND - 5);

    // Chimney smoke.
    for (const p of s.smoke) {
      v.globalAlpha = (1 - p.k) * 0.7;
      k.blit(paint(PUFF, theme), p.x - 1, p.y - 1);
      v.globalAlpha = 1;
    }

    // Snowmen in their colored scarves.
    for (const c of k.crew) {
      const flutter = k.reaction(c) !== null && Math.floor(t * 8) % 2 === 0;
      v.globalAlpha = Math.max(0, Math.min(c.alpha, c.built));
      k.blit(paint(SNOWMAN, theme, flutter, { c: c.color }), c.x - 1, GROUND - 8);
      v.globalAlpha = 1;
      if (!c.leaving) k.marker(c.kind, c.x + 2, GROUND - 14);
    }

    // The child and the sled (indoors while resting).
    if (!indoors(s, k)) {
      // Waiting: it walks to the tower first, then turns to face you. Resting: it heads home.
      const arrived = mk !== "waiting" || k.reduced || Math.abs(towerSpot(s) - s.x) <= 0.3;
      const walking = (mk === "working" || !arrived) && !k.reduced;
      const slip = k.gagging("slip"), head = k.gagging("snowman");
      const onSled = slip !== null && slip > 0.3 && slip < 0.8;
      const pose = (mk === "waiting" && arrived) || (head !== null && head > 0.68 && head < 0.9) ? CHILD.front : walking && Math.floor(t / TIME.beat) % 2 ? CHILD.walk2 : CHILD.walk1;
      const sledX = onSled ? s.x - 1 : s.dir > 0 ? s.x - 6 : s.x + CHILD_W;
      k.blit(paint(SLED, theme, s.dir < 0), sledX - 1, GROUND - 2);
      if (onSled) k.blit(person(CHILD.sit, theme, s.dir < 0), s.x - 1, GROUND - 7);
      else k.blit(person(pose, theme, !(mk === "waiting" && arrived) && s.dir < 0), s.x - 1, GROUND - 8 - (slip !== null && slip > 0.22 && slip < 0.3 ? 2 : 0));
    }

    // The snowball and its puff.
    if (s.ball) {
      const bx = s.ball.x0 + (s.ball.x1 - s.ball.x0) * s.ball.k;
      k.dot(bx, GROUND - 6 - Math.sin(Math.PI * s.ball.k) * 5, SNOW[theme]);
    }
    if (s.splat) {
      v.globalAlpha = 1 - s.splat.k;
      for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [-2, -1], [2, -1]]) k.dot(s.splat.x + dx * (1 + s.splat.k), GROUND - 1 + dy - s.splat.k, SNOW[theme]);
      v.globalAlpha = 1;
    }

    // Falling snow, always.
    const rnd = seeded(W + 3);
    v.fillStyle = SNOW[theme];
    for (let i = 0; i < 9; i++) {
      const x0 = rnd() * W, sp = 2 + rnd() * 2, sw = rnd() * 6;
      const y = k.reduced ? rnd() * GROUND : (rnd() * GROUND + t * sp) % GROUND;
      k.dot(x0 + (k.reduced ? 0 : Math.sin(t * 0.8 + sw)), y);
    }

    k.note("child", "♪ wheee", s.x + 2, GROUND - 9);
    for (const c of k.crew) k.note(c, "♪", c.x + 2, GROUND - 9);
  },

  motion(s, k): Motion {
    const mk = k.mood.kind;
    if (s.ball || s.splat || s.sleigh !== null) return "fast";
    if (k.crew.some((c) => c.leaving || c.built < 1)) return "fast";
    if (k.resting) return s.inside ? "slow" : "fast";   // snow falls, chimneys smoke
    if (mk === "working") return "fast";
    // Snow keeps falling and chimneys smoke: gentle, even at rest.
    return mk === "idle" ? "still" : "slow";
  },

  gags: [
    // A snowball thumps a roof; the snow slides off onto a cat sitting below.
    {
      id: "roof",
      seconds: 4,
      // The nearest house whose cat spot is clear of the kid.
      ready: (s) => s.houses.some((h) => Math.abs(h + 13 - s.x) > 14),
      start(s) {
        const clear = s.houses.filter((h) => Math.abs(h + 13 - s.x) > 14);
        s.gagX = clear.reduce((a, b) => (Math.abs(b - s.x) < Math.abs(a - s.x) ? b : a));
      },
      draw(s, k, p) {
        const P = PALETTES[k.theme], hx = s.gagX, catX = hx + 13;
        const snow = SNOW[k.theme];
        // The snowball arcs up to the roof.
        if (p < 0.3) { const q = p / 0.3; k.dot(s.x + 2 + (hx + 6 - s.x - 2) * q, GROUND - 6 - Math.sin(Math.PI * q) * 6 - q * 1, snow); }
        // The roof's snow slides and drops; the cat ends up under a heap, then shakes it off.
        const covered = p > 0.5 && p < 0.82;
        k.blit(paint(CAT, k.theme), catX - 1, GROUND - 5 + (p > 0.82 && p < 0.9 ? -1 : 0));
        if (p > 0.32 && p < 0.5) { const q = (p - 0.32) / 0.18; for (let i = 0; i < 4; i++) k.dot(catX + i, GROUND - 8 + q * 4 + (i % 2), snow); }
        if (covered) { for (let i = -1; i < 5; i++) k.dot(catX + i, GROUND - 4, snow); for (let i = 0; i < 4; i++) k.dot(catX + i, GROUND - 5, snow); k.dot(catX, GROUND - 6, P.g!); k.dot(catX + 3, GROUND - 6, P.g!); }
        if (p > 0.82 && p < 0.95) for (const dx of [-2, 5]) k.dot(catX + dx, GROUND - 4 - (p - 0.82) * 10, snow);
      },
    },
    // The kid hits a patch of ice, sits down hard on the sled, slides away, and gets up.
    {
      id: "slip",
      seconds: 3.5,
      start(s) { s.gagX = s.x + s.dir * 3; },
      update(s, k, dt, p) {
        if (p > 0.3 && p < 0.75) s.x = Math.max(8, Math.min(k.W - CHILD_W - 8, s.x + s.dir * 18 * dt * (1 - (p - 0.3) / 0.45)));
      },
      draw(s, k) {
        const P = PALETTES[k.theme];
        for (let i = 0; i < 6; i++) k.dot(s.gagX + i * s.dir, GROUND, P.i!);
      },
    },
    // A snowman's head rolls off; the kid fetches it and puts it back on.
    {
      id: "snowman",
      seconds: 4,
      start(s, k) { s.gagX = Math.max(10, Math.min(k.W - 14, s.x + s.dir * 9)); },
      update(s, k, dt, p) {
        const headAt = s.gagX + s.dir * 7;
        if (p > 0.42 && p < 0.65) { const dx = headAt - s.dir * 3 - s.x; s.x += Math.sign(dx) * Math.min(Math.abs(dx), SPEED.walk * 2 * dt); }
        if (p > 0.68 && p < 0.88) { const dx = s.gagX - s.dir * 6 - s.x; s.x += Math.sign(dx) * Math.min(Math.abs(dx), SPEED.walk * 2 * dt); }
      },
      draw(s, k, p) {
        const P = PALETTES[k.theme], x = s.gagX;
        const v = k.ctx;
        v.globalAlpha = Math.min(1, p / 0.08, (1 - p) / 0.08);
        // The body stays; the head (the top three rows) rolls off and comes back.
        const body = paint(SNOWMAN_PLAIN.slice(3), k.theme);
        k.blit(body, x - 1, GROUND - 4);
        let hx = x, hy = GROUND - 7;
        if (p > 0.18 && p < 0.42) { const q = (p - 0.18) / 0.24; hx = x + s.dir * 7 * q; hy = GROUND - 7 + q * 4; }
        else if (p >= 0.42 && p < 0.68) { hx = x + s.dir * 7; hy = GROUND - 3; }
        else if (p >= 0.68 && p < 0.88) { const q = (p - 0.68) / 0.2; hx = x + s.dir * 7 * (1 - q); hy = GROUND - 3 - Math.sin(Math.PI * q) * 5 - q * 4; }
        k.blit(paint(SNOWMAN_PLAIN.slice(0, 3), k.theme), hx - 1, hy - 1);
        v.globalAlpha = 1;
        void P;
      },
    },
  ],

  alert,
});
