# EmbeddingGemma2 ONNX CPU embedding server (EXPERIMENT challenger, :8094).
# Canonical source: scripts/atlas/gemma2-onnx-embed-server-v1.py (copied here at build).
# Build context is the repo root (see docker-compose.yml). CPU only; model is mounted
# read-only from ./models, never baked into the image.
FROM python:3.13-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

RUN python -m pip install \
    "fastapi==0.104.1" \
    "uvicorn==0.24.0" \
    "pydantic==2.11.7" \
    "onnxruntime==1.27.0" \
    "tokenizers==0.22.2" \
    "numpy==2.2.6" \
  && python -m pip check

COPY scripts/atlas/gemma2-onnx-embed-server-v1.py /app/gemma2_onnx_embed_server.py

ENV GEMMA2_ONNX_DIR=/models/embeddinggemma2/onnx-q8 \
    PORT=8094 \
    ORT_INTRA_THREADS=8

EXPOSE 8094

HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8094/health',timeout=4).status==200 else 1)"

CMD ["python", "/app/gemma2_onnx_embed_server.py"]
