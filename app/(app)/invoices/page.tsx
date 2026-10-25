import { Card, EmptyState, PageHeader } from "@/components/ui";

export default function InvoicesPage() {
  return (
    <div>
      <PageHeader title="Invoices" description="Planned for Phase 2." />
      <Card>
        <EmptyState
          icon="💰"
          title="Invoicing is coming in Phase 2"
          description="Per-order pricing, automatic invoice generation, payment tracking and accounting export are designed in the build plan (Module 5) but not implemented yet. Production and traceability data is already being captured so invoices will have accurate processed weights to bill from."
        />
      </Card>
    </div>
  );
}
