# Phase 72: Neo4j-Based AST Error Reduction Architecture

## Overview
Phase 72 implements a self-healing codebase agent that reduces TypeScript errors from 80k to <1k using graph-based analysis, AI-powered patch generation, and automated code transformation.

## Core Components

### 1. Neo4j Graph Schema
```
(:ASTNode)-[:CONTAINS]->(:ASTNode)
(:ASTNode)-[:HAS_ERROR]->(:TypeScriptError)
(:TypeScriptError)-[:SIMILAR_TO]->(:TypeScriptError)
(:ErrorCluster)-[:CONTAINS]->(:TypeScriptError)
(:ErrorCluster)-[:REQUIRES]->(:CodeTransformation)
(:CodeTransformation)-[:APPLIES_TO]->(:ASTNode)
```

### 2. Error Clustering Algorithm
- **Input**: Raw TypeScript errors from svelte-check
- **Embedding**: Convert errors to 768d vectors using gemma3-legal
- **Clustering**: DBSCAN with cosine similarity threshold 0.85
- **Output**: Error clusters with representative patterns

### 3. AI-Powered Patch Generation
- **Context**: AST subgraph + error cluster + similar fixes
- **Model**: gemma3-legal with few-shot examples
- **Validation**: AST parsing + type checking simulation
- **Output**: Valid code patches with confidence scores

## Service Architecture

### phase72-neo4j-ast-reducer (Go)
- **Port**: 8072
- **Responsibilities**:
  - Neo4j graph operations
  - AST node relationship management
  - Error cluster queries
  - Patch application coordination

### phase72-error-embedder (Python)
- **Port**: 8073
- **Responsibilities**:
  - Error text embedding (CUDA accelerated)
  - Similarity computation
  - Cluster formation
  - Vector storage in Qdrant

### phase72-patch-generator (Node.js)
- **Port**: 8074
- **Responsibilities**:
  - AI patch generation
  - AST validation
  - Code transformation application
  - Integration with git/svelte-check

## Data Flow

1. **Error Ingestion**
   ```
   svelte-check → JSON → phase72-error-embedder → Qdrant
   ```

2. **Graph Construction**
   ```
   AST parsing → Neo4j nodes/relationships → Error attachment
   ```

3. **Clustering & Analysis**
   ```
   Qdrant similarity → DBSCAN clustering → Neo4j clusters
   ```

4. **Patch Generation**
   ```
   Cluster context → gemma3-legal → AST validation → Patch application
   ```

5. **Self-Healing Loop**
   ```
   Apply patches → Re-run svelte-check → Repeat until stable
   ```

## Performance Targets

- **Error Reduction**: 80k → <1k errors
- **Processing Time**: <30 minutes per cycle
- **Accuracy**: >90% valid patches
- **Memory Usage**: <8GB RAM
- **GPU Utilization**: <50% VRAM for embeddings

## Integration Points

- **MCP Server**: Real-time error reduction progress
- **Dashboard**: AST graph visualization + metrics
- **Git Integration**: Automatic patch commits
- **CI/CD**: Pre-commit error reduction hooks

## Monitoring & Observability

- **Metrics**: Error count, cluster sizes, patch success rate
- **Logs**: Detailed patch application logs
- **Health Checks**: Service availability + Neo4j connectivity
- **Alerts**: Error reduction stagnation, service failures