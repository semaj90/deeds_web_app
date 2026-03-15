# Optimized LangExtract Service
# Memory: ~200-300MB (down from 1GB)
# Changes:
#   - Python slim (not full)
#   - spacy en_core_web_md (40MB) instead of en_core_web_trf (500MB)
#   - Removed transformers/BERT (uses Ollama instead)
#   - Removed EasyOCR (uses tesseract.js on client)
#   - Multi-stage build to reduce image size

FROM python:3.11-slim AS builder

WORKDIR /build

# Install build dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Install Python packages
COPY requirements.txt .
RUN pip install --no-cache-dir --user -r requirements.txt

# Download spaCy model during build
RUN python -m spacy download en_core_web_md

# --- Runtime stage ---
FROM python:3.11-slim

LABEL maintainer="deeds-web-app"
LABEL description="Optimized LangExtract - memory-efficient legal document extraction"
LABEL version="2.0.0"

WORKDIR /app

# Copy Python packages from builder
COPY --from=builder /root/.local /root/.local
COPY --from=builder /root/.cache/pip /root/.cache/pip

# Copy spaCy model data
RUN mkdir -p /root/.local/lib/python3.11/site-packages/en_core_web_md
COPY --from=builder /root/.local/lib/python3.11/site-packages/en_core_web_md* /root/.local/lib/python3.11/site-packages/

# Ensure pip packages are on PATH
ENV PATH=/root/.local/bin:$PATH
ENV PYTHONUNBUFFERED=1
ENV PYTHONDONTWRITEBYTECODE=1

# Configuration
ENV OLLAMA_URL=http://host.docker.internal:11434
ENV SPACY_MODEL=en_core_web_md
ENV ENABLE_SPACY=true

# Copy application
COPY langextract_service.py .

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
    CMD python -c "import httpx; r = httpx.get('http://localhost:8095/health', timeout=5); exit(0 if r.status_code == 200 else 1)"

EXPOSE 8095

# Run with 2 workers
CMD ["uvicorn", "langextract_service:app", "--host", "0.0.0.0", "--port", "8095", "--workers", "2"]
