// bb-plugin-calm backend. Watches bb's thread lifecycle events, keeps one
// mood per thread in memory, counts each turn's agent steps, follows each
// thread's child threads (its crew), and tells the open strips about changes
// over realtime. The strip asks for the current state when it mounts.
import { defineRpcContract, type BbPluginApi } from "@get-bb/plugin-sdk";
import { z } from "zod";
import { ON_STRIP, STEP_ITEMS, type CrewMember } from "./src/crew";
import {
  IDLE,
  nextMood,
  rateLimitResetsAt,
  type Mood,
  type MoodEvent,
  type MoodKind,
} from "./src/mood";
import {
  EVENING_CHOICES, FEATURES, SCENE_CHOICES, SCENE_IDS, SHOW_CHOICES, cleanPrefs, cleanThreadPrefs, type ThreadPrefs,
} from "./src/settings";

const kindSchema = z.enum(["idle", "working", "waiting", "rate", "error"]);
const moodSchema = z.object({
  kind: kindSchema,
  turnStartedAt: z.number().nullable(),
  resetsAt: z.number().nullable(),
  since: z.number(),
  run: z.number().optional(),
  lastStart: z.number().nullable().optional(),
});
const crewSchema = z.array(z.object({ id: z.string(), kind: kindSchema, title: z.string(), since: z.number().nullable().optional(), dismissed: z.boolean().optional() }));

const featuresSchema = z.object(Object.fromEntries(FEATURES.map((f) => [f, z.boolean()])) as Record<(typeof FEATURES)[number], z.ZodBoolean>);
const prefsSchema = z.object({
  show: z.enum(SHOW_CHOICES),
  scene: z.enum(SCENE_CHOICES),
  evening: z.union([z.literal(EVENING_CHOICES[0]), z.literal(EVENING_CHOICES[1]), z.literal(EVENING_CHOICES[2])]),
  features: featuresSchema,
  excluded: z.array(z.enum(SCENE_IDS)),
});
const prefsChangeSchema = z.object({
  show: z.enum(SHOW_CHOICES).optional(),
  scene: z.enum(SCENE_CHOICES).optional(),
  evening: prefsSchema.shape.evening.optional(),
  features: featuresSchema.partial().optional(),
  excluded: z.array(z.enum(SCENE_IDS)).max(SCENE_IDS.length).optional(),
});
const threadPrefsSchema = z.object({ off: z.boolean(), scene: z.enum(SCENE_IDS).nullable() });
const threadIdSchema = z.string().min(1).max(200);

export const rpcContract = defineRpcContract({
  state_get: {
    input: z.object({ threadId: z.string().min(1).max(200) }),
    output: z.object({ mood: moodSchema, steps: z.number(), crew: crewSchema, projectId: z.string().nullable().optional() }),
  },
  /** An open strip says it's still watching, every few minutes. */
  watch: { input: z.object({ threadId: z.string().min(1).max(200) }), output: z.object({ steps: z.number() }) },
  prefs_get: { input: z.null(), output: prefsSchema },
  prefs_set: { input: prefsChangeSchema, output: prefsSchema },
  /** One thread's own choice, from its header control. */
  thread_prefs_get: { input: z.object({ threadId: threadIdSchema }), output: threadPrefsSchema },
  thread_prefs_set: { input: z.object({ threadId: threadIdSchema, off: z.boolean().optional(), scene: z.enum(SCENE_IDS).nullable().optional() }), output: threadPrefsSchema },
  /** A failed helper was opened from its alert: stop alerting about that failure. */
  failure_dismiss: { input: z.object({ threadId: threadIdSchema }), output: z.object({ ok: z.boolean() }) },
});

/** Realtime channels. Payloads carry the thread id; clients filter. */
export const MOOD_CHANNEL = "mood";
export const STEP_CHANNEL = "step";
export const CREW_CHANNEL = "crew";
export const PREFS_CHANNEL = "prefs";
export const THREAD_PREFS_CHANNEL = "thread-prefs";
export type ThreadPrefsSignal = { threadId: string; prefs: ThreadPrefs };
export type MoodSignal = { threadId: string; mood: Mood };
export type StepSignal = { threadId: string; steps: number };
export type CrewSignal = { threadId: string; crew: CrewMember[] };

interface ThreadFacts { id: string; status: string; projectId?: string; parentThreadId: string | null; title: string | null; titleFallback: string | null; archivedAt?: number | null; updatedAt?: number }

export default async function plugin(bb: BbPluginApi) {
  // The scene and evening choices, set from Calm's settings section.
  const PREFS_KEY = "prefs";
  const readPrefs = async () => cleanPrefs(await bb.storage.kv.get(PREFS_KEY));

  // Each thread's own choice from its header. Only threads with a choice are kept.
  const THREADS_KEY = "thread-prefs", MAX_THREAD_PREFS = 2000;
  let threadPrefs = new Map<string, ThreadPrefs>(
    Object.entries((await bb.storage.kv.get<Record<string, unknown>>(THREADS_KEY)) ?? {}).map(([id, p]) => [id, cleanThreadPrefs(p)]),
  );
  const saveThreadPrefs = () => bb.storage.kv.set(THREADS_KEY, Object.fromEntries(threadPrefs));

  const moods = new Map<string, Mood>();
  // Each thread's run count, kept across restarts so "a new one each time"
  // never repeats a scene after bb restarts. Capped to the newest threads.
  const RUNS_KEY = "runs", MAX_RUNS = 2000;
  const runs = new Map<string, number>(Object.entries((await bb.storage.kv.get<Record<string, number>>(RUNS_KEY)) ?? {}));
  let runsSave: ReturnType<typeof setTimeout> | null = null;
  function rememberRun(threadId: string, run: number) {
    if (runs.get(threadId) === run) return;
    runs.delete(threadId); runs.set(threadId, run);
    while (runs.size > MAX_RUNS) runs.delete(runs.keys().next().value!);
    rememberRunsChanged();
  }
  function rememberRunsChanged() {
    runsSave ??= setTimeout(() => { runsSave = null; void bb.storage.kv.set(RUNS_KEY, Object.fromEntries(runs)); }, 3000);
  }
  const baseMood = (id: string): Mood => moods.get(id) ?? { ...IDLE, run: runs.get(id) ?? 0 };

  // Failed helpers you have opened, kept across reloads and restarts so their
  // alert stays gone: child id -> when it was opened. An entry lasts until
  // Calm sees that helper running again (an event, or a rebuild that finds it
  // active), so its next failure alerts afresh. bb's record has no stable id
  // for one failure, and its update time moves with any edit, so it can't
  // tell an old failure from a new one.
  const DISMISSED_KEY = "dismissed", MAX_DISMISSED = 500;
  const dismissed = new Map<string, number>(Object.entries((await bb.storage.kv.get<Record<string, number>>(DISMISSED_KEY)) ?? {}));
  const saveDismissed = () => bb.storage.kv.set(DISMISSED_KEY, Object.fromEntries(dismissed)).catch((e) => {
    bb.log.warn(`couldn't save dismissed alerts: ${e instanceof Error ? e.message : String(e)}`);
  });
  const isDismissed = (id: string) => dismissed.has(id);
  /** The helper is running again: forget its dismissal. */
  const undismiss = (id: string) => { if (dismissed.delete(id)) void saveDismissed(); };
  /** Opening a failed helper, from the alert or from anywhere in bb, ends its alert. */
  function dismissFailure(id: string) {
    const m = moods.get(id);
    if (m?.kind !== "error" || isDismissed(id)) return;
    dismissed.delete(id); dismissed.set(id, Date.now());
    while (dismissed.size > MAX_DISMISSED) dismissed.delete(dismissed.keys().next().value!);
    void saveDismissed();
    const parent = parentOf.get(id);
    if (parent) publishCrew(parent);
  }
  const steps = new Map<string, number>();     // agent steps in the current turn
  const lastSeq = new Map<string, number>();   // last thread event already counted
  const parentOf = new Map<string, string>();
  const childrenOf = new Map<string, Set<string>>();
  const titles = new Map<string, string>();
  /** Each thread's project, for "one scene per project". */
  const projects = new Map<string, string>();
  const seededCrew = new Set<string>();        // parents whose children were listed once
  // Steps are counted only for threads with a strip open. A strip renews its
  // watch every few minutes; a watch lapses after WATCH_MS without one.
  const WATCH_MS = 12 * 60_000;
  const watched = new Map<string, number>();
  const isWatched = (id: string) => (watched.get(id) ?? 0) > Date.now();

  // Server cost, logged once a minute (debug) so a busy session can be measured.
  const stats = { calls: 0, ms: 0, byKind: {} as Record<string, number> };
  async function sdk<T>(kind: string, call: () => Promise<T>): Promise<T> {
    const t0 = performance.now();
    try { return await call(); } finally {
      stats.calls++; stats.ms += performance.now() - t0; stats.byKind[kind] = (stats.byKind[kind] ?? 0) + 1;
    }
  }
  bb.background.schedule("cost-log", "* * * * *", () => {
    if (stats.calls === 0) return;
    bb.log.debug(`sdk calls/min ${stats.calls} (${Math.round(stats.ms)} ms) ${JSON.stringify(stats.byKind)}`);
    stats.calls = 0; stats.ms = 0; stats.byKind = {};
  });

  /** When a failed thread failed, as bb records it, so a rebuilt failure keeps its time. */
  const failedAt = (t: ThreadFacts) => (typeof t.updatedAt === "number" && t.updatedAt > 0 ? Math.min(t.updatedAt, Date.now()) : Date.now());

  /** Remember a thread's parent, project, and title from any thread record bb hands us. */
  function note(t: ThreadFacts) {
    titles.set(t.id, (t.title ?? t.titleFallback ?? "Child thread").slice(0, 80));
    if (typeof t.projectId === "string" && t.projectId) projects.set(t.id, t.projectId);
    if (t.parentThreadId && !t.archivedAt) {
      parentOf.set(t.id, t.parentThreadId);
      let kids = childrenOf.get(t.parentThreadId);
      if (!kids) childrenOf.set(t.parentThreadId, (kids = new Set()));
      kids.add(t.id);
    }
  }

  function forget(id: string) {
    const parent = parentOf.get(id);
    gens.delete(id); gens.set(id, ++forgetTick);
    while (gens.size > 5000) gens.delete(gens.keys().next().value!);
    moods.delete(id); steps.delete(id); lastSeq.delete(id); parentOf.delete(id); titles.delete(id); projects.delete(id);
    watched.delete(id); latestSeq.delete(id); lastCount.delete(id); revs.delete(id);
    childrenOf.delete(id); seededCrew.delete(id);
    if (threadPrefs.delete(id)) void saveThreadPrefs();
    if (runs.delete(id)) rememberRunsChanged();
    if (dismissed.delete(id)) void saveDismissed();
    const t = pendingCount.get(id); if (t) { clearTimeout(t); pendingCount.delete(id); }
    if (parent) { childrenOf.get(parent)?.delete(id); publishCrew(parent); }
  }

  function crewOf(parentId: string): CrewMember[] {
    const crew: CrewMember[] = [];
    for (const id of childrenOf.get(parentId) ?? []) {
      const m = moods.get(id), kind = m?.kind ?? "idle";
      // A run's start for a busy helper; for a failed or paused one, when that
      // happened, so each failure is its own event (and its own alert).
      const since = kind === "error" || kind === "rate" ? m?.since ?? null : m?.turnStartedAt ?? null;
      if (!ON_STRIP.has(kind)) continue;
      const member: CrewMember = { id, kind, title: titles.get(id) ?? "Child thread", since };
      if (kind === "error" && isDismissed(id)) member.dismissed = true;
      crew.push(member);
    }
    return crew.sort((a, b) => a.id.localeCompare(b.id));
  }

  function publishCrew(parentId: string) {
    bb.realtime.publish(CREW_CHANNEL, { threadId: parentId, crew: crewOf(parentId) } satisfies CrewSignal);
  }

  // Bumped on every mood change, so a slow read can tell it was overtaken.
  const revs = new Map<string, number>();
  const rev = (id: string) => revs.get(id) ?? 0;
  // Bumped when a thread is archived or deleted, so work started before then is dropped.
  // Each entry is the moment (a running tick) the thread was last archived or deleted.
  const gens = new Map<string, number>();
  const gen = (id: string) => gens.get(id) ?? 0;
  let forgetTick = 0;

  function apply(threadId: string, event: MoodEvent, at = Date.now()) {
    const before = baseMood(threadId);
    const after = nextMood(before, event, at);
    if (after.run) rememberRun(threadId, after.run);
    if (after === before) return;
    bb.log.debug(`${threadId}: ${event.type} -> ${after.kind}, run ${after.run ?? 0}`);
    if (after.turnStartedAt !== before.turnStartedAt && after.kind === "working") steps.set(threadId, 0);
    moods.set(threadId, after);
    revs.set(threadId, rev(threadId) + 1);
    if (after.kind === "working") undismiss(threadId);   // running again: its next failure alerts
    bb.realtime.publish(MOOD_CHANNEL, { threadId, mood: after } satisfies MoodSignal);
    const parent = parentOf.get(threadId);
    if (parent) publishCrew(parent);
  }

  async function hasPendingInteraction(threadId: string): Promise<boolean> {
    const pending = await sdk("interactions.list", () => bb.sdk.threads.interactions.list({ threadId }));
    return pending.some((i) => !("status" in i) || i.status === "pending");
  }

  bb.events.on("thread.created", ({ thread }) => {
    note(thread);
    if (thread.parentThreadId) publishCrew(thread.parentThreadId);
  });
  bb.events.on("thread.active", ({ thread }) => { note(thread); apply(thread.id, { type: "active" }); });
  bb.events.on("thread.idle", ({ thread }) => { note(thread); apply(thread.id, { type: "idle" }); });
  bb.events.on("thread.failed", ({ thread }) => { note(thread); apply(thread.id, { type: "failed" }, failedAt(thread)); });
  bb.events.on("interaction.pending", ({ thread }) => {
    note(thread);
    revs.set(thread.id, rev(thread.id) + 1);   // any read of open questions started before this is out of date
    apply(thread.id, { type: "pending" });
  });
  bb.events.on("turn.failed", (event) => {
    if (event.errorInfo?.category !== "rate-limit") return;
    apply(event.threadId, {
      type: "rate-limited",
      resetsAt: rateLimitResetsAt(event.rateLimits?.windows, Date.now()),
    });
  });
  for (const gone of ["thread.archived", "thread.deleted"] as const) {
    bb.events.on(gone, ({ thread }) => forget(thread.id));
  }

  // bb coalesces new thread events to at most one notification per second
  // (an experimental bb event). Each one marks the thread active. Only a
  // thread already waiting on you re-reads its open interactions, to notice
  // the answer; a new question arrives as interaction.pending. Steps are
  // counted from the last seen event, and only for threads someone watches.
  // The event is registered defensively: if a future bb renames it, Calm
  // still loads, the waiting check below still clears answered questions,
  // and steps simply stop counting.
  const onThreadEvents = async ({ thread, sequence }: { thread: ThreadFacts; sequence: number }) => {
    note(thread);
    if (thread.status !== "active") {
      // The run is over: count its last steps, if a strip is watching.
      if (isWatched(thread.id)) { latestSeq.set(thread.id, sequence); scheduleCount(thread.id); } else lastSeq.delete(thread.id);
      return;
    }
    if (moods.get(thread.id)?.kind === "waiting") await recheckWaiting(thread.id);
    else apply(thread.id, { type: "active" });
    if (!isWatched(thread.id)) { lastSeq.delete(thread.id); return; }
    latestSeq.set(thread.id, sequence);
    scheduleCount(thread.id);
  };
  try {
    bb.events.on("experimental_thread.events", onThreadEvents);
  } catch (e) {
    bb.log.warn(`thread events unavailable; steps won't be counted: ${e instanceof Error ? e.message : String(e)}`);
  }

  /** A thread waiting on you: has the question been answered? A new question that lands meanwhile wins. */
  async function recheckWaiting(threadId: string) {
    const seen = rev(threadId);
    const open = await hasPendingInteraction(threadId);
    if (!open && rev(threadId) === seen && moods.get(threadId)?.kind === "waiting") apply(threadId, { type: "resolved" });
  }
  // The safety net for "waiting on you": every WAIT_CHECK_MS, each watched
  // thread, or helper of a watched thread, still waiting re-reads its open
  // questions, so an answer always clears the amber light even without the
  // thread events above.
  const WAIT_CHECK_MS = 15_000;
  let waitCheck: ReturnType<typeof setInterval> | null = null;
  async function checkWaiting() {
    for (const [id, m] of moods) {
      // A watched thread, or a helper on a watched parent's strip or alert.
      const parent = parentOf.get(id);
      if (m.kind !== "waiting" || !(isWatched(id) || (parent !== undefined && isWatched(parent)))) continue;
      await recheckWaiting(id).catch((e) => bb.log.warn(`waiting check failed: ${e instanceof Error ? e.message : String(e)}`));
    }
  }

  // Steps are completed agent actions, counted only for threads with a strip
  // open, at most one history read per thread every COUNT_MS. Each thread's
  // reads run one at a time, and a count commits its total and its mark
  // together, only when every page read succeeded, the thread still exists,
  // and it is still on the same run. A failed read commits nothing and is
  // tried again.
  const COUNT_MS = 2000, RETRY_MS = 5000;
  const latestSeq = new Map<string, number>();
  const lastCount = new Map<string, number>();
  const pendingCount = new Map<string, ReturnType<typeof setTimeout>>();
  const chains = new Map<string, Promise<void>>();
  function serial(threadId: string, job: () => Promise<void>): Promise<void> {
    const next = (chains.get(threadId) ?? Promise.resolve()).then(job).catch((e) => {
      bb.log.warn(`step count failed: ${e instanceof Error ? e.message : String(e)}`);
    });
    chains.set(threadId, next);
    void next.then(() => { if (chains.get(threadId) === next) chains.delete(threadId); });
    return next;
  }
  function scheduleCount(threadId: string, wait?: number) {
    if (pendingCount.has(threadId)) return;   // one count waiting per thread is enough
    const ms = wait ?? Math.max(0, (lastCount.get(threadId) ?? 0) + COUNT_MS - Date.now());
    pendingCount.set(threadId, setTimeout(() => {
      pendingCount.delete(threadId);
      void serial(threadId, () => countSteps(threadId));
    }, ms));
  }
  // bb stops this service when the plugin unloads; clear any batched reads then.
  bb.background.service("step-counter", {
    start: (signal) => new Promise<void>((resolve) => {
      waitCheck = setInterval(() => void checkWaiting(), WAIT_CHECK_MS);
      signal.addEventListener("abort", () => {
        if (waitCheck) { clearInterval(waitCheck); waitCheck = null; }
        if (runsSave) { clearTimeout(runsSave); runsSave = null; void bb.storage.kv.set(RUNS_KEY, Object.fromEntries(runs)); }
        for (const t of pendingCount.values()) clearTimeout(t);
        pendingCount.clear();
        resolve();
      }, { once: true });
    }),
  });

  function addSteps(threadId: string, n: number, replace = false) {
    if (n <= 0 && !replace) return;
    const before = steps.get(threadId) ?? 0;
    const total = replace ? n : before + n;
    steps.set(threadId, total);
    bb.realtime.publish(STEP_CHANNEL, { threadId, steps: total } satisfies StepSignal);
  }

  /** Which run a mood belongs to: the current run, or the one that just ended (an idle mood remembers its start). */
  const runOf = (m: Mood | undefined) => (m?.kind === "working" || m?.kind === "waiting" ? m.turnStartedAt : m?.kind === "idle" ? m.lastStart ?? null : null);
  const muted = (id: string) => threadPrefs.get(id)?.off === true;

  async function countSteps(threadId: string) {
    if (muted(threadId)) return;
    lastCount.set(threadId, Date.now());
    const after = lastSeq.get(threadId);
    if (after === undefined) return backfillSteps(threadId);   // no mark yet: count this run from its start
    const target = latestSeq.get(threadId);
    if (target === undefined || target <= after) return;
    const g = gen(threadId), run = runOf(moods.get(threadId));
    let n = 0, from = after;
    try {
      // bb returns at most 100 events per call; page through the rest.
      for (let page = 0; page < 20; page++) {
        const rows = await sdk("events.list", () => bb.sdk.threads.events.list({
          threadId, afterSeq: String(from), types: ["item/completed"], limit: "100", order: "asc",
        }));
        for (const row of rows) {
          const item = (row.data as { item?: { type?: string } }).item;
          if (item?.type && STEP_ITEMS.has(item.type)) n++;
          from = Math.max(from, row.seq);
        }
        if (rows.length < 100) break;
      }
    } catch (e) {
      bb.log.warn(`step count failed, retrying: ${e instanceof Error ? e.message : String(e)}`);
      if (isWatched(threadId)) scheduleCount(threadId, RETRY_MS);
      return;
    }
    if (gen(threadId) !== g || muted(threadId)) return;   // archived, deleted, or muted meanwhile
    const now = runOf(moods.get(threadId));
    if (now !== run && now !== null) {
      // A new run began during the read, so these events mix two runs.
      // Commit nothing from them: count the new run afresh from its start.
      lastSeq.delete(threadId);
      return backfillSteps(threadId);
    }
    // The same run, whether still going or just ended: it keeps its steps.
    lastSeq.set(threadId, from);
    addSteps(threadId, n);
  }

  /**
   * Count the current run's steps from its start: when a strip starts
   * watching mid-run, or when a watched thread has no mark yet. Reads newest
   * first and sets the mark at the newest event.
   */
  async function backfillSteps(threadId: string) {
    if (muted(threadId)) return;
    const mood = moods.get(threadId);
    // The current run, or the one that just ended (an idle mood remembers its start).
    const run = runOf(mood);
    if (!run) return;
    const g = gen(threadId);
    let n = 0, before: number | undefined, top: number | undefined;
    try {
      for (let page = 0; page < 20; page++) {
        const rows = await sdk("events.list", () => bb.sdk.threads.events.list({
          threadId, types: ["item/completed"], limit: "100", order: "desc",
          ...(before === undefined ? {} : { beforeSeq: String(before) }),
        }));
        let done = rows.length < 100;
        for (const row of rows) {
          top = Math.max(top ?? 0, row.seq);
          before = before === undefined ? row.seq : Math.min(before, row.seq);
          if (row.createdAt < run) { done = true; break; }
          const item = (row.data as { item?: { type?: string } }).item;
          if (item?.type && STEP_ITEMS.has(item.type)) n++;
        }
        if (done) break;
      }
    } catch (e) {
      bb.log.warn(`step backfill failed, retrying: ${e instanceof Error ? e.message : String(e)}`);
      if (isWatched(threadId)) scheduleCount(threadId, RETRY_MS);   // with no mark yet, the retry backfills
      return;
    }
    if (gen(threadId) !== g || muted(threadId) || runOf(moods.get(threadId)) !== run) return;
    if (top !== undefined) lastSeq.set(threadId, top);
    addSteps(threadId, n, true);
  }

  async function watch(threadId: string) {
    const fresh = !isWatched(threadId);
    const now = Date.now();
    for (const [id, until] of watched) if (until <= now) { watched.delete(id); lastSeq.delete(id); }
    watched.set(threadId, now + WATCH_MS);
    if (fresh) await serial(threadId, () => backfillSteps(threadId));
  }

  // Moods are in memory, so after a reload rebuild a thread's mood from its
  // current status the first time a strip asks.
  function moodFromStatus(id: string, status: string, now: number, failedSince = now): Mood {
    // A run already under way when we rebuild keeps the scene it started with.
    const base = { ...IDLE, run: Math.max(0, (runs.get(id) ?? 1) - 1) };
    if (status === "active" || status === "starting") return nextMood(base, { type: "active" }, now);
    if (status === "error") return nextMood(base, { type: "failed" }, failedSince);
    return { ...IDLE, run: runs.get(id) ?? 0 };
  }
  /** The thread's project, for "one scene per project": from memory, else one read. */
  async function projectOf(threadId: string): Promise<string | null> {
    if (!projects.has(threadId)) {
      try { note(await sdk("threads.get", () => bb.sdk.threads.get({ threadId }))); }
      catch (e) { bb.log.warn(`project lookup failed: ${e instanceof Error ? e.message : String(e)}`); }
    }
    return projects.get(threadId) ?? null;
  }
  async function reconcile(threadId: string): Promise<Mood> {
    const g = gen(threadId);
    const thread = await sdk("threads.get", () => bb.sdk.threads.get({ threadId }));
    note(thread);
    let mood = moodFromStatus(threadId, thread.status, Date.now(), failedAt(thread));
    if (mood.kind === "working" && (await hasPendingInteraction(threadId))) mood = nextMood(mood, { type: "pending" }, Date.now());
    // An event that arrived while we read is newer than this rebuild.
    if (!moods.has(threadId) && gen(threadId) === g) { moods.set(threadId, mood); if (mood.kind === "working" || mood.kind === "waiting") undismiss(threadId); }
    return moods.get(threadId) ?? mood;
  }

  /** List a thread's children once, so a strip opened after a reload knows its crew. */
  const seeding = new Map<string, Promise<void>>();
  function seedCrew(parentId: string): Promise<void> {
    if (seededCrew.has(parentId)) return Promise.resolve();
    let run = seeding.get(parentId);
    if (!run) {
      run = listCrew(parentId)
        .then(() => { seededCrew.add(parentId); })   // a failed read is tried again next time
        .finally(() => seeding.delete(parentId));
      seeding.set(parentId, run);
    }
    return run;
  }
  async function listCrew(parentId: string) {
    const now = Date.now(), g = gen(parentId), began = forgetTick;
    const gone = (id: string) => gen(id) > began;   // archived or deleted while we read
    for (let offset = 0, page = 0; page < 10; page++, offset += 100) {
      const kids = await sdk("threads.list", () => bb.sdk.threads.list({ parentThreadId: parentId, archived: false, limit: 100, offset }));
      if (gen(parentId) !== g) return;   // the parent was archived or deleted meanwhile
      for (const kid of kids) {
        if (gone(kid.id)) continue;
        note(kid);
        if (!moods.has(kid.id)) {
          let mood = moodFromStatus(kid.id, kid.status, now, failedAt(kid));
          if (mood.kind === "working" && (await hasPendingInteraction(kid.id))) mood = nextMood(mood, { type: "pending" }, now);
          if (gone(kid.id) || gen(parentId) !== g) { forget(kid.id); continue; }
          if (!moods.has(kid.id)) { moods.set(kid.id, mood); if (mood.kind === "working" || mood.kind === "waiting") undismiss(kid.id); }
        }
      }
      if (kids.length < 100) break;
    }
  }

  let prefsQueue: Promise<unknown> = Promise.resolve();
  let threadQueue: Promise<unknown> = Promise.resolve();
  bb.rpc.register(rpcContract, {
    state_get: async ({ threadId }) => {
      if (!moods.has(threadId)) await reconcile(threadId);
      dismissFailure(threadId);   // you opened this thread: if it is a failed helper, its alert is done
      await seedCrew(threadId).catch((e) => bb.log.warn(`crew lookup failed: ${e instanceof Error ? e.message : String(e)}`));
      if (!threadPrefs.get(threadId)?.off) await watch(threadId);   // Calm off here: no step counting
      const projectId = await projectOf(threadId);
      // Read everything now, after the awaits, so nothing older than an event that arrived meanwhile goes out.
      return { mood: moods.get(threadId) ?? baseMood(threadId), steps: steps.get(threadId) ?? 0, crew: crewOf(threadId), projectId };
    },
    watch: async ({ threadId }) => {
      await seedCrew(threadId).catch(() => {});   // retries a crew lookup that failed when the strip opened
      if (!threadPrefs.get(threadId)?.off) await watch(threadId);
      return { steps: steps.get(threadId) ?? 0 };
    },
    prefs_get: () => readPrefs(),
    failure_dismiss: ({ threadId }) => { dismissFailure(threadId); return { ok: true }; },
    thread_prefs_get: ({ threadId }) => threadPrefs.get(threadId) ?? { off: false, scene: null },
    thread_prefs_set: ({ threadId, ...change }) => {
      // One save at a time; memory changes only after storage accepted it.
      const save = threadQueue.then(async () => {
        const next = cleanThreadPrefs({ ...(threadPrefs.get(threadId) ?? {}), ...change });
        const all = new Map(threadPrefs);
        all.delete(threadId);
        if (next.off || next.scene) all.set(threadId, next);   // the default needs no entry
        while (all.size > MAX_THREAD_PREFS) all.delete(all.keys().next().value!);
        await bb.storage.kv.set(THREADS_KEY, Object.fromEntries(all));
        threadPrefs = all;
        if (next.off) {   // muted: stop counting its steps, including a count already queued
          watched.delete(threadId); lastSeq.delete(threadId);
          const t = pendingCount.get(threadId); if (t) { clearTimeout(t); pendingCount.delete(threadId); }
        }
        else if (change.off === false) void watch(threadId).catch(() => {});   // back on: count from this run's start
        bb.realtime.publish(THREAD_PREFS_CHANNEL, { threadId, prefs: next } satisfies ThreadPrefsSignal);
        return next;
      });
      threadQueue = save.catch(() => undefined);
      return save;
    },
    prefs_set: (change) => {
      // One save at a time, so two quick changes both land.
      const save = prefsQueue.then(async () => {
        const now = await readPrefs();
        const next = cleanPrefs({ ...now, ...change, features: { ...now.features, ...change.features } });
        await bb.storage.kv.set(PREFS_KEY, next);
        bb.realtime.publish(PREFS_CHANNEL, next);
        return next;
      });
      prefsQueue = save.catch(() => undefined);
      return save;
    },
  });
}

export type { MoodKind };
