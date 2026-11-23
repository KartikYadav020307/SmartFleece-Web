import path from "path";
import { existsSync, realpathSync, statSync } from "node:fs";
import { findProjectRoot, getDatasourceUrl } from "./db-url";

export type SeedSafetyEnvironment = Record<string, string | undefined>;

function canonicalPath(filePath: string): string {
  let resolved = path.resolve(filePath);
  try {
    resolved = realpathSync.native(resolved);
  } catch {
    try {
      resolved = path.join(realpathSync.native(path.dirname(resolved)), path.basename(resolved));
    } catch {
      // Keep the normalized absolute path when the target or parent is new.
    }
  }

  if (process.platform === "win32") {
    if (resolved.startsWith("\\\\?\\UNC\\")) resolved = `\\\\${resolved.slice(8)}`;
    else if (resolved.startsWith("\\\\?\\")) resolved = resolved.slice(4);
    return path.normalize(resolved).toLowerCase();
  }
  return path.normalize(resolved);
}

/**
 * Validates the two explicit confirmations required before the sample seed
 * deletes rows. PostgreSQL targets are never allowed through this path.
 */
export function assertSafeSeedTarget(
  env: SeedSafetyEnvironment = process.env,
  projectRoot = findProjectRoot(),
): string {
  if (env.SMARTFLEECE_ALLOW_DESTRUCTIVE_SEED !== "1") {
    throw new Error(
      "Seed refused. Set SMARTFLEECE_ALLOW_DESTRUCTIVE_SEED=1 only for an isolated SQLite database.",
    );
  }

  const configuredUrl = env.DATABASE_URL?.trim();
  const expectedUrl = env.SMARTFLEECE_EXPECTED_SEED_DATABASE_URL?.trim();
  if (!configuredUrl || !expectedUrl) {
    throw new Error(
      "Seed requires DATABASE_URL and SMARTFLEECE_EXPECTED_SEED_DATABASE_URL to be set explicitly.",
    );
  }

  const targetUrl = getDatasourceUrl(configuredUrl);
  const confirmedUrl = getDatasourceUrl(expectedUrl);
  if (!targetUrl || !confirmedUrl || targetUrl !== confirmedUrl) {
    throw new Error("Seed refused because DATABASE_URL does not match the confirmed target.");
  }

  if (!targetUrl.startsWith("file:")) {
    throw new Error("Seed refused. Destructive seeding is restricted to local SQLite files.");
  }

  const targetPath = path.resolve(targetUrl.slice(5).split("?")[0]);
  const protectedPath = path.resolve(projectRoot, "prisma", "dev.db");
  const samePath = canonicalPath(targetPath) === canonicalPath(protectedPath);

  if (samePath) {
    throw new Error("Seed refused because prisma/dev.db is protected from destructive seeding.");
  }

  if (existsSync(targetPath) && !statSync(targetPath).isFile()) {
    throw new Error("Seed refused because the target is not a regular SQLite database file.");
  }
  for (const suffix of ["-wal", "-shm", "-journal"]) {
    if (existsSync(targetPath + suffix)) {
      throw new Error("Seed refused because the target has active SQLite sidecars; stop all writers first.");
    }
  }

  return targetUrl;
}
