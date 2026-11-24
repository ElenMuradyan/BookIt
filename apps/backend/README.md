# BookIt Backend (`apps/backend`)

Production-oriented **FastAPI + PostgreSQL + SQLAlchemy 2.x + Alembic** backend powering the BookIt multi-vendor booking and marketplace monorepo (`apps/web` Next.js and `apps/mobile` Expo React Native).

---

## 1. Architecture & Directory Layout

```text
apps/backend/
├── app/
│   ├── main.py                      # FastAPI entrypoint, CORS, security headers, request IDs, error handlers
│   ├── core/
│   │   ├── config.py                # Pydantic settings & production secret validation
│   │   ├── database.py              # Async SQLAlchemy engine/session factory & DB health check
│   │   ├── logging.py               # Structured JSON/context logging with request_id
│   │   ├── rate_limit.py            # Sliding-window auth/sensitive endpoint rate limiter
│   │   └── security.py              # Argon2id password hashing, JWT tokens, opaque refresh tokens, HMAC webhooks
│   ├── api/
│   │   ├── dependencies/
│   │   │   └── auth.py              # Cookie/Bearer auth dependencies, CSRF double-submit verification, RBAC guards
│   │   └── v1/
│   │       ├── router.py            # Aggregates all /api/v1 endpoints
│   │       └── endpoints/           # auth, users, businesses, availability, bookings, services, staff,
│   │                                # products, orders, payments, notifications, workspaces, admin, bootstrap, health
│   ├── models/                      # SQLAlchemy 2.0 ORM models (users, business, catalog, booking, commerce, engagement)
│   ├── schemas/                     # Pydantic v2 request/response DTOs matching @bookit/types
│   └── services/                    # Domain services (auth_service, availability_service, booking_service,
│                                    # order_service, notification_service, payment_service)
├── migrations/                      # Alembic migrations (incl. btree_gist double-booking exclusion constraint)
├── scripts/
│   └── seed.py                      # Idempotent development seed script (never run blindly in production)
├── tests/                           # Pytest suite (auth, RBAC/IDOR, availability, booking concurrency, orders, admin)
├── alembic.ini
├── docker-compose.yml
├── Dockerfile
├── pyproject.toml
└── requirements.txt
```

---

## 2. Database Schema & Integrity Guarantees

BookIt uses **PostgreSQL 15+** via `asyncpg` and SQLAlchemy 2.0 async sessions.

Key schema highlights (`migrations/versions/cee0e1f2b63c_initial_schema.py`):

- **Identity & Auth**: `users`, `customer_profiles`, `addresses`, `refresh_tokens` (family tracking for reuse detection), `verification_codes` (SHA-256 hashed 6-digit OTPs with expiry/consumption tracking).
- **Businesses & Workspaces**: `businesses` (supports IANA timezones, weekly hours JSON, holiday dates, blocked time intervals, onboarding status), `business_applications`, `memberships` (per-workspace role + active/invited/suspended status).
- **Catalog & Staff**: `services`, `employees`, `employee_services`, `product_categories`, `products`, `product_variants` (server-side stock counts & prices).
- **Appointments & Double-Booking Prevention**:
  - `appointments` tracks `starts_at`, `ends_at`, `idempotency_key`, `check_in_code`, and status lifecycle (`pending`, `confirmed`, `checked_in`, `completed`, `cancelled`, `no_show`).
  - `appointment_status_history` and `customer_notes` preserve audit trails.
  - **PostgreSQL Exclusion Constraint**: Uses the `btree_gist` extension (`excl_appointments_no_employee_overlap`) on `appointments` over `(employee_id WITH =, tstzrange(starts_at, ends_at, '[)') WITH &&)` where `status IN ('pending', 'confirmed', 'checked_in')`, guaranteeing zero double-bookings even under concurrent transactions.
  - Booking creation also locks the employee row (`SELECT ... FOR UPDATE`) before slot verification.
- **Commerce & Billing**: `carts`, `cart_items`, `orders` (split per seller on multi-vendor checkout, with `SELECT ... FOR UPDATE` stock decrement), `order_items`, `payments` (provider intent + verified webhook state), `invoices`, `expenses`, `plans`, `subscriptions`.
- **Engagement & Platform Admin**: `favorites`, `reviews`, `notifications`, `campaigns`, `promo_codes`, `advertisements`, `reports`.
- **Database Triggers & PII Protection**: Automatic `updated_at` timestamp triggers and strict response redaction so public/catalog queries never expose private customer PII (`email`, `phone`, `date_of_birth`).

---

## 3. Authentication & Session Security

- **Password Hashing**: Argon2id via `pwdlib` (`Argon2Hasher`). Plaintext passwords are never stored or logged.
- **Access Tokens**: Short-lived signed JWTs (`ACCESS_TOKEN_EXPIRE_MINUTES=15`) carrying `sub`, `jti`, `iat`, `exp`, and `type`.
- **Rotating Refresh Tokens & Reuse Detection**:
  - Opaque high-entropy refresh tokens are stored hashed (SHA-256) in `refresh_tokens` with a shared `family_id`.
  - Every `/api/v1/auth/refresh` rotates the token and revokes the previous token.
  - Presenting an already-rotated/revoked refresh token immediately revokes the entire token family and rejects the request (`401`).
- **Dual Client Transport**:
  - **Web (`X-Client-Type: web`)**: Sets `HttpOnly`, `SameSite` cookies (`bookit_access`, `bookit_refresh`) plus a readable double-submit CSRF cookie (`bookit_csrf`). Mutating requests (`POST`, `PUT`, `PATCH`, `DELETE`) verify the `X-CSRF-Token` header matches `bookit_csrf`. Session tokens are stripped from JSON response bodies.
  - **Mobile / API (`X-Client-Type: mobile`)**: Returns JSON `accessToken` + `refreshToken` for secure device storage and `Authorization: Bearer <token>` headers without ambient browser cookies.
- **Password Reset & Verification**: Anti-enumeration reset flow always returns a uniform success response; verification and reset codes are hashed and expire automatically.
- **Rate Limiting**: Sliding-window rate limiting protects `/auth/login`, `/auth/login/business`, `/auth/register`, `/auth/refresh`, `/auth/password-reset/*`, and `/auth/verify`.

---

## 4. Role & Access Control (RBAC) Matrix

| Scope | Allowed Roles / Actors | Enforced Capabilities |
| :--- | :--- | :--- |
| **Public / Unauthenticated** | Anyone | Browse approved/public businesses, services, products, categories, reviews, and compute availability slots (redacted PII) |
| **Customer** | Authenticated `user` (`active`) | Manage own profile, addresses, favorites, cart, multi-vendor checkout, own bookings, own orders, own notifications, submit reviews |
| **Business Owner / Admin** | Workspace `owner` or `admin` | Full workspace management: profile/hours/holidays/blocked slots, services, products, team invites & roles, all bookings/orders, expenses, campaigns, promos, subscription |
| **Business Manager** | Workspace `manager` | Manage services, products, bookings, orders, customer notes, expenses, campaigns, promos, staff assignments |
| **Employee / Specialist** | Workspace `employee` | View workspace calendar, update/check-in assigned bookings, manage booking notes |
| **Receptionist** | Workspace `receptionist` | Manage front-desk bookings, status transitions, and QR code check-in |
| **Accountant** | Workspace `accountant` | View workspace overview/financials and record expenses |
| **Platform Admin** | `user.is_platform_admin = true` | Review/approve/reject business applications, moderate businesses/users/reviews/advertisements/reports, view platform overview |

All workspace routes derive permissions exclusively from authenticated server-side `Membership` records and verify resource ownership to prevent IDOR.

---

## 5. API Endpoint Catalog (`/api/v1`)

| Group | Endpoints |
| :--- | :--- |
| **Health** | `GET /health`, `GET /api/v1/health` |
| **Auth** | `POST /auth/register`, `POST /auth/login`, `POST /auth/login/business`, `POST /auth/refresh`, `POST /auth/logout`, `GET /auth/me`, `POST /auth/verify/request`, `POST /auth/verify`, `POST /auth/password-reset/request`, `POST /auth/password-reset/confirm`, `POST /auth/change-password`, `POST /auth/deactivate` |
| **Users** | `PATCH /users/me`, `PUT /users/me/consent`, `PUT /users/me/theme`, `PUT /users/me/spending-visibility`, `PATCH /users/me/notification-preferences`, `GET/POST /users/me/addresses`, `GET /users/me/favorites`, `POST /users/me/favorites/toggle`, `PATCH /users/me/favorites/{favorite_id}` |
| **Businesses** | `GET /businesses`, `GET /businesses/{business_id}`, `POST /businesses/applications`, `PATCH /businesses/{business_id}`, `PUT /businesses/{business_id}/hours`, `POST/DELETE /businesses/{business_id}/holidays`, `POST/DELETE /businesses/{business_id}/blocked`, `GET /businesses/{business_id}/services`, `GET /businesses/{business_id}/staff`, `GET /businesses/{business_id}/availability` |
| **Bookings** | `GET /bookings`, `POST /bookings`, `GET /bookings/{appointment_id}`, `GET /bookings/{appointment_id}/history`, `PATCH /bookings/{appointment_id}/status`, `POST /bookings/{appointment_id}/reschedule`, `PATCH /bookings/{appointment_id}/notes`, `POST /bookings/businesses/{business_id}/check-in` |
| **Services & Staff** | `GET /services`, `GET /services/{service_id}`, `POST/PUT /workspaces/{business_id}/services`, `PATCH /workspaces/{business_id}/services/{service_id}/active`, `POST /workspaces/{business_id}/services/{service_id}/employees/{employee_id}/toggle`, `POST /workspaces/{business_id}/team/invite`, `PATCH /workspaces/{business_id}/team/{membership_id}/role`, `PATCH /workspaces/{business_id}/employees/{employee_id}` |
| **Catalog & Commerce** | `GET /product-categories`, `GET /products`, `GET /products/{product_id}`, `POST/PUT/PATCH .../products`, `GET /cart`, `POST /cart/items`, `PATCH /cart/items/{item_id}`, `POST /checkout`, `GET /orders`, `PATCH /workspaces/{business_id}/orders/{order_id}` |
| **Payments** | `GET /payments`, `POST /payments/intents`, `POST /payments/webhooks/{provider}` (HMAC signature verified) |
| **Notifications & Workspaces** | `GET /notifications`, `POST /notifications/{id}/read`, `POST /notifications/read-all`, `POST /workspaces/{business_id}/notifications/...`, `POST /businesses/{business_id}/messages`, `GET /workspaces/{business_id}/overview`, `POST .../notes`, `POST .../expenses`, `POST .../campaigns`, `POST .../promos`, `PATCH .../subscription`, `POST /reviews` |
| **Platform Admin** | `GET /admin/overview`, `POST /admin/applications/{id}/review`, `PATCH /admin/businesses/{id}`, `PATCH /admin/users/{id}`, `PATCH /admin/reviews/{id}`, `PATCH /admin/advertisements/{id}`, `PATCH /admin/reports/{id}` |
| **Bootstrap** | `GET /bootstrap` (role-scoped hydrated snapshot for frontend store sync) |

---

## 6. Environment Configuration

### Backend (`apps/backend/.env.example`)
Copy `apps/backend/.env.example` to `apps/backend/.env` for local runs:
- `DATABASE_URL` / `TEST_DATABASE_URL`: PostgreSQL `postgresql+asyncpg://...` connection strings.
- `JWT_SECRET_KEY` / `CSRF_SECRET_KEY`: Must be strong 32+ byte random secrets in `staging`/`production` (enforced on startup).
- `COOKIE_SECURE` / `COOKIE_SAMESITE` / `COOKIE_DOMAIN` / `CORS_ORIGINS`: Set `COOKIE_SECURE=true` and explicit HTTPS origins in production.
- `PAYMENT_PROVIDER`, `PAYMENT_WEBHOOK_SECRET`, `STRIPE_SECRET_KEY`: Payment configuration.
- `EMAIL_PROVIDER`, `EMAIL_FROM`, `RESEND_API_KEY`, `RESEND_API_BASE_URL`, `PUSH_PROVIDER`, `SMTP_*`, `FCM_SERVER_KEY`: Notification delivery settings (`RESEND_API_KEY` + verified `EMAIL_FROM` enable transactional Resend delivery).

### Frontend Dual-Mode Toggle (Root `.env.example`)
Web (`apps/web`) and Mobile (`apps/mobile`) support both offline demo preview mode and live backend mode:
- **Offline Mock Mode (default)**: `NEXT_PUBLIC_BOOKIT_USE_MOCKS=true` / `EXPO_PUBLIC_BOOKIT_USE_MOCKS=true`.
- **Live FastAPI Mode**: Set `USE_MOCKS=false` and configure `NEXT_PUBLIC_BOOKIT_API_URL=http://127.0.0.1:8000` (Web) and `EXPO_PUBLIC_BOOKIT_API_URL=http://10.0.2.2:8000` (Android Emulator) or your machine LAN IP (physical device).

---

## 7. Local Development Quickstart

### Option A: Docker Compose (Recommended)
From `apps/backend/`:
```bash
docker compose up --build
```
This starts PostgreSQL 16, applies Alembic migrations (`alembic upgrade head`), and serves FastAPI on `http://127.0.0.1:8000`.
To seed local demo accounts/data inside the running container:
```bash
docker compose exec api python -m scripts.seed
```

### Option B: Local Python Virtualenv + PostgreSQL
1. Ensure PostgreSQL 15+ is running with databases `bookit` and `bookit_test` and the `btree_gist` extension enabled.
2. Create and activate the virtualenv inside `apps/backend/`:
   ```bash
   python3 -m venv apps/backend/.venv
   apps/backend/.venv/bin/pip install -r apps/backend/requirements.txt
   ```
3. Run migrations and seed data (from `apps/backend/`):
   ```bash
   alembic upgrade head
   PYTHONPATH=. .venv/bin/python -m scripts.seed
   ```
4. Start the API server (from `apps/backend/`):
   ```bash
   PYTHONPATH=. .venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
   ```
   Interactive OpenAPI docs are enabled in `development`/`test` at `http://127.0.0.1:8000/docs`.

---

## 8. Testing & Linting

Run the full backend test suite and Ruff linter:
```bash
PYTHONPATH=apps/backend apps/backend/.venv/bin/pytest apps/backend/tests -q
apps/backend/.venv/bin/ruff check apps/backend/app apps/backend/tests apps/backend/scripts
```

Test coverage includes:
- Validation `422 fieldErrors`, Argon2id register/login, refresh rotation & token-family reuse revocation, Web HttpOnly/CSRF double-submit vs Mobile Bearer transport, anti-enumeration password reset, and auth rate limiting.
- RBAC & IDOR isolation across customer, business workspace roles, and platform admin.
- Timezone-aware slot generation (weekly hours, holidays, blocked slots, minimum notice, advance window, employee assignment).
- Concurrent double-booking prevention (`asyncio.gather` + PostgreSQL `btree_gist` exclusion constraint), idempotency key deduplication, and front-desk QR check-in.
- Multi-vendor checkout order splitting, row-locked inventory decrement, and HMAC webhook signature verification.

---

## 9. Production Deployment Checklist

- [ ] Set `ENVIRONMENT=production`, `DEBUG=false`, `COOKIE_SECURE=true`.
- [ ] Provide strong, unique `JWT_SECRET_KEY`, `CSRF_SECRET_KEY`, and `PAYMENT_WEBHOOK_SECRET` (32+ random bytes via secrets manager).
- [ ] Restrict `CORS_ORIGINS` to exact production frontend domains (wildcard `*` is blocked by startup validation).
- [ ] Place FastAPI behind HTTPS TLS termination (reverse proxy / load balancer) with `X-Forwarded-*` headers properly configured.
- [ ] Run `alembic upgrade head` in deployment CI/CD before traffic cutover; **do not** run `scripts/seed.py` in production.
- [ ] Enable automated PostgreSQL backups and connection pool monitoring.

---

## 10. Optional External Integrations (Ready for Provider Keys)

The following external services are architected with clean provider abstractions and database persistence, and default to safe local modes until credentials are configured:
- **Email Delivery (`EMAIL_PROVIDER=log_only` -> `resend` or `smtp`)**: Verification OTPs/links and password-reset codes are generated, SHA-256 hashed, and persisted in PostgreSQL. Configure `EMAIL_PROVIDER=resend` (or set `RESEND_API_KEY` outside `test`), `RESEND_API_KEY`, and a verified sender in `EMAIL_FROM` for live Resend email dispatch (or `EMAIL_PROVIDER=smtp` with `SMTP_*` + `EMAIL_FROM`). Misconfigured or rejected provider deliveries fail safely with `503`/`502` and roll back unissued tokens instead of returning a false `200`.
- **Push Notifications (`PUSH_PROVIDER=log_only` -> `fcm`)**: In-app notifications are persisted and served via `/api/v1/notifications`; configure `FCM_SERVER_KEY` for remote mobile push dispatch.
- **Live Payment Settlement (`PAYMENT_PROVIDER=sandbox_unconfigured` -> `stripe`)**: Payment intents, order totals, and HMAC-SHA256 webhook signature verification (`/api/v1/payments/webhooks/{provider}`) are implemented; configure `STRIPE_SECRET_KEY` and `PAYMENT_WEBHOOK_SECRET` for live PSP settlement.
