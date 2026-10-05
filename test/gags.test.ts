// @vitest-environment jsdom
// The little gags: three per scene, 2 to 4 seconds each, only while working,
// never with reduced motion, rotated so none repeats back to back, on a
// per-thread clock of about one every 3 to 5 minutes. They paint no amber
// and never cover the crew's markers.
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { SCENES } from "../src/scenes";
import { GagClock, options } from "../src/kit/common";
import { defineScene } from "../src/kit/engine";
import { AMBER } from "../src/kit/style";
import type { Mood, MoodKind } from "../src/mood";
import type { CrewMember } from "../src/crew";

/** Every color filled since the last reset, in order. */
let fills: string[] = [];
beforeAll(() => {
  // A canvas that records what gets painted: jsdom has no 2D context of its own.
  HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement) {
    const ctx: Record<string, unknown> = {
      canvas: this, fillStyle: "#000", globalAlpha: 1, imageSmoothingEnabled: false,
      fillRect() { fills.push(String(ctx.fillStyle).toLowerCase()); },
      clearRect() {}, drawImage() {}, setTransform() {}, save() {}, restore() {}, translate() {}, scale() {}, rotate() {},
      getImageData: () => ({ data: new Uint8ClampedArray(4) }), putImageData() {}, fillText() {}, measureText: () => ({ width: 0 }),
    };
    return ctx;
  } as never;
});
afterEach(() => { vi.restoreAllMocks(); options.gags = true; });

const mood = (kind: MoodKind): Mood => ({ kind, turnStartedAt: Date.now(), resetsAt: null, since: Date.now(), run: 1 });
const view = (width: number, reducedMotion = false) => ({ width, dpr: 1, theme: "dark" as const, muted: "#888", reducedMotion, now: Date.now(), duskMinutes: 40, scale: 3 });

function hsl(hex: string): [number, number, number] {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, d = max - min;
  if (d === 0) return [0, 0, l];
  const s = d / (1 - Math.abs(2 * l - 1));
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [(h * 60 + 360) % 360, s, l];
}
const looksAmber = (c: string) => { if (!/^#[0-9a-f]{6}$/.test(c)) return false; const [h, s, l] = hsl(c); return h >= 32 && h <= 44 && s >= 0.68 && l >= 0.45 && l <= 0.72; };

describe("every scene's gags", () => {
  for (const scene of SCENES) {
    const inst = scene.create();
    it(`${scene.name} has three gags of 2 to 4 seconds`, () => {
      const ids = inst.gagIds();
      expect(ids).toHaveLength(3);
      expect(new Set(ids).size).toBe(3);
      const spec = (scene as unknown as { spec: { gags: { seconds: number }[] } }).spec;
      for (const g of spec.gags) { expect(g.seconds).toBeGreaterThanOrEqual(2); expect(g.seconds).toBeLessThanOrEqual(4); }
    });

    for (const width of [360, 900]) {
      it(`${scene.name} plays each gag at ${width} px without amber, then carries on`, () => {
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d") as unknown as CanvasRenderingContext2D;
        for (const id of inst.gagIds()) {
          const s = scene.create();
          s.draw(ctx, view(width));
          s.setMood(mood("working"));
          for (let i = 0; i < 60; i++) s.update(1 / 30);
          s.draw(ctx, view(width));
          // Some gags need the right moment (a sheep near the stile); try a few times.
          let started = s.gag(id);
          for (let tries = 0; !started && tries < 40; tries++) { for (let i = 0; i < 15; i++) s.update(1 / 30); started = s.gag(id); }
          expect(started, `${scene.id}/${id} never found its moment`).toBe(true);
          expect(s.motion()).toBe("fast");
          fills = [];
          for (let i = 0; i < 4.5 * 30; i++) { s.update(1 / 30); if (i % 3 === 0) s.draw(ctx, view(width)); }
          expect(fills.filter(looksAmber), `${scene.id}/${id} painted amber`).toEqual([]);
          expect(fills).not.toContain(AMBER);
          // The gag is over and the scene goes on working.
          expect((s as unknown as { gagId: string | null }).gagId).toBeNull();
          s.draw(ctx, view(width));
        }
      });
    }
  }
});

describe("the kit's rules for gags", () => {
  const scene = SCENES[0];
  const ready = () => {
    const s = scene.create();
    s.draw(document.createElement("canvas").getContext("2d") as unknown as CanvasRenderingContext2D, view(900));
    return s;
  };

  it("never starts one outside working, or with reduced motion", () => {
    const s = ready();
    for (const k of ["idle", "waiting", "error", "rate"] as MoodKind[]) { s.setMood(mood(k)); expect(s.gag("tail")).toBe(false); }
    const r = scene.create();
    r.draw(document.createElement("canvas").getContext("2d") as unknown as CanvasRenderingContext2D, view(900, true));
    r.setMood(mood("working"));
    expect(r.gag("tail")).toBe(false);
  });

  it("ends one the moment the agent waits, fails, or rests", () => {
    for (const k of ["waiting", "error", "rate"] as MoodKind[]) {
      const s = ready();
      s.setMood(mood("working"));
      expect(s.gag("tail")).toBe(true);
      s.setMood(mood(k));
      expect((s as unknown as { gagId: string | null }).gagId).toBeNull();
    }
  });

  it("waits 3 to 5 minutes of watched work between gags, and only while working", () => {
    const c = new GagClock();
    let t = 0;
    while (!c.tick(1, "working", false, false)) { t++; expect(t).toBeLessThan(301); }
    expect(t).toBeGreaterThanOrEqual(179);
    for (let i = 0; i < 400; i++) expect(c.tick(1, "waiting", false, false)).toBe(false);
    for (let i = 0; i < 400; i++) expect(c.tick(1, "working", true, false)).toBe(false);   // reduced motion
    options.gags = false;
    for (let i = 0; i < 400; i++) expect(c.tick(1, "working", false, false)).toBe(false);   // the switch is off
  });

  it("rotates so the same gag never plays twice in a row", () => {
    const c = new GagClock();
    let last = -1;
    for (let i = 0; i < 200; i++) { const n = c.pick("pasture", 3); expect(n).not.toBe(last); last = n; }
  });

  it("keeps its timing in the thread's clock across new scenes", () => {
    const clock = new GagClock();
    vi.spyOn(clock, "tick").mockReturnValue(true);
    const s = scene.create({ gags: clock });
    s.draw(document.createElement("canvas").getContext("2d") as unknown as CanvasRenderingContext2D, view(900));
    s.setMood(mood("working"));
    s.update(1 / 30);
    expect((s as unknown as { gagId: string | null }).gagId).not.toBeNull();
  });

  it("draws the waiting signal over anything a scene paints after it", () => {
    const toy = defineScene<{ x: number }>({
      id: "toy2", name: "Toy", state: () => ({ x: 10 }), focus: () => 10,
      crew: { max: () => 4, join: () => ({}) }, step: () => false, surprise: { active: () => false, start() {} },
      hits: () => [], tap() {}, errorCloudX: () => 0, update() {}, settle() {}, motion: () => "slow",
      draw(_s, k) { if (k.mood.kind === "waiting") k.signal(10, 2); k.dot(10, 2, "#123456"); },   // a character walking past
      alert: { layout: () => ({ width: 10, figures: [], extra: {} }), still() {}, moving() {} },
    });
    const s = toy.create();
    const ctx = document.createElement("canvas").getContext("2d") as unknown as CanvasRenderingContext2D;
    s.draw(ctx, view(600));
    s.setMood(mood("waiting"));
    fills = [];
    s.draw(ctx, view(600));
    expect(fills.lastIndexOf(AMBER.toLowerCase())).toBeGreaterThan(fills.indexOf("#123456"));
  });

  it("draws the crew's markers over a gag", () => {
    const toy = defineScene<{ x: number }>({
      id: "toy", name: "Toy", state: () => ({ x: 10 }), focus: () => 10,
      crew: { max: () => 4, join: () => ({}) }, step: () => false, surprise: { active: () => false, start() {} },
      hits: () => [], tap() {}, errorCloudX: () => 0, update() {}, settle() {}, motion: () => "fast",
      draw(_s, k) { for (const c of k.crew) k.marker(c.kind, 10, 2); },
      gags: [{ id: "cover", seconds: 3, draw(_s, k) { k.dot(10, 2, "#123456"); } }],
      alert: { layout: () => ({ width: 10, figures: [], extra: {} }), still() {}, moving() {} },
    });
    const s = toy.create();
    const ctx = document.createElement("canvas").getContext("2d") as unknown as CanvasRenderingContext2D;
    s.draw(ctx, view(600));
    s.setMood(mood("working"));
    s.setCrew([{ id: "w", kind: "waiting", title: "w" } as CrewMember]);
    expect(s.gag("cover")).toBe(true);
    fills = [];
    s.draw(ctx, view(600));
    expect(fills.lastIndexOf(AMBER.toLowerCase())).toBeGreaterThan(fills.indexOf("#123456"));
  });
});
