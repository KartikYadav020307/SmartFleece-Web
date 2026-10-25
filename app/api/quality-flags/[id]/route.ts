import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { apiUser, unauthorized } from "@/lib/auth";

const bodySchema = z.object({ status: z.enum(["OPEN", "RESOLVED"]) });

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, ctx: Ctx) {
  const user = await apiUser();
  if (!user) return unauthorized();
  const { id } = await ctx.params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "status must be OPEN or RESOLVED" }, { status: 400 });
  }

  const flag = await prisma.qualityFlag.findUnique({ where: { id } });
  if (!flag) return NextResponse.json({ error: "Flag not found" }, { status: 404 });

  const updated = await prisma.qualityFlag.update({
    where: { id },
    data:
      parsed.data.status === "RESOLVED"
        ? { status: "RESOLVED", resolvedBy: user.name, resolvedAt: new Date() }
        : { status: "OPEN", resolvedBy: null, resolvedAt: null },
  });
  return NextResponse.json({ flag: updated });
}
