"use client";

import { ConfirmButton } from "@/components/controls";

/** Owner-only delete/archive: hard-deletes empty records, archives ones with history. */
export default function CustomerDeleteButton({
  customerId,
  hasHistory,
}: {
  customerId: string;
  hasHistory: boolean;
}) {
  return (
    <div>
      <ConfirmButton
        className="btn-danger btn-sm"
        confirmLabel="Really delete/archive?"
        onConfirm={async () => {
          await fetch(`/api/customers/${customerId}`, { method: "DELETE" });
          window.location.href = "/customers";
        }}
      >
        {hasHistory ? "Archive customer (has history)" : "Delete customer"}
      </ConfirmButton>
      <p className="text-xs text-muted mt-2">
        Customers with orders or lots are archived, never deleted, so traceability stays intact.
      </p>
    </div>
  );
}
