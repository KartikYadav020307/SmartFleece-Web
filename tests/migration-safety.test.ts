import { afterEach, describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  assertRemoteImportOptIn,
  getVerifiedSqliteSource,
  getVerifiedSupabaseSessionTarget,
  SMARTFLEECE_SUPABASE_PROJECT_REF,
  type MigrationEnvironment,
} from "../lib/migration-safety";

const scratch: string[] = [];
const validPoolerUrl =
  `postgresql://postgres.${SMARTFLEECE_SUPABASE_PROJECT_REF}:placeholder@aws-1-ap-southeast-1.pooler.supabase.com:5432/postgres?sslmode=require`;

function approvedTargetEnv(overrides: MigrationEnvironment = {}): MigrationEnvironment {
  return {
    DIRECT_URL: validPoolerUrl,
    SMARTFLEECE_EXPECTED_SUPABASE_PROJECT_REF: SMARTFLEECE_SUPABASE_PROJECT_REF,
    SMARTFLEECE_CONFIRM_SUPABASE_PROJECT_REF: SMARTFLEECE_SUPABASE_PROJECT_REF,
    ...overrides,
  };
}

function tempSource(contents = "migration-source-fixture"): { directory: string; file: string; hash: string } {
  const directory = mkdtempSync(path.join(os.tmpdir(), "smartfleece-migration-safety-"));
  scratch.push(directory);
  const file = path.join(directory, "source.db");
  writeFileSync(file, contents);
  return { directory, file, hash: createHash("sha256").update(contents).digest("hex") };
}

afterEach(() => {
  while (scratch.length) {
    const directory = scratch.pop();
    if (directory) rmSync(directory, { recursive: true, force: true });
  }
});

describe("migration target safety", () => {
  it("accepts only the explicitly confirmed Supabase session pooler target", () => {
    const target = getVerifiedSupabaseSessionTarget(approvedTargetEnv());
    expect(target.host).toBe("aws-1-ap-southeast-1.pooler.supabase.com");
    expect(target.projectRef).toBe(SMARTFLEECE_SUPABASE_PROJECT_REF);
  });

  it("refuses an unconfirmed project reference", () => {
    expect(() =>
      getVerifiedSupabaseSessionTarget(
        approvedTargetEnv({ SMARTFLEECE_CONFIRM_SUPABASE_PROJECT_REF: "another-project" }),
      ),
    ).toThrow(/expected and confirmed Supabase project refs/);
  });

  it("refuses the transaction pooler for migration/import work", () => {
    const url = validPoolerUrl.replace(":5432/", ":6543/");
    expect(() => getVerifiedSupabaseSessionTarget(approvedTargetEnv({ DIRECT_URL: url }))).toThrow(
      /session pooler on port 5432/,
    );
  });

  it("refuses a pooler URL whose username points at another project", () => {
    const url = validPoolerUrl.replace(SMARTFLEECE_SUPABASE_PROJECT_REF, "another-project");
    expect(() => getVerifiedSupabaseSessionTarget(approvedTargetEnv({ DIRECT_URL: url }))).toThrow(
      /does not identify the expected Supabase project/,
    );
  });

  it("requires a separate write opt-in for remote data import", () => {
    expect(() => assertRemoteImportOptIn({})).toThrow(/SMARTFLEECE_ALLOW_REMOTE_IMPORT=1/);
    expect(() => assertRemoteImportOptIn({ SMARTFLEECE_ALLOW_REMOTE_IMPORT: "1" })).not.toThrow();
  });

  it("accepts a separate SQLite source only when its file hash is confirmed", async () => {
    const source = tempSource();
    const verified = await getVerifiedSqliteSource(
      { SQLITE_SOURCE_PATH: source.file, SQLITE_SOURCE_SHA256: source.hash },
      source.directory,
    );
    const normalizedPath = process.platform === "win32" ? (value: string) => value.toLowerCase() : (value: string) => value;
    expect(normalizedPath(verified.path)).toBe(normalizedPath(source.file));
    if (source.file.includes("#")) expect(verified.url).toContain("%23");
    expect(verified.sha256).toBe(source.hash);
  });

  it("refuses a SQLite source with a hash mismatch or active sidecar", async () => {
    const source = tempSource();
    await expect(
      getVerifiedSqliteSource(
        { SQLITE_SOURCE_PATH: source.file, SQLITE_SOURCE_SHA256: "0".repeat(64) },
        source.directory,
      ),
    ).rejects.toThrow(/SHA-256 does not match/);

    writeFileSync(source.file + "-wal", "active");
    await expect(
      getVerifiedSqliteSource(
        { SQLITE_SOURCE_PATH: source.file, SQLITE_SOURCE_SHA256: source.hash },
        source.directory,
      ),
    ).rejects.toThrow(/without SQLite sidecars/);
  });

  it("refuses prisma/dev.db as a migration source", async () => {
    const projectRoot = process.cwd();
    const devDb = path.join(projectRoot, "prisma", "dev.db");
    const contents = "protected dev database fixture";
    const source = tempSource(contents);
    await expect(
      getVerifiedSqliteSource(
        {
          SQLITE_SOURCE_PATH: devDb,
          SQLITE_SOURCE_SHA256: createHash("sha256").update(contents).digest("hex"),
        },
        projectRoot,
      ),
    ).rejects.toThrow(/prisma\/dev\.db is protected/);
  });
});
