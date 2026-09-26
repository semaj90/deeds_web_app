# Parent Atlas Capability Census V5

Read-only completeness audit for the Parent Atlas utility/control plane. It answers **what exists, what is proven, what is waiting, and what is optional** without creating a second task or data authority.

## Architectural rule

Parent Atlas should be a utility/control plane with an SSR admin surface, but not every experimental substrate is promotion-critical.

### P10 critical
- canonical PostgreSQL identity/revision joins and their B-tree indexes;
- PostgreSQL GIN/tsvector canonical joinback when lexical FTS is in the gate;
- Qdrant semantic collection + lineage payload identity;
- cuVS exact oracle/current-cohort parity;
- live candidate/readback gates.

### Utility required
- Drizzle/PostgreSQL schema ownership;
- `.okf` schema + topic/concept/domain taxonomy if directory/domain navigation depends on it;
- file/tree-node/Graphify relation graph;
- ContextManifest + ACE packet contract;
- Parent Atlas ACE residency, Valkey centroid cache, BitFrost warm proof;
- ACP/A2A/HITL contracts as used by execution workflows;
- SSR admin board/read model.

### Challenger/optional
- pgvector HNSW (good local Postgres ANN challenger/fallback; not semantic identity owner);
- cuVS CAGRA (GPU ANN executor; exact oracle remains separate);
- Neo4j projection, NetworkX helper, KMeans, SOM 20x20, 5D manifold/locality, forest sampling;
- PyTorch preference/RL lane;
- NES/chrom/glyph-97/sprite and LOD-memory visualization/encoding experiments.

## Index ownership

Use B-tree for canonical IDs, revision columns, sortable/join keys and uniqueness. Use GIN for `tsvector` and selected JSONB/array/search structures. Do not replace ordinary unique B-tree identity indexes with `btree_gin` just because it exists.

pgvector may provide exact search and HNSW inside PostgreSQL. Qdrant remains the persistent semantic retrieval service if that is the admitted owner; Qdrant HNSW is its dense ANN index and payload indexes should cover restrictive lineage filters (`packet_key`, `symbol_version_id`, revisions, representation identity) when those are used in filtering.

cuVS exact is the GPU oracle/executor candidate; CAGRA is ANN. **Naming collision:** NVIDIA cuVS also uses `ACE` for *Augmented Core Extraction* in CAGRA builds. Never call that `ACE` unqualified in Parent Atlas. Use names like `ATLAS_ACE_RESIDENCY` and `CUVS_CAGRA_ACE_BUILD`.

## Run

```bash
npm run atlas:docs:execution-controller
npm run atlas:docs:blocker-audit
npm run atlas:docs:p10-critical-path
npm run atlas:docs:capability-census
npm run atlas:test:capability-census
```

The report is `docs/reports/parent-atlas-capability-census-v1.json`.

`PRESENT_CONTRACT` is deliberately weaker than `PROVEN`. File/keyword presence cannot authorize promotion.
