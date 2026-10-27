import { z } from "zod";
import {
  FIBER_TYPES,
  GRADES,
  VM_RATINGS,
  NATURAL_COLORS,
  TARGET_PRODUCTS,
  ORDER_STATUSES,
  LOT_STATUSES,
  STAGE_EVENT_TYPES,
  FLAG_TYPES,
  SEVERITIES,
} from "./constants";

const optionalString = z
  .string()
  .trim()
  .max(2000)
  .optional()
  .transform((v) => (v === "" ? undefined : v));

const optionalInt = z.preprocess(
  (v) => (v === "" || v === null || v === undefined ? undefined : v),
  z.coerce.number().int().optional()
);

export const customerSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120),
  email: z
    .union([z.string().trim().email("Invalid email"), z.literal("")])
    .optional()
    .transform((v) => (v === "" ? undefined : v)),
  phone: optionalString,
  farmName: optionalString,
  location: optionalString,
  preferences: optionalString,
  notes: optionalString,
});

export const lotInputSchema = z.object({
  fiberType: z.string().trim().min(1, "Fiber type is required").max(60),
  breed: optionalString,
  greaseWeightG: z.coerce
    .number({ invalid_type_error: "Grease weight must be a number" })
    .int("Grease weight must be whole grams")
    .positive("Grease weight must be greater than zero"),
  conditionGrade: z.enum(GRADES).optional().or(z.literal("")).transform((v) => (v === "" ? undefined : v)),
  vmRating: z.enum(VM_RATINGS).optional().or(z.literal("")).transform((v) => (v === "" ? undefined : v)),
  stapleLengthMm: optionalInt.refine((v) => v === undefined || v > 0, "Staple length must be positive"),
  microns: optionalInt.refine((v) => v === undefined || (v > 0 && v < 100), "Microns must be between 1 and 99"),
  color: z.enum(NATURAL_COLORS).optional().or(z.literal("")).transform((v) => (v === "" ? undefined : v)),
  notes: optionalString,
});

const optionalDate = z
  .union([z.string(), z.literal(""), z.undefined(), z.null()])
  .optional()
  .transform((v) => (v === "" || v === null || v === undefined ? undefined : new Date(v)))
  .refine((v) => v === undefined || !isNaN(v.getTime()), "Invalid date");

export const orderSchema = z.object({
  customerId: z.string().min(1, "Customer is required"),
  shearingDate: optionalDate,
  farmInfo: optionalString,
  targetProduct: z.enum(TARGET_PRODUCTS).optional().or(z.literal("")).transform((v) => (v === "" ? undefined : v)),
  yarnSpecs: optionalString,
  dyeSpecs: optionalString,
  rush: z.coerce.boolean().default(false),
  notes: optionalString,
  lots: z.array(lotInputSchema).min(1, "An order needs at least one fiber lot"),
});

export const lotCreateSchema = lotInputSchema;

export const stageEventSchema = z.object({
  stageId: z.string().min(1),
  eventType: z.enum(STAGE_EVENT_TYPES).default("COMPLETED"),
  machineId: z.string().optional(),
  machine: optionalString,
  inputWeightG: optionalInt.refine((v) => v === undefined || v >= 0, "Weight must be zero or more"),
  outputWeightG: optionalInt.refine((v) => v === undefined || v >= 0, "Weight must be zero or more"),
  notes: optionalString,
  flagType: z.enum(FLAG_TYPES).optional().or(z.literal("")).transform((v) => (v === "" ? undefined : v)),
  flagSeverity: z.enum(SEVERITIES).optional(),
  flagNotes: optionalString,
  clientEventId: optionalString,
});

export const splitSchema = z.object({
  children: z
    .array(
      z.object({
        weightG: z.coerce.number().int().positive("Child weight must be positive grams"),
        notes: optionalString,
      })
    )
    .min(2, "A split needs at least 2 children")
    .max(6, "A split supports at most 6 children"),
  notes: optionalString,
});

export const blendSchema = z.object({
  lotIds: z.array(z.string()).min(2, "Select at least 2 lots to blend"),
  fiberType: z.string().trim().min(1).max(60).default("Blend"),
  notes: optionalString,
});

export const stageSchema = z.object({
  name: z.string().trim().min(1, "Stage name is required").max(60),
  optional: z.coerce.boolean().default(false),
  expectedLossPct: z.coerce.number().min(0).max(100).default(0),
});

export const qualityFlagSchema = z.object({
  lotId: z.string().min(1),
  flagType: z.enum(FLAG_TYPES),
  severity: z.enum(SEVERITIES).default("MEDIUM"),
  notes: optionalString,
});

export const orderUpdateSchema = z.object({
  status: z.enum(ORDER_STATUSES).optional(),
  rush: z.coerce.boolean().optional(),
  estimatedCompletion: optionalDate,
  notes: optionalString,
});

export const lotUpdateSchema = z.object({
  status: z.enum(LOT_STATUSES).optional(),
  notes: optionalString,
});

export const pricingSchema = z.object({
  currencyCode: z
    .string()
    .trim()
    .regex(/^[A-Za-z]{3}$/, "Currency code must be 3 letters (e.g. INR, USD)")
    .transform((v) => v.toUpperCase()),
  currencySymbol: z.string().trim().min(1, "Currency symbol is required").max(4),
  taxLabel: z.string().trim().min(1, "Tax label is required").max(20),
  taxRatePct: z.coerce.number().min(0, "Tax rate cannot be negative").max(100),
  rushMultiplier: z.coerce.number().min(1, "Rush multiplier must be at least 1").max(5),
  minimumOrderFeeMajor: z.coerce.number().min(0, "Minimum order fee cannot be negative"),
  defaultRateMajorPerKg: z.coerce.number().min(0, "Rate cannot be negative"),
  baseRatesMajorPerKg: z.record(z.string(), z.coerce.number().min(0)),
});

export const paymentSchema = z.object({
  amountMajor: z.coerce.number().positive("Payment amount must be greater than zero"),
  method: z.enum(["Cash", "Bank", "UPI", "Other"]).default("Cash"),
  reference: optionalString,
  paidAt: optionalDate,
});

export const extraChargeSchema = z.object({
  description: z.string().trim().min(1, "Description is required").max(120),
  amountMajor: z.coerce.number().positive("Amount must be greater than zero"),
});

export const machineSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(60),
  type: z.string().trim().min(1, "Type is required").max(40),
  capacityKg: z.coerce.number().min(0, "Capacity cannot be negative").max(10000).default(0),
  status: z.enum(["AVAILABLE", "IN_USE", "MAINTENANCE"]).default("AVAILABLE"),
  notes: optionalString,
  isActive: z.coerce.boolean().default(true),
});

export const DELAY_REASONS = [
  "MACHINE_BREAKDOWN",
  "FIBER_CONDITION",
  "STAFF_ABSENCE",
  "RUSH_REORDER",
  "WEATHER",
  "OTHER",
] as const;

export const delaySchema = z.object({
  reason: z.enum(DELAY_REASONS),
  extraDays: z.coerce
    .number()
    .int("Days must be a whole number")
    .min(1, "Delay must be at least 1 day")
    .max(60, "Delay cannot exceed 60 days"),
  notes: optionalString,
});

export function firstIssue(error: z.ZodError): string {
  const issue = error.issues[0];
  return issue ? `${issue.path.join(".") || "input"}: ${issue.message}` : "Invalid input";
}
