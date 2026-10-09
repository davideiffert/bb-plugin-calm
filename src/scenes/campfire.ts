// Campfire: a camper on a log by a crackling fire, a tent behind.
//
// Working: the fire flickers and the camper toasts a marshmallow, the stick
// bobbing. A step: a burst of sparks flies up. Waiting on you: the camper
// turns to face you and holds up an amber lantern. Rate-limited: the fire is
// down to embers and the camper sleeps in the tent. Error: the kit's rain
// cloud over the camper. Crew: friends round the fire in colored beanies. Long
// run: the firelight grows and stars come out. Surprise: a raccoon peeks out
// and scurries off. Taps: the marshmallow toasts, the fire crackles, friends
// wave. Seasons: snow round the camp, flowers in spring, fireflies in summer,
// falling leaves in autumn. Gags: the marshmallow catches fire and the
// camper blows on it frantically; a raccoon sneaks off with the marshmallow
// bag; a log pops and a spark lands on the camper's hat (pat, pat). At rest
// between runs (scenes shown always): the fire dies to embers and the camper
// sleeps in the tent, as when rate-limited.
import { defineScene, type HitTarget, type Kit } from "../kit/engine";
import { ALERT_GROUND as AG, rowOf, type AlertSpec } from "../kit/alert";
import { SNOW, glow, seeded, sprite, type Motion, type Sprite } from "../kit/common";
import { GROUND, SPEED, TIME } from "../kit/style";
import type { ThemeMode } from "../kit/types";

// -- Art ---------------------------------------------------------------------

const CAMPER = {
  /** Sitting on the log, facing the fire (to the right), stick held out. */
  sit: [
    "..hh.....",
    ".hhhh....",
    "..ss.....",
    "..sK.....",
    ".jjjj.ttt",
    "jjjjjss..",
    ".jjjj....",
    ".pppp....",
    ".pp.pp...",
  ],
  /** Facing you, lantern up. */
  front: [
    "..hhh....",
    ".hhhhh...",
    "..sss....",
    "..KsK..s.",
    ".jjjjjjs.",
    "sjjjjjj..",
    ".jjjjj...",
    ".ppppp...",
    ".pp.pp...",
  ],
} satisfies Record<string, Sprite>;
const CAMPER_W = 9;
const FRIEND: Sprite = ["..cc.", ".cccc", "..ss.", ".jjj.", "jjjjj", ".pp.p"];
const FRIEND_W = 5;
const LOG: Sprite = ["wwwwwwwwwwww", "WwWwWwWwWwWw"];
const FIRE_LOGS: Sprite = ["w...w", ".w.w.", "WWWWW"];
const TENT: Sprite = [
  "......a......",
  ".....aAa.....",
  "....aAAAa....",
  "...aAAAAAa...",
  "..aAAAkAAAa..",
  ".aAAAkkkAAAa.",
  "aAAAkkkkkAAAa",
];
const TENT_SHUT: Sprite = [
  "......a......",
  ".....aAa.....",
  "....aAAAa....",
  "...aAAAAAa...",
  "..aAAAaAAAa..",
  ".aAAAaAaAAAa.",
  "aAAAAaAaAAAAa",
];
const RACCOON: Sprite = ["g.g...", "gggg..", "KgKg.r", "gggggr", ".g..g."];
const MARSH = "#fbf8f1";

const PALETTES: Record<ThemeMode, Record<string, string | null>> = {
  light: {
    h: "#c8553d", s: "#e8b48a", K: "#3b3540", j: "#5a8a5f", p: "#4a5a7a", t: "#8a6440",
    c: "#c8553d", w: "#8a6440", W: "#6b4a2f", a: "#c9a46a", A: "#e3c58e", k: "#5a4636",
    g: "#8a8f9a", r: "#3b3540", flame: "#ee6a3a", hot: "#f7b48a", ember: "#d9483a", ground: "#b8936a",
    outline: "#9c958a",
  },
  dark: {
    h: "#d86a50", s: "#d9a57c", K: "#2d2833", j: "#6aa06f", p: "#5f6f92", t: "#a07b55",
    c: "#d86a50", w: "#a07b55", W: "#7d5536", a: "#a8875f", A: "#c9a46a", k: "#2d2833",
    g: "#a0a4ae", r: "#2d2833", flame: "#f0703a", hot: "#f8c09a", ember: "#e05a48", ground: "#5a4636",
    outline: null,
  },
};
const paint = (rows: Sprite, theme: ThemeMode, flip = false, extra?: Record<string, string>) =>
  sprite(rows, { ...PALETTES[theme], ...extra }, flip, "sA");

// -- State -------------------------------------------------------------------

interface State {
  fireX: number;
  logX: number;
  tentX: number;
  sparks: { x: number; y: number; vx: number; k: number }[];
  /** 1 = a full fire, 0 = embers. */
  fire: number;
  raccoon: number | null;
  stick: number;
  /** Where the camper is: on the log, walking, or inside the tent. */
  cx: number;
  inside: boolean;
}
/** A child thread, shown as a friend round the fire in a colored beanie. */
interface Friend { seat: number; enter: number }
type K = Kit<State, Friend>;

const SEATS = [8, 15, 22, -30];
/** Time for the tent: rate-limited, or resting between runs. */
const inTent = (k: K) => k.mood.kind === "rate" || k.resting;
/** Where the camper stands to go in: in front of the tent door. */
const tentDoor = (s: State) => s.tentX + 4;   // offsets from the fire: three across from the camper, one behind
const burst = (s: State, n: number) => {
  for (let i = 0; i < n; i++) s.sparks.push({ x: s.fireX + 2, y: GROUND - 5, vx: (Math.random() - 0.5) * 6, k: 0 });
};

/** The fire: flames that flicker from the heat of the moment. */
function drawFire(s: State, k: K) {
  const v = k.ctx, P = PALETTES[k.theme], t = k.t;
  const x = s.fireX;
  k.blit(paint(FIRE_LOGS, k.theme), x - 1, GROUND - 3);
  if (s.fire < 0.15) {   // embers glowing in the dark
    v.globalAlpha = k.reduced ? 0.9 : 0.6 + 0.4 * Math.sin(t * 3);
    k.dot(x + 1, GROUND - 1, P.ember!); k.dot(x + 3, GROUND - 1, P.ember!);
    v.globalAlpha = 1;
    return;
  }
  const h = Math.round(5 * s.fire);
  for (let c = 0; c < 5; c++) {
    const flick = k.reduced ? 0 : Math.round(Math.sin(t * 9 + c * 2.1) + Math.sin(t * 5.3 + c));
    const col = Math.max(1, h - Math.abs(c - 2) * 2 + flick);
    for (let r = 0; r < col; r++) k.dot(x + c, GROUND - 2 - r, r < col - 2 ? P.hot! : P.flame!);
  }
}

// -- The helper alert --------------------------------------------------------

const alert: AlertSpec = {
  layout: (members) => ({ width: 4 + members.length * 11, figures: rowOf(members, 4, 11, FRIEND_W), extra: {} }),
  still(b, p) {
    const P = PALETTES[p.theme];
    b.fillStyle = P.ground!;
    b.fillRect(0, p.px(AG), p.layout.width * p.s, p.s);
    for (const f of p.layout.figures) p.blit(b, paint(FRIEND, p.theme, false, { c: P.c! }), f.x, AG - 6);
  },
  // A friend by the fire with the amber "!"; failed, under a rain cloud.
  moving(v, p) {
    for (const [i, f] of p.layout.figures.entries()) {
      if (f.member.kind === "waiting") p.bang(v, f.x + 6, AG - 12, p.t + i * 0.4);
      else p.failed(v, f.x + 2, 0, p.t + i);
    }
  },
};

// -- The scene -------------------------------------------------------------

export const campfire = defineScene<State, Friend>({
  id: "campfire",
  name: "Campfire",
  state: () => ({ fireX: 60, logX: 40, tentX: 10, sparks: [], fire: 1, raccoon: null, stick: 0, cx: -1, inside: false }),

  layout(s, k) {
    const W = k.W;
    s.fireX = Math.floor(W * 0.5);
    s.logX = s.fireX - 17;
    s.tentX = Math.max(4, Math.floor(W * 0.14));
    s.cx = s.inside ? tentDoor(s) : s.logX;
  },
  mood(s, k) { if (k.mood.kind === "working" && !k.resting) s.fire = Math.max(s.fire, 0.4); },
  // A new run: the fire already going, a few sparks in the air.
  start(s, k) {
    s.fire = 1;
    s.cx = s.logX;
    s.inside = false;
    if (k.mood.kind === "working") burst(s, 4);
  },

  focus: (s) => (s.inside ? s.tentX + 6 : s.cx + 4),

  crew: {
    max: (k) => (k.narrow ? 2 : 4),
    // A friend walks up and sits at the next place round the fire.
    join(_s, k) {
      let seat = 0;
      while (k.crew.some((c) => c.seat === seat && !c.leaving)) seat++;
      return seat < SEATS.length ? { seat, enter: k.reduced ? 1 : 0 } : null;
    },
    // Finished: they stand and fade away into the dark.
    leave() {},
  },

  step(s, k) {
    if (k.mood.kind !== "working" || s.fire < 0.3) return false;
    burst(s, 7);
    return true;
  },

  surprise: {
    active: (s) => s.raccoon !== null,
    start(s) { s.raccoon = 0; },
  },

  hits(s, k) {
    const out: HitTarget[] = [s.inside
      ? { target: "lead", box: [s.tentX, GROUND - 7, 13, 7], at: [s.tentX + 6, GROUND - 7] }
      : { target: "lead", box: [s.cx, GROUND - 11, CAMPER_W, 10], at: [s.cx + 4, GROUND - 11] }];
    for (const c of k.crew) {
      if (c.leaving) continue;
      const x = s.fireX + SEATS[c.seat];
      out.push({ target: "member", id: c.id, box: [x, GROUND - 7, FRIEND_W, 7], at: [x + 2, GROUND - 7] });
    }
    out.push({ target: "flock", id: "fire", box: [s.fireX - 1, GROUND - 7, 7, 7], at: [s.fireX + 2, GROUND - 7] });
    return out;
  },
  // The marshmallow toasts; the fire crackles; a friend waves.
  tap(s, k, hit) {
    if (hit.target === "member") { const c = k.crew.find((m) => m.id === hit.id); if (c) k.react(c, TIME.tap); return; }
    k.react(hit.target === "lead" ? "camper" : "fire", TIME.tap);
    if (hit.target === "flock" && !k.reduced && s.fire > 0.3) burst(s, 4);
  },

  errorCloudX: (s) => (s.inside ? s.tentX : s.cx - 1),

  update(s, k, dt) {
    const mk = k.mood.kind;
    // A rest lets the fire die down; work brings it back.
    s.fire = inTent(k) ? Math.max(0, s.fire - dt / 4) : Math.min(1, s.fire + dt / 3);
    s.stick += dt;
    // The camper walks to the tent and goes in, or comes out and back to the log.
    if (mk === "rate") { s.cx = tentDoor(s); s.inside = true; }
    else {
      const goal = k.resting ? tentDoor(s) : s.logX;
      const dx = goal - s.cx;
      if (Math.abs(dx) > 0.3) s.cx += Math.sign(dx) * Math.min(Math.abs(dx), SPEED.walk * dt);
      s.inside = k.resting && Math.abs(goal - s.cx) <= 0.3;
    }
    for (const p of s.sparks) { p.k += dt / 1.4; p.y -= dt * 7; p.x += p.vx * dt; }
    s.sparks = s.sparks.filter((p) => p.k < 1);
    for (const c of k.crew) {
      if (c.leaving) c.alpha -= dt / 1.2;
      else c.enter = Math.min(1, c.enter + dt / 1.5);
    }
    if (s.raccoon !== null && ((s.raccoon += dt / 7) >= 1 || mk !== "working")) s.raccoon = null;
  },

  settle(s, k) {
    s.sparks = [];
    s.raccoon = null;
    s.fire = inTent(k) ? 0 : 1;
    s.inside = inTent(k);
    s.cx = s.inside ? tentDoor(s) : s.logX;
    k.crew = k.crew.filter((c) => !c.leaving);
    for (const c of k.crew) c.enter = 1;
  },

  draw(s, k) {
    const v = k.ctx, theme = k.theme, P = PALETTES[theme];
    const W = k.W, mk = k.mood.kind, t = k.t, e = k.evening(), season = k.season;
    const resting = s.inside;

    // The ground: cached.
    const back = k.layer("camp", `${W}:${theme}:${season}:${k.s3}`, v.canvas.width, v.canvas.height, (b) => {
      b.fillStyle = season === "winter" ? SNOW[theme] : P.ground!;
      b.fillRect(0, k.px(GROUND), W * k.s3, k.s3);
      b.fillStyle = k.view.muted;
      b.globalAlpha = 0.35;
      b.fillRect(0, k.px(GROUND + 1), W * k.s3, k.s3);
      b.globalAlpha = 1;
      if (season === "spring") for (const fx of [0.3, 0.7, 0.88]) { b.fillStyle = "#f2c94c"; b.fillRect(k.px(Math.floor(W * fx)), k.px(GROUND - 1), k.s3, k.s3); }
    });
    v.drawImage(back, 0, 0);
    if (e > 0.75) for (const [x, y] of [[8, 2], [W * 0.35, 1], [W * 0.62, 3], [W - 10, 1], [W * 0.8, 4]]) k.dot(Math.floor(x), y, theme === "dark" ? "#e8e2ff" : "#8f86c9");

    // Firelight: brighter as the evening deepens.
    if (s.fire > 0.15) glow(v, k.view, s.fireX + 2, GROUND - 3, 4 + Math.round(e * 2), P.flame!, s.fire * (0.25 + e * 0.27) * (k.reduced ? 1 : 0.85 + 0.15 * Math.sin(t * 7)));
    k.blit(paint(resting ? TENT_SHUT : TENT, theme), s.tentX - 1, GROUND - 7);

    // Friends round the fire.
    for (const c of k.crew) {
      const x = s.fireX + SEATS[c.seat];
      v.globalAlpha = Math.max(0, Math.min(c.alpha, c.enter));
      k.blit(paint(FRIEND, theme, SEATS[c.seat] < 0, { c: c.color }), x - 1, GROUND - 7);
      v.globalAlpha = 1;
      if (k.reaction(c) !== null) k.dot(x + (SEATS[c.seat] < 0 ? 4 : 0), GROUND - 8, P.s!);   // a wave
      if (!c.leaving) k.marker(c.kind, x + 2, GROUND - 13);
    }

    // The camper on the log, or asleep in the tent.
    k.blit(paint(LOG, theme), s.logX - 3, GROUND - 2);
    const walking = !resting && Math.abs(s.cx - s.logX) > 0.3;
    if (walking) {
      // Between the log and the tent: facing the way it goes, with a little step.
      const toTent = k.resting;
      const step = k.reduced ? 0 : Math.floor(t * 6) % 2;
      k.blit(paint(CAMPER.front, theme, toTent), s.cx - 1, GROUND - 11 - step * 0.5);
    } else if (!resting) {
      const waiting = mk === "waiting";
      k.blit(paint(waiting ? CAMPER.front : CAMPER.sit, theme), s.logX - 1, GROUND - 11);
      if (waiting) {
        // The lantern held up high, clear of the fire.
        k.dot(s.logX + 6, GROUND - 9, P.k!);
        k.signal(s.logX + 6, GROUND - 11);
      } else {
        // The marshmallow on its stick, bobbing over the fire, toasting on a tap.
        const bob = k.reduced ? 0 : Math.round(Math.sin(s.stick * 1.3) * 0.6);
        const toast = k.reaction("camper");
        const burning = k.gagging("flame");
        const color = burning !== null && burning > 0.7 ? "#3b2a22" : toast === null ? MARSH : toast > TIME.tap * 0.5 ? "#c8873a" : "#e8c48a";
        k.dot(s.logX + 10, GROUND - 7 + bob, color);
        if (burning !== null && burning > 0.12 && burning < 0.72) {
          // On fire! A little flame on the marshmallow, and the camper blowing hard.
          const lick = Math.floor(k.t * 10) % 2;
          k.dot(s.logX + 10, GROUND - 8 + bob - lick, P.flame!);
          k.dot(s.logX + 10 + (lick ? 1 : -1), GROUND - 8 + bob, P.hot!);
          if (burning > 0.25 && Math.floor(k.t * 6) % 2) for (let i = 1; i < 4; i++) k.dot(s.logX + 3 + i * 1.6, GROUND - 8 + bob * 0.3, theme === "dark" ? "#c9d1e0" : "#9aa3b5");
        }
      }
    }

    drawFire(s, k);
    for (const p of s.sparks) {
      v.globalAlpha = 1 - p.k;
      k.dot(p.x, p.y, p.k < 0.4 ? P.hot! : P.flame!);
      v.globalAlpha = 1;
    }

    // The rare raccoon: it peeks out from behind the tent, then scurries off.
    if (s.raccoon !== null && !k.reduced) {
      const rk = s.raccoon;
      const rx = rk < 0.5 ? s.tentX + 12 : s.tentX + 12 + (rk - 0.5) * 2 * (W * 0.3);
      k.blit(paint(RACCOON, theme, rk >= 0.5), rx, GROUND - 5);
    }

    // Seasons: falling snow, fireflies, a drifting leaf.
    if (season === "winter" && !k.reduced) {
      const rnd = seeded(W + 5);
      v.fillStyle = SNOW[theme];
      for (let i = 0; i < 6; i++) k.dot(rnd() * W, (rnd() * 13 + t * 2.5) % 13);
    }
    if (season === "summer" || e > 0.8) k.fireflies(31, 4, 3, 6);
    if (season === "autumn") k.dot(W * 0.75 + (k.reduced ? 0 : Math.sin(t) * 4), k.reduced ? GROUND - 1 : (t * 2.5) % GROUND, "#d9772b");

    k.note("camper", "♪ toasty", s.cx + 9, GROUND - 9);
    k.note("fire", "♪ crackle", s.fireX + 2, GROUND - 8);
    for (const c of k.crew) k.note(c, "♪ hi", s.fireX + SEATS[c.seat] + 2, GROUND - 8);
  },

  motion(s, k): Motion {
    const mk = k.mood.kind;
    if (s.sparks.length || s.raccoon !== null) return "fast";
    if (k.crew.some((c) => c.leaving || c.enter < 1)) return "fast";
    if (!s.inside && Math.abs(s.cx - (k.resting ? tentDoor(s) : s.logX)) > 0.3) return "fast";   // walking to or from the tent
    if (inTent(k)) return s.fire > 0 ? "fast" : "slow";   // embers glow
    // The fire flickers whenever it burns.
    return mk === "idle" ? "still" : "slow";
  },

  gags: [
    // The marshmallow catches fire; the camper blows on it like mad (drawn with the camper).
    { id: "flame", seconds: 3.5 },
    // A raccoon creeps out behind the camper and makes off with the marshmallow bag.
    {
      id: "bag",
      seconds: 4,
      draw(s, k, p) {
        const bagX = s.logX - 4, P = PALETTES[k.theme];
        const from = s.tentX + 12, to = -10;
        const rx = p < 0.4 ? from + (bagX - 6 - from) * (p / 0.4) : bagX - 6 + (to - bagX + 6) * ((p - 0.4) / 0.6);
        const carrying = p >= 0.4, bag = k.theme === "dark" ? MARSH : "#d2c4a8";
        if (!carrying) { k.dot(bagX, GROUND - 2, bag); k.dot(bagX + 1, GROUND - 2, bag); k.dot(bagX, GROUND - 1, bag); k.dot(bagX + 1, GROUND - 1, P.c!); }
        k.blit(paint(RACCOON, k.theme, carrying), rx, GROUND - 5);
        if (carrying) { k.dot(rx - 1, GROUND - 4, bag); k.dot(rx - 1, GROUND - 3, bag); k.dot(rx - 2, GROUND - 3, P.c!); }
      },
    },
    // A log pops; a spark sails over and lands on the camper's hat; pat, pat.
    {
      id: "spark",
      seconds: 3,
      draw(s, k, p) {
        const P = PALETTES[k.theme];
        const fx = s.fireX + 2, fy = GROUND - 4, hx = s.logX + 2, hy = GROUND - 11;
        if (p < 0.4) {
          const q = p / 0.4;
          k.dot(fx + (hx - fx) * q, fy + (hy - fy) * q - Math.sin(Math.PI * q) * 4, P.hot!);
        } else if (p < 0.6) {
          k.dot(hx, hy, Math.floor(k.t * 10) % 2 ? P.flame! : P.hot!);
        }
        if (p > 0.48 && p < 0.92) {   // the hand patting the hat, and a wisp of smoke
          const pat = Math.floor(k.t * 6) % 2;
          k.dot(hx - 1, hy - pat, P.s!); k.dot(hx, hy - pat, P.s!);
          k.ctx.globalAlpha = 0.5;
          k.dot(hx + 1, hy - 2 - ((k.t * 3) % 2), k.view.muted);
          k.ctx.globalAlpha = 1;
        }
      },
    },
  ],

  alert,
});
