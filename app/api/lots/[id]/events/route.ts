import { NextResponse } from "next/server";
import { apiUser, unauthorized } from "@/lib/auth";
import { stageEventSchema, firstIssue } from "@/lib/validation";
import { completeStageEvent } from "@/lib/production";
import { AppError } from "@/lib/errors";

type Ctx = { params: Promise<{ id: string }> };

/** Record a stage event for a lot (scan workflow). Idempotent via clientEventId. */
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
  const parsed = stageEventSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: firstIssue(parsed.error) }, { status: 400 });
  }

  try {
    const result = await completeStageEvent({
      lotId: id,
      workerId: user.id,
      ...parsed.data,
    });
    return NextResponse.json({
      ok: true,
      duplicate: result.duplicate,
      lotStatus: result.lotStatus,
      nextStageName: result.nextStageName,
      completed: result.completed,
      weightDeltaG: result.weightDeltaG,
    });
  } catch (err) {
    if (err instanceof AppError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("[stage event POST]", err);
    return NextResponse.json({ error: "Could not record stage event" }, { status: 500 });
  }
}
