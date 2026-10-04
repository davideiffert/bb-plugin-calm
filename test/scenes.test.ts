import { describe, expect, it } from "vitest";
import { sceneFor, SCENES } from "../src/scenes";
import { Sea } from "../src/scenes/sea";
import { Night } from "../src/scenes/night";
import { DEFAULT_FEATURES, cleanPrefs, cleanThreadPrefs, emptyDay, tally } from "../src/settings";
import type { Mood, MoodKind } from "../src/mood";

const mood = (kind: MoodKind): Mood => ({ kind, turnStartedAt: 0, resetsAt: null, since: 0 });
const advance = (p: { update(dt: number): void }, seconds: number) => { for (let t = 0; t < seconds; t += 1 / 30) p.update(1 / 30); };

describe("sceneFor", () => {
  it("uses the named scene", () => {
    expect(sceneFor("thr_a", "sea").id).toBe("sea");
    expect(sceneFor("thr_a", "night").id).toBe("night");
  });
  it("falls back to the Pasture for anything unexpected", () => {
    expect(sceneFor("thr_a", undefined).id).toBe("pasture");
    expect(sceneFor("thr_a", "Volcano").id).toBe("pasture");
  });
  it("keeps one scene per thread, and spreads threads across scenes", () => {
    const pick = (id: string) => sceneFor(id, "each-thread").id;
    expect(pick("thr_abc123")).toBe(pick("thr_abc123"));
    const seen = new Set(Array.from({ length: 30 }, (_, i) => pick(`thr_${i}x`)));
    expect(seen.size).toBe(SCENES.length);
  });
});

describe("cleanPrefs", () => {
  it("keeps known values and defaults the rest", () => {
    expect(cleanPrefs({ scene: "sea", evening: 20 })).toEqual({ scene: "sea", evening: 20, features: DEFAULT_FEATURES });
    expect(cleanPrefs({ scene: "volcano", evening: 90 })).toEqual({ scene: "each-run", evening: 40, features: DEFAULT_FEATURES });
    expect(cleanPrefs(undefined)).toEqual({ scene: "each-run", evening: 40, features: DEFAULT_FEATURES });
  });

  it("defaults to a new scene each run, with every feature on", () => {
    expect(cleanPrefs(undefined).scene).toBe("each-run");
    expect(Object.values(DEFAULT_FEATURES).every(Boolean)).toBe(true);
  });

  it("keeps a feature switched off and ignores unknown ones", () => {
    const p = cleanPrefs({ features: { crew: false, taps: "no", lasers: true } });
    expect(p.features.crew).toBe(false);
    expect(p.features.taps).toBe(true);
    expect("lasers" in p.features).toBe(false);
  });
});

describe("thread prefs and today's numbers", () => {
  it("writes today's line in the scene's own words", async () => {
    const { todayLine } = await import("../src/home");
    const day = { day: "x", runs: 4, hops: 23, longest: 12 * 60000, lastThreadId: null, lastRun: 0 };
    expect(todayLine(day, "pasture")).toBe("Today: 4 runs · 23 hops · longest run 12 min");
    expect(todayLine({ ...day, runs: 1, hops: 1, longest: 20000 }, "sea")).toBe("Today: 1 run · 1 jump · longest run under 1 min");
    expect(todayLine({ ...day, runs: 0, hops: 0, longest: 0 }, "night")).toBe("Today: no runs yet");
  });

  it("keeps only a known pinned scene", () => {
    expect(cleanThreadPrefs({ off: true, scene: "volcano" })).toEqual({ off: true, scene: null });
    expect(cleanThreadPrefs({ scene: "sea" })).toEqual({ off: false, scene: "sea" });
  });

  it("counts runs, hops, and the longest run, and starts over on a new day", () => {
    const morning = new Date(2026, 9, 4, 9, 0).getTime();
    let s = emptyDay(morning);
    s = tally(s, morning, { started: { threadId: "t", run: 3 } });
    s = tally(s, morning, { hops: 5 });
    s = tally(s, morning, { ended: 12.4 * 60000 });
    s = tally(s, morning, { ended: 3 * 60000 });
    expect(s).toMatchObject({ runs: 1, hops: 5, longest: 12.4 * 60000, lastThreadId: "t", lastRun: 3 });
    const tomorrow = new Date(2026, 9, 5, 8, 0).getTime();
    expect(tally(s, tomorrow, {})).toMatchObject({ runs: 0, hops: 0, longest: 0, lastThreadId: "t" });
  });
});

type SeaInner = { fish: unknown; anchor: number; x: number; lastFish: number };
describe("Sea", () => {
  const sea = () => { const s = new Sea(); s.layout(900); s.setMood(mood("working")); return s; };

  it("starts under way with a fish already leaping", () => {
    expect((sea() as unknown as SeaInner).fish).not.toBeNull();
  });
  it("sails while working and drops anchor while waiting", () => {
    const s = sea();
    const x0 = (s as unknown as SeaInner).x;
    advance(s, 2);
    expect((s as unknown as SeaInner).x).not.toBe(x0);
    s.setMood(mood("waiting"));
    advance(s, 1);
    const inner = s as unknown as SeaInner;
    expect(inner.anchor).toBe(1);
    const x1 = inner.x;
    advance(s, 2);
    expect(inner.x).toBe(x1);
  });
  it("leaps at most once per debounce window", () => {
    const s = sea();
    advance(s, 1.8);                     // past the opening leap's window
    s.step();
    const first = (s as unknown as SeaInner).lastFish;
    expect(first).toBeGreaterThan(1.7);
    advance(s, 1); s.step();             // too soon: ignored
    expect((s as unknown as SeaInner).lastFish).toBe(first);
  });
});

type NightInner = { streak: unknown; drift: number };
describe("Night", () => {
  const night = () => { const n = new Night(); n.layout(900); n.setMood(mood("working")); return n; };

  it("opens with a shooting star", () => {
    expect((night() as unknown as NightInner).streak).not.toBeNull();
  });
  it("holds the sky still while waiting", () => {
    const n = night();
    advance(n, 1);
    n.setMood(mood("waiting"));
    const d = (n as unknown as NightInner).drift;
    advance(n, 2);
    expect((n as unknown as NightInner).drift).toBe(d);
  });
});

describe("opening a thread that is not running", () => {
  it("shows no fish or shooting star", () => {
    const s = new Sea(); s.setMood(mood("error")); s.layout(900);
    expect((s as unknown as SeaInner).fish).toBeNull();
    const n = new Night(); n.setMood(mood("waiting")); n.layout(900);
    expect((n as unknown as NightInner).streak).toBeNull();
  });
});

describe("a new one each time", () => {
  it("moves to the next scene in order on every run, never repeating", () => {
    const order = [1, 2, 3, 4, 5, 6].map((run) => sceneFor("thr_x", "each-run", run).id);
    expect(order).toEqual(["pasture", "sea", "night", "pasture", "sea", "night"]);
    for (let i = 1; i < order.length; i++) expect(order[i]).not.toBe(order[i - 1]);
  });
});
