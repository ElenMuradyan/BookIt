# BookIt Production Deployment Guide

This guide covers deploying BookIt (`apps/web`, `apps/backend`, and `apps/mobile`) into a production environment.

---

## 1. Architecture Overview

- **Web (`apps/web`)**: Next.js App Router served with Node.js (`npm run build && npm run start`). Client requests hit same-origin `/api/v1/*` proxy handlers (`apps/web/app/api/v1/[...path]/route.ts`), which forward cookies, `Authorization`, and `X-CSRF-Token` headers to the FastAPI backend.
- **Backend (`apps/backend`)**: FastAPI + async SQLAlchemy 2.0 + `asyncpg` + Alembic + Argon2id + PyJWT + `httpx`.
- **Database**: PostgreSQL 15+ (local PG or managed Neon PostgreSQL) with the `btree_gist` extension enabled for range exclusion constraints on booking allocations.
- **Mobile (`apps/mobile`)**: Expo / React Native (`expo export` / EAS Build) connecting directly over HTTPS via Bearer tokens.

---

## 2. Database & Alembic Migrations

1. Provision PostgreSQL 15+ and create the application database.
2. Ensure `btree_gist` is installed (also enforced by migrations):
   ```sql
   CREATE EXTENSION IF NOT EXISTS btree_gist;
   ```
3. Configure both pooled and direct connection strings in `apps/backend/.env`:
   - `DATABASE_URL`: async driver string (`postgresql+asyncpg://...`) used by FastAPI runtime.
   - `DIRECT_DATABASE_URL`: unpooled connection string used by `alembic` during migrations (recommended when using Neon PgBouncer).
4. Apply all schema migrations:
   ```bash
   cd apps/backend
   alembic upgrade head
   ```
5. Do **not** run `scripts/seed.py` against a live customer production database; it is intended strictly for local development and demo sandboxes.

---

## 3. Environment Configuration

### Backend (`apps/backend/.env`)

| Variable | Production Requirement | Notes |
|---|---|---|
| `ENVIRONMENT` | `production` | Enables strict startup validation for secrets, Stripe, cookies, and CORS. |
| `JWT_SECRET_KEY` | Strong 32+ byte random string | Required (`ENVIRONMENT=production` rejects placeholder keys). |
| `CSRF_SECRET_KEY` | Strong 32+ byte random string | Required for HMAC-bound double-submit CSRF tokens. |
| `COOKIE_SECURE` | `true` | Requires HTTPS termination in front of `/api/v1/*`. |
| `COOKIE_SAMESITE` | `lax` (or `none` if cross-site TLS) | Keep `lax` with the same-origin Next.js proxy. |
| `CORS_ORIGINS` | Exact HTTPS web origins (comma-separated) | Never use `*` when `allow_credentials=true`. |
| `FRONTEND_BASE_URL` | Canonical web URL (`https://app.example.com`) | Used to construct email verification links. |
| `PAYMENT_PROVIDER` | `stripe` | Switches card intents/refunds/webhooks to Stripe. |
| `STRIPE_SECRET_KEY` | `sk_live_...` | Secret live key (stored server-side only; `sk_live_` is rejected outside production). |
| `STRIPE_WEBHOOK_SECRET` | `whsec_...` | Verifies `Stripe-Signature` HMAC-SHA256 + 300s timestamp replay tolerance. |
| `STRIPE_PUBLISHABLE_KEY` | `pk_live_...` | Returned alongside client secrets on `POST /api/v1/payments/intents`. |
| `EMAIL_PROVIDER` | `resend` | Enables real HTTP delivery via `https://api.resend.com/emails`. |
| `RESEND_API_KEY` | `re_...` | Live Resend API token. |
| `EMAIL_FROM` | `BookIt <no-reply@yourdomain.com>` | Must match a Resend domain with verified SPF, DKIM, and DMARC DNS records. |

### Stripe Webhook Setup

Configure a webhook endpoint in the Stripe Dashboard pointing to:

```
POST https://api.yourdomain.com/api/v1/payments/webhooks/stripe
```

Subscribe to the following events:
- `payment_intent.succeeded`
- `payment_intent.payment_failed`
- `charge.refunded`

Copy the signing secret (`whsec_...`) into `STRIPE_WEBHOOK_SECRET`. BookIt enforces idempotency via the `payment_webhook_events` table and rejects invalid/expired signatures with HTTP `401`.

### Web & Mobile Environment

- **Web (`apps/web`)**:
  - `NEXT_PUBLIC_BOOKIT_USE_MOCKS=false`
  - `BOOKIT_BACKEND_ORIGIN=https://api.yourdomain.com` (server-side proxy upstream)
  - `NEXT_PUBLIC_BOOKIT_API_URL=https://app.yourdomain.com` (or leave unset so browser requests use same-origin `/api/v1/*`)
- **Mobile (`apps/mobile` / EAS)**:
  - `EXPO_PUBLIC_BOOKIT_USE_MOCKS=false`
  - `EXPO_PUBLIC_BOOKIT_API_URL=https://api.yourdomain.com`

---

## 4. Process Execution, TLS & Health Checks

1. **TLS & Reverse Proxy**:
   - Terminate TLS 1.2+ at your load balancer / reverse proxy (Nginx, Caddy, Cloudflare, or Fly/Render ingress).
   - Forward `X-Forwarded-For` and `X-Forwarded-Proto` from trusted proxy hops only.
   - Start Uvicorn behind the proxy:
     ```bash
     uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 2
     ```
2. **Health Probes**:
   - Liveness: `GET /health`
   - Readiness (verifies PostgreSQL connectivity): `GET /api/v1/health`
3. **Security Headers**:
   - `apps/web/next.config.ts` emits `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, and `Permissions-Policy`. Add HSTS (`Strict-Transport-Security: max-age=31536000; includeSubDomains`) at the production ingress layer when HTTPS is active.
4. **Backups & Monitoring**:
   - Enable automated daily PostgreSQL snapshots + point-in-time recovery (PITR).
   - Monitor HTTP 5xx rates, webhook delivery errors in Stripe/Resend dashboards, and `past_due` subscription invoices.

---

## 5. CI/CD Verification Gate

Before promoting a release:

```bash
# Backend checks
python3 -m compileall -q apps/backend/app apps/backend/tests apps/backend/scripts
cd apps/backend && alembic upgrade head && pytest

# Monorepo checks
bun test
npm run smoke
npm run typecheck
npm run build
npx --workspace=apps/mobile expo config --json
npm run build:android --workspace=apps/mobile
```
