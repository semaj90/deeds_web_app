# 🚀 Quick Start: embeddinggemma:latest Setup

## One-Command Setup

```powershell
# Run the automated test suite
.\test-embeddinggemma.ps1
```

This script will:
- ✅ Check Ollama is running
- ✅ Pull embeddinggemma:latest (if not installed)
- ✅ Test embedding generation (768 dims)
- ✅ Verify Python backend health
- ✅ Test TypeScript search API
- ✅ Check Redis cache integration
- ✅ Verify Qdrant vector database
- ✅ Check PostgreSQL + pgvector

## Manual Setup (if needed)

### 1. Install embeddinggemma Model
```bash
ollama pull embeddinggemma:latest
```

### 2. Start Infrastructure
```bash
docker-compose up -d
```

### 3. Start Python AI Server
```bash
cd ai-server
pip install -r requirements.txt
python main.py  # → http://localhost:8000
```

### 4. Start SvelteKit Frontend
```bash
npm run dev  # → http://localhost:5173
```

## Test Search API

```bash
curl -X POST http://localhost:5173/api/search \
  -H "Content-Type: application/json" \
  -d '{
    "query": "contract evidence with parties involved",
    "options": {
      "limit": 5,
      "threshold": 0.6
    }
  }'
```

## 📚 Full Documentation

See `EMBEDDINGGEMMA-SETUP-GUIDE.md` for:
- Performance comparison vs. nomic-embed-text
- Advanced features (k-means clustering, semantic metrics)
- Troubleshooting guide
- Migration instructions

## ✅ Success Indicators

When everything is working:
- ✅ `ollama list` shows `embeddinggemma:latest`
- ✅ Search API returns `"embeddingModel": "embeddinggemma:latest"`
- ✅ Embeddings have 768 dimensions
- ✅ Redis cache shows top-k queries
- ✅ Qdrant collection has evidence_vectors
- ✅ Search latency <200ms

---

**Quick Test**: Run `.\test-embeddinggemma.ps1` now! 🚀
