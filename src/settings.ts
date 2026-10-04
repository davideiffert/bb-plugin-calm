// Calm's preferences, chosen on its settings section and stored in the
// plugin's own storage: the scene, the evening timing, which optional pieces
// are on, and each thread's own choice from the thread header.

export const SCENE_IDS = ["pasture", "sea", "night"] as const;
export const SCENE_CHOICES = [...SCENE_IDS, "each-thread", "each-run"] as const;
export const EVENING_CHOICES = [20, 40, 60] as const;
export const FEATURES = ["home", "crew", "alert", "surprises", "taps", "ambient", "header"] as const;

export type SceneId = (typeof SCENE_IDS)[number];
export type SceneChoice = (typeof SCENE_CHOICES)[number];
export type EveningChoice = (typeof EVENING_CHOICES)[number];
export type Feature = (typeof FEATURES)[number];
export type Features = Record<Feature, boolean>;

export interface Prefs {
  scene: SceneChoice;
  /** Minutes from the start of a turn to full dusk. */
  evening: EveningChoice;
  features: Features;
}

export const DEFAULT_FEATURES: Features = { home: true, crew: true, alert: true, surprises: true, taps: true, ambient: true, header: true };
export const DEFAULT_PREFS: Prefs = { scene: "each-run", evening: 40, features: DEFAULT_FEATURES };

/** Read stored or incoming prefs, keeping only known values. */
export function cleanPrefs(raw: unknown): Prefs {
  const r = (raw ?? {}) as Partial<Record<keyof Prefs, unknown>>;
  const f = (r.features ?? {}) as Partial<Record<Feature, unknown>>;
  const features = { ...DEFAULT_FEATURES };
  for (const k of FEATURES) if (typeof f[k] === "boolean") features[k] = f[k] as boolean;
  return {
    scene: SCENE_CHOICES.includes(r.scene as SceneChoice) ? (r.scene as SceneChoice) : DEFAULT_PREFS.scene,
    evening: EVENING_CHOICES.includes(r.evening as EveningChoice) ? (r.evening as EveningChoice) : DEFAULT_PREFS.evening,
    features,
  };
}

/** One thread's own choice, set from its header: Calm off here, or a pinned scene. */
export interface ThreadPrefs { off: boolean; scene: SceneId | null }
export const DEFAULT_THREAD_PREFS: ThreadPrefs = { off: false, scene: null };

export function cleanThreadPrefs(raw: unknown): ThreadPrefs {
  const r = (raw ?? {}) as Partial<Record<keyof ThreadPrefs, unknown>>;
  return { off: r.off === true, scene: SCENE_IDS.includes(r.scene as SceneId) ? (r.scene as SceneId) : null };
}

/** Today's numbers for the home section, in the bb host's local day. */
export interface DayStats {
  day: string;
  runs: number;
  hops: number;
  /** The longest finished run today, in milliseconds. */
  longest: number;
  /** The newest run anywhere, so the home section can show its scene. */
  lastThreadId: string | null;
  lastRun: number;
  /** When the bb host's day ends (epoch ms), sent with each update. */
  nextDayAt?: number;
}

export const localDay = (now: number) => {
  const d = new Date(now);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
export const emptyDay = (now: number): DayStats => ({ day: localDay(now), runs: 0, hops: 0, longest: 0, lastThreadId: null, lastRun: 0 });

/** Count a run start, a run end, or new steps into today's numbers, starting a fresh day when the date changes. */
export function tally(stats: DayStats, now: number, change: { started?: { threadId: string; run: number }; ended?: number; hops?: number }): DayStats {
  const s = stats.day === localDay(now) ? { ...stats } : { ...emptyDay(now), lastThreadId: stats.lastThreadId, lastRun: stats.lastRun };
  if (change.started) { s.runs++; s.lastThreadId = change.started.threadId; s.lastRun = change.started.run; }
  if (change.ended !== undefined) s.longest = Math.max(s.longest, change.ended);
  if (change.hops) s.hops += change.hops;
  return s;
}
