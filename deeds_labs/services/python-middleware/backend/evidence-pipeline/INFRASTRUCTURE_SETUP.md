# Infrastructure Setup Guide

This document describes the infrastructure components initialized for the Evidence Processing Pipeline.

## Components Initialized

### 1. FastAPI Application (Task 0.1)
- ✅ Project structure with `pyproject.toml` and `requirements.txt`
- ✅ Main FastAPI application with startup/shutdown hooks
- ✅ Configuration management with Pydantic Settings
- ✅ Structured logging with structlog

### 2. RabbitMQ Connection Pool (Task 0.2)
- ✅ Async connection management in `queue/connection.py`
- ✅ Health check endpoint for RabbitMQ
- ✅ Queue initialization in `queue/rabbitmq.py`
- ✅ Job dispatch functions for all pipeline stages:
  - Classification queue
  - OCR queue
  - Parsing queue
  - Chunking queue
  - Embedding queue
  - Indexing queue
  - Analysis queue
  - Dead-letter queue (DLQ)

### 3. PostgreSQL Schema (Task 0.3)
- ✅ Database initialization with async SQLAlchemy
- ✅ Migration file: `migrations/001_initial_schema.sql`
- ✅ Tables created:
  - `evidence_documents` - Document metadata
  - `evidence_chunks` - Text chunks with embeddings
  - `evidence_processing_jobs` - Job tracking
  - `evidence_entities` - Extracted legal entities
- ✅ Indexes on all key columns for performance

### 4. MinIO Storage (Task 0.4)
- ✅ MinIO client in `storage/minio_client.py`
- ✅ Bucket initialization:
  - `evidence-documents` - Raw uploads
  - `evidence-processed` - OCR/parsed output
- ✅ Functions:
  - Upload files
  - Download files
  - Delete files
  - List files
  - Generate presigned URLs

### 5. Qdrant Vector Database (Task 0.5)
- ✅ Qdrant client in `vector/qdrant_client.py`
- ✅ Collection initialization:
  - Collection: `evidence-embeddings`
  - Vector size: 384 (Gemma3)
  - Distance metric: Cosine
- ✅ Functions:
  - Index embeddings
  - Search embeddings
  - Delete embeddings
  - Health check

## Database Setup

### Running Migrations

```bash
python setup_db.py
```

This script will:
1. Connect to PostgreSQL
2. Run all migrations from `migrations/` directory
3. Initialize RabbitMQ queues
4. Initialize MinIO buckets
5. Initialize Qdrant collection

### Manual Migration

```bash
psql $DATABASE_URL < migrations/001_initial_schema.sql
```

## Docker Deployment

### Build Image

```bash
docker build -f Dockerfile -t evidence-pipeline:latest .
```

### Run with Docker Compose

```bash
docker-compose up -d
```

This will start:
- Evidence Pipeline (port 8001)
- PostgreSQL (port 5432)
- RabbitMQ (ports 5672, 15672)
- Redis (port 6379)
- MinIO (ports 9000, 9001)
- Qdrant (port 6333)
- Ollama (port 11434)

## Environment Variables

See `.env.example` for all available configuration options.

Key variables:
- `DATABASE_URL` - PostgreSQL connection string
- `RABBITMQ_URL` - RabbitMQ connection string
- `MINIO_URL` - MinIO S3 endpoint
- `QDRANT_URL` - Qdrant vector database URL
- `OLLAMA_BASE_URL` - Ollama inference server URL

## Health Checks

### Service Health

```bash
curl http://localhost:8001/api/evidence/health
```

Response:
```json
{
  "status": "healthy",
  "services": {
    "rabbitmq": {
      "status": "healthy",
      "service": "rabbitmq"
    },
    "qdrant": {
      "status": "healthy",
      "service": "qdrant",
      "collection": "evidence-embeddings",
      "points_count": 0
    }
  }
}
```

## Next Steps

After infrastructure setup is complete:

1. **Task 1**: Document Classification & Validation
2. **Task 2**: OCR Pipeline (Tesseract)
3. **Task 3**: Document Parsing (IBM Docling)
4. **Task 4**: Text Chunking & Semantic Segmentation
5. **Task 5**: Embedding Generation (Gemma3)
6. **Task 6**: Vector Indexing (Qdrant)
7. **Task 7**: Real-Time Progress Monitoring (SSE)
8. **Task 8**: Legal Entity Extraction (Gemma3 Analysis)
9. **Task 9**: Error Handling & Resilience
10. **Task 10**: Integration with SvelteKit Frontend

## Troubleshooting

### PostgreSQL Connection Failed
- Ensure PostgreSQL is running and accessible
- Check `DATABASE_URL` in `.env`
- Verify credentials

### RabbitMQ Connection Failed
- Ensure RabbitMQ is running
- Check `RABBITMQ_URL` in `.env`
- Verify credentials (default: guest/guest)

### MinIO Connection Failed
- Ensure MinIO is running
- Check `MINIO_URL` in `.env`
- Verify credentials (default: minioadmin/minioadmin)

### Qdrant Connection Failed
- Ensure Qdrant is running
- Check `QDRANT_URL` in `.env`
- Verify collection exists

## Performance Considerations

- PostgreSQL indexes are created on all key columns
- RabbitMQ queues are durable and persistent
- MinIO buckets have lifecycle policies for cleanup
- Qdrant uses cosine distance for semantic similarity
- Connection pools are configured for optimal throughput

## Security Notes

- Change default credentials in production
- Use environment variables for sensitive data
- Enable SSL/TLS for all connections
- Restrict network access to services
- Use VPC/private networks for inter-service communication
