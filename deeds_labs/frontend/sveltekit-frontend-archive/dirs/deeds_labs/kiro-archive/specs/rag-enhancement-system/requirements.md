# RAG Enhancement System Requirements

## Introduction

This specification defines a comprehensive RAG (Retrieval-Augmented Generation) enhancement system that builds upon the existing legal document indexing infrastructure. The system will provide auto-tagging of legal citations, health monitoring, intelligent search with reranking, and contextual chat integration.

## Glossary

- **RAG System**: Retrieval-Augmented Generation system for legal document search and analysis
- **Qdrant**: Vector database used for storing and searching document embeddings
- **Embedding Service**: Service that converts text to 768-dimensional vectors using embeddinggemma model
- **Legal Tags**: Extracted citations including statutes, cases, and legal codes
- **Chunk**: A segmented portion of a legal document with associated metadata
- **Reranking**: Process of adjusting search results based on legal-specific criteria
- **HNSW Index**: Hierarchical Navigable Small World index used by Qdrant for fast vector search

## Requirements

### Requirement 1

**User Story:** As a legal researcher, I want legal citations to be automatically extracted and tagged from document chunks, so that I can filter and find relevant documents by specific statutes and cases.

#### Acceptance Criteria

1. WHEN a document chunk is processed THEN the system SHALL extract federal statutes matching the pattern "\d+ U.S.C. § \d+"
2. WHEN a document chunk is processed THEN the system SHALL extract case citations matching the pattern "[A-Z][a-z]+ v. [A-Z][a-z]+"
3. WHEN a document chunk is processed THEN the system SHALL extract California codes matching the pattern "(Penal Code|PC) § \d+"
4. WHEN legal tags are extracted THEN the system SHALL persist them to the citation_tags table with appropriate namespace and jurisdiction
5. WHEN tags are persisted THEN the system SHALL create links in chunk_tag_links table connecting chunks to their extracted tags

### Requirement 2

**User Story:** As a system administrator, I want to monitor the health of the RAG indexing system, so that I can identify and resolve indexing issues quickly.

#### Acceptance Criteria

1. WHEN accessing the RAG health dashboard THEN the system SHALL display total chunks, indexed chunks, and missing index counts
2. WHEN viewing health metrics THEN the system SHALL show the last indexed timestamp for monitoring freshness
3. WHEN examining per-document status THEN the system SHALL list documents with their chunk counts and indexing status
4. WHEN identifying failed chunks THEN the system SHALL provide a sample list of chunks missing from the index
5. WHEN health data is requested THEN the system SHALL respond within 2 seconds for up to 10,000 documents

### Requirement 3

**User Story:** As a legal researcher, I want intelligent search that considers both semantic similarity and legal context, so that I can find the most relevant documents for my research.

#### Acceptance Criteria

1. WHEN performing a search THEN the system SHALL embed the query using the same 768-dimensional embedding service
2. WHEN search results are returned THEN the system SHALL rerank based on cosine similarity, shared legal tags, and jurisdiction matching
3. WHEN reranking occurs THEN the system SHALL apply configurable weights (default: 75% cosine, 15% shared tags, 10% jurisdiction)
4. WHEN search includes jurisdiction filter THEN the system SHALL boost results from the same jurisdiction
5. WHEN search results are returned THEN the system SHALL include explainability data showing how scores were calculated

### Requirement 4

**User Story:** As a legal professional, I want contextual chat that retrieves relevant documents and provides citations, so that I can get accurate answers with proper legal references.

#### Acceptance Criteria

1. WHEN a chat query is submitted THEN the system SHALL perform RAG search to find relevant document chunks
2. WHEN generating responses THEN the system SHALL include only information supported by the retrieved sources
3. WHEN providing answers THEN the system SHALL include structured citations with document names, page numbers, and relevance scores
4. WHEN no relevant sources are found THEN the system SHALL indicate insufficient evidence rather than generating unsupported content
5. WHEN citations are provided THEN the system SHALL include extracted legal tags for each cited chunk

### Requirement 5

**User Story:** As a developer, I want the system to be resilient to schema changes and provide clear error messages, so that the system remains stable as the database evolves.

#### Acceptance Criteria

1. WHEN updating evidence_files table THEN the system SHALL only modify allowed fields (chunk_count, indexed_at, processing_status)
2. WHEN embedding dimensions are incorrect THEN the system SHALL throw an error with the expected vs actual dimensions
3. WHEN Qdrant operations fail THEN the system SHALL provide detailed error messages including HTTP status and response
4. WHEN database operations encounter unknown columns THEN the system SHALL continue processing without failing
5. WHEN vector operations are performed THEN the system SHALL validate that all vectors are exactly 768 dimensions

### Requirement 6

**User Story:** As a system integrator, I want clean API endpoints for all RAG operations, so that I can build additional tools and integrations.

#### Acceptance Criteria

1. WHEN triggering indexing THEN the system SHALL provide POST /api/rag/index endpoint
2. WHEN searching documents THEN the system SHALL provide POST /api/rag/search with filtering and reranking
3. WHEN browsing tags THEN the system SHALL provide GET /api/rag/tags with namespace and query filtering
4. WHEN monitoring health THEN the system SHALL provide GET /api/admin/rag-health with comprehensive metrics
5. WHEN using contextual chat THEN the system SHALL provide POST /api/ai/contextual-chat with RAG integration