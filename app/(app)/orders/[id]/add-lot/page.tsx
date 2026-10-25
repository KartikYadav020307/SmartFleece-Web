import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import LotForm from "@/components/LotForm";

export const dynamic = "force-dynamic";

export default async function AddLotPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;
  const order = await prisma.order.findUnique({ where: { id }, include: { customer: true } });
  if (!order) notFound();

  return (
    <div>
      <PageHeader
        title={`Add Lot to ${order.orderNumber}`}
        description={`Order for ${order.customer.name} — the new bag gets its own QR label.`}
      />
      <div className="max-w-3xl">
        <LotForm orderId={order.id} />
      </div>
    </div>
  );
}
