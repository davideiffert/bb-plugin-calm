// Lighthouse: a striped lighthouse on rocks by the sea, its lamp turning, and
// its keeper, who steps out onto the gallery now and then.
//
// Working: the lamp turns, waves roll in, gulls wheel, and the keeper comes
// out to sweep, wave, or watch the sea. A step: a wave crashes on the rocks in
// a burst of spray. Waiting on you: the keeper stands on the gallery facing
// you and holds out a lantern that glows amber; the lamp stops turning.
// Rate-limited: fog banks roll in, the lamp rests, the keeper stays inside.
// Error: the kit's rain cloud, over the keeper. Crew: gulls with wing tags in
// each helper's color. Long run: a short, soft beam turns over the water at
// dusk. Surprise: a ship passes on the horizon. Gags: a gull steals the
// keeper's sandwich; a wave splashes the keeper; a broom sweep sends dust into
// a passing gull. Taps: the keeper waves, "♪ caw", a splash. Seasons: snow on
// the rocks in winter, a far sail in summer. At rest between runs (scenes
// shown always): the keeper sits down on the gallery step and watches the
// sea, while the lamp keeps turning.
import { defineScene, type HitTarget, type Kit } from "../kit/engine";
import { ALERT_GROUND as AG, rowOf, type AlertSpec } from "../kit/alert";
import { SNOW, glow, seeded, sprite, type Motion, type Sprite } from "../kit/common";
import { SPEED, TIME, WATERLINE } from "../kit/style";
import type { ThemeMode } from "../kit/types";

const WATER = WATERLINE + 1;

// -- Art ---------------------------------------------------------------------

/** The tower, with a gallery wide enough for the keeper to step out on. */
const TOWER: Sprite = [
  ".....kk.....",
  "....kkkk....",
  "...kllllk...",
  "kkkkkkkkkkkk",
  "....rrrr....",
  "....wwww....",
  "...rrrrrr...",
  "..wwwwwwww..",
];
const TOWER_W = 12;
/** The rock row the tower stands on; the tower fills rows 2 to 9, the gallery is row 5. */
const BASE = 10;
const TOWER_TOP = BASE - TOWER.length;
const GALLERY = TOWER_TOP + 3;
/** The keeper: cap, face, a two-row coat, legs; 3 px wide, standing on the gallery. */
const KEEPER = {
  front: ["qqq", ".f.", "ccc", "ccc", "j.j"],
  wave: ["qqq.", ".f.c", "cccc", "ccc.", "j.j."],
  watch: ["qqqc", ".f.c", "ccc.", "ccc.", "j.j."],
  sweep1: ["qqq..", ".f...", "cccc.", "ccc.b", "j.j.b"],
  sweep2: [".qqq.", "..f..", ".cccc", "b.ccc", "b.j.j"],
  shake: ["qqq.", "cf..", ".ccc", ".ccc", ".j.j"],
  shake2: [".qqq", "..fc", "ccc.", "ccc.", "j.j."],
  /** Sitting on the gallery step, legs out, watching the sea. */
  sit: ["qqq.", ".f..", "ccc.", "cjjj"],
} satisfies Record<string, Sprite>;
type KeeperPose = keyof typeof KEEPER;
const SANDWICH = "#d9c28a";
const GULL: Sprite = ["g.....g", ".gg.gg.", "...g..."];
const GULL_GLIDE: Sprite = ["ggg.ggg", "...g..."];
const SHIP: Sprite = ["...m....", "..mm.m..", "hhhhhhhh", ".hhhhhh."];
const SAIL: Sprite = [".s", "ss", "hh"];

const PALETTES: Record<ThemeMode, Record<string, string | null>> = {
  light: {
    k: "#4a4452", l: "#f0dfae", r: "#c8553d", w: "#f4f2ee", g: "#9aa0ac", m: "#a0a6b2", h: "#7a808c", s: "#fbf8f1",
    q: "#2f3a52", f: "#e8b48a", c: "#3f6fa8", j: "#3b3540", b: "#8a6440",
    rock: "#8a8590", rockTop: "#a8a3ae", water: "#5b8fd9", ripple: "#9dbcea", spray: "#dfe9f2", fog: "#dde2ea", beam: "#f0dfae",
    outline: "#9c958a",
  },
  dark: {
    k: "#8a8f9a", l: "#fbeccb", r: "#d86a50", w: "#e4e0d6", g: "#b0b6c2", m: "#55607a", h: "#4a5266", s: "#ece7dc",
    q: "#c9d1e0", f: "#d9a57c", c: "#5f8fd0", j: "#c9c5d4", b: "#a07b55",
    rock: "#4a4652", rockTop: "#5e5a66", water: "#6f97e0", ripple: "#3d5f9e", spray: "#a8bdd8", fog: "#4a4e5a", beam: "#fbeccb",
    outline: null,
  },
};
const paint = (rows: Sprite, theme: ThemeMode, flip = false, extra?: Record<string, string>) =>
  sprite(rows, { ...PALETTES[theme], ...extra }, flip, "wsl");

// -- State -------------------------------------------------------------------

interface State {
  towerX: number;
  rocks: number[];
  /** The lamp's turn, in turns. */
  turn: number;
  crash: number | null;
  flash: number | null;
  /** 0 = clear, 1 = fogged in. */
  fog: number;
  ship: number | null;
  /** What the keeper is doing, and for how much longer. */
  keeper: { act: "in" | "sweep" | "wave" | "watch"; left: number };
}
/** A child thread, shown as a gull with a tag in its color. */
interface Gull { cx: number; cy: number; r: number; phase: number; come: number }
type K = Kit<State, Gull>;

const CRASH_SECONDS = 0.9;
const crash = (s: State) => { if (s.crash !== null) return false; s.crash = 0; return true; };
const lampX = (s: State) => s.towerX + 5;   // the left of the lamp's middle two pixels
const lampY = TOWER_TOP + 2;
/** The keeper stands at the gallery's left end. */
const keeperX = (s: State) => s.towerX;
/** The keeper's next activity: mostly out on the gallery, sometimes inside. */
function nextAct(s: State) {
  const out = s.keeper.act !== "in";
  const act = out && Math.random() < 0.45 ? "in" : (["sweep", "wave", "watch"] as const)[Math.floor(Math.random() * 3)];
  s.keeper = { act, left: act === "in" ? 4 + Math.random() * 5 : act === "wave" ? 3 : 5 + Math.random() * 4 };
}

// -- The helper alert --------------------------------------------------------

const alert: AlertSpec = {
  layout: (members) => ({ width: 4 + members.length * 11, figures: rowOf(members, 4, 11, 7), extra: {} }),
  still(b, p) {
    const P = PALETTES[p.theme];
    b.fillStyle = P.water!;
    b.fillRect(0, p.px(AG), p.layout.width * p.s, p.s);
  },
  // A gull gliding with the amber "!"; failed, under a rain cloud.
  moving(v, p) {
    for (const [i, f] of p.layout.figures.entries()) {
      const bob = p.reduced ? 0 : Math.round(Math.sin(p.t * 1.5 + i) * 0.8 * p.s) / p.s;
      p.blit(v, paint(GULL_GLIDE, p.theme), f.x, 6 + bob);
      if (f.member.kind === "waiting") p.bang(v, f.x + 8, 2, p.t + i * 0.4);
      else p.failed(v, f.x + 2, 0, p.t + i);
    }
  },
};

// -- The scene -------------------------------------------------------------

export const lighthouse = defineScene<State, Gull>({
  id: "lighthouse",
  name: "Lighthouse",
  state: () => ({ towerX: 0, rocks: [], turn: 0, crash: null, flash: null, fog: 0, ship: null, keeper: { act: "watch", left: 6 } }),

  layout(s, k) {
    const W = k.W;
    s.towerX = Math.floor(W * 0.62);   // right of center, so a phone's crop keeps sea around it
    const rnd = seeded(W * 23 + 1);
    // A low rock under the tower, flat where it stands, sloping into the sea.
    s.rocks = Array.from({ length: W }, (_, x) => {
      const d = Math.abs(x - (s.towerX + 5.5));
      if (d < 6) return BASE;
      if (d > 18) return WATER + 2;
      return Math.min(WATER, BASE + Math.round((d - 6) / 7 + rnd() * 0.6));
    });
  },
  mood(s, k) { if (k.mood.kind !== "rate") s.fog = Math.min(s.fog, 0.99); },
  // A new run: the lamp mid-turn and a wave just breaking.
  start(s, k) { s.turn = Math.random(); s.keeper = { act: "watch", left: 3 + Math.random() * 3 }; if (k.mood.kind === "working") crash(s); },

  focus: (s) => keeperX(s) + 1,

  crew: {
    max: (k) => (k.narrow ? 2 : 4),
    // A gull glides in and circles over the water.
    // Each circles its own patch of sky, low enough to leave room for its marker.
    join: (_s, k, _m, shown) => ({ cx: Math.floor(k.W * [0.14, 0.34, 0.24, 0.5][(shown - 1) % 4]), cy: [7, 8, 7, 8][(shown - 1) % 4], r: 4, phase: Math.random() * 6, come: k.reduced ? 1 : 0 }),
    // Finished: it flies off and fades.
    leave() {},
  },

  step(s, k) { return k.mood.kind === "working" && crash(s); },

  surprise: {
    active: (s) => s.ship !== null,
    start(s) { s.ship = 0; },
  },

  hits(s, k) {
    const out: HitTarget[] = [{ target: "lead", box: [s.towerX, 0, TOWER_W, BASE], at: [keeperX(s) + 1, 0] }];
    for (const c of k.crew) {
      if (c.leaving) continue;
      const [gx, gy] = gullXY(c, k);
      out.push({ target: "member", id: c.id, box: [gx - 1, gy - 1, 9, 5], at: [gx + 3, gy] });
    }
    out.push({ target: "flock", id: "waves", box: [s.towerX - 12, WATER - 1, 8, 4], at: [s.towerX - 8, WATER - 1] });
    return out;
  },
  // The lamp flashes; "♪ caw"; a splash on the rocks.
  tap(s, k, hit) {
    if (hit.target === "member") { const c = k.crew.find((m) => m.id === hit.id); if (c) k.react(c, TIME.tap); return; }
    if (hit.target === "lead") { k.react("keeper", TIME.tap); s.flash = 0; return; }
    if (!k.reduced) crash(s);
  },

  errorCloudX: (s) => keeperX(s) - 4,

  // Below the waterline: the sea, with ripples, and the rock's foot under the tower.
  below(s, k, b) {
    const P = PALETTES[k.theme], v = b.v, t = k.t, dark = k.theme === "dark";
    const rows = Math.round(b.H * b.level);
    for (let y = 0; y < rows; y++) {
      v.globalAlpha = (dark ? 0.16 : 0.12) + (dark ? 0.14 : 0.1) * (y / Math.max(1, b.H));
      v.fillStyle = P.water!;
      v.fillRect(0, b.px(y), b.W * b.s3, b.s3);
    }
    if (rows <= 0) return;
    v.globalAlpha = (dark ? 0.35 : 0.5) * b.level;
    v.fillStyle = P.ripple!;
    for (let i = 0; i < b.W / 14; i++) v.fillRect(b.px(((i * 41 + t * (2 + (i % 3))) % b.W + b.W) % b.W), b.px(1 + (i * 5) % Math.max(1, rows)), 2 * b.s3, b.s3);
    v.globalAlpha = (dark ? 0.3 : 0.25) * b.level;
    v.fillStyle = P.rock!;
    const foot = Math.min(rows, 3);
    for (let y = 0; y < foot; y++) v.fillRect(b.px(s.towerX - 2 - y * 2), b.px(y), (TOWER_W + 4 + y * 4) * b.s3, b.s3);
    v.globalAlpha = 1;
  },

  update(s, k, dt) {
    const mk = k.mood.kind;
    if (mk === "working" || mk === "idle" || mk === "error") s.turn = (s.turn + dt / 6) % 1;
    if (s.crash !== null && (s.crash += dt) > CRASH_SECONDS) s.crash = null;
    if (s.flash !== null && (s.flash += dt) > 0.6) s.flash = null;
    s.fog = mk === "rate" ? Math.min(1, s.fog + dt / 3) : Math.max(0, s.fog - dt / 2);
    for (const c of k.crew) {
      if (c.leaving) { c.cx -= dt * SPEED.trot; c.alpha -= dt / 1.4; continue; }
      c.come = Math.min(1, c.come + dt / 2);
    }
    if (s.ship !== null && ((s.ship += dt / 16) >= 1 || mk !== "working")) s.ship = null;
    if ((mk === "working" || mk === "idle") && !k.resting && !k.gagId && (s.keeper.left -= dt) <= 0) nextAct(s);
  },

  settle(s, k) {
    s.crash = null;
    s.flash = null;
    s.ship = null;
    s.fog = k.mood.kind === "rate" ? 1 : 0;
    s.keeper = { act: "watch", left: 6 };
    k.crew = k.crew.filter((c) => !c.leaving);
    for (const c of k.crew) c.come = 1;
  },

  draw(s, k) {
    const v = k.ctx, theme = k.theme, P = PALETTES[theme];
    const W = k.W, mk = k.mood.kind, t = k.t, e = k.evening(), season = k.season;

    if (e > 0.8) for (const [x, y] of [[8, 1], [W * 0.3, 2], [W * 0.52, 1], [W - 8, 2]]) k.dot(Math.floor(x), y, theme === "dark" ? "#e8e2ff" : "#8f86c9");
    // A ship on the horizon, or a far sail in summer.
    if (s.ship !== null && !k.reduced) { v.globalAlpha = 0.7; k.blit(paint(SHIP, theme), -10 + s.ship * (W * 0.7), WATER - 4); v.globalAlpha = 1; }
    if (season === "summer") { v.globalAlpha = 0.6; k.blit(paint(SAIL, theme), k.reduced ? W * 0.3 : W * 0.3 + Math.sin(t * 0.1) * 10, WATER - 3); v.globalAlpha = 1; }

    // At dusk, a short, soft beam wedge turning with the lamp; it never
    // reaches across the strip.
    const lit = mk !== "rate" && mk !== "waiting";
    const a = s.turn * Math.PI * 2;
    if (lit && e > 0.45 && Math.cos(a) < 0) {
      const strength = Math.min(1, (e - 0.45) * 1.6) * -Math.cos(a);
      v.fillStyle = P.beam!;
      for (let i = 1; i < 12; i++) {
        v.globalAlpha = strength * 0.16 * (1 - i / 12);
        const bx = lampX(s) - i * 2, spread = Math.floor(i / 4);
        for (let dy = -spread; dy <= spread; dy++) k.dot(bx, lampY + dy);
      }
      v.globalAlpha = 1;
    }

    // Water: a rolling line, ripples under it.
    v.fillStyle = P.water!;
    for (let x = 0; x < W; x++) k.dot(x, WATER + Math.round(Math.sin(x * 0.3 + t * 1.4) * 0.5));
    v.fillStyle = P.ripple!;
    for (let i = 0; i < W / 14; i++) k.dot(((i * 41 + t * (2 + (i % 3))) % W + W) % W, WATER + 2 + (i % 3));

    // Rocks and the lighthouse: cached.
    const back = k.layer("rocks", `${W}:${theme}:${season}:${k.s3}`, v.canvas.width, v.canvas.height, (b) => {
      const s3 = k.s3;
      for (let x = 0; x < W; x++) {
        const top = s.rocks[x];
        if (top > WATER + 1) continue;
        b.fillStyle = P.rock!;
        b.fillRect(k.px(x), k.px(top), s3, (WATER + 4 - top) * s3);
        b.fillStyle = season === "winter" ? SNOW[theme] : P.rockTop!;
        b.fillRect(k.px(x), k.px(top), s3, s3);
      }
      const c = paint(TOWER, theme);
      b.drawImage(c, k.px(s.towerX - 1), k.px(TOWER_TOP - 1), c.width * s3, c.height * s3);
    });
    v.drawImage(back, 0, 0);

    // The lamp: cream, turning bright and dim, flashing on a tap, steady while waiting on you.
    const ly = lampY;
    const lampOn = s.flash !== null || mk === "waiting" ? 1 : mk === "rate" ? 0 : 0.35 + 0.65 * Math.max(0, -Math.cos(a));
    if (lampOn > 0) glow(v, k.view, lampX(s) + 0.5, ly, 2, P.l!, lampOn * 0.6);

    // The keeper on the gallery, or inside while resting.
    const kx = keeperX(s), ky = GALLERY - 5;
    const pose = keeperPose(s, k);
    if (pose) k.blit(paint(KEEPER[pose], theme), kx - 1, ky - 1 + (pose === "sit" ? 1 : 0));
    // Waiting on you: the keeper holds out a lantern, the amber signal.
    if (mk === "waiting") k.signal(kx - 2, GALLERY - 3);

    // A wave crashing on the rocks.
    if (s.crash !== null) {
      const ck = s.crash / CRASH_SECONDS;
      v.globalAlpha = 1 - ck;
      const sx = s.towerX - 10;
      for (const [dx, dy] of [[0, -1], [1, -2], [2, -3], [3, -2], [-1, -2], [4, -1], [2, -4]]) k.dot(sx + dx * (1 + ck), WATER + dy - ck * 3, P.spray!);
      v.globalAlpha = 1;
    }

    // Gulls wheeling, each with its colored tag.
    for (const c of k.crew) {
      const [gx, gy] = gullXY(c, k);
      const flap = !k.reduced && c.kind === "working" && Math.floor(t * 4 + c.phase) % 2 === 0;
      v.globalAlpha = Math.max(0, Math.min(c.alpha, c.come));
      k.blit(paint(flap ? GULL : GULL_GLIDE, theme), gx - 1, gy - 1);
      k.dot(gx + 3, gy, c.color); k.dot(gx + 3, gy + 1, c.color);
      v.globalAlpha = 1;
      if (!c.leaving) k.marker(c.kind, gx + 3, gy - 6);
    }

    // Fog rolling in while resting.
    if (s.fog > 0) {
      v.fillStyle = P.fog!;
      // A few soft fog banks: rounded rows, wider in the middle, drifting slowly.
      for (const [i, [fx, fy, fw]] of ([[0.12, 5, 26], [0.42, 8, 34], [0.7, 4, 24]] as const).entries()) {
        const cx = Math.floor(fx * W + (k.reduced ? 0 : Math.sin(t * 0.15 + i * 2) * 4));
        for (const [dy, inset] of [[-1, 5], [0, 0], [1, 3]]) {
          v.globalAlpha = s.fog * (dy === 0 ? 0.5 : 0.35);
          v.fillRect(k.px(cx + inset), k.px(fy + dy), (fw - inset * 2) * k.s3, k.s3);
        }
      }
      v.globalAlpha = 1;
    }

    k.note("keeper", "♪ ahoy", kx + 1, ky - 1);
    for (const c of k.crew) { const [gx, gy] = gullXY(c, k); k.note(c, "♪ caw", gx + 3, gy - 1); }
  },

  motion(s, k): Motion {
    const mk = k.mood.kind;
    if (s.crash !== null || s.flash !== null || s.ship !== null) return "fast";
    if (k.crew.some((c) => c.leaving || c.come < 1 || c.kind === "working")) return mk === "idle" && !k.crew.some((c) => c.leaving) ? "still" : "fast";
    if (mk === "rate") return s.fog < 1 ? "fast" : "slow";
    if (k.resting) return "slow";   // the lamp turns and the waves roll
    // The lamp turns and the waves roll: gentle.
    return mk === "idle" ? "still" : "slow";
  },

  gags: [
    // A gull swoops in and steals the keeper's sandwich; the keeper shakes a fist.
    {
      id: "sandwich",
      seconds: 3.5,
      draw(s, k, p) {
        const kx = keeperX(s), y = GALLERY - 2;
        if (p < 0.45) k.dot(kx + 3, y, SANDWICH);
        const gx = p < 0.45 ? k.W + 4 - (k.W + 4 - kx - 3) * (p / 0.45) : kx + 3 - (p - 0.45) * 90;
        const gy = p < 0.45 ? 1 + (y - 2) * (p / 0.45) : y - 1 - (p - 0.45) * 12;
        k.blit(paint(Math.floor(p * 16) % 2 ? GULL : GULL_GLIDE, k.theme, p < 0.45), gx - 4, gy - 1);
        if (p >= 0.45) k.dot(gx, gy + 1, SANDWICH);
      },
    },
    // A wave leaps the rocks and drenches the keeper, who shakes off the water.
    {
      id: "splash",
      seconds: 3,
      draw(s, k, p) {
        const P = PALETTES[k.theme], kx = keeperX(s);
        const v = k.ctx;
        if (p < 0.6) {
          // The spray column rises from the sea past the gallery, then falls.
          const top = p < 0.3 ? WATER - (WATER + 1) * (p / 0.3) : -1 + (p - 0.3) * 20;
          v.globalAlpha = 0.9;
          for (let y = Math.max(-1, Math.floor(top)); y < WATER; y++) for (const dx of [-2, -1, 0, 1]) if ((y + dx) % 2 === 0) k.dot(kx + dx, y, P.spray!);
          v.globalAlpha = 1;
        } else {
          // Drips under the keeper.
          for (let i = 0; i < 3; i++) k.dot(kx + i, GALLERY + 1 + ((k.t * 6 + i * 1.7) % 3), P.spray!);
        }
      },
    },
    // A brisk sweep sends a puff of dust off the gallery, right into a passing gull.
    {
      id: "dust",
      seconds: 3.5,
      draw(s, k, p) {
        const P = PALETTES[k.theme], kx = keeperX(s), v = k.ctx;
        if (p > 0.25 && p < 0.9) {
          const d = (p - 0.25) / 0.65;
          v.globalAlpha = 0.8 * (1 - d);
          for (const [dx, dy] of [[0, 0], [-1, -1], [-2, 0], [-1, 1], [-3, -1], [-2, -2]]) k.dot(kx - 1 + dx * (1 + d * 2), GALLERY - 2 + dy * (1 + d), P.g!);
          v.globalAlpha = 1;
        }
        // The gull flies in from the left, hits the dust, and tumbles on.
        const gx = p < 0.45 ? -8 + (kx - 1) * (p / 0.45) : p < 0.7 ? kx - 9 + (p - 0.45) * 32 : kx - 1 + (p - 0.7) * 60;
        const hit = p >= 0.45 && p < 0.7;
        const gy = GALLERY - 3 + (hit ? Math.sin(k.t * 30) * 1.2 : 0) + (gx > kx - 1 ? (gx - kx + 1) * 0.3 : 0);
        k.blit(paint(hit || Math.floor(p * 14) % 2 ? GULL : GULL_GLIDE, k.theme, true), gx, gy);
      },
    },
  ],

  alert,
});

/** What the keeper is doing now, or null while the keeper is inside. */
function keeperPose(s: State, k: K): KeeperPose | null {
  const mk = k.mood.kind, t = k.t;
  if (mk === "rate") return null;
  if (k.resting) return "sit";
  if (mk === "waiting") return "front";
  if (mk === "error") return "front";
  const swing = !k.reduced && Math.floor(t * 4) % 2 === 0;
  const sandwich = k.gagging("sandwich"), splash = k.gagging("splash"), dust = k.gagging("dust");
  if (sandwich !== null) return sandwich < 0.45 ? "front" : swing ? "shake" : "shake2";
  if (splash !== null) return splash < 0.55 ? "watch" : swing ? "shake" : "shake2";
  if (dust !== null) return Math.floor(t * 8) % 2 ? "sweep1" : "sweep2";
  if (k.reaction("keeper") !== null) return "wave";
  switch (s.keeper.act) {
    case "in": return null;
    case "wave": return swing ? "wave" : "front";
    case "sweep": return swing ? "sweep1" : "sweep2";
    default: return "watch";
  }
}

/** Where a gull is on its circle. */
function gullXY(c: Member, k: K): [number, number] {
  const still = k.reduced || c.kind !== "working";
  const a = (still ? c.phase : k.t * 0.5 + c.phase);
  const x = c.cx + Math.cos(a) * c.r * c.come - (1 - c.come) * 20;
  return [x, c.cy + Math.sin(a) * 0.8];
}
type Member = K["crew"][number];
