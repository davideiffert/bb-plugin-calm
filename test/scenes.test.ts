import { make, type Probe } from "./probe";
import { describe, expect, it } from "vitest";
import { bagIndex, sceneFor, SCENES } from "../src/scenes";
import { sea } from "../src/scenes/sea";
import { night } from "../src/scenes/night";
import { DEFAULT_FEATURES, SCENE_IDS, cleanPrefs, cleanThreadPrefs } from "../src/settings";
import type { Mood, MoodKind } from "../src/mood";

const mood = (kind: MoodKind): Mood => ({ kind, turnStartedAt: 0, resetsAt: null, since: 0 });
const advance = (p: { update(dt: number): void }, seconds: number) => { for (let t = 0; t < seconds; t += 1 / 30) p.update(1 / 30); };

describe("a new one each time (shuffled bag)", () => {
  it("shows every scene once per bag, never the same twice in a row, the same in every window", () => {
    for (const n of [3, 5, 16]) for (const thread of ["thr_a", "thr_b", "thr_long_thread_id_123"]) {
      const runs = Array.from({ length: n * 6 }, (_, i) => bagIndex(thread, i + 1, n));
      for (let b = 0; b < 6; b++) expect(new Set(runs.slice(b * n, b * n + n)).size).toBe(n);
      for (let i = 1; i < runs.length; i++) expect(runs[i]).not.toBe(runs[i - 1]);
      expect(Array.from({ length: n * 6 }, (_, i) => bagIndex(thread, i + 1, n))).toEqual(runs);
    }
  });

  it("differs between threads, so it feels random", () => {
    const first = (id: string) => Array.from({ length: 16 }, (_, i) => bagIndex(id, i + 1, 16)).join(",");
    expect(first("thr_a")).not.toBe(first("thr_b"));
  });

  it("alternates when there are only two scenes", () => {
    const runs = [1, 2, 3, 4].map((r) => bagIndex("t", r, 2));
    expect(runs[0]).not.toBe(runs[1]);
    expect(runs[2]).toBe(runs[0]);
  });
});

describe("the random mix", () => {
  it("lists every scene id, in picker order", () => {
    expect([...SCENE_IDS]).toEqual(SCENES.map((s) => s.id));
  });

  it("draws only from scenes still in the mix", () => {
    const out = ["pasture", "sea", "night", "balloons"];
    const picks = new Set(Array.from({ length: 40 }, (_, i) => sceneFor("thr_m", "each-run", i + 1, out).id));
    for (const id of out) expect(picks.has(id)).toBe(false);
    expect(picks.size).toBe(SCENES.length - out.length);
    expect(out).not.toContain(sceneFor("thr_m", "each-thread", 0, out).id);
    expect(sceneFor("thr_m", "sea", 0, out).id).toBe("sea");   // a chosen scene always shows
  });

  it("keeps only known ids, and leaving every scene out leaves none out", () => {
    expect(cleanPrefs({ excluded: ["sea", "volcano", "sea"] }).excluded).toEqual(["sea"]);
    expect(cleanPrefs({ excluded: [...SCENE_IDS] }).excluded).toEqual([]);
  });
});

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
    const seen = new Set(Array.from({ length: 400 }, (_, i) => pick(`thr_${i}x`)));
    expect(seen.size).toBe(SCENES.length);
  });
});

describe("cleanPrefs", () => {
  it("keeps known values and defaults the rest", () => {
    expect(cleanPrefs({ scene: "sea", evening: 20 })).toEqual({ show: "working", scene: "sea", evening: 20, features: DEFAULT_FEATURES, excluded: [] });
    expect(cleanPrefs({ scene: "volcano", evening: 90 })).toEqual({ show: "working", scene: "each-run", evening: 40, features: DEFAULT_FEATURES, excluded: [] });
    expect(cleanPrefs(undefined)).toEqual({ show: "working", scene: "each-run", evening: 40, features: DEFAULT_FEATURES, excluded: [] });
  });

  it("shows scenes only while the agent works unless set to always", () => {
    expect(cleanPrefs(undefined).show).toBe("working");
    expect(cleanPrefs({ scene: "sea" }).show).toBe("working");   // saved before the setting existed
    expect(cleanPrefs({ show: "always" }).show).toBe("always");
    expect(cleanPrefs({ show: "sometimes" }).show).toBe("working");
    expect(cleanPrefs({ show: true }).show).toBe("working");
  });

  it("defaults to a new scene each run, with every feature on and Still pictures off", () => {
    expect(cleanPrefs(undefined).scene).toBe("each-run");
    const { still, spill, ...rest } = DEFAULT_FEATURES;
    expect(Object.values(rest).every(Boolean)).toBe(true);
    expect(still).toBe(false);   // motion follows the system setting unless you choose stills
    expect(spill).toBe(false);   // experimental: opt in
  });

  it("keeps a feature switched off and ignores unknown ones", () => {
    const p = cleanPrefs({ features: { crew: false, taps: "no", lasers: true } });
    expect(p.features.crew).toBe(false);
    expect(p.features.taps).toBe(true);
    expect("lasers" in p.features).toBe(false);
  });
});

describe("thread prefs", () => {
  it("keeps only a known pinned scene", () => {
    expect(cleanThreadPrefs({ off: true, scene: "volcano" })).toEqual({ off: true, scene: null });
    expect(cleanThreadPrefs({ scene: "sea" })).toEqual({ off: false, scene: "sea" });
  });
});

type SeaInner = { fish: unknown; anchor: number; x: number; lastFish: number };
describe("Sea", () => {
  const open = () => { const s = make(sea); s.layout(900); s.setMood(mood("working")); return s; };

  it("starts under way with a fish already leaping", () => {
    expect((open() as unknown as SeaInner).fish).not.toBeNull();
  });
  it("sails while working and drops anchor while waiting", () => {
    const s = open();
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
  it("lies at anchor with no gags while resting between runs, then sails on", () => {
    const s = open();
    advance(s, 2);
    s.setMood({ ...mood("working"), turnStartedAt: null, resting: true });
    advance(s, 1);
    const inner = s as unknown as SeaInner;
    expect(inner.anchor).toBe(1);
    const x1 = inner.x;
    advance(s, 2);
    expect(inner.x).toBe(x1);
    expect(s.motion()).toBe("slow");
    expect(s.gag("gull")).toBe(false);
    s.step();
    expect(inner.fish).toBeNull();
    s.setMood(mood("working"));
    advance(s, 1);
    expect(inner.anchor).toBe(0);
    expect(inner.x).not.toBe(x1);
  });
  it("leaps at most once per debounce window", () => {
    const s = open();
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
  const openNight = () => { const n = make(night); n.layout(900); n.setMood(mood("working")); return n; };

  it("opens with a shooting star", () => {
    expect((openNight() as unknown as NightInner).streak).not.toBeNull();
  });
  it("holds the sky still while waiting", () => {
    const n = openNight();
    advance(n, 1);
    n.setMood(mood("waiting"));
    const d = (n as unknown as NightInner).drift;
    advance(n, 2);
    expect((n as unknown as NightInner).drift).toBe(d);
  });
});

describe("opening a thread that is not running", () => {
  it("shows no fish or shooting star", () => {
    const s = make(sea); s.setMood(mood("error")); s.layout(900);
    expect((s as unknown as SeaInner).fish).toBeNull();
    const n = make(night); n.setMood(mood("waiting")); n.layout(900);
    expect((n as unknown as NightInner).streak).toBeNull();
  });
});

describe("a new one each time", () => {
  it("moves to a different scene on every run", () => {
    const order = Array.from({ length: 20 }, (_, i) => sceneFor("thr_x", "each-run", i + 1).id);
    for (let i = 1; i < order.length; i++) expect(order[i]).not.toBe(order[i - 1]);
  });
});
