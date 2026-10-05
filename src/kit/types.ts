import type { CrewMember } from "../crew";
import type { Mood } from "../mood";
import type { AlertSpec } from "./alert";
import type { Motion } from "./common";

/** When a rare surprise may start (one per thread; see SurpriseClock). */
export interface SurpriseTimer { tick(dt: number, kind: string, reduced: boolean, busy: boolean): boolean }
/** When a gag may start, and which one (one per thread; see GagClock). */
export interface GagTimer extends SurpriseTimer {
  pick(sceneId: string, n: number): number;
  played(sceneId: string, i: number): void;
}

export type ThemeMode = "light" | "dark";

export interface DrawContext {
  /** Strip width in CSS pixels. */
  width: number;
  /** Canvas pixels per CSS pixel. The strip draws at 1 and lets the browser scale up. */
  dpr: number;
  theme: ThemeMode;
  /** A theme color for quiet details (ground line, small text). */
  muted: string;
  reducedMotion: boolean;
  now: number;
  /** Minutes from the start of a turn to full dusk (the evening setting). */
  duskMinutes: number;
  /** CSS pixels per art pixel; scenes default to 3. Previews draw smaller. */
  scale?: number;
}

/**
 * What sits under a point on the strip. `lead` is the dog, the boat, or the
 * moon; `member` is one of the crew; `flock` is a plain sheep or star.
 * `x` and `y` are where a tooltip should point, in CSS pixels.
 */
export interface Hit {
  target: "lead" | "member" | "flock";
  id?: string;
  x: number;
  y: number;
}

/** One running scene for one thread. */
export interface SceneInstance {
  setMood(mood: Mood): void;
  /** The thread's active child threads. */
  setCrew(crew: readonly CrewMember[]): void;
  /** The agent took a step. The scene decides how often to react. */
  step(): void;
  /** Advance the simulation by `dt` seconds. */
  update(dt: number): void;
  draw(ctx: CanvasRenderingContext2D, view: DrawContext): void;
  /** What is under a point, in CSS pixels from the strip's top left. */
  hit(x: number, y: number): Hit | null;
  /** A tap landed on this: play the little reaction. Purely visual. */
  poke(hit: Hit): void;
  /** Start the scene's rare surprise now (used by previews and tests). */
  surprise(): void;
  /**
   * Play one of the scene's gags now (the gallery and tests use this): the
   * one named `id`, or the next in its rotation. Only while working, never
   * with reduced motion. Returns whether one started.
   */
  gag(id?: string): boolean;
  /** The ids of the scene's gags, in order. */
  gagIds(): string[];
  /** How often the scene needs a new frame right now. */
  motion(): Motion;
  /** Where the main character (dog, boat, moon) is, in CSS px from the left. */
  focusX(): number;
}

export interface Scene {
  id: string;
  name: string;
  /** Strip height in CSS pixels. */
  height: number;
  /**
   * A new running scene. Pass the thread's own surprise clock so rare
   * surprises keep their timing across runs and scene changes.
   */
  create(opts?: { surprises?: SurpriseTimer; gags?: GagTimer }): SceneInstance;
  /** How the scene draws the helper alert's mini scene. */
  alert: AlertSpec;
}
