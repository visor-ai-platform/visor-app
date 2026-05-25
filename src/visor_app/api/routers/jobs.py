"""[SPEC] Jobs router: submit + SSE stream + status."""
from __future__ import annotations

from fastapi import APIRouter
from sse_starlette.sse import EventSourceResponse

from visor_app.api.models.schemas import (
    JobStatusResponse,
    SubmitJobRequest,
    SubmitJobResponse,
)


router = APIRouter()


@router.post("", response_model=SubmitJobResponse)
async def submit_job(req: SubmitJobRequest) -> SubmitJobResponse:
    # TODO: sanitize -> visor-agent.plan -> validate -> visor-exec submission.
    _ = req
    raise NotImplementedError


@router.get("/{dag_id}", response_model=JobStatusResponse)
async def get_status(dag_id: str) -> JobStatusResponse:
    # TODO: query visor-exec state + per-skill status.
    _ = dag_id
    raise NotImplementedError


@router.get("/{dag_id}/events")
async def stream_events(dag_id: str) -> EventSourceResponse:
    # TODO: stream visor-exec status events via SSE.
    _ = dag_id
    raise NotImplementedError
