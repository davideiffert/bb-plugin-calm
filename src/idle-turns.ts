// With scenes shown always and "a new scene each run", the strip moves on to
// the next scene from the mix every few minutes between runs. Each move takes
// the next place in the same shuffled bag a new run would, so the mix still
// shows every scene once before any repeats.

/** How long an idle strip keeps one scene. */
export const IDLE_TURN_MS = 3 * 60_000;

/** Each thread's moves between runs on this page, added to its run number to pick the scene. */
const turns = new Map<string, number>();

export function idleTurns(threadId: string): number {
  return turns.get(threadId) ?? 0;
}

export function nextIdleTurn(threadId: string): number {
  const n = idleTurns(threadId) + 1;
  turns.delete(threadId);
  turns.set(threadId, n);
  while (turns.size > 200) turns.delete(turns.keys().next().value!);
  return n;
}

/**
 * Call `fire` every `ms` of time the page is visible. Time while the page is
 * hidden does not count, and no timer runs then. Returns a stop function.
 */
export function everyVisible(ms: number, fire: () => void): () => void {
  let left = ms, started = 0;
  let timer: ReturnType<typeof setTimeout> | 0 = 0;
  const arm = () => {
    started = Date.now();
    timer = setTimeout(() => { timer = 0; left = ms; fire(); arm(); }, left);
  };
  const pause = () => {
    if (!timer) return;
    clearTimeout(timer);
    timer = 0;
    left = Math.max(0, left - (Date.now() - started));
  };
  const onVisibility = () => { if (document.hidden) pause(); else if (!timer) arm(); };
  document.addEventListener("visibilitychange", onVisibility);
  if (!document.hidden) arm();
  return () => { pause(); document.removeEventListener("visibilitychange", onVisibility); };
}
