# Product Overview

## YoRHa Legal AI Platform

A comprehensive legal AI system for evidence investigation and case management with GPU-accelerated vision processing and semantic search capabilities.

### Core Purpose
Advanced legal document analysis, evidence management, and case investigation using AI-powered semantic search, OCR, and relationship mapping.

### Key Features
- **Evidence Management**: Canvas-based evidence board with relationship mapping
- **Semantic Search**: Vector-based document retrieval with Qdrant + PostgreSQL pgvector
- **Vision Processing**: GPU-accelerated OCR, seal detection, and document segmentation
- **AI Analysis**: Gemma3 legal model with reranking and authority graph analysis
- **Real-time Inference**: QUIC protocol gateway with low-latency model serving
- **Investigative UI**: Noir Detective theme with dark, professional aesthetic

### Target Users
Legal professionals, investigators, and case analysts requiring advanced document analysis and evidence correlation.

### Architecture Approach
- **Frontend**: SvelteKit with Noir Detective UI theme
- **Backend**: Go microservices with QUIC protocol
- **AI/ML**: Gemma3 legal model, TensorRT optimization, Neo4j knowledge graphs
- **Infrastructure**: Docker Compose with GPU support, PostgreSQL, Redis, Qdrant, MinIO

### Success Metrics
- Sub-100ms inference latency
- 95%+ OCR accuracy
- Semantic search relevance > 87%
- Support for 1000+ document cases
