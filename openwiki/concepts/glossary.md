---
type: conceptual
title: Glossary of Concepts
description: A reference guide for core architectural concepts including Packet, Bitfrost, Graphify, ACE Pipeline, and Tensor Residency.
tags: [architecture, glossary, definitions]
verified:
  - by: openwiki/0.7.1
    at: 2026-10-07T02:11:06.802Z
---

# Glossary of Concepts

This glossary provides standardized definitions for key architectural components and concepts within the system.

## Core Concepts

### Packet
A **Packet** is the fundamental unit of data encapsulation in the system. It carries a payload (often text or embedding data), metadata (source, lineage, temporal markers), and routing information. Packets serve as the primary interface between the ingestion layer and the storage/indexing backends (PostgreSQL and Qdrant).

### Bitfrost
**Bitfrost** is the specialized caching and memory-streaming layer. It manages "hot" data buckets to reduce latency by keeping frequently accessed, high-priority information in a fast-access memory state. It bridges the gap between persistent storage and active retrieval lanes.

### Graphify
**Graphify** refers to the system responsible for constructing and maintaining the semantic graph structure over the underlying data. It transforms raw vector embeddings and relational metadata into interconnected nodes and edges, enabling complex graph-based traversal and retrieval patterns.

### ACE Pipeline
The **ACE Pipeline** (Autonomous Context Enrichment) is the multi-stage processing engine that orchestrates data flow. It handles the lifecycle of a request from intake to final retrieval, encompassing stages like symbol resolution, context enrichment, and cross-ranking of results.

### Tensor Residency
**Tensor Residency** defines the strategy for locating and loading model-related tensor data within the GPU's memory. It ensures that critical computation components—especially those required for real-time embedding and inference—are pre-staged and pinned in memory, minimizing data transfer overhead during the retrieval loop.

## Infrastructure Integration

The concepts above map directly to the underlying technology stack:

- **PostgreSQL**: Serves as the primary source of truth for relational metadata, symbol lineage, and structured Packet properties.
- **Qdrant**: Acts as the high-performance vector database, housing the semantic embeddings produced by the Graphify process and utilized by the ACE Pipeline.

The architecture ensures that data flows seamlessly between these stores while the caching layers (Bitfrost) maintain the necessary performance for high-frequency agentic operations.
