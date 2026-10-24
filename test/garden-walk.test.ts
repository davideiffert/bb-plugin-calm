import { make, type Probe } from "./probe";
import { describe, expect, it } from "vitest";
import { garden } from "../src/scenes/garden";
import type { Mood, MoodKind } from "../src/mood";

const mood = (kind: MoodKind): Mood => ({ kind, turnStartedAt: 0, resetsAt: null, since: 0 });
type Inner = { x: number; dir: 1 | -1; target: number; side: 1 | -1; watering: number; flowers: { x: number }[] };
const inner = (p: Probe) => p as unknown as Inner;

describe("Garden: the gardener walks to his flower", () => {
  // He used to pick the side of the flower to stand on from the way he was
  // walking. Close to the flower that side flipped every frame, so he turned
  // left and right in place and never arrived (David, 2026-10-24).
  it("arrives and waters instead of flickering in place near the flower", () => {
    for (const offset of [-8, -5, -2, 0, 2]) {
      const p = make(garden);
      p.layout(320);
      p.setMood(mood("working"));
      const s = inner(p);
      s.target = 2;
      const flower = s.flowers[2].x;
      s.x = flower + offset;
      s.side = s.flowers[2].x >= s.x + 4 ? 1 : -1;
      s.watering = 0;
      let turns = 0;
      let last = s.dir;
      for (let i = 0; i < 90 && s.watering === 0; i++) {
        p.update(1 / 30);
        if (s.dir !== last) { turns++; last = s.dir; }
      }
      expect(s.watering, `offset ${offset}`).toBeGreaterThan(0);
      expect(turns, `offset ${offset}`).toBeLessThanOrEqual(2);
      // Watering, he faces the flower.
      expect(Math.sign(flower - s.x) || s.dir).toBe(s.dir);
    }
  });
});
