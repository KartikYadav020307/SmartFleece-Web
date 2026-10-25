import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { apiUser, unauthorized, forbidden } from "@/lib/auth";

const bodySchema = z.object({ ids: z.array(z.string()).min(1) });

/** Reorder stages: receives the full ordered list of stage ids. */
export async function PUT(req: Request) {
  const user = await apiUser();
  if (!user) return unauthorized();
  if (user.role !== "OWNER") return forbidden("Only the mill owner can configure stages");

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Expected { ids: [...] }" }, { status: 400 });
  }

  const stages = await prisma.stage.findMany({ select: { id: true } });
  const known = new Set(stages.map((s) => s.id));
  if (parsed.data.ids.some((id) => !known.has(id))) {
    return NextResponse.json({ error: "Unknown stage id in reorder list" }, { status: 400 });
  }

  await prisma.$transaction(
    parsed.data.ids.map((id, index) =>
      prisma.stage.update({ where: { id }, data: { sequence: index } })
    )
  );
  return NextResponse.json({ ok: true });
}
