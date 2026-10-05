// The pre-launch fixes on the server: overlapping runs keep their steps,
// opened failures stay dismissed across restarts, "waiting on you" always
// clears, Calm loads without bb's experimental events, and muted threads
// count nothing.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import plugin from "../server";
import { fakeBb, type Row } from "./fake-bb";

const step = (seq: number, at = Date.now()): Row => ({ seq, createdAt: at, data: { item: { type: "toolCall" } } });
const last = (f: ReturnType<typeof fakeBb>, channel: string, id: string) =>
  f.published.filter((p) => p.channel === channel && p.payload.threadId === id).at(-1)?.payload;

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date(2026, 9, 5, 12, 0)); });
afterEach(() => { vi.useRealTimers(); });

describe("overlapping runs", () => {
  it("a run that starts while the last one's steps are being read keeps its own steps", async () => {
    const f = fakeBb();
    await plugin(f.bb as never);
    await f.emit("thread.active", { thread: f.thread("t") });
    await f.rpc.state_get({ threadId: "t" });
    f.rows.push(step(1), step(2));
    await f.emit("experimental_thread.events", { thread: f.thread("t"), sequence: 2 });
    await vi.runAllTimersAsync();
    expect(last(f, "step", "t").steps).toBe(2);

    // The next read is held open while the run ends and a new one starts.
    const hold = f.holdEvents();
    await f.emit("experimental_thread.events", { thread: f.thread("t"), sequence: 3 });
    await vi.advanceTimersByTimeAsync(2100);
    await hold.asked;
    await f.emit("thread.idle", { thread: f.thread("t", "idle") });
    vi.setSystemTime(Date.now() + 10_000);   // well past a quick resume: a new run
    await f.emit("thread.active", { thread: f.thread("t") });
    f.rows.push(step(3));                    // the new run's first action
    hold.open();
    await vi.runAllTimersAsync();
    expect(last(f, "step", "t").steps).toBe(1);
  });
});

describe("overlapping runs, codex review", () => {
  it("a run that starts and finishes during the read still gets only its own steps", async () => {
    const f = fakeBb();
    await plugin(f.bb as never);
    await f.emit("thread.active", { thread: f.thread("t") });
    await f.rpc.state_get({ threadId: "t" });
    f.rows.push(step(1));
    await f.emit("experimental_thread.events", { thread: f.thread("t"), sequence: 1 });
    await vi.runAllTimersAsync();
    const hold = f.holdEvents();
    await f.emit("experimental_thread.events", { thread: f.thread("t"), sequence: 2 });
    await vi.advanceTimersByTimeAsync(2100);
    await hold.asked;
    await f.emit("thread.idle", { thread: f.thread("t", "idle") });
    vi.setSystemTime(Date.now() + 10_000);
    await f.emit("thread.active", { thread: f.thread("t") });
    f.rows.push(step(2));
    await f.emit("thread.idle", { thread: f.thread("t", "idle") });   // the new run ends too
    hold.open();
    await vi.runAllTimersAsync();
    expect(last(f, "step", "t").steps).toBe(1);
  });
});

describe("failed helpers you have opened", () => {
  const FAILED_AT = new Date(2026, 9, 5, 11, 59).getTime();   // bb's record of when the helper failed
  async function failedHelper(kv = new Map<string, unknown>()) {
    const f = fakeBb({ kv });
    await plugin(f.bb as never);
    f.setChildren([f.thread("kid", "error", "p", FAILED_AT)]);
    const s = await f.rpc.state_get({ threadId: "p" });
    return { f, s, kv };
  }

  it("alert until opened, then stay dismissed after a restart", async () => {
    const { f, s, kv } = await failedHelper();
    expect(s.crew).toMatchObject([{ id: "kid", kind: "error" }]);
    expect(s.crew[0].dismissed).toBeUndefined();
    await f.rpc.failure_dismiss({ threadId: "kid" });
    expect(last(f, "crew", "p").crew[0].dismissed).toBe(true);
    // bb restarts: a fresh server rebuilds the failure from bb's record.
    vi.setSystemTime(Date.now() + 3_600_000);
    const again = await failedHelper(kv);
    expect(again.s.crew[0].dismissed).toBe(true);
  });

  it("stay dismissed when bb's record changes later for another reason", async () => {
    const { f, kv } = await failedHelper();
    await f.rpc.failure_dismiss({ threadId: "kid" });
    vi.setSystemTime(Date.now() + 3_600_000);
    const g = fakeBb({ kv });
    await plugin(g.bb as never);
    g.setChildren([g.thread("kid", "error", "p", Date.now())]);   // renamed or read: a newer update time, same failure
    const s = await g.rpc.state_get({ threadId: "p" });
    expect(s.crew[0].dismissed).toBe(true);
  });

  it("opening the helper from anywhere dismisses it", async () => {
    const { f } = await failedHelper();
    await f.rpc.state_get({ threadId: "kid" });   // its own strip opened: you are looking at it
    expect(last(f, "crew", "p").crew[0].dismissed).toBe(true);
  });

  it("a helper that runs again and fails again alerts afresh", async () => {
    const { f } = await failedHelper();
    await f.rpc.failure_dismiss({ threadId: "kid" });
    vi.setSystemTime(Date.now() + 120_000);
    await f.emit("thread.active", { thread: f.thread("kid", "active", "p") });
    vi.setSystemTime(Date.now() + 120_000);
    await f.emit("thread.failed", { thread: f.thread("kid", "error", "p", Date.now()) });
    expect(last(f, "crew", "p").crew[0]).toMatchObject({ kind: "error" });
    expect(last(f, "crew", "p").crew[0].dismissed).toBeUndefined();
  });
});

describe("waiting on you", () => {
  it("clears once the question is answered, even with no thread events", async () => {
    const f = fakeBb({ refuseEvents: ["experimental_thread.events"] });
    await plugin(f.bb as never);
    const stop = new AbortController();
    void f.services[0].start(stop.signal);
    await f.emit("thread.active", { thread: f.thread("t") });
    f.pending.add("t");
    await f.emit("interaction.pending", { thread: f.thread("t") });
    await f.rpc.state_get({ threadId: "t" });
    expect(last(f, "mood", "t").mood.kind).toBe("waiting");
    await vi.advanceTimersByTimeAsync(16_000);
    expect(last(f, "mood", "t").mood.kind).toBe("waiting");   // still open: still waiting
    f.pending.delete("t");                                     // you answered
    await vi.advanceTimersByTimeAsync(16_000);
    expect(last(f, "mood", "t").mood.kind).toBe("working");
    stop.abort();
  });

  it("clears a helper's question in the parent's alert, even with no thread events", async () => {
    const f = fakeBb({ refuseEvents: ["experimental_thread.events"] });
    await plugin(f.bb as never);
    const stop = new AbortController();
    void f.services[0].start(stop.signal);
    f.setChildren([f.thread("kid", "active", "p")]);
    f.pending.add("kid");
    await f.rpc.state_get({ threadId: "p" });   // the parent's strip is open; the helper is not
    expect(last(f, "crew", "p")?.crew ?? (await f.rpc.state_get({ threadId: "p" })).crew).toMatchObject([{ id: "kid", kind: "waiting" }]);
    f.pending.delete("kid");
    await vi.advanceTimersByTimeAsync(16_000);
    expect(last(f, "crew", "p").crew).toMatchObject([{ id: "kid", kind: "working" }]);
    stop.abort();
  });

  it("Calm still loads and shows moods if bb drops its experimental thread events", async () => {
    const f = fakeBb({ refuseEvents: ["experimental_thread.events"] });
    await plugin(f.bb as never);
    await f.emit("thread.active", { thread: f.thread("t") });
    const s = await f.rpc.state_get({ threadId: "t" });
    expect(s.mood.kind).toBe("working");
  });
});

describe("Calm off in a thread", () => {
  it("counts no steps there", async () => {
    const f = fakeBb();
    await plugin(f.bb as never);
    await f.emit("thread.active", { thread: f.thread("t") });
    await f.rpc.thread_prefs_set({ threadId: "t", off: true });
    await f.rpc.state_get({ threadId: "t" });
    const calls = f.calls;
    f.rows.push(step(1), step(2));
    await f.emit("experimental_thread.events", { thread: f.thread("t"), sequence: 2 });
    await vi.runAllTimersAsync();
    expect(f.calls).toBe(calls);   // no history reads at all
    expect(last(f, "step", "t")).toBeUndefined();
  });

  it("muting cancels a count already queued", async () => {
    const f = fakeBb();
    await plugin(f.bb as never);
    await f.emit("thread.active", { thread: f.thread("t") });
    await f.rpc.state_get({ threadId: "t" });
    await vi.runAllTimersAsync();
    const before = f.published.filter((p) => p.channel === "step").length, calls = f.calls;
    f.rows.push(step(1));
    await f.emit("experimental_thread.events", { thread: f.thread("t"), sequence: 1 });   // a count is queued
    await f.rpc.thread_prefs_set({ threadId: "t", off: true });
    await vi.runAllTimersAsync();
    expect(f.calls).toBe(calls);
    expect(f.published.filter((p) => p.channel === "step").length).toBe(before);
  });
});
