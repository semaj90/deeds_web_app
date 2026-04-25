# Legal CRUD Admin Design

## Overview

The Legal CRUD Admin system provides a unified interface for managing statutory citations, case law, and legal metadata. It enforces jurisdiction-first workflows, legal data validation, and maintains audit trails for compliance.

## Architecture

### System Components

```
┌─────────────────────────────────────────────────────────────┐
│                    SvelteKit Frontend                        │
├─────────────────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │   Sidebar    │  │   Datagrid   │  │   Drawer     │      │
│  │  Navigation  │  │   (Paginated)│  │  (CRUD Form) │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│                    FastAPI Backend                           │
├─────────────────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │  CRUD Routes │  │  Validators  │  │  Audit Log   │      │
│  │  (GET/POST/  │  │  (Legal      │  │  (Immutable) │      │
│  │   PATCH/DEL) │  │   Constraints)│  │              │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│              PostgreSQL + pgvector                           │
├─────────────────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │   Statutes   │  │  Embeddings  │  │  Audit Log   │      │
│  │  (Editable)  │  │  (Protected) │  │  (Read-only) │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
└─────────────────────────────────────────────────────────────┘
```

### Data Flow

#### Create Statute
```
User Input (Form)
    ↓
Frontend Validation (Client-side)
    ↓
POST /api/statutes
    ↓
Backend Validation (Legal constraints)
    ↓
Database Insert
    ↓
Audit Log Entry
    ↓
Response (Success/Error)
```

#### Update Statute
```
User Edits Form
    ↓
Frontend Validation
    ↓
PATCH /api/statutes/{id}
    ↓
Backend Validation
    ↓
Database Update
    ↓
Audit Log Entry (old_values, new_values)
    ↓
Response
```

#### Regenerate Vector
```
User Clicks "Regenerate"
    ↓
POST /api/embeddings/{id}/regenerate
    ↓
Call Embedding Service (embeddinggemma)
    ↓
Update pgvector in Database
    ↓
Audit Log Entry
    ↓
Response (Success)
```

## Components and Interfaces

### Frontend Components

#### 1. AdminSidebar
- Navigation between CRUD sections
- Active section highlighting
- YoRHa-style dark theme

**Props:**
- `sections: Array<{label, path}>`
- `currentPath: string`

**Events:**
- `navigate(path)`

#### 2. DataGrid
- Searchable, paginated table
- Sortable columns
- Row selection
- Click to open drawer

**Props:**
- `data: Array<Record>`
- `columns: Array<{key, label, sortable}>`
- `pageSize: number`
- `totalCount: number`

**Events:**
- `rowClick(record)`
- `search(query)`
- `sort(column, direction)`
- `paginate(page)`

#### 3. StatuteDrawer
- Editable form fields
- Real-time validation
- Submit/Cancel buttons
- Vector preview (read-only)

**Props:**
- `data: Statute`
- `isOpen: boolean`
- `isLoading: boolean`

**Events:**
- `save(data)`
- `close()`
- `regenerateVector()`

#### 4. JurisdictionSelector
- Required dropdown
- Disables operations when unselected
- Filters all data by jurisdiction

**Props:**
- `value: string`
- `options: Array<string>`
- `required: boolean`

**Events:**
- `change(jurisdiction)`

### Backend API Endpoints

#### Statutes CRUD

**GET /api/statutes**
- Query params: `jurisdiction`, `search`, `page`, `limit`, `sort`
- Returns: Paginated statute list

**POST /api/statutes**
- Body: Statute object
- Validates: jurisdiction, citation_number, authority_type
- Returns: Created statute with id

**PATCH /api/statutes/{id}**
- Body: Partial statute object
- Validates: All provided fields
- Returns: Updated statute

**DELETE /api/statutes/{id}**
- Returns: Success/error
- Logs: Deletion to audit table

#### Embeddings Management

**GET /api/embeddings/{id}**
- Returns: Embedding metadata (vector is read-only)

**PATCH /api/embeddings/{id}**
- Body: `{embedding_model, metadata}`
- Rejects: Direct vector edits
- Returns: Updated metadata

**POST /api/embeddings/{id}/regenerate**
- Calls: Embedding service
- Updates: pgvector
- Returns: Success/error

#### Audit Log

**GET /api/audit**
- Query params: `resource_type`, `resource_id`, `user_id`, `date_range`
- Returns: Immutable audit entries

### Data Models

#### Statute (Drizzle ORM)
```typescript
{
  id: UUID (primary key)
  title: string (required)
  citation_number: string (required, validated)
  jurisdiction: string (required, enum)
  section_id: string (optional)
  chapter: string (optional)
  authority_type: string (enum: Statute|Case|Regulation|Constitution)
  revision_year: number (optional, 1900-2100)
  source_url: string (optional, URL validated)
  tags: string (comma-separated or JSON)
  created_at: timestamp
  updated_at: timestamp
}
```

#### Embedding (Drizzle ORM)
```typescript
{
  id: UUID (primary key)
  chunk_id: UUID (foreign key)
  embedding: vector(768) (read-only, pgvector)
  embedding_model: string (editable)
  metadata: JSON (editable)
  created_at: timestamp
  updated_at: timestamp
}
```

#### AuditLog (Drizzle ORM)
```typescript
{
  id: UUID (primary key)
  user_id: UUID
  resource_type: string (Statute|Embedding|etc)
  resource_id: UUID
  operation: string (CREATE|UPDATE|DELETE)
  old_values: JSON (for UPDATE/DELETE)
  new_values: JSON (for CREATE/UPDATE)
  timestamp: timestamp (immutable)
}
```

## Error Handling

### Validation Errors

**Citation Number Invalid**
```json
{
  "status": 400,
  "error": "Invalid citation format",
  "details": "Must match pattern: § 123, §123(a)(1), etc."
}
```

**Jurisdiction Missing**
```json
{
  "status": 400,
  "error": "Jurisdiction required",
  "details": "Select jurisdiction before saving"
}
```

**Vector Edit Attempted**
```json
{
  "status": 400,
  "error": "Cannot edit vector directly",
  "details": "Use regenerate endpoint instead"
}
```

### Database Errors

**Record Not Found**
```json
{
  "status": 404,
  "error": "Statute not found",
  "details": "ID: {id}"
}
```

**Concurrent Update**
```json
{
  "status": 409,
  "error": "Conflict",
  "details": "Record was modified by another user"
}
```

## Testing Strategy

### Unit Tests

1. **Validation Tests**
   - Citation number patterns
   - Jurisdiction enum
   - Authority type enum
   - URL validation
   - Year range validation

2. **CRUD Tests**
   - Create statute with valid data
   - Create statute with invalid data (rejected)
   - Update statute fields
   - Delete statute
   - Query with filters

3. **Vector Protection Tests**
   - Reject direct vector edits
   - Allow metadata edits
   - Regenerate vector successfully
   - Verify vector dimensions (768)

4. **Audit Log Tests**
   - Log CREATE operations
   - Log UPDATE operations with old/new values
   - Log DELETE operations
   - Query audit log with filters

### Integration Tests

1. **Full CRUD Flow**
   - Create statute → Read → Update → Delete
   - Verify audit trail

2. **Jurisdiction Filtering**
   - Create statutes in multiple jurisdictions
   - Filter by jurisdiction
   - Verify results

3. **Vector Regeneration**
   - Create statute with embedding
   - Trigger regeneration
   - Verify new vector in database
   - Verify audit log entry

4. **Concurrent Operations**
   - Multiple users editing same record
   - Verify conflict detection

### UI Tests

1. **Form Validation**
   - Display errors for invalid input
   - Disable submit button until valid
   - Show success message on save

2. **Datagrid**
   - Search filters results
   - Pagination works
   - Sorting works
   - Row click opens drawer

3. **Drawer**
   - Form fields populate from data
   - Changes reflect in form
   - Save persists changes
   - Cancel discards changes

## Performance Considerations

### Database Indexes

- `statutes(jurisdiction)` – Filter by jurisdiction
- `statutes(citation_number)` – Search citations
- `statutes(authority_type)` – Filter by type
- `embeddings(chunk_id)` – Foreign key lookup
- `audit_log(resource_type, resource_id)` – Audit queries

### Pagination

- Default page size: 50 records
- Max page size: 500 records
- Cursor-based pagination for large datasets

### Caching

- Cache jurisdiction list (rarely changes)
- Cache authority type enum (static)
- No caching for statute data (must be current)

## Security Considerations

### Authorization

- Admin role required for CRUD operations
- Audit log read-only for all users
- Vector regeneration requires admin role

### Data Validation

- All inputs validated server-side
- SQL injection prevention via ORM
- XSS prevention via template escaping

### Audit Trail

- All operations logged with user_id
- Immutable audit log (no deletion)
- Timestamp from server (not client)

