# SmartFleece SQLite to Supabase PostgreSQL Migration Plan

**Prepared:** 2026-11-23
**Status:** Phases A–D prepared locally. Phase E (hosted schema and data changes) has not started.
**Active application database:** SQLite at `prisma/dev.db`.

This is a migration package for the existing application. It preserves the current SQLite schema and runtime as the active configuration. Review this plan and the candidate DDL before authorizing any hosted operation.

## 1. Current architecture and scope

SmartFleece is a Next.js 15 App Router application using React 19, TypeScript, Tailwind CSS v4, Prisma 6, SQLite, Vitest, and a Node-based E2E harness. Installed versions observed in the lockfile and local install are Next.js 15.5.28, React 19.3.1, Prisma / `@prisma/client` 6.19.3, TypeScript 5.9.3, and Vitest 3.2.7. No Supabase JavaScript client is installed or needed for the intended server-side Prisma architecture.

The application remains **Next.js server and route handlers → Prisma → database**. It uses custom database-backed `User` / `Session` authentication and application-level authorization. No Data API, Supabase Auth, public browser database client, deployment integration, or application cutover was introduced.

The twelve product domains remain covered by the current code: authentication and mill profile; customers; orders; fiber lots; production; QR scanning and offline queue; lineage, split and blend; quality control; machine management; invoices and payments; public tracking and provenance; dashboard, reports and settings. The candidate schema changes storage types/provider only; it does not change those business rules.

The SQLite path resolver was retained and extracted into `lib/db-url.ts` so it can be exercised without constructing a database client. `lib/db.ts` still resolves SQLite files consistently and passes PostgreSQL URLs through unchanged. The prior Session table runtime fix remains in place.

## 2. Verified local and hosted state

### Local database inventory

The source database passed SQLite `integrity_check` and `foreign_key_check` (zero violations). The file was 262,144 bytes and its SHA-256 was `FB8ECBF79DDB3185F8B05A97E68BCB5232271198AA4829C288C387AE634BFF89` before and after the isolated baseline checks and migration preparation. No SQLite sidecar was present at the final inspection. Do not use that source file for a mutating test or as the migration script's source; the script refuses `prisma/dev.db` and requires a separately verified offline copy.

| Model | Current rows | Planned import |
|---|---:|---|
| User | 2 | 2 |
| Session | 2 | 0 (invalidate all existing sessions) |
| Customer | 4 | 4 |
| Order | 6 | 6 |
| FiberLot | 10 | 10 |
| Stage | 16 | 16 |
| StageEvent | 59 | 59 |
| LineageEdge | 4 | 4 |
| QualityFlag | 2 | 2 |
| QCInspection | 0 | 0 |
| NotificationLog | 4 | 4 |
| PricingConfig | 1 | 1 |
| Invoice | 1 | 1 |
| Machine | 4 | 4 |
| Payment | 2 | 2 |
| **Total** | **117** | **115** |

All non-Session rows are imported without filtering on `isSample`; IDs, sample markers, password hashes, business values, and relationships are preserved. Existing credentials are neither printed nor requested.

### Supabase project

Read-only project inspection identified project reference `veyzvqawhgbiofoudvwu`, PostgreSQL 17.12.0, region `ap-southeast-1`, Free plan, healthy status, and no application tables or migration history at inspection. No hosted DDL or data write was performed. The claims that PostgREST/Data API, automatic API grants, and automatic RLS are disabled/enabled as shown in the supplied project table are **user-supplied settings, not independently confirmed here**. Re-check them in the dashboard before any hosted work.

## 3. PostgreSQL compatibility audit

| Area | Candidate treatment / compatibility note |
|---|---|
| Models and relations | All 15 Prisma models are preserved, including `Session`; 14 models carry business data in the import. |
| IDs and uniqueness | String primary keys, `cuid()` defaults, unique email/order/lot/invoice/tracking fields, and composite uniqueness are preserved. Imported IDs remain unchanged. |
| Relationships | All 18 foreign keys and their `CASCADE`, `RESTRICT`, and `SET NULL` actions are preserved in the candidate SQL. |
| Weights and money | Weight remains integer grams; financial values remain integer minor units. No float conversion is introduced. Review the 32-bit integer range before future scale growth. |
| Other numbers | Existing `Float` fields remain floating point. Statuses and role values remain strings validated by application code; no enums are introduced. |
| JSON-shaped values | Existing JSON-in-text fields (for example photos, invoice lines, and pricing configuration) remain text. No data-shape rewrite is attempted. |
| Time | All 27 Prisma `DateTime` fields are explicitly mapped to `TIMESTAMPTZ(3)` to preserve UTC instants at millisecond precision. Import converts Prisma `Date` values through the PostgreSQL client. Verify edge cases with the isolated PostgreSQL test before approval. |
| Case sensitivity | A local SQLite Prisma query matched the seeded `Ravi Sharma` customer for both `ravi` and `RAVI`. PostgreSQL filters are case-sensitive by default; customer-name and fiber-type free-text filters need an explicit product decision and PostgreSQL test before cutover. See the [Prisma v6 case-sensitivity guidance](https://www.prisma.io/docs/orm/v6/prisma-client/queries/case-sensitivity). |
| Session behavior | `Session` is created in PostgreSQL but imported with zero rows. Existing users keep their IDs and password hashes and must sign in again after cutover. |

The PostgreSQL schema is a separate candidate at [`prisma/schema.postgresql.prisma`](../prisma/schema.postgresql.prisma). `prisma/schema.prisma` remains SQLite. Prisma 6.19.3 validates `directUrl`; its generated PostgreSQL client has a separate output under `node_modules/.prisma/smartfleece-postgresql` and does not replace the SQLite client.

The reviewed initial SQL is [`prisma/migrations/20261123000000_smartfleece_initial/migration.sql`](../prisma/migrations/20261123000000_smartfleece_initial/migration.sql), with PostgreSQL migration lock at [`prisma/migrations/migration_lock.toml`](../prisma/migrations/migration_lock.toml). It contains 15 tables, 26 indexes, and 18 foreign keys. It contains no `DROP`, `TRUNCATE`, or standalone `DELETE` statements. The generated SQL was recreated from the candidate schema with the installed Prisma 6 CLI and compared after line-ending normalization. Prisma Migrate is the sole schema migration source of truth; there is no competing `supabase/migrations` directory.

## 4. Connection and environment strategy

Keep the existing `.env` SQLite `DATABASE_URL` unchanged for local operation. The new sanitized [`.env.example`](../.env.example) keeps that default and includes commented placeholders for PostgreSQL; it contains no credentials.

After a separate approval, configure local ignored environment values from the Supabase **Connect** dialog:

- `DATABASE_URL`: runtime shared transaction pooler, port `6543`, with `pgbouncer=true` and SSL required. Keep the pool small for serverless execution. Supabase documents the transaction pooler's prepared-statement limitation and Prisma's `pgbouncer=true` workaround in its [Prisma troubleshooting guide](https://supabase.com/docs/guides/database/prisma/prisma-troubleshooting).
- `DIRECT_URL`: Prisma migration/import session pooler, port `5432`, SSL required. It is named `DIRECT_URL` for Prisma configuration but uses Supavisor session mode, not a direct IPv6 database endpoint. Supabase documents shared session mode as the IPv4-compatible alternative; use the exact host and username shown by the project's Connect dialog in its [connection guide](https://supabase.com/docs/guides/database/connecting-to-postgres).

Do not request or paste the database password into chat. Do not expose either URL in client bundles or `NEXT_PUBLIC_*`. The local candidate schema uses Prisma v6 `url` and `directUrl`; both are supported by the installed CLI and are documented in the [Prisma v6 schema reference](https://www.prisma.io/docs/orm/v6/reference/prisma-schema-reference).

`lib/migration-safety.ts` verifies both project-reference confirmations, the expected Singapore session-pooler endpoint, port/database/SSL, expected pooler username, and a separate import opt-in. The current guard uses the pooler host supplied in the handoff (`aws-1-ap-southeast-1.pooler.supabase.com`); verify that exact host in the Connect dialog before use. If Supabase gives a different host, stop and review the guard instead of bypassing it.

## 5. Seed and database safety

`db:reset` / `--force-reset` was removed. The destructive sample seed now checks an explicit opt-in, requires `DATABASE_URL` to match `SMARTFLEECE_EXPECTED_SEED_DATABASE_URL`, rejects PostgreSQL, resolves filesystem aliases before protecting `prisma/dev.db`, refuses non-files and active SQLite sidecars, and constructs Prisma only after the guard passes. A separate isolated SQLite database is required for seed tests. `.gitignore` now excludes `.env`, `.env.*`, and local migration scratch while allow-listing `.env.example`. **The repository already tracks `.env`**, so the ignore rule does not remove it from the index. Its current setting is the local SQLite URL and no Supabase credential has been added. Removing the tracked file from the index while retaining the local copy would stage a deletion; that was not done because this task's Git instructions prohibit staging without approval. Do not add hosted credentials to `.env` until the tracking issue is resolved.

The application schema and default runtime remain SQLite. Do not point `db:push` at Supabase. Do not run `migrate reset`, `--force-reset`, or unreviewed SQL.

## 6. Data migration and verification design

The tooling is in:

- [`scripts/migration-audit.ts`](../scripts/migration-audit.ts): table order, SQLite integrity/FK checks, counts, canonical row manifests, safe batched copies, target-empty assertion.
- [`scripts/migrate-sqlite-to-postgres.ts`](../scripts/migrate-sqlite-to-postgres.ts): `--preflight` read-only mode and separately gated `--execute` mode.
- [`scripts/verify-postgres-migration.ts`](../scripts/verify-postgres-migration.ts): source/target row count and scalar hash comparison, empty target sessions, FK validation, database-role/RLS/API-grant inventory.

The source must be a clean, offline SQLite copy. Supply its absolute path and exact SHA-256 in `SQLITE_SOURCE_PATH` and `SQLITE_SOURCE_SHA256`. The helper rejects the protected original, active `-wal`/`-shm`/`-journal` sidecars, hash mismatch, and non-files. Source integrity and the source hash are checked before the transaction and before it commits.

After the reviewed schema has been applied under Phase E approval, run read-only preflight and confirm the target's 15 application tables are empty. The write mode imports the 14 non-Session models in foreign-key order, using explicit IDs and scalar values. It runs in a serializable PostgreSQL transaction, compares row counts and canonical row hashes before commit, and requires the target to remain empty. A failed transaction rolls back; a successful rerun refuses the now-nonempty target rather than duplicating rows. The separate verifier is read-only.

The manifest sorting is performed in JavaScript so SQLite and PostgreSQL collation differences do not reorder an otherwise identical dataset. The present source is small (117 total rows); this implementation is sized for the verified snapshot and should be redesigned for streaming/checkpointing before migrating a substantially larger production database.

No import or PostgreSQL target preflight has been run. No SQLite data was uploaded.

## 7. Supabase security and RLS

The current code uses trusted backend Prisma connections and custom application authorization. Do not add `supabase-js`, Supabase Auth, permissive RLS policies, or browser database access as part of this migration.

The initial SQL creates tables, keys, and indexes; it does not create RLS policies or grant broad API access. RLS and table grants must be inspected after schema creation and before connecting the application. RLS does not replace application authorization; Supabase documents that privileged roles such as `postgres` and `service_role` can bypass RLS in its [RLS guide](https://supabase.com/docs/guides/database/postgres/row-level-security). Keep the database URL exclusively server-side. The verifier now reports the connected database role, whether it bypasses RLS, RLS-enabled/forced table counts, and table grants to `anon`, `authenticated`, and `service_role`.

The schema is single-mill and has no `mill_id`; it cannot safely support tenant-scoped RLS policies without a separate data-model change. The custom `OWNER`/`WORKER` authorization and Accountant role gap remain product-level concerns. Decide whether to keep the managed `postgres` application role or create a least-privilege role only after reviewing actual grants and RLS behavior; no role has been created.

## 8. Testing status and limitations

| Check | Result |
|---|---|
| Baseline before this preparation | 94/94 unit tests; typecheck clean; isolated production build succeeded; 133/133 E2E checks passed against an isolated SQLite database. |
| Current unit suite after preparation | 112/112 tests pass across 12 files, including source-path alias and sidecar guards. |
| Current TypeScript check | `npm run typecheck` passes. |
| Candidate schema | `prisma validate` passes with dummy local PostgreSQL placeholder URLs; no hosted credential was used. |
| PostgreSQL Prisma Client | `npm run db:generate:postgres` succeeds and emits to its isolated output directory. |
| Candidate migration SQL | Recreated from schema with Prisma 6.19.3; matches checked-in SQL after normalizing line endings. 15 tables, 26 indexes, 18 foreign keys, 27 timestamptz columns. |
| Destructive seed safety | `npm run db:seed` completed against an isolated copy; it produced the expected 2 users, 4 customers, 6 orders, 10 lots, 59 stage events, 4 lineage edges, 1 invoice, and 2 payments. Symlink-alias refusal was tested against a fake fixture. |
| Current production build and E2E | Isolated production build passed; 133/133 E2E checks passed against a second copied SQLite database. Temporary config and build outputs were restored/removed. |
| Original SQLite protection | Hash remained `FB8ECBF79DDB3185F8B05A97E68BCB5232271198AA4829C288C387AE634BFF89`; no test or import targeted it. |
| Isolated PostgreSQL / Postgres E2E | Not available: Docker, `psql`, and Supabase CLI were not installed. The hosted project was not used as a test database. Full PostgreSQL auth/workflow/E2E verification remains a Phase E gate. |

The initial baseline had 94/94 unit tests and 133/133 E2E checks; the current regression pass after migration-helper edits also has 133/133 E2E checks. The application workflow tests have not been run against PostgreSQL. Build warnings about production `STORY_SECRET` / `SESSION_SECRET` length remain; no secret value is included here.

## 9. Hosted migration sequence (requires separate explicit approval)

1. Confirm a protected copy of `prisma/dev.db`, app downtime/quiescence, its hash and integrity; confirm no SQLite sidecars. Keep the original byte-identical.
2. Reconfirm project reference, pooler hostname, database health, region, Data API/Auth settings, automatic grants/RLS settings, and current Free-plan limits in Supabase.
3. Review the exact schema and SQL linked above. Configure credentials locally, never in chat. Decide role/grant/RLS behavior and search case semantics.
4. Apply the reviewed Prisma migration with `prisma migrate deploy --schema prisma/schema.postgresql.prisma` using the reviewed PostgreSQL URLs. Do not use `db push`. Confirm `_prisma_migrations`, table/index/FK counts, RLS state, grants, and role before data import.
5. Run `npm run db:import:postgres -- --preflight`, inspect the returned source hash/counts and target-empty result, then separately authorize and run `npm run db:import:postgres -- --execute` with `SMARTFLEECE_ALLOW_REMOTE_IMPORT=1`.
6. Run `npm run db:verify:postgres -- --verify`. Require exact imported counts/hashes, zero target sessions, all FKs validated, and reviewed security inventory.
7. Against an isolated PostgreSQL target, run authentication (login/session creation, `getCurrentUser`, `requireUser`, `apiUser`, logout, expiry/invalid tokens and authorization boundaries) and full customer→order→lot→production→QC→invoice→payment, split/blend/lineage, QR, offline replay/rejection, public tracking and Fiber Story regressions. Do not cut over if any test is unverified or fails.
8. Only after a further approval, decide runtime URLs/deployment configuration and perform a controlled cutover with a write freeze and monitoring window. Preserve the original SQLite database until final acceptance.

`prisma migrate deploy` above is a future command only; it has not been run. Phase D ends here.

## 10. Rollback and Free-plan operations

Before runtime cutover, rollback is to leave or restore the SQLite runtime configuration; retain the original SQLite database unchanged. If only schema/data preparation happened on Supabase, stop and preserve the hosted state for review—do not automatically drop tables. If the application has accepted PostgreSQL writes, switching back to SQLite alone would lose those writes. Freeze writes, export/reconcile the Postgres delta, and approve a recovery decision before reverting runtime configuration.

The project was reported as Free tier. Current Supabase documentation lists 500 MB database capacity, 500 MB shared compute, 5 GB egress, no automatic backups on Free, and pausing after a week of low activity. Supabase recommends manual/off-site database exports for Free-tier backup coverage. Reconfirm limits before launch: [pricing](https://supabase.com/pricing), [project pausing](https://supabase.com/docs/guides/platform/free-project-pausing), and [backups](https://supabase.com/docs/guides/platform/backups). This plan requires a tested manual backup/restore procedure before operational data is hosted.

## 11. Open decisions

- Confirm whether free-text customer/fiber searches should remain case-sensitive after PostgreSQL cutover or use case-insensitive matching.
- Confirm Supabase dashboard settings and exact pooler hostname/username.
- Decide role privileges and RLS posture after inspecting the live grants; do not assume automatic-RLS configuration guarantees safe policies.
- Obtain an isolated PostgreSQL test environment and complete Postgres auth/workflow/E2E coverage.
- Decide whether Free-tier inactivity pausing and manual backup responsibilities are acceptable for operational use.
- Approve Phase E separately after reviewing the exact schema, SQL, data plan and security posture.
