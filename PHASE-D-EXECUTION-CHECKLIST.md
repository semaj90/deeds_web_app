# Phase D Execution Checklist

**Status**: READY TO EXECUTE  
**Start Date**: June 14, 2026  
**Total Time**: 1–3 hours  

---

## Pre-Flight Checks (10 min)

- [ ] Postgres running: `docker ps | grep postgres` → should show legal-ai-postgres
- [ ] Qdrant running: `docker ps | grep qdrant` → should show qdrant
- [ ] Ollama running: `curl http://localhost:11434/api/tags` → should return JSON
- [ ] Ollama has embeddinggemma:latest: `curl http://localhost:11434/api/tags | grep embeddinggemma` → should match
- [ ] Python installed: `python --version` → should be Python 3.8+
- [ ] Python deps installed: `pip install ollama psycopg2-binary qdrant-client` (or verify already installed)
- [ ] Current directory: `pwd` → should be repo root `/path/to/deeds-web-app`
- [ ] Read the execution guide: `cat docs/PHASE-D-EXECUTION-READY.md`

---

## Phase 1: Scope Audit (5 min)

**Command**:
```bash
npm run atlas:scope:whole
```

**What to Expect**:
- Output shows indexable file count
- Shows file classification (source_code, config, docs, etc.)
- Shows exclusion patterns (.git, node_modules, etc.)
- No database changes

**Success Criteria**:
- [ ] Command completes without error
- [ ] Shows corpus size (e.g., "Indexable: 5,000 files")
- [ ] No timeout errors

---

## Phase 2: Packets Dry-Run (10 min)

**Command**:
```bash
npm run atlas:packets:whole:dry
```

**What to Expect**:
- Shows simulated packet derivations
- Shows feature_id assignments
- Shows packet_key hashes
- NO database writes

**Success Criteria**:
- [ ] Command completes without error
- [ ] Shows derived packets (e.g., "Would derive: 2,000 packets")
- [ ] No actual upserts to database

---

## Phase 3: Packets Apply (15 min)

**Command**:
```bash
npm run atlas:packets:whole:apply
```

**What to Expect**:
- Upserts packets to atlas_packets table
- Shows progress (e.g., "Upserted 2,000 packets")
- Updates database (this is the first write operation)

**Success Criteria**:
- [ ] Command completes without error
- [ ] Shows upsert count (should be > 0)
- [ ] Verify in Postgres: `docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c "SELECT COUNT(*) FROM atlas_packets WHERE packet_universe='atlas';"`
- [ ] Count should match upserted count from script

---

## Phase 4: TurboVec Export (5 min)

**Command**:
```bash
npm run atlas:turbovec:export
```

**What to Expect**:
- Exports packets to JSONL format
- Creates `.opencode/ndjson/turbovec-corpus.jsonl`
- Each line is one JSON packet (text_for_embedding bounded to 8KB)

**Success Criteria**:
- [ ] Command completes without error
- [ ] File created: `ls -lh .opencode/ndjson/turbovec-corpus.jsonl`
- [ ] File size > 1MB (should be 10–50MB for 2,000 packets)
- [ ] Can read first line: `head -1 .opencode/ndjson/turbovec-corpus.jsonl | jq .`

---

## Phase 5: TurboVec Smoke Test (2 min)

**Command**:
```bash
npm run atlas:turbovec:smoke
```

**What to Expect**:
- Health check of TurboVec sidecar
- Query test with sample corpus
- Shows latency and status

**Success Criteria**:
- [ ] Command completes without error
- [ ] Shows "Health: OK" or similar status message
- [ ] Sample query returns results

**Note**: If TurboVec is not running, this is OK to skip for Phase D (it's optional for embedding).

---

## Phase 6A: Qdrant Sync Dry-Run (10 min)

**Command**:
```bash
npm run atlas:qdrant:whole-sync:dry
```

**What to Expect**:
- Shows simulated Qdrant upsert
- Shows payload contract (what fields will be sent)
- Shows stable IDs (hash-based, not sequential)
- NO Qdrant writes

**Success Criteria**:
- [ ] Command completes without error
- [ ] Shows simulated upsert count (should match Phase 3 count)
- [ ] Payload includes: packet_key, source_ref, feature_id, feature_label, packet_universe, domain_class, community_id, tags

---

## Phase 6B: Qdrant Sync Apply (10 min)

**Command**:
```bash
npm run atlas:qdrant:whole-sync:apply
```

**What to Expect**:
- Upserts packets to Qdrant codebase_chunks_768
- No embeddings yet (just the packet identity)
- Shows progress and count

**Success Criteria**:
- [ ] Command completes without error
- [ ] Shows upsert count (should match Phase 3)
- [ ] Verify in Qdrant: `curl http://localhost:6333/collections/codebase_chunks_768/points/count`
- [ ] Response should show `"count": <number>` matching upsert count

---

## Phase 7: Embedding (30 min–2 hours)

**Command**:
```bash
cd /path/to/deeds-web-app
python scripts/atlas/embed-parent-atlas-to-qdrant.py
```

**What to Expect**:
- Connects to Ollama
- Verifies embedding dimension (768-dim)
- Creates Qdrant collection (if not exists)
- Creates 8 payload indexes
- Fetches packets from Postgres
- Embeds in batches (32 per batch)
- Upserts to Qdrant
- Generates reports

**Success Criteria**:
- [ ] Output shows "✓ Embedding dimension verified: 768"
- [ ] Output shows collection creation or "already exists"
- [ ] Output shows all 8 indexes created (or "already exists")
- [ ] Output shows "Fetched X packets from Postgres" (X > 0)
- [ ] Output shows batch progress: "[Batch N/M] Embedding packets..."
- [ ] Output shows "✓ Upserted X points to Qdrant" for each batch
- [ ] Output shows final summary with coverage % (should be 100%)
- [ ] Output shows "✅ Parent Atlas embedding complete"
- [ ] Files created:
  - [ ] `docs/reports/parent-atlas-qdrant-embedding.json` (readable JSON)
  - [ ] `docs/reports/parent-atlas-qdrant-embedding.md` (readable Markdown)

**Typical Timings**:
- Dimension verification: 5 sec
- Collection creation: 2 sec
- Index creation: 10 sec
- Postgres fetch: 3 sec
- Embedding (2,000 packets @ 32/batch): ~1–2 sec per embedding × 2,000 = 30 min–2 hours (depends on Ollama GPU)
- Report generation: 2 sec

---

## Post-Execution Verification (10 min)

### 1. Check Qdrant Collection
```bash
curl http://localhost:6333/collections/codebase_chunks_768 | jq '.result | {name, points_count, vectors_count, status}'
```
**Expected Output**:
```json
{
  "name": "codebase_chunks_768",
  "points_count": 2009,
  "vectors_count": 2009,
  "status": "green"
}
```

### 2. Check Payload Schema
```bash
curl http://localhost:6333/collections/codebase_chunks_768 | jq '.result.payload_schema | keys'
```
**Expected Output**:
```json
["community_id", "domain_class", "feature_id", "feature_label", "metadata", "packet_key", "packet_universe", "source_ref", "tags"]
```

### 3. Sample Vector Search
```bash
python3 << 'EOF'
import ollama
import urllib.request
import json

# Get a test embedding
embedding = ollama.embeddings(host='http://localhost:11434', model='embeddinggemma:latest', prompt='authentication')['embedding']

# Search Qdrant
query = {
    "vector": embedding,
    "limit": 5,
    "with_payload": True
}

req = urllib.request.Request(
    'http://localhost:6333/collections/codebase_chunks_768/points/search',
    data=json.dumps(query).encode('utf-8'),
    headers={'Content-Type': 'application/json'},
    method='POST'
)

with urllib.request.urlopen(req) as response:
    result = json.load(response)
    print(f"Found {len(result['result'])} similar packets")
    for point in result['result'][:3]:
        print(f"  - {point['payload']['feature_label']} ({point['score']:.3f})")
EOF
```
**Expected Output**:
```
Found 5 similar packets
  - authentication.sessions (0.856)
  - authentication.guards (0.742)
  - session.management (0.681)
```

### 4. Check Reports
```bash
cat docs/reports/parent-atlas-qdrant-embedding.md
```
**Expected**: Human-readable report with configuration, coverage %, and next steps.

---

## Troubleshooting Reference

| Problem | Check | Solution |
|---------|-------|----------|
| Ollama connection error | `curl http://localhost:11434/api/tags` | Start Ollama: `ollama serve &` |
| Wrong embedding dimension | `curl ... \| grep embeddinggemma` | Pull correct model: `ollama pull embeddinggemma:latest` |
| Postgres connection error | `docker ps \| grep postgres` | Start Postgres: `docker-compose up -d` |
| Qdrant connection error | `curl http://localhost:6333/` | Start Qdrant: `docker-compose up -d` |
| 0 packets fetched | `docker exec legal-ai-postgres ... SELECT COUNT(*) FROM atlas_packets` | Run Phase 3 first |
| Timeout during embedding | Check GPU memory: `nvidia-smi` | Reduce BATCH_SIZE in script (line 44) to 16 |
| Embedding dimension mismatch | `curl ... \| grep embeddinggemma` | Must be exactly `embeddinggemma:latest` (768-dim) |

---

## Summary Sheet

| Phase | Command | Time | Output |
|-------|---------|------|--------|
| 1 | `npm run atlas:scope:whole` | 5 min | Corpus size |
| 2 | `npm run atlas:packets:whole:dry` | 10 min | Simulated upsert |
| 3 | `npm run atlas:packets:whole:apply` | 15 min | Packets → Postgres |
| 4 | `npm run atlas:turbovec:export` | 5 min | JSONL corpus |
| 5 | `npm run atlas:turbovec:smoke` | 2 min | Health check |
| 6A | `npm run atlas:qdrant:whole-sync:dry` | 10 min | Simulated Qdrant upsert |
| 6B | `npm run atlas:qdrant:whole-sync:apply` | 10 min | Packets → Qdrant (no embeddings) |
| 7 | `python scripts/atlas/embed-parent-atlas-to-qdrant.py` | 30 min–2 hours | Embeddings → Qdrant + reports |

**Total**: ~1–3 hours

---

## Quick Start (Copy-Paste)

```bash
# Go to repo root
cd /path/to/deeds-web-app

# Pre-flight
docker ps | grep postgres
docker ps | grep qdrant
curl http://localhost:11434/api/tags | grep embeddinggemma
pip install ollama psycopg2-binary qdrant-client

# Phase 1–6
npm run atlas:scope:whole
npm run atlas:packets:whole:dry
npm run atlas:packets:whole:apply
npm run atlas:turbovec:export
npm run atlas:turbovec:smoke
npm run atlas:qdrant:whole-sync:dry
npm run atlas:qdrant:whole-sync:apply

# Phase 7
python scripts/atlas/embed-parent-atlas-to-qdrant.py

# Verify
curl http://localhost:6333/collections/codebase_chunks_768 | jq '.result.points_count'
cat docs/reports/parent-atlas-qdrant-embedding.md
```

---

**Status**: Ready to execute. Check off each box as you complete each phase.

**Questions?** Refer to `docs/PHASE-D-EXECUTION-READY.md` for detailed walkthrough and troubleshooting.
