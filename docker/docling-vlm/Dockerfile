# Docling + VLM Python Service
# Consolidates: docling-parse, ultralytics, whisper
# VLM inference is NOT hosted in this container. It calls the workstation
# Ornith 1.5 llama.cpp server on :8090 through app_ornith.py.
FROM python:3.11-slim-bookworm@sha256:528257d48c1da0dcecc2e725d1ae34498d60c965f1241e39cd6a85a8859bdf84 AS base

# Install system dependencies for OpenCV, YOLO, and audio processing
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1 \
    libglib2.0-0 \
    libsm6 \
    libxext6 \
    libxrender1 \
    libgomp1 \
    ffmpeg \
    git \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Create non-root user
RUN useradd -m -u 1000 appuser

WORKDIR /app

# Copy requirements first (better layer caching)
COPY requirements.txt .

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code. app.py is retained for the document/YOLO/Whisper
# implementation; app_ornith.py replaces its historical Ollama VLM globals
# before exposing FastAPI.
COPY app.py .
COPY app_ornith.py .
COPY ornith_vlm_client.py .
COPY docling_analyze.py .

# Copy model weights if needed (or mount as volume)
# COPY model/ /app/model/

# Set ownership
RUN chown -R appuser:appuser /app

USER appuser

# Expose FastAPI port
EXPOSE 8085

# Health check requires the Docling service AND its upstream Ornith VLM
# authority to be healthy. app_ornith.py verifies :8090 /props reports
# model_alias=ornith-1.5-* and modalities.vision=true.
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:8085/health || exit 1

# Run the Ornith-owned wrapper, not the legacy Ollama/Gemma4 entrypoint.
CMD ["uvicorn", "app_ornith:app", "--host", "0.0.0.0", "--port", "8085", "--workers", "2"]
