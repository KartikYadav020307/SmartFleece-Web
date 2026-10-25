import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { Card, EmptyState, PageHeader } from "@/components/ui";
import FlagList from "@/components/FlagList";

export const dynamic = "force-dynamic";

export default async function QualityPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  await requireUser();
  const { status } = await searchParams;
  const filter = status === "RESOLVED" ? "RESOLVED" : status === "ALL" ? "ALL" : "OPEN";

  const flags = await prisma.qualityFlag.findMany({
    where: filter === "ALL" ? {} : { status: filter },
    orderBy: { createdAt: "desc" },
    take: 200,
    include: { lot: { select: { id: true, lotCode: true } } },
  });

  const openCount = await prisma.qualityFlag.count({ where: { status: "OPEN" } });

  return (
    <div>
      <PageHeader
        title="Quality"
        description={`${openCount} open flag${openCount === 1 ? "" : "s"} across all lots. Abnormal weight loss is flagged automatically.`}
      />
      <Card padded={false}>
        <div className="p-3 border-b border-line flex gap-1">
          {(["OPEN", "RESOLVED", "ALL"] as const).map((s) => (
            <Link
              key={s}
              href={s === "OPEN" ? "/quality" : `/quality?status=${s}`}
              className={`btn btn-sm ${filter === s ? "bg-forest text-white" : "btn-secondary"}`}
            >
              {s.toLowerCase()}
            </Link>
          ))}
        </div>
        {flags.length === 0 ? (
          <EmptyState
            icon="🚩"
            title={filter === "OPEN" ? "No open quality flags" : `No ${filter.toLowerCase()} flags`}
            description={
              filter === "OPEN"
                ? "Workers can flag issues from any stage form; abnormal weight loss alerts appear here automatically."
                : undefined
            }
          />
        ) : (
          <div className="p-4">
            <FlagList
              showLot
              flags={flags.map((f) => ({
                id: f.id,
                flagType: f.flagType,
                severity: f.severity,
                notes: f.notes,
                status: f.status,
                resolvedBy: f.resolvedBy,
                resolvedAt: f.resolvedAt,
                createdAt: f.createdAt,
                lotCode: f.lot.lotCode,
                lotId: f.lot.id,
              }))}
            />
          </div>
        )}
      </Card>
    </div>
  );
}
