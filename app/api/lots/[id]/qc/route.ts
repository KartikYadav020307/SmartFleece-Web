import { NextResponse } from "next/server";
import { apiUser, unauthorized, forbidden } from "@/lib/auth";
import { qcInspectionSchema, firstIssue } from "@/lib/validation";
import { getLotQC, recordQCInspection } from "@/lib/qc";
import { AppError } from "@/lib/errors";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const user = await apiUser();
  if (!user) return unauthorized();
  const { id } = await ctx.params;

  const qcData = await getLotQC(id);
  if (!qcData) {
    return NextResponse.json({ error: "Lot not found" }, { status: 404 });
  }

  return NextResponse.json(qcData);
}

export async function POST(req: Request, ctx: Ctx) {
  const user = await apiUser();
  if (!user) return unauthorized();
  if (user.role !== "OWNER" && user.role !== "WORKER") {
    return forbidden("Only mill owners and workers can record QC inspections");
  }

  const { id } = await ctx.params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = qcInspectionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: firstIssue(parsed.error) }, { status: 400 });
  }

  try {
    const result = await recordQCInspection(
      id,
      { id: user.id, name: user.name },
      parsed.data
    );

    return NextResponse.json(
      {
        ok: true,
        qc: result.qc,
        lotStatus: result.lot.status,
        currentWeightG: result.lot.currentWeightG,
      },
      { status: 201 }
    );
  } catch (err) {
    if (err instanceof AppError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("[QC POST error]", err);
    return NextResponse.json({ error: "Failed to record QC inspection" }, { status: 500 });
  }
}
