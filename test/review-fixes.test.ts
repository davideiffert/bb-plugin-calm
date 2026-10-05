// Regressions found in the outside review.
import { make, type Probe } from "./probe";
import { describe, expect, it } from "vitest";
import { pasture } from "../src/scenes/pasture";
import { night } from "../src/scenes/night";
import { sceneFor } from "../src/scenes";
import { lockScene } from "../src/scene-lock";
import type { CrewMember } from "../src/crew";
import type { Mood, MoodKind } from "../src/mood";

const mood = (kind: MoodKind, run = 1): Mood => ({ kind, turnStartedAt: 0, resetsAt: null, since: 0, run });
const kid = (id: string, kind: MoodKind): CrewMember => ({ id, kind, title: id });
const advance = (s: { update(dt: number): void }, seconds: number) => { for (let t = 0; t < seconds; t += 1 / 30) s.update(1 / 30); };

describe("review fixes", () => {
  it("Night sky reseats crew stars when the strip narrows instead of crashing", () => {
    const n = make(night);
    n.layout(900);
    n.setMood(mood("working"));
    n.setCrew(["a", "b", "c", "d", "e"].map((id) => kid(id, "working")));
    n.layout(300);   // only three places now
    const crew = (n as unknown as { crew: { slot: number }[] }).crew;
    expect(crew.every((c) => c.slot < 3)).toBe(true);
    expect(() => n.hit(150, 10)).not.toThrow();
  });

  it("a helper that already needs you still walks into the meadow", () => {
    const p = make(pasture);
    p.layout(900);
    p.setMood(mood("working"));
    p.setCrew([kid("w", "waiting")]);
    advance(p, 10);
    const sheep = (p as unknown as { crew: { x: number }[] }).crew[0];
    expect(sheep.x).toBeGreaterThan(10);
  });

  it("\"a new one each time\" moves on when a new run starts after an error", () => {
    const pick = (run: number) => sceneFor("t", "each-run", run);
    let lock = lockScene(null, pick(1), "each-run", true, mood("working", 1));
    lock = lockScene(lock, pick(1), "each-run", true, mood("error", 1));
    expect(lock.scene.id).toBe(pick(1).id);
    lock = lockScene(lock, pick(2), "each-run", true, mood("working", 2));   // strip never closed
    expect(lock.scene.id).toBe(pick(2).id);
  });
});

describe("second review fixes", () => {
  it("Night sky seats more crew stars again when the strip widens", () => {
    const n = make(night);
    n.layout(900);
    n.setMood(mood("working"));
    n.setCrew(["a", "b", "c", "d", "e"].map((id) => kid(id, "working")));
    n.layout(300);
    n.layout(900);
    const crew = (n as unknown as { crew: { leaving: boolean }[] }).crew.filter((c) => !c.leaving);
    expect(crew).toHaveLength(5);
  });

  it("\"a new one each time\" moves on when a new run starts behind a helper alert", () => {
    const pick = (run: number) => sceneFor("t", "each-run", run);
    let lock = lockScene(null, pick(1), "each-run", true, mood("working", 1));
    lock = lockScene(lock, pick(1), "each-run", true, mood("idle", 1));    // run over, alert keeps the strip up
    expect(lock.scene.id).toBe(pick(1).id);
    lock = lockScene(lock, pick(2), "each-run", true, mood("working", 2));
    expect(lock.scene.id).toBe(pick(2).id);
  });

  it("the closing strip keeps its scene when nothing new started", () => {
    const pick = (run: number) => sceneFor("t", "each-run", run);
    let lock = lockScene(null, pick(1), "each-run", true, mood("working", 1));
    lock = lockScene(lock, pick(1), "each-run", true, mood("idle", 1));
    lock = lockScene(lock, pick(1), "each-run", true, mood("working", 1));   // resumed after a short pause
    expect(lock.scene.id).toBe(pick(1).id);
  });
});
