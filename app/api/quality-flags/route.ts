import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { apiUser, unauthorized } from "@/lib/auth";
import { qualityFlagSchema, firstIssue } from "@/lib/validation";

export async function GET(req: Request) {
  const user = await apiUser();
  if (!user) return unauthorized();
  const url = new URL(req.url);
  const status = url.searchParams.get("status") ?? "OPEN";
  const flags = await prisma.qualityFlag.findMany({
    where: status === "ALL" ? {} : { status },
    orderBy: { createdAt: "desc" },
    take: 200,
    include: {
      lot: { select: { id: true, lotCode: true, fiberType: true } },
    },
  });
  return NextResponse.json({ flags });
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
  const parsed = qualityFlagSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: firstIssue(parsed.error) }, { status: 400 });
  }

  const lot = await prisma.fiberLot.findUnique({ where: { id: parsed.data.lotId } });
  if (!lot) return NextResponse.json({ error: "Lot not found" }, { status: 404 });

  const flag = await prisma.qualityFlag.create({ data: parsed.data });
  return NextResponse.json({ flag }, { status: 201 });
}
