# Phase 6: Evidence Board - Kiro Spec

**Status**: Ready to implement
**Estimated Time**: 4-6 hours
**Complexity**: Medium
**Dependencies**: Phase 4-5 complete

---

## Overview

Build an Evidence Board UI that allows users to:
1. View all evidence for a case
2. Select multiple evidence items
3. Ask AI questions about selected evidence
4. See AI responses with keywords and suggestions
5. Track evidence-to-chat linkages

---

## Requirements

### Functional Requirements

**FR1: Evidence Display**
- Display evidence cards with:
  - Title
  - Evidence type (document, image, audio, video, other)
  - Upload date
  - AI summary (if available)
  - Tags (user and AI-generated)
  - File link

**FR2: Evidence Selection**
- Multi-select checkboxes on evidence cards
- Visual feedback for selected items
- Count of selected items

**FR3: Ask AI**
- Text input for question
- Submit button (only enabled when evidence selected)
- Validation: question required, at least one evidence selected

**FR4: AI Response Display**
- Show AI answer
- Show extracted keywords
- Show follow-up suggestions
- Show in right sidebar

**FR5: Chat History**
- Show recent chat turns for the case
- Display in right sidebar
- Link to evidence used

**FR6: Evidence Upload**
- Simple form to add new evidence
- Fields: title, evidence type, summary
- Save to database

### Non-Functional Requirements

**NFR1: Performance**
- Load evidence list in < 1 second
- AI response in < 60 seconds
- Smooth UI interactions

**NFR2: Accessibility**
- Keyboard navigation
- Screen reader support
- Color contrast compliance

**NFR3: Responsiveness**
- Mobile-friendly layout
- Tablet-friendly layout
- Desktop-optimized layout

---

## Data Model

### Evidence Table
```sql
CREATE TABLE evidence (
  id UUID PRIMARY KEY,
  case_id UUID NOT NULL REFERENCES cases(id),
  evidence_type VARCHAR(50),
  file_type VARCHAR(100),
  file_url TEXT,
  file_name VARCHAR(255),
  file_size BIGINT,
  mime_type VARCHAR(100),
  hash VARCHAR(255),
  tags TEXT[],
  ai_summary TEXT,
  ai_tags TEXT[],
  uploaded_by UUID REFERENCES users(id),
  uploaded_at TIMESTAMP,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW()
);
```

### Chat Turn Evidence Table
```sql
CREATE TABLE chat_turn_evidence (
  id UUID PRIMARY KEY,
  chat_turn_id UUID NOT NULL REFERENCES chat_turns(id),
  evidence_id UUID NOT NULL REFERENCES evidence(id),
  role VARCHAR(50), -- 'uploaded' or 'retrieved'
  object_uri TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);
```

### Chat Turns Table
```sql
CREATE TABLE chat_turns (
  id UUID PRIMARY KEY,
  case_id UUID REFERENCES cases(id),
  user_id UUID REFERENCES users(id),
  message TEXT NOT NULL,
  answer TEXT,
  llm_output JSONB,
  rag_context JSONB,
  kag_context JSONB,
  did_you_mean JSONB,
  extracted_keywords TEXT[],
  key_phrases TEXT[],
  suggestions JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);
```

---

## API Endpoints

### GET /api/cases/[id]/evidence
**Purpose**: Load evidence for a case
**Response**:
```json
{
  "caseId": "uuid",
  "evidenceRows": [
    {
      "id": "uuid",
      "title": "string",
      "evidenceType": "document|image|audio|video|other",
      "aiSummary": "string",
      "tags": ["string"],
      "aiTags": ["string"],
      "uploadedAt": "ISO8601",
      "fileUrl": "string"
    }
  ],
  "recentChat": [
    {
      "id": "uuid",
      "message": "string",
      "answer": "string",
      "createdAt": "ISO8601"
    }
  ]
}
```

### POST /api/cases/[id]/evidence?/createEvidence
**Purpose**: Create new evidence
**Body**:
```json
{
  "title": "string",
  "evidenceType": "document|image|audio|video|other",
  "summary": "string"
}
```

### POST /api/cases/[id]/evidence?/askAi
**Purpose**: Ask AI about selected evidence
**Body**:
```json
{
  "question": "string",
  "evidenceIds": ["uuid", "uuid"]
}
```
**Response**:
```json
{
  "turnId": "uuid",
  "answer": "string",
  "keywords": ["string"],
  "suggestions": [
    {
      "query": "string",
      "reason": "string",
      "score": 0.9
    }
  ]
}
```

---

## UI Components

### EvidenceCard.svelte
- Displays single evidence item
- Checkbox for selection
- Shows title, type, summary, tags
- Link to file
- "Ask AI" button

### EvidenceBoard.svelte (Main Page)
- Grid of evidence cards
- Selection controls
- Ask AI form
- Chat history sidebar
- Upload form

---

## Implementation Steps

1. **Create Zod Schema** (`src/lib/schemas/evidence.ts`)
   - Evidence type definition
   - Upload form validation

2. **Create Evidence Card Component** (`src/lib/components/EvidenceCard.svelte`)
   - Display evidence with metadata
   - Selection checkbox
   - File link

3. **Create Server Logic** (`src/routes/cases/[id]/evidence/+page.server.ts`)
   - Load evidence
   - Handle create evidence action
   - Handle ask AI action
   - Link evidence to chat turns

4. **Create Main Page** (`src/routes/cases/[id]/evidence/+page.svelte`)
   - Evidence grid
   - Selection controls
   - Ask AI form
   - Chat history sidebar

---

## Testing

### Unit Tests
- [ ] Evidence card renders correctly
- [ ] Selection works
- [ ] Form validation works
- [ ] API calls work

### Integration Tests
- [ ] Load evidence for case
- [ ] Create new evidence
- [ ] Ask AI about evidence
- [ ] Evidence-chat linking works

### E2E Tests
- [ ] Full user flow: select evidence → ask AI → see response
- [ ] Chat history displays correctly
- [ ] Evidence upload works

---

## Success Criteria

- [x] Schema ready
- [x] FK relationships ready
- [ ] Evidence card component created
- [ ] Server logic created
- [ ] Main page created
- [ ] All tests passing
- [ ] UI responsive
- [ ] Performance acceptable

---

## Notes

- Use Svelte 5 runes for reactivity
- Use Superforms for form handling
- Use Zod for validation
- Keep components small and focused
- Use TypeScript for type safety
- Follow existing code patterns

---

**Status**: Ready to implement
**Next**: Copy ready-to-paste code from PHASE_6_READY_TO_PASTE.md

