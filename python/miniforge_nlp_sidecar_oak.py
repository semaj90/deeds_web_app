#!/usr/bin/env python3
"""Parent Atlas 8095 NLP sidecar with bounded OAK/OaK ontology kernel."""

from miniforge_nlp_sidecar_v2 import app
from atlas_oak_kernel import router as oak_router
from atlas_oak_postgres_evidence import router as oak_postgres_evidence_router

# Additive routers only: the provenance-preserving v2 AST/LangExtract routes
# remain the application owner. OAK/OaK adds bounded read-only capabilities.
app.include_router(oak_router)
app.include_router(oak_postgres_evidence_router)

if __name__ == "__main__":
    import os
    import uvicorn

    uvicorn.run(
        app,
        host=os.getenv("MINIFORGE_SIDECAR_HOST", "0.0.0.0"),
        port=int(os.getenv("MINIFORGE_SIDECAR_PORT", "8095")),
    )
