// The gallery's scenes: every shipped scene, plus the guide's example.
import { SCENES } from "@calm/scenes/index";
import { beginFrame, endFrame } from "@calm/kit/common";
import { AlertScene } from "@calm/kit/alert";
import type { CrewMember } from "@calm/crew";
import { snail } from "../../docs/example/snail";

const scenes = [...SCENES, snail];

export const api = {
  scenes,
  beginFrame,
  endFrame,
  alert(sceneId: string) {
    const v = new AlertScene(sceneId, scenes.find((s) => s.id === sceneId)!.alert);
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
