import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { apiUser, unauthorized, forbidden } from "@/lib/auth";
import { pricingSchema, firstIssue } from "@/lib/validation";
import { getPricingConfig } from "@/lib/invoice";

export async function GET() {
  const user = await apiUser();
  if (!user) return unauthorized();
  const config = await getPricingConfig();
  return NextResponse.json({ config });
}

/** Update mill pricing (owner only). Amounts arrive in major units, stored as minor. */
export async function PUT(req: Request) {
  const user = await apiUser();
  if (!user) return unauthorized();
  if (user.role !== "OWNER") return forbidden("Only the mill owner can change pricing");

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const parsed = pricingSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: firstIssue(parsed.error) }, { status: 400 });
  }
  const d = parsed.data;

  const rates: Record<string, number> = { default: Math.round(d.defaultRateMajorPerKg * 100) };
  for (const [fiberType, rateMajor] of Object.entries(d.baseRatesMajorPerKg)) {
    rates[fiberType] = Math.round(rateMajor * 100);
  }

  const existing = await getPricingConfig();
  const config = await prisma.pricingConfig.update({
    where: { id: existing.id },
    data: {
      currencyCode: d.currencyCode,
      currencySymbol: d.currencySymbol,
      taxLabel: d.taxLabel,
      taxRatePct: d.taxRatePct,
      rushMultiplier: d.rushMultiplier,
      minimumOrderFeeMinor: Math.round(d.minimumOrderFeeMajor * 100),
      baseRatesJson: JSON.stringify(rates),
    },
  });
  return NextResponse.json({ config });
}
