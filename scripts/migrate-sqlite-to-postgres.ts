import { PrismaClient as SqlitePrismaClient } from "@prisma/client";
import { createRequire } from "node:module";
import path from "node:path";
import {
  assertRemoteImportOptIn,
  assertSqliteSourceUnchanged,
  getVerifiedSqliteSource,
  getVerifiedSupabaseSessionTarget,
} from "../lib/migration-safety";
import {
  assertApplicationTablesEmpty,
  assertManifestsMatch,
  assertSqliteIntegrity,
  copyMigrationTables,
  getModelCounts,
  getTableManifest,
} from "./migration-audit";

const require = createRequire(__filename);
const { PrismaClient: PostgresPrismaClient } = require(
  path.resolve(process.cwd(), "node_modules/.prisma/smartfleece-postgresql"),
);

type PrismaClientLike = {
  $connect(): Promise<void>;
  $disconnect(): Promise<void>;
  $executeRawUnsafe(query: string): Promise<number>;
  $queryRawUnsafe<T = unknown>(query: string): Promise<T>;
  $transaction<T>(
    action: (transaction: any) => Promise<T>,
    options: { isolationLevel: "Serializable"; maxWait: number; timeout: number },
  ): Promise<T>;
  [delegate: string]: any;
};

function selectedMode(): "preflight" | "execute" {
  const preflight = process.argv.includes("--preflight");
  const execute = process.argv.includes("--execute");
  if (preflight === execute) {
    throw new Error("Choose exactly one mode: --preflight (read-only) or --execute (writes rows).");
  }
  return execute ? "execute" : "preflight";
}

async function main(): Promise<void> {
  const mode = selectedMode();
  if (mode === "execute") assertRemoteImportOptIn();

  const target = getVerifiedSupabaseSessionTarget();
  const sourceInfo = await getVerifiedSqliteSource(process.env, process.cwd());
  const source = new SqlitePrismaClient({ datasourceUrl: sourceInfo.url }) as unknown as PrismaClientLike;
  const postgres = new PostgresPrismaClient({ datasourceUrl: target.url }) as PrismaClientLike;

  try {
    await source.$connect();
    await postgres.$connect();
    await assertSqliteIntegrity(source);

    const sourceManifest = await getTableManifest(source);
    const sourceSessions = await source.session.count();

    if (mode === "preflight") {
      await assertApplicationTablesEmpty(postgres);
      await assertSqliteSourceUnchanged(sourceInfo);
      console.log(
        JSON.stringify(
          {
            mode,
            targetProjectRef: target.projectRef,
            sourceSha256: sourceInfo.sha256,
            sourceRows: Object.fromEntries(
              Object.entries(sourceManifest).map(([model, value]) => [model, value.rows]),
            ),
            sourceSessionRowsToInvalidate: sourceSessions,
            targetApplicationRows: 0,
            databaseWrites: 0,
          },
          null,
          2,
        ),
      );
      return;
    }

    await postgres.$transaction(
      async (transaction) => {
        await assertApplicationTablesEmpty(transaction);
        await copyMigrationTables(source, transaction);

        const targetManifest = await getTableManifest(transaction);
        assertManifestsMatch(sourceManifest, targetManifest);

        const targetCounts = await getModelCounts(transaction);
        if (targetCounts.Session !== 0) {
          throw new Error("Migration verification failed: PostgreSQL Session table must remain empty.");
        }

        await assertSqliteSourceUnchanged(sourceInfo);
      },
      { isolationLevel: "Serializable", maxWait: 10_000, timeout: 120_000 },
    );

    console.log(
      JSON.stringify(
        {
          mode,
          targetProjectRef: target.projectRef,
          sourceSha256: sourceInfo.sha256,
          importedRows: Object.fromEntries(
            Object.entries(sourceManifest).map(([model, value]) => [model, value.rows]),
          ),
          sourceSessionRowsInvalidated: sourceSessions,
          targetSessionRows: 0,
          transaction: "committed after row-count and row-hash checks",
        },
        null,
        2,
      ),
    );
  } finally {
    await Promise.all([source.$disconnect(), postgres.$disconnect()]);
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "";
  const safeMessage =
    /^(Choose exactly one mode|PostgreSQL target refused|SQLite source refused|Remote data import refused|PostgreSQL target is not empty|Migration verification failed)/.test(
      message,
    );
  console.error(
    safeMessage
      ? message
      : "Migration stopped. No connection strings or row values were printed; inspect local Prisma diagnostics with credentials redacted.",
  );
  process.exitCode = 1;
});
