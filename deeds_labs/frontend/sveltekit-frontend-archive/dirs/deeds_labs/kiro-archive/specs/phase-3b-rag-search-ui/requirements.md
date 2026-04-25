# Phase 3B: Evidence RAG Search UI - Requirements

## Introduction

Phase 3B implements the Evidence RAG (Retrieval-Augmented Generation) Search UI, enabling users to search through uploaded legal evidence documents using semantic search, reranking, and visual evidence board organization. This phase builds on Phase 3A (Evidence Upload) and Phase 3D (Worker Pipeline) to provide a complete evidence discovery and organization system.

The system integrates:
- Semantic search via Qdrant vector database
- MiniLM reranking for relevance scoring
- Evidence board visualization with golden-ratio layout
- Search result caching for performance
- Real-time search progress streaming

## Glossary

- **Evidence**: Uploaded legal documents (PDFs, images) processed through OCR and chunking
- **Chunk**: Semantic unit of text extracted from evidence (paragraph, table, caption)
- **Embedding**: Vector representation of chunk text (1024-dim for MiniLM, 768-dim for EmbeddingGemma)
- **Qdrant**: Vector database for semantic search (top-50 results)
- **Reranking**: MiniLM-L6-v2 cross-encoder scoring to refine top-50 to top-5 results
- **Evidence Board**: Visual grid layout displaying evidence cards with relationships
- **Search Cache**: Redis cache for search results and reranking scores (24-hour TTL)
- **Semantic Search**: Query-to-chunk similarity matching using embeddings
- **RAG**: Retrieval-Augmented Generation pipeline (search → rerank → display)

## Requirements

### Requirement 1: Semantic Search Endpoint

**User Story:** As a legal professional, I want to search uploaded evidence by semantic meaning, so that I can find relevant documents without exact keyword matching.

#### Acceptance Criteria

1. WHEN a user submits a search query, THE system SHALL generate an embedding for the query text using the same model as evidence chunks
2. WHEN the query embedding is generated, THE system SHALL search Qdrant for top-50 semantically similar chunks
3. WHEN Qdrant returns results, THE system SHALL retrieve full chunk metadata (text, page, doc_id, bounding_boxes) from MinIO
4. WHEN results are retrieved, THE system SHALL return results within 100ms for typical queries
5. WHERE search results are cached, THE system SHALL return cached results if query hash matches (24-hour TTL)

### Requirement 2: Reranking Pipeline

**User Story:** As a legal professional, I want search results to be ranked by relevance, so that the most important evidence appears first.

#### Acceptance Criteria

1. WHEN Qdrant returns top-50 results, THE system SHALL pass results to MiniLM reranker
2. WHEN MiniLM reranker processes results, THE system SHALL compute cross-encoder scores for query + each candidate
3. WHEN scores are computed, THE system SHALL sort results by score and return top-5 reranked results
4. WHEN reranking completes, THE system SHALL cache results with query hash key (24-hour TTL)
5. WHERE reranking latency exceeds 50ms, THE system SHALL log warning with query hash and latency

### Requirement 3: Search Result Display

**User Story:** As a legal professional, I want to view search results with full context, so that I can quickly assess relevance.

#### Acceptance Criteria

1. WHEN search results are returned, THE system SHALL display results in list view with title, snippet, relevance score
2. WHEN a user clicks a result, THE system SHALL display full chunk text in detail panel with metadata
3. WHEN detail panel is displayed, THE system SHALL show page number, document ID, bounding boxes, and related chunks
4. WHEN related chunks are shown, THE system SHALL highlight connections to other chunks from same document
5. WHERE chunk text exceeds 500 characters, THE system SHALL truncate snippet with "..." and show full text in detail panel

### Requirement 4: Evidence Board Visualization

**User Story:** As a legal professional, I want to visualize evidence relationships on a board, so that I can understand document structure and connections.

#### Acceptance Criteria

1. WHEN evidence board is loaded, THE system SHALL display evidence cards in golden-ratio 3-column layout (22% / 55% / 23%)
2. WHEN cards are displayed, THE system SHALL render cards as manila folder/polaroid shapes with status color strips
3. WHEN cards are rendered, THE system SHALL show dotted connection lines between related evidence
4. WHEN user hovers over card, THE system SHALL highlight related cards with stronger contrast
5. WHEN user clicks zoom controls, THE system SHALL adjust view scale (100%, +10%, -10%, reset to 100%)

### Requirement 5: Search Caching

**User Story:** As a system administrator, I want search results cached, so that repeated queries return instantly.

#### Acceptance Criteria

1. WHEN a search query is submitted, THE system SHALL compute hash of query text
2. WHEN query hash is computed, THE system SHALL check Redis for cached results
3. WHEN cached results exist, THE system SHALL return cached results without recomputing embeddings or reranking
4. WHEN new results are computed, THE system SHALL store results in Redis with 24-hour TTL
5. WHERE cache is invalidated, THE system SHALL remove cached results for affected documents

### Requirement 6: Search Progress Streaming

**User Story:** As a user, I want to see search progress in real-time, so that I know the system is working.

#### Acceptance Criteria

1. WHEN a search query is submitted, THE system SHALL establish SSE connection for progress updates
2. WHEN embedding is generated, THE system SHALL emit "embedding_complete" event
3. WHEN Qdrant search completes, THE system SHALL emit "search_complete" event with result count
4. WHEN reranking completes, THE system SHALL emit "reranking_complete" event with top-5 results
5. WHEN all steps complete, THE system SHALL emit "search_complete" event with final results

### Requirement 7: Search Filters

**User Story:** As a legal professional, I want to filter search results, so that I can narrow results by jurisdiction, statute, or date.

#### Acceptance Criteria

1. WHEN search UI is displayed, THE system SHALL show filter panel with jurisdiction, statute type, and date range
2. WHEN user selects filters, THE system SHALL apply filters to search results
3. WHEN filters are applied, THE system SHALL re-search Qdrant with filter constraints
4. WHEN filtered results are returned, THE system SHALL update result count and display filtered results
5. WHERE no results match filters, THE system SHALL display "No results found" message with suggestion to broaden filters

### Requirement 8: Result Detail Panel

**User Story:** As a legal professional, I want to view full context for search results, so that I can make informed decisions.

#### Acceptance Criteria

1. WHEN a result is selected, THE system SHALL display full chunk text in serif font with high line-height
2. WHEN chunk is displayed, THE system SHALL show metadata (page, doc_id, relevance score, bounding boxes)
3. WHEN metadata is shown, THE system SHALL display related chunks from same document
4. WHEN related chunks are shown, THE system SHALL allow navigation between chunks
5. WHERE chunk contains statute references, THE system SHALL render references as clickable links

### Requirement 9: Search Performance

**User Story:** As a system administrator, I want search to be fast, so that users have responsive experience.

#### Acceptance Criteria

1. WHEN a search query is submitted, THE system SHALL return results within 100ms for cached queries
2. WHEN a new search is performed, THE system SHALL return results within 500ms (embedding + search + reranking)
3. WHEN embedding generation completes, THE system SHALL complete within 50ms
4. WHEN Qdrant search completes, THE system SHALL complete within 100ms for top-50 results
5. WHERE search latency exceeds 500ms, THE system SHALL log warning with query hash and latency breakdown

### Requirement 10: Search Error Handling

**User Story:** As a user, I want clear error messages, so that I can understand what went wrong.

#### Acceptance Criteria

1. IF search query is empty, THEN THE system SHALL display "Please enter a search query" message
2. IF search query exceeds 1000 characters, THEN THE system SHALL display "Query too long" message
3. IF Qdrant is unavailable, THEN THE system SHALL display "Search service unavailable" message
4. IF embedding service fails, THEN THE system SHALL display "Could not process query" message
5. IF reranking service fails, THEN THE system SHALL return top-50 Qdrant results without reranking

---

## Summary

Phase 3B implements a complete Evidence RAG Search UI with:
- Semantic search via Qdrant (top-50 results)
- MiniLM reranking (top-5 results)
- Evidence board visualization
- Search result caching (24-hour TTL)
- Real-time progress streaming
- Comprehensive error handling

The system integrates with Phase 3A (Evidence Upload) and Phase 3D (Worker Pipeline) to provide end-to-end evidence discovery and organization.
