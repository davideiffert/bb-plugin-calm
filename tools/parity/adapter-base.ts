// The parity harness's view of the frozen baseline build.
import { SCENES } from "@calm/scenes/index";
import { beginFrame, endFrame } from "@calm/scenes/common";
import { Vignette } from "@calm/helper-vignette";
import type { CrewMember } from "@calm/crew";

export const api = {
  scenes: SCENES,
  beginFrame,
  endFrame,
  alert(sceneId: string) {
    const v = new Vignette(sceneId);
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
