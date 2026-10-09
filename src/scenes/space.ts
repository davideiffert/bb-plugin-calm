// Space: an astronaut floating on a tether beside a little capsule, a ringed
// planet hanging in the stars.
//
// Working: the astronaut drifts gently on the tether, the stars twinkle. A
// step: a slow somersault. Waiting on you: the astronaut faces you and the
// helmet lamp glows amber. Rate-limited: back inside the capsule, hatch
// shut, the window lit. Error: the kit's rain cloud (even here). Crew: small
// satellites with solar panels in each helper's color. Long run: the planet
// turns to its night side and its city lights come on. Surprise: a flying
// saucer zips past. Taps: a wave, "♪ beep". Seasons: none out here. Gags:
// the astronaut drops a wrench and chases it in slow motion; a satellite
// bonks the helmet; a tiny alien waves from the planet, and the astronaut
// waves back. At rest between runs (scenes shown always): the astronaut is
// back inside the capsule with the window lit, as when rate-limited, and the
// stars twinkle slowly.
import { defineScene, type HitTarget, type Kit } from "../kit/engine";
import { rowOf, type AlertSpec } from "../kit/alert";
import { glow, seeded, sprite, type Motion, type Sprite } from "../kit/common";
import { CREAM, SPEED, TIME } from "../kit/style";
import type { ThemeMode } from "../kit/types";

// -- Art ---------------------------------------------------------------------

const ASTRO = {
  /** Floating, facing right. */
  up: [".www..", "wvvvw.", "wvvvw.", ".www..", "wwwwwb", "wwwwwb", ".w.w..", ".w.w.."],
  /** Turned on its side, for the somersault. */
  side: ["........", "ww....ww", "wwwwwwvw", "wwwwwwvw", "bb.wwww.", "........"],
  down: [".w.w..", ".w.w..", "wwwwwb", "wwwwwb", ".www..", "wvvvw.", "wvvvw.", ".www.."],
  front: [".www..", "wvvvw.", "wvavw.", ".www..", "wwwwww", "wwwwww", ".w..w.", ".w..w."],
} satisfies Record<string, Sprite>;
const ASTRO_W = 6;
const CAPSULE: Sprite = ["...kk...", "..kkkk..", ".kkqqkk.", "kkkqqkkk", "kkkkkkkk", "kkkkdkkk", ".kk..kk."];
const SATELLITE: Sprite = ["c..c", "cmmc", "c..c"];
/** Waving back: one glove raised. */
const ASTRO_WAVE: Sprite = [".www.w", "wvvvww", "wvavw.", ".www..", "wwwwww", "wwwww.", ".w..w.", ".w..w."];
const ALIEN: Sprite = ["Lz.zL", ".zzz.", ".zLz.", "z...z"];
const ALIEN2: Sprite = ["z...L", "zzzz.", ".zLz.", "z...z"];
const SAUCER: Sprite = ["..gg..", ".gggg.", "rrrrrr", ".r.r.r"];

const PALETTES: Record<ThemeMode, Record<string, string | null>> = {
  light: {
    w: "#f1efea", v: "#5a7aa8", b: "#b0b4be", a: "#8a8f9a", k: "#a8acb8", q: "#5a7aa8", d: "#7a808c",
    c: "#4f8fd6", m: "#9a9aa2", g: "#7fc0d0", r: "#9aa0ac", z: "#4f9a5a", L: "#2e3a2e", W: "#8a8f9a",
    star: "#7f8fb0", planet: "#ecd8bf", planetShade: "#dcc2a4", ring: "#d6cade", lights: CREAM.light, tether: "#8a8a92",
    outline: "#6a6670",
  },
  dark: {
    w: "#e4e2dc", v: "#3a5a88", b: "#8a8f9a", a: "#5a5f6a", k: "#7a7f8c", q: "#8ab0e0", d: "#4a4e5a",
    c: "#6fa3e8", m: "#7a7a82", g: "#7fc0d0", r: "#8a90a0", z: "#7fd08a", L: "#1a2a1a", W: "#b0b6c2",
    star: "#e8e2ff", planet: "#7e5e44", planetShade: "#5a4232", ring: "#5e5474", lights: CREAM.dark, tether: "#6a6a72",
    outline: null,
  },
};
const paint = (rows: Sprite, theme: ThemeMode, flip = false, extra?: Record<string, string>) =>
  sprite(rows, { ...PALETTES[theme], ...extra }, flip, "w");

// -- State -------------------------------------------------------------------

interface State {
  capX: number;
  planetX: number;
  stars: { x: number; y: number; ph: number }[];
  flip: number | null;
  saucer: number | null;
  /** 0 = out on the tether, 1 = inside the capsule (resting). */
  reel: number;
}
/** A child thread, shown as a satellite with panels in its color. */
interface Sat { x: number; y: number; dir: 1 | -1; speed: number }
type K = Kit<State, Sat>;

const FLIP_SECONDS = 1.2;
/** Inside the capsule: rate-limited, or resting between runs and reeled all the way in. */
const inside = (s: State, k: K) => k.mood.kind === "rate" || s.reel >= 1;
const REEL_SECONDS = 2.5;
const somersault = (s: State) => { if (s.flip !== null) return false; s.flip = 0; return true; };
/** The astronaut's place: drifting on the tether out from the capsule. */
function astroXY(s: State, k: K): [number, number] {
  const still = k.reduced || k.mood.kind === "waiting";
  // Swimming after a dropped wrench; knocked back by a satellite.
  const wrench = k.gagging("wrench"), bonk = k.gagging("bonk");
  const chase = wrench !== null ? Math.sin(Math.PI * Math.min(1, wrench * 1.15)) * 7 : 0;
  const knock = bonk !== null && bonk > 0.45 ? Math.sin(Math.PI * (bonk - 0.45) / 0.55) * -3 : 0;
  const out: [number, number] = [s.capX + 16 + chase + knock + (still ? 0 : Math.sin(k.t * 0.35) * 5), 4 + (still ? 0 : Math.sin(k.t * 0.5) * 1.5)];
  // Reeling in to the hatch, or paying out again.
  const hatch: [number, number] = [s.capX + 1, 6];
  return [out[0] + (hatch[0] - out[0]) * s.reel, out[1] + (hatch[1] - out[1]) * s.reel];
}

// -- The helper alert --------------------------------------------------------

const alert: AlertSpec = {
  layout: (members) => ({ width: 4 + members.length * 9, figures: rowOf(members, 4, 9, 4), extra: {} }),
  still(b, p) {
    const P = PALETTES[p.theme];
    b.fillStyle = P.star!;
    for (const [x, y] of [[1, 2], [p.layout.width - 2, 9], [Math.floor(p.layout.width / 2), 11]]) b.fillRect(p.px(x), p.px(y), p.s, p.s);
  },
  // A satellite with the amber "!"; failed, under a rain cloud.
  moving(v, p) {
    for (const [i, f] of p.layout.figures.entries()) {
      const bob = p.reduced ? 0 : Math.round(Math.sin(p.t * 1.2 + i) * 0.6 * p.s) / p.s;
      p.blit(v, paint(SATELLITE, p.theme), f.x, 7 + bob);
      if (f.member.kind === "waiting") p.bang(v, f.x + 5, 2, p.t + i * 0.4);
      else p.failed(v, f.x + 1, 0, p.t + i);
    }
  },
};

// -- The scene -------------------------------------------------------------

export const space = defineScene<State, Sat>({
  id: "space",
  name: "Space",
  state: () => ({ capX: 20, planetX: 0, stars: [], flip: null, saucer: null, reel: 0 }),

  layout(s, k) {
    const W = k.W;
    s.capX = Math.floor(W * 0.12);
    s.planetX = Math.floor(W * 0.78);
    const rnd = seeded(W * 29 + 13);
    s.stars = Array.from({ length: Math.floor(W / 9) }, () => ({ x: rnd() * W, y: Math.floor(rnd() * 15), ph: rnd() * 6 }));
  },
  // A new run: out on the tether, mid-somersault.
  start(s, k) { if (k.mood.kind === "working") somersault(s); },

  focus: (s, k) => (inside(s, k) ? s.capX + 4 : astroXY(s, k)[0] + 3),

  crew: {
    max: (k) => (k.narrow ? 2 : 4),
    // A satellite drifts into view on its own orbit.
    join(_s, k, _m, shown) {
      const fromLeft = shown % 2 === 0;
      return { x: k.reduced ? k.W * (0.3 + shown * 0.1) : fromLeft ? -5 : k.W, y: [5, 11, 8, 5][(shown - 1) % 4], dir: fromLeft ? 1 : -1, speed: SPEED.drift * (0.3 + Math.random() * 0.3) };
    },
    // Finished: it drifts off and fades.
    leave() {},
  },

  step(s, k) { return k.mood.kind === "working" && somersault(s); },

  surprise: {
    active: (s) => s.saucer !== null,
    start(s) { s.saucer = 0; },
  },

  hits(s, k) {
    const [ax, ay] = astroXY(s, k);
    const out: HitTarget[] = [inside(s, k)
      ? { target: "lead", box: [s.capX, 7, 8, 7], at: [s.capX + 4, 7] }
      : { target: "lead", box: [ax, ay, ASTRO_W, 8], at: [ax + 3, ay] }];
    for (const c of k.crew) if (!c.leaving) out.push({ target: "member", id: c.id, box: [c.x - 1, c.y - 1, 6, 5], at: [c.x + 2, c.y] });
    return out;
  },
  // A wave; "♪ beep".
  tap(_s, k, hit) {
    if (hit.target === "member") { const c = k.crew.find((m) => m.id === hit.id); if (c) k.react(c, TIME.tap); return; }
    if (hit.target === "lead") k.react("astro", TIME.tap);
  },

  errorCloudX: (s, k) => (inside(s, k) ? s.capX : astroXY(s, k)[0] - 3),

  // Below: more of the same sky, stars twinkling behind the text, and the tether's end.
  below(s, k, b) {
    const P = PALETTES[k.theme], v = b.v, t = k.t, dark = k.theme === "dark";
    const rows = Math.round(b.H * b.level);
    if (rows <= 0) return;
    const rnd = seeded(b.W * 29 + 17);
    v.fillStyle = P.star!;
    for (let i = 0; i < b.W / 8; i++) {
      const x = rnd() * b.W, y = rnd() * b.H, ph = rnd() * 6.3;
      if (y >= rows) continue;
      v.globalAlpha = (dark ? 0.7 : 0.55) * b.level * (k.reduced ? 0.8 : 0.4 + 0.5 * Math.sin(t * (k.resting ? 0.35 : 0.9) + ph));
      b.dot(x, y);
    }
    v.globalAlpha = 1;
  },

  update(s, k, dt) {
    const mk = k.mood.kind;
    if (s.flip !== null && (s.flip += dt) > FLIP_SECONDS) s.flip = null;
    s.reel = k.resting ? Math.min(1, s.reel + dt / REEL_SECONDS) : Math.max(0, s.reel - dt / REEL_SECONDS);
    for (const c of k.crew) {
      if (c.leaving) { c.x += c.dir * SPEED.drift * dt; c.alpha -= dt / 1.5; continue; }
      const entering = c.x < 6 || c.x > k.W - 10;
      if (c.kind !== "working" && !entering) continue;
      c.x += c.dir * (entering ? SPEED.drift : c.speed) * dt;
      if (c.x > k.W - 10 && c.dir > 0) c.dir = -1;
      if (c.x < 6 && c.dir < 0) c.dir = 1;
    }
    if (s.saucer !== null && ((s.saucer += dt / 5) >= 1 || mk !== "working")) s.saucer = null;
  },

  settle(s, k) {
    s.flip = null;
    s.saucer = null;
    s.reel = k.resting ? 1 : 0;
    k.crew = k.crew.filter((c) => !c.leaving);
    for (const c of k.crew) c.x = Math.max(6, Math.min(c.x, k.W - 10));
  },

  draw(s, k) {
    const v = k.ctx, theme = k.theme, P = PALETTES[theme];
    const W = k.W, mk = k.mood.kind, t = k.t, e = k.evening();

    // Stars, twinkling.
    for (const st of s.stars) {
      v.globalAlpha = k.reduced ? 0.7 : 0.4 + 0.4 * Math.sin(t * (k.resting ? 0.35 : 0.9) + st.ph);
      k.dot(st.x, st.y, P.star!);
    }
    v.globalAlpha = 1;

    // The ringed planet, turning toward its night side on a long run.
    const night = Math.round(e * 4);
    const planet = k.layer("planet", `${W}:${theme}:${night}:${k.s3}`, v.canvas.width, v.canvas.height, (b) => {
      const s3 = k.s3, cx = s.planetX, cy = 8, r = 5;
      for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) {
        if (x * x + y * y > r * r + 1) continue;
        const dark = x > r - 1 - night * 2.5;
        b.fillStyle = dark ? P.planetShade! : P.planet!;
        b.fillRect(k.px(cx + x), k.px(cy + y), s3, s3);
        if (dark && night >= 2 && ((x + 9) * 31 + (y + 9) * 17) % 11 === 0) { b.fillStyle = P.lights!; b.fillRect(k.px(cx + x), k.px(cy + y), s3, s3); }
      }
      b.fillStyle = P.ring!;
      // The ring: a tilted band across the planet's face.
      for (let x = -9; x <= 9; x++) b.fillRect(k.px(cx + x), k.px(cy + Math.round(x * 0.2) + 1), s3, s3);
    });
    v.drawImage(planet, 0, 0);

    // The flying saucer zipping past.
    if (s.saucer !== null && !k.reduced) {
      const sx = -8 + s.saucer * (W + 16);
      k.blit(paint(SAUCER, theme), sx, 2 + Math.sin(t * 6) * 0.6);
      if (Math.floor(t * 6) % 2) k.dot(sx + 2, 6, P.g!);
    }

    // Satellites with panels in their helpers' colors.
    for (const c of k.crew) {
      const bob = k.reduced || c.kind !== "working" ? 0 : Math.sin(t * 0.8 + c.speed) * 0.5;
      v.globalAlpha = Math.max(0, c.alpha);
      k.blit(paint(SATELLITE, theme, false, { c: c.color }), c.x - 1, c.y - 1 + bob);
      v.globalAlpha = 1;
      if (k.reaction(c) !== null && Math.floor(t * 8) % 2) k.dot(c.x + 1, c.y + 1, P.lights!);
      if (!c.leaving) k.marker(c.kind, c.x + 2, c.y - 5);
    }

    // The capsule: its window lit while the astronaut is inside.
    const within = inside(s, k);
    k.blit(paint(CAPSULE, theme, false, within ? { q: P.lights! } : undefined), s.capX - 1, 7);
    if (within) glow(v, k.view, s.capX + 4, 10, 2, P.lights!, 0.6);

    if (!within) {
      const [ax, ay] = astroXY(s, k);
      // The tether, sagging gently.
      const hx = s.capX + 7, hy = 11, tx = ax, ty = ay + 5;
      const n = Math.ceil(Math.hypot(tx - hx, ty - hy) / 1.5);
      v.globalAlpha = 0.7;
      for (let i = 1; i < n; i++) { const f = i / n; k.dot(hx + (tx - hx) * f, hy + (ty - hy) * f + Math.sin(Math.PI * f) * 1.5, P.tether!); }
      v.globalAlpha = 1;
      // The astronaut: upright, turning over, or facing you.
      let pose: Sprite = ASTRO.up;
      const bonk = k.gagging("bonk"), alien = k.gagging("alien");
      if (mk === "waiting") pose = ASTRO.front;
      else if (bonk !== null && bonk > 0.45 && bonk < 0.85) pose = [ASTRO.up, ASTRO.side, ASTRO.down, ASTRO.side][Math.floor(k.t * 6) % 4];
      else if (alien !== null && alien > 0.45) pose = Math.floor(k.t * 4) % 2 ? ASTRO_WAVE : ASTRO.front;
      else if (s.flip !== null && !k.reduced) {
        const q = Math.floor((s.flip / FLIP_SECONDS) * 4) % 4;
        pose = [ASTRO.up, ASTRO.side, ASTRO.down, ASTRO.side][q];
      }
      const wave = k.reaction("astro") !== null && Math.floor(t * 6) % 2 ? 1 : 0;
      k.blit(paint(pose, theme), ax - 1, ay - 1 - wave);
      if (mk === "waiting") k.signal(ax + 4, ay - 1);   // the helmet lamp
      k.note("astro", "♪ hello", ax + 3, ay - 1);
    }
    for (const c of k.crew) k.note(c, "♪ beep", c.x + 2, c.y - 1);
  },

  motion(s, k): Motion {
    const mk = k.mood.kind;
    if (s.flip !== null || s.saucer !== null) return "fast";
    if (k.crew.some((c) => c.leaving || c.x < 6 || c.x > k.W - 10)) return "fast";
    if (k.resting) return s.reel < 1 ? "fast" : "slow";   // reeling in; then the stars twinkle, the window glows
    if (s.reel > 0) return "fast";   // paying out again
    if (mk === "working") return "fast";
    // Stars twinkle and the helmet light blinks: gentle.
    return mk === "idle" ? "still" : "slow";
  },

  gags: [
    // The astronaut lets go of a wrench and swims after it in slow motion, catching it at last.
    {
      id: "wrench",
      seconds: 4,
      draw(s, k, p) {
        if (p > 0.88) return;
        const [ax, ay] = astroXY(s, k), P = PALETTES[k.theme];
        const ahead = 6 + Math.sin(Math.PI * Math.min(1, p * 1.15)) * 4 * (1 - p);
        const wx = ax + ahead, wy = ay + 4 - p * 2, spin = Math.floor(k.t * 3) % 2;
        k.dot(wx, wy, P.W!); k.dot(wx + 1, wy + (spin ? 1 : 0), P.W!); k.dot(wx + 2, wy + (spin ? 2 : 0), P.W!); k.dot(wx + (spin ? 3 : 2), wy + (spin ? 2 : -1), P.W!);
      },
    },
    // A satellite drifts in and bonks the helmet; the astronaut tumbles a moment.
    {
      id: "bonk",
      seconds: 3.5,
      draw(s, k, p) {
        const [ax, ay] = astroXY(s, k), P = PALETTES[k.theme];
        const from = k.W + 4, hit = ax + 5;
        const sx = p < 0.45 ? from + (hit - from) * (p / 0.45) : hit + (p - 0.45) * 90;
        const sy = ay + (p < 0.45 ? 0 : -(p - 0.45) * 8);
        k.blit(paint(SATELLITE, k.theme, false, { c: P.W! }), sx - 1, sy - 1);
        if (p > 0.43 && p < 0.65) for (const [dx, dy] of [[-1, -2], [2, -3], [5, -2], [6, 1]]) k.dot(ax + dx, ay + dy - (p - 0.43) * 6, P.star!);
      },
    },
    // A tiny alien pops up on the planet and waves; the astronaut waves back.
    {
      id: "alien",
      seconds: 4,
      draw(s, k, p) {
        const up = p < 0.2 ? p / 0.2 : p > 0.85 ? 1 - (p - 0.85) / 0.15 : 1;
        const x = s.planetX - 2, top = 8 - 5 - 4;
        const rows = Math.round(up * 4);
        if (rows <= 0) return;
        const c = paint(Math.floor(k.t * 4) % 2 ? ALIEN : ALIEN2, k.theme);
        k.ctx.drawImage(c, 0, 0, c.width, rows + 1, k.px(x - 1), k.px(top + 4 - rows - 1), c.width * k.s3, (rows + 1) * k.s3);
      },
    },
  ],

  alert,
});
