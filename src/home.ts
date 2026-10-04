// What the home screen section shows: which scene, and today's line.
import { sceneFor } from "./scenes";
import type { Scene } from "./scenes/types";
import type { DayStats, Prefs } from "./settings";

const NOUNS: Record<string, [string, string]> = {
  pasture: ["hop", "hops"], sea: ["jump", "jumps"], night: ["shooting star", "shooting stars"],
};

/** The scene the home screen shows: the chosen one, or the one the newest run got. */
export function homeScene(prefs: Prefs, stats: DayStats | null): Scene {
  if (prefs.scene === "each-run") return sceneFor(stats?.lastThreadId ?? "", "each-run", stats?.lastRun || 1);
  if (prefs.scene === "each-thread") return sceneFor(stats?.lastThreadId ?? "home", "each-thread");
  return sceneFor("", prefs.scene);
}

/** "Today: 4 runs · 23 hops · longest run 12 min" */
export function todayLine(stats: DayStats | null, sceneId: string): string {
  if (!stats) return "";
  if (stats.runs === 0 && stats.hops === 0) return "Today: no runs yet";
  const [one, many] = NOUNS[sceneId] ?? NOUNS.pasture;
  const parts = [`${stats.runs} ${stats.runs === 1 ? "run" : "runs"}`, `${stats.hops} ${stats.hops === 1 ? one : many}`];
  if (stats.longest > 0) {
    const min = Math.round(stats.longest / 60000);
    parts.push(min < 1 ? "longest run under 1 min" : `longest run ${min} min`);
  }
  return `Today: ${parts.join(" · ")}`;
}

