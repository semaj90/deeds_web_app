# Parent Atlas AtlasGemmaRank reranker service (GEMMA-RANK-FASTAPI-01) -- serves the standalone
# AtlasGemmaRankV1 scoring model directly via PyTorch, sidestepping the ONNX export parity bug
# recorded in openspec/changes/parent-atlas-best-fit-score-fabric/tasks.md (ONNX-EXPORT-01).
# NOT a text-generation service; Ornith/llama-server remain the synthesis owner. See:
# openspec/changes/parent-atlas-best-fit-score-fabric/tasks.md (GEMMA-RANK-FASTAPI-01)
#
# UNBUILT as of 2026-09-06 -- Docker Desktop was not running on the dev host when this file was
# written, so `docker build` has NOT been run against it. Do not treat this as a proven image
# until it has actually been built and its /health + /v1/gemma-rank/score endpoints verified live
# from inside a real container, same evidentiary bar as every other service in this repo.
#
# Reuses the exact same pinned base image as the sibling neural-decoder service
# (docker/atlas-neural-decoder/Dockerfile) rather than introducing a second pinned PyTorch/CUDA
# image identity for no reason -- see that file's own comment for why this specific digest was
# chosen. This service is heavier than the decoder's (needs transformers + safetensors on top of
# plain PyTorch), which is the one real new dependency surface this file adds.
FROM pytorch/pytorch:2.13.0-cuda13.2-cudnn9-runtime@sha256:d0a2f5993da1a5646d77a95d4185d3d9fc79e95dcbc960daf245a18c7d6b6411

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

# Same PEP 668 externally-managed-environment note as the sibling neural-decoder Dockerfile:
# --break-system-packages is required and safe here, single-purpose container.
RUN python -m pip install --upgrade pip --break-system-packages \
  && python -m pip install --break-system-packages \
    fastapi \
    "uvicorn[standard]" \
    pydantic \
    transformers \
    safetensors \
    tokenizers \
  && python -m pip check

# Only the service file is copied. It does not import atlas_compute (that package is the
# neural-decoder's dependency, not this service's) -- confirmed by reading
# atlas_gemma_rank_service.py's own imports before writing this COPY line.
COPY python/atlas_gemma_rank_service.py /app/python/atlas_gemma_rank_service.py

EXPOSE 8122

CMD ["python", "/app/python/atlas_gemma_rank_service.py"]
