// Mountain trail: a hiker on a trail below snow-capped peaks and pines.
//
// Working: the hiker walks the trail, stick swinging. A step: a marmot pops
// up from its burrow. Waiting on you: the hiker walks to the trail marker
// and faces you, and the marker's blaze glows amber. Rate-limited: a tent
// pitched, the hiker inside. Error: the kit's rain cloud. Crew: mountain
// goats with bells in each helper's color. Long run: alpenglow turns the
// peaks pink. Surprise: an eagle soars over. Taps: "♪ yodel", "♪ maa",
// "♪ eek". Seasons: deep snow in winter, wildflowers in spring, golden
// aspens in autumn. Gags: a goat photobombs the hiker's selfie; a marmot
// steals a granola bar; the hiker's hat blows off and is caught at the last
// second.
import { defineScene, type HitTarget, type Kit } from "../kit/engine";
import { ALERT_GROUND as AG, rowOf, type AlertSpec } from "../kit/alert";
import { SNOW, glow, seeded, sprite, type Motion, type Sprite } from "../kit/common";
import { GROUND, SPEED, TIME } from "../kit/style";
import type { ThemeMode } from "../kit/types";

// -- Art ---------------------------------------------------------------------

const HIKER = {
  walk1: ["..hh....", ".hhhh...", "..ss....", "..sK....", "bbjjj.t.", "bbjjjs.t", "bbjjj..t", "..pp....", "..p.p...", ".kk.kk.."],
  walk2: ["..hh....", ".hhhh...", "..ss....", "..sK....", "bbjjj..t", "bbjjjs.t", "bbjjj.t.", "..pp....", "..pp....", "..kkk..."],
  front: ["..hhh...", ".hhhhh..", "..sss...", "..KsK...", ".jjjjj..", "sjjjjjs.", ".jjjjj..", "..ppp...", "..p.p...", ".kk.kk.."],
} satisfies Record<string, Sprite>;
const HIKER_W = 8;
const GOAT: Sprite = ["g....gg", ".gggggK", ".ggggg.", ".g.g.g."];
const GOAT_W = 7;
const MARMOT: Sprite = [".mm.", "mmKm", "mmmm"];
const TENT: Sprite = ["....a....", "...aAa...", "..aAAAa..", ".aAAkAAa.", "aAAAkAAAa"];
const POST: Sprite = ["ww", "ww", "oo", "oo", "ww", "ww", "ww"];
const PINE: Sprite = ["..t..", ".ttt.", "ttttt", ".ttt.", "ttttt", "..b.."];
const EAGLE: Sprite = ["e.....e", "ee.K.ee", ".eeeee.", "...e..."];

const PALETTES: Record<ThemeMode, Record<string, string | null>> = {
  light: {
    h: "#d9b45a", s: "#e8b48a", K: "#3b3540", j: "#c8553d", b: "#5a6a8a", t: "#8a6440", p: "#5a5a6a", k: "#4a3f3a",
    g: "#f1ede4", m: "#a87b4f", a: "#3f7a5a", A: "#5f9a76", w: "#8a6440", o: "#c9cdd8", e: "#6b4a2f",
    mount: "#c9cfdd", far: "#dde2ec", cap: "#dfe3eb", trail: "#c4a882", ground: "#b8c49a",
    outline: "#9c958a",
  },
  dark: {
    h: "#e0c06a", s: "#d9a57c", K: "#2d2833", j: "#d86a50", b: "#6a7a9a", t: "#a07b55", p: "#6a6a7a", k: "#5e504a",
    g: "#e4e0d6", m: "#c0915e", a: "#3f7a5a", A: "#5f9a76", w: "#a07b55", o: "#3a3a4a", e: "#a07b55",
    mount: "#3a4050", far: "#2c303c", cap: "#8a93a6", trail: "#5a4c3c", ground: "#3a4434",
    outline: null,
  },
};
const ASPEN = "#e3c443";
const paint = (rows: Sprite, theme: ThemeMode, flip = false, extra?: Record<string, string>) =>
  sprite(rows, { ...PALETTES[theme], ...extra }, flip, "gs");

// -- State -------------------------------------------------------------------

interface State {
  x: number;
  dir: 1 | -1;
  /** Each peak's x, height, and slope (steeper is narrower). */
  peaks: { x: number; h: number; slope: number }[];
  pines: number[];
  postX: number;
  tentX: number;
  burrow: number;
  /** Seconds into the marmot's pop-up, or null. */
  marmot: number | null;
  eagle: number | null;
}
/** A child thread, shown as a mountain goat with a colored bell. */
interface Goat { x: number; tx: number; dir: 1 | -1 }
type K = Kit<State, Goat>;

const MARMOT_SECONDS = 1.4;
const pop = (s: State) => { if (s.marmot !== null) return false; s.marmot = 0; return true; };
const ridge = (s: State, x: number) => {
  let top = GROUND;
  for (const p of s.peaks) top = Math.min(top, GROUND - p.h + Math.abs(x - p.x) * p.slope);
  return Math.round(top);
};

/** Where the hiker stands while waiting: just left of the trail marker. */
const postSpot = (s: State) => s.postX - HIKER_W;

// -- The helper alert --------------------------------------------------------

const alert: AlertSpec = {
  layout: (members) => ({ width: 4 + members.length * 11, figures: rowOf(members, 4, 11, GOAT_W), extra: {} }),
  still(b, p) {
    const P = PALETTES[p.theme];
    b.fillStyle = P.mount!;
    for (let x = 0; x < p.layout.width; x++) {
      const h = Math.max(1, 6 - Math.abs((x % 22) - 11) * 0.6);
      b.fillRect(p.px(x), p.px(AG - h), p.s, h * p.s);
    }
    for (const f of p.layout.figures) p.blit(b, paint(GOAT, p.theme), f.x, AG - 4);
  },
  // A goat with the amber "!"; failed, under a rain cloud.
  moving(v, p) {
    for (const [i, f] of p.layout.figures.entries()) {
      if (f.member.kind === "waiting") p.bang(v, f.x + 8, AG - 10, p.t + i * 0.4);
      else p.failed(v, f.x + 2, 0, p.t + i);
    }
  },
};

// -- The scene -------------------------------------------------------------

export const mountain = defineScene<State, Goat>({
  id: "mountain",
  name: "Mountain trail",
  state: () => ({ x: 30, dir: 1, peaks: [], pines: [], postX: 0, tentX: 0, burrow: 0, marmot: null, eagle: null }),

  layout(s, k) {
    const W = k.W;
    const rnd = seeded(W * 11 + 5);
    // Peaks of different heights and widths, so the range doesn't read as a pattern.
    s.peaks = [[0.12, 8, 0.75], [0.36, 12, 0.45], [0.6, 9, 0.6], [0.84, 11, 0.5]].map(([f, h, slope]) => ({ x: Math.floor(f * W + (rnd() - 0.5) * 10), h: h + Math.floor(rnd() * 2), slope }));
    s.pines = [0.06, 0.22, 0.47, 0.71, 0.93].map((f) => Math.floor(f * W));
    s.postX = Math.floor(W * 0.62);
    s.tentX = Math.floor(W * 0.28);
    s.burrow = Math.floor(W * 0.8);
    s.x = Math.min(s.x, W - HIKER_W - 6);
  },
  // A new run: on the trail, mid-stride, a marmot just popping up.
  start(s, k) {
    s.x = 10 + Math.random() * (k.W - 40);
    s.dir = Math.random() < 0.5 ? 1 : -1;
    if (k.mood.kind === "working") pop(s);
  },

  focus: (s, k) => (k.mood.kind === "rate" ? s.tentX + 4 : s.x + HIKER_W / 2),

  crew: {
    max: (k) => (k.narrow ? 2 : 4),
    // A goat picks its way in from the edge to a spot on the slope.
    join(s, k, _m, shown) {
      const spots = [0.16, 0.42, 0.68, 0.9].map((f) => Math.floor(f * k.W));
      const tx = Math.min(k.W - GOAT_W - 6, spots[(shown - 1) % spots.length]);
      return { x: k.reduced ? tx : tx < k.W / 2 ? -GOAT_W : k.W, tx, dir: tx < k.W / 2 ? 1 : -1 };
    },
    // Finished: it bounds away up the slope and fades.
    leave() {},
  },

  step(s, k) { return k.mood.kind === "working" && pop(s); },

  surprise: {
    active: (s) => s.eagle !== null,
    start(s) { s.eagle = 0; },
  },

  hits(s, k) {
    const out: HitTarget[] = [k.mood.kind === "rate"
      ? { target: "lead", box: [s.tentX, GROUND - 5, 9, 5], at: [s.tentX + 4, GROUND - 5] }
      : { target: "lead", box: [s.x, GROUND - 10, HIKER_W, 10], at: [s.x + 3, GROUND - 10] }];
    for (const c of k.crew) if (!c.leaving) out.push({ target: "member", id: c.id, box: [c.x, GROUND - 5, GOAT_W, 4], at: [c.x + 3, GROUND - 5] });
    out.push({ target: "flock", id: "marmot", box: [s.burrow - 1, GROUND - 4, 6, 4], at: [s.burrow + 2, GROUND - 4] });
    return out;
  },
  // "♪ yodel", "♪ maa", "♪ eek".
  tap(s, k, hit) {
    if (hit.target === "member") { const c = k.crew.find((m) => m.id === hit.id); if (c) k.react(c, TIME.tap); return; }
    k.react(hit.target === "lead" ? "hiker" : "marmot", TIME.tap);
    if (hit.target === "flock" && !k.reduced) pop(s);
  },

  errorCloudX: (s, k) => (k.mood.kind === "rate" ? s.tentX - 2 : s.x - 2),

  update(s, k, dt) {
    const mk = k.mood.kind;
    if (mk === "working" && k.gagId) {
      // A gag holds the hiker still.
    } else if (mk === "working") {
      s.x += s.dir * SPEED.walk * 0.8 * dt;
      if (s.x > k.W - HIKER_W - 6) s.dir = -1;
      if (s.x < 6) s.dir = 1;
    } else if (mk === "waiting") {   // the hiker walks over to the trail marker
      const dx = postSpot(s) - s.x;
      if (Math.abs(dx) > 0.3) { s.dir = dx > 0 ? 1 : -1; s.x += s.dir * Math.min(Math.abs(dx), SPEED.trot * dt); }
    }
    if (s.marmot !== null && (s.marmot += dt) > MARMOT_SECONDS) s.marmot = null;
    for (const c of k.crew) {
      if (c.leaving) { c.x += c.dir * SPEED.trot * dt; c.alpha -= dt / 1.4; continue; }
      const dx = c.tx - c.x;
      if (Math.abs(dx) < 0.5) {
        if (c.kind === "working" && Math.random() < 0.3 * dt) c.tx = Math.max(6, Math.min(k.W - GOAT_W - 6, c.tx + (Math.random() - 0.5) * 14));
        continue;
      }
      c.dir = dx > 0 ? 1 : -1;
      c.x += c.dir * Math.min(Math.abs(dx), (Math.abs(dx) > 12 ? SPEED.trot : SPEED.walk) * dt);
    }
    if (s.eagle !== null && ((s.eagle += dt / 11) >= 1 || mk !== "working")) s.eagle = null;
  },

  settle(s, k) {
    s.marmot = null;
    s.eagle = null;
    if (k.mood.kind === "waiting") s.x = postSpot(s);
    k.crew = k.crew.filter((c) => !c.leaving);
    for (const c of k.crew) c.x = c.tx;
  },

  draw(s, k) {
    const v = k.ctx, theme = k.theme, P = PALETTES[theme];
    const W = k.W, mk = k.mood.kind, t = k.t, e = k.evening(), season = k.season;
    // Alpenglow: the peaks blush at dusk.
    const glowLevel = e > 0.35 && e < 0.95 ? Math.round(Math.sin(Math.PI * (e - 0.35) / 0.6) * 4) : 0;

    if (e > 0.85) for (const [x, y] of [[9, 1], [W * 0.3, 1], [W * 0.52, 2], [W * 0.76, 1], [W - 6, 3]]) k.dot(Math.floor(x), y, theme === "dark" ? "#e8e2ff" : "#8f86c9");

    // Peaks, pines, the trail, the marker post: cached by season and alpenglow.
    const back = k.layer("range", `${W}:${theme}:${season}:${glowLevel}:${k.s3}`, v.canvas.width, v.canvas.height, (b) => {
      const s3 = k.s3;
      const glowTint = ["", "#e8b0b8", "#e89aa8", "#e8889a", "#e07a8a"][glowLevel];
      for (let x = 0; x < W; x++) {
        const top = ridge(s, x);
        b.fillStyle = season === "winter" ? SNOW[theme] : P.mount!;
        b.fillRect(k.px(x), k.px(top), s3, (GROUND - top) * s3);
        // Snow caps on the high parts, pink in the alpenglow.
        const capRows = season === "winter" ? GROUND - top : Math.max(0, GROUND - 6 - top);
        if (capRows > 0) { b.fillStyle = glowTint || P.cap!; b.fillRect(k.px(x), k.px(top), s3, Math.min(capRows, 3) * s3); }
      }
      for (const [i, x] of s.pines.entries()) {
        const tree = season === "autumn" && i % 2 ? ASPEN : null;
        const c = paint(PINE, theme, false, { t: tree ?? (season === "winter" ? "#8aa0b0" : "#3f7a4a"), b: P.w! });
        b.drawImage(c, k.px(x - 1), k.px(GROUND - 7), c.width * s3, c.height * s3);
      }
      b.fillStyle = season === "winter" ? SNOW[theme] : P.ground!;
      b.fillRect(0, k.px(GROUND), W * s3, s3);
      b.fillStyle = P.trail!;
      for (let x = 0; x < W; x += 3) b.fillRect(k.px(x), k.px(GROUND + 1), 2 * s3, s3);
      if (season === "spring") for (let x = 5; x < W; x += 17) { b.fillStyle = x % 2 ? "#e88bb0" : "#f2c94c"; b.fillRect(k.px(x), k.px(GROUND - 1), s3, s3); }
      const post = paint(POST, theme);
      b.drawImage(post, k.px(s.postX - 1), k.px(GROUND - 7 - 1), post.width * s3, post.height * s3);
    });
    v.drawImage(back, 0, 0);

    // The eagle soaring over.
    if (s.eagle !== null && !k.reduced) k.blit(paint(EAGLE, theme, true), W + 4 - s.eagle * (W + 16), 2 + Math.sin(t * 0.8) * 1.5);

    // The trail marker's blaze: amber while waiting on you.
    if (mk === "waiting") k.signal(s.postX, GROUND - 5);

    // The marmot popping up from its burrow.
    k.dot(s.burrow, GROUND, P.k!); k.dot(s.burrow + 1, GROUND, P.k!); k.dot(s.burrow + 2, GROUND, P.k!);
    if (s.marmot !== null) {
      const up = Math.sin(Math.PI * Math.min(1, s.marmot / MARMOT_SECONDS)) * 3;
      const rows = Math.max(0, Math.min(3, Math.round(up)));
      if (rows > 0) { const c = paint(MARMOT, theme); v.drawImage(c, 0, 0, c.width, rows + 1, k.px(s.burrow - 1), k.px(GROUND - rows - 1), c.width * k.s3, (rows + 1) * k.s3); }
    }

    // Goats with colored bells.
    for (const c of k.crew) {
      v.globalAlpha = Math.max(0, c.alpha);
      k.blit(paint(GOAT, theme, c.dir < 0), c.x - 1, GROUND - 5);
      k.dot(c.x + (c.dir > 0 ? 4 : 1), GROUND - 2, c.color); k.dot(c.x + (c.dir > 0 ? 5 : 2), GROUND - 2, c.color);
      v.globalAlpha = 1;
      if (!c.leaving) k.marker(c.kind, c.x + 3, GROUND - 10);
    }

    // The hiker, or the tent while resting.
    if (mk === "rate") {
      k.blit(paint(TENT, theme), s.tentX - 1, GROUND - 5);
    } else {
      const arrived = mk !== "waiting" || k.reduced || Math.abs(postSpot(s) - s.x) <= 0.3;
      const walking = (mk === "working" || !arrived) && !k.reduced;
      const selfie = k.gagging("selfie"), bar = k.gagging("granola"), hat = k.gagging("hat");
      const front = (mk === "waiting" && arrived) || (selfie !== null && selfie > 0.1 && selfie < 0.9) || (bar !== null && bar > 0.72) || (hat !== null && hat > 0.15 && hat < 0.85);
      let pose: Sprite = front ? HIKER.front : walking && !k.gagId && Math.floor(t / TIME.beat) % 2 ? HIKER.walk2 : HIKER.walk1;
      if (hat !== null && hat > 0.15 && hat < 0.72) pose = pose.map((r) => r.replace(/h/g, "."));   // the hat is in the air
      k.blit(paint(pose, theme, !front && s.dir < 0), s.x - 1, GROUND - 10);
    }
    if (season === "winter" && !k.reduced) {
      const rnd = seeded(W + 9);
      v.fillStyle = SNOW[theme];
      for (let i = 0; i < 6; i++) k.dot(rnd() * W, (rnd() * 13 + t * 2.5) % 13);
    }

    k.note("hiker", "♪ yodel", mk === "rate" ? s.tentX + 4 : s.x + 3, GROUND - 11);
    k.note("marmot", "♪ eek", s.burrow + 1, GROUND - 4);
    for (const c of k.crew) k.note(c, "♪ maa", c.x + 3, GROUND - 6);
  },

  motion(s, k): Motion {
    const mk = k.mood.kind;
    if (s.marmot !== null || s.eagle !== null) return "fast";
    if (k.crew.some((c) => c.leaving || Math.abs(c.x - c.tx) >= 0.5)) return "fast";
    if (mk === "working") return "fast";
    return mk === "waiting" || mk === "error" ? "slow" : "still";
  },

  gags: [
    // The hiker holds up a phone for a selfie; a goat pops its head in just as it flashes.
    {
      id: "selfie",
      seconds: 3.5,
      draw(s, k, p) {
        const P = PALETTES[k.theme];
        if (p < 0.1 || p > 0.9) return;
        const phoneX = s.x + 7, phoneY = GROUND - 11;
        k.dot(phoneX, phoneY, P.p!); k.dot(phoneX, phoneY - 1, P.p!);
        const peek = p < 0.35 ? 0 : p < 0.45 ? (p - 0.35) / 0.1 : p < 0.75 ? 1 : Math.max(0, 1 - (p - 0.75) / 0.1);
        if (peek > 0) k.blit(paint(GOAT.slice(0, 2), k.theme, true), s.x - 6 + peek * 3, GROUND - 10);
        if (p > 0.58 && p < 0.66) glow(k.ctx, k.view, phoneX + 0.5, phoneY, 3, "#ffffff", 0.9);
      },
    },
    // A granola bar falls from the pack; a marmot pops up, grabs it, and is gone.
    {
      id: "granola",
      seconds: 4,
      draw(s, k, p) {
        const P = PALETTES[k.theme], bx = s.x + (s.dir > 0 ? -3 : HIKER_W + 1);
        if (p < 0.5) {
          const fall = Math.min(1, p / 0.15);
          k.dot(bx, GROUND - 6 + fall * 5, P.w!); k.dot(bx + 1, GROUND - 6 + fall * 5, P.w!);
        }
        const up = p < 0.25 ? 0 : p < 0.38 ? (p - 0.25) / 0.13 : p < 0.55 ? 1 : p < 0.68 ? 1 - (p - 0.55) / 0.13 : 0;
        const rows = Math.round(up * 3);
        if (rows > 0) {
          const c = paint(MARMOT, k.theme, s.dir > 0);
          k.ctx.drawImage(c, 0, 0, c.width, rows + 1, k.px(bx - 3), k.px(GROUND - rows), c.width * k.s3, (rows + 1) * k.s3);
          if (p >= 0.5) k.dot(bx - 2, GROUND - rows + 1, P.w!);
        }
        if (p > 0.2) { k.dot(bx - 2, GROUND, P.k!); k.dot(bx - 1, GROUND, P.k!); }
      },
    },
    // A gust lifts the hiker's hat; it flips through the air and is caught at the last moment.
    {
      id: "hat",
      seconds: 3.5,
      draw(s, k, p) {
        if (p < 0.15 || p > 0.72) return;
        const P = PALETTES[k.theme], q = (p - 0.15) / 0.57;
        const hx = s.x + 2 - s.dir * Math.sin(Math.PI * q) * 7, hy = GROUND - 10 - Math.sin(Math.PI * q) * 5;
        const flip = Math.floor(k.t * 8) % 2;
        k.dot(hx, hy, P.h!); k.dot(hx + 1, hy, P.h!); k.dot(hx + (flip ? 2 : -1), hy + (flip ? 1 : 0), P.h!); k.dot(hx + 1, hy - 1, P.h!);
        if (q > 0.75) k.dot(s.x + (s.dir > 0 ? -1 : 6), GROUND - 7 - (q - 0.75) * 8, P.s!);   // the reaching hand
      },
    },
  ],

  alert,
});
