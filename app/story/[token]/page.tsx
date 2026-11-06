import { resolveStoryToken } from "@/lib/story-token";
import { getPublicFiberStory } from "@/lib/provenance";
import { fmtDate, fmtDateTime, fmtWeight } from "@/lib/format";

export const dynamic = "force-dynamic";

/**
 * Public Fiber Story (Module 6.3) — End-product provenance certificate.
 * Accessible via dedicated opaque high-entropy token encoded on finished package QR.
 *
 * Privacy Guarantees:
 * - NO customer personal contact information (email, phone, street address).
 * - NO worker names or worker IDs.
 * - NO pricing, invoices, costs, or payment records.
 * - NO internal mill notes or operational flags.
 * - NO internal sequential or database IDs.
 */
export default async function FiberStoryPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const lotId = resolveStoryToken(token);

  if (!lotId) {
    return <StoryNotFoundMessage reason="Invalid or unrecognized provenance link." />;
  }

  const story = await getPublicFiberStory(lotId);
  if (!story) {
    return <StoryNotFoundMessage reason="This fiber story is not available or the order was cancelled." />;
  }

  const primaryBreed = story.origins[0]?.breed || story.origins[0]?.fiberType || "Fine Fiber";

  return (
    <div className="min-h-screen bg-cream py-10 px-4 antialiased">
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Certificate Header */}
        <header className="text-center space-y-2">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-forest-soft text-forest-dark text-3xl shadow-sm mb-1">
            🐑
          </div>
          <p className="text-xs font-bold uppercase tracking-widest text-forest">SmartFleece Provenance Certificate</p>
          <h1 className="text-3xl font-extrabold text-ink tracking-tight">The Fiber Story</h1>
          <p className="text-sm text-muted max-w-md mx-auto">
            Every gram of fiber has a story. This digital certificate verifies the origin, processing journey, and quality of your finished craft fiber.
          </p>
        </header>

        {/* Product Identity Hero */}
        <section className="card p-6 border-forest/20 shadow-sm relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-forest-soft/40 rounded-full blur-2xl -mr-10 -mt-10 pointer-events-none" />
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <span className="badge bg-forest-soft text-forest-dark font-medium text-xs">
                {story.provenanceType === "SINGLE_ORIGIN" ? "🌱 Single-Origin Fiber" : "🧺 Artisan Blend"}
              </span>
              <h2 className="text-2xl font-bold text-ink mt-2">{story.targetProduct}</h2>
              {story.productDescription ? (
                <p className="text-sm text-muted mt-0.5">{story.productDescription}</p>
              ) : null}
            </div>
            {story.qualityCertified ? (
              <div className="flex flex-col sm:items-end">
                <div className="flex items-center gap-1.5 bg-forest-soft/80 text-forest-dark border border-forest/20 rounded-full px-3 py-1 text-xs font-semibold">
                  <span>✓</span>
                  <span>Mill Quality Approved</span>
                </div>
                {story.qcCertifiedAt ? (
                  <span className="text-[10px] text-muted mt-1">
                    Verified {fmtDate(story.qcCertifiedAt)}
                    {story.qcVisualGrade ? ` · ${story.qcVisualGrade}` : ""}
                  </span>
                ) : null}
              </div>
            ) : null}
          </div>

          <dl className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-6 pt-5 border-t border-line">
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wider text-muted">Finished Weight</dt>
              <dd className="text-base font-bold text-ink mt-0.5">{fmtWeight(story.finishedWeightG)}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wider text-muted">Clean Yield</dt>
              <dd className="text-base font-bold text-ink mt-0.5">
                {story.overallYieldPct !== null ? `${story.overallYieldPct.toFixed(1)}%` : "—"}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wider text-muted">Primary Breed</dt>
              <dd className="text-base font-bold text-ink mt-0.5">{primaryBreed}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wider text-muted">Color</dt>
              <dd className="text-base font-bold text-ink mt-0.5">{story.color || "Natural"}</dd>
            </div>
          </dl>

          {story.microns || story.stapleLengthMm ? (
            <div className="mt-4 pt-3 border-t border-line/60 flex flex-wrap gap-4 text-xs text-muted">
              {story.microns ? <span>Fineness: <strong>{story.microns} µm</strong></span> : null}
              {story.stapleLengthMm ? <span>Staple length: <strong>{story.stapleLengthMm} mm</strong></span> : null}
              {story.conditionGrade ? <span>Grade: <strong>{story.conditionGrade}</strong></span> : null}
            </div>
          ) : null}
        </section>

        {/* Farm Origins */}
        <section className="card p-6">
          <div className="flex items-center justify-between gap-2 mb-4">
            <h2 className="text-base font-bold text-ink flex items-center gap-2">
              <span>🌾</span> Farm Origin{story.origins.length > 1 ? "s" : ""}
            </h2>
            <span className="text-xs text-muted">
              {story.origins.length === 1 ? "100% Single Farm" : `${story.origins.length} Contributing Farms`}
            </span>
          </div>

          <div className="space-y-3">
            {story.origins.map((origin, idx) => (
              <div key={idx} className="bg-parchment border border-line/80 rounded-xl p-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h3 className="font-bold text-ink text-base">{origin.farmName}</h3>
                  {story.origins.length > 1 ? (
                    <span className="text-xs font-semibold bg-amber-soft text-amber px-2 py-0.5 rounded-full">
                      {origin.contributionPct}% blend contribution
                    </span>
                  ) : null}
                </div>
                <div className="grid sm:grid-cols-3 gap-2 mt-2.5 text-xs text-muted">
                  <div>
                    <span className="font-semibold text-ink/80">Fiber & Breed:</span>{" "}
                    {origin.breed ? `${origin.breed} (${origin.fiberType})` : origin.fiberType}
                  </div>
                  <div>
                    <span className="font-semibold text-ink/80">Shearing Date:</span>{" "}
                    {origin.shearingDate ? fmtDate(origin.shearingDate) : "Seasonal clip"}
                  </div>
                  {origin.location ? (
                    <div>
                      <span className="font-semibold text-ink/80">Region:</span> {origin.location}
                    </div>
                  ) : null}
                </div>
                {origin.farmInfo ? (
                  <p className="text-xs text-muted/90 mt-2 italic bg-white/60 p-2 rounded-lg">
                    “{origin.farmInfo}”
                  </p>
                ) : null}
              </div>
            ))}
          </div>
        </section>

        {/* Processing Journey Timeline */}
        <section className="card p-6">
          <div className="flex items-center justify-between gap-2 mb-4">
            <h2 className="text-base font-bold text-ink flex items-center gap-2">
              <span>⚙️</span> Mill Processing Journey
            </h2>
            <span className="text-xs text-muted">{story.timeline.length} Stages Verified</span>
          </div>

          <div className="relative border-l-2 border-line/80 ml-3.5 space-y-4 py-1">
            {story.timeline.map((step, idx) => (
              <div key={idx} className="relative pl-6">
                <span className="absolute -left-2 top-1 w-3.5 h-3.5 rounded-full bg-forest border-2 border-white shadow-xs" />
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h3 className="text-sm font-bold text-ink">{step.stageName}</h3>
                  <time className="text-xs text-muted">{fmtDateTime(step.completedAt)}</time>
                </div>
                {step.outputWeightG ? (
                  <p className="text-xs text-muted mt-0.5">
                    Yield at this stage: <strong>{fmtWeight(step.outputWeightG)}</strong>
                  </p>
                ) : null}
              </div>
            ))}
          </div>
        </section>

        {/* Provenance Seal / Footer */}
        <footer className="card p-6 text-center space-y-3 bg-white">
          <div className="inline-block border-2 border-forest/30 rounded-2xl p-4 max-w-md mx-auto">
            <p className="text-2xl" aria-hidden>
              🧶
            </p>
            <h3 className="text-sm font-bold text-ink mt-1">SmartFleece Craft Mill Guarantee</h3>
            <p className="text-xs text-muted mt-1 leading-relaxed">
              This yarn was processed on small-scale mill equipment adhering to gentle fiber-handling practices. Every gram is fully traceable back to its farm of origin.
            </p>
          </div>
          <p className="text-xs text-muted/70">
            SmartFleece Digital Provenance System · Opaque Verification Link
          </p>
        </footer>
      </div>
    </div>
  );
}

function StoryNotFoundMessage({ reason }: { reason: string }) {
  return (
    <div className="min-h-screen bg-cream flex items-center justify-center p-6">
      <div className="card p-8 max-w-md w-full text-center space-y-3">
        <p className="text-4xl" aria-hidden>
          🌾
        </p>
        <h1 className="text-lg font-bold text-ink">Provenance Record Not Found</h1>
        <p className="text-sm text-muted leading-relaxed">{reason}</p>
        <p className="text-xs text-muted/80 pt-2">
          If you received this package from a craft artisan, please confirm the QR code on your product label.
        </p>
      </div>
    </div>
  );
}
