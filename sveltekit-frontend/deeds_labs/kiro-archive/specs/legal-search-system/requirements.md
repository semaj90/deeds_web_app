# Legal Search System - Requirements Document

## Introduction

Build a full-stack legal search platform that enables semantic and keyword search across statutes and criminal case law. The system ingests PDFs (statutes and cases), chunks them intelligently using LangExtract section boundaries, stores embeddings in Qdrant with crime-aware metadata, and exposes hybrid search via a Go microservice. The SvelteKit 2 frontend provides a browsable law library by state, and the LLM can invoke agentic search functions to retrieve relevant cases and statutes.

## Glossary

- **LangExtract**: Language extraction tool that identifies document sections (facts, issues, reasoning, holding, citations, parties, motions, bibliography, procedural_history, sentencing, judgment).
- **Section Type**: Canonical labels for document sections (facts, issues, reasoning, holding, citations, parties, motions, bibliography, procedural_history, sentencing, judgment).
- **Crime Code**: Statute reference (e.g., "PC 211" for California Penal Code § 211).
- **Crime Category**: Semantic grouping of crimes (e.g., "robbery", "drug", "homicide", "burglary").
- **Crime Classification**: Legal severity (felony, misdemeanor, infraction, wobbler).
- **Qdrant**: Vector database with HNSW indexing and metadata filtering.
- **Elasticsearch (ES)**: Full-text search engine with keyword and filter support.
- **Go Microservice**: Backend service exposing hybrid search via gRPC and REST.
- **Drizzle ORM**: TypeScript ORM for PostgreSQL.
- **SvelteKit 2**: Full-stack JavaScript framework with SSR.
- **Gemma3-legal**: LLM fine-tuned for legal reasoning.
- **Agentic Function**: Tool exposed to LLM for autonomous search and retrieval.

## Requirements

### Requirement 1: Section-Aware Document Chunking

**User Story:** As a legal researcher, I want documents to be split into logical sections (facts, motions, bibliography, etc.) so that I can search within specific sections and retrieve contextually relevant results.

#### Acceptance Criteria

1. WHEN a PDF is ingested, THE system SHALL use LangExtract to identify and label sections with one of: facts, issues, reasoning, holding, citations, parties, motions, bibliography, procedural_history, sentencing, judgment.

2. WHILE processing each section, THE system SHALL apply a sliding window (512–1024 tokens, 128-token overlap) to create chunks if the section exceeds the token limit.

3. WHEN a chunk is created, THE system SHALL store section_type, section_subtype (if applicable), token_start, token_end, and raw text in the chunk metadata.

4. WHERE a section contains subsections (e.g., "motion_to_suppress" within motions), THE system SHALL label the subtype for precise filtering.

5. IF a section is shorter than the token limit, THE system SHALL store it as a single chunk without splitting.

### Requirement 2: Crime-Aware Metadata Extraction and Storage

**User Story:** As a legal analyst, I want case metadata (crime code, category, classification, sentencing) to be extracted and stored so that I can filter search results by crime type and severity.

#### Acceptance Criteria

1. WHEN a criminal case PDF is ingested, THE system SHALL use LangExtract to extract: crime_code (e.g., "PC 211"), crime_category (e.g., "robbery"), crime_classification (felony/misdemeanor/infraction/wobbler), sentencing_year, sentence_length_months, and enhancements.

2. WHEN crime metadata is extracted, THE system SHALL store it in PostgreSQL (crimes table) linked to the case record via case_id.

3. WHEN a chunk is created from a case, THE system SHALL include crime metadata in the Qdrant payload and Elasticsearch document for filtering.

4. IF a case involves multiple crimes, THE system SHALL create separate crime records for each charge.

5. WHERE sentencing information is available, THE system SHALL store sentence_length_months as an integer for range queries.

### Requirement 3: Hybrid Search via Qdrant and Elasticsearch

**User Story:** As a legal researcher, I want to search cases and statutes using both semantic similarity and keyword matching so that I can find relevant results even with different phrasing.

#### Acceptance Criteria

1. WHEN a search query is submitted, THE system SHALL compute an embedding using Gemma3 embeddings and query Qdrant with cosine distance and HNSW indexing.

2. WHEN a search query is submitted, THE system SHALL also query Elasticsearch for full-text and keyword matches.

3. WHEN both Qdrant and Elasticsearch return results, THE system SHALL merge and rank them using Reciprocal Rank Fusion (RRF).

4. WHERE metadata filters are provided (jurisdiction, crime_category, crime_classification, section_type), THE system SHALL apply them to both Qdrant and Elasticsearch queries.

5. IF a query includes a section_type filter (e.g., "motions"), THE system SHALL prioritize chunks with matching section_type in the results.

### Requirement 4: Go Microservice for Hybrid Search

**User Story:** As a backend developer, I want a Go microservice that exposes hybrid search via gRPC and REST so that the SvelteKit frontend and LLM can invoke searches efficiently.

#### Acceptance Criteria

1. WHEN a search request is received, THE Go microservice SHALL query Qdrant and Elasticsearch in parallel.

2. WHEN results are returned, THE Go microservice SHALL merge them using RRF and return ranked chunks with metadata.

3. WHERE gRPC is used, THE Go microservice SHALL define protobuffer schemas for search requests and responses.

4. WHERE REST is used, THE Go microservice SHALL expose `/search/cases` and `/search/laws` endpoints.

5. IF a query fails in Qdrant or Elasticsearch, THE Go microservice SHALL fall back to the other source and return partial results.

### Requirement 5: SvelteKit 2 Law Library UI

**User Story:** As a legal professional, I want to browse statutes by state and view related cases so that I can understand how laws are applied in practice.

#### Acceptance Criteria

1. WHEN the `/laws` route is accessed, THE system SHALL display a list of all US states and jurisdictions.

2. WHEN a state is selected, THE system SHALL load and display all statutes (codes) for that jurisdiction.

3. WHEN a statute is selected, THE system SHALL display the full text and a list of related criminal cases (filtered by crime_code).

4. WHEN a case is selected, THE system SHALL display case details, related statutes, and similar cases (by crime_category and crime_classification).

5. WHERE search filters are available, THE system SHALL allow filtering by crime_category, crime_classification, and section_type.

### Requirement 6: Agentic Function Calls for LLM

**User Story:** As an LLM user, I want the Gemma3-legal model to have access to search functions so that it can autonomously retrieve relevant cases and statutes to support legal reasoning.

#### Acceptance Criteria

1. WHEN the LLM invokes `search_cases`, THE system SHALL accept query, jurisdiction, crimeCategory, crimeClassification, sectionType, and limit parameters.

2. WHEN the LLM invokes `search_law_sections`, THE system SHALL accept query, state, codeAbbrev, and limit parameters.

3. WHEN a function is invoked, THE system SHALL return chunks with metadata (case_name, crime_code, section_type, entities) for the LLM to reason over.

4. WHERE the LLM requests similar cases, THE system SHALL filter by crime_category and crime_classification and return ranked results.

5. IF the LLM requests statutes related to a crime, THE system SHALL cross-reference crime_code with law section numbers and return matching statutes.

### Requirement 7: PostgreSQL + Drizzle Schema for Cases and Laws

**User Story:** As a database architect, I want a normalized schema for cases, crimes, and laws so that data is consistent and queryable.

#### Acceptance Criteria

1. WHEN a case is ingested, THE system SHALL create a record in the cases table with: id, externalId, caseName, jurisdiction, courtName, decisionDate, rawDocMinioKey, langextractJsonMinioKey, langextractHtmlMinioKey, langextractSummary, createdAt.

2. WHEN crimes are extracted, THE system SHALL create records in the crimes table with: id, caseId, crimeCode, crimeCategory, crimeClassification, attempted, sentencingYear, sentenceLengthMonths, enhancements.

3. WHEN statutes are ingested, THE system SHALL create records in the laws table with: id, jurisdiction, codeTitle, codeAbbrev, codeEdition, createdAt.

4. WHEN statute sections are ingested, THE system SHALL create records in the lawSections table with: id, lawId, sectionNumber, fullCitation, heading, text, langextractSummary.

5. WHERE embeddings are stored, THE system SHALL use pgvector columns (768-dimensional) for statute sections and case chunks.

### Requirement 8: Qdrant Collection Schema with Crime Metadata

**User Story:** As a search engineer, I want Qdrant to store case chunks with crime metadata and section types so that I can filter and rank results by legal relevance.

#### Acceptance Criteria

1. WHEN a chunk is indexed in Qdrant, THE system SHALL store: doc_id, case_id, chunk_id, jurisdiction, court_name, decision_year, section_type, section_subtype, crime_code, crime_category, crime_classification, sentencing_year, sentence_length_months, entities (party, statute, judge).

2. WHEN a search is performed, THE system SHALL support filtering by: jurisdiction, crime_category, crime_classification, section_type, sentencing_year (range).

3. WHERE HNSW indexing is used, THE system SHALL configure it for cosine distance with appropriate ef_construct and ef_search parameters.

4. IF a chunk has multiple crimes, THE system SHALL replicate the chunk in Qdrant with each crime_code for independent filtering.

5. WHEN a chunk is updated or deleted, THE system SHALL maintain consistency between PostgreSQL and Qdrant.

### Requirement 9: Elasticsearch Index for Full-Text Search

**User Story:** As a legal researcher, I want full-text search over case and statute text so that I can find documents by keyword even if semantic similarity is low.

#### Acceptance Criteria

1. WHEN a chunk is indexed in Elasticsearch, THE system SHALL store: text, section_type, crime_code, crime_category, crime_classification, jurisdiction, decision_year, sentencing_year, entities.

2. WHEN a search query is submitted, THE system SHALL support: full-text search on text, keyword filters on section_type and crime_category, range queries on sentencing_year.

3. WHERE results are ranked, THE system SHALL use BM25 scoring for text relevance.

4. IF a query includes both text and filters, THE system SHALL combine them using a bool query (must + filter).

5. WHEN results are returned, THE system SHALL include _score for ranking in RRF.

### Requirement 10: LangExtract Integration for Section Extraction

**User Story:** As a data engineer, I want to use LangExtract to automatically identify and label document sections so that chunking is semantically aware.

#### Acceptance Criteria

1. WHEN a PDF is uploaded, THE system SHALL call LangExtract with a prompt that instructs it to identify sections and label them with canonical types.

2. WHEN LangExtract returns results, THE system SHALL parse the JSON output and extract: section_type, section_text, start_offset, end_offset.

3. WHERE LangExtract is unavailable, THE system SHALL fall back to heuristic section detection (e.g., regex on headings).

4. IF LangExtract confidence is below a threshold (e.g., 0.7), THE system SHALL flag the section for manual review.

5. WHEN section extraction is complete, THE system SHALL proceed to chunking and embedding.

### Requirement 11: MinIO Bucket Setup for Document Storage

**User Story:** As a DevOps engineer, I want MinIO buckets configured for storing raw PDFs, parsed documents, and metadata so that documents are organized and retrievable.

#### Acceptance Criteria

1. WHEN the system initializes, THE system SHALL create MinIO buckets: `minio_bucket_laws` (raw PDFs), `minio_bucket_laws_parsed` (extracted text), and `minio_bucket_laws_metadata` (JSON metadata).

2. WHEN a document is uploaded, THE system SHALL store the raw PDF in `minio_bucket_laws` with a key: `{jurisdiction}/{codeAbbrev}/{sectionNumber}.pdf`.

3. WHEN a document is parsed, THE system SHALL store the extracted text in `minio_bucket_laws_parsed` with a key: `{jurisdiction}/{codeAbbrev}/{sectionNumber}.txt`.

4. WHEN metadata is extracted, THE system SHALL store the JSON in `minio_bucket_laws_metadata` with a key: `{jurisdiction}/{codeAbbrev}/{sectionNumber}.json`.

5. WHERE documents are case files, THE system SHALL use keys: `cases/{jurisdiction}/{caseId}/{chunkIndex}.pdf`.

### Requirement 12: Redis Echo Cache for Popular Searches

**User Story:** As a performance engineer, I want frequently accessed statutes and cases cached in Redis so that popular searches return instantly.

#### Acceptance Criteria

1. WHEN a search is performed, THE system SHALL increment a hit counter in Redis with key: `statute:echo:{titleNumber}:{section}` or `case:echo:{caseId}`.

2. WHEN results are ranked, THE system SHALL apply a ranking boost: `semantic_score + echo_hits * 0.15`.

3. WHEN the cache TTL expires (default 5 minutes), THE system SHALL evict the entry and reset the counter.

4. WHERE a statute or case reaches a hit threshold (e.g., 10 hits), THE system SHALL pre-compute and cache the embedding in Redis.

5. IF Redis is unavailable, THE system SHALL fall back to Qdrant/ES without echo ranking.

### Requirement 13: RabbitMQ Clustering Jobs for SOM and K-Means

**User Story:** As a data scientist, I want clustering jobs (SOM and k-means) to run asynchronously via RabbitMQ so that the ingestion pipeline is not blocked.

#### Acceptance Criteria

1. WHEN new chunks are indexed, THE system SHALL publish a message to RabbitMQ queue: `clustering.jobs` with payload: `{ event: "NEW_DATA", chunkCount: N, timestamp: T }`.

2. WHEN a clustering job is triggered, THE system SHALL run SOM to discover emergent categories and k-means to assign crisp labels.

3. WHEN clustering completes, THE system SHALL update Qdrant payloads with cluster labels and publish a message: `{ event: "CLUSTERING_COMPLETE", labels: [...] }`.

4. WHERE clustering fails, THE system SHALL retry up to 3 times with exponential backoff.

5. IF clustering is not completed within a timeout (e.g., 1 hour), THE system SHALL mark the job as failed and alert the operator.

### Requirement 14: XState v5 Orchestration for Clustering Workflow

**User Story:** As a workflow engineer, I want XState v5 to orchestrate clustering jobs with state transitions, retries, and rollbacks so that the system is resilient and observable.

#### Acceptance Criteria

1. WHEN a clustering job is enqueued, THE system SHALL transition through states: waiting → queue → clustering → tagging → indexing → complete.

2. WHEN a state transition fails, THE system SHALL retry the transition up to 3 times before transitioning to an error state.

3. WHEN a job completes, THE system SHALL emit an event: `CLUSTERING_COMPLETE` with metadata (cluster count, labels, timestamp).

4. WHERE a job is rolled back, THE system SHALL revert Qdrant payloads to the previous version and emit: `ROLLBACK_COMPLETE`.

5. IF a job is in progress and a new job is enqueued, THE system SHALL queue the new job and process it after the current job completes.

### Requirement 15: IndexedDB Cache for Browser-Side Search and Autocomplete

**User Story:** As a frontend developer, I want IndexedDB to cache statute metadata and embeddings locally so that autocomplete and search work offline.

#### Acceptance Criteria

1. WHEN the /laws page loads, THE system SHALL sync statute metadata from the server to IndexedDB with keys: `title + section + slug + category + keywords + echo_hits + SOM/k-means labels`.

2. WHEN a user types in the search box, THE system SHALL query IndexedDB for matching statutes and display autocomplete suggestions.

3. WHEN a user selects a suggestion, THE system SHALL query Qdrant for semantic similarity and pgvector for confirmation.

4. WHERE IndexedDB is unavailable, THE system SHALL fall back to server-side search.

5. IF the IndexedDB cache is stale (older than 24 hours), THE system SHALL refresh it from the server.

### Requirement 16: SOM and K-Means Clustering for Legal Taxonomy

**User Story:** As a legal analyst, I want SOM to discover emergent legal categories and k-means to assign crisp labels so that statutes are organized by semantic similarity.

#### Acceptance Criteria

1. WHEN clustering is triggered, THE system SHALL run SOM on statute embeddings to discover emergent categories (e.g., "violent crime", "property crime", "drug offenses").

2. WHEN SOM completes, THE system SHALL run k-means on the SOM centroids to assign crisp cluster labels.

3. WHEN labels are assigned, THE system SHALL store them in Qdrant payloads with fields: `som_cluster_id`, `kmeans_label`, `cluster_confidence`.

4. WHERE a statute has low cluster confidence (< 0.7), THE system SHALL flag it for manual review.

5. IF clustering results change significantly (> 20% label changes), THE system SHALL alert the operator and provide a rollback option.

### Requirement 17: Browser ONNX Agents for Offline Inference

**User Story:** As a frontend developer, I want to run lightweight ONNX models in the browser so that users can get category suggestions and embeddings offline.

#### Acceptance Criteria

1. WHEN the /laws page loads, THE system SHALL load `gemma-3-270m-onnx` for category suggestion and intent parsing.

2. WHEN a user types a query, THE system SHALL run the ONNX model to suggest categories and refine the search.

3. WHEN IndexedDB embeddings are available, THE system SHALL use `embeddinggemma-onnx` to compute fallback embeddings for offline vector search.

4. WHERE the browser is offline, THE system SHALL return results from IndexedDB without server queries.

5. IF ONNX model loading fails, THE system SHALL fall back to server-side inference.

