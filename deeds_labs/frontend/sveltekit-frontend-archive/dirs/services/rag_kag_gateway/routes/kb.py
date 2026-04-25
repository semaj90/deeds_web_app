"""
KB Routes - Knowledge Base ingestion and updates
"""
from fastapi import APIRouter
from pydantic import BaseModel
from typing import Literal
from datetime import datetime
import sys
sys.path.append('..')

from services.ingestion import ingest_document, ingest_run

router = APIRouter()


class IngestRequest(BaseModel):
    kind: Literal["ace_operator_doc", "ace_llm_output", "surgical_fix", "ts_error"]
    text: str
    tags: list[str]
    source: str
    extra: dict | None = None


class RunIngestRequest(BaseModel):
    run_id: str
    file: str
    diff: str
    pre_errors: int
    post_errors: int
    outcome: Literal["success", "partial", "failure"]
    prompt_hash: str | None = None
    retrieved_ids: list[str] | None = None


@router.post("/ingest")
async def ingest(req: IngestRequest):
    """Ingest a document into the knowledge base"""
    result = await ingest_document(
        kind=req.kind,
        text=req.text,
        tags=req.tags,
        source=req.source,
        extra=req.extra
    )
    return result


@router.post("/ingest/run")
async def ingest_run_result(req: RunIngestRequest):
    """Log an autonomous fix attempt for learning"""
    result = await ingest_run(
        run_id=req.run_id,
        file=req.file,
        diff=req.diff,
        pre_errors=req.pre_errors,
        post_errors=req.post_errors,
        outcome=req.outcome,
        prompt_hash=req.prompt_hash,
        retrieved_ids=req.retrieved_ids
    )
    return result
