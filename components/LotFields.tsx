"use client";

import { FIBER_TYPES, GRADES, VM_RATINGS, NATURAL_COLORS } from "@/lib/constants";
import { Field } from "@/components/ui";

export type LotFormValues = {
  fiberType: string;
  breed: string;
  greaseWeightG: string;
  conditionGrade: string;
  vmRating: string;
  stapleLengthMm: string;
  microns: string;
  color: string;
  notes: string;
};

export const emptyLot = (): LotFormValues => ({
  fiberType: "Merino Wool",
  breed: "",
  greaseWeightG: "",
  conditionGrade: "",
  vmRating: "",
  stapleLengthMm: "",
  microns: "",
  color: "",
  notes: "",
});

/** Intake assessment fields for one individually tracked bag/fleece. */
export default function LotFields({
  value,
  onChange,
  index,
}: {
  value: LotFormValues;
  onChange: (v: LotFormValues) => void;
  index: number;
}) {
  const set = (key: keyof LotFormValues) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    onChange({ ...value, [key]: e.target.value });

  return (
    <div className="border border-line rounded-xl p-4 bg-parchment/60 space-y-3">
      <p className="text-xs font-bold uppercase tracking-wider text-muted">Bag / Fleece #{index + 1}</p>
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <Field label="Fiber type *">
          <select className="input" value={value.fiberType} onChange={set("fiberType")}>
            {FIBER_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Breed">
          <input className="input" value={value.breed} onChange={set("breed")} placeholder="e.g. Rambouillet" />
        </Field>
        <Field label="Grease weight (g) *">
          <input
            className="input"
            type="number"
            min={1}
            step={1}
            value={value.greaseWeightG}
            onChange={set("greaseWeightG")}
            required
            placeholder="e.g. 4200"
          />
        </Field>
        <Field label="Natural color">
          <select className="input" value={value.color} onChange={set("color")}>
            <option value="">—</option>
            {NATURAL_COLORS.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Condition grade" hint="A excellent → D contaminated">
          <select className="input" value={value.conditionGrade} onChange={set("conditionGrade")}>
            <option value="">—</option>
            {GRADES.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Vegetable matter">
          <select className="input" value={value.vmRating} onChange={set("vmRating")}>
            <option value="">—</option>
            {VM_RATINGS.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Staple length (mm)">
          <input className="input" type="number" min={1} value={value.stapleLengthMm} onChange={set("stapleLengthMm")} />
        </Field>
        <Field label="Microns" hint="If a micronometer is available">
          <input className="input" type="number" min={1} max={99} value={value.microns} onChange={set("microns")} />
        </Field>
      </div>
      <Field label="Lot notes">
        <input className="input" value={value.notes} onChange={set("notes")} placeholder="Anything workers should know about this bag" />
      </Field>
    </div>
  );
}
