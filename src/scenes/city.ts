// City rooftop: a cat walking a rooftop ledge against a city skyline, a
// water tower and an antenna on the roof.
//
// Working: the cat strolls the ledge, tail up, and pauses now and then to
// flick its tail, twitch an ear, or stretch. A
// step: a window in the skyline lights up. Waiting on you: the cat walks to
// the antenna and sits facing you, and the antenna's light glows amber. Rate-limited: it sleeps
// curled up by the warm vent. Error: the kit's rain cloud. Crew: pigeons
// with a wing patch in each helper's color. Long run: the city lights come on.
// Surprise: a plane blinks across the sky. Taps: "♪ mrrp", "♪ coo", a window
// switches. Gags: the cat slowly pushes a flowerpot off the ledge; a pigeon
// steals its spot while it stretches; it chases a reflected spot of light.
// Seasons: snow on the ledge, flowerpots in spring, leaves in autumn.
import { defineScene, type HitTarget, type Kit } from "../kit/engine";
import { ALERT_GROUND as AG, rowOf, type AlertSpec } from "../kit/alert";
import { SNOW, glow, seeded, sprite, type Motion, type Sprite } from "../kit/common";
import { CREAM, GROUND, SPEED, TIME } from "../kit/style";
import type { ThemeMode } from "../kit/types";

// -- Art ---------------------------------------------------------------------

/** The cat, facing right: walking, standing with a tail flick or an ear twitch, stretching, pouncing, sitting, asleep. */
const CAT = {
  walk1: ["t.............", "t.........c..c", ".t........cccc", ".t........ccKc", "..cccccccccccN", "..cccccccccc..", "..c.c....c.c..", "..c.c....c.c.."],
  walk2: ["t.............", "t.........c..c", ".t........cccc", ".t........ccKc", "..cccccccccccN", "..cccccccccc..", "...cc....cc...", "..c..c..c..c.."],
  flick: ["..t...........", ".t........c..c", "t.........cccc", ".t........ccKc", "..cccccccccccN", "..cccccccccc..", "..c.c....c.c..", "..c.c....c.c.."],
  twitch: ["t.............", "t.........c...", ".t........cccc", ".t........ccKc", "..cccccccccccN", "..cccccccccc..", "..c.c....c.c..", "..c.c....c.c.."],
  stretch: ["t..............", ".t.............", "..cccc.........", "..ccccccc......", "..ccccccccc.c.c", "..c.c...ccccccc", "..c.c....cccKcN", "..c.c..ccccc..."],
  pounce: ["..............", "t.............", ".t.........c.c", "..t........ccc", "..cccccccccKcN", ".ccccccccccc..", "cc.........cc.", "c...........c."],
  sit: [".c....c..", ".cc..cc..", ".cccccc..", ".cKccKc..", "..cNNc...", "..cccc..t", ".cccccc.t", ".cccccc.t", ".cc..cctt"],
  sleep: ["....cc.c.....", "..cccccccc...", ".cccccccccct.", "cQcccccccccct"],
} satisfies Record<string, Sprite>;
type CatPose = keyof typeof CAT;
const CAT_W = 14;
const SIT_W = 9;
const POT: Sprite = [".f.", "fef", "ooo", ".o."];
const SPOT = "#f4f9ff";
const PIGEON: Sprite = ["..pp", ".pKp", "pbbp", ".l.l"];
const PIGEON_W = 4;
const TOWER: Sprite = [".rrrr.", "rrrrrr", "rwrrwr", "rwrrwr", "rrrrrr", ".k..k.", ".k..k.", "kkkkkk"];
const ANTENNA: Sprite = ["aa", "aa", ".k", ".k", ".k", ".k", ".k"];
const VENT: Sprite = ["vvv", "v.v", "vvv"];
const PLANE: Sprite = ["....n...", "nnnnnnnn", "....n..."];

const PALETTES: Record<ThemeMode, Record<string, string | null>> = {
  light: {
    c: "#4a4452", K: "#a8d07a", t: "#4a4452", p: "#9aa0ac", b: "#9aa0ac", l: "#e88b6a", r: "#a39a92", w: "#7a716a",
    k: "#6b6f7a", a: "#c9cdd8", v: "#9a9aa2", n: "#9aa0ac", f: "#e88bb0", e: "#5a9a5f", o: "#c8653d",
    N: "#d9707f", Q: "#2e2a36",
    sky1: "#e9ecf1", sky2: "#dfe3ea", window: "#f3f5f8", lit: CREAM.light, ledge: "#8a8a93", steam: "#c8c8d0",
    outline: "#9c958a",
  },
  dark: {
    c: "#aaa6b6", K: "#a8d07a", t: "#aaa6b6", p: "#a0a6b2", b: "#a0a6b2", l: "#e88b6a", r: "#5a5652", w: "#46423f",
    k: "#8a8f9a", a: "#3a3a4a", v: "#6a6a72", n: "#8a90a0", f: "#e88bb0", e: "#4e8a55", o: "#c8653d",
    N: "#e88b9b", Q: "#6e6a7a",
    sky1: "#1d2029", sky2: "#20232d", window: "#2a2d38", lit: CREAM.dark, ledge: "#55555e", steam: "#8a8a92",
    outline: null,
  },
};
const paint = (rows: Sprite, theme: ThemeMode, flip = false, extra?: Record<string, string>) =>
  sprite(rows, { ...PALETTES[theme], ...extra }, flip, "p");

// -- State -------------------------------------------------------------------

interface Tower { x: number; w: number; top: number; far: boolean }
interface State {
  x: number;
  dir: 1 | -1;
  pause: number;
  towers: Tower[];
  windows: [number, number][];
  /** Window indexes switched on by steps and taps. */
  lit: Set<number>;
  flicker: { i: number; k: number } | null;
  waterX: number;
  antennaX: number;
  ventX: number;
  steam: { y: number; k: number }[];
  sinceSteam: number;
  plane: number | null;
  /** A stretch in progress (seconds left), during a pause. */
  stretch: number;
  /** Where a gag began: the flowerpot's spot, or where the cat stood. */
  gagX: number;
}
/** A child thread, shown as a pigeon with a colored leg band. */
interface Pigeon { x: number; peck: number }
type K = Kit<State, Pigeon>;

const lightUp = (s: State) => {
  if (!s.windows.length) return false;
  const off = s.windows.map((_, i) => i).filter((i) => !s.lit.has(i));
  if (off.length === 0 || s.lit.size > s.windows.length * 0.6) {   // a full skyline: one goes dark first
    const on = [...s.lit];
    s.lit.delete(on[Math.floor(Math.random() * on.length)]);
  }
  const free = s.windows.map((_, i) => i).filter((i) => !s.lit.has(i));
  const i = free[Math.floor(Math.random() * free.length)];
  s.lit.add(i);
  s.flicker = { i, k: 0 };
  return true;
};

/** Where the cat sits while waiting: just left of the antenna. */
const antennaSpot = (s: State) => s.antennaX - SIT_W - 1;

// -- The helper alert --------------------------------------------------------

const alert: AlertSpec = {
  layout: (members) => ({ width: 4 + members.length * 9, figures: rowOf(members, 4, 9, PIGEON_W), extra: {} }),
  still(b, p) {
    const P = PALETTES[p.theme];
    b.fillStyle = P.sky2!;
    for (let x = 0; x < p.layout.width; x += 6) b.fillRect(p.px(x), p.px(AG - 4 - (x % 12 ? 1 : 3)), 5 * p.s, 8 * p.s);
    b.fillStyle = P.ledge!;
    b.fillRect(0, p.px(AG), p.layout.width * p.s, p.s);
    for (const f of p.layout.figures) p.blit(b, paint(PIGEON, p.theme, false, { l: "#e88b6a", b: "#e88b6a" }), f.x, AG - 4);
  },
  // A pigeon with the amber "!"; failed, under a rain cloud.
  moving(v, p) {
    for (const [i, f] of p.layout.figures.entries()) {
      if (f.member.kind === "waiting") p.bang(v, f.x + 5, AG - 10, p.t + i * 0.4);
      else p.failed(v, f.x + 1, 0, p.t + i);
    }
  },
};

// -- The scene -------------------------------------------------------------

export const city = defineScene<State, Pigeon>({
  id: "city",
  name: "City rooftop",
  state: () => ({ x: 30, dir: 1, pause: 0, towers: [], windows: [], lit: new Set(), flicker: null, waterX: 0, antennaX: 0, ventX: 0, steam: [], sinceSteam: 0, plane: null, stretch: 0, gagX: 0 }),

  layout(s, k) {
    const W = k.W;
    const rnd = seeded(W * 19 + 7);
    s.towers = [];
    // A thin skyline: buildings with sky between them, so the cat has room.
    for (let x = 2 + Math.floor(rnd() * 6); x < W - 4;) {
      const w = 6 + Math.floor(rnd() * 7), far = rnd() < 0.4;
      s.towers.push({ x, w, top: (far ? 4 : 6) + Math.floor(rnd() * 3), far });
      x += w + 6 + Math.floor(rnd() * 10);
    }
    s.windows = [];
    for (const t of s.towers) if (!t.far) for (let y = t.top + 2; y < GROUND - 1; y += 3) for (let x = t.x + 2; x < t.x + t.w - 1; x += 3) s.windows.push([x, y]);
    s.lit = new Set([...s.lit].filter((i) => i < s.windows.length));
    s.waterX = Math.floor(W * 0.8);
    s.antennaX = Math.floor(W * 0.62);
    s.ventX = Math.floor(W * 0.12);
    s.x = Math.min(s.x, W - CAT_W - 4);
  },
  // A new run: the cat mid-ledge, a window just lighting up.
  start(s, k) {
    s.x = 20 + Math.random() * (k.W - 60);
    s.dir = Math.random() < 0.5 ? 1 : -1;
    if (k.mood.kind === "working") lightUp(s);
  },

  focus: (s, k) => (k.mood.kind === "rate" ? s.ventX + 6 : s.x + CAT_W / 2),

  crew: {
    max: (k) => (k.narrow ? 2 : 4),
    // A pigeon flutters down onto the ledge.
    join: (_s, k, _m, shown) => ({ x: Math.floor(k.W * [0.3, 0.45, 0.52, 0.38][(shown - 1) % 4]), peck: Math.random() * 3, alpha: k.reduced ? 1 : 0 }),
    // Finished: it flies off.
    leave() {},
  },

  step(s, k) { return k.mood.kind === "working" && lightUp(s); },

  surprise: {
    active: (s) => s.plane !== null,
    start(s) { s.plane = 0; },
  },

  hits(s, k) {
    const rate = k.mood.kind === "rate";
    const x = rate ? s.ventX + 4 : s.x;
    const out: HitTarget[] = [{ target: "lead", box: [x, GROUND - 8, CAT_W, 8], at: [x + 7, GROUND - 8] }];
    for (const c of k.crew) if (!c.leaving) out.push({ target: "member", id: c.id, box: [c.x, GROUND - 4, PIGEON_W, 4], at: [c.x + 2, GROUND - 4] });
    s.windows.forEach(([wx, wy], i) => out.push({ target: "flock", id: String(i), near: [wx, wy], r: 2, at: [wx, wy] }));
    return out;
  },
  // "♪ mrrp", "♪ coo", or a window switches.
  tap(s, k, hit) {
    if (hit.target === "member") { const c = k.crew.find((m) => m.id === hit.id); if (c) k.react(c, TIME.tap); return; }
    if (hit.target === "lead") { k.react("cat", TIME.tap); return; }
    const i = Number(hit.id);
    if (s.lit.has(i)) s.lit.delete(i); else s.lit.add(i);
  },

  errorCloudX: (s, k) => (k.mood.kind === "rate" ? s.ventX + 2 : s.x - 2),

  update(s, k, dt) {
    const mk = k.mood.kind;
    if (mk === "working" && k.gagId) {
      // A gag is moving the cat (see the gags below).
    } else if (mk === "working") {
      s.stretch = Math.max(0, s.stretch - dt);
      if (s.pause > 0) s.pause -= dt;
      else {
        s.x += s.dir * SPEED.walk * 0.7 * dt;
        if (s.x > k.W - CAT_W - 6) s.dir = -1;
        if (s.x < s.ventX + 6) s.dir = 1;
        if (Math.random() < 0.15 * dt) {
          s.pause = 1.8 + Math.random() * 1.5;
          if (Math.random() < 0.35) s.stretch = 1.6;   // a good long stretch
        }
      }
    } else if (mk === "waiting") {   // the cat walks over to the antenna
      const dx = antennaSpot(s) - s.x;
      if (Math.abs(dx) > 0.3) { s.dir = dx > 0 ? 1 : -1; s.x += s.dir * Math.min(Math.abs(dx), SPEED.trot * 0.8 * dt); }
    }
    if (s.flicker && (s.flicker.k += dt / TIME.reaction) >= 1) s.flicker = null;
    // Steam from the vent.
    s.sinceSteam += dt;
    if (s.sinceSteam > 1.4) { s.sinceSteam = 0; s.steam.push({ y: GROUND - 3, k: 0 }); }
    for (const p of s.steam) { p.k += dt / 2.5; p.y -= dt * 1.6; }
    s.steam = s.steam.filter((p) => p.k < 1);
    for (const c of k.crew) {
      if (c.leaving) { c.alpha -= dt / 1; continue; }
      c.alpha = Math.min(1, c.alpha + dt);
      c.peck += dt;
    }
    if (s.plane !== null && ((s.plane += dt / 12) >= 1 || mk !== "working")) s.plane = null;
  },

  settle(s, k) {
    s.flicker = null;
    s.steam = [];
    s.plane = null;
    if (k.mood.kind === "waiting") s.x = antennaSpot(s);
    s.stretch = 0;
    k.crew = k.crew.filter((c) => !c.leaving);
    for (const c of k.crew) c.alpha = 1;
  },

  draw(s, k) {
    const v = k.ctx, theme = k.theme, P = PALETTES[theme];
    const W = k.W, mk = k.mood.kind, t = k.t, e = k.evening(), season = k.season;

    if (e > 0.85) for (const [x, y] of [[W * 0.2, 1], [W * 0.48, 0], [W * 0.9, 1]]) k.dot(Math.floor(x), y, theme === "dark" ? "#e8e2ff" : "#8f86c9");
    // The plane, blinking high over the city.
    if (s.plane !== null && !k.reduced) {
      const px = -8 + s.plane * (W + 16);
      k.blit(paint(PLANE, theme), px, 0);
      if (Math.floor(t * 2) % 2) k.dot(px + 7, 1, "#d9534f");
    }

    // The skyline and the roof: cached by size and theme.
    const back = k.layer("city", `${W}:${theme}:${season}:${k.s3}`, v.canvas.width, v.canvas.height, (b) => {
      const s3 = k.s3;
      for (const tw of s.towers) {
        b.fillStyle = tw.far ? P.sky1! : P.sky2!;
        b.fillRect(k.px(tw.x), k.px(tw.top), tw.w * s3, (GROUND - tw.top) * s3);
      }
      b.fillStyle = P.window!;
      for (const [wx, wy] of s.windows) b.fillRect(k.px(wx), k.px(wy), s3, s3);
      b.fillStyle = season === "winter" ? SNOW[theme] : P.ledge!;
      b.fillRect(0, k.px(GROUND), W * s3, s3);
      b.fillStyle = P.ledge!;
      b.fillRect(0, k.px(GROUND + 1), W * s3, s3);
      const blit = (c: HTMLCanvasElement, x: number, y: number) => b.drawImage(c, k.px(x - 1), k.px(y - 1), c.width * s3, c.height * s3);
      blit(paint(TOWER, theme), s.waterX, GROUND - 8);
      blit(paint(ANTENNA, theme), s.antennaX, GROUND - 7);
      blit(paint(VENT, theme), s.ventX, GROUND - 3);
      if (season === "winter") { b.fillStyle = SNOW[theme]; b.fillRect(k.px(s.waterX), k.px(GROUND - 9), 6 * s3, s3); }
      if (season === "spring") for (const fx of [0.4, 0.46]) blit(paint(POT, theme), Math.floor(W * fx), GROUND - 4);
    });
    v.drawImage(back, 0, 0);

    // Lit windows: the ones steps switched on, plus more as evening comes.
    const rnd = seeded(W + 77);
    s.windows.forEach(([wx, wy], i) => {
      const evening = rnd() < e * 0.55;
      if (!s.lit.has(i) && !evening) return;
      const fresh = s.flicker && s.flicker.i === i ? (Math.floor(s.flicker.k * 6) % 2 ? 0.4 : 1) : 1;
      v.globalAlpha = fresh;
      k.dot(wx, wy, P.lit!);
      v.globalAlpha = 1;
    });

    // The antenna light: amber while waiting on you, a slow red blink at night.
    if (mk === "waiting") k.signal(s.antennaX, GROUND - 7);
    else if (e > 0.5 && !k.reduced && Math.floor(t) % 2) {
      glow(v, k.view, s.antennaX + 0.5, GROUND - 6.5, 2, "#d9534f", 0.8);
      k.dot(s.antennaX, GROUND - 7, "#d9534f"); k.dot(s.antennaX + 1, GROUND - 7, "#d9534f");
    }

    // Steam from the vent.
    for (const p of s.steam) {
      v.globalAlpha = (1 - p.k) * 0.6;
      k.dot(s.ventX + 1 + (k.reduced ? 0 : Math.sin(t + p.k * 4)), p.y, P.steam!);
      v.globalAlpha = 1;
    }

    // Pigeons with colored leg bands, pecking.
    for (const c of k.crew) {
      const peck = !k.reduced && c.kind === "working" && Math.floor(c.peck * 1.5) % 3 === 0 ? 1 : 0;
      v.globalAlpha = Math.max(0, c.alpha);
      k.blit(paint(PIGEON, theme, false, { b: c.color }), c.x - 1, GROUND - 4 + peck - (1 - Math.min(1, c.alpha)) * 4);
      v.globalAlpha = 1;
      if (!c.leaving) k.marker(c.kind, c.x + 2, GROUND - 9);
    }

    // The cat.
    {
      const name = catPose(s, k);
      const pose = CAT[name];
      const x = mk === "rate" ? s.ventX + 3 : s.x;
      const hop = k.gagging("light") !== null && name === "pounce" ? -1 : 0;
      const flip = name !== "sit" && name !== "sleep" && s.dir < 0, y = GROUND - pose.length + hop;
      // A soft light edge first, so the cat stands out from the skyline.
      const rim = theme === "dark" ? "#e4e0ec" : "#ffffff";
      const edge = paint(pose, theme, flip, { c: rim, t: rim, K: rim, N: rim, Q: rim });
      v.globalAlpha = theme === "dark" ? 0.35 : 0.9;
      for (const [ox, oy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) k.blit(edge, x - 1 + ox, y + oy);
      v.globalAlpha = 1;
      k.blit(paint(pose, theme, flip), x - 1, y);
    }
    if (season === "autumn") k.dot(k.reduced ? W * 0.5 : (t * 8) % W, k.reduced ? 6 : 4 + Math.sin(t * 2) * 2, "#d9772b");

    k.note("cat", "♪ mrrp", mk === "rate" ? s.ventX + 7 : s.x + 7, GROUND - 9);
    for (const c of k.crew) k.note(c, "♪ coo", c.x + 2, GROUND - 5);
  },

  motion(s, k): Motion {
    const mk = k.mood.kind;
    if (s.flicker || s.plane !== null) return "fast";
    if (k.crew.some((c) => c.leaving || c.alpha < 1)) return "fast";
    if (mk === "working") return "fast";
    // Steam rises and the antenna blinks: gentle.
    return mk === "idle" ? "still" : "slow";
  },

  gags: [
    // The cat slowly, deliberately pushes a flowerpot off the ledge.
    {
      id: "pot",
      seconds: 4,
      start(s) { s.gagX = s.dir > 0 ? s.x + CAT_W + 1 : s.x - 4; },
      draw(s, k, p) {
        const slide = p < 0.2 ? 0 : Math.min(1, (p - 0.2) / 0.45) * 3;
        const fall = p < 0.68 ? 0 : ((p - 0.68) / 0.32) ** 2 * 10;
        k.blit(paint(POT, k.theme), s.gagX - 1 + s.dir * slide, GROUND - 4 + fall);
        // The paw, reaching out in little taps.
        if (p > 0.15 && p < 0.7 && Math.floor(p * 18) % 3 !== 0) k.dot(s.dir > 0 ? s.x + CAT_W - 1 + slide * 0.6 : s.x - slide * 0.6, GROUND - 2, PALETTES[k.theme].c!);
      },
    },
    // While the cat stretches, a pigeon drops into its spot and stays put.
    {
      id: "pigeon",
      seconds: 4,
      start(s) { s.gagX = s.x; },
      update(s, k, dt, p) {
        if (p < 0.5) s.x = Math.max(s.ventX + 6, Math.min(k.W - CAT_W - 6, s.x + s.dir * 8 * dt));
      },
      draw(s, k, p) {
        if (p < 0.3) return;
        const spot = s.dir > 0 ? s.gagX + 1 : s.gagX + CAT_W - 5;
        const land = Math.min(1, (p - 0.3) / 0.2);
        const peck = p > 0.6 && Math.floor(p * 12) % 3 === 0 ? 1 : 0;
        k.blit(paint(PIGEON, k.theme, s.dir > 0), spot - 1, GROUND - 4 - (1 - land) * 10 + peck);
      },
    },
    // A reflected spot of light darts along the roof; the cat pounces after it.
    {
      id: "light",
      seconds: 4,
      start(s) { s.gagX = s.x; },
      update(s, k, dt, p) {
        const target = spotX(s, k, p) - (s.dir > 0 ? CAT_W - 2 : 1);
        const dx = target - s.x;
        if (Math.abs(dx) > 0.5) { s.dir = dx > 0 ? 1 : -1; s.x += s.dir * Math.min(Math.abs(dx), SPEED.trot * 1.4 * dt); }
        s.x = Math.max(s.ventX + 6, Math.min(k.W - CAT_W - 6, s.x));
      },
      draw(s, k, p) {
        if (p > 0.92) return;
        const x = spotX(s, k, p);
        glow(k.ctx, k.view, x + 0.5, GROUND + 1, 2, SPOT, 0.5);
        k.dot(x, GROUND + 1, SPOT); k.dot(x + 1, GROUND + 1, SPOT);
      },
    },
  ],

  alert,
});

/** Where the light spot is during the chase: it zips back and forth ahead of the cat. */
function spotX(s: State, k: K, p: number): number {
  const span = Math.min(40, k.W * 0.25);
  const x = s.gagX + CAT_W / 2 + Math.sin(p * Math.PI * 3.2) * span;
  return Math.max(s.ventX + 8, Math.min(k.W - 8, x));
}

/** What the cat is doing now. */
function catPose(s: State, k: K): CatPose {
  const mk = k.mood.kind, t = k.t;
  if (mk === "rate") return "sleep";
  if (mk === "waiting") return k.reduced || Math.abs(antennaSpot(s) - s.x) <= 0.3 ? "sit" : Math.floor(t / TIME.beat) % 2 ? "walk2" : "walk1";
  if (k.gagging("pot") !== null) return "walk1";
  const pigeon = k.gagging("pigeon");
  if (pigeon !== null) return pigeon < 0.7 ? "stretch" : "twitch";
  const light = k.gagging("light");
  if (light !== null) return Math.floor(t * 6) % 2 ? "pounce" : "walk2";
  if (k.reduced || mk !== "working") return "walk1";
  if (s.stretch > 0) return "stretch";
  if (s.pause > 0) {
    if (t % 2.3 < 0.25) return "twitch";
    return Math.floor(t / 0.7) % 2 ? "flick" : "walk1";
  }
  return Math.floor(t / TIME.beat) % 2 ? "walk2" : "walk1";
}
