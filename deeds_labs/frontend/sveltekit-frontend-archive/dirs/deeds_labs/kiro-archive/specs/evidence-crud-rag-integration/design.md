# Evidence Files CRUD + RAG Integration Design

## Overview

The Evidence Files CRUD system provides unified management of legal evidence with tight integration to RAG search. Citation tags automatically influence search ranking, and all operations maintain audit trails for compliance.

## Architecture

### System Components

```
┌─────────────────────────────────────────────────────────────┐
│                    SvelteKit 2 Frontend                      │
├─────────────────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │   Sidebar    │  │   Datagrid   │  │   Drawer     │      │
│  │  Navigation  │  │  (Paginated) │  │  (CRUD Form) │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
│                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │ Jurisdiction │  │ Tag Filter   │  │ RAG Query    │      │
│  │  Selector    │  │  (Optional)  │  │  Interface   │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│                    FastAPI Gateway                           │
├─────────────────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │ Evidence     │  │ Tag CRUD     │  │ RAG Search   │      │
│  │ CRUD Routes  │  │ Routes       │  │ Routes       │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
│                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │ Validators   │  │ Audit Log    │  │ RAG Index    │      │
│  │ (Legal)      │  │ Service      │  │ Sync Service │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│              PostgreSQL 17 + pgvector                        │
├─────────────────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │ Evidence     │  │ Citation     │  │ Audit Log    │      │
│  │ Files        │  │ Tags         │  │ (Immutable)  │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
│                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │ Evidence     │  │ RAG Index    │  │ Tag Links    │      │
│  │ Chunks       │  │ Metadata     │  │ (M2M)        │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│                    MinIO Storage                             │
├─────────────────────────────────────────────────────────────┤
│  Evidence files (PDF, DOCX, TXT)                            │
└─────────────────────────────────────────────────────────────┘
```

### Data Flow

#### Create Evidence File
```
User Uploads File
    ↓
Frontend Validation (file type, size)
    ↓
POST /api/evidence (multipart/form-data)
    ↓
Backend: Store in MinIO
    ↓
Backend: Create evidence_files record
    ↓
Backend: Trigger chunking (LangExtract)
    ↓
Backend: Generate embeddings (embeddinggemma)
    ↓
Backend: Add to RAG index
    ↓
Backend: Log to audit_log
    ↓
Response (Success with evidence_id)
```

#### Edit Evidence Tags
```
User Edits Tags in Drawer
    ↓
Frontend Validation (tags exist or create new)
    ↓
PATCH /api/evidence/{id}/tags
    ↓
Backend: Update evidence_tags links
    ↓
Backend: Trigger RAG index update (tag weights)
    ↓
Backend: Log to audit_log
    ↓
Response (Success)
```

#### RAG Search with Tag Filter
```
User Selects Tags (Optional)
    ↓
User Enters Query
    ↓
POST /api/rag/search
    ↓
Backend: Embed query (embeddinggemma)
    ↓
Backend: Search PGVector (with tag filter)
    ↓
Backend: Search Elasticsearch BM25 (with tag filter)
    ↓
Backend: Merge + rerank (MiniLM)
    ↓
Backend: Apply tag weighting (1.5x boost if tags match)
    ↓
Backend: Return results with tag metadata
    ↓
Response (Results with tag highlights)
```

## Components and Interfaces

### Frontend Components

#### 1. EvidenceDataGrid
- Searchable, paginated table of evidence files
- Columns: filename, file_type, file_size, processing_status, jurisdiction, created_at
- Filters: jurisdiction, processing_status, file_type
- Row click opens EvidenceDrawer

**Props:**
- `data: Array<EvidenceFile>`
- `columns: Array<{key, label, sortable}>`
- `filters: {jurisdiction, status, type}`
- `pageSize: number`

**Events:**
- `rowClick(record)`
- `filterChange(filters)`
- `search(query)`
- `paginate(page)`

#### 2. EvidenceDrawer
- Editable form for evidence metadata
- Citation tags multi-select
- Vector preview (read-only)
- Regenerate embedding button

**Props:**
- `data: EvidenceFile`
- `isOpen: boolean`
- `availableTags: Array<Tag>`

**Events:**
- `save(data)`
- `close()`
- `regenerateVector()`
- `tagsChange(tags)`

#### 3. TagFilter
- Multi-select dropdown for citation tags
- Optional filter (no selection = all results)
- Shows tag count and boost factor

**Props:**
- `availableTags: Array<Tag>`
- `selectedTags: Array<string>`
- `jurisdiction: string`

**Events:**
- `change(tags)`

#### 4. RAGQueryInterface
- Query input field
- Tag filter (optional)
- Jurisdiction selector (required)
- Results display with tag highlights

**Props:**
- `jurisdiction: string`
- `availableTags: Array<Tag>`

**Events:**
- `search(query, tags, jurisdiction)`

### Backend API Endpoints

#### Evidence CRUD

**GET /api/evidence**
- Query params: `jurisdiction`, `status`, `type`, `search`, `page`, `limit`
- Returns: Paginated evidence list

**POST /api/evidence**
- Body: multipart/form-data (file + metadata)
- Validates: jurisdiction, file_type, file_size
- Returns: Created evidence with id

**PATCH /api/evidence/{id}**
- Body: Partial evidence object
- Validates: All provided fields
- Returns: Updated evidence

**DELETE /api/evidence/{id}**
- Returns: Success/error
- Logs: Deletion to audit table

#### Citation Tags

**GET /api/tags**
- Query params: `jurisdiction`
- Returns: Available tags for jurisdiction

**POST /api/tags**
- Body: `{name, jurisdiction}`
- Returns: Created tag

**PATCH /api/evidence/{id}/tags**
- Body: `{tags: [tag_ids]}`
- Updates: evidence_tags links
- Triggers: RAG index update
- Returns: Updated evidence with tags

#### RAG Search

**POST /api/rag/search**
- Body: `{query, tags: [tag_ids], jurisdiction}`
- Returns: Ranked results with tag metadata

### Data Models

#### EvidenceFile (Drizzle ORM)
```typescript
{
  id: UUID (primary key)
  filename: string (required)
  file_type: string (enum: pdf, docx, txt)
  file_size: number (bytes)
  jurisdiction: string (required, enum)
  processing_status: string (enum: pending, processing, completed, failed)
  minio_path: string (S3 path)
  metadata: JSON (user-defined)
  created_at: timestamp
  updated_at: timestamp
}
```

#### CitationTag (Drizzle ORM)
```typescript
{
  id: UUID (primary key)
  name: string (required, unique per jurisdiction)
  jurisdiction: string (required)
  description: string (optional)
  created_at: timestamp
}
```

#### EvidenceTag (Drizzle ORM - M2M)
```typescript
{
  id: UUID (primary key)
  evidence_id: UUID (foreign key)
  tag_id: UUID (foreign key)
  created_at: timestamp
}
```

#### RAGIndexMetadata (Drizzle ORM)
```typescript
{
  id: UUID (primary key)
  chunk_id: UUID (foreign key to evidence_chunks)
  evidence_id: UUID (foreign key)
  tags: string[] (tag names for weighting)
  tag_weight: number (default 1.0, 1.5 if tags match)
  updated_at: timestamp
}
```

#### AuditLog (Drizzle ORM)
```typescript
{
  id: UUID (primary key)
  user_id: UUID
  resource_type: string (Evidence|Tag|etc)
  resource_id: UUID
  operation: string (CREATE|UPDATE|DELETE)
  old_values: JSON (for UPDATE/DELETE)
  new_values: JSON (for CREATE/UPDATE)
  timestamp: timestamp (immutable)
}
```

## Error Handling

### Validation Errors

**Jurisdiction Missing**
```json
{
  "status": 400,
  "error": "Jurisdiction required",
  "details": "Select jurisdiction before saving"
}
```

**File Type Invalid**
```json
{
  "status": 400,
  "error": "Invalid file type",
  "details": "Allowed: pdf, docx, txt"
}
```

**File Size Exceeded**
```json
{
  "status": 413,
  "error": "File too large",
  "details": "Max size: 100MB"
}
```

### Processing Errors

**MinIO Upload Failed**
```json
{
  "status": 500,
  "error": "Storage error",
  "details": "Failed to upload to MinIO"
}
```

**Chunking Failed**
```json
{
  "status": 500,
  "error": "Processing error",
  "details": "Failed to chunk document"
}
```

## Testing Strategy

### Unit Tests

1. **Validation Tests**
   - Jurisdiction enum validation
   - File type validation
   - File size validation
   - Tag name validation

2. **CRUD Tests**
   - Create evidence with valid data
   - Create evidence with invalid data (rejected)
   - Update evidence fields
   - Delete evidence
   - Query with filters

3. **Tag Tests**
   - Create tag
   - Link tag to evidence
   - Remove tag link
   - Query tags by jurisdiction

4. **Audit Log Tests**
   - Log CREATE operations
   - Log UPDATE operations with old/new values
   - Log DELETE operations
   - Query audit log with filters

### Integration Tests

1. **Full Evidence Flow**
   - Upload file → Create record → Add tags → Search with tags → Delete

2. **RAG Index Sync**
   - Create evidence → Verify in RAG index
   - Edit tags → Verify RAG weights updated
   - Delete evidence → Verify removed from RAG index

3. **Tag Weighting**
   - Search without tags → Get baseline results
   - Search with tags → Verify 1.5x boost applied
   - Verify tag metadata in results

4. **Jurisdiction Filtering**
   - Create evidence in multiple jurisdictions
   - Filter by jurisdiction
   - Verify results scoped correctly

### UI Tests

1. **Form Validation**
   - Display errors for invalid input
   - Disable submit until valid
   - Show success message on save

2. **Datagrid**
   - Search filters results
   - Pagination works
   - Sorting works
   - Row click opens drawer

3. **Tag Filter**
   - Multi-select works
   - Filters RAG results
   - Shows boost factor

## Performance Considerations

### Database Indexes

- `evidence_files(jurisdiction)` – Filter by jurisdiction
- `evidence_files(processing_status)` – Filter by status
- `evidence_files(file_type)` – Filter by type
- `evidence_tags(evidence_id)` – Foreign key lookup
- `evidence_tags(tag_id)` – Tag lookup
- `audit_log(resource_type, resource_id)` – Audit queries
- `rag_index_metadata(tags)` – Tag weighting in search

### Pagination

- Default page size: 50 records
- Max page size: 500 records

### Caching

- Cache jurisdiction list (rarely changes)
- Cache tag list per jurisdiction (updated on tag create)
- No caching for evidence data (must be current)

## Security Considerations

### Authorization

- Admin role required for CRUD operations
- Audit log read-only for all users
- Vector regeneration requires admin role

### Data Validation

- All inputs validated server-side
- File type whitelist (pdf, docx, txt)
- File size limit (100MB)
- SQL injection prevention via ORM

### Audit Trail

- All operations logged with user_id
- Immutable audit log (no deletion)
- Timestamp from server (not client)

