"""Parent Atlas RAPIDS sidecar entrypoint with resident graph/PageRank routes.

Imports the existing KNN-capable sidecar app without invoking its __main__, then
installs the revision-qualified graph runtime on the same FastAPI application.
Run this entrypoint on port 8098 when enabling graph acceleration.
"""

from __future__ import annotations

import os

import uvicorn

from atlas_rapids_graph_runtime import install_graph_routes
from atlas_rapids_sidecar import _gpu_memory_mb, app

_GRAPH_RUNTIME = install_graph_routes(app, gpu_memory_reader=_gpu_memory_mb)


def main() -> None:
    host = os.getenv("ATLAS_RAPIDS_SIDECAR_HOST", "127.0.0.1")
    port = int(os.getenv("ATLAS_RAPIDS_SIDECAR_PORT", "8098"))
    uvicorn.run(app, host=host, port=port, log_level=os.getenv("UVICORN_LOG_LEVEL", "info"))


if __name__ == "__main__":
    main()
