import { afterEach, describe, expect, it } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { findProjectRoot, getDatasourceUrl } from "../lib/db-url";
import { assertSafeSeedTarget, type SeedSafetyEnvironment } from "../lib/db-safety";

const projectRoot = findProjectRoot();
const safeUrl = getDatasourceUrl("file:./isolated-seed.db")!;
const scratch: string[] = [];

afterEach(() => {
  while (scratch.length) {
    const directory = scratch.pop();
    if (directory && existsSync(directory)) rmSync(directory, { recursive: true, force: true });
  }
});

function seedEnv(overrides: SeedSafetyEnvironment = {}): SeedSafetyEnvironment {
  return {
    DATABASE_URL: safeUrl,
    SMARTFLEECE_ALLOW_DESTRUCTIVE_SEED: "1",
    SMARTFLEECE_EXPECTED_SEED_DATABASE_URL: safeUrl,
    ...overrides,
  };
}

describe("destructive seed target guard", () => {
  it("requires the explicit destructive-seed flag", () => {
    expect(() =>
      assertSafeSeedTarget(seedEnv({ SMARTFLEECE_ALLOW_DESTRUCTIVE_SEED: undefined }), projectRoot),
    ).toThrow(/SMARTFLEECE_ALLOW_DESTRUCTIVE_SEED/);
  });

  it("requires an explicit expected database URL", () => {
    expect(() =>
      assertSafeSeedTarget(seedEnv({ SMARTFLEECE_EXPECTED_SEED_DATABASE_URL: undefined }), projectRoot),
    ).toThrow(/SMARTFLEECE_EXPECTED_SEED_DATABASE_URL/);
  });

  it("refuses a target URL that differs from the confirmed URL", () => {
    expect(() =>
      assertSafeSeedTarget(
        seedEnv({ DATABASE_URL: getDatasourceUrl("file:./other.db") }),
        projectRoot,
      ),
    ).toThrow(/does not match the confirmed target/);
  });

  it("protects the current prisma/dev.db even when explicitly confirmed", () => {
    const devUrl = getDatasourceUrl("file:./dev.db")!;
    expect(() =>
      assertSafeSeedTarget(
        seedEnv({ DATABASE_URL: devUrl, SMARTFLEECE_EXPECTED_SEED_DATABASE_URL: devUrl }),
        projectRoot,
      ),
    ).toThrow(/prisma\/dev\.db is protected/);
  });

  it("refuses PostgreSQL targets", () => {
    const postgresUrl = "postgresql://user:password@localhost:5432/smartfleece";
    expect(() =>
      assertSafeSeedTarget(
        seedEnv({ DATABASE_URL: postgresUrl, SMARTFLEECE_EXPECTED_SEED_DATABASE_URL: postgresUrl }),
        projectRoot,
      ),
    ).toThrow(/local SQLite files/);
  });

  it("allows only the explicitly confirmed separate SQLite target", () => {
    expect(assertSafeSeedTarget(seedEnv(), projectRoot)).toBe(safeUrl);
  });

  it("refuses an alternate path that resolves through a directory link to dev.db", () => {
    const fakeRoot = mkdtempSync(path.join(os.tmpdir(), "smartfleece-seed-path-"));
    scratch.push(fakeRoot);
    const prismaDirectory = path.join(fakeRoot, "prisma");
    const aliasDirectory = path.join(fakeRoot, "alias");
    mkdirSync(prismaDirectory);
    writeFileSync(path.join(prismaDirectory, "dev.db"), "protected fixture");
    symlinkSync(prismaDirectory, aliasDirectory, process.platform === "win32" ? "junction" : "dir");

    const aliasedUrl = `file:${path.join(aliasDirectory, "dev.db").replace(/\\/g, "/")}`;
    expect(() =>
      assertSafeSeedTarget(
        seedEnv({ DATABASE_URL: aliasedUrl, SMARTFLEECE_EXPECTED_SEED_DATABASE_URL: aliasedUrl }),
        fakeRoot,
      ),
    ).toThrow(/prisma\/dev\.db is protected/);
  });

  it("refuses a confirmed file that still has a SQLite sidecar", () => {
    const fakeRoot = mkdtempSync(path.join(os.tmpdir(), "smartfleece-seed-sidecar-"));
    scratch.push(fakeRoot);
    const prismaDirectory = path.join(fakeRoot, "prisma");
    mkdirSync(prismaDirectory);
    const target = path.join(prismaDirectory, "isolated.db");
    writeFileSync(target, "isolated fixture");
    writeFileSync(`${target}-wal`, "writer sidecar");
    const targetUrl = `file:${target.replace(/\\/g, "/")}`;

    expect(() =>
      assertSafeSeedTarget(
        seedEnv({ DATABASE_URL: targetUrl, SMARTFLEECE_EXPECTED_SEED_DATABASE_URL: targetUrl }),
        fakeRoot,
      ),
    ).toThrow(/active SQLite sidecars/);
  });
});
