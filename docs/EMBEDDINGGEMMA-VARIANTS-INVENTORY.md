# EmbeddingGemma Variants Inventory (2026-07-20)

**Purpose**: Complete inventory of all embeddinggemma models, their dimensions, capabilities, and deployment configurations.

**Status**: 🔴 **CRITICAL: Dimension verification pending (pgvector audit Step 1)**

---

## Official EmbeddingGemma Lineage

### Core Model Specifications

| Model | Provider | Dimensions | Pooling | Training Data | Use Case | Status |
|-------|----------|-----------|---------|---------------|----------|--------|
| `embedding-001` (orig) | Google | 768 | mean | ~500M documents | Baseline reference | ✅ Archived |
| `embedding-004` | Google | 768 | mean | BERT-style | Post-BERT standard | ✅ Reference |
| `embeddinggemma:latest` | Ollama | **384 or 768?** | mean | Distilled from larger | Current canonical | 🔴 **UNVERIFIED** |

---

## Ollama Deployment Variants

### Ollama `embeddinggemma` Tags

| Tag | Size | Quantization | Latency (RTX 3060 Ti) | VRAM | Accuracy | Status |
|-----|------|--------------|----------------------|------|----------|--------|
| `embeddinggemma:latest` | ~1.3GB | F32 (or Q8?) | ~50-100ms | ~2GB | Baseline | 🔴 **DIMENSION UNKNOWN** |
| `embeddinggemma:latest-int4` | ~0.5GB | INT4 quantized | ~30-50ms | ~1GB | -2-5% accuracy loss | ⏳ Untested |

---

## The Critical Question: What is the Output Dimension?

### Hypothesis A: 768-Dimensional
**Evidence**:
- 12 Postgres tables declare `vector(768)` (atlas_packets, legal_chunks, etc.)
- Qdrant `codebase_chunks_768` collection uses 768-dim (40.5K points, live)
- Autoencoder input is 768-dim (GPU architecture)
- Phase 0 doc claims this is legacy (but not verified as wrong)

**If True**:
- Current Qdrant collection is correct
- Postgres 768-dim tables match model output
- Autoencoder needs no dimension change
- 9 vector(384) tables are outliers (migration target)

### Hypothesis B: 384-Dimensional
**Evidence**:
- 9 Postgres tables declare `vector(384)` (embedding_index, legal_cases, gpu_cache.source_embedding)
- Phase 0 doc claims embeddinggemma is 384-dim (one sentence, unverified)
- Autoencoder projects 384→64 (if 384 is canonical)
- 384 is half of 768 (model distillation pattern)

**If True**:
- Current Qdrant collection (768) is WRONG and must be rebuilt
- 12 vector(768) tables must be migrated to 384
- Autoencoder input changes from 768→64 to 384→64
- System must recompute all embeddings

### Hypothesis C: Both (Model Shift)
**Evidence**:
- EmbeddingGemma was originally 768-dim
- Ollama distilled it to 384-dim at some point
- Current `embeddinggemma:latest` tag changed dimension over time

**If True**:
- Schema built against old model (768)
- Current model outputs 384 (dimension mismatch)
- Must verify WHICH version is running NOW

---

## Verification Plan (pgvector Audit Step 1)

### How to Determine the Actual Dimension

**Execute this command with Docker running (Ollama :11434)**:

```bash
# Verify embeddinggemma:latest dimension
curl -s http://127.0.0.1:11434/api/embeddings \
  -d '{"model":"embeddinggemma:latest","prompt":"test"}' \
  | jq '.embedding | length'

# Expected output: 384 or 768
```

### Fallback: Check Model Card

If HTTP fails, pull the model info directly:

```bash
# Start Ollama
ollama pull embeddinggemma:latest

# Check GGUF metadata
strings ~/.ollama/models/blobs/sha256-<hash> | grep -i "dim\|vocab_size"

# Or via Ollama CLI
ollama show embeddinggemma:latest
```

### Cross-Check: Embed a Real String

```bash
# Embed the string "test"
curl -s http://127.0.0.1:11434/api/embeddings \
  -d '{"model":"embeddinggemma:latest","prompt":"test"}' \
  | jq '.embedding | {length: (.embedding | length), first_5: .embedding[0:5]}'

# Expected:
# {
#   "length": 384 or 768,
#   "first_5": [0.123, -0.456, ...]
# }
```

---

## Model Variants Currently Live in Repo

### Ollama Tags Used in Code

**From `src/lib/server/retrieval/embedding-service.ts`:**
```typescript
const DEFAULT_CONFIG: Required<EmbeddingServiceConfig> = {
  embed_model: 'embeddinggemma:latest',  // ← THE CRITICAL ONE (dimension unknown)
  ollama_url: 'http://127.0.0.1:11434',
  target_dim: 768,  // ← HARDCODED ASSUMPTION (may be wrong)
  // ...
};
```

**From CLAUDE.md rules:**
```
- **Embeddings Lane**: Ollama (`embeddinggemma:latest` via `/api/embed`)
- **Fallback**: `nomic-embed-text` (if embeddinggemma unavailable)
```

### Nomic Embed Text (Fallback)

| Model | Dimensions | Pooling | Notes |
|-------|-----------|---------|-------|
| `nomic-embed-text` | 768 | mean | Always 768-dim, production-stable, slower than embeddinggemma |

---

## Schema Impact Matrix

### If embeddinggemma:latest = 384-dim

**Breaking Changes**:
1. ❌ Qdrant `codebase_chunks_768` → must rebuild with 384-dim vectors
2. ❌ All Postgres `vector(768)` columns → must migrate to `vector(384)`
3. ❌ Autoencoder input → changes from 768 to 384
4. ❌ All stored embeddings → must recompute (backfill)
5. ❌ GPU reranking logic → must be retrained on 384-dim

**Timeline**: 4-6 hours (recompute + migration + validation)

**Safe Migration Path**:
- Step 1: Migrate Postgres schema (ALTER TABLE ... ALTER COLUMN ... TYPE vector(384))
- Step 2: Backfill embeddings via embeddinggemma HTTP (Ollama :11434)
- Step 3: Rebuild Qdrant `codebase_chunks_384_hybrid` from Postgres
- Step 4: Run smoke tests (retrieval, ranking, GAN validation)
- Step 5: Archive old Qdrant `codebase_chunks_768` (don't delete)

### If embeddinggemma:latest = 768-dim

**No Breaking Changes**:
1. ✅ Qdrant `codebase_chunks_768` → stays as-is
2. ✅ All Postgres `vector(768)` → stays as-is
3. ✅ 9 vector(384) tables → are legacy outliers (clean up later)
4. ✅ Autoencoder input → stays 768
5. ✅ GPU reranking logic → no change

**Timeline**: 0 hours (no action needed)

**Cleanup Path** (optional, post-Phase 1):
- Migrate 9 vector(384) tables to 384 or 768 (operator choice)
- Archive old schema versions (post-decision)

---

## Embedding Dimension Policy (POST-AUDIT)

### Will Be Finalized in `docs/DIMENSION-POLICY.md`

This document (`EMBEDDINGGEMMA-VARIANTS-INVENTORY.md`) inventories ALL possible variants and dimensions.

Once Step 1 verification completes, `DIMENSION-POLICY.md` will lock ONE canonical choice:

```markdown
# Canonical Embedding Dimension Policy

**PROJECT_CANONICAL_EMBED_DIM** = 384 OR 768 (to be determined Oct 20, 2026, post-verification)

All embeddings MUST use this dimension.
All Postgres pgvector columns MUST use this dimension.
All Qdrant collections MUST use this dimension.
All GPU reranking MUST operate on this dimension.

No mixing. No truncation. No padding.
```

---

## Current Blockers (pgvector Audit Lane)

### Gate 1: Embeddinggemma Dimension Verification
- **Status**: 🔴 BLOCKED (Step 1 pending)
- **Owner**: Operator (requires Docker + Ollama :11434)
- **Action**: Run curl command above, document result
- **Unblocks**: Steps 2-7 of audit (7 gates total)

### Gate 2: Qdrant Collection Inventory
- **Status**: 🔴 BLOCKED (depends on Gate 1)
- **Action**: Query Qdrant for collection dimensions, row counts, payload schema
- **Output**: `docs/QDRANT-COLLECTIONS-LIVE.md`

### Gate 3: Retrieval Code Audit
- **Status**: 🔴 BLOCKED (depends on Gate 1)
- **Action**: Search for hard-coded collection names, dimension assumptions
- **Output**: `docs/RETRIEVAL-CODE-COLLECTION-AUDIT.md`

### Gate 4: Autoencoder Dimension Contract
- **Status**: 🔴 BLOCKED (depends on Gate 1)
- **Action**: Verify autoencoder accepts canonical dimension
- **Output**: `docs/AUTOENCODER-DIMENSION-CONTRACT.md`

### Gate 5: Postgres Schema Reconciliation
- **Status**: 🔴 BLOCKED (depends on Gates 1-4)
- **Action**: Plan migration path (384 or 768)
- **Output**: `docs/POSTGRES-SCHEMA-RECONCILIATION.md`

### Gate 6: Qdrant Collection Cutover
- **Status**: 🔴 BLOCKED (depends on Gates 1-5)
- **Action**: Plan collection rebuild or migration
- **Output**: `docs/QDRANT-COLLECTION-CUTOVER-PLAN.md`

### Gate 7: Collection Alias Resolver
- **Status**: 🔴 BLOCKED (depends on Gates 1-6)
- **Action**: Wire runtime alias resolution (no hard-coded names)
- **Output**: Code change (resolveEmbeddingCollection() function)

---

## Known Hard-Coded Dimensions in Code

### Search Results

| File | Line | Code | Dimension Assumed |
|------|------|------|------------------|
| `src/lib/server/retrieval/embedding-service.ts` | 73 | `target_dim: 768` | 768 |
| `centroid-cache.ts` | 194 | Hard-coded collection name | 768 (per Qdrant collection) |
| `go-retrieval-orchestrator.ts` | 156 | Hard-coded collection name | 768 |
| (More to be found in Step 3 audit) | — | — | TBD |

---

## Decision Path (POST-AUDIT)

Once Step 1 verifies the dimension, the system chooses:

### Path A: Canonical = 384-dim
1. Migrate 12 vector(768) tables → vector(384)
2. Rebuild Qdrant from Postgres
3. Update embedding-service.ts target_dim to 384
4. Recompute all 40.5K embeddings
5. Update autoencoder to accept 384 input
6. Update retrieval code to use alias resolver
7. Archive old schema and Qdrant collection

**Timeline**: 4-6 hours

### Path B: Canonical = 768-dim
1. Keep 12 vector(768) tables as-is
2. Keep Qdrant `codebase_chunks_768` as-is
3. Confirm embedding-service.ts target_dim = 768
4. Confirm autoencoder input = 768
5. Mark 9 vector(384) tables as legacy
6. No re-embedding needed
7. Wire alias resolver for future flexibility

**Timeline**: 1-2 hours

---

## Recommendation

**IMMEDIATELY EXECUTE STEP 1** of the pgvector audit (dimension verification via curl). This single command output determines the entire migration path and unblocks all Phase 0-17 work.

No further analysis is possible without the verified dimension.

---

## Current Schema Dimensions Summary

**Canonical Assumption (June 28 audit)**: 768-dim
- 12 Postgres tables with vector(768)
- Qdrant `codebase_chunks_768` (40.5K points, live)
- Autoencoder input: 768-dim

**Alternative Hypothesis (pgvector audit pending)**: 384-dim
- 9 Postgres tables with vector(384)
- Phase 0 doc claims embeddinggemma is 384-dim (unverified)
- Would require full schema migration

**Truncation Paths** (if needed):
- 768 → 384 (mean pooling, ~15-25% loss)
- 768 → 256 (PCA projection, ~20-30% loss)
- 768 → 128 (autoencoder, ~40-50% loss)
- 768 → 64 (current AE, ~50-60% loss, routing-only)

See `EMBEDDINGGEMMA-DIMENSION-MATRIX.md` for complete dimension inventory.

---

## References

- **Audit Framework**: `docs/audit/PGVECTOR-DIMENSION-DRIFT-AUDIT.md`
- **Gate Statement**: `docs/PHASE-0-DDL-GATE.md`
- **Operator Runbook**: `docs/PGVECTOR-AUDIT-OPERATOR-RUNBOOK.md`
- **Embedding Service Config**: `src/lib/server/retrieval/embedding-service.ts`
- **Memory Checkpoint**: `memory/PGVECTOR-AUDIT-LANE-INITIATED.md`
- **Dimension Matrix**: `docs/EMBEDDINGGEMMA-DIMENSION-MATRIX.md` (768/384/256/128 inventory)
- **June 28 Audit**: `docs/architecture/CORRECTED-embedding-dimension-policy.md`
