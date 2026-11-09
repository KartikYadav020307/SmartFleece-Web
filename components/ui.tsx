import React from "react";
import { LOT_STATUSES, ORDER_STATUSES } from "@/lib/constants";
import { fmtDate } from "@/lib/format";

const BADGE_VARIANTS = {
  slate: "bg-slate-soft text-slate",
  green: "bg-forest-soft text-forest-dark",
  amber: "bg-amber-soft text-amber",
  clay: "bg-clay-soft text-clay",
  terra: "bg-terra-soft text-terra",
  outline: "border border-line text-muted bg-white",
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
    <div className="flex flex-wrap items-start justify-between gap-3 mb-6">
      <div className="min-w-0">
        <h1 className="text-2xl sm:text-3xl font-bold text-ink tracking-tight">{title}</h1>
        {description ? <p className="text-sm text-muted mt-1 leading-normal">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2.5">{actions}</div> : null}
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
    <section className={`card min-w-0 ${className}`}>
      {title || actions ? (
        <header className="flex items-center justify-between gap-3 px-5 py-3.5 border-b border-line">
          <div className="min-w-0">
            <h2 className="text-sm sm:text-base font-semibold text-ink leading-tight">{title}</h2>
            {description ? <p className="text-xs text-muted mt-0.5 leading-normal">{description}</p> : null}
          </div>
          {actions ? <div className="shrink-0">{actions}</div> : null}
        </header>
      ) : null}
      <div className={padded ? "p-4 sm:p-5" : ""}>{children}</div>
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
    <div className="card p-4 sm:p-5 min-w-0 flex flex-col justify-between">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted truncate">{label}</p>
      <p className="text-2xl sm:text-3xl font-bold text-ink mt-2 tracking-tight">{value}</p>
      {hint ? <p className="text-xs text-muted mt-1.5 leading-snug">{hint}</p> : null}
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
      <div className="text-4xl mb-3" aria-hidden="true">
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
  return <Badge variant="terra">sample</Badge>;
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

/**
 * Accessible Icon Button ensuring >= 44x44px touch target on mobile devices
 */
export function IconButton({
  label,
  icon,
  onClick,
  className = "",
  disabled = false,
  variant = "ghost",
}: {
  label: string;
  icon: React.ReactNode;
  onClick?: () => void;
  className?: string;
  disabled?: boolean;
  variant?: "ghost" | "secondary" | "primary";
}) {
  const variantClass =
    variant === "primary"
      ? "bg-forest text-white hover:bg-forest-dark"
      : variant === "secondary"
      ? "bg-white text-ink border border-line hover:bg-cream"
      : "bg-transparent text-muted hover:text-ink hover:bg-cream/60";

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={`inline-flex items-center justify-center rounded-xl transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed min-h-[44px] min-w-[44px] p-2.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-forest/40 focus-visible:ring-offset-2 ${variantClass} ${className}`}
    >
      {icon}
    </button>
  );
}

/**
 * Lightweight loading skeleton primitives
 */
export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse bg-line/60 rounded-xl ${className}`} aria-hidden="true" />;
}

export function CardSkeleton({ lines = 3 }: { lines?: number }) {
  return (
    <div className="card p-5 space-y-3" aria-hidden="true">
      <Skeleton className="h-4 w-1/3" />
      <Skeleton className="h-8 w-1/2" />
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} className="h-3 w-full" />
      ))}
    </div>
  );
}

export { ORDER_STATUSES, LOT_STATUSES };
