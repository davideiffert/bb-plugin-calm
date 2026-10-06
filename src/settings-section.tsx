// Calm's settings section: scene tiles with live previews drawn by the real
// scene code, and an evening control over a small dusk strip.
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Mood } from "./mood";
import { useReducedMotion } from "./motion";
import { useThemeMode } from "./compat";
import { SCENES, sceneFor } from "./scenes";
import { SUN, beginFrame, endFrame, sprite, sunColor } from "./kit/common";
import { runOnClock } from "./clock";
import { GlowLayer } from "./glow";
import type { Scene, SceneInstance, ThemeMode } from "./kit/types";
import { EVENING_CHOICES, type Feature, type SceneChoice, type SceneId } from "./settings";
import { usePrefs } from "./use-prefs";

const STEP_EVERY = 2.4;   // seconds between pretend agent steps in a preview
const PREVIEW_SCALE = 2;  // thumbnails: smaller pixels, still whole numbers so they stay crisp
const PREVIEW_HEIGHT = 16 * PREVIEW_SCALE;

const CAPTIONS: Record<string, string> = {
  pasture: "A sheep hops the stile on each step.",
  sea: "A fish jumps on each step.",
  night: "A shooting star on each step.",
  balloons: "The burner flares on each step.",
  pond: "A frog leaps to a lily pad on each step.",
  train: "A puff of steam on each step.",
  garden: "A flower blooms on each step.",
  campfire: "Sparks fly up on each step.",
  underwater: "A clam shows its pearl on each step.",
  village: "A snowball flies on each step.",
  mountain: "A marmot pops up on each step.",
  kites: "The kite loops the loop on each step.",
  desert: "A dash in a puff of dust on each step.",
  city: "A window lights up on each step.",
  lighthouse: "A wave crashes on the rocks on each step.",
  space: "A slow somersault on each step.",
};

// What every preview shares: the theme and motion setting, kept current by
// the settings section.
const view = { theme: "light" as ThemeMode, reduced: false, muted: "#888" };

/**
 * A tile preview, drawn by the real scene code on the shared clock. It
 * animates only while `live` (the tile under the pointer, focused, or
 * chosen); otherwise it shows one still frame, mid-action, and costs nothing.
 * Tiles out of view get no frames at all. Given `cycle`, it plays the scenes
 * in turn, each for `cycle` seconds, the way "a new one each time" changes
 * scene on every run.
 */
function ScenePreview({ scene, cycle, onTurn, live = true }: { scene: Scene | readonly Scene[]; cycle?: number; onTurn?: (i: number) => void; live?: boolean }) {
  const liveRef = useRef(live);
  liveRef.current = live;
  const runRef = useRef<{ wake(): void } | null>(null);
  useEffect(() => { runRef.current?.wake(); }, [live]);
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
    let stillWidth = 0;   // the width the still frame was drawn at
    const glow = skyRef.current ? new GlowLayer(skyRef.current, 0) : null;
    const run = runOnClock(wrap, (dt) => {
      const W = Math.max(60, Math.floor(wrap.clientWidth / PREVIEW_SCALE));
      const cw = W * PREVIEW_SCALE;
      if (canvas.width !== cw || canvas.height !== PREVIEW_HEIGHT) { canvas.width = cw; canvas.height = PREVIEW_HEIGHT; canvas.style.width = `${cw}px`; }
      if (!liveRef.current && !cycle) {
        // Not live: one still frame, mid-action, then nothing until it goes live.
        if (stillWidth === cw) return "still";
        stillWidth = cw;
        for (let i = 0; i < 45; i++) inst.update(1 / 30);
        if (!view.reduced) { inst.step(); for (let i = 0; i < 6; i++) inst.update(1 / 30); }
        beginFrame();
        inst.draw(ctx, { width: cw, dpr: 1, theme: view.theme, muted: view.muted, reducedMotion: view.reduced, now: Date.now(), duskMinutes: 40, scale: PREVIEW_SCALE });
        glow?.update(endFrame().glow, cw, PREVIEW_HEIGHT, inst.focusX(), 0, true);
        return "still";
      }
      stillWidth = 0;
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
    runRef.current = run;
    previewClocks.add(run);
    return () => { run.stop(); previewClocks.delete(run); runRef.current = null; };
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

/** The "a new one each time" preview: one sample order from the shuffled bag, in turn. */
function CyclePreview({ reduced, excluded }: { reduced: boolean; excluded: readonly string[] }) {
  const [turn, setTurn] = useState(0);
  const key = excluded.join(",");
  const bag = useMemo(() => {
    const mix = SCENES.filter((s) => !excluded.includes(s.id));
    return mix.map((_, i) => sceneFor("preview", "each-run", i + 1, excluded));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  if (reduced) return <ScenePreview scene={bag[0]} live={false} />;
  return (
    <span className="calm-cycle">
      <ScenePreview key={key} scene={bag} cycle={4} onTurn={setTurn} />
      <span className="calm-cycle-now" aria-hidden="true">Now: {bag[turn % bag.length]?.name}</span>
    </span>
  );
}

/** One card action at a time: pick a fixed scene, or edit the mix. */
function SceneTile({ scene, chosen, inMix, editing, onPick, onMix }: {
  scene: Scene; chosen: boolean; inMix: boolean; editing: boolean; onPick: () => void; onMix: () => void;
}) {
  const [hover, setHover] = useState(false);
  const contents = <>
    <span className="calm-scene-name">
      <span>{scene.name}{chosen && !editing && <span className="calm-tile-check" aria-hidden="true"> ✓</span>}</span>
      {editing ? <input type="checkbox" checked={inMix} aria-label={`${scene.name} in the mix`} onChange={onMix} /> : !inMix && <span className="calm-mix-tag">Not in the mix</span>}
    </span>
    <ScenePreview scene={scene} live={hover || chosen} />
    <span className="calm-scene-caption">{CAPTIONS[scene.id] ?? ""}</span>
  </>;
  return (
    <div className={`calm-scene${chosen ? " calm-scene-chosen" : ""}${!inMix ? " calm-scene-excluded" : ""}`} onPointerEnter={() => setHover(true)} onPointerLeave={() => setHover(false)}>
      {editing ? <label className="calm-scene-pick" onFocus={() => setHover(true)} onBlur={() => setHover(false)}>{contents}</label> :
        <button type="button" className="calm-scene-pick" aria-pressed={chosen} onClick={onPick} onFocus={() => setHover(true)} onBlur={() => setHover(false)}>{contents}</button>}
    </div>
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
  ["crew", "Crew in scenes", "Child threads join the scene as small figures in their own colors."],
  ["alert", "Helper alert", "A small scene when a helper waits on you or fails while the main agent rests."],
  ["surprises", "Rare surprises", "Now and then on long runs, a rare visitor: a fox, a whale, a heron."],
  ["gags", "Little gags", "Every few minutes of work, a short silly moment: a sheep sneezes, the cat nudges a flowerpot."],
  ["taps", "Tap reactions", "Tap a creature in the scene for a small silent reaction."],
  ["ambient", "Time of day and seasons", "The light follows your clock, and each season adds a touch."],
  ["header", "Thread header control", "A small button in each thread to turn Calm off there or pin a scene."],
  ["still", "Still pictures", "Every scene shows a still picture of its moment, with no motion, whatever your system's motion setting."],
];

export function CalmSettings() {
  const { prefs, save } = usePrefs();
  const theme: ThemeMode = useThemeMode();
  const reduced = useReducedMotion(prefs.features.still);
  const mutedRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(false);
  const editRef = useRef<HTMLButtonElement>(null);
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
  const mix = SCENES.filter((s) => !prefs.excluded.includes(s.id as SceneId));
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
    <div className="calm-settings" ref={mutedRef} onKeyDown={(e) => { if (editing && e.key === "Escape") { e.preventDefault(); e.stopPropagation(); setEditing(false); editRef.current?.focus(); } }}>
      <div className="calm-tiles" role="group" aria-label="Scene">
        {tile(
          "each-run",
          "A new scene each run",
          <CyclePreview reduced={reduced} excluded={prefs.excluded} />,
          "Every new run draws the next scene from the mix. Each scene shows once before any repeats, and it never changes mid-run.",
        )}
        {tile(
          "each-thread",
          "One scene per thread",
          <span className="calm-trio">{mix.slice(0, 3).map((s) => <ScenePreview key={s.id} scene={s} live={false} />)}</span>,
          "Each thread draws one scene from the mix and keeps it, run after run.",
        )}
      </div>
      <div className="calm-heading-row">
        <span className="calm-sub">{editing ? "Tap a scene to keep it in the mix or leave it out." : "Or always show one scene."}</span>
        <span className="calm-mix-actions">
          <span className="calm-sub" aria-live="polite">{mix.length} of {SCENES.length} scenes in the mix</span>
          <button ref={editRef} type="button" className="calm-edit-mix" aria-pressed={editing} onClick={() => setEditing((e) => !e)}>{editing ? "Done" : "Edit mix"}</button>
        </span>
      </div>
      <div className="calm-grid" role="group" aria-label={editing ? "Scenes in the mix" : "Scenes"}>
        {SCENES.map((s) => (
          <SceneTile
            key={s.id}
            scene={s}
            chosen={prefs.scene === s.id}
            inMix={!prefs.excluded.includes(s.id as SceneId)}
            editing={editing}
            onPick={() => choose({ scene: s.id as SceneChoice })}
            onMix={() => { if (mix.length === 1 && !prefs.excluded.includes(s.id as SceneId)) { setError("Keep at least one scene in the mix."); return; } choose({ excluded: prefs.excluded.includes(s.id as SceneId) ? prefs.excluded.filter((x) => x !== s.id) : [...prefs.excluded, s.id as SceneId] }); }}
          />
        ))}
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
