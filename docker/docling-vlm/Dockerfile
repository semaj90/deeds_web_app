# Docling + VLM Python Service
# Consolidates: docling-parse, ultralytics, whisper
FROM python:3.11-slim-bookworm AS base

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

# Copy application code
COPY app.py .
COPY docling_analyze.py .

# Copy model weights if needed (or mount as volume)
# COPY model/ /app/model/

# Set ownership
RUN chown -R appuser:appuser /app

USER appuser

# Expose FastAPI port
EXPOSE 8085

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:8085/health || exit 1

# Run with uvicorn
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8085", "--workers", "2"]
