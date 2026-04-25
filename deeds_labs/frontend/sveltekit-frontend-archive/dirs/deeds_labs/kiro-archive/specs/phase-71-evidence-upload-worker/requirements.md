# Phase 71: Evidence Upload + Worker Trigger - Requirements

## Introduction

Phase 71 implements the Evidence Upload system with worker pipeline integration, enabling users to upload legal evidence documents and automatically trigger the processing pipeline. The system integrates with Phase 3D (Worker Pipeline) to process documents through OCR, chunking, embedding, and search indexing.

The system integrates:
- File upload via MinIO
- RabbitMQ task publishing
- Worker pipeline triggering
- Real-time processing status
- Progress tracking and notifications

## Glossary

- **Evidence**: Uploaded legal documents (PDFs, images)
- **Upload**: File transfer to MinIO storage
- **Worker Pipeline**: OCR → Chunking → Embedding → Indexing
- **Task Queue**: RabbitMQ for async processing
- **Processing Status**: Real-time progress tracking
- **Webhook**: Callback for completion notifications
- **Chunk**: Semantic unit extracted from document
- **Embedding**: Vector representation of chunk

## Requirements

### Requirement 1: File Upload to MinIO

**User Story:** As a legal professional, I want to upload evidence documents, so that they can be processed and searched.

#### Acceptance Criteria

1. WHEN a user selects a file, THE system SHALL validate file type (PDF, DOCX, images)
2. WHEN file is validated, THE system SHALL upload to MinIO with metadata
3. WHEN upload completes, THE system SHALL return upload ID and status
4. WHEN upload fails, THE system SHALL display error message with retry option
5. WHERE file exceeds 100MB, THE system SHALL reject with size warning

### Requirement 2: Worker Pipeline Triggering

**User Story:** As a system administrator, I want to trigger worker pipeline automatically, so that documents are processed immediately after upload.

#### Acceptance Criteria

1. WHEN file is uploaded, THE system SHALL publish task to RabbitMQ
2. WHEN task is published, THE system SHALL include file path and metadata
3. WHEN worker receives task, THE system SHALL start OCR processing
4. WHEN OCR completes, THE system SHALL trigger chunking
5. WHERE worker is unavailable, THE system SHALL queue task for retry

### Requirement 3: Real-time Processing Status

**User Story:** As a user, I want to see processing progress in real-time, so that I know when my document is ready.

#### Acceptance Criteria

1. WHEN document is processing, THE system SHALL emit status events via SSE
2. WHEN status changes, THE system SHALL update progress percentage
3. WHEN processing completes, THE system SHALL emit completion event
4. WHEN error occurs, THE system SHALL emit error event with details
5. WHERE connection drops, THE system SHALL reconnect and resume streaming

### Requirement 4: Processing Status Tracking

**User Story:** As a legal professional, I want to track document processing status, so that I can plan my work accordingly.

#### Acceptance Criteria

1. WHEN document is uploaded, THE system SHALL create processing record
2. WHEN processing progresses, THE system SHALL update status (pending, processing, complete, error)
3. WHEN processing completes, THE system SHALL store completion timestamp
4. WHEN error occurs, THE system SHALL store error details and retry count
5. WHERE processing takes >30 minutes, THE system SHALL send timeout warning

### Requirement 5: Webhook Notifications

**User Story:** As a system administrator, I want webhook notifications, so that external systems can react to processing events.

#### Acceptance Criteria

1. WHEN processing completes, THE system SHALL POST to configured webhook URL
2. WHEN webhook is called, THE system SHALL include document ID and status
3. WHEN webhook fails, THE system SHALL retry with exponential backoff
4. WHEN webhook succeeds, THE system SHALL log completion
5. WHERE webhook URL is invalid, THE system SHALL disable and alert admin

### Requirement 6: Upload History

**User Story:** As a legal professional, I want to see upload history, so that I can track what documents have been processed.

#### Acceptance Criteria

1. WHEN user views uploads, THE system SHALL display list of uploaded documents
2. WHEN list is displayed, THE system SHALL show upload date, status, and file size
3. WHEN user clicks document, THE system SHALL show processing details
4. WHEN document is complete, THE system SHALL show chunk count and search status
5. WHERE document failed, THE system SHALL show error details and retry option

### Requirement 7: Upload Performance

**User Story:** As a system administrator, I want fast uploads, so that users have responsive experience.

#### Acceptance Criteria

1. WHEN file is uploaded, THE system SHALL complete within 5 seconds for <50MB files
2. WHEN upload completes, THE system SHALL start worker task within 1 second
3. WHEN worker processes, THE system SHALL complete OCR within 30 seconds per page
4. WHEN chunking completes, THE system SHALL complete within 5 seconds
5. WHERE performance degrades, THE system SHALL log warning with metrics

### Requirement 8: Upload Error Handling

**User Story:** As a user, I want clear error messages, so that I understand what went wrong.

#### Acceptance Criteria

1. IF file type is invalid, THEN THE system SHALL display "Unsupported file type"
2. IF file size exceeds limit, THEN THE system SHALL display "File too large"
3. IF upload fails, THEN THE system SHALL display "Upload failed, please retry"
4. IF worker is unavailable, THEN THE system SHALL display "Processing service unavailable"
5. IF processing fails, THEN THE system SHALL display "Processing failed" with error details

---

## Summary

Phase 71 implements a complete Evidence Upload system with worker pipeline integration, enabling automatic document processing with real-time status tracking and webhook notifications.
