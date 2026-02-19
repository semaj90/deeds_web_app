from fastapi import APIRouter
from pydantic import BaseModel
from typing import Optional, Dict, Any

router = APIRouter()

class IngestReq(BaseModel):
    kind: str
    text: str
    tags: Optional[list[str]] = None
    source: Optional[str] = None
    extra: Optional[Dict[str, Any]] = None

class RunIngestReq(BaseModel):
    run_id: str
    file: str
    diff: str
    pre_errors: int
    post_errors: int
    outcome: str

@router.post("/ingest")
async def ingest(req: IngestReq):
    # TODO: Implement ingestion logic (store in CouchDB/Qdrant)
    return {"status": "received", "kind": req.kind}

@router.post("/ingest/run")
async def ingest_run(req: RunIngestReq):
    # TODO: Implement run ingestion logic
    return {"status": "received", "run_id": req.run_id}
