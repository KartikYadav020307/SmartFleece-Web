import { NextResponse } from "next/server";
import { apiUser, unauthorized } from "@/lib/auth";
import { splitSchema, blendSchema, firstIssue } from "@/lib/validation";
import { splitLot, blendLots } from "@/lib/lineage";
import { AppError } from "@/lib/errors";

/**
 * Lot lineage operations.
 *  { type: "SPLIT", parentId, children: [{ weightG, notes? }], notes? }
 *  { type: "BLEND", lotIds: [...], fiberType?, notes? }
 */
export async function POST(req: Request) {
  const user = await apiUser();
  if (!user) return unauthorized();

  let body: { type?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  try {
    if (body.type === "SPLIT") {
      const parsed = splitSchema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json({ error: firstIssue(parsed.error) }, { status: 400 });
      }
      const childIds = await splitLot({
        parentId: (body as { parentId?: string }).parentId ?? "",
        children: parsed.data.children,
        notes: parsed.data.notes,
      });
      return NextResponse.json({ ok: true, type: "SPLIT", childIds }, { status: 201 });
    }

    if (body.type === "BLEND") {
      const parsed = blendSchema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json({ error: firstIssue(parsed.error) }, { status: 400 });
      }
      const batchId = await blendLots({
        lotIds: parsed.data.lotIds,
        fiberType: parsed.data.fiberType,
        notes: parsed.data.notes,
      });
      return NextResponse.json({ ok: true, type: "BLEND", batchId }, { status: 201 });
    }

    return NextResponse.json({ error: 'type must be "SPLIT" or "BLEND"' }, { status: 400 });
  } catch (err) {
    if (err instanceof AppError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("[lineage POST]", err);
    return NextResponse.json({ error: "Lineage operation failed" }, { status: 500 });
  }
}
