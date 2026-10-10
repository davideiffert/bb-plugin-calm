// bb-plugin-calm frontend: a bare composer banner that draws a small scene
// above the prompt box while the viewed thread, or its crew of child threads,
// has something to show, or all the time when scenes are set to show always.
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent } from "react";
import {
  definePluginApp,
  useComposer,
  useRealtime,
  useRealtimeConnectionState,
  useRpc,
} from "@get-bb/plugin-sdk/app";
import type { CrewSignal, MoodSignal, StepSignal, rpcContract } from "./server";
import { failureKey, helperAlert, type CrewMember } from "./src/crew";
import { IDLE, type Mood } from "./src/mood";
import { sceneFor } from "./src/scenes";
import { guessRun, isStale, lockScene, type SceneLock } from "./src/scene-lock";
import { GagClock, SCALE, SKY_REACH, SurpriseClock, beginFrame, endFrame, formatTime, type Label } from "./src/kit/common";
import { optionalSlot, useThemeMode } from "./src/compat";
import { runOnClock } from "./src/clock";
import { GlowLayer } from "./src/glow";
import { useReducedMotion } from "./src/motion";
import { usePrefs, useThreadPrefs } from "./src/use-prefs";
import { CalmHeaderControl } from "./src/header-control";
import { CalmSettings } from "./src/settings-section";
import { ALERT_HEIGHT, HelperAlertRow } from "./src/crew-alert";
import { IDLE_TURN_MS, everyVisible, idleTurns, nextIdleTurn } from "./src/idle-turns";
import "./src/settings-section.css";
import type { Hit, ThemeMode } from "./src/kit/types";

const EASE_MS = 180;      // the strip opens and closes this fast, so the prompt box eases
const FADE_MS = 400;      // with scenes shown always, a new scene fades in this fast
const FADE_OUT_MS = 200;  // and an idle strip's old scene fades out this fast first
const TAP_TIP_MS = 4000;              // how long a tapped tooltip stays on a touch screen
const WATCH_RENEW_MS = 5 * 60_000;    // the server stops counting a thread's steps 12 minutes after the last renewal
/** A "working" strip whose composer says nothing is running for this long has missed its run-ended event. */
const MISSED_END_MS = 10_000;

/** `projectId` is undefined until the first state read answers, and null if bb did not say. */
interface ThreadState { mood: Mood; steps: number; crew: CrewMember[]; projectId?: string | null }

/** The thread's mood, steps, and crew: fetched on open and on reconnect, then kept live. */
function useThreadState(threadId: string): ThreadState {
  const rpc = useRpc<typeof rpcContract>();
  const connection = useRealtimeConnectionState();
  const [state, setState] = useState<ThreadState>({ mood: IDLE, steps: 0, crew: [] });
  // Set when a live update lands while the opening read is still out; that update is newer.
  const fresher = useRef({ mood: false, crew: false, steps: false });
  useEffect(() => {
    let live = true;
    fresher.current = { mood: false, crew: false, steps: false };
    rpc.call("state_get", { threadId }).then((s) => {
      if (!live) return;
      const f = fresher.current;
      setState((p) => ({ mood: f.mood ? p.mood : s.mood, crew: f.crew ? p.crew : s.crew, steps: f.steps ? p.steps : s.steps, projectId: s.projectId ?? p.projectId ?? null }));
    }, () => {});
    // Keep the server counting this thread's steps while the strip is open.
    const renew = setInterval(() => {
      rpc.call("watch", { threadId }).then((r) => { if (live) setState((p) => ({ ...p, steps: r.steps })); }, () => {});
    }, WATCH_RENEW_MS);
    return () => { live = false; clearInterval(renew); };
  }, [rpc, threadId, connection]);
  useRealtime("mood", (payload) => {
    const s = payload as MoodSignal;
    if (s?.threadId === threadId) { fresher.current.mood = true; setState((p) => ({ ...p, mood: s.mood })); }
  });
  useRealtime("crew", (payload) => {
    const s = payload as CrewSignal;
    if (s?.threadId === threadId) { fresher.current.crew = true; setState((p) => ({ ...p, crew: s.crew })); }
  });
  useRealtime("step", (payload) => {
    const s = payload as StepSignal;
    if (s?.threadId === threadId) { fresher.current.steps = true; setState((p) => ({ ...p, steps: s.steps })); }
  });
  return state;
}

function label(mood: Mood): string {
  switch (mood.kind) {
    case "working": return "Agent working";
    case "waiting": return "Waiting on you";
    case "rate": return mood.resetsAt ? `Rate-limited until ${formatTime(mood.resetsAt)}` : "Rate-limited";
    case "error": return "The last run failed";
    default: return "";
  }
}

const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`;

function duration(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

/** The two short lines a tooltip shows for the lead or a crew member. */
function tipLines(hit: Hit, state: ThreadState, now: number): [string, string] {
  const { mood, steps, crew } = state;
  if (hit.target === "member") {
    const m = crew.find((c) => c.id === hit.id);
    const word = { working: "Working", waiting: "Waiting on you", rate: "Rate-limited", error: "Failed", idle: "Done" }[m?.kind ?? "idle"];
    const title = m?.title ?? "Child thread";
    return [title.length > 40 ? `${title.slice(0, 39)}…` : title, `Child thread · ${word}`];
  }
  const first = mood.kind === "working" ? (mood.turnStartedAt ? `Working ${duration(now - mood.turnStartedAt)}` : "Working")
    : label(mood) || "Agent idle";
  const parts: string[] = [];
  if (mood.kind === "working" || mood.kind === "waiting") parts.push(plural(steps, "step"));
  if (crew.length > 0) parts.push(plural(crew.length, "child thread"));
  if (mood.kind === "rate" && !mood.resetsAt) parts.push("no reset time given");
  return [first, parts.join(" · ")];
}

/** Put a frame's labels on the page, reusing spans and touching only what changed. */
function syncLabels(host: HTMLElement, labels: readonly Label[]) {
  while (host.childElementCount < labels.length) host.appendChild(document.createElement("span"));
  while (host.childElementCount > labels.length) host.lastElementChild!.remove();
  labels.forEach((l, i) => {
    const el = host.children[i] as HTMLElement;
    const tx = l.align === "center" ? "-50%" : l.align === "right" ? "-100%" : "0";
    const ty = l.anchor === "bottom" ? "-100%" : l.anchor === "baseline" ? "-80%" : "0";
    const css = `left:${l.x.toFixed(1)}px;top:${l.y.toFixed(1)}px;transform:translate(${tx},${ty});` +
      `font:${l.weight} ${l.size}px ${l.mono ? "ui-monospace,SFMono-Regular,Menlo,monospace" : "ui-sans-serif,system-ui,sans-serif"};` +
      `opacity:${l.alpha.toFixed(2)}` +
      (l.plate ? ";padding:1px 5px;border-radius:4px;background:var(--background, #fff);color:var(--muted-foreground)" : "");
    if (el.dataset.css !== css) { el.style.cssText = css; el.dataset.css = css; }
    if (el.textContent !== l.text) el.textContent = l.text;
  });
}

/** Failed helpers just opened from the alert, until the server confirms them as dismissed. */
const seenFailures = new Set<string>();
/**
 * Each thread's rare-surprise timing, kept across runs and scene changes so
 * "about once in a long session" holds even when every run brings a new scene.
 */
const surpriseClocks = new Map<string, SurpriseClock>();
/** Each thread's gag timing and rotation, kept the same way. */
const gagClocks = new Map<string, GagClock>();
function clockFor<T>(clocks: Map<string, T>, threadId: string, make: () => T): T {
  let c = clocks.get(threadId);
  if (!c) {
    clocks.set(threadId, (c = make()));
    while (clocks.size > 200) clocks.delete(clocks.keys().next().value!);
  }
  return c;
}
const NO_CREW: CrewMember[] = [];

function CalmStrip() {
  const composer = useComposer();
  const threadId = composer.scope.kind === "thread" ? composer.scope.threadId : null;
  return threadId ? <Strip key={threadId} threadId={threadId} isRunning={composer.isRunning} /> : null;
}

function Strip({ threadId, isRunning }: { threadId: string; isRunning: boolean }) {
  const state = useThreadState(threadId);
  const served = state.mood;
  // The composer knows the instant a run starts; trust it over a stale mood,
  // but only the mood we already had then. At the end of a run the idle mood
  // can land before the composer stops, and it must close the strip, not
  // look like the start of another run.
  const servedKey = `${served.kind}:${served.since}:${served.run ?? 0}`;
  const runStartKey = useRef<string | null>(null);
  const servedSeen = useRef({ key: "", at: 0 });
  if (servedSeen.current.key !== servedKey) servedSeen.current = { key: servedKey, at: Date.now() };
  const wasRunning = useRef(false);
  if (isRunning && !wasRunning.current) runStartKey.current = served.kind === "working" || served.kind === "waiting" ? null : servedKey;
  if (!isRunning) runStartKey.current = null;
  wasRunning.current = isRunning;
  const stale = isStale(isRunning, servedKey, runStartKey.current);
  const guess = useMemo(() => {
    const now = Date.now();
    return stale ? guessRun(served, now - servedSeen.current.at, now) : null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stale]);
  const guessed: Mood = guess ?? served;
  // The safety net for a missed "run ended" event: a strip still saying
  // "working" while the composer has said nothing runs for MISSED_END_MS
  // closes on its own. A new mood from the server opens it again.
  const [endedKey, setEndedKey] = useState<string | null>(null);
  const quiet = guessed.kind === "working" && !isRunning;
  useEffect(() => {
    if (!quiet) return;
    const t = setTimeout(() => setEndedKey(servedKey), MISSED_END_MS);
    return () => clearTimeout(t);
  }, [quiet, servedKey]);
  const own: Mood = quiet && endedKey === servedKey ? { ...guessed, kind: "idle", turnStartedAt: null } : guessed;
  const { prefs } = usePrefs();
  // This thread's own choice from its header: Calm off here, or a pinned scene.
  const { threadPrefs } = useThreadPrefs(threadId);
  const features = prefs.features;
  const crew = features.crew ? state.crew : NO_CREW;
  // While the main agent is idle, helpers that are just working show nothing
  // (bb's child thread bar covers them); one that needs you gets a small alert.
  const [, setSeen] = useState(0);
  const alert = own.kind === "idle" && features.alert ? helperAlert(state.crew, seenFailures) : null;
  const crewOnly = alert !== null;
  const rpc = useRpc<typeof rpcContract>();
  const openHelper = (m: CrewMember) => {
    if (m.kind === "error") {
      seenFailures.add(failureKey(m));
      while (seenFailures.size > 200) seenFailures.delete(seenFailures.values().next().value!);
      setSeen((n) => n + 1);
      // Kept on the server, so it stays gone after a reload or a bb restart.
      rpc.call("failure_dismiss", { threadId: m.id }).catch(() => {});
    }
  };
  // Shown always: between runs the scene plays on as if working, with the
  // light following the local clock alone (no run, so no run-time dusk).
  const always = prefs.show === "always";
  const resting = always && own.kind === "idle" && !crewOnly;
  const mood: Mood = crewOnly ? { kind: "working", turnStartedAt: null, resetsAt: null, since: 0 }
    : resting ? { ...own, kind: "working", turnStartedAt: null } : own;
  const view = { ...state, crew, mood: own };

  const theme: ThemeMode = useThemeMode();
  const reduced = useReducedMotion(features.still);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const skyRef = useRef<HTMLDivElement>(null);
  const clipRef = useRef<HTMLDivElement>(null);
  const choice = threadPrefs.scene ?? prefs.scene;
  // "One scene per project" waits for the project, so the strip never opens
  // on the thread's own scene and then swaps.
  const waiting = choice === "each-project" && state.projectId === undefined;
  const visible = (mood.kind !== "idle" || always) && !threadPrefs.off && !waiting;
  // Mounted while visible or closing; open drives the height ease.
  const [mounted, setMounted] = useState(visible);
  // With "a new one each time", the run number picks the scene. The strip
  // keeps the scene it opened with until it has fully closed.
  const lock = useRef<SceneLock | null>(null);
  // Shown always with "a new one each time", an idle strip moves to the next
  // scene from the mix every few minutes of the page being in view. Never
  // during a run, and never for a fixed scene, a thread's own scene, or a pin.
  const rotating = resting && visible && choice === "each-run";
  const [, setTurned] = useState(0);
  const motionRef = useRef({ rotating, reduced: false });
  motionRef.current.rotating = rotating;
  useEffect(() => {
    if (!rotating) return;
    let live = true;
    const turn = () => { nextIdleTurn(threadId); setTurned((n) => n + 1); };
    const stop = everyVisible(IDLE_TURN_MS, () => {
      const layers = [skyRef.current, clipRef.current].filter((el): el is HTMLDivElement => !!el?.animate);
      if (motionRef.current.reduced || layers.length === 0) { turn(); return; }
      // The old scene fades out, then the new one fades in (below).
      const outs = layers.map((el) => el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: FADE_OUT_MS, easing: "ease-in", fill: "forwards" }));
      outs[0].finished.then(() => {
        if (live && motionRef.current.rotating) turn();
        else for (const a of outs) a.cancel();
      }, () => {});
    });
    return () => { live = false; stop(); };
  }, [rotating, threadId]);
  // Each move takes the bag's next place. Runs count from 1, so a thread that
  // has never run starts on the first run's scene.
  const turns = idleTurns(threadId);
  const place = Math.max(1, own.run ?? 0) + turns;
  // "One scene per project" hashes the project id from the first state read;
  // if bb did not say, the thread stands in.
  const projectId = choice === "each-project" ? state.projectId ?? null : null;
  lock.current = lockScene(lock.current, sceneFor(threadId, choice, place, prefs.excluded, projectId), `${choice}:${turns}:${projectId ?? ""}`, mounted, own);
  const kind = lock.current.scene;
  motionRef.current.reduced = reduced;
  const dusk = prefs.evening;
  const scene = useMemo(() => kind.create({
    surprises: clockFor(surpriseClocks, threadId, () => new SurpriseClock()),
    gags: clockFor(gagClocks, threadId, () => new GagClock()),
  }), [kind, threadId]);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (visible) {
      setMounted(true);
      if (reduced) { setOpen(true); return; }
      // Paint once at zero height so the browser has something to ease from.
      let inner = 0;
      const outer = requestAnimationFrame(() => { inner = requestAnimationFrame(() => setOpen(true)); });
      return () => { cancelAnimationFrame(outer); cancelAnimationFrame(inner); };
    }
    setOpen(false);
    if (reduced) { setMounted(false); return; }
    const t = setTimeout(() => setMounted(false), EASE_MS);
    return () => clearTimeout(t);
  }, [visible, reduced]);

  // Shown always, the strip stays open as the scene changes; the new one fades in.
  const shownKind = useRef(kind);
  useLayoutEffect(() => {
    if (shownKind.current === kind) return;
    shownKind.current = kind;
    const layers = [skyRef.current, clipRef.current];
    for (const el of layers) el?.getAnimations?.().forEach((a) => a.cancel());   // an idle fade-out
    if (!always || !open || reduced) return;
    for (const el of layers) el?.animate?.([{ opacity: 0 }, { opacity: 1 }], { duration: FADE_MS, easing: "ease-out" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind]);

  // bb spaces the rows above the prompt box with a gap. Read it so a closed
  // strip can cancel it and leave no jump when it unmounts.
  const [gap, setGap] = useState(8);
  useLayoutEffect(() => {
    let el = wrapRef.current?.parentElement ?? null;
    while (el && getComputedStyle(el).display === "contents") el = el.parentElement;
    const g = el ? parseFloat(getComputedStyle(el).rowGap) : NaN;
    if (Number.isFinite(g)) setGap(g);
  }, [mounted]);

  // Hand the mood and crew to the scene. A new run starts mid-scene.
  const moodKey = `${mood.kind}:${mood.turnStartedAt}:${mood.resetsAt}:${crewOnly}`;
  useEffect(() => {
    // A helper alert replaces the scene; the scene plays only for the main agent.
    if (visible && !crewOnly) scene.setMood(mood);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scene, moodKey, visible]);   // turning Calm back on for this thread catches up on the mood
  const crewKey = crew.map((c) => `${c.id}:${c.kind}`).join(",");
  useEffect(() => {
    scene.setCrew(crew);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scene, crewKey]);

  useRealtime("step", (payload) => {
    if ((payload as StepSignal)?.threadId === threadId) { scene.step(); clock.current?.wake(); }
  });

  // Hover (or tap, on touch) the dog, boat, moon, or a crew member for details.
  const [tip, setTip] = useState<{ hit: Hit; pinned: boolean } | null>(null);
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!tip) return;
    const every = setInterval(() => setTick((n) => n + 1), 1000);   // keep the working time current
    const away = tip.pinned ? setTimeout(() => setTip(null), TAP_TIP_MS) : 0;
    return () => { clearInterval(every); clearTimeout(away); };
  }, [tip]);
  const [pointer, setPointer] = useState(false);
  const local = (e: PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return scene.hit(e.clientX - r.left, e.clientY - r.top);
  };
  const tipFor = (hit: Hit | null) => (hit && hit.target !== "flock" ? hit : null);
  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    e.preventDefault();   // never take focus from the composer
    const hit = local(e);
    if (hit && features.taps) { scene.poke(hit); clock.current?.wake(); }
    const t = tipFor(hit);
    if (t) setTip({ hit: t, pinned: e.pointerType !== "mouse" });
    else if (tip?.pinned) setTip(null);
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== "mouse") return;
    const hit = local(e);
    setPointer(!!hit);
    const t = tipFor(hit);
    if (t) setTip({ hit: t, pinned: false });
    else if (tip && !tip.pinned) setTip(null);
  };
  const onPointerLeave = () => { setPointer(false); if (tip && !tip.pinned) setTip(null); };
  // Keyboard: focusing the strip shows the main character's details; Escape or leaving hides them.
  const onFocus = () => setTip({ hit: { target: "lead", x: scene.focusX(), y: 12 }, pinned: false });
  const onBlur = () => setTip(null);
  const onKeyDown = (e: { key: string }) => { if (e.key === "Escape") setTip(null); };

  // Frames come from the shared clock. The canvas is drawn at one canvas pixel
  // per CSS pixel and scaled up crisply by the browser; text and the sky are
  // page layers, so they stay sharp and the sky can fade at its edges.
  const labelsRef = useRef<HTMLDivElement>(null);
  const clock = useRef<{ wake(): void; stop(): void } | null>(null);
  useEffect(() => {
    const canvas = canvasRef.current, wrap = wrapRef.current;
    if (!mounted || crewOnly || !canvas || !wrap) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const muted = getComputedStyle(wrap).color;
    const glow = skyRef.current ? new GlowLayer(skyRef.current, SKY_REACH) : null;
    const scale = SCALE;
    const run = runOnClock(wrap, (dt) => {
      const W = Math.max(60, Math.floor(wrap.clientWidth / scale));
      const cw = W * scale;
      if (canvas.width !== cw || canvas.height !== kind.height) {
        canvas.width = cw; canvas.height = kind.height; canvas.style.width = `${cw}px`;
      }
      scene.update(dt);
      beginFrame();
      scene.draw(ctx, { width: cw, dpr: 1, scale, theme, muted, reducedMotion: reduced, now: Date.now(), duskMinutes: dusk });
      const out = endFrame();
      const drifting = glow?.update(out.glow, cw, kind.height, scene.focusX(), dt, reduced) ?? false;
      if (labelsRef.current) syncLabels(labelsRef.current, out.labels);
      const motion = scene.motion();
      return drifting && motion === "still" ? "slow" : motion;
    });
    clock.current = run;
    return () => { run.stop(); clock.current = null; };
  }, [mounted, crewOnly, scene, kind, theme, reduced, dusk]);
  const wake = () => clock.current?.wake();
  // Anything that changes the picture asks for a frame now.
  useEffect(wake, [moodKey, crewKey, tip]);

  if (!mounted) return null;
  const ease = reduced ? "none" : `height ${EASE_MS}ms ease, margin-bottom ${EASE_MS}ms ease`;
  const spoken = label(own) || "idle";
  const lines = tip ? tipLines(tip.hit, view, Date.now()) : null;
  const width = wrapRef.current?.clientWidth ?? 0;
  return (
    <div
      ref={wrapRef}
      className="text-muted-foreground calm-strip"
      data-scene={kind.id}
      onPointerDown={crewOnly ? undefined : onPointerDown}
      onPointerMove={crewOnly ? undefined : onPointerMove}
      onPointerLeave={crewOnly ? undefined : onPointerLeave}
      tabIndex={crewOnly ? undefined : 0}
      data-open={open ? "true" : undefined}
      aria-label={crewOnly ? undefined : `Calm: ${spoken}. Details`}
      onFocus={crewOnly ? undefined : onFocus}
      onBlur={crewOnly ? undefined : onBlur}
      onKeyDown={crewOnly ? undefined : onKeyDown}
      style={{
        height: open ? (alert ? ALERT_HEIGHT : kind.height) : 0,
        marginBottom: open ? 0 : -gap,
        position: "relative",
        transition: ease,
        cursor: pointer ? "pointer" : undefined,
        touchAction: "manipulation",
      }}
    >
      {alert ? (
        <div className="calm-clip">
          <HelperAlertRow alert={alert} sceneId={kind.id} theme={theme} reduced={reduced} onOpen={openHelper} />
        </div>
      ) : (
        <>
        <div ref={skyRef} className="calm-sky" aria-hidden="true" />
        <div ref={clipRef} className="calm-clip">
        <canvas
          ref={canvasRef}
          aria-hidden="true"
          className="calm-canvas"
          style={{ height: kind.height }}
        />
        <div ref={labelsRef} className="calm-labels" aria-hidden="true" />
        </div>
        {lines && tip && (
          <div
            role="tooltip"
            className="calm-tip"
            // Beside what was hovered or tapped, so it stays in view.
            style={tip.hit.x < width / 2 ? { left: tip.hit.x + 22 } : { right: width - tip.hit.x + 22 }}
          >
            <span className="calm-tip-main">{lines[0]}</span>
            {lines[1] && <span>{lines[1]}</span>}
          </div>
        )}
        {/* The state in words, for screen readers and for tools that summarize
            the cards above the prompt box (they skip a card with no text). */}
        <span className="calm-sr-only" aria-live="polite">{`Calm: ${spoken}`}</span>
        </>
      )}
    </div>
  );
}

export default definePluginApp((app) => {
  app.composer.customize({
    id: "calm",
    scopes: ["thread"],
    banners: [{ id: "scene", chrome: "bare", component: CalmStrip }],
  });
  // An experimental bb slot: if a future bb renames it, Calm loads without the header button.
  optionalSlot(app.slots.experimental_threadHeaderAction && (() => app.slots.experimental_threadHeaderAction({ id: "calm-thread", title: "Calm", component: CalmHeaderControl })), "thread header button");
  app.slots.settingsSection({
    id: "calm",
    title: "Scene",
    description: "What the strip above the prompt box shows, and when.",
    component: CalmSettings,
  });
});
