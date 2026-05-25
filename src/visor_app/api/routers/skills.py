"""Skills router: read-only proxy onto the visor-skills registry service."""
from __future__ import annotations

import os
from typing import Any

import httpx
from fastapi import APIRouter, HTTPException


router = APIRouter()


def _registry_url() -> str:
    return os.environ.get("VISOR_REGISTRY_URL", "http://localhost:8002").rstrip("/")


async def _registry_get(path: str) -> Any:
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(f"{_registry_url()}{path}")
            response.raise_for_status()
    except httpx.HTTPStatusError as exc:
        raise HTTPException(status_code=exc.response.status_code, detail=exc.response.text) from exc
    except httpx.RequestError as exc:
        raise HTTPException(status_code=503, detail=f"registry unavailable: {exc}") from exc
    return response.json()


@router.get("")
async def list_skills() -> list[dict[str, Any]]:
    data = await _registry_get("/v1/skills")
    if not isinstance(data, list):
        raise HTTPException(status_code=502, detail="registry returned a non-list response")
    return data


@router.get("/{skill_id}")
async def get_skill(skill_id: str) -> dict:
    data = await _registry_get(f"/v1/skills/{skill_id}")
    if not isinstance(data, dict):
        raise HTTPException(status_code=502, detail="registry returned a non-object response")
    return data
