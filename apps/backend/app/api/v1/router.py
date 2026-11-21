from fastapi import APIRouter

from app.api.v1.endpoints import (
    admin,
    auth,
    availability,
    booking_configs,
    bookings,
    bootstrap,
    businesses,
    events,
    health,
    notifications,
    orders,
    payments,
    products,
    resources,
    services,
    staff,
    universal_bookings,
    users,
    workspaces,
)

api_v1_router = APIRouter(prefix="/api/v1")
api_v1_router.include_router(health.router)
api_v1_router.include_router(auth.router)
api_v1_router.include_router(users.router)
api_v1_router.include_router(businesses.router)
api_v1_router.include_router(booking_configs.router)
api_v1_router.include_router(availability.router)
api_v1_router.include_router(bookings.router)
api_v1_router.include_router(universal_bookings.router)
api_v1_router.include_router(services.router)
api_v1_router.include_router(resources.router)
api_v1_router.include_router(events.router)
api_v1_router.include_router(staff.router)
api_v1_router.include_router(products.router)
api_v1_router.include_router(orders.router)
api_v1_router.include_router(payments.router)
api_v1_router.include_router(notifications.router)
api_v1_router.include_router(workspaces.router)
api_v1_router.include_router(admin.router)
api_v1_router.include_router(bootstrap.router)
