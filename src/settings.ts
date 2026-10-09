// Calm's preferences, chosen on its settings section and stored in the
// plugin's own storage: when scenes show, the scene, the evening timing, which
// optional pieces are on, and each thread's own choice from the thread header.

/** Every scene id, in picker order. Must match SCENES in src/scenes/index.ts (a test checks). */
export const SCENE_IDS = ["pasture", "sea", "night", "balloons", "pond", "train", "garden", "campfire", "underwater", "village", "mountain", "kites", "desert", "city", "lighthouse", "space"] as const;
export const SCENE_CHOICES = [...SCENE_IDS, "each-thread", "each-run"] as const;
export const EVENING_CHOICES = [20, 40, 60] as const;
/** When the strip shows a scene: only while the agent works, or all the time. */
export const SHOW_CHOICES = ["working", "always"] as const;
export const FEATURES = ["crew", "alert", "surprises", "gags", "taps", "ambient", "header", "still", "spill"] as const;

export type SceneId = (typeof SCENE_IDS)[number];
export type SceneChoice = (typeof SCENE_CHOICES)[number];
export type EveningChoice = (typeof EVENING_CHOICES)[number];
export type ShowChoice = (typeof SHOW_CHOICES)[number];
export type Feature = (typeof FEATURES)[number];
export type Features = Record<Feature, boolean>;

export interface Prefs {
  show: ShowChoice;
  scene: SceneChoice;
  /** Minutes from the start of a turn to full dusk. */
  evening: EveningChoice;
  features: Features;
  /** Scenes left out of the random mix ("a new one each time" and "each thread"). */
  excluded: SceneId[];
}

export const DEFAULT_FEATURES: Features = { crew: true, alert: true, surprises: true, gags: true, taps: true, ambient: true, header: true, still: false, spill: false };
export const DEFAULT_PREFS: Prefs = { show: "working", scene: "each-run", evening: 40, features: DEFAULT_FEATURES, excluded: [] };

/** Read stored or incoming prefs, keeping only known values. */
export function cleanPrefs(raw: unknown): Prefs {
  const r = (raw ?? {}) as Partial<Record<keyof Prefs, unknown>>;
  const f = (r.features ?? {}) as Partial<Record<Feature, unknown>>;
  const features = { ...DEFAULT_FEATURES };
  for (const k of FEATURES) if (typeof f[k] === "boolean") features[k] = f[k] as boolean;
  return {
    show: SHOW_CHOICES.includes(r.show as ShowChoice) ? (r.show as ShowChoice) : DEFAULT_PREFS.show,
    scene: SCENE_CHOICES.includes(r.scene as SceneChoice) ? (r.scene as SceneChoice) : DEFAULT_PREFS.scene,
    evening: EVENING_CHOICES.includes(r.evening as EveningChoice) ? (r.evening as EveningChoice) : DEFAULT_PREFS.evening,
    features,
    excluded: cleanExcluded(r.excluded),
  };
}

/** Known scene ids, once each; leaving every scene out means none is left out. */
export function cleanExcluded(raw: unknown): SceneId[] {
  const ids = Array.isArray(raw) ? [...new Set(raw.filter((x): x is SceneId => SCENE_IDS.includes(x as SceneId)))] : [];
  return ids.length >= SCENE_IDS.length ? [] : ids;
}

/** One thread's own choice, set from its header: Calm off here, or a pinned scene. */
export interface ThreadPrefs { off: boolean; scene: SceneId | null }
export const DEFAULT_THREAD_PREFS: ThreadPrefs = { off: false, scene: null };

export function cleanThreadPrefs(raw: unknown): ThreadPrefs {
  const r = (raw ?? {}) as Partial<Record<keyof ThreadPrefs, unknown>>;
  return { off: r.off === true, scene: SCENE_IDS.includes(r.scene as SceneId) ? (r.scene as SceneId) : null };
}
