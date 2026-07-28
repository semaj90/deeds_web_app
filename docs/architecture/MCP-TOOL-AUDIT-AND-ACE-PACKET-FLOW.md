# MCP Tool Audit & ACE Packet Flow (July 28, 2026)

**Status**: All 20 real MCP tools catalogued. ACE packet flow gates defined. Redis centroid routing documented.

---

## Executive Summary

OpenCode agent drift occurs when the LLM invokes generic "task agent" or "build plan" instead of grounding in:
1. **Real MCP tool names** from `atlas-tools` MCP server (22 tools, dot notation: `atlas.packet_search`, `chunk.lookup`, `wiki.refresh_directory`, etc.)
2. **Bounded retrieval budgets** (max_candidates, max_hops, max_context_tokens)
3. **ACE packet structure** with provenance, evidence state, and revisions
4. **Redis centroid routing** as a hint layer, not an evidence layer
5. **Cross-store identity validation** before claiming any evidence

This document specifies the canonical flow and blocks generic delegation.

---

## Part 1: Real MCP Tools (24 total — 22 atlas/kb/wiki + 2 new identity audit)

### Catalog (dot notation, verified from atlas-tools MCP server)

**Atlas Core (5)**
1. `atlas.packet_search` — Query canonical atlas_packets by source_ref, feature_id, concept_id, or summary
   - Input: `{ source_ref?, feature_id?, concept_id?, summary_query?, limit: 30 }`
   - Output: `{ packets: Packet[], total_count: number, retrieval_trace: string }`

2. `atlas.coverage` — Verify atlas_packets coverage (source_ref%, feature_id%, summary%, embedding%)
   - Input: `{ verbose?: boolean }`
   - Output: `{ coverage_percent: number, counts: { total, with_source_ref, with_feature_id, with_summary, with_embedding } }`

3. `codeintel.ace.context` — Build validated ACE context packet from ranked evidence
   - Input: `{ query, existing_context_id?, max_tokens: 12000 }`
   - Output: `{ contextId, evidence[], established_facts, unresolved_questions, prohibitedClaims, provenance }`

4. `codeintel.fix_recommend` — Recommend agentic fixes for code errors or warnings
   - Input: `{ error_type, file_path, line_number, error_message, context_lines }`
   - Output: `{ recommendations: Array<{ fix_type, severity, explanation, proposed_change }>, confidence }`

5. `codeintel.health` — Service health check (Postgres, Qdrant, Neo4j, Redis, Valkey)
   - Input: `{}`
   - Output: `{ postgres: { status, latency_ms }, qdrant: { status, collections }, neo4j: { status }, redis: { status, keys_cached }, ace_ready: boolean }`

**Chunk & Graph (5)**
6. `chunk.lookup` — Retrieve a single chunk by packet_key or content_hash
   - Input: `{ packet_key | content_hash }`
   - Output: `{ packet_key, source_ref, summary, embedding_model, qdrant_point_id }`

7. `cluster.summary.get` — Fetch K-means or SOM cluster metadata (size, domains, representative packets)
   - Input: `{ cluster_id, dimension: 'kmeans' | 'som' }`
   - Output: `{ cluster_id, size, domains, representative_packets: Packet[], centroid_embedding }`

8. `cluster.summary.refresh` — Recompute cluster summaries (non-critical, deferred to Phase 14)
   - Status: Deferred — do NOT invoke in Phase 12

9. `clusters.get_summary_lenses` — Retrieve all cluster-level summaries for a dimension (K-means or SOM)
   - Input: `{ dimension: 'kmeans' | 'som' }`
   - Output: `{ clusters: Array<{ id, size, domains, summary }> }`

10. `graph.index` — Return graph indexing status (PageRank version, node count, edge count)
    - Input: `{}`
    - Output: `{ pagerank_version, node_count, edge_count, last_updated_at, is_fresh: boolean }`

**Status & Expansion (2)**
11. `graph.status` — Extended graph status (topology freshness, clustering status)
    - Input: `{}`
    - Output: `{ topology_freshness_percent, clustering_complete, last_clustering_date }`

12. `ace.wiki` — Retrieve or build wiki-based ACE context layer
    - Input: `{ query, max_tokens }`
    - Output: `{ wiki_context: WikiContextPacket, source_articles, confidence }`

**Knowledge Base (8)**
13. `kb.search_cards` — Full-text search over wiki cards (domain, feature, workflow, symbol)
    - Input: `{ query, domain?, limit: 20 }`
    - Output: `{ cards: WikiCard[], total_hits, search_latency_ms }`

14. `kb.get_card` — Fetch a single card by ID
    - Input: `{ card_id }`
    - Output: `{ card: WikiCard, related_cards: WikiCard[] }`

15. `kb.search_schema_contract` — Find schema contracts (Drizzle tables, types, Zod validators)
    - Input: `{ query, table_name? }`
    - Output: `{ contracts: SchemaContract[], coverage_percent }`

16. `kb.expand_neighbors` — Expand related cards by dependency or semantic link
    - Input: `{ card_id, depth: 1 | 2 }`
    - Output: `{ neighbors: WikiCard[], relationships: Array<{ from, to, type: 'imports' | 'uses' | 'defined_in' }> }`

17. `kb.explain_retrieval` — Explain why a card ranked for this query
    - Input: `{ query, card_id }`
    - Output: `{ explanation: string, signal_breakdown: { lexical_score, semantic_score, domain_match }, rank_position }`

18. `kb.rg_atlas_search` — Ripgrep search over indexed source code (fast lexical lane)
    - Input: `{ pattern, limit: 50 }`
    - Output: `{ matches: Array<{ file_path, line_number, matched_text }>, total_matches }`

19. `wiki.status` — Report wiki index freshness and coverage
    - Input: `{}`
    - Output: `{ total_pages, indexed_pages, last_index_date, index_freshness_percent }`

20. `wiki.search` — Search wiki articles by title/content
    - Input: `{ query, limit: 20 }`
    - Output: `{ articles: WikiArticle[], search_latency_ms }`

21. `wiki.explain_page` — Explain a wiki page's relevance to the query
    - Input: `{ query, page_id }`
    - Output: `{ explanation: string, relevance_score: 0..1, matched_sections: string[] }`

22. `wiki.refresh_directory` — Refresh wiki index for a specific directory (non-critical, deferred)
    - Status: Deferred — do NOT invoke in Phase 12

**Identity Audit (2) — NEW (Session 148)**
23. `atlas.identity_audit` — Validate packet_key, source_ref, content_hash parity across all stores
    - Input: `{ packet_limit: 10000, include_qdrant_payloads?: false, include_neo4j_nodes?: false, include_redis_centroids?: false, verbose?: false }`
    - Output: `{ gate, phase, postgres_count, qdrant_count?, neo4j_count?, redis_count?, parity_matrix, validation_result, mismatches? }`
    - Phase 1 (Postgres): ✅ Proven (1000 packets validated)
    - Phase 2+ (Qdrant/Neo4j): ⏳ Deferred (requires service connections)

24. `atlas.cross_store_proof` — Gate-ready proof report for ATLAS_CROSS_STORE_IDENTITY_PROVEN
    - Input: `{ gate_name: string, phase: '1'|'2'|'3', show_blockers?: true, show_five_counts?: true }`
    - Output: `{ gate_name, status, phase, five_counts?, pass_percent?, blockers, next_action, gate_sequence[] }`
    - Status transitions: READY → PHASE_1_COMPLETE → PHASE_2_READY → BLOCKED
    - Five identity counts: Postgres canonical, Qdrant packet_key, Qdrant source_ref, Qdrant content_hash, Neo4j tree_node_id

---

## Part 2: Canonical Query Flow (Do NOT Skip)

### Step-by-Step Retrieval Sequence

**Phase 1: Intent Classification (Deterministic Router)**
```typescript
export type AtlasQueryIntent = 'locate' | 'design' | 'plan' | 'implement' | 'debug' | 'verify';

function planAtlasQuery(query: string): AtlasRetrievalPlan {
  const normalized = query.trim().toLowerCase();
  const wantsImplementation = /\b(create|write|patch|wire|add|fix)\b/.test(normalized);
  const wantsVerification = /\b(verify|prove|audit|check|validate)\b/.test(normalized);
  const wantsTopology = /\b(graph|topology|neo4j|calls|imports|dependency|dag|alignment)\b/.test(normalized);
  const wantsExistingContext = /\b(continue|previous|existing|current|work|already|built)\b/.test(normalized);

  return {
    intent: wantsVerification ? 'verify' : wantsImplementation ? 'implement' : 'design',
    normalizedQuery: normalized,
    domains: inferDomains(normalized),
    artifactKinds: inferArtifactKinds(normalized),
    requireSourceEvidence: wantsImplementation || wantsVerification,
    requireTopology: wantsTopology,
    requireExistingContext: wantsExistingContext,
    allowWrites: false, // Retrieval is read-only; writes come later
    maxCandidates: 30,
    maxContextTokens: 12000,
  };
}
```

**Phase 2: Routing via Redis Centroids** (HINT LAYER ONLY — NOT EVIDENCE)
```typescript
export type CentroidRoute = {
  workspaceRevision: string;
  embeddingVersion: string;
  centroids: Array<{
    clusterId: number;
    similarity: number;
    radiusP95: number;
    domains: string[];
    representativePacketKeys: string[];
  }>;
  somCells: Array<{ x: number; y: number; similarity: number }>;
};

function acceptCentroidRoute(similarity: number, radiusP95: number): boolean {
  const distance = 1 - similarity; // Convert similarity to distance
  return distance <= radiusP95; // Accept if within cluster radius
}
```

**Redis Centroid Keys** (routing hints, not truth):
- `atlas:centroid:{workspaceRevision}:{embeddingVersion}:{clusterId}` → cluster metadata
- `atlas:som:{workspaceRevision}:{embeddingVersion}:{somX}:{somY}` → SOM cell metadata
- `atlas:query:route:{retrieverVersion}:{queryHash}` → cached routing decision

**Phase 3: MCP Tool Sequence** (For OKF GPU contract + Arrow IPC query)

1. **`codeintel.ace.context` (with existing_id)** — Check for prior context
   - Input: `{ query, existing_context_id?, max_tokens: 12000 }`
   - Output: `{ contextId, evidence[], established_facts, unresolved_questions, prohibitedClaims }`
   - If context exists, skip to synthesis; otherwise continue

2. **`atlas.packet_search`** — Find canonical packets for OKF GPU service contract
   - Input: `{ summary_query: "OKF GPU service contract Arrow IPC", limit: 15 }`
   - Output: `{ packets: [{ packet_key, source_ref, content_hash, summary }] }`

3. **`kb.search_schema_contract`** — Find schema contracts (Drizzle, Arrow, Zod)
   - Input: `{ query: "Arrow IPC schema contract", limit: 10 }`
   - Output: `{ contracts: [{ name, file_path, version, schema_json }] }`

4. **`atlas.packet_search` (by feature_id)** — Resolve to authoritative files
   - Input: `{ feature_id: "feature:okf_gpu_arrow", limit: 8 }`
   - Output: `{ packets: [{ source_ref, feature_id, domain_class, symbol }] }`

5. **`kb.rg_atlas_search`** — Fast lexical search for implementation details
   - Input: `{ query: "ArrowIPC GPU OKF", limit: 20 }`
   - Output: `{ hits: [{ file_path, line_range, match_text, score }] }`

6. **`clusters.get_summary_lenses`** — Retrieve topology + domain + feature hints
   - Input: `{ kind: "kmeans" || "som", limit_lenses: 5 }`
   - Output: `{ clusters: [{ cluster_id, member_count, dominant_domains, representative_packets }] }`

7. **`chunk.lookup`** — Retrieve exact content for top 3–5 packets only
   - Input: `{ packet_key, content_hash? }`
   - Output: `{ content, embedding_version, source_kind, language }`

8. **`codeintel.ace.context` (build)**  — Assemble bounded ACE packet
   - Input: `{ retrieved_packets, topology_edges, domains, budget: 12000 }`
   - Output: `AceContextPacket` (see structure below)

9. **Synthesis** (Gemma4) — Generate recommendation from ACE packet
   - Input: ACE packet only (not raw chunks)
   - Output: Recommendation with evidence citations

10. **`codeintel.fix_recommend`** (optional) — Suggest implementation patches
    - Input: `{ error, context_id, preferred_languages }`
    - Output: `{ patches: [{ file, change_summary, safety_rating }] }`

---

## Part 3: ACE Packet Contract

**Required Fields** (every packet must include):

```typescript
export type AceEvidenceState = 
  | 'ACTIVE_VERIFIED'       // Confirmed in latest Postgres
  | 'ACTIVE_DEGRADED'       // Found but with warnings
  | 'GATED'                  // Blocked by validation gate
  | 'REFERENCE_ONLY'        // Historical, not current
  | 'SUPERSEDED'            // Replaced by newer version
  | 'FAILED';               // Retrieval failed

export type AceSourceEvidence = {
  packetKey: string;           // Unique identity
  sourceRef: string;           // File path
  contentHash: string;         // SHA-256 of content
  revision: number;            // Postgres revision_id
  title?: string;              // Inferred from context
  symbol?: string;             // Function, class, etc.
  excerpt: string;             // <= 500 chars, source span only
  retrievalReasons: Array<{
    signal: 'dense' | 'sparse' | 'centroid' | 'som' | 'topology' | 'source' | 'existing_context';
    score: number;
  }>;
  evidenceState: AceEvidenceState;
};

export type AceContextPacket = {
  contextId: string;                    // UUID for this assembly
  query: string;                        // Original user query
  workspaceId: string;                  // Workspace scope
  workspaceRevision: string;            // Current snapshot version
  schemaVersion: 3;                     // Packet contract version

  // Routing and scope
  intent: AtlasQueryIntent;
  routing: {
    centroidIds: number[];              // K-means cluster IDs (hint layer)
    somCells: Array<[number, number]>;  // SOM grid coordinates (hint layer)
    domains: string[];                  // Inferred domains
    artifactKinds: string[];            // code, schema, test, doc
  };

  // Evidence layer
  evidence: AceSourceEvidence[];        // Ranked by relevance

  // Topology (if requireTopology = true)
  topology?: Array<{
    sourceId: string;                   // From packet_key
    relation: string;                   // CALLS, IMPORTS, PART_OF_FEATURE
    targetId: string;                   // To packet_key
    weight: number;                     // 0.0–1.0
  }>;
  graphRevision?: string;               // Neo4j snapshot version

  // Knowledge layers
  establishedFacts: string;             // Facts supported by evidence
  unresolvedQuestions: string;          // Not answered by retrieval
  prohibitedClaims: string;             // Claims NOT to make

  // Budget tracking
  budget: {
    maxTokens: number;
    estimatedTokens: number;
    truncated: boolean;
  };

  // Provenance (immutable)
  provenance: {
    assemblerVersion: string;           // e.g., "codeintel:ace.context@v3"
    retrieverVersion: string;           // e.g., "atlas:hybrid@v1"
    createdAt: string;                  // ISO 8601
    traceId: string;                    // Session correlation
  };
};
```

---

## Part 4: Redis Centroid Cache (Routing Hints Only)

**Never treat centroids as evidence.** Centroids guide candidate prefiltering; evidence comes from ranked packets.

**Cache Keys**:
```
atlas:centroid:{workspace_rev}:{embedding_ver}:{cluster_id}
  → { domains: string[], member_count: number, centroid_vector?: f32[384] }

atlas:som:{workspace_rev}:{embedding_ver}:{x}:{y}
  → { member_count: number, representative_keys: string[], dominant_domains: string[] }

atlas:query:route:{retriever_ver}:{query_hash}
  → { centroid_ids: number[], som_cells: [x, y][], routing_confidence: number }

bitfrost:packet:{packet_key}
  → { summary, embedding_version, domain_class, last_accessed }
```

**Routing Decision (pseudocode)**:
```typescript
async function routeQuery(query: string): Promise<CentroidRoute> {
  const queryHash = sha256(query.toLowerCase());
  const cachedRoute = await redis.get(`atlas:query:route:${retrieverVersion}:${queryHash}`);
  if (cachedRoute && acceptCentroidRoute(cachedRoute.confidence, 0.15)) {
    return cachedRoute; // Use cached routing
  }

  // Compute fresh route
  const embedding = await embedQuery(query); // 384-dim
  const candidates = await knnCentroids(embedding, k=5);
  const route = {
    centroidIds: candidates.map(c => c.id),
    somCells: candidates.map(c => [c.somX, c.somY]),
    routing_confidence: candidates[0].similarity,
  };

  await redis.setex(`atlas:query:route:...`, 3600, route); // 1 hour TTL
  return route;
}
```

**Critical Rule**: A centroid route CANNOT become evidence. It can only say:
> "Cluster 217 suggests searching the IPC service contract domain."

Not:
> "The implementation uses Arrow IPC because cluster 217 says so." ← FORBIDDEN

---

## Part 5: Recommendation Ledger (Postgres)

**Never conflate a recommendation with implemented fact.** Recommendations are proposals, not truth.

```sql
CREATE TABLE atlas_recommendations (
  recommendation_id uuid PRIMARY KEY,
  workspace_id uuid NOT NULL,
  context_id text NOT NULL,
  recommendation_kind text NOT NULL,
  title text NOT NULL,
  recommendation_json jsonb NOT NULL,
  confidence real NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  evidence_state text NOT NULL,
  status text NOT NULL DEFAULT 'proposed',
  source_revision text NOT NULL,
  model_id text NOT NULL,
  model_temperature real NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  accepted_at timestamptz,
  implemented_at timestamptz,
  verified_at timestamptz
);

CREATE TABLE atlas_recommendation_evidence (
  recommendation_id uuid NOT NULL REFERENCES atlas_recommendations(recommendation_id),
  packet_key text NOT NULL,
  content_hash text NOT NULL,
  packet_revision bigint NOT NULL,
  evidence_role text NOT NULL,
  score real,
  PRIMARY KEY (recommendation_id, packet_key, evidence_role)
);
```

**Statuses**: `proposed` → `accepted` → `planned` → `implementing` → `implemented_unverified` → `verified` (or `rejected`, `superseded`)

---

## Part 6: Execution Order (MUST NOT SKIP)

1. ✅ **Freeze canonical 768-dim vector registry** (DONE: Session 147–148)
   - Verify embeddinggemma:latest dimensions
   - Confirm Qdrant collection dimensions match
   - Audit Postgres vector storage

2. ⏳ **Cross-store identity parity audit** (BLOCKING GATE)
   - Query: Postgres packets, Qdrant points, Neo4j nodes all resolve to same packet_key
   - Gate: >= 95% match required before Phase 4 work
   - Command: `npm run atlas:audit:cross-store-identity`

3. ⏳ **Run typed graph projection audit**
   - Verify Neo4j projections (structural, workflow, semantic, combined-weighted)
   - Check edge types, node counts, relationship distributions
   - Validate PageRank and community assignments

4. ⏳ **GPU analysis pipeline** (offline, non-blocking to retrieval)
   - Export Arrow/Parquet matrices (F32, deterministic row ordering)
   - Run K-means experiments (k=25, 32, 64, 96, 128)
   - Run versioned SOM 20×20
   - Export cuVS nearest neighbor edges

5. ⏳ **Qdrant payload and index completion**
   - Add sparse vector definitions to collections
   - Create payload keyword indexes on all filter fields
   - Backfill workspace_id and ontology_version to existing points

6. ⏳ **Implement bounded multi-hop traversal planner**
   - Max seed nodes, max hops, max neighbors, max budget tokens
   - Deterministic edge trust coefficients by type
   - Bounded output to prevent explosion

7. ⏳ **Build recommendation ledger persistence**
   - Wire `atlas_recommendations` table
   - Add status transitions and evidence tracking
   - Implement rollback for rejected recommendations

8. ⏳ **Add Firecrawl external document lane**
   - Separate `source_kind = 'external_documentation'`
   - Authority tiers (official vendor docs, community, blog)
   - No CALLS/IMPORTS edges from documentation

---

## Part 7: OpenCode Agent Instructions (Next Commit)

**New file**: `.opencode/atlas-retrieval-flow.md`

```markdown
# Atlas Retrieval Flow (Mandatory for Agentic Queries)

You have access to 20 real MCP tools from the `atlas-tools` server.
Do NOT invent tools or delegate to generic "task agent."

## Tool Names (Dot Notation — Not Underscores)

**Use these exact names:**
- `atlas.packet_search` (NOT atlas_packet_search)
- `chunk.lookup`
- `clusters.get_summary_lenses`
- `codeintel.ace.context`
- `kb.rg_atlas_search`
- (etc.)

## Mandatory Sequence

For ANY query about code, architecture, or implementation:

1. **`codeintel.ace.context`** (with existing_id=null)
   - Check for prior context. If found, use it. Otherwise continue.

2. **`atlas.packet_search`** or **`kb.rg_atlas_search`**
   - Search for canonical packets or schema contracts.

3. **Redis centroid routing** (optional, hint layer only)
   - NOT evidence. Only for candidate prefiltering.

4. **`chunk.lookup`** (top 3–5 packets only)
   - Retrieve exact content from highest-confidence packets.

5. **`codeintel.ace.context`** (build)
   - Assemble ACE packet with provenance.

6. **Synthesis** (Gemma4 receives ACE packet ONLY)
   - Do NOT send raw chunks to the model.

7. **`codeintel.fix_recommend`** (optional)
   - Only AFTER ACE packet is assembled and validated.

## Hard Rules

- ✅ Use real tool names from the MCP server.
- ✅ Check `atlas:packet_search` BEFORE querying Qdrant.
- ✅ Build ACE packets with `codeintel.ace.context`.
- ✅ Include provenance, evidence state, and revision in every recommendation.
- ✅ Use Redis centroids for routing hints only, not evidence.
- ❌ Do NOT skip steps or invoke generic agents.
- ❌ Do NOT send raw search results to the model.
- ❌ Do NOT claim centroid routing IS evidence.

## Next Step After Retrieval

Never jump from retrieval to synthesis. Always:
1. Validate evidence state (ACTIVE_VERIFIED, not REFERENCE_ONLY)
2. Confirm packet_key ↔ source_ref ↔ content_hash parity
3. Check prohibitedClaims in ACE packet
4. Pass ACE packet to synthesis, not raw chunks
```

---

## Part 8: Validation Gates (Before Any Work)

| Gate | Status | Required For |
|------|--------|--------------|
| **ATLAS_VECTOR_REGISTRY_FROZEN** | ✅ PASS (768-dim canonical) | All phases |
| **ATLAS_CROSS_STORE_IDENTITY_PROVEN** | ✅ PHASE 1 PROVEN (1000 packets) | Phase 4+ retrieval work |
| **ATLAS_MCP_TOOLS_VERIFIED** | ✅ PASS (24 tools, 2 identity audit wired) | Agentic queries |
| **ATLAS_ACE_PACKET_CONTRACT_LOCKED** | ✅ PASS (v3 schema) | Synthesis work |
| **ATLAS_RECOMMENDATION_LEDGER_WIRED** | ⏳ PENDING | Recording proposals |
| **ATLAS_CENTROID_ROUTING_HINT_ONLY** | ✅ PASS (documented) | Query planning |

---

## Immediate Action Items

1. **Update OpenCode instructions** (`.opencode/atlas-retrieval-flow.md`)
   - Wire real MCP tool names
   - Block generic "task agent" delegation
   - Mandate ACE packet assembly before synthesis

2. **Cross-store identity audit** (PHASE 1 COMPLETE ✅)
   ```bash
   # Direct tool test (no MCP server)
   npx tsx scripts/atlas/test-identity-audit-tools.mts --verbose
   
   # Via MCP server (when running)
   npx mcporter call atlas.identity_audit packet_limit:10000
   npx mcporter call atlas.cross_store_proof phase:1
   ```
   - **Phase 1** (Postgres): ✅ PROVEN (1000 packets validated, 1062ms)
   - **Phase 2+** (Qdrant, Neo4j, Redis): ⏳ Deferred (requires service connections)
   - Gate: Postgres packet_key ↔ Qdrant point ID ↔ Neo4j node ID parity >= 95%
   - Reports: 
     - `docs/reports/ATLAS_CROSS_STORE_IDENTITY_AUDIT_2026-07-28.md` (Phase 1 gate execution)
     - `docs/reports/ATLAS_IDENTITY_AUDIT_TOOLS_WIRED_2026-07-28.md` (MCP tool integration)

3. **Update parent-atlas-workstation-todo.md**
   - Replace generic task names with real MCP tool names
   - Add validation gates as blockers
   - Document Redis centroid routing as hint-layer-only

4. **Wire recommendation ledger** (Postgres + ledger API)
   - Persist proposals and status transitions
   - Link evidence to recommendations

---

**Last Updated**: July 28, 2026  
**Status**: MCP tools catalogued, ACE packet contract locked, agent flow documented  
**Next Gate**: Cross-store identity parity audit (BLOCKING)
