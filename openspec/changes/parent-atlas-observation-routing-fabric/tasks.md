# Parent Atlas Observation Routing Fabric (ORF) — proof sequence

Date frozen: 2026-08-19

## Purpose

Compile already-grounded AST / ontology / extraction / graph / lexical evidence into one revision-qualified, interpretable routing fabric before adding more model complexity.

This tranche does **not** replace Tree-sitter identity, PostgreSQL packet/source authority, the semantic_512 exact oracle, graph authority, or ContextManifest exact promotion.

## Frozen boundaries

```text
Tree-sitter / ast-grep / grounded extraction / ontology tuples
                         |
                         v
             ObservationFeatureProjectionV1
                         |
        +----------------+----------------+
        |                |                |
        v                v                v
    Postgres          Qdrant          .okf/MCP
 exact filters     payload hints     stable resources
        |                |                |
        +----------------+----------------+
                         |
                         v
             RetrievalRouterFeatureRowV1
                         |
               tiny router / XGBoost
                         |
                         v
                RetrievalPlanV1
                         |
  lexical + semantic_512 + AST + graph executors
                         |
                         v
                  exact promotion
                         |
                         v
                  ContextManifestV1
                         |
                         v
                    synthesis
```

### Identity

- PostgreSQL owns `packet_key` / `source_ref` identity.
- `tree_node_id` is Tree-sitter/GIS structural evidence and may not be fabricated.
- `source_revision` is NOT required while no canonical live owner exists; source freshness is carried by source-version/mutation receipts.
- Qdrant point IDs, KMeans cluster IDs, SOM cells, PageRank scores and MCP URIs never mint packet identity.

### Representation

- Current persisted code semantic representation: `semantic_512` (EmbeddingGemma MRL prefix + L2 normalization).
- EmbeddingGemma native width `768` is model lineage, not source identity.
- `latent_64` is AE-derived routing geometry only.
- Candidate buckets `32/64/128/256/512` are row counts, not vector dimensions.
- Existing broad `FeatureMatrixRowV1` still contains legacy hard-coded 768 assumptions; ORF is additive and representation-explicit rather than silently rewriting that owner.

### External documentation

- Existing `external_programming_docs_768`, `external_api_examples`, and `external_error_fixes` are legacy projections and remain untouched during this tranche.
- Target shape is one evidence-family collection (programming docs) with fixed indexed payload fields and flattened `key=value` tags.
- A new 512 representation may only become the active external-doc semantic projection after a dry-run migration proves identity coverage and retrieval parity against the existing 768 corpus.
- Never use a zero-vector embedding fallback as valid indexed evidence. Embedding failure must produce a failed/degraded receipt instead.

### MCP

- Current app dependency is `@modelcontextprotocol/sdk@1.22.0`.
- Stable resource URIs are frozen now under `atlas://okf/...`.
- Existing MCP v1 may expose read-only resources using its resource API.
- MCP protocol `2026-07-28` cache hints (`ttlMs`, `cacheScope`) and full JSON Schema 2020-12 behavior require a separately proven v2 SDK migration. Do not claim those wire semantics while running SDK v1.22.0.

## Feature vocabulary

ORF-1 freezes two 32-wide deterministic masks:

- `ontologyMask[32]`
- `astPatternMask[32]`

Open-ended categorical properties use flattened exact tags such as:

```text
ontology=database
ast=database_write
extract=algorithm
vendor=qdrant
family=vector-db
subject=payload-index
```

Tags are metadata/filter hints, not independent retrieval votes.

## Proof gates

- [x] ORF-0 — Existing owners audited: OKF registry, ontology-linked tuples, legacy FeatureMatrix, multicore MCP boundary, external-doc Qdrant scripts.
- [x] ORF-1 — `ObservationFeatureProjectionV1` implemented: fixed ontology/AST masks, grounded structural booleans, LangExtract classes, flattened tags, evidence refs, source/representation lineage.
- [x] ORF-1P — Run via `npx vitest run src/lib/server/atlas/contracts/observation-routing-fabric.spec.ts`: 3/3 pass. Test 1 directly proves digest stability (`buildObservationFeatureProjectionV1` called twice on identical input → `first.inputDigest === second.inputDigest`, plus mask length/flattened-tag correctness). Test 2 proves ORF-5's router row keeps `semantic_768`/`latent_64` as distinct, non-conflated representations. Test 3 proves `ORF_IDENTITY_MISMATCH` is thrown on packet-key drift between observation and router row.
- [x] ORF-2 — Postgres exact-filter plane applied live 2026-08-24: the
  packet-key migration (`drizzle/manual/20260819_atlas_observation_feature_rows.sql`,
  `(packet_key, feature_revision)`, matches Drizzle schema/materializer/
  exporter) was run via `docker exec -i legal-ai-postgres psql < ...`.
  Table confirmed empty at apply time (`SELECT count(*)` = 0 both before
  the file existed live at all and immediately after — pure creation, no
  data touched). The conflicting `..._v1.sql` (`(candidate_id,
  workspace_revision)` + `semantic_768`) was never applied and was never
  going to be reconciled by applying it as-is (would silently no-op the
  `CREATE TABLE IF NOT EXISTS` for the now-existing table rather than
  error) — annotated in place with a "SUPERSEDED — DO NOT APPLY" banner
  rather than moved or deleted, since it also defines the separate,
  non-conflicting `atlas_observation_records` table that this change did
  not touch. Reconciling that table name collision (candidate_id/
  semantic_768 shape, if still wanted, needs a new non-colliding name) is
  still open, tracked by ORF-2R below, not resolved by this checkbox.
- [ ] ORF-2R — Reconcile the exported `packages/parent-atlas` observation repository: it is currently an unused legacy writer targeting `candidate_id + workspace_revision` and a second `semantic_768` owner. Either adapt it to the packet-key exact-filter projection or explicitly split it into a separately named staging repository before enabling any caller.
- [x] ORF-2R.1 — Legacy repository now fails closed unless callers explicitly opt into `LEGACY_CANDIDATE_VECTOR_V1`; no caller was enabled.
- [x] ORF-2P — PostgreSQL 18 proof captured read-only in
  `docs/reports/orf-postgres-plan-receipt.json`: PostgreSQL 18.4, AIO worker
  settings recorded, and the packet-key feature-revision index was used in an
  `Index Scan`. The table currently has zero rows, so a Bitmap Heap Scan and
  populated-row selectivity remain pending after the feature materializer runs;
  this checkbox does not claim bitmap execution yet.
- [x] ORF-2Q — Read-only materialization planning added at
  `scripts/atlas/plan-observation-feature-materialization.mjs`. The bounded
  plan validates the existing AST identity/domain JSONL against the packet-key
  ORF shape without importing the writer or touching Postgres. Source
  revision is reported as lineage coverage, not treated as a hard ORF blocker
  because `sourceVersionReceiptId` is optional in the active contract. The
  identity enricher now preserves exporter-provided revisions instead of
  replacing them with a placeholder. Full read-only planning now finds
  `42,398/42,398` structurally eligible rows: `34,041` have a primary domain
  candidate and `8,357` are explicitly marked `general` fallback candidates.
  The planner also checks ORF primary-key collisions: multiple AST symbols
  share a packet key, so materialization must aggregate by
  `(packet_key, feature_revision)` rather than insert one row per symbol. The
  current full plan reduces `42,398` AST candidates to `1,808` unique ORF
  keys, with `1,698` collision groups and `40,590` colliding rows. No label is
  promoted by this plan; domain, aggregation, and identity review remain
  required before any apply.
- [x] ORF-2Q.1 — Deterministic packet aggregation emitted by
  `scripts/atlas/aggregate-observation-feature-plan.mjs`. The review JSONL
  preserves symbol names/kinds, unions AST observations and domain tags, and
  carries per-row digests. It emits `1,808` packet-level projection rows from
  `42,398` AST rows with `canonicalWrite=false`; it does not call the live
  materializer.
- [x] ORF-2Q.2 — The plan materialized live, for real, 2026-08-24 via new
  `scripts/atlas/materialize-observation-feature-rows.mjs`: `1,808/1,808`
  attempted, `1,808` materialized, `0` validation errors. Uses the real
  Zod-validated `buildObservationFeatureProjectionV1()` builder (correct
  deterministic mask/flag computation, unchanged from the real materializer)
  but writes via a direct `pg.Pool` INSERT (identical SQL to
  `observation-feature-materializer.ts`) rather than importing that file's
  `pool` from `$lib/server/db/client.js` — that import reads
  `ENV.DATABASE_URL` through SvelteKit's `$env/dynamic/private`, which is
  unpopulated outside a real Vite/SvelteKit runtime; confirmed live via a
  first attempt that failed with `SASL: ... client password must be a
  string` before switching to the `pg.Pool` + `loadAtlasEnv` pattern that
  worked reliably all session. **Deliberately maps only `astObservationKinds`**
  from the plan (values like `FUNCTION_DECL`/`VARIABLE_DECL` already match
  `ORF_AST_OBSERVATION_KINDS` exactly) — `ontologyClasses` and
  `langextractClasses` are left empty, not guessed, because the plan's
  `primaryDomains` (`ml`, `agent`, `general`, ...) are domain-classifier
  labels, not members of the schema's fixed `ORF_ONTOLOGY_CLASSES` enum
  (`DATABASE`, `RETRIEVAL`, `API`, ...) — mapping one onto the other without
  review is exactly what ORF-2Q's own note warned against. Verified live via
  `docker exec ... psql`: `SELECT count(*) FROM atlas_observation_feature_rows`
  = `1808` (exact match to the plan's unique-key count); sample rows show
  correct `ast_observation_kinds` and `structural_flags` (e.g.
  `hasFunction=true` for rows with `FUNCTION_DECL`). Repo-wide:
  `hasFunction=983`, `hasDatabaseAccess=0`, `hasTest=0` — the latter two are
  `0` because the underlying AST-grep observation set feeding this plan
  never emits `DATABASE_CALL`/`TEST_CASE` kinds (the extractor's pattern set
  only covers function/class/interface/type/import declarations — see
  NE-06), not a bug in this materialization step. `ontologyClasses`/
  `langextractClasses` mapping (ORF-1's domain/extract vocabulary) remains
  explicitly open, tracked separately, not silently filled in by this
  checkbox.
- [x] ORF-3C — `ExternalDocProjectionV1` target contract implemented for one programming-doc evidence family: semantic_512 lineage, selective indexed fields, flattened tags, cluster/community/PageRank payload hints.
- [ ] ORF-3 — Qdrant collection/materializer implementation after migration dry-run proves the target is safe.
- [ ] ORF-3A — External-doc 768→512 migration dry run. Reject zero vectors; preserve document/chunk checksums; compare Recall@K and exact identity before apply.
- [ ] ORF-3P — Qdrant payload-index benchmark: indexed selective fields vs unindexed/nested variants; record memory/storage cost and latency.
- [x] ORF-4 — `ClusterFeatureProjectionV1` implemented: semantic_512/latent_64 lineage, KMeans/SOM/community revisions, probability/distance values, `evidenceAuthority=false`.
- [x] ORF-4P — No test file existed for `cluster-feature-projection-v1.ts`
  before this (only imported by the materializer, never tested) — wrote
  `cluster-feature-projection-v1.spec.ts`, 4/4 pass:
  `evidenceAuthority` stays `false` even when a caller spoofs `true` at
  runtime (bypassing the type-level `Omit`, not just a compile-time check);
  `projectionDigest` is deterministic for identical input; changing
  `kmeans.clusterId` alone changes the digest (routing hints are real
  projection content) while `packetKey`/`sourceRef` stay untouched by which
  cluster a row lands in (the actual "cannot become packet identity"
  claim); all-null KMeans/SOM/community fields (no clustering run yet)
  validate without error.
- [x] ORF-5 — `RetrievalRouterFeatureRowV1` implemented as representation-explicit semantic_512 + optional latent_64 + structure/ontology/lexical/graph/cluster/temporal/evidence signals.
- [ ] ORF-5P — Run router-row contract tests; freeze stable numeric flattening order for PyTorch/XGBoost input tensor.
  **Scope decision (2026-08-24, operator-directed):** the router-row
  contract tests already exist and pass (see `observation-routing-fabric.spec.ts`
  test 2, run under ORF-1P — it builds a full `RetrievalRouterFeatureRowV1`
  and asserts `semantic`/`latent` dimensions and `rowDigest` shape, but does
  **not** yet freeze a numeric flattening order). The numeric
  flatten-to-tensor step itself does not exist anywhere in this repo yet
  (`retrieval-router-feature-row-v1.ts` has no `toTensor`/flatten function).
  Operator direction: that flattening function belongs on the **Python/
  PyTorch (aten) GPU side** (matching this repo's existing
  `python/atlas_compute/*` executors and the GPU/CPU split established
  elsewhere in `parent-atlas-neural-prefill-encoder`), not as new
  TypeScript in `sveltekit-frontend`. Do not build a TS tensor-flattening
  implementation for this. Remaining work: define the frozen field order as
  a shared contract (e.g. an ordered list of `RetrievalRouterFeatureRowV1`
  field paths) that both the TS row builder and the Python consumer agree
  on, then implement the actual flatten in Python.
- [x] ORF-6A — Protocol-neutral `.okf` MCP resource catalog implemented with stable `atlas://okf/...` URIs and intended cache policies.
- [x] ORF-6B — MCP v1 registration adapter implemented using read-only resources; no 2026 cache-hint wire claim.
- [x] ORF-6C — Wired `buildDefaultAtlasMcpSurface()` into
  `sveltekit-frontend/scripts/mcp-multicore-server.mjs` via
  `server.registerResource()` per manifest resource, reusing the file's own
  `resolveWithinRepository()` path-bound and `truncateText()`
  output-truncation helpers (same enforcement as the existing
  `search_codebase` tool) rather than adding a second, unbounded read path.
  **Two real bugs found and fixed on the way, not just wiring**:
  (1) `packages/parent-atlas/package.json`'s `exports` map was missing a
  `./core/okf-mcp-surface` entry — every other `./core/*` module has one,
  this one didn't, so the import would have failed at runtime with
  `ERR_PACKAGE_PATH_NOT_EXPORTED`; added the missing entry (purely
  additive). (2) the manifest's 3 resource `source_ref` paths all point at
  `docs/.okf/domains/{retrieval,structured-value,feature-intelligence}`,
  and that `docs/.okf/domains/` directory does not exist at all — confirmed
  live via `ls`. Rather than fabricate placeholder ontology content to make
  reads "succeed," the read callback returns an honest
  `RESOURCE_SOURCE_UNAVAILABLE` JSON error (`source file does not exist
  yet`) instead of crashing or inventing content. **Full live stdio smoke
  proof** (real MCP protocol messages over stdin/stdout, not a mocked
  client): `initialize` → capabilities correctly advertise
  `resources: {listChanged: true}`; `resources/list` → all 3 resources
  returned with correct `uri`/`name`/`description`/`mimeType`;
  `resources/read` on `atlas://okf/domains/retrieval` → correctly returns
  the `RESOURCE_SOURCE_UNAVAILABLE` error rather than a 500/crash. Output/
  file bounds are enforced by construction (shared helpers with the
  existing tool), not separately re-verified with an out-of-bounds probe
  this pass. The underlying `docs/.okf/domains/*` content gap is a
  separate, real, still-open item — not fixed by this wiring.
- [ ] ORF-6D — MCP 2026-07-28 / TypeScript SDK v2 migration proof: header routing, resource cache hints, list/result caching and JSON Schema 2020-12 tool schemas.
- [ ] ORF-7 — Bounded MCP read tools for search/evidence/graph/hydrate. Existing receipt/time/output limits remain mandatory.
- [ ] ORF-8 — Ornith ContextManifest adapter consumes promoted ORF evidence only; ontology/schema resources are referenced by digest/URI rather than reprefilled wholesale.
- [ ] ORF-9 — Exact-promotion gate combines source freshness + source span + Tree-sitter coordinate + compiler semantic evidence.
- [ ] ORF-10 — Routing evaluation: compare static policy vs XGBoost/tiny PyTorch router on retrieval success, Recall@K, execution success, latency, VRAM/CPU work and regression rate.

## Postgres target (ORF-2)

Implemented table:

```text
atlas_observation_feature_rows
----------------------------------------
packet_key + feature_revision    PRIMARY KEY
source_ref
source_version_receipt_id
workspace_revision
representation_id
representation_revision
tree_node_id
ontology_classes[]
ast_observation_kinds[]
langextract_classes[]
flattened_tags[]
ontology_mask jsonb
ast_pattern_mask jsonb
structural_flags jsonb
evidence_refs[]
kmeans_cluster_id nullable
som_row/som_col nullable
community_id nullable
pagerank nullable
personalized_pagerank nullable
producer_revision
input_digest
created_at / updated_at
```

Selective indexes:

```text
BTREE (source_ref)
BTREE (workspace_revision, feature_revision)
BTREE (representation_id, representation_revision)
BTREE (tree_node_id)
BTREE (kmeans_cluster_id)
BTREE (som_row, som_col)
BTREE (community_id)
GIN   (ontology_classes)
GIN   (ast_observation_kinds)
GIN   (langextract_classes)
GIN   (flattened_tags)
```

The table is intended to be managed by `drizzle/manual/20260819_atlas_observation_feature_rows.sql` and excluded from ordinary Drizzle generation so this additive plane can be proven independently of unrelated schema drift. Do not apply either same-named migration until the duplicate contract is reconciled; see `docs/reports/atlas-observation-feature-row-contract-v1.json`.

Do not add pgvector HNSW here by default. Existing Qdrant/cached GPU semantic executors already own the main ANN workload; Postgres vector use is a bounded exact/join mirror only if a later proof needs it.

## Qdrant target (ORF-3)

Do not split collections by tag or KMeans cell.

Target collection contract:

```text
external_programming_docs_hybrid_512_v1
representation_id = semantic_512
native_model_dimension = 768
projection_method = embeddinggemma-mrl-prefix-renorm
```

Target payload shape:

```json
{
  "chunk_id": "...",
  "source_id": "qdrant",
  "document_checksum": "...",
  "chunk_checksum": "...",
  "source_ref": "...",
  "domain_class": "retrieval",
  "ontology_classes": ["API", "RETRIEVAL", "ALGORITHM"],
  "language": "en",
  "kmeans_cluster_id": 17,
  "som_cell": "08:13",
  "community_id": "41",
  "pagerank": 0.00183,
  "tags": ["vendor=qdrant", "family=vector-db", "subject=payload-index"],
  "representation_id": "semantic_512",
  "representation_revision": "...",
  "producer_revision": "..."
}
```

Index only fields demonstrated to constrain real searches. Cluster/SOM/community values are payload priors, never collection identity.

## Promotion invariant

```text
retrieval hints / router
        |
        v
bounded candidates
        |
        v
exact semantic / lexical / AST / graph evidence
        |
        v
source mutation gate
        |
        v
exact source + structural + compiler promotion
        |
        v
ContextManifestV1
```

A router chooses work. It does not create evidence truth.

## Recommended next steps (2026-08-24, not yet started)

Written up on request, not implemented this session — no new code or live
writes below this line.

### 1. Re-run ORF-2P's PostgreSQL 18 AIO/bitmap proof against real data (highest value, lowest cost)

`docs/reports/orf-postgres-plan-receipt.json` was captured when
`atlas_observation_feature_rows` had **zero rows**; ORF-2P's own note says
"Bitmap Heap Scan and populated-row selectivity remain pending after the
feature materializer runs." The materializer has since run for real (ORF-2Q.2,
this session): the table now has 1,808 rows with genuinely populated
`ontology_classes`/`ast_observation_kinds`/`flattened_tags`. Re-running
`node scripts/atlas/orf-postgres-plan-proof.mjs` now (read-only, same script,
no code changes needed) should produce a real `Bitmap Heap Scan` plan node
where the prior receipt only had `Index Scan` on an empty table — this is the
single cheapest way to close out ORF-2P's remaining claim. Do this before
anything else below; it's a rerun, not new work.

### 2. `docs/.okf/domains/*` content gap (blocks the 3 resources ORF-6C wired)

ORF-6C's live smoke test confirmed `docs/.okf/domains/{retrieval,
structured-value,feature-intelligence}` don't exist. Two existing, already-
`WIRED` pipelines are the right tools, not new ones — reuse, don't rebuild
(per this repo's Duplication Prevention rule):

- **Acquisition**: `scripts/docs-atlas/crawl-okf-dev-docs.mts` →
  `python/atlas_external_docs.py` → `scripts/docs-atlas/fetch-beautifulsoup.py`
  (Firecrawl → BeautifulSoup → native fallback chain, already proven this
  session's sibling doc-acquisition work — see `docs/.okf/dev/corpus.jsonl`
  for a working example output shape). Point it at real external sources for
  the retrieval/structured-value/feature-intelligence vocabularies instead of
  the `docs/.okf/dev` target already exercised.
- **Symbol/concept indexing**: `scripts/docs-atlas/index-okf-dev-corpus.mjs`
  (same pattern, dry-run-proven already) to turn the crawled corpus into the
  `symbol-index.jsonl`/`summary.json` shape the `.okf` resource descriptors
  expect (`mime_type: application/yaml`, per `okf-mcp-surface.ts`).
- **Validation before promotion**: run the crawled/authored content through
  `parent-atlas-workstation-domain-classifier.ts` (already live, sidecar-
  backed per CHUNK0) to classify and cross-check domain coverage, not as a
  rubber stamp — reject content that doesn't classify cleanly into the
  intended domain rather than writing it anyway.
- **Docs/screenshots/citations**: this repo already has evidence-citation
  infrastructure (`saved_citations` table, evidence pipeline's provenance
  fields) — new `.okf` domain docs should carry the same source-attribution
  discipline (source URL, fetch timestamp, checksum) as evidence ingestion
  does, not a separate ad hoc citation format. Reuse that shape rather than
  inventing a docs-specific one.
- **Scope warning**: do not let this become "author the ontology content
  freehand." The whole point of routing through BeautifulSoup/Firecrawl
  crawling + the domain classifier is that the content is sourced and
  validated, not fabricated to make ORF-6C's resource reads stop returning
  `RESOURCE_SOURCE_UNAVAILABLE`.

### 3. PG18 AIO/bitmap for `pg_fts`, not just ORF's own table

The live audit (`docs/reports/atlas-indexing-surfaces-v1.json`) already
records `lexicalOwner: POSTGRES_FTS_TSVECTOR_GIN_TS_RANK_CD` as the canonical
FTS owner — this is not a proposal to replace it. The concrete, additive
opportunity: `atlas_observation_feature_rows` now has 3 populated GIN indexes
(`ontology_classes`, `ast_observation_kinds`, `langextract_classes`) sitting
next to whatever table owns `search_vector`/`ts_rank_cd`. PostgreSQL can
combine *multiple* GIN/BTREE indexes into one in-memory bitmap (AND/OR) before
touching heap pages — so a query like "FTS match AND ontology=DATABASE" can
plan as a **BitmapAnd** across the FTS GIN index and this table's
`ontology_classes` GIN index, visited once, rather than two separate scans
joined in a later step. This requires the two tables to actually be joined on
`packet_key` in a real query (not yet written) and then `EXPLAIN (ANALYZE,
BUFFERS)`-verified to confirm PG18 actually chooses `BitmapAnd` over a nested
loop — do not assume the planner picks it; prove it, same discipline as
ORF-2P. Not started; a natural follow-on to step 1 once real bitmap-plan
evidence exists to compare against.

### Suggested order

1 (rerun, ~minutes) → 2 (real acquisition + validation work, largest lift) →
3 (depends on 1's real bitmap-plan baseline existing first).
