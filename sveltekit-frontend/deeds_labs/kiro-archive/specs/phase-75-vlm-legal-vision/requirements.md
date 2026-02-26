# Phase 75: VLM Legal Vision Pipeline

## Introduction

A multimodal legal document processing pipeline integrating Vision Language Models (VLM), OCR, object detection, and embedding fusion for comprehensive legal document analysis. The system processes scanned documents, extracts visual features (signatures, seals, stamps), performs OCR with IBM Granite Docling, and fuses embeddings with text and graph features for enhanced retrieval and re-ranking.

## Glossary

- **VLM (Vision Language Model)**: Model that processes both visual and textual information
- **OCR (Optical Character Recognition)**: Text extraction from images
- **IBM Granite Docling**: Document understanding model for legal text extraction
- **YOLO**: Real-time object detection for signatures, seals, stamps
- **TensorRT**: NVIDIA inference optimization framework
- **Embedding Fusion**: Combining text, vision, and graph embeddings into unified vector
- **SOM (Self-Organizing Map)**: Unsupervised clustering for pattern discovery
- **HMM (Hidden Markov Model)**: Sequential pattern recognition
- **Sparse DNN**: Efficient neural network with sparse activations
- **cuDNN**: NVIDIA deep learning primitives library
- **LangExtract**: Language extraction and summarization pipeline
- **Glyph Embedding**: Hexadecimal byte matrix encoding for character-level features
- **MinIO**: S3-compatible object storage for document buckets
- **XState**: State machine library for workflow orchestration
- **IndexedDB**: Browser-based document storage
- **RabbitMQ**: Message queue for async document processing
- **ImageMagick**: Image processing for crop, resize, format conversion

## Requirements

### Requirement 1: Document Upload and Processing Pipeline

**User Story:** As a legal analyst, I want to upload scanned documents and have them automatically processed, so that I can extract text and visual features without manual intervention.

#### Acceptance Criteria

1. WHEN a document is uploaded, THE Pipeline SHALL queue it in RabbitMQ for async processing
2. WHILE processing, THE Pipeline SHALL use ImageMagick to crop, resize, and normalize images
3. IF the document is a multi-page PDF, THEN THE Pipeline SHALL split into individual pages for parallel processing
4. WHERE processing is complete, THE Pipeline SHALL store results in MinIO buckets
5. THE Pipeline SHALL support PDF, PNG, JPG, TIFF document formats

### Requirement 2: OCR and Text Extraction with IBM Granite Docling

**User Story:** As a legal analyst, I want accurate text extraction from scanned documents, so that I can search and analyze document content.

#### Acceptance Criteria

1. WHEN a document image is processed, THE Pipeline SHALL invoke IBM Granite Docling for OCR
2. WHILE extracting text, THE Pipeline SHALL preserve document structure (paragraphs, tables, lists)
3. IF handwritten text is detected, THEN THE Pipeline SHALL apply specialized handwriting recognition
4. WHERE text is extracted, THE Pipeline SHALL generate LangExtract summaries
5. THE Pipeline SHALL achieve 95% accuracy on typed legal documents

### Requirement 3: Object Detection with YOLO

**User Story:** As a legal analyst, I want to detect signatures, seals, and stamps in documents, so that I can verify document authenticity.

#### Acceptance Criteria

1. WHEN a document is analyzed, THE Pipeline SHALL run YOLO object detection for signatures, seals, stamps
2. WHILE detecting objects, THE Pipeline SHALL output bounding boxes and confidence scores
3. IF a signature is detected, THEN THE Pipeline SHALL extract and store the signature region
4. WHERE seals or stamps are detected, THE Pipeline SHALL classify them by type (notary, court, agency)
5. THE Pipeline SHALL export YOLO model to TensorRT .plan format for GPU inference

### Requirement 4: Vision Embedding Generation

**User Story:** As a system, I want to generate vision embeddings from document images, so that I can perform visual similarity search.

#### Acceptance Criteria

1. WHEN a document is processed, THE Pipeline SHALL generate 256-dimensional vision embeddings
2. WHILE generating embeddings, THE Pipeline SHALL use ViT-based encoder with projection head
3. IF multiple pages exist, THEN THE Pipeline SHALL generate per-page and document-level embeddings
4. WHERE embeddings are generated, THE Pipeline SHALL normalize to unit vectors
5. THE Pipeline SHALL export vision encoder to TensorRT .plan format

### Requirement 5: Embedding Fusion (Text + Vision + Graph)

**User Story:** As a system, I want to fuse text, vision, and graph embeddings, so that I can perform multimodal retrieval.

#### Acceptance Criteria

1. WHEN embeddings are available, THE Pipeline SHALL fuse them with weighted combination
2. WHILE fusing, THE Pipeline SHALL apply weights: 0.4 text, 0.2 vision, 0.4 authority
3. IF graph features are unavailable, THEN THE Pipeline SHALL use text + vision only (0.6/0.4)
4. WHERE fused embeddings are created, THE Pipeline SHALL store in Qdrant and pgvector
5. THE Pipeline SHALL support configurable fusion weights

### Requirement 6: Glyph Embedding and Byte Matrix Encoding

**User Story:** As a system, I want character-level glyph embeddings, so that I can capture fine-grained text patterns.

#### Acceptance Criteria

1. WHEN text is extracted, THE Pipeline SHALL generate glyph embeddings as hexadecimal byte matrices
2. WHILE encoding, THE Pipeline SHALL use bit encoding from LangExtract summaries
3. IF tensor computation is complete, THEN THE Pipeline SHALL apply K-means auto-encoding
4. WHERE glyph embeddings are stored, THE Pipeline SHALL mirror to Redis for fast retrieval
5. THE Pipeline SHALL use HMM with autoregression gradient checkpointing

### Requirement 7: Sparse DNN and SOM Clustering

**User Story:** As a system, I want to discover patterns in legal documents using unsupervised clustering, so that I can identify document categories and anomalies.

#### Acceptance Criteria

1. WHEN embeddings are indexed, THE Pipeline SHALL run weekly SOM + K-Means clustering
2. WHILE clustering, THE Pipeline SHALL use sparse DNN in cuDNN for efficiency
3. IF new clusters emerge, THEN THE Pipeline SHALL generate adaptive auto-tags
4. WHERE clusters are identified, THE Pipeline SHALL label them (forced_labor_cluster, kidnapping_restitution_cluster)
5. THE Pipeline SHALL surface cluster labels as UI badges

### Requirement 8: Multi-Store Embedding Mirroring

**User Story:** As a system, I want embeddings mirrored across multiple stores, so that I can support different query patterns.

#### Acceptance Criteria

1. WHEN embeddings are generated, THE Pipeline SHALL store in Qdrant for vector search
2. WHILE storing, THE Pipeline SHALL mirror to pgvector for SQL-based queries
3. IF MinIO buckets are configured, THEN THE Pipeline SHALL store raw embeddings as binary files
4. WHERE Neo4j is available, THE Pipeline SHALL create embedding nodes for graph queries
5. THE Pipeline SHALL maintain consistency across all stores

### Requirement 9: Web Search and Agentic Crawl

**User Story:** As a system, I want to augment document analysis with web search, so that I can find related legal precedents and resources.

#### Acceptance Criteria

1. WHEN analysis requires external context, THE Pipeline SHALL trigger agentic web crawl
2. WHILE crawling, THE Pipeline SHALL parse top results and extract metadata
3. IF search results are relevant, THEN THE Pipeline SHALL generate inverse search rank embeddings
4. WHERE results are indexed, THE Pipeline SHALL store in knowledge base for RAG
5. THE Pipeline SHALL use cosine similarity for auto-tag index matching

### Requirement 10: AST Integration for Code Analysis

**User Story:** As a developer, I want AST traversal integrated with document analysis, so that I can analyze legal code and contracts programmatically.

#### Acceptance Criteria

1. WHEN code is detected in documents, THE Pipeline SHALL use tsmorph for AST traversal
2. WHILE traversing, THE Pipeline SHALL build binary trees for sparse auto-encoded SOM
3. IF legal contract code is found, THEN THE Pipeline SHALL extract clause structures
4. WHERE AST is generated, THE Pipeline SHALL integrate with image analysis pipeline
5. THE Pipeline SHALL support adaptive auto-tagging based on AST patterns

