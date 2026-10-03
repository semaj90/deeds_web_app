# ACE query-scoped authoritative feature bundle — temporal addendum (2026-09-12)

Historical task ledgers remain unchanged. This addendum records the implementation
needed to move ACE caller adoption from static wiring toward one read-only live
revision-qualified caller without creating another identity, retrieval, semantic,
or cache owner.

## Implemented

- [x] `ACE-STRICT-PROJECTION-01` — added a strict semantic projection candidate
  mapper that preserves physical Qdrant/Postgres join identity plus representation,
  projection, and model revision metadata. Qdrant workspace/source revision payloads
  remain non-authoritative.
- [x] `ACE-STRICT-PROJECTION-02` — added an exact semantic projection query helper
  whose collection is explicit and mandatory. It does not choose between
  `codebase_chunks_768` and `_v2` while semantic physical projection ownership is
  still under reconciliation.
- [x] `ACE-REVISION-HYDRATION-01` — added revision-qualified hydration using the
  current-source join already proven by `export-current-source-chunk-cohort-v1.mjs`:
  `atlas_workspace_source_bindings -> atlas_packet_chunk_lineage -> codebase_chunk_index`.
  Missing, ambiguous, wrong-workspace, stale-source, chunk/source/hash-mismatched, or
  unqualified semantic projection candidates fail closed. No path-suffix, array-index,
  Qdrant-ID, or semantic-similarity identity inference is permitted.
- [x] `ACE-ORDINAL-SELECTION-01` — added `CandidateOrdinalSelectionV1`. The corpus-wide
  `CandidateOrdinalMapV1` remains immutable; a query carries only selected existing
  ordinals and the original ordinal-map checksum. No query-local re-numbering occurs.
- [x] `ACE-FEATURE-SELECTION-01` — added a query-scoped feature-selection snapshot.
  Rows must match the selected canonical ordinal identities and exact source/workspace,
  graph, and semantic revisions from the admitted ordinal map. Semantic evidence is
  rejected when `semanticRevision` is absent; graph evidence is rejected when
  `graphRevision` is absent.
- [x] `ACE-SERVER-BUNDLE-V2-01` — added `ServerFeatureBundleV2`, binding the immutable
  corpus ordinal map, query selection, selected feature snapshot, and
  `RevisionAuthorityEnvelopeV1` by deterministic checksums. Source claims are checked
  only for the selected candidate rows, while the revision envelope remains the
  server-owned workspace authority.
- [x] Focused fixture coverage added for exact revision hydration and for the V2
  query-selection bundle shape. Workstation execution remains required before these
  items may be called test-proven.

## Current ownership / blocking state

```text
CandidateOrdinalMapV1 corpus identity       IMPLEMENTED / CURRENT PRODUCER EXISTS
RevisionAuthorityEnvelopeV1                  IMPLEMENTED / CURRENT MATERIALIZER EXISTS
query-scoped CandidateOrdinalSelectionV1     IMPLEMENTED
query-scoped feature selection snapshot      IMPLEMENTED
ServerFeatureBundleV2                        IMPLEMENTED
revision-qualified semantic hydration        IMPLEMENTED

semantic physical writer authority           UPSTREAM GATE
current semantic corpus revision              NOT YET ADMITTED
semanticRevision on current chunk map         NULL BY DESIGN UNTIL CORPUS ADMISSION
live ACE V2 caller                            BLOCKED ON SEMANTIC CORPUS ADMISSION
```

The V1 server bundle remains historical/compatibility behavior and is not rewritten.
Its full-map/full-snapshot cardinality requirement is not suitable for a real query
selection over a corpus-wide ordinal map; V2 resolves that without minting new
CandidateOrdinal identities.

## Next gate

`ACE-LIVE-QUERY-BUNDLE-01` may run only after the semantic owner/corpus lane emits an
admitted `semanticRevision` for the same workspace/source cohort. Then:

1. bind that admitted semantic revision to the existing canonical chunk identities;
2. run an exact semantic query through the explicitly selected executor;
3. revision-hydrate every hit through PostgreSQL current lineage;
4. map hits to existing CandidateOrdinals;
5. create `CandidateOrdinalSelectionV1`;
6. create the semantic-only selected feature snapshot;
7. build and verify `ServerFeatureBundleV2`;
8. run ACE in shadow/read-only mode;
9. compare selected canonical identities and ContextManifest evidence without cache,
   ranking, canonical, vector, graph, or projection mutation.

Ontology is not a prerequisite for this semantic-only proof. Current ontology rows
remain outside the selected feature snapshot until current-workspace source/span
provenance is separately admitted.

No Postgres, Qdrant, Neo4j, Valkey, cache, model, ranking, route, or canonical
projection writes are authorized by this addendum.
