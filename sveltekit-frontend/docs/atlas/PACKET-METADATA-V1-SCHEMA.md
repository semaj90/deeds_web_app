# Packet Metadata V1 Schema

**Version**: 1.0  
**Last Updated**: June 14, 2026  
**Status**: Canonical (separates identity from evidence, prevents junk-drawer JSONB)

---

## Core Principle

```
file_path / server_path / workspace_path = EVIDENCE
source_ref + packet_key + feature_id = IDENTITY

Never let path/runtime evidence replace packet identity.
```

---

## Schema Categories

### 1. Identity (Immutable)

The **seed crystal** that keys the entire system. These fields define what a packet **is**.

```typescript
{
  packet_key: string;      // Unique within universe: "atlas:src/lib/server/auth.ts:getUserSession"
  source_ref: string;      // Canonical location: "src/lib/server/auth.ts"
  feature_id: string;      // Semantic group: "api_endpoints"
  feature_label: string;   // Human: "API Endpoints"
}
```

**Rules:**
- `packet_key` is the primary key within a packet universe (atlas, nes_chrom, glyph, codebase_chunk)
- `source_ref` is canonical source location, stable across refactors
- `feature_id` is a grouping key, not unique row identity
- Never replace `feature_id` with inferred runtime evidence
- Used in all downstream systems: Neo4j nodes, Qdrant keys, Redis lookups

---

### 2. Runtime (Code Shape)

Evidence about what this packet **contains** — symbols, imports, commands, environment variables.

```typescript
{
  language?: "typescript" | "javascript" | "python" | "sql" | "yaml" | "json";
  symbol_name?: string;         // Function/class name: "validateSession"
  symbol_kind?: string;         // "function" | "class" | "interface" | "const" | "type"
  imports?: string[];           // Direct dependencies: ["lucia", "zod"]
  exports?: string[];           // What this packet exports
  commands?: string[];          // npm scripts, shell commands: ["test", "build"]
  env_vars?: string[];          // Environment variables referenced: ["DATABASE_URL"]
  encoding?: "utf-8" | "base64"; // Text encoding
}
```

**Used by:**
- Code search: find imports/exports, trace dependencies
- Policy learning: rank by command relevance (e.g., "find scripts that run auth tests")
- Schema extraction: enumerate symbols for API surface
- Observability: track env var usage

**NOT used for:**
- Identity lookup (use `source_ref`)
- File system operations (use workspace metadata)

---

### 3. Workspace (File Paths & Config)

Evidence about **where** this packet lives — file system locations, VS Code configuration, package.json context.

```typescript
{
  file_path?: string;           // Relative: "src/lib/server/auth.ts"
  repo_path?: string;           // Absolute repo: "/home/user/deeds-web-app"
  server_path?: string;         // Container path: "/home/user/deeds-web-app/src/lib/..."
  workspace_path?: string;      // VS Code workspace: "/home/user/deeds-web-app"
  package_json_path?: string;   // Nearest package.json: "sveltekit-frontend/package.json"
  vscode_workspace?: string;    // .code-workspace file reference
  vscode_tasks?: string[];      // npm scripts this packet is used in: ["atlas:feature-metadata:verify"]
  vscode_debug_configs?: string[]; // launch.json configs: ["Debug Backend"]
}
```

**Used by:**
- File ops: open editor, show in explorer
- CI/CD: map relative paths to server paths for container builds
- IDE integration: link VS Code tasks to packets
- Development: trace which npm scripts invoke this code

**NOT used for:**
- Identity lookup (use `source_ref`)
- Canonical source location (use `source_ref`)
- Ranking (use ranking metadata)

---

### 4. Topology (Embeddings & Clusters)

Evidence about **where** this packet lives in semantic space — vector embeddings, SOM clusters, manifold coordinates.

```typescript
{
  embedding_dim?: 768;                    // Vector dimension (embeddinggemma native)
  latent_dim?: 64;                        // Autoencoder output dimension
  encoded64?: number[];                   // 64-dim autoencoder latent vector
  som_cluster?: string;                   // SOM cell: "row_5_col_3"
  som_bmu_row?: number;                   // Self-Organizing Map best-matching unit row
  som_bmu_col?: number;                   // Self-Organizing Map best-matching unit col
  kmeans_cluster?: string;                // K-means cluster ID: "c_12"
  manifold4d?: {
    x_cosine: number;    // Qdrant cosine similarity axis (0-1)
    y_graph: number;     // Neo4j PageRank / authority axis (0-1)
    z_som: number;       // SOM neighborhood axis (0-1)
    w_authority: number; // Karpathy authority score axis (0-10)
  };
}
```

**Used by:**
- 4D visualization: scatter plot with axes for similarity/authority/cluster/ranking
- Neighbor search: "find packets in same SOM cell"
- Authority analysis: "rank by manifold4d.w_authority"

---

### 5. Ranking (Scores & Indices)

Evidence about **how well** this packet ranks — similarity scores, authority, cache keys.

```typescript
{
  qdrant_point_id?: string;        // Qdrant vector DB point ID
  qdrant_tags?: string[];          // Tags for Qdrant filtering
  qdrant_collection?: string;      // Collection: "codebase_chunks_768"
  cosine_similarity?: number;      // Last cosine search score (0-1)
  pgvector_rank?: number;          // PostgreSQL ranking position
  bm25_rank?: number;              // Full-text search rank
  rerank_score?: number;           // XGBoost / MARCO cross-encoder score
  karpathy_score?: number;         // GPU authority blend (0-10)
  authority_score?: number;        // Neo4j PageRank (0-1)
  reward_prior?: number;           // Policy learning reward (0-1)
  ace_reward?: number;             // ACE context assembly boost (0-1)
  recency_boost?: number;          // Time-decay ranking (0-1)
}
```

**Used by:**
- Retrieval: `SELECT ... ORDER BY karpathy_score DESC LIMIT 20`
- Reranking: cascade scores through multiple signals
- ACE: weight context chunks by ace_reward
- Feedback loop: update scores based on user engagement

---

### 6. Graph (Relationships)

Evidence about **what** this packet is semantically — communities, domains, relationships to other packets.

```typescript
{
  community_id?: string;              // Community detection group
  cluster_id?: string;                // SOM/K-means cluster
  domain?: string;                    // Domain class: "auth"
  ontology?: string[];                // Concept tags: ["encryption", "session_mgmt"]
  neo4j_node_id?: string;             // Neo4j graph node ID
  parent_ids?: string[];              // Parent packet IDs (if hierarchical)
  chunk_ids?: string[];               // Child chunks (if summary packet)
  similar_packets?: [
    { packet_id: string; similarity: number }
  ];                                  // Top-K similar packets
}
```

**Used by:**
- Neo4j traversal: `MATCH (n)-[:USED_CONCEPT]->(c)` for context expansion
- Community analysis: "rank all packets in same community"
- Domain filtering: ` WHERE domain = 'auth'`
- Concept bridges: connect atlas_packets and nes_chrom_packets through shared concepts

---

### 7. Memory (Cache Keys)

Evidence about **where** this packet is cached — Redis, Bifrost, Engram memory references.

```typescript
{
  redis_hot_key?: string;          // Redis cache key
  bifrost_cache_key?: string;      // Bifrost semantic cache key
  engram_memory_id?: string;       // Engram episodic memory reference
  ace_hit_id?: string;             // ACE context cache hit ID
  cache_ttl_seconds?: number;      // Time-to-live
  last_cached_at?: string;         // ISO timestamp
}
```

**Used by:**
- Cache lookups: `GET redis_hot_key`
- Cache invalidation: "which packets are cached in redis_hot_key?"
- Memory traces: link to Engram episodic memory

---

### 8. Provenance (Versioning & Audit Trail)

Evidence about **how** this packet's metadata was created and updated — schema version, inference flags, audit trail.

```typescript
{
  lineage_version: "packet-identity-v1";              // Always this value
  packet_universe: "atlas" | "nes_chrom" | "glyph";  // Source table
  feature_id_inferred?: boolean;                       // Computed, not loaded?
  feature_id_source?: string;                          // How it was derived
  feature_label_inferred?: boolean;                    // Humanized from feature_id?
  metadata_version?: number;                           // Schema version
  updated_at: string;                                  // ISO timestamp
  updated_by?: string;                                 // System that updated
  source_hash?: string;                                // Hash of source content
}
```

**Used by:**
- Schema migration: version bumps for breaking changes
- Audit trail: track which systems touched this packet
- Cache invalidation: source_hash changed → invalidate Qdrant
- Confidence scoring: feature_id_inferred=true → lower ranking

---

## Type-Safe Builder

```typescript
import { PacketMetadataBuilder } from '$lib/server/db/schema/packet-metadata-v1';

const metadata = new PacketMetadataBuilder(
  'atlas:src/lib/server/auth.ts:validateSession',
  'src/lib/server/auth.ts',
  'api_endpoints'
)
  .identity({ feature_label: 'API Endpoints' })
  .runtime({
    language: 'typescript',
    symbol_name: 'validateSession',
    symbol_kind: 'function',
    imports: ['lucia', 'zod'],
    env_vars: ['SESSION_SECRET'],
  })
  .workspace({
    file_path: 'src/lib/server/auth.ts',
    package_json_path: 'sveltekit-frontend/package.json',
    vscode_tasks: ['atlas:feature-metadata:verify'],
  })
  .ranking({
    karpathy_score: 8.5,
    authority_score: 0.92,
    cosine_similarity: 0.87,
  })
  .graph({
    community_id: 'auth-system',
    domain: 'auth',
    ontology: ['encryption', 'session_mgmt', 'user_identity'],
  })
  .provenance({
    lineage_version: 'packet-identity-v1',
    packet_universe: 'atlas',
    feature_id_inferred: false,
    updated_by: 'manual-import',
  })
  .build();
```

---

## Category Selectors (Query-Safe)

Extract only what you need, avoid full JSONB:

```typescript
import { packetMetadataSelectors } from '$lib/server/db/schema/packet-metadata-v1';

const ranking = packetMetadataSelectors.ranking(metadata);
// → { karpathy_score: 8.5, authority_score: 0.92, ... }

const identity = packetMetadataSelectors.identity(metadata);
// → { packet_key: '...', source_ref: '...', feature_id: '...', ... }
```

---

## Storage Mapping

### PostgreSQL `atlas_packets.metadata JSONB`

All fields above stored as JSON:

```sql
SELECT
  packet_id,
  feature_id,
  metadata -> 'language' AS language,
  metadata ->> 'symbol_name' AS symbol_name,
  metadata -> 'karpathy_score' AS karpathy_score
FROM atlas_packets
WHERE feature_id = 'api_endpoints'
ORDER BY (metadata ->> 'karpathy_score')::float DESC;
```

**Indexes:**
- `idx_atlas_packets_metadata_gin` — Full-text GIN for any field
- `idx_atlas_packets_metadata_ranking` — B-tree on karpathy_score + authority_score
- `idx_atlas_packets_metadata_feature_id` — Quick lookup by feature_id
- `idx_atlas_packets_metadata_domain` — Domain-scoped queries

### Qdrant `codebase_chunks_768.payload`

Flattened for filtering + ranking:

```json
{
  "packet_key": "atlas:src/lib/server/auth.ts:validateSession",
  "source_ref": "src/lib/server/auth.ts",
  "feature_id": "api_endpoints",
  "feature_label": "API Endpoints",
  "language": "typescript",
  "domain": "auth",
  "ontology": ["encryption", "session_mgmt"],
  "karpathy_score": 8.5,
  "authority_score": 0.92,
  "som_cluster": "row_5_col_3",
  "qdrant_point_id": "..."
}
```

**Filter queries:**
```python
qdrant.search(
  collection_name="codebase_chunks_768",
  query_vector=query_embedding,
  query_filter=Filter(
    must=[
      HasIdCondition(
        has_id=["atlas:src/lib/server/auth.ts:validateSession"]
      ),
      FieldCondition(
        key="feature_id",
        match=MatchValue(value="api_endpoints")
      ),
      FieldCondition(
        key="karpathy_score",
        range=Range(gte=7.0)
      )
    ]
  ),
  limit=10
)
```

### Neo4j Property Labels

Primary key on identity + ranking:

```cypher
MATCH (n:Packet {packet_key: 'atlas:src/lib/server/auth.ts:validateSession'})
RETURN
  n.feature_id,
  n.feature_label,
  n.karpathy_score,
  n.domain,
  n.ontology
```

---

## Validation Rules

1. **Identity fields** (`packet_key`, `source_ref`, `feature_id`) are **required** and immutable
2. **Runtime/Workspace/Topology/Ranking** fields are **optional** and can be added/updated
3. **Feature_id must not be empty** — always falls back to `unclassified_packet` if orphaned
4. **No circular references** — parent_ids should not reference children, and vice versa
5. **Qdrant point_id must match** — when syncing to Qdrant, validate point exists before upserting payload
6. **Version must match** — `lineage_version` must be `"packet-identity-v1"` for this schema

---

## Migration Path (v1 → v2, future)

If breaking changes needed:

1. Introduce new `lineage_version: "packet-identity-v2"`
2. Keep v1 packets readable (fallback logic)
3. Migrate on read (lazy), not batch rewrite
4. Index new fields before promoting v2 to canonical

---

## Examples

### Query: Find auth APIs by authority

```sql
SELECT
  packet_id,
  metadata ->> 'feature_label' AS feature,
  COALESCE((metadata ->> 'karpathy_score')::float, 0) AS score
FROM atlas_packets
WHERE feature_id = 'api_endpoints'
  AND metadata ->> 'domain' = 'auth'
ORDER BY (metadata ->> 'karpathy_score')::float DESC
LIMIT 10;
```

### Query: Context assembly (ACE) — rerank by authority + cache boost

```sql
WITH candidates AS (
  SELECT packet_id, feature_id,
    (metadata ->> 'karpathy_score')::float * 1.2 AS boosted_score
  FROM atlas_packets
  WHERE feature_id IN (SELECT feature_id FROM ...)
)
SELECT packet_id, boosted_score
FROM candidates
ORDER BY boosted_score DESC
LIMIT 20;
```

### Query: Find packets by ontology tag

```sql
SELECT packet_id, metadata ->> 'ontology' AS tags
FROM atlas_packets
WHERE metadata @> '{"ontology": ["encryption"]}'::jsonb
  AND feature_id != 'unclassified_packet'
LIMIT 100;
```
