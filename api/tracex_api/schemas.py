"""Request/response models shared by several routers (from the deployed OpenAPI schema)."""
from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field


class ServiceStatus(BaseModel):
    name: str = ...
    ok: bool = ...
    detail: str | None = None
