import { NextResponse } from "next/server";
import { apiUser, unauthorized } from "@/lib/auth";
import { undoLastEvent } from "@/lib/production";
import { AppError } from "@/lib/errors";

type Ctx = { params: Promise<{ id: string }> };

/** Revert the lot's most recent stage event (auditable correction). */
export async function POST(_req: Request, ctx: Ctx) {
  const user = await apiUser();
  if (!user) return unauthorized();
  const { id } = await ctx.params;

  try {
    await undoLastEvent(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof AppError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("[lot undo POST]", err);
    return NextResponse.json({ error: "Could not undo stage event" }, { status: 500 });
  }
}
