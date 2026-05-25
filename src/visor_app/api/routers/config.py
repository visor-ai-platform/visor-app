"""Public browser configuration for the static chat UI.

The frontend is served as static files, so deploy-time values that must reach
browser JavaScript are exposed here instead of being baked into app.js.
"""
from __future__ import annotations

import os

from fastapi import APIRouter


router = APIRouter()


def _env(name: str, default: str = "") -> str:
    return os.environ.get(name, default).strip()


@router.get("")
async def browser_config() -> dict[str, str | None]:
    explorer_url = _env("VISOR_CEREVI_EXPLORER_BASE_URL") or _env("VISOR_CATALOG_URL")
    return {
        "cerevi_explorer_base_url": explorer_url.rstrip("/") or None,
    }
