// Tests look inside a running scene: one object that answers with the
// scene's own state (sheep, fish, streak) and the kit's (crew, mood, t).
import type { Scene, SceneInstance } from "../src/kit/types";

export type Probe = SceneInstance & { layout(cssWidth: number, scale?: number): void } & Record<string, any>;

export function make(scene: Scene): Probe {
  const inst = scene.create() as SceneInstance & { state: Record<string, unknown>; lastStep: number };
  return new Proxy(inst, {
    get(target, prop) {
      if (prop === "lastFish" || prop === "lastStreak" || prop === "lastHop") return (target as any).lastStep;
      const state = target.state;
      if (typeof prop === "string" && prop in state && !(prop in target)) return state[prop];
      const v = (target as any)[prop];
      return typeof v === "function" ? v.bind(target) : v;
    },
    set(target, prop, value) {
      const state = target.state;
      if (typeof prop === "string" && prop in state && !(prop in target)) state[prop] = value;
      else (target as any)[prop] = value;
      return true;
    },
  }) as unknown as Probe;
}
