// Client-side offline queue for stage events recorded on the mill floor.
// Events are stored in localStorage with a unique clientEventId; the server
// treats clientEventId as an idempotency key, so a queue flush can never
// create duplicate stage events.

export type QueuedEvent = {
  url: string;
  body: string;
  clientEventId: string;
  lotCode: string;
  stageName: string;
  savedAt: number;
};

const KEY = "sf_scan_queue";

export function getQueue(): QueuedEvent[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "[]") as QueuedEvent[];
  } catch {
    return [];
  }
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
  localStorage.setItem(KEY, JSON.stringify(queue));
  notifyQueueChanged();
}

export function removeFromQueue(clientEventId: string): void {
  localStorage.setItem(KEY, JSON.stringify(getQueue().filter((q) => q.clientEventId !== clientEventId)));
  notifyQueueChanged();
}

export type FlushResult = { synced: number; rejected: number; stillQueued: number; errors: string[] };

/**
 * Try to sync every queued event. Server-side validation failures (4xx) are
 * removed and surfaced — retrying them would never succeed. Network failures
 * keep the event queued.
 */
export async function flushQueue(): Promise<FlushResult> {
  const queue = getQueue();
  let synced = 0;
  let rejected = 0;
  const errors: string[] = [];
  for (const item of queue) {
    try {
      const res = await fetch(item.url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: item.body,
      });
      if (res.ok || res.status === 409) {
        // 409 = already recorded / duplicate — safe to drop from the queue.
        removeFromQueue(item.clientEventId);
        synced++;
      } else if (res.status >= 400 && res.status < 500) {
        const data = await res.json().catch(() => ({}));
        errors.push(`${item.lotCode} @ ${item.stageName}: ${data.error ?? `rejected (${res.status})`}`);
        removeFromQueue(item.clientEventId);
        rejected++;
      }
      // 5xx and network errors: keep queued for the next attempt.
    } catch {
      // still offline — keep queued
    }
  }
  return { synced, rejected, stillQueued: getQueue().length, errors };
}
