# Evidence Files CRUD + RAG Integration Requirements

## Introduction

This feature enables legal professionals to manage evidence files through an intuitive admin interface, with editable citation tags that automatically influence RAG search results. The system maintains tight integration between evidence metadata, embeddings, and search ranking.

## Glossary

- **Evidence File**: Uploaded legal document (PDF, DOCX, TXT) stored in MinIO
- **Citation Tags**: User-defined labels for evidence (e.g., "child-abuse", "statute-273", "case-precedent")
- **RAG Search**: Retrieval-Augmented Generation with semantic + BM25 ranking
- **Tag Weighting**: Boost factor applied to search results matching selected tags
- **pgvector**: PostgreSQL extension for 768-dim embeddings
- **Drizzle ORM**: TypeScript ORM for database operations
- **MinIO**: S3-compatible object storage for evidence files
- **Jurisdiction**: Geographic/legal authority (CA, NY, Federal, etc.)

## Requirements

### Requirement 1: Evidence File CRUD Operations

**User Story:** As a legal administrator, I want to create, read, update, and delete evidence files with metadata, so that I can manage the evidence library.

#### Acceptance Criteria

1. WHEN user accesses evidence admin page, THE system SHALL display paginated datagrid with columns: filename, file_type, file_size, processing_status, jurisdiction, created_at
2. WHILE viewing evidence list, THE system SHALL allow filtering by: jurisdiction, processing_status, file_type
3. IF user clicks a row, THEN THE system SHALL open drawer with editable fields: filename, file_type, jurisdiction, processing_status, minio_path, metadata
4. WHERE user edits evidence metadata, THE system SHALL validate jurisdiction is selected before save
5. WHEN user saves changes, THE system SHALL persist to database and log operation to audit_log

### Requirement 2: Editable Citation Tags

**User Story:** As a legal professional, I want to tag evidence files with citation references, so that I can organize and filter evidence by legal concepts.

#### Acceptance Criteria

1. WHEN evidence drawer is open, THE system SHALL display citation_tags field as multi-select chips
2. WHILE user adds/removes tags, THE system SHALL display available tags from database and allow creating new tags
3. IF user saves evidence with new tags, THEN THE system SHALL create tag records in database and link to evidence file
4. WHERE tags are edited, THE system SHALL trigger RAG index update to reflect new tag weights
5. WHEN tags are removed, THE system SHALL remove tag links and update RAG index

### Requirement 3: Tag-Aware RAG Search

**User Story:** As a legal researcher, I want to optionally filter and weight RAG search results by citation tags, so that I can find evidence relevant to specific legal concepts.

#### Acceptance Criteria

1. WHEN user performs RAG query, THE system SHALL display tag filter dropdown with available tags
2. WHILE user selects tags, THE system SHALL apply optional filter: only return results matching selected tags
3. IF tags are selected, THEN THE system SHALL apply weighting boost (1.5x) to results matching tags
4. WHERE no tags are selected, THE system SHALL return all results with default ranking
5. WHEN search results are displayed, THE system SHALL show which tags matched each result

### Requirement 4: Jurisdiction-First Workflow

**User Story:** As a legal professional, I want to select jurisdiction before any operations, so that all evidence and searches are scoped to applicable law.

#### Acceptance Criteria

1. WHEN user accesses admin or RAG interface, THE system SHALL display jurisdiction selector as required field
2. WHILE jurisdiction is unselected, THE system SHALL disable search, CRUD operations, and tag filtering
3. IF user changes jurisdiction, THE system SHALL clear previous results and reset filters
4. WHERE jurisdiction is selected, THE system SHALL filter all evidence, tags, and search results to matching jurisdiction
5. WHEN user saves any record, THE system SHALL enforce jurisdiction matches selected context

### Requirement 5: Vector Embedding Management

**User Story:** As a system architect, I want to manage vector embeddings for evidence chunks, so that embeddings remain accurate and up-to-date.

#### Acceptance Criteria

1. WHEN evidence file is uploaded, THE system SHALL automatically generate embeddings for all chunks
2. WHILE embeddings are stored, THE system SHALL protect vector data from direct editing
3. IF user clicks regenerate button, THEN THE system SHALL call embedding service and update vectors
4. WHERE vector regeneration is triggered, THE system SHALL log operation with timestamp and user_id
5. WHEN regeneration completes, THE system SHALL update RAG index with new vectors

### Requirement 6: Audit Logging and Compliance

**User Story:** As a compliance officer, I want all evidence operations logged, so that I can maintain chain of custody for legal data.

#### Acceptance Criteria

1. WHEN any evidence record is created, THE system SHALL log: user_id, timestamp, operation_type, record_id, new_values
2. WHILE evidence is updated, THE system SHALL log: user_id, timestamp, operation_type, record_id, old_values, new_values
3. IF evidence is deleted, THEN THE system SHALL log: user_id, timestamp, operation_type, record_id, deleted_values
4. WHERE audit log is queried, THE system SHALL display read-only compliance history with no modification capability
5. WHEN audit log is exported, THE system SHALL include all metadata for legal discovery

### Requirement 7: RAG Index Synchronization

**User Story:** As a system architect, I want RAG index to automatically update when evidence or tags change, so that search results remain current.

#### Acceptance Criteria

1. WHEN evidence file is uploaded, THE system SHALL add chunks to RAG index with embeddings and metadata
2. WHILE tags are edited, THE system SHALL update RAG index metadata with new tag weights
3. IF evidence is deleted, THEN THE system SHALL remove chunks from RAG index
4. WHERE embeddings are regenerated, THE system SHALL update RAG index with new vectors
5. WHEN RAG index is updated, THE system SHALL log operation with timestamp and affected record count

