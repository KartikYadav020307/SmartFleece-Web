import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import OrderForm from "@/components/OrderForm";

export const dynamic = "force-dynamic";

export default async function NewOrderPage({
  searchParams,
}: {
  searchParams: Promise<{ customerId?: string }>;
}) {
  await requireUser();
  const { customerId } = await searchParams;
  const customers = await prisma.customer.findMany({
    where: { archived: false },
    orderBy: { name: "asc" },
    select: { id: true, name: true, farmName: true },
  });

  return (
    <div>
      <PageHeader
        title="New Order — Fiber Intake"
        description="Record the customer's fiber, intake weights and processing preferences. Every bag gets its own QR label."
        actions={
          <Link href="/customers/new" className="btn-secondary">
            + New Customer
          </Link>
        }
      />
      <OrderForm customers={customers} preselectedCustomerId={customerId} />
    </div>
  );
}
