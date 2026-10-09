import { balloons } from "./balloons";
import { garden } from "./garden";
import { night } from "./night";
import { pasture } from "./pasture";
import { pond } from "./pond";
import { sea } from "./sea";
import { train } from "./train";
import { seeded } from "../kit/common";
import { campfire } from "./campfire";
import { underwater } from "./underwater";
import { village } from "./village";
import { mountain } from "./mountain";
import { kites } from "./kites";
import { desert } from "./desert";
import { city } from "./city";
import { lighthouse } from "./lighthouse";
import { space } from "./space";
import type { Scene } from "../kit/types";

/** Every scene the plugin ships, in the order the settings page lists them. */
export const SCENES: readonly Scene[] = [pasture, sea, night, balloons, pond, train, garden, campfire, underwater, village, mountain, kites, desert, city, lighthouse, space];

const hash = (text: string) => {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
};

/**
 * "A new one each time" as a shuffled bag: every scene shows once, in a
 * random order, before any repeats, and a new bag never starts with the
 * scene the last one ended on. The order comes from the thread id and the
 * bag number, so it needs no storage and every window agrees.
 */
export function bagIndex(threadId: string, run: number, n: number): number {
  if (n <= 1) return 0;
  const r = Math.max(1, run) - 1;
  if (n === 2) return (hash(threadId) + r) % 2;   // two scenes simply alternate
  const shuffled = (bag: number) => {
    const rnd = seeded((hash(threadId) ^ Math.imul(bag + 1, 2654435761)) >>> 0);
    const order = Array.from({ length: n }, (_, i) => i);
    for (let i = n - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
    return order;
  };
  const bag = Math.floor(r / n);
  const order = shuffled(bag);
  // Swapping the first two never moves the last, so the previous bag's last scene is its shuffle's last.
  if (bag > 0 && order[0] === shuffled(bag - 1)[n - 1]) [order[0], order[1]] = [order[1], order[0]];
  return order[r % n];
}

/**
 * The scene for a thread. A scene id picks that scene. "each-thread" hashes
 * the thread id, so a thread always keeps its scene. "each-run" draws from a
 * shuffled bag on every new run. "each-project" hashes the project id, so
 * every thread of a project shares one scene (the thread id stands in until
 * the project is known). All draw only from scenes not `excluded` from the
 * random mix. Anything else falls back to the Pasture.
 */
export function sceneFor(threadId: string, choice: unknown, run = 0, excluded: readonly string[] = [], projectId: string | null = null): Scene {
  const named = SCENES.find((s) => s.id === choice);
  if (named) return named;
  // The random choices draw from the mix: every scene not left out.
  const kept = SCENES.filter((s) => !excluded.includes(s.id));
  const mix = kept.length ? kept : SCENES;
  if (choice === "each-run") return mix[bagIndex(threadId, run, mix.length)];
  if (choice === "each-project") return mix[hash(projectId ?? threadId) % mix.length];
  if (choice !== "each-thread") return pasture;
  return mix[hash(threadId) % mix.length];
}
