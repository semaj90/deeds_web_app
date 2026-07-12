# Graphify Stage 0–7 Execution Index

**Purpose**: Canonical feature alignment pipeline following strict dependency order.

**Canonical Pipeline**:
1. **Stage 0**: Identity verification (packet_key, source_ref, content_hash, tree_node_id)
2. **Stage 1**: Structural extraction (AST symbols via ast-grep, TypeScript Compiler)
3. **Stage 2**: Lexical extraction (BM25 terms, deterministic)
4. **Stage 3**: Semantic layer (Gemma4, grounded to AST facts)
5. **Stage 4**: Feature envelope (unified JSONB, canonical form)
6. **Stage 5**: Named embeddings (4 lanes after envelope stable)
7. **Stage 6**: Topology (SOM, KMeans, PageRank, communities)
8. **Stage 7**: Classifier (XGBoost on full feature matrix)

---

## Stage 0: Identity Verification

**File**: `stages/stage0-identity-verify.mjs`

**Purpose**: Verify canonical identity layer is 100% locked (packet_key, source_ref, content_hash).

**Command**:
```bash
node scripts/graphify/stages/stage0-identity-verify.mjs
```

**Exit Codes**:
- 0: Identity 100% verified ✅
- 1: Identity incomplete ❌
- 2: Database connection failed ❌
- 3: Configuration error ❌

**Gates**:
1. All packets have (packet_key, source_ref, content_hash) non-null
2. No duplicate packet_keys
3. No duplicate (source_ref, hash) pairs

**Current Status**: ~100% (58,365 packets with identity)

---

## Stage 1: Structural Extraction (AST)

**File**: `stages/stage1-structural-extract.py`

**Purpose**: Extract AST symbols (functions, classes, interfaces, imports, exports) from source files.

**Dependencies**:
- ast-grep (Rust, `cargo install ast-grep`)
- Node.js (for TypeScript Compiler API)
- psycopg3, rank_bm25

**Command**:
```bash
# Dry-run first (no writes)
python scripts/graphify/stages/stage1-structural-extract.py --dry-run --batch=100

# Apply
python scripts/graphify/stages/stage1-structural-extract.py --batch=100 --limit=7000
```

**Options**:
- `--dry-run`: No database writes
- `--batch=N`: Batch size (default 100)
- `--limit=N`: Max packets to process (default 1000)
- `--verbose`: Debug logging

**Output**: tree_node_ids (JSONB)
```json
[
  { "kind": "function", "name": "getName", "start_line": 42, "end_line": 50, "hash": "abc123" },
  { "kind": "class", "name": "MyClass", "start_line": 52, "end_line": 100, "hash": "def456" }
]
```

**Target Coverage**: ~80% (deterministic, CPU-bound)

**Estimated Time**: 20–40 minutes

**Current Status**: 0% (not yet run)

---

## Stage 2: Lexical Extraction (BM25)

**File**: `stages/stage2-lexical-extract.py`

**Purpose**: Extract lexical terms (identifiers, paths, error codes, API names) using BM25 scoring.

**Dependencies**:
- rank_bm25 (`pip install rank_bm25`)
- psycopg3

**Command**:
```bash
# Dry-run first
python scripts/graphify/stages/stage2-lexical-extract.py --dry-run --batch=100

# Apply
python scripts/graphify/stages/stage2-lexical-extract.py --batch=100 --limit=7000
```

**Output**: lexical_terms (JSONB)
```json
[
  { "term": "functionName", "freq": 5, "score": 0.82, "type": "identifier" },
  { "term": "path/to/file", "freq": 2, "score": 0.45, "type": "path" }
]
```

**Target Coverage**: ~85% (deterministic, CPU-bound)

**Estimated Time**: 15–30 minutes

**Current Status**: 0% (not yet run)

---

## Stage 3: Semantic Layer (Gemma4)

**File**: `stages/stage3-semantic-backfill.py` (TO BE CREATED)

**Purpose**: Extract grounded semantic summaries using Gemma4, constrained by verified AST facts.

**Prompt Strategy**:
```
Given the verified AST facts:
  - Functions: [list from Stage 1]
  - Imports: [list from Stage 1]
  - Exports: [list from Stage 1]

Describe the primary capability, failure modes, business meaning, tool usage.

Do NOT invent functions. Everything remains grounded.
```

**Dependencies**:
- Gemma4 LLM server (:8090)
- psycopg3

**Target Coverage**: 85% (currently 7.2% / 4,180 packets)

**Estimated Time**: 2–3 hours

---

## Stage 4: Feature Envelope

**File**: `stages/stage4-feature-envelope.py` (TO BE CREATED)

**Purpose**: Assemble canonical feature envelope JSONB containing:
- identity (packet_key, source_ref, content_hash)
- ast (tree_node_ids from Stage 1)
- lexical (lexical_features from Stage 2)
- semantic (summary_text from Stage 3)
- domain (domain_class from Stage 5)
- topology (SOM/KMeans from Stage 6)
- metrics (coverage, confidence, provenance)
- provenance (which stage extracted, when, version)

**Dependencies**: psycopg3

**Target Coverage**: 100% (depends on upstream stages)

**Estimated Time**: 10 minutes

---

## Stage 5: Named Embeddings

**File**: `stages/stage5-embeddings.py` (TO BE CREATED)

**Purpose**: Generate 4 named embedding lanes:
- content_embedding (768-dim, via Ollama embeddinggemma)
- summary_embedding (768-dim)
- signature_embedding (768-dim)
- topology_embedding (128-dim, latent via autoencoder)

**Note**: Only run AFTER Stage 4 (feature envelope stable).

**Dependencies**:
- Ollama (:11434, embeddinggemma:latest)
- psycopg3

**Target Coverage**: 100% (all packets)

**Estimated Time**: 45 minutes

---

## Stage 6: Topology

**File**: `stages/stage6-topology.py` (TO BE CREATED)

**Purpose**: Compute topology via:
- **KMeans** (PyTorch GPU): Cluster embeddings into K=25 groups
- **SOM** (PyTorch GPU): 20×20 self-organizing map
- **PageRank** (NetworkX CPU): Importance scoring
- **Communities** (NetworkX CPU): Louvain community detection
- **Centroids**: Compute domain-level centroids

**Dependencies**:
- PyTorch 2.13.0+cu130
- NetworkX
- psycopg3

**Target Coverage**: 100% (all packets)

**Estimated Time**: 1–2 hours

---

## Stage 7: Classifier (XGBoost)

**File**: `stages/stage7-classifier.py` (TO BE CREATED)

**Purpose**: Train XGBoost classifier on feature matrix:
- Rows: 58,365 packets
- Columns: AST + lexical + semantic + topology + concepts + PageRank + SOM + community
- Target: domain_class prediction

**Dependencies**:
- XGBoost (`pip install xgboost`)
- pandas, numpy
- psycopg3

**Target Coverage**: Model trained on 100% of packets

**Estimated Time**: 30 minutes

---

## Recommended Execution Order

**Phase 1: Deterministic (No GPU)**
```bash
# 1. Verify identity (5 min)
node scripts/graphify/stages/stage0-identity-verify.mjs

# 2. Extract AST (20-40 min)
python scripts/graphify/stages/stage1-structural-extract.py --limit=7000

# 3. Extract lexical (15-30 min)
python scripts/graphify/stages/stage2-lexical-extract.py --limit=7000
```

**Phase 2: Semantic + GPU (Parallel)**
```bash
# 4a. Gemma4 backfill (2-3 hours)
python scripts/graphify/stages/stage3-semantic-backfill.py --limit=50000

# 4b. Feature envelope (10 min)
python scripts/graphify/stages/stage4-feature-envelope.py --limit=58365
```

**Phase 3: GPU + ML**
```bash
# 5. Named embeddings (45 min)
python scripts/graphify/stages/stage5-embeddings.py --limit=58365

# 6. Topology (1-2 hours)
python scripts/graphify/stages/stage6-topology.py --limit=58365

# 7. Classifier (30 min)
python scripts/graphify/stages/stage7-classifier.py
```

**Total Wall-Clock**: ~5–7 hours (phases can overlap)

---

## Success Criteria

| Stage | Coverage | Blocker? | Status |
|-------|----------|----------|--------|
| 0 | 100% | YES | To verify |
| 1 | 80% | YES | To run |
| 2 | 85% | YES | To run |
| 3 | 85% | NO | To run |
| 4 | 100% | NO | To run |
| 5 | 100% | NO | To run |
| 6 | 100% | NO | To run |
| 7 | 100% | NO | To run |

---

## RabbitMQ Worker Pool (Future)

**Queues**:
```
graphify.stage1.structural    → 1 worker
graphify.stage2.lexical       → 1 worker
graphify.stage3.semantic      → 2 workers (parallel)
graphify.stage5.embeddings    → 1 worker
graphify.stage6.topology      → 1 worker
graphify.stage7.classifier    → 1 worker
```

**Worker Pattern** (Python):
```python
import pika

connection = pika.BlockingConnection(pika.ConnectionParameters('localhost'))
channel = connection.channel()
channel.queue_declare(queue='graphify.stage1.structural', durable=True)
channel.basic_qos(prefetch_count=1)

def callback(ch, method, properties, body):
    packet = json.loads(body)
    result = process_packet(packet)
    write_result(result)
    ch.basic_ack(delivery_tag=method.delivery_tag)

channel.basic_consume(queue='graphify.stage1.structural', on_message_callback=callback)
channel.start_consuming()
```

---

## Files

```
scripts/graphify/
  INDEX.md                          (this file)
  stages/
    stage0-identity-verify.mjs       ✅ READY
    stage1-structural-extract.py     ✅ READY
    stage2-lexical-extract.py        ✅ READY
    stage3-semantic-backfill.py      (to create)
    stage4-feature-envelope.py       (to create)
    stage5-embeddings.py             (to create)
    stage6-topology.py               (to create)
    stage7-classifier.py             (to create)
  lib/
    ts-ast-extractor.mjs             ✅ READY
  config/
    stage-config.yaml                (to create)
    worker-pool.yaml                 (to create)
  workers/
    rabbitmq-worker.py               (to create)
```

---

## Quick Start

```bash
# 1. Install dependencies
pip install rank_bm25 psycopg asyncio
npm install --save-dev typescript

# 2. Verify identity (BLOCKING GATE)
node scripts/graphify/stages/stage0-identity-verify.mjs

# 3. Extract AST (Stage 1)
python scripts/graphify/stages/stage1-structural-extract.py --dry-run --batch=10
python scripts/graphify/stages/stage1-structural-extract.py --batch=100 --limit=7000

# 4. Extract lexical (Stage 2)
python scripts/graphify/stages/stage2-lexical-extract.py --dry-run --batch=10
python scripts/graphify/stages/stage2-lexical-extract.py --batch=100 --limit=7000

# 5. Verify coverage
docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c "
  SELECT
    COUNT(*) as total,
    COUNT(CASE WHEN payload->'tree_node_ids' IS NOT NULL THEN 1 END) as with_ast,
    COUNT(CASE WHEN metadata->'lexical_features' IS NOT NULL THEN 1 END) as with_lexical
  FROM atlas_packets
"
```

---

## Troubleshooting

**ast-grep not found**:
```bash
cargo install ast-grep
```

**TypeScript compiler API not available**:
```bash
npm install --save-dev typescript
```

**psycopg3 connection failed**:
```bash
# Verify Postgres is running
docker ps | grep postgres

# Check connection params
echo $DB_HOST $DB_PORT $DB_USER $DB_NAME
```

**No eligible packets found**:
- Stage 1: Ensure source_ref is populated (currently 58K packets)
- Stage 2: Ensure Stage 1 did not mark all as extracted (check payload['tree_node_ids'])
- Stage 3: Ensure summary_text is NULL on target packets

---

## Next: Recommendation Engine

After Stages 0–7 complete, implement:
- "Did you mean?" suggestions (typo recovery + semantic)
- Related functions (via topology + embedding similarity)
- Missing imports detection (AST + semantic)
- Similar fixes (stored patterns + KAG graph)
- Neighboring APIs (topology + authority score)
- Code completion suggestions (lexical + semantic prefix)
- Agent tool selection (multi-vector RRF + XGBoost confidence)
