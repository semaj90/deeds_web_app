# Phase 72 AI Chat - Installation Guide

## Quick Start

### 1. Install Dependencies

```bash
cd sveltekit-frontend
npm install sveltekit-superforms zod minio
```

### 2. Environment Setup

Copy `.env.phase14` and ensure these variables are set:

```env
# Ollama Configuration
OLLAMA_URL=http://localhost:11434
LLM_MODEL=gemma3-legal:latest
EMBEDDING_MODEL=embeddinggemma:latest

# MinIO Object Storage
MINIO_ENDPOINT=localhost
MINIO_PORT=9000
MINIO_ROOT_USER=minioadmin
MINIO_ROOT_PASSWORD=minioadmin
MINIO_EVIDENCE_BUCKET=legal-evidence
MINIO_USE_SSL=false

# PostgreSQL
DATABASE_URL=postgresql://postgres:123456@localhost:5432/legal_ai_db

# Qdrant Vector DB
QDRANT_URL=http://localhost:6333

# Development
DEV_BYPASS_AUTH=true
PHASE72_ENABLED=true
```

### 3. Start Services

#### Option A: Using Existing Docker Compose
```bash
# From project root
docker-compose up -d
```

#### Option B: Manual Service Startup

**PostgreSQL** (if not running):
```powershell
& "C:\Program Files\PostgreSQL\17\bin\pg_ctl.exe" start `
  -D "C:\Program Files\PostgreSQL\17\data"
```

**MinIO**:
```powershell
cd C:\Users\james\Videos\deeds-web-app
.\minio.exe server --address :9000 --console-address :9001 .\minio-data
```

**Ollama** (pull models if needed):
```powershell
ollama pull embeddinggemma:latest
ollama pull gemma3-legal:latest  # or your preferred chat model
```

**Qdrant**:
```bash
docker run -d -p 6333:6333 qdrant/qdrant
```

### 4. Verify Setup

Run the integration tests:
```powershell
cd sveltekit-frontend
.\scripts\test-phase72-integration.ps1
```

Expected output:
```
✅ Database schema verified
✅ Ollama embeddinggemma available
✅ MinIO bucket accessible
✅ Qdrant collection created
```

### 5. Start Dev Server

```powershell
npm run dev
```

Then visit: **http://localhost:5173/terminal**

## Troubleshooting

### MinIO Connection Issues

Check if MinIO is running:
```powershell
Test-NetConnection -ComputerName localhost -Port 9000
```

Create bucket manually:
```bash
# Install MinIO client (mc)
mc alias set local http://localhost:9000 minioadmin minioadmin
mc mb local/legal-evidence
```

### Ollama Model Not Found

List available models:
```bash
ollama list
```

Pull missing models:
```bash
ollama pull embeddinggemma:latest
```

### Database Connection Errors

Verify PostgreSQL is running on correct port:
```powershell
$env:PGPASSWORD='123456'
psql -U postgres -p 5432 -c "\l"
```

### Qdrant Not Accessible

Check Qdrant status:
```powershell
curl http://localhost:6333/health
```

## File Structure

After installation, you should have:

```
sveltekit-frontend/
├── docs/
│   ├── ai-chat-contextual.md       ✅ Architecture doc
│   └── routes-terminal.md          ✅ Route documentation
├── src/
│   ├── lib/
│   │   ├── schemas/
│   │   │   └── aiChat.ts           ✅ Zod validation schema
│   │   └── server/
│   │       ├── minio-client.ts     ✅ MinIO upload helper
│   │       ├── rag-pipeline.ts     ✅ RAG job queue
│   │       ├── rag-query.ts        ✅ Context retrieval
│   │       ├── queue.ts            ✅ Message queue stub
│   │       └── llm/
│   │           └── contextual-chat.ts  ✅ LLM integration
│   └── routes/
│       └── terminal/
│           ├── +page.svelte        ✅ Chat UI
│           └── +page.server.ts     ✅ Form actions
└── package.json                    ✅ Updated dependencies
```

## Next Steps

1. **Connect Real Queue**: Replace stub in `queue.ts` with RabbitMQ/NATS
2. **Implement RAG Query**: Add Qdrant vector search in `rag-query.ts`
3. **Add Chat Persistence**: Save conversations to PostgreSQL
4. **Build Worker**: Create Python/Go worker to process uploaded files
5. **Add Streaming**: Implement SSE for real-time LLM responses

## Worker Implementation (Next Phase)

The RAG indexing worker should:

1. **Listen** to `rag-indexing` queue
2. **Download** files from MinIO using `bucket` + `objectName`
3. **Extract** text (OCR for images, parse PDFs)
4. **Generate** embeddings via Ollama `embeddinggemma:latest`
5. **Store** vectors in Qdrant collection `phase72_evidence_embeddings`
6. **Update** PostgreSQL `evidence_files` table with metadata
7. **Optional**: Create knowledge graph nodes/edges in Neo4j

See `docs/ai-chat-contextual.md` for detailed flow.
