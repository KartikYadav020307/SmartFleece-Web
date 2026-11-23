import { describe, expect, it } from "vitest";
import {
  assertApplicationTablesEmpty,
  assertManifestsMatch,
  getTableManifest,
  MIGRATION_TABLES,
  type PrismaDataClient,
} from "../scripts/migration-audit";

function manifestClient(userRows: Array<Record<string, unknown>>): PrismaDataClient {
  const client: Record<string, unknown> = {
    $executeRawUnsafe: async () => 0,
    $queryRawUnsafe: async () => [],
  };

  for (const table of MIGRATION_TABLES) {
    const rows = table.delegate === "user" ? userRows : [];
    client[table.delegate] = {
      count: async () => rows.length,
      findMany: async ({ skip, take }: { skip: number; take: number }) =>
        rows.slice(skip, skip + take),
    };
  }
  client.session = { count: async () => 0 };
  return client as PrismaDataClient;
}

describe("migration audit helpers", () => {
  it("creates stable row hashes regardless of database collation order", async () => {
    const first = [
      { id: "c2", name: "Ravi", createdAt: new Date("2026-01-02T03:04:05.006Z"), profile: { z: 2, a: 1 } },
      { id: "c1", name: "Priya", createdAt: new Date("2026-01-01T03:04:05.006Z"), profile: { a: 1, z: 2 } },
    ];
    const manifestA = await getTableManifest(manifestClient(first));
    const manifestB = await getTableManifest(manifestClient([...first].reverse()));

    expect(manifestA.User.rows).toBe(2);
    expect(manifestA.User.sha256).toBe(manifestB.User.sha256);
    expect(() => assertManifestsMatch(manifestA, manifestB)).not.toThrow();
  });

  it("refuses an import target with rows", async () => {
    const client = manifestClient([]) as Record<string, any>;
    client.lineageEdge.count = async () => 1;

    await expect(assertApplicationTablesEmpty(client as PrismaDataClient)).rejects.toThrow(
      /target is not empty: LineageEdge contains 1 rows/,
    );
  });
});
