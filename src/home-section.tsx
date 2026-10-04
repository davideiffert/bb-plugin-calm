// Calm on bb's home screen: a wide, still picture of the current scene in
// today's season and the real time of day, with one quiet line about today.
// It moves for a few seconds when the page opens, then holds still, so it
// never competes with typing.
import { useEffect, useRef } from "react";
import { experimental_useCodeTheme } from "@get-bb/plugin-sdk/app";
import { runOnClock } from "./clock";
import { GlowLayer } from "./glow";
import type { Mood } from "./mood";
import { useReducedMotion } from "./motion";
import { SCALE, beginFrame, endFrame } from "./scenes/common";
import type { ThemeMode } from "./scenes/types";
import { homeScene, todayLine } from "./home";
import { useDayStats, usePrefs } from "./use-prefs";

const MOVE_SECONDS = 4;   // the opening moment, then a still picture
export function CalmHome() {
  const { prefs } = usePrefs();
  const stats = useDayStats();
  const theme: ThemeMode = experimental_useCodeTheme().mode;
  const reduced = useReducedMotion();
  const kind = homeScene(prefs, stats);
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const skyRef = useRef<HTMLDivElement>(null);
  const shown = useRef(0);   // seconds of motion already played this page load

  useEffect(() => {
    const wrap = wrapRef.current, canvas = canvasRef.current, ctx = canvas?.getContext("2d");
    if (!wrap || !canvas || !ctx || !prefs.features.home) return;
    const scene = kind.create();
    const now = Date.now();
    // A working mood with no run behind it: the light comes from the clock alone.
    scene.setMood({ kind: "idle", turnStartedAt: null, resetsAt: null, since: now } as Mood);
    scene.setMood({ kind: "working", turnStartedAt: null, resetsAt: null, since: now } as Mood);
    const muted = getComputedStyle(wrap).color;
    const glow = skyRef.current ? new GlowLayer(skyRef.current, 0) : null;
    const run = runOnClock(wrap, (dt) => {
      const W = Math.max(60, Math.floor(wrap.clientWidth / SCALE)), cw = W * SCALE;
      if (canvas.width !== cw || canvas.height !== kind.height) { canvas.width = cw; canvas.height = kind.height; canvas.style.width = `${cw}px`; }
      const moving = !reduced && shown.current < MOVE_SECONDS;
      if (moving) shown.current += dt;
      scene.update(moving ? dt : 0);
      beginFrame();
      scene.draw(ctx, { width: cw, dpr: 1, theme, muted, reducedMotion: reduced || !moving, now: Date.now(), duskMinutes: prefs.evening, scale: SCALE });
      const out = endFrame();
      glow?.update(out.glow, cw, kind.height, scene.focusX(), dt, true);
      return moving ? "fast" : "still";   // still: a check every 30 seconds keeps the light current
    });
    return () => run.stop();
  }, [kind, theme, reduced, prefs.evening, prefs.features.home]);

  if (!prefs.features.home) return null;
  const line = todayLine(stats, kind.id);
  return (
    <div className="calm-home text-muted-foreground" ref={wrapRef}>
      <div className="calm-preview" style={{ height: kind.height }} aria-hidden="true">
        <div ref={skyRef} className="calm-sky" />
        <canvas ref={canvasRef} className="calm-canvas" style={{ height: kind.height }} />
      </div>
      <p className="calm-home-line">{line || " "}</p>
    </div>
  );
}
