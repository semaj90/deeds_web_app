# Phase 14: Master Environment Configuration

**Last Updated:** 2025-12-06
**Purpose:** Single source of truth for all stack environment variables

---

## Quick Setup

Copy the configuration below to create your `.env.phase14` file:

```bash
# At repo root
cd C:\Users\james\Videos\deeds-web-app
notepad .env.phase14
# Paste the configuration below

# Copy to frontend
cd sveltekit-frontend
Copy-Item ..\.env.phase14 .\.env -Force
```

---

## Master Environment Configuration

```env
# ============================================================
# Phase 14 – Master Environment (.env)
# Unified config for:
# - SvelteKit routes
# - AI services (Ollama, embeddings)
# - Lucia auth
# - Error/Auto-fix phases (72, 78, 82)
# - Database (Drizzle/pgvector)
# - Infra (Qdrant, Redis, MinIO, RabbitMQ, etc.)
# ============================================================

# ────────────────────────────────────────────────────────────
# Core App / Mode
# ────────────────────────────────────────────────────────────
NODE_ENV=development
PHASE=14
PHASE_14_MASTER_CONFIG=true

# Svelte dev server
VITE_DEV_SERVER_URL=http://localhost:5173
PUBLIC_APP_URL=http://localhost:5173

# ────────────────────────────────────────────────────────────
# Backend / Legal Engine (Go services)
# ────────────────────────────────────────────────────────────
LEGAL_ENGINE_PORT=8080
GO_SERVER_URL=http://localhost:8080
VITE_LEGAL_ENGINE_URL=http://localhost:8080

# If you have multiple Go microservices later, keep this as the gateway:
LEGAL_ENGINE_INTERNAL_URL=http://localhost:8080

# ────────────────────────────────────────────────────────────
# Database + Drizzle + pgvector
# ────────────────────────────────────────────────────────────
# Phase 90 assumes this is the *canonical* DB endpoint.
DATABASE_URL=postgresql://legal_admin:123456@localhost:5432/legal_ai_db

PGHOST=localhost
PGPORT=5432
PGUSER=legal_admin
PGPASSWORD=123456
PGDATABASE=legal_ai_db

# Drizzle / migrations use this
DRIZZLE_DB_URL=postgresql://legal_admin:123456@localhost:5432/legal_ai_db

# Phase 90 helpers (optional flags for scripts/logging)
PHASE90_ENABLE_SNAPSHOTS=true
PHASE90_ENABLE_DUPLICATE_CHECKS=true

# ────────────────────────────────────────────────────────────
# Lucia Auth / Sessions
# ────────────────────────────────────────────────────────────
# Long random string (at least 32–64 chars)
# Generate with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
LUCIA_AUTH_SECRET=replace_with_long_random_secret
AUTH_TRUST_HOST=true

# Domain / cookie basics
SESSION_COOKIE_NAME=yorha_legal_session
SESSION_COOKIE_SECURE=false        # true in production (https)
SESSION_COOKIE_SAME_SITE=lax

# (If you wire OAuth later)
# GOOGLE_CLIENT_ID=
# GOOGLE_CLIENT_SECRET=

# ────────────────────────────────────────────────────────────
# AI – Ollama / Gemma 3 (Chat + Legal + Summary)
# ────────────────────────────────────────────────────────────
OLLAMA_BASE_URL=http://localhost:11434

# Single source of truth for models
OLLAMA_MODEL=gemma3-legal:latest
OLLAMA_MODEL_LEGAL=gemma3-legal:latest
OLLAMA_MODEL_CHAT=gemma3-legal:latest
OLLAMA_MODEL_SUMMARY=gemma3-legal:latest
OLLAMA_MODEL_ANALYSIS=gemma3-legal:latest

# ────────────────────────────────────────────────────────────
# AI – Embeddings (Phase 14 + Phase 72)
# ────────────────────────────────────────────────────────────
# Canonical embedding model names
EMBEDDING_MODEL=embeddinggemma:latest
OLLAMA_EMBEDDING_MODEL=embeddinggemma:latest
ONNX_EMBEDDING_MODEL=embeddinggemma:latest

# Phase 14 / Legal docs – memory optimized (384d)
EMBEDDING_DIM_DOCUMENTS=384
LEGAL_DOC_EMBEDDING_DIM=384

# Phase 72 Error Brain – high-resolution topology (768d)
EMBEDDING_DIM_ERRORS=768
PHASE72_ERROR_VECTOR_DIM=768

# If you ever add a fused vision/text model:
# EVIDENCE_EMBEDDING_DIM=1536

# ────────────────────────────────────────────────────────────
# Qdrant Vector Store
# ────────────────────────────────────────────────────────────
QDRANT_URL=http://localhost:6333
QDRANT_API_KEY=                         # empty for local dev

# Per-pipeline collections (Phase 14 + 72)
QDRANT_COLLECTION_LEGAL_DOCS=legal_documents      # 384d
QDRANT_COLLECTION_EVIDENCE=legal_evidence        # 384d or 1536 (your choice)
QDRANT_COLLECTION_PHASE72_ERRORS=phase72_errors  # 768d
QDRANT_COLLECTION_CHAT_HISTORY=chat_embeddings

# Safety / sync flags
QDRANT_ENABLE_PHASE90_SYNC=true

# ────────────────────────────────────────────────────────────
# Redis Cache / Queues
# ────────────────────────────────────────────────────────────
REDIS_URL=redis://127.0.0.1:4005
REDIS_PASSWORD=redis
REDIS_DB=0

# Example usage flags
REDIS_USE_FOR_RATE_LIMITING=true
REDIS_USE_FOR_SESSION_CACHE=false       # Lucia uses DB by default; flip if you add redis store
REDIS_USE_FOR_VECTOR_CACHE=true

# ────────────────────────────────────────────────────────────
# MinIO (S3-compatible evidence store)
# ────────────────────────────────────────────────────────────
MINIO_URL=http://localhost:9000
MINIO_ACCESS_KEY=legalminio
MINIO_SECRET_KEY=change_me_minio_secret
MINIO_REGION=us-east-1

# Buckets
MINIO_BUCKET_EVIDENCE=legal-evidence
MINIO_BUCKET_UPLOADS=legal-uploads
MINIO_BUCKET_BACKUPS=legal-backups

# Frontend-visible paths (SvelteKit)
VITE_MINIO_PUBLIC_ENDPOINT=http://localhost:9000
VITE_MINIO_EVIDENCE_BUCKET=legal-evidence

# ────────────────────────────────────────────────────────────
# RabbitMQ (Evidence / Worker Pipelines)
# ────────────────────────────────────────────────────────────
RABBITMQ_URL=amqp://guest:guest@localhost:5672

# Exchanges
RABBITMQ_EVIDENCE_EXCHANGE=evidence.exchange
RABBITMQ_ERROR_EXCHANGE=errors.exchange

# Queues
RABBITMQ_EVIDENCE_QUEUE=evidence.ingest
RABBITMQ_OCR_QUEUE=evidence.ocr
RABBITMQ_EMBEDDING_QUEUE=evidence.embed
RABBITMQ_PHASE72_ERROR_QUEUE=errors.phase72

# Routing keys
RABBITMQ_ROUTING_EVIDENCE=evidence.raw
RABBITMQ_ROUTING_ERRORS=errors.raw

# ────────────────────────────────────────────────────────────
# Phase 72 / 78 / 82 – Error Brain + Auto-fix
# ────────────────────────────────────────────────────────────
PHASE72_ENABLED=true
PHASE72_QDRANT_COLLECTION=phase72_errors
PHASE72_EMBEDDING_DIM=768
PHASE72_PYTHON=C:\Users\james\Videos\deeds-web-app\.venv\Scripts\python.exe
PHASE72_GPU_ENABLED=true
PHASE72_BATCH_SIZE=1000
PHASE72_LOG_DIR=logs/phase72

# Phase 78 – TensorRT / VLM auto-fix (placeholder toggles)
PHASE78_TRTLLM_ENABLED=false
PHASE78_MAX_BATCH_SIZE=1
PHASE78_AST_ENABLED=true
PHASE78_PLAYWRIGHT_ENABLED=true

# Phase 82 – Deep analyzer / VLM (placeholder)
PHASE82_ANALYZER_ENABLED=false
PHASE82_SVELTE5_MIGRATION=false

# SvelteKit feature flags
VITE_PHASE72_ERROR_PANEL_ENABLED=true
VITE_PHASE78_AUTOFIX_ENABLED=false
VITE_PHASE82_ANALYZER_ENABLED=false

# ────────────────────────────────────────────────────────────
# Frontend / SvelteKit PUBLIC config
# (must be PUBLIC_ or VITE_ to be exposed)
# ────────────────────────────────────────────────────────────
VITE_PUBLIC_APP_NAME=YoRHa Legal AI
VITE_PUBLIC_ENV_LABEL=Phase 14 – Dev
VITE_PUBLIC_API_BASE_URL=http://localhost:8080

VITE_PUBLIC_QDRANT_URL=http://localhost:6333
VITE_PUBLIC_OLLAMA_URL=http://localhost:11434

# Optional: toggle experimental panels
VITE_PUBLIC_SHOW_DEBUG_TOOLS=true
VITE_PUBLIC_SHOW_PHASE72_PANEL=true

# ────────────────────────────────────────────────────────────
# Logging / Telemetry
# ────────────────────────────────────────────────────────────
LOG_LEVEL=info
FRONTEND_LOG_LEVEL=debug
BACKEND_LOG_LEVEL=info

# Disable any external telemetry in dev
DISABLE_EXTERNAL_TELEMETRY=true

# ────────────────────────────────────────────────────────────
# Phase 14 Safety / Guardrails
# ────────────────────────────────────────────────────────────
# When true, your scripts should:
# - Run Phase 90 preflight before migrations
# - Refuse destructive ops by default
PHASE14_REQUIRE_PHASE90_FOR_MIGRATIONS=true
```

---

## How to Actually Use This

### 1. Create the File

Save the configuration above to **one of these locations**:

**Option A: Root-level master** (recommended):
```powershell
cd C:\Users\james\Videos\deeds-web-app
notepad .env.phase14
# Paste the configuration above
```

**Option B: Frontend-specific**:
```powershell
cd C:\Users\james\Videos\deeds-web-app\sveltekit-frontend
notepad .env.local
# Paste the configuration above
```

### 2. Wire SvelteKit

SvelteKit automatically picks up:
- **Server-side**: All variables (including unprefixed ones)
- **Client-side**: Only `VITE_*` and `PUBLIC_*` variables

**In your SvelteKit code**:

```typescript
// Server-side (e.g., +page.server.ts, +server.ts, hooks.server.ts)
import { env } from '$env/dynamic/private';

const dbUrl = env.DATABASE_URL;
const ollamaUrl = env.OLLAMA_BASE_URL;
const embeddingDim = env.LEGAL_DOC_EMBEDDING_DIM;  // "384"
```

```typescript
// Client-side (e.g., +page.svelte, components)
import { env } from '$env/dynamic/public';

const apiBase = env.VITE_PUBLIC_API_BASE_URL;  // "http://localhost:8080"
const qdrantUrl = env.VITE_PUBLIC_QDRANT_URL;  // "http://localhost:6333"
```

### 3. Wire Go Services

**Option A: Copy to each service**:
```powershell
cd C:\Users\james\Videos\deeds-web-app\go-services\legal-engine
Copy-Item ..\..\.env.phase14 .\.env -Force
```

**Option B: Load from root**:
```go
// In your Go service main.go
import "github.com/joho/godotenv"

func main() {
    // Load from repo root
    godotenv.Load("../../.env.phase14")

    dbURL := os.Getenv("DATABASE_URL")
    ollamaURL := os.Getenv("OLLAMA_BASE_URL")
    legalEnginePort := os.Getenv("LEGAL_ENGINE_PORT")
}
```

### 4. Wire Workers (Python/Node)

**Python workers**:
```python
# evidence_worker.py
from dotenv import load_dotenv
import os

load_dotenv('../.env.phase14')

DATABASE_URL = os.getenv('DATABASE_URL')
QDRANT_URL = os.getenv('QDRANT_URL')
QDRANT_COLLECTION = os.getenv('QDRANT_COLLECTION_LEGAL_DOCS')  # "legal_documents"
EMBEDDING_DIM = int(os.getenv('LEGAL_DOC_EMBEDDING_DIM'))  # 384
RABBITMQ_URL = os.getenv('RABBITMQ_URL')
```

**Node workers**:
```javascript
// embedding_worker.mjs
import dotenv from 'dotenv';
dotenv.config({ path: '../.env.phase14' });

const qdrantUrl = process.env.QDRANT_URL;
const collection = process.env.QDRANT_COLLECTION_LEGAL_DOCS;
const embeddingDim = parseInt(process.env.LEGAL_DOC_EMBEDDING_DIM);
```

---

## Dimension Separation Architecture

### Phase 14: Legal Documents (384d - Memory Optimized)

```typescript
// Legal document embedding
const embeddingDim = env.LEGAL_DOC_EMBEDDING_DIM;  // 384
const collection = env.QDRANT_COLLECTION_LEGAL_DOCS;  // "legal_documents"
const model = env.EMBEDDING_MODEL;  // "embeddinggemma:latest"
```

**Use cases:**
- Case documents
- Evidence files
- Legal citations
- Chat history

### Phase 72: Error Topology (768d - High Resolution)

```typescript
// Error brain embedding
const embeddingDim = env.PHASE72_ERROR_VECTOR_DIM;  // 768
const collection = env.PHASE72_QDRANT_COLLECTION;  // "phase72_errors"
const pythonPath = env.PHASE72_PYTHON;
```

**Use cases:**
- TypeScript errors
- Svelte-check errors
- Error clustering
- Auto-fix recommendations

### Future: Vision/Evidence (1536d - Multimodal)

```typescript
// If you add image/OCR embeddings later
const embeddingDim = env.EVIDENCE_EMBEDDING_DIM;  // 1536
const collection = env.QDRANT_COLLECTION_EVIDENCE;
```

---

## Confirm Consistency with Phases

### Phase 6: Core Check

Phase 6 validates 10 core machines/routes using:
- `DATABASE_URL`
- `RABBITMQ_URL`
- `OLLAMA_BASE_URL`
- `QDRANT_URL`

```powershell
# Apply env + run Phase 6
cd sveltekit-frontend
Copy-Item ..\.env.phase14 .\.env -Force
npm run phase6:core
```

### Phase 72: GPU Error Brain

Phase 72 GPU vectorization uses:
- `PHASE72_PYTHON` - Python exe
- `PHASE72_GPU_ENABLED` - GPU flag
- `PHASE72_QDRANT_COLLECTION` - `"phase72_errors"`
- `PHASE72_ERROR_VECTOR_DIM` - `768`

```powershell
npm run phase72:auto-iterate
```

### Phase 90: Safe Migrations

Phase 90 database safety uses:
- `DATABASE_URL`
- `PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD`, `PGDATABASE`
- `PHASE90_ENABLE_SNAPSHOTS`
- `PHASE90_ENABLE_DUPLICATE_CHECKS`
- `PHASE14_REQUIRE_PHASE90_FOR_MIGRATIONS`

```powershell
npm run db:migrate-safe
```

---

## SvelteKit Route Examples

### Legal AI Chat (uses 384d legal docs)

```typescript
// src/routes/api/chat/+server.ts
import { env } from '$env/dynamic/private';
import { Ollama } from 'ollama';
import { QdrantClient } from '@qdrant/js-client-rest';

const ollama = new Ollama({ host: env.OLLAMA_BASE_URL });
const qdrant = new QdrantClient({ url: env.QDRANT_URL });

export async function POST({ request }) {
  const { query } = await request.json();

  // Generate embedding (384d)
  const embedding = await ollama.embeddings({
    model: env.OLLAMA_EMBEDDING_MODEL,
    prompt: query
  });

  // Search legal docs collection
  const results = await qdrant.search(env.QDRANT_COLLECTION_LEGAL_DOCS, {
    vector: embedding.embedding,
    limit: 5
  });

  // Generate response with context
  const response = await ollama.generate({
    model: env.OLLAMA_MODEL_CHAT,
    prompt: `Context: ${results}\n\nQuestion: ${query}`
  });

  return json({ response });
}
```

### Phase 72 Error Panel (uses 768d error topology)

```typescript
// src/routes/api/phase72/errors/summary/+server.ts
import { env } from '$env/dynamic/private';
import { QdrantClient } from '@qdrant/js-client-rest';

const qdrant = new QdrantClient({ url: env.QDRANT_URL });

export async function GET() {
  // Query Phase 72 error collection (768d)
  const stats = await qdrant.getCollection(env.PHASE72_QDRANT_COLLECTION);

  return json({
    collection: env.PHASE72_QDRANT_COLLECTION,
    vectorDim: parseInt(env.PHASE72_EMBEDDING_DIM),
    errorCount: stats.points_count,
    enabled: env.PHASE72_ENABLED === 'true'
  });
}
```

---

## RabbitMQ Worker Pipeline Example

### Evidence Ingestion Worker

```typescript
// workers/evidence_ingestion_worker.ts
import { env } from '$env/dynamic/private';
import amqp from 'amqplib';

const connection = await amqp.connect(env.RABBITMQ_URL);
const channel = await connection.createChannel();

// Setup exchange + queue
await channel.assertExchange(env.RABBITMQ_EVIDENCE_EXCHANGE, 'topic');
await channel.assertQueue(env.RABBITMQ_EVIDENCE_QUEUE);
await channel.bindQueue(
  env.RABBITMQ_EVIDENCE_QUEUE,
  env.RABBITMQ_EVIDENCE_EXCHANGE,
  env.RABBITMQ_ROUTING_EVIDENCE
);

// Consume messages
channel.consume(env.RABBITMQ_EVIDENCE_QUEUE, async (msg) => {
  const evidence = JSON.parse(msg.content.toString());

  // Process evidence -> MinIO
  // Generate embedding -> Qdrant (384d)
  // Emit to OCR queue if needed

  channel.ack(msg);
});
```

---

## Security Checklist

Before going to production:

- [ ] Generate strong `LUCIA_AUTH_SECRET`:
  ```powershell
  node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
  ```

- [ ] Update `PGPASSWORD` from `your_strong_password_here`

- [ ] Change `MINIO_SECRET_KEY` from `change_me_minio_secret`

- [ ] Set `SESSION_COOKIE_SECURE=true` (requires HTTPS)

- [ ] Enable Qdrant authentication (`QDRANT_API_KEY`)

- [ ] Set `REDIS_PASSWORD` if Redis has auth enabled

- [ ] Update RabbitMQ from `guest:guest` to dedicated user

- [ ] Set `NODE_ENV=production`

- [ ] Disable debug tools:
  ```env
  VITE_PUBLIC_SHOW_DEBUG_TOOLS=false
  VITE_PUBLIC_SHOW_PHASE72_PANEL=false
  ```

---

## Summary

**Phase 14 = Single source of truth with proper architectural separation**

### Key Improvements Over Generic Config:

1. **Dimension Separation**:
   - 384d for legal documents (memory-optimized)
   - 768d for error topology (high-resolution)
   - Future 1536d for multimodal evidence

2. **Multi-Pipeline Collections**:
   - `legal_documents` (Phase 14)
   - `phase72_errors` (Phase 72)
   - `legal_evidence` (future)
   - `chat_embeddings` (conversational AI)

3. **Worker Orchestration**:
   - RabbitMQ exchanges per domain
   - Dedicated queues for OCR, embedding, ingestion
   - Proper routing keys

4. **Phase Integration**:
   - Phase 6: Core validation
   - Phase 72: Error clustering (768d)
   - Phase 78: AST analysis
   - Phase 82: Svelte 5 migration
   - Phase 90: Safe migrations (built-in flags)

5. **Frontend/Backend Separation**:
   - `VITE_*` for client-side
   - `PUBLIC_*` for public config
   - Unprefixed for server-only

**Next steps:**
1. Create `.env.phase14` at repo root
2. Copy to frontend: `Copy-Item .env.phase14 sveltekit-frontend\.env -Force`
3. Generate `LUCIA_AUTH_SECRET`
4. Run `npm run phase6:core` to validate
5. Wire Go services and workers as needed

**Phase 14 is now your single source of truth for all stack configuration** 🎯

# ============================================================================
# Phase 14: Master Environment Configuration
# ============================================================================
# Single source of truth for all services in the deeds-web-app stack
# Last updated: 2025-12-06
# ============================================================================

# ----------------------------------------------------------------------------
# Environment & Node
# ----------------------------------------------------------------------------
NODE_ENV=development
VITE_NODE_ENV=development
PORT=5173

# ----------------------------------------------------------------------------
# Database: PostgreSQL
# ----------------------------------------------------------------------------
DATABASE_URL=postgresql://legal_admin:123456@localhost:5434/legal_ai_db
PG_CONN_STRING=postgresql://legal_admin:123456@localhost:5434/legal_ai_db
DB_HOST=localhost
DB_PORT=5434
DB_USER=legal_admin
DB_PASSWORD=123456
DB_NAME=legal_ai_db

# ----------------------------------------------------------------------------
# Redis
# ----------------------------------------------------------------------------
REDIS_URL=redis://localhost:6379
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=redis

# ----------------------------------------------------------------------------
# AI Services: Ollama
# ----------------------------------------------------------------------------
OLLAMA_URL=http://localhost:11434
VITE_OLLAMA_URL=http://localhost:11434
OLLAMA_MODEL=gemma3-legal:latest
OLLAMA_MODEL_SUMMARY=gemma3-legal:latest
EMBEDDING_MODEL=embeddinggemma:latest
EMBEDDING_DIMENSION=384

# ----------------------------------------------------------------------------
# Vector Database: Qdrant
# ----------------------------------------------------------------------------
QDRANT_URL=http://localhost:6333
VITE_QDRANT_URL=http://localhost:6333
QDRANT_COLLECTION=legal_documents
QDRANT_GRPC_PORT=6334

# ----------------------------------------------------------------------------
# Object Storage: MinIO
# ----------------------------------------------------------------------------
MINIO_ENDPOINT=localhost
MINIO_PORT=9000
MINIO_CONSOLE_PORT=9001
MINIO_ROOT_USER=minioadmin
MINIO_ROOT_PASSWORD=minioadmin
MINIO_BUCKET=legal-documents
MINIO_USE_SSL=false

# ----------------------------------------------------------------------------
# Message Queue: RabbitMQ
# ----------------------------------------------------------------------------
RABBITMQ_URL=amqp://guest:guest@localhost:5672
RABBITMQ_HOST=localhost
RABBITMQ_PORT=5672
RABBITMQ_MANAGEMENT_PORT=15672
RABBITMQ_USER=guest
RABBITMQ_PASSWORD=guest

# ----------------------------------------------------------------------------
# Go Services
# ----------------------------------------------------------------------------
# Legal Engine (main Go service)
GO_LEGAL_ENGINE_PORT=8080
VITE_LEGAL_ENGINE_URL=http://localhost:8080

# RAG Service
GO_RAG_SERVICE_PORT=8081
VITE_RAG_SERVICE_URL=http://localhost:8081

# Upload Service
GO_UPLOAD_SERVICE_PORT=8082
VITE_UPLOAD_SERVICE_URL=http://localhost:8082

# gRPC Service
GO_GRPC_SERVICE_PORT=50051

# ----------------------------------------------------------------------------
# GPU Services: TensorRT-LLM & Triton
# ----------------------------------------------------------------------------
TRITON_URL=http://localhost:8000
TRITON_GRPC_PORT=8001
TRITON_METRICS_PORT=8002
TENSORRT_MODEL_REPO=/models
GPU_DEVICE_ID=0

# ----------------------------------------------------------------------------
# RAG Configuration
# ----------------------------------------------------------------------------
CHUNK_SIZE=512
CHUNK_OVERLAP=50
SIMILARITY_THRESHOLD=0.7
MAX_SEARCH_RESULTS=10
RERANK_TOP_K=5

# ----------------------------------------------------------------------------
# Authentication: Lucia
# ----------------------------------------------------------------------------
# IMPORTANT: Generate a secure random string for AUTH_SECRET
# Run: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
AUTH_SECRET=change-me-to-32-plus-random-bytes-for-production-use-crypto-randomBytes
AUTH_COOKIE_NAME=yorha_session
SESSION_EXPIRES_IN=2592000000

# ----------------------------------------------------------------------------
# SvelteKit
# ----------------------------------------------------------------------------
ORIGIN=http://localhost:5173
PUBLIC_ORIGIN=http://localhost:5173

# ----------------------------------------------------------------------------
# Phase 72: GPU Vectorization & Error Clustering
# ----------------------------------------------------------------------------
PHASE72_PYTHON=C:\Users\james\Videos\deeds-web-app\.venv\Scripts\python.exe
PHASE72_GPU_ENABLED=true
PHASE72_BATCH_SIZE=1000
PHASE72_LOG_DIR=logs/phase72

# ----------------------------------------------------------------------------
# Phase 78: AST Analysis & Playwright
# ----------------------------------------------------------------------------
PHASE78_AST_ENABLED=true
PHASE78_PLAYWRIGHT_ENABLED=true

# ----------------------------------------------------------------------------
# Phase 82: Svelte 5 Upgrade
# ----------------------------------------------------------------------------
PHASE82_SVELTE5_MIGRATION=false

# ----------------------------------------------------------------------------
# Logging & Monitoring
# ----------------------------------------------------------------------------
LOG_LEVEL=info
LOG_FORMAT=json
ENABLE_METRICS=true
METRICS_PORT=9090
```

---

## Wiring Instructions

### 1. Create Master `.env.phase14` at Repo Root

```powershell
cd C:\Users\james\Videos\deeds-web-app
notepad .env.phase14
```

Paste the configuration above (everything between the triple backticks containing `env`).

### 2. Copy to Frontend

```powershell
cd C:\Users\james\Videos\deeds-web-app\sveltekit-frontend
Copy-Item ..\.env.phase14 .\.env -Force
```

### 3. Generate Secure AUTH_SECRET

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Update `AUTH_SECRET` in both `sveltekit-frontend/.env` and root `.env.phase14` with the generated value.

### 4. Copy to Go Services (Optional)

For each Go service:

```powershell
cd C:\Users\james\Videos\deeds-web-app\go-services\legal-engine
Copy-Item ..\..\.env.phase14 .\.env -Force
```

Or configure Go services to load `../../.env.phase14` directly.

---

## What Each Service Uses

### SvelteKit Frontend

**Env vars it sees:**
- `VITE_*` variables (client-side)
- Server-side: `DATABASE_URL`, `REDIS_URL`, `AUTH_SECRET`, etc.

**Lucia auth requires:**
- `AUTH_SECRET` (session encryption)
- `AUTH_COOKIE_NAME`
- `DATABASE_URL` (for session storage)

**Routes use:**
- `VITE_LEGAL_ENGINE_URL` - API calls to Go services
- `VITE_OLLAMA_URL` - AI chat/generation
- `VITE_QDRANT_URL` - Vector search

### Go Services

**Legal Engine (`GO_LEGAL_ENGINE_PORT=8080`):**
- `DATABASE_URL` - PostgreSQL connection
- `OLLAMA_URL` - AI generation
- `EMBEDDING_MODEL` - Vector embeddings
- `QDRANT_URL` - Vector storage

**RAG Service (`GO_RAG_SERVICE_PORT=8081`):**
- `CHUNK_SIZE`, `CHUNK_OVERLAP` - Text splitting
- `SIMILARITY_THRESHOLD` - Search quality
- `QDRANT_COLLECTION` - Vector collection name

**Upload Service (`GO_UPLOAD_SERVICE_PORT=8082`):**
- `MINIO_*` - Object storage
- `RABBITMQ_URL` - Job queue

### GPU/Python Services

**Phase 72 GPU Vectorizer:**
- `PHASE72_PYTHON` - Python executable path
- `PHASE72_GPU_ENABLED` - Enable GPU acceleration
- `PHASE72_BATCH_SIZE` - Vectorization batch size

**TensorRT-LLM:**
- `TRITON_URL`, `TRITON_GRPC_PORT` - Inference server
- `GPU_DEVICE_ID` - CUDA device

---

## VS Code Task (Optional)

Add to `.vscode/tasks.json`:

```json
{
  "version": "2.0.0",
  "tasks": [
    {
      "label": "Phase 14: Apply env + dev",
      "type": "shell",
      "command": "Copy- Item ..\\env.phase14 .\\.env -Force; npm run dev:quic",
      "options": {
        "cwd": "${workspaceFolder}/sveltekit-frontend"
      },
      "isBackground": true,
      "group": "build"
    }
  ]
}
```

---

## Validation

Once set up, verify environment is loaded:

```powershell
# In sveltekit-frontend
node -e "require('dotenv').config(); console.log('DATABASE_URL:', process.env.DATABASE_URL)"
node -e "require('dotenv').config(); console.log('VITE_OLLAMA_URL:', process.env.VITE_OLLAMA_URL)"
```

Expected output:
```
DATABASE_URL: postgresql://legal_admin:123456@localhost:5434/legal_ai_db
VITE_OLLAMA_URL: http://localhost:11434
```

---

## Integration with Phases

### Phase 6: Core Check

Phase 6 validates the 10 core machines/routes. It uses:
- `DATABASE_URL` - DB connections
- `RABBITMQ_URL` - Queue workers
- `OLLAMA_URL` - AI services

Run Phase 6 after applying env:

```powershell
cd sveltekit-frontend
Copy-Item ..\.env.phase14 .\.env -Force
npm run phase6:core
```

### Phase 72: GPU Error Clustering

Phase 72 uses:
- `PHASE72_PYTHON` - Python for vectorization
- `PHASE72_GPU_ENABLED` - GPU acceleration flag

Run Phase 72:

```powershell
npm run phase72:auto-iterate
```

### Phase 90: Safe Migrations

Phase 90 uses:
- `DATABASE_URL` - PostgreSQL connection
- `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_NAME` - Connection params

Run safe migration:

```powershell
npm run db:migrate-safe
```

---

## Security Notes

### Development

Current configuration uses default/weak credentials suitable for local development:
- PostgreSQL: `legal_admin:123456`
- Redis: `redis`
- MinIO: `minioadmin:minioadmin`
- RabbitMQ: `guest:guest`

### Production

**Before deploying to production:**

1. **Generate strong `AUTH_SECRET`:**
   ```powershell
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```

2. **Update all passwords:**
   - PostgreSQL: Strong password
   - Redis: Enable authentication
   - MinIO: Change root credentials
   - RabbitMQ: Create dedicated user

3. **Use environment-specific files:**
   - `.env.development` (local)
   - `.env.staging` (staging)
   - `.env.production` (production - never commit!)

4. **Enable SSL/TLS:**
   - Set `MINIO_USE_SSL=true`
   - Use `https://` URLs for all services

---

## Summary

**Phase 14 = Single source of truth for all environment configuration**

- Master file: `.env.phase14`
- Frontend copy: `sveltekit-frontend/.env`
- Go services: Load from root or copy locally
- Phases 6, 72, 90 all use these vars
- Lucia auth configured
- All infrastructure URLs defined

**Next steps:**
1. Create `.env.phase14` at repo root (copy from above)
2. Copy to `sveltekit-frontend/.env`
3. Generate and update `AUTH_SECRET`
4. Run `npm run phase6:core` to validate
