# Phase 71: Evidence Upload + Worker Trigger - Implementation Plan

- [ ] 1. Implement Upload Service Backend
  - Create `backend/upload_service.py` with UploadService class
  - Implement file validation (type, size)
  - Implement MinIO upload with metadata
  - Implement RabbitMQ task publishing
  - Add latency tracking and logging
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5_

- [ ] 2. Implement Progress Tracker
  - Create `backend/progress_tracker.py` with ProgressTracker class
  - Implement progress tracking in Postgres
  - Implement SSE event emission
  - Implement webhook calling
  - Add retry logic with exponential backoff
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

- [ ] 3. Implement Upload API Endpoints
  - Create `backend/api/upload_routes.py` with FastAPI routes
  - Implement `POST /api/upload/file` endpoint
  - Implement `GET /api/upload/progress/{doc_id}` SSE endpoint
  - Implement `GET /api/upload/history/{case_id}` endpoint
  - Add request validation and error handling
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 3.1, 3.2_

- [ ] 4. Implement Upload UI Page
  - Create `sveltekit-frontend/src/routes/upload/+page.svelte`
  - Implement file input with drag-and-drop
  - Implement progress bar with percentage
  - Implement status display
  - Add error message display
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5_

- [ ] 5. Implement Upload Service (Frontend)
  - Create `sveltekit-frontend/src/lib/services/uploadService.ts`
  - Implement file upload via HTTP
  - Implement SSE connection for progress
  - Implement progress parsing
  - Add error handling and retry logic
  - _Requirements: 1.1, 1.2, 1.3_

- [ ] 6. Implement Progress Display Component
  - Create `sveltekit-frontend/src/lib/components/UploadProgress.svelte`
  - Implement progress bar rendering
  - Implement status display
  - Implement real-time updates
  - Add error display
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

- [ ] 7. Implement Upload History Component
  - Create `sveltekit-frontend/src/lib/components/UploadHistory.svelte`
  - Implement upload list rendering
  - Display upload metadata (date, size, status)
  - Implement click handlers for details
  - Add retry button for failed uploads
  - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5_

- [ ] 8. Implement Worker Pipeline Integration
  - Create `backend/worker_integration.py` with WorkerIntegration class
  - Implement RabbitMQ task publishing
  - Implement task format standardization
  - Implement error handling and retry logic
  - Add task status tracking
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_

- [ ] 9. Implement Processing Status Tracking
  - Create `backend/models/upload.py` with Upload model
  - Implement Postgres schema for uploads
  - Implement status updates
  - Implement progress tracking
  - Add error logging
  - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_

- [ ] 10. Implement Webhook Notifications
  - Create `backend/webhook_service.py` with WebhookService class
  - Implement webhook calling
  - Implement retry logic with exponential backoff
  - Implement error handling
  - Add webhook logging
  - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_

- [ ] 11. Implement Upload Performance Monitoring
  - Create `backend/upload_metrics.py` with MetricsCollector class
  - Track upload latency
  - Track worker trigger latency
  - Track processing latency
  - Implement latency logging and alerting
  - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5_

- [ ] 12. Implement Upload Error Handling
  - Update `backend/api/upload_routes.py` with error handlers
  - Implement file type validation
  - Implement file size validation
  - Implement upload failure handling
  - Implement worker unavailable handling
  - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5_

- [ ]* 13. Write Unit Tests for Upload Service
  - Test file validation
  - Test MinIO upload
  - Test RabbitMQ publishing
  - Test error handling
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5_

- [ ]* 14. Write Unit Tests for Progress Tracker
  - Test progress tracking
  - Test SSE event emission
  - Test webhook calling
  - Test retry logic
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

- [ ]* 15. Write Integration Tests for Upload Pipeline
  - Test end-to-end upload (file → MinIO → RabbitMQ)
  - Test progress tracking
  - Test worker pipeline integration
  - Test webhook notifications
  - _Requirements: 1.1, 2.1, 3.1, 5.1_

- [ ]* 16. Write Performance Tests
  - Test upload latency (<5s for <50MB)
  - Test worker trigger latency (<1s)
  - Test progress streaming latency (<100ms)
  - Test concurrent uploads (10+ simultaneous)
  - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5_

- [ ]* 17. Write UI Tests for Upload Page
  - Test file selection and drag-and-drop
  - Test progress bar display
  - Test status updates
  - Test error messages
  - Test upload history
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5_

- [ ] 18. Create Upload Documentation
  - Create `docs/UPLOAD_API.md` with API documentation
  - Document all endpoints with examples
  - Document file format requirements
  - Document error codes
  - Document performance characteristics
  - _Requirements: All_

- [ ] 19. Create Upload User Guide
  - Create `docs/UPLOAD_USER_GUIDE.md` with user guide
  - Document upload interface
  - Document progress tracking
  - Document upload history
  - Document error handling
  - _Requirements: All_

- [ ] 20. Deploy Upload Service
  - Build Docker image for upload service
  - Configure environment variables
  - Deploy to production
  - Verify MinIO connectivity
  - Verify RabbitMQ connectivity
  - Verify Postgres connectivity
  - _Requirements: All_
