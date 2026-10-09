// Desert roadrunner: a roadrunner dashing along a desert road past saguaros
// and red buttes.
//
// Working: it runs in short dashes, stops, looks around, and runs again. A
// step: a burst of speed with a puff of dust. Waiting on you: it runs to the
// nearest saguaro and faces you, and the saguaro's flower glows amber. Rate-limited: it rests in a
// saguaro's shade. Error: the kit's rain cloud. Crew: quail in a line, each
// topknot in a helper's color. Long run: the sun sinks behind the buttes.
// Surprise: a coyote trots by. Taps: "♪ meep meep", "♪ ka-kow". Seasons:
// cactus blooms in spring, heat shimmer in summer, a tumbleweed in autumn,
// snow on the buttes in winter. Gags: a tumbleweed chases the roadrunner; a
// lizard does push-ups on a rock; the roadrunner skids to a stop at a
// cactus, nose to spine. At rest between runs (scenes shown always): it
// trots to the first saguaro's shade and settles there, as when rate-limited.
import { defineScene, type HitTarget, type Kit } from "../kit/engine";
import { ALERT_GROUND as AG, rowOf, type AlertSpec } from "../kit/alert";
import { SNOW, SUN, seeded, sprite, sunColor, type Motion, type Sprite } from "../kit/common";
import { GROUND, SPEED, TIME } from "../kit/style";
import type { ThemeMode } from "../kit/types";

// -- Art ---------------------------------------------------------------------

const RUNNER = {
  run1: [
    ".......BB....",
    "......BbbB...",
    "TT....bbbKyyy",
    ".TT..bbbbw...",
    "..TTbbBbww...",
    "...bbbBbbw...",
    ".....l..l....",
    "....l....l...",
  ],
  run2: [
    ".......BB....",
    "......BbbB...",
    "TT....bbbKyyy",
    ".TT..bbbbw...",
    "..TTbbBbww...",
    "...bbbBbbw...",
    "......ll.....",
    "......l.l....",
  ],
  /** Stopped to look around: head up, tail cocked. */
  stand: [
    "T.......BB...",
    "TT.....BbbB..",
    ".TT....bbbKyy",
    "..T...bbbw...",
    "...TbbBbww...",
    "....bbbBbw...",
    "......l.l....",
    "......l.l....",
  ],
  front: ["...BB...", "..BbbB..", "..KbbK..", "...yy...", "..bwwb..", ".bbwwbb.", "T.bbbb..", "...l.l.."],
  rest: [
    ".............",
    ".............",
    ".......BB....",
    "......BbbB...",
    "TTT...bbbKyyy",
    "..TTbbbbbw...",
    "...bbbBbbw...",
    "....bbbbbb...",
  ],
} satisfies Record<string, Sprite>;
const RUNNER_W = 13;
const QUAIL: Sprite = ["..cc", ".qqK", "qqqq", ".l.l"];
const QUAIL_W = 4;
const SAGUARO: Sprite = ["..g..", "..g..", "g.g..", "ggg.g", "..ggg", "..g..", "..g..", "..g.."];
const COYOTE: Sprite = ["......oo", "o....ooo", ".oooooo.", ".oooooo.", ".o.o..o."];
const WEED: Sprite = [".W.W.", "W.W.W", ".WWW.", "W.W.W"];
const LIZARD: Sprite = ["Z....", ".ZZZK", "Z.Z.."];
const ROCK: Sprite = [".RRR.", "RRRRR"];

const PALETTES: Record<ThemeMode, Record<string, string | null>> = {
  light: {
    b: "#7a6450", B: "#3f3128", T: "#3f3128", w: "#f3ece0", K: "#3b3540", y: "#5a5560", t: "#5a4a3a", l: "#c99a5a", c: "#c8553d", q: "#9a8a7a",
    g: "#5a9a5f", o: "#b8935a", W: "#b8a07a", butte: "#e0a07a", butteDark: "#c8805a", road: "#b8b0a8",
    dash: "#ebe8e3", sand: "#e8d0a8", dust: "#e0c8a0", flower: "#e88bb0", Z: "#6a8a4a", R: "#9a8a7a",
    outline: "#9c958a",
  },
  dark: {
    b: "#d2bd9c", B: "#7a6450", T: "#8a7560", w: "#f4ede0", K: "#2d2833", y: "#a0a4ae", t: "#7a6a5a", l: "#d9aa6a", c: "#d86a50", q: "#b0a090",
    g: "#4e8a55", o: "#c8a06a", W: "#8a7a5a", butte: "#6a4038", butteDark: "#552f2a", road: "#4a4648",
    dash: "#8a8790", sand: "#4a3e32", dust: "#8a7860", flower: "#e88bb0", Z: "#8aaa5a", R: "#7a6c60",
    outline: null,
  },
};
const paint = (rows: Sprite, theme: ThemeMode, flip = false, extra?: Record<string, string>) =>
  sprite(rows, { ...PALETTES[theme], ...extra }, flip, "w");

// -- State -------------------------------------------------------------------

interface State {
  x: number;
  dir: 1 | -1;
  /** Seconds left in the current dash, or the pause before the next. */
  dash: number;
  pause: number;
  burst: number;
  dust: { x: number; k: number }[];
  saguaros: number[];
  buttes: number[];
  coyote: number | null;
  /** Where a gag happens: the rock, or the cactus to stop at. */
  gagX: number;
}
/** A child thread, shown as a quail with a topknot in its color. */
interface Quail { x: number; dir: 1 | -1 }
type K = Kit<State, Quail>;

const DASH = SPEED.dash;
const kick = (s: State) => { s.dust.push({ x: s.x + (s.dir > 0 ? 0 : RUNNER_W - 2), k: 0 }); };
const sprint = (s: State) => { if (s.burst > 0) return false; s.burst = 0.6; s.dash = Math.max(s.dash, 0.6); s.pause = 0; kick(s); return true; };
const shade = (s: State) => (s.saguaros[0] ?? 10) + 6;   // resting beside the first saguaro
const nearestSaguaro = (s: State) => s.saguaros.reduce((a, b) => (Math.abs(b - s.x) < Math.abs(a - s.x) ? b : a), s.saguaros[0] ?? 10);
/** Where it stands while waiting: just right of the nearest saguaro. */
const cactusSpot = (s: State) => nearestSaguaro(s) + 6;

// -- The helper alert --------------------------------------------------------

const alert: AlertSpec = {
  layout: (members) => ({ width: 4 + members.length * 9, figures: rowOf(members, 4, 9, QUAIL_W), extra: {} }),
  still(b, p) {
    const P = PALETTES[p.theme];
    b.fillStyle = P.sand!;
    b.fillRect(0, p.px(AG), p.layout.width * p.s, p.s);
    for (const f of p.layout.figures) p.blit(b, paint(QUAIL, p.theme, false, { c: P.c! }), f.x, AG - 4);
  },
  // A quail with the amber "!"; failed, under a rain cloud.
  moving(v, p) {
    for (const [i, f] of p.layout.figures.entries()) {
      if (f.member.kind === "waiting") p.bang(v, f.x + 5, AG - 10, p.t + i * 0.4);
      else p.failed(v, f.x + 1, 0, p.t + i);
    }
  },
};

// -- The scene -------------------------------------------------------------

export const desert = defineScene<State, Quail>({
  id: "desert",
  name: "Desert roadrunner",
  state: () => ({ x: 30, dir: 1, dash: 0, pause: 1, burst: 0, dust: [], saguaros: [], buttes: [], coyote: null, gagX: 0 }),

  layout(s, k) {
    const W = k.W;
    s.saguaros = [0.08, 0.36, 0.72].map((f) => Math.floor(f * W));
    const rnd = seeded(W * 17 + 3);
    s.buttes = Array.from({ length: W }, (_, x) => {
      // Two flat-topped buttes with sloping sides, over a low rolling base.
      const butte = (c: number, hw: number, h: number) => Math.max(0, h - Math.max(0, Math.abs(x - c * W) - hw * W) * 1.2);
      const top = Math.max(butte(0.56, 0.06, 7), butte(0.84, 0.035, 5));
      return GROUND - 1 - Math.round(Math.max(top, 1 + Math.sin(x * 0.05 + rnd()) * 0.8));
    });
    s.x = Math.min(s.x, W - RUNNER_W - 4);
  },
  // A new run: mid-road, already off and running in a cloud of dust.
  start(s, k) {
    s.x = 10 + Math.random() * (k.W - 40);
    s.dir = Math.random() < 0.5 ? 1 : -1;
    if (k.mood.kind === "working") sprint(s);
  },

  focus: (s, k) => (k.mood.kind === "rate" ? shade(s) + 4 : s.x + RUNNER_W / 2),

  crew: {
    max: (k) => (k.narrow ? 2 : 4),
    // A quail joins the line, walking in from the edge.
    join: (_s, k, _m, shown) => ({ x: k.reduced ? k.W * (0.5 + shown * 0.08) : k.W + shown * 6, dir: -1 }),
    // Finished: it scurries off and fades.
    leave() {},
  },

  step(s, k) { return k.mood.kind === "working" && sprint(s); },

  surprise: {
    active: (s) => s.coyote !== null,
    start(s) { s.coyote = 0; },
  },

  hits(s, k) {
    const x = k.mood.kind === "rate" ? shade(s) : s.x;
    const out: HitTarget[] = [{ target: "lead", box: [x, GROUND - 8, RUNNER_W, 8], at: [x + 8, GROUND - 8] }];
    for (const c of k.crew) if (!c.leaving) out.push({ target: "member", id: c.id, box: [c.x, GROUND - 4, QUAIL_W, 4], at: [c.x + 2, GROUND - 4] });
    s.saguaros.forEach((sx, i) => out.push({ target: "flock", id: String(i), box: [sx, GROUND - 8, 5, 8], at: [sx + 2, GROUND - 8] }));
    return out;
  },
  // "♪ meep meep", "♪ ka-kow", or a cactus flowers.
  tap(s, k, hit) {
    if (hit.target === "member") { const c = k.crew.find((m) => m.id === hit.id); if (c) k.react(c, TIME.tap); return; }
    if (hit.target === "lead") { k.react("runner", TIME.tap); if (!k.reduced && k.mood.kind === "working") sprint(s); return; }
    const sx = s.saguaros[Number(hit.id)];
    if (sx !== undefined) k.react(`cactus${hit.id}`, TIME.tap * 2);
  },

  errorCloudX: (s, k) => (k.mood.kind === "rate" ? shade(s) : s.x + 2),

  // Below the road: hard-packed sand, the saguaros' shallow roots, and buried stones.
  below(s, k, b) {
    const P = PALETTES[k.theme], v = b.v, dark = k.theme === "dark";
    const rows = Math.round(Math.min(b.H, 9) * b.level);
    for (let y = 0; y < rows; y++) {
      v.globalAlpha = (dark ? 0.45 : 0.35) * (1 - y / 9);
      v.fillStyle = y < 1 ? P.road! : P.sand!;
      v.fillRect(0, b.px(y), b.W * b.s3, b.s3);
    }
    if (rows <= 0) return;
    v.globalAlpha = (dark ? 0.4 : 0.35) * b.level;
    v.fillStyle = P.t!;
    for (const x of s.saguaros) for (let y = 1; y < Math.min(rows, 4); y++) { b.dot(x + 2 - (y - 1) * 2, y); b.dot(x + 2 + (y - 1) * 2, y); }
    v.fillStyle = P.R!;
    for (let x = 9; x < b.W; x += 27) if (rows > 4) { b.dot((x * 7) % b.W, 4 + (x % 4)); b.dot((x * 7) % b.W + 1, 4 + (x % 4)); }
    v.globalAlpha = 1;
  },

  update(s, k, dt) {
    const mk = k.mood.kind;
    s.burst = Math.max(0, s.burst - dt);
    if (mk === "working" && (k.gagId === "tumble" || k.gagId === "skid")) {
      // The gag runs the roadrunner.
    } else if (mk === "working" && !k.resting) {
      // Dash, stop and look around, dash again.
      if (s.dash > 0) {
        s.dash -= dt;
        s.x += s.dir * DASH * (s.burst > 0 ? 1.6 : 1) * dt;
        if (s.x > k.W - RUNNER_W - 4) { s.x = k.W - RUNNER_W - 4; s.dir = -1; }
        if (s.x < 4) { s.x = 4; s.dir = 1; }
        if (s.dash <= 0) s.pause = 1 + Math.random() * 1.5;
      } else if ((s.pause -= dt) <= 0) {
        s.dash = 0.6 + Math.random() * 0.8;
        if (Math.random() < 0.35) s.dir = s.dir > 0 ? -1 : 1;
      }
    } else if (mk === "waiting" || k.resting) {   // it runs to the nearest saguaro, or trots to the shade
      const dx = (k.resting ? shade(s) : cactusSpot(s)) - s.x;
      if (Math.abs(dx) > 0.3) { s.dir = dx > 0 ? 1 : -1; s.x += s.dir * Math.min(Math.abs(dx), DASH * dt); }
    }
    for (const d of s.dust) d.k += dt / 0.7;
    s.dust = s.dust.filter((d) => d.k < 1);
    // Quail walk in a line behind the leader, one after another.
    let slot = 0;
    for (const c of k.crew) {
      if (c.leaving) { c.x += SPEED.trot * dt; c.alpha -= dt / 1.2; continue; }
      const target = k.W * 0.55 + slot * 7;
      slot++;
      if (c.kind !== "working" && Math.abs(c.x - target) < 2) continue;
      const dx = target - c.x;
      if (Math.abs(dx) < 0.5) continue;
      c.dir = dx > 0 ? 1 : -1;
      c.x += c.dir * Math.min(Math.abs(dx), (Math.abs(dx) > 10 ? SPEED.trot : SPEED.walk * 1.4) * dt);   // hurrying in, then a walk
    }
    if (s.coyote !== null && ((s.coyote += dt / 9) >= 1 || mk !== "working")) s.coyote = null;
  },

  settle(s, k) {
    s.dust = [];
    s.coyote = null;
    s.dash = 0;
    if (k.mood.kind === "waiting") s.x = cactusSpot(s);
    if (k.resting) s.x = shade(s);
    k.crew = k.crew.filter((c) => !c.leaving);
    k.crew.forEach((c, i) => { c.x = k.W * 0.55 + i * 7; });
  },

  draw(s, k) {
    const v = k.ctx, theme = k.theme, P = PALETTES[theme];
    const W = k.W, mk = k.mood.kind, t = k.t, e = k.evening(), season = k.season;

    // The sun sinks behind the buttes on a long run.
    if (e > 0.05) {
      const sun = sprite(SUN, { y: sunColor(e) });
      const sy = 1 + e * 9, sx = Math.floor(W * 0.56);
      k.blit(sun, sx, sy);
    }
    if (e > 0.8) for (const [x, y] of [[8, 1], [W * 0.28, 2], [W * 0.44, 1], [W - 9, 2]]) k.dot(Math.floor(x), y, theme === "dark" ? "#e8e2ff" : "#8f86c9");

    // Buttes, saguaros, the road: cached.
    const back = k.layer("desert", `${W}:${theme}:${season}:${k.s3}`, v.canvas.width, v.canvas.height, (b) => {
      const s3 = k.s3;
      for (let x = 0; x < W; x++) {
        const top = s.buttes[x];
        b.fillStyle = P.butte!;
        b.fillRect(k.px(x), k.px(top), s3, (GROUND - top) * s3);
        b.fillStyle = season === "winter" && top < GROUND - 3 ? SNOW[theme] : P.butteDark!;
        b.fillRect(k.px(x), k.px(top), s3, s3);
      }
      b.fillStyle = P.road!;
      b.fillRect(0, k.px(GROUND), W * s3, 2 * s3);
      b.fillStyle = P.dash!;
      for (let x = 2; x < W; x += 8) b.fillRect(k.px(x), k.px(GROUND + 1), 3 * s3, s3);
      for (const sx of s.saguaros) {
        const c = paint(SAGUARO, theme);
        b.drawImage(c, k.px(sx - 1), k.px(GROUND - 8 - 1), c.width * s3, c.height * s3);
      }
    });
    v.drawImage(back, 0, 0);

    // Flowers on the saguaros: pink spring blooms or a tap. Waiting on you: the
    // nearest saguaro's flower glows amber.
    const near = nearestSaguaro(s);
    s.saguaros.forEach((sx, i) => {
      const tapped = k.reaction(`cactus${i}`) !== null;
      if (mk === "waiting" && sx === near) k.signal(sx + 2, GROUND - 10);
      else if (season === "spring" || tapped) k.dot(sx + 2, GROUND - 9, P.flower!);
    });

    // Summer heat shimmer over the road.
    if (season === "summer" && !k.reduced) {
      v.globalAlpha = 0.25;
      for (let x = 0; x < W; x += 5) k.dot(x + Math.sin(t * 2 + x) * 1.5, GROUND - 1, P.sand!);
      v.globalAlpha = 1;
    }
    // An autumn tumbleweed rolling by.
    if (season === "autumn") k.blit(paint(WEED, theme), k.reduced ? W * 0.3 : ((t * 9) % (W + 10)) - 5, GROUND - 4 - (k.reduced ? 0 : Math.abs(Math.sin(t * 3)) * 2));

    // The coyote trotting by.
    if (s.coyote !== null && !k.reduced) k.blit(paint(COYOTE, theme, true), W + 4 - s.coyote * (W + 16), GROUND - 5);

    // Dust from the dashes.
    for (const d of s.dust) {
      v.globalAlpha = 1 - d.k;
      for (const [dx, dy] of [[-1, 0], [-2, -1], [0, -1], [-3, 0]]) k.dot(d.x + dx * (1 + d.k) * (s.dir > 0 ? 1 : -1), GROUND - 1 + dy - d.k, P.dust!);
      v.globalAlpha = 1;
    }

    // Quail with colored topknots.
    for (const c of k.crew) {
      v.globalAlpha = Math.max(0, c.alpha);
      k.blit(paint(QUAIL, theme, c.dir < 0, { c: c.color }), c.x - 1, GROUND - 4);
      v.globalAlpha = 1;
      if (!c.leaving) k.marker(c.kind, c.x + 2, GROUND - 9);
    }

    // The roadrunner.
    const tumble = k.gagging("tumble"), skid = k.gagging("skid");
    const running = mk === "working" && !k.reduced && (tumble !== null ? tumble > 0.2 && tumble < 0.92 : skid !== null ? skid < 0.45 : s.dash > 0);
    // Waiting: it runs to the saguaro first, then turns to face you.
    const arrived = mk !== "waiting" || k.reduced || Math.abs(cactusSpot(s) - s.x) <= 0.3;
    const shaded = k.resting && (k.reduced || Math.abs(shade(s) - s.x) <= 0.3);
    const heading = !arrived || (k.resting && !shaded);
    const pose = mk === "rate" || shaded ? RUNNER.rest : heading ? (Math.floor(t * 10) % 2 ? RUNNER.run2 : RUNNER.run1) : mk === "waiting" ? RUNNER.front : running ? (Math.floor(t * 10) % 2 ? RUNNER.run2 : RUNNER.run1) : RUNNER.stand;
    const x = mk === "rate" ? shade(s) : s.x;
    k.blit(paint(pose, theme, (mk !== "waiting" || !arrived) && s.dir < 0), x - 1, GROUND - 8);

    k.note("runner", "♪ meep meep", x + (mk === "waiting" ? 4 : 8), GROUND - 9);
    for (const c of k.crew) k.note(c, "♪ ka-kow", c.x + 2, GROUND - 5);
  },

  motion(s, k): Motion {
    const mk = k.mood.kind;
    if (s.dust.length || s.coyote !== null) return "fast";
    if (k.crew.some((c) => c.leaving)) return "fast";
    if (k.resting) return Math.abs(shade(s) - s.x) > 0.3 ? "fast" : k.season === "summer" || k.season === "autumn" ? "slow" : "still";
    if (mk === "working") return "fast";
    return mk === "waiting" || mk === "error" ? "slow" : "still";
  },

  gags: [
    // A tumbleweed bowls along behind the roadrunner, which runs for it.
    {
      id: "tumble",
      seconds: 3.5,
      start(s, k) { s.dir = s.x < k.W / 2 ? 1 : -1; s.gagX = s.dir > 0 ? -6 : k.W + 2; },
      update(s, k, dt, p) {
        if (p > 0.2 && p < 0.92) s.x = Math.max(4, Math.min(k.W - RUNNER_W - 4, s.x + s.dir * DASH * 1.4 * dt));
        s.gagX += s.dir * (DASH * 1.5) * dt;
      },
      draw(s, k) {
        k.blit(paint(WEED, k.theme), s.gagX - 1, GROUND - 4 - Math.abs(Math.sin(k.t * 6)) * 2);
      },
    },
    // A lizard on a rock does its push-ups.
    {
      id: "lizard",
      seconds: 3,
      start(s, k) { s.gagX = s.x + RUNNER_W + 8 < k.W - 10 ? s.x + RUNNER_W + 8 : s.x - 12; },
      draw(s, k, p) {
        k.blit(paint(ROCK, k.theme), s.gagX - 1, GROUND - 2);
        const up = p > 0.15 && p < 0.85 && Math.floor(k.t * 5) % 2 === 0 ? 1 : 0;
        k.blit(paint(LIZARD, k.theme, s.gagX < s.x), s.gagX - 1, GROUND - 5 - up);
      },
    },
    // The roadrunner dashes for a cactus and skids to a stop, nose to spine.
    {
      id: "skid",
      seconds: 3.5,
      ready: (s, k) => skidCactus(s, k) !== null,
      start(s, k) { const c = skidCactus(s, k)!; s.gagX = c; s.dir = c > s.x ? 1 : -1; },
      update(s, k, dt, p) {
        const stop = s.dir > 0 ? s.gagX - RUNNER_W + 1 : s.gagX + 4;
        if (p < 0.45) { const dx = stop - s.x; s.x += Math.sign(dx) * Math.min(Math.abs(dx), DASH * 2 * dt); }
        else if (p > 0.75) s.x -= s.dir * 4 * dt;   // backing off, carefully
      },
      draw(s, k, p) {
        if (p > 0.3 && p < 0.6) {
          const v = k.ctx, back = s.dir > 0 ? s.x : s.x + RUNNER_W;
          v.globalAlpha = 1 - (p - 0.3) / 0.3;
          for (const [dx, dy] of [[0, 0], [-1, -1], [-2, 0], [-3, -1]]) k.dot(back + dx * s.dir, GROUND - 1 + dy, PALETTES[k.theme].dust!);
          v.globalAlpha = 1;
        }
      },
    },
  ],

  alert,
});

/** A saguaro the roadrunner can dash to: ahead, not too near, not too far. */
function skidCactus(s: State, k: K): number | null {
  const ok = s.saguaros.filter((c) => Math.abs(c - s.x) > RUNNER_W + 6 && Math.abs(c - s.x) < 60 && c > RUNNER_W && c < k.W - RUNNER_W);
  return ok.length ? ok.reduce((a, b) => (Math.abs(b - s.x) < Math.abs(a - s.x) ? b : a)) : null;
}
