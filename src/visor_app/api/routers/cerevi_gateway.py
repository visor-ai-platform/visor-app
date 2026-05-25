"""Same-origin Cerevi-compatible proxy for chat visualization.

The browser reads `/cerevi/...` from visor-app, and visor-app forwards those
requests to the stable Cerevi endpoint at `VISOR_CATALOG_URL` (for this demo,
`https://192.168.1.130:8080`). This keeps browser traffic same-origin without
mounting a local `specimens.json` copy or reaching into dc-helper directly.
"""
from __future__ import annotations

import os
from collections.abc import AsyncIterator
from urllib.parse import quote

import httpx
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import Response, StreamingResponse


router = APIRouter()

_DEFAULT_CATALOG_URL = "https://192.168.1.130:8080"
_CORS_HEADERS = {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET, HEAD, OPTIONS",
    "access-control-allow-headers": "*",
}
_NO_RANGE_HEADERS = {"accept-ranges": "none"}
_FWD_HEADERS = (
    "content-type",
    "cache-control",
    "etag",
    "last-modified",
)


def _env_bool(name: str, default: bool) -> bool:
    raw = os.environ.get(name)
    if raw is None:
        return default
    return raw.strip().lower() not in {"0", "false", "no", "off", ""}


def _catalog_url() -> str:
    return os.environ.get("VISOR_CATALOG_URL", _DEFAULT_CATALOG_URL).rstrip("/")


def _tls_verify() -> bool:
    return _env_bool("VISOR_CATALOG_TLS_VERIFY", default=False)


def _cors(headers: dict[str, str] | None = None) -> dict[str, str]:
    return {**_CORS_HEADERS, **_NO_RANGE_HEADERS, **(headers or {})}


def _upstream_url(full_path: str, query: str = "") -> str:
    parts = [quote(part, safe="") for part in full_path.strip("/").split("/") if part]
    url = "/".join([_catalog_url(), *parts])
    if query:
        url = f"{url}?{query}"
    return url


def _proxy_headers(response: httpx.Response) -> dict[str, str]:
    headers = {name: response.headers[name] for name in _FWD_HEADERS if name in response.headers}
    return _cors(headers)


async def _proxy(request: Request, full_path: str) -> Response:
    method = "GET" if request.method == "HEAD" else request.method
    upstream_url = _upstream_url(full_path, request.url.query)
    client = httpx.AsyncClient(timeout=30.0, verify=_tls_verify(), follow_redirects=True)
    try:
        response = await client.send(
            client.build_request(method, upstream_url, headers={"accept-encoding": "identity"}),
            stream=True,
        )
    except httpx.RequestError as exc:
        await client.aclose()
        raise HTTPException(status_code=502, detail=f"Cerevi catalog unreachable: {exc}") from exc

    async def body() -> AsyncIterator[bytes]:
        try:
            if request.method != "HEAD":
                async for chunk in response.aiter_bytes():
                    yield chunk
        finally:
            await response.aclose()
            await client.aclose()

    return StreamingResponse(body(), status_code=response.status_code, headers=_proxy_headers(response))


@router.options("/{full_path:path}")
async def options(full_path: str) -> Response:
    _ = full_path
    return Response(content=b"", headers=_cors())


@router.get("/health")
async def health() -> dict[str, str | bool]:
    return {"status": "ok", "catalog_url": _catalog_url(), "tls_verify": _tls_verify()}


@router.api_route("/{full_path:path}", methods=["GET", "HEAD"])
async def proxy_cerevi(request: Request, full_path: str) -> Response:
    if ".." in full_path.split("/"):
        raise HTTPException(status_code=400, detail="Invalid Cerevi path")
    return await _proxy(request, full_path)
