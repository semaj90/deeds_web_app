# NES/CHROM Packet Pipeline — Active Roadmap

**Created**: 2026-06-07  
**Status**: Phases 2–9 complete ✅ — run `npm run packets:phase9:preflight` then upload to Colab G4  
**Estimated total**: 8-12 hours across all phases  
**Session**: Continues from SESSION_2026-05-29_ATLAS_PHASE_2_VALIDATION.md

---

## What Was Built (Done ✅)

### Schema layer
- `route_runtime_packets` extended: `raw jsonb`, `prompt_hash`, `reward`, `packet_uuid` (uuid anchor), generated columns `route_state` + `feature_id`
- `route_packet_facts` — typed facts per packet (GIN on metadata)
- `route_packet_edges` — graph edges (src/dst/edge_type/weight)
- `route_state_snapshots` — compressed state + `embedding vector(768)` slot
- Migration: `drizzle/manual/20260606_route_packet_tables.sql`

### Gemma4 packet compiler
- `src/lib/server/features/ai/ace/gemma4-packet-compiler.ts`
- Streams from llama-server :8090 (`stream:true` per hard rule)
- Returns `{ facts[], edges[], state }` or EMPTY on failure
- Prompt: extracts routing facts + graph edges from raw NES packet JSON

### Ingestion API
- `POST /api/ace/packets` — ingest raw packet → Gemma4 compile → write facts/edges/state
- `GET /api/ace/packets?feature_id=<id>` — state memory recall
- `GET /api/ace/packets?packet_uuid=<uuid>` — full recall with facts + edges

### JSONL interchange files (`memory/packets/`)
- `nes-chrom-packets.jsonl` — canonical source of truth (Postgres export)
- `atlas-packet-facts.jsonl`, `atlas-graph-edges.jsonl`
- `atlas-state-snapshots.jsonl`, `atlas-token-map.jsonl`
- `CONTRACT.md` — extractor contract (CUDA slot reserved)

### Pipeline scripts + npm commands
```bash
npm run packets:export              # Postgres → JSONL
npm run packets:duckdb:reduce       # JSONL → Parquet + summary JSON
npm run packets:postgres:load       # JSONL → Postgres (idempotent)
npm run packets:valkey:warm         # JSONL → Valkey hot cache
npm run packets:neo4j:edges         # JSONL → Neo4j PACKET_EDGE rels
npm run packets:pipeline            # full pipeline (all 5 in order)
npm run packets:pipeline:dry        # dry-run verified ✅
```

---

## The Corrected Roadmap (Phases 2–9)

From SESSION_2026-05-29_ATLAS_PHASE_2_VALIDATION.md — supervision > retrieval:

| Phase | Work | Time | Type | Unlocks |
|-------|------|------|------|---------|
| **2** ✅ | NES packet pipeline (JSONL + Postgres + Valkey + Neo4j) | 3-4h | **Infrastructure** | Interchange format locked |
| **3** ✅ | USES_DB + USES_TOOL extraction + normalize-edges + Neo4j load | 2-3h | **Topology** | 108,053 CALLS/USES_DB/USES_TOOL edges in Neo4j |
| **4** ✅ | Runtime intent graph (RESOLVES_INTENT) | 2h | **Behavioral** | `build-intent-graph.mjs` wired; fires on `feature_id` packets |
| **5** ✅ | Graph mutation ledger (INVALIDATED_BY) | 1-2h | **Invalidation** | `invalidate-stale-edges.mjs`; 12 stale edges detected from HEAD~1 |
| **6** ✅ | Synthetic trace simulator | 2-3h | **Supervision** | 99 traces (33 packets × 3 variants); `simulate-traces.mjs` live |
| **7** ✅ | Glyph reward computation | 1-2h | **Outcome** | 33 packets scored; `compute-glyph-rewards.mjs` live |
| **8** ✅ | LoRA training pair generation | 1-2h | **Signal** | 30 pairs (reward ≥ 0.7); `build-lora-pairs.mjs` live |
| **9** ✅ | LoRA fine-tuning (Unsloth) | 3-4h | **Training** | `colab-lora-finetune.ipynb` ready; 99 contrastive pairs; `npm run packets:phase9:preflight` |

**Critical shift**: Phases 3-5 = structure. Phases 6-9 = supervision. Without supervision, LoRA has nothing to learn from.

---

## Phase 3: USES_DB + USES_TOOL extraction (next)

### What to build
Run the existing `scripts/atlas/extract-db-usage.mjs` to produce USES_DB edges, then write `scripts/atlas/extract-tool-usage.mjs` for USES_TOOL.

```bash
# ~20-30 min extraction
node scripts/atlas/extract-db-usage.mjs
node scripts/atlas/summarize-db-usage-graph.mjs
```

### Output contract
Both scripts must emit JSONL to `memory/packets/atlas-graph-edges.jsonl` in the standard edge schema:
```json
{
  "src": "src/lib/server/db/client.ts:45:query",
  "dst": "cases",
  "edge_type": "USES_DB",
  "weight": 1,
  "metadata": { "operation": "SELECT", "table": "cases" },
  "packet_uuid": null
}
```

### Neo4j ingestion
After extraction, `packets:neo4j:edges` loads them. Then verify:
```cypher
MATCH ()-[r:PACKET_EDGE {edge_type: 'USES_DB'}]->()
RETURN count(r) AS db_edges;
-- target: >5,000 edges
```

### Redis pre-computation (mandatory — O(1) ACE lookups)
```
table:callers:{table_name}   → JSON [sourceRef list] (TTL 24h)
tool:callers:{tool_name}     → JSON [sourceRef list] (TTL 24h)
```

Add a `packets:valkey:warm:db` script that populates these after USES_DB edges land.

---

## Phase 4: Runtime intent graph (RESOLVES_INTENT)

### What
Every ACE packet that resolves a query to a feature_id creates a `RESOLVES_INTENT` edge:
```
query_hash → feature_id
```
This is already partially captured in `route_runtime_packets.feature_id` (generated column).
Phase 4 = materialize these as Neo4j edges + a Valkey counter.

### Script to write
`scripts/packets/build-intent-graph.mjs`
- Read `nes-chrom-packets.jsonl`
- Group by `query_hash` → `feature_id`
- Emit `RESOLVES_INTENT` edges to `atlas-graph-edges.jsonl`
- Load into Neo4j + increment Valkey counter `intent:feature:{feature_id}`

---

## Phase 5: Graph mutation ledger (INVALIDATED_BY)

### What
When a source file changes (git diff), mark all CALLS/USES_DB/USES_TOOL edges from that file as `invalidated_by={commit_sha}`.

### Script to write
`scripts/packets/invalidate-stale-edges.mjs`
- Run `git diff --name-only HEAD~1` → list of changed files
- For each changed file: set `invalidated_by` on all Neo4j edges where `src` starts with that path
- Write invalidation records to `atlas-graph-edges.jsonl` with `edge_type: "INVALIDATED_BY"`

---

## Phase 6: Synthetic trace simulator

### What
Generate fake but structurally correct tool-selection traces for Gemma4 LoRA training bootstrap.

### Script to write
`scripts/packets/simulate-traces.mjs`
- Read `nes-chrom-packets.jsonl` → for each packet, synthesize 3 traces:
  - `correct`: actual feature_id + correct tool selection
  - `wrong_tool`: plausible wrong tool, reward=0.1
  - `degraded`: missing context, reward=0.3
- Emit to `memory/packets/synthetic-traces.jsonl`

Output schema:
```json
{
  "trace_id": "uuid",
  "query_hash": "...",
  "feature_id": "...",
  "tool_selected": "trace.kag_search",
  "tool_correct": true,
  "reward": 0.9,
  "context_packet_uuid": "...",
  "trace_type": "correct"
}
```

---

## Phase 7: Glyph reward computation

### What
For each `packet_uuid`, compute actual reward = weighted sum of:
- `qdrant_hits > 0` → +0.3
- `cache_hit` → +0.2
- `latency_ms < 500` → +0.2
- `source_refs.length > 0` → +0.2
- `feature_id != null` → +0.1

### Script to write
`scripts/packets/compute-glyph-rewards.mjs`
- Read packets from Postgres
- Compute reward per packet
- UPDATE `route_runtime_packets.reward` where reward IS NULL
- Also write to `memory/packets/atlas-glyph-rewards.jsonl`

---

## Phase 8: LoRA training pair generation

### What
From synthetic traces (Phase 6) + actual traces (Phase 7), build (prompt, completion) pairs:

```json
{
  "instruction": "Route this query to the correct tool. Query: ...",
  "input": "Context packet: {packet snippet}",
  "output": "Tool: trace.kag_search\nReason: feature_id=ace_context, som_cluster=12:7"
}
```

### Script to write
`scripts/packets/build-lora-pairs.mjs`
- Join `nes-chrom-packets.jsonl` + `synthetic-traces.jsonl` + `atlas-glyph-rewards.jsonl`
- Filter: reward >= 0.7 (high-quality positives only)
- Emit to `memory/packets/lora-training-pairs.jsonl`

---

## Phase 9: LoRA fine-tuning

Run on Colab G4 (Blackwell 96GB) via Unsloth:
- Base model: `gemma4-rotorquant:latest` (5.3GB IQ4_XS)
- Dataset: `lora-training-pairs.jsonl` (upload to Colab)
- Method: GRPO with 7 reward functions (existing harness)
- Output: adapter weights → merge into base → push to Ollama registry

---

## DuckDB audit queries (Phase 3+ observability)

```sql
-- sourceRefs without any outgoing edges (dead code candidates)
SELECT sourceRef FROM calls_edges
LEFT JOIN topology_edges ON calls_edges.sourceRef = topology_edges.src
WHERE topology_edges.src IS NULL;

-- Tables never read (write-only, audit gap)
SELECT dst AS table_name, count(*) AS write_ops
FROM atlas_graph_edges WHERE edge_type = 'USES_DB'
GROUP BY dst HAVING max(metadata->>'operation') = 'INSERT';

-- Tools never selected by Gemma4 in packets
SELECT DISTINCT tool FROM mcp_tools
EXCEPT
SELECT DISTINCT fact_value FROM atlas_packet_facts
WHERE fact_type = 'tool_selected';
```

---

## sourceRef unification (cross-layer)

```
sourceRef (file:line:function)
  ├── Neo4j: CALLS / USES_DB / USES_TOOL / RESOLVES_INTENT edges
  ├── Qdrant: codebase_chunks_768 payload.sourceRef
  ├── Postgres: route_runtime_packets.source_refs[] JSONB
  ├── Redis: packet:feature:{feature_id} → packet_id list
  ├── DuckDB: audit views (stale, orphaned, unused)
  └── Glyph reward: route_runtime_packets.reward
```

Every lane reads/writes the same sourceRef key. The CUDA bitmap parser (future) accelerates only the extraction step — the contract is unchanged.

---

## CUDA bitmap parser slot

When extraction volume exceeds Gemma4 compiler throughput (~1 packet/sec):

```
nes-chrom-packets.jsonl
  → CUDA JSON bitmap scanner (WSL2 N-API bridge)
  → emits atlas-packet-facts.jsonl + atlas-graph-edges.jsonl
  → same packets:postgres:load + packets:neo4j:edges run unchanged
```

N-API contract: `parsePacketFile(path: string) → { facts: Fact[], edges: Edge[] }`  
Do not build this until Phase 3 extraction is stable and volume exceeds 10K packets/day.

---

## Execution commands (Phase 3 start)

```bash
# 1. Extract DB usage (ts-morph AST scan, ~20-30 min)
node scripts/atlas/extract-db-usage.mjs

# 2. Summarize the extraction
node scripts/atlas/summarize-db-usage-graph.mjs

# 3. Export current packets to JSONL
npm run packets:export

# 4. Reduce with DuckDB
npm run packets:duckdb:reduce

# 5. Load edges into Neo4j
npm run packets:neo4j:edges

# 6. Warm Valkey
npm run packets:valkey:warm
```

Review the DuckDB summary JSON before proceeding to Phase 4.
