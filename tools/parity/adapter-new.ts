// The parity harness's view of the working tree (scenes on the kit).
import { SCENES } from "@calm/scenes/index";
import { beginFrame, endFrame } from "@calm/kit/common";
import { AlertScene } from "@calm/kit/alert";
import type { CrewMember } from "@calm/crew";

export const api = {
  scenes: SCENES,
  beginFrame,
  endFrame,
  alert(sceneId: string) {
    const v = new AlertScene(sceneId, SCENES.find((s) => s.id === sceneId)!.alert);
    return {
      set: (m: readonly CrewMember[]) => v.set(m),
      get width() { return v.width; },
      update: (dt: number) => v.update(dt),
      draw: (ctx: CanvasRenderingContext2D, theme: "light" | "dark", muted: string, reduced: boolean) => v.draw(ctx, theme, muted, reduced),
      motion: (reduced: boolean) => v.motion(reduced),
      hit: (x: number) => v.hit(x)?.id ?? null,
    };
  },
};
