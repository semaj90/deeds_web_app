# Missing Dependencies Checklist — Phase 1-13 Pipeline

**Last Updated**: July 5, 2026  
**Purpose**: Track all missing npm packages, Python libraries, external services, and configuration needed to deploy Stages 1-13.

---

## NPM Packages (Node.js / SvelteKit)

| Package | Status | Required For | Action |
|---------|--------|--------------|--------|
| `pg` | ✅ Present | Postgres client | None |
| `neo4j-driver` | ✅ Present | Neo4j connectivity | None |
| `dotenv` | ✅ Present | Environment config | None |
| `ioredis` | ✅ Present | Redis/Valkey client | None |
| `amqplib` | ✅ Present | RabbitMQ client | None |
| `@qdrant/js-client` | ⚠️ Check | Qdrant queries | If missing: `npm install @qdrant/js-client` |
| `safetensors` | ❌ Missing | Model loading (JS, if added) | `npm install safetensors` (optional) |
| `child_process` | ✅ Built-in Node | Python subprocess | None |

**Action**: Run `npm audit` to verify. If any missing, install via `npm install <package>`.

---

## Python Libraries (3.11 venv)

| Library | Status | Required For | Installation Command |
|---------|--------|--------------|----------------------|
| `torch` | ❌ Missing | AE training (Stage 5) | `pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu121` |
| `scikit-learn` | ❌ Missing | KMeans fallback (Stage 6) | `pip install scikit-learn` |
| `cuml` | ❌ Missing | GPU KMeans (Stage 6, optional) | `pip install cuml-cu12` (requires CUDA 12.x) |
| `safetensors` | ❌ Missing | Model serialization (Stage 5) | `pip install safetensors` |
| `scipy` | ❌ Missing | Hierarchical clustering (optional) | `pip install scipy` |
| `pandas` | ❌ Missing | Data processing | `pip install pandas` |
| `numpy` | ❌ Missing | Numerics | `pip install numpy` |
| `psycopg` | ❌ Missing | Postgres client (Python) | `pip install psycopg[binary]` |
| `requests` | ⚠️ Check | HTTP to services | If missing: `pip install requests` |

**Action**: 
```bash
# All-in-one install
pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu121
pip install scikit-learn safetensors scipy pandas numpy psycopg[binary] requests

# Verify
python3 -c "import torch, sklearn, safetensors, pandas; print('✅ All core deps OK')"
```

**Optional (GPU acceleration)**:
```bash
pip install cuml-cu12  # RAPIDS for GPU KMeans
```

---

## External Services / APIs Required

| Service | Port | Status | Required For | Config Var |
|---------|------|--------|--------------|-----------|
| PostgreSQL | 5434 (Windows) / 5432 (Docker) | ✅ Running | Stages 1-13 (truth layer) | `DATABASE_URL` |
| Redis / Valkey | 6379 | ✅ Running | Caching, BitFrost | `REDIS_URL` |
| Qdrant | 6333 | ✅ Running | Vector search (Stages 9-10) | `QDRANT_URL` |
| Neo4j | 7687 (bolt) | ✅ Running | Graph topology (Stage 8) | `NEO4J_URI` |
| RabbitMQ | 5672 (AMQP) / 15672 (API) | ✅ Running | Job queue (ACP Stage 13) | `RABBITMQ_URL` |
| Ollama (EmbeddingGemma) | 11434 | ✅ Running | Embedding generation (Stage 4) | `OLLAMA_URL` |
| **LangExtract Service** | 8091 | ⚠️ Unknown | Semantic concepts (Stage 3) | `LANGEXTRACT_SERVICE_URL` (NEW) |
| **Gemma4 llama-server** | 8090 | ⚠️ Unknown | Semantic synthesis | `GEMMA4_SERVICE_URL` (NEW) |
| **TurboVec (cuVS)** | 50051 (gRPC) | ⚠️ External | GPU ANN prefilter (Stage 9) | `TURBOVEC_GRPC_PORT` (NEW) |
| **Reranker (PyTorch)** | 5000 (Flask) | ⚠️ Offline | Top-K reranking (Stage 11) | `RERANKER_SERVICE_URL` (NEW) |

**Action**: 
- Verify running services: `npm run smoke:graphify:fast`
- Add missing `.env` variables (see below)

---

## Environment Variables Missing / To Verify

Add these to `.env.local` (create if missing):

```bash
# ========== PHASE 1-13 PIPELINE CONFIG ==========

# Stage 3: LangExtract service endpoint
LANGEXTRACT_SERVICE_URL=http://127.0.0.1:8091

# Semantic synthesis (Stage 12: HMM uses Gemma4 for context)
GEMMA4_SERVICE_URL=http://127.0.0.1:8090

# Python execution path (for subprocess spawning)
PYTORCH_PATH=/usr/bin/python3

# Stage 9: TurboVec gRPC endpoint
TURBOVEC_GRPC_PORT=50051

# Stage 11: PyTorch Reranker Flask service
RERANKER_SERVICE_URL=http://127.0.0.1:5000

# Optional: Control pipeline behavior
ATLAS_BATCH_SIZE=100              # Default packet batch size
ATLAS_DRY_RUN=true                # Default to dry-run mode (change to false for apply)
ATLAS_TIMEOUT_SECONDS=300         # Timeout for long-running stages
ATLAS_VALIDATION_STRICT=true      # Enforce all validation gates

# Optional: Redis auth (Valkey requires password)
REDIS_PASSWORD=redis
```

**Action**: 
```bash
# Add to .env.local
echo "LANGEXTRACT_SERVICE_URL=http://127.0.0.1:8091" >> .env.local
echo "GEMMA4_SERVICE_URL=http://127.0.0.1:8090" >> .env.local
echo "PYTORCH_PATH=/usr/bin/python3" >> .env.local
echo "TURBOVEC_GRPC_PORT=50051" >> .env.local
echo "RERANKER_SERVICE_URL=http://127.0.0.1:5000" >> .env.local
```

---

## External CLI Tools Required

| Tool | Status | Required For | Installation |
|------|--------|--------------|--------------|
| `ast-grep` | ❌ Missing | AST structural analysis (Stage 1) | `cargo install ast-grep` OR download binary from GitHub |
| `neo4j-admin` | ⚠️ Check | Neo4j backup/restore | Included with Neo4j Docker image |
| `psql` | ⚠️ Check | Direct Postgres queries (optional) | Included with PostgreSQL Docker image |

**Action for ast-grep**:
```bash
# Option 1: Cargo (Rust)
cargo install ast-grep

# Option 2: Download prebuilt (faster)
# Download from https://github.com/ast-grep/ast-grep/releases
# Extract to PATH (e.g., /usr/local/bin or C:\Program Files\ast-grep\)

# Verify
ast-grep --version
```

---

## Files to Create (Missing Implementation)

| File | Lines | Status | Depends On | Estimated Time |
|------|-------|--------|-----------|-----------------|
| `phase1.5-ast-grep-extraction.mjs` | 350 | ❌ Missing | ast-grep CLI, postgres | 2 hours |
| `ast-grep-rules.yaml` | 200 | ❌ Missing | ast-grep syntax | 1 hour |
| `phase1.5-lexical-extraction.mjs` | 200 | ⚠️ Partial | Stage 1 output | 1.5 hours |
| `python-orchestrator.mjs` | 300 | ❌ Missing | Node.js subprocess | 1.5 hours |
| `phase5-autoencoder-train.py` | 400 | ❌ Missing | torch, psycopg | 2 hours |
| `phase6-kmeans-clustering.py` | 250 | ⚠️ Outdated | scikit-learn, cuml | 1 hour |
| `reranker-bridge.mjs` | 200 | ❌ Missing | Flask service | 1 hour |
| `acp-action-control-plane.mjs` | 400 | ❌ Missing | RabbitMQ / NATS | 2 hours |
| `orchestrate-phases-1-13.mjs` | 500 | ⏳ Partial | All stages | 2 hours |
| `validation-gates.mjs` | 300 | ❌ Missing | Database | 1 hour |

---

## Database Schema Verification

**Tables to verify exist**:
```sql
-- Run in postgres:
\d atlas_packets                  -- Main packet identity table
\d atlas_packet_features          -- Append-only feature layers (Stage 1-3)
\d atlas_packet_metrics           -- Derived metrics (Stages 5-8, 11)
\d atlas_directories              -- Directory-level metadata
\d atlas_source_refs              -- Source reference registry
\d atlas_feature_labels           -- Feature taxonomy
\d atlas_cold_storage_manifest    -- Archive tracking
```

**Column verification**:
```sql
SELECT 
  column_name, data_type 
FROM information_schema.columns 
WHERE table_name IN ('atlas_packets', 'atlas_packet_features', 'atlas_packet_metrics')
ORDER BY table_name, ordinal_position;
```

**Expected columns**:
- `atlas_packets`: packet_key, source_ref, feature_id, domain_class, embedding (768-dim), latent_64 (bytea), kmeans_cluster, som_row, som_col, pagerank, community_id, concept_ids[]
- `atlas_packet_features`: packet_key, ast_symbols[], lexical_features[], used_concepts[]
- `atlas_packet_metrics`: packet_key, kmeans_cluster, som_*, pagerank, community_id, betweenness, closeness, eigenvector, repair_probability

---

## Import Path Verification

**Check these import statements work**:
```javascript
// Node.js stage scripts
import pg from 'pg';
import neo4j from 'neo4j-driver';
import { createClient } from '@qdrant/js-client';
import Redis from 'ioredis';

// Should not fail
console.log('✅ All JS imports OK');
```

```python
# Python stage scripts
import torch
import sklearn.cluster
import safetensors.torch
import psycopg
import pandas as pd
import numpy as np
import requests

print('✅ All Python imports OK')
```

---

## Pre-Flight Checklist (Before Starting Phase 106)

- [ ] **0.1**: Run `pip install torch safetensors scikit-learn scipy pandas numpy psycopg requests`
- [ ] **0.2**: Add 5 missing .env variables: LANGEXTRACT_SERVICE_URL, GEMMA4_SERVICE_URL, PYTORCH_PATH, TURBOVEC_GRPC_PORT, RERANKER_SERVICE_URL
- [ ] **0.3**: Run `docker ps` and verify 5+ containers UP (postgres, redis, qdrant, neo4j, rabbitmq)
- [ ] **0.4**: Run `npm run smoke:graphify:fast` — all 5 pillars should pass
- [ ] **1.1**: Install ast-grep CLI via `cargo install ast-grep` or download binary
- [ ] **1.2**: Verify `ast-grep --version` works and is in PATH
- [ ] **Verify**: All npm packages installed (`npm audit --production`)
- [ ] **Verify**: All Python libraries importable (`python3 -c "import torch; ...check all..."`)
- [ ] **Verify**: Database tables exist and have expected columns

---

## Dependency Installation One-Liner

```bash
# Install all Python dependencies at once
pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu121 && \
pip install scikit-learn safetensors scipy pandas numpy psycopg[binary] requests && \
echo "✅ Python deps installed"

# Verify
python3 << 'EOF'
import torch, sklearn, safetensors, pandas, numpy, psycopg, requests
print("✅ All imports OK")
print(f"PyTorch version: {torch.__version__}")
print(f"sklearn version: {sklearn.__version__}")
EOF

# Install ast-grep (requires Rust/cargo)
cargo install ast-grep && echo "✅ ast-grep installed" || echo "⚠️ Cargo not found, install Rust from rustup.rs"
```

---

## Status Summary

| Category | Count | Status | Action |
|----------|-------|--------|--------|
| npm packages | 8 | 7 OK, 1 check | Run `npm audit` |
| Python libraries | 9 | 0 installed | Run pip install batch (see one-liner) |
| External services | 9 | 5 running, 4 unknown | Start/verify services, add .env vars |
| CLI tools | 3 | 1 missing | Install ast-grep |
| Implementation files | 10 | 2 partial, 8 missing | Create per PHASE-106-IMPLEMENTATION-ROADMAP.md |
| Database schema | 7 tables | Verified to exist | Run schema checks above |

**Total work to unblock**: ~4-5 hours (Python deps + ast-grep + 5 .env vars + service verification)

---

**Next Step**: Execute environment setup checklist above, then proceed with PHASE-106-IMPLEMENTATION-ROADMAP.md Stage 1 implementation.
