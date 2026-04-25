# Implementation Plan: SvelteKit Evidence Upload Integration

## Overview

This implementation plan breaks down the evidence upload integration into discrete, manageable coding tasks. Each task builds incrementally on previous tasks, starting with database schema setup, then API endpoints, frontend components, and finally integration with the processing pipeline.

---

## Tasks

- [ ] 0. Infrastructure bootstrap and recovery

  - [ ] 0.1 Create bootstrap script for MinIO buckets and directories
    - Create lawpdfs/cases directory structure
    - Create documents/evidence directory structure
    - Create lawpdfs/global directory structure
    - Ensure idempotent execution (safe to run multiple times)
    - _Requirements: 11.1, 11.2_

  - [ ] 0.2 Create database migration runner
    - Run Drizzle ORM migrations on startup
    - Verify schema creation
    - Create indexes and constraints
    - Handle migration rollback on failure
    - _Requirements: 4.1, 4.3, 4.5_

  - [ ] 0.3 Create health check and recovery script
    - Verify MinIO connectivity
    - Verify PostgreSQL connectivity
    - Verify RabbitMQ connectivity
    - Verify Redis connectivity
    - Report status and recovery steps
    - _Requirements: 8.7, 8.8_

  - [ ] 0.4 Document container recovery procedure
    - Document "How to recover after container deletion"
    - Create Makefile targets for bootstrap
    - Document idempotent bootstrap routine
    - Include troubleshooting guide
    - _Requirements: 8.7, 8.8_

- [ ] 1. Set up database schema and migrations
  - [ ] 1.1 Create Drizzle ORM schema for evidence_files table
    - Define columns: id, case_id, filename, file_size, file_type, minio_path, uploaded_by, uploaded_at, processing_status, processing_error, chunk_count, metadata
    - Add indexes on case_id, processing_status, uploaded_by
    - _Requirements: 4.1, 4.2_

  - [ ] 1.2 Create Drizzle ORM schema for evidence_chunks table
    - Define columns: id, evidence_id, chunk_index, content, page_number, section_title, metadata
    - Add indexes on evidence_id, page_number
    - _Requirements: 4.3, 4.4_

  - [ ] 1.3 Create Drizzle ORM schema for evidence_embeddings table
    - Define columns: id, chunk_id, embedding (vector), embedding_model, metadata
    - Add HNSW index on embedding column
    - _Requirements: 4.5, 4.6_

  - [ ] 1.4 Create and run database migration
    - Generate migration files
    - Apply migrations to PostgreSQL
    - Verify schema creation
    - _Requirements: 4.1, 4.3, 4.5_

- [ ] 2. Implement MinIO service layer
  - [ ] 2.1 Create MinIO client wrapper
    - Initialize MinIO connection with credentials
    - Implement connection pooling
    - Add error handling and retry logic
    - _Requirements: 2.1, 2.2_

  - [ ] 2.2 Implement presigned URL generation
    - Generate presigned URLs for 15-minute expiry
    - Support custom bucket and key paths
    - Return URL with metadata
    - _Requirements: 2.3, 2.4_

  - [ ] 2.3 Implement file verification
    - Verify file exists in MinIO
    - Get file metadata (size, content-type)
    - Verify file integrity using checksums
    - _Requirements: 2.9_

  - [ ] 2.4 Implement file operations
    - Delete file from MinIO
    - Get file metadata
    - List files in bucket
    - _Requirements: 2.1, 2.2_

- [ ] 3. Implement RabbitMQ service layer
  - [ ] 3.1 Create RabbitMQ connection manager
    - Initialize RabbitMQ connection
    - Implement connection pooling
    - Add error handling and reconnection logic
    - _Requirements: 3.1, 3.2_

  - [ ] 3.2 Implement job dispatch
    - Dispatch processing jobs to document.process queue
    - Include metadata: caseId, evidenceId, filename, fileSize, uploadedBy, timestamp
    - Handle queue unavailability with local queueing
    - _Requirements: 3.1, 3.2, 3.3_

  - [ ] 3.3 Implement event subscription
    - Subscribe to processing events for evidenceId
    - Receive status updates from worker
    - Handle event stream lifecycle
    - _Requirements: 3.7, 3.8_

  - [ ] 3.4 Implement retry logic
    - Retry failed jobs up to 3 times
    - Implement exponential backoff
    - Log retry attempts
    - _Requirements: 3.5, 3.6_

- [ ] 4. Implement upload API endpoints
  - [ ] 4.1 Create POST /api/cases/[id]/evidence/upload endpoint
    - Validate user has access to case
    - Validate file type and size
    - Create evidence_files record (status: pending)
    - Generate MinIO presigned URL
    - Return upload details (evidenceId, presignedUrl, expiresIn)
    - _Requirements: 1.2, 1.4, 2.3, 2.4_

  - [ ] 4.2 Create POST /api/evidence/[id]/complete endpoint
    - Verify upload completion in MinIO
    - Verify file checksum
    - Update evidence_files record (status: processing)
    - Dispatch RabbitMQ job
    - Return processing status
    - _Requirements: 3.1, 3.2, 3.3_

  - [ ] 4.3 Create GET /api/evidence/[id]/stream endpoint (SSE)
    - Establish SSE connection
    - Subscribe to RabbitMQ events
    - Stream ProcessingEvent objects
    - Handle connection lifecycle
    - _Requirements: 7.1, 7.2, 7.3, 7.4_

  - [ ] 4.4 Create POST /api/cases endpoint (Create Case)
    - Validate case name and type
    - Create case record in database
    - Return caseId and metadata
    - _Requirements: 5.5, 5.6_

  - [ ] 4.5 Create error handling middleware
    - Catch and log errors
    - Return appropriate HTTP status codes
    - Sanitize error messages
    - _Requirements: 8.1, 8.2_

- [ ] 5. Implement frontend components
  - [ ] 5.1 Create EvidenceUploadButton.svelte component
    - Display upload button on case page
    - Handle click to open upload modal
    - Support both case-scoped and homepage uploads
    - _Requirements: 1.1, 1.3_

  - [ ] 5.2 Create CaseSelectModal.svelte component
    - Display case search bar
    - Show recent cases list (last 5)
    - Implement "Create New Case" button
    - Handle case selection and creation
    - _Requirements: 5.3, 5.4, 5.5_

  - [ ] 5.3 Create EvidenceUploadModal.svelte component
    - Implement file selection (drag & drop + click)
    - Validate file type and size
    - Display upload progress
    - Handle upload cancellation
    - _Requirements: 1.2, 1.4, 1.5_

  - [ ] 5.4 Create UploadProgressCard.svelte component
    - Display processing stage
    - Show progress percentage
    - Display ETA countdown
    - Show metrics (GPU/CPU utilization)
    - Handle error display with retry option
    - _Requirements: 1.5, 1.6, 7.3, 7.4_

  - [ ] 5.5 Create authentication flow
    - Detect if user is logged in
    - Redirect to login modal if needed
    - Resume upload after login
    - _Requirements: 1.7, 5.7, 5.8, 5.9_

- [ ] 6. Implement upload service layer
  - [ ] 6.1 Create uploadEvidenceService.ts
    - Implement initiateUpload() method
    - Implement completeUpload() method
    - Implement getUploadStatus() method
    - Implement streamProcessingEvents() method
    - _Requirements: 1.2, 1.4, 3.1, 3.2_

  - [ ] 6.2 Implement file validation
    - Validate file type (PDF, PNG, JPG, TIFF, DOCX)
    - Validate file size (<100MB)
    - Return validation errors
    - _Requirements: 1.2, 1.4_

  - [ ] 6.3 Implement upload state management
    - Track upload progress
    - Store upload state in Redis
    - Handle upload resumption
    - _Requirements: 2.7, 2.8_

  - [ ] 6.4 Implement error handling and retry
    - Catch upload errors
    - Implement retry logic
    - Log errors for debugging
    - _Requirements: 8.1, 8.2, 8.3, 8.4_

- [ ] 7. Implement processing pipeline integration
  - [ ] 7.1 Create event listener for RabbitMQ
    - Listen for processing events from worker
    - Parse ProcessingEvent objects
    - Update evidence_files record with status
    - _Requirements: 6.1, 6.2_

  - [ ] 7.2 Implement chunk storage
    - Receive chunks from worker
    - Insert into evidence_chunks table
    - Store page numbers and section titles
    - _Requirements: 6.5, 6.6_

  - [ ] 7.3 Implement embedding storage
    - Receive embeddings from worker
    - Insert into evidence_embeddings table
    - Create pgvector indexes
    - _Requirements: 6.7, 6.8_

  - [ ] 7.4 Implement error handling
    - Handle processing failures
    - Update evidence_files with error details
    - Allow manual retry from UI
    - _Requirements: 6.9, 6.10_

- [ ] 8. Implement search and retrieval integration
  - [ ] 8.1 Create BM25 indexing
    - Index chunks with BM25 algorithm
    - Support keyword search
    - Update indexes incrementally
    - _Requirements: 9.1, 9.2_

  - [ ] 8.2 Create semantic search
    - Query pgvector embeddings
    - Support semantic similarity search
    - Filter by case scope
    - _Requirements: 9.3, 9.4_

  - [ ] 8.3 Implement combined ranking
    - Apply R2 ranking (BM25)
    - Apply R3 ranking (semantic)
    - Combine scores with weights (0.3*R2 + 0.7*R3)
    - _Requirements: 9.5, 9.6_

  - [ ] 8.4 Implement search filtering
    - Filter results by case
    - Filter by date range
    - Filter by document type
    - _Requirements: 9.7, 9.8_

- [ ] 9. Implement security and access control
  - [ ] 9.1 Create access control middleware
    - Verify user has access to case
    - Verify user has access to evidence
    - Return 403 Forbidden on unauthorized access
    - _Requirements: 10.1, 10.2, 10.3, 10.4_

  - [ ] 9.2 Implement presigned URL security
    - Use time-limited presigned URLs
    - Validate URL expiry
    - Prevent URL reuse
    - _Requirements: 10.7, 10.8_

  - [ ] 9.3 Implement data sanitization
    - Sanitize error messages
    - Don't expose sensitive data in logs
    - Validate all user inputs
    - _Requirements: 10.9, 10.10_

  - [ ] 9.4 Implement rate limiting
    - Limit uploads per user per hour
    - Limit concurrent uploads per user
    - Return 429 Too Many Requests on limit exceeded
    - _Requirements: 11.1, 11.2_

- [ ] 10. Implement performance optimization
  - [ ] 10.1 Optimize database queries
    - Add indexes for common queries
    - Use connection pooling
    - Batch database inserts
    - _Requirements: 11.3, 11.4_

  - [ ] 10.2 Optimize API response times
    - Cache presigned URLs in Redis
    - Implement response compression
    - Use async/await for non-blocking operations
    - _Requirements: 11.3, 11.4_

  - [ ] 10.3 Optimize frontend performance
    - Lazy load upload components
    - Use web workers for file hashing
    - Implement chunked uploads for large files
    - _Requirements: 11.1, 11.2_

  - [ ] 10.4 Monitor performance metrics
    - Track upload success rate
    - Track processing time
    - Monitor resource utilization
    - _Requirements: 11.9, 11.10_

- [ ] 11. Implement integration with Legal Dashboard
  - [ ] 11.1 Create SSE event streaming
    - Stream ProcessingEvent to dashboard
    - Include stage, percentage, ETA, metrics
    - Handle connection lifecycle
    - _Requirements: 7.1, 7.2, 7.3, 7.4_

  - [ ] 11.2 Create metrics collection
    - Collect GPU utilization metrics
    - Collect CPU utilization metrics
    - Collect processing time metrics
    - _Requirements: 7.3, 7.4_

  - [ ] 11.3 Integrate with existing dashboard
    - Update Legal Dashboard with new events
    - Display evidence upload progress
    - Show processing metrics
    - _Requirements: 7.5, 7.6_

- [ ]* 12. Create unit tests (optional)
  - [ ]* 12.1 Write tests for upload service
    - Test initiateUpload() method
    - Test completeUpload() method
    - Test error handling
    - _Requirements: 1.2, 1.4_

  - [ ]* 12.2 Write tests for MinIO service
    - Test presigned URL generation
    - Test file verification
    - Test error handling
    - _Requirements: 2.3, 2.4_

  - [ ]* 12.3 Write tests for RabbitMQ service
    - Test job dispatch
    - Test event subscription
    - Test retry logic
    - _Requirements: 3.1, 3.2_

  - [ ]* 12.4 Write tests for API endpoints
    - Test upload initiation
    - Test upload completion
    - Test error responses
    - _Requirements: 1.2, 1.4_

  - [ ]* 12.5 Write tests for frontend components
    - Test upload modal
    - Test case selection
    - Test progress display
    - _Requirements: 1.1, 1.3_

- [ ]* 13. Create integration tests (optional)
  - [ ]* 13.1 Test end-to-end upload flow
    - Upload file from case page
    - Verify MinIO storage
    - Verify RabbitMQ job dispatch
    - Verify database records
    - _Requirements: 1.1, 1.2, 2.1, 3.1_

  - [ ]* 13.2 Test case selection modal
    - Search for case
    - Create new case
    - Upload to selected case
    - _Requirements: 5.3, 5.4, 5.5_

  - [ ]* 13.3 Test progress streaming
    - Verify SSE connection
    - Verify event delivery
    - Verify dashboard updates
    - _Requirements: 7.1, 7.2, 7.3_

  - [ ]* 13.4 Test error handling
    - Test upload failure
    - Test retry mechanism
    - Test error display
    - _Requirements: 8.1, 8.2, 8.3_

  - [ ]* 13.5 Test security
    - Test access control
    - Test unauthorized access
    - Test rate limiting
    - _Requirements: 10.1, 10.2, 10.3_

- [ ]* 14. Create performance tests (optional)
  - [ ]* 14.1 Test concurrent uploads
    - Upload 10 files simultaneously
    - Verify no degradation
    - Monitor resource usage
    - _Requirements: 11.1, 11.2_

  - [ ]* 14.2 Test large file uploads
    - Upload 100MB file
    - Verify completion
    - Monitor memory usage
    - _Requirements: 11.1, 11.2_

  - [ ]* 14.3 Test API response times
    - Measure endpoint latency
    - Verify <100ms response time
    - Monitor under load
    - _Requirements: 11.3, 11.4_

  - [ ]* 14.4 Test processing throughput
    - Measure documents processed per second
    - Verify GPU/CPU utilization targets
    - Monitor queue depth
    - _Requirements: 11.9, 11.10_

---

## Task Execution Notes

### Prerequisites
- SvelteKit 5 frontend running
- PostgreSQL 17 with pgvector extension
- MinIO instance running
- RabbitMQ instance running
- Redis instance running
- Granite-Docling worker ready for integration
- Docker Compose infrastructure running

### Dependencies Between Tasks
1. Task 0 (bootstrap) should run first to ensure infrastructure is ready
2. Task 1 (database schema) must complete before all others
3. Tasks 2-3 (MinIO, RabbitMQ) can run in parallel
4. Task 4 (API endpoints) depends on tasks 2-3
5. Task 5 (frontend components) depends on task 4
6. Task 6 (upload service) depends on tasks 2-4
7. Task 7 (processing integration) depends on tasks 4-6
8. Task 8 (search integration) depends on task 7
9. Task 9 (security) can run in parallel with tasks 5-8
10. Task 10 (performance) depends on tasks 4-9
11. Task 11 (dashboard integration) depends on tasks 4-7
12. Tasks 12-14 (tests) can run after tasks 1-11

### Implementation Order
1. Task 0: Infrastructure bootstrap (½ day)
2. Task 1: Database schema (1-2 days)
3. Task 2: MinIO service (1-2 days)
4. Task 3: RabbitMQ service (1-2 days)
5. Task 4: API endpoints (2-3 days)
6. Task 5: Frontend components (2-3 days)
7. Task 6: Upload service (1-2 days)
8. Task 7: Processing integration (2-3 days)
9. Task 8: Search integration (2-3 days)
10. Task 9: Security (1-2 days)
11. Task 10: Performance optimization (1-2 days)
12. Task 11: Dashboard integration (1-2 days)
13. Tasks 12-14: Testing (optional)

---

## Success Criteria

### Phase Completion
- [ ] Task 0: Infrastructure bootstrap working (idempotent, recoverable)
- [ ] All 11 core tasks (1-11) implemented and tested
- [ ] Evidence upload working end-to-end
- [ ] Real-time progress visible in dashboard
- [ ] Evidence searchable via semantic and keyword search
- [ ] All error cases handled gracefully
- [ ] Security and access control enforced
- [ ] Performance targets met
- [ ] Infrastructure recovery tested and documented
- [ ] Documentation complete

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
- [ ] 1-5 page documents process in <2 seconds
- [ ] 20-page documents process in 2-4 seconds
- [ ] 50-100 page documents process in 4-10 seconds
- [ ] Handle 10 concurrent uploads without degradation
- [ ] GPU utilization 80%+
- [ ] CPU utilization 70%+

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

### Known Challenges
- Handling large file uploads (100MB+)
- Coordinating between multiple services
- Real-time event streaming reliability
- Database performance under load
- Security of presigned URLs

### Future Enhancements
- Batch upload support
- Drag & drop folder upload
- Upload templates
- Evidence versioning
- Audit trail logging
- Advanced search filters

---

## Resources & References

### Documentation
- SvelteKit: https://kit.svelte.dev/
- Drizzle ORM: https://orm.drizzle.team/
- MinIO SDK: https://min.io/docs/minio/linux/developers/javascript/
- RabbitMQ: https://www.rabbitmq.com/
- PostgreSQL pgvector: https://github.com/pgvector/pgvector

### Related Specs
- Granite-Docling Worker: `.kiro/specs/granite-docling-worker-optimized/`
- Legal Dashboard: `.kiro/specs/legal-dashboard-progress-ui/`

### Existing Codebase
- RAG Ranking System: `src/lib/services/rag-ranking-system.ts`
- PostgreSQL Vector Storage: `src/lib/services/postgresql-vector-storage.ts`
- Legal Dashboard: `sveltekit-frontend/src/routes/dashboard/legal-progress/`
- Docker Compose: `sveltekit-frontend/docker-compose.full.yml`

---

**Document Version**: 1.0
**Last Updated**: November 23, 2025
**Status**: Ready for Implementation
