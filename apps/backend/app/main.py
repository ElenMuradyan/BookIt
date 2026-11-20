import logging
import time
import uuid
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.v1.router import api_v1_router
from app.core.config import get_settings
from app.core.database import check_db_health, dispose_engine
from app.core.logging import configure_logging, request_id_ctx

settings = get_settings()
configure_logging(settings.log_level)
logger = logging.getLogger("bookit.api")


@asynccontextmanager
async def lifespan(_: FastAPI):
    logger.info("Starting BookIt FastAPI backend", extra={"path": settings.environment})
    yield
    await dispose_engine()
    logger.info("Shutting down BookIt FastAPI backend")


app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
    docs_url="/docs" if settings.environment in ("development", "test") else None,
    redoc_url="/redoc" if settings.environment in ("development", "test") else None,
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-CSRF-Token", "X-Client-Type", "X-Request-ID"],
)


@app.middleware("http")
async def security_and_request_context_middleware(request: Request, call_next):
    req_id = request.headers.get("x-request-id") or uuid.uuid4().hex[:16]
    token = request_id_ctx.set(req_id)
    started = time.perf_counter()
    try:
        response = await call_next(request)
    finally:
        duration_ms = round((time.perf_counter() - started) * 1000, 2)
        request_id_ctx.reset(token)

    response.headers["X-Request-ID"] = req_id
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"

    logger.info(
        "HTTP request completed",
        extra={
            "method": request.method,
            "path": request.url.path,
            "status_code": response.status_code,
            "duration_ms": duration_ms,
        },
    )
    return response


@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException) -> JSONResponse:
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "code": f"http_{exc.status_code}",
            "message": exc.detail if isinstance(exc.detail, str) else "Request failed",
            "detail": exc.detail,
            "requestId": request_id_ctx.get("-"),
        },
        headers=exc.headers,
    )


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError) -> JSONResponse:
    field_errors: dict[str, str] = {}
    for err in exc.errors():
        loc = [str(part) for part in err.get("loc", []) if part != "body"]
        key = ".".join(loc) if loc else "form"
        if key not in field_errors:
            field_errors[key] = err.get("msg", "Invalid value")
    return JSONResponse(
        status_code=422,
        content={
            "code": "validation_error",
            "message": "Check the submitted fields",
            "fieldErrors": field_errors,
            "requestId": request_id_ctx.get("-"),
        },
    )


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    logger.exception("Unhandled server exception", extra={"path": request.url.path, "method": request.method})
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={
            "code": "internal_server_error",
            "message": "An unexpected internal error occurred.",
            "requestId": request_id_ctx.get("-"),
        },
    )


@app.get("/health", tags=["health"])
async def root_health():
    try:
        db_ok = await check_db_health()
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Database unavailable") from exc
    if not db_ok:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Database check failed")
    return {"status": "ok", "service": settings.app_name, "database": "connected"}


app.include_router(api_v1_router)
