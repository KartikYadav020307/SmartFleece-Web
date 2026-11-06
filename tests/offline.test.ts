import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cancelResolutionPending,
  classifyResponse,
  enqueue,
  flushQueue,
  getQueue,
  getResolvedEvents,
  markResolutionPending,
  removeFromQueue,
  retireResolved,
  type QueuedEvent,
} from "../lib/offline";

// Minimal browser shims: lib/offline.ts touches window + localStorage guarded
// by typeof checks, so defining them here makes the module testable in node.
const store = new Map<string, string>();

beforeEach(() => {
  store.clear();
  vi.stubGlobal("window", { dispatchEvent: () => undefined });
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function makeEvent(over: Partial<QueuedEvent> = {}): QueuedEvent {
  const base = {
    url: "/api/lots/lot-1/events",
    clientEventId: "evt-1",
    lotCode: "LOT-TEST01",
    stageName: "Washing",
    savedAt: 1_000,
    ...over,
  };
  // The stored body mirrors the real form payload, including the idempotency key.
  const payload = { stageId: "stage-1", inputWeightG: 4000, notes: "bag 1", clientEventId: base.clientEventId };
  return { ...base, body: JSON.stringify(payload) };
}

describe("classifyResponse", () => {
  it("classifies 2xx as synced", () => {
    expect(classifyResponse(200)).toBe("synced");
    expect(classifyResponse(201)).toBe("synced");
    expect(classifyResponse(204)).toBe("synced");
  });

  it("classifies permanent rejections as rejected", () => {
    expect(classifyResponse(400)).toBe("rejected");
    expect(classifyResponse(403)).toBe("rejected");
    expect(classifyResponse(404)).toBe("rejected");
    expect(classifyResponse(409)).toBe("rejected");
  });

  it("classifies 401, server errors and unknowns as retry", () => {
    expect(classifyResponse(401)).toBe("retry");
    expect(classifyResponse(500)).toBe("retry");
    expect(classifyResponse(502)).toBe("retry");
  });
});

describe("flushQueue — success and idempotent replay", () => {
  it("removes a synced event and reports counts", async () => {
    enqueue(makeEvent());
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await flushQueue();

    expect(result.synced).toBe(1);
    expect(result.rejected).toBe(0);
    expect(result.retryable).toBe(0);
    expect(getQueue()).toHaveLength(0);
  });

  it("resends the identical payload with the original clientEventId on replay", async () => {
    const event = makeEvent({ clientEventId: "evt-dup" });
    enqueue(event);
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true, duplicate: true }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await flushQueue();
    // Simulate the same event being replayed after a reconnect.
    enqueue({ ...event, savedAt: 2_000 });
    const result = await flushQueue();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(JSON.parse(String(init.body)).clientEventId).toBe("evt-dup");
    expect(result.synced).toBe(1);
    expect(getQueue()).toHaveLength(0);
  });
});

describe("flushQueue — conflicts", () => {
  it("keeps a 409 event in the queue with status and reason, never counted as synced", async () => {
    enqueue(makeEvent());
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: 'This lot is currently at "Pre-Sort", not the submitted stage.' }), { status: 409 })
      )
    );

    const result = await flushQueue();

    expect(result.synced).toBe(0);
    expect(result.rejected).toBe(1);
    expect(result.errors).toHaveLength(1);
    const kept = getQueue();
    expect(kept).toHaveLength(1);
    expect(kept[0].rejectedStatus).toBe(409);
    expect(kept[0].rejectionReason).toContain("Pre-Sort");
    expect(kept[0].rejectedAt).toBeDefined();
    // Payload is preserved verbatim for review.
    expect(JSON.parse(kept[0].body).inputWeightG).toBe(4000);
  });

  it("never automatically resubmits a rejected event", async () => {
    enqueue(makeEvent());
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: "conflict" }), { status: 409 }));
    vi.stubGlobal("fetch", fetchMock);
    await flushQueue();

    const fetchMock2 = vi.fn();
    vi.stubGlobal("fetch", fetchMock2);
    const result = await flushQueue();

    expect(fetchMock2).not.toHaveBeenCalled();
    expect(result.synced).toBe(0);
    expect(result.rejected).toBe(0);
    expect(getQueue()).toHaveLength(1); // still held for review
  });

  it("keeps the payload and details until an explicit dismissal", async () => {
    enqueue(makeEvent({ clientEventId: "evt-dismiss" }));
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: "lot on hold" }), { status: 409 })));
    await flushQueue();
    expect(getQueue()).toHaveLength(1);

    removeFromQueue("evt-dismiss"); // explicit worker decision
    expect(getQueue()).toHaveLength(0);
  });
});

describe("flushQueue — retryable failures", () => {
  it("keeps a 401 event queued (recoverable after re-authentication) then syncs it", async () => {
    enqueue(makeEvent());
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("unauthorized", { status: 401 })));

    let result = await flushQueue();
    expect(result.retryable).toBe(1);
    expect(result.rejected).toBe(0);
    expect(getQueue()[0].rejectedAt).toBeUndefined(); // not a rejection — retryable

    // Re-authenticated: the same clientEventId syncs successfully.
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 })));
    result = await flushQueue();
    expect(result.synced).toBe(1);
    expect(getQueue()).toHaveLength(0);
  });

  it("keeps events queued on network failure without marking them rejected", async () => {
    enqueue(makeEvent());
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("fetch failed")));

    const result = await flushQueue();

    expect(result.synced).toBe(0);
    expect(result.rejected).toBe(0);
    expect(result.retryable).toBe(1);
    const kept = getQueue()[0];
    expect(kept.rejectedAt).toBeUndefined();
    expect(JSON.parse(kept.body).inputWeightG).toBe(4000);
  });

  it("keeps events queued on server errors (5xx)", async () => {
    enqueue(makeEvent());
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("boom", { status: 500 })));

    const result = await flushQueue();

    expect(result.retryable).toBe(1);
    expect(result.rejected).toBe(0);
    expect(getQueue()).toHaveLength(1);
  });
});

describe("replacement lifecycle (resolvesClientEventId linkage)", () => {
  it("retires the linked original when its replacement is queued offline, and promotes the outcome when the replacement syncs", async () => {
    // Original rejected offline.
    enqueue(makeEvent({ clientEventId: "evt-orig" }));
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: "stale stage" }), { status: 409 })));
    await flushQueue();
    expect(getQueue()[0].rejectedStatus).toBe(409);

    // Worker starts a re-scan: original marked resolution-pending, payload retained.
    markResolutionPending("evt-orig");
    expect(getQueue()[0].resolutionPending).toBe(true);
    expect(getQueue()[0].body).toBe(makeEvent({ clientEventId: "evt-orig" }).body);

    // Replacement queued offline with an explicit link to the original — the
    // original is retired into the resolved record, not silently deleted.
    enqueue(makeEvent({ clientEventId: "evt-repl", resolvesClientEventId: "evt-orig" }));
    expect(getQueue().some((q) => q.clientEventId === "evt-orig")).toBe(false);
    let resolved = getResolvedEvents();
    expect(resolved).toHaveLength(1);
    expect(resolved[0].clientEventId).toBe("evt-orig");
    expect(resolved[0].outcome).toBe("replacement_queued_offline");
    expect(resolved[0].rejectedStatus).toBe(409);
    expect(resolved[0].rejectionReason).toContain("stale stage");

    // The replacement syncs cleanly and its original's record is promoted to
    // replacement_synced (updated in place, no duplicate record).
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 })));
    await flushQueue();
    expect(getQueue()).toHaveLength(0);
    resolved = getResolvedEvents();
    expect(resolved).toHaveLength(1);
    expect(resolved[0].outcome).toBe("replacement_synced");
  });

  it("keeps a re-conflicting replacement's rejection details independent of the original's resolved record", async () => {
    enqueue(makeEvent({ clientEventId: "evt-orig" }));
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: "stale stage" }), { status: 409 })));
    await flushQueue();

    // Replacement queued (retiring the original) but re-conflicts on sync.
    enqueue(makeEvent({ clientEventId: "evt-repl", resolvesClientEventId: "evt-orig" }));
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: "lot on hold" }), { status: 409 })));
    await flushQueue();

    // The replacement is held for review with its OWN details; the original's
    // resolved record keeps its queued-offline outcome. The worker must
    // resolve the replacement explicitly — nothing is auto-resubmitted.
    expect(getQueue()).toHaveLength(1);
    expect(getQueue()[0].clientEventId).toBe("evt-repl");
    expect(getQueue()[0].rejectionReason).toContain("on hold");
    expect(getResolvedEvents()).toHaveLength(1);
    expect(getResolvedEvents()[0].clientEventId).toBe("evt-orig");
    expect(getResolvedEvents()[0].outcome).toBe("replacement_queued_offline");
  });

  it("does not retire the original from a merely same-lot event without linkage", async () => {
    enqueue(makeEvent({ clientEventId: "evt-orig" }));
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: "stale stage" }), { status: 409 })));
    await flushQueue();

    // An unrelated re-scan of the same lot with no explicit linkage.
    enqueue(makeEvent({ clientEventId: "evt-unlinked", lotCode: "LOT-TEST01" }));

    expect(getQueue().some((q) => q.clientEventId === "evt-orig")).toBe(true);
    expect(getResolvedEvents()).toHaveLength(0);
  });

  it("allows the resolution marker to be cancelled, keeping the original for review", async () => {
    enqueue(makeEvent({ clientEventId: "evt-orig" }));
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: "stale stage" }), { status: 409 })));
    await flushQueue();
    markResolutionPending("evt-orig");

    cancelResolutionPending("evt-orig");

    expect(getQueue()[0].resolutionPending).toBe(false);
    expect(getQueue()[0].rejectedStatus).toBe(409);
    expect(getQueue()[0].body).toContain("4000");
  });
});

describe("resolution-pending events are held, not retried", () => {
  it("skips resolution-pending rejected events during flush", async () => {
    enqueue(makeEvent({ clientEventId: "evt-orig" }));
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: "stale stage" }), { status: 409 })));
    await flushQueue();
    markResolutionPending("evt-orig");

    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const result = await flushQueue();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.synced).toBe(0);
    expect(getQueue()).toHaveLength(1);
  });
});
