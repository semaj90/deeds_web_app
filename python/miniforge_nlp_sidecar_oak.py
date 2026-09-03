#!/usr/bin/env python3
"""Parent Atlas 8095 NLP sidecar with bounded OAK/OaK ontology kernel."""

from miniforge_nlp_sidecar_v2 import app
from atlas_oak_kernel import router as oak_router

app.include_router(oak_router)

if __name__ == "__main__":
    import os
    import uvicorn

    # UVICORN_RELOAD=true enables live source reload for dev containers with
    # python/ bind-mounted (docker/miniforge-nlp-sidecar/docker-compose.yml).
    # Without --reload, uvicorn imports the app once at process start and never
    # re-reads edited source files -- a bind-mounted source change is invisible
    # until the container is manually restarted (found live 2026-09-03 while
    # smoke-testing openspec/changes/parent-atlas-search-classifier-sidecar's
    # new classify pass: the running container kept serving the pre-edit code
    # until `docker restart` was run by hand). Default stays off (false) so
    # production/CI behavior is unchanged -- reload mode has real overhead
    # (a filesystem watcher, a supervisor subprocess) that no deployed
    # environment should pay for silently.
    reload_enabled = os.getenv("UVICORN_RELOAD", "false").strip().lower() in ("1", "true", "yes")
    host = os.getenv("MINIFORGE_SIDECAR_HOST", "0.0.0.0")
    port = int(os.getenv("MINIFORGE_SIDECAR_PORT", "8095"))

    if reload_enabled:
        # reload=True requires an import-string target, not the app object
        # directly -- uvicorn's reloader spawns a fresh subprocess per reload
        # and re-imports the module from scratch.
        uvicorn.run(
            "miniforge_nlp_sidecar_oak:app",
            host=host,
            port=port,
            reload=True,
            reload_dirs=[os.path.dirname(os.path.abspath(__file__))],
        )
    else:
        uvicorn.run(app, host=host, port=port)
