# Requirements Document: Multi-Source Retrieval Topology

## Introduction

The current retrieval strategy uses a limited set of sources (DuckDuckGo web search, RAG, KAG). This feature expands the topology to include multiple authoritative knowledge sources (Google Search, Wikipedia, 4D graph topology, MinIO document storage, PostgreSQL summaries, pgvector embeddings, Gemma embeddings, and Qdrant mirrored vector search). The system will intelligently route queries to appropriate sources based on query type, confidence levels, and source relevance, creating a comprehensive 4D knowledge graph that mirrors across multiple vector databases.

## Glossary

- **Retrieval Strategy**: The process of selecting and executing queries across multiple knowledge sources
- **4D Graph Topology**: A knowledge graph with dimensions: (entity, relationship, temporal, confidence)
- **Source Router**: Component that determines which knowledge sources to query based on query characteristics
- **Vector Mirror**: Synchronized copies of embeddings across Qdrant and pgvector for redundancy and performance
- **Knowledge Source**: Any system that can retrieve or generate relevant information (web search, Wikipedia, RAG, KAG, graph DB, document store)
- **Query Confidence**: A score (0-1) indicating how confident the system is in the current retrieval results
- **Topology Synthesis**: The process of combining results from multiple sources into a unified knowledge representation
- **MinIO Bucket**: Object storage for documents and artifacts
- **PostgreSQL Summary**: Cached summaries of documents stored in PostgreSQL with pgvector embeddings
- **Gemma Embeddings**: Embeddings generated using the Gemma model for semantic search
- **Qdrant Mirror**: Synchronized vector database replica for high-availability vector search

## Requirements

### Requirement 1: Multi-Source Query Routing

**User Story:** As a system architect, I want the retrieval system to intelligently route queries to multiple knowledge sources, so that I can leverage diverse information sources for comprehensive answers.

#### Acceptance Criteria

1. WHEN a query is received THEN the system SHALL analyze query characteristics (intent, entity types, temporal aspects) and determine which sources are most relevant
2. WHEN a query targets legal documents THEN the system SHALL prioritize legal_rag_plus_kag and PostgreSQL summaries over general web search
3. WHEN a query targets general knowledge THEN the system SHALL include Wikipedia and Google Search in the retrieval chain
4. WHEN a query contains temporal references THEN the system SHALL query the 4D graph topology to retrieve time-aware results
5. WHEN multiple sources return results THEN the system SHALL rank and merge results based on source reliability and relevance scores

### Requirement 2: 4D Graph Topology Integration

**User Story:** As a knowledge engineer, I want to store and query knowledge in a 4D graph structure, so that I can capture entity relationships, temporal evolution, and confidence levels.

#### Acceptance Criteria

1. WHEN storing knowledge in the graph THEN the system SHALL create nodes with dimensions: entity, relationship type, timestamp, and confidence score
2. WHEN querying the graph THEN the system SHALL support filtering by any combination of dimensions
3. WHEN confidence drops below threshold THEN the system SHALL mark edges as uncertain and trigger verification queries
4. WHEN temporal queries are made THEN the system SHALL return results ordered by temporal relevance
5. WHEN the graph is updated THEN the system SHALL maintain consistency across all vector mirrors

### Requirement 3: Vector Database Mirroring

**User Story:** As a DevOps engineer, I want embeddings synchronized across Qdrant and pgvector, so that I can ensure high availability and performance.

#### Acceptance Criteria

1. WHEN an embedding is stored in Qdrant THEN the system SHALL automatically replicate it to pgvector with identical metadata
2. WHEN pgvector is unavailable THEN the system SHALL fall back to Qdrant without data loss
3. WHEN Qdrant is unavailable THEN the system SHALL fall back to pgvector without data loss
4. WHEN both databases are available THEN the system SHALL distribute queries across both for load balancing
5. WHEN a query is made THEN the system SHALL return consistent results regardless of which database is queried

### Requirement 4: Wikipedia Integration

**User Story:** As a user, I want the system to search Wikipedia for general knowledge, so that I can get authoritative information on topics.

#### Acceptance Criteria

1. WHEN a general knowledge query is made THEN the system SHALL search Wikipedia using the MediaWiki API
2. WHEN Wikipedia results are found THEN the system SHALL extract key sections and embed them for semantic search
3. WHEN Wikipedia results are retrieved THEN the system SHALL store them in MinIO with metadata for future reference
4. WHEN Wikipedia content is stored THEN the system SHALL create pgvector embeddings for similarity search
5. WHEN Wikipedia results are returned THEN the system SHALL include source attribution and confidence scores

### Requirement 5: Google Search Integration

**User Story:** As a user, I want the system to search Google for current information, so that I can get up-to-date results.

#### Acceptance Criteria

1. WHEN a current events or recent information query is made THEN the system SHALL search Google using the Custom Search API
2. WHEN Google results are found THEN the system SHALL extract snippets and full content where available
3. WHEN Google results are retrieved THEN the system SHALL store them in MinIO with timestamps
4. WHEN Google content is stored THEN the system SHALL create Gemma embeddings for semantic search
5. WHEN Google results are returned THEN the system SHALL include recency scores and source credibility ratings

### Requirement 6: PostgreSQL Summary Storage

**User Story:** As a data engineer, I want to store document summaries in PostgreSQL with embeddings, so that I can efficiently query and retrieve relevant information.

#### Acceptance Criteria

1. WHEN documents are ingested THEN the system SHALL generate summaries and store them in PostgreSQL
2. WHEN summaries are stored THEN the system SHALL create pgvector embeddings for each summary
3. WHEN a query is made THEN the system SHALL search summaries using vector similarity
4. WHEN summary results are found THEN the system SHALL retrieve full documents from MinIO if needed
5. WHEN summaries are updated THEN the system SHALL update corresponding pgvector embeddings

### Requirement 7: MinIO Document Storage Integration

**User Story:** As a document manager, I want all retrieved documents stored in MinIO, so that I can maintain a centralized document repository.

#### Acceptance Criteria

1. WHEN documents are retrieved from any source THEN the system SHALL store them in MinIO with structured metadata
2. WHEN documents are stored THEN the system SHALL create a PostgreSQL record with summary and embedding
3. WHEN documents are queried THEN the system SHALL retrieve from MinIO based on PostgreSQL search results
4. WHEN documents are updated THEN the system SHALL maintain version history in MinIO
5. WHEN storage quota is reached THEN the system SHALL implement LRU eviction based on access patterns

### Requirement 8: Topology Synthesis and Ranking

**User Story:** As a system architect, I want results from multiple sources synthesized into a unified ranking, so that I can provide the best answer regardless of source.

#### Acceptance Criteria

1. WHEN results are retrieved from multiple sources THEN the system SHALL normalize scores across sources
2. WHEN results are ranked THEN the system SHALL consider source reliability, recency, and relevance
3. WHEN duplicate results exist THEN the system SHALL merge them and combine confidence scores
4. WHEN results are synthesized THEN the system SHALL create a unified 4D graph representation
5. WHEN synthesis is complete THEN the system SHALL return ranked results with source attribution and confidence

### Requirement 9: Fallback Chain with Source Degradation

**User Story:** As a reliability engineer, I want the system to gracefully degrade when sources become unavailable, so that service remains available.

#### Acceptance Criteria

1. WHEN a source becomes unavailable THEN the system SHALL automatically remove it from the routing chain
2. WHEN all primary sources fail THEN the system SHALL fall back to cached results from MinIO
3. WHEN cached results are used THEN the system SHALL mark them as stale and trigger background refresh
4. WHEN sources recover THEN the system SHALL re-integrate them into the routing chain
5. WHEN multiple sources fail THEN the system SHALL alert operators and provide degraded service status

### Requirement 10: Confidence-Based Source Selection

**User Story:** As a quality engineer, I want the system to select sources based on confidence thresholds, so that I can ensure answer quality.

#### Acceptance Criteria

1. WHEN confidence is high (>0.8) THEN the system SHALL return results from primary sources only
2. WHEN confidence is medium (0.5-0.8) THEN the system SHALL query secondary sources for verification
3. WHEN confidence is low (<0.5) THEN the system SHALL trigger multi-source retrieval and web search
4. WHEN confidence increases THEN the system SHALL reduce source queries to improve performance
5. WHEN confidence cannot be determined THEN the system SHALL default to comprehensive multi-source retrieval

### Requirement 11: Google Search Integration with Citation Highlighting

**User Story:** As a researcher, I want search results with highlighted citations and source tracking, so that I can verify information and trace sources.

#### Acceptance Criteria

1. WHEN a Google Search query is executed THEN the system SHALL extract and highlight cited passages in results
2. WHEN results are returned THEN the system SHALL include citation metadata (source URL, title, context)
3. WHEN citations are stored THEN the system SHALL create embeddings for citation search
4. WHEN a user requests citations THEN the system SHALL verify citations are still accessible at source
5. WHEN results are displayed THEN the system SHALL show highlighted citations with source attribution

### Requirement 12: Gemma3 VLM Image Processing

**User Story:** As a visual analyst, I want to process images with Gemma3 VLM to extract text and visual content, so that I can understand multimodal information.

#### Acceptance Criteria

1. WHEN an image is provided THEN the system SHALL process it with Gemma3 VLM for text extraction
2. WHEN an image is analyzed THEN the system SHALL identify objects, scenes, and relationships
3. WHEN visual content is extracted THEN the system SHALL generate embeddings for visual search
4. WHEN images are processed THEN the system SHALL store extracted text and metadata in PostgreSQL
5. WHEN visual analysis is complete THEN the system SHALL store images in MinIO with metadata

### Requirement 13: Image Search with Qdrant

**User Story:** As a visual researcher, I want to search for images by visual similarity and content, so that I can find related visual evidence.

#### Acceptance Criteria

1. WHEN a text query is provided THEN the system SHALL search for related images using embeddings
2. WHEN an image is provided THEN the system SHALL find visually similar images in the database
3. WHEN images are searched THEN the system SHALL return results ranked by visual similarity
4. WHEN image results are returned THEN the system SHALL include extracted text and visual analysis
5. WHEN images are indexed THEN the system SHALL maintain consistency between Qdrant and PostgreSQL

### Requirement 14: Visual Evidence Extraction and Storage

**User Story:** As a document analyst, I want to extract images from search results and documents, so that I can build a visual evidence repository.

#### Acceptance Criteria

1. WHEN search results are retrieved THEN the system SHALL extract images from results
2. WHEN documents are ingested THEN the system SHALL extract images and process them
3. WHEN images are extracted THEN the system SHALL process with Gemma3 VLM for analysis
4. WHEN visual evidence is extracted THEN the system SHALL store in MinIO with metadata
5. WHEN evidence is stored THEN the system SHALL index for visual search and retrieval

### Requirement 15: Enhanced Result Synthesis with Visual Evidence

**User Story:** As a knowledge worker, I want results synthesized with citations and visual evidence, so that I can get comprehensive answers with supporting materials.

#### Acceptance Criteria

1. WHEN results are synthesized THEN the system SHALL include citation network and relationships
2. WHEN visual evidence exists THEN the system SHALL include images in synthesized results
3. WHEN results are combined THEN the system SHALL create unified 4D graph with visual nodes
4. WHEN synthesis is complete THEN the system SHALL rank results by relevance and evidence quality
5. WHEN results are returned THEN the system SHALL include citations, images, and confidence scores
