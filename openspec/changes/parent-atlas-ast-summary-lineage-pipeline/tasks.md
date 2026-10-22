# Tasks: AST-grep chunk → symbol → summary lineage pipeline

Status vocabulary follows CLAUDE.md: CREATED, WIRED, PARTIAL, PROVEN, BLOCKED, DONE. A passing unit test does not prove integration. Each DONE item needs its exact command, a revision-qualified input, and an output receipt.

## Resume here (handoff 2026-10-22, end of session)

**Git state**
- PR #120 merged the branch into `origin/main` (`7c9f7026ca`). Commits `3376feb172`, `30c3cf5fa2`, `f5ba83ab7a` are in `origin/main`.
- Branch `chore/parent-atlas-session-2026-10-17` has one commit not in `origin/main`: `4287d6e3ab` (feature-ID census, live MCP checkpoints, read-only script update). It is pushed to origin.
- Local `main` is 48 commits behind `origin/main`. Run `git checkout main && git pull --ff-only` before any `main` work.
- Uncommitted and deliberately excluded: `docs/reports/document-governance-registry-v2.json` (10.99 MB, over the 10 MB limit) and four submodule pointers (`claude-mem`, `granite-docling-258M`, `models/embeddinggemma_300m`, `turbovec`).
- A stale `.git/index.lock` was removed on 2026-10-22 after confirming the lock was stale; check `git status` before relying on it.

**Decisions waiting on you**
1. Open a PR from `chore/parent-atlas-session-2026-10-17` into `main` for `4287d6e3ab`? (Outward-facing; not done.)
2. Delete the merged branch after PR #120 (remote and local). Not done.
3. Feature labels: make `20261021_feature_identity_v2.sql` the only owner and mark `20261020_atlas_feature_labels_v1.sql` superseded (not deleted). Applying either draft to `legal_ai_db` still needs explicit authorization.
4. `atlas_features` has 0 rows and needs provenance fields that `atlas_feature_map` lacks. Do not populate it from `atlas_feature_map`.
5. Two committed `matrix.arrow.corrupted` files from offline replay: keep as evidence, or move to an archive folder with a manifest.
6. The golden-breadth receipts that failed a naive JSON check parse as UTF-8 (the earlier failure was a Windows codec issue). Nothing to fix there.

**First steps tomorrow (read-only unless noted)**
1. `git fetch && git status -sb`; confirm the branch and remote state above.
2. Run `openspec validate parent-atlas-ast-summary-lineage-pipeline --strict`.
3. Pick the open decisions above; the PR and branch deletion are the first two.
4. Next proof milestone (see §10–§12): one real source file through chunk → symbols → LangExtract spans → Ornith summary proposal → EmbeddingGemma vector → pgvector exact Top-K, with matching identity at every boundary.

## Handoff 2026-10-22 (earlier detail)

Branch `chore/parent-atlas-session-2026-10-17`, commit `30c3cf5fa2`, pushed to origin. `main` was not touched at that point.

| Item | Status | Evidence |
|---|---|---|
| This change (proposal, tasks, spec delta) | CREATED | `openspec validate parent-atlas-ast-summary-lineage-pipeline --strict` passes |
| Language-coverage inventory (separate change, `parent-atlas-nlp-sidecar-feature-compiler`) | PROVEN for the inventory only | Report `.tmp/atlas/language-coverage/20261021T212933-452177ac/inventory.json`, digest `cf7323c3…bf87d` recomputed, 5 Python tests pass with `PYTHONPATH=python` |
| Durable execution journal tables (`0040`, live) | APPLIED | `execution_runs`, `execution_journal_steps`, `execution_side_effects`, `execution_dependencies` exist, 0 rows. `agent_memory_registry` ALTER block skipped (table absent) |
| `feature_label_id` (UUIDv8 via `deriveUUID`) | DRAFT-ONLY ALIAS | Exists only in the incompatible 2026-10-20 draft; absent from live schema and omitted by v2. It is not canonical identity and is not required for model/graph alignment |
| `20261021_feature_identity_v2.sql` (proposed label/concept owner) | DRAFT, NOT APPLIED | Contract test passes 17/17. Defines text `canonical_feature_id`, composite label key `(canonical_feature_id, label_revision)`, reviewed source crosswalk; all v2 tables absent live |
| `svelte-check` baseline | CLEAN, recorded separately from pipeline evidence | 16,215 files, 0 errors, 0 warnings (machine output) |
| Pipeline stages ASTSUM-01…09 | OPEN / BLOCKED (see gates below) | None proven end to end |

**Known conflicts to resolve first**
- Two drafts create `atlas_feature_labels` with different columns, keys, and foreign-key parents. `CREATE TABLE IF NOT EXISTS` would silently keep whichever runs first. The 2026-10-21 v2 is the proposed design owner, but the older 2026-10-20 file remains present and is not explicitly registered as superseded. Resolve/label that conflict before any migration approval; archive, never delete.
- `atlas_features` has 0 rows and needs provenance fields (`tree_node_id`, `content_hash`, `schema_id`, `extractor_version`) that `atlas_feature_map` does not carry. Do not populate it from `atlas_feature_map`.
- `atlas_feature_map` is not unique on `feature_id` (4,748 rows, 3,151 distinct, 4,747 non-null), so it cannot be a foreign-key target.

## Read-only feature-ID/schema census (2026-10-21)

Live check ran in `legal_ai_db` on PostgreSQL 18.4 inside `BEGIN TRANSACTION READ ONLY` (`transaction_read_only=on`). These are current database observations, not migration intent:

| Owner/object | Live finding | Identity/index meaning |
|---|---|---|
| `atlas_feature_labels`, `atlas_feature_concepts`, `atlas_feature_source_identities`, `atlas_feature_concept_crosswalk` | Absent; no live `feature_label_id` column | The 2026-10-20 and 2026-10-21 designs are not installed |
| `atlas_features` | 0 rows; PK `feature_id` text; FKs to AST nodes and schema registry; indexes on namespace/type, tree node, and JSONB labels | AST-derived structural facts, not a populated label dictionary |
| `atlas_fi_features` | 7 rows, all `active`; PK `feature_id` text with `uuidv7()` default; unique `feature_key`; self-FK `parent_feature_id`; indexes on domain/status, feature revision, and metadata | Existing product-feature candidate registry, not the v2 reviewed concept registry |
| `atlas_feature_aliases` | PK `(feature_id, normalized_alias)`; FK to `atlas_fi_features`; btree index on normalized alias | Aliases belong to the product-feature registry, not canonical concept labels |
| `atlas_feature_map` | 4,748 rows; 4,747 non-null and 3,151 distinct `feature_id`; PK `normalized_path`; btree indexes on feature ID, Qdrant point ID, and SOM cluster; no feature-ID FK/unique constraint | A path projection; not a canonical feature-ID target |
| `code_features` | 1,477 rows; PK `feature_id`; unique `(source_ref, symbol, kind)`; indexes on source ref, symbol, kind, language, and domain | No `source_revision` column, so this uniqueness does not prove revision-qualified symbol identity |
| `atlas_feature_evidence` | PK `(packet_key, content_hash, extractor_version)`; indexes on packet key and AST primary-functional-symbol expression; exact row count not taken | Has evidence/source revision fields but no demonstrated canonical-symbol join |
| `atlas_feature_envelopes` | 58,365 rows; PK `packet_key`; FK to `atlas_packets`; indexes on feature ID, source ref, title, and community; stores text `feature_label` | Packet-keyed denormalized envelope, not a label registry |
| `atlas_feature_recommendation_index` | Planner estimate: 1,000 rows | Existing derived analytics projection; not canonical identity or reviewed-label authority |
| `feature_registry`, `feature_maps`, `features`, `feature_records` | `feature_registry` absent; the latter three exist but have 0 rows. `feature_maps` PK `id`; `features` PK `id` and unique `(project_id, feature_key)`; `feature_records` PK UUID `feature_id` | Other schemas do not provide a populated canonical Atlas label owner |

The manual migration names have no match in `drizzle/sidecar-migrations.json` or `drizzle/meta/_journal.json`; the live `drizzle.__drizzle_migrations` table returned zero rows. Independently, all tables created by identity v2 and both candidate `atlas_feature_labels` definitions are absent. No database writes were performed.

### Missing schema gates before mapping or analytics work

1. **Single migration owner:** explicitly supersede/retain the 2026-10-20 label draft and register only the reviewed migration path. Do not apply either draft during this change.
2. **Canonical identity decision:** v2's `canonical_feature_id` text plus `(canonical_feature_id, label_revision)` is the proposed label key. The v1 UUIDv8 `feature_label_id` is only an alias proposal and does not align algorithm outputs; keep it out unless a separately evidenced consumer requires it.
3. **Source-to-symbol mapping:** prove the join from exact source bytes/revision and symbol/span to a namespaced local feature ID. Existing `code_features` lacks source revision; `atlas_feature_evidence` has content/source/extractor lineage but is not yet shown joined to a canonical symbol. Unresolved mappings must abstain.
4. **Reviewed crosswalk and labels:** no mapping is authoritative until a source identity is linked to a canonical concept by a reviewed, evidence-bearing crosswalk and a reviewed label revision. Do not derive semantic truth from UUIDs, KMeans, PageRank, XGBoost, or embeddings.
5. **Analytics shape and indexes:** reuse derived snapshot/artifact contracts first. Add a persistent analytics table or index only after a concrete query, cardinality, `EXPLAIN (ANALYZE, BUFFERS, SETTINGS)` baseline, owner review, and migration/readback plan show a gap. Keep Python dict/tuple and frozen ordinal/bitset representations as derived in-memory/snapshot structures, not identity owners.

## Gates (from the 2026-10-22 review)

Order: frozen source → deterministic extraction → canonical evidence payload → LangExtract + Ornith proposals → EmbeddingGemma vectors → PostgreSQL/pgvector projection. No stage mints canonical AST or packet identity.

| Gate | Deliverable | Status |
|---|---|---|
| ASTSUM-01 | Existing owner/caller inventory | OPEN |
| ASTSUM-02 | Frozen source → `:8095` chunk receipt | OPEN |
| ASTSUM-03 | ast-grep symbols + source-bound LSP observations | OPEN |
| ASTSUM-04 | Canonical source/chunk/symbol/feature-label joins | BLOCKED (lineage) |
| ASTSUM-05 | Python tuple/ordinal reference with deterministic ordering | OPEN |
| ASTSUM-06 | LangExtract grounded-span adapter | OPEN |
| ASTSUM-07 | Ornith `:8090` evidence-grounded summary | OPEN |
| PGVECTOR-01 | Extension, vector-column, index and metric census | OPEN |
| PGVECTOR-02 | Exact-search oracle and embedding-recipe parity | OPEN |
| PGVECTOR-03 | HNSW/IVFFlat benchmark against exact Top-K | NOT AUTHORIZED for production |
| ASTSUM-08 | Independent summary/vector readback | BLOCKED |
| ASTSUM-09 | Governed backfill/admission | BLOCKED |

**Milestone:** one real source file passes every boundary above with matching canonical `sourceRef` and `sourceRevision` at each step. Scaling summary coverage and ANN evaluation come after that.

## Ownership rules (carry into every stage)

- PostgreSQL + pgvector: canonical source-qualified vector record and exact-search reference.
- Qdrant: derived semantic ANN. cuVS: GPU exact/CAGRA executor once admitted. Neo4j/cuGraph: graph projection. Redis/Valkey: cache only.
- Qdrant and cuVS are separate executors, never independent identity or retrieval-vote owners.
- LangExtract produces grounded evidence proposals. Ornith produces derived summaries. EmbeddingGemma produces vectors. None mints identity.
- Summaries and source chunks are different representations. Summary embeddings need their own representation identity and must never overwrite canonical chunk embeddings.
- Data structures: dictionaries for identity lookup, ordered tuples/arrays for frozen ordinal maps, CSR/COO for sparse graph analytics. Do not put linked lists in the hot retrieval path.

## 0. Owner audit (before any build)

- [ ] 0.1 Confirm the `:8095` `/ast/chunk` route is the only chunker owner: `rg -n "ast/chunk" python sveltekit-frontend/src scripts`.
- [ ] 0.2 Classify each existing helper in `scripts/atlas/lib/` (symbol extraction, chunk source path, LSP, shape, lineage) as CANONICAL_OWNER, BACKEND, ADAPTER, EXPERIMENT, or DEAD.
- [ ] 0.3 Record the owner table in `docs/architecture/runtime-ownership-registry.json` only if an entry is missing. Do not add a second owner.

## 1. Chunking (ast-grep / Tree-sitter)

- [ ] 1.1 Run `:8095 /ast/chunk` on a bounded sample (≥3 languages, including `.svelte` and `.ts`). Record chunk count, byte spans, and `scan_completeness`.
- [ ] 1.2 Verify every chunk span round-trips to the exact source bytes (`UTF8_PARSER_BUFFER_V1`).
- [ ] 1.3 Record a `PARTIAL_AST_FAILED` receipt for an unsupported language. Do not fill the gap with a regex chunker.

## 2. Symbol extraction

- [ ] 2.1 Map each chunk to zero or more symbols with `stableSymbolId` (or the existing equivalent). A symbol without a native span is `UNRESOLVED`.
- [ ] 2.2 Keep AST-grep matches as observations. They are not identity.

## 3. LSP language facts (evidence only)

- [ ] 3.1 Use `indexed-source-lsp-v1.mjs` to attach definition and reference facts to symbols. Record the language server version.
- [ ] 3.2 Tag each fact `NOT_RUN` when the server is unavailable. Do not infer a missing fact.

## 4. Canonical payload (sourceRef-keyed)

- [ ] 4.1 Define one payload per chunk: `sourceRef`, `sourceRevision` (whole-file SHA-256 of the exact bytes), chunk byte span, symbol IDs, LSP facts, and `feature_label`.
- [ ] 4.2 Join only on `packet_key` + `source_ref`, or `source_ref` + `sourceRevision`. Never join on `feature_id` alone.
- [ ] 4.3 Validate with Zod at the boundary. Hard-fail on a missing `sourceRef`, `sourceRevision`, or `feature_id`.

## 5. Linked structures and hyperparameter index (Python)

- [ ] 5.1 Store chunk lookups as a dict keyed by `(source_ref, chunk_ordinal)` tuples. Use a linked list only for ordered traversal (for example, parent → child spans).
- [ ] 5.2 Build the hyperparameter index (chunk size, overlap, grammar version, chunker version) as a tuple key, so any run can be reproduced from its key.
- [ ] 5.3 Test that the same input and hyperparameters give the same key and the same output checksum.

## 6. feature_label tie-in (OpenSpec)

- [ ] 6.1 Link a payload only after exact source/symbol lineage resolves through the reviewed crosswalk to the proposed v2 `atlas_feature_labels` owner (`drizzle/manual/20261021_feature_identity_v2.sql`, not applied). Do not join on label text, `atlas_feature_map.feature_id`, or a UUID alias; do not create another label table.
- [ ] 6.2 Record unlabeled chunks as `UNRESOLVED`, not as a default label.

## 7. Summaries (last step)

- [ ] 7.1 Generate summaries with Ornith on `:8090` only from the payload in §4. Pass the spans and symbols, not raw files.
- [ ] 7.2 Reject any summary containing a reasoning marker (`<think>`, `<|channel>`, `chainOfThought`, `hiddenThoughts`) before storage.
- [ ] 7.3 Store `summary_model` and the payload checksum with each summary. A summary with no model provenance is not admitted.
- [ ] 7.4 Do not backfill the existing 40,306 summaries in this change. Their provenance is unproven, so they stay on hold.

## 8. Gates and verification

- [ ] 8.1 Unit tests for each stage, run with `PYTHONPATH=python` for Python and `npm run test:run` (scoped) for TypeScript.
- [ ] 8.2 An end-to-end receipt for one `sourceRef` through all seven stages, with each step's output checksum.
- [ ] 8.3 OpenSpec strict validation: `openspec validate parent-atlas-ast-summary-lineage-pipeline --strict`.

## 9. Gated (needs explicit approval)

- [ ] 9.1 Any Postgres write, including the summary backfill and the `summary_model` column (the column is missing on rows that already have summaries).
- [ ] 9.2 Any index DDL on `codebase_chunk_index` (write-amplified table).
- [ ] 9.3 Starting or stopping llama-server `:8090`. Lifecycle stays with the operator.
- [ ] 9.4 Creating any HNSW or IVFFlat index, altering embedding dimensions, upserting Qdrant, or triggering Graphify daily.

## 10. PGVECTOR-ALIGN-01 (pgvector alignment workstream)

Keep this inside this change. Do not add another embedding or chunk-identity owner. pgvector is either the active exact-search owner or a derived comparison surface, and the census decides which.

- [ ] 10.1 **PGVECTOR-01 census (read-only).** Run against `legal_ai_db` and record the output with the connection fingerprint (`inet_server_port()`, `data_directory`, `version()`):

  ```sql
  SELECT extname, extversion FROM pg_extension WHERE extname = 'vector';

  SELECT table_schema, table_name, column_name, data_type, udt_name
  FROM information_schema.columns
  WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
    AND (udt_name IN ('vector', 'halfvec', 'sparsevec') OR column_name ILIKE '%embedding%')
  ORDER BY table_schema, table_name, column_name;

  SELECT schemaname, tablename, indexname, indexdef
  FROM pg_indexes
  WHERE indexdef ILIKE '%hnsw%' OR indexdef ILIKE '%ivfflat%' OR indexdef ILIKE '%vector_%'
  ORDER BY schemaname, tablename, indexname;
  ```

  Also record: the live retrieval query text and its distance operator, the metric each index's operator class uses, and the row count the query filters to. Operator and operator class must agree (`<=>` with `vector_cosine_ops`, `<#>` with `vector_ip_ops`, `<->` with `vector_l2_ops`).
- [ ] 10.2 **Decide the executor.** Exact search needs no index. Record whether an ordinary B-tree-assisted exact search is faster than any ANN index on the real filter selectivity before proposing one.
- [ ] 10.3 **PGVECTOR-02 parity.** Exact Top-K from pgvector must match a numpy/Python oracle on the same frozen embedding recipe. Record the recipe identity: model digest, tokenizer/preprocessing recipe, pooling, normalization, input content digest, and representation revision. Tie-aware comparison, not set overlap alone.
- [ ] 10.4 **PGVECTOR-03 (not authorized for production).** Any HNSW/IVFFlat benchmark runs only against an exact Top-K oracle, in a scratch comparison, with recall reported tie-aware.
- [ ] 10.5 Qdrant and cuVS stay separate executors. Each is checked for parity against PostgreSQL, and neither casts a retrieval vote on its own.

## 11. Source-qualified summary contract

- [ ] 11.1 Create or extend one typed proposal contract. Reuse the existing summary schema owner if one exists (check first).

  ```ts
  type SourceQualifiedSummaryV1 = {
    sourceRef: string;
    sourceRevision: string;
    chunkId: string;
    chunkStartByte: number;
    chunkEndByte: number;
    symbolVersionIds: readonly string[];
    featureLabels: readonly string[];
    evidenceRefs: readonly string[];
    summaryText: string;
    summaryModelId: string;
    summaryModelRevision: string;
    promptRevision: string;
    evidenceDigest: string;
    qualification: 'PROPOSED' | 'VALIDATED' | 'STALE';
  };
  ```

- [ ] 11.2 A summary is stored only when its claims are supported by qualifying evidence and its lineage survives independent readback. Valid JSON from Ornith is not enough.

## 12. LangExtract span conversion (ASTSUM-06)

- [ ] 12.1 Prove the bridge: LangExtract character interval → original Unicode source → UTF-8 byte span → canonical `sourceRevision`. Compare the result against the exact original bytes, not against a re-decoded string.
- [ ] 12.2 Reject ungrounded, ambiguous, or revision-mismatched evidence. Record each rejection; do not drop it silently.
- [ ] 12.3 Keep LangExtract's character offsets separate from AST UTF-8 byte offsets. Never treat one as the other.

## 13. Local-agent continuation (next session)

Start with read-only work, in this order:
1. Ownership census: 10.1, plus summary lineage fields and the existing summary generator.
2. Trace the real call path through `:8095` `/ast/chunk`, `ast-grep-symbol-extraction.mjs`, the LSP adapter, the LangExtract route, and the summary generator. Do not build a duplicate chunker, symbol registry, or feature-label schema.
3. Proof on one file: source → chunk → symbols → spans → summary proposal → EmbeddingGemma vector → pgvector exact Top-K, with matching identity at every boundary.
4. Keep the proof bounded. Do not backfill summaries, create indexes, alter dimensions, upsert Qdrant, or change model runtimes.
5. Run focused tests, `openspec validate … --strict`, and scoped diff checks. Report PASS / PARTIAL / BLOCKED, and keep the svelte-check baseline separate from pipeline evidence.

## 14. Open decisions (need an answer before stage 4 or stage 9)

- Which feature-label draft is the single owner? (Recommended: `20261021_feature_identity_v2.sql`. Mark the 2026-10-20 draft superseded.)
- Does `atlas_features` get populated from a source that carries its provenance fields, or does the label table reference concepts only? (v2 chose concepts only.)
- Summary coverage backfill (the 40,306 existing summaries stay on hold until provenance is proven).
- Whether the `execution_reviews` table (14 columns, live, not defined in `0040`) is in scope.
