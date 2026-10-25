import { Card, EmptyState, PageHeader } from "@/components/ui";

export default function ReportsPage() {
  return (
    <div>
      <PageHeader title="Reports" description="Planned for a later phase." />
      <Card>
        <EmptyState
          icon="📈"
          title="Reports are coming later"
          description="Yield by fiber type, turnaround times, revenue analytics and exportable reports (Module 8) will build on the stage-event data already being collected. For now, the Dashboard shows live production stats."
        />
      </Card>
    </div>
  );
}
