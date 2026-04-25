# Phase 3: RAG Preparation, CAG Inverse Lookup, and TensorRT Migration

## Introduction

Phase 3 completes the document processing pipeline by implementing RAG (Retrieval-Augmented Generation) preparation, inverse CAG (Case Argument Graph) lookup via Redis, and TensorRT optimization for embedding models. Building on Granite-Docling's DocTags output, this phase chunks documents intelligently, generates embeddings via TensorRT-optimized MiniLM and EmbeddingGemma, and enables fast inverse similarity lookups for legal case matching.

## Glossary

- **DocTags**: Structured output from Granite-Docling containing layout, text, tables, captions, and bounding boxes
- **Hybrid Chunking**: Layout-aware chunking that respects document structure while semantically merging small blocks
- **CAG (Case Argument Graph)**: Graph structure mapping cases, statutes, charges, and evidence relationships
- **Inverse CAG Lookup**: Fast similarity search to find related cases based on document embeddings
- **Product Quantization (PQ)**: Dimensionality reduction technique using 512 buckets for embedding clustering
- **TensorRT**: NVIDIA's inference optimization framework for GPU acceleration
- **MiniLM**: Lightweight embedding model optimized for legal text (384-dim, 22M params)
- **MiniLM-L6-v2**: Cross-encoder reranker model that reads query + candidate text for semantic relevance scoring
- **EmbeddingGemma**: Gemma-based embedding model for semantic similarity
- **Reranking**: Process of reordering search results using a small language model that evaluates true relevance to user query
- **Cross-Encoder**: Neural architecture that jointly encodes query and candidate text for ranking (vs. bi-encoder for embeddings)
- **CBOR**: Concise Binary Object Representation for efficient serialization
- **fp16**: Half-precision floating point (2 bytes per value)
- **int8**: 8-bit integer quantization for model weights

## Requirements

### Requirement 0: Evidence Board and Document Viewing

**User Story:** As a legal investigator, I want to view uploaded evidence documents with AI-generated summaries and analysis on a visual board, so that I can organize and correlate evidence across cases.

#### Acceptance Criteria

1. WHEN evidence is uploaded and processed, THE system SHALL display it on `/evidence_board` route with document summaries and analysis
2. WHILE viewing the evidence board, THE system SHALL show evidence cards in a grid layout with status indicators (Unreviewed, Flagged, Important)
3. WHEN evidence cards are displayed, THE system SHALL use color strips for status and dotted connection lines for relationships
4. IF user hovers over connections, THEN THE system SHALL highlight related evidence with stronger contrast
5. WHERE evidence count exceeds 20 visible items, THE system SHALL provide a "Library Drawer" list for additional access
6. WHEN user right-clicks evidence card, THE system SHALL show context menu: "Open in Panel", "Send to AI Chat", "Link to Statute/Citation"

### Requirement 1: Hybrid Document Chunking

**User Story:** As a legal document processor, I want to chunk DocTags output intelligently, so that I preserve document structure while enabling semantic retrieval.

#### Acceptance Criteria

1. WHEN DocTags are received from Granite-Docling, THE system SHALL parse layout blocks, tables, captions, and footnotes as distinct semantic units
2. WHILE processing text blocks, THE system SHALL merge consecutive small blocks (<200 tokens) with adjacent blocks to avoid fragmentation
3. WHEN a table is encountered, THE system SHALL preserve table structure as a single chunk with row/column metadata
4. IF a caption or footnote exists adjacent to a block, THEN THE system SHALL attach it to the parent block with semantic relationship markers
5. WHERE layout-first chunking is required (evidence scans), THE system SHALL preserve bounding box coordinates and page numbers

### Requirement 2: TensorRT-Optimized Embedding Generation

**User Story:** As a GPU-constrained system, I want to generate embeddings using TensorRT-optimized models, so that I maximize throughput while minimizing VRAM usage.

#### Acceptance Criteria

1. WHEN a chunk is ready for embedding, THE system SHALL route it to TensorRT-optimized MiniLM (int8 quantized)
2. WHILE embedding generation is active, THE system SHALL maintain GPU memory usage below 2GB for embedding operations
3. WHEN embedding generation completes, THE system SHALL convert embeddings to fp16 format for Redis caching
4. IF a chunk exceeds token limits, THEN THE system SHALL split it and generate separate embeddings with overlap markers
5. WHERE visual content exists (images, diagrams), THE system SHALL generate SigLIP2 embeddings for multimodal retrieval

### Requirement 3: Redis-Backed Inverse CAG Lookup

**User Story:** As a legal case matcher, I want to find similar cases via inverse embedding lookup, so that I can surface related precedents and charges.

#### Acceptance Criteria

1. WHEN an embedding is generated, THE system SHALL compute its product quantization (PQ) bucket ID from 512 buckets
2. WHILE storing embeddings, THE system SHALL cache the embedding in Redis with key `vlm:embed:{hash}` and TTL of 60 days
3. WHEN an inverse lookup is requested, THE system SHALL retrieve all embeddings in the same PQ bucket and compute cosine similarity
4. IF similarity exceeds threshold (0.75), THEN THE system SHALL return matching case IDs with similarity scores
5. WHERE inverse clusters exist, THE system SHALL maintain them in Redis with key `cag:inv:{bucket}` and TTL of 30 days

### Requirement 3.5: Result Reranking Layer (MiniLM-L6-v2)

**User Story:** As a legal researcher, I want search candidates reranked by semantic relevance, so that the most applicable statutes and cases appear first for LLM context building.

#### Acceptance Criteria

1. WHEN Qdrant GPU returns top-50 vector search candidates, THE system SHALL send them to MiniLM-L6-v2 reranker for semantic re-evaluation
2. WHILE reranking, THE system SHALL compute cross-encoder scores using query + candidate text pairs on CPU-only execution
3. WHEN reranking completes, THE system SHALL return the top-5 candidates sorted by reranker score (default K=5, configurable)
4. IF reranking latency exceeds 50ms per query, THEN THE system SHALL log a performance warning and recommend batch tuning
5. WHERE overlapping statutes exist (e.g., PC 273a, PC 270, PC 278), THE system SHALL rely on reranker scoring to avoid neighboring-but-incorrect hits and reduce hallucination risk

### Requirement 4: Pipeline Status Events and Streaming

**User Story:** As a frontend user, I want real-time status updates during document processing, so that I can monitor progress and see intermediate results.

#### Acceptance Criteria

1. WHEN document processing begins, THE system SHALL emit status events via QUIC streaming with event type, progress percentage, and current stage
2. WHILE chunking is in progress, THE system SHALL emit events for each chunk created with chunk ID, token count, and semantic type
3. WHEN embedding generation starts, THE system SHALL emit events for batch progress (e.g., "5/50 chunks embedded")
4. IF inverse CAG lookup completes, THEN THE system SHALL emit events with matching case IDs and similarity scores
5. WHERE processing fails, THE system SHALL emit error events with error code, message, and recovery suggestions

### Requirement 5: Windows CUDA Environment Configuration

**User Story:** As a Windows developer, I want proper CUDA path configuration, so that TensorRT and GPU workers initialize correctly.

#### Acceptance Criteria

1. WHEN the system starts on Windows, THE system SHALL detect CUDA installation path from registry or environment variables
2. WHILE initializing GPU workers, THE system SHALL validate CUDA version compatibility (11.8+) and cuDNN availability
3. WHEN TensorRT libraries are loaded, THE system SHALL use correct DLL paths for Windows (e.g., `nvinfer.dll`)
4. IF CUDA is not found, THEN THE system SHALL fall back to CPU mode with performance warnings
5. WHERE GPU workers are deployed, THE system SHALL log CUDA device info (compute capability, memory, driver version)

### Requirement 6: Performance Optimization for Inverse Hashing

**User Story:** As a performance-critical system, I want fast inverse similarity lookups, so that CAG matching completes in <100ms per query.

#### Acceptance Criteria

1. WHEN computing PQ bucket IDs, THE system SHALL use vectorized operations to process embeddings in batches
2. WHILE performing cosine similarity, THE system SHALL use Redis Lua scripts to avoid round-trip latency
3. WHEN inverse clusters are queried, THE system SHALL cache frequently accessed buckets in local memory with LRU eviction
4. IF lookup latency exceeds 100ms, THEN THE system SHALL log performance warnings and suggest bucket optimization
5. WHERE batch operations are possible, THE system SHALL pipeline Redis commands to reduce network overhead

### Requirement 7: Redis-Backed GPU Math Bridge

**User Story:** As a GPU-constrained system, I want to offload tensor math to Redis with CBOR compression, so that I minimize VRAM usage while maintaining retrieval accuracy.

#### Acceptance Criteria

1. WHEN embeddings are generated, THE system SHALL compress them to fp16 format and serialize via CBOR
2. WHILE storing embeddings in Redis, THE system SHALL use key structure `vlm:embed:{hash}` with automatic TTL management
3. WHEN computing top-K rankings, THE system SHALL use Redis Lua scripts to perform cosine similarity in-place without transferring vectors to GPU
4. IF retrieval requires inverse search, THEN THE system SHALL use product quantization buckets stored in Redis for O(1) bucket lookup
5. WHERE compression is applied, THE system SHALL maintain accuracy within 0.01 cosine distance compared to fp32 baseline

### Requirement 8: Visual Design System (Law Library + Retro Console)

**User Story:** As a legal professional, I want a professional yet approachable interface, so that I can work efficiently without cognitive overload.

#### Acceptance Criteria

1. WHEN the application loads, THE system SHALL display a warm parchment background (light khaki) with soft charcoal text
2. WHILE navigating pages, THE system SHALL use a golden-ratio 3-column layout: left sidebar (22%), center workspace (55%), right rail (23%)
3. WHEN displaying headers and titles, THE system SHALL use Crimson Text serif font for law-journal aesthetic
4. IF displaying long-form content (statutes, motions, summaries), THEN THE system SHALL use Source Sans 3 or Inter sans-serif with high line-height
5. WHERE status indicators are needed, THE system SHALL use pixel/terminal font only for status ribbons ("SYSTEM OPERATIONAL", "GPU: ACTIVE")
6. WHEN using accent colors, THE system SHALL apply: deep burgundy for primary actions, desaturated green for safe/operational status, amber for warnings, red sparingly for errors

### Requirement 9: Evidence Board Visual Layout

**User Story:** As an investigator, I want to see evidence organized visually with clear relationships, so that I can identify patterns and correlations.

#### Acceptance Criteria

1. WHEN evidence board loads, THE system SHALL display evidence cards in a grid layout on neutral khaki background with subtle grid lines
2. WHILE viewing evidence cards, THE system SHALL style them as manila folder/polaroid shapes with color status strips
3. WHEN evidence relationships exist, THE system SHALL show dotted connection lines with soft contrast
4. IF user hovers over connections, THEN THE system SHALL highlight related evidence with stronger contrast and show relationship metadata
5. WHERE zoom controls are needed, THE system SHALL provide 100%, +, − buttons and "Reset View" action
6. WHEN evidence count exceeds 20, THE system SHALL provide "Library Drawer" list for additional access without cluttering the board

### Requirement 10: MiniLM-L6-v2 Reranking for Search Results

**User Story:** As a legal researcher, I want search results reranked by semantic relevance, so that the most applicable statutes and cases appear first.

#### Acceptance Criteria

1. WHEN Qdrant returns top-50 vector search results, THE system SHALL pass them to MiniLM-L6-v2 reranker for semantic re-evaluation
2. WHILE reranking is in progress, THE system SHALL compute relevance scores using cross-encoder architecture (reads query + candidate text)
3. WHEN reranking completes, THE system SHALL return top-5 results sorted by true relevance (not just vector similarity)
4. IF reranking latency exceeds 50ms, THEN THE system SHALL log performance warning and suggest batch optimization
5. WHERE reranking is applied, THE system SHALL maintain accuracy within 0.02 relevance score variance compared to manual legal review

### Requirement 11: AI Chat and Statute Integration

**User Story:** As a legal professional, I want to chat with an AI assistant about cases and statutes, so that I can get analysis while maintaining legal accuracy and accountability.

#### Acceptance Criteria

1. WHEN chat interface loads, THE system SHALL display a dark background with modern sans-serif font and clear message labels ("Prosecutor", "Detective", "AI Legal Assistant")
2. WHILE using the chat, THE system SHALL show a disclaimer stripe: "This assistant cannot determine guilt or innocence. Verify all outputs against official sources (.gov, DA/AG)."
3. WHEN user clicks a statute result, THE system SHALL display statute text in serif font with high line-height in center column
4. IF statute is displayed, THEN THE system SHALL show related cases, charge bundles, and saved citations in right column
5. WHERE statute actions are needed, THE system SHALL provide non-distracting buttons: "Save Citation", "Send to Case Chat", "Add as Charge"
6. WHEN user highlights text, THE system SHALL show a mini-modal (TinyMCE/Monaco) with "Summarize & Save Citation" and "Cancel" actions

