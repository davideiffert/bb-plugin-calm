// Which scene a strip draws. With "a new one each time" the run number picks
// it, but the strip holds on to the scene it opened with until it has fully
// closed, so the close-out never shows the next run's scene.
import { RESUME_MS, type Mood } from "./mood";
import type { Scene } from "./kit/types";

export interface SceneLock {
  scene: Scene;
  choice: unknown;
  /** The run the scene belongs to, and whether that run has stopped (error or rate limit). */
  run?: number;
  stopped?: boolean;
}

/**
 * `shown` is true from the moment the strip is on screen until its closing
 * ease ends. A new scene is taken while hidden, when the user picks a
 * different scene setting, or when a new run starts on a strip that stayed up
 * after its last run ended (an error, a rate limit, or a helper alert).
 */
export function lockScene(prev: SceneLock | null, wanted: Scene, choice: unknown, shown: boolean, mood?: Mood): SceneLock {
  const run = mood?.run ?? 0;
  // Stopped: the run ended but the strip may stay up (an error, a rate limit,
  // or a helper alert while the main agent is idle).
  const stopped = mood?.kind === "error" || mood?.kind === "rate" || mood?.kind === "idle";
  const restarted = !!prev?.stopped && run > (prev.run ?? 0) && !stopped;
  if (prev && shown && prev.choice === choice && !restarted) {
    return prev.run === run && prev.stopped === stopped ? prev : { ...prev, run, stopped };
  }
  return prev && prev.scene === wanted && prev.choice === choice && prev.run === run && prev.stopped === stopped
    ? prev
    : { scene: wanted, choice, run, stopped };
}

/**
 * The run the composer just started, before the plugin's mood says so: the
 * same run if it ended only a moment ago (`idleFor` ms, timed on this device),
 * otherwise the next one.
 */
export function guessRun(served: Mood, idleFor: number, now: number): Mood {
  const resumed = served.kind === "idle" && served.lastStart != null && idleFor < RESUME_MS;
  const run = served.run ?? 0;
  return resumed
    ? { kind: "working", turnStartedAt: served.lastStart ?? now, resetsAt: null, since: now, run }
    : { kind: "working", turnStartedAt: now, resetsAt: null, since: now, run: run + 1 };
}

/**
 * The composer can report a run before the plugin's mood catches up. Treat the
 * served mood as stale only while it is still the very one we had when the
 * composer said a run began; any newer mood (even idle at the end) wins.
 */
export function isStale(isRunning: boolean, servedKey: string, keyAtRunStart: string | null): boolean {
  return isRunning && keyAtRunStart !== null && servedKey === keyAtRunStart;
}
