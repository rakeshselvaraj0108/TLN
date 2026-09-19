from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import select
import structlog

from app.core.config import get_settings
from app.db.session import init_db, close_db
from app.graph.connection import init_neo4j_schema, Neo4jConnection
from app.api.v1.routes import router as v1_router
from app.auth.security import hash_password
from app.db.session import get_db_context
from app.models import User, UserRole

settings = get_settings()

structlog.configure(
    processors=[
        structlog.stdlib.filter_by_level,
        structlog.stdlib.add_logger_name,
        structlog.stdlib.add_log_level,
        structlog.stdlib.PositionalArgumentsFormatter(),
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.StackInfoRenderer(),
        structlog.processors.format_exc_info,
        structlog.processors.UnicodeDecoder(),
        structlog.processors.JSONRenderer()
    ],
    context_class=dict,
    logger_factory=structlog.stdlib.LoggerFactory(),
    wrapper_class=structlog.stdlib.BoundLogger,
    cache_logger_on_first_use=True,
)

logger = structlog.get_logger()


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("starting_trace_x", version=settings.APP_VERSION)

    if not settings.TRACEX_DEMO_MODE:
        raise RuntimeError("TRACEX_DEMO_MODE=false but demo-grade controls detected. Refusing to start.")

    await init_db()
    await init_neo4j_schema()

    async with get_db_context() as session:
        result = await session.execute(select(User).where(User.username == "admin"))
        admin = result.scalar_one_or_none()
        if not admin:
            pwd_hash, salt = hash_password("admin123")
            admin = User(
                username="admin",
                email="admin@trace-x.local",
                password_hash=pwd_hash,
                password_salt=salt,
                role=UserRole.SUPERVISOR,
                full_name="System Administrator",
                badge_number="ADMIN001",
                department="Cyber Crime",
            )
            session.add(admin)
            await session.commit()
            logger.info("default_admin_created")

    logger.info("trace_x_started", demo_mode=settings.TRACEX_DEMO_MODE)

    yield

    await Neo4jConnection.close()
    await close_db()
    logger.info("trace_x_stopped")


app = FastAPI(
    title="TRACE-X API",
    description="Multi-Source Financial Crime Investigation Platform",
    version=settings.APP_VERSION,
    lifespan=lifespan,
    docs_url="/docs" if settings.DEBUG else None,
    redoc_url="/redoc" if settings.DEBUG else None,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(Exception)
async def global_exception_handler(request, exc):
    logger.error("unhandled_exception", path=request.url.path, error=str(exc), exc_info=True)
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error", "error_id": "trace-x-error"}
    )



app.include_router(v1_router)


@app.get("/")
async def root():
    return {
        "name": "TRACE-X",
        "version": settings.APP_VERSION,
        "description": "Multi-Source Financial Crime Investigation Platform",
        "demo_mode": settings.TRACEX_DEMO_MODE,
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)