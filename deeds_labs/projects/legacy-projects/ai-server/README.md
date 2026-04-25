# Evidence AI Assistant - Python FastAPI Backend

Production-ready AI server for legal evidence processing with token streaming, vector search, and workflow orchestration.

## 🚀 Features

- **FastAPI** with WebSocket support for real-time streaming
- **Triton/TensorRT** primary AI inference with **Ollama fallback**
- **PostgreSQL + PGVector** for vector storage
- **Qdrant** for fast vector search
- **MinIO** for object storage
- **Redis** for caching (24hr embeddings, 1hr analysis) and pub/sub
- **Workflow orchestration** with progress tracking
- **CORS** enabled for SvelteKit 2 frontend

## 📦 Installation

```bash
# Create virtual environment
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt
```

## ⚙️ Configuration

Copy `.env` file and update with your credentials:

```bash
DATABASE_URL=postgresql://user:pass@localhost:5432/legal_ai_db
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=your_password
MINIO_ENDPOINT=localhost:9000
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin
QDRANT_URL=http://localhost:6333
OLLAMA_BASE_URL=http://localhost:11434
AI_MODEL=gemma3-legal:latest
```

## 🏃 Running

```bash
# Start server
python main.py

# Or with uvicorn directly
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

Server runs on `http://localhost:8000`

## 📡 API Endpoints

### Health Check
```http
GET /health
```

### File Upload
```http
POST /api/upload
Content-Type: multipart/form-data

file: <file>
user_id: <string>
case_id: <string> (optional)
```

### Search
```http
POST /api/search
Content-Type: application/json

{
  "query": "search terms",
  "user_id": "user123",
  "use_vector": true,
  "limit": 10
}
```

### Workflow Status
```http
GET /api/workflow/{file_id}
```

### Analysis (Cached)
```http
GET /api/analysis/{file_id}
```

### WebSocket
```
ws://localhost:8000/ws

Client sends:
{
  "type": "QUERY",
  "query": "Analyze this evidence",
  "file_id": "evidence_abc123"
}

Server streams:
{
  "type": "TOKEN",
  "token": "word",
  "source": "ollama"
}

{
  "type": "COMPLETE",
  "file_id": "evidence_abc123"
}
```

## 🔄 Workflow Pipeline

1. **Upload** (10%) - File saved to MinIO
2. **OCR** (30%) - Text extraction
3. **Embedding** (50%) - Vector generation with nomic-embed-text
4. **Analysis** (70%) - AI streaming analysis with auto-tags
5. **Storage** (90%) - Dual storage in PGVector + Qdrant
6. **Complete** (100%) - Result cached in Redis

## 🧩 Architecture

```
FastAPI Server (Port 8000)
├── WebSocket (/ws) - Real-time streaming
├── File Upload (/api/upload) - MinIO storage
├── Search (/api/search) - PGVector + Qdrant
├── Workflow (/api/workflow) - Redis pub/sub
└── Analysis (/api/analysis) - Cached results

Services:
- Ollama: http://localhost:11434 (primary AI)
- TensorRT: http://localhost:8001 (fallback)
- PostgreSQL: localhost:5432 (PGVector)
- Qdrant: http://localhost:6333 (vector search)
- MinIO: localhost:9000 (file storage)
- Redis: localhost:6379 (cache + pub/sub)
```

## 🔗 Integration with SvelteKit 2

```typescript
// Frontend WebSocket connection
const ws = new WebSocket('ws://localhost:8000/ws');

ws.send(JSON.stringify({
  type: 'QUERY',
  query: 'Analyze this evidence',
  file_id: 'evidence_123'
}));

ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  if (data.type === 'TOKEN') {
    appendToken(data.token);
  }
  if (data.type === 'COMPLETE') {
    finalizeAnalysis();
  }
};
```

## 📊 Monitoring

Redis pub/sub channels:
- `workflow_updates` - Workflow progress events

Redis cache keys:
- `embedding:{file_id}` - TTL: 24hr
- `analysis:{file_id}` - TTL: 1hr
- `ws:update:{file_id}` - TTL: 5min

## 🛠️ Development

```bash
# Run in development mode with auto-reload
uvicorn main:app --reload --log-level debug

# Test WebSocket
python -m websockets ws://localhost:8000/ws

# Check Redis
redis-cli -a redis
> SUBSCRIBE workflow_updates

# Check PostgreSQL
psql -h localhost -U legal_admin -d legal_ai_db
> SELECT COUNT(*) FROM evidence_embeddings;
```

## 🚨 Production Notes

- Use HTTPS for WebSocket (wss://)
- Set up reverse proxy (Caddy/Nginx)
- Enable Redis persistence
- Configure PostgreSQL connection pooling
- Monitor GPU memory for TensorRT
- Set up log aggregation (ELK stack)
- Enable CORS only for trusted origins

## 📝 License

MIT
