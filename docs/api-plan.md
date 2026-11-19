# BookIt FastAPI Integration Plan

## Environment Toggle
- `NEXT_PUBLIC_BOOKIT_USE_MOCKS=false` (Web) / `EXPO_PUBLIC_BOOKIT_USE_MOCKS=false` (Mobile)
- `NEXT_PUBLIC_BOOKIT_API_URL` / `EXPO_PUBLIC_BOOKIT_API_URL`

## Planned REST Endpoints
- `POST /auth/register`, `POST /auth/login`, `POST /auth/verify`, `POST /auth/password-reset/request`, `POST /auth/password-reset/confirm`, `GET /auth/me`
- `GET /businesses`, `GET /businesses/{id}`, `POST /businesses/applications`
- `GET /businesses/{id}/availability`, `POST /appointments`, `PATCH /appointments/{id}`
- `GET /products`, `GET /products/{id}`, `POST /cart/items`, `PATCH /cart/items/{id}`, `POST /checkout`
- `GET /orders`, `PATCH /workspaces/{business_id}/orders/{order_id}`
- `GET /workspaces/{business_id}/overview`, `POST /workspaces/{business_id}/services`, `POST /workspaces/{business_id}/team/invite`, `POST /workspaces/{business_id}/expenses`, `PATCH /workspaces/{business_id}/subscription`
- `GET /admin/overview`, `POST /admin/applications/{id}/review`, `PATCH /admin/businesses/{id}`, `PATCH /admin/users/{id}`, `PATCH /admin/reports/{id}`
