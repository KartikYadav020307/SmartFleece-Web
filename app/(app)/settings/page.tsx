import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { getAllStages } from "@/lib/production";
import { getPricingConfig, parseRates } from "@/lib/invoice";
import { Badge, Card, PageHeader } from "@/components/ui";
import StageEditor from "@/components/StageEditor";
import PricingEditor from "@/components/PricingEditor";
import { fmtDateTime } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const user = await requireUser();
  const isOwner = user.role === "OWNER";

  const [stages, users, notifications, pricingRow] = await Promise.all([
    getAllStages(),
    prisma.user.findMany({ orderBy: { role: "asc" }, select: { id: true, name: true, email: true, role: true, isSample: true } }),
    prisma.notificationLog.findMany({ orderBy: { createdAt: "desc" }, take: 15, include: { order: { select: { orderNumber: true } } } }),
    getPricingConfig(),
  ]);
  const pricing = {
    currencyCode: pricingRow.currencyCode,
    currencySymbol: pricingRow.currencySymbol,
    taxLabel: pricingRow.taxLabel,
    taxRatePct: pricingRow.taxRatePct,
    rushMultiplier: pricingRow.rushMultiplier,
    minimumOrderFeeMinor: pricingRow.minimumOrderFeeMinor,
    rates: parseRates(pricingRow.baseRatesJson),
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Settings" description="Mill configuration — owner access for stage and pricing editing." />

      {!isOwner ? (
        <p className="text-sm text-amber bg-amber-soft rounded-lg px-3 py-2">
          You are signed in as a worker — the stage pipeline is read-only for you. Ask the mill
          owner to make changes.
        </p>
      ) : null}

      <Card title="Production Stage Pipeline" description="The sequence every lot flows through. Reorder with the arrows; edits save when you leave a field.">
        {isOwner ? (
          <StageEditor
            stages={stages.map((s) => ({
              id: s.id,
              name: s.name,
              sequence: s.sequence,
              optional: s.optional,
              expectedLossPct: s.expectedLossPct,
              isActive: s.isActive,
            }))}
          />
        ) : (
          <ol className="space-y-1">
            {stages.map((s, i) => (
              <li key={s.id} className="flex items-center gap-3 text-sm border border-line rounded-lg px-3 py-2 bg-white">
                <span className="text-xs text-muted w-6">{i + 1}</span>
                <span className="flex-1">{s.name}</span>
                {s.optional ? <Badge variant="outline">optional</Badge> : null}
                <span className="text-xs text-muted">~{s.expectedLossPct}% loss</span>
                {!s.isActive ? <Badge variant="slate">inactive</Badge> : null}
              </li>
            ))}
          </ol>
        )}
      </Card>

      <Card
        title="Pricing & Invoicing"
        description="Invoices bill actual processed weight at these rates. Currency and tax are fully configurable."
      >
        <PricingEditor pricing={pricing} isOwner={isOwner} />
      </Card>

      <div className="grid lg:grid-cols-2 gap-4">
        <Card title={`Users (${users.length})`} description="Accounts are managed via the database in this MVP; a management UI is planned.">
          <ul className="divide-y divide-line">
            {users.map((u) => (
              <li key={u.id} className="py-2.5 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-ink">
                    {u.name}
                    {u.isSample ? <Badge variant="terra">sample</Badge> : null}
                  </p>
                  <p className="text-xs text-muted truncate">{u.email}</p>
                </div>
                <Badge variant={u.role === "OWNER" ? "green" : "slate"}>{u.role.toLowerCase()}</Badge>
              </li>
            ))}
          </ul>
        </Card>

        <Card
          title="Notifications"
          description="Dev mode: every customer notification is recorded here — nothing is emailed until an SMTP provider is configured."
        >
          {notifications.length === 0 ? (
            <p className="text-sm text-muted">No notifications recorded yet.</p>
          ) : (
            <ul className="divide-y divide-line">
              {notifications.map((n) => (
                <li key={n.id} className="py-2.5">
                  <div className="flex items-center gap-2">
                    <Badge variant={n.status === "LOGGED" ? "slate" : n.status === "SENT" ? "green" : "clay"}>
                      {n.status.toLowerCase()}
                    </Badge>
                    <p className="text-sm font-medium text-ink truncate flex-1">{n.subject}</p>
                  </div>
                  <p className="text-xs text-muted mt-0.5">
                    {n.order?.orderNumber ?? "—"} · to {n.recipient ?? "no email"} · {fmtDateTime(n.createdAt)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
