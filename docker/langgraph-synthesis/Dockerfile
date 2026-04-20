FROM nvidia/cuda:12.8.1-cudnn-devel-ubuntu24.04

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

# ── Layer 1: PyTorch CUDA wheels (~10 GB, cached unless version changes) ──────
# Split from requirements.txt so changing langchain/fastapi versions
# doesn't trigger a 10 GB re-download of torch.
# Uses --index-url (not --extra) to avoid probing pypi.nvidia.com which times out.
RUN pip install --break-system-packages --timeout 300 \
    --index-url https://download.pytorch.org/whl/cu128 \
    torch==2.7.0+cu128 \
    torchvision==0.22.0+cu128 \
    torchaudio==2.7.0+cu128

# ── Layer 2: cryptography + PyJWT + ripgrep (replaces removed system packages) ─
RUN pip install --break-system-packages cryptography PyJWT
RUN apt-get update && apt-get install -y --no-install-recommends ripgrep && \
    rm -rf /var/lib/apt/lists/*

# ── Layer 3: Everything else (busts cache on requirements.txt change) ─────────
COPY requirements.txt .
RUN pip install --no-cache-dir --break-system-packages \
    --extra-index-url https://download.pytorch.org/whl/cu128 \
    -r requirements.txt

# ── App ───────────────────────────────────────────────────────────────────────
COPY app.py .

EXPOSE 8091

HEALTHCHECK --interval=30s --timeout=10s --retries=3 \
  CMD curl -f http://localhost:8091/health || exit 1

CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8091", "--workers", "1"]