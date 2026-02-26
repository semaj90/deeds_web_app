# Phase Docker Architecture

## Quick Answer

**No, Phase 77 doesn't exist yet.** You currently have:

- **Phase 72** - AST error reduction with specialized containers
- **Phase 75** - Standalone Qdrant stack (separate ports)
- **Phase 66** - MCP server + databases
- **Phase 71** - TensorRT LLM service

The ACE wiring we just completed works with **Phase 72** containers.

## Phase 72 Docker Architecture

Phase 72 uses **3 specialized containers**:

### 1. Neo4j (Graph Database)
```yaml
neo4j:
  image: neo4j:5.23-community
  container_name: phase72-neo4j
  ports:
    - "7474:7474"    # HTTP
    - "7687:7687"    # Bolt
  volumes:
    - neo4j_data:/data
    - neo4j_logs:/logs
  environment:
    - NEO4J_AUTH: neo4j/password
    - NEO4J_dbms_memory_heap_max__size: 4G
```

**Purpose**: Store AST relationships, error clusters, code structure

### 2. Go Service (Graph Operations)
```yaml
phase72-go-service:
  build: ./phase72/go-service
  container_name: phase72-go-service
  ports:
    - "8072:8072"
  environment:
    - NEO4J_URI=bolt://neo4j:7687
    - REDIS_URL=redis://:redis@redis:6379
    - QDRANT_URL=http://qdrant:6333
```

**Purpose**:
- Neo4j graph operations
- Error clustering
- AST analysis
- Knowledge graph management

### 3. Python Service (CUDA Embeddings)
```yaml
phase72-python-service:
  build: ./phase72/python-service
  container_name: phase72-python-service
  ports:
    - "8073:8073"
  environment:
    - CUDA_VISIBLE_DEVICES=0
    - TORCH_USE_CUDA_DSA=1
  deploy:
    resources:
      reservations:
        devices:
          - driver: nvidia
            count: 1
            capabilities: [gpu]
```

**Purpose**:
- CUDA-accelerated embeddings
- Error clustering with GPU
- Multimodal analysis
- VLM integration

## Shared Infrastructure

Phase 72 also uses **shared containers**:

```yaml
# Redis (Session state)
redis:
  image: redis:7-alpine
  ports:
    - "6379:6379"

# Qdrant (Vector search)
qdrant:
  image: qdrant/qdrant:latest
  ports:
    - "6333:6333"

# PostgreSQL (Metadata)
postgres:
  image: postgres:15-alpine
  ports:
    - "5432:5432"

# Ollama (LLM)
ollama:
  image: ollama/ollama:latest
  ports:
    - "11434:11434"
```

## How ACE Uses Phase 72 Containers

```
ACE Orchestrator (Python Backend)
  ↓
├─ Redis (Session state, timelines)
├─ Neo4j (Knowledge graph queries)
├─ Qdrant (Vector search)
├─ PostgreSQL (Metadata)
└─ Ollama (LLM generation)
  ↓
Phase 72 Go Service (8072)
  ├─ Graph operations
  ├─ Error clustering
  └─ AST analysis
  ↓
Phase 72 Python Service (8073)
  ├─ CUDA embeddings
  ├─ GPU clustering
  └─ Multimodal analysis
```

## Starting Phase 72 Stack

```bash
# Start Phase 72 containers
docker-compose -f docker-compose.phase72.yml up -d

# Verify services
docker-compose -f docker-compose.phase72.yml ps

# Check health
docker-compose -f docker-compose.phase72.yml logs -f

# Stop services
docker-compose -f docker-compose.phase72.yml down
```

## Port Mapping

| Service | Port | Purpose |
|---------|------|---------|
| Neo4j HTTP | 7474 | Graph browser |
| Neo4j Bolt | 7687 | Graph queries |
| Go Service | 8072 | Graph operations |
| Python Service | 8073 | CUDA embeddings |
| Redis | 6379 | Session state |
| Qdrant | 6333 | Vector search |
| PostgreSQL | 5432 | Metadata |
| Ollama | 11434 | LLM API |

## Phase 77 (Future)

Phase 77 is mentioned in TODO comments but doesn't exist yet. It would likely include:

- CUTLASS kernel optimization
- Advanced CUDA operations
- Fused kernel implementations
- Performance tuning

## Comparison: Phase 72 vs Other Phases

| Phase | Purpose | Containers | GPU Support |
|-------|---------|-----------|-------------|
| Phase 66 | MCP + Databases | MCP, Postgres, Redis | Optional |
| Phase 71 | TensorRT LLM | TensorRT service | Yes |
| Phase 72 | AST Error Reduction | Neo4j, Go, Python | Yes (Python) |
| Phase 75 | Standalone Qdrant | Qdrant only | No |
| Phase 77 | CUDA Optimization | TBD | Yes |

## Current Setup for ACE

For the ACE wiring we just completed, you need:

```bash
# Start Phase 72 stack
docker-compose -f docker-compose.phase72.yml up -d

# Start shared infrastructure (if not already running)
docker-compose up -d redis postgres qdrant ollama

# Start backend
cd backend
uvicorn api.main:app --port 8000
```

## Environment Variables

Phase 72 uses these environment variables:

```bash
# Neo4j
NEO4J_PASSWORD=password
NEO4J_URI=bolt://neo4j:7687
NEO4J_USER=neo4j

# Redis
REDIS_URL=redis://:redis@redis:6379

# Qdrant
QDRANT_URL=http://qdrant:6333

# Ollama
OLLAMA_URL=http://ollama:11434
OLLAMA_MODEL=gemma3:latest

# CUDA
CUDA_VISIBLE_DEVICES=0
TORCH_USE_CUDA_DSA=1
```

## Troubleshooting Phase 72

### Neo4j won't start
```bash
# Check logs
docker-compose -f docker-compose.phase72.yml logs neo4j

# Verify memory settings
docker-compose -f docker-compose.phase72.yml exec neo4j free -h

# Restart
docker-compose -f docker-compose.phase72.yml restart neo4j
```

### Go service connection errors
```bash
# Check Neo4j is healthy
docker-compose -f docker-compose.phase72.yml exec neo4j cypher-shell -u neo4j -p password "MATCH () RETURN count(*) limit 1"

# Check Redis connection
docker-compose -f docker-compose.phase72.yml exec phase72-go-service redis-cli -u redis://redis:6379 ping
```

### Python service GPU errors
```bash
# Check GPU availability
docker-compose -f docker-compose.phase72.yml exec phase72-python-service nvidia-smi

# Check CUDA
docker-compose -f docker-compose.phase72.yml exec phase72-python-service python -c "import torch; print(torch.cuda.is_available())"
```

## Summary

- **Phase 72** = AST error reduction with Neo4j + Go + Python (GPU)
- **Phase 77** = Future CUDA optimization (doesn't exist yet)
- **ACE** = Works with Phase 72 containers + shared infrastructure
- **Start with**: `docker-compose -f docker-compose.phase72.yml up -d`

---

**Status**: Phase 72 is the current production phase for error reduction
**Next**: Phase 77 will add advanced CUDA optimizations
