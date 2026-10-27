import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { apiUser, unauthorized, forbidden } from "@/lib/auth";
import { machineSchema, firstIssue } from "@/lib/validation";

export async function GET() {
  const user = await apiUser();
  if (!user) return unauthorized();
  const machines = await prisma.machine.findMany({ orderBy: { name: "asc" } });
  return NextResponse.json({ machines });
}

export async function POST(req: Request) {
  const user = await apiUser();
  if (!user) return unauthorized();
  if (user.role !== "OWNER") return forbidden("Only the mill owner can manage machines");

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const parsed = machineSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: firstIssue(parsed.error) }, { status: 400 });
  }

  const machine = await prisma.machine.create({ data: parsed.data });
  return NextResponse.json({ machine }, { status: 201 });
}
