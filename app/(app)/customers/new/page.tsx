import { PageHeader } from "@/components/ui";
import CustomerForm from "@/components/CustomerForm";
import { requireUser } from "@/lib/auth";

export default async function NewCustomerPage() {
  await requireUser();
  return (
    <div>
      <PageHeader title="New Customer" description="Register a fiber producer's profile." />
      <CustomerForm />
    </div>
  );
}
