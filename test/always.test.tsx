// @vitest-environment jsdom
// Scenes shown always: the strip stays between runs, and with "a new scene
// each run" it moves through the mix every few minutes while the agent is
// idle. Shown only while the agent works (the default), nothing changes.
import { act } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { loadPluginApp, renderSlot } from "@get-bb/plugin-sdk/testing/app";
import { SCENES, sceneFor } from "../src/scenes";
import { DEFAULT_PREFS, type Prefs, type SceneId, type ThreadPrefs } from "../src/settings";
import { IDLE_TURN_MS, everyVisible } from "../src/idle-turns";
import type { Mood } from "../src/mood";

beforeAll(() => {
  class Quiet { observe() {} unobserve() {} disconnect() {} }
  vi.stubGlobal("IntersectionObserver", Quiet);
  vi.stubGlobal("ResizeObserver", Quiet);
  vi.stubGlobal("matchMedia", (q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {} }));
  HTMLCanvasElement.prototype.getContext = (() => null) as never;
});
afterEach(() => { vi.useRealTimers(); setHidden(false); });

let hidden = false;
Object.defineProperty(document, "hidden", { configurable: true, get: () => hidden });
function setHidden(h: boolean) { hidden = h; document.dispatchEvent(new Event("visibilitychange")); }

const app = await loadPluginApp(() => import("../app"));
const banner = app.composerCustomizations[0]!.banners![0]!;
const now = Date.now();
const idle: Mood = { kind: "idle", turnStartedAt: null, resetsAt: null, since: now - 60_000, run: 3, lastStart: null };
const working: Mood = { kind: "working", turnStartedAt: now - 65_000, resetsAt: null, since: now, run: 3 };
const ALWAYS: Prefs = { ...DEFAULT_PREFS, show: "always" };

let threads = 0;
function strip(opts: { mood: Mood; prefs?: Prefs; thread?: ThreadPrefs; isRunning?: boolean; state?: () => unknown }) {
  const threadId = `always-${++threads}`;
  const slot = renderSlot(banner as never, {} as never, {
    rpc: {
      prefs_get: () => opts.prefs ?? DEFAULT_PREFS,
      thread_prefs_get: () => opts.thread ?? { off: false, scene: null },
      state_get: opts.state ?? (() => ({ mood: opts.mood, steps: 0, crew: [] })),
      watch: () => ({ steps: 0 }),
      failure_dismiss: () => ({ ok: true }),
    } as never,
    composer: { scope: { kind: "thread", threadId } as never, isRunning: opts.isRunning ?? false },
  });
  const scene = () => (slot.container.querySelector("[data-scene]") as HTMLElement | null)?.dataset.scene ?? null;
  const mood = (m: Mood) => slot.emitRealtime("mood", { threadId, mood: m });
  return { slot, scene, mood, threadId };
}
const flush = () => act(async () => { await vi.advanceTimersByTimeAsync(0); });
const wait = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });
const fake = () => vi.useFakeTimers({ shouldAdvanceTime: false, toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "Date"] });

describe("everyVisible", () => {
  it("counts only time the page is visible", () => {
    fake();
    const fire = vi.fn();
    const stop = everyVisible(1000, fire);
    vi.advanceTimersByTime(600);
    setHidden(true);
    vi.advanceTimersByTime(5000);
    expect(fire).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);   // no timer runs while hidden
    setHidden(false);
    vi.advanceTimersByTime(399);
    expect(fire).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(fire).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1000);
    expect(fire).toHaveBeenCalledTimes(2);
    stop();
    vi.advanceTimersByTime(5000);
    expect(fire).toHaveBeenCalledTimes(2);
  });
});

describe("showing scenes only while the agent works (the default)", () => {
  it("shows nothing on an idle thread", async () => {
    fake();
    const s = strip({ mood: idle });
    await flush();
    expect(s.scene()).toBeNull();
    s.slot.lifecycle.unmount();
  });

  it("closes when the run ends", async () => {
    fake();
    const s = strip({ mood: working, isRunning: true });
    await flush();
    expect(s.scene()).not.toBeNull();
    await s.mood({ ...idle, run: 3, since: Date.now() });
    await wait(500);
    expect(s.scene()).toBeNull();
    s.slot.lifecycle.unmount();
  });
});

describe("showing scenes always", () => {
  it("shows the scene on an idle thread, playing as if working", async () => {
    fake();
    const s = strip({ mood: idle, prefs: ALWAYS });
    await flush();
    expect(s.scene()).not.toBeNull();
    expect(s.slot.getByText("Calm: idle")).toBeTruthy();
    s.slot.lifecycle.unmount();
  });

  it("stays open when the run ends, with the same scene", async () => {
    fake();
    const s = strip({ mood: working, prefs: ALWAYS, isRunning: true });
    await flush();
    const before = s.scene();
    expect(before).not.toBeNull();
    await s.mood({ ...idle, run: 3, since: Date.now() });
    await wait(500);
    expect(s.scene()).toBe(before);
    expect(s.slot.getByText("Calm: idle")).toBeTruthy();
    s.slot.lifecycle.unmount();
  });

  it("is still off in a thread set to Calm off here", async () => {
    fake();
    const s = strip({ mood: idle, prefs: ALWAYS, thread: { off: true, scene: null } });
    await flush();
    expect(s.scene()).toBeNull();
    s.slot.lifecycle.unmount();
  });

  it("moves to the next scene every 3 minutes while idle", async () => {
    fake();
    const s = strip({ mood: idle, prefs: ALWAYS });
    await flush();
    const first = s.scene();
    await wait(IDLE_TURN_MS - 1000);
    expect(s.scene()).toBe(first);
    await wait(1000);
    const second = s.scene();
    expect(second).not.toBe(first);
    await wait(IDLE_TURN_MS);
    expect(s.scene()).not.toBe(second);
    s.slot.lifecycle.unmount();
  });

  it("goes through every scene in the mix once, skipping left-out scenes", async () => {
    fake();
    const kept: SceneId[] = ["pond", "train", "garden", "kites"];
    const excluded = SCENES.map((x) => x.id as SceneId).filter((id) => !kept.includes(id));
    // Run 1: the mix's first bag, so four places show four different scenes.
    const s = strip({ mood: { ...idle, run: 1 }, prefs: { ...ALWAYS, excluded } });
    await flush();
    const seen = [s.scene()];
    for (let i = 1; i < kept.length; i++) { await wait(IDLE_TURN_MS); seen.push(s.scene()); }
    expect([...seen].sort()).toEqual([...kept].sort());
    s.slot.lifecycle.unmount();
  });

  it("moves on from the first scene on a thread that has never run", async () => {
    fake();
    const s = strip({ mood: { ...idle, run: 0 }, prefs: ALWAYS });
    await flush();
    const first = s.scene();
    await wait(IDLE_TURN_MS);
    expect(s.scene()).not.toBe(first);
    s.slot.lifecycle.unmount();
  });

  it("never changes scene during a run", async () => {
    fake();
    const s = strip({ mood: working, prefs: ALWAYS, isRunning: true });
    await flush();
    const first = s.scene();
    await wait(IDLE_TURN_MS * 3);
    expect(s.scene()).toBe(first);
    s.slot.lifecycle.unmount();
  });

  it("keeps a chosen scene, each thread's scene, and a pinned scene", async () => {
    fake();
    for (const opts of [
      { prefs: { ...ALWAYS, scene: "sea" as const } },
      { prefs: { ...ALWAYS, scene: "each-thread" as const } },
      { prefs: ALWAYS, thread: { off: false, scene: "space" as const } },
    ]) {
      const s = strip({ mood: idle, ...opts });
      await flush();
      const first = s.scene();
      expect(first).not.toBeNull();
      await wait(IDLE_TURN_MS * 3);
      expect(s.scene()).toBe(first);
      s.slot.lifecycle.unmount();
    }
  });

  it("waits for the project before showing one scene per project", async () => {
    fake();
    let answer: (s: unknown) => void = () => {};
    const s = strip({ mood: idle, prefs: { ...ALWAYS, scene: "each-project" }, state: () => new Promise((r) => { answer = r; }) });
    // A project whose scene differs from the thread's own, so a swap would show.
    const own = sceneFor(s.threadId, "each-thread").id;
    const projectId = Array.from({ length: 50 }, (_, i) => `prj_${i}`).find((p) => sceneFor(s.threadId, "each-project", 0, [], p).id !== own)!;
    const shown: string[] = [];
    new MutationObserver(() => { const id = s.scene(); if (id && shown.at(-1) !== id) shown.push(id); })
      .observe(s.slot.container, { subtree: true, childList: true, attributes: true });
    await flush();
    expect(s.scene()).toBeNull();
    await act(async () => { answer({ mood: idle, steps: 0, crew: [], projectId }); await vi.advanceTimersByTimeAsync(0); });
    expect(shown).toEqual([sceneFor(s.threadId, "each-project", 0, [], projectId).id]);
    s.slot.lifecycle.unmount();
    // If bb gives no project, the thread's own scene shows rather than nothing.
    const t = strip({ mood: idle, prefs: { ...ALWAYS, scene: "each-project" }, state: () => ({ mood: idle, steps: 0, crew: [], projectId: null }) });
    await flush();
    expect(t.scene()).toBe(sceneFor(t.threadId, "each-thread").id);
    t.slot.lifecycle.unmount();
  });

  it("does not change scene while the page is hidden", async () => {
    fake();
    const s = strip({ mood: idle, prefs: ALWAYS });
    await flush();
    const first = s.scene();
    setHidden(true);
    await wait(IDLE_TURN_MS * 3);
    expect(s.scene()).toBe(first);
    s.slot.lifecycle.unmount();
  });

  it("takes the next scene in the mix when a new run starts after idle moves", async () => {
    fake();
    const kept: SceneId[] = ["pond", "train", "garden"];
    const excluded = SCENES.map((x) => x.id as SceneId).filter((id) => !kept.includes(id));
    const s = strip({ mood: { ...idle, run: 1 }, prefs: { ...ALWAYS, excluded } });
    await flush();
    const first = s.scene();
    await wait(IDLE_TURN_MS);
    const second = s.scene();
    await s.mood({ ...working, run: 2, since: Date.now() });
    await wait(500);
    const third = s.scene();
    expect(new Set([first, second, third]).size).toBe(3);
    s.slot.lifecycle.unmount();
  });
});

describe("the Show scenes setting", () => {
  it("starts on While the agent works and saves Always", async () => {
    const saves: unknown[] = [];
    const section = app.settingsSections[0]!;
    const slot = renderSlot(section, {} as never, {
      rpc: {
        prefs_get: () => DEFAULT_PREFS,
        prefs_set: (change: unknown) => { saves.push(change); return { ...DEFAULT_PREFS, ...(change as object) }; },
      } as never,
    });
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
    const group = slot.getByRole("radiogroup", { name: "Show scenes" });
    const [works, always] = Array.from(group.querySelectorAll("[role=radio]")) as HTMLElement[];
    expect(works.textContent).toBe("While the agent works");
    expect(works.getAttribute("aria-checked")).toBe("true");
    act(() => always.click());
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
    expect(saves).toEqual([{ show: "always" }]);
    expect(always.getAttribute("aria-checked")).toBe("true");
    expect(slot.getByText(/next scene every 3 minutes while idle/)).toBeTruthy();
    slot.lifecycle.unmount();
  });
});
