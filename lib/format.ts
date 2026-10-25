export function fmtWeight(g: number | null | undefined): string {
  if (g === null || g === undefined) return "—";
  if (Math.abs(g) >= 1000) return `${(g / 1000).toFixed(2)} kg`;
  return `${g} g`;
}

export function fmtSignedWeight(g: number | null | undefined): string {
  if (g === null || g === undefined) return "—";
  const sign = g > 0 ? "+" : g < 0 ? "−" : "";
  return `${sign}${fmtWeight(Math.abs(g))}`;
}

export function fmtDate(d: Date | string | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function fmtDateTime(d: Date | string | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function daysSince(d: Date | string | null | undefined): number | null {
  if (!d) return null;
  return Math.floor((Date.now() - new Date(d).getTime()) / 86_400_000);
}

export function timeAtStage(from: Date | string | null | undefined): string {
  const days = daysSince(from);
  if (days === null) return "—";
  if (days <= 0) return "today";
  if (days === 1) return "1 day";
  return `${days} days`;
}
