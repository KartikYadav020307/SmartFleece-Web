import { LOT_STATUSES, ORDER_STATUSES } from "@/lib/constants";
import { fmtDate } from "@/lib/format";

const BADGE_VARIANTS = {
  slate: "bg-slate-soft text-slate",
  green: "bg-forest-soft text-forest-dark",
  amber: "bg-amber-soft text-amber",
  clay: "bg-clay-soft text-clay",
  terra: "bg-terra-soft text-terra",
  outline: "border border-line text-muted",
} as const;

export type BadgeVariant = keyof typeof BADGE_VARIANTS;

export function Badge({ variant = "outline", children }: { variant?: BadgeVariant; children: React.ReactNode }) {
  return <span className={`badge ${BADGE_VARIANTS[variant]}`}>{children}</span>;
}

const ORDER_BADGE: Record<string, { variant: BadgeVariant; label: string }> = {
  RECEIVED: { variant: "slate", label: "Received" },
  IN_PRODUCTION: { variant: "green", label: "In Production" },
  READY_FOR_PICKUP: { variant: "amber", label: "Ready for Pickup" },
  COMPLETED: { variant: "green", label: "Completed" },
  CANCELLED: { variant: "outline", label: "Cancelled" },
};

const LOT_BADGE: Record<string, { variant: BadgeVariant; label: string }> = {
  PENDING: { variant: "slate", label: "Pending" },
  IN_PRODUCTION: { variant: "green", label: "In Production" },
  COMPLETED: { variant: "green", label: "Completed" },
  CONSUMED: { variant: "terra", label: "Consumed" },
  ON_HOLD: { variant: "amber", label: "On Hold" },
  CANCELLED: { variant: "outline", label: "Cancelled" },
};

export function OrderStatusBadge({ status }: { status: string }) {
  const cfg = ORDER_BADGE[status] ?? { variant: "outline" as BadgeVariant, label: status };
  return <Badge variant={cfg.variant}>{cfg.label}</Badge>;
}

export function LotStatusBadge({ status }: { status: string }) {
  const cfg = LOT_BADGE[status] ?? { variant: "outline" as BadgeVariant, label: status };
  return <Badge variant={cfg.variant}>{cfg.label}</Badge>;
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 mb-5">
      <div>
        <h1 className="text-2xl font-bold text-ink">{title}</h1>
        {description ? <p className="text-sm text-muted mt-1">{description}</p> : null}
      </div>
      {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function Card({
  title,
  description,
  actions,
  children,
  className = "",
  padded = true,
}: {
  title?: string;
  description?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  padded?: boolean;
}) {
  return (
    <section className={`card ${className}`}>
      {title || actions ? (
        <header className="flex items-center justify-between gap-3 px-4 py-3 border-b border-line">
          <div>
            <h2 className="text-sm font-semibold text-ink">{title}</h2>
            {description ? <p className="text-xs text-muted mt-0.5">{description}</p> : null}
          </div>
          {actions}
        </header>
      ) : null}
      <div className={padded ? "p-4" : ""}>{children}</div>
    </section>
  );
}

export function StatCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
}) {
  return (
    <div className="card p-4">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted">{label}</p>
      <p className="text-3xl font-bold text-ink mt-1.5">{value}</p>
      {hint ? <p className="text-xs text-muted mt-1">{hint}</p> : null}
    </div>
  );
}

export function EmptyState({
  icon = "🐑",
  title,
  description,
  action,
}: {
  icon?: string;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
      <div className="text-4xl mb-3" aria-hidden>
        {icon}
      </div>
      <h3 className="text-base font-semibold text-ink">{title}</h3>
      {description ? <p className="text-sm text-muted mt-1 max-w-md">{description}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="label">{label}</label>
      {children}
      {hint ? <p className="text-xs text-muted mt-1">{hint}</p> : null}
    </div>
  );
}

export function SampleBadge() {
  return (
    <Badge variant="terra" >
      sample
    </Badge>
  );
}

export function MetaRow({ items }: { items: { label: string; value: React.ReactNode }[] }) {
  return (
    <dl className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-6 gap-y-3">
      {items.map((item) => (
        <div key={item.label} className="min-w-0">
          <dt className="text-xs font-semibold uppercase tracking-wide text-muted">{item.label}</dt>
          <dd className="text-sm text-ink mt-0.5 truncate">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function formatStatusOptions(statuses: readonly string[]) {
  return statuses.map((s) => ({ value: s, label: s.replaceAll("_", " ").toLowerCase() }));
}

export function DateCell({ date }: { date: Date | string | null | undefined }) {
  return <span className="whitespace-nowrap">{fmtDate(date)}</span>;
}

export { ORDER_STATUSES, LOT_STATUSES };
