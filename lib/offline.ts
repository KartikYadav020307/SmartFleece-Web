// Client-side offline queue for stage events recorded on the mill floor.
// Events are stored in localStorage with a unique clientEventId; the server
// treats clientEventId as an idempotency key, so a queue flush can never
// create duplicate stage events.
//
// Sync classification (classifyResponse):
//   "synced"   — server confirmed (2xx), including idempotent replays.
//   "rejected" — permanent rejection (400/403/404/409). Resending the
//                unchanged payload can never succeed, so the event is KEPT in
//                the queue with its rejection details for worker review,
//                correction or explicit dismissal — never counted as synced
//                and never silently resubmitted.
//   "retry"    — 401 (session may recover after re-authentication), 5xx and
//                unknown statuses: stay queued unchanged and are retried on
//                the next flush / reconnect, retaining the original
//                clientEventId.

export type QueuedEvent = {
  url: string;
  body: string;
  clientEventId: string;
  lotCode: string;
  stageName: string;
  savedAt: number;
  rejectedAt?: number;
  rejectedStatus?: number;
  rejectionReason?: string;
  /** True while a linked replacement scan has been initiated for this event. */
  resolutionPending?: boolean;
  /** Set on a replacement event: the original rejected event it supersedes. */
  resolvesClientEventId?: string;
};

const KEY = "sf_scan_queue";
const RESOLVED_KEY = "sf_scan_resolved";
const RESOLVED_CAP = 20;

export function getQueue(): QueuedEvent[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "[]") as QueuedEvent[];
  } catch {
    return [];
  }
}

function setQueue(queue: QueuedEvent[]): void {
  localStorage.setItem(KEY, JSON.stringify(queue));
  notifyQueueChanged();
}

/** Rejections that were superseded by a linked replacement scan, for audit. */
export type ResolvedEvent = QueuedEvent & { resolvedAt: number; outcome: "replacement_queued_offline" | "replacement_synced" };

export function getResolvedEvents(): ResolvedEvent[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(RESOLVED_KEY) ?? "[]") as ResolvedEvent[];
  } catch {
    return [];
  }
}

function pushResolved(event: QueuedEvent, outcome: ResolvedEvent["outcome"]): void {
  const resolved = getResolvedEvents();
  resolved.unshift({ ...event, resolvedAt: Date.now(), outcome });
  localStorage.setItem(RESOLVED_KEY, JSON.stringify(resolved.slice(0, RESOLVED_CAP)));
}

function notifyQueueChanged() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("sf-queue-changed"));
  }
}

export function enqueue(item: QueuedEvent): void {
  const queue = getQueue();
  if (queue.some((q) => q.clientEventId === item.clientEventId)) return;
  queue.push(item);
  setQueue(queue);
  // A replacement event that is safely persisted retires the original
  // rejected event it explicitly links to — and only that one.
  if (item.resolvesClientEventId) {
    retireResolved(item.resolvesClientEventId, "replacement_queued_offline");
  }
}

export function removeFromQueue(clientEventId: string): void {
  setQueue(getQueue().filter((q) => q.clientEventId !== clientEventId));
  notifyQueueChanged();
}

/** Explicit worker decision to abandon the re-scan initiated for an event. */
export function cancelResolutionPending(clientEventId: string): void {
  setQueue(
    getQueue().map((q) =>
      q.clientEventId === clientEventId ? { ...q, resolutionPending: false } : q
    )
  );
}

/** Mark the event as awaiting a linked replacement scan (payload preserved). */
export function markResolutionPending(clientEventId: string): void {
  setQueue(
    getQueue().map((q) =>
      q.clientEventId === clientEventId ? { ...q, resolutionPending: true } : q
    )
  );
}

/**
 * Retire a rejected original event after its explicitly linked replacement is
 * confirmed successful or safely persisted. The rejection details move to the
 * resolved-event record rather than being discarded. No-op if the event is
 * absent (e.g. already retired).
 */
export function retireResolved(clientEventId: string, outcome: ResolvedEvent["outcome"]): void {
  const queue = getQueue();
  const event = queue.find((q) => q.clientEventId === clientEventId);
  if (!event) return;
  setQueue(queue.filter((q) => q.clientEventId !== clientEventId));
  pushResolved(event, outcome);
}

/**
 * When a linked replacement syncs successfully after being queued offline,
 * update its original's resolved record to replacement_synced instead of
 * creating a duplicate.
 */
function promoteResolvedOutcome(originalClientEventId: string): void {
  const resolved = getResolvedEvents();
  const idx = resolved.findIndex((r) => r.clientEventId === originalClientEventId);
  if (idx === -1) return;
  resolved[idx] = { ...resolved[idx], outcome: "replacement_synced", resolvedAt: Date.now() };
  localStorage.setItem(RESOLVED_KEY, JSON.stringify(resolved));
}

/** How an HTTP status from the sync endpoint should be handled. */
export type ResponseClass = "synced" | "rejected" | "retry";

export function classifyResponse(status: number): ResponseClass {
  if (status >= 200 && status < 300) return "synced";
  if (status === 400 || status === 403 || status === 404 || status === 409) return "rejected";
  return "retry";
}

function markRejected(clientEventId: string, status: number, reason: string): void {
  setQueue(
    getQueue().map((q) =>
      q.clientEventId === clientEventId
        ? { ...q, rejectedAt: Date.now(), rejectedStatus: status, rejectionReason: reason }
        : q
    )
  );
}

export type FlushResult = {
  /** Server-confirmed events (removed from the queue). */
  synced: number;
  /** Permanently rejected events kept for review — NOT synced. */
  rejected: number;
  /** Retryable events still awaiting synchronization. */
  retryable: number;
  errors: string[];
};

/**
 * Attempt to sync every queued event. Rejected events are skipped by design
 * (no tight-loop resubmission of a known conflict); retryable events stay
 * queued unchanged on network/5xx failures. Successes retire their original
 * rejected event when the event explicitly links to one.
 */
export async function flushQueue(): Promise<FlushResult> {
  const queue = getQueue();
  let synced = 0;
  let rejected = 0;
  const errors: string[] = [];
  for (const item of queue) {
    if (item.rejectedAt) continue; // held for worker review — never auto-resubmitted
    try {
      const res = await fetch(item.url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: item.body,
      });
      const cls = classifyResponse(res.status);
      if (cls === "synced") {
        removeFromQueue(item.clientEventId);
        if (item.resolvesClientEventId) {
          promoteResolvedOutcome(item.resolvesClientEventId);
        }
        synced++;
      } else if (cls === "rejected") {
        const data = await res.json().catch(() => ({}));
        const reason = data.error ?? `Rejected by server (HTTP ${res.status})`;
        markRejected(item.clientEventId, res.status, reason);
        rejected++;
        errors.push(`${item.lotCode} @ ${item.stageName}: ${reason}`);
      }
      // "retry": leave untouched for the next flush / reconnect.
    } catch {
      // still offline — keep queued unchanged for idempotent replay
    }
  }
  const remaining = getQueue();
  return {
    synced,
    rejected,
    retryable: remaining.filter((q) => !q.rejectedAt).length,
    errors,
  };
}
