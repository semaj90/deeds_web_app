# Requirements Document: SvelteKit Evidence Upload Integration

## Introduction

This document specifies the requirements for integrating evidence upload functionality into the existing SvelteKit legal AI application. The feature enables users to upload legal documents (PDFs, images, scans) directly within case pages, with automatic processing through the Granite-Docling worker pipeline, RAG preparation, and real-time progress monitoring via the Legal Dashboard.

The integration bridges the SvelteKit frontend with the existing infrastructure (MinIO, RabbitMQ, PostgreSQL, Redis, Granite-Docling worker) to create a seamless evidence ingestion workflow.

---

## Glossary

- **Evidence**: Legal documents (PDFs, images, scans) uploaded by users
- **Case**: A legal case containing multiple pieces of evidence
- **MinIO**: S3-compatible object storage for document files
- **RabbitMQ**: Message queue for async job processing
- **Granite-Docling Worker**: Python service that processes documents (OCR, chunking, embedding)
- **RAG**: Retrieval-Augmented Generation system for semantic search
- **SSE**: Server-Sent Events for real-time progress streaming
- **Drizzle ORM**: TypeScript ORM for database operations
- **pgvector**: PostgreSQL extension for vector similarity search
- **BM25**: Keyword-based ranking algorithm
- **Semantic Ranking**: Vector-based relevance ranking
- **Presigned URL**: Time-limited URL for direct MinIO uploads
- **Evidence File**: Database record representing an uploaded document
- **Evidence Chunk**: Semantic chunk of text extracted from evidence
- **Evidence Embedding**: Vector representation of evidence chunk

---

## Requirements

### Requirement 1: Evidence Upload UI

**User Story**: As a legal professional, I want to upload evidence documents directly from a case page, so that I can quickly add supporting documents to my case.

#### Acceptance Criteria

1. WHEN user navigates to `/cases/[id]/evidence/upload`, THE system SHALL display an evidence upload interface with file selection and progress tracking
   - _Requirements: 1.1, 1.2_

2. WHILE user is on the case page, THE system SHALL provide an "Upload Evidence" button that opens the upload modal
   - _Requirements: 1.1, 1.3_

3. IF user selects a file, THE system SHALL validate file type (PDF, PNG, JPG, TIFF, DOCX) and file size (<100MB)
   - _Requirements: 1.2, 1.4_

4. WHEN user confirms upload, THE system SHALL display real-time progress with percentage, current stage, and ETA
   - _Requirements: 1.5, 1.6_

5. WHERE user is not logged in, THE system SHALL redirect to login modal before allowing upload
   - _Requirements: 1.7_

---

### Requirement 2: MinIO Integration

**User Story**: As a system, I need to store uploaded evidence files in MinIO with proper organization and access control, so that documents are securely stored and easily retrievable.

#### Acceptance Criteria

1. WHEN evidence is uploaded for a case, THE system SHALL store the file in MinIO at path `lawpdfs/cases/<caseId>/<filename>`
   - _Requirements: 2.1, 2.2_

2. WHEN user initiates upload, THE system SHALL generate a presigned URL valid for 15 minutes
   - _Requirements: 2.3, 2.4_

3. IF file upload to MinIO fails, THE system SHALL retry up to 3 times with exponential backoff
   - _Requirements: 2.5, 2.6_

4. WHILE file is uploading, THE system SHALL track upload progress and allow cancellation
   - _Requirements: 2.7, 2.8_

5. WHEN upload completes successfully, THE system SHALL verify file integrity using checksums
   - _Requirements: 2.9_

---

### Requirement 3: RabbitMQ Job Dispatch

**User Story**: As a system, I need to queue document processing jobs asynchronously, so that uploads complete quickly and processing happens in the background.

#### Acceptance Criteria

1. WHEN evidence file is successfully uploaded to MinIO, THE system SHALL dispatch a processing job to RabbitMQ queue `document.process`
   - _Requirements: 3.1, 3.2_

2. WHEN job is dispatched, THE system SHALL include metadata: caseId, evidenceId, filename, fileSize, uploadedBy, timestamp
   - _Requirements: 3.3, 3.4_

3. IF RabbitMQ is unavailable, THE system SHALL queue the job locally and retry when service recovers
   - _Requirements: 3.5, 3.6_

4. WHILE job is processing, THE system SHALL emit status events to SSE stream for real-time dashboard updates
   - _Requirements: 3.7, 3.8_

5. WHEN job completes, THE system SHALL update evidence record with processing status and results
   - _Requirements: 3.9_

---

### Requirement 4: Database Schema Updates

**User Story**: As a system, I need to store evidence metadata and processing results in PostgreSQL, so that evidence is tracked and searchable.

#### Acceptance Criteria

1. THE system SHALL create `evidence_files` table with columns: id, caseId, filename, fileSize, fileType, minioPath, uploadedBy, uploadedAt, processingStatus, processingError
   - _Requirements: 4.1, 4.2_

2. THE system SHALL create `evidence_chunks` table with columns: id, evidenceId, chunkIndex, content, pageNumber, metadata, createdAt
   - _Requirements: 4.3, 4.4_

3. THE system SHALL create `evidence_embeddings` table with columns: id, chunkId, embedding (vector), metadata, createdAt
   - _Requirements: 4.5, 4.6_

4. WHEN evidence is processed, THE system SHALL insert chunk records with semantic content and page references
   - _Requirements: 4.7, 4.8_

5. WHEN embeddings are generated, THE system SHALL store vectors in pgvector format for semantic search
   - _Requirements: 4.9, 4.10_

---

### Requirement 5: Modal Flows & UX

**User Story**: As a user, I want intuitive modal flows for case selection, case creation, and login, so that I can upload evidence without friction.

#### Acceptance Criteria

1. WHEN user uploads from case page, THE system SHALL proceed directly to upload without modal
   - _Requirements: 5.1, 5.2_

2. WHEN user uploads from homepage (logged in), THE system SHALL display modal with case search and recent cases list
   - _Requirements: 5.3, 5.4_

3. IF user selects "Create New Case", THE system SHALL prompt for case name and type, then create case and proceed to upload
   - _Requirements: 5.5, 5.6_

4. WHEN user uploads from homepage (not logged in), THE system SHALL display login modal before proceeding
   - _Requirements: 5.7, 5.8_

5. AFTER login, THE system SHALL resume original upload attempt automatically
   - _Requirements: 5.9, 5.10_

---

### Requirement 6: Processing Pipeline Integration

**User Story**: As a system, I need to integrate with the Granite-Docling worker pipeline, so that uploaded documents are processed for OCR, chunking, and embedding.

#### Acceptance Criteria

1. WHEN RabbitMQ job is consumed by worker, THE system SHALL fetch document from MinIO and process through pipeline
   - _Requirements: 6.1, 6.2_

2. WHILE processing, THE system SHALL emit status events: classification, gpu_processing, chunking, embedding, indexing
   - _Requirements: 6.3, 6.4_

3. WHEN processing completes, THE system SHALL store chunks in `evidence_chunks` table with content and metadata
   - _Requirements: 6.5, 6.6_

4. WHEN embeddings are generated, THE system SHALL store vectors in `evidence_embeddings` table for semantic search
   - _Requirements: 6.7, 6.8_

5. IF processing fails, THE system SHALL update evidence record with error details and allow retry
   - _Requirements: 6.9, 6.10_

---

### Requirement 7: Real-Time Progress Monitoring

**User Story**: As a user, I want to see real-time progress updates while my document is being processed, so that I know the system is working.

#### Acceptance Criteria

1. WHEN evidence upload begins, THE system SHALL establish SSE connection to `/api/evidence/[id]/stream`
   - _Requirements: 7.1, 7.2_

2. WHILE processing, THE system SHALL emit events with: stage, percentage, eta, details, metrics
   - _Requirements: 7.3, 7.4_

3. WHEN processing stage changes, THE system SHALL update Legal Dashboard with new stage and progress
   - _Requirements: 7.5, 7.6_

4. IF processing fails, THE system SHALL emit error event with error message and retry option
   - _Requirements: 7.7, 7.8_

5. WHEN processing completes, THE system SHALL emit completion event with results summary
   - _Requirements: 7.9, 7.10_

---

### Requirement 8: Error Handling & Resilience

**User Story**: As a system, I need robust error handling and recovery mechanisms, so that failures don't lose user data.

#### Acceptance Criteria

1. IF file upload fails, THE system SHALL display error message and allow retry
   - _Requirements: 8.1, 8.2_

2. IF RabbitMQ job fails, THE system SHALL retry up to 3 times with exponential backoff
   - _Requirements: 8.3, 8.4_

3. IF processing fails, THE system SHALL store error details and allow manual retry from UI
   - _Requirements: 8.5, 8.6_

4. WHEN system recovers from failure, THE system SHALL resume processing from last checkpoint
   - _Requirements: 8.7, 8.8_

5. IF database insert fails, THE system SHALL log error and alert administrator
   - _Requirements: 8.9, 8.10_

---

### Requirement 9: Search & Retrieval Integration

**User Story**: As a user, I want uploaded evidence to be searchable via semantic and keyword search, so that I can find relevant documents quickly.

#### Acceptance Criteria

1. WHEN evidence chunks are stored, THE system SHALL index them with BM25 for keyword search
   - _Requirements: 9.1, 9.2_

2. WHEN embeddings are generated, THE system SHALL enable semantic search via pgvector
   - _Requirements: 9.3, 9.4_

3. WHEN user searches, THE system SHALL apply R2 ranking (BM25) and R3 ranking (semantic) for combined results
   - _Requirements: 9.5, 9.6_

4. WHILE searching, THE system SHALL filter results by case scope if case-scoped search is requested
   - _Requirements: 9.7, 9.8_

5. WHEN results are returned, THE system SHALL include chunk content, page number, and relevance score
   - _Requirements: 9.9, 9.10_

---

### Requirement 10: Security & Access Control

**User Story**: As a system, I need to enforce access control and security, so that users can only access their own cases and evidence.

#### Acceptance Criteria

1. WHEN user uploads evidence, THE system SHALL verify user has access to the case
   - _Requirements: 10.1, 10.2_

2. WHEN user searches evidence, THE system SHALL filter results to only cases user has access to
   - _Requirements: 10.3, 10.4_

3. IF user attempts unauthorized access, THE system SHALL return 403 Forbidden error
   - _Requirements: 10.5, 10.6_

4. WHEN evidence is stored in MinIO, THE system SHALL use presigned URLs with time limits
   - _Requirements: 10.7, 10.8_

5. WHILE processing, THE system SHALL not expose sensitive data in logs or error messages
   - _Requirements: 10.9, 10.10_

---

### Requirement 11: Performance & Scalability

**User Story**: As a system, I need to handle multiple concurrent uploads and process documents efficiently, so that the system scales with user demand.

#### Acceptance Criteria

1. WHEN multiple users upload simultaneously, THE system SHALL handle up to 10 concurrent uploads without degradation
   - _Requirements: 11.1, 11.2_

2. WHILE processing, THE system SHALL maintain <100ms response time for API endpoints
   - _Requirements: 11.3, 11.4_

3. WHEN documents are processed, THE system SHALL complete 1-5 page documents in <2 seconds
   - _Requirements: 11.5, 11.6_

4. WHEN documents are processed, THE system SHALL complete 20-page documents in 2-4 seconds
   - _Requirements: 11.7, 11.8_

5. WHILE system is under load, THE system SHALL maintain 80%+ GPU utilization and 70%+ CPU utilization
   - _Requirements: 11.9, 11.10_

---

### Requirement 12: Infrastructure Bootstrap & Recovery

**User Story**: As an operator, I need to safely recover the system after container deletion or host reboot, so that the system can be reliably redeployed.

#### Acceptance Criteria

1. WHEN containers are deleted and recreated, THE system SHALL provide an idempotent bootstrap routine that recreates all necessary infrastructure
   - _Requirements: 12.1, 12.2_

2. WHEN bootstrap runs, THE system SHALL create MinIO bucket directories (lawpdfs/cases, documents/evidence, lawpdfs/global)
   - _Requirements: 12.1, 12.3_

3. WHEN bootstrap runs, THE system SHALL apply all database migrations and create indexes
   - _Requirements: 12.1, 12.4_

4. WHEN bootstrap completes, THE system SHALL verify connectivity to all services (MinIO, PostgreSQL, RabbitMQ, Redis)
   - _Requirements: 12.5, 12.6_

5. IF bootstrap fails, THE system SHALL provide clear error messages and recovery steps
   - _Requirements: 12.7, 12.8_

---

## Summary

This specification defines a complete evidence upload and processing workflow that integrates the SvelteKit frontend with the Granite-Docling worker, RAG system, and Legal Dashboard. The implementation focuses on user experience, reliability, security, and performance while leveraging existing infrastructure components.

**Key Integration Points**:
- MinIO for document storage
- RabbitMQ for async job processing
- PostgreSQL pgvector for semantic search
- Granite-Docling worker for document processing
- Legal Dashboard for real-time monitoring
- Redis for caching and session management

**Success Criteria**:
- Users can upload evidence from case pages
- Documents are processed through full pipeline
- Real-time progress visible in dashboard
- Evidence is searchable via semantic and keyword search
- System handles concurrent uploads efficiently
- All errors are handled gracefully with retry logic
