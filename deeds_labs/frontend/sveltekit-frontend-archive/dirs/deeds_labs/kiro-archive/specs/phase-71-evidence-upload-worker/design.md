# Phase 71: Evidence Upload + Worker Trigger - Design

## Overview

Phase 71 implements the Evidence Upload system with automatic worker pipeline triggering. Users upload documents to MinIO, which triggers the worker pipeline (OCR → Chunking → Embedding → Indexing) with real-time progress tracking.

**Key Components**:
- Backend upload service (Python FastAPI)
- Frontend upload UI (SvelteKit)
- RabbitMQ task publishing
- Real-time progress streaming (SSE)
- Webhook notifications

**Performance Targets**:
- Upload: <5s for <50MB
- Worker trigger: <1s
- OCR: <30s per page
- Chunking: <5s
- Total pipeline: <2 minutes

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Frontend (SvelteKit)                      │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │ Upload Page  │  │ Progress Bar │  │ Upload History   │  │
│  └──────────────┘  └──────────────┘  └──────────────────┘  │
│         │                 │                    │             │
├─────────┼─────────────────┼────────────────────┼─────────────┤
│         │                 │                    │             │
│  ┌──────▼──────┐  ┌──────▼──────┐  ┌─────────▼────────┐    │
│  │ Upload Svc  │  │ Progress Svc│  │ History Svc      │    │
│  │ (HTTP)      │  │ (SSE)       │  │ (HTTP)           │    │
│  └─────────────┘  └─────────────┘  └──────────────────┘    │
│         │                 │                    │             │
├─────────┼─────────────────┼────────────────────┼─────────────┤
│         │                 │                    │             │
│  ┌──────▼──────┐  ┌──────▼──────┐  ┌─────────▼────────┐    │
│  │ MinIO       │  │ RabbitMQ    │  │ Postgres        │    │
│  │ (storage)   │  │ (tasks)     │  │ (status)        │    │
│  └─────────────┘  └─────────────┘  └──────────────────┘    │
│         │                 │                    │             │
│  ┌──────▼──────────────────▼────────────────────▼────────┐  │
│  │ Worker Pipeline (Phase 3D)                           │  │
│  │ OCR → Chunking → Embedding → Indexing               │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

## Components and Interfaces

### 1. Upload Service (`backend/upload_service.py`)

**Responsibilities**:
- File validation
- MinIO upload
- RabbitMQ task publishing
- Processing status tracking

**Key Methods**:
```python
class UploadService:
    async def upload_file(file: UploadFile, case_id: str) -> UploadResult
    async def publish_task(doc_id: str, file_path: str) -> str
    async def get_upload_status(doc_id: str) -> ProcessingStatus
    async def get_upload_history(case_id: str) -> List[Upload]
```

### 2. Progress Tracker (`backend/progress_tracker.py`)

**Responsibilities**:
- Track processing progress
- Emit SSE events
- Store status in Postgres
- Handle webhooks

**Key Methods**:
```python
class ProgressTracker:
    async def track_progress(doc_id: str, status: str, progress: int)
    async def emit_event(doc_id: str, event: ProgressEvent)
    async def call_webhook(doc_id: str, status: str)
```

### 3. Upload API Endpoints

**POST /api/upload/file**
```json
Request: multipart/form-data (file, case_id)
Response: {
  "doc_id": "doc_123",
  "status": "uploading",
  "progress_url": "/api/upload/progress/doc_123"
}
```

**GET /api/upload/progress/{doc_id}** (SSE)
```
event: progress
data: {"status": "uploading", "progress": 50}

event: processing
data: {"status": "ocr", "progress": 25}

event: complete
data: {"status": "complete", "chunks": 100}
```

**GET /api/upload/history/{case_id}**
```json
Response: {
  "uploads": [
    {
      "doc_id": "doc_123",
      "filename": "evidence.pdf",
      "status": "complete",
      "chunks": 100,
      "uploaded_at": "2024-01-01T12:00:00Z"
    }
  ]
}
```

### 4. Frontend Upload UI

**Components**:
- Upload form with drag-and-drop
- Progress bar with percentage
- Status display (pending/processing/complete)
- Upload history list
- Error messages

**State Management**:
- Upload file
- Upload progress
- Processing status
- Upload history
- Error state

## Data Models

### Upload
```python
@dataclass
class Upload:
    doc_id: str
    case_id: str
    filename: str
    file_size: int
    file_path: str
    status: str  # pending, uploading, processing, complete, error
    progress: int  # 0-100
    chunks: int
    error_message: Optional[str]
    uploaded_at: datetime
    completed_at: Optional[datetime]
```

### ProcessingStatus
```python
@dataclass
class ProcessingStatus:
    doc_id: str
    status: str  # uploading, ocr, chunking, embedding, indexing, complete
    progress: int  # 0-100
    current_page: int
    total_pages: int
    chunks_created: int
    error: Optional[str]
```

## Error Handling

**Upload Errors**:
- Invalid file type → "Unsupported file type"
- File too large → "File too large (max 100MB)"
- Upload failed → "Upload failed, please retry"
- MinIO unavailable → "Storage service unavailable"

**Processing Errors**:
- Worker unavailable → "Processing service unavailable"
- OCR failed → "OCR processing failed"
- Chunking failed → "Document chunking failed"
- Embedding failed → "Embedding generation failed"

**Retry Logic**:
- Upload: 3 retries with exponential backoff
- Worker task: 5 retries with exponential backoff
- Webhook: 3 retries with exponential backoff

## Testing Strategy

### Unit Tests
- File validation
- MinIO upload
- RabbitMQ publishing
- Status tracking
- Webhook calling

### Integration Tests
- End-to-end upload (file → MinIO → RabbitMQ)
- Progress tracking
- Worker pipeline integration
- Webhook notifications

### Performance Tests
- Upload latency (<5s for <50MB)
- Worker trigger latency (<1s)
- Progress streaming latency (<100ms)
- Concurrent uploads (10+ simultaneous)

### UI Tests
- File selection and drag-and-drop
- Progress bar display
- Status updates
- Error messages
- Upload history

## Performance Optimization

**Upload Optimization**:
- Multipart upload for large files
- Connection pooling (MinIO, RabbitMQ)
- Async file processing
- Batch status updates

**Progress Optimization**:
- SSE with buffering
- Debounced progress updates
- Lazy loading of history

**Worker Optimization**:
- Task batching
- Priority queuing
- Worker pool scaling

## Deployment Considerations

**Environment Variables**:
- `MINIO_ENDPOINT`: MinIO endpoint
- `RABBITMQ_URL`: RabbitMQ connection
- `POSTGRES_URL`: Postgres connection
- `WEBHOOK_URL`: Webhook endpoint (optional)
- `MAX_FILE_SIZE`: Max upload size (default: 100MB)

**Dependencies**:
- FastAPI, Pydantic, asyncpg
- MinIO client
- RabbitMQ client (pika)
- SvelteKit, TypeScript

**Scaling**:
- Horizontal scaling: Multiple upload service instances
- Load balancing: Round-robin across instances
- Database sharing: Centralized Postgres
- Message queue sharing: Centralized RabbitMQ

---

## Summary

Phase 71 implements a complete Evidence Upload system with automatic worker pipeline triggering, real-time progress tracking, and webhook notifications. The design prioritizes performance (<5s upload, <1s worker trigger) and user experience (intuitive upload, real-time progress).
