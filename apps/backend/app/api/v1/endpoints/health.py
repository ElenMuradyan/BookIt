from fastapi import APIRouter, HTTPException, status

from app.core.config import get_settings
from app.core.database import check_db_health

router = APIRouter(tags=["health"])


@router.get("/health")
async def health_check() -> dict:
    settings = get_settings()
    try:
        db_ok = await check_db_health()
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database unavailable",
        ) from exc

    if not db_ok:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database check failed",
        )
    return {
        "status": "ok",
        "service": settings.app_name,
        "version": settings.app_version,
        "database": "connected",
    }
