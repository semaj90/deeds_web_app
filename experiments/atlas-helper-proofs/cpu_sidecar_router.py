"""Opt-in router factory; does not start or modify the existing FastAPI sidecars."""
import os
from cpu_nlp_lut import classify, features
from cpu_dag import topological_order

def build_router():
    from fastapi import APIRouter, HTTPException
    from pydantic import BaseModel, ConfigDict, Field
    class StrictRequest(BaseModel):
        model_config = ConfigDict(extra="forbid", strict=True)
        text: str = Field(min_length=1, max_length=20000)
    class DagRequest(BaseModel):
        model_config = ConfigDict(extra="forbid", strict=True)
        nodes: list[str] = Field(max_length=256)
        edges: list[tuple[str, str]] = Field(max_length=1024)
    router = APIRouter(prefix="/experimental/atlas-cpu", tags=["atlas-cpu"])
    @router.post("/nlp")
    def nlp(req: StrictRequest):
        if os.getenv("ATLAS_CPU_HELPERS_ENABLED") != "1":
            raise HTTPException(status_code=404, detail="DISABLED")
        return {"status": "PROPOSAL_ONLY", "features": features(req.text),
                "ranked_domains": [h.__dict__ for h in classify(req.text)]}
    @router.post("/dag")
    def dag(req: DagRequest):
        if os.getenv("ATLAS_CPU_HELPERS_ENABLED") != "1":
            raise HTTPException(status_code=404, detail="DISABLED")
        try:
            order = topological_order(req.edges, req.nodes)
        except ValueError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc
        return {"status": "PROPOSAL_ONLY", "topological_order": order}
    return router
