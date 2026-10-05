// The helper alert: shown in place of the scene while this thread's main
// agent is idle and one of its helpers (child threads) needs you. Helpers
// that are simply working show nothing here; bb's own child thread bar
// covers them. It is a half-height mini scene in the current scene's style,
// with the words beside it, small and quiet, for screen readers and for
// themes that fold the cards into pills.
import { useEffect, useRef, type MouseEvent, type PointerEvent } from "react";
import { useBbNavigate } from "@get-bb/plugin-sdk/app";
import { runOnClock } from "./clock";
import type { CrewMember, HelperAlert } from "./crew";
import { AlertScene, MAX_FIGURES, VIGNETTE_ROWS, VIGNETTE_SCALE } from "./kit/alert";
import { sceneFor } from "./scenes";
import type { ThemeMode } from "./kit/types";

export const ALERT_HEIGHT = VIGNETTE_ROWS * VIGNETTE_SCALE;

export function HelperAlertRow({ alert, sceneId, theme, reduced, onOpen }: {
  alert: HelperAlert; sceneId: string; theme: ThemeMode; reduced: boolean; onOpen: (m: CrewMember) => void;
}) {
  const navigate = useBbNavigate();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const vignette = useRef<AlertScene | null>(null);
  if (!vignette.current || vignette.current.sceneId !== sceneId) vignette.current = new AlertScene(sceneId, sceneFor("", sceneId).alert);
  const v = vignette.current;
  v.set(alert.members);
  const membersKey = alert.members.map((m) => `${m.id}:${m.kind}`).join(",");

  useEffect(() => {
    const canvas = canvasRef.current, ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const muted = getComputedStyle(canvas).color;
    const run = runOnClock(canvas, (dt) => {
      if (canvas.width !== v.width || canvas.height !== ALERT_HEIGHT) {
        canvas.width = v.width; canvas.height = ALERT_HEIGHT; canvas.style.width = `${v.width}px`;
      }
      v.update(reduced ? 0 : dt);
      v.draw(ctx, theme, muted, reduced);
      return v.motion(reduced);
    });
    return () => run.stop();
  }, [v, membersKey, theme, reduced]);

  const open = (m: CrewMember) => { onOpen(m); navigate.toThread(m.id); };
  // A tap on a figure opens that helper; anywhere else, the first waiting.
  const onClick = (e: MouseEvent) => {
    const c = canvasRef.current;
    const box = c?.getBoundingClientRect();
    const hit = box && e.detail > 0 && e.clientX >= box.left && e.clientX <= box.right ? v.hit(e.clientX - box.left) : null;
    open(hit ?? alert.target);
  };
  // A mouse click opens the helper without taking focus first; keyboard
  // users can still tab to it and press Enter.
  const keepFocus = (e: PointerEvent) => { if (e.pointerType === "mouse") e.preventDefault(); };
  const extra = alert.members.length - Math.min(MAX_FIGURES, alert.members.length);
  return (
    <button
      type="button"
      className={`calm-alert${alert.waiting ? " calm-alert-wait" : ""}${theme === "dark" ? " calm-alert-dark" : ""}`}
      aria-label={`${alert.text}. Open ${alert.target.title}`}
      title={`Open ${alert.target.title}`}
      onPointerDown={keepFocus}
      onClick={onClick}
    >
      <canvas ref={canvasRef} className="calm-alert-art" style={{ height: ALERT_HEIGHT }} aria-hidden="true" />
      {extra > 0 && <span className="calm-alert-more" aria-hidden="true">+{extra}</span>}
      <span className="calm-alert-text">{alert.text}</span>
    </button>
  );
}
