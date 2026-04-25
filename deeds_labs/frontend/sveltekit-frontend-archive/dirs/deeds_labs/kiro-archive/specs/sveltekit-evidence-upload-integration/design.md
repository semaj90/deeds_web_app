# Design Document: SvelteKit Evidence Upload Integration

## Overview

This document provides the technical design for integrating evidence upload functionality into the SvelteKit legal AI application. The design bridges the frontend UI with backend services (MinIO, RabbitMQ, PostgreSQL, Granite-Docling worker) to create a seamless evidence ingestion and processing workflow.

---

## Architecture

### High-Level Flow

```
┌─────────────────────────────────────────────────────────────┐
│                    SvelteKit Frontend                        │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  Evidence Upload UI                                  │   │
│  │  ├─ Case Page: /cases/[id]/evidence/upload          │   │
│  │  ├─ Homepage Modal: Case Selection/Creation         │   │
│  │  └─ Login Modal: Authentication                     │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│                    API Layer (SvelteKit)                     │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  POST /api/cases/[id]/evidence/upload               │   │
│  │  ├─ Generate MinIO presigned URL                    │   │
│  │  ├─ Create evidence_files record                    │   │
│  │  └─ Return upload URL + evidenceId                  │   │
│  │                                                      │   │
│  │  POST /api/evidence/[id]/complete                   │   │
│  │  ├─ Verify upload completion                        │   │
│  │  ├─ Dispatch RabbitMQ job                           │   │
│  │  └─ Return processing status                        │   │
│  │                                                      │   │
│  │  GET /api/evidence/[id]/stream (SSE)                │   │
│  │  └─ Stream processing events                        │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│                    Storage & Queue                           │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  MinIO: lawpdfs/cases/<caseId>/<filename>           │   │
│  │  RabbitMQ: document.process queue                   │   │
│  │  PostgreSQL: evidence_files, evidence_chunks        │   │
│  │  Redis: Upload state, session cache                 │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│              Granite-Docling Worker (Python)                │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  1. Fetch from MinIO                                │   │
│  │  2. Page Classification                             │   │
│  │  3. GPU/CPU Pipeline                                │   │
│  │  4. OCR + Structure Extraction                       │   │
│  │  5. Emit Status Events (SSE)                         │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│                    RAG Pipeline                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  1. LangExtract Chunking                             │   │
│  │  2. BM25 Indexing                                    │   │
│  │  3. Embedding Generation (LegalBERT)                │   │
│  │  4. PostgreSQL Storage (pgvector)                    │   │
│  │  5. RAG Ranking (R2 + R3)                            │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│                    Legal Dashboard                           │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  Real-time Progress Monitoring (SSE)                │   │
│  │  ├─ Processing Stage                                │   │
│  │  ├─ Progress Percentage                             │   │
│  │  ├─ GPU/CPU Metrics                                 │   │
│  │  └─ Document Thumbnails                             │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

---

## Components & Interfaces

### Frontend Components

#### 1. EvidenceUploadButton.svelte
**Purpose**: Trigger evidence upload from case page or homepage

**Props**:
```typescript
interface EvidenceUploadButtonProps {
  caseId?: string;           // If provided, upload directly to case
  onUploadStart?: () => void;
  onUploadComplete?: (evidenceId: string) => void;
  onError?: (error: Error) => void;
}
```

**Behavior**:
- If `caseId` provided: Open upload modal directly
- If no `caseId`: Open case selection modal first
- Handle authentication (redirect to login if needed)

#### 2. CaseSelectModal.svelte
**Purpose**: Allow user to select or create case before upload

**Props**:
```typescript
interface CaseSelectModalProps {
  onCaseSelected: (caseId: string) => void;
  onCaseCreated: (caseId: string) => void;
  onCancel: () => void;
}
```

**Features**:
- Search bar for case lookup
- Recent cases list (last 5)
- "Create New Case" button
- Case creation form (name, type)

#### 3. EvidenceUploadModal.svelte
**Purpose**: Main upload interface with progress tracking

**Props**:
```typescript
interface EvidenceUploadModalProps {
  caseId: string;
  onUploadComplete: (evidenceId: string) => void;
  onError: (error: Error) => void;
}
```

**Features**:
- File selection (drag & drop + click)
- File validation (type, size)
- Upload progress bar
- Real-time status updates (SSE)
- Cancel button
- Retry on failure

#### 4. UploadProgressCard.svelte
**Purpose**: Display real-time processing progress

**Props**:
```typescript
interface UploadProgressCardProps {
  evidenceId: string;
  stage: string;
  percentage: number;
  eta: number;
  metrics?: {
    gpuUtilization: number;
    cpuUtilization: number;
    memoryUsage: number;
  };
}
```

**Features**:
- Stage indicator (upload, classification, processing, chunking, embedding, indexing)
- Progress percentage
- ETA countdown
- Metrics display
- Error display with retry option

### Backend API Endpoints

#### 1. POST /api/cases/[id]/evidence/upload
**Purpose**: Initiate evidence upload and get presigned URL

**Request**:
```typescript
interface UploadInitRequest {
  filename: string;
  fileSize: number;
  fileType: string;
  caseId: string;
}
```

**Response**:
```typescript
interface UploadInitResponse {
  evidenceId: string;
  presignedUrl: string;
  uploadId: string;
  expiresIn: number;
  minioPath: string;
}
```

**Logic**:
1. Verify user has access to case
2. Validate file type and size
3. Create evidence_files record (status: pending)
4. Generate MinIO presigned URL (15 min expiry)
5. Return upload details

#### 2. POST /api/evidence/[id]/complete
**Purpose**: Finalize upload and dispatch processing job

**Request**:
```typescript
interface UploadCompleteRequest {
  evidenceId: string;
  uploadId: string;
  fileSize: number;
  checksum: string;
}
```

**Response**:
```typescript
interface UploadCompleteResponse {
  evidenceId: string;
  status: 'processing' | 'queued' | 'error';
  jobId: string;
  message: string;
}
```

**Logic**:
1. Verify upload completion in MinIO
2. Verify file checksum
3. Update evidence_files record (status: processing)
4. Create RabbitMQ job with metadata
5. Return processing status

#### 3. GET /api/evidence/[id]/stream (SSE)
**Purpose**: Stream real-time processing events

**Response** (Server-Sent Events):
```typescript
interface ProcessingEvent {
  type: 'stage_change' | 'progress' | 'metrics' | 'error' | 'complete';
  stage: string;
  percentage: number;
  eta: number;
  details: string;
  metrics?: {
    gpuUtilization: number;
    cpuUtilization: number;
    memoryUsage: number;
    processingTime: number;
  };
  error?: {
    code: string;
    message: string;
    retryable: boolean;
  };
}
```

**Logic**:
1. Establish SSE connection
2. Subscribe to RabbitMQ events for evidenceId
3. Stream events as they arrive
4. Close connection on completion or error

#### 4. POST /api/cases (Create Case)
**Purpose**: Create new case from upload modal

**Request**:
```typescript
interface CreateCaseRequest {
  name: string;
  type: 'Criminal' | 'Civil' | 'Appeal' | 'Traffic' | 'Other';
  description?: string;
}
```

**Response**:
```typescript
interface CreateCaseResponse {
  caseId: string;
  name: string;
  createdAt: string;
}
```

### Database Schema

#### evidence_files Table
```sql
CREATE TABLE evidence_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID NOT NULL REFERENCES cases(id),
  filename VARCHAR(255) NOT NULL,
  file_size BIGINT NOT NULL,
  file_type VARCHAR(50) NOT NULL,
  minio_path VARCHAR(500) NOT NULL,
  uploaded_by UUID NOT NULL REFERENCES users(id),
  uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  processing_status VARCHAR(50) DEFAULT 'pending',
  processing_error TEXT,
  processing_started_at TIMESTAMP,
  processing_completed_at TIMESTAMP,
  chunk_count INTEGER,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_evidence_files_case_id ON evidence_files(case_id);
CREATE INDEX idx_evidence_files_status ON evidence_files(processing_status);
CREATE INDEX idx_evidence_files_uploaded_by ON evidence_files(uploaded_by);
```

#### evidence_chunks Table
```sql
CREATE TABLE evidence_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  evidence_id UUID NOT NULL REFERENCES evidence_files(id),
  chunk_index INTEGER NOT NULL,
  content TEXT NOT NULL,
  page_number INTEGER,
  section_title VARCHAR(255),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_evidence_chunks_evidence_id ON evidence_chunks(evidence_id);
CREATE INDEX idx_evidence_chunks_page_number ON evidence_chunks(page_number);
```

#### evidence_embeddings Table
```sql
CREATE TABLE evidence_embeddings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chunk_id UUID NOT NULL REFERENCES evidence_chunks(id),
  embedding vector(768),
  embedding_model VARCHAR(100) DEFAULT 'legal-bert',
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_evidence_embeddings_chunk_id ON evidence_embeddings(chunk_id);
CREATE INDEX idx_evidence_embeddings_embedding_hnsw ON evidence_embeddings USING hnsw (embedding vector_cosine_ops);
```

### Service Layer

#### uploadEvidenceService.ts
**Purpose**: Handle evidence upload orchestration

**Methods**:
```typescript
class UploadEvidenceService {
  // Initiate upload
  async initiateUpload(
    caseId: string,
    filename: string,
    fileSize: number,
    fileType: string,
    userId: string
  ): Promise<UploadInitResponse>

  // Complete upload and dispatch job
  async completeUpload(
    evidenceId: string,
    uploadId: string,
    fileSize: number,
    checksum: string
  ): Promise<UploadCompleteResponse>

  // Get upload status
  async getUploadStatus(evidenceId: string): Promise<UploadStatus>

  // Stream processing events
  async streamProcessingEvents(
    evidenceId: string,
    response: Response
  ): Promise<void>

  // Retry failed upload
  async retryUpload(evidenceId: string): Promise<UploadCompleteResponse>
}
```

#### minioService.ts
**Purpose**: MinIO operations

**Methods**:
```typescript
class MinIOService {
  // Generate presigned upload URL
  async generatePresignedUrl(
    bucket: string,
    key: string,
    expirySeconds: number
  ): Promise<string>

  // Verify file exists
  async fileExists(bucket: string, key: string): Promise<boolean>

  // Get file metadata
  async getFileMetadata(bucket: string, key: string): Promise<FileMetadata>

  // Delete file
  async deleteFile(bucket: string, key: string): Promise<void>
}
```

#### rabbitmqService.ts
**Purpose**: RabbitMQ job dispatch

**Methods**:
```typescript
class RabbitMQService {
  // Dispatch processing job
  async dispatchJob(
    queue: string,
    job: ProcessingJob
  ): Promise<string>

  // Subscribe to events
  async subscribeToEvents(
    evidenceId: string,
    callback: (event: ProcessingEvent) => void
  ): Promise<void>

  // Unsubscribe from events
  async unsubscribeFromEvents(evidenceId: string): Promise<void>
}
```

---

## Data Models

### ProcessingJob
```typescript
interface ProcessingJob {
  jobId: string;
  evidenceId: string;
  caseId: string;
  filename: string;
  fileSize: number;
  minioPath: string;
  uploadedBy: string;
  uploadedAt: string;
  metadata: {
    fileType: string;
    checksum: string;
    retryCount: number;
  };
}
```

### ProcessingEvent
```typescript
interface ProcessingEvent {
  type: 'stage_change' | 'progress' | 'metrics' | 'error' | 'complete';
  evidenceId: string;
  stage: string;
  percentage: number;
  eta: number;
  details: string;
  metrics?: {
    gpuUtilization: number;
    cpuUtilization: number;
    memoryUsage: number;
    processingTime: number;
  };
  error?: {
    code: string;
    message: string;
    retryable: boolean;
  };
  timestamp: string;
}
```

### UploadStatus
```typescript
interface UploadStatus {
  evidenceId: string;
  status: 'pending' | 'uploading' | 'processing' | 'completed' | 'failed';
  percentage: number;
  stage: string;
  eta: number;
  error?: string;
  chunkCount?: number;
  completedAt?: string;
}
```

---

## Error Handling

### Upload Errors
- **File too large**: Return 413 Payload Too Large
- **Invalid file type**: Return 400 Bad Request
- **MinIO unavailable**: Return 503 Service Unavailable
- **Presigned URL expired**: Return 401 Unauthorized

### Processing Errors
- **Job dispatch failed**: Retry with exponential backoff
- **Processing timeout**: Mark as failed, allow manual retry
- **Database insert failed**: Log error, alert admin
- **Embedding generation failed**: Use fallback chunking

### Recovery Strategies
1. **Automatic retry**: Up to 3 attempts with exponential backoff
2. **Manual retry**: User can retry from UI
3. **Checkpoint recovery**: Resume from last successful stage
4. **Fallback processing**: Use CPU if GPU fails

---

## Security Considerations

### Access Control
- Verify user has access to case before upload
- Filter search results by case scope
- Use presigned URLs with time limits
- Validate file types and sizes

### Data Protection
- Encrypt files in transit (HTTPS)
- Encrypt files at rest (MinIO)
- Don't expose sensitive data in logs
- Sanitize error messages

### Rate Limiting
- Limit uploads per user per hour
- Limit concurrent uploads per user
- Limit job queue size

---

## Performance Optimization

### Frontend
- Lazy load upload components
- Use web workers for file hashing
- Implement chunked uploads for large files
- Cache case list in localStorage

### Backend
- Use connection pooling for database
- Cache presigned URLs in Redis
- Batch database inserts
- Use async/await for non-blocking operations

### Processing
- Parallel chunking (1 worker per 2 cores)
- GPU batching (32 pages per batch)
- Redis caching (7-day TTL)
- Incremental indexing

---

## Testing Strategy

### Unit Tests
- Upload service methods
- MinIO operations
- RabbitMQ job dispatch
- Database operations

### Integration Tests
- End-to-end upload flow
- Case selection modal
- Progress streaming
- Error handling and retry

### Performance Tests
- Concurrent upload handling
- Large file uploads (100MB+)
- Processing throughput
- Memory usage under load

---

## Deployment Considerations

### Environment Setup
- MinIO bucket creation
- RabbitMQ queue setup
- PostgreSQL schema migration
- Redis configuration

### Monitoring
- Upload success rate
- Processing time metrics
- Error rate tracking
- Resource utilization

### Scaling
- Horizontal scaling of workers
- Load balancing for API endpoints
- Database connection pooling
- Redis cluster setup

---

## Future Enhancements

### Phase 2
- Batch upload support
- Drag & drop folder upload
- Upload templates
- Evidence tagging and categorization

### Phase 3
- Real-ESRGAN image upscaling
- SAM ROI segmentation
- SOM signature detection
- Neo4j citation graph

### Phase 4
- Cross-case evidence linking
- Evidence versioning
- Audit trail logging
- Advanced search filters

---

## References

### Existing Components
- Legal Dashboard: `sveltekit-frontend/src/routes/dashboard/legal-progress/`
- RAG Ranking System: `src/lib/services/rag-ranking-system.ts`
- PostgreSQL Vector Storage: `src/lib/services/postgresql-vector-storage.ts`

### External Libraries
- Granite-Docling: Document processing
- LangExtract: Text chunking
- LegalBERT: Semantic embeddings
- MinIO SDK: Object storage
- RabbitMQ SDK: Message queue

### Infrastructure
- Docker Compose: `sveltekit-frontend/docker-compose.full.yml`
- PostgreSQL pgvector: Vector database
- Redis: Caching layer
- Ollama: AI service

---

**Document Version**: 1.0
**Last Updated**: November 23, 2025
**Status**: Ready for Implementation
