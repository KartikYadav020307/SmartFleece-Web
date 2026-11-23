import { createHash } from "node:crypto";

export type PrismaDataClient = Record<string, any> & {
  $executeRawUnsafe(query: string): Promise<number>;
  $queryRawUnsafe<T = unknown>(query: string): Promise<T>;
};

export const MIGRATION_TABLES = [
  { model: "User", delegate: "user" },
  { model: "Customer", delegate: "customer" },
  { model: "Stage", delegate: "stage" },
  { model: "Machine", delegate: "machine" },
  { model: "PricingConfig", delegate: "pricingConfig" },
  { model: "Order", delegate: "order" },
  { model: "FiberLot", delegate: "fiberLot" },
  { model: "StageEvent", delegate: "stageEvent" },
  { model: "LineageEdge", delegate: "lineageEdge" },
  { model: "QualityFlag", delegate: "qualityFlag" },
  { model: "NotificationLog", delegate: "notificationLog" },
  { model: "Invoice", delegate: "invoice" },
  { model: "Payment", delegate: "payment" },
  { model: "QCInspection", delegate: "qCInspection" },
] as const;

export const SESSION_DELEGATE = "session";
export const MIGRATION_BATCH_SIZE = 250;

export type TableManifest = Record<string, { rows: number; sha256: string }>;

function canonicalValue(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, canonicalValue(nested)]),
    );
  }
  return value;
}

export async function assertSqliteIntegrity(client: PrismaDataClient): Promise<void> {
  await client.$executeRawUnsafe("PRAGMA query_only = ON");

  const integrityRows = (await client.$queryRawUnsafe("PRAGMA integrity_check")) as Array<
    Record<string, string>
  >;
  const integrityValue = integrityRows[0] ? Object.values(integrityRows[0])[0] : undefined;
  if (integrityValue !== "ok") {
    throw new Error("SQLite source refused: PRAGMA integrity_check did not return ok.");
  }

  const foreignKeyViolations = (await client.$queryRawUnsafe(
    "PRAGMA foreign_key_check",
  )) as unknown[];
  if (foreignKeyViolations.length > 0) {
    throw new Error("SQLite source refused: PRAGMA foreign_key_check reported violations.");
  }
}

export async function getModelCounts(client: PrismaDataClient): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  for (const table of MIGRATION_TABLES) {
    counts[table.model] = await client[table.delegate].count();
  }
  counts.Session = await client[SESSION_DELEGATE].count();
  return counts;
}

export async function getTableManifest(client: PrismaDataClient): Promise<TableManifest> {
  const manifest: TableManifest = {};
  for (const table of MIGRATION_TABLES) {
    const serializedRows: Array<{ id: string; value: string }> = [];
    let rowsRead = 0;
    while (true) {
      const rows = await client[table.delegate].findMany({
        orderBy: { id: "asc" },
        skip: rowsRead,
        take: MIGRATION_BATCH_SIZE,
      });
      if (rows.length === 0) break;
      for (const row of rows) {
        serializedRows.push({
          id: String(row.id),
          value: JSON.stringify(canonicalValue(row)),
        });
      }
      rowsRead += rows.length;
    }
    // Sort in JavaScript so SQLite and PostgreSQL collation settings cannot
    // produce different hashes for the same primary-keyed rows.
    serializedRows.sort((left, right) => (left.id < right.id ? -1 : left.id > right.id ? 1 : 0));
    const hash = createHash("sha256");
    for (const row of serializedRows) hash.update(`${row.value}\n`);
    manifest[table.model] = { rows: rowsRead, sha256: hash.digest("hex") };
  }
  return manifest;
}

export function assertManifestsMatch(
  source: TableManifest,
  target: TableManifest,
): void {
  for (const table of MIGRATION_TABLES) {
    const left = source[table.model];
    const right = target[table.model];
    if (!left || !right || left.rows !== right.rows || left.sha256 !== right.sha256) {
      throw new Error(`Migration verification failed for ${table.model}.`);
    }
  }
}

export async function copyMigrationTables(
  source: PrismaDataClient,
  target: PrismaDataClient,
): Promise<void> {
  for (const table of MIGRATION_TABLES) {
    const sourceDelegate = source[table.delegate];
    const targetDelegate = target[table.delegate];
    let offset = 0;
    while (true) {
      const rows = await sourceDelegate.findMany({
        orderBy: { id: "asc" },
        skip: offset,
        take: MIGRATION_BATCH_SIZE,
      });
      if (rows.length === 0) break;
      await targetDelegate.createMany({ data: rows });
      offset += rows.length;
    }
  }
}

export async function assertApplicationTablesEmpty(
  client: PrismaDataClient,
): Promise<void> {
  for (const table of [...MIGRATION_TABLES, { model: "Session", delegate: SESSION_DELEGATE }]) {
    const count = await client[table.delegate].count();
    if (count !== 0) {
      throw new Error(`PostgreSQL target is not empty: ${table.model} contains ${count} rows.`);
    }
  }
}
