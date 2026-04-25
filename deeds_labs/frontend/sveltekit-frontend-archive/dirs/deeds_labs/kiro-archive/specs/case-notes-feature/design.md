# Case Notes Feature Enhancements - Design Document

## Overview

This design document specifies the architecture and implementation approach for enhancing the existing Case Notes feature with NES modal UI, case-aware AI contextual chat, full-text search, note versioning, AI memo pinning, and comprehensive case packet export.

The design maintains strict separation between client and server code, uses Svelte 5 runes throughout, and leverages PostgreSQL capabilities for search and versioning.

## Architecture

### High-Level System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Case Detail Page                         │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  Case Toolbar                                        │   │
│  │  [📝 Notes] [🧠 AI Chat] [📄 Export Packet]         │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
         │                    │                    │
         ▼                    ▼                    ▼
    ┌─────────────┐   ┌──────────────┐   ┌──────────────┐
    │ NES Modal   │   │ NES Modal    │   │ PDF Export   │
    │ (Notes)     │   │ (Chat)       │   │ Endpoint     │
    │             │   │              │   │              │
    │ ┌─────────┐ │   │ ┌──────────┐ │   │ ┌──────────┐ │
    │ │ Notes   │ │   │ │ Chat UI  │ │   │ │ Generate │ │
    │ │ Editor  │ │   │ │ with     │ │   │ │ Packet   │ │
    │ │ + Search│ │   │ │ Citations│ │   │ │ PDF      │ │
    │ │ + Refs  │ │   │ │          │ │   │ │          │ │
    │ └─────────┘ │   │ └──────────┘ │   │ └──────────┘ │
    └─────────────┘   └──────────────┘   └──────────────┘
         │                    │                    │
         └────────┬───────────┴────────┬───────────┘
                  │                    │
                  ▼                    ▼
         ┌──────────────────┐  ┌──────────────────┐
         │ Case Synthesis   │  │ PDF Generation   │
         │ Service          │  │ Service          │
         │                  │  │                  │
         │ • Notes          │  │ • pdf-lib        │
         │ • Evidence       │  │ • Ollama (AI)    │
         │ • Summaries      │  │ • Formatting     │
         │ • Chat History   │  │                  │
         └──────────────────┘  └──────────────────┘
                  │                    │
                  └────────┬───────────┘
                           │
                           ▼
                  ┌──────────────────┐
                  │   PostgreSQL     │
                  │                  │
                  │ • case_notes     │
                  │ • case_note_refs │
                  │ • case_note_vers │
                  │ • evidence_files │
                  │ • chat_turns     │
                  └──────────────────┘
```

## Components and Interfaces

### 1. NES Modal Component

**File:** `src/lib/components/nes/NesModal.svelte`

```typescript
interface Props {
  open: boolean;
  title: string;
  onClose: () => void;
  widthClass?: string; // e.g., "w-[1100px]"
}
```

**Features:**
- Backdrop with semi-transparent overlay
- Title bar with close button
- Scrollable body content
- Svelte 5 runes ($state, $props)
- YoRHa design system styling
- Keyboard support (Escape to close)

### 2. Case Synthesis Service

**File:** `src/lib/server/cases/caseSynthesis.ts`

```typescript
interface CaseSynthesis {
  case: {
    id: string;
    name: string;
    status: string;
    created_at: string;
  };
  notes: Array<{
    id: string;
    title: string;
    content: string;
    is_pinned: boolean;
    is_ai: boolean;
    updated_at: string;
  }>;
  evidence: Array<{
    id: string;
    filename: string;
    file_type: string;
    processing_status: string;
    created_at: string;
  }>;
  summaries: Array<{
    id: string;
    summary_text: string;
    created_at: string;
  }>;
  recentChat: Array<{
    user_message: string;
    assistant_response: string;
    created_at: string;
  }>;
}

export async function buildCaseSynthesis(caseId: string): Promise<CaseSynthesis>
```

**Behavior:**
- Fetches most recent 25 notes (pinned first)
- Fetches most recent 25 evidence items
- Fetches most recent 10 summaries
- Fetches most recent 8 chat turns
- Returns structured object for LLM context

### 3. Full-Text Search

**Database Migration:**
```sql
ALTER TABLE case_notes
ADD COLUMN IF NOT EXISTS content_tsv tsvector
GENERATED ALWAYS AS (to_tsvector('english', coalesce(title,'') || ' ' || coalesce(content,''))) STORED;

CREATE INDEX IF NOT EXISTS idx_case_notes_fts ON case_notes USING GIN (content_tsv);
```

**API Endpoint:** `GET /api/cases/[caseId]/notes/search?q=...`

**Response:**
```typescript
{
  hits: Array<{
    id: string;
    title: string;
    preview: string; // first 240 chars
    updated_at: string;
  }>;
}
```

### 4. Note Versioning

**Database Table:**
```sql
CREATE TABLE IF NOT EXISTS case_note_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  note_id uuid NOT NULL REFERENCES case_notes(id) ON DELETE CASCADE,
  content text NOT NULL,
  title text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_note_versions_note ON case_note_versions(note_id);
```

**Behavior:**
- Automatic snapshot on every PATCH save
- Stores title and content
- Indexed by note_id for fast retrieval
- Cascade delete when note is deleted

**API Endpoints:**
- `GET /api/cases/[caseId]/notes/[noteId]/versions` - List versions
- `GET /api/cases/[caseId]/notes/[noteId]/versions/[versionId]` - Get specific version
- `POST /api/cases/[caseId]/notes/[noteId]/restore` - Restore version

### 5. AI Memo Pinning

**Endpoint:** `POST /api/cases/[caseId]/export/memo/save`

**Request:**
```typescript
{
  memo: string;
  title?: string; // optional, defaults to "AI Memo - [timestamp]"
}
```

**Response:**
```typescript
{
  note: {
    id: string;
    title: string;
    content: string;
    is_ai: true;
    is_pinned: true;
    created_at: string;
  };
}
```

**Behavior:**
- Creates new note with is_ai=true, is_pinned=true
- Auto-generates title if not provided
- Returns created note
- Note appears at top of list immediately

### 6. Case Packet PDF Export

**Endpoint:** `POST /api/cases/[caseId]/export/packet`

**Response:** PDF file with:
1. Cover page (case metadata, generation timestamp)
2. Executive summary (AI-generated)
3. Evidence index (all evidence items)
4. Pinned notes (in order)
5. Footer on each page (page number, model, input hash)

**Filename:** `case_[caseId]_packet_[timestamp].pdf`

**Dependencies:** `pdf-lib` (pure JavaScript, no native dependencies)

### 7. Case-Aware Contextual Chat

**Endpoint:** `POST /api/ai/contextual-chat`

**Request:**
```typescript
{
  caseId: string;
  message: string;
  conversationHistory?: Array<{ role: string; content: string }>;
}
```

**Response:**
```typescript
{
  response: string;
  citations: Array<{
    type: 'NOTE' | 'EVID' | 'SUM' | 'CHAT';
    id: string;
    text: string;
  }>;
}
```

**System Prompt:**
```
You are a prosecutor-facing legal assistant.
- Do NOT invent facts.
- Prefer evidence + summaries over notes if conflict.
- Notes reflect prosecutor theory and may be incomplete.
- Respond with citations: [type:id] where type is NOTE, EVID, SUM, or CHAT.
- Only reference data from the current case.
```

## Data Models

### case_notes (existing, no changes)
```typescript
{
  id: uuid;
  case_id: uuid;
  title: string | null;
  content: string;
  is_pinned: boolean;
  is_ai: boolean;
  created_by: string | null;
  created_at: timestamp;
  updated_at: timestamp;
}
```

### case_note_versions (new)
```typescript
{
  id: uuid;
  note_id: uuid;
  title: string | null;
  content: string;
  created_at: timestamp;
}
```

### case_note_evidence_refs (existing, no changes)
```typescript
{
  id: uuid;
  note_id: uuid;
  evidence_id: uuid;
  created_at: timestamp;
}
```

## Correctness Properties

A property is a characteristic or behavior that should hold true across all valid executions of a system—essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.

### Property 1: NES Modal Backdrop Isolation
*For any* open NES modal, clicking on the backdrop SHALL close the modal and return focus to the underlying page, without affecting any other UI state.
**Validates: Requirements 1.2, 1.3**

### Property 2: Case Synthesis Consistency
*For any* case, the synthesized context SHALL include only data from that specific case, and SHALL not include data from other cases.
**Validates: Requirements 2.3**

### Property 3: Full-Text Search Accuracy
*For any* search query, the returned notes SHALL contain the search term in either title or content, and SHALL be ordered by relevance.
**Validates: Requirements 3.1, 3.2, 3.4**

### Property 4: Note Version Immutability
*For any* note version snapshot, the stored content SHALL exactly match the note content at the time of snapshot creation, and SHALL not be modified after creation.
**Validates: Requirements 4.1, 4.5**

### Property 5: AI Memo Pinning Atomicity
*For any* AI memo save operation, the memo SHALL be created as a single note with both is_ai=true AND is_pinned=true, or the operation SHALL fail completely (no partial state).
**Validates: Requirements 5.2, 5.3**

### Property 6: Case Packet Determinism
*For any* case packet export with identical inputs (same notes, evidence, summaries), the generated PDF SHALL be byte-identical (deterministic output for audit purposes).
**Validates: Requirements 6.1, 6.6**

### Property 7: Citation Format Consistency
*For any* contextual chat response, all citations SHALL follow the format [type:id] where type is one of NOTE, EVID, SUM, or CHAT, and id is a valid UUID.
**Validates: Requirements 2.2**

### Property 8: Search Index Freshness
*For any* note update, the full-text search index SHALL be updated within 100ms to reflect the new content.
**Validates: Requirements 3.1**

## Error Handling

### Database Errors
- Foreign key violations → 409 Conflict
- Unique constraint violations → 409 Conflict
- Not found → 404 Not Found
- Permission denied → 403 Forbidden

### API Errors
- Invalid request body → 400 Bad Request
- Missing required fields → 400 Bad Request
- Case not found → 404 Not Found
- Note not found → 404 Not Found

### LLM Errors
- Ollama not running → 503 Service Unavailable
- Model not found → 503 Service Unavailable
- Timeout → 504 Gateway Timeout

### PDF Generation Errors
- pdf-lib error → 500 Internal Server Error
- Ollama error (for summary) → 500 Internal Server Error

## Testing Strategy

### Unit Tests
- NES modal open/close behavior
- Case synthesis data aggregation
- Full-text search query parsing
- Note version snapshot creation
- AI memo title generation
- Citation format validation

### Property-Based Tests
- Property 1: Modal backdrop isolation (100 iterations)
- Property 2: Case synthesis consistency (100 iterations)
- Property 3: Full-text search accuracy (100 iterations)
- Property 4: Note version immutability (100 iterations)
- Property 5: AI memo pinning atomicity (100 iterations)
- Property 6: Case packet determinism (50 iterations - slower)
- Property 7: Citation format consistency (100 iterations)
- Property 8: Search index freshness (100 iterations)

### Integration Tests
- End-to-end note creation → search → version → export
- Case synthesis with real database data
- Contextual chat with case context
- PDF generation with all sections
- Modal open/close with focus management

### Manual Tests
- Open case detail page
- Click "📝 Notes" button
- Create, edit, delete notes
- Search notes
- View version history
- Save AI memo as pinned note
- Export case packet
- Open contextual chat
- Verify citations are clickable

## Security Considerations

### Data Isolation
- Case synthesis only includes data from the requested case
- No cross-case data leakage
- User permissions checked before returning data

### Input Validation
- Search queries sanitized for SQL injection
- Note content validated for XSS
- PDF generation input validated

### Audit Trail
- All note changes tracked via versions
- AI memos marked with is_ai=true
- PDF generation includes input hash for reproducibility

## Performance Considerations

### Database
- Full-text search uses GIN index (fast)
- Note versions indexed by note_id
- Case synthesis queries limited to recent data (25/25/10/8)

### Frontend
- Modal uses CSS transforms (GPU-accelerated)
- Search results paginated (50 per page)
- Version diff uses efficient string comparison

### PDF Generation
- Streamed to client (not stored on server)
- Pagination handled by pdf-lib
- AI summary cached in note if available

## Deployment Checklist

- [ ] Run database migrations (0006_case_note_versions.sql)
- [ ] Update schema-postgres.ts with case_note_versions table
- [ ] Install pdf-lib: `npm i pdf-lib`
- [ ] Create NES modal component
- [ ] Create case synthesis service
- [ ] Implement full-text search endpoint
- [ ] Implement note versioning endpoints
- [ ] Implement AI memo save endpoint
- [ ] Implement case packet export endpoint
- [ ] Update contextual chat endpoint with case synthesis
- [ ] Update CaseNotesEditor with search UI
- [ ] Update case detail page with modal integration
- [ ] Run all tests
- [ ] Deploy to production

