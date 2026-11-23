import { createHash } from "node:crypto";
import { createReadStream, existsSync, realpathSync, statSync } from "node:fs";
import path from "node:path";

export const SMARTFLEECE_SUPABASE_PROJECT_REF = "veyzvqawhgbiofoudvwu";

export type VerifiedPostgresTarget = {
  url: string;
  host: string;
  projectRef: string;
};

export type VerifiedSqliteSource = {
  path: string;
  url: string;
  sha256: string;
};

export type MigrationEnvironment = Record<string, string | undefined>;

function equalPath(left: string, right: string): boolean {
  const normalizedLeft = path.normalize(left);
  const normalizedRight = path.normalize(right);
  return process.platform === "win32"
    ? normalizedLeft.toLowerCase() === normalizedRight.toLowerCase()
    : normalizedLeft === normalizedRight;
}

export function getVerifiedSupabaseSessionTarget(
  env: MigrationEnvironment = process.env,
): VerifiedPostgresTarget {
  const projectRef = env.SMARTFLEECE_EXPECTED_SUPABASE_PROJECT_REF?.trim();
  const confirmation = env.SMARTFLEECE_CONFIRM_SUPABASE_PROJECT_REF?.trim();
  if (
    projectRef !== SMARTFLEECE_SUPABASE_PROJECT_REF ||
    confirmation !== SMARTFLEECE_SUPABASE_PROJECT_REF
  ) {
    throw new Error("PostgreSQL target refused: the expected and confirmed Supabase project refs must match.");
  }

  const rawUrl = env.DIRECT_URL?.trim();
  if (!rawUrl) {
    throw new Error("PostgreSQL target refused: DIRECT_URL must be set to the session-pooler URL.");
  }

  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error("PostgreSQL target refused: DIRECT_URL is not a valid PostgreSQL URL.");
  }

  if (url.protocol !== "postgresql:" && url.protocol !== "postgres:") {
    throw new Error("PostgreSQL target refused: DIRECT_URL must use PostgreSQL.");
  }
  if (url.port !== "5432" || url.pathname !== "/postgres") {
    throw new Error("PostgreSQL target refused: use the Supabase session pooler on port 5432 and database postgres.");
  }
  if (url.searchParams.get("sslmode") !== "require" || !url.password) {
    throw new Error("PostgreSQL target refused: require SSL and a password in the private environment URL.");
  }

  const expectedPoolerHost = "aws-1-ap-southeast-1.pooler.supabase.com";
  let decodedUsername: string;
  try {
    decodedUsername = decodeURIComponent(url.username);
  } catch {
    throw new Error("PostgreSQL target refused: DIRECT_URL has an invalid encoded username.");
  }
  if (
    url.hostname.toLowerCase() !== expectedPoolerHost ||
    decodedUsername !== `postgres.${SMARTFLEECE_SUPABASE_PROJECT_REF}`
  ) {
    throw new Error("PostgreSQL target refused: DIRECT_URL does not identify the expected Supabase project.");
  }

  return {
    url: rawUrl,
    host: url.hostname,
    projectRef: SMARTFLEECE_SUPABASE_PROJECT_REF,
  };
}

export function assertRemoteImportOptIn(env: MigrationEnvironment = process.env): void {
  if (env.SMARTFLEECE_ALLOW_REMOTE_IMPORT !== "1") {
    throw new Error("Remote data import refused: set SMARTFLEECE_ALLOW_REMOTE_IMPORT=1 only after the cutover gate is approved.");
  }
}

async function sha256File(filePath: string): Promise<string> {
  const hash = createHash("sha256");
  const stream = createReadStream(filePath);
  for await (const chunk of stream) hash.update(chunk);
  return hash.digest("hex");
}

export async function getVerifiedSqliteSource(
  env: MigrationEnvironment = process.env,
  projectRoot = process.cwd(),
): Promise<VerifiedSqliteSource> {
  const rawPath = env.SQLITE_SOURCE_PATH?.trim();
  const expectedHash = env.SQLITE_SOURCE_SHA256?.trim().toLowerCase();
  if (!rawPath || !path.isAbsolute(rawPath) || !expectedHash) {
    throw new Error("SQLite source refused: set an absolute SQLITE_SOURCE_PATH and its expected SQLITE_SOURCE_SHA256.");
  }
  if (!/^[a-f0-9]{64}$/.test(expectedHash)) {
    throw new Error("SQLite source refused: SQLITE_SOURCE_SHA256 must be a 64-character SHA-256 hex digest.");
  }
  let sourcePath: string;
  try {
    sourcePath = realpathSync.native(rawPath);
  } catch {
    throw new Error("SQLite source refused: the specified source file does not exist or cannot be resolved.");
  }
  if (!statSync(sourcePath).isFile()) {
    throw new Error("SQLite source refused: SQLITE_SOURCE_PATH must identify a file.");
  }

  const protectedPath = path.resolve(projectRoot, "prisma", "dev.db");
  const resolvedProtectedPath = existsSync(protectedPath)
    ? realpathSync.native(protectedPath)
    : protectedPath;
  if (equalPath(sourcePath, resolvedProtectedPath)) {
    throw new Error("SQLite source refused: prisma/dev.db is protected; use a verified offline copy.");
  }

  for (const suffix of ["-wal", "-shm", "-journal"]) {
    if (existsSync(sourcePath + suffix)) {
      throw new Error("SQLite source refused: close writers and create a clean copy without SQLite sidecars.");
    }
  }

  const actualHash = await sha256File(sourcePath);
  if (actualHash !== expectedHash) {
    throw new Error("SQLite source refused: its SHA-256 does not match SQLITE_SOURCE_SHA256.");
  }

  const filesystemPath = process.platform === "win32"
    ? sourcePath.startsWith("\\\\?\\UNC\\")
      ? `\\\\${sourcePath.slice(8)}`
      : sourcePath.startsWith("\\\\?\\")
        ? sourcePath.slice(4)
        : sourcePath
    : sourcePath;
  const portablePath = filesystemPath.replace(/\\/g, "/");
  const encodedPath = portablePath
    .replace(/%/g, "%25")
    .replace(/\?/g, "%3F")
    .replace(/#/g, "%23");

  return {
    path: sourcePath,
    url: `file:${encodedPath}`,
    sha256: actualHash,
  };
}

export async function assertSqliteSourceUnchanged(source: VerifiedSqliteSource): Promise<void> {
  const currentHash = await sha256File(source.path);
  if (currentHash !== source.sha256) {
    throw new Error("SQLite source changed during migration; aborting the PostgreSQL transaction.");
  }
}
