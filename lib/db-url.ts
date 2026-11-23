import path from "path";
import fs from "fs";

/**
 * Finds the project root by locating the directory containing
 * prisma/schema.prisma. Falls back to process.cwd() if not found.
 */
export function findProjectRoot(): string {
  let dir = process.cwd();
  while (dir) {
    if (fs.existsSync(path.join(dir, "prisma", "schema.prisma"))) {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return process.cwd();
}

/**
 * Resolves SQLite database URLs to absolute file URLs.
 *
 * Prisma CLI resolves relative SQLite URLs relative to the schema directory,
 * while Prisma Client may resolve them relative to its generated client. Making
 * the path absolute keeps both callers pointed at the same SQLite file.
 */
export function getDatasourceUrl(customUrl?: string): string | undefined {
  const url = customUrl ?? process.env.DATABASE_URL;
  const root = findProjectRoot();

  if (!url) {
    const defaultPath = path.resolve(root, "prisma/dev.db");
    return `file:${defaultPath.replace(/\\/g, "/")}`;
  }

  if (!url.startsWith("file:")) return url;

  const rawPathWithQuery = url.slice(5);
  const [rawPath, ...queryParts] = rawPathWithQuery.split("?");
  const queryString = queryParts.length > 0 ? `?${queryParts.join("?")}` : "";

  // If already absolute (POSIX path or Windows drive letter), preserve it.
  if (path.isAbsolute(rawPath) || /^[a-zA-Z]:[/\\]/.test(rawPath)) {
    return url;
  }

  const resolved =
    rawPath.startsWith("./prisma/") || rawPath.startsWith("prisma/")
      ? path.resolve(root, rawPath)
      : path.resolve(root, "prisma", rawPath.replace(/^\.\//, ""));

  return `file:${resolved.replace(/\\/g, "/")}${queryString}`;
}
