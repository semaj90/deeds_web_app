# Implementation Plan: Evidence Processing Pipeline

## Overview

This implementation plan builds upon the existing FastAPI backend infrastructure (`backend/evidence-pipeline/`) and integrates it with the SvelteKit frontend, Go microservices, and existing Python workers. The plan focuses on completing the pipeline, adding missing components, and optimizing performance.

**Existing Infrastructure:**
- ✅ FastAPI application scaffold (`evidence_pipeline/main.py`)
- ✅ Database models and migrations
- ✅ MinIO client wrapper
- ✅ RabbitMQ connection manager
- ✅ Qdrant vector client
- ✅ Basic route handlers (health, upload, progress)
- ✅ Docker Compose stack

**What Needs to Be Built:**
- Complete OCR pipeline (Tesseract integration)
- Complete document parsing (Docling integration)
- Semantic chunking and analysis (Gemma3)
- Embedding generation and storage
- SSE progress streaming
- Error handling and recovery
- Integration with SvelteKit frontend
- Go microservices for performance optimization

---

## Tasks

### Phase 1: Complete Backend Core Pipeline

- [ ] 1. Enhance OCR Module (Tesseract)
  - [ ] 1.1 Implement image preprocessing for OCR
    - Add deskewing, denoising, contrast enhancement
    - Support PDF to image conversion
    - Optimize for legal document quality
    - _Requirements: 2.1, 2.2, 2.3, 2.4_

  - [ ] 1.2 Implement Tesseract OCR engine
    - Integrate pytesseract with legal document config
    - Extract text with confidence scores per page
    - Preserve layout and structure information
    - Handle multi-page documents
    - _Requirements: 2.1, 2.2, 2.5, 2.6_

  - [ ] 1.3 Implement OCR confidence filtering
    - Flag pages with confidence < 70% for manual review
    - Continue processing despite low-confidence pages
    - Store confidence metadata with chunks
    - _Requirements: 2.7, 2.8_

  - [ ] 1.4 Write unit tests for OCR module
    - Test image preprocessing
    - Test OCR accuracy on sample documents
    - Test confidence scoring
    - _Requirements: 2.1, 2.2_

- [ ] 2. Enhance Document Parsing Module (Docling)
  - [ ] 2.1 Implement Docling document parser
    - Initialize Docling converter with legal document config
    - Extract paragraphs, tables, headings, lists
    - Preserve document structure and relationships
    - Extract metadata (title, author, creation date, page count)
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.9, 3.10_

  - [ ] 2.2 Implement table extraction and structuring
    - Extract table structure and cell relationships
    - Convert tables to structured JSON format
    - Preserve table context and captions
    - _Requirements: 3.7, 3.8_

  - [ ] 2.3 Implement fallback from Docling to OCR
    - If Docling parsing fails, fall back to OCR
    - Log fallback events for monitoring
    - Ensure no data loss during fallback
    - _Requirements: 7.7, 7.8_

  - [ ] 2.4 Write unit tests for parsing module
    - Test Docling parsing on sample PDFs
    - Test table extraction
    - Test metadata extraction
    - _Requirements: 3.1, 3.2_

- [ ] 3. Implement Semantic Chunking Module
  - [ ] 3.1 Implement semantic chunking logic
    - Split parsed elements into semantic units
    - Preserve context (page number, section title)
    - Maintain relationships to original structure
    - Merge small chunks for better semantic units
    - _Requirements: 4.1, 4.2, 4.3, 4.4_

  - [ ] 3.2 Implement chunk metadata generation
    - Generate unique chunk IDs
    - Store page numbers and section titles
    - Create chunk index and relationships
    - _Requirements: 4.1, 4.2_

  - [ ] 3.3 Write unit tests for chunking module
    - Test chunking on various document structures
    - Test metadata preservation
    - Test chunk merging logic
    - _Requirements: 4.1, 4.2_

- [ ] 4. Implement Semantic Analysis Module (Gemma3)
  - [ ] 4.1 Implement Gemma3 analysis service
    - Call Gemma3 with legal analysis prompt
    - Extract legal entities (case names, parties, etc.)
    - Extract statute references and case citations
    - Extract key legal concepts
    - _Requirements: 4.5, 4.6, 4.7, 4.8_

  - [ ] 4.2 Implement batch analysis for efficiency
    - Batch chunks for concurrent processing
    - Implement queue-based processing
    - Handle concurrent requests
    - _Requirements: 4.5, 4.6_

  - [ ] 4.3 Implement legal tagging system
    - Tag chunks with legal metadata
    - Support filtering and ranking by tags
    - Store confidence scores for tags
    - _Requirements: 4.9, 4.10_

  - [ ] 4.4 Write unit tests for analysis module
    - Test entity extraction
    - Test reference extraction
    - Test tagging accuracy
    - _Requirements: 4.5, 4.6_

- [ ] 5. Implement Embedding Generation Module
  - [ ] 5.1 Implement Gemma3 embedding generation
    - Generate 768-dimensional embeddings
    - Batch chunks for efficiency
    - Validate embedding dimensions
    - _Requirements: 5.1, 5.2, 5.3, 5.4_

  - [ ] 5.2 Implement embedding storage in Qdrant
    - Store embeddings with chunk metadata
    - Create HNSW indexes for similarity search
    - Include legal tags and confidence scores
    - _Requirements: 5.5, 5.6, 5.7, 5.8_

  - [ ] 5.3 Implement embedding retry logic
    - Retry failed embeddings up to 3 times
    - Implement exponential backoff
    - Log retry attempts
    - _Requirements: 5.9, 5.10_

  - [ ] 5.4 Write unit tests for embedding module
    - Test embedding generation
    - Test Qdrant storage
    - Test retry logic
    - _Requirements: 5.1, 5.2_

- [ ] 6. Implement Progress Monitoring (SSE)
  - [ ] 6.1 Implement SSE event streaming
    - Establish SSE connection for job progress
    - Emit events for each processing stage
    - Include stage, percentage, ETA, metrics
    - _Requirements: 6.1, 6.2, 6.3, 6.4_

  - [ ] 6.2 Implement RabbitMQ event subscription
    - Subscribe to processing events
    - Parse ProcessingEvent objects
    - Forward events to SSE clients
    - _Requirements: 6.1, 6.2_

  - [ ] 6.3 Implement metrics collection
    - Track GPU/CPU utilization
    - Track processing time per stage
    - Track error rates
    - _Requirements: 6.7, 6.8_

  - [ ] 6.4 Write unit tests for progress module
    - Test SSE event emission
    - Test event ordering
    - Test metrics collection
    - _Requirements: 6.1, 6.2_

- [ ] 7. Implement Error Handling & Recovery
  - [ ] 7.1 Implement error handling middleware
    - Catch and log errors with full context
    - Return appropriate HTTP status codes
    - Sanitize error messages
    - _Requirements: 7.1, 7.2_

  - [ ] 7.2 Implement retry logic with exponential backoff
    - Retry transient errors (network, timeout)
    - Fail fast on permanent errors
    - Log all retry attempts
    - _Requirements: 7.1, 7.2, 7.9, 7.10_

  - [ ] 7.3 Implement checkpoint and resume
    - Save processing state at each stage
    - Resume from last checkpoint on failure
    - Ensure no data loss
    - _Requirements: 7.9, 7.10_

  - [ ] 7.4 Write unit tests for error handling
    - Test error scenarios
    - Test retry logic
    - Test checkpoint/resume
    - _Requirements: 7.1, 7.2_

### Phase 2: Frontend Integration

- [ ] 8. Implement SvelteKit Upload Components
  - [ ] 8.1 Create EvidenceUploadButton component
    - Display upload button on case pages
    - Handle click to open upload modal
    - Support both case-scoped and homepage uploads
    - _Requirements: 1.1, 1.3_

  - [ ] 8.2 Create EvidenceUploadModal component
    - Implement file selection (drag & drop + click)
    - Validate file type and size
    - Display upload progress
    - Handle upload cancellation
    - _Requirements: 1.2, 1.4, 1.5_

  - [ ] 8.3 Create UploadProgressCard component
    - Display processing stage
    - Show progress percentage
    - Display ETA countdown
    - Show metrics (GPU/CPU utilization)
    - Handle error display with retry option
    - _Requirements: 1.5, 1.6, 7.3, 7.4_

  - [ ] 8.4 Create CaseSelectModal component
    - Display case search bar
    - Show recent cases list
    - Implement "Create New Case" button
    - Handle case selection and creation
    - _Requirements: 5.3, 5.4, 5.5_

- [ ] 9. Implement Upload Service Layer
  - [ ] 9.1 Create uploadEvidenceService.ts
    - Implement initiateUpload() method
    - Implement completeUpload() method
    - Implement getUploadStatus() method
    - Implement streamProcessingEvents() method
    - _Requirements: 1.2, 1.4, 3.1, 3.2_

  - [ ] 9.2 Implement file validation
    - Validate file type (PDF, PNG, JPG, TIFF, DOCX)
    - Validate file size (<100MB)
    - Return validation errors
    - _Requirements: 1.2, 1.4_

  - [ ] 9.3 Implement upload state management
    - Track upload progress
    - Store upload state in Redis
    - Handle upload resumption
    - _Requirements: 2.7, 2.8_

  - [ ] 9.4 Implement error handling and retry
    - Catch upload errors
    - Implement retry logic
    - Log errors for debugging
    - _Requirements: 8.1, 8.2, 8.3, 8.4_

### Phase 3: API Endpoints

- [ ] 10. Implement Upload API Endpoints
  - [ ] 10.1 Create POST /api/evidence/upload endpoint
    - Validate user has access to case
    - Validate file type and size
    - Create evidence_files record (status: pending)
    - Generate MinIO presigned URL
    - Return upload details (evidenceId, presignedUrl, expiresIn)
    - _Requirements: 1.2, 1.4, 2.3, 2.4_

  - [ ] 10.2 Create POST /api/evidence/{id}/complete endpoint
    - Verify upload completion in MinIO
    - Verify file checksum
    - Update evidence_files record (status: processing)
    - Dispatch RabbitMQ job
    - Return processing status
    - _Requirements: 3.1, 3.2, 3.3_

  - [ ] 10.3 Create GET /api/evidence/{id}/stream endpoint (SSE)
    - Establish SSE connection
    - Subscribe to RabbitMQ events
    - Stream ProcessingEvent objects
    - Handle connection lifecycle
    - _Requirements: 7.1, 7.2, 7.3, 7.4_

  - [ ] 10.4 Create POST /api/cases endpoint (Create Case)
    - Validate case name and type
    - Create case record in database
    - Return caseId and metadata
    - _Requirements: 5.5, 5.6_

  - [ ] 10.5 Create error handling middleware
    - Catch and log errors
    - Return appropriate HTTP status codes
    - Sanitize error messages
    - _Requirements: 8.1, 8.2_

### Phase 4: Go Microservices Optimization

- [ ] 11. Implement Go Document Classifier
  - [ ] 11.1 Create Go classifier service
    - Detect document type (PDF, image, mixed)
    - Validate file format and integrity
    - Route to appropriate pipeline
    - _Requirements: 1.1, 1.2, 1.3, 1.4_

  - [ ] 11.2 Implement ripgrep-based pattern matching
    - Use ripgrep for fast file type detection
    - Support concurrent classification
    - Return classification with confidence
    - _Requirements: 1.1, 1.2_

  - [ ] 11.3 Implement gRPC interface
    - Define gRPC service for classification
    - Implement async classification
    - Support batch operations
    - _Requirements: 1.1, 1.2_

- [ ] 12. Implement Go Vector Clustering Service
  - [ ] 12.1 Create Go clustering service
    - Query Qdrant for nearest neighbors
    - Build clustering graph from neighborhoods
    - Identify error clusters
    - _Requirements: 8.7, 8.8_

  - [ ] 12.2 Implement SIMD-accelerated similarity
    - Use SIMD for fast vector operations
    - Support concurrent clustering
    - Return cluster assignments
    - _Requirements: 8.7, 8.8_

  - [ ] 12.3 Implement gRPC interface
    - Define gRPC service for clustering
    - Support batch operations
    - Return cluster metadata
    - _Requirements: 8.7, 8.8_

### Phase 5: Database & Storage

- [ ] 13. Implement Database Schema & Migrations
  - [ ] 13.1 Create evidence_files table
    - Define columns: id, case_id, filename, file_size, file_type, minio_path, uploaded_by, uploaded_at, processing_status, processing_error, chunk_count, metadata
    - Add indexes on case_id, processing_status, uploaded_by
    - _Requirements: 4.1, 4.2_

  - [ ] 13.2 Create evidence_chunks table
    - Define columns: id, evidence_id, chunk_index, content, page_number, section_title, metadata
    - Add indexes on evidence_id, page_number
    - _Requirements: 4.3, 4.4_

  - [ ] 13.3 Create evidence_embeddings table
    - Define columns: id, chunk_id, embedding (vector), embedding_model, metadata
    - Add HNSW index on embedding column
    - _Requirements: 4.5, 4.6_

  - [ ] 13.4 Run database migrations
    - Generate migration files
    - Apply migrations to PostgreSQL
    - Verify schema creation
    - _Requirements: 4.1, 4.3, 4.5_

- [ ] 14. Implement MinIO Bucket Setup
  - [ ] 14.1 Create MinIO bucket structure
    - Create evidence-documents bucket
    - Create evidence-processed bucket
    - Set up bucket policies
    - _Requirements: 2.1, 2.2_

  - [ ] 14.2 Implement presigned URL generation
    - Generate presigned URLs for 15-minute expiry
    - Support custom bucket and key paths
    - Return URL with metadata
    - _Requirements: 2.3, 2.4_

  - [ ] 14.3 Implement file verification
    - Verify file exists in MinIO
    - Get file metadata (size, content-type)
    - Verify file integrity using checksums
    - _Requirements: 2.9_

### Phase 6: Integration & Testing

- [ ] 15. Implement End-to-End Integration
  - [ ] 15.1 Wire up upload flow
    - Connect frontend to API endpoints
    - Connect API to RabbitMQ job dispatch
    - Connect RabbitMQ to processing pipeline
    - _Requirements: 1.1, 1.2, 3.1, 3.2_

  - [ ] 15.2 Wire up progress streaming
    - Connect SSE endpoint to RabbitMQ events
    - Connect frontend to SSE stream
    - Display real-time progress
    - _Requirements: 6.1, 6.2, 6.3, 6.4_

  - [ ] 15.3 Wire up search integration
    - Index chunks with BM25
    - Store embeddings in Qdrant
    - Implement semantic search
    - _Requirements: 9.1, 9.2, 9.3, 9.4_

  - [ ] 15.4 Wire up dashboard integration
    - Stream processing events to dashboard
    - Display metrics and progress
    - Show error notifications
    - _Requirements: 7.1, 7.2, 7.3, 7.4_

- [ ]* 16. Create Unit Tests (optional)
  - [ ]* 16.1 Write tests for OCR module
    - Test image preprocessing
    - Test OCR accuracy
    - Test confidence scoring
    - _Requirements: 2.1, 2.2_

  - [ ]* 16.2 Write tests for parsing module
    - Test Docling parsing
    - Test table extraction
    - Test metadata extraction
    - _Requirements: 3.1, 3.2_

  - [ ]* 16.3 Write tests for chunking module
    - Test semantic chunking
    - Test metadata preservation
    - Test chunk merging
    - _Requirements: 4.1, 4.2_

  - [ ]* 16.4 Write tests for analysis module
    - Test entity extraction
    - Test reference extraction
    - Test tagging accuracy
    - _Requirements: 4.5, 4.6_

  - [ ]* 16.5 Write tests for embedding module
    - Test embedding generation
    - Test Qdrant storage
    - Test retry logic
    - _Requirements: 5.1, 5.2_

  - [ ]* 16.6 Write tests for API endpoints
    - Test upload initiation
    - Test upload completion
    - Test error responses
    - _Requirements: 1.2, 1.4_

  - [ ]* 16.7 Write tests for frontend components
    - Test upload modal
    - Test case selection
    - Test progress display
    - _Requirements: 1.1, 1.3_

- [ ]* 17. Create Integration Tests (optional)
  - [ ]* 17.1 Test end-to-end upload flow
    - Upload file from case page
    - Verify MinIO storage
    - Verify RabbitMQ job dispatch
    - Verify database records
    - _Requirements: 1.1, 1.2, 2.1, 3.1_

  - [ ]* 17.2 Test case selection modal
    - Search for case
    - Create new case
    - Upload to selected case
    - _Requirements: 5.3, 5.4, 5.5_

  - [ ]* 17.3 Test progress streaming
    - Verify SSE connection
    - Verify event delivery
    - Verify dashboard updates
    - _Requirements: 7.1, 7.2, 7.3_

  - [ ]* 17.4 Test error handling
    - Test upload failure
    - Test retry mechanism
    - Test error display
    - _Requirements: 8.1, 8.2, 8.3_

  - [ ]* 17.5 Test security
    - Test access control
    - Test unauthorized access
    - Test rate limiting
    - _Requirements: 10.1, 10.2, 10.3_

- [ ]* 18. Create Performance Tests (optional)
  - [ ]* 18.1 Test concurrent uploads
    - Upload 10 files simultaneously
    - Verify no degradation
    - Monitor resource usage
    - _Requirements: 8.7, 8.8_

  - [ ]* 18.2 Test large file uploads
    - Upload 100MB file
    - Verify completion
    - Monitor memory usage
    - _Requirements: 8.1, 8.2_

  - [ ]* 18.3 Test API response times
    - Measure endpoint latency
    - Verify <100ms response time
    - Monitor under load
    - _Requirements: 8.1, 8.2_

  - [ ]* 18.4 Test processing throughput
    - Measure documents processed per second
    - Verify GPU/CPU utilization targets
    - Monitor queue depth
    - _Requirements: 8.9, 8.10_

---

## Task Execution Notes

### Prerequisites
- SvelteKit 5 frontend running
- PostgreSQL 17 with pgvector extension
- MinIO instance running
- RabbitMQ instance running
- Redis instance running
- Ollama with Gemma3 and embeddinggemma models
- Tesseract OCR installed
- IBM Docling 258M available
- Docker Compose infrastructure running

### Dependencies Between Tasks
1. Phase 1 (Backend Core) - Tasks 1-7
   - Task 1 (OCR) can run in parallel with Task 2 (Parsing)
   - Task 3 (Chunking) depends on Tasks 1-2
   - Task 4 (Analysis) depends on Task 3
   - Task 5 (Embedding) depends on Task 4
   - Task 6 (Progress) can run in parallel with Tasks 1-5
   - Task 7 (Error Handling) should be integrated throughout

2. Phase 2 (Frontend) - Tasks 8-9
   - Depends on Phase 1 completion
   - Can run in parallel with Phase 3

3. Phase 3 (API) - Task 10
   - Depends on Phase 1 completion
   - Should be completed before Phase 2 integration

4. Phase 4 (Go Services) - Tasks 11-12
   - Optional optimization layer
   - Can run in parallel with other phases

5. Phase 5 (Database) - Tasks 13-14
   - Should run first (before Phase 1)
   - Can run in parallel with Phase 1

6. Phase 6 (Integration) - Tasks 15-18
   - Depends on all previous phases
   - Tests should run after implementation

### Implementation Order (Recommended)
1. Task 13: Database schema (foundation)
2. Task 14: MinIO setup (storage)
3. Tasks 1-7: Backend core pipeline (in parallel where possible)
4. Task 10: API endpoints
5. Tasks 8-9: Frontend components
6. Task 15: End-to-end integration
7. Tasks 11-12: Go optimization (optional)
8. Tasks 16-18: Testing (optional)

### Existing Code to Enhance
- `backend/evidence-pipeline/evidence_pipeline/main.py` - FastAPI app
- `backend/evidence-pipeline/evidence_pipeline/config.py` - Configuration
- `backend/evidence-pipeline/evidence_pipeline/routes/` - Route handlers
- `backend/evidence-pipeline/evidence_pipeline/storage/minio_client.py` - MinIO wrapper
- `backend/evidence-pipeline/evidence_pipeline/queue/rabbitmq.py` - RabbitMQ wrapper
- `backend/evidence-pipeline/evidence_pipeline/vector/qdrant_client.py` - Qdrant wrapper
- `sveltekit-frontend/src/lib/components/evidence/` - Evidence components
- `go-microservice/cmd/` - Go microservices

---

## Success Criteria

### Phase Completion
- [ ] Task 1-7: Backend core pipeline fully implemented
- [ ] Task 8-9: Frontend components fully implemented
- [ ] Task 10: API endpoints fully implemented
- [ ] Task 13-14: Database and storage fully configured
- [ ] Task 15: End-to-end integration working
- [ ] All core tasks (1-15) passing tests

### Functional Requirements
- [ ] Users can upload evidence from case pages
- [ ] Users can select/create cases from homepage
- [ ] Users are redirected to login if needed
- [ ] Files are stored in MinIO with proper organization
- [ ] Processing jobs are dispatched to RabbitMQ
- [ ] Real-time progress updates visible
- [ ] Evidence chunks stored in PostgreSQL
- [ ] Embeddings generated and indexed
- [ ] Evidence searchable via semantic search
- [ ] Evidence searchable via keyword search

### Performance Targets
- [ ] API endpoints respond in <100ms
- [ ] 1-5 page documents process in <5 seconds
- [ ] 20-page documents process in 5-15 seconds
- [ ] 50-100 page documents process in 15-30 seconds
- [ ] Handle 5 concurrent uploads without degradation
- [ ] GPU utilization 70%+
- [ ] CPU utilization 60%+

### Quality Targets
- [ ] Code coverage 80%+ (for core functionality)
- [ ] All tests passing
- [ ] No critical bugs
- [ ] Documentation complete
- [ ] Performance benchmarks documented

---

## Notes & Considerations

### Architecture Decisions
- Presigned URLs for direct MinIO uploads (reduces server load)
- RabbitMQ for async job processing (decouples upload from processing)
- PostgreSQL pgvector for semantic search (leverages existing infrastructure)
- SSE for real-time progress (simpler than WebSocket)
- Redis for upload state (fast, temporary storage)
- Go microservices for performance-critical operations (classification, clustering)

### Known Challenges
- Handling large file uploads (100MB+)
- Coordinating between multiple services
- Real-time event streaming reliability
- Database performance under load
- Security of presigned URLs
- Tesseract OCR accuracy on poor-quality scans

### Future Enhancements
- Batch upload support
- Drag & drop folder upload
- Upload templates
- Evidence versioning
- Audit trail logging
- Advanced search filters
- Multi-language OCR support
- Handwriting recognition
- Video/audio transcription

---

## Resources & References

### Documentation
- SvelteKit: https://kit.svelte.dev/
- FastAPI: https://fastapi.tiangolo.com/
- Tesseract OCR: https://github.com/UB-Mannheim/tesseract/wiki
- IBM Docling: https://github.com/IBM-Research/docling
- Qdrant: https://qdrant.tech/documentation/
- RabbitMQ: https://www.rabbitmq.com/documentation.html
- MinIO: https://min.io/docs/minio/linux/developers/python/

### Related Specs
- SvelteKit Evidence Upload Integration: `.kiro/specs/sveltekit-evidence-upload-integration/`
- Phase 72 Performance Optimization: `.kiro/specs/phase72-performance-optimization/`

### Existing Codebase
- Evidence Pipeline Backend: `backend/evidence-pipeline/`
- Go Microservices: `go-microservice/`
- SvelteKit Frontend: `sveltekit-frontend/`
- Python Services: `python-services/`
- RAG Ranking System: `sveltekit-frontend/src/lib/services/rag-ranking-system.ts`
- PostgreSQL Vector Storage: `sveltekit-frontend/src/lib/services/postgresql-vector-storage.ts`
- Legal Dashboard: `sveltekit-frontend/src/routes/dashboard/legal-progress/`
- Docker Compose: `sveltekit-frontend/docker-compose.full.yml`

---

**Document Version**: 1.0
**Last Updated**: December 13, 2025
**Status**: Ready for Implementation

