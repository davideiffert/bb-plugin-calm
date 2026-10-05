import { make, type Probe } from "./probe";
import { describe, expect, it } from "vitest";
import { pasture } from "../src/scenes/pasture";
import type { Mood, MoodKind } from "../src/mood";

const mood = (kind: MoodKind): Mood => ({ kind, turnStartedAt: 0, resetsAt: null, since: 0 });
type Inner = { sheep: { x: number; tx: number; hop: unknown }[]; penX: number; fenceX: number };
const inner = (p: Probe) => p as unknown as Inner;

function field(kind: MoodKind = "working") {
  const p = make(pasture);
  p.layout(900);
  p.setMood(mood(kind));
  return p;
}
const advance = (p: Probe, seconds: number) => { for (let t = 0; t < seconds; t += 1 / 30) p.update(1 / 30); };

describe("Pasture", () => {
  it("sends one sheep over the stile per step, and ignores a burst", () => {
    const p = field();
    const before = inner(p).sheep.map((s) => s.tx);
    p.step(); p.step(); p.step();
    const changed = inner(p).sheep.filter((s, i) => s.tx !== before[i]);
    expect(changed).toHaveLength(1);
  });

  it("freezes everyone while waiting on the user", () => {
    const p = field();
    advance(p, 1);
    p.setMood(mood("waiting"));
    advance(p, 1);   // let any hop in the air land
    const xs = inner(p).sheep.map((s) => s.x);
    advance(p, 5);
    expect(inner(p).sheep.map((s) => s.x)).toEqual(xs);
  });

  it("starts every run mid-scene: spread out, moving, nobody in the pen", () => {
    const p = field("rate");
    advance(p, 10);                    // flock penned during the rate limit
    p.setMood(mood("working"));
    const { sheep, penX, fenceX } = inner(p);
    expect(sheep.every((s) => s.x < penX - 4)).toBe(true);
    expect(sheep.some((s) => s.x < fenceX) && sheep.some((s) => s.x > fenceX)).toBe(true);
    expect(sheep.filter((s) => Math.abs(s.tx - s.x) >= 0.5).length).toBeGreaterThan(0);
  });

  it("puts the first hop in the air within about a second of the first step", () => {
    const p = field();
    p.step();
    let hopped = false;
    for (let t = 0; t < 1.5 && !hopped; t += 1 / 30) { p.update(1 / 30); hopped = inner(p).sheep.some((s) => s.hop); }
    expect(hopped).toBe(true);
  });

  it("uses a smaller flock on a phone-width strip", () => {
    const p = make(pasture);
    p.layout(300);
    expect(inner(p).sheep).toHaveLength(2);
  });
});

describe("Pasture waiting", () => {
  it("sits the dog in plain view, clear of every sheep", () => {
    const p = field();
    advance(p, 3);
    p.setMood(mood("waiting"));
    advance(p, 6);
    const { sheep } = inner(p);
    const dog = (p as unknown as { dog: { x: number } }).dog.x;
    expect(sheep.every((s) => s.x + 13 < dog || s.x > dog + 11)).toBe(true);
  });
});
