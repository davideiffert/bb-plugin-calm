// One animation loop for every strip and preview on the page. Each one asks
// for its next frame through its scene's motion: about 30 fps while something
// moves, 15 fps for gentle changes (twinkling, rain, a blinking lantern), and
// only a check every 30 seconds when nothing changes. Hidden pages and strips
// that are out of sight get no frames at all.
import type { Motion } from "./kit/common";

const FAST_MS = 1000 / 30;
const SLOW_MS = 1000 / 15;
const STILL_MS = 30_000;     // even a still scene follows the clock (evening light)
const MAX_STEP = 0.1;        // never advance a scene more than this many seconds at once

interface Runner {
  el: Element;
  tick: (dt: number) => Motion;
  visible: boolean;
  next: number;
  last: number;
}

const runners = new Set<Runner>();
let raf = 0;
let timer: ReturnType<typeof setTimeout> | 0 = 0;
let observer: IntersectionObserver | null = null;
let listening = false;

function frame() {
  raf = 0;
  const now = performance.now();
  for (const r of runners) {
    if (!r.visible || now < r.next - 4) continue;
    const dt = r.last ? Math.min(MAX_STEP, (now - r.last) / 1000) : 0;
    r.last = now;
    let motion: Motion;
    try { motion = r.tick(dt); } catch (e) {
      // One broken strip must not stop the others: park it and carry on.
      console.error("Calm: a scene stopped after an error", e);
      runners.delete(r);
      continue;
    }
    r.next = now + (motion === "fast" ? FAST_MS : motion === "slow" ? SLOW_MS : STILL_MS);
  }
  schedule();
}

function schedule() {
  if (timer) { clearTimeout(timer); timer = 0; }
  if (document.hidden || raf) return;
  let soonest = Infinity;
  for (const r of runners) if (r.visible) soonest = Math.min(soonest, r.next);
  if (soonest === Infinity) return;
  const wait = soonest - performance.now();
  if (wait <= 20) raf = requestAnimationFrame(frame);
  else timer = setTimeout(() => { timer = 0; if (!raf) raf = requestAnimationFrame(frame); }, wait - 16);
}

function onVisibility() {
  if (document.hidden) {
    if (raf) { cancelAnimationFrame(raf); raf = 0; }
    if (timer) { clearTimeout(timer); timer = 0; }
    return;
  }
  for (const r of runners) { r.last = 0; r.next = 0; }
  schedule();
}

/**
 * Drive `tick` from the shared loop while `el` is on screen. `tick` advances
 * and draws the scene, then returns how soon it needs the next frame.
 */
export function runOnClock(el: Element, tick: (dt: number) => Motion): { wake(): void; stop(): void } {
  if (!observer) {
    observer = new IntersectionObserver((entries) => {
      for (const e of entries) for (const r of runners) if (r.el === e.target) {
        const was = r.visible;
        r.visible = e.isIntersecting;
        if (r.visible && !was) { r.last = 0; r.next = 0; }
      }
      schedule();
    });
  }
  if (!listening) { document.addEventListener("visibilitychange", onVisibility); listening = true; }
  const r: Runner = { el, tick, visible: true, next: 0, last: 0 };
  runners.add(r);
  observer.observe(el);
  schedule();
  return {
    wake() { r.next = 0; schedule(); },
    stop() {
      runners.delete(r);
      observer?.unobserve(el);
      if (runners.size === 0) {
        if (raf) { cancelAnimationFrame(raf); raf = 0; }
        if (timer) { clearTimeout(timer); timer = 0; }
        document.removeEventListener("visibilitychange", onVisibility);
        listening = false;
      }
    },
  };
}

/** How many strips and previews are on the clock (for tests and the soak run). */
export function runnerCount() { return runners.size; }
