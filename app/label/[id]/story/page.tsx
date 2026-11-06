import { notFound } from "next/navigation";
import QRCode from "qrcode";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { PrintButton } from "@/components/controls";
import { fmtDate, fmtWeight } from "@/lib/format";
import { generateStoryToken } from "@/lib/story-token";
import { isQCFresh } from "@/lib/qc";

export const dynamic = "force-dynamic";

/**
 * Standalone print-friendly finished-product / skein label (Module 6.3).
 * Sized for craft retail tags or thermal label stock.
 * Encodes the public Fiber Story provenance URL into a smartphone-scannable QR.
 */
export default async function StoryLabelPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;

  const lot = await prisma.fiberLot.findUnique({
    where: { id },
    include: {
      customer: true,
      order: true,
      stageEvents: { where: { revertedAt: null }, orderBy: { createdAt: "asc" } },
      qcInspections: { orderBy: { createdAt: "desc" }, take: 1 },
    },
  });
  if (!lot || lot.status === "CANCELLED") notFound();

  const latestQC = lot.qcInspections[0] ?? null;
  const isPassingQC = Boolean(latestQC && latestQC.outcome === "PASS" && isQCFresh(lot, latestQC));

  if (!isPassingQC) {
    return (
      <div className="min-h-screen bg-cream flex items-center justify-center p-6">
        <div className="card p-6 max-w-md w-full text-center bg-white border border-line space-y-4 shadow-sm">
          <div className="w-12 h-12 rounded-full bg-clay/10 text-clay flex items-center justify-center mx-auto text-2xl font-bold">
            ⚠️
          </div>
          <div>
            <h1 className="text-lg font-bold text-ink">Finished-Goods QC Required</h1>
            <p className="text-xs text-muted mt-1">
              Finished-product story labels cannot be printed until final QC inspection passes. Lot {lot.lotCode} requires a verified PASS inspection.
            </p>
          </div>
          {latestQC ? (
            <div className="bg-cream rounded-lg p-3 text-xs text-left text-ink border border-line space-y-1">
              <p><strong>Latest Inspection:</strong> {latestQC.outcome}</p>
              {latestQC.notes ? <p className="text-muted">Notes: {latestQC.notes}</p> : null}
            </div>
          ) : (
            <p className="text-xs text-muted bg-cream rounded-lg p-2.5">No QC inspection has been recorded yet.</p>
          )}
          <div className="pt-2 flex flex-col sm:flex-row justify-center gap-2">
            <a href={`/lots/${lot.id}`} className="btn-primary text-xs">
              Go to Lot Inspection
            </a>
            <a href={`/label/${lot.id}`} className="btn-secondary text-xs">
              View Internal Mill Label
            </a>
          </div>
        </div>
      </div>
    );
  }

  const token = generateStoryToken(lot.id);
  // Encodes relative path /story/<token> (works for all hostnames and offline dev/test)
  const storyUrl = `/story/${token}`;
  const qr = await QRCode.toDataURL(storyUrl, { margin: 1, width: 320 });

  const farmName = lot.customer.farmName || lot.order.farmInfo || "Regional Farm";
  const primaryBreed = lot.breed || lot.fiberType;

  return (
    <div className="min-h-screen bg-cream flex items-center justify-center p-6 print:bg-white print:p-0">
      <div className="card p-6 max-w-sm w-full text-center print:border-2 print:border-black print:rounded-none print:shadow-none bg-white">
        <div className="border-b border-line pb-3 mb-3">
          <p className="text-xs font-bold uppercase tracking-widest text-forest">SmartFleece Provenance</p>
          <h1 className="text-xl font-extrabold text-ink tracking-tight mt-0.5">The Fiber Story</h1>
          <p className="text-[11px] text-muted">Scan to trace this fiber from farm to finish</p>
        </div>

        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={qr} alt={`Story QR for ${lot.lotCode}`} className="w-52 h-52 mx-auto my-2" />

        <div className="space-y-1.5 text-xs text-ink pt-2">
          <p className="text-sm font-bold text-ink">
            {farmName}
          </p>
          <p className="text-muted font-medium">
            {lot.isBatch ? "Artisan Blend" : primaryBreed}
            {lot.color ? ` · ${lot.color}` : ""}
          </p>
          <p className="font-semibold text-ink">
            {lot.order.targetProduct || "Finished Product"}
            {lot.order.yarnSpecs ? ` (${lot.order.yarnSpecs})` : ""}
          </p>
          <p className="text-muted">
            Net Weight: <strong>{fmtWeight(lot.currentWeightG)}</strong>
            {lot.order.shearingDate ? ` · Clip: ${fmtDate(lot.order.shearingDate)}` : ""}
          </p>
        </div>

        <p className="text-[10px] text-muted/80 mt-4 border-t border-line/60 pt-2">
          ✓ Small-batch craft milled · 100% Traceable
        </p>

        <div className="mt-5 no-print flex flex-col items-center gap-2">
          <div className="flex justify-center gap-2">
            <PrintButton label="Print story tag" />
            <a href={`/lots/${lot.id}`} className="btn-secondary">
              Back to lot
            </a>
          </div>
          <a href={storyUrl} target="_blank" className="text-xs text-forest hover:underline mt-1">
            Preview public story link
          </a>
        </div>
      </div>
      <style>{`@media print { .no-print { display: none !important; } }`}</style>
    </div>
  );
}
