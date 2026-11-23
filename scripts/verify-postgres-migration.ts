import { PrismaClient as SqlitePrismaClient } from "@prisma/client";
import { createRequire } from "node:module";
import path from "node:path";
import {
  assertSqliteSourceUnchanged,
  getVerifiedSqliteSource,
  getVerifiedSupabaseSessionTarget,
} from "../lib/migration-safety";
import {
  assertManifestsMatch,
  assertSqliteIntegrity,
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
  [delegate: string]: any;
};

async function main(): Promise<void> {
  if (!process.argv.includes("--verify")) {
    throw new Error("No database connection was made. Run explicitly with --verify after an approved import.");
  }

  const target = getVerifiedSupabaseSessionTarget();
  const sourceInfo = await getVerifiedSqliteSource(process.env, process.cwd());
  const source = new SqlitePrismaClient({ datasourceUrl: sourceInfo.url }) as unknown as PrismaClientLike;
  const postgres = new PostgresPrismaClient({ datasourceUrl: target.url }) as PrismaClientLike;

  try {
    await source.$connect();
    await postgres.$connect();
    await assertSqliteIntegrity(source);

    const sourceManifest = await getTableManifest(source);
    const targetManifest = await getTableManifest(postgres);
    assertManifestsMatch(sourceManifest, targetManifest);

    const sourceCounts = await getModelCounts(source);
    const targetCounts = await getModelCounts(postgres);
    if (targetCounts.Session !== 0) {
      throw new Error("Migration verification failed: PostgreSQL Session table must remain empty.");
    }

    const foreignKeyStatus = (await postgres.$queryRawUnsafe(
      `SELECT COUNT(*)::integer AS "unvalidatedForeignKeys"
       FROM pg_constraint c
       JOIN pg_namespace n ON n.oid = c.connamespace
       WHERE c.contype = 'f' AND n.nspname = 'public' AND NOT c.convalidated`,
    )) as Array<{ unvalidatedForeignKeys: number }>;
    const unvalidated = foreignKeyStatus[0]?.unvalidatedForeignKeys ?? -1;
    if (unvalidated !== 0) {
      throw new Error("Migration verification failed: PostgreSQL has unvalidated foreign keys.");
    }

    const roleStatus = (await postgres.$queryRawUnsafe(
      `SELECT current_user AS "databaseRole", r.rolsuper AS "isSuperuser", r.rolbypassrls AS "bypassesRls"
       FROM pg_roles r WHERE r.rolname = current_user`,
    )) as Array<{ databaseRole: string; isSuperuser: boolean; bypassesRls: boolean }>;
    if (!roleStatus[0]) {
      throw new Error("Migration verification failed: could not inspect the connected PostgreSQL role.");
    }

    const rlsStatus = (await postgres.$queryRawUnsafe(
      `SELECT COUNT(*)::integer AS "tableCount",
              COUNT(*) FILTER (WHERE c.relrowsecurity)::integer AS "rlsEnabledCount",
              COUNT(*) FILTER (WHERE c.relforcerowsecurity)::integer AS "rlsForcedCount"
       FROM pg_class c
       JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public' AND c.relkind = 'r'`,
    )) as Array<{ tableCount: number; rlsEnabledCount: number; rlsForcedCount: number }>;

    const apiGrants = (await postgres.$queryRawUnsafe(
      `SELECT grantee, privilege_type AS "privilegeType", COUNT(*)::integer AS "tableCount"
       FROM information_schema.role_table_grants
       WHERE table_schema = 'public'
         AND grantee IN ('anon', 'authenticated', 'service_role')
       GROUP BY grantee, privilege_type
       ORDER BY grantee, privilege_type`,
    )) as Array<{ grantee: string; privilegeType: string; tableCount: number }>;

    await assertSqliteSourceUnchanged(sourceInfo);
    console.log(
      JSON.stringify(
        {
          targetProjectRef: target.projectRef,
          sourceSha256: sourceInfo.sha256,
          sourceRows: sourceCounts,
          targetRows: targetCounts,
          sessionPolicy: { sourceRowsInvalidated: sourceCounts.Session, targetRows: targetCounts.Session },
          unvalidatedForeignKeys: unvalidated,
          databaseRole: roleStatus[0],
          rowLevelSecurity: rlsStatus[0],
          apiRoleTableGrants: apiGrants,
          scalarRowHashesMatch: true,
          result: "verified",
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
    /^(No database connection|PostgreSQL target refused|SQLite source refused|Migration verification failed)/.test(
      message,
    );
  console.error(
    safeMessage
      ? message
      : "Verification stopped. No connection strings or row values were printed; inspect local Prisma diagnostics with credentials redacted.",
  );
  process.exitCode = 1;
});
