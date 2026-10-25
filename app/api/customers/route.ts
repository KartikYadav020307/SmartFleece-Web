import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { apiUser, unauthorized } from "@/lib/auth";
import { customerSchema, firstIssue } from "@/lib/validation";

export async function GET() {
  const user = await apiUser();
  if (!user) return unauthorized();
  const customers = await prisma.customer.findMany({
    where: { archived: false },
    orderBy: { name: "asc" },
    include: { _count: { select: { orders: true, lots: true } } },
  });
  return NextResponse.json({ customers });
}

export async function POST(req: Request) {
  const user = await apiUser();
  if (!user) return unauthorized();

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const parsed = customerSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: firstIssue(parsed.error) }, { status: 400 });
  }

  const customer = await prisma.customer.create({
    data: { ...parsed.data, email: parsed.data.email?.toLowerCase() },
  });
  return NextResponse.json({ customer }, { status: 201 });
}
