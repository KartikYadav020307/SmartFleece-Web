import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { apiUser, unauthorized, forbidden } from "@/lib/auth";
import { stageSchema, firstIssue } from "@/lib/validation";

export async function GET() {
  const user = await apiUser();
  if (!user) return unauthorized();
  const stages = await prisma.stage.findMany({ orderBy: { sequence: "asc" } });
  return NextResponse.json({ stages });
}

export async function POST(req: Request) {
  const user = await apiUser();
  if (!user) return unauthorized();
  if (user.role !== "OWNER") return forbidden("Only the mill owner can configure stages");

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const parsed = stageSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: firstIssue(parsed.error) }, { status: 400 });
  }

  const last = await prisma.stage.findFirst({ orderBy: { sequence: "desc" } });
  const stage = await prisma.stage.create({
    data: { ...parsed.data, sequence: (last?.sequence ?? -1) + 1 },
  });
  return NextResponse.json({ stage }, { status: 201 });
}
