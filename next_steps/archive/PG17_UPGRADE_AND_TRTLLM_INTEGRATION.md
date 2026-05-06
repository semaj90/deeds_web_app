# PG17 Upgrade — Complete

## Summary

PostgreSQL 16→17 upgrade completed via dump/restore with full data preservation (85 tables, pgai vectorizer config, all Ollama SQL functions).

### PG17 Benefits
- 27% faster sequential scans
- 20x lower vacuum memory usage
- Improved JSON_TABLE support
- Incremental sorts
- Better IN-clause B-tree indexing

### What Was Done
1. Built custom `deeds-postgres-pgai:pg17` Docker image (pgvector 0.8.1 + pgai + plpython3u)
2. Dumped PG16 data via `pg_dump` (custom format, 377KB)
3. Restored into PG17 container via `pg_restore --no-owner --clean --if-exists`
4. Verified: 85 tables, pgvector 0.8.1, pgai Ollama functions, vectorizer config — all intact
5. Old PG16 volume preserved as backup (`deeds-web-app_postgres-data`)

### Files Changed
| File | Change |
|------|--------|
| `docker/postgres/Dockerfile` | `pgvector:pg16` → `pgvector:pg17`, `plpython3-16` → `plpython3-17` |
| `docker-compose.sveltekit-prod.yml` | Image tag `pg16` → `pg17` |

---

## pgai + TRT-LLM/Triton: Integration Status

**Will it work? Yes, but not out-of-the-box.**

### What Exists vs What's Needed

| Component | Status | Details |
|-----------|--------|---------|
| pgai Ollama functions | **Working** | `ai.ollama_embed()`, `ai.ollama_generate()` — call Ollama HTTP API via plpython3u |
| TRT-LLM client | **Exists** | `trt-llm.ts` — OpenAI-compatible `/v1/completions` at port 8099 |
| GPU arbiter | **Exists** | Redis VRAM mutex — prevents TRT + Ollama from coexisting in 8GB |
| Inference router | **Exists** | Smart fallback: TRT-LLM → Ollama |
| pgai → TRT-LLM | **Not wired** | pgai only knows Ollama — would need custom SQL functions or litellm adapter |

### Architecture

```
Current (working):
  SvelteKit API → inference-router.ts → TRT-LLM (preferred) → Ollama (fallback)
  pgai SQL functions → Ollama directly (bypasses inference router)

Potential (not built):
  pgai SQL functions → custom plpython3u → TRT-LLM OpenAI API
  pgai SQL functions → litellm adapter → TRT-LLM
```

### Bottom Line

pgai currently calls Ollama directly via HTTP. TRT-LLM uses the same OpenAI-compatible API format, so a custom plpython3u function could call TRT-LLM instead. But for the 8GB RTX 3060 Ti, the GPU arbiter already handles the TRT↔Ollama mutex at the SvelteKit layer — pgai calling Ollama is the simplest path that works today.

---

## Next Steps

### 1. pgai TRT-LLM Integration (Optional)
- Create custom plpython3u function `ai.trtllm_generate()` that calls TRT-LLM's `/v1/completions` endpoint
- Add GPU arbiter awareness (check Redis lease before calling)
- Wire to inference router pattern for automatic fallback

### 2. TRT-LLM Engine Build (Blocked → Phase Plan Exists)
- Full plan at `.claude/plans/fizzy-munching-quail.md`
- Phase 1: Build Gemma3 12B text-only INT4 TRT engine inside Linux container
- Phase 2: SigLIP vision encoder as separate ONNX/TRT model
- Phase 3: Vision-text projector + Triton ensemble
- Phase 4: Triton deployment + SvelteKit integration
- **Blocker**: Must run inside Linux container (not Windows Python)

### 3. pgai Vectorizer Worker (Deferred)
- `pgai[vectorizer-worker]` pulls PyTorch (~2GB) into PG container — too heavy
- Current approach: Ollama HTTP calls for embedding (lightweight)
- Alternative: External vectorizer worker as separate container

### 4. PG16 Volume Cleanup
- Old volume `deeds-web-app_postgres-data` preserved as backup
- Safe to remove after confirming PG17 stability: `docker volume rm deeds-web-app_postgres-data`