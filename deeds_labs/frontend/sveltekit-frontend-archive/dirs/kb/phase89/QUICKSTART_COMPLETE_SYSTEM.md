# Phase 89: Complete System - 2-Minute Quickstart

## 🚀 Start Everything

```powershell
# 1. Start dev server (Terminal 1)
cd sveltekit-frontend
npx vite dev --port 5175

# 2. Open admin explorer
Start-Process "http://localhost:5175/admin/explorer"

# 3. Run integrated pipeline (Terminal 2 - optional)
node scripts/phase89-cuda-integrated-pipeline.mjs
```

That's it! 🎉

## 📊 What You'll See

### Admin Explorer (http://localhost:5175/admin/explorer)
- **Left Panel**: Tree/list of all routes
- **Right Panel**: Route details (errors, functions, KB entries)
- **Top**: Agent status (pulsing 🤖 when active)
- **Bottom**: "Fix with Agent" button

### Pipeline Output (Terminal 2)
```
🚀 Phase 89: CUDA-Accelerated Integrated Pipeline

📦 Stage 1: Initialize Qdrant collections...
  ✅ Collection phase89_ast_embeddings exists

🌳 Stage 2: Generate AST embeddings (GPU)...
  🔄 Processed 32/100 nodes
  📊 Indexed 100/100 points

🔬 Stage 3: CUDA error clustering...
  ✅ Found 5 error clusters

📊 Stage 4: Batch summarization...
  📝 Cluster 0: high priority, 92% confidence

🤖 Stage 5: ACE contextual engineering...
  🛠️  Recommended 3 tool calls

🎯 Stage 6: Diff ranking...
  📈 Top similarity: 0.943

📚 Stage 7: Update knowledge base...
  🎓 KB updated

✅ Pipeline complete!
```

## 🎯 Try These Tasks

### 1. Find Errors
1. Look for red borders on routes
2. Click route
3. See error count in metrics

### 2. Fix with Agent
1. Select route with errors
2. Click "Fix with Agent" button
3. Watch agent status (top of page)
4. See progress: 0% → 30% → 70% → 100%

### 3. Check KB Coverage
1. Look at `KB Vectors` column
2. Gray background = not in KB (0 vectors)
3. Run learning pipeline to add missing files

### 4. Run Full Pipeline
```powershell
# Terminal 2
node scripts/phase89-learning-pipeline.mjs --full-pipeline
```

## 🔍 Verify System

```powershell
# Check Docker containers
docker ps | grep -E "(postgres|qdrant|ollama)"

# Check Qdrant collections
curl http://localhost:6333/collections

# Check PostgreSQL
docker exec phase66-postgres psql -U user -d legal -c "SELECT COUNT(*) FROM raw_error_embeddings;"

# Verify system health
.\scripts\phase89-verify-system.ps1
```

## 📚 Documentation

- **Admin Explorer**: `kb/phase89/ADMIN_ROUTE_EXPLORER_COMPLETE.md`
- **CUDA Pipeline**: `kb/phase89/CUDA_INTEGRATED_SYSTEM_COMPLETE.md`
- **Full Summary**: `kb/phase89/SYSTEM_INTEGRATION_SUMMARY.md`

## 🐛 Troubleshooting

### Routes not loading
```powershell
# Check PostgreSQL
docker ps --filter name=postgres

# Restart if needed
docker start phase66-postgres
```

### KB vectors showing 0
```powershell
# Run learning pipeline
node scripts/phase89-learning-pipeline.mjs --full-pipeline
```

### Agent not working
```powershell
# Check Ollama
docker exec ollama-gemma ollama list | grep gemma3-legal

# Pull model if needed
docker exec ollama-gemma ollama pull gemma3-legal:latest
```

### SSE not connecting
- Open browser DevTools → Network
- Look for `routes/stream` (EventStream type)
- Check console for errors

## ✅ Success Criteria

- ✅ Admin explorer loads routes
- ✅ Error counts displayed
- ✅ KB vectors counted
- ✅ Agent status updates in real-time
- ✅ "Fix with Agent" triggers endpoint
- ✅ Pipeline runs without errors

## 🎓 What You Have

### Infrastructure
- **Qdrant**: 4 collections (ast, clusters, recommendations, KB)
- **PostgreSQL**: Error data storage
- **Ollama**: embeddinggemma + gemma3-legal
- **Redis**: Caching layer

### Features
- **Admin UI**: Visual codebase explorer
- **GPU Embeddings**: 6-7x faster than CPU
- **CUDA Clustering**: Topological error grouping
- **ACE Tools**: Contextual engineering
- **Diff Ranking**: Cosine similarity-based
- **KB Learning**: Continuous improvement

### Integrations
- **Svelte 5**: Runes mode ($state, $derived, snippets)
- **SSE**: Real-time updates
- **Babel AST**: Code analysis
- **LLM**: gemma3-legal for fixes
- **Vector Search**: Qdrant HNSW

---

**You're ready to use the complete Phase 89 system!** 🚀

**Quick Access**: http://localhost:5175/admin/explorer
