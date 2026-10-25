import { notFound } from "next/navigation";
import QRCode from "qrcode";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { PrintButton } from "@/components/controls";
import { fmtDate, fmtWeight } from "@/lib/format";

export const dynamic = "force-dynamic";

/**
 * Standalone print-friendly label (outside the app shell so the sidebar
 * never prints). Sized for thermal label stock.
 */
export default async function LabelPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;

  const lot = await prisma.fiberLot.findUnique({
    where: { id },
    include: { customer: true, order: true },
  });
  if (!lot) notFound();

  const qr = await QRCode.toDataURL(lot.lotCode, { margin: 1, width: 320 });

  return (
    <div className="min-h-screen bg-cream flex items-center justify-center p-6 print:bg-white print:p-0">
      <div className="card p-6 max-w-sm w-full text-center print:border-2 print:border-black print:rounded-none print:shadow-none">
        <p className="text-xs font-bold uppercase tracking-widest text-muted">SmartFleece Lot Label</p>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={qr} alt={`QR for ${lot.lotCode}`} className="w-56 h-56 mx-auto my-3" />
        <p className="font-mono font-bold text-2xl text-ink">{lot.lotCode}</p>
        <div className="mt-3 text-sm text-ink space-y-0.5">
          <p>
            <strong>{lot.customer.name}</strong>
            {lot.customer.farmName ? ` · ${lot.customer.farmName}` : ""}
          </p>
          <p className="text-muted">
            {lot.order.orderNumber} · {lot.fiberType}
          </p>
          <p className="text-muted">
            Intake {fmtWeight(lot.greaseWeightG)} · {fmtDate(lot.createdAt)}
          </p>
          {lot.color ? <p className="text-muted">Color: {lot.color}</p> : null}
        </div>
        <div className="mt-4 no-print flex justify-center gap-2">
          <PrintButton label="Print label" />
          <a href={`/lots/${lot.id}`} className="btn-secondary">
            Back to lot
          </a>
        </div>
      </div>
      <style>{`@media print { .no-print { display: none !important; } }`}</style>
    </div>
  );
}
