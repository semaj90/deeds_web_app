# Phase 2: Citation Intelligence Expansion - Design

## Overview

Phase 2 expands the Case Reporter Summarizer into a cross-case legal research engine by adding citation management, statute search, and case linking. The design builds on Phase 1 infrastructure and follows the Legal AI UX design system.

---

## Architecture

### System Components

```
┌─────────────────────────────────────────────────────────────┐
│                    Citation Intelligence                    │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Layer 1: Citation Management (S-A)                        │
│  ├─ CitationService (save, search, CRUD)                   │
│  ├─ saved_citations table                                  │
│  └─ Citation components (highlight, save, list, detail)    │
│                                                             │
│  Layer 2: Statute Search (S-B)                             │
│  ├─ StatuteSearchService (search, detail, related)         │
│  ├─ statute_search_history table                           │
│  ├─ RAGService extension (context retrieval)               │
│  ├─ GraphService extension (related cases)                 │
│  └─ Statute search components (search, results, detail)    │
│                                                             │
│  Layer 3: Citation → Case Linking (S-C)                    │
│  ├─ CaseLinkService (link, unlink, update)                 │
│  ├─ case_statute_links table                               │
│  ├─ GraphService extension (relationships)                 │
│  └─ Linking components (modal, list, form)                 │
│                                                             │
│  Layer 4: Citation Library (S-D)                           │
│  ├─ CitationLibraryService (collections, tags, export)     │
│  ├─ citation_collections table                             │
│  ├─ citation_tags table                                    │
│  ├─ collection_citations table                             │
│  ├─ ExportService (PDF, JSON, CSV)                         │
│  └─ Library components (page, collections, detail, export) │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│                    Phase 1 Infrastructure                   │
│  PostgreSQL | Redis | Neo4j | RabbitMQ | Ollama | Lucia   │
└─────────────────────────────────────────────────────────────┘
```

---

## Data Models

### Citation Management (S-A)

**saved_citations Table:**
```sql
CREATE TABLE saved_citations (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id),
  case_id UUID REFERENCES cases(id),
  statute_code VARCHAR NOT NULL,
  statute_title VARCHAR,
  jurisdiction VARCHAR,
  severity VARCHAR,
  year INT,
  source_type VARCHAR, -- 'manual' | 'auto_extracted'
  highlighted_text TEXT,
  notes TEXT,
  created_at TIMESTAMP,
  updated_at TIMESTAMP
);

CREATE INDEX idx_saved_citations_user ON saved_citations(user_id);
CREATE INDEX idx_saved_citations_case ON saved_citations(case_id);
CREATE INDEX idx_saved_citations_statute ON saved_citations(statute_code);
```

**statute_search_history Table:**
```sql
CREATE TABLE statute_search_history (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id),
  query VARCHAR NOT NULL,
  statute_code VARCHAR,
  results_count INT,
  searched_at TIMESTAMP
);

CREATE INDEX idx_search_history_user ON statute_search_history(user_id);
CREATE INDEX idx_search_history_statute ON statute_search_history(statute_code);
```

### Citation → Case Linking (S-C)

**case_statute_links Table:**
```sql
CREATE TABLE case_statute_links (
  id UUID PRIMARY KEY,
  case_id UUID NOT NULL REFERENCES cases(id),
  statute_code VARCHAR NOT NULL,
  linked_by UUID NOT NULL REFERENCES users(id),
  link_type VARCHAR, -- 'charge' | 'precedent' | 'reference'
  notes TEXT,
  created_at TIMESTAMP
);

CREATE INDEX idx_case_statute_links_case ON case_statute_links(case_id);
CREATE INDEX idx_case_statute_links_statute ON case_statute_links(statute_code);
```

### Citation Library (S-D)

**citation_collections Table:**
```sql
CREATE TABLE citation_collections (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id),
  name VARCHAR NOT NULL,
  description TEXT,
  is_public BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP,
  updated_at TIMESTAMP
);

CREATE INDEX idx_collections_user ON citation_collections(user_id);
```

**citation_tags Table:**
```sql
CREATE TABLE citation_tags (
  id UUID PRIMARY KEY,
  citation_id UUID NOT NULL REFERENCES saved_citations(id),
  tag VARCHAR NOT NULL,
  created_at TIMESTAMP
);

CREATE INDEX idx_tags_citation ON citation_tags(citation_id);
CREATE INDEX idx_tags_tag ON citation_tags(tag);
```

**collection_citations Table:**
```sql
CREATE TABLE collection_citations (
  id UUID PRIMARY KEY,
  collection_id UUID NOT NULL REFERENCES citation_collections(id),
  citation_id UUID NOT NULL REFERENCES saved_citations(id),
  added_at TIMESTAMP
);

CREATE INDEX idx_collection_citations_collection ON collection_citations(collection_id);
CREATE INDEX idx_collection_citations_citation ON collection_citations(citation_id);
```

---

## Service Layer

### S-A: CitationService

```typescript
class CitationService {
  async saveCitation(data: SaveCitationRequest): Promise<Citation>
  async searchCitations(query: string, filters: SearchFilters): Promise<Citation[]>
  async getCitationDetail(id: string): Promise<Citation>
  async updateCitationNotes(id: string, notes: string): Promise<Citation>
  async deleteCitation(id: string): Promise<void>
  async getCitationsByCase(caseId: string): Promise<Citation[]>
  async getCitationsByUser(userId: string): Promise<Citation[]>
}
```

### S-B: StatuteSearchService

```typescript
class StatuteSearchService {
  async searchStatutes(query: string, filters: SearchFilters): Promise<Statute[]>
  async getStatuteDetail(code: string): Promise<StatuteDetail>
  async getRelatedCases(code: string, limit: number): Promise<Case[]>
  async getSearchHistory(userId: string): Promise<SearchHistory[]>
  async saveSearchHistory(userId: string, query: string): Promise<void>
}
```

### S-C: CaseLinkService

```typescript
class CaseLinkService {
  async linkStatuteToCase(caseId: string, statuteCode: string, linkType: string): Promise<CaseStatuteLink>
  async getCaseStatutes(caseId: string): Promise<CaseStatuteLink[]>
  async unlinkStatute(caseId: string, statuteCode: string): Promise<void>
  async updateLinkMetadata(caseId: string, statuteCode: string, metadata: any): Promise<CaseStatuteLink>
}
```

### S-D: CitationLibraryService

```typescript
class CitationLibraryService {
  async createCollection(userId: string, name: string, description: string): Promise<Collection>
  async getCollections(userId: string): Promise<Collection[]>
  async getCollectionDetail(id: string): Promise<CollectionDetail>
  async addCitationToCollection(collectionId: string, citationId: string): Promise<void>
  async removeCitationFromCollection(collectionId: string, citationId: string): Promise<void>
  async addTag(citationId: string, tag: string): Promise<void>
  async removeTag(citationId: string, tag: string): Promise<void>
  async shareCollection(collectionId: string, userId: string): Promise<void>
}
```

### ExportService

```typescript
class ExportService {
  async exportToPDF(citations: Citation[]): Promise<Buffer>
  async exportToJSON(citations: Citation[]): Promise<string>
  async exportToCSV(citations: Citation[]): Promise<string>
}
```

---

## API Endpoints

### S-A: Citation Management

```
POST   /api/citations/save              - Save citation
GET    /api/citations/search            - Search citations
GET    /api/citations                   - List citations
GET    /api/citations/:id               - Get citation detail
PUT    /api/citations/:id               - Update citation
DELETE /api/citations/:id               - Delete citation
```

### S-B: Statute Search

```
GET    /api/laws/search                 - Search statutes (guest + auth)
GET    /api/laws/:code                  - Get statute detail with RAG
GET    /api/laws/:code/related-cases    - Get related cases (KAG)
GET    /api/citations/search-history    - Get search history (auth only)
```

### S-C: Citation → Case Linking

```
POST   /api/cases/:id/laws              - Link statute to case
GET    /api/cases/:id/laws              - Get case's linked statutes
DELETE /api/cases/:id/laws/:statute_code - Unlink statute
PUT    /api/cases/:id/laws/:statute_code - Update link metadata
```

### S-D: Citation Library

```
POST   /api/citations/collections       - Create collection
GET    /api/citations/collections       - List collections
GET    /api/citations/collections/:id   - Get collection detail
POST   /api/citations/collections/:id/citations - Add citation to collection
DELETE /api/citations/collections/:id/citations/:citation_id - Remove citation
POST   /api/citations/:id/tags          - Add tag
DELETE /api/citations/:id/tags/:tag     - Remove tag
POST   /api/citations/export            - Export citations
POST   /api/citations/collections/:id/share - Share collection
```

---

## Component Architecture

### S-A: Citation Management Components

```
CitationHighlighter.svelte
├─ Allow text selection in summary
├─ Show highlighted citations
└─ Provide "Save Citation" button

CitationSaveModal.svelte
├─ Input fields for metadata
├─ Save button
└─ Cancel button

CitationList.svelte
├─ Display list of citations
├─ Filter by case
└─ Click to view detail

CitationDetail.svelte
├─ Display full citation details
├─ Show metadata and notes
├─ Edit/delete buttons
└─ "Attach to Case" button

CitationSearch.svelte
├─ Search input with filters
├─ Display search results
└─ Show search history
```

### S-B: Statute Search Components

```
StatuteSearchPage.svelte
├─ Search bar with filters
├─ Display search results
├─ Show statute detail on selection
└─ Show related cases sidebar

StatuteSearchBar.svelte
├─ Search input
├─ Filter controls
└─ Search button

StatuteResultsList.svelte
├─ Display search results
├─ Show statute code, title, jurisdiction, severity
├─ Show relevance score
└─ Click to view detail

StatuteDetail.svelte
├─ Display statute full text
├─ Show metadata
├─ Show related cases
└─ "Attach to Case" button

RelatedCasesPanel.svelte
├─ Display related cases
├─ Show case number, charges, outcome
├─ Show relevance score
└─ Link to case detail
```

### S-C: Citation → Case Linking Components

```
AttachToCaseModal.svelte
├─ Case selector
├─ Link type selector
├─ Notes input
└─ Save button

CaseStatuteLinks.svelte
├─ Display linked statutes
├─ Show statute code, title, link_type, notes
├─ Edit button
└─ Delete button

LinkMetadataForm.svelte
├─ Link type input
├─ Notes input
└─ Save button
```

### S-D: Citation Library Components

```
CitationLibraryPage.svelte
├─ Collections list
├─ Citations list
├─ Search and filter
└─ Create collection button

CitationCollections.svelte
├─ Display collections
├─ Show collection name, description, citation count
├─ Create/edit/delete buttons
└─ Click to view detail

CollectionDetail.svelte
├─ Display collection detail
├─ Show citations in collection
├─ Add/remove citation buttons
└─ Export button

CitationTags.svelte
├─ Display tags
├─ Allow adding/removing tags
└─ Show tag suggestions

ExportModal.svelte
├─ Format selector (PDF, JSON, CSV)
├─ Citation/collection selector
└─ Export button
```

---

## Integration Points

### With Phase 1

**CaseSummaryService:**
- Extend to trigger citation extraction after summary generation
- Auto-save extracted citations to `saved_citations` table

**CitationExtractionWorker:**
- Already extracts citations
- Extend to auto-save to `saved_citations` table with source_type='auto_extracted'

**RAGService:**
- Extend with `retrieveStatuteContext()` method for statute search
- Add `rankByRelevance()` method for result ranking

**GraphService:**
- Extend with `createCaseStatuteRelationship()` method
- Extend with `findRelatedCases()` method for KAG
- Extend with `rankCasesByRelevance()` method

**SummaryEditor.svelte:**
- Add citation highlighting
- Add "Save Citation" button
- Add citation list sidebar

**CaseDetailPage.svelte:**
- Add "Linked Statutes" tab
- Add "Attach Statute" button

**LawsSearchPage.svelte:**
- Extend with "Attach to Case" button
- Add related cases sidebar

---

## User Flows

### Citation Save Flow

```
User highlights text in summary
    ↓
Click "Save Citation" button
    ↓
CitationSaveModal opens
    ↓
User enters metadata (statute code, title, jurisdiction, severity, notes)
    ↓
User clicks "Save"
    ↓
CitationService.saveCitation() called
    ↓
Citation saved to saved_citations table
    ↓
Audit event logged
    ↓
Success message shown
```

### Statute Search Flow

```
User visits /laws/search
    ↓
User enters search query
    ↓
User applies filters (jurisdiction, severity, category)
    ↓
StatuteSearchService.searchStatutes() called
    ↓
Results displayed with relevance scores
    ↓
User clicks statute result
    ↓
StatuteDetail displayed with RAG context
    ↓
Related cases displayed (KAG)
    ↓
User clicks "Attach to Case"
    ↓
AttachToCaseModal opens
```

### Citation → Case Linking Flow

```
User views statute detail
    ↓
User clicks "Attach to Case"
    ↓
AttachToCaseModal opens
    ↓
User selects case from list
    ↓
User selects link_type (charge, precedent, reference)
    ↓
User enters notes (optional)
    ↓
User clicks "Save"
    ↓
CaseLinkService.linkStatuteToCase() called
    ↓
Link saved to case_statute_links table
    ↓
Relationship created in Neo4j
    ↓
Audit event logged
    ↓
Success message shown
```

### Citation Library Flow

```
User visits /citations
    ↓
CitationLibraryPage displayed
    ↓
User creates collection
    ↓
CitationLibraryService.createCollection() called
    ↓
Collection saved to citation_collections table
    ↓
User adds citations to collection
    ↓
CitationLibraryService.addCitationToCollection() called
    ↓
Membership saved to collection_citations table
    ↓
User adds tags to citations
    ↓
CitationLibraryService.addTag() called
    ↓
Tags saved to citation_tags table
    ↓
User exports collection
    ↓
ExportService.exportToPDF() called
    ↓
PDF file generated and downloaded
```

---

## Error Handling

### Citation Save Errors

- Invalid statute code → Show error message
- Duplicate citation → Show warning, allow update
- Database error → Show error message, retry option
- Unauthorized → Redirect to login

### Statute Search Errors

- No results found → Show "No results" message
- Search timeout → Show error message, retry option
- Database error → Show error message, retry option

### Case Linking Errors

- Case not found → Show error message
- Statute not found → Show error message
- Duplicate link → Show warning, allow update
- Unauthorized → Show error message

### Library Errors

- Collection not found → Show error message
- Export failed → Show error message, retry option
- Share failed → Show error message, retry option

---

## Performance Optimization

### Caching Strategy

- Statute search results: 24h TTL
- Related cases: 24h TTL
- Search history: 7d TTL
- Citation metadata: 24h TTL

### Database Indexes

- `saved_citations(user_id, statute_code)`
- `case_statute_links(case_id, statute_code)`
- `statute_search_history(user_id, statute_code)`
- `citation_tags(citation_id, tag)`

### Query Optimization

- Use pgvector for statute similarity search
- Use Neo4j for relationship queries
- Batch citation saves
- Lazy-load related cases

---

## Security & Authorization

### Role-Based Access

**Guest:**
- Can search statutes (public only)
- Cannot save citations
- Cannot link statutes
- Cannot access library

**Prosecutor:**
- Can save citations
- Can search statutes
- Can link statutes to cases
- Can create collections
- Can share collections

**Warden:**
- Can view citations (read-only)
- Can search statutes
- Can view case-statute links
- Cannot save citations
- Cannot link statutes

### Audit Logging

All operations logged:
- Citation save/delete
- Statute search
- Case-statute linking
- Collection management
- Export operations

---

## Testing Strategy

### Unit Tests

- CitationService CRUD operations
- StatuteSearchService search and filtering
- CaseLinkService linking operations
- CitationLibraryService collection management

### Integration Tests

- End-to-end citation save → search → link
- RAG context retrieval
- KAG related cases retrieval
- Export functionality

### Performance Tests

- Citation save latency (<500ms)
- Statute search latency (<2s)
- Related cases query (<3s)

---

**Design Version**: 1.0
**Created**: November 22, 2025
**Status**: Ready for Implementation
**Builds On**: Phase 1 ✅ COMPLETE
