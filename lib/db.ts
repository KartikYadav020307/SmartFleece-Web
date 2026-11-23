import { PrismaClient } from "@prisma/client";
import { getDatasourceUrl } from "./db-url";

export { findProjectRoot, getDatasourceUrl } from "./db-url";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

const resolvedDatasourceUrl = getDatasourceUrl();
if (resolvedDatasourceUrl && process.env.DATABASE_URL?.startsWith("file:")) {
  process.env.DATABASE_URL = resolvedDatasourceUrl;
}

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    datasourceUrl: resolvedDatasourceUrl,
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
