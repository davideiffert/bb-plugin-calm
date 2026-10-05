// A stand-in for bb's plugin API, shared by the server tests: events go in,
// realtime messages and RPC answers come out.
export interface Row { seq: number; createdAt: number; data: { item: { type: string } } }

export function fakeBb(opts: { kv?: Map<string, unknown>; refuseEvents?: string[] } = {}) {
  const handlers = new Map<string, ((e: any) => unknown)[]>();
  const published: { channel: string; payload: any }[] = [];
  const kv = opts.kv ?? new Map<string, unknown>();
  const kvFail = { on: false };
  let children: ReturnType<typeof thread>[] = [];
  let listGate: Promise<void> = Promise.resolve();
  let listed: () => void = () => {};
  let rpc: Record<string, (input: any) => any> = {};
  const rows: Row[] = [];
  const fail = { pages: new Set<number>() };   // which events.list calls throw, by call number
  let calls = 0;
  const thread = (id: string, status = "active", parentThreadId: string | null = null, updatedAt?: number) =>
    ({ id, status, parentThreadId, title: id, titleFallback: null, archivedAt: null, ...(updatedAt === undefined ? {} : { updatedAt }) });
  const pending = new Set<string>();   // threads with an open question
  const services: { start: (signal: AbortSignal) => Promise<void> }[] = [];
  let eventsGate: Promise<void> | null = null, eventsAsked: () => void = () => {};
  const bb = {
    events: { on: (name: string, fn: (e: any) => unknown) => {
      if (opts.refuseEvents?.includes(name)) throw new Error(`unknown event ${name}`);
      handlers.set(name, [...(handlers.get(name) ?? []), fn]);
    } },
    realtime: { publish: (channel: string, payload: unknown) => published.push({ channel, payload }) },
    storage: { kv: { get: async (k: string) => kv.get(k), set: async (k: string, v: unknown) => { if (kvFail.on) throw new Error("disk"); kv.set(k, v); } } },
    rpc: { register: (_c: unknown, h: typeof rpc) => { rpc = h; } },
    background: { schedule: () => {}, service: (_n: string, s: (typeof services)[number]) => { services.push(s); } },
    log: { debug: () => {}, warn: () => {}, info: () => {}, error: () => {} },
    sdk: { threads: {
      get: async ({ threadId }: { threadId: string }) => thread(threadId),
      list: async () => { listed(); await listGate; return children; },
      interactions: { list: async ({ threadId }: { threadId: string }) => (pending.has(threadId) ? [{ status: "pending" }] : []) },
      events: { list: async (q: { afterSeq?: string; beforeSeq?: string; order: string; limit: string }) => {
        const n = calls++;
        if (eventsGate) { eventsAsked(); await eventsGate; }
        if (fail.pages.has(n)) throw new Error("network");
        let r = rows.slice();
        if (q.afterSeq) r = r.filter((x) => x.seq > Number(q.afterSeq));
        if (q.beforeSeq) r = r.filter((x) => x.seq < Number(q.beforeSeq));
        if (q.order === "desc") r.reverse();
        return r.slice(0, Number(q.limit));
      } },
    } },
  };
  const emit = async (name: string, e: unknown) => { for (const fn of handlers.get(name) ?? []) await fn(e); };
  return {
    bb, emit, published, rows, fail, thread, kvFail, kv, pending, services, handlers,
    /** Hold the next history read open; resolves `asked` once bb has been asked. */
    holdEvents: () => {
      let open!: () => void;
      eventsGate = new Promise((r) => { open = r; });
      const asked = new Promise<void>((r) => { eventsAsked = r; });
      return { open: () => { eventsGate = null; open(); }, asked };
    },
    get rpc() { return rpc; }, get calls() { return calls; },
    setChildren: (c: ReturnType<typeof thread>[]) => { children = c; },
    /** Hold the next crew read open; resolves `started` once bb has been asked. */
    holdList: () => {
      let open!: () => void;
      listGate = new Promise((r) => { open = r; });
      const started = new Promise<void>((r) => { listed = r; });
      return { open: () => open(), started };
    },
  };
}
