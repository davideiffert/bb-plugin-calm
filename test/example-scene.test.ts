// The guide's example scene must keep working on the kit.
import { describe, expect, it } from "vitest";
import { snail } from "../docs/example/snail";
import { make } from "./probe";
import type { Mood, MoodKind } from "../src/mood";

const mood = (kind: MoodKind): Mood => ({ kind, turnStartedAt: 0, resetsAt: null, since: 0 });
const advance = (s: { update(dt: number): void }, seconds: number) => { for (let t = 0; t < seconds; t += 1 / 30) s.update(1 / 30); };

describe("the example scene (docs/example/snail.ts)", () => {
  it("plays every moment on the kit", () => {
    const s = make(snail);
    s.layout(900);
    s.setMood(mood("working"));
    const x0 = s.x;
    advance(s, 2);
    expect(s.x).not.toBe(x0);                // creeping
    s.step();
    expect(s.dew).not.toBeNull();            // a dew drop sparkles
    s.setCrew([{ id: "a", kind: "working", title: "a" }, { id: "b", kind: "waiting", title: "b" }]);
    expect(s.crew).toHaveLength(2);
    const lead = s.hit((s.x + 5) * 3, 10 * 3);
    expect(lead?.target).toBe("lead");
    s.poke(lead!);
    expect(s.motion()).toBe("fast");         // the tap's note
    s.surprise();
    expect(s.butterfly).not.toBeNull();
    s.setMood(mood("waiting"));
    advance(s, 1);
    const x1 = s.x;
    advance(s, 1);
    expect(s.x).toBe(x1);                    // stops while waiting on you
    s.setCrew([]);
    advance(s, 1.5);
    expect(s.crew).toHaveLength(0);          // babies fade out when finished
    expect(snail.alert.layout([{ id: "w", kind: "waiting", title: "w" }]).figures).toHaveLength(1);
  });
});
