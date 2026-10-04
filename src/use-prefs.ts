// Calm's settings, each thread's own choice, and today's numbers: read once,
// then kept live across windows. A live update that lands while the first
// read is still out is newer, so the read never overwrites it.
import { useCallback, useEffect, useRef, useState } from "react";
import { useRealtime, useRealtimeConnectionState, useRpc } from "@get-bb/plugin-sdk/app";
import type { ThreadPrefsSignal, rpcContract } from "../server";
import { options } from "./scenes/common";
import {
  DEFAULT_PREFS, DEFAULT_THREAD_PREFS, cleanPrefs, cleanThreadPrefs,
  type DayStats, type Features, type Prefs, type ThreadPrefs,
} from "./settings";

export type PrefsChange = Partial<Omit<Prefs, "features">> & { features?: Partial<Features> };

export function usePrefs(): { prefs: Prefs; save: (change: PrefsChange) => Promise<void> } {
  const rpc = useRpc<typeof rpcContract>();
  const connection = useRealtimeConnectionState();
  const [prefs, setPrefs] = useState<Prefs>(DEFAULT_PREFS);
  const version = useRef(0);   // bumped by every live update and save
  useEffect(() => {
    let live = true;
    const asked = version.current;
    rpc.call("prefs_get", null).then((p) => { if (live && version.current === asked) setPrefs(cleanPrefs(p)); }, () => {});
    return () => { live = false; };
  }, [rpc, connection]);
  useRealtime("prefs", (payload) => { version.current++; setPrefs(cleanPrefs(payload)); });
  // The scenes read these page-wide switches as they draw.
  useEffect(() => {
    options.surprises = prefs.features.surprises;
    options.ambient = prefs.features.ambient;
  }, [prefs.features.surprises, prefs.features.ambient]);
  const save = useCallback(async (change: PrefsChange) => {
    const mine = ++version.current;
    setPrefs((p) => ({ ...p, ...change, features: { ...p.features, ...change.features } }));   // show the choice at once
    let saved: Prefs;
    try { saved = cleanPrefs(await rpc.call("prefs_set", change)); } catch (e) {
      // Show what is really saved, then let the caller report the failure.
      rpc.call("prefs_get", null).then((p) => { if (version.current === mine) setPrefs(cleanPrefs(p)); }, () => {});
      throw e;
    }
    if (version.current === mine) setPrefs(saved);   // a newer change or live update wins
  }, [rpc]);
  return { prefs, save };
}

export function useThreadPrefs(threadId: string): {
  threadPrefs: ThreadPrefs;
  saveThread: (change: Partial<ThreadPrefs>) => Promise<void>;
  error: string;
} {
  const rpc = useRpc<typeof rpcContract>();
  const connection = useRealtimeConnectionState();
  const [state, setState] = useState<{ threadId: string; prefs: ThreadPrefs }>({ threadId, prefs: DEFAULT_THREAD_PREFS });
  const [error, setError] = useState("");
  const version = useRef(0);
  const current = useRef(threadId);
  current.current = threadId;
  // Only ever show this thread's choice, even while a reused component switches threads.
  const set = (id: string, prefs: ThreadPrefs) => { if (current.current === id) setState({ threadId: id, prefs }); };
  useEffect(() => {
    let live = true;
    const asked = ++version.current;
    setError("");
    rpc.call("thread_prefs_get", { threadId }).then((p) => { if (live && version.current === asked) set(threadId, cleanThreadPrefs(p)); }, () => {});
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rpc, threadId, connection]);
  useRealtime("thread-prefs", (payload) => {
    const s = payload as ThreadPrefsSignal;
    if (s?.threadId === threadId) { version.current++; set(threadId, cleanThreadPrefs(s.prefs)); }
  });
  const saveThread = useCallback(async (change: Partial<ThreadPrefs>) => {
    const id = threadId, before = state.threadId === id ? state.prefs : DEFAULT_THREAD_PREFS;
    const mine = ++version.current;
    setError("");
    set(id, { ...before, ...change });
    try {
      const saved = cleanThreadPrefs(await rpc.call("thread_prefs_set", { threadId: id, ...change }));
      if (version.current === mine) set(id, saved);   // a newer change or live update wins
    } catch {
      if (current.current !== id) return;
      setError("Couldn't save. Try again.");
      // Show what is really saved.
      rpc.call("thread_prefs_get", { threadId: id }).then((p) => { if (version.current === mine) set(id, cleanThreadPrefs(p)); }, () => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rpc, threadId, state]);
  const threadPrefs = state.threadId === threadId ? state.prefs : DEFAULT_THREAD_PREFS;
  return { threadPrefs, saveThread, error };
}

export function useDayStats(): DayStats | null {
  const rpc = useRpc<typeof rpcContract>();
  const connection = useRealtimeConnectionState();
  const [stats, setStats] = useState<DayStats | null>(null);
  const [day, setDay] = useState(0);   // bumps to read again
  const version = useRef(0);
  // A page left open overnight starts the new day at zero: read again when the
  // bb host's day ends (it says when), and whenever the page comes back.
  useEffect(() => {
    const ends = stats?.nextDayAt;
    const t = ends ? setTimeout(() => setDay((d) => d + 1), Math.max(1000, ends - Date.now() + 5000)) : 0;
    const back = () => { if (!document.hidden) setDay((d) => d + 1); };
    document.addEventListener("visibilitychange", back);
    return () => { if (t) clearTimeout(t); document.removeEventListener("visibilitychange", back); };
  }, [stats?.nextDayAt]);
  useEffect(() => {
    let live = true;
    const asked = version.current;
    rpc.call("stats_get", null).then((s) => { if (live && version.current === asked) setStats(s); }, () => {});
    return () => { live = false; };
  }, [rpc, connection, day]);
  useRealtime("stats", (payload) => { version.current++; setStats(payload as DayStats); });
  return stats;
}
