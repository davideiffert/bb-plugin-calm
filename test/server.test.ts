// The server's step counting and cleanup, driven through a stand-in for bb's
// plugin API: events go in, realtime messages and RPC answers come out.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import plugin from "../server";
import { fakeBb, type Row } from "./fake-bb";

const step = (seq: number, at = Date.now()): Row => ({ seq, createdAt: at, data: { item: { type: "toolCall" } } });
const stepsOf = (f: ReturnType<typeof fakeBb>, id: string) =>
  f.published.filter((p) => p.channel === "step" && p.payload.threadId === id).at(-1)?.payload.steps ?? 0;

describe("server step counting", () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date(2026, 9, 4, 12, 0)); });
  afterEach(() => { vi.useRealTimers(); });

  async function watchedRun() {
    const f = fakeBb();
    await plugin(f.bb as never);
    await f.emit("thread.active", { thread: f.thread("t") });
    await f.rpc.state_get({ threadId: "t" });   // a strip opens and starts watching
    return f;
  }

  it("counts every step once, in batches", async () => {
    const f = await watchedRun();
    f.rows.push(step(1), step(2));
    await f.emit("experimental_thread.events", { thread: f.thread("t"), sequence: 2 });
    await vi.runAllTimersAsync();
    f.rows.push(step(3));
    await f.emit("experimental_thread.events", { thread: f.thread("t"), sequence: 3 });
    await vi.runAllTimersAsync();
    expect(stepsOf(f, "t")).toBe(3);
  });

  it("a failed page commits nothing, and the retry counts everything", async () => {
    const f = await watchedRun();
    for (let i = 1; i <= 101; i++) f.rows.push(step(i));
    f.fail.pages.add(f.calls + 1);   // the second page of the next count fails
    await f.emit("experimental_thread.events", { thread: f.thread("t"), sequence: 101 });
    await vi.runAllTimersAsync();
    expect(stepsOf(f, "t")).toBe(101);
  });

  it("counts the last steps when the run ends", async () => {
    const f = await watchedRun();
    f.rows.push(step(1));
    await f.emit("experimental_thread.events", { thread: f.thread("t"), sequence: 1 });
    await vi.runAllTimersAsync();
    f.rows.push(step(2));
    await f.emit("experimental_thread.events", { thread: f.thread("t", "idle"), sequence: 2 });
    await vi.runAllTimersAsync();
    expect(stepsOf(f, "t")).toBe(2);
  });

  it("still counts steps when the run ends while they are being read", async () => {
    const f = await watchedRun();
    f.rows.push(step(1));
    await f.emit("experimental_thread.events", { thread: f.thread("t"), sequence: 1 });
    await vi.runAllTimersAsync();
    f.rows.push(step(2));
    await f.emit("experimental_thread.events", { thread: f.thread("t"), sequence: 2 });
    await f.emit("thread.idle", { thread: f.thread("t", "idle") });   // the run ends before the read
    await f.emit("experimental_thread.events", { thread: f.thread("t", "idle"), sequence: 2 });
    await vi.runAllTimersAsync();
    expect(stepsOf(f, "t")).toBe(2);
  });

  it("a header choice that storage rejects is not kept", async () => {
    const f = await watchedRun();
    f.kvFail.on = true;
    await expect(f.rpc.thread_prefs_set({ threadId: "t", off: true })).rejects.toThrow();
    f.kvFail.on = false;
    expect(await f.rpc.thread_prefs_get({ threadId: "t" })).toEqual({ off: false, scene: null });
  });

  it("a child archived during the crew lookup stays gone", async () => {
    const f = fakeBb();
    await plugin(f.bb as never);
    f.setChildren([f.thread("kid", "active", "p")]);
    const hold = f.holdList();
    const asking = f.rpc.state_get({ threadId: "p" });
    await hold.started;   // the crew read is out
    await f.emit("thread.archived", { thread: f.thread("kid", "active", "p") });
    hold.open();
    const state = await asking;
    expect(state.crew).toEqual([]);
  });

  it("drops counts for a thread archived while its history was being read", async () => {
    const f = await watchedRun();
    f.rows.push(step(1), step(2));
    await f.emit("experimental_thread.events", { thread: f.thread("t"), sequence: 2 });
    const before = f.published.length;
    await f.emit("thread.archived", { thread: f.thread("t") });
    await vi.runAllTimersAsync();
    expect(f.published.slice(before).filter((p) => p.channel === "step")).toHaveLength(0);
  });
});
