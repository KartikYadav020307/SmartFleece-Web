import Link from "next/link";
import { notFound } from "next/navigation";
import QRCode from "qrcode";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { getStages } from "@/lib/production";
import { getAncestorTree, getDescendantTree } from "@/lib/lineage";
import { Badge, Card, MetaRow, PageHeader, SampleBadge } from "@/components/ui";
import StageEventForm from "@/components/StageEventForm";
import FlagList from "@/components/FlagList";
import { LotStatusControls, UndoStageButton, SplitForm, BlendForm, LineageTreeView } from "@/components/LotActions";
import { fmtDateTime, fmtSignedWeight, fmtWeight, timeAtStage } from "@/lib/format";
import { cleanYieldPct } from "@/lib/calc";

export const dynamic = "force-dynamic";

export default async function LotDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;

  const lot = await prisma.fiberLot.findUnique({
    where: { id },
    include: {
      customer: true,
      order: true,
      currentStage: true,
      stageEvents: { orderBy: { createdAt: "asc" }, include: { stage: true, worker: true } },
      qualityFlags: { orderBy: { createdAt: "desc" } },
    },
  });
  if (!lot) notFound();

  const [stages, ancestors, descendants, blendCandidates] = await Promise.all([
    getStages(),
    getAncestorTree(lot.id),
    getDescendantTree(lot.id),
    lot.status === "PENDING" || lot.status === "IN_PRODUCTION"
      ? prisma.fiberLot.findMany({
          where: {
            id: { not: lot.id },
            status: { in: ["PENDING", "IN_PRODUCTION", "ON_HOLD"] },
          },
          orderBy: { updatedAt: "desc" },
          take: 30,
          include: { customer: { select: { name: true } }, currentStage: { select: { name: true } } },
        })
      : Promise.resolve([]),
  ]);

  const activeEvents = lot.stageEvents.filter((e) => !e.revertedAt);
  const stageIndex = new Map(stages.map((s, i) => [s.id, i]));
  const doneStageIds = new Set(activeEvents.map((e) => e.stageId));
  const yieldPct = cleanYieldPct(lot.greaseWeightG, lot.currentWeightG);
  const lastEventAt = activeEvents[activeEvents.length - 1]?.createdAt ?? lot.createdAt;
  const qrDataUrl = await QRCode.toDataURL(lot.lotCode, { margin: 1, width: 260 });

  const canTransform = lot.status === "PENDING" || lot.status === "IN_PRODUCTION" || lot.status === "ON_HOLD";

  return (
    <div className="space-y-6">
      <PageHeader
        title={lot.lotCode}
        description={
          <span className="flex items-center gap-2 flex-wrap">
            <Link href={`/orders/${lot.orderId}`} className="text-forest font-semibold hover:underline">
              {lot.order.orderNumber}
            </Link>
            <Link href={`/customers/${lot.customerId}`} className="text-forest hover:underline">
              {lot.customer.name}
            </Link>
            {lot.isBatch ? <Badge variant="terra">blend batch</Badge> : null}
            {lot.isSample ? <SampleBadge /> : null}
            <span className="text-muted">· {timeAtStage(lastEventAt)} at current stage</span>
          </span>
        }
        actions={
          <>
            <Link href={`/label/${lot.id}`} className="btn-secondary">
              🏷️ Print label
            </Link>
            <Link href={`/scan?code=${lot.lotCode}`} className="btn-primary">
              Open in scanner
            </Link>
          </>
        }
      />

      <div className="grid lg:grid-cols-3 gap-4">
        {/* Left: pipeline + history */}
        <div className="lg:col-span-2 space-y-4">
          <Card title="Stage Progress">
            <ol className="space-y-1.5">
              {stages.map((stage) => {
                const event = activeEvents.find((e) => e.stageId === stage.id);
                const isCurrent = lot.currentStageId === stage.id && lot.status !== "COMPLETED";
                const state = event
                  ? lot.status === "COMPLETED" || stageIndex.get(stage.id)! < (stageIndex.get(lot.currentStageId ?? "") ?? 0) || event.eventType === "SKIPPED"
                    ? "done"
                    : "done"
                  : isCurrent
                    ? "current"
                    : "todo";
                return (
                  <li
                    key={stage.id}
                    className={`flex items-center gap-3 rounded-lg px-3 py-2 ${
                      state === "current" ? "bg-forest-soft border border-forest/30" : state === "done" ? "bg-cream/60" : ""
                    }`}
                  >
                    <span aria-hidden className="text-base w-6 text-center">
                      {state === "done" ? (event?.eventType === "SKIPPED" ? "⏭️" : "✅") : state === "current" ? "🔄" : "⚪"}
                    </span>
                    <span className={`text-sm flex-1 ${state === "todo" ? "text-muted" : "text-ink font-medium"}`}>
                      {stage.name}
                      {stage.optional ? <span className="text-muted font-normal"> (optional)</span> : null}
                    </span>
                    {event ? (
                      <span className="text-xs text-muted whitespace-nowrap">
                        {fmtDateTime(event.createdAt)}
                        {event.inputWeightG !== null && event.outputWeightG !== null ? (
                          <span className="hidden sm:inline">
                            {" "}
                            · {fmtWeight(event.inputWeightG)} → {fmtWeight(event.outputWeightG)}
                          </span>
                        ) : null}
                      </span>
                    ) : null}
                  </li>
                );
              })}
            </ol>
          </Card>

          <Card
            title="Record stage event"
            actions={<UndoStageButton lotId={lot.id} disabled={activeEvents.length === 0} />}
          >
            <StageEventForm
              target={{
                lotId: lot.id,
                lotCode: lot.lotCode,
                currentStage: lot.currentStage
                  ? {
                      id: lot.currentStage.id,
                      name: lot.currentStage.name,
                      expectedLossPct: lot.currentStage.expectedLossPct,
                    }
                  : null,
                currentWeightG: lot.currentWeightG,
                status: lot.status,
              }}
            />
          </Card>

          <Card title={`Stage Event History (${lot.stageEvents.length})`} padded={false}>
            {lot.stageEvents.length === 0 ? (
              <p className="text-sm text-muted p-4">No events recorded yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr>
                      <th className="th">When</th>
                      <th className="th">Stage</th>
                      <th className="th">Worker</th>
                      <th className="th">Machine</th>
                      <th className="th">In → Out</th>
                      <th className="th">Δ</th>
                      <th className="th">Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...lot.stageEvents].reverse().map((event) => {
                      const delta =
                        event.outputWeightG !== null && event.inputWeightG !== null
                          ? event.outputWeightG - event.inputWeightG
                          : null;
                      return (
                        <tr key={event.id} className={event.revertedAt ? "opacity-50" : "hover:bg-cream/60"}>
                          <td className="td whitespace-nowrap text-muted">{fmtDateTime(event.createdAt)}</td>
                          <td className="td">
                            {event.stage.name}
                            {event.eventType === "SKIPPED" ? (
                              <span className="text-xs text-muted"> (skipped)</span>
                            ) : null}
                            {event.revertedAt ? (
                              <span className="text-xs text-clay"> (undone {fmtDateTime(event.revertedAt)})</span>
                            ) : null}
                          </td>
                          <td className="td text-muted">{event.worker?.name ?? "—"}</td>
                          <td className="td text-muted">{event.machine ?? "—"}</td>
                          <td className="td text-muted whitespace-nowrap">
                            {event.inputWeightG !== null ? fmtWeight(event.inputWeightG) : "—"} →{" "}
                            {event.outputWeightG !== null ? fmtWeight(event.outputWeightG) : "—"}
                          </td>
                          <td className={`td whitespace-nowrap ${delta !== null && delta < -1 ? "text-clay" : "text-muted"}`}>
                            {delta !== null ? fmtSignedWeight(delta) : "—"}
                          </td>
                          <td className="td text-muted max-w-56 truncate">{event.notes ?? "—"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          <Card title="Lot Lineage" description="Backward (what went in) and forward (what came out) traceability">
            <div className="grid md:grid-cols-2 gap-6">
              <div>
                <p className="label">Source lots (ancestors)</p>
                <LineageTreeView nodes={ancestors} />
              </div>
              <div>
                <p className="label">Derived lots (descendants)</p>
                <LineageTreeView nodes={descendants} />
              </div>
            </div>
            {canTransform ? (
              <div className="mt-5 pt-4 border-t border-line space-y-5">
                <details>
                  <summary className="text-sm font-semibold text-ink cursor-pointer">
                    ✂️ Split this lot into children
                  </summary>
                  <div className="mt-3">
                    <SplitForm lotId={lot.id} currentWeightG={lot.currentWeightG} />
                  </div>
                </details>
                <details>
                  <summary className="text-sm font-semibold text-ink cursor-pointer">
                    🧺 Blend with other lots (wash/card batch)
                  </summary>
                  <div className="mt-3">
                    <BlendForm
                      lotId={lot.id}
                      currentWeightG={lot.currentWeightG}
                      candidates={blendCandidates.map((c) => ({
                        id: c.id,
                        lotCode: c.lotCode,
                        fiberType: c.fiberType,
                        customerName: c.customer.name,
                        currentWeightG: c.currentWeightG,
                        stageName: c.currentStage?.name ?? "—",
                      }))}
                    />
                  </div>
                </details>
              </div>
            ) : null}
          </Card>
        </div>

        {/* Right: QR + profile + flags */}
        <div className="space-y-4">
          <Card title="QR Label">
            <div className="flex flex-col items-center text-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={qrDataUrl} alt={`QR code for lot ${lot.lotCode}`} className="w-44 h-44 rounded-lg border border-line p-1 bg-white" />
              <p className="font-mono font-bold text-lg text-ink mt-2">{lot.lotCode}</p>
              <p className="text-xs text-muted mt-1">
                QR encodes only this opaque lot code — no customer data.
              </p>
              <a href={qrDataUrl} download={`${lot.lotCode}.png`} className="btn-secondary btn-sm mt-3">
                ⬇ Download PNG
              </a>
            </div>
          </Card>

          <Card title="Lot Profile">
            <MetaRow
              items={[
                { label: "Fiber", value: lot.fiberType },
                { label: "Breed", value: lot.breed ?? "—" },
                { label: "Color", value: lot.color ?? "—" },
                { label: "Grade", value: lot.conditionGrade ?? "—" },
                { label: "VM rating", value: lot.vmRating ?? "—" },
                { label: "Staple", value: lot.stapleLengthMm ? `${lot.stapleLengthMm} mm` : "—" },
                { label: "Microns", value: lot.microns ?? "—" },
                { label: "Created", value: fmtDateTime(lot.createdAt) },
              ]}
            />
            <div className="mt-4 pt-4 border-t border-line space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted">Grease (intake) weight</span>
                <strong>{fmtWeight(lot.greaseWeightG)}</strong>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted">Current weight</span>
                <strong>{fmtWeight(lot.currentWeightG)}</strong>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted">Total change</span>
                <strong className={lot.currentWeightG < lot.greaseWeightG ? "text-clay" : ""}>
                  {fmtSignedWeight(lot.currentWeightG - lot.greaseWeightG)}
                  {yieldPct !== null ? ` (${yieldPct.toFixed(0)}% of intake)` : ""}
                </strong>
              </div>
            </div>
            {lot.notes ? (
              <div className="mt-4">
                <p className="label">Notes</p>
                <p className="text-sm text-ink bg-cream rounded-lg p-3 whitespace-pre-wrap">{lot.notes}</p>
              </div>
            ) : null}
            <div className="mt-4 pt-4 border-t border-line">
              <LotStatusControls lotId={lot.id} status={lot.status} />
            </div>
          </Card>

          <Card title={`Quality Flags (${lot.qualityFlags.filter((f) => f.status === "OPEN").length} open)`}>
            <FlagList flags={lot.qualityFlags} />
          </Card>
        </div>
      </div>
    </div>
  );
}
