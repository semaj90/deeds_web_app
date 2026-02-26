# RAG Enhancement System Design

## Overview

The RAG Enhancement System builds upon the existing legal document indexing infrastructure to provide comprehensive search, tagging, monitoring, and chat capabilities. The system integrates with the current Qdrant vector database, PostgreSQL backend, and SvelteKit frontend to deliver a production-ready legal research platform.

## Architecture

The system follows a modular architecture with clear separation of concerns:

- **RAG Core Modules**: Lightweight, dependency-free modules for tagging, search, and ranking
- **API Layer**: RESTful endpoints for search, health monitoring, and chat integration
- **Database Integration**: Schema-tolerant updates to existing PostgreSQL tables
- **Vector Search**: Enhanced Qdrant integration with legal-aware reranking
- **Frontend Components**: Health dashboard and admin interfaces

## Components and Interfaces

### Tag Extraction Module
- **Purpose**: Extract legal citations from document text
- **Input**: Raw document text
- **Output**: Structured legal tags (statutes, cases, codes)
- **Patterns**: Federal statutes, case law, California codes
- **Performance**: Regex-based for speed and reliability

### Tag Persistence Layer
- **Purpose**: Store and link extracted tags to document chunks
- **Tables**: `citation_tags`, `chunk_tag_links`
- **Operations**: Upsert tags, create chunk-tag relationships
- **Deduplication**: Automatic handling of duplicate tags

### Qdrant Integration
- **Purpose**: Vector search with legal metadata
- **Features**: HTTP-based client, no external dependencies
- **Payload Enhancement**: Include `tag_ids` for filtering and reranking
- **Error Handling**: Detailed error messages with HTTP status codes

### Legal-Aware Ranker
- **Purpose**: Rerank search results using legal context
- **Factors**: Cosine similarity (75%), shared tags (15%), jurisdiction (10%)
- **Explainability**: Detailed scoring breakdown for transparency
- **Configurability**: Adjustable weights for different use cases

### Health Monitoring
- **Purpose**: Monitor RAG system health and indexing status
- **Metrics**: Total chunks, indexed chunks, missing indexes, last update
- **Granularity**: Global overview and per-document breakdown
- **Performance**: Sub-2-second response for up to 10,000 documents

## Data Models

### ExtractedLegalTags
```typescript
type ExtractedLegalTags = {
  statutes: string[];    // Federal statutes (e.g., "18 U.S.C. § 1512")
  cases: string[];       // Case law (e.g., "Smith v. Jones (1996)")
  caCodes: string[];     // California codes (e.g., "Penal Code § 187")
}
```

### RagSearchRequest
```typescript
type RagSearchRequest = {
  query: string;
  limit?: number;
  scoreThreshold?: number;
  jurisdiction?: string | null;
  tagIds?: string[];
  caseId?: string | null;
}
```

### RankExplain
```typescript
type RankExplain = {
  cosine: number;           // Semantic similarity score
  sharedTags: number;       // Number of matching legal tags
  sameJurisdiction: number; // Jurisdiction match bonus
  finalScore: number;       // Weighted final score
}
```

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system-essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Legal Tag Extraction Consistency
*For any* document text containing legal citations, the tag extractor should consistently identify federal statutes, case citations, and California codes using the defined patterns
**Validates: Requirements 1.1, 1.2, 1.3**

### Property 2: Tag Persistence Round Trip
*For any* extracted legal tags, persisting them to the database and then retrieving the chunk's tag IDs should return the same tag information
**Validates: Requirements 1.4, 1.5**

### Property 3: Health Dashboard Completeness
*For any* database state, the health dashboard should include total chunks, indexed chunks, missing indexes, and timestamp data in the response
**Validates: Requirements 2.1, 2.2, 2.3, 2.4**

### Property 4: Embedding Dimension Consistency
*For any* search query, the embedding service should return exactly 768 dimensions, and the system should validate this constraint
**Validates: Requirements 3.1, 5.5**

### Property 5: Reranking Score Calculation
*For any* search results with legal metadata, the reranking algorithm should apply the configured weights and produce explainable scores
**Validates: Requirements 3.2, 3.3, 3.5**

### Property 6: Jurisdiction Filtering Boost
*For any* search with jurisdiction filter, results matching that jurisdiction should receive the configured boost in their final score
**Validates: Requirements 3.4**

### Property 7: Chat Citation Structure
*For any* chat response with retrieved sources, the citations should include document names, page numbers, relevance scores, and extracted legal tags
**Validates: Requirements 4.1, 4.3, 4.5**

### Property 8: Schema-Safe Updates
*For any* evidence_files update attempt, only allowed fields (chunk_count, indexed_at, processing_status) should be modified
**Validates: Requirements 5.1**

### Property 9: API Endpoint Consistency
*For any* valid API request, the endpoints should provide the expected functionality with proper filtering, search, and health monitoring
**Validates: Requirements 6.2, 6.3, 6.4, 6.5**

## Error Handling

The system implements comprehensive error handling with specific focus on:

- **Dimension Validation**: All vectors must be exactly 768 dimensions
- **Schema Tolerance**: Database updates are restricted to safe, known columns
- **Qdrant Failures**: Detailed HTTP status and response information in error messages
- **Missing Sources**: Chat responses indicate insufficient evidence when no relevant sources found
- **Invalid Inputs**: Clear error messages for malformed requests or missing required fields

## Testing Strategy

The system employs a dual testing approach combining unit tests and property-based tests:

### Unit Testing
- Specific examples of legal citation extraction
- API endpoint integration tests
- Database operation verification
- Error condition handling

### Property-Based Testing
- **Library**: fast-check for TypeScript/JavaScript
- **Iterations**: Minimum 100 iterations per property test
- **Coverage**: Universal properties across all valid inputs
- **Tagging**: Each property test tagged with format: `**Feature: rag-enhancement-system, Property {number}: {property_text}**`

Property-based tests will verify:
- Tag extraction works across diverse text inputs
- Reranking calculations are mathematically consistent
- API responses maintain required structure
- Database operations handle edge cases safely
- Vector operations validate dimensions correctly

Unit tests will cover:
- Specific legal citation patterns
- API error responses
- Database schema interactions
- Integration between components