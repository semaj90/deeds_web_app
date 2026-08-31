# Parent Atlas neural decoder (DECODER-CONTAINER-01) -- NestedSemanticAutoencoder
# numerical projection service. Not a text-generation service; Ornith/llama-server
# remain the synthesis owner. See:
# openspec/changes/parent-atlas-neural-prefill-encoder/tasks.md
#
# Pinned stable release image: PyTorch 2.13.0 / CUDA 13.2 / cuDNN 9. The
# host's torch 2.8.0+cu128 environment is a separate reference/fixture scope;
# it is not this service's dependency. This runtime image is intentionally
# small and uses ordinary PyTorch/ATen operators for the decoder. cuTile,
# CUDA SIMT, Triton, and RAPIDS remain separate challenger/provider scopes.
# Verified by building this exact digest and reading back the live service
# health/encode proof; pinned by digest so a tag repush cannot change it.
FROM pytorch/pytorch:2.13.0-cuda13.2-cudnn9-runtime@sha256:d0a2f5993da1a5646d77a95d4185d3d9fc79e95dcbc960daf245a18c7d6b6411

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

# This image's Python 3.12 is Debian's externally-managed system interpreter
# (PEP 668) -- --break-system-packages is required and safe here since this
# container has exactly one purpose and no other Python consumer to conflict
# with (found by a real build failure against this exact image, not assumed).
RUN python -m pip install --upgrade pip --break-system-packages \
  && python -m pip install --break-system-packages \
    fastapi \
    "uvicorn[standard]" \
    pydantic \
  && python -m pip check

# Only the self-contained autoencoder module is copied -- NOT the full
# atlas_compute package. Its real __init__.py eagerly imports cuGraph/cuVS
# (RAPIDS) modules this service never uses and this image does not carry.
# latent_autoencoder.py itself only imports numpy/torch/stdlib (verified: zero
# `from .` / `from atlas_compute` internal imports as of this Dockerfile).
# This empty __init__.py exists only inside the image; it does not replace
# python/atlas_compute/__init__.py in the repository.
RUN mkdir -p /app/python/atlas_compute \
  && touch /app/python/atlas_compute/__init__.py
COPY python/atlas_compute/latent_autoencoder.py /app/python/atlas_compute/latent_autoencoder.py
COPY python/atlas_neural_decoder_service.py /app/python/atlas_neural_decoder_service.py

EXPOSE 8121

CMD ["python", "/app/python/atlas_neural_decoder_service.py"]
