# High-Level Architecture: Legal AI Document Processing

## Component Communication Flow

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────────┐
│  SvelteKit      │    │  UDA Gateway     │    │  UDA Worker Service │
│  Frontend       │◄──►│  (SvelteKit API) │◄──►│  (Python + CUDA)    │
│                 │    │                  │    │                     │
│ • File Upload   │    │ • Validation     │    │ • OCR (PDF scans)   │
│ • Text Input    │    │ • Storage        │    │ • Tokenizer/Chunker │
│ • UI/Display    │    │ • Job Queue      │    │ • EmbeddingGemma    │
└─────────────────┘    └──────────────────┘    └─────────────────────┘
         │                       │                       │
         │                       │                       │
         ▼                       ▼                       ▼
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────────┐
│  Database       │    │  Storage Layer   │    │  Processing Queue   │
│                 │    │                  │    │                     │
│ • PostgreSQL    │    │ • MinIO/S3       │    │ • Redis Queue       │
│ • pgvector      │    │ • Temp FS        │    │ • Job Status        │
│ • JSONB         │    │ • File Metadata  │    │ • Results Cache     │
└─────────────────┘    └──────────────────┘    └─────────────────────┘
```

## 1. SvelteKit Frontend
**Current Status**: ✅ Operational
**Responsibilities**:
- File upload interface
- Text input forms
- Results display and visualization
- User authentication and session management

**Communication**:
```typescript
// Frontend → Gateway
POST /api/ai/process-document
Content-Type: multipart/form-data | application/json
{
  file?: File,
  text?: string,
  doc_type: string,
  metadata: object
}
```

## 2. UDA Gateway (SvelteKit API Routes)
**Current Status**: ✅ Operational (ports 8097, 8098, 8099)
**Responsibilities**:
- Request validation and sanitization
- Document storage (temp FS → MinIO)
- Job creation and queue management
- Response aggregation and formatting

**Current Implementation**:
- `/api/v1/extract` (Port 8098) - Parallel extraction
- `/api/v1/knowledge-graph` (Port 8099) - Sequential pipeline
- `/api/v1/search` (Port 8097) - CUDA service

**Enhanced Gateway Flow**:
```typescript
async function processDocument(request) {
  // 1. Validate input
  const { file, text, metadata } = await validateRequest(request);

  // 2. Store raw document
  const docId = await storeDocument(file || text, metadata);

  // 3. Queue processing job
  const jobId = await queueJob({
    docId,
    pipeline: 'langextract-gemma-sequential',
    priority: metadata.priority || 'normal'
  });

  // 4. Return job status
  return { jobId, status: 'queued', estimatedTime: '30s' };
}
```

## 3. UDA Worker Service (Python + CUDA)
**Status**: 🔄 To be implemented
**Responsibilities**:
- OCR processing for PDF scans
- Text tokenization and chunking
- CUDA-accelerated embeddings via EmbeddingGemma
- Sequential LangExtract pipeline execution

**Proposed Architecture**:
```python
class UDAWorker:
    def __init__(self):
        self.ocr_engine = TesseractOCR()
        self.tokenizer = GemmaTokenizer()
        self.embedder = EmbeddingGemma(cuda=True)
        self.extractor = LangExtractPipeline()

    async def process_job(self, job_data):
        # 1. Load document
        doc = await self.load_document(job_data['docId'])

        # 2. OCR if needed
        if doc.type == 'pdf_scan':
            text = await self.ocr_engine.extract_text(doc.content)
        else:
            text = doc.content

        # 3. Tokenize and chunk
        chunks = await self.tokenizer.chunk(text, max_length=512)

        # 4. Sequential pipeline
        result = await self.run_sequential_pipeline(chunks)

        # 5. Store results
        await self.store_results(job_data['docId'], result)

        return result
```

## 4. Storage Layer
**Current Status**: ✅ PostgreSQL operational, MinIO to be added

### Database (PostgreSQL + pgvector)
```sql
-- Current tables
legal_documents_extracted    -- Parallel processing results
knowledge_graphs            -- Sequential pipeline results

-- Enhanced schema
documents (
  id, original_filename, content_type,
  storage_path, upload_timestamp, metadata
)

processing_jobs (
  id, document_id, job_type, status,
  started_at, completed_at, result_data
)
```

### File Storage (MinIO/S3)
```
buckets/
├── raw-documents/          # Original uploads
├── processed-text/         # OCR outputs
├── embeddings/            # Vector files
└── results/               # Final outputs
```

## 5. Processing Queue (Redis)
**Current Status**: 🔄 Needs Redis job queue implementation

```python
# Job structure
job = {
    'id': 'job_001',
    'document_id': 'doc_001',
    'pipeline': 'langextract-gemma-sequential',
    'status': 'pending|processing|completed|failed',
    'priority': 'high|normal|low',
    'created_at': timestamp,
    'estimated_completion': timestamp,
    'result_data': {...}
}
```

## Communication Protocols

### 1. Frontend ↔ Gateway
- **Protocol**: HTTP/HTTPS
- **Format**: JSON + multipart/form-data
- **Authentication**: Session-based

### 2. Gateway ↔ Worker
- **Protocol**: HTTP + Redis Queue
- **Format**: JSON message passing
- **Scaling**: Multiple workers via Redis

### 3. Worker ↔ CUDA Services
- **Protocol**: HTTP (existing services)
- **Format**: JSON
- **Endpoints**:
  - Port 8097: CUDA + SIMD service
  - Port 8098: Parallel extraction
  - Port 8099: Sequential knowledge graphs

## Current Service Mesh

```
Port 8097: CUDA Service Worker (SIMD + GPU)
Port 8098: Legal Extraction Service (Parallel)
Port 8099: Sequential Knowledge Graph Service
Port 5173: SvelteKit Frontend (dev)
Port 5432: PostgreSQL Database
Port 6379: Redis Cache (optional)
```

## Data Flow Example

```
1. User uploads legal.pdf → SvelteKit Frontend
2. Frontend POSTs to /api/ai/process-document
3. Gateway validates, stores in MinIO, creates job
4. Redis queues job for UDA Worker
5. Worker picks up job:
   a. OCR extracts text from PDF
   b. Tokenizer chunks text into 512-token segments
   c. EmbeddingGemma generates vectors (CUDA)
   d. LangExtract pipeline: entities → embeddings → relationships
6. Results stored in PostgreSQL + pgvector
7. Gateway returns processed knowledge graph
8. Frontend displays entities, relationships, and visualizations
```

## Performance Characteristics

### Current Implementation
- **Parallel Processing**: 25.3s average per document
- **Sequential Pipeline**: 2.06s average per document
- **SIMD Operations**: 80M ops/second
- **Vector Dimensions**: 512 (SIMD-optimized)

### Proposed Enhanced Pipeline
- **OCR Processing**: ~5-10s per page
- **Tokenization**: ~100ms per document
- **Embedding Generation**: ~1-2s per document
- **Knowledge Graph**: ~2s per document
- **Total Estimated**: 8-15s per document

## Integration Points

### Existing Integrations ✅
- PostgreSQL + pgvector for vector storage
- CUDA acceleration via RTX 3060 Ti
- SIMD optimization (AVX2/SSE4)
- HTTP APIs with health monitoring

### Required Integrations 🔄
- MinIO/S3 for file storage
- Redis job queue for async processing
- Python UDA Worker with CUDA bindings
- OCR engine integration
- Enhanced monitoring and logging

## Scalability Considerations

### Horizontal Scaling
- Multiple UDA Workers behind Redis queue
- Load balancer for Gateway instances
- Database read replicas for queries
- CDN for static assets

### Vertical Scaling
- GPU memory optimization
- SIMD batch processing
- Async I/O for file operations
- Connection pooling

## Security & Compliance

### Data Protection
- Encrypted storage (MinIO encryption)
- TLS for all communications
- Document retention policies
- Audit logging

### Access Control
- JWT-based authentication
- Role-based permissions
- API rate limiting
- Input validation and sanitization

---

**Current Status**: Core services operational, UDA Worker and enhanced storage pending implementation
**Architecture**: Microservices with async processing
**Performance**: Enterprise-grade with CUDA + SIMD acceleration