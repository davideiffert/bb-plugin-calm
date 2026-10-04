import { describe, expect, it } from "vitest";
import { Pasture } from "../src/scenes/pasture";
import { Sea } from "../src/scenes/sea";
import { Night } from "../src/scenes/night";
import { SurpriseClock, clockEvening, evening, seasonOf } from "../src/scenes/common";
import type { CrewMember } from "../src/crew";
import type { Mood, MoodKind } from "../src/mood";
import type { DrawContext, SceneInstance } from "../src/scenes/types";

const mood = (kind: MoodKind, turnStartedAt: number | null = null): Mood => ({ kind, turnStartedAt, resetsAt: null, since: 0 });
const member = (id: string, kind: MoodKind = "working"): CrewMember => ({ id, kind, title: `Child ${id}` });
const advance = (p: SceneInstance, seconds: number) => { for (let t = 0; t < seconds; t += 1 / 30) p.update(1 / 30); };
const at = (h: number, month = 5) => new Date(2026, month, 10, Math.floor(h), Math.round((h % 1) * 60)).getTime();

describe("time of day and seasons", () => {
  it("is clear by day, dusky by evening, night late, easing back by morning", () => {
    expect(clockEvening(at(12))).toBe(0);
    expect(clockEvening(at(18.5))).toBeCloseTo(0.5);
    expect(clockEvening(at(22))).toBe(1);
    expect(clockEvening(at(3))).toBe(1);
    expect(clockEvening(at(8))).toBe(0);
  });
  it("lets a long run deepen the light from where the clock is", () => {
    const view = { now: at(12), duskMinutes: 40 } as DrawContext;
    expect(evening(mood("working", view.now - 20 * 60000), view)).toBeCloseTo(0.5);
    const night = { now: at(23), duskMinutes: 40 } as DrawContext;
    expect(evening(mood("working", night.now), night)).toBe(1);
  });
  it("reads the season from the month", () => {
    expect(seasonOf(at(12, 0))).toBe("winter");
    expect(seasonOf(at(12, 3))).toBe("spring");
    expect(seasonOf(at(12, 6))).toBe("summer");
    expect(seasonOf(at(12, 9))).toBe("autumn");
  });
});

describe("rare surprises", () => {
  it("never happen while waiting, failed, or with reduced motion, and not in the first minutes", () => {
    const c = new SurpriseClock();
    let any = false;
    for (let i = 0; i < 3600; i++) any ||= c.tick(1, "waiting", false, false) || c.tick(1, "error", false, false) || c.tick(1, "working", true, false);
    expect(any).toBe(false);
    const d = new SurpriseClock();
    for (let i = 0; i < 239; i++) expect(d.tick(1, "working", false, false)).toBe(false);
  });
  it("come at most about once per long session", () => {
    let total = 0;
    for (let run = 0; run < 20; run++) {
      const c = new SurpriseClock();
      for (let i = 0; i < 3600; i++) if (c.tick(1, "working", false, false)) total++;
    }
    expect(total / 20).toBeLessThanOrEqual(2);   // an hour of steady work: one, sometimes two
  });
});

type Crewed = { crew?: { id: string; leaving: boolean }[]; fleet?: { id: string; leaving: boolean }[]; crewExtra?: number; fleetExtra?: number };
const members = (s: SceneInstance) => { const i = s as unknown as Crewed; return (i.crew ?? i.fleet)!; };
const extra = (s: SceneInstance) => { const i = s as unknown as Crewed; return i.crewExtra ?? i.fleetExtra ?? 0; };

for (const [name, make, cap] of [["Pasture", () => new Pasture(), 4], ["Sea", () => new Sea(), 4], ["Night", () => new Night(), 6]] as const) {
  describe(`${name} crew`, () => {
    const scene = () => { const s = make() as SceneInstance & { layout(w: number): void }; s.layout(900); s.setMood(mood("working", Date.now())); return s; };

    it("adds a member per child, caps the count, and counts the rest", () => {
      const s = scene();
      s.setCrew(Array.from({ length: 8 }, (_, i) => member(`c${i}`)));
      expect(members(s).filter((m) => !m.leaving)).toHaveLength(cap);
      expect(extra(s)).toBe(8 - cap);
    });

    it("lets a finished child peel off, then removes it", () => {
      const s = scene();
      s.setCrew([member("a"), member("b")]);
      s.setCrew([member("a")]);
      expect(members(s).find((m) => m.id === "b")?.leaving).toBe(true);
      advance(s, 15);
      expect(members(s).map((m) => m.id)).toEqual(["a"]);
    });

    it("changes nothing when a thread has no children", () => {
      const s = scene();
      s.setCrew([]);
      expect(members(s)).toHaveLength(0);
      expect(extra(s)).toBe(0);
    });
  });
}

describe("taps", () => {
  it("make a tapped sheep say baa and hop in place", () => {
    const p = new Pasture(); p.layout(900); p.setMood(mood("working", Date.now()));
    const sheep = (p as unknown as { sheep: { x: number; baa: number | null; hop: unknown }[] }).sheep;
    const target = sheep[0];
    const hit = p.hit((target.x + 6) * 3, 10 * 3);
    expect(hit?.target).toBe("flock");
    p.poke(hit!);
    expect(target.baa).toBe(0);
    expect(target.hop).not.toBeNull();
  });
  it("ring the boat's bell", () => {
    const s = new Sea(); s.layout(900); s.setMood(mood("working", Date.now()));
    const x = (s as unknown as { x: number }).x;
    const hit = s.hit((x + 7) * 3, 6 * 3);
    expect(hit?.target).toBe("lead");
    s.poke(hit!);
    expect((s as unknown as { bell: number | null }).bell).toBe(0);
  });
});
