# Design Document: Case Reporter Summarizer

## Overview

The Case Reporter Summarizer is a multi-layered system that generates comprehensive legal case summaries by orchestrating RAG retrieval, LLM inference, graph database queries, and persistent storage. The architecture prioritizes performance through caching, parallel processing, and asynchronous job queues while maintaining data integrity through transaction management and audit logging.

### Key Design Principles

- **Modular**: Each component (RAG, LLM, Graph, Storage) operates independently and can be tested/replaced
- **Asynchronous**: Long-running operations use RabbitMQ/XState to avoid blocking the UI
- **Cached**: Redis caches summaries and intermediate results to minimize redundant computation
- **Audited**: All operations logged with user ID, timestamp, and outcome for compliance
- **Resilient**: Graceful degradation when services fail; retry logic with exponential backoff

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     SvelteKit Frontend                          │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  Case Detail Page + TinyMCE Editor                       │  │
│  │  - "Generate Summary" button                             │  │
│  │  - Summary display with citations                        │  │
│  │  - Similar cases panel                                   │  │
│  │  - Export to PDF button                                  │  │
│  └──────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                    API Layer (SvelteKit)                        │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  POST /api/cases/[id]/summary/generate                  │  │
│  │  - Auth check (Lucia v3)                                │  │
│  │  - Validate case ownership                              │  │
│  │  - Enqueue summary job                                  │  │
│  │  - Return job ID for polling                            │  │
│  └──────────────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  GET /api/cases/[id]/summary                            │  │
│  │  - Retrieve cached or stored summary                    │  │
│  │  - Return with metadata (created_at, version)           │  │
│  └──────────────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  POST /api/cases/[id]/summary/export-pdf                │  │
│  │  - Generate PDF from summary                            │  │
│  │  - Include citations and metadata                       │  │
│  │  - Return download URL                                  │  │
│  └──────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                  Service Layer (Node.js)                        │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  CaseSummaryService                                      │  │
│  │  - Orchestrate summary generation                        │  │
│  │  - Manage caching and versioning                         │  │
│  │  - Handle error recovery                                 │  │
│  └──────────────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  RAGService                                              │  │
│  │  - Query pgvector for statute embeddings                │  │
│  │  - Query Qdrant for case law vectors                    │  │
│  │  - Rank results by relevance                             │  │
│  └──────────────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  LLMService (Gemma3-Legal)                               │  │
│  │  - Generate summary from retrieved context               │  │
│  │  - Extract citations and holdings                        │  │
│  │  - Format for TinyMCE                                    │  │
│  └──────────────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  GraphService (Neo4j)                                    │  │
│  │  - Create case → statute relationships                   │  │
│  │  - Query similar cases by charge bundle                  │  │
│  │  - Rank precedents by relevance                          │  │
│  └──────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                  Data Layer (Databases)                         │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  PostgreSQL (Drizzle ORM)                                │  │
│  │  - case_reports (summary text, version)                 │  │
│  │  - case_charges (statute references)                    │  │
│  │  - audit_log (all operations)                           │  │
│  └──────────────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  Redis                                                   │  │
│  │  - Cache: summary:[caseId] → summary text               │  │
│  │  - Cache: similar-cases:[caseId] → case list            │  │
│  │  - Job queue: summary-generation jobs                   │  │
│  └──────────────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  pgvector (PostgreSQL)                                   │  │
│  │  - statute_embeddings (statute text + vector)           │  │
│  │  - case_embeddings (case summary + vector)              │  │
│  └──────────────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  Qdrant                                                  │  │
│  │  - legal_evidence collection (case law vectors)         │  │
│  │  - statute_collection (statute vectors)                 │  │
│  └──────────────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  Neo4j                                                   │  │
│  │  - (Case)─[:CHARGES_WITH]→(Statute)                     │  │
│  │  - (Statute)─[:CITES]→(Statute)                         │  │
│  │  - (Case)─[:SIMILAR_TO]→(Case)                          │  │
│  └──────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

## Components and Interfaces

### 1. Frontend Components

#### CaseDetailPage.svelte
- Displays case information and summary
- "Generate Summary" button triggers API call
- Shows processing status with spinner
- Renders summary in TinyMCE editor
- Displays similar cases in sidebar

#### SummaryEditor.svelte
- TinyMCE wrapper component
- Renders summary with formatted citations
- Provides "Export to PDF" button
- Allows inline editing before saving
- Shows version history dropdown

#### SimilarCasesPanel.svelte
- Lists top 5 similar cases
- Shows case number, charges, and outcome
- Links to case detail pages
- Displays relevance score

### 2. API Routes

#### POST /api/cases/[id]/summary/generate
```typescript
Request: { caseId: string }
Response: { jobId: string; status: "queued" }
```
- Validates user is prosecutor/warden
- Checks case ownership
- Enqueues summary generation job
- Returns job ID for polling

#### GET /api/cases/[id]/summary
```typescript
Response: {
  id: string;
  caseId: string;
  text: string;
  citations: Citation[];
  createdAt: Date;
  version: number;
}
```
- Retrieves cached or stored summary
- Returns with metadata

#### POST /api/cases/[id]/summary/export-pdf
```typescript
Request: { summaryId: string }
Response: { downloadUrl: string }
```
- Generates PDF from summary
- Includes citations and metadata
- Returns download URL

#### GET /api/cases/[id]/summary/similar
```typescript
Response: {
  cases: Array<{
    id: string;
    title: string;
    charges: string[];
    outcome: string;
    relevanceScore: number;
  }>;
}
```
- Returns top 5 similar cases
- Includes relevance scores

### 3. Service Layer

#### CaseSummaryService
```typescript
class CaseSummaryService {
  async generateSummary(caseId: string, userId: string): Promise<Summary>
  async getSummary(caseId: string): Promise<Summary | null>
  async getSummaryVersions(caseId: string): Promise<Summary[]>
  async restoreSummaryVersion(caseId: string, version: number): Promise<Summary>
  async deleteSummary(caseId: string): Promise<void>
}
```

#### RAGService
```typescript
class RAGService {
  async retrieveStatutes(caseCharges: string[]): Promise<Statute[]>
  async retrieveCaseLaw(issues: string[]): Promise<CaseLaw[]>
  async rankResults(results: any[], query: string): Promise<any[]>
}
```

#### LLMService
```typescript
class LLMService {
  async generateSummary(context: SummaryContext): Promise<string>
  async extractCitations(text: string): Promise<Citation[]>
  async extractHolding(text: string): Promise<string>
}
```

#### GraphService
```typescript
class GraphService {
  async createCaseStatuteRelationships(caseId: string, statutes: Statute[]): Promise<void>
  async findSimilarCases(caseId: string, limit: number): Promise<Case[]>
  async rankCasesByRelevance(cases: Case[], referenceCase: Case): Promise<Case[]>
}
```

## Data Models

### case_reports Table
```sql
CREATE TABLE case_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID NOT NULL REFERENCES cases(id),
  summary_text TEXT NOT NULL,
  citations JSONB,
  holding TEXT,
  version INTEGER DEFAULT 1,
  created_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  is_current BOOLEAN DEFAULT TRUE
);
```

### case_charges Table
```sql
CREATE TABLE case_charges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID NOT NULL REFERENCES cases(id),
  statute_code VARCHAR(50) NOT NULL,
  jurisdiction VARCHAR(12) NOT NULL,
  severity VARCHAR(20),
  victim_class VARCHAR(50),
  bundling JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);
```

### audit_log Table
```sql
CREATE TABLE audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  action VARCHAR(100) NOT NULL,
  resource_type VARCHAR(50),
  resource_id UUID,
  details JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);
```

### Neo4j Schema
```cypher
CREATE CONSTRAINT case_id IF NOT EXISTS FOR (c:Case) REQUIRE c.id IS UNIQUE;
CREATE CONSTRAINT statute_code IF NOT EXISTS FOR (s:Statute) REQUIRE s.code IS UNIQUE;

CREATE INDEX case_charges IF NOT EXISTS FOR (c:Case) ON (c.charges);
CREATE INDEX statute_citations IF NOT EXISTS FOR (s:Statute) ON (s.citations);
```

## Error Handling

### Retry Strategy
- **Transient errors** (network, timeout): Exponential backoff (1s, 2s, 4s, 8s)
- **Service unavailable**: Fallback to cached result if available
- **Database errors**: Rollback transaction and notify user
- **LLM errors**: Log and suggest retry or contact support

### Fallback Behavior
- If RAG unavailable: Use basic statute lookup from database
- If LLM unavailable: Return structured template with case data
- If Neo4j unavailable: Skip similar case recommendations
- If Redis unavailable: Query database directly (slower)

## Testing Strategy

### Unit Tests
- CaseSummaryService: Generate, retrieve, version management
- RAGService: Statute retrieval, ranking logic
- LLMService: Citation extraction, holding generation
- GraphService: Relationship creation, similarity ranking

### Integration Tests
- End-to-end summary generation with all services
- Database transaction rollback on error
- Cache invalidation on summary update
- PDF export with citations

### Performance Tests
- Summary generation < 30 seconds for typical cases
- Cache hit retrieval < 100ms
- Similar case query < 5 seconds
- PDF generation < 10 seconds

## Security Considerations

- **Authentication**: Lucia v3 session validation on all routes
- **Authorization**: Role-based access (prosecutor/warden only)
- **Data isolation**: Cases scoped to user/organization
- **Audit logging**: All summary operations logged
- **Input validation**: Sanitize case data before LLM processing
- **Output sanitization**: Escape HTML in TinyMCE content

## Performance Optimization

- **Caching**: Redis cache summaries for 24 hours
- **Parallel processing**: Retrieve statutes and case law simultaneously
- **Lazy loading**: Load similar cases on demand
- **Pagination**: Limit similar cases to top 5
- **Indexing**: pgvector and Qdrant indexes on embedding columns
- **Connection pooling**: Reuse database connections

## Deployment Considerations

- **Environment variables**: LLM endpoint, database URLs, Redis connection
- **Database migrations**: Create tables and indexes before deployment
- **Service dependencies**: Ensure Ollama, Qdrant, Neo4j are running
- **Monitoring**: Log summary generation times and error rates
- **Scaling**: Use RabbitMQ for distributed job processing
