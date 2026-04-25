# Requirements Document: Evidence Processing Pipeline

## Introduction

This document specifies the requirements for a FastAPI middleware that processes uploaded legal evidence documents through a multi-stage pipeline. The system integrates OCR (Tesseract), document parsing (IBM Docling 258M), and semantic analysis (Gemma3) to extract, structure, and embed evidence for RAG-based legal search.

The pipeline bridges the SvelteKit frontend upload system with backend processing workers, enabling real-time progress monitoring and high-quality document understanding.

---

## Glossary

- **Evidence**: Legal documents (PDFs, images, scans) uploaded by users
- **Tesseract**: Open-source OCR engine for text extraction from images and scanned documents
- **IBM Docling 258M**: Lightweight document parser for structured extraction (tables, sections, metadata)
- **Gemma3**: Google's 3B parameter LLM for embeddings and semantic analysis
- **FastAPI**: Python async web framework for the processing middleware
- **RabbitMQ**: Message queue for async job dispatch
- **MinIO**: S3-compatible object storage for document files
- **Qdrant**: Vector database for semantic search
- **PostgreSQL**: Relational database for metadata and chunks
- **SSE**: Server-Sent Events for real-time progress streaming
- **Processing Stage**: Discrete step in the pipeline (classification, OCR, parsing, chunking, embedding, indexing)
- **Evidence Chunk**: Semantic unit of text extracted from evidence
- **Evidence Embedding**: Vector representation of evidence chunk

---

## Requirements

### Requirement 1: Document Classification & Validation

**User Story**: As a system, I need to classify and validate uploaded documents, so that I can route them to appropriate processing pipelines.

#### Acceptance Criteria

1. WHEN a document is uploaded, THE system SHALL classify it by type (PDF, image, scanned document, mixed)
   - _Requirements: 1.1, 1.2_

2. WHEN a document is classified, THE system SHALL validate file integrity and format
   - _Requirements: 1.3, 1.4_

3. IF a document fails validation, THE system SHALL reject it with clear error message
   - _Requirements: 1.5, 1.6_

4. WHEN a document is classified as scanned/image, THE system SHALL route to OCR pipeline
   - _Requirements: 1.7, 1.8_

5. WHEN a document is classified as PDF/structured, THE system SHALL route to Docling parser
   - _Requirements: 1.9, 1.10_

---

### Requirement 2: OCR Processing (Tesseract)

**User Story**: As a system, I need to extract text from scanned documents and images using OCR, so that legal content is accessible for analysis.

#### Acceptance Criteria

1. WHEN a scanned document is processed, THE system SHALL apply Tesseract OCR with legal document optimization
   - _Requirements: 2.1, 2.2_

2. WHEN OCR processes a document, THE system SHALL preserve layout and structure (page breaks, sections)
   - _Requirements: 2.3, 2.4_

3. WHEN OCR completes, THE system SHALL return text with confidence scores per page
   - _Requirements: 2.5, 2.6_

4. IF OCR confidence is below threshold (70%), THE system SHALL flag for manual review
   - _Requirements: 2.7, 2.8_

5. WHEN OCR processes multi-page documents, THE system SHALL maintain page-level metadata
   - _Requirements: 2.9, 2.10_

---

### Requirement 3: Document Parsing (IBM Docling 258M)

**User Story**: As a system, I need to parse structured documents into semantic units, so that legal content is properly organized for retrieval.

#### Acceptance Criteria

1. WHEN a PDF or structured document is processed, THE system SHALL apply Docling parser for semantic extraction
   - _Requirements: 3.1, 3.2_

2. WHEN Docling parses a document, THE system SHALL extract: tables, sections, headings, paragraphs, lists
   - _Requirements: 3.3, 3.4_

3. WHEN parsing completes, THE system SHALL return structured JSON with element types and relationships
   - _Requirements: 3.5, 3.6_

4. WHEN a document contains tables, THE system SHALL preserve table structure and cell relationships
   - _Requirements: 3.7, 3.8_

5. WHEN parsing extracts metadata, THE system SHALL include: title, author, creation date, page count
   - _Requirements: 3.9, 3.10_

---

### Requirement 4: Semantic Chunking & Analysis

**User Story**: As a system, I need to chunk documents into semantic units and analyze them with Gemma3, so that evidence is properly indexed for legal search.

#### Acceptance Criteria

1. WHEN a document is parsed, THE system SHALL chunk it into semantic units (paragraphs, sections, tables)
   - _Requirements: 4.1, 4.2_

2. WHEN chunking occurs, THE system SHALL preserve context: page number, section title, document structure
   - _Requirements: 4.3, 4.4_

3. WHEN chunks are created, THE system SHALL apply Gemma3 for semantic analysis and tagging
   - _Requirements: 4.5, 4.6_

4. WHEN Gemma3 analyzes a chunk, THE system SHALL extract: legal entities, case references, statutes, key concepts
   - _Requirements: 4.7, 4.8_

5. WHEN analysis completes, THE system SHALL tag chunks with legal metadata for filtering and ranking
   - _Requirements: 4.9, 4.10_

---

### Requirement 5: Embedding Generation

**User Story**: As a system, I need to generate embeddings for all chunks using Gemma3, so that semantic search is enabled.

#### Acceptance Criteria

1. WHEN chunks are created, THE system SHALL generate embeddings using Gemma3 embedding model
   - _Requirements: 5.1, 5.2_

2. WHEN embeddings are generated, THE system SHALL use 768-dimensional vectors for consistency
   - _Requirements: 5.3, 5.4_

3. WHEN embeddings are complete, THE system SHALL store them in Qdrant with chunk metadata
   - _Requirements: 5.5, 5.6_

4. WHEN storing embeddings, THE system SHALL include: chunk_id, page_number, legal_tags, confidence
   - _Requirements: 5.7, 5.8_

5. WHEN embedding generation fails, THE system SHALL retry up to 3 times with exponential backoff
   - _Requirements: 5.9, 5.10_

---

### Requirement 6: Real-Time Progress Monitoring

**User Story**: As a user, I want to see real-time progress updates while my document is being processed, so that I know the system is working.

#### Acceptance Criteria

1. WHEN processing begins, THE system SHALL emit SSE events with: stage, percentage, eta, details
   - _Requirements: 6.1, 6.2_

2. WHEN each stage completes, THE system SHALL emit event with stage name and metrics
   - _Requirements: 6.3, 6.4_

3. WHEN processing encounters issues, THE system SHALL emit warning/error events with recovery options
   - _Requirements: 6.5, 6.6_

4. WHILE processing, THE system SHALL update Legal Dashboard with real-time metrics
   - _Requirements: 6.7, 6.8_

5. WHEN processing completes, THE system SHALL emit completion event with summary and statistics
   - _Requirements: 6.9, 6.10_

---

### Requirement 7: Error Handling & Recovery

**User Story**: As a system, I need robust error handling and recovery mechanisms, so that processing failures don't lose data.

#### Acceptance Criteria

1. IF any processing stage fails, THE system SHALL log error with full context and retry
   - _Requirements: 7.1, 7.2_

2. WHEN a stage fails, THE system SHALL emit error event and allow manual retry from UI
   - _Requirements: 7.3, 7.4_

3. IF OCR fails on a page, THE system SHALL skip that page and continue with others
   - _Requirements: 7.5, 7.6_

4. IF Docling parsing fails, THE system SHALL fall back to OCR for text extraction
   - _Requirements: 7.7, 7.8_

5. WHEN processing recovers from failure, THE system SHALL resume from last checkpoint
   - _Requirements: 7.9, 7.10_

---

### Requirement 8: Performance & Scalability

**User Story**: As a system, I need to process documents efficiently and handle concurrent uploads, so that the system scales with user demand.

#### Acceptance Criteria

1. WHEN processing documents, THE system SHALL complete 1-5 page documents in <5 seconds
   - _Requirements: 8.1, 8.2_

2. WHEN processing documents, THE system SHALL complete 20-page documents in 5-15 seconds
   - _Requirements: 8.3, 8.4_

3. WHEN processing documents, THE system SHALL complete 50-100 page documents in 15-30 seconds
   - _Requirements: 8.5, 8.6_

4. WHEN multiple documents are processed, THE system SHALL handle 5 concurrent uploads without degradation
   - _Requirements: 8.7, 8.8_

5. WHILE processing, THE system SHALL maintain GPU utilization 70%+ and CPU utilization 60%+
   - _Requirements: 8.9, 8.10_

---

### Requirement 9: Integration with SvelteKit Frontend

**User Story**: As a frontend, I need to communicate with the processing pipeline, so that uploads are processed seamlessly.

#### Acceptance Criteria

1. WHEN SvelteKit uploads a document, THE system SHALL accept it via presigned MinIO URL
   - _Requirements: 9.1, 9.2_

2. WHEN upload completes, THE system SHALL dispatch RabbitMQ job to processing pipeline
   - _Requirements: 9.3, 9.4_

3. WHEN processing begins, THE system SHALL establish SSE connection for progress updates
   - _Requirements: 9.5, 9.6_

4. WHEN processing completes, THE system SHALL update SvelteKit with results and evidence metadata
   - _Requirements: 9.7, 9.8_

5. WHEN processing fails, THE system SHALL notify SvelteKit with error details and retry options
   - _Requirements: 9.9, 9.10_

---

### Requirement 10: Data Persistence & Indexing

**User Story**: As a system, I need to persist processed evidence and maintain indexes, so that evidence is searchable and retrievable.

#### Acceptance Criteria

1. WHEN processing completes, THE system SHALL store chunks in PostgreSQL with full metadata
   - _Requirements: 10.1, 10.2_

2. WHEN chunks are stored, THE system SHALL index them with BM25 for keyword search
   - _Requirements: 10.3, 10.4_

3. WHEN embeddings are generated, THE system SHALL store them in Qdrant for semantic search
   - _Requirements: 10.5, 10.6_

4. WHEN evidence is indexed, THE system SHALL make it immediately searchable via RAG API
   - _Requirements: 10.7, 10.8_

5. WHEN evidence is stored, THE system SHALL maintain audit trail with processing metadata
   - _Requirements: 10.9, 10.10_

---

## Summary

This specification defines a complete document processing pipeline that integrates OCR, document parsing, and semantic analysis to transform raw legal evidence into structured, searchable content. The system prioritizes accuracy, performance, and real-time feedback while maintaining robust error handling and recovery.

**Key Integration Points**:
- Tesseract for OCR on scanned documents
- IBM Docling 258M for structured document parsing
- Gemma3 for embeddings and semantic analysis
- RabbitMQ for async job dispatch
- Qdrant for vector storage
- PostgreSQL for metadata and chunks
- SSE for real-time progress monitoring
- SvelteKit frontend for user interaction

**Success Criteria**:
- Documents processed end-to-end with high accuracy
- Real-time progress visible to users
- Evidence immediately searchable after processing
- Concurrent uploads handled efficiently
- All errors handled gracefully with recovery options
- Processing performance meets targets (5-30 seconds depending on document size)

