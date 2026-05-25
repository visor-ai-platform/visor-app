"""Chat proxy from visor-app to visor-agent."""
from __future__ import annotations

import json
import os
from collections.abc import AsyncIterator
from typing import Any

import httpx
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field


router = APIRouter()


class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=4000)
    context: dict[str, Any] = Field(default_factory=dict)


class ChatResponse(BaseModel):
    reply: str
    skills: list[dict[str, Any]] = Field(default_factory=list)
    source: str
    off_topic_remaining: int | None = None
    off_topic_limit: int | None = None
    scope_notice: str | None = None


def _agent_url() -> str:
    return os.environ.get("VISOR_AGENT_URL", "http://localhost:8001").rstrip("/")


def _sse(event: str, payload: dict[str, Any]) -> bytes:
    return f"event: {event}\ndata: {json.dumps(payload, ensure_ascii=False)}\n\n".encode("utf-8")


def _response_detail(text: str) -> str:
    try:
        payload = json.loads(text)
    except json.JSONDecodeError:
        return text
    detail = payload.get("detail") if isinstance(payload, dict) else None
    return detail if isinstance(detail, str) else text


async def _stream_agent_chat(req: ChatRequest) -> AsyncIterator[bytes]:
    try:
        async with httpx.AsyncClient(timeout=None) as client:
            async with client.stream("POST", f"{_agent_url()}/chat/stream", json=req.model_dump()) as response:
                if response.status_code >= 400:
                    detail = _response_detail((await response.aread()).decode("utf-8", errors="replace"))
                    yield _sse("error", {"message": detail, "status_code": response.status_code})
                    return
                async for chunk in response.aiter_bytes():
                    yield chunk
    except httpx.RequestError as exc:
        yield _sse("error", {"message": f"agent unavailable: {exc}", "status_code": 503})


@router.post("", response_model=ChatResponse)
async def chat(req: ChatRequest) -> dict[str, Any]:
    try:
        async with httpx.AsyncClient(timeout=45.0) as client:
            response = await client.post(f"{_agent_url()}/chat", json=req.model_dump())
            response.raise_for_status()
    except httpx.HTTPStatusError as exc:
        detail = _response_detail(exc.response.text)
        raise HTTPException(status_code=exc.response.status_code, detail=detail) from exc
    except httpx.RequestError as exc:
        raise HTTPException(status_code=503, detail=f"agent unavailable: {exc}") from exc
    return response.json()


@router.post("/stream")
async def chat_stream(req: ChatRequest) -> StreamingResponse:
    return StreamingResponse(
        _stream_agent_chat(req),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )