import { describe, expect, it } from "vitest";
import { IDLE, RESUME_MS, nextMood, rateLimitResetsAt, type Mood } from "../src/mood";
import { guessRun, isStale, lockScene, type SceneLock } from "../src/scene-lock";
import { sceneFor } from "../src/scenes";

const run = (events: Parameters<typeof nextMood>[1][], start: Mood = IDLE) =>
  events.reduce((m, e, i) => nextMood(m, e, 10_000 * (i + 1)), start);

describe("nextMood", () => {
  it("starts the turn clock when a run begins and keeps it while waiting", () => {
    const m = run([{ type: "active" }, { type: "pending" }, { type: "resolved" }]);
    expect(m.kind).toBe("working");
    expect(m.turnStartedAt).toBe(10_000);
  });

  it("goes idle the moment a run ends, then a new run restarts the clock", () => {
    expect(run([{ type: "active" }, { type: "idle" }]).kind).toBe("idle");
    const m = run([{ type: "active" }, { type: "idle" }, { type: "active" }]);
    expect(m.kind).toBe("working");
    expect(m.turnStartedAt).toBe(30_000);
  });

  it("keeps the rate-limit detail when the plain failure arrives after it", () => {
    const m = run([{ type: "active" }, { type: "rate-limited", resetsAt: 99 }, { type: "failed" }]);
    expect(m).toMatchObject({ kind: "rate", resetsAt: 99 });
  });

  it("lets the rate-limit detail replace a plain failure", () => {
    const m = run([{ type: "active" }, { type: "failed" }, { type: "rate-limited", resetsAt: 5 }]);
    expect(m).toMatchObject({ kind: "rate", resetsAt: 5 });
  });

  it("keeps an error until the next run", () => {
    const m = run([{ type: "active" }, { type: "failed" }, { type: "resolved" }]);
    expect(m.kind).toBe("error");
    expect(nextMood(m, { type: "active" }, 9).kind).toBe("working");
  });

  it("returns the same object when nothing changes", () => {
    const working = run([{ type: "active" }]);
    expect(nextMood(working, { type: "active" }, 5000)).toBe(working);
  });
});

describe("rateLimitResetsAt", () => {
  it("uses the latest blocked window", () => {
    expect(rateLimitResetsAt([
      { status: "blocked", resetsAtMs: 200 },
      { status: "blocked", resetsAtMs: 500 },
      { status: "allowed", resetsAtMs: 100 },
    ], 0)).toBe(500);
  });
  it("falls back to the soonest future reset, or null", () => {
    expect(rateLimitResetsAt([{ status: "warning", resetsAtMs: 50 }, { status: "allowed", resetsAtMs: 300 }], 100)).toBe(300);
    expect(rateLimitResetsAt([{ status: "unknown", resetsAtMs: null }], 0)).toBeNull();
    expect(rateLimitResetsAt(null, 0)).toBeNull();
  });
});

describe("run counting", () => {
  it("counts a new run only when a thread starts from a stop, never mid-run", () => {
    const m = run([{ type: "active" }, { type: "pending" }, { type: "resolved" }, { type: "active" }]);
    expect(m.run).toBe(1);
    const next = run([{ type: "active" }, { type: "idle" }, { type: "active" }, { type: "failed" }, { type: "active" }]);
    expect(next.run).toBe(3);
  });
});

describe("a new one each time", () => {
  const at = (m: Mood, e: Parameters<typeof nextMood>[1], t: number) => nextMood(m, e, t);

  it("treats a short idle blip between tool batches as the same run", () => {
    let m = at(IDLE, { type: "active" }, 1_000);
    m = at(m, { type: "idle" }, 20_000);
    m = at(m, { type: "active" }, 20_000 + RESUME_MS - 1);
    expect(m.run).toBe(1);
    expect(m.turnStartedAt).toBe(1_000);
    m = at(m, { type: "idle" }, 60_000);
    m = at(m, { type: "active" }, 60_000 + RESUME_MS + 1);
    expect(m.run).toBe(2);
  });

  it("keeps the run's scene through the close-out and moves on only at the next run", () => {
    const pick = (run: number) => sceneFor("t", "each-run", run);
    let lock: SceneLock | null = null;
    // Run 1 opens on the Pasture.
    lock = lockScene(lock, pick(1), "each-run", false);
    lock = lockScene(lock, pick(1), "each-run", true);
    expect(lock.scene.id).toBe("pasture");
    // The run ends: idle lands before the composer stops. The served mood
    // changed since the run began, so it is not mistaken for a new run.
    expect(isStale(true, "idle:60000:1", "idle:0:0")).toBe(false);
    // Even if a later run number showed up while closing, the scene holds.
    lock = lockScene(lock, pick(2), "each-run", true);
    expect(lock.scene.id).toBe("pasture");
    // Fully closed, then the next run starts: the Sea.
    lock = lockScene(lock, pick(2), "each-run", false);
    expect(lock.scene.id).toBe("sea");
  });

  it("still switches right away when the setting changes", () => {
    const lock = lockScene({ scene: sceneFor("t", "pasture"), choice: "pasture" }, sceneFor("t", "night"), "night", true);
    expect(lock.scene.id).toBe("night");
  });

  it("guesses the same run when the composer restarts right after a blip", () => {
    const idle: Mood = { ...IDLE, since: 50_000, run: 4, lastStart: 10_000 };
    expect(guessRun(idle, 1_000, 51_000)).toMatchObject({ run: 4, turnStartedAt: 10_000 });
    expect(guessRun(idle, RESUME_MS + 1, 60_000)).toMatchObject({ run: 5, turnStartedAt: 60_000 });
  });
});
