# BookIt Frontend Pages & Routes

## Public & Auth
- `/` — Public landing & search entry
- `/pricing` — Subscription plans
- `/legal/[slug]` — Privacy notice & Terms of use
- `/login`, `/register`, `/register/business`, `/forgot`, `/verify`

## Customer (`apps/web` & `apps/mobile`)
- `/home` — Personalized home, upcoming bookings, favorites, marketplace picks
- `/explore` — Universal discovery with category-adaptive filters
- `/business/[id]` & `/explore/[id]` — Public business profile
- `/book/[businessId]` — 4-step appointment booking flow
- `/bookings`, `/bookings/[id]` — Booking management, reschedule, cancel, review
- `/favorites` — Saved businesses, services, staff, products & collections
- `/marketplace`, `/marketplace/[id]` — Multi-vendor catalog & product details
- `/cart`, `/checkout` — Multi-seller cart & checkout
- `/orders`, `/orders/[id]` — Order tracking & statuses
- `/spending` — Customer spending overview (recorded vs estimated)
- `/notifications` — Categorized notifications
- `/account`, `/account/settings/[section]` — Settings, theme, addresses, workspace switcher

## Business Workspace (`apps/web` & `apps/mobile`)
- `/workspace` — Business overview KPIs & charts
- `/workspace/calendar` — Day/Week/Month schedule & appointment modals
- `/workspace/bookings` — Confirm/Reject/Reschedule/Complete/No-show
- `/workspace/services` — Service catalog & staff assignments
- `/workspace/team` — Employee roster, invites, roles & permissions
- `/workspace/customers` — CRM list, history, and internal notes
- `/workspace/products`, `/workspace/orders` — Seller inventory & fulfillment
- `/workspace/finance`, `/workspace/marketing`, `/workspace/settings` — Finance, campaigns, policies, subscriptions

## Platform Admin (`apps/web` & `apps/mobile`)
- `/admin` — Admin overview
- `/admin/applications`, `/admin/businesses`, `/admin/users`, `/admin/workspaces`
- `/admin/subscriptions`, `/admin/payments`, `/admin/advertisements`, `/admin/reports`, `/admin/reviews`, `/admin/analytics`, `/admin/settings`
