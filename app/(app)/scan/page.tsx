import { Suspense } from "react";
import { requireUser } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import ScannerPanel from "@/components/ScannerPanel";

export const dynamic = "force-dynamic";

export default async function ScanPage() {
  await requireUser();
  return (
    <div>
      <PageHeader
        title="Scan QR"
        description="Scan a bag's QR label to confirm the lot and record its next stage — a few taps and back to work."
      />
      <Suspense fallback={<p className="text-sm text-muted">Loading scanner…</p>}>
        <ScannerPanel />
      </Suspense>
    </div>
  );
}
