# CPU orchestration image. LangGraph calls the external embedding service and
# llama-server; it does not own CUDA, PyTorch, cuVS, cuTile, or TensorRT-RTX.
# GPU execution remains in the dedicated provider sidecars.
FROM python:3.12-slim-bookworm@sha256:392307d22300de8b5986851a12d9176dfc0fc073e65bf6523ebd7dcbeb23564e

# ── System deps (use system Python 3.12 — no deadsnakes PPA) ─────────────────
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl git libpq-dev libgomp1 python3-pip python3-dev && \
    rm -rf /var/lib/apt/lists/*

# ── Remove system cryptography + PyJWT (conflict with pip versions) ───────────
# Ubuntu 24.04 ships cryptography 41.x with Rust pyo3 bindings that panic when
# pip-installed PyJWT 2.x tries to import them. Remove both, let pip install clean.
RUN apt-get update && apt-get remove -y python3-jwt python3-cryptography 2>/dev/null; \
    rm -rf /usr/lib/python3/dist-packages/jwt* \
           /usr/lib/python3/dist-packages/PyJWT* \
           /usr/lib/python3/dist-packages/cryptography* && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# ── Layer 1: cryptography + PyJWT + ripgrep ───────────────────────────────────
RUN pip install --break-system-packages cryptography PyJWT
RUN apt-get update && apt-get install -y --no-install-recommends ripgrep && \
    rm -rf /var/lib/apt/lists/*

# ── Layer 2: orchestration dependencies (no CUDA/PyTorch index) ───────────────
COPY requirements.txt .
RUN pip install --no-cache-dir --break-system-packages \
    -r requirements.txt

# ── App ───────────────────────────────────────────────────────────────────────
COPY app.py .

EXPOSE 8091

HEALTHCHECK --interval=30s --timeout=10s --retries=3 \
  CMD curl -f http://localhost:8091/health || exit 1

CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8091", "--workers", "1"]
