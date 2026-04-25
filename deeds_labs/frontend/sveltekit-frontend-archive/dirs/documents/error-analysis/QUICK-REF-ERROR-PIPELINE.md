# ⚡ QUICK REFERENCE - Error Analysis & Fixing Pipeline

**Last Updated**: 2025-11-04  
**Status**: ✅ Operational  
**Total Errors**: 113,624 → Target: <10k

---

## 🎯 ONE-MINUTE STARTUP

```bash
# 1. Restart Qdrant (if unhealthy)
docker restart legal-qdrant-384

# 2. Test services
cd C:\Users\james\Videos\deeds-web-app\sveltekit-frontend
node scripts/test-full-stack-integration.mjs

# 3. Start fixing
node scripts/fix-svelte5-patterns.mjs --apply --backup
```

---

## 📊 VS Code Tasks (Ctrl+Shift+P → Run Task)

### Error Analysis
| Task | Time | Use Case |
|------|------|----------|
| **Error Analysis: Top 10,000** | 30s | ⭐ Daily check |
| Error Analysis: Top 1,000 | 10s | Quick scan |
| Refresh Error Cache | 10 min | After major changes |

### Fixes
| Task | Impact | Time |
|------|--------|------|
| **Concurrent AST Fixer** | -40k errors | 15 min ⭐ |
| Full GPU Pipeline | -40k errors | 22 min |
| Fix Any Types | ~0 (already done) | 5 min |

### Services
| Task | Purpose |
|------|---------|
| **Test Full Stack Integration** | Verify all services ⚡ |
| Service Status Check | Quick health check |

---

## 🔧 Service Quick Checks

```bash
# Redis
redis-cli ping  # PONG

# PostgreSQL
psql -h localhost -U legal_admin -d legal_ai_db -c "SELECT version()"

# Qdrant
curl http://localhost:6333/health

# Ollama
curl http://localhost:11434/api/tags

# Go RAG
curl http://localhost:8094/health
```

---

## 🚀 Command Cheatsheet

### Error Analysis
```bash
# Categorize errors
node scripts/categorize-svelte-check-log.mjs --log svelte-check-current.log --limit 10000 --json

# Cache in Redis
node scripts/redis-error-analyzer.mjs --refresh --top 10000

# Query top N
node scripts/redis-error-analyzer.mjs --top 1000 --cache-only
```

### Embedding Pipeline
```bash
# Generate embeddings (GPU)
node scripts/phase43-ai-analyzer.mjs error-analysis-report.json --batch-size 5000

# Cluster vectors (CUDA)
python scripts/phase44-tensor-loader.py --limit 10000 --cluster 20

# Run fixes
node scripts/concurrent-ast-fixer.mjs --workers=8 --batch-size=100
```

### Maintenance
```bash
# Clear Redis cache
redis-cli --scan --pattern "error:*" | xargs redis-cli del

# Backup database
pg_dump -h localhost -U legal_admin legal_ai_db > backup.sql

# Check GPU usage
nvidia-smi
```

---

## 📁 Key Files

| File | Purpose |
|------|---------|
| `REDIS-QDRANT-PGVECTOR-NER-HOWTO.md` | Complete integration guide |
| `PHASE43-44-COMPLETE-STATUS.md` | Current status & next steps |
| `HOW-IT-WORKS-COMPLETE-GUIDE.md` | Technical deep-dive |
| `.vscode/tasks.json` | All VS Code tasks |
| `.env` | Service configuration |

---

## ⚡ Performance Numbers

| Metric | Value |
|--------|-------|
| Cache speedup | 60x-600x |
| GPU embeddings | 411 errors/sec |
| Qdrant search | <10ms |
| Concurrent workers | 8-16 threads |
| Batch size | 100-5000 |

---

## 🔥 Top 3 Actions (Pick One)

### 1. Quick Test (1 min)
```bash
node scripts/test-full-stack-integration.mjs --verbose
```

### 2. Fast Analysis (30s)
```bash
# VS Code: Run Task → "Error Analysis: Top 10,000"
```

### 3. Fix Batch (15 min)
```bash
node scripts/concurrent-ast-fixer.mjs --workers=8 --batch-size=100
```

---

## 🆘 Troubleshooting

| Problem | Fix |
|---------|-----|
| Qdrant unhealthy | `docker restart legal-qdrant-384` |
| Redis empty | `node scripts/redis-error-analyzer.mjs --refresh --top 10000` |
| Ollama slow | Reduce `--batch-size` to 1000 |
| AST fixer stuck | Check `logs/*.log` for errors |

---

## 📞 Support Docs

1. Integration: `REDIS-QDRANT-PGVECTOR-NER-HOWTO.md` (26 KB)
2. How it works: `HOW-IT-WORKS-COMPLETE-GUIDE.md` (45 KB)
3. VS Code: `VSCODE-TASK-QUICK-REF.md` (12 KB)
4. Status: `PHASE43-44-COMPLETE-STATUS.md` (13 KB)

---

**Status**: ✅ Ready to execute  
**Next**: Run integration test, then choose action 1, 2, or 3
