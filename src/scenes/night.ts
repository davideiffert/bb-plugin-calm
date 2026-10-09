// The Night sky: twinkling stars over a quiet line of hills, and an owl on a
// pine that blinks and slowly turns its head.
//
// Working: stars twinkle and the sky turns; the owl looks about. A step: a
// shooting star. Waiting on you: the sky holds, the owl faces you, and an
// amber star shines beside it. Rate-limited: lavender clouds roll in and the
// owl dozes. Error: the kit's rain cloud, over the owl. Crew: bright stars in
// each helper's color. Long run: the moon climbs. Surprise: a comet. Gags: a
// shooting star overshoots into the pines and the owl stares; the owl's head
// spins all the way round; the moon blinks behind a cloud. Taps: "♪ hoo", a
// star twinkles. At rest between runs (scenes shown always): the owl dozes
// and the stars twinkle slowly.
import { defineScene, type HitTarget, type Kit } from "../kit/engine";
import { AMBER, VIGNETTE_ROWS, rowOf, type AlertSpec } from "../kit/alert";
import { CLOUD, CLOUD_COLORS, H, SNOW, glow, seeded, skyGlow, skyLayer, snowfall, sprite, type Motion, type Sprite } from "../kit/common";
import { SPEED, TIME } from "../kit/style";
import type { ThemeMode } from "../kit/types";

const STAR_DRIFT = SPEED.sky;   // the sky turns this many art px per second
const STREAK_SECONDS = TIME.reaction;
const STREAK_SPEED = 70;   // art px per second
const TWINKLE_SECONDS = 0.9;
const COMET_SECONDS = 6;
/** Where crew stars sit, as fractions of the width, and their rows. */
const CREW_SLOTS: [number, number][] = [[0.1, 3], [0.24, 6], [0.38, 2], [0.52, 5], [0.64, 3], [0.92, 4]];
const MOON_X = 0.78;

const MOON: Sprite = ["..mmm..", ".mmmm..", "mmm....", "mmm....", "mmm....", ".mmmm..", "..mmm.."];
const PINE: Sprite = ["..t..", ".ttt.", "ttttt", ".ttt.", "ttttt", "..t.."];
/** The owl, 5 x 5, perched on a pine: ear tufts, eyes, beak. */
const OWL = {
  front: ["o...o", "ooooo", "oeoeo", ".obo.", ".ooo."],
  left: ["o...o", "ooooo", "eoeoo", "bo.o.", ".ooo."],
  right: ["o...o", "ooooo", "ooeoe", ".o.ob", ".ooo."],
  back: ["o...o", "ooooo", "ooooo", ".ooo.", ".ooo."],
  blink: ["o...o", "ooooo", "ocoqo", ".obo.", ".ooo."],
  stare: ["o...o", "oeoeo", "oeoeo", ".obo.", ".ooo."],
} satisfies Record<string, Sprite>;
type OwlPose = keyof typeof OWL;
const OWL_COLORS: Record<ThemeMode, Record<string, string>> = {
  light: { o: "#6b5a48", e: "#f4ecd2", b: "#c9a46a", c: "#4a3f34", q: "#4a3f34" },
  dark: { o: "#8f7e6a", e: "#f3ead0", b: "#d2ae74", c: "#5e5244", q: "#5e5244" },
};
/** The owl's head turns through these, a few seconds each. */
const LOOKS: OwlPose[] = ["front", "left", "front", "right"];

export const PALETTES: Record<ThemeMode, { star: string; moon: string; hill: string; wash: string; m: string; t: string }> = {
  light: { star: "#5a519e", moon: "#cdb47e", hill: "#a9afc4", wash: "rgba(110,100,200,0.10)", m: "#cdb47e", t: "#959cb4" },
  dark: { star: "#e8e2ff", moon: "#fbeccb", hill: "#2a2f3e", wash: "rgba(70,80,160,0.16)", m: "#fbeccb", t: "#232838" },
};

interface Star { x: number; y: number; big: boolean; speed: number; phase: number }
interface Streak { x: number; y: number; k: number }
/** A child thread, shown as a bright star in its own color. */
interface CrewStar { slot: number }

interface State {
  drift: number;
  stars: Star[];
  hills: number[];
  pines: number[];
  streak: Streak | null;
  comet: number | null;
  moonY: number;
  /** How many crew places the strip had at the last layout. */
  seats: number;
  /** The pine the owl sits on (its left edge). */
  owlPine: number;
}
type K = Kit<State, CrewStar>;

const maxCrew = (k: K) => (k.narrow ? 3 : 6);
function slotXY(k: K, slot: number): [number, number] {
  const slots: readonly [number, number][] = maxCrew(k) === 3 ? [[0.12, 3], [0.42, 5], [0.92, 3]] : CREW_SLOTS;
  const [fx, y] = slots[Math.min(slot, slots.length - 1)];
  return [Math.floor(fx * k.W), y];
}
const starX = (s: State, k: K, st: Star) => ((st.x - s.drift) % k.W + k.W) % k.W;

/** A shooting star. Returns false if one is already crossing. */
function shoot(s: State, k: K): boolean {
  if (s.streak) return false;
  k.stepped();
  s.streak = { x: 4 + Math.random() * k.W * 0.6, y: 1 + Math.random() * 3, k: 0 };
  return true;
}

/** A tapped star flares: its arms stretch out, then settle. */
function sparkle(k: K, color: string, x: number, y: number, p: number) {
  const v = k.ctx, view = k.view;
  const s = k.s3;
  const reach = view.reducedMotion ? 2 : 1 + Math.round(Math.sin(Math.PI * p) * 3);
  v.fillStyle = color;
  for (let i = 1; i <= reach; i++) {
    v.globalAlpha = (1 - i / (reach + 1)) * (view.reducedMotion ? 1 : 1 - p * 0.5);
    for (const [dx, dy] of [[i, 0], [-i, 0], [0, i], [0, -i]]) v.fillRect(Math.round((x + dx) * s), Math.round((y + dy) * s), s, s);
  }
  v.globalAlpha = 1;
}

// -- The helper alert --------------------------------------------------------

const alert: AlertSpec = {
  layout: (members) => ({ width: 4 + members.length * 16, figures: rowOf(members, 6, 16, 9), extra: {} }),
  still(b, p) {
    const s = p.s, W = p.layout.width;
    const P = PALETTES[p.theme];
    b.fillStyle = P.hill;
    for (let x = 0; x < W; x++) {
      const h = 1 + Math.round(1 + Math.sin(x / 5) + Math.sin(x / 2.3) * 0.5);
      b.fillRect(p.px(x), p.px(VIGNETTE_ROWS - h), s, h * s);
    }
    b.fillStyle = P.star;
    b.globalAlpha = 0.5;
    for (const [x, y] of [[2, 2], [W - 3, 1], [Math.floor(W / 2), 9], [W - 8, 7]]) b.fillRect(p.px(x), p.px(y), s, s);
    b.globalAlpha = 1;
  },
  // A star pulsing amber; failed, a star behind a small drifting cloud.
  moving(v, p) {
    const s = p.s, t = p.t, reduced = p.reduced;
    const P = PALETTES[p.theme];
    for (const [i, f] of p.layout.figures.entries()) {
      const waiting = f.member.kind === "waiting";
      const y = waiting ? 6 : 4;
      const cx = f.x + 4;
      const plus = (color: string, a: number) => {
        v.globalAlpha = a; v.fillStyle = color;
        for (const [dx, dy] of [[0, 0], [-1, 0], [1, 0], [0, -1], [0, 1]]) v.fillRect(p.px(cx + dx), p.px(y + dy), s, s);
        v.globalAlpha = 1;
      };
      if (waiting) {
        const on = reduced ? 1 : 0.55 + 0.45 * Math.sin(t * Math.PI * 1.2 + i);
        p.glow(v, cx, y, 4, AMBER, 0.8 * on);
        plus(AMBER, 0.6 + 0.4 * on);
      } else {
        plus(P.star, 0.7);
        const c = sprite(CLOUD, { g: CLOUD_COLORS[p.theme].g });
        const dx = reduced ? 0 : Math.round(Math.sin(t / 2 + i) * 1.5 * s) / s;
        v.globalAlpha = 0.95;
        p.blit(v, c, cx - 3 + dx, y + 1);
        v.globalAlpha = 1;
      }
    }
  },
};

// -- The scene -------------------------------------------------------------

export const night = defineScene<State, CrewStar>({
  id: "night",
  name: "Night sky",
  state: () => ({ drift: 0, stars: [], hills: [], pines: [], streak: null, comet: null, moonY: 5, seats: 6, owlPine: 0 }),

  layout(s, k) {
    const W = k.W;
    const rnd = seeded(W * 7 + 3);
    s.stars = Array.from({ length: Math.floor(W / 7) }, () => ({
      x: rnd() * W, y: Math.floor(rnd() * 10), big: rnd() < 0.12, speed: 0.8 + rnd() * 1.6, phase: rnd() * 6.3,
    }));
    s.hills = Array.from({ length: W }, (_, x) => 13 + Math.round(Math.sin(x * 0.045) * 1.3 + Math.sin(x * 0.13 + 1) * 0.6));
    s.pines = [0.12, 0.31, 0.36, 0.58, 0.86].map((f) => Math.floor(f * W)).filter((x) => x < W - 6);
    s.owlPine = s.pines.reduce((a, b) => (Math.abs(b - W * 0.58) < Math.abs(a - W * 0.58) ? b : a), s.pines[0] ?? 10);
  },
  // A narrower or wider strip has fewer or more places for crew stars: seat them again.
  afterLayout(s, k) {
    if (maxCrew(k) !== s.seats) {
      s.seats = maxCrew(k);
      k.crew = k.crew.filter((c) => c.slot < s.seats);
      k.setCrew(k.lastCrew);
    }
  },
  /** A new run opens with a shooting star already crossing the sky. */
  start(s, k) { if (k.mood.kind === "working") shoot(s, k); },

  focus: (s) => s.owlPine + 2.5,

  crew: {
    max: maxCrew,
    // A bright star in the member's color, fading in at the next free place.
    join(_s, k) {
      let slot = 0;
      while (k.crew.some((c) => c.slot === slot)) slot++;
      if (slot >= maxCrew(k)) return null;
      return { slot, alpha: k.reduced ? 1 : 0 };
    },
  },

  step: (s, k) => shoot(s, k),

  // A comet crosses slowly.
  surprise: {
    active: (s) => s.comet !== null,
    start(s) { s.comet = 0; },
  },

  hits(s, k) {
    const [ox, oy] = owlXY(s);
    const out: HitTarget[] = [{ target: "lead", box: [ox - 1, oy - 1, 7, 8], at: [ox + 2.5, oy] }];
    for (const c of k.crew) {
      const [cx, cy] = slotXY(k, c.slot);
      if (!c.leaving) out.push({ target: "member", id: c.id, box: [cx - 3, cy - 3, 6, 6], at: [cx + 0.5, cy - 1] });
    }
    s.stars.forEach((st, i) => {
      const x = starX(s, k, st);
      out.push({ target: "flock", id: String(i), near: [x, st.y], r: 3, at: [x + 0.5, st.y - 1] });
    });
    return out;
  },
  // A tapped star twinkles; the owl hoots.
  tap(s, k, hit) {
    if (hit.target === "lead") k.react("owl", TIME.tap);
    if (hit.target === "member") { const c = k.crew.find((o) => o.id === hit.id); if (c) k.react(c, TWINKLE_SECONDS); }
    if (hit.target === "flock") { const st = s.stars[Number(hit.id)]; if (st) k.react(st, TWINKLE_SECONDS); }
  },

  // The owl is the lead: its cloud.
  errorCloudX: (s) => s.owlPine - 4,

  // Below the hills: the dark of the hillside, and a few stars reflected in a still tarn.
  below(s, k, b) {
    const P = PALETTES[k.theme], v = b.v, t = k.t, dark = k.theme === "dark";
    const rows = Math.round(b.H * b.level);
    for (let y = 0; y < Math.min(rows, 6); y++) {
      v.globalAlpha = (dark ? 0.5 : 0.35) * (1 - y / 6);
      v.fillStyle = P.hill;
      v.fillRect(0, b.px(y), b.W * b.s3, b.s3);
    }
    if (rows <= 0) return;
    const rnd = seeded(b.W * 3 + 11);
    v.fillStyle = P.star;
    for (let i = 0; i < b.W / 9; i++) {
      const x = rnd() * b.W, y = 4 + rnd() * Math.max(1, b.H - 4), ph = rnd() * 6.3;
      if (y >= rows) continue;
      v.globalAlpha = (dark ? 0.6 : 0.5) * b.level * (k.reduced ? 0.8 : 0.5 + 0.5 * Math.sin(t * 0.7 + ph));
      b.dot(x, y);
    }
    v.globalAlpha = 1;
  },

  // Always night here: the faint night glow over the hills, pink-tinted in spring.
  sky(_s, k) {
    if (k.season === "spring" && skyGlow(1, k.view.theme)) skyLayer([330, 70, 78, 0.05]);
    const glowColor = skyGlow(1, k.view.theme);
    if (glowColor) skyLayer(glowColor);
  },

  update(s, k, dt) {
    for (const c of k.crew) c.alpha = c.leaving ? c.alpha - dt / 1.5 : Math.min(1, c.alpha + dt);
    if (s.comet !== null && ((s.comet += dt / COMET_SECONDS) >= 1 || k.mood.kind !== "working")) s.comet = null;
    if (s.streak) {
      s.streak.k += dt / STREAK_SECONDS;
      if (s.streak.k >= 1) s.streak = null;
    }
    // Waiting on you: the sky holds still.
    if (k.mood.kind !== "waiting") s.drift += STAR_DRIFT * dt;
  },

  settle(s, k) {
    s.streak = null;
    s.comet = null;
    k.crew = k.crew.filter((c) => !c.leaving);
    for (const c of k.crew) c.alpha = 1;
  },

  draw(s, k) {
    const v = k.ctx, view = k.view;
    const P = PALETTES[view.theme];
    const W = k.W, mk = k.mood.kind, t = k.t;
    const s3 = k.s3;
    const px = (n: number) => k.px(n);
    const dot = (x: number, y: number) => k.dot(x, y);
    const blit = (c: HTMLCanvasElement, x: number, y: number) => k.blit(c, x, y);

    // Stars twinkle and the sky turns slowly. Waiting: everything holds, and
    // one star glows. Rate-limited: clouds roll in and the stars dim.
    const still = k.reduced || mk === "waiting";
    const dim = mk === "rate" ? 0.3 : 1;
    v.fillStyle = P.star;
    for (const st of s.stars) {
      const x = starX(s, k, st);
      v.globalAlpha = dim * (still ? 0.8 : 0.55 + 0.45 * Math.sin(t * st.speed * (k.resting ? 0.35 : 1) + st.phase));
      dot(x, st.y);
      if (st.big) { v.globalAlpha *= 0.5; dot(x - 1, st.y); dot(x + 1, st.y); dot(x, st.y - 1); dot(x, st.y + 1); }
    }
    v.globalAlpha = 1;
    for (const [key, tk] of k.reactions()) {
      const st = key as Star;
      if (s.stars.includes(st)) sparkle(k, P.star, starX(s, k, st), st.y, tk / TWINKLE_SECONDS);
    }

    // The crew: bright stars in their own colors, fading in and out.
    for (const c of k.crew) {
      const [x, y] = slotXY(k, c.slot);
      const pulse = k.reduced || c.kind !== "working" ? 1 : 0.8 + 0.2 * Math.sin(t * 1.6 + c.slot);
      glow(v, view, x, y, 3, c.color, Math.max(0, c.alpha) * 0.5);
      v.globalAlpha = Math.max(0, c.alpha) * pulse;
      // Arms in the helper's color, so it shows; a pale heart.
      v.fillStyle = c.color;
      dot(x - 1, y); dot(x + 1, y); dot(x, y - 1); dot(x, y + 1);
      v.fillStyle = P.star;
      dot(x, y);
      v.globalAlpha = 1;
      const tw = k.reaction(c);
      if (tw !== null) sparkle(k, c.color, x, y, tw / TWINKLE_SECONDS);
      if (!c.leaving) k.marker(c.kind, x + 3, y - 2);
    }

    // A shooting star with a fading tail.
    if (s.streak) {
      const st = s.streak, travel = STREAK_SPEED * STREAK_SECONDS * st.k;
      for (let i = 0; i < 7; i++) {
        const back = travel - i * 1.6;
        if (back < 0) break;
        v.globalAlpha = (1 - i / 7) * (1 - Math.max(0, st.k - 0.7) / 0.3);
        dot(st.x + back, st.y + back * 0.35);
      }
      v.globalAlpha = 1;
    }

    // The rare comet: a slow head with a long tail across the top.
    if (s.comet !== null && !k.reduced) {
      const hx = -10 + s.comet * (W + 30), hy = 1.5 + s.comet * 3;
      for (let i = 0; i < 16; i++) {
        v.globalAlpha = (1 - i / 16) * 0.9;
        v.fillStyle = i < 2 ? P.star : P.m;
        dot(hx - i, hy - i * 0.18);
      }
      v.globalAlpha = 1;
    }

    // The moon follows the local time and climbs on a long run, rising from
    // behind the hills. An autumn moon is a warm harvest moon.
    const e = k.evening();
    s.moonY = 6 - e * 5.5;
    const harvest = k.season === "autumn";
    const moonColor = harvest ? (view.theme === "dark" ? "#f2b48a" : "#e0977a") : P.m;
    const mx = Math.round(W * MOON_X);
    if (harvest) glow(v, view, mx + 3, s.moonY + 3, 6, moonColor, 0.35);
    blit(sprite(MOON, { m: moonColor }), mx, s.moonY - 1);
    // The moon blinks: a small cloud wipes down over it and back up.
    const wink = k.gagging("blink");
    if (wink !== null) {
      const cover = Math.min(1, Math.sin(Math.PI * wink) * 1.3);   // down, hold a beat, up
      v.fillStyle = view.theme === "dark" ? "#504a68" : "#c9c1dc";
      const inset = [3, 1, 0, 0, 0, 0, 0, 1, 3];   // a soft, rounded cloud
      const rows = Math.round(cover * inset.length);
      for (let r = 0; r < rows; r++) for (let x = -1 + inset[r]; x < 8 - inset[r]; x++) dot(mx + x, s.moonY - 2 + r);
    }

    // The horizon: hills and a few pines, drawn over the rising moon.
    // Cached: it only changes with the size, theme, or scale.
    const horizon = k.layer("horizon", `${W}:${view.theme}:${s3}`, v.canvas.width, v.canvas.height, (h) => {
      h.fillStyle = P.hill;
      for (let x = 0; x < W; x++) h.fillRect(px(x), px(s.hills[x]), s3, (H - s.hills[x]) * s3);
      for (const x of s.pines) { const c = sprite(PINE, { t: P.hill }); h.drawImage(c, px(x - 1), px(s.hills[x + 2] - 6), c.width * s3, c.height * s3); }
    });
    v.drawImage(horizon, 0, 0);

    // The owl on its pine.
    const [ox, oy] = owlXY(s);
    blit(sprite(OWL[owlPose(s, k)], OWL_COLORS[view.theme], false, "e"), ox - 1, oy - 1);
    // Waiting on you: an amber star beside the owl, and the sky holds still.
    if (mk === "waiting") k.signal(ox + 6, oy + 1);
    k.note("owl", "♪ hoo", ox + 2.5, oy - 1);
    if (k.season === "winter") {
      v.fillStyle = SNOW[view.theme];
      for (const x of s.pines) { dot(x + 2, s.hills[x + 2] - 6); dot(x + 1, s.hills[x + 2] - 4); dot(x + 3, s.hills[x + 2] - 4); }
      snowfall(v, view, W, t, 6, 12);
    }
    if (k.season === "summer") {   // a few fireflies over the hills
      const rnd = seeded(W + 91);
      v.fillStyle = view.theme === "dark" ? "#d7f27a" : "#8fb33a";
      for (let i = 0; i < 4; i++) {
        const fx = rnd() * W, fy = 9 + rnd() * 2, ph = rnd() * 6.3;
        v.globalAlpha = k.reduced ? 0.8 : Math.max(0, Math.sin(t * 1.3 + ph));
        dot(fx + (k.reduced ? 0 : Math.sin(t * 0.7 + ph) * 2), fy);
      }
      v.globalAlpha = 1;
    }

    // Rate-limited: clouds roll in.
    if (mk === "rate") {
      const c = sprite(CLOUD, { g: view.theme === "dark" ? "#5f5878" : "#c4bcd8" });   // lavender: resting, not failed
      const roll = k.reduced ? 0 : t * 1.2;
      for (const [i, base] of [0.08, 0.38, 0.66].entries()) {
        const x = ((base * W + roll * (1 + i * 0.3)) % (W + 14)) - 14;
        v.globalAlpha = 0.85;
        blit(c, x, 1 + (i % 2) * 2);
      }
      v.globalAlpha = 1;
    }
  },

  motion(s, k): Motion {
    // A shooting star, comet, or crew fading in or out moves fast.
    if (s.streak || s.comet !== null || k.crew.some((c) => c.alpha < 1)) return "fast";
    // Twinkling, drifting, a glowing star, rain, clouds: gentle changes.
    return k.mood.kind === "idle" ? "still" : "slow";
  },

  gags: [
    // A shooting star overshoots into the pines with a tiny puff; the owl stares.
    {
      id: "star",
      seconds: 3.5,
      ready: (s) => landingPine(s) !== null,
      draw(s, k, p) {
        const P = PALETTES[k.view.theme], v = k.ctx;
        const pine = landingPine(s)!, tx = pine + 2, ty = s.hills[pine + 2] - 6;
        if (p < 0.25) {
          // It streaks down from high on the other side of the sky.
          const sx = tx + (tx < k.W / 2 ? 40 : -40), sy = 1;
          const q = p / 0.25, hx = sx + (tx - sx) * q, hy = sy + (ty - sy) * q;
          for (let i = 0; i < 6; i++) {
            v.globalAlpha = 1 - i / 6;
            k.dot(hx - (tx - sx) * 0.05 * i, hy - (ty - sy) * 0.05 * i, P.star);
          }
          v.globalAlpha = 1;
        } else if (p < 0.8) {
          // A tiny puff in the pine, and the star's glow fading among the needles.
          const d = (p - 0.25) / 0.55;
          v.globalAlpha = 1 - d;
          for (const [dx, dy] of [[-1, -1], [1, -1], [0, -2], [-2, 0], [2, 0], [-1, 1], [1, 1], [0, -3]]) k.dot(tx + dx * (1 + d * 2), ty + dy * (1 + d * 1.5), P.star);
          v.globalAlpha = 1;
          k.dot(tx, ty + 1, P.star);
        }
      },
    },
    // The owl's head turns all the way round.
    { id: "spin", seconds: 2.5 },
    // The moon blinks behind a passing cloud (drawn with the moon).
    { id: "blink", seconds: 2.5 },
  ],

  alert,
});

/** The owl's top-left, perched on its pine. */
function owlXY(s: State): [number, number] {
  const top = (s.hills[s.owlPine + 2] ?? 13) - 6;
  return [s.owlPine, top - 4];
}
/** A pine for the overshooting star to land in: the nearest one that isn't the owl's. */
function landingPine(s: State): number | null {
  const others = s.pines.filter((x) => Math.abs(x - s.owlPine) > 8);
  if (!others.length) return null;
  return others.reduce((a, b) => (Math.abs(b - s.owlPine) < Math.abs(a - s.owlPine) ? b : a));
}
/** What the owl's head is doing now. */
function owlPose(s: State, k: K): OwlPose {
  const mk = k.mood.kind, t = k.t;
  if (mk === "rate" || k.resting) return "blink";   // dozing
  if (mk === "waiting" || mk === "error" || k.reduced) return "front";
  const star = k.gagging("star");
  if (star !== null) {
    const pine = landingPine(s) ?? 0;
    return star < 0.25 ? "front" : pine < s.owlPine ? "left" : "right";
  }
  const spin = k.gagging("spin");
  if (spin !== null) return (["front", "right", "back", "left", "front"] as const)[Math.min(4, Math.floor(spin * 5.5))];
  if (k.reaction("owl") !== null) return "stare";
  if (t % 4.3 < 0.18) return "blink";
  return LOOKS[Math.floor(t / 3.2) % LOOKS.length];
}
