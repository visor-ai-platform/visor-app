"""FastAPI entrypoint for visor-app."""
from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from visor_app.api.middleware.auth import AuthMiddleware
from visor_app.api.routers import cerevi_gateway, chat, config, jobs, provenance, skills


app = FastAPI(title="visor-app")
app.add_middleware(AuthMiddleware)

WEB_ROOT = Path(__file__).resolve().parents[1] / "web"
app.mount("/assets", StaticFiles(directory=WEB_ROOT / "assets"), name="assets")

app.include_router(chat.router, prefix="/v1/chat", tags=["chat"])
app.include_router(config.router, prefix="/v1/config", tags=["config"])
app.include_router(cerevi_gateway.router, prefix="/cerevi", tags=["cerevi"])
app.include_router(jobs.router, prefix="/v1/jobs", tags=["jobs"])
app.include_router(skills.router, prefix="/v1/skills", tags=["skills"])
app.include_router(provenance.router, prefix="/v1/provenance", tags=["provenance"])


@app.get("/healthz")
async def healthz() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/", include_in_schema=False)
async def index() -> FileResponse:
    return FileResponse(WEB_ROOT / "index.html")
