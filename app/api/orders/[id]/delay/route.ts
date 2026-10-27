import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { apiUser, unauthorized } from "@/lib/auth";
import { delaySchema, firstIssue } from "@/lib/validation";
import { notifyCustomer } from "@/lib/notify";

type Ctx = { params: Promise<{ id: string }> };

const REASON_LABELS: Record<string, string> = {
  MACHINE_BREAKDOWN: "machine breakdown",
  FIBER_CONDITION: "fiber condition",
  STAFF_ABSENCE: "staff absence",
  RUSH_REORDER: "rush reorder",
  WEATHER: "weather",
  OTHER: "other reasons",
};

/**
 * Spec 3.4: log a production delay — pushes the ETA out and notifies the
 * customer with the revised estimate. Staff-only (workers and owner).
 */
export async function POST(req: Request, ctx: Ctx) {
  const user = await apiUser();
  if (!user) return unauthorized();
  const { id } = await ctx.params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const parsed = delaySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: firstIssue(parsed.error) }, { status: 400 });
  }

  const order = await prisma.order.findUnique({
    where: { id },
    include: { customer: true },
  });
  if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });

  const base = order.estimatedCompletion && order.estimatedCompletion > new Date()
    ? order.estimatedCompletion.getTime()
    : Date.now();
  const revised = new Date(base + parsed.data.extraDays * 86_400_000);

  const updated = await prisma.order.update({
    where: { id },
    data: { estimatedCompletion: revised },
  });

  await notifyCustomer({
    orderId: order.id,
    event: "DELAY",
    subject: `Order ${order.orderNumber} — small delay`,
    body: `Hello ${order.customer.name} — a delay (${REASON_LABELS[parsed.data.reason]}) means your order is now expected around ${revised.toLocaleDateString("en-US", { month: "short", day: "numeric" })}.${parsed.data.notes ? ` Note: ${parsed.data.notes}` : ""}`,
  });

  return NextResponse.json({ order: updated });
}
