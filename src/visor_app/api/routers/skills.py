"""Skills router: read-only proxy onto visor-agent's MCP-backed skills API."""
from __future__ import annotations

import os
from typing import Any

import httpx
from fastapi import APIRouter, HTTPException


router = APIRouter()


def _agent_url() -> str:
    return os.environ.get("VISOR_AGENT_URL", "http://localhost:8001").rstrip("/")


async def _agent_get(path: str) -> Any:
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(f"{_agent_url()}{path}")
            response.raise_for_status()
    except httpx.HTTPStatusError as exc:
        raise HTTPException(status_code=exc.response.status_code, detail=exc.response.text) from exc
    except httpx.RequestError as exc:
        raise HTTPException(status_code=503, detail=f"agent unavailable: {exc}") from exc
    return response.json()


@router.get("")
async def list_skills() -> list[dict[str, Any]]:
    data = await _agent_get("/skills")
    if not isinstance(data, list):
        raise HTTPException(status_code=502, detail="agent returned a non-list response")
    return data


@router.get("/{skill_id}")
async def get_skill(skill_id: str) -> dict[str, Any]:
    data = await _agent_get(f"/skills/{skill_id}")
    if not isinstance(data, dict):
        raise HTTPException(status_code=502, detail="agent returned a non-object response")
    return data
