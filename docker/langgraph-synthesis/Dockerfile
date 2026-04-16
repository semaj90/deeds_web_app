FROM nvidia/cuda:12.8.1-cudnn-devel-ubuntu24.04

# ── System deps + Python 3.13 (deadsnakes PPA) ────────────────────────────────
RUN apt-get update && apt-get install -y --no-install-recommends \
    software-properties-common curl git libpq-dev libgomp1 && \
    add-apt-repository ppa:deadsnakes/ppa && \
    apt-get update && apt-get install -y --no-install-recommends \
    python3.13 python3.13-dev python3.13-venv && \
    rm -rf /var/lib/apt/lists/*

RUN curl -sS https://bootstrap.pypa.io/get-pip.py | python3.13

RUN ln -sf /usr/bin/python3.13 /usr/bin/python3 && \
    ln -sf /usr/bin/python3.13 /usr/bin/python

WORKDIR /app

# ── Python deps (cached layer) ────────────────────────────────────────────────
COPY requirements.txt .
RUN pip install --no-cache-dir \
    --extra-index-url https://download.pytorch.org/whl/cu128 \
    --extra-index-url https://pypi.nvidia.com \
    -r requirements.txt

# ── App ───────────────────────────────────────────────────────────────────────
COPY app.py .

EXPOSE 8091

HEALTHCHECK --interval=30s --timeout=10s --retries=3 \
  CMD curl -f http://localhost:8091/health || exit 1

CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8091", "--workers", "1"]
