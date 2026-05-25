"""[SPEC] Auth middleware: API key in `Authorization: Bearer <key>`.

OAuth2 deferred. Keys loaded from K8s secret `api-keys` (env: `VISOR_API_KEYS`,
comma-separated). 401 on missing/invalid.
"""
from __future__ import annotations

import os

from fastapi import Request
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.types import ASGIApp


_PUBLIC_PATHS = {
    "/",
    "/favicon.ico",
    "/healthz",
    "/docs",
    "/openapi.json",
    "/redoc",
    "/v1/chat",
    "/v1/chat/stream",
    "/v1/skills",
}
_PUBLIC_PREFIXES = ("/assets/", "/v1/skills/")


def _is_public_path(path: str) -> bool:
    return path in _PUBLIC_PATHS or any(path.startswith(prefix) for prefix in _PUBLIC_PREFIXES)


class AuthMiddleware(BaseHTTPMiddleware):
    def __init__(self, app: ASGIApp) -> None:
        super().__init__(app)
        keys = os.environ.get("VISOR_API_KEYS", "")
        self._keys = {k.strip() for k in keys.split(",") if k.strip()}

    async def dispatch(self, request: Request, call_next):
        if _is_public_path(request.url.path):
            return await call_next(request)
        header = request.headers.get("authorization", "")
        if not header.startswith("Bearer ") or header[7:] not in self._keys:
            return JSONResponse({"detail": "unauthorized"}, status_code=401)
        return await call_next(request)
