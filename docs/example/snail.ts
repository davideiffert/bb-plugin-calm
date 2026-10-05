// A complete, small scene for the "how to add a scene" guide: a garden snail.
// It is not shipped in the picker; test/example-scene.test.ts plays it
// through every moment so the guide never goes stale.
//
// Working: the snail creeps along. A step: a dew drop sparkles on the leaf it
// passes. Waiting on you: it stops and raises its eye stalks. Rate-limited:
// it tucks into its shell. Error: the kit's rain cloud. Crew: baby snails.
// Surprise: a butterfly. Tap: a little "♪".
import { defineScene, type HitTarget, type Kit } from "../../src/kit/engine";
import { ALERT_GROUND, rowOf, type AlertSpec } from "../../src/kit/alert";
import { floatNote, sprite, type Motion, type Sprite } from "../../src/kit/common";
import { GROUND, SPEED, TIME } from "../../src/kit/style";
import type { ThemeMode } from "../../src/kit/types";

// 1. Art: small grids, one character per pixel, "." is empty. Letters map to
//    the palette below. Keep the lead within SIZE.lead (16 x 12).
const SNAIL: Record<"creep" | "look" | "shell", Sprite> = {
  creep: [
    ".....ssss..",
    "....sSSSSs.",
    "...sSsssSs.",
    "...sSsSsSs.",
    "bbbbsSSSsbb",
    ".bbbbbbbbb.",
  ],
  look: [
    "b.b........",
    "b.b..ssss..",
    ".bb.sSSSSs.",
    ".b.sSsssSs.",
    ".bbsSsSsSs.",
    ".bbbbbbbbb.",
  ],
  shell: [
    "...........",
    ".....ssss..",
    "....sSSSSs.",
    "...sSsssSs.",
    "...sSsSsSs.",
    "....bbbbb..",
  ],
};
const BABY: Sprite = ["..ss.", ".sSSs", "bbbbb"];
const LEAF: Sprite = [".gg..", "gggg.", ".gggg", "..g.."];

// 2. Palette: one per theme. Pale colors listed in `outlined` get a thin
//    outline in light mode so they read on a white page.
const PALETTE: Record<ThemeMode, Record<string, string | null>> = {
  light: { s: "#8a5a36", S: "#d9a066", b: "#b8a48c", g: "#4f9a5f", d: "#7fb6f0", outline: "#9c958a" },
  dark: { s: "#b07a4e", S: "#e8b47e", b: "#cdb89c", g: "#62b374", d: "#a8d4ff", outline: null },
};
const W_SNAIL = 11;

// 3. State: everything the scene remembers between frames.
interface State {
  x: number;
  dir: 1 | -1;
  leaves: number[];
  dew: { x: number; k: number } | null;
  butterfly: number | null;
}
/** What each crew member (a baby snail) keeps. */
interface Baby { x: number }
type K = Kit<State, Baby>;

// 4. The helper alert: a half-height mini scene in the same style.
const alert: AlertSpec = {
  layout: (members) => ({ width: 4 + members.length * 10, figures: rowOf(members, 4, 10, 5), extra: {} }),
  still(ctx, p) {
    ctx.fillStyle = p.view.muted;
    ctx.globalAlpha = 0.6;
    ctx.fillRect(0, p.px(ALERT_GROUND), p.layout.width * p.s, p.s);
    ctx.globalAlpha = 1;
    for (const f of p.layout.figures) p.blit(ctx, sprite(BABY, PALETTE[p.theme], false, "S"), f.x, ALERT_GROUND - 3);
  },
  moving(ctx, p) {
    for (const [i, f] of p.layout.figures.entries()) {
      if (f.member.kind === "waiting") p.bang(ctx, f.x + 6, ALERT_GROUND - 9, p.t + i * 0.4);
      else p.failed(ctx, f.x + 2, 0, p.t + i);
    }
  },
};

// 5. The module: each moment is a named hook. The kit does the rest.
export const snail = defineScene<State, Baby>({
  id: "snail",
  name: "Snail",
  state: () => ({ x: 20, dir: 1, leaves: [], dew: null, butterfly: null }),

  layout(s, k) {
    s.leaves = [0.2, 0.45, 0.7, 0.9].map((f) => Math.floor(f * k.W));
    s.x = Math.min(s.x, k.W - W_SNAIL - 2);
  },
  // Every run starts mid-action: somewhere along the path, already moving.
  start(s, k) { s.x = 8 + Math.random() * (k.W - 30); s.dir = Math.random() < 0.5 ? 1 : -1; },

  focus: (s) => s.x + W_SNAIL / 2,

  crew: {
    max: (k) => (k.narrow ? 2 : 4),
    join: (_s, k, _m, shown) => ({ x: Math.floor(k.W * (0.1 + shown * 0.18)) }),
    leave: (_s, _k, c) => { c.alpha = 0.99; },   // start fading; update() finishes it
  },

  // A step: a dew drop sparkles on the leaf nearest the snail.
  step(s) {
    if (s.dew) return false;
    const leaf = s.leaves.reduce((a, b) => (Math.abs(b - s.x) < Math.abs(a - s.x) ? b : a), s.leaves[0]);
    s.dew = { x: leaf + 2, k: 0 };
    return true;
  },

  surprise: {
    active: (s) => s.butterfly !== null,
    start(s) { s.butterfly = 0; },
  },

  hits(s, k): HitTarget[] {
    const out: HitTarget[] = [{ target: "lead", box: [s.x, GROUND - 7, W_SNAIL, 7], at: [s.x + 5, GROUND - 7] }];
    for (const c of k.crew) if (!c.leaving) out.push({ target: "member", id: c.id, box: [c.x, GROUND - 4, 5, 4], at: [c.x + 2, GROUND - 4] });
    return out;
  },
  tap(_s, k, hit) { k.react(hit.id ?? "lead", TIME.tap); },

  errorCloudX: (s) => s.x - 1,

  update(s, k, dt) {
    if (k.mood.kind === "working") {
      s.x += s.dir * SPEED.walk * 0.4 * dt;   // a snail's pace
      if (s.x > k.W - W_SNAIL - 2) s.dir = -1;
      if (s.x < 2) s.dir = 1;
    }
    if (s.dew && (s.dew.k += dt / TIME.reaction) >= 1) s.dew = null;
    if (s.butterfly !== null && ((s.butterfly += dt / 5) >= 1 || k.mood.kind !== "working")) s.butterfly = null;
    for (const c of k.crew) if (c.leaving) c.alpha -= dt;
  },
  settle(s, k) {
    s.dew = null;
    s.butterfly = null;
    k.crew = k.crew.filter((c) => !c.leaving);
  },

  draw(s, k) {
    const P = PALETTE[k.theme];
    // Cached ground and leaves: redrawn only when the size or theme changes.
    const back = k.layer("ground", `${k.W}:${k.theme}:${k.s3}`, k.ctx.canvas.width, k.ctx.canvas.height, (g) => {
      g.fillStyle = k.view.muted;
      g.globalAlpha = 0.35;
      g.fillRect(0, k.px(GROUND + 1), k.W * k.s3, k.s3);
      g.globalAlpha = 1;
      for (const x of s.leaves) { const c = sprite(LEAF, P); g.drawImage(c, k.px(x - 1), k.px(GROUND - 4), c.width * k.s3, c.height * k.s3); }
    });
    k.ctx.drawImage(back, 0, 0);
    if (s.dew) {
      k.ctx.globalAlpha = Math.sin(Math.PI * s.dew.k);
      k.dot(s.dew.x, GROUND - 5, P.d!);
      k.ctx.globalAlpha = 1;
    }
    for (const c of k.crew) {
      k.ctx.globalAlpha = Math.max(0, c.alpha);
      k.blit(sprite(BABY, { ...P, S: c.color }, false, "S"), c.x - 1, GROUND - 4);
      k.ctx.globalAlpha = 1;
      if (!c.leaving) k.marker(c.kind, c.x + 2, GROUND - 9);
    }
    const mk = k.mood.kind;
    const pose = mk === "rate" ? SNAIL.shell : mk === "waiting" ? SNAIL.look : SNAIL.creep;
    k.blit(sprite(pose, P, s.dir < 0, "S"), s.x - 1, GROUND - 7);
    // Waiting on you: the kit's amber signal, just past the snail's eyes.
    if (mk === "waiting") k.signal(s.dir < 0 ? s.x + 12 : s.x - 3, GROUND - 6);
    if (s.butterfly !== null && !k.reduced) {
      const bx = s.butterfly * (k.W + 10) - 5, by = 3 + Math.sin(k.t * 2) * 1.5;
      k.dot(bx, by, "#ee8a6a"); k.dot(bx + 2, by, "#ee8a6a");
    }
    for (const [key, t] of k.reactions()) {
      const c = k.crew.find((m) => m.id === key);
      floatNote(k.ctx, k.view, "♪", (c ? c.x + 2 : s.x + 5), GROUND - 8, t / TIME.tap);
    }
  },

  motion(s, k): Motion {
    if (s.dew || s.butterfly !== null || k.crew.some((c) => c.leaving)) return "fast";
    return k.mood.kind === "working" ? "slow" : "still";
  },

  alert,
});
