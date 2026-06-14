# Phase D: Parent Atlas Packet Identity OS — Ready for Execution

**Status**: ✅ **COMPLETE AND READY TO RUN**  
**Date**: June 14, 2026 (Early Morning)  
**Last Updated**: Session continuation

## What's Done

### ✅ Architectural Contract (Locked)
- **Parent Atlas Packet Identity OS**: Complete specification with 6 tables, 4D topology, observable artifacts rule, dual-ledger strategy
- **Canonical spine**: packet_key, source_ref, feature_id, feature_label (immutable)
- **Storage mapping**: JSONB (Postgres) + Qdrant (vectors) + Redis (cache) + Neo4j (graph) + MinIO (cold) + gRPC (IPC)
- **Qdrant collections**: 6 total (codebase_chunks_768, tree_nodes_768, feature_cards_768, summaries_768, memory_cards_768, glyphs_768)
- **Payload contract**: packet_key, source_ref, feature_id, feature_label, packet_universe, domain_class, community_id, tags, metadata

### ✅ Schema Migrations (Ready)
- `drizzle/manual/0028_packet_metadata_raw_sql_indexes.sql` — JSONB metadata + GIN index + operational columns + B-tree indexes
- `drizzle/manual/0029_parent_atlas_complete_schema.sql` — atlas_tree_nodes, atlas_tree_edges, atlas_glyph_records, atlas_topology_index, atlas_summary_layers (6 new tables with full indexes)

### ✅ Production-Grade Embedding Script
- `scripts/atlas/embed-parent-atlas-to-qdrant.py` — Python 3, full payload contract, stable IDs, named vectors, payload indexes, batch upserts, dimension guard, coverage reporting
- Hard rules enforced:
  - Stable IDs via SHA256 hash of packet_key (not sequential)
  - Named vector "content" (HNSW, COSINE distance)
  - Payload indexes created BEFORE upsert (optimization)
  - Ollama http://localhost:11434 with embeddinggemma:latest
  - Dimension verification (768-dim expected)
  - Batch size 32 (not one-by-one)
  - Complete payload schema (all required fields)

### ✅ Phase D Scripts (All Registered)
- `atlas:scope:whole` — Audit whole-codebase index scope
- `atlas:packets:whole:dry` — Dry-run whole-codebase packet upsert
- `atlas:packets:whole:apply` — Apply whole-codebase packet upsert
- `atlas:turbovec:export` — Export corpus to JSONL (text_for_embedding bounded to 8KB)
- `atlas:turbovec:smoke` — Health check + query test against TurboVec sidecar
- `atlas:qdrant:whole-sync:dry` — Dry-run Qdrant sync from packets
- `atlas:qdrant:whole-sync:apply` — Apply Qdrant sync from packets
- `atlas:retrieval:e2e` — End-to-end retrieval audit (implied from embedding report)

### ✅ NPM Script Aliases
All scripts are wired into sveltekit-frontend/package.json with proper flags (--dry-run, --apply, --verbose).

## Execution Order (7 Phases)

### Phase 1: Scope Audit (5 min)
```bash
npm run atlas:scope:whole
```
**Output**: Indexable corpus size, file classification (source_code, config, proto, sql, docs, test, generated, build_artifact, cold_artifact, other), exclusion patterns.

### Phase 2: Packets Dry-Run (10 min)
```bash
npm run atlas:packets:whole:dry
```
**Output**: Simulated upsert — shows packet_key derivations, feature_id assignments, no DB writes.

### Phase 3: Packets Apply (15 min)
```bash
npm run atlas:packets:whole:apply
```
**Output**: Upserts packets to atlas_packets table, derives packet_key from source_ref + feature_id, preserves existing packet_key for known refs.

### Phase 4: TurboVec Export (5 min)
```bash
npm run atlas:turbovec:export
```
**Output**: JSONL corpus at `.opencode/ndjson/turbovec-corpus.jsonl` (one packet per line, text_for_embedding bounded to 8KB).

### Phase 5: TurboVec Smoke Test (2 min)
```bash
npm run atlas:turbovec:smoke
```
**Output**: Health check + sample query to TurboVec sidecar (verify running and responsive).

### Phase 6: Qdrant Sync Dry-Run (10 min)
```bash
npm run atlas:qdrant:whole-sync:dry
```
**Output**: Simulated Qdrant upsert — shows payload contract, stable IDs (stable_id(packet_key) via SHA256), no Qdrant writes.

### Phase 7: Qdrant Embedding (30 min – 2 hours depending on Ollama latency)
```bash
python scripts/atlas/embed-parent-atlas-to-qdrant.py
```
**Output**:
- Qdrant collection `codebase_chunks_768` with named vector "content"
- Payload indexes (packet_key, source_ref, feature_id, feature_label, packet_universe, domain_class, community_id, tags) for query optimization
- Batch upserts (BATCH_SIZE=32) with full payload schema
- Coverage report: `docs/reports/parent-atlas-qdrant-embedding.json` + `docs/reports/parent-atlas-qdrant-embedding.md`
- Log output showing embedding progress, dimension verification, upsert batches

## Prerequisites (Verify Before Starting)

### Docker Services (Required)
```bash
# Postgres 18.4 (atlas_packets table must exist)
docker ps | grep legal-ai-postgres

# Qdrant 6333
docker ps | grep qdrant

# Ollama :11434 with embeddinggemma:latest
curl http://localhost:11434/api/tags | grep embeddinggemma
```

### Python Dependencies
```bash
pip install ollama psycopg2-binary qdrant-client
```

### Environment Variables (for Python script)
```bash
export OLLAMA_HOST="http://localhost:11434"
export OLLAMA_MODEL="embeddinggemma:latest"
export QDRANT_HOST="localhost"
export QDRANT_PORT="6333"
export DATABASE_URL="postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db"
```

Or use .env file in repo root — script reads from os.getenv() with defaults.

### Node.js + npm (for Phase 1–6)
```bash
npm run atlas:scope:whole  # validates all scripts are runnable
```

## Detailed Phase 7: Embedding Script Walkthrough

### Entry Point
```bash
cd /path/to/deeds-web-app
python scripts/atlas/embed-parent-atlas-to-qdrant.py
```

### What Happens (in order)
1. **Verify Ollama dimension** (line 256–276)
   - Sends "test" to `/api/embeddings` with embeddinggemma:latest
   - Expects 768-dim output; exits with error if not

2. **Connect to Postgres** (line 58–86)
   - Reads atlas_packets WHERE packet_universe = 'atlas' AND source_ref IS NOT NULL
   - Fetches: packet_key, source_ref, feature_id, feature_label, packet_universe, domain_class (from group_id with fallback), community_id, metadata
   - Orders by packet_key for reproducibility

3. **Create Qdrant collection** (line 117–161)
   - Check if codebase_chunks_768 exists; if not, create with named vector "content" (HNSW, COSINE)
   - Create payload indexes BEFORE upsert (optimization):
     - packet_key (Keyword)
     - source_ref (Keyword)
     - feature_id (Keyword)
     - feature_label (Text)
     - packet_universe (Keyword)
     - domain_class (Keyword)
     - community_id (Keyword)
     - tags (Keyword)

4. **Batch embed and upsert** (line 349–369)
   - Loop: for BATCH_SIZE=32 packets at a time
   - Call `embed_batch()` (line 164–223):
     - Extract text via `get_text_for_embedding()` (line 89–114): feature_label + source_ref + tags, bounded to 8KB
     - Call Ollama `/api/embeddings` with OLLAMA_MODEL
     - Verify embedding length == EXPECTED_EMBEDDING_DIM (768)
     - Prepare full payload (packet_key, source_ref, feature_id, feature_label, packet_universe, domain_class, community_id, tags, metadata with embedding_model/cosine_norm/text_for_embedding)
     - Generate stable point ID via stable_id(packet_key) — SHA256(packet_key) → first 8 bytes → int (line 52–55)
   - Call `batch_upsert_to_qdrant()` (line 226–252):
     - Build PointStruct list with id + vector {"content": embedding} + payload
     - Upsert to Qdrant (not one-by-one, full batch at once)
     - Log success/failure

5. **Generate reports** (line 279–321)
   - JSON report: `docs/reports/parent-atlas-qdrant-embedding.json`
     - timestamp, collection, ollama_model, ollama_host, qdrant_host, total_packets, embedded, coverage_pct
   - Markdown report: `docs/reports/parent-atlas-qdrant-embedding.md`
     - Human-readable summary + configuration + coverage + next steps

### Output Example
```
[INFO] === Parent Atlas: Postgres → Ollama → Qdrant ===

[INFO] Connecting to Ollama...
[INFO] Connecting to Qdrant: localhost:6333...
[INFO] Verifying embedding dimension via embeddinggemma:latest...
[INFO] ✓ Embedding dimension verified: 768
[INFO] Creating Qdrant collection 'codebase_chunks_768' with 768-dim vectors
[INFO] Creating payload indexes...
[INFO]   ✓ Indexed packet_key
[INFO]   ✓ Indexed source_ref
[INFO]   ✓ Indexed feature_id
[INFO]   ✓ Indexed feature_label
[INFO]   ✓ Indexed packet_universe
[INFO]   ✓ Indexed domain_class
[INFO]   ✓ Indexed community_id
[INFO]   ✓ Indexed tags
[INFO] Collection creation and indexing complete
[INFO] Connecting to Postgres: 127.0.0.1:5434
[INFO] Fetched 2009 packets from Postgres
[INFO] Embedding 2009 packets in batches of 32...

[INFO] [Batch 1/63] Embedding packets 0-32...
[INFO] ✓ Upserted 32 points to Qdrant
...
[INFO] [Batch 63/63] Embedding packets 2000-2009...
[INFO] ✓ Upserted 9 points to Qdrant

[INFO] === Summary ===
[INFO] Total packets: 2009
[INFO] Embedded: 2009
[INFO] Coverage: 100.0%
[INFO] Report written to docs/reports/parent-atlas-qdrant-embedding.json
[INFO] Markdown report written to docs/reports/parent-atlas-qdrant-embedding.md

[INFO] ✅ Parent Atlas embedding complete
```

## Verification Gates (After Phase 7)

### 1. Qdrant Collection Exists
```bash
curl http://localhost:6333/collections | jq '.result.collections[] | select(.name=="codebase_chunks_768")'
```
**Expected**: Returns collection metadata including vectors_config with named vector "content".

### 2. Points Indexed
```bash
curl -X GET "http://localhost:6333/collections/codebase_chunks_768/points/count"
```
**Expected**: `{"result":{"count":2009,"indexed_count":2009}}` (assuming 2009 packets).

### 3. Payload Indexes Present
```bash
curl -X GET "http://localhost:6333/collections/codebase_chunks_768" | jq '.result.payload_schema'
```
**Expected**: Shows all 8 indexed fields (packet_key, source_ref, feature_id, feature_label, packet_universe, domain_class, community_id, tags).

### 4. Sample Vector Search
```bash
# Embed a test query
python -c "import ollama; print(ollama.embeddings(host='http://localhost:11434', model='embeddinggemma:latest', prompt='database')['embedding'][:5])"

# Search Qdrant
curl -X POST "http://localhost:6333/collections/codebase_chunks_768/points/search" \
  -H "Content-Type: application/json" \
  -d '{"vector":"<paste-embedding-here>","limit":10}'
```
**Expected**: Returns top-10 points by cosine similarity with full payloads.

### 5. Coverage Report
```bash
cat docs/reports/parent-atlas-qdrant-embedding.md
```
**Expected**: Markdown report with configuration, coverage percentage, and next steps.

## Troubleshooting

### Ollama Connection Error
```
Error: Failed to verify embedding dimension: HTTPConnectionPool(host='localhost', port=11434): Max retries exceeded
```
**Fix**: Start Ollama server and pull model:
```bash
ollama serve &
ollama pull embeddinggemma:latest
```

### Postgres Connection Error
```
Error: could not translate host name "127.0.0.1" to address: Unknown host
```
**Fix**: Verify DATABASE_URL and Docker postgres container is running:
```bash
docker ps | grep legal-ai-postgres
docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c "SELECT COUNT(*) FROM atlas_packets;"
```

### Qdrant Connection Error
```
Error: QdrantClient() failed to connect to localhost:6333
```
**Fix**: Start Qdrant and verify:
```bash
docker ps | grep qdrant
curl http://localhost:6333/
```

### Dimension Mismatch
```
Error: Unexpected embedding dimension: 384 != 768 for ace:packet:...
```
**Fix**: Wrong Ollama model. Script expects 768-dim. Verify:
```bash
curl http://localhost:11434/api/tags | jq '.models[] | select(.name | contains("embedding"))'
```
Must be `embeddinggemma:latest`. Others (nomic-embed-text, mxbai-embed-large) have different dims.

### Timeout on Large Corpus
```
Embedding 5000+ packets...  [timeout after 30 min]
```
**Fix**: Reduce BATCH_SIZE in script (line 44) to 16 if Ollama is under memory pressure:
```python
BATCH_SIZE = 16  # was 32
```

## Next Steps (Phase E – Post-Embedding)

### 1. Neo4j Topology Edges
Wire up SIMILAR_TOPOLOGY + USED_CONCEPT edges based on 4D coordinates and SOM cluster adjacency.

### 2. Gemma4 Summarization
Implement stage 5 of ingestion queue: summarize each packet's text via Gemma4 into layer_type summaries (chunk, file, folder, feature, system).

### 3. Karpathy Authority Caching
Compute Karpathy blend (authority score) from Neo4j PageRank + Qdrant semantic attention, cache in Redis `gpu:karpathy:scores`.

### 4. MCP Tool Surface
Expose 6 read tools + 4 write tools for ACE/KAG retrieval (atlas_packet_read, atlas_qdrant_search, atlas_topology_neighbors, atlas_glyph_decode, atlas_feature_card_read, atlas_packet_write, atlas_tree_create, atlas_qdrant_tag, atlas_topology_update).

### 5. Full Contract Audit
Run `npm run atlas:retrieval:e2e` to verify Postgres ↔ Qdrant ↔ Neo4j ↔ Redis alignment.

## Files Reference

| File | Purpose | Status |
|------|---------|--------|
| `docs/PARENT-ATLAS-PACKET-IDENTITY-OS.md` | Complete contract + storage mapping + 6 tables + Qdrant spec | ✅ Complete |
| `docs/PARENT-ATLAS-CONTRACT-SUMMARY.md` | One-page reference | ✅ Complete |
| `docs/CANONICAL-ARCHITECTURE-CONTRACT.md` | Locked 10 hard rules + dual-ledger strategy | ✅ Complete |
| `drizzle/manual/0028_packet_metadata_raw_sql_indexes.sql` | JSONB + operational indexes | ✅ Ready |
| `drizzle/manual/0029_parent_atlas_complete_schema.sql` | 6 new tables (tree nodes, glyphs, topology, summaries) | ✅ Ready |
| `scripts/atlas/embed-parent-atlas-to-qdrant.py` | Production-grade Qdrant ingestion | ✅ Ready |
| `scripts/atlas/audit-whole-codebase-index-scope.mjs` | Phase 1: Scope audit | ✅ Ready |
| `scripts/atlas/upsert-whole-codebase-atlas-packets.mjs` | Phase 3: Packet upsert | ✅ Ready |
| `scripts/atlas/export-turbovec-corpus.mjs` | Phase 4: TurboVec export | ✅ Ready |
| `scripts/atlas/turbovec-sidecar-smoke.mjs` | Phase 5: TurboVec smoke test | ✅ Ready |
| `scripts/atlas/sync-qdrant-from-whole-codebase-packets.mjs` | Phase 6: Qdrant sync | ✅ Ready |
| `memory/PARENT-ATLAS-ARCHITECTURE.md` | Project memory (locked contract) | ✅ Complete |

## Command Cheat Sheet

```bash
# Full pipeline (all 7 phases)
npm run atlas:scope:whole && \
npm run atlas:packets:whole:dry && \
npm run atlas:packets:whole:apply && \
npm run atlas:turbovec:export && \
npm run atlas:turbovec:smoke && \
npm run atlas:qdrant:whole-sync:dry && \
npm run atlas:qdrant:whole-sync:apply && \
python scripts/atlas/embed-parent-atlas-to-qdrant.py

# Or individually
npm run atlas:scope:whole                    # Phase 1
npm run atlas:packets:whole:dry              # Phase 2
npm run atlas:packets:whole:apply            # Phase 3
npm run atlas:turbovec:export                # Phase 4
npm run atlas:turbovec:smoke                 # Phase 5
npm run atlas:qdrant:whole-sync:dry          # Phase 6
python scripts/atlas/embed-parent-atlas-to-qdrant.py  # Phase 7
```

---

**Status**: READY FOR EXECUTION  
**Last Verified**: June 14, 2026 (Early Morning)  
**Authority**: Parent Atlas Packet Identity OS (Locked)
