from fastapi import APIRouter

from app.api.v1.endpoints import (
    admin,
    auth,
    availability,
    bookings,
    bootstrap,
    businesses,
    health,
    notifications,
    orders,
    payments,
    products,
    services,
    staff,
    users,
    workspaces,
)

api_v1_router = APIRouter(prefix="/api/v1")
api_v1_router.include_router(health.router)
api_v1_router.include_router(auth.router)
api_v1_router.include_router(users.router)
api_v1_router.include_router(businesses.router)
api_v1_router.include_router(availability.router)
api_v1_router.include_router(bookings.router)
api_v1_router.include_router(services.router)
api_v1_router.include_router(staff.router)
api_v1_router.include_router(products.router)
api_v1_router.include_router(orders.router)
api_v1_router.include_router(payments.router)
api_v1_router.include_router(notifications.router)
api_v1_router.include_router(workspaces.router)
api_v1_router.include_router(admin.router)
api_v1_router.include_router(bootstrap.router)
