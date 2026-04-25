# Phase 89: Redis & Qdrant Namespace Diagnostic

**Purpose**: Verify FastAPI and Node.js scripts use the same Redis/Qdrant namespaces

---

## 🔍 Current Configuration Analysis

### Node.js Scripts

#### 1. **phase89-robust-reembed.mjs** (Re-embedding)
- **Redis Prefix**: `emb:gemma:${hash}`
- **Purpose**: Cache embeddings by SHA256 hash of error text
- **TTL**: 604,800 seconds (7 days)
- **Example Key**: `emb:gemma:a3f2e1d9c4b7`

#### 2. **phase89-cuda-rag-pipeline.mjs** (RAG Pipeline)
- **Qdrant Collection**: `phase89_error_chunks`
- **Purpose**: Store file chunks for semantic search
- **Dimension**: 768 (embeddinggemma)
- **Status**: ⚠️ **NOT YET BUILT** (need to run `--build`)

#### 3. **phase89-similarity-ranker.mjs** (Query Interface)
- **Redis Prefix**: Likely `query:*` for cached results
- **Postgres**: Reads from `raw_error_embeddings` table
- **Top-K Index**: Reads from `error_topk_index` table

---

### FastAPI Server (phase89-fastapi-server.py)

**Configuration Needed**:
```python
# Check these environment variables
REDIS_URL = os.getenv("REDIS_URL", "redis://127.0.0.1:6379")
QDRANT_URL = os.getenv("QDRANT_URL", "http://127.0.0.1:6333")

# Redis key prefixes (MUST MATCH NODE)
EMBEDDING_PREFIX = "emb:gemma:"  # ✅ Should match Node
QUERY_PREFIX = "query:"          # ✅ Should match Node
PHASE89_PREFIX = "phase89:"      # ⚠️ Check if used

# Qdrant collection (MUST MATCH NODE)
QDRANT_COLLECTION = "phase89_error_chunks"  # ✅ Should match Node

# Redis DB number (default: 0)
REDIS_DB = 0  # ✅ Both should use same DB
```

---

## 🚨 Why FastAPI Shows 0 Results

### Diagnosis

```powershell
# FastAPI health check shows connections OK
curl http://localhost:8765/health
# Returns: Redis True, Qdrant True ✅

# But stats show no data
curl http://localhost:8765/stats
# Returns: Redis keys 0, Qdrant points 0 ❌
```

### Possible Root Causes

#### Cause 1: Different Redis DB Numbers
```python
# Node uses DB 0 (default)
redis://127.0.0.1:6379

# FastAPI might use DB 1
redis://127.0.0.1:6379/1  # ← Wrong DB!
```

**Fix**: Ensure both use `redis://127.0.0.1:6379/0` or just `redis://127.0.0.1:6379`

#### Cause 2: Different Key Prefixes
```python
# Node uses: emb:gemma:*
# FastAPI queries: phase89:*  # ← Wrong prefix!
```

**Fix**: FastAPI should query `emb:gemma:*` for embeddings

#### Cause 3: Qdrant Collection Not Built
```bash
# Node script defines: phase89_error_chunks
# But you haven't run --build yet!
```

**Fix**: Run `node scripts/phase89-cuda-rag-pipeline.mjs --build`

#### Cause 4: Different Qdrant Collection Name
```python
# Node uses: phase89_error_chunks
# FastAPI queries: error_chunks  # ← Missing prefix!
```

**Fix**: Ensure FastAPI uses exact collection name: `phase89_error_chunks`

---

## ✅ Verification Commands

### Check Redis Keys (Node Side)

```powershell
# Count embedding cache keys
docker exec phase66-redis redis-cli --scan --pattern "emb:gemma:*" | Measure-Object -Line

# Expected: ~800 keys (from re-embedding progress)
```

### Check Redis Keys (FastAPI Side)

```powershell
# What prefixes does FastAPI look for?
# Check FastAPI source code or environment variables

# If FastAPI queries "phase89:*" instead of "emb:gemma:*":
docker exec phase66-redis redis-cli --scan --pattern "phase89:*" | Measure-Object -Line
# Expected: 0 (this prefix isn't used!)
```

### Check Qdrant Collection

```powershell
# List all collections
curl http://localhost:6333/collections | ConvertFrom-Json |
  Select-Object -ExpandProperty result |
  Select-Object -ExpandProperty collections |
  Select-Object name

# Expected output:
# phase76_knowledge_base  ← Exists (810 points)
# phase89_error_chunks    ← Does NOT exist yet!
```

### Check Redis DB Number

```powershell
# Check what DB Node uses (default: 0)
docker exec phase66-redis redis-cli INFO keyspace

# Expected output:
# db0:keys=800,expires=800,avg_ttl=604123456

# If FastAPI uses DB 1:
docker exec phase66-redis redis-cli -n 1 DBSIZE
# Expected: 0 (wrong DB!)
```

---

## 🔧 Fix Instructions

### Fix 1: Update FastAPI to Match Node Prefixes

**File**: `scripts/phase89-fastapi-server.py`

```python
# Ensure these match Node.js configuration
REDIS_KEY_PREFIXES = {
    "embedding": "emb:gemma:",    # ✅ Match Node
    "query": "query:",             # ✅ Match Node (if used)
    "metadata": "meta:"            # ✅ Match Node (if used)
}

QDRANT_COLLECTION = "phase89_error_chunks"  # ✅ Match Node

# Redis connection (ensure DB 0)
redis_client = redis.from_url(
    REDIS_URL,
    decode_responses=False,
    db=0  # ✅ Explicit DB 0
)
```

### Fix 2: Build Qdrant Collection

```powershell
# Create the phase89_error_chunks collection
cd sveltekit-frontend
node scripts/phase89-cuda-rag-pipeline.mjs --build 2>&1 | Tee-Object -FilePath reports\phase89-build.log

# Monitor progress
Get-Content reports\phase89-build.log -Tail 20 -Wait
```

**Expected**: 10,000-20,000 chunks indexed from 4,674 source files

### Fix 3: Verify Alignment

```powershell
# After build completes, check stats
curl http://localhost:8765/stats | ConvertFrom-Json

# Expected output:
{
  "redis": {
    "connected": true,
    "keys": 800,           # ✅ From embeddings
    "embeddings": 800      # ✅ Cached embeddings
  },
  "qdrant": {
    "connected": true,
    "collections": 1,
    "points": 15000        # ✅ From file chunks
  }
}
```

---

## 📊 Expected vs. Actual State

### Current State (Broken)

| Component | Node.js | FastAPI | Status |
|-----------|---------|---------|--------|
| Redis Keys | `emb:gemma:*` (800) | Queries `phase89:*` (0) | ❌ Mismatch |
| Qdrant Collection | `phase89_error_chunks` (not built) | Queries `phase89_error_chunks` (0) | ⚠️ Empty |
| Redis DB | 0 (default) | 1 (maybe?) | ❌ Mismatch |

### Target State (Fixed)

| Component | Node.js | FastAPI | Status |
|-----------|---------|---------|--------|
| Redis Keys | `emb:gemma:*` (800) | Queries `emb:gemma:*` (800) | ✅ Match |
| Qdrant Collection | `phase89_error_chunks` (15,000) | Queries `phase89_error_chunks` (15,000) | ✅ Match |
| Redis DB | 0 (default) | 0 (explicit) | ✅ Match |

---

## 🧪 Testing After Fix

### Test 1: Redis Embedding Lookup

```powershell
# FastAPI should find cached embeddings
curl -X POST http://localhost:8765/embed `
  -H "Content-Type: application/json" `
  -d '{"text":"error TS1005: semicolon expected"}'

# Expected: {"cached":true, "vector":[0.123, ...]}
```

### Test 2: Qdrant Query

```powershell
# FastAPI should return semantic search results
curl -X POST http://localhost:8765/query/stream `
  -H "Content-Type: application/json" `
  -d '{"query":"TS1005"}' `
  --no-buffer

# Expected: SSE stream with chunks from phase89_error_chunks
```

### Test 3: Stats Endpoint

```powershell
curl http://localhost:8765/stats | ConvertFrom-Json

# Expected non-zero values:
{
  "redis": {"keys": 800, "embeddings": 800},
  "qdrant": {"points": 15000}
}
```

---

## ✅ Checklist

### Before Fix
- [ ] Check Redis key prefixes in Node scripts
- [ ] Check Redis key prefixes in FastAPI
- [ ] Check Qdrant collection names match
- [ ] Check Redis DB numbers match
- [ ] Verify `phase89_error_chunks` collection exists

### After Fix
- [ ] Redis prefixes aligned (`emb:gemma:*`)
- [ ] Qdrant collection built (`phase89_error_chunks`)
- [ ] Redis DB 0 used by both
- [ ] Stats endpoint shows non-zero values
- [ ] Query endpoint returns results

---

## 🔑 Key Insight

**The Problem**: FastAPI and Node.js are talking to the same Redis/Qdrant servers, but looking in different namespaces!

**The Solution**:
1. Align Redis key prefixes: `emb:gemma:*`
2. Build Qdrant collection: `phase89_error_chunks`
3. Use same Redis DB: `0`

**Time to Fix**: ~5 minutes config + 2-3 hours for Qdrant build
