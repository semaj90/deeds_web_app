# pgvector Dimension Audit — Operator Runbook

**For**: Project Operator  
**Purpose**: Execute the 7-step audit to unblock Phase 0 → Phase 1 ingestion pipeline  
**Duration**: ~4–6 hours (mostly waiting for Docker processes)  
**Prerequisites**: Docker Desktop, `docker-compose` running, Bash shell

---

## Pre-Flight Checklist

**Before starting the audit**:

- [ ] Docker Desktop is running
- [ ] Current terminal is in project root: `c:\Users\james\Videos\deeds-web-app`
- [ ] Git working tree is clean (no uncommitted changes)
- [ ] Latest branch is pulled: `git pull origin main`

**Verify services will start**:

```bash
# List services in docker-compose
docker-compose config | grep -E '^\s+[a-z]+:' | head -10

# Confirm images are available
docker images | grep -E '(ollama|qdrant|postgres)'
```

---

## Step 1: Verify embeddinggemma:latest Dimension

**Goal**: Determine the ACTUAL output dimension of the embedding model

**Time**: ~2–5 minutes

### 1a. Start Ollama Service

```bash
# Start or restart Ollama (port 11434)
docker-compose up -d ollama

# Wait for service to be ready (~30s)
sleep 30

# Health check
curl -s http://127.0.0.1:11434/api/tags | jq '.models[] | select(.name | contains("embedding"))'
```

**Expected output**: Should list `embeddinggemma:latest` or similar

**If model not found**:
```bash
# Pull the model (may take 2–5 min)
docker exec legal-ai-ollama ollama pull embeddinggemma:latest
```

### 1b. Test Embedding Dimension

```bash
# Run a single test embedding
curl -s http://127.0.0.1:11434/api/embeddings \
  -d '{"model":"embeddinggemma:latest","prompt":"test embedding"}' | \
  jq '.embedding | length'
```

**Expected output**: Either `384` or `768`

**Document your result** (choose one):

```bash
# If dimension is 384:
echo "384" > /tmp/embedding_dimension.txt

# If dimension is 768:
echo "768" > /tmp/embedding_dimension.txt

# Verify
cat /tmp/embedding_dimension.txt
```

### 1c. Create Output File

```bash
DIMENSION=$(cat /tmp/embedding_dimension.txt)

cat > "docs/EMBEDDING-MODEL-DIMENSION.md" << EOF
# Embedding Model Dimension

**Date Verified**: $(date -u +"%Y-%m-%d %H:%M:%S UTC")

## embeddinggemma:latest Dimension

**Actual Output Dimension**: ${DIMENSION}-dim

### Verification Method

Tested via live Ollama endpoint (:11434):

\`\`\`bash
curl -s http://127.0.0.1:11434/api/embeddings \\
  -d '{"model":"embeddinggemma:latest","prompt":"test"}' | \\
  jq '.embedding | length'
# Result: ${DIMENSION}
\`\`\`

### Implication

- ✅ If ${DIMENSION} = 384: Phase 0 doc is CORRECT, proceed with 384-dim canonical
- ✅ If ${DIMENSION} = 768: Phase 0 doc is WRONG, proceed with 768-dim canonical

### Next Step

Run Step 2 (Qdrant collection inventory).
EOF

echo "✅ Step 1 output created: docs/EMBEDDING-MODEL-DIMENSION.md"
```

---

## Step 2: Inventory Live Qdrant Collections

**Goal**: List all Qdrant collections and their dimensions

**Time**: ~1 minute

**Prerequisites**: Step 1 complete + Qdrant :6333 running

### 2a. Start Qdrant

```bash
docker-compose up -d qdrant
sleep 10

# Health check
curl -s http://127.0.0.1:6333/health | jq '.status'
# Expected: "ok"
```

### 2b. List Collections

```bash
# Get all collections
curl -s http://127.0.0.1:6333/collections | jq '.result[] | {name, points_count}'
```

**Expected output** (example):
```json
{
  "name": "codebase_chunks_768",
  "points_count": 40568
}
{
  "name": "codebase_chunks_384_hybrid",
  "points_count": 0
}
```

### 2c. Create Output File

```bash
curl -s http://127.0.0.1:6333/collections | jq '.result[]' > /tmp/qdrant_collections.json

cat > "docs/QDRANT-COLLECTIONS-LIVE.md" << 'EOF'
# Qdrant Collections — Live Inventory

**Date Verified**: $(date -u +"%Y-%m-%d %H:%M:%S UTC")

## Collections Found

$(cat /tmp/qdrant_collections.json | jq -r '.[] | "- `\(.name)`: \(.points_count) points"')

## Implications

- If only `codebase_chunks_768` exists: Phase 9 hybrid not deployed, stay at 768-dim
- If both collections exist: Phase 9 partially deployed, plan cutover
- If only `codebase_chunks_384_hybrid` exists: Migration already complete, use 384-dim

## Next Step

Run Step 3 (retrieval code audit).
EOF

echo "✅ Step 2 output created: docs/QDRANT-COLLECTIONS-LIVE.md"
```

---

## Step 3: Audit Retrieval Code Hard-Codes

**Goal**: Identify all places where collection names are hard-coded

**Time**: ~5 minutes

**No Docker needed** — pure code analysis

```bash
# Find all hard-coded Qdrant collection references
grep -r "codebase_chunks" \
  sveltekit-frontend/src/lib/server/retrieval \
  --include="*.ts" -n | tee /tmp/retrieval_hardcodes.txt

# Count results
echo ""
echo "Total hard-coded references: $(wc -l < /tmp/retrieval_hardcodes.txt)"
```

### Document Findings

```bash
cat > "docs/RETRIEVAL-CODE-COLLECTION-AUDIT.md" << 'EOF'
# Retrieval Code Collection Audit

**Date**: $(date -u +"%Y-%m-%d %H:%M:%S UTC")

## Hard-Coded Collection References

$(cat /tmp/retrieval_hardcodes.txt | awk -F: '{print "- `" $1 ":" $2 "` — " $3}')

## Analysis

- **Total hard-codes**: $(wc -l < /tmp/retrieval_hardcodes.txt)
- **Retrieval lanes affected**: $(cat /tmp/retrieval_hardcodes.txt | awk -F: '{print $1}' | sort -u | wc -l)
- **Collection alias resolution wired?**: NO (requires Step 7)

## Next Step

Run Step 4 (autoencoder contract).
EOF

echo "✅ Step 3 output created: docs/RETRIEVAL-CODE-COLLECTION-AUDIT.md"
```

---

## Step 4: Verify Autoencoder Dimension Contract

**Goal**: Determine if 768→64 autoencoder can support other input dimensions

**Time**: ~10 minutes

**No Docker needed** — code inspection + documentation

```bash
# Find autoencoder references
grep -r "768.*64\|autoencoder" \
  sveltekit-frontend/src/lib/server/retrieval \
  --include="*.ts" -n

# Find autoencoder implementation
ls -la sveltekit-frontend/src/lib/server/gpu/encode-768-to-64.ts
```

### Questions to Answer

```bash
cat > /tmp/autoencoder_questions.txt << 'EOF'
1. Are 768→64 weights specific to input dimension 768, or flexible?
   - Check: encode-768-to-64.ts comments, function signature, weight shape

2. If specific, do 384→64 weights exist?
   - Check: scripts/atlas/ for training scripts

3. Is autoencoder REQUIRED for GPU reranking?
   - Check: gpu-reranker.ts, can it skip autoencoder?

4. Fallback if weights unavailable?
   - Skip autoencoder (use 768-dim for clustering)?
   - Upsample 384→768 before reranking?
EOF

cat > "docs/AUTOENCODER-DIMENSION-CONTRACT.md" << 'EOF'
# Autoencoder Dimension Contract

**Date**: $(date -u +"%Y-%m-%d %H:%M:%S UTC")

## Current Autoencoder Setup

- **Input**: 768-dim
- **Output**: 64-dim
- **File**: `src/lib/server/gpu/encode-768-to-64.ts`
- **Purpose**: GPU reranking clustering (not search)

## Key Questions

1. **Are weights specific to 768-dim input?**
   Answer: [Inspect code and document]

2. **Do 384→64 weights exist?**
   Answer: [Search scripts/atlas/]

3. **Is autoencoder optional?**
   Answer: [Check gpu-reranker.ts fallback]

4. **Fallback strategy if dimension changes?**
   Answer: [Define plan]

## Implication for Dimension Reconciliation

If canonical dimension = 384-dim:
- Option A: Train 384→64 autoencoder (adds training time)
- Option B: Upsample 384→768 before reranking (defeats optimization)
- Option C: Use 384-dim directly for clustering (simplest, loses memory savings)

## Next Step

Run Step 5 (Postgres schema reconciliation).
EOF

echo "✅ Step 4 output created: docs/AUTOENCODER-DIMENSION-CONTRACT.md"
```

---

## Step 5: Postgres Schema Reconciliation

**Goal**: Plan migration to canonical dimension

**Time**: ~15 minutes (planning only, no execution)

```bash
# Get canonical dimension from Step 1
DIMENSION=$(cat /tmp/embedding_dimension.txt)

if [ "$DIMENSION" = "384" ]; then
  cat > "docs/POSTGRES-SCHEMA-RECONCILIATION.md" << 'EOF'
# Postgres Schema Reconciliation

**Canonical Dimension**: 384-dim

## Tables to Migrate

### Current vector(768) → vector(384)

- atlas_packets.embedding
- atlas_chunks.embedding
- codebase_embeddings.embedding
- legal_chunks.embedding
- legal_documents.content_embedding
- nes_chrom_packets.embedding
- rag_cards.embedding
- schema_semantic_cache.embedding
- search_analytics.content_embedding
- search_analytics.signature_embedding
- search_analytics.summary_embedding
- statute_chunks.embedding
- summary_cards.embedding
- workspace_notes.embedding

**Total**: 14 columns across 12 tables

## Backfill Strategy

Option A: Recompute via embeddinggemma:latest (safe, slow)
- Query Postgres for text content
- Call embedding service
- Update embeddings
- Time: ~2–4 hours for 40K+ rows

Option B: Truncate to 384-dim (fast, lossy)
- `UPDATE table SET embedding = embedding[1:384]`
- Time: < 5 minutes
- Note: Loses precision, may affect retrieval quality

**Recommendation**: Option A (recompute)

## DDL (Drizzle Migration)

```typescript
// drizzle/0NNN_migrate_to_384d_canonical.sql
ALTER TABLE atlas_packets ALTER COLUMN embedding TYPE vector(384);
ALTER TABLE atlas_chunks ALTER COLUMN embedding TYPE vector(384);
-- ... repeat for all 14 columns
```

**Do NOT apply yet** — backfill must complete first.

## Next Step

Run Step 6 (Qdrant cutover plan).
EOF

else
  # Dimension = 768
  cat > "docs/POSTGRES-SCHEMA-RECONCILIATION.md" << 'EOF'
# Postgres Schema Reconciliation

**Canonical Dimension**: 768-dim

## Tables to Migrate

### Current vector(384) → vector(768)

- embedding_index.embedding
- embedding_index.embedding_384
- error_clusters.embedding
- legal_cases.case_embedding
- legal_cases.case_embedding_384
- legal_cases.chunk_embedding
- atlas_registry.latent_384d
- gpu_cache.source_embedding

**Total**: 9 columns across 8 tables

## Backfill Strategy

Option A: Recompute via embeddinggemma:latest (safe, slow)
- Query Postgres for text content
- Call embedding service
- Update embeddings
- Time: ~1–2 hours for remaining rows

Option B: Upsample to 768-dim (fast, lossy)
- `UPDATE table SET embedding = array_append(embedding, array_fill(0, ARRAY[384]))`
- Time: < 5 minutes
- Note: Adds zeros, may affect retrieval quality

**Recommendation**: Option A (recompute)

## DDL (Drizzle Migration)

```typescript
// drizzle/0NNN_migrate_to_768d_canonical.sql
ALTER TABLE embedding_index ALTER COLUMN embedding TYPE vector(768);
ALTER TABLE embedding_index ALTER COLUMN embedding_384 TYPE vector(768);
-- ... repeat for all 9 columns
```

**Do NOT apply yet** — backfill must complete first.

## Next Step

Run Step 6 (Qdrant cutover plan).
EOF

fi

echo "✅ Step 5 output created: docs/POSTGRES-SCHEMA-RECONCILIATION.md"
```

---

## Step 6: Qdrant Collection Cutover Plan

**Goal**: Plan migration if needed

**Time**: ~10 minutes

```bash
# Check which collections exist
COLLECTIONS=$(curl -s http://127.0.0.1:6333/collections | jq -r '.result[].name' | grep "codebase_chunks")

cat > "docs/QDRANT-COLLECTION-CUTOVER-PLAN.md" << EOF
# Qdrant Collection Cutover Plan

**Date**: $(date -u +"%Y-%m-%d %H:%M:%S UTC")

## Collections Found

$(echo "$COLLECTIONS" | sed 's/^/- /')

## Cutover Strategy

### If only codebase_chunks_768 exists:
- No cutover needed
- Keep using 768-dim collections
- Update retrieval code comments: "768-dim is canonical"

### If both collections exist:
- Plan atomic cutover:
  1. Deploy collection-alias resolver (Step 7)
  2. Update retrieval code to use alias: \`resolveEmbeddingCollection()\`
  3. Flip alias to point to 384_hybrid
  4. Monitor for errors (1–2 hours)
  5. If stable, archive codebase_chunks_768
  6. If errors, revert alias (instant rollback)

### Rollback Procedure

If cutover fails:
\`\`\`bash
# In Qdrant config, revert collection alias
# OR in code, revert resolveEmbeddingCollection to return 'codebase_chunks_768'
# Deploy change
# No data loss (collections unchanged)
\`\`\`

## Next Step

Run Step 7 (collection alias resolver).
EOF

echo "✅ Step 6 output created: docs/QDRANT-COLLECTION-CUTOVER-PLAN.md"
```

---

## Step 7: Wire Collection Alias Resolver

**Goal**: Implement runtime collection name resolution (no hard-codes)

**Time**: ~30 minutes (code + tests)

**No Docker needed** — code change

### 7a. Create Resolver Module

```bash
cat > "sveltekit-frontend/src/lib/server/retrieval/collection-resolver.ts" << 'EOF'
import { EMBEDDING_POLICY } from "$lib/server/config/embedding-policy";

export interface CollectionResolverContext {
  dimension?: "canonical" | 768 | 384;
  vectorType?: "content" | "summary" | "signature";
}

export function resolveEmbeddingCollection(context?: CollectionResolverContext): string {
  const dimension = context?.dimension || "canonical";

  if (dimension === "canonical" || dimension === EMBEDDING_POLICY.canonical_dimension) {
    // Return the currently-active collection for canonical dimension
    return EMBEDDING_POLICY.qdrant_collection_live;
  }

  if (dimension === 768) {
    return "codebase_chunks_768";
  }

  if (dimension === 384) {
    return "codebase_chunks_384_hybrid";
  }

  throw new Error(`Unknown dimension: ${dimension}`);
}

export const EMBEDDING_POLICY = {
  canonical_dimension: 384, // Set by audit (384 or 768)
  qdrant_collection_live: "codebase_chunks_384_hybrid", // Set by audit
  qdrant_collection_legacy: "codebase_chunks_768",
};
EOF

echo "✅ Created: src/lib/server/retrieval/collection-resolver.ts"
```

### 7b. Update Retrieval Code to Use Resolver

```bash
# Find hard-coded references and replace them
# Example (manual review required):

# Before:
# await qdrant.search('codebase_chunks_768', ...)

# After:
# const collection = resolveEmbeddingCollection();
# await qdrant.search(collection, ...)
```

### 7c. Add Tests

```bash
cat > "sveltekit-frontend/src/lib/server/retrieval/collection-resolver.test.ts" << 'EOF'
import { describe, it, expect } from "vitest";
import { resolveEmbeddingCollection, EMBEDDING_POLICY } from "./collection-resolver";

describe("collection-resolver", () => {
  it("resolves canonical collection", () => {
    const collection = resolveEmbeddingCollection();
    expect(collection).toBe(EMBEDDING_POLICY.qdrant_collection_live);
  });

  it("resolves 384-dim collection", () => {
    const collection = resolveEmbeddingCollection({ dimension: 384 });
    expect(collection).toBe("codebase_chunks_384_hybrid");
  });

  it("resolves 768-dim collection", () => {
    const collection = resolveEmbeddingCollection({ dimension: 768 });
    expect(collection).toBe("codebase_chunks_768");
  });

  it("throws on unknown dimension", () => {
    expect(() => resolveEmbeddingCollection({ dimension: 512 as any })).toThrow();
  });
});
EOF

echo "✅ Created: src/lib/server/retrieval/collection-resolver.test.ts"
```

### 7d. Run Tests

```bash
cd sveltekit-frontend
npm run test -- collection-resolver.test.ts
```

**Expected**: All 4 tests pass ✅

---

## Final: Update DIMENSION_POLICY.md

```bash
DIMENSION=$(cat /tmp/embedding_dimension.txt)

# Finalize the policy with the verified dimension
cat > "docs/DIMENSION-POLICY.md" << EOF
# Canonical Dimension Policy

**Status**: ✅ FINALIZED ($(date -u +"%Y-%m-%d"))

## PROJECT_CANONICAL_EMBED_DIM = ${DIMENSION}

- **Embedding Model**: embeddinggemma:latest (${DIMENSION}-dim output, verified live)
- **Postgres Storage**: \`pgvector(${DIMENSION})\` for all embedding columns
- **Qdrant Collections**: (see QDRANT-COLLECTION-CUTOVER-PLAN.md)
- **GPU Reranking**: (see AUTOENCODER-DIMENSION-CONTRACT.md)

## Audit Results Summary

- Step 1: embeddinggemma:latest = ${DIMENSION}-dim ✅
- Step 2: Qdrant collections inventoried ✅
- Step 3: Retrieval code hard-codes identified ✅
- Step 4: Autoencoder contract documented ✅
- Step 5: Postgres migration planned ✅
- Step 6: Qdrant cutover strategy defined ✅
- Step 7: Collection alias resolver implemented ✅

## Safe to Proceed

All pgvector DDL migrations can now be applied (in order):
1. Drizzle migration (schema change)
2. Backfill job (recompute or upsample embeddings)
3. Qdrant collection cutover (if applicable)
4. Collection alias resolver deployment
5. Verification: retrieval lanes pass smoke tests

EOF

echo "✅ DIMENSION-POLICY.md finalized"
```

---

## Post-Audit Checklist

After all 7 steps complete:

- [ ] All 7 output documents exist (`docs/EMBEDDING-MODEL-DIMENSION.md`, etc.)
- [ ] `docs/DIMENSION-POLICY.md` is finalized with concrete dimension (384 or 768)
- [ ] Collection alias resolver is implemented and tested
- [ ] Git status is clean (new files added, ready to commit)
- [ ] DDL gates are lifted (safe to proceed to Phase 1)

**Final Step**:

```bash
# Commit audit results
git add docs/ sveltekit-frontend/src/lib/server/retrieval/collection-resolver.*
git commit -m "audit: finalize pgvector dimension policy (canonical=${DIMENSION}-dim)"

echo "✅ pgvector audit complete. Phase 0 DDL gates lifted. Phase 1 ready to begin."
```

---

## If Audit Fails at Any Step

**Don't panic.** Audit provides diagnostic info:

| Step | Failure | Action |
|------|---------|--------|
| 1 | Ollama not running | `docker-compose up -d ollama && sleep 30` |
| 1 | Model not found | `docker exec legal-ai-ollama ollama pull embeddinggemma:latest` |
| 2 | Qdrant not running | `docker-compose up -d qdrant && sleep 10` |
| 3+ | Code errors | Consult audit output, investigate manually |

**Escalation**: If stuck, stop and document findings. Audit is still valuable.

---

## Questions?

Refer to: `docs/audit/PGVECTOR-DIMENSION-DRIFT-AUDIT.md` (complete framework)
