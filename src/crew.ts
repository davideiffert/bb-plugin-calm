// A thread's crew: its active child threads, shown as extra members of the
// scene (sheep, boats, stars).
import type { MoodKind } from "./mood";

export interface CrewMember {
  id: string;
  kind: MoodKind;
  title: string;
  /** When the child's current run started (epoch ms), if known. */
  since?: number | null;
}

/** Kinds that keep a child on its parent's strip. */
export const ON_STRIP: ReadonlySet<MoodKind> = new Set(["working", "waiting", "rate", "error"]);

const COLORS = ["#e5484d", "#3e9ced", "#f5a524", "#30a46c", "#8e4ec6", "#e93d82"];

/** A stable tag color for a child thread. */
export function crewColor(id: string): string {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return COLORS[(h >>> 0) % COLORS.length];
}

/** Thread items that are agent actions; each completed one counts as a step. */
export const STEP_ITEMS: ReadonlySet<string> = new Set([
  "commandExecution", "fileChange", "fileRead", "toolCall", "search", "webSearch", "webFetch",
  "imageView", "imageGeneration", "delegation", "backgroundTask",
]);

export interface HelperAlert {
  waiting: number;
  failed: number;
  /** "1 helper is waiting on you", "2 helpers failed", or both joined. */
  text: string;
  /** The helper a tap opens: the first one waiting on you, else the first that failed. */
  target: CrewMember;
  /** Everyone the alert is about, waiting first, then failed. */
  members: CrewMember[];
}

/** A failed helper stays on the alert until you open it (or it runs again). */
export const failureKey = (m: CrewMember) => `${m.id}:${m.since ?? ""}`;

export function helperAlert(crew: readonly CrewMember[], seenFailures: ReadonlySet<string> = new Set()): HelperAlert | null {
  const waiting = crew.filter((c) => c.kind === "waiting");
  const failed = crew.filter((c) => c.kind === "error" && !seenFailures.has(failureKey(c)));
  if (waiting.length === 0 && failed.length === 0) return null;
  const parts: string[] = [];
  const helpers = (n: number) => `${n} ${n === 1 ? "helper" : "helpers"}`;
  if (waiting.length) parts.push(`${helpers(waiting.length)} ${waiting.length === 1 ? "is" : "are"} waiting on you`);
  if (failed.length) parts.push(parts.length ? `${failed.length} failed` : `${helpers(failed.length)} failed`);
  return { waiting: waiting.length, failed: failed.length, text: parts.join(" · "), target: waiting[0] ?? failed[0], members: [...waiting, ...failed] };
}
