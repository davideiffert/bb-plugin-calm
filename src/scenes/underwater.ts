// Underwater: a sea turtle gliding over a sandy bottom among swaying
// seaweed and coral.
//
// Working: the turtle swims, flippers beating slowly, bubbles drifting up.
// A step: a clam on the sand opens and its pearl gleams. Waiting on you: the
// turtle stops and faces you, and a jellyfish with the amber signal at its
// heart pulses by its head.
// Rate-limited: it rests on the sand, eyes closed, the bubbles stilled.
// Error: the kit's rain cloud. Crew: small fish in each helper's color. Long
// run: the light rays fade and glowing plankton appears. Surprise: a whale
// shark passes far behind. Taps: "♪ blub" and bubbles, a fish flips, the
// clam opens. Seasons: none down here, where the year doesn't reach.
// Gags: the turtle bumps a big bubble and wobbles; a crab pinches a passing
// fish's tail; an octopus inks and vanishes. At rest between runs (scenes
// shown always): the turtle settles on the sand, eyes closed, the bubbles
// stilled, as when rate-limited.
import { defineScene, type HitTarget, type Kit } from "../kit/engine";
import { ALERT_GROUND as AG, rowOf, type AlertSpec } from "../kit/alert";
import { glow, seeded, skyGlow, skyLayer, sprite, type Motion, type Sprite } from "../kit/common";
import { SPEED, TIME } from "../kit/style";
import type { ThemeMode } from "../kit/types";

const FLOOR = 14;   // the sand's top row

// -- Art ---------------------------------------------------------------------

const TURTLE = {
  swim1: [
    "...SSSS.....",
    "..SsSsSS.hh.",
    "fSSSSSSSShhK",
    ".SSsSsSSShh.",
    "f.......f...",
  ],
  swim2: [
    "...SSSS.....",
    "f.SsSsSS.hh.",
    ".SSSSSSSShhK",
    "fSSsSsSSShh.",
    "........f...",
  ],
  front: [
    "...hhhh...",
    "..hKhhKh..",
    ".SShhhhSS.",
    "fSSsSsSSSf",
    ".SSSSSSSS.",
  ],
  rest: [
    "............",
    "...SSSS.....",
    "..SsSsSS.hh.",
    ".SSSSSSSShhk",
    "ffSSsSsSShh.",
  ],
} satisfies Record<string, Sprite>;
const TURTLE_W = 12;
const FISH: Sprite = ["c.ccc.", "cccccK", "c.ccc."];
const FISH_W = 6;
const CLAM = { shut: [".ccc.", "ccccc"], open: ["ccccc", "c.o.c", "ccccc"] } satisfies Record<string, Sprite>;
const JELLY: Sprite = [".jjj.", "jjjjj", "j.j.j", "j.j.."];
const SHARK: Sprite = [
  "....w..........",
  "...www.........",
  ".wwwwwwwwwwwww.",
  "wwwvwwvwwvwwwwww",
  ".wwwwwwwwwwwww.",
  "......ww.......",
];
const CRAB: Sprite = ["C...C", "CC.CC", ".CCC.", "C.C.C"];
const OCTOPUS: Sprite = [".ppp.", "ppppp", "pKpKp", "ppppp", "p.p.p"];
const CORAL: Sprite = ["r.r.r", "rrrrr", ".rrr.", "..r.."];

const PALETTES: Record<ThemeMode, Record<string, string | null>> = {
  light: {
    S: "#3f7a46", s: "#62a85e", h: "#7aa86a", K: "#3b3540", k: "#4a6a4a", f: "#5a8a52",
    c: "#d9b07a", o: "#f7f3e8", j: "#d98ac8", C: "#d0604a", p: "#8a5aa8", g: "#7f8a99", n: "#2e2a36", w: "#b8c8d8", v: "#e8eef4", r: "#e88b8b",
    sand: "#e0c99c", weed: "#3f7a46", bubble: "#7fa9d0", ray: "#9cc8e8", glowing: "#3aa0b4", surface: "#5f93c2",
    outline: "#9c958a",
  },
  dark: {
    S: "#4e8a55", s: "#6aa86a", h: "#86ad78", K: "#2d2833", k: "#4a6a4a", f: "#6a9a5a",
    c: "#c0995e", o: "#ece7dc", j: "#e8a7d8", C: "#e0705a", p: "#a87ac8", g: "#a6b0be", n: "#5a4c78", w: "#3a4a5e", v: "#55688a", r: "#d07474",
    sand: "#4a4236", weed: "#3f7a46", bubble: "#5a86b8", ray: "#9ab8e0", glowing: "#7fe0e8", surface: "#4f7fb8",
    outline: null,
  },
};
const paint = (rows: Sprite, theme: ThemeMode, flip = false, extra?: Record<string, string>) =>
  sprite(rows, { ...PALETTES[theme], ...extra }, flip, "ov");

// -- State -------------------------------------------------------------------

interface State {
  x: number;
  y: number;
  dir: 1 | -1;
  weeds: number[];
  corals: number[];
  clamX: number;
  /** Seconds into the clam's opening, or null. */
  clam: number | null;
  bubbles: { x: number; y: number; k: number }[];
  sinceBubble: number;
  shark: number | null;
}
/** A child thread, shown as a small fish in its color. */
interface Fish { x: number; y: number; dir: 1 | -1; speed: number }
type K = Kit<State, Fish>;

const SWIM = SPEED.drift * 0.8;
const openClam = (s: State) => { if (s.clam !== null) return false; s.clam = 0; s.bubbles.push({ x: s.clamX + 2, y: FLOOR - 2, k: 0 }); return true; };

// -- The helper alert --------------------------------------------------------

const alert: AlertSpec = {
  layout: (members) => ({ width: 4 + members.length * 11, figures: rowOf(members, 4, 11, FISH_W), extra: {} }),
  still(b, p) {
    const P = PALETTES[p.theme];
    b.fillStyle = P.sand!;
    b.fillRect(0, p.px(AG), p.layout.width * p.s, p.s);
    b.fillStyle = P.weed!;
    for (let x = 1; x < p.layout.width; x += 9) b.fillRect(p.px(x), p.px(AG - 4), p.s, 4 * p.s);
  },
  // A fish with the amber "!"; failed, under a rain cloud.
  moving(v, p) {
    for (const [i, f] of p.layout.figures.entries()) {
      const bob = p.reduced ? 0 : Math.round(Math.sin(p.t * 2 + i) * 0.6 * p.s) / p.s;
      p.blit(v, paint(FISH, p.theme, false, { c: "#e88b9b" }), f.x, AG - 6 + bob);
      if (f.member.kind === "waiting") p.bang(v, f.x + 7, AG - 12, p.t + i * 0.4);
      else p.failed(v, f.x + 2, 0, p.t + i);
    }
  },
};

// -- The scene -------------------------------------------------------------

export const underwater = defineScene<State, Fish>({
  id: "underwater",
  name: "Underwater",
  state: () => ({ x: 40, y: 6, dir: 1, weeds: [], corals: [], clamX: 50, clam: null, bubbles: [], sinceBubble: 0, shark: null }),

  layout(s, k) {
    const W = k.W;
    const rnd = seeded(W * 13 + 3);
    s.weeds = Array.from({ length: Math.max(4, Math.floor(W / 28)) }, () => Math.floor(2 + rnd() * (W - 4)));
    s.corals = [0.22, 0.71].map((f) => Math.floor(f * W));
    s.clamX = Math.floor(W * 0.45);
    s.x = Math.min(s.x, W - TURTLE_W - 4);
  },
  // A new run: the turtle mid-water, swimming, the clam just opening.
  start(s, k) {
    s.x = 8 + Math.random() * (k.W - TURTLE_W - 20);
    s.y = 5;
    s.dir = Math.random() < 0.5 ? 1 : -1;
    if (k.mood.kind === "working") openClam(s);
  },

  focus: (s) => s.x + TURTLE_W / 2,

  crew: {
    max: (k) => (k.narrow ? 2 : 4),
    // A small fish swims in from one side, at its own depth.
    join(_s, k, _m, shown) {
      const fromLeft = shown % 2 === 1;
      return { x: k.reduced ? 10 + Math.random() * (k.W - 30) : fromLeft ? -FISH_W : k.W, y: [5, 11, 8, 5][shown % 4], dir: fromLeft ? 1 : -1, speed: SWIM * (0.7 + Math.random() * 0.6) };
    },
    // Finished: it darts off and fades.
    leave() {},
  },

  step(s, k) { return k.mood.kind === "working" && openClam(s); },

  surprise: {
    active: (s) => s.shark !== null,
    start(s) { s.shark = 0; },
  },

  hits(s, k) {
    const out: HitTarget[] = [{ target: "lead", box: [s.x, s.y, TURTLE_W, 5], at: [s.x + 6, s.y] }];
    for (const c of k.crew) if (!c.leaving) out.push({ target: "member", id: c.id, box: [c.x, c.y, FISH_W, 3], at: [c.x + 3, c.y] });
    out.push({ target: "flock", id: "clam", box: [s.clamX - 1, FLOOR - 3, 7, 4], at: [s.clamX + 2, FLOOR - 3] });
    return out;
  },
  // "♪ blub" with bubbles, a fish flips, the clam opens.
  tap(s, k, hit) {
    if (hit.target === "member") { const c = k.crew.find((m) => m.id === hit.id); if (c) { k.react(c, TIME.tap); c.dir = c.dir > 0 ? -1 : 1; } return; }
    if (hit.target === "lead") { k.react("turtle", TIME.tap); if (!k.reduced) for (let i = 0; i < 3; i++) s.bubbles.push({ x: s.x + (s.dir > 0 ? 11 : 0), y: s.y + 1 - i, k: i * 0.1 }); }
    else { k.react("clam", TIME.tap); if (!k.reduced) openClam(s); }
  },

  // The time of day's glow, plus a faint sea-green one: we're under water.
  sky(_s, k) {
    const c = skyGlow(k.evening(), k.theme);
    if (c) { skyLayer(c); skyLayer([190, 60, 55, k.theme === "dark" ? 0.1 : 0.13]); }
  },

  errorCloudX: (s) => s.x,

  // Below the sand: deeper water and bubbles rising past the text.
  below(s, k, b) {
    const P = PALETTES[k.theme], v = b.v, t = k.t, dark = k.theme === "dark";
    const rows = Math.round(b.H * b.level);
    for (let y = 0; y < rows; y++) {
      v.globalAlpha = (dark ? 0.18 : 0.12) + (dark ? 0.14 : 0.1) * (y / Math.max(1, b.H));
      v.fillStyle = P.surface!;
      v.fillRect(0, b.px(y), b.W * b.s3, b.s3);
    }
    if (rows <= 0) return;
    v.globalAlpha = (dark ? 0.5 : 0.55) * b.level;
    v.fillStyle = P.bubble!;
    for (let i = 0; i < b.W / 20; i++) {
      const x = (i * 41 + 7) % b.W + Math.sin(t * 2 + i) * 0.8;
      const y = rows - ((t * (2 + (i % 3)) + i * 9) % (rows + 2));
      if (y >= 0 && y < rows) b.dot(x, y);
    }
    v.globalAlpha = 1;
  },

  update(s, k, dt) {
    const mk = k.mood.kind;
    if (s.clam !== null && (s.clam += dt) > 1.6) s.clam = null;
    const restY = FLOOR - 5;
    const settled = mk === "rate" || k.resting;
    if (settled) s.y = Math.min(restY, s.y + dt * 2);
    else s.y += (5 - s.y) * Math.min(1, dt * 0.8);
    if (mk === "working" && !k.resting) {
      s.x += s.dir * SWIM * dt;
      if (s.x > k.W - TURTLE_W - 4) s.dir = -1;
      if (s.x < 4) s.dir = 1;
    }
    // Bubbles rise from the seaweed and the turtle; none while it rests.
    s.sinceBubble += dt;
    if (!settled && s.sinceBubble > 1.1) {
      s.sinceBubble = 0;
      s.bubbles.push({ x: s.weeds[Math.floor(Math.random() * s.weeds.length)] ?? 10, y: FLOOR - 4, k: 0 });
    }
    for (const b of s.bubbles) { b.k += dt / 3; b.y -= dt * 3.5; }
    s.bubbles = s.bubbles.filter((b) => b.k < 1 && b.y > -1);
    for (const c of k.crew) {
      if (c.leaving) { c.x += c.dir * SPEED.trot * dt; c.alpha -= dt / 1.5; continue; }
      const entering = c.x < 6 || c.x > k.W - FISH_W - 6;
      if (c.kind !== "working" && !entering) continue;
      c.x += c.dir * (entering ? SPEED.trot * 0.6 : c.speed) * dt;
      if (c.x > k.W - FISH_W - 6 && c.dir > 0) c.dir = -1;
      if (c.x < 6 && c.dir < 0) c.dir = 1;
    }
    if (s.shark !== null && ((s.shark += dt / 14) >= 1 || mk !== "working")) s.shark = null;
  },

  settle(s, k) {
    s.clam = null;
    s.bubbles = [];
    s.shark = null;
    s.y = k.mood.kind === "rate" || k.resting ? FLOOR - 5 : 5;
    k.crew = k.crew.filter((c) => !c.leaving);
    for (const c of k.crew) c.x = Math.max(6, Math.min(c.x, k.W - FISH_W - 6));
  },

  draw(s, k) {
    const v = k.ctx, theme = k.theme, P = PALETTES[theme];
    const W = k.W, mk = k.mood.kind, t = k.t, e = k.evening();

    // The surface far above, shimmering.
    for (let x = 0; x < W; x += 2) {
      v.globalAlpha = 0.5 + (k.reduced ? 0 : 0.3 * Math.sin(t * 1.5 + x * 0.3));
      k.dot(x, Math.sin(x * 0.2 + (k.reduced ? 0 : t)) > 0.3 ? 0 : 1, P.surface!);
    }
    v.globalAlpha = 1;
    // Light rays from the surface by day, fading toward evening.
    if (e < 0.7) {
      v.fillStyle = P.ray!;
      for (const [i, fx] of [0.15, 0.4, 0.68, 0.9].entries()) {
        v.globalAlpha = Math.max(0, (theme === "dark" ? 0.07 : 0.14) * (1 - e / 0.7)) * (k.reduced ? 1 : 0.7 + 0.3 * Math.sin(t * 0.5 + i));
        for (let r = 0; r < FLOOR; r++) k.dot(Math.floor(fx * W) + Math.floor(r / 3), r);
        for (let r = 0; r < FLOOR; r++) k.dot(Math.floor(fx * W) + 1 + Math.floor(r / 3), r);
      }
      v.globalAlpha = 1;
    }

    // The whale shark, far behind and faint.
    if (s.shark !== null && !k.reduced) {
      v.globalAlpha = 0.35;
      k.blit(paint(SHARK, theme), W + 4 - s.shark * (W + 24), 3);
      v.globalAlpha = 1;
    }

    // The sand and coral: cached.
    const back = k.layer("reef", `${W}:${theme}:${k.s3}`, v.canvas.width, v.canvas.height, (b) => {
      b.fillStyle = P.sand!;
      b.fillRect(0, k.px(FLOOR), W * k.s3, 2 * k.s3);
      for (const x of s.corals) { const c = paint(CORAL, theme); b.drawImage(c, k.px(x - 1), k.px(FLOOR - 4), c.width * k.s3, c.height * k.s3); }
    });
    v.drawImage(back, 0, 0);

    // Seaweed swaying.
    for (const [i, x] of s.weeds.entries()) {
      const h = 4 + (i % 3) * 2;
      for (let r = 0; r < h; r++) {
        const sway = k.reduced ? 0 : Math.round(Math.sin(t * 1.1 + i + r * 0.5) * (r / h) * 1.5);
        k.dot(x + sway, FLOOR - 1 - r, P.weed!);
      }
    }

    // The clam: shut, or open with its pearl gleaming.
    const open = s.clam !== null && s.clam < 1.2;
    k.blit(paint(open ? CLAM.open : CLAM.shut, theme), s.clamX - 1, FLOOR - (open ? 3 : 2));
    if (open && !k.reduced) glow(v, k.view, s.clamX + 2, FLOOR - 2, 2, P.o!, 1 - Math.abs((s.clam ?? 0) - 0.6));

    // Glowing plankton toward evening.
    if (e > 0.6) {
      const rnd = seeded(W + 41);
      for (let i = 0; i < 7; i++) {
        const px = rnd() * W, py = 2 + rnd() * 10, ph = rnd() * 6;
        v.globalAlpha = (e - 0.6) * 2 * (k.reduced ? 0.8 : Math.max(0, Math.sin(t * 1.1 + ph)));
        k.dot(px, py, P.glowing!);
      }
      v.globalAlpha = 1;
    }

    // Bubbles.
    for (const b of s.bubbles) {
      v.globalAlpha = 1 - b.k;
      k.dot(b.x + (k.reduced ? 0 : Math.sin(t * 3 + b.x) * 0.5), b.y, P.bubble!);
      v.globalAlpha = 1;
    }

    // The crew: small fish in their colors.
    for (const c of k.crew) {
      const bob = k.reduced || c.kind !== "working" ? 0 : Math.sin(t * 2 + c.speed) * 0.5;
      v.globalAlpha = Math.max(0, c.alpha);
      k.blit(paint(FISH, theme, c.dir < 0, { c: c.color }), c.x - 1, c.y - 1 + bob);
      v.globalAlpha = 1;
      if (!c.leaving) k.marker(c.kind, c.x + 3, c.y - 5);
    }

    // The turtle.
    const pose = mk === "rate" || k.resting ? TURTLE.rest : mk === "waiting" ? TURTLE.front : !k.reduced && mk === "working" && Math.floor(t / 0.6) % 2 ? TURTLE.swim2 : TURTLE.swim1;
    const bubble = k.gagging("bubble");
    const wobble = bubble !== null && bubble > 0.4 && bubble < 0.75 ? Math.sin(t * 25) * 0.8 : 0;
    const bob = k.reduced || mk !== "working" || k.resting ? 0 : Math.sin(t * 1.2) * 0.6;
    k.blit(paint(pose, theme, mk !== "waiting" && s.dir < 0), s.x - 1 - (wobble ? s.dir : 0), s.y - 1 + bob + wobble);

    // Waiting on you: a jellyfish by the turtle's head, the signal at its heart.
    if (mk === "waiting") {
      const jx = s.x + 10, jy = s.y - 3;
      k.blit(paint(JELLY, theme), jx - 1, jy - 1);
      k.signal(jx + 1, jy);
    }

    k.note("turtle", "♪ blub", s.x + 6, s.y - 1);
    k.note("clam", "♪", s.clamX + 2, FLOOR - 4);
    for (const c of k.crew) k.note(c, "♪", c.x + 3, c.y - 1);
  },

  motion(s, k): Motion {
    const mk = k.mood.kind;
    if (s.clam !== null || s.shark !== null) return "fast";
    if (k.crew.some((c) => c.leaving || c.kind === "working" || c.x < 6 || c.x > k.W - FISH_W - 6)) return mk === "idle" && !k.crew.some((c) => c.leaving) ? "still" : "fast";
    if (mk === "rate" || k.resting) return s.y < FLOOR - 5 || s.bubbles.length ? "fast" : "slow";
    if (mk === "working") return "fast";
    return mk === "idle" ? "still" : "slow";   // seaweed sways, the jellyfish pulses
  },

  gags: [
    // A big bubble drifts up in the turtle's path; it bumps it, the bubble pops, and the turtle wobbles.
    {
      id: "bubble",
      seconds: 3.5,
      draw(s, k, p) {
        const P = PALETTES[k.theme], v = k.ctx;
        const bx = s.x + (s.dir > 0 ? TURTLE_W + 1 : -6), by = s.y + 1 - (p < 0.4 ? (0.4 - p) * 10 : 0);
        if (p < 0.4) {
          for (const [dx, dy] of [[1, 0], [2, 0], [3, 0], [0, 1], [4, 1], [0, 2], [4, 2], [0, 3], [4, 3], [1, 4], [2, 4], [3, 4], [1, 1]]) k.dot(bx + dx, by + dy, dx === 1 && dy === 1 ? P.o! : P.bubble!);
        } else if (p < 0.6) {
          const q = (p - 0.4) / 0.2;
          v.globalAlpha = 1 - q;
          for (const [dx, dy] of [[-1, -1], [5, -1], [-1, 5], [5, 5], [2, -2], [2, 6]]) k.dot(bx + 2 + (dx - 2) * (1 + q), by + 2 + (dy - 2) * (1 + q), P.bubble!);
          v.globalAlpha = 1;
        }
      },
    },
    // A fish swims low over the sand; a crab pinches its tail and it zooms off.
    {
      id: "crab",
      seconds: 3.5,
      draw(s, k, p) {
        const cx = Math.floor(k.W * 0.35), fy = FLOOR - 5;
        const snap = p > 0.42 && p < 0.55;
        const fx = p < 0.45 ? -8 + (cx + 3 + 8) * (p / 0.45) : cx + 3 + (p - 0.45) * 220;
        k.blit(paint(FISH, k.theme, false, { c: PALETTES[k.theme].g! }), fx - 1, fy - 1 - (p > 0.45 ? 1 : 0));
        if (snap) k.dot(fx - 1, fy, PALETTES[k.theme].C!);
        k.blit(paint(CRAB, k.theme), cx - 1, FLOOR - 5 + (snap ? -1 : 0));
      },
    },
    // An octopus peeks out from behind the coral, inks, and is gone.
    {
      id: "octopus",
      seconds: 3.5,
      draw(s, k, p) {
        const P = PALETTES[k.theme], v = k.ctx;
        const ox = (s.corals.find((x) => Math.abs(x - s.x) > 20) ?? s.corals[0] ?? 20) + 1, oy = FLOOR - 8;
        const up = p < 0.25 ? p / 0.25 : 1;
        if (p < 0.55) k.blit(paint(OCTOPUS, k.theme), ox - 1, oy - 1 + (1 - up) * 4);
        if (p > 0.45) {
          const q = (p - 0.45) / 0.55;
          v.globalAlpha = 0.9 * (1 - q);
          for (let dy = -3; dy <= 3; dy++) for (let dx = -4; dx <= 4; dx++) if (dx * dx + dy * dy * 1.6 <= (3 + q * 4) ** 2 && (dx + dy) % 2 === 0) k.dot(ox + 2 + dx * (1 + q * 0.4), oy + 2 + dy, P.n!);
          v.globalAlpha = 1;
        }
      },
    },
  ],

  alert,
});
