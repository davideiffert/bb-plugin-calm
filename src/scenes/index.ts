import { night } from "./night";
import { pasture } from "./pasture";
import { sea } from "./sea";
import type { Scene } from "./types";

/** Every scene the plugin ships, in the order the settings page lists them. */
export const SCENES: readonly Scene[] = [pasture, sea, night];

/**
 * The scene for a thread. A scene id picks that scene. "each-thread" hashes
 * the thread id, so a thread always keeps its scene. Anything else falls back
 * to the Pasture.
 */
export function sceneFor(threadId: string, choice: unknown, run = 0): Scene {
  const named = SCENES.find((s) => s.id === choice);
  if (named) return named;
  // "each-run": the next scene in order on every new run of the thread, so
  // two runs in a row never share a scene. Run 1 is the Pasture.
  if (choice === "each-run") return SCENES[(Math.max(1, run) - 1) % SCENES.length];
  if (choice !== "each-thread") return pasture;
  let h = 2166136261;
  for (let i = 0; i < threadId.length; i++) h = Math.imul(h ^ threadId.charCodeAt(i), 16777619);
  return SCENES[(h >>> 0) % SCENES.length];
}
