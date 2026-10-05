// Every scene, shipped or new, plays every moment on the kit without trouble
// and keeps the shared rules: a lead to hover, a crew cap with +N, a calm
// idle that costs nothing, and the error and rate overlays placed on the strip.
import { describe, expect, it } from "vitest";
import { SCENES } from "../src/scenes";
import { snail } from "../docs/example/snail";
import { make } from "./probe";
import type { CrewMember } from "../src/crew";
import type { Mood, MoodKind } from "../src/mood";

const mood = (kind: MoodKind): Mood => ({ kind, turnStartedAt: 0, resetsAt: null, since: 0, run: 1 });
const advance = (s: { update(dt: number): void }, seconds: number) => { for (let t = 0; t < seconds; t += 1 / 30) s.update(1 / 30); };
const kids = (n: number, kind: MoodKind = "working"): CrewMember[] => Array.from({ length: n }, (_, i) => ({ id: `k${i}`, kind, title: `k${i}` }));

for (const scene of [...SCENES, snail]) {
  describe(`${scene.name} on the kit`, () => {
    it("caps the crew by the real width, even when helpers arrive before the first frame", () => {
      const s = make(scene);
      s.setMood(mood("working"));
      s.setCrew(kids(12));
      s.layout(900);
      expect(s.crew.length).toBeGreaterThanOrEqual(3);
      expect(s.crew.length + s.crewExtra).toBe(12);
    });

    for (const width of [360, 900]) {
      it(`plays every moment at ${width} CSS px`, () => {
        const s = make(scene);
        s.layout(width);
        s.setMood(mood("idle"));
        s.setMood(mood("working"));
        expect(["fast", "slow"]).toContain(s.motion());
        advance(s, 2);
        s.step(); advance(s, 0.5); s.step(); advance(s, 2);
        s.setCrew(kids(12));
        expect(s.crew.length + s.crewExtra).toBe(12);
        expect(s.crew.length).toBeGreaterThan(0);
        advance(s, 3);
        s.setCrew([...kids(2), { id: "w", kind: "waiting", title: "w" }, { id: "e", kind: "error", title: "e" }]);
        advance(s, 3);
        s.surprise(); advance(s, 1);
        for (const k of ["waiting", "working", "error", "rate", "working"] as MoodKind[]) { s.setMood(mood(k)); advance(s, 2); }
        // Something to hover: the lead is always there.
        const hits: string[] = [];
        for (let x = 0; x < width; x += 3) for (let y = 0; y < 48; y += 3) { const h = s.hit(x, y); if (h) hits.push(h.target); }
        expect(hits).toContain("lead");
        // A tap reaction runs and ends.
        for (let x = 0; x < width; x += 3) { const h = s.hit(x, 30); if (h) { s.poke(h); break; } }
        advance(s, 2);
        // Finished: the crew leaves, and an idle strip stops drawing.
        s.setCrew([]);
        s.setMood(mood("idle"));
        advance(s, 12);   // long enough for a train to come round into view and stop
        expect(s.crew).toHaveLength(0);
        expect(s.motion()).toBe("still");
        const focus = s.focusX();
        expect(focus).toBeGreaterThanOrEqual(0);
        expect(focus).toBeLessThanOrEqual(width);
      });
    }
  });
}
