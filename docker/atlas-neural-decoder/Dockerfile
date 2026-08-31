# Parent Atlas neural decoder (DECODER-CONTAINER-01) -- NestedSemanticAutoencoder
# numerical projection service. Not a text-generation service; Ornith/llama-server
# remain the synthesis owner. See:
# openspec/changes/parent-atlas-neural-prefill-encoder/tasks.md
#
# Pinned to PyTorch 2.13.0 / CUDA 13.2. NOT the earlier torch 2.8.0+cu128
# seen in this repo's live host-process proof -- that combo is deprecated
# and removed from PyTorch's own build matrix as of PyTorch 2.12 CI
# (week of 2026-04-06, see
# https://dev-discuss.pytorch.org/t/introducing-cuda-13-2-and-deprecating-cuda-12-8-release-2-12/3337).
#
# CUDA 13.2 vs 13.0: per PyTorch's own dev-discuss announcement, 13.0 is the
# "stable" tier for PyTorch's *pip wheel* distribution and 13.2 is still
# experimental there (nightly-only wheels). But this Docker Hub image is a
# prebuilt release-version image the pytorch/pytorch maintainers publish
# independently of the pip wheel channel, and this service has no
# cuTile/Triton/custom-kernel code path (verified: only imports numpy/torch/
# torch.nn/torch.nn.functional, plain nn.Linear layers through cuBLAS/cuDNN)
# -- so the CUDA 13.0-vs-13.2 choice is not load-bearing for correctness here
# either way. Chose 13.2 for forward-compat: it's the CUDA toolkit version
# where cuTile went stable on Ampere/compute-capability-8.x (this host's RTX
# 3060 Ti is 8.6), in case a future custom-kernel pass is added to this
# service. Verified this specific image tag builds and the service starts
# and answers /health correctly under it before committing to it (see
# tasks.md DECODER-CONTAINER-01 entry) -- not assumed from the tag name
# alone. Pinned by digest, not just tag, so a tag repush can't silently
# change what gets built.
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
