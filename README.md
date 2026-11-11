# SmartFleece

**QR-based production management and fiber traceability for small-scale fiber mills.**

> Every gram of fiber has a story. SmartFleece helps mills keep that story connected, from intake to finished product.

SmartFleece is a mill operations platform built around customers, orders, individually tracked fiber lots, production-stage records, quality checks, invoicing, and customer-facing traceability. It gives mill owners and workers a shared view of what is being processed, where each lot is in the workflow, how its weight changes, and what information can be shared with customers.

## At a glance

- **Customer and order management:** Maintain customer profiles, processing preferences, farm details, and order history across seasons.
- **Lot-level tracking:** Create individually QR-tagged bags within an order and record their intake details.
- **Production tracking:** Configure production stages and record workers, machines, weights, and notes at each step.
- **Traceability:** Split and blend lots while preserving forward and backward lineage.
- **Quality control:** Raise quality flags during production and require a finished-goods inspection before completion.
- **Billing:** Generate invoices from actual processed weight, apply configurable pricing, and record payments.
- **Customer visibility:** Share order progress and finished-product provenance through privacy-filtered public pages.
- **Operational insight:** View production status, stalled lots, quality issues, machine utilization, estimated completion times, and revenue.

## Features

### 1. Customers and order intake

- Create, view, update, and manage customer records.
- Store farm information, processing preferences, and internal notes on customer profiles.
- Keep customer profiles available across seasons.
- Create an order containing multiple individually tracked bags or lots.
- Record intake information, including grease weight, grade (A–D), vegetable-matter rating, staple length, micron count, color, shearing date, farm details, target product, yarn and dye specifications, and rush status.

### 2. QR-based lot identification

- Each lot receives an opaque `LOT-XXXXXX` identifier.
- QR codes contain no customer information.
- Lot pages provide a downloadable PNG QR code and a print-friendly thermal-label page.
- Workers can find a lot by scanning its QR code or entering its code manually.

### 3. Configurable production workflow

- The default workflow contains 16 production stages.
- Owners can reorder, rename, add, or deactivate stages and configure an expected weight-loss percentage for each stage.
- Stage records capture the worker, machine, input weight, output weight, and notes.
- Weight changes are calculated automatically.
- An abnormal-loss rule raises a quality flag when the recorded loss exceeds the stage's expected loss by more than 15 percentage points.
- Stage events are append-only. Corrections use an auditable **Undo** operation rather than deleting the original event.

### 4. Scanning and offline queue

- Camera scanning is implemented with `html5-qrcode`, with manual code lookup as a fallback.
- The scan workflow is designed to require no more than three taps for a routine stage update.
- When offline, stage scans are queued in `localStorage` with a UUID idempotency key.
- Queued events sync when connectivity returns.
- Server-side idempotency collapses duplicate submissions, while rejected events are surfaced to the user rather than silently discarded.

> **Offline testing note:** Queue behavior and duplicate handling have been verified at the API level. A real browser session in airplane mode has not yet been tested.

### 5. Lot splitting, blending, and lineage

- Split a lot into child lots using full or partial weight allocation.
- Blend lots, including lots from different orders, into a batch.
- View forward and backward traceability trees.
- Preserve the relationship between parent lots, child lots, and blended batches.
- Prevent lineage cycles, with cycle detection covered by unit tests.

### 6. Production dashboard and quality management

The dashboard uses persisted application data to show:

- Live operational counts and order-status distribution.
- Lots that have stalled in production.
- Open quality flags that need attention.
- A production Kanban view grouped by stage.
- Recent production events.

Quality flags can be raised from stage forms for issues such as vegetable matter, felting, color, odor, mold, pests, or unexpected weight changes. Each flag can be resolved with attribution.

### 7. Finished-goods quality inspection

A dedicated, append-only inspection record is required before a lot can be completed or its story label printed. The checklist records:

- Verified net scale weight.
- Skein count and total yardage.
- Ply and twist direction (`S`, `Z`, or `Balanced`).
- Visual grade (`PASS`, `MINOR_FLAW`, or `REJECT`).
- Inspection notes and outcome (`PASS`, `REWORK`, `HOLD`, or `FAIL`).

The inspection is checked for freshness against later stage undos. This separates terminal-stage completion from final quality approval and gates story-label printing and order completion.

### 8. Invoicing and payments

- Configure currency, tax label and rate, rush multiplier, minimum fee, and per-fiber-type rates per kilogram.
- Generate an invoice automatically when an order completes.
- Calculate billing from actual processed weight, with per-lot line items.
- Apply rush surcharges and minimum-order top-ups where configured.
- Add manual extra charges, such as dyeing.
- Record payments using Cash, Bank, UPI, or Other.
- Track payment status as **Unpaid**, **Partial**, or **Paid**.
- Print invoices using the browser's print-to-PDF workflow.
- View revenue analytics on the Reports page.

Currency values are stored as integer minor units, such as paise or cents, to avoid floating-point currency errors.

### 9. Machine registry and utilization

- Manage machines and their capacity and status in Settings.
- Select a registered machine when recording a production-stage event.
- View kilograms processed per machine over the last seven days.
- See machine status and an indication of the busiest production-stage bottleneck.

Events created before machine-registry support retain their legacy free-text machine labels. The utilization view counts registry-linked events only.

### 10. Estimated completion time and delay tracking

- Estimate stage duration using the mill's median historical wall-clock hours per kilogram for that stage.
- Add a queue penalty based on the number of lots waiting.
- Show an estimated completion time with a confidence range on the order page and customer tracking page.
- Recalculate the estimate when a new scan is recorded.
- Log delays with a reason and number of days; the delay updates the estimate and triggers a customer notification.

The estimate is rule-based and uses the mill's own recorded production history.

### 11. Batch planning and seasonal fiber history

- Suggest shared wash and carding runs by grouping queued, pre-Carding lots with matching fiber type and color.
- Aggregate each customer's intake, current weight, yield, and products by year.
- Display the seasonal fiber history on the customer profile.

### 12. Customer tracking and finished-product provenance

**Order tracking**

- Each order has a public tracking page at `/track/<token>`.
- Access uses an unguessable token.
- Customers can see production stages, timestamps, weights, the estimated completion time and confidence range, and their invoice balance.
- Worker names, internal notes, and internal costs are excluded.

**Finished-product fiber story**

- Finished packages or skein tags can carry a secondary consumer QR code.
- The QR opens `/label/<id>/story`, which leads to a public provenance certificate at `/story/<token>`.
- The certificate can show farm origin, animal breed, shearing date, production-stage timeline, clean-yield percentage, and artisan blend breakdown.
- Public fields are controlled through an explicit privacy allowlist.
- Provenance tokens use AES-256-GCM authenticated encryption (AEAD).

### 13. Notifications

- Notifications use an extensible interface.
- When `RESEND_API_KEY` and `MAIL_FROM` are configured, email is sent through the Resend API and the result is logged as `SENT` or `FAILED`.
- Without those settings, notifications are recorded in `NotificationLog` in development mode and are visible in Settings and on the order page.
- Development-mode records are not presented as successfully delivered emails.

## Quick start

### Requirements

- Node.js and npm.
- A local environment capable of running the Next.js application.

### Install and run

```bash
npm install
npm run db:push
npm run db:seed
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

`db:seed` loads sample data and is destructive to the development database. Do not run it against a database containing data you need to keep.

### Sample accounts

The seed script creates the following sample accounts:

| Role | Email | Password |
|---|---|---|
| Owner | `owner@smartfleece.local` | `demo1234` |
| Worker | `worker@smartfleece.local` | `demo1234` |

These credentials are for local demonstration only. Change or disable them before using a deployed environment.

## Available scripts

| Command | Description |
|---|---|
| `npm run dev` | Start the development server. |
| `npm run build` | Create a production build with `next build`. |
| `npm start` | Serve the production build. |
| `npm test` | Run the Vitest unit-test suite. |
| `node scripts/e2e.mjs` | Run end-to-end checks against a running server. |
| `npm run db:push` | Apply the Prisma schema to the configured database. |
| `npm run db:seed` | Wipe and reload sample data in the development database. |
| `npm run db:reset` | Force-reset the schema and reload sample data. Development use only. |
| `npm run typecheck` | Run TypeScript validation with `tsc --noEmit`. |

## Configuration

The default `.env` configuration uses SQLite for local development:

```env
DATABASE_URL="file:./dev.db"

# Optional: enable real email delivery through Resend
# RESEND_API_KEY="re_xxxxxxxxxxxx"
# MAIL_FROM="SmartFleece <onboarding@resend.dev>"
```

Without the optional Resend variables, notifications are logged in development mode rather than emailed.

### Using PostgreSQL or Supabase

The current local setup uses SQLite. To move to PostgreSQL:

1. Change the datasource provider in `prisma/schema.prisma` from `sqlite` to `postgresql`.
2. Set `DATABASE_URL` to the PostgreSQL connection string.
3. Apply the schema with `npx prisma db push` and run the seed script if needed.

Status and type fields are validated by the application as strings to keep the schema portable between SQLite and PostgreSQL. **Before enabling multi-tenant use on a hosted Supabase setup, add and verify Row Level Security policies scoped to `mill_id`.** A database connection change alone does not provide tenant isolation.

## Architecture

| Area | Implementation |
|---|---|
| Application | Next.js 15 App Router, TypeScript, Tailwind CSS v4 |
| Data access | Prisma ORM with SQLite in the default local setup |
| API | REST route handlers under `app/api/**`, with authentication guards and Zod validation |
| Authentication | Database-backed sessions using an `httpOnly` cookie |
| Roles | `OWNER` and `WORKER`; `ACCOUNTANT` is reserved |
| Production logic | `lib/production.ts` handles stage progression, weight deltas, undo, order status, and ETA recalculation |
| Traceability | `lib/lineage.ts` and `lib/graph.ts` handle lineage operations and cycle prevention |
| Offline workflow | `lib/offline.ts` handles scan queuing and response classification |
| Notifications | `lib/notify.ts` provides the notification interface |

The Prisma schema includes models for `User`, `Session`, `Customer`, `Order`, `FiberLot`, `Stage`, `StageEvent`, `LineageEdge`, `QualityFlag`, `NotificationLog`, `PricingConfig`, `Invoice`, `Payment`, and `Machine`.

Weights are stored in grams. Currency is stored in integer minor units.

### Access control

- API mutations are authenticated and validated.
- Stage configuration and record deletion are owner-only operations.
- Workers can record permitted production activity but cannot access owner-only machine or pricing administration actions.
- Customers access order and provenance information through public, unguessable tokens and privacy-filtered pages.

## Verification

The following checks were reported as passing for this implementation:

| Check | Result | Coverage |
|---|---:|---|
| `npm test` | **73/73 unit tests passed** | Weight-loss calculations and flags, lineage, validation schemas, machine options, invoice calculations, tax and payment transitions, ETA calculations, batch suggestions, machine utilization, offline queue behavior, and provenance-token privacy checks. |
| `node scripts/e2e.mjs` | **107/107 end-to-end checks passed** | Authentication, customer and order flows, QR lookup, production events, undo, quality flags, split and blend operations, invoicing, payments, machine management, ETA and delay handling, batch suggestions, customer history, tracking, provenance, and privacy checks. |
| `npm run typecheck` | **Passed** | Clean TypeScript compilation with `tsc --noEmit`. |
| `npm run build` | **Passed** | Production build completed with 50 routes and 19 static pages. |

The end-to-end checks were run against a production build using `next build` and `next start` on port `3001`, with an isolated audit-database copy.

### Database-isolation check

The development database at `prisma/dev.db` was SHA-256 byte-identical before and after the test runs. The isolated `audit.db` passed SQLite integrity checks, its resolved path was verified, and the temporary database was removed after testing.

### Development environment note

The project folder is OneDrive-synced. The development server compiles routes on demand, so a transient development-mode `500` may occur during a sync race. The reported production build was unaffected.

## Known limitations

- **Email delivery:** Real email requires `RESEND_API_KEY` and `MAIL_FROM`. Otherwise, notifications are recorded in development mode.
- **Intake photos:** Photo upload is not implemented. A schema field is reserved, but no storage bucket is configured.
- **Offline browser testing:** The local queue and server-side idempotency are implemented and API-tested, but a real airplane-mode browser test has not been completed.
- **Legacy machine records:** Events created before the machine registry retain free-text machine labels. Machine utilization counts registry-linked events only.
- **Cross-order blends:** A blended batch carries the first parent's order number. Full lineage remains queryable from every parent lot.
- **Invoice PDFs:** Invoices use the browser's print-to-PDF workflow. A server-generated PDF file is not implemented.
- **Online payments:** Payments are recorded manually. Online payment collection, such as Stripe integration, is not implemented.
- **Reports:** Financial analytics are available. Production and quality reporting will need more accumulated history and further implementation.

## Roadmap

Potential next improvements, in priority order:

1. Add worker task assignment and productivity views.
2. Add intake photo uploads with a configured storage provider.
3. Add server-generated invoice PDFs if browser print-to-PDF becomes limiting.
4. Add online payment collection.
5. Expand production and quality analytics as operational history grows.
6. Complete real-browser offline testing, including recovery after connectivity interruptions.

## Project status

SmartFleece currently covers the main mill workflow from customer and order intake through lot-level production, quality inspection, invoicing, and customer-facing provenance. The verification results above describe the checks performed; they should not be read as a substitute for deployment-specific security review, database backup planning, or real-world mill testing.
