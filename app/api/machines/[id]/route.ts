import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { apiUser, unauthorized, forbidden } from "@/lib/auth";
import { machineSchema, firstIssue } from "@/lib/validation";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, ctx: Ctx) {
  const user = await apiUser();
  if (!user) return unauthorized();
  if (user.role !== "OWNER") return forbidden("Only the mill owner can manage machines");
  const { id } = await ctx.params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const parsed = machineSchema.partial().safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: firstIssue(parsed.error) }, { status: 400 });
  }

  const machine = await prisma.machine.findUnique({ where: { id } });
  if (!machine) return NextResponse.json({ error: "Machine not found" }, { status: 404 });

  const updated = await prisma.machine.update({ where: { id }, data: parsed.data });
  return NextResponse.json({ machine: updated });
}

/** Delete only when no stage events reference the machine; else deactivate. */
export async function DELETE(_req: Request, ctx: Ctx) {
  const user = await apiUser();
  if (!user) return unauthorized();
  if (user.role !== "OWNER") return forbidden("Only the mill owner can manage machines");
  const { id } = await ctx.params;

  const machine = await prisma.machine.findUnique({
    where: { id },
    include: { _count: { select: { stageEvents: true } } },
  });
  if (!machine) return NextResponse.json({ error: "Machine not found" }, { status: 404 });

  if (machine._count.stageEvents > 0) {
    return NextResponse.json(
      { error: "This machine has production history — deactivate it instead of deleting it." },
      { status: 409 }
    );
  }
  await prisma.machine.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
