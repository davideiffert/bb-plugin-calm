// Pre-launch fixes on the client side: surprise timing belongs to the thread,
// not to one scene, and a dismissed failure raises no alert.
import { afterEach, describe, expect, it, vi } from "vitest";
import { SCENES } from "../src/scenes";
import { SurpriseClock } from "../src/kit/common";
import { helperAlert } from "../src/crew";
import { make } from "./probe";

const mood = (kind: "working" | "idle") => ({ kind, turnStartedAt: 0, resetsAt: null, since: 0, run: 1 });
afterEach(() => { vi.restoreAllMocks(); });

describe("rare surprises", () => {
  it("keep their timing across runs that each bring a new scene", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);   // whenever a surprise may come, it comes
    const clock = new SurpriseClock();
    const tick = (dt: number) => clock.tick(dt, "working", false, false);
    // Three minutes of watched work in one run...
    for (let t = 0; t < 180; t++) expect(tick(1)).toBe(false);
    // ...then a new run in a new scene picks up where it left off.
    let fired = false;
    for (let t = 0; t < 70 && !fired; t++) fired = tick(1);
    expect(fired).toBe(true);
  });

  it("a scene given the thread's clock uses it", () => {
    const shared = { calls: 0, tick() { this.calls++; return false; } };
    const s = make({ ...SCENES[0], create: () => SCENES[0].create({ surprises: shared }) } as never);
    s.layout(600);
    s.setMood(mood("working") as never);
    for (let i = 0; i < 10; i++) s.update(1 / 30);
    expect(shared.calls).toBeGreaterThan(0);
  });
});

describe("the helper alert", () => {
  it("skips a failure you have already opened", () => {
    const failed = { id: "a", kind: "error" as const, title: "Build", since: 1 };
    expect(helperAlert([failed])?.failed).toBe(1);
    expect(helperAlert([{ ...failed, dismissed: true }])).toBeNull();
  });
});
