# Evidence Processing Pipeline

FastAPI middleware for legal evidence document processing. Integrates OCR (Tesseract), document parsing (IBM Docling), and semantic analysis (Gemma3) to extract, structure, and embed evidence for RAG-based legal search.

## Architecture

```
SvelteKit Frontend
    ↓
FastAPI Upload Endpoint
    ↓
Document Classification
    ├→ OCR Pipeline (Tesseract)
    └→ Parsing Pipeline (Docling)
    ↓
Text Chunking
    ↓
Embedding Generation (Gemma3)
    ↓
Vector Indexing (Qdrant)
    ↓
Legal Entity Extraction (Gemma3)
    ↓
PostgreSQL + Qdrant + MinIO
```

## Setup

### Prerequisites

- Python 3.11+
- PostgreSQL 14+
- RabbitMQ 3.12+
- Redis 7+
- MinIO (S3-compatible)
- Qdrant 1.7+
- Ollama with Gemma3 model
- Tesseract OCR

### Installation

1. Clone the repository and navigate to this directory:
```bash
cd backend/evidence-pipeline
```

2. Create a virtual environment:
```bash
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
```

3. Install dependencies:
```bash
pip install -r requirements.txt
```

4. Copy environment file:
```bash
cp .env.example .env
```

5. Update `.env` with your configuration

### Running the Service

```bash
python -m uvicorn evidence_pipeline.main:app --host 0.0.0.0 --port 8001 --reload
```

Or using the main script:
```bash
python evidence_pipeline/main.py
```

## API Endpoints

### Health Check
```
GET /api/evidence/health
```

### Upload Document
```
POST /api/evidence/upload
Content-Type: multipart/form-data

file: <binary file>
case_id: <case_id>
```

Response:
```json
{
  "job_id": "uuid",
  "filename": "document.pdf",
  "status": "queued"
}
```

### Get Progress
```
GET /api/evidence/upload/{job_id}/progress
```

Response (Server-Sent Events):
```json
{
  "job_id": "uuid",
  "status": "processing",
  "stage": "embedding",
  "percentage": 75
}
```

## Configuration

See `.env.example` for all available configuration options.

Key settings:
- `DATABASE_URL`: PostgreSQL connection string
- `RABBITMQ_URL`: RabbitMQ connection string
- `QDRANT_URL`: Qdrant vector database URL
- `OLLAMA_BASE_URL`: Ollama inference server URL
- `MAX_FILE_SIZE_MB`: Maximum upload file size (default: 50MB)

## Development

### Running Tests

```bash
pytest
```

### Running with Coverage

```bash
pytest --cov=evidence_pipeline
```

### Code Quality

```bash
# Format code
black evidence_pipeline

# Lint code
ruff check evidence_pipeline

# Type checking
mypy evidence_pipeline
```

## Deployment

See `Dockerfile.evidence-pipeline` for containerized deployment.

```bash
docker build -f Dockerfile.evidence-pipeline -t evidence-pipeline:latest .
docker run -p 8001:8001 --env-file .env evidence-pipeline:latest
```

## Monitoring

Health check endpoint: `GET /api/evidence/health`

Prometheus metrics: `GET /api/evidence/metrics`

## Troubleshooting

### RabbitMQ Connection Failed
- Ensure RabbitMQ is running and accessible at `RABBITMQ_URL`
- Check credentials in `.env`

### Tesseract Not Found
- Install Tesseract OCR: `apt-get install tesseract-ocr` (Linux) or `brew install tesseract` (macOS)
- Update `TESSERACT_PATH` in `.env` if installed in non-standard location

### Ollama Connection Failed
- Ensure Ollama is running at `OLLAMA_BASE_URL`
- Verify Gemma3 model is available: `ollama list`

## License

MIT
