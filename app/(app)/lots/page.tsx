import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { Card, EmptyState, LotStatusBadge, PageHeader } from "@/components/ui";
import SearchBox from "@/components/SearchBox";
import { fmtWeight, timeAtStage } from "@/lib/format";
import { LOT_STATUSES } from "@/lib/constants";

export const dynamic = "force-dynamic";

export default async function LotsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; stage?: string }>;
}) {
  await requireUser();
  const { q, status, stage } = await searchParams;
  const search = q?.trim() ?? "";

  const stages = await prisma.stage.findMany({ where: { isActive: true }, orderBy: { sequence: "asc" } });
  const stageId = stage && stages.some((s) => s.id === stage) ? stage : undefined;

  const lots = await prisma.fiberLot.findMany({
    where: {
      AND: [
        status && LOT_STATUSES.includes(status as (typeof LOT_STATUSES)[number]) ? { status } : {},
        stageId ? { currentStageId: stageId } : {},
        search
          ? {
              OR: [
                { lotCode: { contains: search.toUpperCase() } },
                { customer: { name: { contains: search } } },
                { fiberType: { contains: search } },
              ],
            }
          : {},
      ],
    },
    orderBy: { updatedAt: "desc" },
    take: 200,
    include: {
      customer: { select: { name: true } },
      order: { select: { orderNumber: true } },
      currentStage: { select: { name: true } },
      stageEvents: { where: { revertedAt: null }, orderBy: { createdAt: "desc" }, take: 1 },
      _count: { select: { qualityFlags: { where: { status: "OPEN" } } } },
    },
  });

  const buildHref = (patch: Record<string, string | undefined>) => {
    const next = new URLSearchParams();
    if (search) next.set("q", search);
    const merged = { status, stage, ...patch };
    if (merged.status) next.set("status", merged.status);
    if (merged.stage) next.set("stage", merged.stage);
    const qs = next.toString();
    return qs ? `/lots?${qs}` : "/lots";
  };

  return (
    <div>
      <PageHeader
        title="Fiber Lots"
        description="Every individually QR-tagged bag, batch and finished product."
        actions={
          <Link href="/scan" className="btn-primary">
            📷 Scan a lot
          </Link>
        }
      />
      <Card padded={false}>
        <div className="p-3 border-b border-line flex flex-wrap gap-2 items-center">
          <div className="flex-1 min-w-56">
            <SearchBox placeholder="Search lot code, customer or fiber…" />
          </div>
          <div className="flex gap-1 flex-wrap">
            <Link href={buildHref({ status: undefined, stage: undefined })} className={`btn btn-sm ${!status && !stageId ? "bg-forest text-white" : "btn-secondary"}`}>
              All
            </Link>
            {LOT_STATUSES.map((s) => (
              <Link
                key={s}
                href={buildHref({ status: s, stage: undefined })}
                className={`btn btn-sm ${status === s ? "bg-forest text-white" : "btn-secondary"}`}
              >
                {s.replaceAll("_", " ").toLowerCase()}
              </Link>
            ))}
            {stageId ? (
              <span className="btn btn-sm bg-forest text-white pointer-events-none">
                stage: {stages.find((s) => s.id === stageId)?.name}
              </span>
            ) : null}
          </div>
        </div>
        {lots.length === 0 ? (
          <EmptyState
            icon="🧶"
            title={search || status ? "No lots match" : "No lots yet"}
            description={
              search || status
                ? "Try clearing the filters."
                : "Lots are created when you receive a customer order — each one gets a QR label."
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  <th className="th">Lot</th>
                  <th className="th">Order</th>
                  <th className="th">Customer</th>
                  <th className="th">Fiber</th>
                  <th className="th">Intake → Current</th>
                  <th className="th">Stage</th>
                  <th className="th">Status</th>
                  <th className="th">Updated</th>
                </tr>
              </thead>
              <tbody>
                {lots.map((lot) => (
                  <tr key={lot.id} className="hover:bg-cream/60">
                    <td className="td">
                      <Link href={`/lots/${lot.id}`} className="font-semibold text-forest hover:underline">
                        {lot.lotCode}
                      </Link>
                      {lot._count.qualityFlags > 0 ? <span className="ml-1.5" title="Open quality flag">🚩</span> : null}
                      {lot.isBatch ? <span className="ml-1.5 text-xs text-terra font-semibold">batch</span> : null}
                    </td>
                    <td className="td text-muted">{lot.order.orderNumber}</td>
                    <td className="td text-muted">{lot.customer.name}</td>
                    <td className="td text-muted">{lot.fiberType}</td>
                    <td className="td text-muted whitespace-nowrap">
                      {fmtWeight(lot.greaseWeightG)} → {fmtWeight(lot.currentWeightG)}
                    </td>
                    <td className="td text-muted">{lot.currentStage?.name ?? "—"}</td>
                    <td className="td">
                      <LotStatusBadge status={lot.status} />
                    </td>
                    <td className="td text-muted whitespace-nowrap">
                      {timeAtStage(lot.stageEvents[0]?.createdAt ?? lot.updatedAt)} ago
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
