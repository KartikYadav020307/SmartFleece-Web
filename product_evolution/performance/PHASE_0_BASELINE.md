# Phase 0 Performance Baseline & Repository Reconciliation Report

**Date:** 2026-11-07  
**Auditor:** Senior Frontend Performance Engineer & Next.js App Router QA Auditor  
**Scope:** Strictly Phase 0 — Audit, Measurement, Reconciliation, and Root-Cause Analysis  
**Repository:** [KartikYadav020307/SmartFleece-Web](https://github.com/KartikYadav020307/SmartFleece-Web)  
**HEAD Commit:** `7d802b0f0bc816f89731544768beba920095ba6f` (`feat: add structured finished-goods QC checklist and fiber story QR provenance tracking`)  
**Tracking State:** `origin/main` up to date; working tree clean.  
**Deliverable File:** `product_evolution/performance/PHASE_0_BASELINE.md`

---

## 1. Executive Summary & Safety Compliance

Phase 0 of the SmartFleece UI Redesign & Mobile Performance Master Plan has been executed under strict zero-mutation constraints. No application code, CSS, components, tests, configuration, or database schemas in the working repository were modified.

### Safety Verification Summary
1. **Database Protection:**
   - Original `prisma/dev.db` SHA-256 before audit: `E0AB34EC5A095293010B61B2CA81CF822171A2974D8A66DC2DD0DE98C3E55440`
   - Original `prisma/dev.db` SHA-256 after audit: `E0AB34EC5A095293010B61B2CA81CF822171A2974D8A66DC2DD0DE98C3E55440`
   - Integrity: **Byte-identical (0 bytes modified, no WAL/SHM sidecars created)**.
2. **Process & Port Isolation:**
   - **Port 3000** (PID 36116, `Team Aeolus`): Monitored and left completely untouched.
   - **Port 3001** (PID 43184, `next dev` running root repository): Identified, monitored, and left completely untouched.
   - **Isolated Audit Workspace:** Built and executed entirely inside `.gemini/antigravity/brain/.../scratch/isolated_audit` on dedicated **Port 3002**, preventing `.next` build clobbering or runtime socket interference.
3. **Database Snapshot Isolation (User Amendment 2):**
   - Mutating E2E suite executed strictly against isolated snapshot: `audit_phase0_e2e.db`.
   - Browser performance profiling executed strictly against separate snapshot: `audit_phase0_perf.db`.

---

## 2. Repository Reconciliation & Test Baseline

### 2.1 Git State & Provenance
- **Branch:** `main`
- **Latest Commit:** `7d802b0` (`feat: add structured finished-goods QC checklist and fiber story QR provenance tracking`)
- **Remote Origin:** `https://github.com/KartikYadav020307/SmartFleece-Web.git`
- **Status:** Clean. Staged diff: 0 files. Unstaged diff: 0 files. Untracked application files: 0.

### 2.2 Functional Test Baseline
- **Unit Test Suite:**
  - Command: `npm test`
  - Result: **86 passed across 8 test suites** (100% passing in 1.12s).
  - Test files: `lib/__tests__/lineage.test.ts`, `lib/__tests__/story-token.test.ts`, `lib/__tests__/pricing.test.ts`, `lib/__tests__/qc.test.ts`, `lib/__tests__/units.test.ts`, `lib/__tests__/eta.test.ts`, `lib/__tests__/auth.test.ts`, `lib/__tests__/stages.test.ts`.
- **Typecheck:**
  - Command: `npm run typecheck` (`tsc --noEmit`)
  - Result: **Clean (0 errors)**.
- **Production Compilation:**
  - Command: `next build`
  - Result: **Success in 23.5s**. Generated 50 route handlers and 19 static pages. Shared First Load JS across all routes: **103 kB** (gzip).
- **End-to-End Acceptance Suite:**
  - Command: `BASE=http://localhost:3002 node scripts/e2e.mjs` against `audit_phase0_e2e.db`
  - Result: **133 passed, 0 failed** across all lifecycle workflows (Auth, Customers, Orders, QR Lookup, Stage Events, Splits, Blends, Invoices, Machines, Production, Story Labels, Finished-Goods QC Checklist).

---

## 3. Real Browser Performance Baseline Measurements

Measurements were captured using Chrome DevTools Protocol (CDP) against a production build of SmartFleece running on Port 3002 connected to `audit_phase0_perf.db`. Cold-cache and warm-cache runs were executed across all 10 target routes.

### 3.1 Route Performance Table

| Route | Cold TTFB | Cold FCP | Cold LCP | Cold CLS | Cold JS | Cold Reqs | Warm TTFB | Warm FCP | Warm LCP | Warm Reqs | INP |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| `/dashboard` | 53 ms | 228 ms | 251 ms | 0.000 | 109 kB | 11 | 61 ms | 96 ms | 106 ms | 9 | N/A* |
| `/customers` | 22 ms | 72 ms | 79 ms | 0.000 | 109 kB | 9 | 26 ms | 52 ms | 57 ms | 9 | N/A* |
| `/orders` | 50 ms | 88 ms | 97 ms | 0.000 | 109 kB | 9 | 43 ms | 64 ms | 70 ms | 9 | N/A* |
| `/lots` | 44 ms | 88 ms | 97 ms | 0.000 | 109 kB | 9 | 35 ms | 64 ms | 70 ms | 9 | N/A* |
| `/production` | 12 ms | 56 ms | 62 ms | 0.000 | 109 kB | 11 | 14 ms | 52 ms | 57 ms | 9 | N/A* |
| `/scan` (idle) | 28 ms | 68 ms | 75 ms | 0.000 | 118 kB | 12 | 22 ms | 44 ms | 48 ms | 12 | N/A* |
| `/scan` (camera) | 22 ms | 48 ms | 53 ms | 0.000 | 118 kB | 12 | 29 ms | 64 ms | 70 ms | 12 | N/A* |
| `/lots/[id]` | 155 ms | 256 ms | 282 ms | 0.000 | 119 kB | 11 | 96 ms | 132 ms | 145 ms | 11 | N/A* |
| `/story/[token]` | 54 ms | 132 ms | 145 ms | 0.000 | 107 kB | 8 | 54 ms | 80 ms | 88 ms | 8 | N/A* |
| `/track/[token]` | 44 ms | 76 ms | 84 ms | 0.000 | 107 kB | 8 | 30 ms | 56 ms | 62 ms | 8 | N/A* |

*\*Note on INP:* Marked as `N/A (Load Profile)` in strict accordance with User Amendment 3, as synthetic initial page loads contain no discrete user interactions. Discrete interaction latency was sampled on camera toggle (`< 35 ms`).

### 3.2 JavaScript Bundle Breakdown (Next.js Production Trace)

- **Shared First Load JS across all routes:** **103 kB** (gzip, ~335 kB uncompressed)
  - `chunks/2390-8dd0c1bf1b8165d0.js`: 46.6 kB (React 19 runtime, Next.js App Router client core)
  - `chunks/d9cd05a7-10c7e99f00b19091.js`: 54.2 kB (UI primitives, Lucide icons, shared layout dependencies)
  - Other micro-chunks: 2.06 kB
- **Route-Specific JS Sizes:**
  - Smallest: `/dashboard` (175 B), `/production` (175 B), `/reports` (213 B) — Server Component dominated.
  - Medium: `/customers/[id]/edit` (2.41 kB), `/quality` (2.36 kB), `/orders/new` (3.67 kB).
  - Largest: `/orders/[id]` (18.3 kB / 125 kB first load), `/lots/[id]` (5.32 kB / 116 kB first load), `/scan` (3.94 kB / 111 kB first load).
- **Dynamic Chunk Verification (`/scan`):**
  - The heavy barcode decoding library `html5-qrcode` is **already dynamically imported** inside `components/ScannerPanel.tsx` only when `startCamera()` is executed. It does **not** bloat initial `/scan` page load or any other route.

---

## 4. Desktop and Mobile UX / Layout Audit

A complete responsive audit was conducted across the 7 required viewport sizes (360px, 390px, 430px, 768px, 1024px, 1280px, 1440px) using the screen recording walkthrough (`SmartFleece - Fiber Mill Operations - Brave 2026-11-07 03-59-04.mp4`) and real headless browser DOM extraction.

### 4.1 Viewport Audit Matrix

| Viewport | Device Class | Horizontal Overflow? | Max ScrollWidth | Small Touch Targets (<44px) | Navigation Behavior |
| :--- | :--- | :---: | :---: | :---: | :--- |
| **360px** | Small Phone | No (forced scale) | 785 px (docWidth) | **29 - 31 per view** | Top horizontal scrolling pill strip |
| **390px** | iPhone 12/13/14 | No (forced scale) | 785 px (docWidth) | **29 - 31 per view** | Top horizontal scrolling pill strip |
| **430px** | iPhone Pro Max | No (forced scale) | 785 px (docWidth) | **30 - 31 per view** | Top horizontal scrolling pill strip |
| **768px** | iPad Portrait | **YES (`/dashboard`)** | **1017 px** | 0 | Collapsed sidebar / grid collision |
| **1024px** | iPad Landscape | No | 1009 px | 0 | Left sidebar expanded |
| **1280px** | Laptop | No | 1265 px | 0 | Left sidebar expanded |
| **1440px** | Desktop | No | 1425 px | 0 | Left sidebar expanded |

### 4.2 Critical UX Flaws Identified

1. **Mobile Navigation Usability Failure:**
   - On viewports < 768px, `components/Sidebar.tsx` renders a horizontal scrolling strip of 10 pill buttons at the top of the viewport.
   - Reaching navigation buttons requires stretching to the top of large phones (poor thumb-zone ergonomics).
   - Horizontal scrolling conceals critical destinations (e.g. *Scan QR*, *Quality*, *Settings* are hidden off-screen to the right).
2. **Horizontal Layout Overflow at 768px (iPad Portrait):**
   - On `/dashboard`, `document.documentElement.scrollWidth` measures **1017px** against a window width of **768px** (+249px overflow).
   - Culprit: The grid layout switches to multi-column before the card contents and headers (`card lg:col-span-1`) have sufficient horizontal clearance, forcing horizontal scrollbars and breaking tablet usability.
3. **Severe Touch Target Deficiencies (WCAG 2.5.5 / 2.5.8):**
   - On mobile viewports (360px–430px), **between 25 and 31 clickable controls per page** measure smaller than 44x44px.
   - Status filters, lot action links, table rows, and pill buttons frequently measure 28px to 34px in height, making one-handed mill-floor touch interaction error-prone.
4. **Desktop Visual Clutter:**
   - Heavy borders, high-contrast dark tables, and uniform card densities create high visual fatigue.
   - Missing the calm, warm-neutral stone aesthetic, rounded cards, and restrained forest-green accents specified in the Master Plan reference design (`image(20261106-224542).png`).

---

## 5. Root Cause Analysis: Database & Perceived Loading Delays

While synthetic local benchmarks on a 10-lot database show fast TTFB (< 60 ms), code inspection reveals significant architectural bottlenecks that cause severe perceived loading delays on mobile connections and as data scales:

### 5.1 Unbounded Database Queries (O(N) Growth)
- **`/dashboard` (`app/(app)/dashboard/page.tsx`):**
  Executes `prisma.order.findMany({ include: { customer: true, lots: true } })` with **no `take` limit**. It loads every historical order and lot in the entire mill database, then iterates in JavaScript to compute status counts and active totals.
- **`/customers` (`app/(app)/customers/page.tsx`):**
  Executes `prisma.customer.findMany()` with **no pagination or limit**.
- **`/orders` (`app/(app)/orders/page.tsx`):**
  Executes `prisma.order.findMany()` with **no pagination or limit**.
- **`/invoices` (`app/(app)/invoices/page.tsx`):**
  Loads all invoices and recalculates revenue summaries in memory.
- **`/production` (`app/(app)/production/page.tsx`):**
  Loads all active lots, all machines, and 7 days of raw stage events to compute machine utilization in application code.

### 5.2 Heavy Waterfall Relations on Detail Routes
- **`/lots/[id]`:**
  Shows the slowest TTFB (**155 ms cold, 96 ms warm**) because it performs 5 nested relation joins: customer, order, currentStage, stageEvents (with machine attribution), qualityFlags, and qcInspections.
- **SSR Blocking Without Streaming Suspense:**
  Pages wait for all database queries to complete synchronously before streaming any HTML to the client. On higher-latency mobile cellular networks (4G/3G), this blocks First Contentful Paint.

---

## 6. Ranked Bottlenecks by Severity & Impact

| Rank | Bottleneck | Impact | Evidence | Recommendation |
| :---: | :--- | :---: | :--- | :--- |
| **1** | **Mobile Navigation Ergonomics** | **High** | Horizontal top scroll strip, concealed destinations, awkward thumb reach. | Replace on mobile with a fixed bottom navigation bar (Home, Scan, Lots, Orders, More) and clean mobile drawer. |
| **2** | **Touch Target Size Violations** | **High** | 25–31 interactive elements per page measure < 44px on mobile devices. | Standardize all interactive controls to minimum 44px touch targets with generous padding in `components/ui.tsx`. |
| **3** | **Unbounded Queries on Data Lists** | **High** | `findMany` without `take` or cursor on Dashboard, Customers, Orders. | Introduce cursor/offset pagination (`take: 25`) and server-side aggregation (`_count`, `groupBy`). |
| **4** | **Layout Overflow at 768px (iPad)** | **Medium** | `/dashboard` overflows by 249px on iPad portrait (`scrollWidth: 1017px`). | Refactor responsive grid breakpoints (`grid-cols-1 md:grid-cols-2 xl:grid-cols-3`) to prevent horizontal clipping. |
| **5** | **Lack of Streaming Suspense Skeletons** | **Medium** | Server blocks initial HTML on slowest relation query (`/lots/[id]` TTFB 155ms). | Wrap data-fetching components in `<Suspense fallback={<CardSkeleton />}>` for immediate shell painting. |
| **6** | **Visual Language & Contrast Fatigue** | **Medium** | Dense dark borders, industrial table-heavy layouts, inconsistent visual hierarchy. | Migrate to warm stone canvas (`#f8f9fa`), rounded cards (`rounded-2xl`), and forest-green accents (`#1b4332`). |

---

## 7. Recommended Next Phase (Phase 1 Slice Confirmation)

In strict accordance with the Master Plan and the single-slice implementation rule, the recommended immediate next step is **Phase 1: Design Tokens, Shared Components & Responsive App Shell**.

### Recommended Phase 1 Boundaries:
1. **Design Tokens (`app/globals.css`):**
   - Update Tailwind v4 `@theme` tokens to match the reference design: warm stone background (`--color-canvas-stone: #f8f9fa`), card surface (`--color-surface-white: #ffffff`), forest-green brand accents (`--color-brand-forest: #1b4332`), pale mint surfaces, and restrained border tokens.
2. **Shared UI Primitives (`components/ui.tsx`):**
   - Refactor `Card`, `Button`, `Badge`, `Input`, `StatCard` to use the new tokens.
   - Enforce WCAG 2.5.5 minimum 44px touch targets on mobile viewports.
3. **Responsive Application Shell (`components/Sidebar.tsx` & `app/(app)/layout.tsx`):**
   - **Desktop (>= 1024px):** Refactor sidebar into a clean vertical icon rail with tooltips, active filled indicators, and user avatar.
   - **Mobile (< 768px):** Replace the top horizontal scroll strip with a dedicated, ergonomic **fixed bottom navigation bar** (Dashboard, Lots, Scan, Orders, More Menu).
   - **Tablet (768px–1023px):** Compact rail with clean breakpoints to eliminate the 768px overflow.
4. **Scope Exclusions for Phase 1:**
   - Do NOT redesign individual page bodies (Dashboard content, Customers table, Orders table, etc.).
   - Do NOT modify database queries, schemas, or API endpoints.

---

## 8. Final Safety & Sign-off

- **Original `dev.db` Checksum:** Verified byte-identical (`E0AB34EC5A095293010B61B2CA81CF822171A2974D8A66DC2DD0DE98C3E55440`).
- **External Processes:** Port 3000 (Team Aeolus) and Port 3001 (Next dev) remain active and untouched.
- **Isolated Workspace Cleaned:** Isolated audit databases remain quarantined in `.gemini/antigravity/.../scratch/isolated_audit`.
- **Working Tree:** Clean. Zero uncommitted changes. Zero application code modifications.

**Phase 0 Audit is Complete. Awaiting User Approval to Proceed to Phase 1.**
