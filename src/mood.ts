// What the strip should show for one thread, derived from bb's thread
// lifecycle events. Pure functions so the rules are easy to test.

export type MoodKind = "idle" | "working" | "waiting" | "rate" | "error";

export interface Mood {
  kind: MoodKind;
  /** When the current turn started (epoch ms). Drives the evening light. */
  turnStartedAt: number | null;
  /** When a rate limit lifts (epoch ms), if the provider said. */
  resetsAt: number | null;
  /** When this mood was entered (epoch ms). */
  since: number;
  /** How many runs this thread has started (drives "a new one each time"). */
  run?: number;
  /** While idle: when the run that just ended started, in case it resumes. */
  lastStart?: number | null;
  /**
   * Scenes shown always, between runs: the strip hands the scene a "working"
   * mood so it plays on, with this set so a scene can show itself at rest.
   */
  resting?: boolean;
}

export type MoodEvent =
  | { type: "active" }
  | { type: "pending" }
  | { type: "resolved" }
  | { type: "idle" }
  | { type: "failed" }
  | { type: "rate-limited"; resetsAt: number | null };

export const IDLE: Mood = { kind: "idle", turnStartedAt: null, resetsAt: null, since: 0 };

const RUNNING: ReadonlySet<MoodKind> = new Set(["working", "waiting"]);

/**
 * An agent can go idle for a moment between batches of tool calls. Going
 * active again this soon after is the same run: it keeps its scene and clock.
 */
export const RESUME_MS = 5000;

export function nextMood(mood: Mood, event: MoodEvent, now: number): Mood {
  const at = (kind: MoodKind, extra: Partial<Mood> = {}): Mood => ({
    kind,
    turnStartedAt: mood.turnStartedAt,
    resetsAt: null,
    since: now,
    run: mood.run ?? 0,
    ...extra,
  });
  switch (event.type) {
    case "active":
      if (mood.kind === "working") return mood;
      if (mood.kind === "idle" && mood.lastStart != null && now - mood.since < RESUME_MS) {
        return at("working", { turnStartedAt: mood.lastStart });
      }
      // A new run starts only from a stop, never on the way back from waiting.
      return RUNNING.has(mood.kind)
        ? at("working")
        : at("working", { turnStartedAt: now, run: (mood.run ?? 0) + 1 });
    case "pending":
      return mood.kind === "waiting" ? mood : at("waiting", { turnStartedAt: mood.turnStartedAt ?? now });
    case "resolved":
      return mood.kind === "waiting" ? at("working") : mood;
    case "idle":
      if (mood.kind === "idle") return mood;
      return at("idle", { turnStartedAt: null, lastStart: RUNNING.has(mood.kind) ? mood.turnStartedAt : null });
    case "failed":
      // turn.failed can arrive after thread.failed with the rate-limit detail;
      // never let a plain failure overwrite it.
      return mood.kind === "rate" ? mood : at("error", { turnStartedAt: null });
    case "rate-limited":
      return at("rate", { turnStartedAt: null, resetsAt: event.resetsAt });
  }
}


interface RateLimitWindow {
  status: string;
  resetsAtMs: number | null;
}

/**
 * When the user can expect the limit to lift. A blocked window decides it;
 * with several blocked, the last to reset. Otherwise the soonest future reset.
 */
export function rateLimitResetsAt(
  windows: readonly RateLimitWindow[] | null | undefined,
  now: number,
): number | null {
  if (!windows) return null;
  const blocked = windows
    .filter((w) => w.status === "blocked" && w.resetsAtMs !== null)
    .map((w) => w.resetsAtMs as number);
  if (blocked.length > 0) return Math.max(...blocked);
  const future = windows
    .map((w) => w.resetsAtMs)
    .filter((t): t is number => t !== null && t > now);
  return future.length > 0 ? Math.min(...future) : null;
}
