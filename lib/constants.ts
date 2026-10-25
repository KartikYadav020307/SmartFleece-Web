export const FIBER_TYPES = [
  "Merino Wool",
  "Rambouillet Wool",
  "Other Wool",
  "Huacaya Alpaca",
  "Suri Alpaca",
  "Mohair",
  "Angora",
  "Cashmere",
  "Blend",
  "Other",
] as const;

export const GRADES = ["A", "B", "C", "D"] as const;
export const VM_RATINGS = ["None", "Low", "Medium", "Heavy"] as const;
export const NATURAL_COLORS = ["White", "Cream", "Grey", "Brown", "Black", "Multi"] as const;
export const TARGET_PRODUCTS = ["Yarn", "Roving", "Batts", "Felt", "Washed Fiber"] as const;
export const YARN_WEIGHTS = ["Lace", "Fingering", "Sport", "DK", "Worsted", "Bulky"] as const;
export const PLY_OPTIONS = ["1", "2", "3", "4"] as const;
export const FLAG_TYPES = ["VM", "FELTING", "COLOR", "ODOR", "MOLD", "PEST", "WEIGHT", "OTHER"] as const;
export const SEVERITIES = ["LOW", "MEDIUM", "HIGH"] as const;

export const ORDER_STATUSES = [
  "RECEIVED",
  "IN_PRODUCTION",
  "READY_FOR_PICKUP",
  "COMPLETED",
  "CANCELLED",
] as const;

export const LOT_STATUSES = [
  "PENDING",
  "IN_PRODUCTION",
  "COMPLETED",
  "CONSUMED",
  "ON_HOLD",
  "CANCELLED",
] as const;

export const STAGE_EVENT_TYPES = ["COMPLETED", "SKIPPED"] as const;
export const LINEAGE_TYPES = ["BLEND", "SPLIT"] as const;
export const ROLES = ["OWNER", "WORKER", "ACCOUNTANT"] as const;

// A lot with no stage event for this many days is flagged as stalled on the dashboard.
export const STALL_DAYS = 3;

// Auto quality-flag threshold (spec 2.5): loss more than 15 points above the
// stage's expected loss percentage.
export const LOSS_DEVIATION_THRESHOLD = 15;

export const DEFAULT_STAGES: { name: string; optional?: boolean; expectedLossPct?: number }[] = [
  { name: "Intake & Assessment" },
  { name: "Pre-Sort" },
  { name: "Skirt/Trim", expectedLossPct: 5 },
  { name: "Washing", expectedLossPct: 35 },
  { name: "Rinse", expectedLossPct: 2 },
  { name: "Drying", expectedLossPct: 3 },
  { name: "Picking", expectedLossPct: 5 },
  { name: "Carding", expectedLossPct: 3 },
  { name: "Combing", optional: true, expectedLossPct: 8 },
  { name: "Drawing", expectedLossPct: 1 },
  { name: "Spinning", expectedLossPct: 1 },
  { name: "Plying", expectedLossPct: 0 },
  { name: "Finishing", expectedLossPct: 0 },
  { name: "Skeining/Winding", expectedLossPct: 0 },
  { name: "QC", expectedLossPct: 0 },
  { name: "Packaging", expectedLossPct: 0 },
];
