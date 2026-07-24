# Security Posture

## Authentication & session

| Control | Implementation |
|---|---|
| Password storage | bcrypt, cost 12 (`src/app/api/users/route.ts`) |
| Session token | HS256 JWT, 8 h expiry, `iss`/`aud` pinned, `jti` per session, algorithm allow-list — a token cannot downgrade its own `alg` (`src/lib/auth.ts`) |
| Role validation | `role` claim must be one of the six known roles, otherwise the session is rejected outright |
| Cookie | `httpOnly`, `secure`, `sameSite=strict`, `path=/`; in production the name carries the **`__Host-` prefix**, so the browser itself refuses a cookie set from a sibling subdomain |
| Revocation | `requirePerm()` re-reads the user record on every authorised request: a deactivated account or a downgraded role takes effect immediately, not at token expiry (`src/lib/session.ts`) |
| Login throttling | per-IP 8/min **and** per-account 10 / 15 min, so neither spraying nor a distributed attack on one account gets far |
| User enumeration | identical error text and a real bcrypt compare against a decoy hash for unknown users — no timing or message signal |

> Changing the cookie name to `__Host-` invalidates existing sessions once.
> Everyone signs in again after the deploy. This is expected.

## Request hardening (`src/proxy.ts`, `src/lib/security.ts`)

Applied at the edge, before any handler runs:

1. **CSRF** — every `POST/PUT/PATCH/DELETE` must be same-origin. `Origin` is
   checked first, then `Referer`; a mutating request carrying neither is
   rejected with 403. This backs up `SameSite=Strict` rather than relying on it.
2. **Payload ceilings** — 12 MB register import, 8 MB single entry, 64 MB backup
   restore, 256 KB everything else. Oversized requests get 413 before the body
   is read.
3. **Rate limits** — per route family × IP: login 8/min, bulk import 20/min,
   transactions 60/min, backup 5/min, users 30/min, default 120/min.
4. **Open-redirect guard** — the `?next=` value on the login redirect is only
   echoed when it matches a strict relative-path pattern.
5. **Cache** — every API response carries `no-store, no-cache, must-revalidate,
   private`; a shared cache can never hold authenticated data.

## Input validation

All write endpoints parse through zod schemas in `src/lib/schemas.ts`:

- Uploaded photos must match `data:image/(jpeg|png|webp);base64,…` — an
  unconstrained `data:` URL is an XSS vector once rendered.
- All free text is length-capped and stripped of control characters.
- Bulk import is capped at 60 rows per register page.
- The backup restore path is fully schema-validated (it writes straight to the
  durable store); `__proto__`/`constructor` keys are stripped, so a crafted
  backup file cannot pollute prototypes.
- Business rules (`validateEntry`) re-check everything the schema accepted —
  the client is never trusted for mandatory fields.

## Output safety

- CSV **and** Excel writers neutralise leading `= + - @` so a value typed into a
  remarks field cannot execute as a formula in the recipient's spreadsheet.
- The Excel writer strips characters XML 1.0 cannot represent and escapes all
  five XML entities.
- Transaction list responses omit photo data URLs entirely (`photoCount` only).

## Headers (`next.config.ts`)

CSP (`default-src 'self'`, `object-src 'none'`, `frame-ancestors 'none'`,
`base-uri 'self'`, `form-action 'self'`, `upgrade-insecure-requests`), HSTS with
preload, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`,
`Referrer-Policy: strict-origin-when-cross-origin`, a locked-down
`Permissions-Policy`, COOP and CORP set to `same-origin`.

Production CSP grants **`'wasm-unsafe-eval'`** (needed by the self-hosted
Tesseract WASM core) instead of full `'unsafe-eval'`; `'unsafe-eval'` is granted
only in development, for Next's dev overlay.

## Data handling

- OCR runs entirely in the browser against self-hosted WASM in `/public/ocr`.
  No image and no register data is ever sent to a third party.
- Register page scans are stored **once per import batch** and referenced by
  every row, instead of duplicating a multi-megabyte image per transaction.
- Every mutating action writes an audit record with the real client IP,
  geolocation and device.

## Known limitations (deliberate, documented)

- **`'unsafe-inline'` on `script-src`.** Next's hydration bootstrap needs it
  without a nonce-based CSP. Moving to per-request nonces is the next step here.
- **Rate limiting is per warm instance** (in-memory). It is a first line only;
  pair it with the Vercel WAF for distributed protection.
- **`EXPORT_TOKEN`** puts a bearer secret in a URL, which is inherent to Excel's
  web-query mechanism. It is read-only, off unless configured, rate-limited and
  audit-logged. Rotate it by changing the env var.

## Dependency posture

`npm audit --omit=dev` → **0 vulnerabilities**. The Excel writer is hand-rolled
(SpreadsheetML) specifically to avoid adding a spreadsheet library and its CVE
history.
