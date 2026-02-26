# Design Document: Evidence Processing Pipeline

## Overview

The Evidence Processing Pipeline is a FastAPI-based middleware that transforms raw legal documents into structured, searchable evidence through a multi-stage processing workflow. It integrates:

- **Tesseract OCR** for text extraction from scanned documents
- **IBM Docling 258M** for semantic document parsing
- **Gemma3** for embeddings and legal entity extraction
- **RabbitMQ** for async job dispatch
- **Qdrant** for vector storage
- **PostgreSQL** for metadata persistence
- **SSE** for real-time progress monitoring

The pipeline is designed for high throughput, fault tolerance, and seamless integration with the SvelteKit frontend.

---

## Architecture

### High-Level Flow

```
SvelteKit Upload
    ↓
MinIO Storage (presigned URL)
    ↓
RabbitMQ Job Dispatch
    ↓
FastAPI Processing Pipeline
    ├─ Classification & Validation
    ├─ OCR (Tesseract) OR Parsing (Docling)
    ├─ Semantic Chunking
    ├─ Gemma3 Analysis & Tagging
    ├─ Embedding Generation
    └─ Storage & Indexing
    ↓
SSE Progress Events → SvelteKit Dashboard
    ↓
PostgreSQL + Qdrant (searchable evidence)
```

### Processing Stages

1. **Classification** (1-2s)
   - Detect document type (PDF, image, mixed)
   - Validate format and integrity
   - Route to appropriate pipeline

2. **OCR or Parsing** (2-10s)
   - Tesseract for scanned/image documents
   - Docling for PDFs and structured documents
   - Extract text with layout preservation

3. **Chunking** (1-2s)
   - Split into semantic units
   - Preserve context (page, section, structure)
   - Generate chunk metadata

4. **Semantic Analysis** (2-5s)
   - Gemma3 analysis of each chunk
   - Extract legal entities, references, concepts
   - Tag with legal metadata

5. **Embedding** (2-5s)
   - Generate 768-dim embeddings via Gemma3
   - Store in Qdrant with metadata
   - Index for semantic search

6. **Indexing** (1-2s)
   - Store chunks in PostgreSQL
   - Create BM25 indexes
   - Update evidence metadata

---

## Components and Interfaces

### 1. FastAPI Application (`main.py`)

```python
from fastapi import FastAPI, HTTPException
from fastapi.responses import StreamingResponse
import asyncio
from typing import AsyncGenerator

app = FastAPI()

@app.post("/api/process/evidence/{evidence_id}")
async def process_evidence(evidence_id: str) -> dict:
    """Initiate evidence processing"""
    # Validate evidence exists in MinIO
    # Dispatch to RabbitMQ
    # Return processing status
    pass

@app.get("/api/process/evidence/{evidence_id}/stream")
async def stream_progress(evidence_id: str) -> StreamingResponse:
    """SSE stream for real-time progress"""
    async def event_generator() -> AsyncGenerator[str, None]:
        # Subscribe to RabbitMQ events
        # Emit SSE events
        pass
    return StreamingResponse(event_generator(), media_type="text/event-stream")

@app.get("/api/process/evidence/{evidence_id}/status")
async def get_status(evidence_id: str) -> dict:
    """Get current processing status"""
    pass
```

### 2. Classification Module (`classification.py`)

```python
from enum import Enum
from pathlib import Path

class DocumentType(str, Enum):
    PDF = "pdf"
    IMAGE = "image"
    SCANNED = "scanned"
    MIXED = "mixed"

async def classify_document(file_path: str) -> DocumentType:
    """Classify document by type and content"""
    # Check file extension
    # Analyze content (PDF structure, image properties)
    # Return classification
    pass

async def validate_document(file_path: str) -> bool:
    """Validate document integrity"""
    # Check file format
    # Verify not corrupted
    # Check file size
    pass
```

### 3. OCR Module (`ocr.py`)

```python
import pytesseract
from PIL import Image
from typing import List

class OCRResult:
    text: str
    confidence: float
    page_number: int
    layout: dict  # Preserve structure

async def extract_text_ocr(file_path: str) -> List[OCRResult]:
    """Extract text using Tesseract OCR"""
    # Convert PDF to images if needed
    # Apply Tesseract with legal document config
    # Extract text with confidence scores
    # Preserve page layout
    pass

async def optimize_image_for_ocr(image_path: str) -> str:
    """Preprocess image for better OCR accuracy"""
    # Deskew
    # Denoise
    # Enhance contrast
    pass
```

### 4. Document Parsing Module (`parsing.py`)

```python
from docling.document_converter import DocumentConverter
from typing import List, Dict

class ParsedElement:
    type: str  # "paragraph", "table", "heading", "list"
    content: str
    metadata: dict
    page_number: int

async def parse_document_docling(file_path: str) -> List[ParsedElement]:
    """Parse document using IBM Docling"""
    # Initialize Docling converter
    # Parse document
    # Extract elements with types
    # Preserve structure and relationships
    pass

async def extract_tables(parsed_doc) -> List[Dict]:
    """Extract and structure tables from parsed document"""
    pass
```

### 5. Chunking Module (`chunking.py`)

```python
class Chunk:
    id: str
    content: str
    page_number: int
    section_title: str
    chunk_index: int
    metadata: dict

async def chunk_document(parsed_elements: List) -> List[Chunk]:
    """Create semantic chunks from parsed elements"""
    # Group elements into semantic units
    # Preserve context (page, section)
    # Generate chunk IDs
    # Create metadata
    pass

async def merge_small_chunks(chunks: List[Chunk], min_size: int = 100) -> List[Chunk]:
    """Merge small chunks for better semantic units"""
    pass
```

### 6. Semantic Analysis Module (`analysis.py`)

```python
from typing import List, Dict

class ChunkAnalysis:
    chunk_id: str
    entities: List[str]  # Legal entities, case names, etc.
    references: List[str]  # Statute references, case citations
    concepts: List[str]  # Key legal concepts
    tags: List[str]  # Legal metadata tags
    confidence: float

async def analyze_chunk_gemma3(chunk: Chunk) -> ChunkAnalysis:
    """Analyze chunk using Gemma3 for legal entities and concepts"""
    # Call Gemma3 with legal analysis prompt
    # Extract entities, references, concepts
    # Generate tags
    # Return analysis with confidence
    pass

async def batch_analyze_chunks(chunks: List[Chunk]) -> List[ChunkAnalysis]:
    """Analyze multiple chunks in batch for efficiency"""
    pass
```

### 7. Embedding Module (`embedding.py`)

```python
import numpy as np
from typing import List

class EmbeddingResult:
    chunk_id: str
    embedding: np.ndarray  # 768-dimensional
    model: str
    timestamp: str

async def generate_embeddings(chunks: List[Chunk]) -> List[EmbeddingResult]:
    """Generate embeddings using Gemma3 embedding model"""
    # Batch chunks for efficiency
    # Call Gemma3 embedding endpoint
    # Validate 768-dimensional output
    # Return embeddings
    pass

async def store_embeddings_qdrant(embeddings: List[EmbeddingResult]) -> bool:
    """Store embeddings in Qdrant with metadata"""
    # Connect to Qdrant
    # Upsert embeddings with chunk metadata
    # Create indexes
    pass
```

### 8. Storage Module (`storage.py`)

```python
from sqlalchemy import create_engine
from sqlalchemy.orm import Session

async def store_chunks_postgres(chunks: List[Chunk], analysis: List[ChunkAnalysis]) -> bool:
    """Store chunks and analysis in PostgreSQL"""
    # Create evidence_chunks records
    # Store analysis results
    # Create BM25 indexes
    # Update evidence_files status
    pass

async def update_evidence_status(evidence_id: str, status: str, metadata: dict) -> bool:
    """Update evidence processing status"""
    pass
```

### 9. Progress Monitoring Module (`progress.py`)

```python
from typing import AsyncGenerator
import json

class ProcessingEvent:
    stage: str
    percentage: int
    eta_seconds: int
    details: str
    metrics: dict

async def emit_progress_event(evidence_id: str, event: ProcessingEvent) -> None:
    """Emit progress event via RabbitMQ"""
    # Publish to RabbitMQ topic
    # Include timestamp and evidence_id
    pass

async def subscribe_to_progress(evidence_id: str) -> AsyncGenerator[str, None]:
    """Subscribe to progress events for SSE streaming"""
    # Connect to RabbitMQ
    # Listen for events matching evidence_id
    # Yield SSE formatted events
    pass
```

### 10. Error Handling Module (`errors.py`)

```python
class ProcessingError(Exception):
    def __init__(self, stage: str, message: str, recoverable: bool = True):
        self.stage = stage
        self.message = message
        self.recoverable = recoverable

async def handle_processing_error(error: ProcessingError, evidence_id: str) -> dict:
    """Handle processing errors with recovery options"""
    # Log error with context
    # Emit error event
    # Determine recovery strategy
    # Return recovery options
    pass

async def retry_with_backoff(fn, max_retries: int = 3) -> any:
    """Retry function with exponential backoff"""
    pass
```

---

## Data Models

### Evidence File (PostgreSQL)
```sql
CREATE TABLE evidence_files (
    id UUID PRIMARY KEY,
    case_id UUID NOT NULL,
    filename VARCHAR NOT NULL,
    file_size BIGINT,
    file_type VARCHAR,
    minio_path VARCHAR,
    uploaded_by UUID,
    uploaded_at TIMESTAMP,
    processing_status VARCHAR,  -- pending, processing, completed, failed
    processing_error TEXT,
    chunk_count INT,
    metadata JSONB,
    created_at TIMESTAMP DEFAULT NOW()
);
```

### Evidence Chunks (PostgreSQL)
```sql
CREATE TABLE evidence_chunks (
    id UUID PRIMARY KEY,
    evidence_id UUID NOT NULL REFERENCES evidence_files(id),
    chunk_index INT,
    content TEXT,
    page_number INT,
    section_title VARCHAR,
    legal_entities TEXT[],
    legal_references TEXT[],
    legal_concepts TEXT[],
    legal_tags TEXT[],
    metadata JSONB,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_evidence_chunks_evidence_id ON evidence_chunks(evidence_id);
CREATE INDEX idx_evidence_chunks_page ON evidence_chunks(page_number);
```

### Evidence Embeddings (Qdrant)
```json
{
  "id": "chunk-uuid",
  "vector": [0.1, 0.2, ..., 0.768],  // 768-dimensional
  "payload": {
    "chunk_id": "chunk-uuid",
    "evidence_id": "evidence-uuid",
    "page_number": 1,
    "section_title": "Introduction",
    "legal_tags": ["statute", "contract"],
    "confidence": 0.95
  }
}
```

---

## Correctness Properties

A property is a characteristic or behavior that should hold true across all valid executions of a system—essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.

### Property 1: Document Classification Consistency
*For any* uploaded document, the classification result should be deterministic and consistent across multiple runs.
**Validates: Requirements 1.1, 1.2**

### Property 2: OCR Text Preservation
*For any* scanned document, the OCR-extracted text should contain all visible text from the original document with page-level structure preserved.
**Validates: Requirements 2.3, 2.4, 2.9**

### Property 3: Docling Parsing Completeness
*For any* structured PDF, the Docling parser should extract all major elements (paragraphs, tables, headings) without loss of content.
**Validates: Requirements 3.3, 3.4, 3.7, 3.8**

### Property 4: Chunk Semantic Coherence
*For any* document, chunks should be semantically coherent units that preserve context (page number, section title) and maintain relationships to original structure.
**Validates: Requirements 4.1, 4.2, 4.3, 4.4**

### Property 5: Embedding Dimension Consistency
*For any* chunk, the generated embedding should be exactly 768-dimensional and normalized for consistency with RAG system.
**Validates: Requirements 5.3, 5.4**

### Property 6: Processing Stage Ordering
*For any* document, processing stages should execute in correct order (classification → extraction → chunking → analysis → embedding → storage) with no skipped stages.
**Validates: Requirements 6.1, 6.3**

### Property 7: Error Recovery Idempotence
*For any* failed processing stage, retrying the same stage with the same input should produce identical results or fail consistently.
**Validates: Requirements 7.1, 7.2, 7.9, 7.10**

### Property 8: Concurrent Processing Isolation
*For any* two concurrent document processing jobs, they should not interfere with each other and should complete independently.
**Validates: Requirements 8.7, 8.8**

### Property 9: SSE Event Ordering
*For any* processing job, SSE events should be emitted in chronological order with monotonically increasing progress percentages.
**Validates: Requirements 6.1, 6.2, 6.3, 6.4**

### Property 10: Data Persistence Round Trip
*For any* processed document, storing chunks and embeddings then retrieving them should return identical data (within floating-point precision for embeddings).
**Validates: Requirements 10.1, 10.2, 10.5, 10.6**

---

## Error Handling

### Classification Errors
- Invalid file format → Reject with 400 Bad Request
- Corrupted file → Reject with 422 Unprocessable Entity
- Unsupported type → Reject with 415 Unsupported Media Type

### OCR Errors
- Low confidence (<70%) → Flag for manual review, continue processing
- OCR timeout → Retry up to 3 times, then skip page
- Memory exhaustion → Process in smaller batches

### Parsing Errors
- Docling parse failure → Fall back to OCR
- Table extraction failure → Store as text
- Metadata extraction failure → Continue with available data

### Embedding Errors
- Gemma3 timeout → Retry with exponential backoff
- Dimension mismatch → Log error, skip chunk
- Storage failure → Retry with circuit breaker

### Recovery Strategy
- Transient errors (network, timeout) → Retry with exponential backoff (1s, 2s, 4s)
- Permanent errors (format, validation) → Fail fast with clear error message
- Partial failures (some chunks fail) → Continue processing, mark failed chunks
- Complete failure → Emit error event, allow manual retry from UI

---

## Testing Strategy

### Unit Testing
- Classification accuracy on diverse document types
- OCR text extraction on sample scanned documents
- Docling parsing on structured PDFs
- Chunking logic on various document structures
- Embedding dimension validation
- Error handling and recovery logic

### Property-Based Testing
- **Property 1**: Classification consistency across 100 random documents
- **Property 2**: OCR text preservation on 50 scanned documents
- **Property 3**: Docling completeness on 50 structured PDFs
- **Property 4**: Chunk coherence on 100 random documents
- **Property 5**: Embedding dimension consistency on 1000 chunks
- **Property 6**: Stage ordering on 100 processing jobs
- **Property 7**: Error recovery idempotence on 50 failed stages
- **Property 8**: Concurrent isolation on 10 parallel jobs
- **Property 9**: SSE event ordering on 100 processing jobs
- **Property 10**: Data persistence round trip on 100 documents

### Integration Testing
- End-to-end processing: upload → classification → extraction → chunking → analysis → embedding → storage
- RabbitMQ job dispatch and consumption
- SSE progress streaming
- PostgreSQL and Qdrant storage
- Error scenarios and recovery

### Performance Testing
- Single document processing time (1-5 pages: <5s, 20 pages: <15s, 50-100 pages: <30s)
- Concurrent processing (5 documents simultaneously)
- GPU/CPU utilization (70%+ GPU, 60%+ CPU)
- Memory usage under load

---

## Environment Configuration

### Required Environment Variables
```
# FastAPI
FASTAPI_HOST=0.0.0.0
FASTAPI_PORT=8001

# MinIO
MINIO_ENDPOINT=localhost:9000
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin
MINIO_BUCKET=lawpdfs

# RabbitMQ
RABBITMQ_URL=amqp://guest:guest@localhost:5672/

# PostgreSQL
PG_HOST=localhost
PG_PORT=5432
PG_DB=legal_ai_db
PG_USER=legal_admin
PG_PASSWORD=123456

# Qdrant
QDRANT_URL=http://localhost:6333
QDRANT_COLLECTION=evidence_embeddings

# Gemma3
GEMMA3_ENDPOINT=http://localhost:11434
GEMMA3_MODEL=gemma3:latest
GEMMA3_EMBED_MODEL=embeddinggemma:latest

# Tesseract
TESSERACT_PATH=/usr/bin/tesseract

# Processing
PROCESSING_TIMEOUT_SECONDS=300
MAX_CONCURRENT_JOBS=5
CHUNK_MIN_SIZE=100
CHUNK_MAX_SIZE=1000
OCR_CONFIDENCE_THRESHOLD=0.7
```

---

## Deployment

### Docker Compose Service
```yaml
evidence-processor:
  image: evidence-processor:latest
  ports:
    - "8001:8001"
  environment:
    - FASTAPI_HOST=0.0.0.0
    - FASTAPI_PORT=8001
    - RABBITMQ_URL=amqp://rabbitmq:5672/
    - PG_HOST=postgres
    - QDRANT_URL=http://qdrant:6333
    - GEMMA3_ENDPOINT=http://ollama:11434
  depends_on:
    - rabbitmq
    - postgres
    - qdrant
    - ollama
  volumes:
    - /usr/share/tesseract-ocr:/usr/share/tesseract-ocr
```

---

## Success Criteria

- ✅ All documents classified correctly
- ✅ OCR extracts text with >90% accuracy on scanned documents
- ✅ Docling parses structured documents with 100% element extraction
- ✅ Chunks are semantically coherent and preserve context
- ✅ Embeddings are 768-dimensional and normalized
- ✅ Processing completes within performance targets
- ✅ Concurrent jobs process independently without interference
- ✅ SSE events stream in correct order with accurate progress
- ✅ All errors handled gracefully with recovery options
- ✅ Data persists correctly in PostgreSQL and Qdrant

