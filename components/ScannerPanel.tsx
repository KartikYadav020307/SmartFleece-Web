"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import StageEventForm from "@/components/StageEventForm";
import { Badge, Card } from "@/components/ui";
import { ConfirmButton } from "@/components/controls";
import { fmtWeight, timeAtStage } from "@/lib/format";
import {
  flushQueue,
  getQueue,
  cancelResolutionPending,
  markResolutionPending,
  removeFromQueue,
} from "@/lib/offline";

type LookupLot = {
  id: string;
  lotCode: string;
  status: string;
  fiberType: string;
  breed: string | null;
  color: string | null;
  greaseWeightG: number;
  currentWeightG: number;
  isBatch: boolean;
  openFlags: number;
  customerName: string;
  farmName: string | null;
  orderNumber: string;
  orderStatus: string;
  rush: boolean;
  currentStage: { id: string; name: string; expectedLossPct: number } | null;
  lastEventAt: string | null;
};

type StatusCheck = { eligible: boolean; status?: string; stage?: string; error?: string };

/** Parsed view of a rejected queued event for the review UI. */
function parseEventBody(body: string): { inputWeightG?: number; outputWeightG?: number; notes?: string } {
  try {
    const parsed = JSON.parse(body);
    return {
      inputWeightG: parsed.inputWeightG,
      outputWeightG: parsed.outputWeightG,
      notes: parsed.notes,
    };
  } catch {
    return {};
  }
}

export default function ScannerPanel() {
  const params = useSearchParams();
  const [lot, setLot] = useState<LookupLot | null>(null);
  const [manualCode, setManualCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [lookingUp, setLookingUp] = useState(false);
  const [cameraOn, setCameraOn] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [queueItems, setQueueItems] = useState(getQueue());
  const [syncMsg, setSyncMsg] = useState<string | null>(null);
  const [statusChecks, setStatusChecks] = useState<Record<string, StatusCheck>>({});
  const [expanded, setExpanded] = useState<string | null>(null);
  const [machines, setMachines] = useState<{ id: string; name: string }[]>([]);
  const scannerRef = useRef<{ stop: () => Promise<void>; clear: () => void } | null>(null);

  const refreshQueue = useCallback(() => setQueueItems(getQueue()), []);

  const lookup = useCallback(async (code: string) => {
    const cleaned = code.trim().toUpperCase();
    if (!cleaned) return;
    setLookingUp(true);
    setError(null);
    try {
      const res = await fetch(`/api/lots/lookup?code=${encodeURIComponent(cleaned)}`);
      const data = await res.json();
      if (!res.ok) {
        setLot(null);
        setError(data.error ?? "Lookup failed");
        return;
      }
      setLot(data.lot);
    } catch {
      setError("Network error — camera lookup needs a connection (manual codes queue offline once a lot is loaded).");
    } finally {
      setLookingUp(false);
    }
  }, []);

  // Auto-lookup when arriving with ?code= (e.g. a re-scan link, or "Open in scanner").
  useEffect(() => {
    const code = params.get("code");
    if (code) lookup(code);
  }, [params, lookup]);

  // Machine registry for the stage-event dropdown (graceful if unavailable).
  useEffect(() => {
    fetch("/api/machines")
      .then((r) => (r.ok ? r.json() : { machines: [] }))
      .then((d) =>
        setMachines(
          (d.machines ?? [])
            .filter((m: { isActive: boolean }) => m.isActive)
            .map((m: { id: string; name: string }) => ({ id: m.id, name: m.name }))
        )
      )
      .catch(() => undefined);
  }, []);

  // Queue badge + auto-sync when back online.
  useEffect(() => {
    refreshQueue();
    const onOnline = async () => {
      const result = await flushQueue();
      refreshQueue();
      setSyncMsg(syncSummary(result));
      if (result.errors.length > 0) setError(result.errors.join(" · "));
    };
    const onChanged = () => refreshQueue();
    window.addEventListener("online", onOnline);
    window.addEventListener("sf-queue-changed", onChanged);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("sf-queue-changed", onChanged);
    };
  }, [refreshQueue]);

  // Camera lifecycle.
  useEffect(() => {
    return () => {
      const scanner = scannerRef.current;
      if (scanner) {
        scanner.stop().catch(() => undefined);
      }
    };
  }, []);

  async function startCamera() {
    setCameraError(null);
    try {
      const { Html5Qrcode } = await import("html5-qrcode");
      const scanner = new Html5Qrcode("sf-qr-reader");
      scannerRef.current = scanner;
      await scanner.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 230, height: 230 } },
        (decodedText: string) => {
          scanner.stop().then(() => {
            setCameraOn(false);
            lookup(decodedText);
          }).catch(() => setCameraOn(false));
        },
        () => undefined // per-frame decode misses — ignore
      );
      setCameraOn(true);
    } catch (err: unknown) {
      setCameraOn(false);
      const message = err instanceof Error ? err.message : String(err);
      setCameraError(
        message.includes("Permission") || message.includes("NotAllowed")
          ? "Camera permission denied — use manual lookup below instead."
          : `Camera unavailable (${message}). Use manual lookup below.`
      );
    }
  }

  async function stopCamera() {
    const scanner = scannerRef.current;
    if (scanner) {
      try {
        await scanner.stop();
        scanner.clear();
      } catch {
        // already stopped
      }
    }
    setCameraOn(false);
  }

  async function checkStatus(clientEventId: string, lotCode: string) {
    try {
      const res = await fetch(`/api/lots/lookup?code=${encodeURIComponent(lotCode)}`);
      const data = await res.json();
      if (!res.ok) {
        setStatusChecks((s) => ({ ...s, [clientEventId]: { eligible: false, error: data.error ?? "Lookup failed" } }));
        return;
      }
      const fresh = data.lot as LookupLot;
      const eligible = ["PENDING", "IN_PRODUCTION"].includes(fresh.status) && Boolean(fresh.currentStage);
      setStatusChecks((s) => ({
        ...s,
        [clientEventId]: { eligible, status: fresh.status, stage: fresh.currentStage?.name },
      }));
    } catch {
      setStatusChecks((s) => ({ ...s, [clientEventId]: { eligible: false, error: "Network error — try again when connected." } }));
    }
  }

  const rejectedItems = queueItems.filter((q) => q.rejectedAt);
  const pendingItems = queueItems.filter((q) => !q.rejectedAt);
  // A rejected event for the currently loaded lot that the worker has started
  // re-scanning for — its replacement links back to it via resolvesClientEventId.
  const pendingResolution = lot ? queueItems.find((q) => q.resolutionPending && q.lotCode === lot.lotCode) : undefined;

  return (
    <div className="max-w-2xl space-y-4">
      <Card title="Scan a lot QR code" description="Point the camera at a bag label, or type the lot code.">
        <div id="sf-qr-reader" className="mx-auto max-w-xs mb-3 rounded-xl overflow-hidden border border-line bg-black/[0.03]" />
        {cameraOn ? (
          <button type="button" className="btn-secondary w-full" onClick={stopCamera}>
            Stop camera
          </button>
        ) : (
          <button type="button" className="btn-primary w-full" onClick={startCamera}>
            📷 Start camera
          </button>
        )}
        {cameraError ? (
          <p className="text-sm text-amber bg-amber-soft rounded-lg px-3 py-2 mt-3">{cameraError}</p>
        ) : null}

        <div className="flex items-center gap-3 my-4">
          <div className="flex-1 border-t border-line" />
          <span className="text-xs text-muted uppercase tracking-wider">or</span>
          <div className="flex-1 border-t border-line" />
        </div>

        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            lookup(manualCode);
          }}
        >
          <input
            className="input font-mono uppercase"
            value={manualCode}
            onChange={(e) => setManualCode(e.target.value)}
            placeholder="LOT-XXXXXX"
            aria-label="Lot code"
          />
          <button type="submit" className="btn-primary" disabled={lookingUp}>
            {lookingUp ? "…" : "Look up"}
          </button>
        </form>
        {error ? (
          <p className="text-sm text-clay bg-clay-soft rounded-lg px-3 py-2 mt-3" role="alert">
            {error}
          </p>
        ) : null}
      </Card>

      {rejectedItems.length > 0 ? (
        <Card
          title={`⚠️ ${rejectedItems.length} offline scan${rejectedItems.length > 1 ? "s" : ""} need review`}
          description="The server permanently rejected these events. Nothing was recorded — review, re-scan on the lot's current stage, or dismiss."
          padded={false}
        >
          <ul className="divide-y divide-line">
            {rejectedItems.map((q) => {
              const details = parseEventBody(q.body);
              const check = statusChecks[q.clientEventId];
              return (
                <li key={q.clientEventId} className="p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="clay">HTTP {q.rejectedStatus}</Badge>
                    <span className="font-mono font-semibold text-ink text-sm">{q.lotCode}</span>
                    <span className="text-xs text-muted">at {q.stageName}</span>
                    {q.resolutionPending ? <Badge variant="amber">re-scan initiated</Badge> : null}
                    <button
                      type="button"
                      className="btn-ghost btn-sm ml-auto"
                      onClick={() => setExpanded((e) => (e === q.clientEventId ? null : q.clientEventId))}
                    >
                      {expanded === q.clientEventId ? "Hide details" : "Review"}
                    </button>
                  </div>
                  <p className="text-sm text-clay mt-1">{q.rejectionReason}</p>

                  {expanded === q.clientEventId ? (
                    <div className="mt-2 border border-line rounded-lg bg-cream/60 p-3 text-sm space-y-1">
                      <p className="text-muted text-xs">
                        Saved {new Date(q.savedAt).toLocaleString()} · submitted with event{" "}
                        <span className="font-mono">{q.clientEventId.slice(0, 8)}…</span>
                      </p>
                      <p>
                        <span className="text-muted">Attempted stage:</span> {q.stageName}
                      </p>
                      {details.inputWeightG !== undefined ? (
                        <p>
                          <span className="text-muted">Submitted weights:</span> in {fmtWeight(details.inputWeightG)}
                          {details.outputWeightG !== undefined ? ` → out ${fmtWeight(details.outputWeightG)}` : " (no output recorded)"}
                        </p>
                      ) : null}
                      {details.notes ? (
                        <p>
                          <span className="text-muted">Submitted notes:</span> {details.notes}
                        </p>
                      ) : null}
                      <p className="text-xs text-muted">
                        Opening or reviewing this entry changes nothing — the event stays exactly as saved until you
                        explicitly dismiss it or complete a linked re-scan.
                      </p>
                    </div>
                  ) : null}

                  <div className="flex flex-wrap items-center gap-2 mt-2">
                    <button
                      type="button"
                      className="btn-secondary btn-sm"
                      onClick={() => checkStatus(q.clientEventId, q.lotCode)}
                    >
                      Check current status
                    </button>
                    {check?.eligible ? (
                      <ConfirmButton
                        className="btn-primary btn-sm"
                        confirmLabel="Confirm: start re-scan"
                        title="Marks this rejected scan as pending resolution and opens the scanner on the lot's current stage. The original is retired only when the replacement scan succeeds."
                        onConfirm={async () => {
                          markResolutionPending(q.clientEventId);
                          window.location.href = `/scan?code=${q.lotCode}`;
                        }}
                      >
                        Re-scan at current stage ({check.stage})
                      </ConfirmButton>
                    ) : null}
                    {check && !check.eligible && (check.status || check.error) ? (
                      <span className="text-xs text-muted">
                        Re-scan unavailable — lot is now {check.error ?? check.status?.replaceAll("_", " ").toLowerCase()}.
                      </span>
                    ) : null}
                    {q.resolutionPending ? (
                      <button
                        type="button"
                        className="btn-ghost btn-sm"
                        onClick={() => {
                          cancelResolutionPending(q.clientEventId);
                        }}
                      >
                        Cancel re-scan
                      </button>
                    ) : null}
                    <ConfirmButton
                      className="btn-ghost btn-sm ml-auto"
                      confirmLabel="Dismiss permanently?"
                      title="Removes this rejected event from this device. The server never recorded it."
                      onConfirm={async () => {
                        removeFromQueue(q.clientEventId);
                      }}
                    >
                      Dismiss
                    </ConfirmButton>
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>
      ) : null}

      {pendingItems.length > 0 ? (
        <Card padded={false}>
          <div className="flex flex-wrap items-center gap-3 p-3">
            <Badge variant="amber">{pendingItems.length} awaiting sync</Badge>
            <button
              type="button"
              className="btn-secondary btn-sm"
              onClick={async () => {
                const result = await flushQueue();
                refreshQueue();
                setSyncMsg(syncSummary(result));
                if (result.errors.length > 0) setError(result.errors.join(" · "));
              }}
            >
              Sync now
            </button>
            {syncMsg ? <span className="text-xs text-muted">{syncMsg}</span> : null}
          </div>
          <ul className="px-3 pb-3 text-xs text-muted space-y-0.5">
            {pendingItems.map((q) => (
              <li key={q.clientEventId}>
                {q.lotCode} · {q.stageName} · saved {new Date(q.savedAt).toLocaleTimeString()}
                {q.resolvesClientEventId ? " · replaces a rejected scan" : ""}
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {lot ? (
        <Card
          title="Lot found"
          actions={
            <button
              type="button"
              className="btn-ghost btn-sm"
              onClick={() => {
                setLot(null);
                setError(null);
                setManualCode("");
              }}
            >
              ✕ Clear — scan next
            </button>
          }
        >
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono font-bold text-lg text-ink">{lot.lotCode}</span>
              <Badge variant={lot.status === "COMPLETED" ? "green" : lot.status === "CONSUMED" ? "terra" : "slate"}>
                {lot.status.replaceAll("_", " ").toLowerCase()}
              </Badge>
              {lot.isBatch ? <Badge variant="terra">blend batch</Badge> : null}
              {lot.rush ? <Badge variant="clay">rush</Badge> : null}
              {lot.openFlags > 0 ? <Badge variant="clay">🚩 {lot.openFlags} open</Badge> : null}
            </div>
            {pendingResolution ? (
              <p className="text-sm bg-amber-soft text-amber rounded-lg px-3 py-2">
                ↻ A re-scan was started for a rejected offline scan of this lot. Recording this stage retires the old
                event automatically.
              </p>
            ) : null}
            <p className="text-sm text-muted">
              {lot.customerName}
              {lot.farmName ? ` · ${lot.farmName}` : ""} · {lot.orderNumber} · {lot.fiberType}
              {lot.breed ? ` (${lot.breed})` : ""}
            </p>
            <p className="text-sm">
              <span className="text-muted">Intake</span> <strong>{fmtWeight(lot.greaseWeightG)}</strong>
              <span className="text-muted"> · now</span> <strong>{fmtWeight(lot.currentWeightG)}</strong>
              {lot.currentStage ? (
                <>
                  <span className="text-muted"> · at stage</span>{" "}
                  <strong className="text-forest">{lot.currentStage.name}</strong>
                  <span className="text-muted"> for {timeAtStage(lot.lastEventAt)}</span>
                </>
              ) : null}
            </p>

            <div className="pt-3 border-t border-line">
              <p className="label">Record stage event</p>
              <StageEventForm
                machines={machines}
                resolvesClientEventId={pendingResolution?.clientEventId}
                target={{
                  lotId: lot.id,
                  lotCode: lot.lotCode,
                  currentStage: lot.currentStage,
                  currentWeightG: lot.currentWeightG,
                  status: lot.status,
                }}
              />
            </div>
            <a href={`/lots/${lot.id}`} className="text-sm text-forest font-medium hover:underline">
              Open full lot details →
            </a>
          </div>
        </Card>
      ) : null}
    </div>
  );
}

function syncSummary(result: { synced: number; rejected: number; retryable: number }): string {
  const parts = [`✓ ${result.synced} synced`];
  if (result.rejected > 0) parts.push(`⚠️ ${result.rejected} need${result.rejected > 1 ? "" : "s"} review`);
  if (result.retryable > 0) parts.push(`${result.retryable} still queued`);
  return parts.join(" · ") + ".";
}
