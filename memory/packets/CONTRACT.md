# NES/CHROM Packet Interchange Contract

## File layout

```
memory/packets/
  nes-chrom-packets.jsonl    ← canonical packet log (source of truth)
  atlas-packet-facts.jsonl   ← extracted facts per packet
  atlas-graph-edges.jsonl    ← graph edges per packet
  atlas-state-snapshots.jsonl← compressed state per packet
  atlas-token-map.jsonl      ← flattened token hints
  atlas-packet-summary.parquet ← DuckDB MapReduce output
  atlas-packet-summary.json  ← human-readable summary
  packets.duckdb             ← DuckDB working database
```

## Canonical packet schema (nes-chrom-packets.jsonl)

```json
{
  "packet_id":   "uuid",
  "query_hash":  "sha256-prefix",
  "prompt_hash": "sha256-prefix",
  "feature_id":  "ace_context",
  "som_cluster": "12:7",
  "route_state": "CONTEXT_ASSEMBLED",
  "route":       "api/ace/route",
  "source_refs": ["src/lib/server/features/ai/ace/context-assembler.ts"],
  "qdrant_hits": ["chunk_88"],
  "lane_ids":    ["sourceRef_spine"],
  "redis_hot_keys": [],
  "latency_ms":  142,
  "cache_hit":   false,
  "cache_tier":  null,
  "reward":      0.82,
  "captured_at": "2026-06-07T00:00:00Z"
}
```

## Fact schema (atlas-packet-facts.jsonl)

```json
{
  "id":          "uuid",
  "packet_uuid": "uuid",
  "fact_type":   "route_feature",
  "fact_key":    "feature_id",
  "fact_value":  "ace_context",
  "score":       0.9,
  "metadata":    {},
  "feature_id":  "ace_context",
  "som_cluster": "12:7",
  "created_at":  "2026-06-07T00:00:00Z"
}
```

## Edge schema (atlas-graph-edges.jsonl)

```json
{
  "id":          "uuid",
  "packet_uuid": "uuid",
  "src":         "ace_context",
  "dst":         "src/lib/server/features/ai/ace/context-assembler.ts",
  "edge_type":   "USES_SOURCE_REF",
  "weight":      1.0,
  "metadata":    {},
  "feature_id":  "ace_context",
  "som_cluster": "12:7",
  "created_at":  "2026-06-07T00:00:00Z"
}
```

## Pipeline lanes

| Lane | Command | Input | Output |
|------|---------|-------|--------|
| Export | `packets:export` | Postgres | `*.jsonl` |
| MapReduce | `packets:duckdb:reduce` | `*.jsonl` | `*.parquet` + summary JSON |
| Load | `packets:postgres:load` | `*.jsonl` | Postgres (idempotent) |
| Cache | `packets:valkey:warm` | `*.jsonl` | Valkey hot keys |
| Graph | `packets:neo4j:edges` | `atlas-graph-edges.jsonl` | Neo4j PACKET_EDGE rels |
| Full | `packets:pipeline` | Postgres | all of the above |

## Extractor contract

Any extractor (DuckDB, Gemma4, CUDA JSON parser) MUST produce these four output files from `nes-chrom-packets.jsonl`:

```
atlas-packet-facts.jsonl
atlas-graph-edges.jsonl
atlas-state-snapshots.jsonl
atlas-token-map.jsonl
```

The CUDA bitmap parser replaces only the extraction step. Postgres, Valkey, and Neo4j loaders remain unchanged.

## Valkey hot cache keys (TTL)

```
packet:qhash:{query_hash}    → packet_id          (1h)
packet:feature:{feature_id}  → JSON [packet_id×5] (30min)
packet:state:{packet_id}     → JSON compressed_state (1h)
```

## CUDA slot (future)

When high-volume JSONL extraction is needed, replace the Gemma4 compiler with:
```
nes-chrom-packets.jsonl
  → CUDA JSON bitmap scanner (WSL2 service via N-API bridge)
  → emits atlas-packet-facts.jsonl + atlas-graph-edges.jsonl
  → same loader scripts run unchanged
```

The N-API bridge contract: `parsePacketFile(path: string) → { facts: Fact[], edges: Edge[] }`.
Output must match the schemas above exactly.