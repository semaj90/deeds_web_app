---
type: concept
title: Architecture Overview
description: A high-level architectural guide for the Parent Atlas system, covering packet authority, vector storage, and agent orchestration.
tags: [architecture, parent-atlas, system-design]
verified:
  - by: openwiki/0.7.1
    at: 2026-10-07T02:11:06.802Z
---

# Architecture Overview

Parent Atlas is a modular, agentic system designed for high-throughput packet processing, semantic storage, and autonomous reasoning. It leverages a multi-layered infrastructure to ingest, classify, embed, and retrieve complex data structures.

## System Components

### 1. Packet Authority (PostgreSQL)
PostgreSQL serves as the system's primary Packet Authority, maintaining the canonical source of truth for all processed information. It tracks packet lineage, metadata, and state, ensuring transactional integrity across the ingestion pipeline.

### 2. Vector Storage (Qdrant)
For semantic retrieval, Parent Atlas utilizes Qdrant as the vector database. It stores high-dimensional embeddings derived from packet content, enabling fast similarity searches and contextual discovery.

### 3. Agent Orchestration (LangGraph / Mastra)
The system uses LangGraph and Mastra to manage agentic workflows. These orchestrators define the state machines that control task execution, tool usage, and multi-agent collaboration, allowing for complex decision-making processes.

## Data Flow

The following diagram illustrates the lifecycle of a packet within the system, from ingestion to retrieval.

```mermaid
graph TD
    A[Raw Packet Source] --> B[Packet Authority (PostgreSQL)]
    B --> C[Embedding Engine]
    C --> D[Qdrant Vector Storage]
    B --> E[LangGraph / Mastra Orchestrator]
    E --> F[Agentic Execution]
    F --> G[Retrieval & Synthesis]
    G --> D
```

## Key Mechanisms

- **Ingestion**: Raw data enters the system and is validated by the PostgreSQL Packet Authority before being transformed into semantically enriched packets.
- **Classification & Embedding**: The system categorizes packets and generates embeddings, which are pushed to Qdrant for indexing.
- **Retrieval**: Agents query the system by combining lexical searches (via PostgreSQL) and semantic queries (via Qdrant), resulting in context-aware responses.
- **Orchestration**: LangGraph coordinates the sequence of operations, managing state and tool calls across distributed workers.
