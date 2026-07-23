# SFM Diesel Fuel Management — Standard Operating Procedure (SOP)

Production-grade, rule-based Diesel Filling Management System.
Next.js 16 (App Router) · React 19 · TypeScript · Neon Postgres · Tesseract.js OCR · JWT auth · Tailwind.

Live: https://sfm-fuel.vercel.app

---

## 1. Purpose

Digitises the diesel-filling workflow for a vehicle fleet. Field staff submit one
entry per fill (4 dropdowns + 4 photos). The backend runs **rule-based** validation,
calculation and exception engines (no LLM for business logic), extracts figures from
photos via OCR, records the result with location + device metadata, and updates the
admin dashboards and Excel export instantly. Database is the single source of truth.

---

## 2. Architecture (at a glance)

| Layer | Location | Notes |
|-------|----------|-------|
| Routing/auth guard | `src/proxy.ts` | Session + RBAC route gating |
| Auth | `src/lib/auth.ts` | JWT (jose), httpOnly cookie, 8h TTL |
| RBAC matrix | `src/lib/rbac.ts` | Roles → permissions, page gating |
| Data layer | `src/lib/store.ts` | JSON seeds merged over Neon Postgres |
| Persistence | `src/lib/pg.ts` | Neon serverless; degrades to in-memory |
| Business rules | `src/lib/rules/*` | `validation`, `calculations`, `exceptions`, `config` |
| OCR | `src/lib/ocr.ts` + `public/ocr` | Tesseract.js, best-effort, non-blocking |
| Client meta | `src/lib/clientmeta.ts` | Geolocation, device, file→dataURL |
| API routes | `src/app/api/**` | auth, transactions, masters, dashboard, audit, users, reports/export, backup, settings, health |
| UI | `src/app/(app)/**`, `src/components/**` | Role-aware pages |

Data flow: **Login → Entry form → POST /api/transactions → validation+calc+exception engines → persist (Postgres) → dashboards/Excel refresh.**

---

## 3. Setup / Install

Requirements: Node `>=20 <25` (see `.nvmrc` = 24), npm.

```bash
nvm use              # picks Node 24 from .nvmrc
npm install
cp .env.local .env   # or set the vars below
npm run seed         # (optional) regenerate seed data from data/ CSVs
npm run dev          # http://localhost:3000
```

Production build:

```bash
npm run build
npm start
```

---

## 4. Environment Variables

Set in `.env.local` (local) and Vercel Project → Settings → Environment Variables (prod).

| Var | Required | Purpose |
|-----|----------|---------|
| `AUTH_SECRET` | **Yes (prod)** | JWT signing key, min 32 chars. App throws in prod if missing/short. |
| `DATABASE_URL` / `POSTGRES_URL` | Recommended | Neon Postgres pooled URL. If absent, app runs in-memory (writes lost on cold start). |
| `POSTGRES_URL_NON_POOLING` | Optional | Non-pooled URL for migrations/schema. |
| `NODE_ENV` | Auto | `production` enables secure cookies + fail-fast auth. |

> **Security note:** the committed `.env.local` currently contains real Neon
> credentials, an `AUTH_SECRET`, and a Vercel OIDC token. **Rotate all of them** and
> keep `.env*` out of git (already in `.gitignore`). Never paste secrets in chat.

---

## 5. Deploy Process (Vercel)

Project is linked (`.vercel/`), production alias `sfm-fuel.vercel.app`.

```bash
# one-time
npm i -g vercel && vercel login && vercel link

# preview deploy
vercel

# production deploy
vercel --prod
```

CI alternative: push to `main` → Vercel auto-builds. Ensure the env vars in §4 exist
for the **Production** environment. Build command `next build`, output auto-detected.

Post-deploy smoke test: `GET /api/health` → 200, then log in as `superadmin`.

---

## 6. Roles & Access (from `src/lib/rbac.ts`)

| Role | Access |
|------|--------|
| `superadmin` | Everything: dashboard, records, verify/approve, exports, masters, users, audit, settings, backup |
| `admin` | Dashboard, records, verify/approve, exports, masters, users, audit |
| `supervisor`, `site_rep`, `operations`, `driver` | **Diesel Input Form only** (`tx:create`). Dashboard hidden. |

Route gating is enforced twice: in `proxy.ts` (edge) and per API route.

---

## 7. Common Failure Modes

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| `AUTH_SECRET missing or too short` on boot | Env not set in prod | Add 32+ char `AUTH_SECRET` in Vercel, redeploy |
| New submissions vanish after a while | No `DATABASE_URL` → in-memory only | Configure Neon Postgres URL |
| Login works, dashboard 302s to `/entry` | Correct — role lacks `dashboard:view` | Use admin/superadmin for dashboard |
| OCR fields stay empty / “Scanning text…” | Low-quality photo or OCR disabled | OCR is best-effort; type values manually (manual correction always wins) |
| “Location permission denied” badge | Browser geolocation blocked | Expected; entry still submits, location stored as denied/unavailable |
| Submit returns 409 `needsForce` | Exception engine flagged the entry | Review flagged issues, click **Confirm & Record** |
| Build fails on Node 25 | Engine range is `>=20 <25` | Use Node 24 (`nvm use`) |
| `npm install` errors | Lockfile/registry issue | Retry; keep `overrides.postcss` pinned |

---

## 8. How to Add a New Feature Safely

1. **Plan small.** One vertical slice: type → rule → API → UI.
2. **Types first.** Extend `src/lib/types.ts`; keep `DEFAULT_SETTINGS` in sync.
3. **Business logic stays rule-based.** Put deterministic logic in `src/lib/rules/*`.
   Never move business decisions into OCR/LLM. OCR extracts text only.
4. **Persistence.** Add columns/serialisation in `src/lib/pg.ts`; write through
   `store.ts` helpers (mutate memory **and** persist, never throw on DB failure).
5. **API route.** Add under `src/app/api/**`. Enforce permission with `can(role, ...)`
   from the verified session — never trust the client.
6. **RBAC.** Add any new `Permission` to the matrix + `PAGE_PERM` in `rbac.ts`.
7. **Audit.** Call `saveAudit()` for any state-changing or sensitive action.
8. **UI.** Reuse `src/components/ui.tsx` primitives and `Shell`. Keep pages role-aware.
9. **Validate.** `npm run build` (no type/lint errors) + manual test per role.
10. **Never break existing flows.** Extend seeds/migrations additively; keep backups
    (`/api/backup`) working.

Definition of done: build clean, `npm audit` = 0, all three role paths tested,
audit entries written, docs updated.

---

## 9. Maintenance

- **Backup:** superadmin → `GET /api/backup` (full JSON snapshot). Restore via `store.restore()`.
- **Excel export:** `GET /api/reports/export` (admin+). Regenerated from the DB.
- **Rotate secrets** quarterly and immediately if leaked (§4).
- **Dependencies:** `npm audit` before each deploy; keep Next.js patched.
