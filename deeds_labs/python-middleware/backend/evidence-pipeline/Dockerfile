FROM python:3.11-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    tesseract-ocr \
    libtesseract-dev \
    libpq-dev \
    gcc \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements
COPY requirements.txt .

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY evidence_pipeline/ ./evidence_pipeline/
COPY migrations/ ./migrations/
COPY setup_db.py .

# Expose port
EXPOSE 8001

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD python -c "import httpx; httpx.get('http://localhost:8001/api/evidence/health')"

# Run application
CMD ["python", "-m", "uvicorn", "evidence_pipeline.main:app", "--host", "0.0.0.0", "--port", "8001"]
