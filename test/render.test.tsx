// @vitest-environment jsdom
// Calm's three pieces of UI, rendered with the plugin SDK's own harness: the
// strip above the prompt box, the thread header control, and the settings
// section. jsdom has no canvas, so these check words, roles, and wiring, not
// pixels (the parity tool covers pixels).
import { act, fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { loadPluginApp, renderSlot } from "@get-bb/plugin-sdk/testing/app";
import { SCENES } from "../src/scenes";
import { DEFAULT_PREFS, type Prefs, type ThreadPrefs } from "../src/settings";
import type { Mood } from "../src/mood";

beforeAll(() => {
  // What jsdom lacks and Calm uses: observers and media queries.
  class Quiet { observe() {} unobserve() {} disconnect() {} }
  vi.stubGlobal("IntersectionObserver", Quiet);
  vi.stubGlobal("ResizeObserver", Quiet);
  vi.stubGlobal("matchMedia", (q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {} }));
  HTMLCanvasElement.prototype.getContext = (() => null) as never;
});
afterEach(() => { vi.useRealTimers(); });

const app = await loadPluginApp(() => import("../app"));
const working: Mood = { kind: "working", turnStartedAt: Date.now() - 65_000, resetsAt: null, since: Date.now(), run: 3 };

function rpcFor(opts: { prefs?: Prefs; thread?: ThreadPrefs; mood?: Mood; saves?: unknown[] } = {}) {
  const prefs = opts.prefs ?? DEFAULT_PREFS;
  return {
    prefs_get: () => prefs,
    prefs_set: (change: unknown) => { opts.saves?.push(change); return { ...prefs, ...(change as object), features: { ...prefs.features, ...((change as { features?: object }).features ?? {}) } }; },
    thread_prefs_get: () => opts.thread ?? { off: false, scene: null },
    thread_prefs_set: (change: unknown) => { opts.saves?.push(change); return { off: false, scene: null, ...(change as object) }; },
    state_get: () => ({ mood: opts.mood ?? working, steps: 4, crew: [] }),
    watch: () => ({ steps: 4 }),
    failure_dismiss: () => ({ ok: true }),
  };
}
const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });

describe("the thread header control", () => {
  const header = app.threadHeaderActions[0]!;

  it("names every pinned scene, never 'undefined'", async () => {
    for (const s of SCENES) {
      const slot = renderSlot(header, { threadId: "t1" } as never, { rpc: rpcFor({ thread: { off: false, scene: s.id as ThreadPrefs["scene"] } }) as never });
      await flush();
      const button = slot.getByRole("button");
      expect(button.getAttribute("aria-label")).toBe(`Calm: ${s.name} in this thread`);
      slot.lifecycle.unmount();
    }
  });

  it("shows the followed setting by name, and every scene as a choice", async () => {
    const slot = renderSlot(header, { threadId: "t1" } as never, { rpc: rpcFor({ prefs: { ...DEFAULT_PREFS, scene: "lighthouse" } }) as never });
    await flush();
    fireEvent.click(slot.getByRole("button"));
    expect(slot.getByText("(Lighthouse)")).toBeTruthy();
    expect(slot.getAllByRole("radio")).toHaveLength(SCENES.length + 1);
    expect(document.body.textContent).not.toContain("undefined");
    slot.lifecycle.unmount();
  });
});

describe("the settings section", () => {
  const section = app.settingsSections[0]!;

  it("offers all sixteen scenes and a Still pictures switch that saves", async () => {
    const saves: unknown[] = [];
    const slot = renderSlot(section, {} as never, { rpc: rpcFor({ saves }) as never });
    await flush();
    for (const s of SCENES) expect(slot.getAllByText(s.name).length).toBeGreaterThan(0);
    const still = slot.getByRole("checkbox", { name: /Still pictures/ });
    expect((still as HTMLInputElement).checked).toBe(false);
    fireEvent.click(still);
    await flush();
    expect(saves).toContainEqual({ features: { still: true } });
    slot.lifecycle.unmount();
  });
});

describe("the strip above the prompt box", () => {
  const banner = app.composerCustomizations[0]!.banners![0]!;
  const strip = (mood: Mood, isRunning: boolean) => renderSlot(banner as never, {} as never, {
    rpc: rpcFor({ mood }) as never,
    composer: { scope: { kind: "thread", threadId: "t1" } as never, isRunning },
  });

  it("says what the agent is doing, politely, and is reachable by keyboard", async () => {
    const slot = strip(working, true);
    await flush();
    const said = slot.getByText("Calm: Agent working");
    expect(said.getAttribute("aria-live")).toBe("polite");
    const box = slot.container.querySelector("[data-scene]") as HTMLElement;
    expect(box.tabIndex).toBe(0);
    act(() => box.focus());
    expect(screen.getByRole("tooltip").textContent).toMatch(/Working 1m/);
    act(() => box.blur());
    expect(screen.queryByRole("tooltip")).toBeNull();
    slot.lifecycle.unmount();
  });

  it("closes on its own if the run-ended event never comes", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const slot = strip(working, false);
    await flush();
    expect(slot.queryByText("Calm: Agent working")).not.toBeNull();
    await act(async () => { await vi.advanceTimersByTimeAsync(11_000); });
    await act(async () => { await vi.advanceTimersByTimeAsync(500); });
    expect(slot.container.querySelector("[data-scene]")).toBeNull();
    slot.lifecycle.unmount();
  });
});
