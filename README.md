# SFM Diesel Fuel Management System

Production-grade **Diesel Filling Management System** implementing the pump/tanker
workflows, validation engine, business calculations, exception & financial-leakage
detection, RBAC, audit logging and analytics described in `workflow.md` / `workflow1.md`.

- **Stack:** Next.js 16 (App Router, TypeScript), Tailwind CSS, jose (JWT), bcryptjs, zod, Recharts.
- **Business logic is 100% rule-based — no AI/LLM.** OCR is used only for text extraction
  (with manual correction), per `workflow1.md`. All validation, calculations and exception
  detection run in deterministic engines under `src/lib/rules/`.
- **Data:** seeded from the real June-2026 exports in `diesel_csv_export/`
  (557 vehicles, 251 drivers, 11 pumps, 29 sites, 5,518 transactions).

## Run locally

```bash
npm install
npm run seed        # parse CSVs -> src/data/*.json
npm run gen-users   # generate 12 users + CREDENTIALS.txt (already done)
npm run dev         # http://localhost:3000
```

## Login credentials

See `CREDENTIALS.txt` (git-ignored). 10 users + 1 admin + 1 superadmin.

| Role | Username | Access |
|------|----------|--------|
| superadmin | `superadmin` | Everything, incl. creating admins/superadmins |
| admin | `admin` | Full ops + user/master management + audit |
| operations (user5,6,10) | `user5`… | Create/verify/approve tx, exceptions, export |
| site_rep (user3,4) | `user3`… | Create/verify tx, export |
| supervisor (user1,2,9) | `user1`… | Create/view tx |
| driver (user7,8) | `user7`… | Create/view own tx |

## How to use

1. **Sign in** at `/login`.
2. **Pump / Tanker Filling** — pick vehicle (autofills standard avg + cost center),
   driver, site, pump, enter quantity/rate/odometer. Validation, calculations and
   exceptions preview **live** as you type. Save runs the full engine server-side.
   - Clean entries save as **Verified**. Entries with high/critical exceptions require
     an explicit **Confirm & Record** and save as **Submitted** for review.
3. **Transactions** — search/filter by vehicle, site, date; paginated; **Export CSV**.
4. **Exceptions** — flagged transactions with risk badges; verify/approve/reject to move
   through the `Draft → Submitted → Verified → Approved → Locked` workflow.
5. **Master Data** — vehicles/drivers/pumps/sites; add new (admin) with duplicate checks.
6. **Users** — create users, deactivate, reset passwords (admin/superadmin).
7. **Audit Log** — immutable record of logins, transactions, exports, user/master changes.
8. **Dashboard** — KPIs, daily consumption trend, top vehicles/sites, low-mileage vehicles,
   financial leakage %.

## Business rules (`src/lib/rules/`)

- **calculations.ts** — amount, distance, achieved mileage, required diesel, excess diesel,
  debit-to-driver, cost/km.
- **validation.ts** — mandatory fields, vehicle/driver/site existence, future date,
  odometer rollback, duplicate receipt/transaction, tank-capacity/fuel limits, missing receipt.
- **exceptions.ts** — low mileage, high consumption, meter mismatch, capacity exceeded,
  double-fill, duplicate receipt, excess diesel, **critical financial leakage**.
- **config.ts** — tunable thresholds (tolerance %, mileage floor/ceiling, capacity, leakage).

## Security hardening

- JWT sessions in **httpOnly, Secure, SameSite=Strict** cookies (jose HS256, 8h expiry).
- Passwords hashed with **bcrypt (cost 12)**; constant-time compare on login.
- **RBAC** enforced server-side on every API + in the UI nav (`src/lib/rbac.ts`).
- **Middleware** gates all routes; unauth → `/login`, unauth API → 401.
- **Rate limiting** on login (8 / min / IP) → 429.
- Strict **input validation** with zod on every write endpoint.
- **Security headers**: CSP, HSTS (preload), X-Frame-Options DENY, X-Content-Type-Options,
  Referrer-Policy, Permissions-Policy; `X-Powered-By` removed.
- **CSV export** is formula-injection-safe.
- **Audit logging** of all sensitive actions; `AUTH_SECRET` required (≥32 chars) in production.
- `npm audit`: **0 vulnerabilities**; Next.js patched past CVE-2025-66478.

## Deployment

Deployed to Vercel (`sfm-fuel`). `AUTH_SECRET` is set as an encrypted env var.

> **Persistence note:** the data layer (`src/lib/store.ts`) is an in-memory singleton
> seeded from the bundled June-2026 dataset. On serverless it persists within a warm
> instance; runtime-created transactions reset on cold start. The layer is isolated behind
> one module so a Postgres/Neon adapter can replace it without touching business logic —
> the intended production path in `workflow.md`.
