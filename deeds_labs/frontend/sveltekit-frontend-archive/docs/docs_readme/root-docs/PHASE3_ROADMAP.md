# Phase 3 Implementation Roadmap

## Objectives
- Unify AI services: TensorRT-LLM + Triton + Ollama fallback
- Consolidate 3 RAG implementations into 1 canonical version
- Hybrid vector search: pgvector (70%) + Qdrant (30%)
- Gemma models: gemma3-legal:latest + embeddinggemma:latest
- Health monitoring with automatic failover

## Current State
- 112 store files (target: 7)
- 28 AI service files (target: 1 orchestrator)
- 3 RAG implementations (target: 1)

## Steps

### 1. Fix gpu-summary-store (15 min)
- Remove unused frameCount variable
- Fix const/let usage
- Fix getSessionId method

### 2. Create config.ts (20 min)
- Context7 MCP (official endpoint)
- AI providers config
- Vector search settings

### 3. Update Context7 Integration (30 min)
- Use npx -y @upstash/context7-mcp
- Update fetch calls

### 4. AI Service Orchestrator (2 hours)
- Multi-provider routing
- Automatic failover
- Health monitoring

### 5. Consolidate RAG (3 hours)
- Canonical pipeline
- Hybrid search
- Legal chunking

### 6. Hybrid Vector Search (2 hours)
- pgvector + Qdrant fusion
- Weighted scoring

### 7. Health Monitoring (1.5 hours)
- Provider health checks
- Circuit breaker pattern

### 8. Gemma Configuration (30 min)
- Function calling setup
- Embedding config

## Total Time: 12-14 hours
