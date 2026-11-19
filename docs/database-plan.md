# BookIt PostgreSQL Database Plan (Future FastAPI Backend)

## Core Identity & Tenants
- `users`: `id`, `first_name`, `last_name`, `username`, `email`, `phone`, `password_hash`, `email_verified`, `phone_verified`, `status`, `is_platform_admin`, `created_at`, `updated_at`
- `customer_profiles`: `user_id` (PK/FK), `language`, `marketing_opt_in`, `spending_visibility`, `theme`, `notification_preferences` (JSONB)
- `addresses`: `id`, `user_id`, `label`, `line1`, `line2`, `city`, `region`, `postal_code`, `country`, `is_default`
- `businesses`: `id`, `owner_user_id`, `name`, `legal_name`, `category`, `status`, `is_public`, `booking_approval`, `cancellation_policy`, `hours` (JSONB), `location` (JSONB)
- `memberships`: `id`, `user_id`, `business_id`, `role`, `status`, `title`, `created_at` — unique `(user_id, business_id)`
- `business_applications`: `id`, `business_id`, `applicant_user_id`, `status`, `submitted_at`, `reviewed_at`, `reviewer_note`, `documents` (JSONB)

## Scheduling & CRM
- `services`: `id`, `business_id`, `name`, `category`, `price`, `duration_minutes`, `active`, `requires_approval`, `cancellation_policy`
- `employees`: `id`, `business_id`, `user_id`, `membership_id`, `title`, `hours` (JSONB), `status`, `rating`
- `appointments`: `id`, `business_id`, `service_id`, `employee_id`, `customer_id`, `start_at`, `end_at`, `status`, `price`, `payment_status`, `confirmation_mode`
- `customer_notes`: `id`, `business_id`, `customer_id`, `author_id`, `body`, `created_at`

## Marketplace, Orders & Finance
- `product_categories`, `products`, `product_variants`
- `carts`, `cart_items`
- `orders`, `order_items` (split per seller `business_id` under `checkout_group_id`)
- `payments`: `id`, `payer_id`, `business_id`, `amount`, `status` (`recorded | estimated | refunded | pending`), `method`, `reference_type`, `reference_id`
- `expenses`, `subscriptions`, `invoices`, `promo_codes`, `campaigns`, `advertisements`, `reviews`, `reports`, `notifications`, `favorites`
