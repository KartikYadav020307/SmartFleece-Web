import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import CustomerForm from "@/components/CustomerForm";

export const dynamic = "force-dynamic";

export default async function EditCustomerPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;
  const customer = await prisma.customer.findUnique({ where: { id } });
  if (!customer) notFound();

  return (
    <div>
      <PageHeader title={`Edit ${customer.name}`} />
      <CustomerForm
        initial={{
          id: customer.id,
          name: customer.name,
          email: customer.email,
          phone: customer.phone,
          farmName: customer.farmName,
          location: customer.location,
          preferences: customer.preferences,
          notes: customer.notes,
        }}
      />
    </div>
  );
}
