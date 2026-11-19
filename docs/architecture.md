# BookIt Architecture

## Monorepo Layout
- `apps/web` — Next.js 15 desktop/tablet/mobile-responsive web application.
- `apps/mobile` — Expo + React Native + Expo Router iOS/Android/Web native application.
- `packages/types` — Shared TypeScript domain interfaces and status enums.
- `packages/design-system` — Brand colors (`#141420`, `#7C3AED`, `#A78BFA`, `#F8F7FC`), light/dark palettes, spacing, radii.
- `packages/ui` — Navigation definitions, status metadata, category labels, and settings section descriptors.
- `packages/utils` — Formatting, slot availability calculation, role-permission mapping, spending aggregations, and demo session token helpers.
- `packages/validation` — Zod schemas for registration, login, business onboarding, services, products, expenses, reviews, and addresses.
- `packages/api-client` — Centralized data access and mock store (`NEXT_PUBLIC_BOOKIT_USE_MOCKS` / `EXPO_PUBLIC_BOOKIT_USE_MOCKS`) prepared to switch to FastAPI HTTP calls.

## Identity & Multi-Workspace Model
- One `User` record per person.
- A user always has a personal customer experience (`/home`, `/explore`, `/bookings`, `/favorites`, `/marketplace`, `/account`).
- Users may hold `Membership` records across multiple `Business` tenants with distinct roles (`owner`, `admin`, `manager`, `employee`, `receptionist`, `accountant`).
- Selecting a workspace switches the active `businessId` context without signing into a separate account.
- Platform administrators (`isPlatformAdmin: true`) access the isolated `/admin` console.

## Security Preparation
- Passwords are never stored in browser `localStorage` or React state.
- Payment card numbers are never collected or persisted in frontend state.
- Frontend permission checks (`can(role, permission)`) govern UI affordances only; the future FastAPI backend must authorize every endpoint and enforce tenant isolation.
