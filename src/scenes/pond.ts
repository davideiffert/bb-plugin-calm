// Pond: a duck paddling on a lily pond among the reeds, with a frog on the
// lily pads.
//
// Working: the duck paddles back and forth. A step: the frog leaps to
// another pad, with rings where it lands. Waiting on you: the duck stops and
// faces you, the amber signal glows by its head, and a dragonfly hovers
// over it. Rate-limited: the duck sleeps
// with its head tucked under its wing. Error: the kit's rain cloud. Crew:
// ducklings following in a line, each with a colored ribbon. Long run: the
// lilies close and fireflies come out over the reeds. Surprise: a heron
// wades in, looks around, and leaves. Taps: "♪ quack", "♪ peep", "♪ ribbit".
// Seasons: ice at the edges, pink lilies in spring, a blue dragonfly in
// summer, floating leaves in autumn. Gags: the frog misses a lily pad and
// plops in; the duck dips bottom-up and stays that way a beat too long; a
// dragonfly lands on the duck's head and the duck goes cross-eyed. At rest
// between runs (scenes shown always): the duck sleeps where it is, head
// under a wing, while the ripples drift on.
import { defineScene, type HitTarget, type Kit } from "../kit/engine";
import { ALERT_GROUND as AG, rowOf, type AlertSpec } from "../kit/alert";
import { SNOW, seeded, sprite, type Motion, type Sprite } from "../kit/common";
import { SPEED, TIME, WATERLINE } from "../kit/style";
import type { ThemeMode } from "../kit/types";

const WATER = WATERLINE + 1;   // the pond surface sits a row lower than the sea

// -- Art ---------------------------------------------------------------------

const DUCK = {
  swim: [
    "......gg..",
    ".....gGgo.",
    ".....gg...",
    "ww...ww...",
    "wwwwwww...",
    ".wwwwww...",
  ],
  /** Facing you: head up, both eyes. */
  front: [
    "...gg...",
    "..gKgK..",
    "..gooG..",
    "..wwww..",
    ".wwwwww.",
    ".wwwwww.",
  ],
  /** Cross-eyed at a dragonfly on its head. */
  cross: [
    "...gg...",
    "..ggKK..",
    "..gooG..",
    "..wwww..",
    ".wwwwww.",
    ".wwwwww.",
  ],
  /** Bottom up, head under the water, feet kicking. */
  dip: [
    "..........",
    "o.........",
    "ww........",
    "wwww......",
    ".wwwwww...",
    "..wwwwwww.",
  ],
  dip2: [
    "..........",
    ".o........",
    "ww........",
    "wwww......",
    ".wwwwww...",
    "..wwwwwww.",
  ],
  /** Asleep: head tucked under a wing. */
  sleep: [
    "..........",
    "..........",
    "......ww..",
    "ww...wwgw.",
    "wwwwwwww..",
    ".wwwwww...",
  ],
} satisfies Record<string, Sprite>;
const DUCK_W = 10;
const DUCKLING: Sprite = ["...yy", "..yyo", "y.yy.", "yyyy."];
const DUCKLING_W = 5;
const FROG = {
  sit: [".f.f.", "fFfFf", "fffff"],
  leap: ["f...f", ".fFf.", "f.f.f"],
} satisfies Record<string, Sprite>;
const PAD: Sprite = [".pppp.", "pppppp"];
const LILY: Sprite = [".l.", "lLl"];
const REED: Sprite = [".c", ".c", "rr", "rr", "r.", "r.", "r.", "r."];
const HERON: Sprite = [
  "...hh..",
  "...hKbb",
  "...h...",
  "...hh..",
  "..hhhh.",
  ".hhhhh.",
  "..hhh..",
  "...k...",
  "...k...",
  "...k...",
  "..kk...",
];
const DRAGONFLY: Sprite = ["d.d", ".d.", "d.d", ".d."];

const PALETTES: Record<ThemeMode, Record<string, string | null>> = {
  light: {
    w: "#c9a77c", g: "#3f8a5c", G: "#2f6b47", o: "#e8833d", K: "#3b3540", y: "#ecd9a0",
    f: "#6aa84f", F: "#3f7a32", p: "#5a9a5f", l: "#f7f3e8", L: "#f2c94c", c: "#8a6440", r: "#7aa35a",
    h: "#b8c0cc", b: "#c8a46a", k: "#6b6f7a", d: "#4f8fd6", water: "#7fb0d9", ripple: "#a9cbe8", ice: "#dfe9f2",
    outline: "#9c958a",
  },
  dark: {
    w: "#b8956a", g: "#52a674", G: "#3d8058", o: "#f08a50", K: "#2d2833", y: "#f5e7c0",
    f: "#7cc05f", F: "#4f9a40", p: "#4e8a55", l: "#ece7dc", L: "#f2d06a", c: "#a07b55", r: "#6d9450",
    h: "#9aa3b0", b: "#d2ae74", k: "#a0a4ae", d: "#7fb6f0", water: "#4f86c6", ripple: "#35608f", ice: "#a9bdd0",
    outline: null,
  },
};
const paint = (rows: Sprite, theme: ThemeMode, flip = false, extra?: Record<string, string>) =>
  sprite(rows, { ...PALETTES[theme], ...extra }, flip, "wlhy");

// -- State -------------------------------------------------------------------

interface State {
  x: number;
  dir: 1 | -1;
  pads: number[];
  reeds: number[];
  frog: { pad: number; to: number; k: number | null };
  rings: { x: number; k: number }[];
  heron: { x: number; k: number } | null;
}
/** A child thread, shown as a duckling with a colored ribbon. */
interface Duckling { x: number; dir: 1 | -1 }
type K = Kit<State, Duckling>;

const PADDLE = SPEED.walk * 0.8;
const LEAP_SECONDS = 0.6;
const frogX = (s: State) => {
  const from = s.pads[s.frog.pad] + 1, to = s.pads[s.frog.to] + 1;
  return s.frog.k === null ? from : from + (to - from) * s.frog.k;
};
const leap = (s: State) => {
  if (s.frog.k !== null || s.pads.length < 2) return false;
  let to = s.frog.pad;
  while (to === s.frog.pad) to = Math.floor(Math.random() * s.pads.length);
  s.frog.to = to;
  s.frog.k = 0;
  return true;
};

// -- The helper alert --------------------------------------------------------

const alert: AlertSpec = {
  layout: (members) => ({ width: 4 + members.length * 11, figures: rowOf(members, 4, 11, DUCKLING_W), extra: {} }),
  still(b, p) {
    const P = PALETTES[p.theme];
    b.fillStyle = P.water!;
    b.fillRect(0, p.px(AG), p.layout.width * p.s, p.s);
    b.fillStyle = P.ripple!;
    for (let x = 2; x < p.layout.width; x += 7) b.fillRect(p.px(x), p.px(AG + 1), 2 * p.s, p.s);
  },
  // A duckling bobbing; failed, under a rain cloud.
  moving(v, p) {
    for (const [i, f] of p.layout.figures.entries()) {
      const bob = p.reduced ? 0 : Math.round(Math.sin(p.t * 2 + i) * 0.5 * p.s) / p.s;
      p.blit(v, paint(DUCKLING, p.theme), f.x, AG - 4 + bob);
      if (f.member.kind === "waiting") p.bang(v, f.x + 6, AG - 10, p.t + i * 0.4);
      else p.failed(v, f.x + 2, 0, p.t + i);
    }
  },
};

// -- The scene -------------------------------------------------------------

export const pond = defineScene<State, Duckling>({
  id: "pond",
  name: "Pond",
  state: () => ({ x: 30, dir: 1, pads: [], reeds: [], frog: { pad: 0, to: 0, k: null }, rings: [], heron: null }),

  layout(s, k) {
    const W = k.W;
    s.pads = [0.16, 0.34, 0.6, 0.78].map((f) => Math.floor(f * W)).filter((x) => x < W - 8);
    const rnd = seeded(W * 3 + 7);
    s.reeds = [...Array.from({ length: 3 }, (_, i) => 1 + i * 3 + Math.floor(rnd() * 2)), ...Array.from({ length: 3 }, (_, i) => W - 4 - i * 3 - Math.floor(rnd() * 2))];
    s.frog = { pad: Math.min(s.frog.pad, s.pads.length - 1), to: 0, k: null };
    s.x = Math.min(s.x, W - DUCK_W - 14);
  },
  // A new run: the duck mid-pond, paddling, the frog already in the air.
  start(s, k) {
    s.x = 14 + Math.random() * (k.W - DUCK_W - 30);
    s.dir = Math.random() < 0.5 ? 1 : -1;
    s.frog.pad = Math.floor(Math.random() * s.pads.length);
    if (k.mood.kind === "working") leap(s);
  },

  focus: (s) => s.x + DUCK_W / 2,

  crew: {
    max: (k) => (k.narrow ? 2 : 4),
    // A duckling paddles in behind its mother.
    join(s, k) {
      const behind = s.x - s.dir * (8 + k.crew.length * 7);
      return { x: k.reduced ? behind : s.dir > 0 ? -DUCKLING_W : k.W, dir: s.dir };
    },
    // Finished: it paddles off toward the nearer bank.
    leave(_s, k, c) { c.dir = c.x < k.W / 2 ? -1 : 1; },
  },

  step(s, k) { return k.mood.kind === "working" && leap(s); },

  surprise: {
    active: (s) => s.heron !== null,
    start(s) { s.heron = { x: 0, k: 0 }; },
  },

  hits(s, k) {
    const out: HitTarget[] = [{ target: "lead", box: [s.x, WATER - 6, DUCK_W, 7], at: [s.x + 5, WATER - 6] }];
    for (const c of k.crew) if (!c.leaving) out.push({ target: "member", id: c.id, box: [c.x, WATER - 4, DUCKLING_W, 5], at: [c.x + 2.5, WATER - 4] });
    out.push({ target: "flock", id: "frog", box: [frogX(s) - 1, WATER - 4, 7, 4], at: [frogX(s) + 2, WATER - 4] });
    return out;
  },
  // "♪ quack", "♪ peep", or "♪ ribbit".
  tap(_s, k, hit) {
    if (hit.target === "member") { const c = k.crew.find((m) => m.id === hit.id); if (c) k.react(c, TIME.tap); }
    else k.react(hit.target === "lead" ? "duck" : "frog", TIME.tap);
  },

  errorCloudX: (s) => s.x - 1,

  update(s, k, dt) {
    const mk = k.mood.kind;
    if (mk === "working" && !k.resting && k.gagId !== "dip" && k.gagId !== "cross") {
      s.x += s.dir * PADDLE * dt;
      if (s.x > k.W - DUCK_W - 12) s.dir = -1;
      if (s.x < 12) s.dir = 1;
    }
    if (s.frog.k !== null && (s.frog.k += dt / LEAP_SECONDS) >= 1) {
      s.frog.pad = s.frog.to;
      s.frog.k = null;
      s.rings.push({ x: s.pads[s.frog.pad] + 3, k: 0 });
    }
    s.rings = s.rings.filter((r) => (r.k += dt / 1.4) < 1);
    // Ducklings keep in a line behind their mother.
    let slot = 0;
    for (const c of k.crew) {
      if (c.leaving) {
        // It paddles off toward the bank and fades as it goes.
        c.x += c.dir * SPEED.trot * 0.6 * dt;
        c.alpha = Math.max(0, c.alpha - dt / 2);
        continue;
      }
      const target = Math.max(8, Math.min(k.W - DUCKLING_W - 8, s.x + (s.dir > 0 ? -4 - (slot + 1) * 7 : DUCK_W + slot * 7 + 1)));
      slot++;
      if (c.kind !== "working" && c.x >= 8 && c.x <= k.W - DUCKLING_W - 8) continue;   // waiting or failed: it stops
      const dx = target - c.x;
      if (Math.abs(dx) < 0.5) { c.dir = s.dir; continue; }
      c.dir = dx > 0 ? 1 : -1;
      c.x += c.dir * Math.min(Math.abs(dx), (Math.abs(dx) > 10 ? SPEED.trot : PADDLE * 1.2) * dt);
    }
    if (s.heron) {
      s.heron.k += dt / 10;
      if (s.heron.k >= 1 || mk !== "working") s.heron = null;
    }
  },

  settle(s, k) {
    s.frog.k = null;
    s.rings = [];
    s.heron = null;
    k.crew = k.crew.filter((c) => !c.leaving);
    k.crew.forEach((c, i) => { c.x = Math.max(8, Math.min(k.W - DUCKLING_W - 8, s.x + (s.dir > 0 ? -4 - (i + 1) * 7 : DUCK_W + i * 7 + 1))); c.dir = s.dir; });
  },

  draw(s, k) {
    const v = k.ctx, theme = k.theme, P = PALETTES[theme];
    const W = k.W, mk = k.mood.kind, t = k.t, e = k.evening(), season = k.season;

    // Water, reeds, and pads: cached, they only change with size, theme, and season.
    const back = k.layer("pond", `${W}:${theme}:${season}:${k.s3}`, v.canvas.width, v.canvas.height, (b) => {
      const s3 = k.s3;
      for (const x of s.reeds) { const c = paint(REED, theme); b.drawImage(c, k.px(x - 1), k.px(WATER - 8), c.width * s3, c.height * s3); }
      if (season === "winter") {
        b.fillStyle = SNOW[theme];
        for (const x of s.reeds) b.fillRect(k.px(x + 1), k.px(WATER - 7), s3, s3);
      }
      for (const x of s.pads) { const c = paint(PAD, theme); b.drawImage(c, k.px(x - 1), k.px(WATER - 1), c.width * s3, c.height * s3); }
      b.fillStyle = P.water!;
      b.fillRect(0, k.px(WATER + 1), W * s3, s3);
      if (season === "winter") {   // ice at the edges
        b.fillStyle = P.ice!;
        b.fillRect(0, k.px(WATER), Math.floor(W * 0.12) * s3, 2 * s3);
        b.fillRect(k.px(W - Math.floor(W * 0.12)), k.px(WATER), Math.floor(W * 0.12) * s3, 2 * s3);
      }
    });
    v.drawImage(back, 0, 0);

    // Ripples drifting under the surface.
    v.fillStyle = P.ripple!;
    for (let i = 0; i < W / 16; i++) {
      const x = ((i * 47 + (i % 2 ? 1 : -1) * t * 1.5) % W + W) % W;
      v.fillRect(k.px(x), k.px(WATER + 2 + (i % 3)), 2 * k.s3, k.s3);
    }

    // Lilies on the pads: open by day, closed toward evening; pink in spring.
    if (e < 0.7) for (const [i, x] of s.pads.entries()) if (i % 2 === 0) k.blit(paint(LILY, theme, false, season === "spring" ? { l: "#f2a7c3" } : undefined), x + 1, WATER - 2);
    if (season === "autumn") {
      for (let i = 0; i < 3; i++) {
        const x = (i * 67 + 31 + (k.reduced ? 0 : t * 1.2)) % W;
        k.dot(x, WATER, i % 2 ? "#d9772b" : "#c8a03a"); k.dot(x + 1, WATER, i % 2 ? "#d9772b" : "#c8a03a");
      }
    }

    // Rings where the frog landed.
    for (const r of s.rings) {
      v.globalAlpha = 1 - r.k;
      const w = 2 + Math.round(r.k * 5);
      for (const dx of [-w, w]) k.dot(r.x + dx, WATER + 1, P.ripple!);
      v.globalAlpha = 1;
    }

    // The rare heron: it wades in from the right, stands, and leaves.
    if (s.heron && !k.reduced) {
      const hk = s.heron.k;
      const hx = hk < 0.3 ? W + 2 - (hk / 0.3) * W * 0.25 : hk > 0.7 ? W * 0.75 + ((hk - 0.7) / 0.3) * W * 0.3 : W * 0.75;
      k.blit(paint(HERON, theme, hk > 0.7), hx, WATER - 10);
    }

    // The frog: on its pad, or mid-leap.
    const fx = frogX(s);
    if (k.gagging("plop") !== null) { /* the gag draws the frog */ }
    else if (s.frog.k === null) k.blit(paint(FROG.sit, theme), fx - 1, WATER - 4);
    else k.blit(paint(FROG.leap, theme), fx - 1, WATER - 4 - Math.sin(Math.PI * s.frog.k) * 5);

    // Ducklings, each with its ribbon.
    for (const c of k.crew) {
      const bob = k.reduced || c.kind !== "working" ? 0 : Math.sin(t * 3 + c.x) * 0.4;
      v.globalAlpha = Math.max(0, c.alpha);
      k.blit(paint(DUCKLING, theme, c.dir < 0), c.x - 1, WATER - 4 + bob);
      k.dot(c.x + 1, WATER - 2 + bob, c.color); k.dot(c.x + 2, WATER - 2 + bob, c.color);
      v.globalAlpha = 1;
      if (!c.leaving) k.marker(c.kind, c.x + 2, WATER - 9);
    }

    // The duck.
    const bob = k.reduced || mk !== "working" || k.resting ? 0 : Math.sin(t * 2.4) * 0.5;
    const dip = k.gagging("dip"), cross = k.gagging("cross");
    const dipped = dip !== null && dip > 0.12 && dip < 0.88;
    const pose = mk === "rate" || k.resting ? DUCK.sleep : mk === "waiting" ? DUCK.front
      : dipped ? (Math.floor(t * 6) % 2 ? DUCK.dip : DUCK.dip2)
      : cross !== null && cross > 0.35 && cross < 0.85 ? DUCK.cross : cross !== null && cross > 0.25 ? DUCK.front : DUCK.swim;
    const facing = pose === DUCK.swim || pose === DUCK.dip || pose === DUCK.dip2;
    k.blit(paint(pose, theme, facing && (mk === "working" || mk === "error" || mk === "idle") ? s.dir < 0 : false), s.x - 1, WATER - 6 + (dipped ? 0 : bob));

    // Waiting on you: the signal by the duck's head, a dragonfly hovering over it.
    if (mk === "waiting") {
      const sx = s.x + DUCK_W, sy = WATER - 8;
      k.signal(sx, sy);
      const dx = sx + (k.reduced ? 0 : Math.sin(t * 1.5) * 1.5), dy = sy - 4 + (k.reduced ? 0 : Math.sin(t * 3) * 0.6);
      k.blit(paint(DRAGONFLY, theme), dx - 1, dy - 1);
    } else if (season === "summer") {   // a blue dragonfly darting over the water
      const dx = k.reduced ? W * 0.45 : (W * 0.45 + Math.sin(t * 0.7) * W * 0.2), dy = 4 + (k.reduced ? 0 : Math.sin(t * 2.3) * 1.5);
      k.blit(paint(DRAGONFLY, theme), dx - 1, dy - 1);
    }

    // Fireflies over the reeds at dusk.
    if (e > 0.7) k.fireflies(17, 5, 3, 5);

    // Tap notes.
    k.note("duck", "♪ quack", s.x + 5, WATER - 7);
    k.note("frog", "♪ ribbit", fx + 2, WATER - 5);
    for (const c of k.crew) k.note(c, "♪ peep", c.x + 2, WATER - 5);
  },

  motion(s, k): Motion {
    const mk = k.mood.kind;
    if (s.frog.k !== null || s.rings.length || s.heron) return "fast";
    if (k.crew.some((c) => c.leaving || (c.kind === "working" && mk === "working"))) return "fast";
    if (k.resting) return "slow";   // asleep: the ripples drift
    if (mk === "working") return "fast";
    // Ripples drift, the dragonfly hovers, the rain falls: gentle.
    return mk === "idle" ? "still" : "slow";
  },

  gags: [
    // The frog leaps for a lily pad, falls short, and plops in; it pops up and climbs back.
    {
      id: "plop",
      seconds: 3.5,
      ready: (s) => s.frog.k === null && s.pads.length > 1,
      draw(s, k, p) {
        const P = PALETTES[k.theme], v = k.ctx;
        const home = s.pads[s.frog.pad] + 1, other = s.pads[(s.frog.pad + 1) % s.pads.length] + 1;
        const short = home + (other - home) * 0.6;
        if (p < 0.3) {
          const q = p / 0.3;
          k.blit(paint(FROG.leap, k.theme), home + (short - home) * q - 1, WATER - 4 - Math.sin(Math.PI * q) * 6 + q * 3);
        } else if (p < 0.75) {
          // Rings where it went in, then its eyes peek out.
          const q = (p - 0.3) / 0.45, w = 1 + Math.round(q * 5);
          v.globalAlpha = 1 - q;
          for (const dx of [-w, w]) k.dot(short + 2 + dx, WATER + 1, P.ripple!);
          v.globalAlpha = 1;
          if (q > 0.45) { k.dot(short + 1, WATER, P.F!); k.dot(short + 3, WATER, P.F!); }
        } else {
          const q = (p - 0.75) / 0.25;
          k.blit(paint(FROG.leap, k.theme), short + (home - short) * q - 1, WATER - 4 - Math.sin(Math.PI * q) * 4 + (1 - q) * 2);
          if (q > 0.9) k.blit(paint(FROG.sit, k.theme), home - 1, WATER - 4);
        }
      },
    },
    // The duck dips bottom-up and stays under a beat too long, blowing bubbles.
    {
      id: "dip",
      seconds: 3.5,
      draw(s, k, p) {
        if (p < 0.4 || p > 0.88) return;
        const P = PALETTES[k.theme], head = s.dir > 0 ? s.x + 8 : s.x;
        for (let i = 0; i < 2; i++) k.dot(head + i, WATER - ((k.t * 3 + i * 0.8) % 2), P.ripple!);
      },
    },
    // A dragonfly lands on the duck's head; the duck goes cross-eyed looking at it.
    {
      id: "cross",
      seconds: 3.5,
      draw(s, k, p) {
        const headX = s.x + 3, headY = WATER - 8;
        const from = k.W + 4;
        const x = p < 0.3 ? from + (headX - from) * (p / 0.3) : p > 0.85 ? headX + (p - 0.85) * 200 : headX;
        const y = p < 0.3 ? 2 + (headY - 2) * (p / 0.3) : p > 0.85 ? headY - (p - 0.85) * 40 : headY;
        k.blit(paint(DRAGONFLY, k.theme), x - 1, y - 1);
      },
    },
  ],

  alert,
});
