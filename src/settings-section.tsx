// Calm's settings section: scene tiles with live previews drawn by the real
// scene code, and an evening control over a small dusk strip.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { experimental_useCodeTheme } from "@get-bb/plugin-sdk/app";
import type { Mood } from "./mood";
import { useReducedMotion } from "./motion";
import { SCENES } from "./scenes";
import { SUN, beginFrame, endFrame, sprite, sunColor } from "./scenes/common";
import { runOnClock } from "./clock";
import { GlowLayer } from "./glow";
import type { Scene, SceneInstance, ThemeMode } from "./scenes/types";
import { EVENING_CHOICES, type Feature, type SceneChoice } from "./settings";
import { usePrefs } from "./use-prefs";

const STEP_EVERY = 2.4;   // seconds between pretend agent steps in a preview
const PREVIEW_SCALE = 2;  // thumbnails: smaller pixels, still whole numbers so they stay crisp
const PREVIEW_HEIGHT = 16 * PREVIEW_SCALE;

const CAPTIONS: Record<string, string> = {
  pasture: "A sheep hops the stile on each step.",
  sea: "A fish jumps on each step.",
  night: "A shooting star on each step.",
};

// What every preview shares: the theme and motion setting, kept current by
// the settings section.
const view = { theme: "light" as ThemeMode, reduced: false, muted: "#888" };

/**
 * A live tile preview, drawn by the real scene code on the shared clock.
 * Given `cycle`, it plays the scenes in turn, each for `cycle` seconds, the
 * way "a new one each time" moves to the next scene on every run.
 */
function ScenePreview({ scene, cycle, onTurn }: { scene: Scene | readonly Scene[]; cycle?: number; onTurn?: (i: number) => void }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const skyRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const wrap = wrapRef.current, canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!wrap || !canvas || !ctx) return;
    const scenes = Array.isArray(scene) ? (scene as readonly Scene[]) : [scene as Scene];
    const insts: SceneInstance[] = scenes.map((sc) => sc.create());
    const start = (i: number) => {
      const now = Date.now();
      const working: Mood = { kind: "working", turnStartedAt: now, resetsAt: null, since: now };
      insts[i].setMood({ ...working, kind: "idle" });
      insts[i].setMood(working);   // a fresh run: it starts mid-scene
    };
    start(0);
    let turn = 0, inst = insts[0];
    let age = 0, nextStep = 0.8 + Math.random();
    const glow = skyRef.current ? new GlowLayer(skyRef.current, 0) : null;
    const run = runOnClock(wrap, (dt) => {
      const W = Math.max(60, Math.floor(wrap.clientWidth / PREVIEW_SCALE));
      const cw = W * PREVIEW_SCALE;
      if (canvas.width !== cw || canvas.height !== PREVIEW_HEIGHT) { canvas.width = cw; canvas.height = PREVIEW_HEIGHT; canvas.style.width = `${cw}px`; }
      age += dt;
      if (cycle && !view.reduced) {
        const t = Math.floor(age / cycle) % insts.length;
        if (t !== turn) { turn = t; inst = insts[t]; start(t); onTurn?.(t); }
      }
      if (!view.reduced && age >= nextStep) { inst.step(); nextStep = age + STEP_EVERY + Math.random(); }
      inst.update(view.reduced ? 0 : dt);
      beginFrame();
      inst.draw(ctx, { width: cw, dpr: 1, theme: view.theme, muted: view.muted, reducedMotion: view.reduced, now: Date.now(), duskMinutes: 40, scale: PREVIEW_SCALE });
      const out = endFrame();
      glow?.update(out.glow, cw, PREVIEW_HEIGHT, inst.focusX(), dt, view.reduced);
      if (cycle && !view.reduced) return "fast";   // keep time for the next turn
      return view.reduced ? "still" : inst.motion();
    });
    previewClocks.add(run);
    return () => { run.stop(); previewClocks.delete(run); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scene, cycle]);
  return (
    <div ref={wrapRef} className="calm-preview" style={{ height: PREVIEW_HEIGHT }} aria-hidden="true">
      <div ref={skyRef} className="calm-sky" />
      <canvas ref={canvasRef} className="calm-canvas" style={{ height: PREVIEW_HEIGHT }} />
    </div>
  );
}
const previewClocks = new Set<{ wake(): void }>();

/** The "a new one each time" preview: the scenes in turn, with a dot for each. */
function CyclePreview({ reduced }: { reduced: boolean }) {
  const [turn, setTurn] = useState(0);
  if (reduced) {
    return (
      <span className="calm-trio calm-cycle-still">
        {SCENES.map((s, i) => (
          <span key={s.id} className="calm-cycle-step">
            <ScenePreview scene={s} />
            {i < SCENES.length - 1 && <span className="calm-cycle-arrow" aria-hidden="true">→</span>}
          </span>
        ))}
      </span>
    );
  }
  return (
    <span className="calm-cycle">
      <ScenePreview scene={SCENES} cycle={4} onTurn={setTurn} />
      <span className="calm-cycle-dots" aria-hidden="true">
        {SCENES.map((s, i) => <span key={s.id} className={i === turn ? "on" : ""}>{s.name}</span>)}
      </span>
    </span>
  );
}

/** A static strip showing the light going from day to full dusk. */
function DuskStrip({ minutes, theme }: { minutes: number; theme: ThemeMode }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const draw = () => {
      const c = ref.current;
      const ctx = c?.getContext("2d");
      if (!c || !ctx) return;
      const dpr = window.devicePixelRatio || 1;
      const width = c.clientWidth, height = 36;
      c.width = Math.round(width * dpr); c.height = Math.round(height * dpr);
      const g = ctx.createLinearGradient(0, 0, c.width, 0);
      const dark = theme === "dark";
      g.addColorStop(0, "rgba(255,150,80,0)");
      g.addColorStop(0.5, `rgba(255,150,80,${dark ? 0.2 : 0.28})`);
      g.addColorStop(1, `rgba(125,95,195,${dark ? 0.45 : 0.32})`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, c.width, c.height);
      // The sun sinking across the strip, then a few stars at full dusk.
      ctx.imageSmoothingEnabled = false;
      const s = 2 * Math.max(1, Math.round(dpr));
      for (let i = 0; i < 5; i++) {
        const e = i / 4;
        const sun = sprite(SUN, { y: sunColor(e) });
        const x = (0.06 + e * 0.78) * c.width;
        const y = (2 + e * 6) * s;
        const rows = Math.max(0, Math.min(sun.height, Math.floor((c.height - 2 * s - y) / s)));
        if (rows > 0) ctx.drawImage(sun, 0, 0, sun.width, rows, Math.round(x), Math.round(y), sun.width * s, rows * s);
      }
      ctx.fillStyle = dark ? "#e8e2ff" : "#8f86c9";
      for (const [fx, fy] of [[0.9, 0.2], [0.95, 0.45], [0.86, 0.35], [0.98, 0.15]]) ctx.fillRect(Math.round(fx * c.width), Math.round(fy * c.height), s, s);
      ctx.fillStyle = dark ? "rgba(255,255,255,0.18)" : "rgba(0,0,0,0.15)";
      ctx.fillRect(0, c.height - s, c.width, s);
    };
    draw();
    const ro = new ResizeObserver(draw);
    if (ref.current) ro.observe(ref.current);
    return () => ro.disconnect();
  }, [theme]);
  return (
    <div className="calm-dusk">
      <canvas ref={ref} aria-hidden="true" />
      <div className="calm-dusk-labels">
        <span>Start</span>
        <span>{minutes / 2} min</span>
        <span>{minutes} min, full dusk</span>
      </div>
    </div>
  );
}

const FEATURE_ROWS: [Feature, string, string][] = [
  ["home", "Home screen", "A still picture of the scene and today's runs on bb's home screen."],
  ["crew", "Crew in scenes", "Child threads join the scene as sheep, boats, or stars."],
  ["alert", "Helper alert", "A small scene when a helper waits on you or fails while the main agent rests."],
  ["surprises", "Rare surprises", "Now and then on long runs, a fox, a whale, or a comet."],
  ["taps", "Tap reactions", "Tap a sheep, boat, or star for a small silent reaction."],
  ["ambient", "Time of day and seasons", "The light follows your clock, and each season adds a touch."],
  ["header", "Thread header control", "A small button in each thread to turn Calm off there or pin a scene."],
];

export function CalmSettings() {
  const { prefs, save } = usePrefs();
  const theme: ThemeMode = experimental_useCodeTheme().mode;
  const reduced = useReducedMotion();
  const mutedRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    view.theme = theme;
    view.reduced = reduced;
    if (mutedRef.current) view.muted = getComputedStyle(mutedRef.current).color;
    for (const c of previewClocks) c.wake();
  }, [theme, reduced]);

  const choose = (change: Parameters<typeof save>[0]) => {
    setError("");
    save(change).catch((e) => setError(e instanceof Error ? e.message : "Could not save. Try again."));
  };
  const tile = (id: SceneChoice, name: string, body: ReactNode, caption: string, wide = false) => (
    <button
      key={id}
      type="button"
      className={`calm-tile${wide ? " calm-tile-wide" : ""}`}
      aria-pressed={prefs.scene === id}
      onClick={() => choose({ scene: id })}
    >
      <span className="calm-tile-name">
        {name}
        {prefs.scene === id && <span className="calm-tile-check" aria-hidden="true">✓</span>}
      </span>
      {body}
      <span className="calm-tile-caption">{caption}</span>
    </button>
  );

  return (
    <div className="calm-settings" ref={mutedRef}>
      <div className="calm-tiles" role="group" aria-label="Scene">
        {SCENES.map((s) => tile(s.id as SceneChoice, s.name, <ScenePreview scene={s} />, CAPTIONS[s.id] ?? ""))}
        {tile(
          "each-thread",
          "A different one each thread",
          <span className="calm-trio">{SCENES.map((s) => <ScenePreview key={s.id} scene={s} />)}</span>,
          "Each thread gets one of the three and always keeps it.",
          true,
        )}
        {tile(
          "each-run",
          "A new one each time",
          <CyclePreview reduced={reduced} />,
          "Every new run moves to the next scene: Pasture, then Sea, then Night sky. Never mid-run.",
          true,
        )}
      </div>

      <div className="calm-features" role="group" aria-labelledby="calm-features-heading">
        <div>
          <div className="calm-heading" id="calm-features-heading">Features</div>
          <div className="calm-sub">Turn any optional piece on or off.</div>
        </div>
        {FEATURE_ROWS.map(([key, name, sub]) => (
          <label key={key} className="calm-feature">
            <input type="checkbox" checked={prefs.features[key]} onChange={(e) => choose({ features: { [key]: e.target.checked } })} />
            <span className="calm-feature-text">
              <span className="calm-feature-name">{name}</span>
              <span className="calm-feature-sub">{sub}</span>
            </span>
          </label>
        ))}
      </div>

      <div className="calm-evening">
        <div>
          <div className="calm-heading">Evening timing</div>
          <div className="calm-sub">How long a run takes to reach full dusk.</div>
        </div>
        <div className="calm-segments" role="radiogroup" aria-label="Evening timing">
          {EVENING_CHOICES.map((m) => (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={prefs.evening === m}
              className="calm-segment"
              onClick={() => choose({ evening: m })}
            >
              {m} min
            </button>
          ))}
        </div>
        <DuskStrip minutes={prefs.evening} theme={theme} />
      </div>
      <p className="calm-status" role="status">{error}</p>
    </div>
  );
}
