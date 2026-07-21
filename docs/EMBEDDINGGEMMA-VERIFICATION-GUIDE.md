# EmbeddingGemma Verification & Testing Guide

**Purpose**: Practical commands to verify, test, and compare all embeddinggemma variants and dimensions.

**Date**: July 20, 2026

---

## Quick Verification (Step 1 of pgvector Audit)

### One-Line Dimension Check

```bash
# Quick check: what dimension does embeddinggemma:latest output?
curl -s http://127.0.0.1:11434/api/embeddings \
  -d '{"model":"embeddinggemma:latest","prompt":"test"}' \
  | jq '.embedding | length'
```

**Expected Output**: `384` or `768`

**If command fails**:
```bash
# Check if Ollama is running
curl -s http://127.0.0.1:11434/api/tags | jq '.models[] | {name, size}'

# Or check process
ps aux | grep ollama
docker ps | grep ollama
```

---

## Full Dimension Verification

### Verify Multiple Test Strings

```bash
# Test 1: Single word
curl -s http://127.0.0.1:11434/api/embeddings \
  -d '{"model":"embeddinggemma:latest","prompt":"legal"}' \
  | jq '{dim: (.embedding | length), first_5: .embedding[0:5], last_5: .embedding[-5:]}'

# Test 2: Sentence
curl -s http://127.0.0.1:11434/api/embeddings \
  -d '{"model":"embeddinggemma:latest","prompt":"What is the canonical embedding dimension?"}' \
  | jq '{dim: (.embedding | length), mean: (.embedding | add / length)}'

# Test 3: Legal text
curl -s http://127.0.0.1:11434/api/embeddings \
  -d '{"model":"embeddinggemma:latest","prompt":"The plaintiff hereby submits this motion in support of the claim."}' \
  | jq '.embedding | length'

# Test 4: Long document
LONG_TEXT="Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation."
curl -s http://127.0.0.1:11434/api/embeddings \
  -d "{\"model\":\"embeddinggemma:latest\",\"prompt\":\"$LONG_TEXT\"}" \
  | jq '{dim: (.embedding | length), variance: (.embedding as $e | (($e | map(. * .) | add) / ($e | length)) - (($e | add) / ($e | length) | . * .))}'
```

---

## Variant Testing

### Test All Available Variants

```bash
# List all available embedding models
curl -s http://127.0.0.1:11434/api/tags | jq '.models[] | select(.name | startswith("embedding")) | {name, size}'

# Expected output:
# {
#   "name": "embeddinggemma:latest",
#   "size": 1300000000
# }
```

### Test Multiple Variants in Sequence

```bash
#!/bin/bash

# Array of models to test
MODELS=("embeddinggemma:latest" "nomic-embed-text:latest" "all-minilm:22-v2")

TEST_TEXT="legal document embedding test"

for MODEL in "${MODELS[@]}"; do
  echo "Testing model: $MODEL"
  
  DIM=$(curl -s http://127.0.0.1:11434/api/embeddings \
    -d "{\"model\":\"$MODEL\",\"prompt\":\"$TEST_TEXT\"}" \
    | jq '.embedding | length')
  
  echo "  Dimension: $DIM"
  
  # Also measure latency
  START=$(date +%s%N)
  curl -s http://127.0.0.1:11434/api/embeddings \
    -d "{\"model\":\"$MODEL\",\"prompt\":\"$TEST_TEXT\"}" > /dev/null
  END=$(date +%s%N)
  LATENCY_MS=$(( (END - START) / 1000000 ))
  
  echo "  Latency: ${LATENCY_MS}ms"
  echo "---"
done
```

---

## Dimension Consistency Checks

### Verify Embedding Service Config

```bash
# Check what dimension the Node.js embedding service expects
curl -s http://127.0.0.1:5173/api/embed?q=test | jq '{dimension, model, cached}'

# Expected if using embeddinggemma:latest with target_dim=768:
# {
#   "dimension": 768,
#   "model": "embeddinggemma:latest",
#   "cached": false
# }

# But if embeddinggemma actually outputs 384, this will be wrong!
```

### Check Postgres Schema Dimensions

```bash
# Connect to Postgres and check vector column types
docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db <<EOF
-- Find all vector columns and their dimensions
SELECT 
  table_name, 
  column_name, 
  data_type,
  CASE 
    WHEN data_type LIKE 'vector%' THEN SUBSTRING(data_type FROM 8 FOR 3)
    ELSE NULL 
  END as dimension
FROM information_schema.columns 
WHERE data_type LIKE 'vector%'
ORDER BY table_name, dimension DESC;
EOF

# Expected output (showing dimension drift):
# table_name                | column_name      | data_type    | dimension
# --------------------------|------------------|--------------|----------
# atlas_packets             | embedding        | vector(768)  | 768
# codebase_chunk_index      | content_embedding| vector(384)  | 384
# (etc.)
```

### Check Qdrant Collection Dimensions

```bash
# Query Qdrant for all collections and their vector dimensions
curl -s http://127.0.0.1:6333/collections \
  | jq '.result.collections[] | {name, vector_size: .config.params.vectors.size, points_count: .points_count}'

# Expected output:
# {
#   "name": "codebase_chunks_768",
#   "vector_size": 768,
#   "points_count": 40568
# }
```

---

## Embedding Comparison Test

### Compare Embeddings Across Variants

```bash
# Test if different models produce similar embeddings for the same text
TEST_QUERY="legal discovery motion"

echo "Embedding comparison for: $TEST_QUERY"
echo "---"

# EmbeddingGemma
echo "EmbeddingGemma:"
GEMMA=$(curl -s http://127.0.0.1:11434/api/embeddings \
  -d "{\"model\":\"embeddinggemma:latest\",\"prompt\":\"$TEST_QUERY\"}" \
  | jq '.embedding')
echo "  Dimension: $(echo $GEMMA | jq 'length')"
echo "  Norm: $(echo $GEMMA | jq 'map(. * .) | add | sqrt')"

# Nomic Embed Text
echo "Nomic Embed Text:"
NOMIC=$(curl -s http://127.0.0.1:11434/api/embeddings \
  -d "{\"model\":\"nomic-embed-text:latest\",\"prompt\":\"$TEST_QUERY\"}" \
  | jq '.embedding')
echo "  Dimension: $(echo $NOMIC | jq 'length')"
echo "  Norm: $(echo $NOMIC | jq 'map(. * .) | add | sqrt')"

# Cosine similarity (if same dimensions)
# This requires a small Python/jq script to compute dot product
```

---

## Latency & Performance Benchmarks

### Benchmark EmbeddingGemma Performance

```bash
#!/bin/bash

MODEL="embeddinggemma:latest"
NUM_RUNS=10

echo "Benchmarking $MODEL ($NUM_RUNS runs)"
echo "---"

# Warm up
curl -s http://127.0.0.1:11434/api/embeddings \
  -d "{\"model\":\"$MODEL\",\"prompt\":\"warmup\"}" > /dev/null

# Run benchmark
LATENCIES=()
for i in $(seq 1 $NUM_RUNS); do
  START=$(date +%s%N)
  
  curl -s http://127.0.0.1:11434/api/embeddings \
    -d "{\"model\":\"$MODEL\",\"prompt\":\"test query number $i\"}" > /dev/null
  
  END=$(date +%s%N)
  LATENCY_MS=$(( (END - START) / 1000000 ))
  LATENCIES+=($LATENCY_MS)
  
  echo "Run $i: ${LATENCY_MS}ms"
done

# Calculate stats
MIN="${LATENCIES[0]}"
MAX="${LATENCIES[0]}"
SUM=0

for L in "${LATENCIES[@]}"; do
  SUM=$((SUM + L))
  [[ $L -lt $MIN ]] && MIN=$L
  [[ $L -gt $MAX ]] && MAX=$L
done

AVG=$((SUM / NUM_RUNS))
echo "---"
echo "Average: ${AVG}ms"
echo "Min: ${MIN}ms"
echo "Max: ${MAX}ms"
echo "Range: $((MAX - MIN))ms"
```

---

## Integration Testing

### Test Embedding Service Full Stack

```bash
# Test 1: Embed via Node.js API (with caching)
echo "Test 1: Node.js embedding API"
curl -s -X POST http://127.0.0.1:5173/api/embed \
  -H "Content-Type: application/json" \
  -d '{"query":"legal test","target_dim":768}' \
  | jq '{status: .error ? "ERROR" : "OK", dimension: .dimension, cached: .cached, model: .model}'

# Test 2: Verify Postgres can store returned embedding
echo ""
echo "Test 2: Verify embedding dimension matches Postgres schema"
# After embedding, attempt to INSERT into vector(768) column
# If actual dimension is 384, this should fail with dimension mismatch

# Test 3: Verify Qdrant accepts the embedding
echo ""
echo "Test 3: Verify Qdrant accepts embedding"
# Query Qdrant to see if it rejects wrong-dimension vectors
```

---

## Scenario: Dimension Mismatch Detection

### If Actual != Expected

```bash
# Scenario 1: embeddinggemma outputs 384, but code expects 768
# Expected result: Qdrant rejects on INSERT, Postgres fails on type cast

# Test this:
curl -s http://127.0.0.1:11434/api/embeddings \
  -d '{"model":"embeddinggemma:latest","prompt":"test"}' \
  | jq '.embedding | length' > /tmp/actual_dim.txt

# Compare to schema
docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db \
  -c "SELECT column_name, data_type FROM information_schema.columns WHERE table_name='codebase_chunk_index' AND column_name='content_embedding';" \
  | grep vector

# If mismatch is detected:
echo "MISMATCH DETECTED!"
echo "  Actual dimension: $(cat /tmp/actual_dim.txt)"
echo "  Expected by schema: 768"
echo "  Action: Trigger pgvector audit Step 5 (schema migration)"
```

---

## Recovery: If Dimension Mismatch Found

### Automated Recovery Procedure

```bash
#!/bin/bash

echo "=== EMBEDDINGGEMMA DIMENSION MISMATCH RECOVERY ==="

# Step 1: Verify the actual dimension
ACTUAL_DIM=$(curl -s http://127.0.0.1:11434/api/embeddings \
  -d '{"model":"embeddinggemma:latest","prompt":"test"}' \
  | jq '.embedding | length')

echo "Actual dimension: $ACTUAL_DIM"

# Step 2: Check schema declarations
SCHEMA_DIMS=$(docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db \
  -c "SELECT DISTINCT substring(data_type FROM 8 FOR 3) as dim FROM information_schema.columns WHERE data_type LIKE 'vector%' ORDER BY dim;" \
  -t | tr '\n' ' ')

echo "Schema dimensions: $SCHEMA_DIMS"

# Step 3: Determine action
if [[ "$ACTUAL_DIM" == "384" && "$SCHEMA_DIMS" == *"768"* ]]; then
  echo "MISMATCH: Model is 384-dim, schema has 768-dim tables"
  echo "ACTION: Execute pgvector audit Step 5 (migrate schema to 384)"
elif [[ "$ACTUAL_DIM" == "768" && "$SCHEMA_DIMS" == *"384"* ]]; then
  echo "MISMATCH: Model is 768-dim, schema has 384-dim tables"
  echo "ACTION: Execute pgvector audit Step 5 (migrate schema to 768)"
else
  echo "✅ OK: Dimension is consistent"
fi
```

---

## Documentation: Running Verification

### For the Operator (First Time)

1. **Run Step 1 dimension check** (above)
2. **Document the result** in `docs/EMBEDDING-MODEL-DIMENSION.md`:
   ```markdown
   # EmbeddingGemma:latest Dimension Verification

   **Date**: July 20, 2026  
   **Result**: 384 or 768 (your measurement)
   **Command**: curl -s http://127.0.0.1:11434/api/embeddings ...
   **Output**: 384 or 768
   ```

3. **Unblock pgvector audit Steps 2-7** by documenting result

### For Continuous Testing

Use the benchmark and comparison scripts above in CI/CD pipelines to:
- Detect silent model changes (dimension shifts over time)
- Monitor latency degradation
- Verify consistency across different variant tags
- Catch Postgres/Qdrant schema mismatches early

---

## Critical Rules

- ✅ Always verify actual dimension via HTTP, not via assumptions
- ✅ Compare actual vs schema-expected immediately
- ✅ Document any mismatch with the exact command output
- ❌ Do NOT assume "latest" tag matches old schema
- ❌ Do NOT truncate or pad embeddings (lossy)
- ❌ Do NOT mix dimensions in same operation

---

## See Also

- `docs/EMBEDDINGGEMMA-VARIANTS-INVENTORY.md` — Complete model inventory
- `docs/audit/PGVECTOR-DIMENSION-DRIFT-AUDIT.md` — 7-step audit framework
- `docs/PHASE-0-DDL-GATE.md` — Why this is a blocker
