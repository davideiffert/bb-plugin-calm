// Parity harness: plays every moment of every scene with seeded randomness
// and a fixed clock, in two builds side by side, and compares the pixels,
// the page labels, the sky glow, the frame rate asked for, and hit-testing.
// Bundled twice by run.mjs: once against the baseline, once against the
// working tree, each exposing window.CALM_<NAME>.
import { api } from "@adapter";
import type { CrewMember } from "@calm/crew";
import type { Mood, MoodKind } from "@calm/mood";

type Theme = "light" | "dark";
type Inst = ReturnType<(typeof api.scenes)[number]["create"]>;

/** Deterministic Math.random for one moment. */
function seed(n: number) {
  let s = n >>> 0 || 1;
  Math.random = () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ((s >>> 0) % 1_000_000) / 1_000_000; };
}

const DAY = new Date(2026, 3, 15, 13, 0).getTime();   // a spring afternoon
const mood = (kind: MoodKind, extra: Partial<Mood> = {}): Mood => ({ kind, turnStartedAt: DAY, resetsAt: null, since: DAY, run: 1, ...extra });
const kid = (id: string, kind: MoodKind): CrewMember => ({ id, kind, title: `Helper ${id}`, since: DAY });

export interface Ctx {
  inst: Inst; now: number; reduced: boolean; theme: Theme; width: number; scale: number;
  run(seconds: number): void;
}

/** Each moment drives a fresh scene instance, then the harness draws one frame. */
export const MOMENTS: Record<string, (c: Ctx) => void> = {
  "working-0.5s": (c) => { c.inst.setMood(mood("idle")); c.inst.setMood(mood("working")); c.run(0.5); },
  "working-4s": (c) => { c.inst.setMood(mood("working")); c.run(4); },
  "step": (c) => { c.inst.setMood(mood("working")); c.run(2.5); c.inst.step(); c.run(0.25); },
  "step-burst": (c) => { c.inst.setMood(mood("working")); c.run(2.5); c.inst.step(); c.inst.step(); c.run(0.6); c.inst.step(); c.run(0.3); },
  "waiting": (c) => { c.inst.setMood(mood("working")); c.run(2); c.inst.setMood(mood("waiting")); c.run(3); },
  "waiting-resolved": (c) => { c.inst.setMood(mood("working")); c.run(2); c.inst.setMood(mood("waiting")); c.run(2); c.inst.setMood(mood("working")); c.run(1); },
  "rate": (c) => { c.inst.setMood(mood("working")); c.run(2); c.inst.setMood(mood("rate", { turnStartedAt: null, resetsAt: DAY + 47 * 60000 })); c.run(7); },
  "rate-no-reset": (c) => { c.inst.setMood(mood("working")); c.run(2); c.inst.setMood(mood("rate", { turnStartedAt: null })); c.run(7); },
  "error": (c) => { c.inst.setMood(mood("working")); c.run(2); c.inst.setMood(mood("error", { turnStartedAt: null })); c.run(1.3); },
  "idle-after-run": (c) => { c.inst.setMood(mood("working")); c.run(2); c.inst.setMood(mood("idle", { turnStartedAt: null })); c.run(1); },
  "dusk-20min": (c) => { c.inst.setMood(mood("working", { turnStartedAt: c.now - 20 * 60000 })); c.run(2); },
  "dusk-40min": (c) => { c.inst.setMood(mood("working", { turnStartedAt: c.now - 41 * 60000 })); c.run(2); },
  "crew-3": (c) => { c.inst.setMood(mood("working")); c.run(1); c.inst.setCrew([kid("a1", "working"), kid("b2", "waiting"), kid("c3", "error")]); c.run(4); },
  "crew-overflow": (c) => { c.inst.setMood(mood("working")); c.run(1); c.inst.setCrew(["a1", "b2", "c3", "d4", "e5", "f6", "g7"].map((id) => kid(id, "working"))); c.run(4); },
  "crew-leaving": (c) => { c.inst.setMood(mood("working")); c.run(1); c.inst.setCrew([kid("a1", "working"), kid("b2", "working")]); c.run(4); c.inst.setCrew([kid("b2", "working")]); c.run(1); },
  "crew-rate": (c) => { c.inst.setMood(mood("working")); c.inst.setCrew([kid("a1", "working"), kid("b2", "rate")]); c.run(3); c.inst.setMood(mood("rate", { turnStartedAt: null })); c.run(3); },
  "tap-lead": (c) => { c.inst.setMood(mood("working")); c.run(1); tap(c, "lead"); c.run(0.3); },
  "tap-flock": (c) => { c.inst.setMood(mood("working")); c.run(1); tap(c, "flock"); c.run(0.4); },
  "tap-member": (c) => { c.inst.setMood(mood("working")); c.inst.setCrew([kid("a1", "working")]); c.run(4); tap(c, "member"); c.run(0.4); },
  "surprise": (c) => { c.inst.setMood(mood("working")); c.run(1); c.inst.surprise(); c.run(1.2); },
  "surprise-late": (c) => { c.inst.setMood(mood("working")); c.run(1); c.inst.surprise(); c.run(2.6); },
  // Each gag, forced, early and late in its beat (a build without gags draws the working scene).
  ...Object.fromEntries([0, 1, 2].flatMap((n) => [["a", 0.9], ["b", 2]].map(([part, at]) => [`gag-${n + 1}-${part}`, (c: Ctx) => {
    c.inst.setMood(mood("working")); c.run(3);
    const ids = (c.inst as { gagIds?: () => string[] }).gagIds?.() ?? [];
    if (ids[n]) (c.inst as { gag?: (id: string) => boolean }).gag?.(ids[n]);
    c.run(at as number);
  }]))),
};

/** Tap the first thing of a kind, found by scanning the strip for a hit. */
function tap(c: Ctx, target: "lead" | "member" | "flock") {
  const h = 16 * c.scale;
  for (let x = 0; x < c.width; x += 2) for (let y = 0; y < h; y += 2) {
    const hit = c.inst.hit(x, y);
    if (hit && hit.target === target) { c.inst.poke(hit); return; }
  }
}

/** The strips to draw each moment in. */
export const VIEWS: { name: string; theme: Theme; width: number; now: number; reduced: boolean; scale: number }[] = [
  { name: "light-600", theme: "light", width: 600, now: DAY, reduced: false, scale: 3 },
  { name: "dark-600", theme: "dark", width: 600, now: DAY, reduced: false, scale: 3 },
  { name: "dark-360", theme: "dark", width: 360, now: DAY, reduced: false, scale: 3 },
  { name: "dark-600-reduced", theme: "dark", width: 600, now: DAY, reduced: true, scale: 3 },
  { name: "dark-600-night", theme: "dark", width: 600, now: new Date(2026, 3, 15, 22, 30).getTime(), reduced: false, scale: 3 },
  { name: "light-600-winter", theme: "light", width: 600, now: new Date(2026, 0, 15, 13, 0).getTime(), reduced: false, scale: 3 },
  { name: "dark-600-summer", theme: "dark", width: 600, now: new Date(2026, 6, 15, 13, 0).getTime(), reduced: false, scale: 3 },
  { name: "light-600-autumn", theme: "light", width: 600, now: new Date(2026, 9, 15, 17, 30).getTime(), reduced: false, scale: 3 },
  { name: "preview-300", theme: "light", width: 300, now: DAY, reduced: false, scale: 2 },
];
/** Seasons and narrow strips only matter for some moments; keep the run quick. */
const VIEW_MOMENTS: Record<string, string[] | "all"> = {
  "light-600": "all", "dark-600": "all", "dark-360": "all", "dark-600-reduced": "all",
  "dark-600-night": ["working-4s", "waiting", "crew-3", "dusk-40min"],
  "light-600-winter": ["working-4s", "waiting", "error"], "dark-600-summer": ["working-4s", "waiting", "error"],
  "light-600-autumn": ["working-4s", "waiting", "dusk-20min"], "preview-300": ["working-4s", "step", "crew-3"],
};

export interface Shot {
  key: string; png: string; labels: string; glow: string; motion: string; focus: number; hits: string;
  /** Pixels close to the waiting amber, counted in gag moments (a gag must paint none). */
  amber?: number;
}

/** Pixels within a small distance of the waiting amber (#f5a524). */
function amberPixels(ctx: CanvasRenderingContext2D, w: number, h: number): number {
  const d = ctx.getImageData(0, 0, w, h).data;
  let n = 0;
  for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 200 && Math.abs(d[i] - 245) < 14 && Math.abs(d[i + 1] - 165) < 18 && Math.abs(d[i + 2] - 36) < 30) n++;
  return n;
}

export function runAll(filter?: string, opts: { views?: string[]; compose?: boolean; alerts?: boolean } = {}): Shot[] {
  const out: Shot[] = [];
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d")!;
  for (const scene of api.scenes) for (const view of VIEWS) for (const [name, play] of Object.entries(MOMENTS)) {
    if (opts.views && !opts.views.includes(view.name)) continue;
    const wanted = opts.views ? "all" : VIEW_MOMENTS[view.name];
    if (wanted !== "all" && !wanted.includes(name)) continue;
    const key = `${scene.id}/${view.name}/${name}`;
    if (filter && !key.includes(filter)) continue;
    seed(1234);
    const inst = scene.create();
    const dv = { width: view.width, dpr: 1, theme: view.theme, muted: view.theme === "dark" ? "#8a8a93" : "#6b6b73", reducedMotion: view.reduced, now: view.now, duskMinutes: 40, scale: view.scale };
    const draw = () => { api.beginFrame(); inst.draw(ctx, dv); return api.endFrame(); };
    const cw = Math.floor(view.width / view.scale) * view.scale;
    canvas.width = cw; canvas.height = scene.height * view.scale / 3;
    let clock = 0;
    const c: Ctx = {
      inst, now: view.now, reduced: view.reduced, theme: view.theme, width: cw, scale: view.scale,
      // Like the app: draw once so the scene knows its size, then frames at 30 fps.
      run(seconds) { for (let t = 0; t < seconds - 1e-9; t += 1 / 30) { inst.update(1 / 30); clock += 1 / 30; if (Math.round(clock * 30) % 3 === 0) draw(); } },
    };
    draw();
    play(c);
    const frame = draw();
    const hits: string[] = [];
    for (let x = 0; x < cw; x += 6) for (let y = 0; y < canvas.height; y += 6) {
      const h = inst.hit(x, y);
      if (h) hits.push(`${x},${y}:${h.target}:${h.id ?? ""}:${Math.round(h.x)},${Math.round(h.y)}`);
    }
    const amber = name.startsWith("gag-") ? amberPixels(ctx, canvas.width, canvas.height) : undefined;
    out.push({
      key, amber, png: opts.compose ? compose(canvas, frame, view.theme, view.scale) : canvas.toDataURL(),
      labels: JSON.stringify([...frame.labels].map((l) => JSON.stringify(l)).sort()),
      glow: JSON.stringify(frame.glow), motion: inst.motion(), focus: Math.round(inst.focusX() * 100) / 100,
      hits: hits.join("|"),
    });
  }
  // The helper alert's mini scene.
  if (opts.alerts !== false) for (const scene of api.scenes) for (const theme of ["light", "dark"] as Theme[]) for (const reduced of [false, true]) {
    for (const [name, members] of Object.entries({
      waiting: [kid("w1", "waiting")], failed: [kid("f1", "error")],
      several: [kid("w1", "waiting"), kid("w2", "waiting"), kid("f1", "error"), kid("f2", "error")],
    })) {
      const key = `alert/${scene.id}/${theme}${reduced ? "-reduced" : ""}/${name}`;
      if (filter && !key.includes(filter)) continue;
      seed(99);
      const a = api.alert(scene.id);
      a.set(members);
      canvas.width = a.width; canvas.height = 26;
      for (let i = 0; i < 20; i++) a.update(reduced ? 0 : 1 / 15);
      a.draw(ctx, theme, theme === "dark" ? "#8a8a93" : "#6b6b73", reduced);
      const hits: string[] = [];
      for (let x = 0; x < a.width; x += 4) hits.push(String(a.hit(x)));
      out.push({ key, png: canvas.toDataURL(), labels: "", glow: "", motion: a.motion(reduced), focus: a.width, hits: hits.join("|") });
    }
  }
  return out;
}

type Frame = ReturnType<typeof api.endFrame>;

/**
 * The strip as a person sees it: the page color, the sky glow behind, the
 * pixels, and the page-text labels on top. For galleries, not for parity.
 */
export function compose(canvas: HTMLCanvasElement, frame: Frame, theme: Theme, scale: number, pad = 18): string {
  const out = document.createElement("canvas");
  out.width = canvas.width; out.height = canvas.height + pad;
  const g = out.getContext("2d")!;
  g.fillStyle = theme === "dark" ? "#18181b" : "#ffffff";
  g.fillRect(0, 0, out.width, out.height);
  for (const [h, s, l, a] of frame.glow) {
    const cx = out.width / 2, cy = pad + canvas.height * 0.84;
    const rx = Math.max(140, out.width * 0.42), ry = canvas.height * 0.62;
    g.save(); g.translate(cx, cy); g.scale(1, ry / rx);
    const grad = g.createRadialGradient(0, 0, 0, 0, 0, rx);
    for (const [k, p] of [[1, 0], [0.86, 0.18], [0.62, 0.36], [0.38, 0.54], [0.19, 0.7], [0.07, 0.84], [0.015, 0.94], [0, 1]]) grad.addColorStop(p, `hsla(${h},${s}%,${l}%,${a * k})`);
    g.fillStyle = grad; g.fillRect(-rx, -rx, rx * 2, rx * 2); g.restore();
  }
  g.imageSmoothingEnabled = false;
  g.drawImage(canvas, 0, pad);
  g.fillStyle = theme === "dark" ? "#a1a1aa" : "#6b6b73";
  for (const l of frame.labels) {
    g.globalAlpha = l.alpha;
    g.font = `${l.weight} ${l.size}px ${l.mono ? "ui-monospace, Menlo, monospace" : "system-ui, sans-serif"}`;
    g.textAlign = l.align === "center" ? "center" : l.align;
    g.textBaseline = l.anchor === "top" ? "top" : l.anchor === "bottom" ? "bottom" : "alphabetic";
    if (l.plate) {
      const w = g.measureText(l.text).width;
      g.fillStyle = theme === "dark" ? "#18181b" : "#ffffff";
      g.fillRect(l.x - 5, l.y + pad - 1, w + 10, l.size + 4);
      g.fillStyle = theme === "dark" ? "#a1a1aa" : "#6b6b73";
    }
    g.fillText(l.text, l.x, l.y + pad);
  }
  g.globalAlpha = 1;
  void scale;
  return out.toDataURL();
}

/** A short scripted clip of one scene: every moment in about 18 seconds, at 15 fps. */
export function clip(sceneId: string, theme: Theme, width: number): string[] {
  const scene = api.scenes.find((s) => s.id === sceneId)!;
  seed(77);
  const inst = scene.create();
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d")!;
  const cw = Math.floor(width / 3) * 3;
  canvas.width = cw; canvas.height = scene.height;
  const dv = { width, dpr: 1, theme, muted: theme === "dark" ? "#8a8a93" : "#6b6b73", reducedMotion: false, now: DAY, duskMinutes: 40, scale: 3 };
  const frames: string[] = [];
  const script: [number, () => void][] = [
    [0, () => { inst.setMood(mood("idle")); inst.setMood(mood("working")); }],
    [1.6, () => inst.step()], [3, () => inst.setCrew([kid("a1", "working"), kid("b2", "working")])],
    [4.6, () => inst.step()], [6, () => inst.step()],
    [7, () => inst.setCrew([kid("a1", "working"), kid("b2", "waiting"), kid("c3", "error")])],
    [8.5, () => inst.setMood(mood("waiting"))], [10.5, () => inst.setMood(mood("working"))],
    [11, () => inst.surprise()], [12, () => { const h = findHit(inst, cw, scene.height, "flock") ?? findHit(inst, cw, scene.height, "lead"); if (h) inst.poke(h); }],
    [13.5, () => inst.setCrew([kid("a1", "working")])],
    [14.5, () => inst.setMood(mood("error", { turnStartedAt: null }))],
    [16, () => inst.setMood(mood("rate", { turnStartedAt: null, resetsAt: DAY + 47 * 60000 }))],
  ];
  let next = 0;
  for (let i = 0; i <= 18.5 * 30; i++) {
    const t = i / 30;
    while (next < script.length && script[next][0] <= t + 1e-9) script[next++][1]();
    if (i % 2 === 0) { api.beginFrame(); inst.draw(ctx, dv); frames.push(compose(canvas, api.endFrame(), theme, 3)); }
    inst.update(1 / 30);
  }
  return frames;
}

/** A clip of each of a scene's gags, forced one after another while working, at 15 fps. */
export function gagClip(sceneId: string, theme: Theme, width: number): { id: string; frames: string[] }[] {
  const scene = api.scenes.find((s) => s.id === sceneId)!;
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d")!;
  const cw = Math.floor(width / 3) * 3;
  canvas.width = cw; canvas.height = scene.height;
  const dv = { width, dpr: 1, theme, muted: theme === "dark" ? "#8a8a93" : "#6b6b73", reducedMotion: false, now: DAY, duskMinutes: 40, scale: 3 };
  const ids = (scene.create() as { gagIds?: () => string[] }).gagIds?.() ?? [];
  return ids.map((id) => {
    seed(55);
    const inst = scene.create() as Inst & { gag(id: string): boolean };
    const frames: string[] = [];
    inst.setMood(mood("idle")); inst.setMood(mood("working"));
    for (let i = 0; i < 5.6 * 30; i++) {
      if (i === 30) inst.gag(id);
      if (i % 2 === 0) { api.beginFrame(); inst.draw(ctx, dv); frames.push(compose(canvas, api.endFrame(), theme, 3)); }
      inst.update(1 / 30);
    }
    return { id, frames };
  });
}

function findHit(inst: Inst, w: number, h: number, target: string) {
  for (let x = 0; x < w; x += 2) for (let y = 0; y < h; y += 2) { const hit = inst.hit(x, y); if (hit && hit.target === target) return hit; }
  return null;
}

declare const CALM_NAME: string;
(window as unknown as Record<string, unknown>)[`CALM_${CALM_NAME}`] = { runAll, clip, gagClip, scenes: api.scenes.map((s) => ({ id: s.id, name: s.name, gags: (s.create() as { gagIds?: () => string[] }).gagIds?.() ?? [] })) };
