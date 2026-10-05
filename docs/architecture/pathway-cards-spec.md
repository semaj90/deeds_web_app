# Pathway Cards: Architectural Specification

**Status**: REVISED 2026-10-05 | **Implementation**: spec + Drizzle declaration + 2 MCP tools; `graph_pathway_cards` DDL NOT applied, 0 cards ever written | **Authority**: derived, non-canonical

## TL;DR
A Pathway Card is a **durable derived evidence product**: a graph path plus a synthesized narrative, pinned to the exact graph/workspace/evidence revisions it was built from. It is a cache of expensive multi-hop reasoning (GraphRAG community summaries, HippoRAG PPR retrieval, PathRAG path pruning), never canonical truth. Its claims stay derivative of the evidence revisions it cites, and it goes stale when any of them change.

Until source authority (`GPH-SOURCE-AUTHORITY-01`), PacketKeyV2 endpoint identity and a current graph revision exist, AST-derived paths can only be `PathwayCandidateV1` (`OBSERVATION_ONLY`), not admitted cards.

## Pipeline
```
admitted packets/sources -> qualified structural incidence -> GraphSnapshotV1
  -> traversal / PPR / path pruning -> PathwayCandidateV1 (OBSERVATION_ONLY)
  -> evidence validation -> LLM synthesis -> PathwayCardV1
  -> Postgres (derived artifact) -> Qdrant / BitFrost / ACE projections
```
Postgres holds the card; Qdrant, Redis/BitFrost and ACE hold rebuildable projections. Never answer from a projection without a Postgres join.

## Identity (two hashes; the query never defines identity)
| Id | Definition | Purpose |
|----|-----------|---------|
| `path_identity` | `sha256(ordered canonical node ids, ordered canonical edge ids, graph_revision, workspace_revision)` | same path on the same snapshot |
| `pathway_card_id` | `sha256(path_identity, evidence_revision_set, synthesis_model_revision, prompt_template_revision, ontology_revision)` | one specific synthesized card |
| `query_signature` | hash of the normalized query | routing/reuse only, never identity |

Full 256-bit hashes; no truncation. The old `sha256(start:end:summary_head)` (16 hex chars) is retired: it is keyed on summary text, only 64 bits, and the upsert overwrote an existing card on collision.

## Data structure (target; see appendix for proposed DDL)
| Field | Description |
|-------|-------------|
| `pathway_card_id`, `path_identity` | identities above |
| `workspace_revision`, `graph_revision`, `ontology_revision?`, `representation_revision` | lineage; a card without them cannot be admitted |
| `path_nodes[]` | `{ordinal, canonicalId, packetKey, symbolVersionId, sourceRevision, nodeType}`; never bare names. Optional compact `nodeOrdinal[]` for GPU/BitFrost (ordinals are LUT projections, never identity) |
| `path_edges[]` | `{edgeId, relation, relationRevision}` |
| `evidence[]` | `{evidenceRef, canonicalId, packetKey, sourceRef, sourceRevision, startByte, endByte, relationId?, relationRevision?, evidenceChecksum}` replaces `citation_spans` |
| `summary` | synthesized narrative (1-3 paragraphs), derived text |
| `authority` | `{algorithm:'PAGERANK', graphRevision, min, mean, max, pathScore, scoringRevision}`; a path has no single PageRank. PPR is a retrieval signal, not evidence |
| `path_quality` | `{length, redundancyScore, coverageScore, relationDiversity, evidenceDensity, unresolvedHopCount, pruningAlgorithm, pruningRevision}` (PathRAG-style pruning feeds ACE routing) |
| `status`, `stale_reasons[]` | lifecycle below |
| `semantic_representation` | `{kind:'semantic_768', modelRevision, recipeRevision, inputChecksum, vectorRevision}` plus the 768-d vector. Recipe is the document form `title: {title} | text: {summary}` from `embedding-contract-768`, never `unprompted_legacy`. Same dimension is not the same representation space: `:8081`, `:8082` and Ollama `embeddinggemma` outputs must not be mixed without a parity receipt |
| `synthesis` | `{model, modelRevision, adapterRevision?, promptTemplateRevision, contextManifestChecksum, inputEvidenceChecksum, generatedAt, hallucinationCheck?, citationCoverage?}`; synthesis identity = path checksum + ContextManifest checksum + model revision + prompt revision + evidence revisions |
| `topology?` | optional `{representation:'SOM_4D', coordinates:[x,y,z,w], modelRevision, snapshotRevision}`, present only when an admitted manifold artifact exists. Navigation only: card validity never depends on it, so retraining the SOM does not invalidate valid evidence |
| `canonical_authority` | always `false` |

## Lifecycle and invalidation
States: `ACTIVE`, `STALE`, `SUPERSEDED`, `INVALIDATED`, `REBUILD_REQUIRED`. A card is never deleted; it is superseded or invalidated.

| Stale reason | Trigger | Action |
|--------------|---------|--------|
| `STRUCTURAL_STALE` | source/workspace/graph revision or path membership changed | re-traverse |
| `EVIDENCE_STALE` | a cited `evidenceChecksum` changed | re-validate, re-synthesize |
| `ONTOLOGY_STALE` | ontology revision changed | re-classify, maybe re-embed |
| `SYNTHESIS_STALE` | model or prompt/template revision changed | re-synthesize only if policy requires |

## Write path (gated)
1. The server computes identity and lineage; the caller never supplies them.
2. A validator checks every node/edge/evidence reference against admitted Postgres rows and recomputes checksums before insert.
3. Caller-supplied `pathSteps`, `citationSpans` and `pagerankScore` are inputs to validation, not trusted values.
4. No silent fallback to another table. If the card table is absent or the insert fails, return a typed failure.
5. Candidates that fail admission stay `PathwayCandidateV1` / `OBSERVATION_ONLY`.

## Lifecycle of tools
1. **Synthesis**: `graph.semantic_path_synthesis` traverses Neo4j and hydrates nodes from Postgres (read-only; yields candidates).
2. **Materialization**: `graph.materialize_pathway` is the only writer. It must be governed, not a free model-facing write.
3. **Retrieval**: `kb.search_pathways` returns `ACTIVE` cards first and marks `STALE` cards explicitly.

## Integration in retrieval: a logical lane, not a fixed stage
Pathway Cards are a candidate **lane** (a retrieval representation); Neo4j traversal is an executor and the fallback. This keeps lane != executor.
```
query -> lexical | semantic_768 | pathway-card | ontology | graph  (parallel lanes)
      -> fusion -> rerank -> evidence promotion -> ContextManifest -> synthesis
pathway-card hit strong enough? yes -> use cached path evidence (ACTIVE cards only, revisions checked against current graph/workspace)
                                 no  -> live graph expansion -> possibly create a new card
```
Synthesis runs on Ornith 1.5 via llama-server `:8090`; resolve the served model, never hard-code.

## Related artifact: CommunityCardV1 (future, separate)
GraphRAG's notable object is the community report (hierarchical communities summarized before query time). Keep two derived types and do not overload one:
- `CommunityCardV1`: cluster/community-level synthesis ("what is the retrieval subsystem?")
- `PathwayCardV1`: ordered relational-path synthesis ("how does `atlas.query` reach Qdrant and return evidence?")

## Implementation directives
- **Utility-first**: optimize for answer utility and citation faithfulness.
- **Topological grounding is optional**: a card may carry a revision-qualified `topology` projection when an admitted manifold artifact exists; it is navigation, never identity, and never a validity requirement.
- **Postgres holds the card**, as a derived artifact. JSONB for flexible payload fields, plain columns for lineage/status so staleness is queryable.
- **Do not claim** token savings or reuse until real, admitted, query-specific evidence backs them.

## Known defects in the current implementation (not yet fixed)
| Where | Defect |
|-------|--------|
| `trace-mcp-server.ts` `graph.materialize_pathway` | truncated 64-bit key keyed on summary head; `ON CONFLICT` silently overwrites summary/path; `source_hashes` never set so no staleness check; embeds with `unprompted_legacy` |
| same, catch block | any error falls back to `embedded_summaries` (`source_type 'pathway'`) and writes the 768-d embedding into the `manifold4` column |
| `schema/graph-pathway-cards.ts` | `embedding` declared `real[]` while the insert casts to `vector`; no lineage or status columns |
| live DB | `graph_pathway_cards` does not exist; `embedded_summaries` has 0 pathway rows |

## Appendix: proposed DDL (NOT APPLIED; needs the Drizzle Safety Rule review and an explicit apply decision)
Additive sidecar migration (`drizzle/manual/`, `IF NOT EXISTS`), not `drizzle-kit push`. Columns beyond the existing declaration: the lineage and status columns above.
```sql
CREATE TABLE IF NOT EXISTS graph_pathway_cards (
  pathway_card_id        text PRIMARY KEY,           -- sha256 hex, 64 chars
  path_identity          text NOT NULL,
  query_signature        text,
  workspace_revision     text NOT NULL,
  graph_revision         text NOT NULL,
  ontology_revision      text,
  representation_revision text NOT NULL,
  path_nodes             jsonb NOT NULL,
  path_edges             jsonb NOT NULL DEFAULT '[]',
  evidence               jsonb NOT NULL,
  summary                text NOT NULL,
  authority              jsonb NOT NULL,
  path_quality           jsonb NOT NULL,
  status                 text NOT NULL DEFAULT 'ACTIVE'
    CHECK (status IN ('ACTIVE','STALE','SUPERSEDED','INVALIDATED','REBUILD_REQUIRED')),
  stale_reasons          text[] NOT NULL DEFAULT '{}',
  semantic_representation jsonb NOT NULL,            -- {kind, modelRevision, recipeRevision, inputChecksum, vectorRevision}
  embedding              vector(768),
  synthesis              jsonb NOT NULL,             -- model/prompt/context-manifest/evidence provenance
  topology               jsonb,                      -- optional SOM_4D projection; validity never depends on it
  canonical_authority    boolean NOT NULL DEFAULT false CHECK (canonical_authority = false),
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS gpc_path_identity_active_uq ON graph_pathway_cards (path_identity, representation_revision) WHERE status = 'ACTIVE';
CREATE INDEX IF NOT EXISTS gpc_status_workspace ON graph_pathway_cards (status, workspace_revision, graph_revision);
CREATE INDEX IF NOT EXISTS gpc_embedding_hnsw ON graph_pathway_cards USING hnsw (embedding vector_cosine_ops);
```
Open questions for the apply decision: which revision ids are admitted today (graph and workspace revisions are the blockers), whether `path_identity` should also be unique across statuses, and whether `embedding` should follow the `semantic_768` or the `content_embedding` recipe lineage.
