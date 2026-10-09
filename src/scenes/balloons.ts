// Balloon Fiesta: a striped hot-air balloon drifting over a desert mesa, with
// far balloons dotting the sky.
//
// Working: the balloon drifts and bobs. A step: the burner flares and it
// lifts a little. Waiting on you: tethered to a stake, holding still, its
// pilot light blinking amber. Rate-limited: landed, the envelope down on the
// ground. Error: the kit's rain cloud. Crew: small balloons in each helper's
// color. Long run: the evening "balloon glow". Surprise: a cow-shaped
// balloon. Taps: a burner whoosh, or a far balloon bobs. Seasons: snow on
// the mesa, birds in spring, a hawk in summer, and the fiesta's crowd of far
// balloons in autumn. Gags: the burner flares just as a bird flies past, and
// it zooms off with a smoking tail; the cow balloon gives a tiny "♪ moo"; the
// balloon bumps a small one and both bounce apart. At rest between runs
// (scenes shown always): it settles to the ground, envelope up, burner off,
// and lifts off again when the next run starts.
import { defineScene, type HitTarget, type Kit } from "../kit/engine";
import { ALERT_GROUND as AG, AMBER, rowOf, type AlertSpec } from "../kit/alert";
import { SNOW, floatNote, glow, seeded, sprite, type Motion, type Sprite } from "../kit/common";
import { CREAM, GROUND, SPEED, TIME } from "../kit/style";
import type { ThemeMode } from "../kit/types";

// -- Art ---------------------------------------------------------------------

const BALLOON: Sprite = [
  "...rryybb..",
  "..rrryybbb.",
  ".rrrryybbbb",
  ".rrrryybbbb",
  ".rrrryybbbb",
  "..rrryybbb.",
  "...rryybb..",
  "....ryb....",
  "....k.k....",
  "....www....",
  "....WWW....",
];
const BALLOON_W = 11;
/** Landed: the envelope lies on the ground beside the basket. */
const SLUMP: Sprite = [
  ".........www",
  "..rryybb.WWW",
  "rrrryybbbbk.",
];
const SMALL: Sprite = [".ccc.", "cCccc", "cCccc", ".ccc.", "..k..", "..w.."];
const SMALL_W = 5;
const FAR: Sprite = [".f.", "fff", "fff", ".k."];
const FAR_COLORS = ["r", "y", "b"] as const;
const COW: Sprite = [
  ".h.....h",
  ".mmmmmmm",
  "mmKmmKmm",
  "mmmmmmmn",
  ".mKmmmm.",
  "..k..k..",
  "..wwww..",
];
const FLAME: Sprite = [".a.", "aoa", ".o."];

const PALETTES: Record<ThemeMode, Record<string, string | null>> = {
  light: {
    r: "#d9534f", y: "#f2c94c", b: "#4f8fd6", k: "#6b6f7a", w: "#a87b4f", W: "#7d5536",
    m: "#fbf8f1", K: "#3b3540", h: "#c9b28a", n: "#e8a0a8", a: "#ee6a3a", o: "#f7b48a",
    mesa: "#ead8c4", mesaTop: "#d9bd9f", f: "#c7a6d9", ground: "#d9c2a5", outline: "#9c958a",
  },
  dark: {
    r: "#e06a5f", y: "#f2d06a", b: "#6fa3e8", k: "#a0a4ae", w: "#c0915e", W: "#94673f",
    m: "#ece7dc", K: "#4a4452", h: "#b39d78", n: "#d48e96", a: "#f0703a", o: "#f8c09a",
    mesa: "#3a3238", mesaTop: "#56474f", f: "#8d7aa8", ground: "#4a4048", outline: null,
  },
};
const paint = (rows: Sprite, theme: ThemeMode, extra?: Record<string, string>, flip = false) =>
  sprite(rows, { ...PALETTES[theme], ...extra }, flip, "my");

// -- State -------------------------------------------------------------------

interface State {
  x: number;
  dir: 1 | -1;
  /** Extra height from a burner flare, in art px; settles back to 0. */
  lift: number;
  flare: number | null;
  /** 0 = aloft, 1 = landed, envelope down (rate-limited). */
  land: number;
  /** 0 = aloft, 1 = settled on the ground, envelope up (resting between runs). */
  rest: number;
  fars: { x: number; y: number }[];
  mesa: number[];
  cow: number | null;
  /** Which side a gag's visitor comes from (1: from the right). */
  side: 1 | -1;
}
/** A child thread, shown as a small balloon in its color. */
interface Small { x: number; y: number; dir: 1 | -1; speed: number; phase: number }
type K = Kit<State, Small>;

const TOP = 1;   // the balloon's top row while aloft
const LAND_SECONDS = 2.5;
const landedY = () => GROUND - BALLOON.length + 1;
const balloonY = (s: State, k: K) => {
  const aloft = TOP - s.lift + (k.reduced || k.mood.kind === "waiting" || s.rest >= 1 ? 0 : Math.sin(k.t * 0.8) * 0.7);
  return aloft + (landedY() - aloft) * Math.max(s.land, s.rest);
};
const flare = (s: State) => { s.flare = 0; s.lift = Math.min(3, s.lift + 2); };

// -- The helper alert --------------------------------------------------------

const alert: AlertSpec = {
  layout: (members) => ({ width: 4 + members.length * 11, figures: rowOf(members, 4, 11, SMALL_W), extra: {} }),
  still(b, p) {
    const P = PALETTES[p.theme];
    b.fillStyle = P.mesa!;
    for (let x = 0; x < p.layout.width; x++) {
      const h = 2 + Math.round(Math.sin(x / 6) * 0.8);
      b.fillRect(p.px(x), p.px(AG + 1 - h), p.s, h * p.s);
    }
  },
  // A small balloon, tethered, its pilot light blinking amber; failed, under a rain cloud.
  moving(v, p) {
    for (const [i, f] of p.layout.figures.entries()) {
      const bob = p.reduced ? 0 : Math.round(Math.sin(p.t * 1.6 + i) * 0.6 * p.s) / p.s;
      const y = 3 + bob;
      p.blit(v, paint(SMALL, p.theme, { c: "#d9534f", C: "#f2c94c" }), f.x, y);
      if (f.member.kind === "waiting") {
        const on = p.reduced ? 1 : 0.5 + 0.5 * Math.sin(p.t * Math.PI * 1.6 + i);
        p.glow(v, f.x + 2, y + 4, 2, AMBER, on);
        v.fillStyle = AMBER; v.globalAlpha = 0.5 + 0.5 * on;
        v.fillRect(p.px(f.x + 2), p.px(y + 4), p.s, p.s);
        v.globalAlpha = 1;
        v.fillStyle = p.view.muted;
        for (let r = y + 6; r <= AG; r++) v.fillRect(p.px(f.x + 2), p.px(r), p.s / 2, p.s);
      } else p.failed(v, f.x + 2, 0, p.t + i);
    }
  },
};

// -- The scene -------------------------------------------------------------

export const balloons = defineScene<State, Small>({
  id: "balloons",
  name: "Balloon Fiesta",
  state: () => ({ x: 20, dir: 1, lift: 0, flare: null, land: 0, rest: 0, fars: [], mesa: [], cow: null, side: 1 }),

  layout(s, k) {
    const W = k.W;
    const rnd = seeded(W * 5 + 11);
    s.fars = Array.from({ length: Math.max(3, Math.floor(W / 45)) }, () => ({ x: 6 + rnd() * (W - 12), y: 2 + Math.floor(rnd() * 6) }));
    // A low ridge along the ground, and one flat-topped mesa rising from it.
    const m0 = W * 0.22, m1 = W * 0.5;
    s.mesa = Array.from({ length: W }, (_, x) => {
      const ridge = 13 + (Math.sin(x * 0.07) > 0.6 ? -1 : 0);
      if (x < m0 - 5 || x > m1 + 6) return ridge;
      if (x < m0) return Math.max(9, ridge - Math.round((x - (m0 - 5)) * 0.9));
      if (x > m1) return Math.max(9, ridge - Math.round((m1 + 6 - x) * 0.7));
      return 9;
    });
    s.x = Math.min(s.x, W - BALLOON_W - 4);
  },
  mood(s, k, was) { if (was === "rate" && k.mood.kind !== "rate") s.land = 0; },
  // A new run starts aloft, mid-flight, the burner just lit.
  start(s, k) {
    s.x = 8 + Math.random() * (k.W - BALLOON_W - 20);
    s.dir = Math.random() < 0.5 ? 1 : -1;
    s.land = 0;
    if (k.mood.kind === "working") flare(s);
  },

  focus: (s) => s.x + BALLOON_W / 2,

  crew: {
    max: (k) => (k.narrow ? 2 : 4),
    // A small balloon drifts in from one edge, at its own height.
    join(_s, k, _m, shown) {
      const fromLeft = shown % 2 === 1;
      return {
        x: fromLeft ? -SMALL_W : k.W, y: [6, 8, 7, 6][(shown - 1) % 4], dir: fromLeft ? 1 : -1,
        speed: SPEED.drift * (0.5 + Math.random() * 0.4), phase: Math.random() * 6,
        ...(k.reduced ? { x: 10 + Math.random() * (k.W - 30) } : {}),
      };
    },
    // Finished: it rises away and fades.
    leave() {},
  },

  step(s, k) {
    if (s.flare !== null || k.mood.kind !== "working") return false;
    flare(s);
    return true;
  },

  surprise: {
    active: (s) => s.cow !== null,
    start(s) { s.cow = 0; },
  },

  hits(s, k) {
    const y = balloonY(s, k);
    const out: HitTarget[] = [{ target: "lead", box: s.land > 0.5 ? [s.x - 1, landedY() + 7, 13, 4] : [s.x, y, BALLOON_W, 11], at: [s.x + 5.5, y] }];
    for (const c of k.crew) if (!c.leaving) out.push({ target: "member", id: c.id, box: [c.x, c.y, SMALL_W, 6], at: [c.x + 2.5, c.y] });
    s.fars.forEach((f, i) => out.push({ target: "flock", id: String(i), near: [f.x + 1, f.y + 1], r: 3, at: [f.x + 1, f.y] }));
    return out;
  },
  tap(s, k, hit) {
    if (hit.target === "lead") { k.react("lead", TIME.tap); if (!k.reduced && s.land === 0) flare(s); }
    else if (hit.target === "member") { const c = k.crew.find((m) => m.id === hit.id); if (c) k.react(c, TIME.tap); }
    else { const f = s.fars[Number(hit.id)]; if (f) k.react(f, TIME.tap); }
  },

  errorCloudX: (s) => s.x - 1,

  // Below the mesa: layered sandstone fading down, with a few pebbles.
  below(s, k, b) {
    const P = PALETTES[k.theme], v = b.v, dark = k.theme === "dark";
    const rows = Math.round(Math.min(b.H, 10) * b.level);
    for (let y = 0; y < rows; y++) {
      v.globalAlpha = (dark ? 0.45 : 0.35) * (1 - y / 10);
      v.fillStyle = y % 4 === 2 ? P.mesaTop! : P.mesa!;
      v.fillRect(0, b.px(y), b.W * b.s3, b.s3);
    }
    if (rows <= 0) return;
    v.globalAlpha = (dark ? 0.4 : 0.3) * b.level;
    v.fillStyle = P.k!;
    for (let x = 5; x < b.W; x += 29) if (rows > 3) b.dot((x * 11) % b.W, 2 + (x % 5));
    v.globalAlpha = 1;
  },

  update(s, k, dt) {
    const mk = k.mood.kind;
    if (s.flare !== null && (s.flare += dt) > TIME.reaction) s.flare = null;
    s.lift = Math.max(0, s.lift - dt * 0.9);
    s.land = mk === "rate" ? Math.min(1, s.land + dt / LAND_SECONDS) : 0;
    // Resting: it settles gently to the ground; a new run lifts it off again.
    s.rest = k.resting ? Math.min(1, s.rest + dt / LAND_SECONDS) : Math.max(0, s.rest - dt / LAND_SECONDS);
    if (mk === "working" && !k.resting && s.rest === 0) {
      s.x += s.dir * SPEED.drift * 0.7 * dt;
      if (s.x > k.W - BALLOON_W - 4) s.dir = -1;
      if (s.x < 4) s.dir = 1;
    }
    for (const c of k.crew) {
      if (c.leaving) { c.y -= dt * 3; c.alpha -= dt / 1.5; continue; }
      const entering = c.x < 2 || c.x > k.W - SMALL_W - 2;
      if (c.kind !== "working" && !entering) continue;
      c.x += c.dir * (entering ? SPEED.drift * 1.5 : c.speed) * dt;
      if (c.x > k.W - SMALL_W - 6 && c.dir > 0) c.dir = -1;
      if (c.x < 6 && c.dir < 0) c.dir = 1;
      // Small balloons at overlapping heights keep apart.
      for (const o of k.crew) if (o !== c && !o.leaving && Math.abs(o.y - c.y) < 6 && Math.abs(o.x - c.x) < SMALL_W + 4 && (o.x - c.x) * c.dir > 0) c.dir = c.dir > 0 ? -1 : 1;
    }
    if (s.cow !== null && ((s.cow += dt / 9) >= 1 || mk !== "working")) s.cow = null;
  },

  settle(s, k) {
    s.flare = null;
    s.lift = 0;
    s.cow = null;
    s.land = k.mood.kind === "rate" ? 1 : 0;
    s.rest = k.resting ? 1 : 0;
    k.crew = k.crew.filter((c) => !c.leaving);
    for (const c of k.crew) c.x = Math.max(2, Math.min(c.x, k.W - SMALL_W - 2));
  },

  draw(s, k) {
    const v = k.ctx, theme = k.theme, P = PALETTES[theme];
    const W = k.W, mk = k.mood.kind, t = k.t, e = k.evening();
    const season = k.season;

    // The mesa and the ground: cached, they only change with size, theme, and season.
    const back = k.layer("mesa", `${W}:${theme}:${season}:${k.s3}:${k.view.muted}`, v.canvas.width, v.canvas.height, (b) => {
      const s3 = k.s3;
      for (let x = 0; x < W; x++) {
        const top = s.mesa[x];
        b.fillStyle = P.mesa!;
        b.fillRect(k.px(x), k.px(top), s3, (GROUND + 1 - top) * s3);
        b.fillStyle = season === "winter" ? SNOW[theme] : P.mesaTop!;
        b.fillRect(k.px(x), k.px(top), s3, s3);
      }
      b.fillStyle = k.view.muted;
      b.globalAlpha = 0.35;
      b.fillRect(0, k.px(GROUND + 1), W * s3, s3);
      b.globalAlpha = 1;
    });

    // Far balloons, and in autumn the fiesta's crowd of them.
    const fars = season === "autumn" ? [...s.fars, ...s.fars.map((f) => ({ x: (f.x + W * 0.37) % W, y: Math.min(8, f.y + 2) }))] : s.fars;
    for (const [i, f] of fars.entries()) {
      const bob = k.reduced ? 0 : Math.sin(t * 0.6 + i) * 0.5;
      const tapped = k.reaction(s.fars[i]);
      const hop = tapped === null ? 0 : Math.sin(Math.PI * (tapped / TIME.tap)) * 2;
      v.globalAlpha = theme === "dark" ? 0.6 : 0.55;
      k.blit(paint(FAR, theme, { f: P[FAR_COLORS[i % 3]]! }), f.x, f.y + bob - hop);
      v.globalAlpha = 1;
    }
    if (e > 0.75) for (const [x, y] of [[9, 1], [W * 0.3, 3], [W * 0.55, 1], [W - 12, 2]]) k.dot(Math.floor(x), y, P.m!);

    // The rare cow balloon, high and far.
    if (s.cow !== null && !k.reduced) {
      v.globalAlpha = 0.9;
      k.blit(paint(COW, theme), -10 + s.cow * (W + 20), 1 + Math.sin(t * 0.7) * 0.6);
      v.globalAlpha = 1;
    }
    if (season === "spring" || season === "summer") {   // birds in spring, a circling hawk in summer
      v.fillStyle = k.view.muted;
      const n = season === "spring" ? 3 : 1;
      for (let i = 0; i < n; i++) {
        const bx = season === "spring" ? ((k.reduced ? W * 0.4 : t * 5) + i * 6) % (W + 20) - 10 : W * 0.7 + (k.reduced ? 0 : Math.cos(t * 0.4) * 10);
        const by = season === "spring" ? 3 + (i % 2) : 4 + (k.reduced ? 0 : Math.sin(t * 0.4) * 2);
        const flap = k.reduced || Math.floor(t * 4 + i) % 2 === 0;
        k.dot(bx, by + (flap ? 0 : 1)); k.dot(bx + 1, by + (flap ? 1 : 0)); k.dot(bx + 2, by + (flap ? 0 : 1));
      }
    }

    v.drawImage(back, 0, 0);

    // The crew: small balloons, each in its helper's color.
    for (const c of k.crew) {
      const y = c.y + (k.reduced || c.kind !== "working" ? 0 : Math.sin(t * 1.3 + c.phase) * 0.6);
      v.globalAlpha = Math.max(0, c.alpha);
      k.blit(paint(SMALL, theme, { c: c.color, C: P.y! }, c.dir < 0), c.x, y);
      v.globalAlpha = 1;
      const tapped = k.reaction(c);
      if (tapped !== null) k.blit(paint(FLAME, theme), c.x + 1, y + 4 - (tapped / TIME.tap) * 2);
      if (!c.leaving) k.marker(c.kind, c.x + 2, y - 5);
    }

    // The tether while waiting on you.
    const by = balloonY(s, k);
    if (mk === "waiting") {
      v.fillStyle = k.view.muted;
      v.globalAlpha = 0.7;
      for (let y = Math.ceil(by + 11); y <= GROUND; y++) k.dot(s.x + 5, y);
      v.globalAlpha = 1;
      k.dot(s.x + 4, GROUND, P.W!); k.dot(s.x + 6, GROUND, P.W!);
    }

    // The balloon: aloft, or landed with its envelope down.
    if (s.land >= 1) {
      k.blit(paint(SLUMP, theme), s.x - 1, landedY() + 7);
    } else {
      // The evening balloon glow: the envelope lit from inside.
      const glowing = e > 0.55 && mk !== "rate";
      const flicker = k.reduced ? 1 : 0.85 + 0.15 * Math.sin(t * 7);
      const cream = CREAM[theme];
      if (glowing) glow(v, k.view, s.x + 5, by + 3, 8, cream, Math.min(1, (e - 0.55) * 2) * flicker);
      k.blit(paint(BALLOON, theme), s.x - 1, by - 1);
      if (glowing) {   // lit from inside: a warm wash over the envelope
        v.globalAlpha = Math.min(0.45, (e - 0.55) * 0.9) * flicker;
        k.blit(paint(BALLOON.slice(0, 8), theme, { r: cream, y: cream, b: cream }), s.x - 1, by - 1);
        v.globalAlpha = 1;
      }
      // The burner: a flare on a step or tap, the pilot light while waiting.
      const flaring = s.flare !== null ? 1 - s.flare / TIME.reaction : 0;
      if (flaring > 0) {
        v.globalAlpha = Math.min(1, flaring * 1.6);
        k.blit(paint(FLAME, theme), s.x + 3, by + 6);
        v.globalAlpha = 1;
      } else if (mk === "waiting") k.signal(s.x + 4.5, by + 7.5);   // the pilot light, amber
    }
  },

  motion(s, k): Motion {
    const mk = k.mood.kind;
    if (s.flare !== null || s.lift > 0 || s.cow !== null) return "fast";
    if (k.crew.some((c) => c.leaving || c.kind === "working" || c.x < 2 || c.x > k.W - SMALL_W - 2)) return "fast";
    if (k.resting) return s.rest < 1 ? "fast" : k.season === "spring" || k.season === "summer" ? "slow" : "still";
    if (s.rest > 0) return "fast";   // lifting off again
    if (mk === "working") return "fast";
    if (mk === "rate") return s.land < 1 ? "fast" : "still";
    // The pilot light, the rain, a bird or hawk: gentle.
    return mk === "idle" ? "still" : "slow";
  },

  gags: [
    // A bird flies past just as the burner roars; it zooms off trailing smoke.
    {
      id: "bird",
      seconds: 3,
      start(s, k) { s.side = s.x > k.W / 2 ? -1 : 1; },
      draw(s, k, p) {
        const by = balloonY(s, k), fx = s.x + 4, fy = by + 7;
        const from = s.side > 0 ? -6 : k.W + 6;
        const bx = p < 0.4 ? from + (fx - from) * (p / 0.4) : fx + s.side * (p - 0.4) * 160;
        const byy = fy + 1 - (p > 0.4 ? (p - 0.4) * 6 : 0);
        const v = k.ctx;
        if (p > 0.32 && p < 0.55) {   // the flare
          v.globalAlpha = 1 - Math.abs(p - 0.42) * 6;
          k.blit(paint(FLAME, k.theme), s.x + 3, by + 6);
          k.blit(paint(FLAME, k.theme), s.x + 3, by + 4);
          v.globalAlpha = 1;
        }
        v.fillStyle = k.view.muted;
        const flap = Math.floor(k.t * (p > 0.4 ? 14 : 5)) % 2 === 0;
        k.dot(bx, byy + (flap ? 0 : 1)); k.dot(bx + 1, byy + (flap ? 1 : 0)); k.dot(bx + 2, byy + (flap ? 0 : 1));
        if (p > 0.4) {   // a trail of smoke behind the singed bird
          for (let i = 1; i < 6; i++) {
            v.globalAlpha = 0.6 * (1 - i / 6);
            k.dot(bx - s.side * i * 2.2, byy - 1 + (i % 2), PALETTES[k.theme].k!);
          }
          v.globalAlpha = 1;
        }
      },
    },
    // The cow balloon drifts close and gives a tiny moo.
    {
      id: "moo",
      seconds: 3.5,
      start(s, k) { s.side = s.x > k.W / 2 ? -1 : 1; },
      draw(s, k, p) {
        const home = s.side > 0 ? s.x + BALLOON_W + 10 : s.x - 18;
        const edge = s.side > 0 ? k.W + 2 : -10;
        const x = p < 0.25 ? edge + (home - edge) * (p / 0.25) : p > 0.8 ? home + (edge - home) * ((p - 0.8) / 0.2) : home;
        const y = 2 + Math.sin(k.t * 0.9) * 0.6;
        k.blit(paint(COW, k.theme), x, y);
        if (p > 0.3 && p < 0.8) floatNote(k.ctx, k.view, "♪ moo", x + 4, y, (p - 0.3) / 0.5);
      },
    },
    // A small balloon drifts into the big one; they bump and bounce apart.
    {
      id: "bump",
      seconds: 3.5,
      start(s, k) { s.side = s.x > k.W / 2 ? -1 : 1; },
      update(s, k, dt, p) {
        if (p > 0.45 && p < 0.7) s.x = Math.max(4, Math.min(k.W - BALLOON_W - 4, s.x - s.side * 10 * dt));
      },
      draw(s, k, p) {
        const by = balloonY(s, k);
        const touch = s.side > 0 ? s.x + BALLOON_W : s.x - SMALL_W;
        const edge = s.side > 0 ? k.W + 2 : -SMALL_W - 2;
        const x = p < 0.45 ? edge + (touch - edge) * (p / 0.45) : touch + s.side * ((p - 0.45) / 0.55) * 40;
        const wobble = p > 0.45 && p < 0.6 ? Math.sin(k.t * 30) * 0.6 : 0;
        k.blit(paint(SMALL, k.theme, { c: PALETTES[k.theme].y!, C: PALETTES[k.theme].r! }, s.side > 0), x, by + 1 + wobble);
      },
    },
  ],

  alert,
});
