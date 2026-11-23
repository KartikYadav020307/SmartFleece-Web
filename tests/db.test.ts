import { describe, it, expect } from "vitest";
import path from "path";
import { getDatasourceUrl, findProjectRoot } from "../lib/db-url";

describe("Database Datasource Resolution", () => {
  const root = findProjectRoot();
  const expectedDevDb = `file:${path.resolve(root, "prisma/dev.db").replace(/\\/g, "/")}`;

  it("finds the project root containing prisma/schema.prisma", () => {
    expect(root).toBeDefined();
    expect(root.length).toBeGreaterThan(0);
  });

  it("defaults to prisma/dev.db when no URL is supplied", () => {
    const resolved = getDatasourceUrl("");
    expect(resolved).toBe(expectedDevDb);
  });

  it("normalizes relative file:./dev.db to absolute file URL", () => {
    const resolved = getDatasourceUrl("file:./dev.db");
    expect(resolved).toBe(expectedDevDb);
  });

  it("normalizes relative file:./prisma/dev.db to absolute file URL", () => {
    const resolved = getDatasourceUrl("file:./prisma/dev.db");
    expect(resolved).toBe(expectedDevDb);
  });

  it("normalizes relative file:prisma/dev.db to absolute file URL", () => {
    const resolved = getDatasourceUrl("file:prisma/dev.db");
    expect(resolved).toBe(expectedDevDb);
  });

  it("preserves URL query parameters on SQLite file URLs", () => {
    const resolved = getDatasourceUrl("file:./dev.db?connection_limit=1&socket_timeout=10");
    expect(resolved).toBe(`${expectedDevDb}?connection_limit=1&socket_timeout=10`);
  });

  it("preserves remote database URLs untouched", () => {
    const remoteUrl = "postgresql://user:secret@db.supabase.co:5432/smartfleece";
    const resolved = getDatasourceUrl(remoteUrl);
    expect(resolved).toBe(remoteUrl);
  });

  it("preserves pre-existing absolute Windows file URLs", () => {
    const absUrl = "file:C:/production/data/smartfleece.db";
    const resolved = getDatasourceUrl(absUrl);
    expect(resolved).toBe(absUrl);
  });
});
