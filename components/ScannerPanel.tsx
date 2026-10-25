"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import StageEventForm from "@/components/StageEventForm";
import { Badge, Card } from "@/components/ui";
import { fmtWeight, timeAtStage } from "@/lib/format";
import { flushQueue, getQueue } from "@/lib/offline";

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

export default function ScannerPanel() {
  const params = useSearchParams();
  const [lot, setLot] = useState<LookupLot | null>(null);
  const [manualCode, setManualCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [lookingUp, setLookingUp] = useState(false);
  const [cameraOn, setCameraOn] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [queued, setQueued] = useState(0);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);
  const scannerRef = useRef<{ stop: () => Promise<void>; clear: () => void } | null>(null);

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

  // Auto-lookup when arriving with ?code= (e.g. "Open in scanner" links).
  useEffect(() => {
    const code = params.get("code");
    if (code) lookup(code);
  }, [params, lookup]);

  // Queue badge + auto-sync when back online.
  useEffect(() => {
    setQueued(getQueue().length);
    const update = () => setQueued(getQueue().length);
    const onOnline = async () => {
      const result = await flushQueue();
      update();
      if (result.synced > 0) {
        setSyncMsg(`Synced ${result.synced} offline scan${result.synced > 1 ? "s" : ""} back to the server.`);
      }
      if (result.errors.length > 0) {
        setError(result.errors.join(" · "));
      }
    };
    window.addEventListener("online", onOnline);
    window.addEventListener("sf-queue-changed", update);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("sf-queue-changed", update);
    };
  }, []);

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

      {queued > 0 ? (
        <Card>
          <div className="flex flex-wrap items-center gap-3">
            <Badge variant="amber">{queued} queued offline</Badge>
            <button
              type="button"
              className="btn-secondary btn-sm"
              onClick={async () => {
                const result = await flushQueue();
                setQueued(result.stillQueued);
                setSyncMsg(
                  `Synced ${result.synced}, rejected ${result.rejected}, ${result.stillQueued} still queued.`
                );
                if (result.errors.length) setError(result.errors.join(" · "));
              }}
            >
              Sync now
            </button>
            {syncMsg ? <span className="text-xs text-muted">{syncMsg}</span> : null}
          </div>
          <ul className="mt-2 text-xs text-muted space-y-0.5">
            {getQueue().map((q) => (
              <li key={q.clientEventId}>
                {q.lotCode} · {q.stageName} · saved {new Date(q.savedAt).toLocaleTimeString()}
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
