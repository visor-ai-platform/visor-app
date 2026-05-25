"""[SPEC] Pydantic request/response schemas."""
from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field


class SubmitJobRequest(BaseModel):
    user_intent: str = Field(min_length=1, max_length=4000)
    context: dict[str, Any] | None = None


class SubmitJobResponse(BaseModel):
    dag_id: str
    execution_id: str


class JobStatusResponse(BaseModel):
    dag_id: str
    state: str
    skills: list[dict[str, Any]]


class SkillSummary(BaseModel):
    id: str
    version: str
    type: str
    description: str | None = None
