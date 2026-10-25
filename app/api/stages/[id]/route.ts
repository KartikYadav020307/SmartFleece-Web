import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { apiUser, unauthorized, forbidden } from "@/lib/auth";
import { stageSchema, firstIssue } from "@/lib/validation";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, ctx: Ctx) {
  const user = await apiUser();
  if (!user) return unauthorized();
  if (user.role !== "OWNER") return forbidden("Only the mill owner can configure stages");
  const { id } = await ctx.params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const parsed = stageSchema.partial().safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: firstIssue(parsed.error) }, { status: 400 });
  }

  const stage = await prisma.stage.findUnique({ where: { id } });
  if (!stage) return NextResponse.json({ error: "Stage not found" }, { status: 404 });

  const updated = await prisma.stage.update({ where: { id }, data: parsed.data });
  return NextResponse.json({ stage: updated });
}

/**
 * Deleting a stage would corrupt stage-event history, so it is only allowed
 * when nothing references it. Stages with history should be deactivated
 * (isActive=false) instead.
 */
export async function DELETE(_req: Request, ctx: Ctx) {
  const user = await apiUser();
  if (!user) return unauthorized();
  if (user.role !== "OWNER") return forbidden("Only the mill owner can configure stages");
  const { id } = await ctx.params;

  const stage = await prisma.stage.findUnique({
    where: { id },
    include: { _count: { select: { stageEvents: true, lots: true } } },
  });
  if (!stage) return NextResponse.json({ error: "Stage not found" }, { status: 404 });

  if (stage._count.stageEvents > 0 || stage._count.lots > 0) {
    return NextResponse.json(
      {
        error:
          "This stage has production history or lots assigned — deactivate it instead of deleting it.",
      },
      { status: 409 }
    );
  }

  await prisma.stage.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
