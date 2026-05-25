"""[STUB] Provenance router: query execution records on storage."""
from __future__ import annotations

from fastapi import APIRouter


router = APIRouter()


@router.get("/{dag_id}")
async def get_execution(dag_id: str) -> dict:
    # TODO: read /visor/outputs/<dag_id>/.visor/execution.json.
    _ = dag_id
    raise NotImplementedError
