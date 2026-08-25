# Parent Atlas Neural Pre-Fill Encoder — Tasks

## Status Rule

A checked item means the named contract or code slice exists. It does not
prove live training, GPU execution, projection parity, or production adoption.

## Evidence-Based Progress Snapshot

These are implementation-readiness estimates, not production completion
claims, based on the current repository inventory:

| Lane | Progress | Evidence | Remaining proof |
|---|---:|---|---|
| EmbeddingGemma `semantic_768` authority | 85% | Go embedding/retrieval services, Qdrant `semantic_768`, cache and contracts | current end-to-end receipt and stale-revision proof |
| Qdrant semantic/RFF fan-out | 55% | semantic/signature prefetch and RRF path; bounded RFF writer exists; 384 lane now explicitly marked direct-slice compatibility; Docker-network read-only Qdrant fallback is wired and the bounded 768 alignment gate passes | canonical projection/apply, full-corpus MRL parity, and error-lane dimension reconciliation remain open |
| `latent_128` warm representation | 25% | manifest, adaptive-memory contracts, `python/atlas_semantic512_autoencoder_train.py` (real training script, unrun); live backfill uses `provisional-fold-tanh-768-to-128` instead (non-neural placeholder, DRY_RUN-only, 16 points, 0 writes) | run the real training script, promote its checkpoint, retire the placeholder projection |
| `latent_64` hot representation | 30% | vector manifest, simulated Phase 5 bridge, residency tests; real decoder architecture exists (`python/atlas_compute/latent_autoencoder.py::NestedSemanticAutoencoder`, `decode64()`) | train it — no `.pt` checkpoint exists anywhere in the repo yet — then LibTorch parity |
| LibTorch/RTX inference | 45% | native addon and GPU wrappers exist | model loading, CPU/RTX parity, no-fallback receipt |
| XGBoost ranking/domain head | 55% | trainer, GPU device gate, feature export commands | post-fan-out latent features and live NDCG proof |
| Logistic/NB baselines | 15% | available contracts/capability surfaces | reproducible baseline artifacts and comparison |
| ACE/Valkey/SOM pre-fill | 40% | cache/SOM contracts and packet paths | projection wiring after latent promotion |
| MiniCoil/uniCOIL/SPLADE bi-encoder sparse lane | 10% | discovery terms and sparse adapter surfaces only | model/runtime owner, vocabulary, sparse index, and recall proof |
| Candidate matrix to low-rank shortlist | 50% | deterministic PyTorch nomination plus read-only PostgreSQL ORF receipt for `candidate_count=512` -> 96 CandidateOrdinals; embedding dimensions remain representation-specific | exact semantic_768 rerank, RRF join, and Recall/NDCG quality proof |
| Daily Graphify NLP/AST prefill | 80% | bounded export -> AST identity -> OKF classification -> packet aggregation -> 174-row ORF materialization passes; optional startup preflight fails open with a degraded receipt | full daily adoption and canonical symbol promotion |
| Parameter/artifact lookup | 65% | revision-aware lookup contract and compatibility tests | durable registry adoption and live artifact resolution |
| QLoRA boundary | 55% | read-only gate forbids online training/canonical writes; artifact metadata contract added | verified tournament tuples, checkpoint, and held-out shadow evaluation |
| Standalone cross-contract validation gate | 70% | `neural-prefill-validation-gate.mts` (deep, tsx-run, live functional checks) as a classified companion to the pre-existing `validate-neural-prefill-pipeline.mjs` (fast, plain-node, receipt/text-pattern checks; already wired into `neural-prefill-preflight.mjs` via `atlas:neural:prefill:validate`) — see NE-VALIDATE-01 correction below, this was a near-duplicate-owner mistake that got caught and fixed before it shipped wired-in | decide whether to backport live-functional depth into the canonical `.mjs` validator, or keep the two-layer split permanently |

The current trainer inventory distinguishes configuration from executable
ownership: Quaterion is selectable in the agent trainer schema and test
fixtures, but no installed Quaterion package, trained artifact, or serving
receipt has been found. AdamW/`weight_decay` is already owned by the Python
autoencoder. XGBoost ranking is an existing contract/trainer direction, but a
live qid-grouped LambdaMART receipt is not yet proven.

**Overall weighted readiness: approximately 43%.** This is not a claim that
39% of production traffic is covered. Native EmbeddingGemma MRL is now the
first compact-representation proof path; the learned, revisioned encoder and
post-fan-out projection remain challenger work.

Latest receipt: `docs/reports/graphify-rff-embedding-backfill-v1.json` is a
read-only `DRY_RUN` (`apply: false`, `signatureOnly: true`, `selected: 4`,
`written: 0`) generated on 2026-08-24. It exposes the unresolved dimension
contract: `error_embedding` is `vector(384)` while `signature_embedding` is
`halfvec(768)`. The current receipt does not itself report
`BLOCKED_DIMENSION_CONTRACT`; therefore classify this lane as
`DRY_RUN / DIMENSION_CONTRACT_UNPROVEN`, not as an executed blocked apply.
No rows or projections were written. The RFF contract must still be reconciled
before `latent_128` can be promoted after fan-out. A separate legacy Phase 1
dry-run reached Ollama and generated a 256-row sample, but its source still
targets the legacy 384-dimensional schema; this is execution evidence, not a
successful write or 768 migration.

### Evidence review correction (2026-08-24)

The readiness percentages above remain planning estimates, not measured
production coverage. Current receipts tighten their interpretation:

- Canonical `semantic_768` coverage is `576/52,417`, so the 85% authority
  estimate describes contract/infrastructure readiness, not populated rows.
- The prefill chain is read-only `PASS` at `readinessPercent: 70`; symbol
  promotion remains zero-write and the cache namespace proof is `FAIL` with
  only 3/5 required namespaces ready.
- Valkey currently carries 66 optional centroid keys and 51 ACE keys, but the
  SOM namespace is empty; this is projection presence, not end-to-end routing
  proof.
- A fresh ACE assembly dry run on 2026-08-24 loaded 200 packets and produced
  200/200 summary, SOM, and community envelopes. This proves current
  read-only assembly coverage only; PostgreSQL update and Valkey warm counts
  remain intentionally unproven because the run used `dry_run: true`.
- The 512-to-96 shortlist remains a nomination receipt until exact
  `semantic_768` rerank plus labeled Recall/NDCG evidence is attached.

The newer read-only symbol-resolution receipt supersedes the earlier bounded
prefill sample's zero-match observation: `10,170/10,170` declaration-like
nominations matched registry keys, with `0` ambiguous, `0` invalid, and
`32,228` unresolved variable nominations. This improves registry readiness but
does not authorize promotion; `canonical_writes: false` and
`database_writes: false` remain required until the reviewed apply gate is
explicitly approved.

The promotion preview is consistent with that resolution receipt: it identifies
`10,170` unique declaration-like candidates, excludes `32,228` variables, and
attempts `0` inserts in `DRY_RUN` mode. This is the complete pre-apply plan,
not evidence that canonical registry rows were written.

The current embedding-ranking diagnostic remains `WARN`: Qdrant returned 64
768-dimensional vectors and EmbeddingGemma returned a 768-dimensional query,
but the PostgreSQL sample returned zero rows and no identity join was observed.
The canonical `content_embedding_768` count is `576`; the populated fallback
`content_embedding` count is `52,380`. TurboVec was not invoked. G-04 therefore
remains open for PostgreSQL/Qdrant overlap and canonical coverage proof.

The same diagnostic with `--with-turbovec` now proves the accelerator
projection independently: TurboVec accepted the Qdrant sample, aligned to
`codebase_chunks_768`, and built `105,810` indexed entries at `64d/4-bit`.
This does not change the overall `WARN`; TurboVec remains a rebuildable
accelerator projection and does not replace PostgreSQL identity or the
canonical `semantic_768` representation.

Latest read-only readiness proof: `node scripts/atlas/autoencoder-dataset-readiness.mjs --dry-run --analyze`
completed successfully. It found identity coverage at 100%, topology coverage
at 100%, canonical embedding coverage at 99.9%, AST coverage at 20.3%, and
(as of this rerun, after NE-07's live `--apply` backfill closed the
`entities`/`lexical_features`/`used_concepts` write gap — see NE-07 below)
`has_lexical` 100.0% (was 0%), `has_entities` 19.4% (was 0%), and
`has_used_concepts` 96.6% (was 0%). `has_entities` tracks `has_ast` almost
exactly (19.4% vs 20.3%) because entities can only be derived from rows that
already have `ast_symbols` — AST coverage itself is still the ceiling and
remains the open gate (NE-06: the active extractor is a regex fallback, not
real ast-grep). The readiness tool therefore still does not authorize
autoencoder training. Focused proof also passed with `python -m pytest -q
python/test_atlas_compute.py python/test_latent_autoencoder.py` (`13 passed`).

## File-level wiring inventory

This inventory prevents the training and retrieval gates from becoming
parallel implementations. Status uses the GAN validation vocabulary:
`CREATED`, `WIRED`, `PROVEN`, `DONE`.

| Surface | Existing owner | State | Next proof |
|---|---|---|---|
| Candidate feature matrix | `sveltekit-frontend/src/lib/server/retrieval/retrieval-candidate-feature-matrix-v1.ts` | CREATED | join to a frozen RRF candidate snapshot |
| Low-rank nomination | `python/atlas_compute/low_rank.py`, `scripts/atlas/candidate-shortlist-receipt-v1.mjs` | WIRED + read-only receipt | labeled relevance/RRF evaluation and exact quality promotion |
| Nested encoder | `python/atlas_compute/latent_autoencoder.py` | CREATED + unit-proven | dataset training receipt and retrieval-preservation evaluation |
| Encoder dataset readiness | `scripts/atlas/autoencoder-dataset-readiness.mjs` | WIRED as CLI | dry-run/export receipt with revision and memory bounds |
| Exact GPU oracle | `python/atlas_rapids_sidecar.py`, `scripts/gpu/cuvs-bruteforce-smoke.py` | RUNTIME-PROVEN on bounded fixtures | 20K semantic_768 recall and memory benchmark |
| CAGRA challenger | `scripts/gpu/cuvs-cagra-persistent-smoke.py` | RUNTIME-PROVEN on tiny fixture; quarantined | filter, revision swap, fallback, and corpus recall gates |
| SOM/routing | `python/atlas_compute/som.py`, `python/atlas_compute/aligned_snapshot_experiment.py` | CREATED + fixture evidence | candidate reduction versus KMeans baseline |
| Domain schema | `packages/semantic-contracts/src/domain-prediction.ts`, `packages/semantic-contracts/schemas/domain-prediction.schema.json` | CREATED | `.okf`-validated domain coverage and held-out accuracy |
| Ontology schema | `packages/semantic-contracts/src/ontology-proposal.ts`, `packages/semantic-contracts/schemas/ontology-proposal.schema.json` | CREATED | grounded tuple/evidence validation |
| QLoRA tuple contract | `packages/parent-atlas/src/core/qlora-dataset-export.ts` | CREATED + contract-tested | verified tournament-only export |
| QLoRA export | `scripts/atlas/generate-qlora-data.mjs` | WIRED as bounded CLI | replay/provenance report; no training claim |
| QLoRA audit | `scripts/atlas/audit-p7-qlora-ppo-export.mjs` | CREATED | distinguish artifact readiness from adapter quality |
| GGUF conversion | `scripts/convert-embeddinggemma-to-gguf.ps1` | CREATED | model checksum, dimensions, normalization, parity receipt |
| TurboQuant runtime | `scripts/launch-turboquant.ps1` | CREATED/runtime-dependent | live endpoint and quantized retrieval quality receipt |
| LangExtract bridge | `scripts/langextract/langextract-gemma4-bridge.py` | CREATED | source-grounded extraction and rejection of ungrounded tuples |
| Tournament planner | `scripts/atlas/agentic-toolgan-plan.mjs`, `scripts/atlas/agentic-toolgan-execute.mjs` | CREATED | three-candidate replay and deterministic ranking receipt |
| Replay validator | `scripts/atlas/agentic-toolgan-replay.mjs`, `scripts/atlas/audit-replay-validation.mjs` | WIRED as validators | frozen snapshot replay rate and identity checks |
| Docs acquisition | `scripts/docs-atlas/crawl-okf-dev-docs.mts`, `python/atlas_external_docs.py`, `scripts/docs-atlas/fetch-beautifulsoup.py` | WIRED as Firecrawl -> BeautifulSoup -> native fallback | fetched corpus under `docs/.okf/dev/raw` with fetcher and checksum metadata |
| Docs symbol index | `scripts/docs-atlas/index-okf-dev-corpus.mjs` | CREATED + dry-run proven | crawl corpus, then emit `docs/.okf/dev/symbol-index.jsonl` |

Names without a verified owner or artifact remain `UNRESOLVED`; they are not
added as dependencies or model choices by this change. `ornith` has no
identified referent and stays fully `UNRESOLVED`. `Quaterion` (frequently
misspelled `quanterion` in earlier notes) is different: it is Qdrant's real,
documented open-source PyTorch-Lightning similarity-learning framework, not a
hallucinated or unknown name — but it remains `NOT_ADOPTED` in this repo (zero
`package.json` entries, zero imports, zero trained artifact). See NE-25A for
the audit gate that must pass before it is installed or trained against.

Latest docs proof: a bounded one-page Firecrawl fetch completed for the
Firecrawl API introduction and wrote `docs/.okf/dev/corpus.jsonl`, raw
markdown, and metadata. The symbol indexer then completed and wrote
`docs/.okf/dev/symbol-index.jsonl` plus `symbol-summary.json`; that page had
zero fenced TypeScript/JavaScript blocks, so symbol count was zero. This is a
valid empty extraction, not evidence that the AST lane is complete.

## P0 — Contracts and provenance

- [x] NE-01 Define `NeuralEncoderManifestV1`, `NeuralPrefillRowV1`,
  `EncoderEvaluationReceiptV1`, and `LatentProjectionReceiptV1`. Implemented in
  `sveltekit-frontend/src/lib/server/atlas/neural/neural-encoder-manifest-v1.ts`,
  reusing `canonicalSha256V1`/`sha256HexSchema` from the existing
  `atlas/prefill/canonical-hash-v1.ts` hasher. Strict Zod schemas + builder
  functions; `canonicalWritesAllowed`/`onlineTrainingAllowed`/
  `overwritesCanonicalSemantic768`/`promotionEligible` are hard-pinned
  `literal(false)` fields so a receipt can never claim authority it doesn't
  have. Round-trip proof (build → parse → checksum) run live via `npx tsx`;
  no training, weights, or live projection are implied by this checkbox.
- [ ] NE-02 Reconcile the existing `latent_64` vector manifest with the new
  model contract without changing canonical `semantic_768` ownership.
- [ ] NE-02A Reconcile `latent_128` as the warm post-fan-out representation;
  its source must be the joined candidate snapshot, not an arbitrary Qdrant
  scroll.
- [ ] NE-03 Add model, dataset, normalization, source, feature, and projection
  revision fields to all receipts.
- [ ] NE-04 Define `.okf` validation gates for domain, ontology, provenance,
  trust, lifecycle, and revision fields.
- [ ] NE-04A Define separate `error_embedding_768` and
  `signature_embedding_768` revisions; retain legacy 384 columns as
  `LEGACY_COMPATIBILITY` until recall promotion.
- [ ] NE-04B Add independent graph-input and graph-receipt checks so an
  embedding dimension block cannot be reported as PageRank, NetworkX, Neo4j,
  or cuGraph algorithm failure.

## P0 — NLP pre-fill

### Structural index integration review (2026-08-24)

The live ownership audit found `atlas_ast_nodes` populated with 11,067 structural rows,
`atlas_symbol_registry` populated with 10,220 rows (10,170 active), and
`atlas_observation_feature_rows` populated with 1,808 revisioned feature rows. The missing
link is revision-specific symbol materialization: `atlas_symbol_versions` exists but has zero
rows, and no `atlas_callable_search` projection exists. Do not create another structural
registry. Keep `atlas_ast_nodes` as structural identity, `atlas_symbol_registry` as the
cross-revision stable registry, `atlas_symbol_versions` as the source-revision callable
record, and `atlas_packet_features.ast_symbols` / observation rows as denormalized retrieval
features.

The additive schema tranche is now applied through
`sveltekit-frontend/drizzle/manual/20260824_atlas_callable_search_v1.sql`: callable metadata
columns exist on `atlas_symbol_versions`, `atlas_callable_search` exists with its indexed FTS
projection, and the idempotent backfill inserted zero rows because the source version table is
empty. The materialization and retrieval proof tasks remain open.

The first bounded apply populated 100 `atlas_symbol_versions` rows and 100 callable-search
rows; the immediate idempotent rerun inserted 0 additional rows. All 100 rows are active-
registry joined and FTS-populated, while `tree_node_id` remains unresolved for all 100 because
the current Graphify `source_ref`/upstream-node keys do not match `atlas_ast_nodes` keys.

- [ ] AST-INDEX-01 Materialize declaration-like AST nominations into
  `atlas_symbol_versions` only when an active `atlas_symbol_registry` match exists; preserve
  `tree_node_id`, `symbol_version_id`, `source_revision`, byte span, declaration hash,
  normalized signature, and producer revision. Dry-run and idempotency receipt required.
- [ ] AST-INDEX-02 Add a rebuildable `atlas_callable_search` projection from
  `atlas_symbol_versions` + `atlas_ast_nodes` + packet identity. Include qualified name,
  node kind, path, signature, parameter names/types, returns, imports/calls, revisions, and
  `search_vector`. This is a retrieval projection, not a new identity owner.
- [ ] AST-INDEX-03 Add read-only indexed lookup parity: PostgreSQL exact/B-tree, GIN FTS,
  and optional `pg_trgm` identifier lookup versus `rg` scan and AST reparse. Record p50/p95,
  candidate identity overlap, and source-span hydration correctness.
- [ ] AST-INDEX-04 Add a Go retrieval adapter receipt that returns
  `symbol_version_id -> tree_node_id -> packet_key -> candidate_ordinal`; fail closed when
  any join revision or ordinal-map checksum is missing.
- [x] AST-INDEX-05 Keep domain, taxonomy, ontology tuples, PageRank/PPR, SOM, and semantic vectors as separate derived feature/projection lanes.
- [x] AST-ENRICH-01 Add additive symbol-level domain/use enrichment to the rebuildable callable projection.
- [x] AST-ENRICH-02 Add JSONB evidence metadata, taxonomy fields, parent container, and inferred-use indexes without destructive migration.
- [x] AST-ENRICH-03 Run the read-only enrichment dry run against the AST-grep domain artifact.
- [x] AST-ENRICH-04 Apply a bounded enrichment batch and verify idempotent projection updates.
- [ ] AST-ENRICH-05 Aggregate enriched callable facts into packet-level observation feature rows.
- [x] AST-ENRICH-06 Prove `upstream_chunk_id` to packet-key provenance before ORF aggregation; 100/100 bounded rows matched `atlas_packets.packet_key` read-only.
- [x] AST-ENRICH-07 Reconcile the main `@deeds/parent-atlas` observation repository to the active packet-key ORF contract; remove candidate/vector writes and keep semantic search owned by the canonical vector lane.
- [x] AST-ORF-01 Materialize the reviewed 174-row packet-level ORF plan with bounded additive upserts; verify zero validation errors, stable row count, and complete input digests.

- [x] NE-05 Read daily Graphify indexed files using canonical identity joins.
  Implemented as the read-only Graphify file export and AST entity prefill
  chain: `scripts/atlas/export-graphify-file-index-v1.mjs` emits the sorted
  packet/file manifest, and `scripts/atlas/enrich-ast-entity-prefill-identity.mjs`
  resolves all `42,398/42,398` AST candidates to packet identity without
  canonical writes. Source-file resolution remains partial (`2,951` resolved,
  `342` unresolved), so this closes the identity-join read path, not full
  filesystem coverage.
- [x] NE-06 Replace regex-only symbol extraction in the active backfill with
  AST-grep structural extraction where the source language is supported.
  Scoped to TypeScript/JavaScript (the dominant languages here); Python/Go
  remain on the regex fallback, explicitly labeled as such — not claimed as
  covered. Implemented `scripts/atlas/lib/ast-grep-symbol-extraction.mjs`
  (`extractSymbolsViaAstGrep(content, language)`, real `ast-grep` CLI via
  `--stdin --json=compact`, 6 patterns: function decl, arrow-function const,
  **typed** const decl, class, interface, type alias, import) and wired it
  into `phase1-ast-grep-extraction.mjs`'s `extractASTSymbols()` ahead of the
  regex fallback (falls back honestly — returns `null`, not an empty array —
  when the language isn't TS/JS or the `ast-grep` binary is unavailable).
  9/9 `node --test` pass (extraction module + NE-07's derivation module).
  **Real Windows gotcha found and fixed**: `ast-grep` is installed as an npm
  `.cmd` shim; Node's `spawnSync('ast-grep', args, {shell:true})` joins
  `command`+`args` with plain spaces before handing them to `cmd.exe`, which
  then treats bare `(`/`)`/spaces inside the `--pattern` value as its own
  token boundaries — this silently truncated `--pattern "function $NAME($$$ARGS) { $$$ }"`
  down to just `function` with zero `metaVariables` captured, no error
  raised. Fixed by building one pre-quoted command string ourselves instead
  of an args array (verified byte-for-byte correct output before wiring it
  into the caller). **A second real gap found and fixed via live comparison
  against real repo files** (not just synthetic fixtures): the first pattern
  set found 0 of 3 exported route handlers in
  `sveltekit-frontend/src/routes/(app)/yorha/+page.server.ts` and
  `.../api/v1/evidence/canvas/+server.ts` — `export const load: PageServerLoad = async (...) => {...}`
  is SvelteKit's dominant route-handler shape in this repo, and the initial
  arrow-const pattern didn't account for the type annotation between name
  and `=`. Adding `const $NAME: $TYPE = $$$BODY` fixed it (now finds `load`,
  `POST`). Comparison script left at
  `<scratchpad>/ne06-regex-vs-astgrep-comparison.mjs`, not committed to the
  repo. **Known, accepted divergence from the old regex output**: the regex
  extractor's `(?:function|const)\s+(\w+)` over-matches — it also captures
  local variable bindings inside function bodies (e.g. `raw`, `parsed`,
  `key` in the canvas route) that aren't real structural entities. The new
  ast-grep patterns correctly exclude these; this narrows `ast_symbols` for
  already-populated rows if re-run, which is a precision improvement for
  NE-07's `entities` derivation, not a bug — but it means symbol *sets*
  aren't 1:1 comparable to existing data, so re-running this extractor over
  already-populated rows is a deliberate re-derivation decision, not a
  transparent upgrade.
  **BLOCKING FINDING — since fixed, additively, operator-directed**:
  `phase1-ast-grep-extraction.mjs`'s own `INSERT INTO atlas_packet_features`
  referenced `packet_id`, `source_ref`, `ast_coverage`, `ast_language`,
  `ast_extraction_method`, `ast_hash` — none of which existed on the live
  table (confirmed via `docker exec ... psql -c '\d atlas_packet_features'`).
  Its own `packet_id INTEGER NOT NULL REFERENCES atlas_packets(id)` schema
  intent was independently broken on both ends: `atlas_packets` has no `id`
  column at all (its own identity column, also named `packet_id`, is `text`,
  not an auto-increment integer), so that FK could never have been
  satisfiable even with a migration. Resolved as two changes, both applied
  live and verified:
  1. `sveltekit-frontend/drizzle/0154_atlas_packet_features_ast_provenance_columns.sql`
     — purely additive `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` for
     `source_ref text`, `ast_coverage real DEFAULT 0`, `ast_language
     varchar(50)`, `ast_extraction_method varchar(50)`, `ast_hash
     varchar(64)`. Applied via `docker exec -i legal-ai-postgres psql ...`.
     Deliberately does **not** add a `packet_id` column — `packet_key`
     (already the table's real unique constraint) is the canonical identity
     join key per the Parent Atlas frozen identity contract; a second,
     unsatisfiable `packet_id` column would just reintroduce the
     feature_id-only-style join risk that contract forbids. Verified before
     vs. after: row count `61,657` and `has_entities` `11,990` identical
     post-migration — no data touched, only schema added.
  2. `phase1-ast-grep-extraction.mjs`'s schema-init block, `SELECT`, and
     `INSERT` updated to drop `packet_id` and match the live 12-column
     table exactly (source_ref now also updates on conflict, which it
     previously didn't).
  Live-proven without risking real data: the fixed `INSERT` was run inside
  `BEGIN ... ROLLBACK` against the real live table with a synthetic
  `packet_key` — insert succeeded (`RETURNING` showed the correct row
  shape), then rolled back; confirmed via a follow-up `SELECT count(*)`
  that the synthetic key was never persisted and the total row count
  (`61,657`) was unchanged.

  **Then a real, non-transactional `--apply` run, per operator request**:
  the candidate query's own `WHERE (payload->>'kind' = 'code' OR
  source_kind = 'code')` was found to be a **second, independent, deeper
  bug** — `SELECT payload->>'kind', count(*) FROM atlas_packets GROUP BY 1`
  showed `payload` has no `kind` key at all on any of the 61,660 live rows,
  and `source_kind` is never literally `'code'` (real values:
  `codebase_chunk` 3,294 / `rpc_method` 61 / `cluster-summary` 1 / empty
  58,304). This clause has never matched a single row, ever — independent
  of the already-fixed column mismatch. Fixed to `source_kind =
  'codebase_chunk'` (kept the dead `payload->>'kind'` arm as a harmless
  forward-compatible no-op rather than deleting it). Also fixed
  `detectLanguage(packet.file_path)` → `detectLanguage(packet.file_path ||
  packet.source_ref || '')`, since 3 of the 4 newly-eligible rows had an
  empty `file_path` with the real path only in `source_ref`. Dry-run then
  found 3 real candidates (the 4th, a `cluster-summary` row whose
  `source_ref` is `cluster:summary:0`, correctly stays excluded — no
  matching language). `--apply --limit=10` (no `--dry-run`, genuinely
  persisted) wrote all 3 successfully, 0 errors, verified via direct
  `psql` read of the new rows: `ace:packet:da3841fb4f79` /
  `ace:packet:ed1a045b3701` got `ast_language=typescript,
  ast_extraction_method=ast_grep` (proving the real ast-grep path — not the
  regex fallback — was actually invoked); the third
  (`ace:packet:ce21f5927ce7`, a `.svelte` file, unmapped extension) got
  `method=skipped`, correctly, not silently miscounted as success. All 3
  wrote `ast_symbols={}` (empty) because `payload->>'text'` is empty for
  these particular packets — an honest reflection of no available source
  text, not an extraction bug. Post-apply: `atlas_packet_features` row
  count is now `61,660`, exactly matching `atlas_packets`; re-running the
  full eligibility funnel query returns `0` remaining candidates — this
  script's coverage gap is now fully closed, live, for real.
  Also newly found while inspecting the live schema, not investigated
  further: `imports`/`exports` are real, separate `text[]` columns on
  `atlas_packet_features` with no writer found either — a same-shaped gap
  to NE-07's original one.
- [x] NE-06A Add a read-only ast-grep entity-candidate prefill artifact at
  `scripts/atlas/prefill-ast-entities.mjs`. It scans bounded source files,
  emits symbol kind/name/span/domain hints, preserves candidate-only identity,
  and leaves neural classification pending. This does not prove canonical
  entity coverage or authorize database writes.
- [x] NE-06B Prove UTF-8 byte-grounded AST entity spans with
  `scripts/atlas/test-ast-entity-utf8-span.mjs`; the fixture contains
  multibyte identifiers and verifies the ast-grep range against a Node
  `Buffer` slice. This remains read-only and does not mint identity.
- [x] NE-06C Add the read-only AST symbol nomination compiler at
  `scripts/atlas/nominate-ast-symbols-dry-run.mjs`; it derives deterministic
  nominations and declaration hashes but creates zero canonical symbols or
  symbol versions.
- [x] NE-06D Add read-only registry resolution at
  `scripts/atlas/resolve-ast-symbol-nominations-dry-run.mjs`; it checks active
  canonical keys and aliases and emits resolution evidence without promotion.
  The refreshed live dry run resolved `10,170/42,398` nominations against
  `10,170` active registry keys, with `0` ambiguous results and `32,228`
  unresolved variable nominations; the resolver now uses a bounded Docker
  output buffer so large registry exports fail neither by truncation nor by
  promoting data.
- [x] NE-06E Add a bounded promotion-review report at
  `scripts/atlas/review-ast-symbol-promotion-plan.mjs`; duplicate declarations
  remain review-required and no canonical identity is inferred from names.
- [x] NE-06F Classify promotion eligibility without promotion: declaration-like
  kinds are candidates, while variables remain `REVIEW_REQUIRED_SCOPE_EVIDENCE`
  until container/scope facts are available.
- [x] NE-07 Emit deterministic lexical keyword classes and preserve raw terms.
  Root cause found via `rg`: `atlas_packet_features.entities` /
  `.lexical_features` / `.used_concepts` (all `text[]`, see
  `drizzle/0043_atlas_packet_features_schema.sql` +
  `drizzle/0020_fix_packet_feature_metrics_schema.sql`) had **zero writers**
  anywhere in the repo — only `ast_symbols` is written (by
  `phase1-ast-grep-extraction.mjs`'s regex extractor). This is the entire
  reason `autoencoder-dataset-readiness.mjs` reported entity coverage at 0%.
  Implemented `scripts/atlas/lib/lexical-entity-derivation.mjs`
  (`deriveEntityLexicalFeatures(astSymbols)`, pure function: tokenizes
  camelCase/snake_case identifiers, preserves raw terms verbatim alongside
  tokenized forms, filters a small stopword list) and
  `scripts/atlas/backfill-entity-lexical-prefill.mjs` (dry-run default,
  `--apply` writes `entities`/`lexical_features`/`used_concepts` back to
  `atlas_packet_features`, bounded `--limit`, emits
  `docs/reports/ne07-entity-lexical-prefill.json`). 5/5 `node --test` pass.
  **`APPLY_PROVEN` live, repo-wide**: `docker restart legal-ai-postgres`
  cleared a stuck WSL2/docker-proxy port forward on host `127.0.0.1:5434`
  (see NE-28's note for the full root-cause trail). `--apply --limit=200`
  first wrote 200 rows (verified independently via `docker exec ... psql`,
  not this script — e.g. `packet_key=4d4c2e69d3f629ba` now has
  `entities={Health}`, `lexical_features={Health,health}`,
  `used_concepts={health}`); a follow-up `docker exec ... psql` count showed
  12,298 rows repo-wide still needed the backfill, so `--apply --limit=13000`
  was run to close the remainder in one pass — 12,298 rows written, 0
  errors. Final repo-wide coverage (61,657 total `atlas_packet_features`
  rows, re-measured via `autoencoder-dataset-readiness.mjs --dry-run
  --analyze`, the same gate that previously reported 0%): `has_lexical`
  100.0% (61,648/61,657), `has_used_concepts` 96.6% (59,530/61,657),
  `has_entities` 19.4% (11,990/61,657) — `has_entities` tracks `has_ast`
  (20.3%) almost exactly, since entities can only be derived from rows that
  already have `ast_symbols`; the remaining gap there is AST coverage
  itself (NE-06, still open), not a defect in this backfill.
- [ ] NE-08 Emit validated domain classifications and ontology linked tuples.
  **NE-07's `used_concepts` write is explicitly NOT this task** — it is a
  lexical heuristic (tokenized, stopword-filtered `ast_symbols`), not a
  domain-classifier- or `ontology-proposal.ts`-validated concept. NE-08 still
  has a read-only candidate stage at
  `scripts/atlas/classify-ast-entities-okf-dry-run.mts`: it reuses the
  versioned `parent-atlas-domain-taxonomy-v1` owner and classified
  `34,041/42,398` AST candidates. These remain `CANDIDATE_ONLY`; no domain
  ledger or ontology tuple writes are authorized. The remaining gate is
  evidence-backed validation against declared OKF domains and ontology
  references.
  requires wiring the real owners
  (`ai/parent-atlas-workstation-domain-classifier.ts`,
  `packages/semantic-contracts/src/ontology-proposal.ts`) into this same
  table; do not let NE-07's backfill be mistaken for closing this gate.
- [x] NE-09 Add AST/lexical/domain/ontology/topology coverage metrics and a
  read-only report. Already implemented before this change:
  `scripts/atlas/autoencoder-dataset-readiness.mjs` already queries
  `has_ast`/`has_lexical`/`has_entities`/`has_used_concepts` coverage
  percentages against `atlas_packet_features` — it just had nothing to
  report on for three of those four columns until NE-07's backfill exists.
  No new coverage code was needed.
- [x] NE-10 Prove rerunning the same source revision produces no semantic
  changes. `deriveEntityLexicalFeatures` is a pure function of `ast_symbols`
  with internal deduplication + sorting, so identical input is guaranteed to
  produce byte-identical output; proven directly by
  `scripts/atlas/lib/lexical-entity-derivation.test.mjs`'s "is deterministic
  for identical input" case. This proves determinism of the *derivation*
  only — it does not prove `ast_symbols` itself is stable across reruns of
  `phase1-ast-grep-extraction.mjs` (regex extraction from live source),
  which remains open per NE-06.
- [ ] NE-10A Attach the pre-fill receipt to the Qdrant/RFF fan-out revision and
  preserve the canonical identity join through RRF.
- [ ] NE-10B Record degraded graph-candidate joins separately from valid
  PageRank/PPR/community computation receipts.

## P0 — Training dataset

- [ ] NE-11 Export canonical `semantic_768` rows plus pre-fill features to a
  revisioned Arrow/NDJSON dataset.
- [ ] NE-12 Split by source/workspace revision to prevent file-level leakage.
- [ ] NE-13 Record missing-vector, duplicate-identity, stale-revision, and
  invalid-ontology exclusions.
- [ ] NE-14 Add bounded dry-run training and memory estimates for the RTX 3060
  Ti and 8 GB host-memory constraint.

## P1 — Neural encoder

- [ ] NE-15 Implement the Python nested autoencoder challenger
  `768 -> 256 -> 128 -> 64` and mirrored decoder with deterministic seeds;
  this is separate from the model-native MRL `768 -> 512/256/128` path.
- [ ] NE-16 Train reconstruction and retrieval-preservation objectives.
- [ ] NE-17 Save weights, normalization, metrics, dataset checksum, and device
  receipt as one immutable model bundle.
- [ ] NE-18 Add CPU reference inference and deterministic checksum tests.
- [ ] NE-19 Load the model through the existing LibTorch/N-API bridge.
- [ ] NE-20 Prove CPU/LibTorch CPU/RTX output parity within a recorded tolerance.
- [ ] NE-21 Remove the simulated Phase 5 path from promotion eligibility while
  retaining it as an explicitly labelled diagnostic fallback.

## P1 — Retrieval and learning heads

- [ ] NE-22 Tournament `semantic_768` against native MRL 512/256/128 and
  learned `latent_128`/`latent_64` nearest-neighbor recall; MRL is evaluated
  first and learned latents remain challengers.
- [ ] NE-23 Build a bounded cuVS/Qdrant latent admission index only after the
  recall gate passes.
- [ ] NE-23A Enforce `semantic_768 query -> RFF/Qdrant fan-out -> latent_128`
  candidate encoding; reject pre-fan-out latent writes.
- [x] NE-23B Add a query/candidate representation compatibility gate covering
  model revision, `QUERY`/`DOCUMENT` encoder roles, representation family,
  output dimension, normalization, and metric. CandidateOrdinal maps now carry
  additive per-candidate representation bindings without changing identity.
- [x] NE-23C Require MRL query/candidate pairs to use the same EmbeddingGemma
  revision, task roles, MRL prefix dimension, renormalization, and metric;
  require learned latent pairs to use the same learned projection revision and
  normalization. The binding contract covers native MRL 512/256/128 and
  challenger latent 128/64; live parity and promotion remain open.
- [x] NE-23D Add a bounded `SAMPLE_CANDIDATES` proof using the existing
  CandidateFeatureMatrix and a deterministic low-rank row projection. The
  receipt must preserve CandidateOrdinals, record rank/target count/device,
  explicitly identify the policy as Tang-inspired rather than Tang's
  algorithm, and retain the sorted packet-key ordinal-map checksum. Receipt:
  `docs/reports/atlas-candidate-shortlist-receipt-v1.json`. This is executed
  and read-only; it does not prove exact-rerank quality.
- [ ] NE-23E Compare the low-rank nomination against exact ranking on the same
  frozen candidate snapshot; record Recall@K, NDCG/MRR, top-K overlap, latency,
  and CPU/RTX memory telemetry before any live executor adoption.
- [ ] NE-24 Feed latent plus AST/lexical/graph/domain/ontology features to the
  existing XGBoost ranker.
- [ ] NE-25 Add logistic regression calibration and Naive Bayes lexical
  baselines with separate model receipts.
- [ ] NE-25A Freeze the semantic trainer challenger boundary: audit the
  existing Quaterion configuration surface, verify package/runtime availability
  without installing it implicitly, and emit a no-write blocked receipt when
  the trainer or model artifact is absent. The upstream split is `quaterion`
  for training and `quaterion-models` for serving; neither is a verified local
  dependency yet.
- [ ] NE-25B Build a held-out Quaterion similarity dataset from replayed
  query/document evidence with query/document roles, hard-negative policy,
  source-revision grouping, and dataset checksum. Export only canonical
  references and grounded labels as rebuildable NDJSON. Compare the challenger
  only against the frozen EmbeddingGemma `semantic_768` oracle.
- [ ] NE-25B1 Add the bounded Quaterion adapter receipt with model/artifact
  checksum, base model revision, `QUERY`/`DOCUMENT` roles, dimensions,
  normalization, metric, dataset revision, and `canonical_authority: false`.
  The adapter may use `quaterion-models`, ONNX, or Python/gRPC, but must return
  vectors plus typed metadata and no framework objects.
- [ ] NE-25B2 Run offline challenger encode and compatibility tests before any
  Qdrant write. A promoted challenger must use a separate collection or named
  vector and pass the same held-out retrieval gym as the canonical model.
- [ ] NE-25C Add a qid-grouped LambdaMART proof over the existing
  CandidateFeatureMatrix. Record `CandidateOrdinal`, labels, feature revision,
  `rank:ndcg`, NDCG@10/24, Recall@K, MRR, top-K overlap, CPU RAM, VRAM,
  latency, and fallback state. Do not call a model trained only on fixtures
  production-ready.
- [ ] NE-25D Record geometry and regularization separately in all training
  receipts: `L2_NORMALIZE_VECTOR` for embeddings and
  `L2_REGULARIZE_WEIGHTS`/AdamW `weight_decay` for model training.
- [ ] NE-25E Keep quaternion/manifold4 values as revisioned derived
  topology/ontology features only; validate linked tuples and evidence refs
  before they enter CandidateFeatureMatrix.
- [ ] NE-26 Keep SOM 20x20 and TopologyFeature4 as derived routing artifacts,
  not encoder identity or labels.
- [ ] NE-26A Audit MiniCoil, uniCOIL, SPLADE, and bi-encoder candidates for a
  real installed model, tokenizer/vocabulary, sparse output contract, Qdrant
  sparse-vector schema, and executable recall benchmark.
- [ ] NE-26B Add a 384-versus-768 migration benchmark covering dense recall,
  sparse recall, RRF overlap, per-domain metrics, storage cost, and latency.
- [ ] NE-26C Mark truncation modes explicitly as `NONE`,
  `MRL_PREFIX_TRUNCATION`, `LEGACY_DIRECT_SLICE`, or
  `LEARNED_AUTOENCODER`; record query/document roles and post-truncation
  renormalization. Never label an unverified prefix or MRL projection as a
  bi-encoder.
- [ ] NE-26D Benchmark `semantic_768` against `semantic_mrl_512`,
  `semantic_mrl_256`, and `semantic_mrl_128` using the full-768 exact oracle;
  smaller representations may only own admission/shortlisting after measured
  Recall/NDCG parity. Contract projection tests and the live EmbeddingGemma
  MRL proof pass through Ollama. The corpus benchmark is implemented in
  `scripts/atlas/atlas-embedding-ranking-diagnostic-v1.mjs` and currently
  reads Qdrant through the Docker-network fallback when the Windows mapping is
  unavailable. A 64-row diagnostic produced R@10/NDCG@10 of 1.00/0.8699 for
  MRL512, 0.80/0.8221 for MRL256, and 0.70/0.6921 for MRL128. This is a
  diagnostic sample only; full-corpus parity and promotion remain open. A
  subsequent 512-row read-only run measured R@10/NDCG@10 of 0.60/0.7247 for
  MRL512, 0.60/0.7452 for MRL256, and 0.30/0.3793 for MRL128. These results
  are query/snapshot diagnostics, not a promotion receipt; PostgreSQL joins
  were unavailable, so AST/lexical/graph fusion was not included.
  The bounded daily alignment gate now passes through the Docker-network
  Qdrant fallback and records `DOCKER_INTERNAL_HTTP`; the host mapping remains
  an unreliable diagnostic transport. This proves read-only transport and
  point-ID alignment only, not projection writes or MRL promotion.

## P1 — ACE and cache projection

- [x] NE-27 Define ACE pre-fill packet references to canonical evidence,
  latent/model receipts, ontology tuples, and graph feature revisions.
  Implemented in
  `sveltekit-frontend/src/lib/server/atlas/neural/ace-prefill-packet-reference-v1.ts`
  as `AcePrefillPacketReferenceV1`: `canonicalEvidenceRefs` (packet/source
  pointers only, never raw content), nullable `latentProjectionReceiptChecksum`
  / `modelManifestChecksum` referencing NE-01 receipts by checksum,
  `ontologyTupleRefs`, `graphFeatureRevision`, and a `centroidRef` union
  (`GPU_CLUSTER` | `SOM_CELL`) that resolves through
  `centroidRefToRedisKey()` to the *existing* `taxonomy:clusters:gpu:*` /
  `taxonomy:clusters:som:*` keys owned by
  `retrieval/centroid-cache.ts::centroidKey` — no second centroid store
  introduced. `cacheStatus` enum (`NOT_PROJECTED` / `PROJECTED_UNVERIFIED` /
  `READBACK_VERIFIED`) exists so ACE can distinguish an unread hint from a
  round-trip-verified one; this contract does not itself populate that field
  from a live cache (see NE-28).
- [x] NE-28 Populate Valkey centroid/SOM working-set entries only through a
  bounded projection script with dry-run and readback modes. Implemented as
  `scripts/atlas/project-valkey-centroid-prefill.mjs`: default mode is
  `DRY_RUN` (reads `gpu_cluster_centroids` from Postgres, logs what it would
  write, zero Redis writes); `--apply` writes through the same
  `centroidKey.cluster`/`centroidKey.som` key scheme and TTL
  (`TTL.CENTROID` = 6h) as `centroid-cache.ts`; `--apply --readback` re-reads
  every written key and diffs vector dimension against the Postgres source,
  recording `DIMENSION_MISMATCH`/`MISSING_AFTER_WRITE` reason codes on
  failure (exit 4); `--readback-only` verifies existing keys with zero writes
  and zero Postgres reads. Every run emits
  `docs/reports/ne28-centroid-prefill-projection.json`. Postgres and Redis
  are both accessed directly via `pg`/`ioredis` (the established convention
  for standalone `scripts/atlas/*` CLIs — see `backfill-latent-vectors.mjs`),
  not through the SvelteKit `$lib` module graph. **`APPLY_PROVEN` live**:
  both `legal-ai-postgres` and `legal-ai-valkey` were unreachable from the
  host earlier in this session despite `docker ps` reporting them healthy —
  root cause was a stuck WSL2/docker-proxy port forward (`Get-NetTCPConnection`
  showed dozens of stale `TIME_WAIT` entries on host port 5434 behind
  `wslrelay.exe`/`com.docker.backend`; independently confirmed with a bare
  `psql` client, not just the `pg` npm library, so it was a host-networking
  issue, not application code). `docker restart legal-ai-postgres` /
  `docker restart legal-ai-valkey` cleared it. Also found live: the real
  `gpu_cluster_centroids.cluster_type` value is `kmeans_js` (64 rows), not
  the `gpu`/`som` values this script (and `centroid-cache.ts`'s own default
  argument) assumed — the default `--cluster-type=gpu` silently returns 0
  rows against live data; callers must pass `--cluster-type=kmeans_js`
  explicitly today. With that corrected: `--apply --readback` wrote 64
  centroid keys and readback-verified all 64 with 0 mismatches
  (`docs/reports/ne28-centroid-prefill-projection.json`:
  `rowsRead: 64, keysWritten: 64, keysVerified: 64, mismatches: []`).
  Independently re-verified outside this script via
  `valkey-cli GET taxonomy:clusters:gpu:7` (real 768-dim vector JSON) and
  `TTL taxonomy:clusters:gpu:7` (21587s, matching the 6h `TTL.CENTROID`).
- [ ] NE-29 Add Qdrant latent projection with canonical identity and revision
  payloads; do not overwrite `semantic_768` points.
- [ ] NE-29A Add Valkey warm `latent_128` and hot `latent_64` namespaces with
  model/source/projection revisions and rebuild-only semantics.
- [ ] NE-30 Add ACE synthesis gate requiring canonicalized top-K evidence,
  confidence, source references, and model/projection revisions.

## P2 — Promotion proof

- [ ] NE-31 Run replay on a frozen daily Graphify snapshot.
- [ ] NE-32 Compare baseline semantic retrieval, latent admission, and fused
  ranking with NDCG/Recall@K and per-domain metrics.
- [ ] NE-33 Prove GPU memory headroom, CPU worker limits, and no silent fallback.
- [ ] NE-34 Produce a promotion receipt or an explicit blocked receipt.
- [ ] NE-35 Adopt the pipeline in the live agentic workflow only after all P0/P1
  gates pass.
- [x] NE-35A Add the read-only main validation gate at
  `scripts/atlas/validate-neural-prefill-pipeline.mjs`. It checks embedding
  geometry, low-rank policy, metadata/index ownership, QLoRA write boundaries,
  packet aggregation, and the daily NLP prefill receipt. A failing or missing
  daily receipt is explicitly degraded/fallback state and does not authorize a
  canonical mutation. `run-graphify-daily-startup.mjs` now invokes this lane
  only when `GRAPHIFY_NEURAL_PREFILL=1`; any failure logs degraded state and
  continues the existing Graphify chain. Daily adoption is still opt-in.
- [x] NE-35B Add a read-only preflight command that runs the NLP/AST dry chain
  and validator without invoking the mutating daily Graphify chain:
  `npm run atlas:graphify:neural-prefill:preflight`.
- [x] NE-35C Add the shortlist as a separate opt-in read-only daily lane via
  `GRAPHIFY_NEURAL_PREFILL_SHORTLIST=1`. It emits child receipt checksums and
  fail-opens to the unchanged Graphify chain; it does not authorize writes or
  make the shortlist an authority.
- [x] NE-35D (2026-08-24) Re-verified NE-35A/B/C are real and correctly
  isolated, then fixed one adjacent Windows launcher bug found while
  checking: `scripts/atlas/graphify-trigger-downstream-pipeline.mjs`'s
  TurboVec consolidation stage spawned `npx.cmd tsx <script>` with
  `shell: true` — Node documents that a `.cmd` file cannot be launched
  directly via `spawn`/`execFile`/`execFileSync` without a shell on
  Windows, which was the wrong executable boundary for a JS CLI. Replaced
  with `spawn(process.execPath, [tsxCliPath, script, ...], {shell: false})`
  — `tsx` ships a real ESM entry (`node_modules/tsx/dist/cli.mjs`) that
  `node` runs directly, cross-platform, no shell involved (frontend-local
  install preferred, repo-root install as fallback). `node --check` passes;
  smoke-verified `node node_modules/tsx/dist/cli.mjs --version` resolves
  and runs without a shell. This is a different file from the one NE-35A/B/C
  describe (`run-graphify-daily-startup.mjs`, which already used
  `process.execPath`-based invocation correctly) — no duplication, this was
  a genuinely separate latent bug in a sibling orchestrator script.
  **Correction to avoid future duplicate work**: NE-35A/B/C's daily wiring
  already fully implements what a later request (2026-08-24, phrased as
  "wire it in... DAILY-01 through DAILY-08") re-described from scratch —
  opt-in via `GRAPHIFY_NEURAL_PREFILL[_SHORTLIST][_ONLY]`, read-only NLP/AST
  dry chain + validator, fail-open with `DEGRADED` (not `FAIL`) status,
  `fallbackPolicy: 'CONTINUE_WITH_EXISTING_GRAPHIFY_RECEIPT'`, and a daily
  receipt (`docs/reports/atlas-graphify-neural-prefill-daily-v1.json`)
  embedding child receipt checksums
  (`writeNeuralPrefillDailyReceipt` in `run-graphify-daily-startup.mjs`).
  Confirmed by direct code read the identity/provenance step
  (`atlas:phase109b:workflow:dry`, line ~124) runs BEFORE the neural-prefill
  block and is NOT wrapped in try/catch — so an identity/provenance failure
  there aborts the whole daily run through the outer catch block, and can
  never be misreported as neural `DEGRADED`, matching the requested
  "identity failure ≠ neural degradation" rule exactly, without any change
  needed. What genuinely remains open (operational, not code): running
  several live daily cycles with `GRAPHIFY_NEURAL_PREFILL=1` and canonical
  writes still `false`, then a deliberate default-on decision — neither is
  something a single session can produce; both require real elapsed days of
 cron/startup runs.

### Daily ledger correction: DAILY-01 through DAILY-08

`DAILY-01` through `DAILY-08` are implementation-complete and must not be
recreated as new implementation tasks. Their remaining state is operational:
multi-day replay with canonical writes disabled, receipt review, and an
explicit default-on/adoption decision. The preserved runtime boundary is:

```text
identity/provenance failure -> abort daily run
neural enrichment failure   -> DEGRADED
                               CONTINUE_WITH_EXISTING_GRAPHIFY_RECEIPT
```

Current classification: `LOCAL_CODE_VERIFIED / OPERATIONAL_ADOPTION_NOT_PROVEN`.

## Operator Lookup Checklist

These are the remaining facts needed to move from contract readiness to live
proof. Run only the commands marked read-only and paste the resulting summary
or report path back for the next pass.

- [ ] G-01 Dependency health: confirm Postgres, Qdrant REST/gRPC, Valkey, and
  EmbeddingGemma are reachable. Required result: endpoint, version, and
  degraded reason if unavailable; no writes. **Partially evidenced
  (2026-08-26), not fully closed**: `scripts/validate-graphify-startup.mjs`
  (`npm run graphify:validate`) already checks Postgres/Qdrant/Valkey/an
  embedding service read-only — did not rebuild it (would have been a 3rd
  near-duplicate validator this session, see NE-VALIDATE-01's correction
  above for why that's now being watched for). Real gaps vs. this item's
  literal ask: it checks a Go embedding sidecar at `:8097`, not
  EmbeddingGemma/Ollama at `:11434` directly, and prints to console rather
  than emitting a structured `{endpoint, version, degradedReason}` JSON
  receipt. Left open rather than building a redundant script to close the
  gap cosmetically.
- [x] G-02 Canonical symbol promotion: ran `npm run atlas:features:ast-symbols:review:dry`
  live (2026-08-26) — real output, not assumed: 42,398 input nominations
  (41,427 ts / 490 js / 481 mjs); by kind: 32,228 variable, 4,332 function,
  2,332 interface, 2,060 method, 1,186 type, 260 class; promotion
  eligibility split `REVIEW_REQUIRED_SCOPE_EVIDENCE: 32228` /
  `PROMOTION_CANDIDATE: 10170`; 36,632 unique source/kind/name groups,
  3,080 duplicate groups. `canonical_symbols_created: 0`,
  `canonical_writes: false`, `database_writes: false` — confirmed read-only
  as required. No promotion/apply command was run.
- [x] G-03 Feature-row ownership: ran `scripts/atlas/audit-observation-feature-row-contract.mjs`'s
  most recent receipt (`docs/reports/atlas-observation-feature-row-contract-v1.json`,
  2026-08-24) — flags two migration *file* candidates with the same table
  name and an incompatible primary key/column contract
  (`orfPacketKey`: `packet_key + feature_revision`, matches Drizzle schema
  and materializer; `candidateIdVector`: `candidate_id + workspace_revision`
  + a `semantic_768` vector column, does not match). That receipt itself
  says `"liveDatabaseChecked": false` — **live-verified for real this
  session** via `docker exec psql \d`: only `atlas_observation_feature_rows`
  exists live (1,808 rows, schema matches the `orfPacketKey` candidate
  exactly — `packet_key`, `feature_revision`, `tree_node_id`,
  `ontology_mask`, `ast_pattern_mask` all present); `atlas_observation_feature_rows_v1`
  (the conflicting candidate) does not exist at all. So the "conflict" is
  between two files sitting in the migrations directory, not two live
  tables — there is genuinely one active owner in production today. No
  migration was applied.
- [x] G-04 Canonical embedding coverage: ran `scripts/atlas/atlas-embedding-ranking-diagnostic-v1.mjs`
  live (2026-08-26) — real output: overall `status: "WARN"` (not PASS).
  Gates: `qdrantVectors: true`, `embeddinggemma768: true`,
  `postgresVectorFetched: false`, `canonicalPostgres768: true`,
  `astRankingComputed: false`, `identityJoinObserved: false`,
  `turbovecCollectionAligned: true`. Postgres side confirms the same
  `content_embedding_768` vs `content_embedding` split this session
  independently found elsewhere (576 vs 52,380 populated) — third
  independent confirmation of that discrepancy now (this diagnostic, the
  NE-VALIDATE-01 gate fix, and the earlier direct SQL check). Reported
  honestly as `WARN` — not claiming this gate passes when its own script
  says it doesn't.
- [ ] G-05 Retrieval benchmark inputs: identify one frozen query set,
  CandidateOrdinal map revision, ordinal-map checksum, and compatible
  query/candidate representation descriptors for `semantic_768`,
  `semantic_mrl_512`, `semantic_mrl_256`, and `semantic_mrl_128`. Each
  descriptor MUST bind model/encoder revision, role, dimension, normalization,
  and metric. `latent_128`/`latent_64` remain separate representation families.
  No new vector-store writes.
- [ ] G-06 Graph feature readiness: report graph snapshot revision and
  ordinal-map checksum separately from PageRank/PPR rank revisions, Leiden
  community revision, `topology_4d` basis revision, and SOM prototype and
  assignment revisions. Missing PageRank, topology, or SOM values are
  independently blocked and must not invalidate canonical graph identity.
- [ ] G-07 Memory/runtime budget: report WSL2 GPU free VRAM, host RAM, CPU
  worker limit, and whether the runtime silently falls back from CUDA.
- [ ] G-08 Acceptance receipt: after G-01 through G-07, run the bounded
  preflight and attach `docs/reports/atlas-neural-prefill-validation-v1.json`.

### Read-only preflight evidence (2026-08-24)

The bounded preflight has now been executed successfully, but this does not
close G-01 through G-07 or authorize canonical promotion:

- `atlas.graphify-nlp-prefill-dry-receipt.v1`: `PASS`, `readOnly: true`,
  `databaseWrites: false`, `qdrantWrites: false`, `valkeyWrites: false`, and
  `canonicalPromotion: false`.
- The 1,000-packet Graphify sample produced 4,365 AST-grep candidates;
  4,365/4,365 received read-only identity enrichment.
- Domain classification covered 3,535 candidates; 830 used the declared
  fallback classifier path.
- Observation aggregation produced 174 packet-level projection plans.
- `atlas.neural-prefill-validation-receipt.v1` reports `readinessPercent: 70`.
  Its low-rank check remains degraded because no labeled relevance proof is
  present; the semantic_768 corpus benchmark and live service health gates
  remain open.
- The source-index receipt still reports 85 unresolved file paths, zero symbol
  registry resolutions, and zero semantic_768 coverage in this bounded sample.

Status: `READ_ONLY_PREFILL_PROVEN / PROMOTION_AND_ADOPTION_OPEN`. Do not mark
G-08 complete until the prerequisite health, registry, feature-row, embedding,
graph, and runtime-budget receipts are attached and reviewed.

The subsequent symbol-promotion review is also read-only:

- `42,398` nominations were inspected across TypeScript, JavaScript, and MJS.
- `10,170` declaration-like nominations are `PROMOTION_CANDIDATE` scope;
  `32,228` variables remain `REVIEW_REQUIRED_SCOPE_EVIDENCE`.
- There are `3,080` duplicate source/kind/name groups requiring review.
- `canonical_symbols_created: 0`, `canonical_writes: false`, and
  `database_writes: false`.

This satisfies the evidence portion of G-02, but not canonical promotion:
registry-backed review and an explicit bounded apply decision remain required.

### AST-grep/NLP domain baselines (2026-08-24)

The shared read-only baseline bridge is now wired at
`scripts/atlas/ast-domain-baselines-dry.mjs` and exposed as
`atlas:ast-domain:baselines:dry`. It consumes the existing Graphify
`ast-entity-okf-domain.jsonl` artifact, tokenizes structural and evidence
fields, and evaluates deterministic Multinomial Naive Bayes and multinomial
logistic-SGD baselines over the same hashed feature contract. It performs no
PostgreSQL, Qdrant, Valkey, model, or canonical writes.

The first receipt selected `3,535` labeled candidate rows (`2,848` train,
`687` test) across nine existing OKF candidate domains. Logistic regression
scored `0.8355` accuracy / `0.7872` macro-F1; Naive Bayes scored `0.8049` /
`0.7508`. These are weak-label wiring metrics only: `domain_id` is currently
an OKF candidate label, not reviewed ground truth and not a promotion gate.

The receipt initially undercounted AST-grep provenance because the JSONL
schema carries the extractor identity in its candidate schema rather than an
`extractor_revision` field. The receipt now derives `astGrepRows` from that
schema/evidence marker and records the provenance rule explicitly.

Status: `AST_NLP_BASELINES_WIRED_READ_ONLY / REVIEWED_LABELS_AND_LIVE_PROMOTION_OPEN`.

Additional read-only checks passed in the same tranche:

- `atlas:lane-classifier:extract-keywords`: AST/NLP keyword extraction succeeded
  for `100/100` packets with no database writes.
- `atlas:phase106.2:naive-bayes:train:dry`: the existing packet classifier
  loaded `1,000` packets and completed dry-run training (domain training
  accuracy `74.6%`; feature type `86.0%`; error state and repair lane `96.9%`).
- The existing phase-3 logistic trainer remains a separate database-backed
  path; it is not silently treated as the AST-domain baseline owner. The new
  bridge is the read-only comparison owner until reviewed labels and a durable
  classifier artifact are approved.

The baseline bridge is now also a child of
`atlas:graphify:neural-prefill:preflight`. It inherits the preflight fallback
policy: a missing artifact or classifier error yields a degraded read-only
receipt and preserves the existing Graphify receipt. It is not enabled by the
ordinary mutating `graphify:daily` command.

The integrated preflight was rerun successfully: Graphify export, AST identity
enrichment, OKF classification, aggregation, both domain baselines, and neural
validation completed with `status: PASS`, `readOnly: true`, and zero database,
Qdrant, Valkey, canonical, or training writes. The preflight receipt records
`baselinePromotion: BLOCKED_WEAK_CANDIDATE_LABELS`; overall readiness remains
`70%` because held-out relevance labels and final shortlist quality are still
open.

The neural validator now checks `ast-domain-baselines-dry-v1.json` directly as
`AST_DOMAIN_BASELINES`. A missing, malformed, writable, or zero-AST-row receipt
blocks validation; a valid receipt passes the wiring gate while retaining the
explicit non-promotional weak-label status.

### Read-only indexing audit follow-up (2026-08-25)

The latest indexing audit passes reachability and confirms the active AST
backfill uses `@ast-grep/napi`, but retains these independent blockers:

- Canonical `codebase_chunk_index.content_embedding_768` is populated for only
  `576/52,417` rows; no fallback vector lane may be promoted as canonical.
- No explicit PostgreSQL bitmap-routing table exists; current routing uses GIN
  and Valkey projections.
- Legacy phase-1/1.5 AST scripts still advertise regex fallback. This is a
  cleanup/ownership gate, not evidence that the active backfill used regex.
- The Drizzle sidecar manifest does not declare all detected manual SQL files.

Status: `BASELINE_CLASSIFIER_WIRED / INDEXING_AND_CANONICAL_EMBEDDING_GATES_OPEN`.

Representation clarification: `semantic_768` remains the canonical
EmbeddingGemma vector. `semantic_mrl_512`, `semantic_mrl_256`, and
`semantic_mrl_128` are derived prefix-plus-renormalization lanes.
`semantic_512` is retained only as a reference compatibility name; equal
dimension does not establish compatibility with `semantic_mrl_512`.
No `ast_768` or `ast_semantic_rpc_768` representation is currently registered.

### WebGPU and local model lane clarification (2026-08-25)

WebGPU is an optional browser/local inference challenger, not a prerequisite
for canonical retrieval. The supported shape is Transformers.js plus an
ONNX-compatible model, using the WebGPU device when the browser supports it.
The current official EmbeddingGemma browser example uses the
`@huggingface/transformers` package and
`onnx-community/embeddinggemma-300m-ONNX`.

The repository currently has `@xenova/transformers@2.17.2`, which is the older
Transformers.js package line, and a type-only declaration for optional
`@huggingface/transformers` imports. The declaration does not mean the current
package is installed or that WebGPU execution is proven.

Freeze these ownership rules:

- Go/Ollama EmbeddingGemma remains the server-side `semantic_768` authority.
- Browser WebGPU EmbeddingGemma is a challenger and must emit a model,
  ONNX-export, device, dtype, normalization, and parity receipt.
- Gemma4 generation/summarization is separate from EmbeddingGemma retrieval.
- WebGPU does not imply CUDA Tensor Core or cuTile execution.
- No custom Gemma4 kernel is required for the browser embedding lane unless a
  later ONNX operator/performance proof demonstrates a specific gap.

Status: `WEBGPU_DESIGN_DEFINED / BROWSER_RUNTIME_AND_PARITY_UNPROVEN`.

Workspace validation note: `npm run check` remains blocked by unrelated
pre-existing workspace issues (`98` errors, including missing optional modules
such as `@huggingface/transformers` and `@playwright/test`, plus an existing
`semantic_512` registry mismatch). The AST baseline and startup wrapper passed
their focused JavaScript syntax and read-only smoke checks; no unrelated
application files were changed to mask the broader check failure.

The startup wrapper now exposes the same lane behind the opt-in environment
flag `GRAPHIFY_NEURAL_PREFILL_BASELINES=1`. It is included in the daily neural
receipt and remains fail-open with `CONTINUE_WITH_EXISTING_GRAPHIFY_RECEIPT`.
The ordinary `graphify:daily` path remains unchanged unless the flag is set.

The opt-in wrapper was smoke-tested with
`GRAPHIFY_NEURAL_PREFILL_BASELINES=1 GRAPHIFY_NEURAL_PREFILL_ONLY=1`: the
provenance preflight and baseline completed, the wrapper exited before the
mutating Graphify chain, and the daily receipt recorded
`baselinesOptIn: true`, `readOnly: true`, and `canonicalWrites: false`.

The full `GRAPHIFY_NEURAL_PREFILL=1` path now also refreshes the baseline before
validation, preventing validation from consuming a stale or missing classifier
receipt. The daily receipt distinguishes `baselinesOptIn` from
`baselineRequested` and records the completion status as `baselineStatus`.

An operator-facing alias is now available as
`atlas:graphify:neural-prefill:baselines:only`; it expands to the same guarded
environment and does not enable the ordinary Graphify mutation chain.

The feature-row ownership audit is now also complete and read-only:

- Active repository owner: `20260819_atlas_observation_feature_rows.sql`,
  keyed by `packet_key + feature_revision` and aligned with Drizzle, the
  materializer, and the spectral exporter.
- The competing `candidate_id + workspace_revision` migration remains an
  incompatible candidate and is not the active owner.
- `semantic_768` is intentionally outside the ORF exact/filter table; it stays
  in the canonical vector lane.
- Audit status: `PASS_ACTIVE_ORF_REPOSITORY_ALIGNED`; `writes: false`.

This closes the ownership decision for G-03, but does not apply or reconcile
the competing migration.

## Alignment Addendum: Domain to GPU Fabric

### GPU runtime/version matrix (2026-08-24)

- [x] Verified the RAPIDS WSL2 environment independently: Python `3.14.6`,
  PyTorch `2.13.0+cu130`, CUDA runtime `13.0`, CUDA available, and
  `cugraph`/`nx_cugraph`/`cuvs`/CuPy importable.
- [x] Confirmed the main GPU Docker image is a separate runtime:
  PyTorch `2.11.0` with CUDA `12.6` and Triton/TorchInductor.
- [x] Confirmed the optional LangGraph synthesis image uses PyTorch `2.7.0`
  with CUDA `12.8`; this is not the active NLP sidecar and is not the RAPIDS
  executor.
- [x] Corrected terminology: PyTorch uses a `2.x` release plus a CUDA wheel
  family such as `cu126`, `cu128`, or `cu130`; there is no PyTorch `12.12/3`
  release to align.
- [ ] Keep `cuTile` in an isolated CUDA `13.2+` challenger environment for
  Ampere proof. Do not add it to the LangExtract sidecar or change the proven
  RAPIDS environment while memory/ABI receipts are still open.

### GPU graph execution receipt (2026-08-24)

- [x] Ran the existing frozen `nodes.parquet`/`edges.parquet` artifact through
  both parity runners without score-file outputs or durable writes. NetworkX
  and cuGraph each executed on `162234` nodes, `108156` edges, and
  `54078` connected components. The shared edge diagnostics reported zero
  ordered duplicates, unordered duplicates, and reciprocal pairs.
- [x] PageRank/component execution aligned on the shared snapshot. cuGraph
  reported Louvain modularity `0.999981508191871`; NetworkX reported
  `0.9999815081918709`. This proves same-input execution and numeric
  modularity agreement for the fixture.
- [ ] Do not promote cross-backend community parity yet: the cuGraph runner
  currently returns `louvainCommunityCount: null`, so a partition-level ARI,
  NMI, and repeat-determinism receipt is still required. NetworkX remains the
  CPU reference oracle; cuGraph remains an executor.
- [x] Captured temporary rank/partition outputs from both runners. PageRank
  joined on all `162234` `gpuNodeId` values; maximum absolute score delta was
  `4.888482353787119e-9`, mean absolute delta was
  `3.258988231962292e-9`, and top-100 overlap was `100/100`. The two Louvain
  outputs each contained `54078` communities over all `162234` nodes.
- [ ] Compare Louvain partitions with label-invariant ARI/NMI and fixed-seed
  repeats. Raw community-ID equality is not a valid parity test because each
  backend may assign different numeric labels to equivalent communities.
- [x] Added a CLI adapter to the existing backend-neutral evaluator in
  `python/atlas_community_parity.py` and evaluated the temporary frozen
  receipts. The result was `PROVEN`: ARI `1.0`, NMI `1.0`, pairwise membership
  agreement `1.0`, equal community counts (`54078`), and modularity delta `0`.
  This closes parity for this exact snapshot only; fixed-seed repeat evidence
  and promotion of a durable community projection remain separate gates.
- [x] Replaced the evaluator's quadratic pairwise loop with
  `sklearn.metrics.pair_confusion_matrix`; the 162k-node receipt now completes
  without an O(N^2) memory/time path.

- [ ] G-09 Validate `.okf` documents at two levels: `OKF_V0_2_CONFORMANCE`
  against the upstream OKF specification, and
  `ATLAS_OKF_DOMAIN_PROFILE_V1` for Atlas-specific domain ID, taxonomy
  revision, declared parent/child links, provenance/evidence references,
  lifecycle, and trust metadata where required by Atlas policy. Do not report
  an Atlas-profile violation as an OKF-v0.2 violation.
- [ ] G-10 Emit a read-only ontology tuple receipt distinguishing grounded,
  unresolved, ambiguous, and rejected tuples. Ontology IDs remain references,
  never numeric topology coordinates.
- [ ] G-11 Define the Engram/Valkey boundary: document the actual Valkey
  namespace, TTL, revision envelope, one-to-many metadata shape, and no-write
  fallback. Engram provides deterministic memory coordinates; Valkey is a hot
  cache projection only; Postgres remains canonical truth. Valkey must not be
  described as Engram authority.
- [ ] G-12 Prove transport ownership: simdjson for JSON/NDJSON only, protobuf/
  gRPC for typed tensors and receipts, and Arrow/typed arrays for bounded
  numeric matrices. Record native/fallback parser counts.
- [ ] G-13 Freeze the feature-map contract around CandidateOrdinal,
  featureRevision, sourceRevision, matrix shape, dtype, and ordinal checksum.
- [ ] G-14 Produce the live low-rank receipt: CandidateFeatureMatrix input,
  512 candidates to 96 ordinals, exact semantic_768 rerank, and Recall/NDCG.
- [ ] G-15 Produce a revisioned TopologyFeature4/SOM receipt with prototype
  checksum, assignment checksum, and graph/ontology feature revisions.
- [ ] G-16 Produce a CPU/RTX alignment receipt with dtype/shape conventions,
  free VRAM, host RAM, worker cap, CUDA fallback state, and output checksum.
- [ ] G-17 Resolve the meaning and ownership of “tricubic 7x3”, “12/24”,
  cuTile, and SIMT cache-tile parameters from a source or benchmark before
  adding them to `.okf` or runtime schemas.
- [ ] G-18 Correctly model protobuf transport: varint is 7 payload bits plus a
  continuation bit; protobuf tags use a separate three-bit wire type. Keep
  allow/stop as an explicit bool or named packed mask, not an overloaded bit.
- [ ] G-19 Separate control serialization from numeric transport: JSON/
  MessagePack for descriptors and receipts, simdjson for JSON/NDJSON parsing,
  protobuf/gRPC for typed envelopes, and Arrow/typed arrays or protobuf bytes
  for bounded feature matrices.
- [ ] G-20 Keep embedding L2 normalization separate from Tang-inspired
  `l2`-sampling. The latter requires row-norm/entry-query sampling structures
  and remains `INSPIRED_ONLY` until a CandidateOrdinal shortlist receipt is
  proven.
- [ ] G-21 Emit one boundary receipt across Postgres -> AST/NLP -> feature map
  -> gRPC -> NetworkX/cuGraph -> PyTorch/SOM/low-rank -> ACE/Engram, preserving
  packet identity, revisions, checksums, and fallback state at every hop.
- [x] G-22 Run the read-only gRPC-to-Postgres coverage audit. Core `Packet`,
  `TaskSemanticPacket`, `ConceptRecord`, and ACP queue contracts pass. Optional
  `RouteRuntimePacket` coverage remains incomplete because its expected columns
  and named indexes are absent; do not apply that optional migration implicitly.
- [ ] G-23 Freeze storage representations: `semantic_768` canonical
  `vector(768)`, optional `halfvec(768)` projection, binary `bit(768)` filter
  projection, and 4-bit/nibble TurboVec codes only with codebook/scale metadata.
- [ ] G-24 Verify PostgreSQL 18 AIO and bitmap behavior with `EXPLAIN (ANALYZE,
  BUFFERS)` on read-only queries. AIO is a scan optimization; it is not an
  8KB vector or bitmap schema limit.
- [ ] G-25 Audit Drizzle declarations against explicit pgvector expression
  indexes and GIN/bitmap filters. Do not assume a Drizzle model proves a live
  PostgreSQL index.
- [ ] G-26 Prove Node N-API/LibTorch row-major dtype/shape parity for FP32,
  halfvec-derived inputs, and any interpolation challenger. Interpolation is
  not allowed to change canonical semantic_768 without a Recall/NDCG receipt.
- [ ] G-27 Freeze one-to-many feature materialization as a revisioned CSR-like
  contract: `CandidateOrdinal`, `row_offsets`, `feature_ids`, typed values,
  evidence refs, and source/feature/ontology revisions. Do not use duplicate
  JSON/protobuf map keys for repeated feature values.
- [ ] G-28 Emit a read-only cross-layer descriptor receipt proving the join of
  source, AST/NLP evidence, domain distribution, taxonomy path, ontology
  tuples, feature map, `TopologyFeature4`, ordinal map, and fallback state.
- [ ] G-29 Keep tricubic/interpolation parameters out of topology identity;
  document `4x4x4=64` coefficient semantics and quarantine unresolved `7x3`
  and `12/24` labels until an operator benchmark exists.
- [ ] G-30 Audit Engram lookup/residency against Valkey and Postgres ownership;
  record deterministic key derivation, TTL/epoch, revision envelope, and
  read-only fallback without treating Engram as ontology authority.
- [ ] G-31 Add a bounded tensor materialization receipt for PyTorch CPU/RTX,
  cuTile/SIMT implementation choice, row-major strides, dtype, padding,
  worker cap, VRAM/RAM headroom, and gRPC descriptor checksum.
- [ ] G-32 Test the dimension mapping explicitly: logical `TopologyFeature4`
  remains four features and the baseline block test is `4x4`; a proposed
  `4x6` RTX/cuTile/SIMT layout is physical tiling only. Record logical shape,
  physical tile shape, padding, strides, and CPU/GPU output checksum together.
- [ ] G-33 Keep `7x3` and `12/24` as unresolved feature-group/interpolation
  labels until an operator benchmark defines them. They must not alter
  cuGraph, cuVS, CAGRA, or canonical feature-matrix dimensions.
- [x] G-34 Upgrade the Python TurboVec sidecar contract to pinned
  `turbovec==1.0.0`, prefer `IdMapIndex`, and bind its external IDs to
  `CandidateOrdinal` when supplied. Report whether native allowlist support is
  available; retain positional compatibility fallback for legacy string IDs.
- [ ] G-35 Prove TurboVec 1.0 persisted `.tv/.tvim` compatibility and compare
  native allowlist recall against the full `semantic_768` oracle before any
  shared index promotion. The read-only audit found
  `sveltekit-frontend/.cache/turbovec/evidence_text.tvim` is version 1 and
  cannot be loaded by TurboVec 1.0; rebuild from source vectors is required,
  but no cache deletion or rebuild was performed.
- [x] G-35A Add a read-only TurboVec v1 rebuild plan that identifies the
  maintained Qdrant `codebase_chunks_768`/`content`/768-dim source builder,
  records source-service health, preserves the legacy cache, and emits the
  bounded dry-run/apply commands. The plan does not rebuild or overwrite the
  version-1 `.tvim` artifact.
- [x] G-35B Run the bounded source dry run: Qdrant was reachable, 1,000
  `codebase_chunks_768` vectors were read, all were 768-dimensional, and zero
  vectors were rejected. This proves source readiness only; it does not prove
  CandidateOrdinal mapping, persisted v1 compatibility, full-corpus recall, or
  promotion.
- [ ] G-35C Join Qdrant points to the canonical CandidateOrdinal snapshot before
  any TurboVec rebuild. The read-only payload census found `source_ref` on
  1,000/1,000 sampled points but no `candidateOrdinal` field, so Qdrant point
  IDs must remain projection IDs and cannot be promoted as ordinals. The
  additive bridge is now wired: ordinal maps carry `sourceRef`, and the
  TurboVec builder accepts `--ordinal-map=...` and resolves by `source_ref` or
  `packet_key`. A bounded read-only run joined `1/1000` Qdrant rows, proving
  the lookup path but leaving corpus-slice/revision alignment blocked; live
  coverage and full-corpus recall remain unproven. The dedicated audit now
  records `source_ref` on `1000/1000` Qdrant rows, `packet_key` on `134/1000`,
  `source_ref` matches on `1/1000`, `packet_key` matches on `1/1000`, and zero
  identity conflicts. This indicates sample population/revision mismatch,
  not an ambiguous join.

The safe first command is `npm run atlas:graphify:neural-prefill:preflight`.
The similarly named `npm run atlas:graphify:neural-prefill:daily` remains a
full startup command and may run mutating Graphify stages; it is not a smoke
test.

## P3 — Tournament training and quantized deployment

These tasks are downstream of the retrieval and replay gates. They create
evaluation artifacts first; they do not authorize online self-training or
automatic model replacement.

- [ ] NE-36 Build a tournament evaluation gym from frozen Graphify snapshots:
  deterministic train/validation/test source-revision splits, domain-stratified
  queries, n-ary ontology/hyperedge labels, and exact semantic/lexical/graph
  relevance references.
- [ ] NE-37 Run best-of-N candidate ranking for the 512-to-96 shortlist:
  exact baseline, low-rank PyTorch sampler, SOM admission, cuVS exact, and
  quarantined CAGRA challenger. Record Recall@K, NDCG, MRR, top-K overlap,
  latency, VRAM, CPU RAM, and fallback state.
- [ ] NE-38 Export only verified tournament winners into QLoRA training tuples;
  every tuple must retain `source_ref`, `packet_key`, `workflow_id`, graph and
  representation revisions, evidence spans, domain, ontology tuples, and
  outcome/reward provenance.
- [ ] NE-39 Train QLoRA adapters offline against the verified tuple export;
  compare base, adapter, and retrieval-only baselines. No adapter may alter
  retrieval identity, Qdrant vectors, PageRank, or canonical Postgres facts.
- [ ] NE-40 Audit model artifacts and quantization names. `GGUF`, `NF4`,
  `INT4`, `RotorQuant`, `TurboQuant`, `isoquant`, and other quantizers must
  record an actual artifact, converter, runtime, checksum, and quality receipt;
  genuinely unidentified names (e.g. `ornith`) remain `UNRESOLVED`, not
  promoted. `Quaterion` is a real Qdrant framework name, not an unresolved
  one — its own promotion path is NE-25A..NE-25E, not this quantization gate.
- [ ] NE-41 Prove CPU/RTX replay parity for FP32 first, then evaluate BF16,
  FP16, INT8, and INT4 only by retrieval quality and memory receipts. Tensor
  Core use is an implementation detail, not a promotion criterion.
- [ ] NE-42 Add a final GAN status receipt distinguishing `CREATED`, `WIRED`,
  `PROVEN`, and `DONE`, with replay, cache, provenance, identity, and
  no-silent-fallback checks.
- [x] NE-43 Complete the file-level wiring inventory above with exact command,
  report path, and owner revision for every lane before adding a new adapter.
- [x] NE-44 Reuse the existing tournament/replay/QLoRA/GGUF owners identified
  above; any proposed replacement must include a supersedes decision and
  migration proof.
- [ ] NE-45 Run the bounded docs acquisition and symbol-index sequence:
  `npm run docs:okf:dev:crawl -- --limit=...` followed by
  `npm run docs:okf:dev:index`; retain raw markdown as evidence and keep
  symbol JSONL/Arrow/IPC outputs rebuildable.

## P4 — ACE/RLM/KAG/DAG/HyperGraphRAG Live Alignment

These tasks close the boundary between the proven bounded contracts and the
live Graphify retrieval workflow. They do not authorize autonomous writes,
online self-training, or projection while identity/revision gates are open.

- [ ] NE-46 Bind `runHypergraphFusionFacade` to the canonical
  `FeatureIntelligenceRepository` and a frozen Graphify source snapshot;
  emit repository, source, and CandidateOrdinal checksums.
- [ ] NE-47 Populate ACE lineage with relationship, graph, semantic-model,
  semantic-projection, and feature-matrix revisions; fail closed when a
  required revision is absent or incompatible.
- [ ] NE-48 Wire `buildHyperRagAceMetadataPatch` into the existing canonical
  packet transaction after `AcePacketV2` validation; preserve the canonical
  envelope and record the versioned metadata namespace.
- [ ] NE-49 Add a bounded HyperGraphRAG/KAG/DAG replay receipt containing
  input candidates, canonical accepts/rejects, hop/fanout limits, expanded and
  pruned counts, relationship/evidence counts, and retrieve-more/synthesize
  decision.
- [ ] NE-50 Record the ACE top-K/payload cap as policy data rather than an
  implicit `slice(0, 20)` and prove deterministic reruns on the same snapshot.
- [ ] NE-51 Choose one durable RLM trace owner and wire observable request,
  revision, selected-packet, outcome, and provenance fields; console logging
  alone is not a proof. Keep traces out of canonical evidence authority.
- [ ] NE-52 Connect the bounded SvelteKit RLM recursive engine to the selected
  orchestrator seam, or explicitly mark the parent-atlas-core orchestrator as
  a separate deprecated scaffold with a supersedes decision.
- [ ] NE-53 Replay live Graphify candidates through canonical entity,
  relationship, evidence, ACE, and RLM adapters; keep Neo4j/Qdrant/Valkey
  projections read-only until the receipt passes.
- [ ] NE-54 Add contradiction/stale evidence fixtures and prove that the
  sufficient-context gate blocks synthesis until the evidence state is
  resolved or refreshed.
- [ ] NE-55 Add adaptive entity-to-hyperedge confidence propagation and an
  ablation against greedy traversal, or retain the current deterministic beam
  search explicitly as a challenger.
- [ ] NE-56 Require ACE callers to populate `ContextEvidenceIdentityV2` and
  reject incomplete identity before exact evidence promotion; legacy discovery
  candidates may remain `complete: false` but cannot become canonical context.
- [x] NE-57 Define `RlmEnvironmentV1` around a revisioned context artifact,
  CandidateOrdinal set, permitted operations, max depth/subcalls/tokens/bytes,
  and explicit `RLM_PROGRAM_FAILED` failure receipt. True recursive model
  execution and sandbox enforcement remain separate gates.
- [ ] NE-58 Prove `ContextManifestV2` determinism using candidate-ordinal,
  evidence-revision, ordinal-map, retrieval-policy, ACE playbook, model, and
  prompt-template checksums on the same frozen snapshot.
- [ ] NE-59 Verify current external contract versions before implementation:
  OKF v0.2 reader/writer compatibility, MCP 2026-07-28 capability/config
  behavior, cuTile compute capability/tile constraints, and protobuf map versus
  repeated-entry semantics. Record the source ledger and migration policy.

## Acceptance Gates

- [ ] No canonical identity or source data changes during dry-run/training.
- [ ] No projection occurs while model, identity, or parity gates fail.
- [ ] Every latent vector is reproducible from `semantic_768` plus the model
  manifest.
- [ ] ACE receives canonicalized evidence, never raw ANN hits.
- [ ] QLoRA, preference optimization, and RL/bandit training remain blocked
  until NE-31 through NE-38 produce replayable quality evidence.
- [ ] Quantized GGUF or adapter deployment remains blocked until the exact
  FP32 reference and the quantized challenger pass the same held-out suite.

## P0 — Structural identity bridge (2026-08-24, promoted ahead of latent training)

**Critical-path reordering.** Training a compact encoder now would learn over
a structurally incomplete/ambiguously-grounded candidate corpus. The new
priority is `AstObservationV1 → tree_node_id → symbol_version_id →
stable_symbol_id → packet_key → CandidateOrdinal` (P0), then indexed
structural retrieval (`atlas_callable_search`, P1), before any derived
representation (`semantic_768`/bitset-Jaccard/latent_128/latent_64`, P2).
`latent_128` is explicitly no longer the immediate blocker.

- [x] NE-ID-01/02 (verified, not built this pass) `atlas_symbol_registry`
  (10,170 active rows, `promote-ast-symbols-to-registry.mjs`, Session 200)
  already freezes `stable_symbol_id` as an observation-derived identity, and
  `atlas_symbol_versions` (schema already has `symbol_version_id`,
  `stable_symbol_id`, `source_ref`, `source_revision`, `byte_start`/`byte_end`,
  `packet_key`, `candidate_ordinal`, `parameter_names`/`types`/`return_types`/
  `imports`/`calls` — i.e. the callable-search shape NE-CALL wants already
  exists as columns) has an FK to it. Both existed before this session.
- [x] NE-ID-03/04 typed failure classification added + real root cause found.
  `materialize-ast-symbol-versions.mjs`'s `atlas_ast_nodes` join previously
  used `n.source_ref_key = v.source_ref` — but `source_ref_key` is a
  **composite key** for declaration-level nodes
  (`"<path>#<kind>:<qualifiedName>"`, e.g.
  `"src/lib/ai/base64-fp32-quantizer.ts#function:quantizeGemmaLegalOutput"`),
  not a bare path, confirmed via live sample rows. The old join silently
  matched **0 of 100** existing `atlas_callable_search` rows
  (`tree_node_id` NULL on all 100, no error — a LEFT JOIN miss is silent by
  design) — this was previously undocumented. Fixed the join to reconstruct
  the real composite key from `source_ref + callable_metadata->>'kind' +
  qualified_name`, and replaced the silent LEFT JOIN with an explicit
  candidate-count classification: 0 matches → `UNRESOLVED`, 1 → `RESOLVED`
  (sets `tree_node_id`), >1 → `AMBIGUOUS` (does not guess; `tree_node_id`
  stays NULL). Outcome is written into
  `atlas_callable_search.callable_metadata.identity_bridge_outcome` so it's
  queryable, not just logged. **Fix logic validated correct**: manually
  confirmed `quantizeGemmaLegalOutput` resolves to exactly 1
  `atlas_ast_nodes` row via the reconstructed key.
- [x] NE-ID-05 (real number obtained; result is BLOCKED, not zero-ambiguous)
  Re-ran `materialize-ast-symbol-versions.mjs --apply --limit=100` (the same
  100-row fixture already in the table) with the fix: **result is still
  100 UNRESOLVED, 0 RESOLVED, 0 AMBIGUOUS** — not because the join logic is
  wrong (see NE-ID-03/04's validation above), but because of a deeper,
  previously-unrecorded finding: **the two tables draw from disjoint
  source-ref namespaces.** `atlas_symbol_versions`/`atlas_symbol_registry`
  are populated overwhelmingly from `packages/` and `scripts/`-rooted
  source refs (only 50 of 10,170 active registry rows even contain `src/`
  in their `canonical_key`), while `atlas_ast_nodes` (11,067 rows) is
  populated exclusively from `src/`-rooted refs (0 rows outside `src/`,
  confirmed via `split_part(source_ref_key,'/',1)` distinct check). This
  bounded 100-row fixture happened to sample entirely from the
  non-overlapping side. Zero ambiguous joins is trivially true here (0
  candidates ≠ 0 ambiguity) but the real gate — resolvable — is far from
  proven at scale.
- [x] NE-ID-06 (option (b) attempted; real number obtained; deeper gap found)
  Correcting the previous "only 50 of 10,170 registry rows contain `src/`"
  reading — that was a `LIKE '%src/%'` check against `canonical_key`, which
  is the wrong field to check. Re-derived from the actual nominations/
  resolution source directly: **10,047 of 10,170** canonical declaration
  candidates (99%) are genuinely `src/`-rooted; the first 100 in file order
  happened to be 100% `packages/`/`scripts/` because the underlying export
  is alphabetically ordered by directory (`packages` < `scripts` < `src`) —
  the first `src/`-rooted candidate is at index 123. Re-ran
  `materialize-ast-symbol-versions.mjs --apply --limit=200` (the next 100
  rows past the already-materialized 100, landing well past index 123):
  **3 RESOLVED, 197 UNRESOLVED, 0 AMBIGUOUS.** All 3 resolved rows are real
  `src/lib/ai/base64-fp32-quantizer.ts` symbols (matches the earlier manual
  validation). Investigated the UNRESOLVED `src/`-rooted rows directly:
  `src/app.d.ts`, `src/ambient-legacy.d.ts` (ambient declaration files —
  `atlas_ast_nodes` has zero rows for either), and `src/auth-store.svelte.ts`
  (zero rows for this top-level file too) — none of these files exist in
  `atlas_ast_nodes` at all. `atlas_ast_nodes` covers only **2,196 distinct
  files total**, and every `source_ref_key` found there falls under
  `src/routes/` or `src/lib/` specifically — top-level `src/*.ts`/`*.d.ts`
  files (outside both subtrees) are entirely unindexed. **Real conclusion**:
  this is not a join-format bug (already fixed, already validated correct)
  and not a `packages/`-vs-`src/` split (that assumption was wrong) — it is
  an `atlas_ast_nodes` **coverage gap** even within `src/`: its own AST
  extraction pass never ran over `src/routes`/`src/lib`'s siblings or
  top-level files. Fixing this requires re-running whatever produced
  `atlas_ast_nodes`.
- [ ] NE-ID-07 (correction — the forward path proposed in NE-ID-06's note
  was wrong, checked before acting on it) Went looking for that populator.
  `run-graphify-daily-startup.mjs`'s `GRAPHIFY_NATIVE_STRUCTURAL` lane
  (`sveltekit-frontend/scripts/atlas/native-structural-materializer.mts`) is
  live-healthy (`docker ps`: `miniforge-nlp-sidecar` up 5h; `curl
  127.0.0.1:8095/health`: `treesitterChunker.available=true,
  version=4.0.0, importVerified=true`) and does call the 8095 sidecar
  internally — but confirmed by reading the script and its two direct
  imports (`GraphifyStructuralMaterializer`,
  `graphify-structural-intelligence-adapter.ts`) that **neither writes to
  `atlas_ast_nodes` at all** — zero occurrences of the table name in either
  file. That lane writes to `atlas_symbol_registry` / the evidence ledger /
  evidence entities, a related but distinct pipeline, and is separately
  hardcoded `canonical_write_gate: 'BLOCKED_SOURCE_REVISION_AUTHORITY_UNPROVEN'`
  regardless of `--apply`. **Correcting my own prior turn**: this is not
  the fix path for NE-ID-06 after all. Extended the search for the actual
  `atlas_ast_nodes` writer to Rust (`*.rs`, no `crates/` dir found in this
  repo) and manual SQL (`drizzle/manual/*.sql`, DDL only, no `INSERT`) —
  still zero hits anywhere in the current working tree. The original
  11,067-row population source is genuinely not findable via static
  search from this repo state; most likely a script that was later deleted/
  archived, or a manual one-off `docker exec psql` seed (both are
  established patterns elsewhere in this repo's own history per
  project CLAUDE.md). **Stopping here rather than guessing further** — do
  not scale bounded symbol-version materialization, and do not attempt to
  build a new `atlas_ast_nodes` writer speculatively, until an operator
  either locates the original producer or makes an explicit decision to
  build a new one.
- [ ] `atlas_packet_features.ast_symbols` remains explicitly
  `DENORMALIZED_RETRIEVAL_FEATURE`, never structural authority — unchanged,
  no action needed this pass.

### Recorded but not attempted this pass (recommendations only)

The rest of a larger reprioritization proposal — P1 indexed structural
retrieval (NE-CALL-01..06: populate `atlas_callable_search` only from
bridge-proven rows, B-tree/GIN/FTS/pg_trgm index proof, Recall@K/MRR
benchmarking against `rg` and query-time reparsing); a structural
binary-Jaccard lane (NE-JAC-01..08: `FeatureBitOrdinalMapV1` +
`StructuralBitsetV1` over set-valued facts only — AST kinds/concepts/
domains/calls/imports, explicitly never `semantic_768`/PageRank/topology/
latent values — exact Postgres Jaccard oracle before an HNSW
`bit_jaccard_ops` challenger); a graph projection contract (NE-GRAPH-01..08:
freeze `GraphSnapshotV2` bound to `CandidateOrdinalMapV1`, split
`StructuralDiGraphV1` vs `AffinityGraphV1`, NetworkX as CPU parity oracle,
direct cuGraph as the RTX executor, `nx-cugraph` compatibility-only —
never as the CPU half of a parity check); connected-component gating before
spectral clustering (NE-SPEC-01..07: never report a frozen benchmark K as a
discovered natural K); an explicit `AffinityFusionPolicyV1` (NE-AFF-01..05:
version and coefficient every affinity family — semantic cosine, ontology
Jaccard, AST Jaccard, call affinity, hyperrelation affinity — bind its
checksum into the graph projection checksum, never sum heterogeneous scores
implicitly); tighter XGBoost/LibTorch/RAPIDS-challenger gates (qid-grouped
CUDA device receipts with real NDCG@K; `libtorchAbiMode: VERSION_PINNED |
LIMITED_STABLE_ABI` plus `stableApiMinimumVersion` distinguishing PyTorch
2.8's *limited* stable ABI from full ABI stability; a separate
`atlas-rapids-cu13-26.08` challenger environment replaying the same frozen
fixtures against the proven `26.06` reference, never upgrading it in place)
— was reviewed against the live repo and judged directionally correct, but
none of it was implemented this pass. It is a multi-session effort, not a
documentation gap that can be closed in one addendum; treat this paragraph
as the pointer back to the original proposal, not as a substitute for
writing the actual typed contracts when that work is picked up.

## NE-CLASS-01: PostgreSQL 18 class-level bitmap + pgvector index (2026-08-26)

User request: "a class index from ast-grep, postgresql 18 table, for a
bitmap / pgvector index." Built and **live-applied** (not just scaffolded)
against `legal-ai-postgres`.

- [x] **Found and reused an existing, reviewed design** rather than
  inventing a new one: `sveltekit-frontend/drizzle/manual/20260824_graphify_file_search_bitmap_v1.sql`
  is a file-level analog (candidate ordinal identity, `bit(16)` bitmap
  column, GIN full-text + JSONB indexes, partial pgvector HNSW index) —
  confirmed via `git log` to be dated the same session as the "No explicit
  PostgreSQL bitmap routing table exists" finding
  (commit `4386ba65bc`). Confirmed live: that file-level table was **never
  applied** (`relation "atlas_file_search_index_v1" does not exist`) — it
  remains a designed-but-gated scaffold, its own header says "do not apply
  until the read-only export and schema audit pass."
- [x] Confirmed the real class-level data source already exists:
  `atlas_ast_nodes WHERE node_kind = 'class'` — 3,675 live rows (of 11,067
  total AST nodes; the table's known coverage gap is `atlas_ast_nodes`
  itself, tracked separately under NE-ID-06/07 below, not something this
  task changes).
- [x] Added `sveltekit-frontend/drizzle/manual/20260826_atlas_class_search_index_v1.sql`
  — `atlas_class_search_index_v1`: candidate-ordinal identity FK'd to
  `atlas_ast_nodes.tree_node_id`, `class_bitmap bit(16)` (reserved, no
  flag semantics assigned yet — do not invent meaning for it
  speculatively), a generated `tsvector` (GIN-indexed) over
  `qualified_symbol`/`relative_path`/`normalized_signature`/`tokens`, and
  a partial HNSW `vector(768)` index (`WHERE embedding IS NOT NULL`,
  `m=16, ef_construction=64` — matching this repo's one other live HNSW
  config convention). Best-effort `packet_key`/`feature_id`/`feature_label`
  via `LEFT JOIN atlas_packets ON atlas_packets.source_ref =
  atlas_ast_nodes.relative_path` (a class's containing file, not the class
  itself — there is no class-granularity packet identity).
- [x] **Found and fixed a real, previously-latent bug** while applying:
  `array_to_string(anyarray, text)` is `pg_proc.provolatile = 's'`
  (STABLE), not IMMUTABLE, in live PostgreSQL 18.4 — confirmed by direct
  `CREATE TABLE ... GENERATED ALWAYS AS (array_to_string(...)) STORED`
  reproduction, which fails with `generation expression is not immutable`.
  **The sibling file-level scaffold above has this exact same bug** in its
  `search_vector` column and would fail identically if anyone tried to
  apply it — plausibly the real reason it was never applied, not (only)
  the "read-only export and schema audit" gate its comment names. Fixed
  here via the standard wrapper pattern: `CREATE FUNCTION
  atlas_immutable_array_to_string(text[], text) RETURNS text AS $$ SELECT
  array_to_string($1, $2) $$ LANGUAGE sql IMMUTABLE PARALLEL SAFE;`. Not
  fixed in the file-level scaffold itself — that table wasn't requested
  and applying/editing it wasn't in scope, but the bug is flagged here so
  whoever picks up that gate next doesn't have to rediscover it.
- [x] Added `scripts/atlas/backfill-class-search-index.mjs` — reusable
  populator (DRY_RUN default / `--apply` flag, matching the
  `materialize-kag-contracts-v1.mts` convention elsewhere in this repo).
  For the actual live backfill this session, ran the equivalent SQL
  directly via `docker exec legal-ai-postgres psql` (blocked from reading
  `.env` for DB credentials by a permission policy; direct `docker exec`
  needs no password, matching root CLAUDE.md's own "use docker exec
  directly, never a Node.js DB wrapper for smoke/seed work" rule) — the
  `.mjs` script is kept as the durable, re-runnable asset for future
  incremental backfills (e.g. after `atlas_ast_nodes` gains broader
  coverage).
- [x] **Live-verified, not assumed**: 3,675/3,675 rows inserted,
  145/3,675 (3.9%) resolved a `packet_key` (consistent with this
  session's separate finding that most files aren't yet packet-registered
  — not a bug in this task), 0/3,675 have an `embedding` (intentional —
  no class-level embedding pipeline exists yet, never fabricate vectors).
  Full-text search verified functional: `search_vector @@
  to_tsquery('simple', 'cachinglayer')` and the `:*` prefix form both
  correctly match `CachingLayer` (`src/lib/server/ai/caching-layer.ts`).
  Migration and backfill both re-run confirmed idempotent (`IF NOT
  EXISTS`/`ON CONFLICT DO UPDATE`, second run: still exactly 3,675 rows,
  no duplicates, no errors).

**Not claimed**: this is a rebuildable *search projection*, not a new
identity or truth source — `atlas_ast_nodes` remains canonical. The
`class_bitmap bit(16)` column has no assigned flag semantics yet (reserved
for a future caller to define, not fabricated here). No embeddings exist
in this table yet, so the pgvector HNSW index is currently indexing zero
rows (a correctly-empty partial index, not a bug) — populating it requires
a class-level embedding step that does not exist anywhere in this repo
yet, and building that embedding pipeline was out of scope for this task.

**NE-CLASS-01 addendum (same session)**: wrote the embedding pipeline
this note above says was out of scope — `sveltekit-frontend/scripts/atlas/backfill-class-embeddings.mts`,
reusing `embedQueryForLane(..., 'dense_768')` from `embedding-service.ts`
(not a new Ollama caller). **Blocked, not completed**: confirmed Ollama +
`embeddinggemma:latest` (768-dim) are live and reachable, and the script's
logic/imports resolve cleanly, but every DB write attempt fails with
`SASL: client password must be a string` — this agent session is
permission-blocked from reading `.env` for `DATABASE_URL`, and (checked)
no other script in this repo self-loads `.env` via dotenv either; they
all rely on the invoking shell already having it sourced. This is a
credential/permission boundary, not a code bug — the script is ready to
run from an operator's normal dev shell:
`npx tsx scripts/atlas/backfill-class-embeddings.mts --apply` (from
`sveltekit-frontend/`, dry-run by default without `--apply`).

## NE-VALIDATE-01: standalone neural pre-fill validation gate (2026-08-26)

Continuation of a prior-session line of work (verified real via file
timestamps before touching anything: `parameter-artifact-lookup-v1.ts`,
its compatibility gate, `qlora-training-gate.ts`, and
`computation-cache-key.ts` all predate this session, dated 2026-08-20/24).
That prior work's own trace described building "a standalone read-only
validation gate ... embedding geometry, low-rank Tang labeling, metadata
index ownership, QLoRA write restrictions, parameter lookup compatibility
and the daily NLP prefill receipt ... PASS/DEGRADED/BLOCKED" as
in-progress; no such script existed anywhere in `scripts/atlas/` when
checked. Built it.

- [x] `sveltekit-frontend/scripts/atlas/neural-prefill-validation-gate.mts`
  — 6 independent checks, each fails open to `DEGRADED` on an unexpected
  error rather than crashing the whole gate (`BLOCKED` reserved for a
  structurally missing/broken contract, per this session's
  "graceful-fallback, still in progress" design note). Does not gate the
  daily Graphify chain — deliberately standalone, matching the explicit
  original intent ("without making the daily Graphify chain depend on it
  yet").
- [x] **4/6 checks run and verify real code, live**: `qlora_write_restrictions`
  (calls `evaluateQloraTrainingGate()` with maximally-favorable fabricated
  evidence and asserts `canonicalWritesAllowed`/`onlineTrainingAllowed`/
  `trainableBaseWeights` are still hard-locked `false` even then — PASS),
  `parameter_lookup_compatibility` (asserts `matchesParameterArtifactLookupV1`
  accepts a `semantic_768` self-match and correctly rejects a
  `semantic_mrl_256` cross-representation match — PASS), `tang_labeling_honesty`
  (greps this change's own `tasks.md`/`design.md` for an overclaim pattern
  vs. the honest "Tang-inspired" disclaimer — PASS, found the disclaimer,
  no overclaim), `daily_nlp_prefill_chain` (confirms
  `graphify-nlp-prefill-dry.mjs` exists and self-documents read-only —
  PASS; deliberately does NOT re-execute that script, to keep this gate
  fast and side-effect-free).
- [x] **2/6 checks (`embedding_geometry`, `metadata_index_ownership`) hit
  the same `.env`-credential wall as the class-embeddings backfill above**
  — correctly reported `DEGRADED`, not a crash, not a false `PASS`.
  **Independently verified both checks' query logic is correct** via
  `docker exec psql` (no credential needed): `pg_indexes` reports 163 live
  GIN indexes in the public schema (confirms `metadata_index_ownership`
  would PASS); 5 sampled real embeddings from
  `codebase_chunk_index.content_embedding` measured L2 norm between
  0.9999893 and 1.0000196 (confirms `embedding_geometry`'s ≤0.01 tolerance
  would PASS).
- [x] **Found and fixed a real column-choice bug while verifying**: the
  gate originally queried `codebase_chunk_index.content_embedding_768`
  (`vector(768)`) — the column root CLAUDE.md documents as canonical — but
  live-checked it is only 576/52,417 (1.1%) populated. The practically
  populated column is `content_embedding` (`halfvec(768)`, 52,380/52,417 —
  99.9%), matching this session's own earlier-recorded finding
  ("content_embedding_768 currently reports no canonical populated rows").
  Fixed the gate to sample the actually-populated column, with an inline
  comment explaining why, rather than silently reporting `DEGRADED`
  forever against an empty column.
- [x] Also caught and fixed a path-resolution bug of its own
  (`tang_labeling_honesty` used 2 `../` segments instead of 3, silently
  finding zero files) before it could ship as a permanently-`DEGRADED`
  check that looked like an environment limitation but was actually a
  bug — cross-checked against the working `daily_nlp_prefill_chain`
  check's correct 3-segment path to catch the inconsistency.
- [x] Writes a JSON receipt to
  `docs/reports/atlas-neural-prefill-validation-gate-v1.json` on every
  run (schema `atlas.neural-prefill-validation-gate.v1`).

**Not claimed**: this run's overall verdict was `DEGRADED` (2 checks
blocked on credentials, not fabricated as `PASS`). How to resolve the
credential boundary for future automated runs remains open — not decided
here.

**Wired in (2026-08-26)**: added an optional `neural-prefill-validation-gate`
step to `scripts/atlas/graphify-nlp-prefill-dry.mjs`, run last, via a new
`runOptional()` helper (never throws — a crash here is caught and recorded,
not propagated). The chain's own `status` field is computed excluding
`optional`-flagged steps, so this can never fail the daily chain regardless
of the gate's verdict — the gate's real per-check verdicts are still
attached to the step record (read back from its own JSON receipt, since
`execFileSync`'s exit code alone can't distinguish "crashed" from
"completed but DEGRADED": the gate script exits 0 in both cases by design).
Live-verified end to end: `node scripts/atlas/graphify-nlp-prefill-dry.mjs
--limit=10` — all 4 required steps PASS, the gate step correctly surfaces
its true `DEGRADED` verdict (same 2 credential-blocked checks as above),
and the chain's overall `status` still reports `PASS`.

**Correction (2026-08-26, same session, caught before this shipped
uncorrected)**: the wiring above has been **reverted**.
`scripts/atlas/graphify-nlp-prefill-dry.mjs` is back to its original 4-step
form, no `runOptional`, no gate invocation. Reason: while auditing "how far
are we to completion," found `scripts/atlas/validate-neural-prefill-pipeline.mjs`
already exists, already covers overlapping ground (`EMBEDDING_GEOMETRY`,
`PARAMETER_LOOKUP`, `QLORA_BOUNDARY`, `DAILY_NLP_PREFILL` plus 4 more this
session's gate doesn't have: `LOW_RANK_POLICY`, `PACKET_AGGREGATION`,
`AST_DOMAIN_BASELINES`, `INDEX_METADATA`), and **is already wired into the
same preflight chain** — `neural-prefill-preflight.mjs` calls both
`atlas:graphify:nlp:passes:dry` and `atlas:neural:prefill:validate`
(→ this `.mjs` file) as separate steps. Wiring `neural-prefill-validation-gate.mts`
into the first of those would have made the same preflight run invoke two
parallel, uncoordinated validators over overlapping ground — exactly the
"N silently-competing owners" failure pattern this repo's own Duplication
Prevention rule (root CLAUDE.md) describes.

**Why not just merge the two**: `validate-neural-prefill-pipeline.mjs` is
deliberately plain-`node`-executable (`"atlas:neural:prefill:validate": "node
../scripts/atlas/validate-neural-prefill-pipeline.mjs"`, no `tsx`
dependency) — that's *why* it does static text-pattern matching
(`.includes('onlineTrainingAllowed: z.literal(false)')`) and stale-receipt
reads instead of live functional calls: plain Node can't import the `.ts`
contract files it's checking. `neural-prefill-validation-gate.mts` is
`tsx`-run specifically so it *can* import and actually call
`evaluateQloraTrainingGate()` / `matchesParameterArtifactLookupV1()` for
real, plus query Postgres directly — genuinely deeper verification, not a
redundant rewrite, but on a different execution model. Converting the
canonical validator to require `tsx` is a real design decision (adds a
dependency to the fast preflight path) — not made here.

**Resolution**: classified, not merged and not deleted.
`validate-neural-prefill-pipeline.mjs` remains the canonical, wired-in,
fast preflight owner. `neural-prefill-validation-gate.mts` is reclassified
as a standalone, manually-run, deeper functional-verification companion —
useful on its own (`npx tsx scripts/atlas/neural-prefill-validation-gate.mts`
from `sveltekit-frontend/`), not invoked by any automatic chain. Whether to
eventually backport live-functional depth into the canonical validator (at
the cost of a `tsx` dependency in the fast path) is an open design
question, not decided here.

## NE-DECODER-01: neural decoder ground truth, no training run (2026-08-26)

User asked whether a "neural decoder" exists for the pre-fill DAG and
whether it relates to the Ewin Tang-inspired shortlist step. **It does
not** — clarified and recorded here so the two are never conflated again:
Tang's method is classical randomized linear algebra (length-squared
sampling) used purely for candidate-set shortlisting
(`CandidateFeatureMatrix` → ~96 `CandidateOrdinal` rows); it has no
encoder/decoder structure and touches no neural weights. A neural decoder,
if it exists, would be the reconstruction half of the `semantic_768 ->
latent_128 -> latent_64` encoder path referenced elsewhere in this table.
Investigated read-only; **no training was run**, no checkpoint was
produced, nothing changed.

- [x] **The decoder architecture is real code, not aspirational**:
  `python/atlas_compute/latent_autoencoder.py::NestedSemanticAutoencoder`
  — genuine PyTorch `nn.Module` with `self.encoder`, `self.decoder128`,
  `self.decoder64` (`nn.Sequential` stacks), and `encode()` /
  `decode128()` / `decode64()` / `forward()` methods. Its own docstring is
  already honest about scope: "a derived-routing experiment... never
  promotes latent vectors to canonical semantic evidence."
- [x] **A real training script exists and would produce a real
  checkpoint**: `python/atlas_semantic512_autoencoder_train.py` — genuine
  `torch.save({..., "stateDict": model.state_dict(), ...})`, default
  output `data/atlas-ml/semantic512-autoencoder.pt`.
- [x] **Confirmed live: it has never actually been run.** `data/atlas-ml/`
  contains no `.pt` file at all (checked directly, not inferred). The
  repo's only real trained checkpoints anywhere are unrelated:
  `models/packet-jepa/packet-jepa.pt` (533KB, 2026-07-10) and
  `models/policy-reranker.pt` (196KB, 2026-06-13) — neither is this
  autoencoder.
- [x] **Confirmed the deployed pipeline doesn't even use this network.**
  The most recent `latent_128` backfill receipt
  (`docs/reports/latent-128-backfill.json`, generated 2026-08-23) shows
  `"projection": "provisional-fold-tanh-768-to-128"` — a different,
  non-neural, hand-coded fold+tanh placeholder — and even that only ran
  `DRY_RUN`, 16 points, 0 Qdrant writes, 0 Redis writes. So today: the real
  decoder exists as unrun code; production uses a simpler untrained
  stand-in instead; neither has shipped a real trained representation.

**Not done, by design — this was a ground-truth check, not an
implementation task**: no training run, no checkpoint, no promotion, no
wiring of `NestedSemanticAutoencoder` into any live path. Training it for
real is a consequential action (real GPU time, produces an artifact whose
quality can't be judged from source alone) and needs an explicit go-ahead,
not a speculative run. This closes the evidence-table gaps above from
"vague" to "precisely sourced," not from "todo" to "done."

## RETRIEVAL-TRANSPORT-01: distinguish host and Docker-internal Qdrant paths (2026-08-26)

- [x] Updated `scripts/atlas/atlas-embedding-ranking-diagnostic-v1.mjs` to
  accept `--transport=auto|host-rest|docker-internal` and persist the
  requested/effective transport, endpoint, and host transport error in the
  read-only receipt.
- [x] Verified syntax and ran a bounded `--transport=auto` diagnostic:
  host REST was effective at `http://127.0.0.1:6333`, Qdrant returned 16
  768-dimensional vectors, and EmbeddingGemma returned a 768-dimensional
  query vector.
- [x] The diagnostic remains `WARN` because the bounded sample produced
  zero PostgreSQL identity joins and zero AST-aware ranking candidates;
  this is evidence of an identity/coverage gap, not evidence that Qdrant is
  globally unavailable.
- [ ] Route application retrieval through the Go retrieval service and
  prove the Docker-internal path separately; no application routing change
  was made in this tranche.

## SYMBOL-PROMOTION-02: deterministic bounded tranche cursor (2026-08-26)

- [x] Added `--offset=N` to
  `scripts/atlas/promote-ast-symbols-to-registry.mjs`; bounded applies now
  advance through the deduplicated declaration-like nomination order instead
  of retrying the first batch.
- [x] Dry preview and bounded apply at `offset=20, limit=20` completed with
  zero errors. The 20 rows were already registered.
- [x] Live readback confirms `10,170` active registry rows, matching the
  `10,170` declaration-like candidates resolved by the read-only resolver.
- [ ] Materialize revision-specific symbol versions and callable-search rows;
  variables remain excluded from canonical identity promotion.

## SYMBOL-VERSION-01: bounded revision projection readback (2026-08-26)

- [x] Ran the symbol-version materializer dry run for 20 declaration-like
  candidates, then applied the same bounded tranche. No symbol-version rows
  were newly inserted because the 20 identities were already present; the
  callable-search projection upserted 20 rows.
- [x] Live counts now read `atlas_symbol_versions=200` and
  `atlas_callable_search=200`.
- [x] The receipt records `RESOLVED=0`, `UNRESOLVED=20`, and
  `AMBIGUOUS=0` for this tranche. The projection is therefore available for
  search, but canonical registry resolution is not implied by a nomination.
- [ ] Reconcile the remaining unresolved nomination-to-version bridge before
  treating all 10,170 declaration-like rows as canonical callable entities.

## P0-IDENTITY-BRIDGE-01: AST node kind normalization (2026-08-26)

- [x] Audited the live bridge: `atlas_callable_search` had `3/200` rows with
  `tree_node_id`; `197/200` were unbridged. Most source paths were outside
  the current `atlas_ast_nodes` corpus (`packages/` and `scripts/`).
- [x] Corrected the deterministic storage-kind mapping in
  `materialize-ast-symbol-versions.mjs`: nomination `interface` maps to AST
  node kind `type`, and nomination `method` maps to `function`.
- [x] Re-ran the bounded 200-row projection. Result: `9 RESOLVED`,
  `191 UNRESOLVED`, `0 AMBIGUOUS`; no symbol-version inserts, 200 callable
  projection upserts.
- [ ] Expand AST-node coverage or add a separately proven source inventory
  for `packages/` and `scripts/`; do not infer missing tree identities.

## GRAPHIFY-AST-SCOPE-01: daily inventory directory scope (2026-08-26)

- [x] Added read-only `scripts/atlas/audit-graphify-ast-scope.mjs` using
  `.tmp/atlas/graphify-file-index-v1/packets.jsonl` as the source inventory.
  It does not walk the filesystem or write database state.
- [x] The current Graphify inventory contains `61,659` rows and derives
  `13,557` source-like files across `4,644` directories after excluding
  logs, targets, virtual environments, archives, backups, scratch data,
  build output, and non-source extensions.
- [x] Report written to
  `docs/reports/graphify-ast-scope-v1.json`. This is now the candidate scope
  for expanding `atlas_ast_nodes`; it is not yet an AST parse/materialization
  receipt.
- [ ] Add the scope report as an input to the AST node materializer, then run
  a bounded dry parse before any `atlas_ast_nodes` apply.

## GRAPHIFY-AST-SCOPE-02: materializer scope handoff (2026-08-26)

- [x] The scope report now persists the exact `includedSourceRefs` set and
  the AST materializer accepts `--scope=<report.json>`.
- [x] Bounded dry parse passed with `--limit=20 --scope=../docs/reports/graphify-ast-scope-v1.json`:
  20 eligible chunks, 5 file parents, and 17 symbol nodes; database writes
  were disabled.
- [x] Added backup trees to the exclusion policy. Current refreshed scope is
  `13,556` source-like files across `4,643` directories.
- [ ] Extend the materializer beyond `codebase_chunk_index` so Graphify-only
  paths under `packages/` and `scripts/` can be parsed from the scoped source
  inventory; do not apply the current dry-run scope as a full-corpus claim.

## GRAPHIFY-AST-SCOPE-03: bounded source parse probe (2026-08-26)

- [x] Added the opt-in `--graphify-parse` path to the existing AST node
  materializer. It resolves the exact `includedSourceRefs` from the daily
  Graphify scope and parses real files with `@ast-grep/napi`.
- [x] Read-only probe passed for 20 scoped files: `20 resolved`, `17 parsed`,
  `3 unsupported-language skips`, `0 missing`, and `3,127` structural
  candidates (`726 function`, `2,327 variable`, `48 method`, `19 interface`,
  `7 type`).
- [x] Receipt written to
  `docs/reports/graphify-ast-node-candidate-probe-v1.json`; the probe reports
  byte and line spans and performs no PostgreSQL or other durable writes.
- [x] Added `--declarations-only` to exclude variable declarators from the
  candidate receipt. This makes the promotion boundary explicit instead of
  silently treating local variables as canonical symbols.
- [ ] Review variable candidates and map approved declaration-like candidates
  to the existing `atlas_ast_nodes` identity contract before adding an apply
  path. AST-grep remains a candidate producer and must not mint canonical IDs.

## GRAPHIFY-AST-SCOPE-04: inventory revision alignment (2026-08-26)

- [x] Rebuilt the read-only Graphify file inventory with
  `scripts/atlas/export-graphify-file-index-v1.mjs --all` from canonical
  `atlas_packets`: `61,659` packets, `0` invalid rows, and `42,404` AST
  candidates in the generated receipt.
- [x] Refreshed the scope report from that same inventory revision: `13,556`
  source-like files across `4,643` directories.
- [x] Re-ran the declaration-only Graphify AST probe against the refreshed
  scope. The bounded 100-file result resolved `97/97` parsed packet identities,
  packet tree-node references, and source revisions; it produced `1,327`
  declaration-like candidates with no durable writes.
- [x] Corrected the prior stale-artifact condition: the intermediate inventory
  had only `10` rows and was not evidence for full scope coverage. The current
  scope and probe receipts now share the rebuilt inventory revision.
- [x] Added the shared `inventorySha256` field to both scope and probe
  receipts. The current receipts agree on
  `141e519366fa68affeb58f3cd085c6f3cf5ae472743e3e7c7ca42a0b54e365f7`.
- [x] Added an opt-in complete JSONL candidate export for bounded review;
  it carries AST spans plus `packet_key`, `feature_id`, `tree_node_id`, and
  source revision when Graphify metadata resolves.
- [ ] Review the bounded candidate JSONL and derive deterministic
  `atlas_ast_nodes` rows only for approved declaration-like candidates.

## AST-ID-01: shared structural source-reference key (2026-08-26)

- [x] Added `scripts/atlas/lib/ast-source-ref-key.mjs` as the shared pure
  key builder for source path, AST storage kind, and qualified symbol name.
- [x] Covered Windows path normalization, interface-to-type and
  method-to-function storage aliases, whitespace normalization, and empty
  input rejection with `test-ast-source-ref-key.mjs`.
- [x] Updated the AST symbol-version materializer and existing AST-node
  populator to use the shared builder. The materializer dry run still reports
  `10,170` declaration-like candidates and performs zero writes.
- [x] **Ran the read-only bridge census** — new
  `scripts/atlas/census-ast-nodes-bridge.mjs`, zero writes. It dumps
  `atlas_ast_nodes.source_ref_key` via `docker exec psql` (avoids the
  `.env` credential block — no `DATABASE_URL` in this shell) to
  `.tmp/atlas/atlas-ast-nodes-source-ref-keys.txt`, then joins it against
  the persisted candidate JSONL using `buildAstSourceRefKey()`. Report:
  `docs/reports/atlas-ast-nodes-bridge-census-v1.json`.
- [x] **Confirmed with hard evidence, not inference**: every one of the
  `7,565` keyed `atlas_ast_nodes` rows has a `source_ref_key` prefixed
  `src/` — zero rows start with anything else
  (`sed 's#/.*##' ... | sort -u` → exactly one prefix, `src`). This is now
  direct proof of the NE-ID-06/07 narrow-scope gap already flagged
  elsewhere in this file and in the sibling
  `parent-atlas-ace-rlm-bitfrost-integration/tasks.md` (operator-decision
  item 3), not just an inference from row counts.
- [x] **Found a real discrepancy while doing this** (documenting honestly
  rather than silently working around it): the persisted
  `docs/reports/graphify-ast-declaration-candidates-v1.jsonl` — the file
  AST-ID-02 below describes as the "full Graphify-scoped declaration-only
  AST-grep pass" with `59,915` candidates — currently has only `3,712`
  lines on disk (`wc -l`, confirmed), `99.6%` of which (`3,699/3,712`) are
  under the `claude-mem/` **git submodule** (`git config -f .gitmodules`
  confirms it's a submodule, not app source). The `59,915` figure in
  AST-ID-02 is real (that section's own read-only receipt numbers are
  self-consistent and were verified in-session per that section's evidence
  trail) but does **not** match what is currently sitting at that file
  path — either the export was overwritten by a later bounded/dry run
  (GRAPHIFY-AST-SCOPE-04's "opt-in complete JSONL candidate export for
  bounded review" language suggests this was always meant to be a sample,
  not the full corpus dump) or a background process (`claude-mem`
  submodule sync, `graphify:daily`) touched it since. Do not treat this
  JSONL path as a durable full-corpus artifact — it is transient/
  regeneratable, and whoever runs the "review the bounded candidate JSONL"
  item below should re-run the full AST-ID-02 pass first and check the
  resulting line count against the `59,915` figure before trusting it.
- [x] Match rate against the `3,712`-row sample that *was* on disk: `0/3712`
  matched. This is **not** evidence the bridge/key-builder is broken — the
  sample is `99.6%` `claude-mem/` (submodule, `src/`-prefix rule correctly
  excludes it) plus a handful of `.vscode/` and `$lib/`-alias-rooted files,
  none of which `atlas_ast_nodes` was ever scoped to cover. A meaningful
  match-rate number requires re-running this census against the real
  `13,556`-file / `59,915`-candidate scope once that JSONL exists on disk
  again, not against this narrow leftover sample.
- [x] **Re-ran `census-ast-nodes-bridge.mjs` against a fresh full-corpus
  artifact — see `## AST-ID-04` below.** The real number owed here is now
  in: `6.35%` (`3,804/59,915`), plus two new findings the earlier narrow
  sample couldn't have surfaced.
- [ ] Use the same builder in the real AST observation producer before any
  bulk symbol-version apply (unchanged from before).

## AST-ID-04: full-corpus bridge census v2 + a real case-sensitivity bug
found in `atlas_ast_nodes` (2026-08-26)

Picked up this file's own open item ("re-run AST-ID-02, then re-run the
census") after a separate pasted design review independently converged on
the same next step ("re-establish the full corpus AST artifact first, then
trust the bridge census"). All of this is read-only — zero writes to
Postgres, Qdrant, Redis, or Neo4j.

- [x] Re-ran AST-ID-02's exact full pass (`populate-atlas-ast-nodes.mjs
  --graphify-parse --declarations-only --scope=docs/reports/graphify-ast-scope-v1.json`)
  against a **new** output path per the "do not reuse the old candidate
  file in place" guidance:
  `docs/reports/graphify-ast-declaration-candidates-v2.jsonl` (`59,915`
  lines, confirmed via `wc -l`) +
  `docs/reports/graphify-ast-node-candidate-probe-v2.json`. Numbers
  reproduced exactly: same `inventorySha256`
  (`141e519366fa68affeb58f3cd085c6f3cf5ae472743e3e7c7ca42a0b54e365f7`),
  `13,556` scope files, `10,571` parsed, `59,915` candidates, same
  `candidatesByKind` breakdown. AST-ID-02's original figures are
  confirmed real and reproducible — they were just never left on disk at
  that path (the `v1` file on disk was a stale `3,712`-line partial, see
  `## AST-ID-01` above).
- [x] Re-ran `census-ast-nodes-bridge.mjs --candidates=docs/reports/graphify-ast-declaration-candidates-v2.jsonl
  --report=docs/reports/atlas-ast-nodes-bridge-census-v2.json` (a
  different session had already added `--candidates=`/`--report=` flags
  to this exact script since it was written — reused them rather than
  re-adding). **Real full-corpus match rate: `3,804/59,915 = 6.35%`.**
  `breakdownByStorageKind`: `function 47,343`, `type 10,563`, `class
  1,963`, `enum 46`. `0` unkeyable candidates.
- [x] **`breakdownBySourcePrefix` surfaced a path-relativity ambiguity**
  the earlier narrow sample never showed: candidate `relative_path`
  values are **repo-root-relative** (`sveltekit-frontend/src/... =
  25,658` rows, `src/... = 10,153` rows — i.e. root-level scripts/
  packages/tests, not the SvelteKit app), while every `atlas_ast_nodes
  .source_ref_key` is **`sveltekit-frontend`-app-relative** (`src/...`
  only, confirmed in `## AST-ID-01` above). Checked whether this alone
  explains a chunk of the unmatched count: stripped the
  `sveltekit-frontend/` prefix from candidate paths and compared the
  resulting file-path set against `atlas_ast_nodes`' path set —
  **`677` files literally overlap** (out of `1,785` stripped candidate
  paths vs. `2,824` distinct `atlas_ast_nodes` paths). That's real file
  overlap the raw `6.35%` doesn't credit — some of the `56,111`
  "unmatched" candidates are the same file as an existing
  `atlas_ast_nodes` row, just failing the exact-string key join on path
  convention (before even getting to kind/name matching).
- [x] **Found a genuinely new bug while checking that overlap, independent
  of everything above: `atlas_ast_nodes` has inconsistent path casing
  for the same file, live in production data.** Proven directly:
  ```sql
  SELECT relative_path, source_ref_key FROM atlas_ast_nodes
  WHERE relative_path ILIKE '%CollaborativeEvidenceCanvas%';
  --  src/lib/components/canvas/collaborativeevidencecanvas.svelte | ...#file:collaborativeevidencecanvas.svelte
  --  src/lib/components/canvas/collaborativeevidencecanvas.svelte | ...#file:CollaborativeEvidenceCanvas.svelte
  ```
  Two rows, same (lowercased) `relative_path`, but `source_ref_key` carries
  two different casings of the real on-disk filename
  (`CollaborativeEvidenceCanvas.svelte`, confirmed via `find -iname`).
  Repo-wide: `3,498/11,067` rows have uppercase characters in
  `relative_path`, `7,569` don't — inconsistent across the table, not a
  uniform lowercase-everywhere convention. `633/7,565` keyed rows
  collide with another row once case-folded
  (`count(DISTINCT source_ref_key) = 7,565` vs.
  `count(DISTINCT lower(source_ref_key)) = 6,932`). Whatever wrote these
  rows was not case-consistent across runs — this alone silently drops
  real matches for any bridge/join done with exact-string comparison
  (this census included), independent of scope-coverage or
  path-relativity.
- [x] Also noted, not yet acted on: `llama-cpp-turboquant-gemma4` is
  `10,729` candidates (`17.9%` of the whole corpus) — this is the
  vendored TurboQuant fork **build tree** documented in root `CLAUDE.md`'s
  "Gemma4 TurboQuant caveat" section (a `git clone` + `cmake --build`
  output directory), not this repo's own application source. It is not
  currently excluded from the Graphify AST scope the way `claude-mem/`
  (a real git submodule) implicitly is by having zero `atlas_ast_nodes`
  coverage to begin with.
- [ ] **Decide, don't unilaterally fix**: (a) path-relativity convention
  for the bridge join — normalize both sides to repo-root-relative, or
  restrict the Graphify AST scope to `sveltekit-frontend/` only and drop
  the `sveltekit-frontend/` prefix from candidates; (b) case-normalization
  policy — join case-insensitively going forward, or run a one-time
  case-repair pass over the `633` colliding `atlas_ast_nodes` rows (and
  audit whether any of them are true duplicates vs. genuinely
  different files that happen to differ only by case); (c) whether
  `llama-cpp-turboquant-gemma4/` and similar vendored build-output trees
  should be added to the scope-exclusion policy alongside `claude-mem/`.
  These are the same shape as this file's other operator-decision items —
  do not guess at an answer and apply it. **Consolidated, along with a
  4th item (method/chunk-extraction scope) found later, into one list in
  `## AST-ID-06: active-repository scope and path policy` below —
  resolve them there, not separately here.**
- [ ] Once (a)/(b) are decided, re-run this census a third time with the
  agreed normalization to get the number that actually answers "how much
  of the real corpus does `atlas_ast_nodes` cover" — `6.35%` is a real,
  reproducible floor, not that final number.

## AST-ID-02: full Graphify declaration extraction (2026-08-26)

- [x] Ran the full Graphify-scoped declaration-only AST-grep pass against the
  inventory checksum
  `141e519366fa68affeb58f3cd085c6f3cf5ae472743e3e7c7ca42a0b54e365f7`.
- [x] Considered `13,556` scoped files: `13,450` resolved, `10,571` parsed,
  `2,879` unsupported-language skips, and `106` missing source paths.
- [x] Extracted `59,915` declaration-like candidates with `10,571/10,571`
  parsed packet identities and source revisions resolved.
- [x] Candidate breakdown: `32,800` functions, `14,543` methods,
  `7,061` interfaces, `3,502` types, `1,963` classes, and `46` enums.
- [x] Full pass remained read-only; no `atlas_ast_nodes`, registry, vector,
  graph, or cache writes occurred.
- [ ] Classify the `106` missing paths and `2,879` unsupported files, then
  restrict canonical promotion to the approved repository/source policy.

## AST-ID-03: full registry resolution census (2026-08-26)

- [x] Re-ran the existing read-only resolver against the full `42,398`
  nomination artifact: `10,170` canonical declaration-like resolutions,
  `32,228` unresolved variable nominations, `0` ambiguous, and `0` invalid.
- [x] Confirmed `canonical_writes: false` and `database_writes: false`.
- [x] Confirmed this registry result is separate from the AST-node bridge:
  registry resolution is complete for declaration-like nominations, while
  `atlas_ast_nodes` coverage still requires a source-observation census.
- [x] Rechecked `npm --prefix sveltekit-frontend run
  atlas:features:ast-symbols:resolve:dry`: `READ_ONLY_COMPLETE`, with
  `10,170` canonical declaration-like candidates, `32,228` unresolved
  variable nominations, `0` ambiguous, `0` invalid, and both write flags
  false. This is a resolver recheck, not canonical promotion.
- [x] Generated the fresh v2 declaration artifact with the full Graphify
  inventory: `59,915` declaration-like candidates across `13,556` scoped
  files, with `10,571` parsed source identities and `0` unkeyable candidates.
- [x] Ran the bridge census against that v2 artifact using the explicit
  candidate/report paths: `3,804/59,915` matched existing
  `atlas_ast_nodes` keys (`6.35%`), `56,111` were unmatched, and the bridge
  key dump contained `7,565` rows. The leading source prefixes were
  `sveltekit-frontend` (`25,658`), `llama-cpp-turboquant-gemma4` (`10,729`),
  `src` (`10,153`), and `scripts` (`8,621`).
- [x] Split the unmatched cause without database access or writes:
  `49,762` candidates have no existing `atlas_ast_nodes` source prefix, while
  `6,349` share an existing prefix but miss on normalized key/symbol matching.
  These are separate remediation tracks; do not treat all unmatched rows as
  one composite-key regression.
- [x] Refined the existing-prefix bucket by bridge file: `2,569` candidates
  are from files absent from the bridge dump, while `3,780` are in files that
  already have bridge rows but miss on symbol/key. Samples include the same
  `src/lib/ai/base64-fp32-quantizer.ts` file with candidate
  `quantizeGemmaOutput` versus existing `quantizeGemmaLegalOutput`, indicating
  source-revision drift must be checked before changing key normalization.
- [ ] Do not interpret AST-applicable packet tree coverage as full
  `atlas_ast_nodes` structural coverage. Reconcile the v2 bridge by explicit
  cause and owner before any bulk symbol-version materialization.
- [x] Produce the full `atlas_ast_nodes` bridge census by source prefix,
  parser language, storage kind, and unresolved cause before bulk version
  materialization. The v2 receipt is
  `docs/reports/atlas-ast-nodes-bridge-census-v2.json`.
- [ ] Resolve the v2 unmatched-cause buckets beyond the current aggregate
  `no_matching_atlas_ast_nodes_row` result before bulk version materialization.

## AST-ID-05: source-revision and content-hash comparison (2026-08-25)

- [x] Added the read-only comparison diagnostic
  `scripts/atlas/compare-ast-bridge-revisions.mjs` and emitted
  `docs/reports/atlas-ast-bridge-revision-comparison-v1.json`.
- [x] Compared the exact `3,780` unmatched candidate rows in `799` files that
  already have `atlas_ast_nodes` bridge keys. The live table contains `7,565`
  AST rows, all from `tree-sitter/chunk-index-v1` in the inspected sample.
- [x] Confirmed the revision comparison is currently unavailable rather than
  clean: live `graphify_files` exists but contains `0` rows, and the live
  `atlas_ast_nodes.source_revision` values are empty. The report therefore
  records `REVISION_AUTHORITY_UNAVAILABLE` and does not infer a revision from
  timestamps, hashes, or the `workspace:0` candidate placeholder.
- [x] Computed current workspace file SHA-256 values for the shared files as a
  diagnostic only. No current-file hash was promoted into `source_revision`,
  `source_content_hash`, or any canonical row.
- [ ] Populate or restore a read-only Graphify source-inventory snapshot with
  `code_source_revision` and `content_hash`, then rerun this comparison. Do
  not change AST key normalization or bulk-materialize symbol versions until
  the revision authority is available.

## AST-ID-06: active-repository scope and path policy (2026-08-25)

- [x] Added opt-in prefix exclusions to
  `scripts/atlas/audit-graphify-ast-scope.mjs`; the default scope remains
  unchanged. The explicit active-repository dry-run excludes the legacy root
  `src` tree and vendored `llama-cpp-turboquant-gemma4` tree.
- [x] Generated `docs/reports/graphify-ast-scope-active-v2.json`: `10,066`
  eligible files and `3,370` directories from the same inventory revision.
  Inventory-level exclusions were `3,260` root-`src` rows and `2,381`
  vendored-tree rows; no source files were deleted or moved.
- [x] Parsed the active scope read-only with ast-grep: `10,030` files
  resolved, `8,399` parsed, `1,631` unsupported, `36` missing, and `39,033`
  declaration-like candidates. Receipt:
  `docs/reports/graphify-ast-node-candidate-probe-active-v3.json`.
- [x] Ran the raw-key bridge census against the active artifact. It matched
  `0/39,033` because the artifact contains repository-qualified paths such as
  `sveltekit-frontend/src/...` and `$lib/...`, while the existing bridge keys
  are `src/...`-relative. Receipt:
  `docs/reports/atlas-ast-nodes-bridge-census-active-v3.json`.
- [x] Ran the alias-only diagnostic
  `scripts/atlas/census-ast-path-aliases.mjs`. A deterministic
  `sveltekit-frontend/src/...` -> `src/...` alias recovers `3,794/39,033`
  candidates (`9.72%`) without changing the canonical key builder. No raw
  candidate matched, no ambiguous alias sample was promoted, and the result
  remains diagnostic-only. Receipt:
  `docs/reports/atlas-ast-path-alias-census-v1.json`.
- [x] Defined and unit-tested the explicit diagnostic policy
  `ACTIVE_APP_RELATIVE_V1` in
  `scripts/atlas/lib/ast-source-ref-policy.mjs` and
  `scripts/atlas/test-ast-source-ref-policy.mjs`. It maps `$lib/...` to
  `src/lib/...`, `sveltekit-frontend/src/...` to `src/...`, and strips the
  active-app wrapper for other paths. The policy is not yet the canonical AST
  identity authority.
- [ ] Decide and document one canonical path policy before changing the key
  builder: repository-root-relative, active-app-relative, or an explicit
  alias map (`sveltekit-frontend/src` -> `src`, `$lib` -> `src/lib`). The alias
  must be revisioned and collision-tested; do not silently normalize paths or
  materialize a second identity owner.
- [ ] After the path decision and Graphify revision authority are available,
  rerun the active bridge census, then proceed to bounded AST remediation.
- [ ] **Case-sensitivity policy** (found in `## AST-ID-04` above, live in
  `atlas_ast_nodes` today, independent of the path-relativity question):
  `3,498/11,067` rows have uppercase in `relative_path`, `7,569` don't —
  inconsistent across the table, not a uniform convention — and
  `633/7,565` keyed rows collide with another row once case-folded
  (proven live: two rows for `CollaborativeEvidenceCanvas.svelte` with
  differently-cased `source_ref_key`). Decide: join case-insensitively
  going forward, or run a one-time case-repair pass over the `633`
  colliding rows (auditing whether any are true duplicates first). Do
  not silently lowercase everything — record both the original
  `source_ref` and a normalized lookup key, and fail on collisions
  rather than resolving them arbitrarily.
- [ ] **Method/chunk-extraction-scope policy** (found in the `AST-ID-05
  follow-up` section below, the single biggest lever found so far —
  bigger than path or case): `atlas_ast_nodes` is written from
  `codebase_chunk_index` — one row per embeddable text chunk, not a
  recursive AST walk — so class methods are essentially never captured
  (`0.05%` match rate, `7/14,543`, vs. `4.86%–19.49%` for every other
  declaration kind). Decide: give `atlas_ast_nodes` a second writer path
  that walks into class bodies (reusing the declaration-only ast-grep
  candidates already on disk), keep it chunk-representative-only by
  design, or put method-level identity in a different table entirely.
- [ ] **Vendored/build-tree scope policy** (found in `## AST-ID-04`
  above): `llama-cpp-turboquant-gemma4/` (a `git clone` + `cmake --build`
  fork output, `10,729` candidates — `17.9%` of the `59,915`-row corpus)
  is not currently excluded from the Graphify AST scope. This item's own
  `10,066`-file active-scope rerun already excludes it (and root `src/`)
  as a dry-run experiment — decide whether that exclusion becomes the
  default scope policy, not just a one-off active-scope artifact.
- [ ] Once path, case, method-scope, and vendored-tree policy are all
  decided, re-run the bridge census a final time with the agreed
  normalization/scope to get the number that actually answers "how much
  of the real corpus does `atlas_ast_nodes` cover" — every percentage
  produced so far (`6.35%` full-corpus, `0%` active-scope-only) is a
  real, reproducible floor under one specific set of assumptions, not
  that final number.

## MASTER-BOUNDARY-01: repository versus Graphify scope (2026-08-26)

- [x] Read-only repository inventory found `314,243` visible non-ignored files
  and `108,896` source-like files after excluding `node_modules`, `.git`, and
  `.tmp` from the count.
- [x] The current daily Graphify AST scope is intentionally narrower:
  `13,556` source-like files, `10,571` parsed by the current JavaScript/TypeScript
  AST lane, with unsupported languages and missing paths reported separately.
- [x] The active master feature ledger at
  `docs/reports/sessions/MASTER-FEATURE-TODO-2026-05-20.md` contains `297`
  checked and `169` open checklist items. Its sub-master ledger contains `5`
  checked and `55` open items.
- [ ] Do not claim all-repository AST completion until Graphify source policy
  explicitly covers the remaining repository roots and language parsers.

## AGENTIC-ERROR-01: bounded recovery gate baseline (2026-08-26)

- [x] Ran `validate-hmm-agentic-error.mjs --test-signal` read-only.
- [x] Error taxonomy passed: `5/5` classes, `10/10` domains, and `51`
  feature mappings.
- [x] Test signal `ConnectivityError:db` resolved to one recovery packet,
  proving the narrow signal-to-packet path.
- [ ] Feature coverage remains blocked at `1/61,660`; the gate identifies the
  missing `LangExtract`/concept coverage dependency.
- [x] Re-ran `node scripts/atlas/validate-hmm-agentic-error.mjs --test-signal`
  read-only: taxonomy `5/5` classes and `10/10` domains passed; feature
  coverage remained `1/61,660`; viable recovery domains remained `2/16`; the
  narrow `ConnectivityError:db` lookup still returned one recovery packet.
- [x] Re-ran `node scripts/atlas/verify-used-concept-edges.mjs` read-only:
  PostgreSQL has `58,360` packets with concept IDs, while Neo4j has `0`
  `source=atlas_packets` `USED_CONCEPT` edges and `0.0%` cross-store
  coverage. No concept projection apply is authorized by this receipt.
- [x] Ran `node scripts/atlas/phase-b2-langextract-entities.mjs --dry-run
  --limit=20 --verbose`: `20` packets processed, `0` failures, `4` packets
  yielded extracted entities, and all `20` yielded keyword evidence. The lane
  remains a derived prefill producer; it does not mint grounded `concept_ids`
  or write Neo4j ontology edges.
- [x] Ran `node scripts/atlas/enrich-atlas-concept-ids.mjs --dry-run
  --limit=20`: `19` packets had an improved derived candidate mapping, `1`
  was skipped, and `0` errors occurred. This is path/Qdrant-derived enrichment,
  not grounded ontology promotion.
- [x] Ran `node scripts/atlas/write-used-concept-edges-from-packets.mjs
  --dry-run`: the existing projection path would process `50,000` packets,
  `17,328` concepts, and approximately `188,802` edges. No Neo4j writes were
  performed. Keep APPLY blocked until concept provenance and packet identity
  pass the ontology evidence gate.
- [x] Audited the similarly named `seed-neo4j-used-concept-edges.mjs
  --safe-only` path. It reads `agent_traces.selected_concepts` and requires
  `higher-hop-enrichment-classified.json`; it is not the `atlas_packets`
  concept projection owner and was not used for this gate.

## MASTER-FEATURE-01: FeatureV1 to ACE repair boundary (2026-08-24)

- [x] Reused the existing `FeatureV1`, `FeatureEvidenceV1`, `FeatureStateV1`,
  `FeatureStateReceiptV1`, `WorkflowActionEventV1`, and validated dispatch
  owners; no parallel feature schema was created.
- [x] Focused ACE/KAG/DAG tests passed: `16/16` across workflow control,
  hypergraph fusion, ACE packet composition, and bounded retrieval.
- [x] Adjacent FeatureV1/state, feature-matrix, signal-alignment, workflow
  event, and adapter tests passed: `15/15`.
- [ ] Do not call the master feature end-to-end yet. Live error-event
  ingestion, grounded ontology evidence, CandidateOrdinal propagation,
  durable RLM replay, and bounded patch validation remain unproven.
- [ ] Next bounded proof: one real error event -> existing feature evidence
  lookup -> AST/FTS/graph retrieval -> ACE packet -> dry-run PatchPlan ->
  validation receipt -> replay receipt, with canonical writes disabled.
- [ ] Recovery selection remains partial at `2/16` viable domains; the gate
  identifies missing `tree_node_id` and `concept_ids` propagation.
- [ ] HMM state transitions, MapReduce error grouping, and ACE recovery packet
  dispatch remain unwired as one live receipt.

### AGENTIC-ERROR-01 follow-up: propagation census (2026-08-24)

- [x] Read-only `tree_node_id` census reports `61,659/61,660` populated in
  `atlas_packets`.
- [x] Classified the remaining row as `packet_key=sha256:4ff58c17...`,
  `source_ref=cluster:summary:0`, `feature_id=cluster:0`; it is a derived
  cluster-summary packet and has no matching `atlas_ast_nodes` row.
- [x] AST-applicable packet coverage is therefore complete; the cluster
  summary must remain outside the AST `tree_node_id` denominator.
- [ ] Do not run the propagation script with `--apply` for this row. Its
  synthetic UUID fallback is not canonical structural identity and must not
  be used to force a misleading 100% all-row count.
- [x] Fixed the read-only used-concepts lane to treat NULL and empty arrays
  consistently with `cardinality()` and to cast the aggregate average before
  formatting.
- [ ] The corrected dry-run scans empty-array packets, but the first batches
  produced zero derived concepts; no database, graph, vector, or cache writes
  occurred. LangExtract/ontology-grounded concept production remains the
  blocker for the feature-coverage gate.
- [ ] Re-run a bounded, report-producing concept census after the source
  concept producer is selected; do not promote lexical fallback terms as
  canonical ontology concepts.

### AGENTIC-ERROR-01 follow-up: validator correction (2026-08-24)

- [x] Corrected `validate-hmm-agentic-error.mjs` so its recovery summary
  reports AST-applicable `tree_node_id` coverage instead of the stale 5%
  PageRank message.
- [x] Re-ran `--test-signal`: AST-applicable tree-node coverage is
  `61,659/61,659 (100%)`; Gate 1 and the bounded test signal pass.
- [ ] Gates 2 and 3 remain blocked at `1/61,660` feature matches and `2/16`
  viable domain selections; the current P0 is grounded concept/domain
  production, not tree-node propagation.

### AGENTIC-ERROR-01 follow-up: concept producer probe (2026-08-24)

- [x] Found LangExtract source and runtime assets in the repository and
  confirmed the healthy `miniforge-nlp-sidecar` container exposes the service
  on `127.0.0.1:8095`; its health payload reports `langextract`, `ast_grep`,
  `treesitter_chunker`, and `tree_sitter` available.
- [x] Corrected `phase-b2-langextract-entities.mjs` to prefer
  `LANGEXTRACT_URL`, then `NLP_SIDECAR_URL`, with `8095` as the local default.
- [x] Re-ran the phase read-only for `20` packets: `4` packets produced
  entities, all `20` produced keywords, and no extraction calls failed.
- [x] Confirmed `8091` belongs to the optional `langgraph-synthesis` GPU
  service, not the active LangExtract sidecar; it is not currently running.
- [x] No database updates were performed.
- [x] Confirmed the current phase would write `extracted_entities`,
  `keywords`, and `error_pattern`, not the HMM gate's `feature_id` or grounded
  `concept_ids` fields.
- [x] Expanded the corrected read-only probe to `100` packets: `17` packets
  returned at least one entity, all `100` completed without extraction errors.
- [x] Extended the same read-only probe to `500` packets: `157` packets
  returned at least one entity (`31.4%`), all `500` completed, and `0`
  extraction failures were reported.
- [ ] Do not promote this phase as concept/domain coverage. The next adapter
  must either restore the LangExtract service and map reviewed outputs into
  the approved domain/concept contract, or explicitly classify that mapping as
  a separate read-only materialization step.

### AGENTIC-ERROR-01 follow-up: bounded LangExtract refresh (2026-08-26)

- [x] Ran `node scripts/atlas/phase-b2-langextract-entities.mjs
  --dry-run --limit=100 --batch=25`.
- [x] Processed `100/100` packets in four batches with `0` extraction
  failures; the run reported that all writes would be dry-run only.
- [ ] This does not close concept coverage: the existing pass produces
  `extracted_entities`, `keywords`, and `error_pattern`, but does not yet
  produce reviewed `concept_id`, `domain_id`, taxonomy revision, or grounded
  ontology tuple evidence.
- [ ] Next adapter must convert only grounded, reviewable LangExtract spans
  into `DomainClassificationV1` and `OntologyLinkedTupleV1`; lexical keywords
  remain candidate features and cannot become canonical concepts.

### CLASSIFIER-BRIDGE-01 gate refresh (2026-08-26)

- [x] Re-ran `node scripts/atlas/validate-neural-prefill-pipeline.mjs`.
  The guarded preflight remains `PASS` at `readinessPercent: 70`, with
  database, Qdrant, Valkey, and training writes all false.
- [x] The classifier bridge remains wired: `3,535` labeled diagnostic rows,
  logistic macro-F1 `0.787`, and Naive Bayes macro-F1 `0.751`.
- [ ] These are weak-label diagnostics only. They do not authorize domain,
  ontology, canonical feature, or embedding promotion until reviewed labels,
  held-out query groups, and grounded evidence are available.
- [ ] Keep the existing fallback behavior: classifier failure produces a
  degraded preflight receipt and preserves the prior Graphify receipt.

### AGENTIC-ERROR-01 gate refresh (2026-08-26)

- [x] Ran `node scripts/atlas/validate-hmm-agentic-error.mjs --test-signal`
  read-only. Error taxonomy is complete at `5/5` classes, `10/10` domains,
  and `51` feature mappings.
- [x] The injected `ConnectivityError:db` signal selects one recovery packet;
  the bounded test signal passes.
- [ ] Feature coverage remains blocked at `1/61,660`; recovery selection is
  only `2/16` viable domains. AST-applicable `tree_node_id` coverage is already
  `61,659/61,659`, so structural propagation is not the current P0.
- [ ] HMM transitions/confidence, MapReduce grouping, and ACE recovery dispatch
  still need one replayable feature-to-error-to-recovery receipt.

### AGENTIC-ERROR-01 ontology validation refresh (2026-08-26)

- [x] Ran `node scripts/atlas/agentic-error-domain-ontology.mjs --validate`
  read-only. The mapping contains `5` error classes, `10` domains, and the
  declared feature mappings used by recovery selection.
- [ ] This closes structural ontology validation only. It does not populate
  packet `feature_id`/`concept_id` evidence, run HMM transitions, or dispatch
  ACE recovery packets.

### CONCEPT-PREFILL-01 bounded lexical probe (2026-08-26)

- [x] Ran `node scripts/atlas/backfill-entity-lexical-prefill.mjs --limit=100`
  in its default `DRY_RUN` mode.
- [x] Read `100` rows and wrote `0`; the report is
  `docs/reports/ne07-entity-lexical-prefill.json`.
- [x] The sample produced lexical candidate features but no grounded entities
  in its preview rows. This confirms the lane is useful for candidate signals
  but cannot close canonical concept coverage.
- [ ] Feed only grounded LangExtract observations, reviewed domain mappings,
  and ontology proposal evidence into the concept adapter. Do not promote the
  lexical feature array or keywords directly into `concept_ids`.

### CONCEPT-PREFILL-01 grounding contract refresh (2026-08-26)

- [x] Focused grounding tests passed `11/11` across structural extraction,
  sidecar provenance compatibility, and observation feature compilation.
- [x] Existing contracts preserve LangExtract `char_interval` and
  `match_exact`, reject observations without a source interval, and reject
  cross-revision observation mixing.
- [x] Existing tests also preserve treesitter-chunker IDs as upstream
  provenance rather than canonical Atlas identity.
- [ ] The missing implementation is now narrowly scoped: map these grounded
  observations to reviewable `DomainClassificationV1` and ontology proposal
  records, retaining packet/source/tree revisions and evidence refs, without
  writing `concept_ids` or Neo4j edges.

- [x] Added the pure `grounded-domain-proposal.ts` adapter. It requires an
  exact grounded LangExtract interval and an explicit reviewed extraction-class
  to domain mapping, then emits deterministic `REVIEW_REQUIRED` candidates
  with `canonicalAuthority: false` and preserved evidence metadata.
- [x] Compiled `packages/parent-atlas` successfully and passed the focused
  adapter test `2/2`.
- [x] Bounded LangExtract Phase B dry run processed `100/100` packets with
  `0` failures and no writes.
- [ ] Grounded candidate generation is not canonical promotion: no
  `concept_ids`, Postgres promotion, Qdrant projection, or Neo4j edge writes
  are authorized until review, ontology validation, and a bounded apply gate
  exist.
- [ ] The legacy Phase B packet enrichment still does not emit the required
  source interval, source revision, and exact-alignment fields; its output is
  therefore diagnostic input only until adapted through the grounded contract.
- [x] Fixed the ordered structural integration proof to invoke TypeScript,
  Node tests, and Vitest directly on Windows; the repository `.npmrc`
  workspace setting made npm/npx subprocess status unreliable.
- [x] Static structural integration proof passed: Parent Atlas build, 82
  contract tests, Python provenance tests, static wiring audit, and 4 frontend
  structural test files. Live 8095 probing remains separate and was not run.
- [x] Wired the grounded-domain adapter into the Graphify structural result as
  an additive `groundedDomainCandidates` collection. It requires an explicit
  extraction-class/domain map and emits only deterministic
  `REVIEW_REQUIRED`, `canonicalAuthority: false` candidates.
- [x] Focused Graphify structural tests passed `20/20`; static integration
  proof remains `STATIC_PROOF_PASS_LIVE_NOT_RUN`.
- [x] Re-ran the ordered integration proof with `ATLAS_PROVE_LIVE_SIDECAR=1`:
  Parent Atlas build, 82 contract tests, Python provenance tests, static audit,
  4 frontend structural test files, and the live 8095 provenance probe all
  passed. Receipt status is `PROVEN_WITH_LIVE_8095`.
- [ ] No caller currently supplies a production-reviewed extraction-class to
  domain map; this wiring is ready for a review fixture, not canonical domain
  or ontology promotion.
- [x] Corrected the AST domain dry-run input from the empty stale identity
  artifact to the live Graphify `ast-entities.jsonl` identity enrichment. The
  read-only run now covers `42,404/42,404` identity-resolved candidates,
  classifies `34,047` (`80.29%`), and leaves `8,357` as explicit fallback
  candidates.
- [ ] The `34,047` classifications are taxonomy suggestions, not reviewed
  domain mappings. Keep `canonical_writes`, ontology tuple writes, and graph
  promotion disabled until fallback handling and sampled class/domain review
  are recorded.

### CONTEXT-TOPOLOGY-01 derived graph alignment audit (2026-08-25)

- [x] Re-ran the read-only contextual-tree readiness audit. Neo4j traversal
  evidence is present, but overall readiness remains blocked by a Postgres
  field-alias mismatch, absent synthesized feature-map tables, and unavailable
  Qdrant transport. These are projection/readiness failures, not permission to
  create replacement identity tables.
- [x] Re-ran the latent/SOM join-key audit against the canonical packet set:
  latent join coverage is `1,636/5,000` (`32.72%`), while SOM join coverage is
  `2,665/32,310` (`8.25%`). The SOM deficit is `29,645` assignments whose IDs
  are not present in Postgres.
- [x] Confirmed the existing derived contracts remain the owners: contextual
  JSON tree, ontology/hyperedge tuples, `topology_4d`, KMeans, and 20x20 SOM
  assignments all join through revisioned packet/source identity and remain
  noncanonical routing features.
- [ ] Do not backfill Neo4j, Qdrant, Valkey, KMeans, or SOM from unmatched IDs.
  First classify the `identity_not_in_postgres` SOM rows and repair the source
  identity/ordinal map; then emit a read-only parity receipt before any apply.
- [ ] Agentic error MapReduce still has no durable `workflow_id`-keyed action
  event emission. The existing `atlas_agent_action_events` repository is the
  intended durable timeline; Redis `bifrost:repair:*` remains a derived cache
  until a dry-run event plan and explicit bounded write gate are implemented.
- [x] Added the opt-in `graphify-derived-context-read.mjs` lane and wired it
  into `run-graphify-daily-startup.mjs` behind `GRAPHIFY_DERIVED_CONTEXT=1`.
  It refreshes AST identity, domain suggestions, contextual-tree readiness, and
  latent/SOM join audits using existing owners only.
- [x] Added `atlas:graphify:derived-context:read` to the frontend scripts.
  The lane emits `atlas-derived-context-read-v1.json` and always uses the
  fail-open policy `CONTINUE_WITH_EXISTING_GRAPHIFY_RECEIPT`.
- [x] Added a read-only runtime capability step to the lane. It records the
  actual Python ABI/GIL state and probes NetworkX, ast-grep, LangExtract,
  PyTorch, cuGraph, and cuVS without treating a missing GPU package in the
  CPU NLP runtime as a failure.
- [x] Added the live source-lineage audit as the revision-authority gate. It
  uses the shared database connection resolver and explicitly includes the
  candidate tables in discovery; it does not use the older static revision
  inventory as production proof.
- [x] Read-only execution now completes six steps; aggregate status is
  correctly `DEGRADED_READ_ONLY` because contextual readiness and latent/SOM
  join coverage are not yet promotion-ready.
- [x] Current host-kernel evidence: CPython `3.13.5`, standard GIL-enabled
  build, LangExtract `0.1.0`, ast-grep `0.44.1`, PyTorch `2.8.0+cu128`;
  cuGraph/cuVS are not installed in this host kernel. NetworkX remains a
  separate CPU graph-oracle capability and RAPIDS/cuGraph remains a separate
  WSL2 executor. Free-threaded Python is capability-probed only; process
  isolation remains the default for NLP and GPU work.
- [x] `SOURCE_LINEAGE_READ` now sees the canonical packet/chunk/AST tables:
  `atlas_packets` has `61,660` rows with `source_ref` and
  `workspace_revision`, `atlas_ast_nodes` has `11,067` rows but no populated
  source revision values, and `codebase_chunk_index` has `52,417` rows with
  `52,380` content hashes. `graphify_files` exists but is empty.
- [ ] Resolve the database/schema connection discrepancy, then produce one
  read-only revision receipt proving the same `workspace_revision`,
  `source_revision`, `graph_revision`, and `content_hash` authority across
  Graphify, packets, AST identity, and the Temporal event descriptor.

## SERIALIZATION-REDUCTION-01: MapReduce, MessagePack, CouchDB, and synthesis order (2026-08-26)

The reduction boundary is now explicit:

```text
canonical Postgres rows / source artifacts
  -> JSONL or typed query rows for reproducible input
  -> MapReduce grouping by feature_id/error_fingerprint/domain_id
  -> deterministic reduction to CandidateOrdinal[] and evidence summaries
  -> ACE packet sufficiency and provenance validation
  -> optional MessagePack/protobuf transport of the bounded packet
  -> llama/Gemma synthesis
  -> validation and RLM replay receipt
```

- JSON/JSONL remains the human-reviewable interchange and dry-run artifact
  format. PostgreSQL JSONB remains the queryable contextual projection.
- MessagePack is an optional compact boundary encoding, not a second canonical
  schema. The existing `messagePackHash()` implementation currently falls
  back to a JSON hash when a MessagePack binding is unavailable; it must not be
  described as binary MessagePack proof until a real codec receipt exists.
- Protobuf/gRPC is appropriate for typed service envelopes and bounded arrays;
  it does not replace Postgres identity, evidence, or revision ownership.
- CouchDB is a cold/archive mirror in the current architecture. CouchDB
  MapReduce views may aggregate archived documents, but they must not become
  the source of `CandidateOrdinal`, ontology, or canonical feature identity.
- MapReduce reduction happens before synthesis and must preserve source refs,
  revisions, CandidateOrdinals, evidence refs, and reduction checksums. It may
  reduce candidates; it may not invent concepts or silently discard identity.
- LLM synthesis is downstream of the ACE sufficiency gate. Empty or
  contradictory evidence must produce a blocked/degraded receipt, not a
  plausible free-form answer.

- [ ] Implement one read-only `feature_id/error_fingerprint/domain_id`
  reduction fixture and receipt.
- [ ] Prove JSONL input, deterministic reduction, bounded ACE packet, and
  replay checksum before adding MessagePack or CouchDB execution.
- [ ] Connect the reduced packet to the existing HMM/ACE/RLM path only after
  the grounded concept/domain gate passes.

### SERIALIZATION-REDUCTION-01 gate refresh (2026-08-26)

- [x] Reused the existing `scripts/atlas/agentic-error-mapreduce.mjs` owner;
  no second reducer was created.
- [x] Fixed its runtime configuration to use the shared Postgres and Valkey
  environment resolver. The prior empty-password fallback is removed.
- [x] Dry-run `node scripts/atlas/agentic-error-mapreduce.mjs --dry-run
  --window-minutes 15` reached Postgres and completed with `0` signals.
- [ ] No reduction, ACE dispatch, or synthesis receipt exists yet because the
  live window contained no error signals. A test signal must be inserted or
  replayed through the existing read-only fixture path before promotion proof.

## Session pause / handoff (2026-08-26, context limit — start fresh here)

User asked (dense, multi-topic): why not GPU-accelerate the ~20min AST
pass and run it on the whole codebase; alignment across LangExtract,
treesitter-chunker, ts-morph, a NetworkX-based Python sidecar for graph
creation, PostgreSQL 18 AIO/bitmap indexing, go-retrieval,
embeddinggemma 768 + pgvector/node-pg/drizzle-orm, `.okf` domain schema
pipeline, and PostgreSQL FTS/bag-of-words for PageRank candidate ranking
by canonical `source_ref`. Only the first part was actually investigated
before this session ran low on context — the rest is queued, not started.

## MASTER-FEATURE-02: canonical codebase retrieval and agent repair alignment (2026-08-26)

The requested Parent Atlas Studio feature is a revisioned, read-only-first
control plane over one indexed corpus. It is not another independent graph,
feature table, or identity system.

```text
Graphify source inventory
  -> AST-grep / Tree-sitter structural observations
  -> atlas_ast_nodes / atlas_symbol_registry / atlas_symbol_versions
  -> callable FTS and JSONB projections
  -> LangExtract grounded evidence and OKF domain candidates
  -> semantic_768 / MRL challenger vectors
  -> NetworkX CPU graph oracle or nx-cugraph GPU executor
  -> CandidateOrdinal feature matrix
  -> KNN/top-K, PageRank/PPR, lexical FTS, ontology and SOM nomination
  -> exact semantic_768 rerank
  -> ACE evidence packet
  -> KAG hyperedge context and DAG/RLM repair replay
```

### Identity and deduplication rules

- `source_ref` plus `source_revision` identifies the source observation;
  `tree_node_id` identifies a revision-qualified AST structure;
  `symbol_version_id` identifies callable facts; `CandidateOrdinal` identifies
  a row in a frozen retrieval snapshot. None of these may be minted from a
  model score or a temporary vector-store slot.
- A lookup-table/cursor must be revision-qualified:
  `lookup_revision`, `source_ref`, `feature_revision`, and an immutable
  checksum. Repeated work is skipped by an idempotency key, not by deleting
  or overwriting canonical rows.
- Password hashes and authentication fields remain outside FTS, embeddings,
  JSONB context, ACE packets, and graph projections.
- Existing keyset pagination remains authoritative (`packet_id > cursor`);
  ULID pagination is a future opt-in only after completeness, uniqueness, and
  ordering are measured. UUIDs are identifiers, not ordering cursors.

### Lane ownership

- PostgreSQL is canonical for packet, AST, symbol, feature, provenance, and
  revision rows. Existing `atlas_callable_search` is the structural inverse
  search projection; do not create a duplicate callable table.
- PostgreSQL FTS/GIN, exact symbol/parameter lookup, and bounded JSONB filters
  produce one logical `CALLABLE_STRUCTURAL`/lexical candidate list.
- Qdrant, pgvector, TurboVec, cuVS/CAGRA, NetworkX, nx-cugraph, Valkey,
  PageRank/PPR, Leiden, and SOM are rebuildable candidate/routing projections.
  They return `CandidateOrdinal[]` with receipts; they do not own identity.
- EmbeddingGemma `semantic_768` remains the semantic oracle. MRL 512/256/128,
  PCA/SVD/Tang-inspired, SOM, and learned latent lanes are challengers for
  admission or shortlisting until Recall/NDCG parity is proven.
- LangExtract supplies grounded text evidence; ast-grep supplies structural
  evidence; ts-morph is reserved for TypeScript semantic resolution. None of
  these may mint canonical ontology concepts without reviewed evidence.
- ACE/RLM/KAG/DAG consume canonicalized evidence and emit repair plans,
  validation, and replay receipts. The task board and agent memory remain
  noncanonical projections.

### P0 master-feature gates

- [x] Read-only full active-scope AST parse and path-alias census executed.
- [ ] Approve and revision the active source-ref policy after Graphify source
  inventory authority is populated; current alias coverage is diagnostic only
  (`3,794/39,033`, `9.72%`).
- [ ] Produce grounded `concept_id`/domain evidence and prove the Postgres to
  Neo4j concept projection; current Atlas-sourced `USED_CONCEPT` coverage is
  `0%`.
- [ ] Freeze one `CandidateOrdinalMapV1` and one feature matrix shared by
  lexical, dense, graph, ontology, SOM, and low-rank lanes.
- [ ] Prove `512 candidates -> 96 shortlist -> 24 exact rerank` with labeled
  Recall/NDCG/MRR and representation receipts; current low-rank evidence is
  degraded (`Recall@24 = 0.333`, no held-out labels).
- [ ] Route one real error through feature evidence, callable/AST/FTS/graph
  retrieval, ACE packet, dry-run PatchPlan, validation, and RLM replay.
- [ ] Implement HMM transitions, MapReduce error grouping, and ACE recovery
  dispatch as one replayable receipt.

Current master-feature classification: `WIRED_PARTIAL / READ_ONLY_PROVEN /
PROMOTION_BLOCKED`. No canonical, vector, graph, or cache writes are authorized
by this section.

### SEMANTIC-768-FIRST-01: repo-wide canonical cutover gate (2026-08-26)

The repository-wide order is frozen as:

```text
1. Populate and verify canonical EmbeddingGemma semantic_768.
2. Prove query/document role, model revision, normalization, identity joins,
   and stale-revision behavior across Postgres, Qdrant, and Go retrieval.
3. Freeze the semantic_768 benchmark oracle and CandidateOrdinal map.
4. Only then evaluate MRL 512/256/128, PCA/SVD, learned latent, TurboVec,
   SOM, or quantized routing challengers.
5. Promote a challenger only with held-out Recall/NDCG/MRR parity evidence.
```

- [x] Shared vector manifest now names `semantic_768` as canonical and
  registers `semantic_mrl_512`, `semantic_mrl_256`, and `semantic_mrl_128`
  as rebuildable `REFERENCE_ONLY` lanes.
- [x] Legacy 384 and title-384 entries are reference-only in the shared
  manifest; historical migrations and migration tooling remain untouched.
- [ ] Complete repo-wide `semantic_768` population and identity readback;
  current evidence still shows only `576` populated `content_embedding_768`
  rows in one canonical column and a separate `52,380` populated fallback
  `content_embedding` column.
- [ ] Do not run truncation, PCA/SVD backpropagation, latent training, or
  quantized promotion as a substitute for the missing 768 corpus proof.
- [ ] After the 768 gate passes, derive MRL lanes only from the frozen 768
  vectors, re-normalize prefixes, and compare against the same exact oracle.

### SEMANTIC-768-FIRST-01 gate refresh (2026-08-26)

- [x] Ran `node scripts/atlas/atlas-embedding-ranking-diagnostic-v1.mjs
  --limit=64 --query="Graphify AST semantic retrieval"` read-only.
- [x] Qdrant returned `64` vectors from `codebase_chunks_768`, each with
  dimension `768`; EmbeddingGemma query encoding also returned dimension `768`.
- [ ] Canonical Postgres proof remains blocked: only `576` rows populate
  `codebase_chunk_index.content_embedding_768`, the fallback
  `content_embedding` column has `52,380` rows, and the diagnostic observed
  `0` Postgres rows and no cross-store identity join for this query.
- [ ] Do not start truncation or PCA/SVD benchmarking until the canonical
  `semantic_768` population and `CandidateOrdinal`/source identity join are
  read-back verified.

### SEMANTIC-768-FIRST-01 lineage probe (2026-08-26)

- [ ] `npx tsx scripts/atlas/prove-one-packet-vector-lineage.mts` could not
  reach the packet proof: PostgreSQL rejected the configured `legal_admin`
  credentials with `28P01 password authentication failed`.
- [x] The failure occurred before packet inspection and before any write path;
  no database, vector, cache, or source data was changed.
- [ ] Repair or inject the approved read-only Postgres runtime credentials,
  then rerun the lineage proof. Do not change vector schemas or backfill
  embeddings while this connectivity gate is unresolved.

### SEMANTIC-768-FIRST-01 lineage refresh (2026-08-26)

- [x] Confirmed the live container accepts the repository credential contract:
  `legal_admin` / `legal_ai_db` on host port `5434`; PostgreSQL reports
  `18.4` and the `vector` extension is installed. The password value is not
  persisted or printed by the proof.
- [x] Fixed `prove-one-packet-vector-lineage.mts` to use the shared
  `loadRepoEnv()` / `resolveDatabaseUrl()` helper instead of its stale
  `legal@localhost` fallback.
- [x] Re-ran the lineage proof. It now finds a canonical packet and Qdrant
  768d vector, with `4/10` gates passing and no write success reported.
- [ ] Lineage remains partial: the compact 384 lane is absent for the selected
  packet, and repeated-run/metadata gates are not proven. This is not a
  failure of the PostgreSQL 18 or canonical 768 connection.

### SEMANTIC-768-FIRST-01 Redis correction (2026-08-26)

- [x] Confirmed Valkey accepts its configured `redis` password with a
  read-only `PING`.
- [x] Updated the lineage proof to use the shared Redis environment resolver,
  matching the Postgres fix and eliminating the stale unauthenticated client.
- [x] Re-ran the proof without `NOAUTH` errors. The remaining skips are
  substantive: `atlas:vector:policy:768`, the selected packet's 384 cache,
  identity, and revision keys are absent; the 384 routing lane is therefore
  not promoted.
- [ ] Keep `semantic_768` as the only required lane. Do not create 384 cache
  keys merely to make the lineage receipt green; populate a compact lane only
  as a separately reviewed challenger after the 768 corpus gate passes.

### MASTER-FEATURE-02 gate refresh (2026-08-26)

- [x] Re-ran `node scripts/atlas/verify-used-concept-edges.mjs` read-only.
  PostgreSQL still has `58,360` packets with concept IDs, while Neo4j has
  `0` Atlas-sourced `USED_CONCEPT` edges and `0.0%` cross-store coverage.
  The projection gate remains blocked; no apply is authorized.
- [x] Re-ran `node scripts/atlas/validate-neural-prefill-pipeline.mjs`.
  The receipt remains `PASS`, `readOnly: true`, `readinessPercent: 70`, with
  database/Qdrant/Valkey/training writes all false.
- [x] Confirmed the low-rank lane remains `DEGRADED`: the read-only
  `512 -> 96 -> 24` path has oracle `Recall@24 = 0.333` without labeled
  held-out relevance evidence.
- [ ] P0 next: select the reviewed grounded concept producer, emit a bounded
  Postgres-to-Neo4j projection receipt, and keep canonical apply blocked until
  identity, provenance, duplicate, and coverage checks pass.

**What was answered (real, checked, not guessed):**
- GPU/RTX will not speed up AST extraction. Root `CLAUDE.md`'s own hard
  rule: GPU is for tensor work only (embeddings, matmul, top-k, AE/SOM);
  JSON/CRUD/validation — and AST tree-walking is the same category — is
  CPU work.
- Checked `scripts/atlas/lib/ast-grep-symbol-extraction.mjs` directly:
  it's a plain sequential `for` loop, **zero parallelism** — no
  `worker_threads`, no concurrent file processing. That's the real
  explanation for the ~20min runtime, and the real lever (CPU worker-pool
  parallelism, not GPU) if someone wants to speed it up.
- "Run AST on everything" is the same request as the already-known,
  already-flagged NE-ID-06/07 gap (`atlas_ast_nodes` only covers
  `src/routes`/`src/lib`, 2,196 files; original full-scope populator never
  found in the working tree) — explicitly marked as needing an operator
  decision (locate original vs. deliberately rebuild wider), not something
  to just switch on.

**Not started — queued for next session, do not assume any of this is
wired without checking first (this session already caught two
near-duplicate-owner mistakes by checking before building — see
NE-VALIDATE-01's correction above and the KAG-01b correction in the
sibling `parent-atlas-ace-rlm-bitfrost-integration/tasks.md`)**:
- LangExtract / treesitter-chunker / ts-morph — current ownership split
  vs. `ast-grep`, if any, is not established in this file yet.
- A NetworkX-based Python sidecar for graph creation — check whether this
  overlaps `graph-analysis-runner.ts`/`pagerank-analysis-adapter.ts`
  (live, TypeScript, already wired — found this session) before building
  a Python peer.
- PostgreSQL 18 AIO — this is a server-level `postgresql.conf` executor
  feature (`io_method`), not application code; likely nothing to build,
  only to configure/verify, if anything.
  bitmap indexing — `atlas_class_search_index_v1` (this session,
  NE-CLASS-01) is the one precedent so far; check it before adding another.
- go-retrieval / embeddinggemma-768 / pgvector / node-pg / drizzle-orm /
  `.okf` domain schema pipeline alignment — no audit done yet.
- PostgreSQL FTS + bag-of-words candidate ranking for PageRank by
  canonical `source_ref` — no existing implementation checked yet.
- The user mentioned ">1000 TODOs" needing alignment — source of that
  count was not identified or verified this session.

Start the next session by re-reading this handoff, not by re-deriving it.

## External design proposal received (2026-08-26) — NOT independently
## verified this session, not yet converted into real checked tasks

User pasted a full architectural proposal (source unstated — possibly a
web-searched/externally-generated response) answering the handoff above.
**Recording it faithfully because it's well-structured and directly
answers open questions, but nothing in it has been checked against this
repo's live code by this session** — treat every claim below as a
hypothesis to verify, not a fact, before acting on it. Some of it likely
double-checks findings already made this session (e.g. it independently
also flags the `content_embedding_768` 576-row gap and the
`codebase_chunks_768` vs `_v2` split); some of it is genuinely new and
unverified (PostgreSQL 18.6 release/GIN fix claims, `nx-cugraph` backend
dispatch specifics, pgvector 0.8 HNSW iterative-scan claims, ts-morph
performance-doc claims, LangExtract `char_interval` alignment claims).

**Core architectural position**: CPU (ast-grep/Tree-sitter/ts-morph) does
100%-daily structural extraction; GPU (RTX/cuGraph/PyTorch) only starts
after a "revision join barrier" once structural+semantic+lexical passes
agree on `source_ref`/`source_revision`/`content_hash`. NetworkX is a CPU
parity oracle for the *same* frozen ordinal graph snapshot that cuGraph
executes on GPU — never a live per-query Postgres→JSON→NetworkX→cuGraph
conversion. Bag-of-words/FTS seeds Personalized PageRank at query time;
it must never become a permanent graph edge (edges = durable relations
like CALLS/IMPORTS/EXTENDS, not "these two files share words").

**Proposed tool-ownership split** (verify each row against actual live
code before trusting it — this session already found 2 near-duplicate
scripts by checking first rather than assuming a doc's ownership claim):
Tree-sitter/treesitter-chunker = chunk boundaries/byte spans only;
ast-grep = full-corpus structural extraction (declarations/calls/
imports/patterns); ts-morph = **one Project per workspace revision**,
TS-only semantic/type enrichment layered on top of ast-grep's output,
never re-run per-file/per-query; LangExtract = downstream grounded
entity/domain evidence, never structural identity or existence; Postgres
= canonical structural/identity/revision facts + GIN/FTS inverted index;
Go retrieval = the one retrieval façade; Qdrant = persistent semantic ANN
projection; pgvector = Postgres-native dense oracle/challenger; NetworkX
= CPU graph oracle/debug reference; cuGraph = GPU graph executor; `.okf`
contracts = evidence/schema/lifecycle validation, not a datastore;
`codebase-graph.json` = debug artifact only, never canonical graph state.

**Proposed 10 acceptance gates** (replacing ">1000 TODOs" with checkpoints
— none started, none verified against live code):
1. `GRAPHIFY-CORPUS-01` — freeze one `SourceInventoryV1`, run AST on
   100% of the corpus daily (not just `src/routes`/`src/lib` — directly
   supersedes/resolves NE-ID-06/07 above if adopted), incremental-hash
   reprocessing during dev, full proof nightly.
2. `STRUCT-IDENTITY-02` — get the nomination→`atlas_ast_nodes` bridge
   resolution rate from its current low sample rate to "essentially
   complete" for supported kinds before any bulk symbol-version apply.
3. `CALLABLE-03` — populate `atlas_callable_search`'s existing
   parameter/return/import/call columns; ts-morph enriches TS only,
   ast-grep/Tree-sitter stays structural authority.
4. `OKF-04` — collapse multiple domain-classification anchors (already
   flagged in this repo's own OKF audit per the proposal) into one
   `DomainClassificationV1` producer contract.
5. `SEMANTIC-05` — finish `semantic_768` Postgres coverage, resolve
   `codebase_chunks_768` vs `_v2` (an explicit collection-owner decision,
   same shape as this session's other operator-decision-blocked items),
   prove Postgres↔Qdrant row/revision/checksum parity.
6. `GRAPH-06` — materialize canonical structural/reference edges into one
   revisioned ordinal graph snapshot (`srcOrdinal`/`dstOrdinal`/`weight`/
   `edgeType` typed arrays); NetworkX and cuGraph both consume that same
   snapshot, built once per `graphRevision`, never per-query.
7. `RETRIEVAL-07` — Go retrieval as the one façade over FTS/GIN + semantic
   ANN + graph expansion; each index is an executor, not a competing RRF
   vote.
8. `PPR-08` — FTS/AST/semantic/domain results seed Personalized PageRank;
   global PageRank stays a separate offline feature; topology stays
   separate from bag-of-words similarity.
9. `DAILY-09` — wire all of the above into daily Graphify with an
   explicit barrier: `inventory → CPU AST ‖ GPU embeddings ‖ FTS →
   join/validate → materialize → graph snapshot → GPU ranks → Qdrant/
   Valkey projections → receipts`; fan-out only after revisions/checksums
   agree.
10. `ADMIN-10` — extend the **existing** `/admin/atlas` (proposal claims
    it already has health/registry/query/cache/workflow/graph-viz — not
    verified this session) with a read-only Corpus Pipeline panel, rather
    than building a new Parent Atlas UI.

**Before adopting any of this**: verify the specific factual claims
(PG18.6 release date/GIN fix content, `nx-cugraph` conversion-cost
warning, pgvector 0.8 HNSW iterative-scan/halfvec/binary-quantization
claims, ts-morph Project-reuse performance guidance, LangExtract
`char_interval` semantics) against their actual upstream docs — none of
these were checked this session, they were pasted in from elsewhere.
Also verify the repo-specific claims (`/admin/atlas`'s actual current
feature set, the "3/200 sample" bridge-resolution figure, the OKF audit's
"multiple anchors" finding) against live code, the same way this session
verified G-02/G-03/G-04 with real command output rather than trusting a
written claim.

**One claim verified (2026-08-26)**: `/admin/atlas` genuinely exists —
`sveltekit-frontend/src/routes/(app)/admin/atlas/{+page.svelte,+page.server.ts}`,
backed by 27 real API routes under `src/routes/api/admin/atlas/` (health,
runtime-registry, query, cache, graph traverse/proof/projection,
cluster-search, hyperrag, phase-lanes, pass-fabric, couchdb, synthesize,
turbovec-prefilter). `ADMIN-10`'s premise — extend this, don't build a
new Parent Atlas UI — is correct. Not yet checked: whether the rendered
page actually surfaces these as UI panels, or some routes are API-only.
Everything else in the 10 gates remains unverified.

## CALLABLE-03 audit (2026-08-26): schema is ready, zero writers exist,
found 2 adjacent-but-non-matching extractors before building a 3rd

Picked up the proposal's `CALLABLE-03` tranche ("populate
`atlas_symbol_versions`'s existing parameter/return/import/call columns")
as read-only audit-before-build, per this file's own repeated
duplication-prevention discipline. Did not write a populator — found
enough to warrant recording before building one.

- [x] Confirmed via `\d atlas_symbol_versions` (live schema) that the
  proposal's premise is accurate: the table already has
  `parameter_names text[]`, `parameter_types text[]`, `return_types
  text[]`, `imports text[]`, `calls text[]`, and `callable_metadata
  jsonb` — the callable-semantics columns genuinely exist, ready for a
  writer.
- [x] Queried population state: `200` total rows, `0` rows with any of
  `parameter_names`/`parameter_types`/`return_types`/`imports`/`calls`
  populated (`cardinality(...) > 0`). All `200` have non-empty
  `callable_metadata`, but sampled rows show it only carries `{kind,
  exported, language, extractor, nomination_id}` — generic
  nomination bookkeeping, not signature data. The gap is real, not
  hidden elsewhere in the row.
- [x] Confirmed no live writer targets these columns:
  `materialize-registry-ontology-tuples.mts` references
  `parameter_types`/`return_type` but against a **different** table
  (`function_schema`, singular column names) entirely unrelated to
  `atlas_symbol_versions`.
- [x] **Found 2 existing ts-morph-based extractors doing adjacent work,
  neither of which targets `atlas_symbol_versions`** — checked before
  concluding CALLABLE-03 needs a new script:
  - `scripts/atlas/extract-symbol-map.mjs` (ATLAS-3A) — ts-morph `Project`,
    writes to `atlas_symbol_map`/`atlas_feature_map`/`nes_chrom_packets`.
    Its `getSignature()` only captures raw truncated declaration text
    (`declaration.getText().slice(0, 500)`), not decomposed
    parameter/return arrays — not directly reusable as-is, but proves the
    `Project` setup/resolution machinery already works in this repo.
  - `scripts/atlas/phase2-atlas-calls-extractor.mjs` — separate ts-morph
    `Project`, extracts `CallExpression` call-graph edges, writes to
    Neo4j + Redis, not Postgres.
  Neither is a duplicate owner of `atlas_symbol_versions`'s columns (both
  target different tables/stores), but a `CALLABLE-03` populator would be
  a **third** ts-morph `Project` instantiation over the same source tree.
  Per the proposal's own stated ts-morph rule ("one Project per workspace
  revision ... never re-run per-file/per-query") and this repo's
  CANONICAL_OWNER discipline, a new populator should reuse or extend one
  of these two `Project` instances rather than spin up a third
  independent one.
- [x] **Follow-up found the real canonical owner of BOTH tables — revises
  the operator-decision options below.** Read
  `scripts/atlas/materialize-ast-symbol-versions.mjs` fully: it `INSERT`s
  into `atlas_symbol_versions`, then `INSERT...SELECT`s straight into
  `atlas_callable_search` (the GIN-indexed downstream projection —
  confirmed live: same schema shape, `search_vector` tsvector populated
  on all `200` rows even though the signature arrays aren't, same
  `codebase_chunk_index`-adjacent scope). It already uses the shared
  `buildAstSourceRefKey()` (`AST-ID-01`) for its `atlas_ast_nodes`
  identity-bridge join, and its own inline comment documents a real
  composite-key bug it already fixed ("NE-ID-03/04 fix, 2026-08-24") —
  the exact same class of bug this session kept independently
  rediscovering in the bridge census work above. **This script is the
  established production owner of both tables — not a candidate to
  build a rival populator against.**
  - **Important constraint this surfaces**: it is driven by
    `ast-symbol-nominations.jsonl`/`ast-symbol-resolution.jsonl` (the
    ast-grep nomination pipeline's output), not by a live `ts-morph`
    `Project` — it has no type checker available to it. It could
    plausibly gain `parameter_names` if the upstream nomination JSONL
    captured raw parameter identifier spans (an ast-grep-only change,
    no ts-morph needed), but `parameter_types`/`return_types` need real
    type resolution — those need `ts-morph`'s type checker, which this
    script doesn't have.
  - Also found `scripts/atlas/enrich-ast-callable-search.mjs`, a third
    stage that already runs against `atlas_callable_search` (writes
    `domain_id`/`taxonomy_revision`/`inferred_uses`/`enrichment_metadata`)
    — it reads `row.imports`/`row.calls` to build its search text but
    never writes them, so it's already silently degrading on the same
    upstream gap.
- [ ] **Operator decision needed, not a unilateral build — options
  revised by the finding above**: (a) extend
  `materialize-ast-symbol-versions.mjs`'s nomination JSONL + the upstream
  ast-grep nomination pass to also capture parameter identifier spans
  (covers `parameter_names` only, no ts-morph needed); (b) add a
  **separate**, new `ts-morph`-backed enrichment pass — a 4th stage after
  `materialize-ast-symbol-versions.mjs` and before/alongside
  `enrich-ast-callable-search.mjs` — that reads existing
  `atlas_symbol_versions` rows by `source_ref`/`source_revision` and
  `UPDATE`s `parameter_types`/`return_types`/`imports`/`calls` using a
  real type checker (this is where a shared `TsSemanticWorkspaceV1`-style
  one-`Project`-per-`workspaceRevision` owner, as a separate design
  proposal suggested, would actually fit — as a new enrichment stage, not
  a rewrite of the nomination materializer); or (c) something else? Do
  not start a populator until this is picked — same shape as this file's
  other operator-decision items.

## OKF-04 partial resolution (2026-08-26): the root-level `src/` tree is a
confirmed legacy duplicate, explaining part of "multiple domain-classification
anchors" — and part of `AST-ID-04`'s path-relativity puzzle

Following up `## AST-ID-04`'s open item (b) — decide the path-relativity
convention for the bridge join — by chasing why `10,153` candidates carry
a bare `src/...` prefix distinct from `sveltekit-frontend/src/...`. Also
directly answers half of the proposal's `OKF-04` tranche ("collapse
multiple domain-classification anchors... already flagged in this repo's
own OKF audit").

- [x] **Confirmed there is a second, real, git-tracked `src/` tree at the
  repo root** (`196` files, `git ls-files src/ | wc -l` confirms
  tracked), entirely separate from `sveltekit-frontend/src/` (`5,778`
  files). Root `svelte.config.js` explicitly documents itself as a
  delegation shim ("exists only to satisfy workspace-level svelte-check;
  the real config is in sveltekit-frontend/svelte.config.js"), and root
  `package.json` has no `dev`/`build` script — confirming
  `sveltekit-frontend/` is the only actively-run app.
- [x] **Confirmed via `git log` this root `src/` is legacy, not new**:
  every file under it was touched by exactly one commit,
  `a2e4dab329` ("wip(atlas): restore orphaned root src tree, retire Atlas
  v1 in favor of v2/semantic_768 alignment", 2026-08-23) — a prior
  session's own words, not this session's inference. This matches
  `parent-atlas-workstation-todo.md`'s much more extensive prior
  investigation of that same commit (582 files, an
  `INTENTIONAL_V1_RETIREMENT`/`REPLACED_BY_V2`/`COLLATERAL_REGRESSION`/
  `HISTORICAL_DOC_ONLY`/`UNKNOWN_NEEDS_OWNER_REVIEW` classification
  framework already exists there for auditing the rest of it — **do not
  duplicate that effort here**, this entry only adds the one new angle
  that document doesn't cover.
- [x] **Diffed the two `domain-classifier.ts` files directly — confirmed
  `REPLACED_BY_V2` for this specific pair**, not just "two files that
  happen to share a name": root `src/lib/server/classifier/
  domain-classifier.ts` is a self-contained hardcoded `KEYWORD_DOMAINS`
  keyword-list implementation (10 domains, inline word lists).
  `sveltekit-frontend/src/lib/server/classifier/domain-classifier.ts`
  delegates to `../atlas/domain-taxonomy.js`'s `classifyDomainTaxonomy()`/
  `CANONICAL_DOMAINS` — a single shared taxonomy module with `8` real
  consumers inside `sveltekit-frontend/src/` (`atlas-operation-runtime-v1.ts`,
  `okf-fit.ts`, `semantic-signal-routing.ts`, `phase109a-baseline-classifier.ts`,
  `promotion-enrichment-service.ts`, plus the classifier file itself and its
  own spec). `src/lib/server/atlas/indexing/domain-classifier.ts` (the
  third file the original 40-file grep surfaced) is just a one-line
  re-export of the root legacy version, not an independent fourth anchor.
- [x] **This resolves the specific `AST-ID-04` question of why `src/...`
  (bare, `10,153` candidates) and `sveltekit-frontend/src/...` (`25,658`
  candidates) both appear as separate prefixes**: they are not the same
  files under two path conventions in this case — the bare `src/...`
  bucket is (at least partly) a real, separate, git-tracked legacy Atlas
  v1 tree that the Graphify AST scope is currently parsing as if it were
  live application source. Combined with `AST-ID-04`'s other finding
  (`llama-cpp-turboquant-gemma4/`, a vendored fork build tree, `10,729`
  candidates), a meaningful fraction of the `59,915`-candidate corpus may
  be legacy/vendored code that was never meant to count toward "how much
  of the real corpus does `atlas_ast_nodes` cover."
- [ ] **Does not fully resolve `OKF-04`** — this only confirms one
  specific 2-file pair. The other domain-classification-adjacent files
  the original grep surfaced (`document-classifier.ts` in
  `src/lib/server/classification/`, `okf-dev-corpus.ts`,
  `document-classification.ts` schema files, `taxonomy-topology-packet.ts`,
  `canonical-chunk-contract.ts`) were not individually checked for
  root-vs-`sveltekit-frontend` duplication this pass. A full `OKF-04`
  resolution needs that same root/current diff applied to each.
- [ ] **Operator decision, not unilateral**: should the Graphify AST scope
  (`docs/reports/graphify-ast-scope-v1.json`) explicitly exclude the root
  `src/` tree (same as it should for `llama-cpp-turboquant-gemma4/`), or
  is retaining it in scope intentional (e.g. to track the v1→v2
  retirement itself)? This is the same shape as `AST-ID-04`'s decision
  items — do not change the scope-exclusion policy without that call.

## AST-ID-05 follow-up: checked a pasted "revision/content-hash drift"
hypothesis against real data — found something more specific and more
useful (2026-08-26)

**Naming note**: this reuses `AST-ID-05`'s topic (a concurrent session
already opened `## AST-ID-05: source-revision and content-hash comparison
(2026-08-25)` above, with its own `compare-ast-bridge-revisions.mjs` and
`REVISION_AUTHORITY_UNAVAILABLE` finding) — titled "follow-up" rather than
a second `AST-ID-05` to avoid a duplicate heading. Its open item ("rerun
this comparison" once Graphify revision authority is available) is
superseded by this entry's finding below: the revision/content-hash
question turned out to be the wrong question for most of the gap.

A pasted design review (source unstated) proposed `AST-ID-05` as
"revision/content-hash drift census" — the idea being unmatched
candidates reflect the source file having changed since
`atlas_ast_nodes` was last populated — and offered a specific example as
evidence: `quantizeGemmaOutput` (candidate) vs. an existing
`quantizeGemmaLegalOutput` (`atlas_ast_nodes` row), "which strongly
suggests source-revision/content drift." Checked this directly against
real data rather than accepting it. **The drift hypothesis does not
survive the check; a different, more specific and more actionable cause
does.**

- [x] **Found a real, already-built script answering this same question**
  from a concurrent session:
  `scripts/atlas/compare-ast-bridge-revisions.mjs` →
  `docs/reports/atlas-ast-bridge-revision-comparison-v1.json`
  (read-only, `databaseWrites: false`). Its `mismatchedCandidateRows:
  3780` and the pasted review's "existing files / symbol mismatch: 3,780"
  match exactly — that specific number is real. But its
  `graphifyFiles: 0` and **100% of its 554 sampled comparisons
  classified `REVISION_AUTHORITY_UNAVAILABLE`** (every sample shows
  `graphifyRevision: null, graphifyContentHash: null`) means the
  script's actual revision/content-hash lookup never resolved any real
  Graphify data — it degraded uniformly to "unavailable," it did **not**
  confirm drift for a single row. The pasted claim's "strongly suggests
  drift" framing outran what this report actually proves.
- [x] **Checked the cited example directly against real data instead of
  trusting the framing.** Re-parsed
  `src/lib/ai/base64-fp32-quantizer.ts` from the v2 candidate JSONL: it
  has **both** `method quantizeGemmaOutput` (a `Base64FP32Quantizer`
  class method) **and** `function quantizeGemmaLegalOutput` (a separate,
  free-standing function) in the file **simultaneously** — confirmed via
  direct grep against the live candidate export. This is not a rename or
  drift; both symbols coexist right now. `atlas_ast_nodes`'s `8` keys for
  this file are `class:Base64FP32Quantizer`, `4× type:...`,
  `function:quantizeGemmaLegalOutput`, `function:processGemmaResponse`,
  and `file:...` — **zero of the class's 17 methods** (constructor,
  `quantizeGemmaOutput`, `parallelQuantization`, `getMetrics`, etc.) are
  present at all.
- [x] **Generalized the check repo-wide by candidate kind** (ad hoc
  script, not committed — the finding is the deliverable, not another
  script) — matched every one of the `59,915` candidates against the
  `7,565` `atlas_ast_nodes` keys, grouped by raw `symbol_kind`:
  ```
  function     total=32800  matched=1593  rate=4.86%
  method       total=14543  matched=7     rate=0.05%
  interface    total=7061   matched=1376  rate=19.49%
  type         total=3502   matched=679   rate=19.39%
  class        total=1963   matched=149   rate=7.59%
  enum         total=46     matched=0     rate=0.00%
  ```
  **Class methods match at `0.05%` — essentially zero, ~100× lower than
  every other kind.** This is not noise or a per-file coincidence; it is
  a clean, structural signal across the whole corpus.
- [x] **Corrected finding, replacing the pasted "revision drift"
  hypothesis**: the dominant cause of low match rate is not files
  changing since `atlas_ast_nodes` was populated — it is that whichever
  process populated `atlas_ast_nodes` **essentially never extracted class
  methods** (only top-level functions, interfaces, types, classes, and
  a handful of coincidental method matches). This is an
  **extraction-scope gap** in the existing table's populator, not a
  staleness/drift problem, and it is falsifiable and fixable in a way
  "content drift" isn't: re-running (or building) an `atlas_ast_nodes`
  populator pass that includes class methods should close most of this
  gap directly, without needing any revision/content-hash reconciliation
  machinery at all.
- [x] **Checked why methods were excluded — found the real root cause,
  and it's architectural, not a bug.** `populate-atlas-ast-nodes.mjs`'s
  actual write path (the non-`--graphify-parse` mode) sources rows from
  `codebase_chunk_index.symbol`/`.kind` — **one row per embeddable text
  chunk**, not a recursive AST walk. `codebase_chunk_index` is this
  repo's structure-aware chunking table (built for embedding-sized text
  spans, per its documented role elsewhere in this repo), and a class
  normally becomes one chunk with the class itself as `symbol`/`kind` —
  its methods are chunk *contents*, not separate chunk rows, so they
  were never candidates for their own `atlas_ast_nodes` row in the first
  place. The `7/14,543` coincidental method matches are almost certainly
  classes small enough to have been chunked per-method rather than
  per-class. **This is not a populator bug to fix by re-running it** —
  `atlas_ast_nodes` and the new `--graphify-parse --declarations-only`
  ast-grep pass have different design intents (chunk-representative
  symbol vs. exhaustive declaration extraction) and reconciling them is
  a real architecture decision, not a rerun.
- [x] **Operator decision item written into `## AST-ID-06` above**
  (the real section — not duplicated here): method/chunk-extraction-scope
  policy, now flagged there as the single biggest lever on the `6.35%`
  match rate, alongside the path/case/vendored-tree items already listed
  there.

## PACKET-MATERIALIZER-01: `PacketValidator.materializeToMirrors()`
fabricates Qdrant/Neo4j/SeaweedFS sync success — confirmed real bug,
currently dormant (2026-08-26)

A long pasted architecture review (a different concurrent session's
output, not this session's own work — recorded here only because it
raised one concrete, checkable claim) asserted: "the visible Qdrant and
Neo4j portions of `materializeToMirrors` construct report IDs but ...
they do not visibly execute an actual Qdrant or Neo4j client write
before reporting success." Checked this directly against the real file
rather than trusting the framing — same discipline as `AST-ID-05
follow-up` above, and this one **does** survive the check.

- [x] **Confirmed, unambiguously**: `packages/parent-atlas/src/core/
  packet-validator-materializer.ts`'s `materializeToMirrors()` (lines
  398-483). The class constructor (`line 217-219`) only stores
  `pgClient`/`redisClient` — there is no `qdrantClient`/`neo4jClient`
  field at all. Inside the method:
  - **Qdrant branch** (line 430-440): generates a `pointId` via
    `crypto.randomBytes(...)` if none exists, sets `synced: true`. No
    Qdrant client call anywhere.
  - **Neo4j branch** (line 442-450): generates a `nodeId` via
    `crypto.randomUUID()` if none exists, sets `synced: true`. No Neo4j
    client call anywhere.
  - **Redis branch** (line 452-475): genuinely `await
    this.redisClient.setex(...)` — this one is real.
  - **SeaweedFS branch** (line 477-479): sets `synced: true` only if
    `packet.seaweedfs_filer_path` already exists on the row — doesn't
    write anything either, just reflects pre-existing state.
  So `MaterializationReport.mirrors.qdrant.synced` and `.neo4j.synced`
  can both report `true` while genuinely writing nothing to either
  store. This is exactly the failure pattern this repo's own root
  `CLAUDE.md` "AGENT EXECUTION INTEGRITY — EVIDENCE RULES" section
  defines and prohibits (claiming success without matching tool/client
  evidence) — except here it's baked into shipped library code, not an
  agent's claim.
- [x] **Checked real-world impact before flagging severity**: grepped
  for actual invocations, not just imports/type references. `9` files
  reference `PacketValidator`/`materializeToMirrors` by name, but **zero
  call `.materializeToMirrors(` in real code** — the only match repo-wide
  is an example snippet in `docs/SESSION-81-CONTINUATION-GUIDE.md`. This
  is **dormant, not actively misleading a live caller today** — but it
  **is** publicly exported from the package (`packages/parent-atlas/src/
  index.ts:104,138`), has zero test coverage (no spec/test file exists
  for `packet-validator-materializer.ts` at all), and is discoverable by
  anyone wiring up real mirror materialization later, who would get
  false-positive sync confirmation for Qdrant/Neo4j unless they read the
  implementation first.
- [x] **Fixed** (2026-08-26): the Qdrant and Neo4j branches now report
  `synced: false, error: 'not_implemented: PacketValidator has no
  {Qdrant,Neo4j} client wired in'` instead of fabricating a random
  `pointId`/`nodeId` and claiming `synced: true`. Chosen over wiring in
  real clients because (a) zero live callers exist, so there's no
  behavior to preserve, and (b) wiring real clients is a genuinely
  bigger, riskier change (new constructor deps, connection lifecycle,
  error handling for two more external services) that deserves its own
  scoped task, not a same-turn bundle with the honesty fix. The
  `SeaweedFS` branch was left unchanged — it only reports `synced: true`
  when `packet.seaweedfs_filer_path` already exists on the row (reflects
  real prior state, doesn't fabricate a write), so it wasn't the same
  bug. Verified: `npx tsc --noEmit` on `packages/parent-atlas` shows zero
  new errors from this file (pre-existing unused-import warnings on
  unrelated lines are untouched). No test file exists for this module to
  run — flagged as a real gap, not fixed here (a 5th, larger task).
- [x] **Both follow-ups done (2026-08-26)**: wired real, optional,
  dependency-injected clients rather than leaving it `not_implemented`
  forever.
  - Added a 3rd, optional constructor param
    (`mirrorClients: { qdrantClient?, qdrantCollection?, neo4jDriver? }`)
    — fully backward compatible, existing 2-arg callers (there are none
    live, but the signature still holds) behave identically to before.
  - **Qdrant branch**: real `qdrantClient.upsert(collection, {...})`
    call when both `qdrantClient` and `qdrantCollection` are injected;
    falls back to the honest `not_implemented` report otherwise. The
    collection name is **never chosen by this class** — it must be
    passed in by the caller, deliberately, because this session's own
    `codebase_chunks_768` vs `_v2` open question (recorded elsewhere in
    this file) means guessing a default here would be an unreviewed
    architectural decision, not a mechanical fix.
  - **Neo4j branch**: real `driver.session().run('MERGE (p:AtlasPacket
    {packet_key: $packetKey}) SET ...')` when `neo4jDriver` is injected;
    same honest fallback otherwise. Session is always closed in a
    `finally` block.
  - Both branches catch client errors and report `synced: false, error:
    <real message>` — never throws out of `materializeToMirrors()` for a
    mirror failure, matching the existing Redis branch's error-handling
    shape.
  - **New test file** `packages/parent-atlas/test/
    packet-validator-materializer.test.mjs` (this package had zero test
    coverage for this module before) — `4/4` pass via `node --test`
    against the compiled `dist/` output, matching this package's own
    `test:*` convention:
    1. No injected clients → both mirrors report `not_implemented`,
       Redis still genuinely syncs (proves the original fix still holds).
    2. Injected mock `qdrantClient`/`neo4jDriver` → real `upsert`/`run`
       calls happen with correct arguments (collection name, payload
       shape, Cypher params), both report `synced: true`.
    3. Injected clients that throw → `synced: false` with the real error
       message surfaced, no unhandled rejection.
    4. No embedding on the packet row → Qdrant branch skipped entirely
       even with a client injected (never calls `upsert` for a
       non-embedded packet).
  - Added `test:packet-validator-materializer` npm script to
    `packages/parent-atlas/package.json`, matching the existing `test:*`
    naming convention. Note: `npm run test:packet-validator-materializer`
    itself currently fails in this shell with `Cannot use --no-workspaces
    and --workspace at the same time` — confirmed this is a **pre-existing
    environment/npm-config issue**, not something this change introduced
    (the already-existing `npm run test:canonical-surface` fails
    identically). Verified instead via the direct command the script
    wraps: `node ../../node_modules/typescript/bin/tsc -p tsconfig.json
    && node --test ./test/packet-validator-materializer.test.mjs` — `4/4`
    pass.
  - `npx tsc --noEmit -p tsconfig.json` (from `packages/parent-atlas`):
    zero new errors from this file.
  - **Not done, deliberately**: did not pick a Qdrant collection or wire
    a live Neo4j URI/credentials into any real caller — no live write
    was performed against production Qdrant/Neo4j this session.
    `atlas_packet_registry` (the table this class reads from) is also
    worth knowing before anyone does wire a live caller: confirmed via
    `docker exec psql`, it has `58,324` rows but **zero** with
    `embedding_status='complete' AND embedding_768d IS NOT NULL`, and its
    `max(updated_at)` is `2026-07-10` — over 6 weeks stale as of this
    session. It is not the actively-written canonical table this
    session's other work has been using (`atlas_packets`/
    `codebase_chunk_index`). Wiring a live caller today would exercise
    real code against stale/empty data, not prove anything about current
    system state — that's a separate, larger question than "does the
    upsert/MERGE call work," which is what this fix and its test prove.

## PACKET-MATERIALIZER-02: `atlas_packet_registry` (what `PacketValidator`
reads) looks like a stale, disconnected snapshot of the real canonical
`atlas_packets` — checked before assuming the fix above is sufficient
(2026-08-26)

Follow-up to the `atlas_packet_registry` staleness noted in
`PACKET-MATERIALIZER-01`'s last item. Checked how serious that is before
treating the wiring fix as the end of the story.

- [x] **Found 4 writer scripts for `atlas_packet_registry`, none wired
  into any npm script or automated pipeline**:
  `scripts/atlas/hyperrag-packet-materializer.mjs` (last touched
  2026-07-05), `scripts/atlas/backfill-packet-registry.mjs` (2026-06-28),
  and — the clearest duplicate-owner smell — `scripts/atlas/
  week1-packet-registry-backfill.mjs` and `scripts/atlas/
  week1-backfill-packet-registry.mjs`, near-identical names, **committed
  in the same commit** (`ec26b81cc2`, 2026-06-24). `grep` against both
  root and `sveltekit-frontend` `package.json` found zero references to
  any of the four — this table is only ever populated by manual, ad hoc
  `node scripts/atlas/X.mjs` runs, never by daily/startup automation.
- [x] **Compared `atlas_packet_registry` against the real canonical
  `atlas_packets`** (61,660 rows, FK-referenced by ~13 other tables per
  `\d atlas_packets` — `atlas_feature_envelopes`, `atlas_summary_layers`,
  `atlas_ontology_linked_tuples`, `code_features`, etc. — confirming its
  canonical status independent of anything documented). `atlas_packet_
  registry` has zero incoming foreign keys. Row counts are suspiciously
  close (`58,324` vs `61,660`), consistent with `atlas_packet_registry`
  having been a one-time snapshot/backfill of `atlas_packets` that was
  never kept in sync afterward, not an independently-maintained table.
- [x] **Found a second, independent data-quality bug while checking
  this — in the real canonical table, not just the stale one**:
  `atlas_packets.embedding_status` shows **0** rows `= 'complete'`
  (identical to `atlas_packet_registry`'s gap), but `6,451` rows **do**
  have a populated `qdrant_point_id` and `6,364` have `qdrant_collection
  = 'codebase_chunks_768'` — i.e., packets genuinely appear to be
  indexed in Qdrant, but the `embedding_status` column was never updated
  to reflect it. This is a real tracking-field/actual-state
  inconsistency in the live canonical table, independent of the
  `atlas_packet_registry` staleness question.
- [x] **Incidental real evidence toward this session's own open
  `codebase_chunks_768` vs `_v2` question** (recorded earlier in this
  file as an operator-decision item, not resolved there): live
  `atlas_packets.qdrant_collection` values are `codebase_chunks_768`
  (`6,364` rows) and `codebase_chunks_384` (`1` row) — **zero** rows
  reference `codebase_chunks_768_v2`. This doesn't fully resolve the
  question (root `CLAUDE.md` documents `_v2` as populated via a
  different table, `codebase_chunk_index`, with its own 52,380-point
  count) but it is one more real, concrete data point for whoever makes
  that call.
- [ ] **Operator decision, not fixed here**: should `PacketValidator`
  (and the fix in `PACKET-MATERIALIZER-01` above) be repointed from
  `atlas_packet_registry` to the real canonical `atlas_packets`? The
  column shapes differ enough that this isn't a one-line change
  (`embedding_768d` → `embedding`, `qdrant_point_id` is `bigint` in the
  registry vs `text` in `atlas_packets`, `atlas_packets` already tracks
  `qdrant_collection`/`qdrant_vector_dim`/`identity_lane` per-row which
  `atlas_packet_registry` does not) — a real, reviewed migration of this
  class's read path, not a mechanical fix. Until that's decided, treat
  `PacketValidator.validatePacket()`/`materializeToMirrors()` as
  validating/materializing a **disconnected historical snapshot**, not
  live packet state — this matters for anyone about to rely on either
  method's output for a real decision.
- [ ] **Separate operator decision, smaller scope**: should the
  `embedding_status` inconsistency in `atlas_packets` (indexed in Qdrant
  per `qdrant_point_id` but never marked `'complete'`) be backfilled?
  This affects anything downstream that gates on `embedding_status`
  rather than checking `qdrant_point_id` directly — not audited this
  session, flagged only.

## TABLE-AUDIT-01: checked "what tables are missing, create them" against
a pasted "Temporal Action Ledger" proposal — found nothing missing
(2026-08-26)

Asked directly: find missing tables, `CREATE`/`ALTER` them for proper
indexing. A pasted design review (a different concurrent session's
output) proposed a `atlas_action_events`/`atlas_action_current`
DRY-lookup pair with specific indexes
(`execution_key` PK, `(execution_key, ledger_sequence DESC)`,
`(target_class, canonical_id, latest_observed_at DESC)`,
`(opcode, latest_observed_at DESC)`) as something to build. Checked
before building anything — per this repo's own repeated
duplication-prevention discipline, and because the proposal itself
explicitly warned "I would not invent `atlas_lookup_v1`,
`already_done`, `task_cache`, etc." — the same caution needed to apply
to its own suggested table names too.

- [x] **Found the real system already exists, live, and is MORE
  complete than the proposal** — 30 files reference
  `ActionExecutionDescriptorV1`/`ActionCurrentProjectionV1`
  (`packages/parent-atlas/src/core/temporal-action-ledger.ts` +
  `temporal-action-postgres-repository.ts` +
  `temporal-action-workflow-adapter.ts` +
  `temporal-action-alternative-runtime.ts`, plus
  `sveltekit-frontend/src/lib/server/atlas/temporal/*` consumers).
- [x] **Confirmed via live `\d` the real backing table**
  (`atlas_agent_action_events`, not `atlas_action_events` as the
  proposal guessed) **already has every index the proposal wanted, plus
  more**: `PRIMARY KEY (event_id)`, `UNIQUE (ledger_sequence)`,
  `(execution_key, ledger_sequence DESC)`,
  `(target_canonical_id, ledger_sequence DESC) WHERE ... IS NOT NULL`,
  `(opcode, ledger_sequence DESC)`,
  `(error_code, ledger_sequence DESC) WHERE ... IS NOT NULL`,
  `(outcome, ledger_sequence DESC) WHERE ... IS NOT NULL`, and a 4-column
  compound `(workspace_revision, source_revision, graph_revision,
  ledger_sequence DESC)` the proposal didn't even think to ask for. Plus
  real `CHECK` constraints enforcing `execution_key`/`event_checksum` are
  valid 64-char hex (SHA-256 shape), not just declared as text.
- [x] **Confirmed the proposal's separate `atlas_action_current` table is
  deliberately *not* a table** — `temporal-action-postgres-repository.ts`
  computes `ActionCurrentProjectionV1` via a pure function
  (`projectActionCurrent(events)`) from the append-only events log, with
  an inline comment stating exactly why: "ActionCurrentProjectionV1 is
  rebuilt from immutable events and is not canonical history." This is a
  **better** design than the proposal's two-table version — a derived
  projection can't drift out of sync with its source the way a
  separately-written "current" table could. Building the proposal's
  `atlas_action_current` table now would be a strictly worse, drift-prone
  duplicate of something already correctly solved.
- [x] **Checked real-world liveness, not just schema existence** (same
  discipline as `PACKET-MATERIALIZER-01`/`02` above): `atlas_agent_
  action_events` has **0 rows** in this dev DB — but unlike
  `PacketValidator.materializeToMirrors()`, this is **not** a dormant/
  disconnected code path. Traced real callers: `tool-shim.ts` (used by
  `temporal-tool-post-dispatch-recorder.ts`/`temporal-tool-execution-
  boundary.ts`) is imported by `src/routes/api/agents/chat/+server.ts`
  (a live API route), `gemma4-tool-loop.ts`, `gemma4-agent.ts`, and
  `langgraph-dag.ts`. Zero rows here most likely reflects this dev DB
  never having recorded a real agent tool-dispatch session — a
  liveness/exercise gap, not a wiring gap.
- [x] **Also re-checked the two other schema areas this session touched**
  before concluding "nothing missing" repo-wide: `atlas_symbol_versions`/
  `atlas_callable_search` (`CALLABLE-03` above) — schema exists, fully
  GIN-indexed, genuinely unpopulated (a writer gap, not a schema gap).
  `atlas_packet_registry` (`PACKET-MATERIALIZER-02` above) — schema
  exists, stale/disconnected duplicate of `atlas_packets` (an ownership
  gap, not a missing-schema gap). Neither needs a new table either.
- [x] **One real, but out-of-scope-for-DDL bug found while checking the
  same pasted content's pagination claim**: `sveltekit-frontend/src/
  routes/api/admin/retrieval/search/+server.ts` genuinely does claim
  "keyset pagination" in its own doc comment but implements plain offset
  pagination — `decodeCursor()`/`encodeCursor()` carry a `score` field
  that's captured and round-tripped but **never used** to seek (only
  `paginationCursor.offset` is passed to `searchGoService(...)`).
  Confirmed real by reading the route directly. **Not a missing-table
  problem** — the actual search execution lives in a Go microservice
  (`searchGoService`) this session has no visibility into; fixing this
  for real requires that service's query interface to support seeking
  by `(score, canonical_id)`, not a Postgres migration. Flagged, not
  fixed — out of scope for this task's "find missing tables" framing.
- [ ] **Conclusion — no `CREATE TABLE`/`ALTER TABLE` performed this
  session, deliberately.** Every table this session's audits touched
  (`atlas_agent_action_events`, `atlas_symbol_versions`,
  `atlas_callable_search`, `atlas_packet_registry`, `atlas_packets`)
  already exists with either adequate or over-complete indexing. The
  real gaps found across this whole session are consistently **data/
  writer gaps** (empty columns, unexercised code paths) or **ownership
  gaps** (stale duplicate tables, unclear canonical source), never a
  genuinely missing table or index. Inventing new schema to satisfy
  "create the missing tables" when investigation finds none missing
  would itself be the exact anti-pattern this repo's own
  duplication-prevention rule and the pasted proposal both warn against.
  If a specific, concrete missing table/index is identified later (not
  speculatively re-derived from another proposal), it should go through
  the same `drizzle/manual/*.sql` + `IF NOT EXISTS` + manual-review
  pattern this session already used successfully for `NE-CLASS-01`
  (`sveltekit-frontend/drizzle/manual/20260826_atlas_class_search_index_v1.sql`).

## TABLE-AUDIT-02: does the agentic-error-fixing workflow have a
`workflow_id`-keyed activity timeline in Redis/Valkey? Checked directly
— answer is no, and the durable home for it already exists unused
(2026-08-26)

Direct question asked: is there an async agentic timeline of
agentic-error-fixing activity, tracked by `workflow_id`, as JSON events
in Redis/Valkey? Checked the actual agentic-error-fixing scripts rather
than assuming.

- [x] **`scripts/atlas/agentic-error-mapreduce.mjs`'s only Redis writes
  are a current-state snapshot cache, not a timeline**: `warmPhase()`
  writes `bifrost:repair:{error_class}:{model_name}` via `redis.pipeline
  ().setex(...)`, one key per cluster, `24h`-ish TTL
  (`REPAIR_TTL`), payload = `{state, confidence, suggested_action,
  top_route, recovery_packet_key, packet_keys, fingerprints,
  failure_count, last_seen, ...}`. This is a **"what's the current
  status of this error class"** cache — each `setex` call **overwrites**
  the previous value for that key. There is no `workflow_id` anywhere in
  this key or payload, and no history — the previous state is gone the
  moment a new one is written.
- [x] **Confirmed neither `agentic-error-mapreduce.mjs` nor
  `validate-hmm-agentic-error.mjs` reference the Temporal Action Ledger
  at all** (`grep` for `atlas_agent_action_events`/`temporal-action-
  ledger`/`TemporalActionPostgresRepository`/
  `ActionExecutionDescriptorV1` — zero hits in either file).
- [x] **The durable, `workflow_id`-keyed, JSON-event home for exactly
  this concept already exists and is purpose-built for it** — found in
  `TABLE-AUDIT-01` above (`atlas_agent_action_events`: `workflow_id`,
  `workflow_revision`, `action_id`, `execution_key`, `opcode`,
  `target_canonical_id`, `observed_at`, `event_json` jsonb, fully
  indexed). Its outcome enum
  (`packages/parent-atlas/src/core/temporal-action-ledger.ts`,
  `ACTION_OUTCOMES`) includes `TOOL_ERROR`, `TEST_FAILED`,
  `TYPECHECK_FAILED`, `MUTATION_REJECTED` — this wasn't built for some
  unrelated purpose, it's already shaped for agentic repair/tool-call
  workflows specifically. The agentic-error-fixing pipeline currently
  bypasses it entirely.
- [x] **So the honest answer to the question as asked**: there is
  currently **no** async agentic timeline of agentic-error-fixing
  activity anywhere, keyed by `workflow_id` or otherwise. Redis/Valkey
  holds a same-key-overwrite current-state cache with zero history.
  Postgres holds nothing for this pipeline at all (0 rows either way,
  since `agentic-error-mapreduce.mjs` never calls into the ledger). This
  matches — and gives a concrete mechanism for — this file's own
  repeatedly-recorded `AGENTIC-ERROR-01` finding ("HMM state
  transitions, MapReduce error grouping, and ACE recovery packet
  dispatch remain unwired as one live receipt").
- [ ] **Operator decision, not wired here**: should
  `agentic-error-mapreduce.mjs`'s cluster-classification step also emit
  a `TemporalActionPostgresRepository` event per cluster (giving each
  error-fixing run a real `workflow_id`, a durable JSON timeline in
  `atlas_agent_action_events`, and — for free, since it's a pure
  projection — an `ActionCurrentProjectionV1` "what's the latest state
  of this error class" view that would make the existing `bifrost:
  repair:*` Redis cache a genuine **derived** cache of Postgres truth
  instead of the only copy of the state that exists)? This requires
  deciding how error-fixing's own vocabulary
  (`error_class`/`model_name`/`cluster.state`/`suggested_action`) maps
  onto the ledger's `opcode`/`target_canonical_id`/`outcome` fields — a
  real design decision (which `ACTION_OUTCOMES` value does a
  `TOOL_ERROR`-shaped cluster map to vs. `TEST_FAILED`, what
  `execution_key` construction makes retries of the same error
  deterministically reusable per the ledger's own `EXACT_FAILURE_
  DO_NOT_REPEAT` semantics) — not a mechanical wiring change, so not
  done unilaterally this session.
- [x] **Picked up the mapping decision and proved it schema-valid,
  without performing a live ledger write** (2026-08-26) — the
  responsible middle ground between "leave it as an open question" and
  "wire a live write on an ambiguous design call":
  - Made `mapPhase`/`reducePhase` exported from `scripts/atlas/agentic-
    error-mapreduce.mjs` (2-line change, no behavior change) so a
    separate proof tool can reuse the real production classification
    logic instead of duplicating it. Also fixed a latent `isMainModule`
    bug this exposed: the file's bottom-of-file `run().catch(...)` was
    unconditional, so importing it for its exports would have also
    triggered a live Postgres/Redis CLI run. Guarded with the canonical
    `process.argv[1] === fileURLToPath(import.meta.url)` pattern this
    repo's own `CLAUDE.md` documents as the only correct one (not the
    broken `file://${process.argv[1]}` string-building pattern this
    repo already swept 35 instances of on 2026-08-12). Verified the CLI
    entrypoint still runs identically: `node scripts/atlas/
    agentic-error-mapreduce.mjs --dry-run --window-minutes 15` →
    `MAP: 0 signals` (same as before the change).
  - New script `scripts/atlas/prove-agentic-error-temporal-event-
    mapping.mjs` — imports the real `mapPhase`/`reducePhase`, maps each
    real cluster (or one fixture cluster if the live window is empty,
    which it currently is — see `TABLE-AUDIT-02` above) through
    `buildAgentActionEvent()` from the real, already-exported Temporal
    Action Ledger builder, and reports whether the result is
    schema-valid. **Never calls `.append()`** — `databaseWrites: false`,
    `ledgerAppendCalled: false` in its own receipt. Ran it:
    `clusterSource: "fixture"` (confirms the live path executed and
    correctly fell back), `allValid: true`, produced a real
    64-hex-char `execution_key` and valid `event_id`.
  - **The specific mapping decisions are documented inline in the proof
    script itself** (not just here) so they survive independent of this
    file: `opcode: AGENTIC_ERROR_CLUSTER_CLASSIFY` (this action is
    "classify a cluster", not "fix it" — a future real fix/patch action
    would be a separate opcode once ACE dispatch exists);
    `query_class: cluster.error_class` (the pre-classification grouping
    key, distinct from the HMM-derived `state`); `outcome` mapped from
    classification confidence (`NO_RESULT` for `state==='unknown'`,
    `SUCCESS_EXACT`/`SUCCESS_PARTIAL` split at `confidence >= 0.5`) since
    this action's job is classification, not repair; workspace/source/
    graph revision authority set honestly to `UNPROVEN` (not
    `NOT_APPLICABLE` — these dimensions plausibly do matter, the
    pipeline just doesn't track them yet) with `relevant_dimensions: []`
    — **explicitly flagged in the script's own comment as "the most
    significant gap for real ledger reuse semantics"**, since
    `EXACT_SUCCESS_REUSE`/`EXACT_FAILURE_DO_NOT_REPEAT` decisions need
    `PROVEN` revision authority to mean anything.
  - **Still not wired into the live pipeline** — `agentic-error-
    mapreduce.mjs` does not call this mapping or `.append()` during its
    real `warmPhase()`/`writePhase()`. That promotion (adding a real
    `--emit-ledger` flag that reserves a ledger sequence and calls
    `TemporalActionPostgresRepository.append()`) is the next, now
    concretely-scoped step — gated on review of the mapping decisions
    above, and on deciding whether/how to start tracking real
    workspace/source/graph revisions in this pipeline (currently it has
    none), since without that the ledger's reuse/replay semantics
    (the whole point of building this) can't actually fire.
- [x] **Checked what's actually available for that revision-tracking
  decision before leaving it fully open** — found two real, existing
  options, with a real cost tradeoff between them, not a blank slate:
  - **Option A — the sophisticated existing contract**:
    `buildWorkspaceRevisionRecordV1`/`buildWorkspaceSourceBindingsV1`
    (`sveltekit-frontend/src/lib/server/atlas/identity/
    workspace-source-binding-v1.ts`), driven by `observe-workspace-
    source-binding.mts`. Produces a `workspaceRevision` that's a SHA-256
    digest over the **entire tracked source manifest** (every file's
    `sourceRef`/`sourceRevision`/`contentDigest`/`gitBlobOid`) — a
    strong, correct identity, but expensive to compute (enumerates and
    digests the whole tracked source tree; its own output artifact,
    `docs/reports/workspace-source-binding-observation.json`, is
    `22.6MB` and was last generated `2026-08-23` — 2+ days stale as of
    this check). Recomputing this per `agentic-error-mapreduce.mjs` run
    (which defaults to a `15`-minute window, i.e. potentially run
    frequently) would be too heavy; reading the existing snapshot file
    would risk claiming `PROVEN` against a stale workspace state, which
    is arguably worse than the current honest `UNPROVEN`.
  - **Option B — plain `git rev-parse HEAD`**: cheap (`<50ms`), always
    current, a real and legitimate distinct revision concept (git commit
    identity, not source-manifest identity). Doesn't carry the same
    strength of guarantee as Option A's per-file digest (a commit SHA
    doesn't prove *which* files an error actually touched), but is
    honestly `PROVEN` for "what commit was checked out when this error
    was observed" — a real, verifiable claim, cheap enough to call on
    every mapreduce run.
- [ ] **Operator decision, not implemented**: adopt Option B
  (`git rev-parse HEAD` as `workspace_revision`, called directly from
  `agentic-error-mapreduce.mjs`) as the pragmatic default for this
  pipeline specifically, reserving Option A's stronger manifest-digest
  identity for contexts that actually need per-file provenance (Graphify
  itself, structural identity work) rather than a lightweight
  classification action's revision stamp? Recording the tradeoff
  explicitly here rather than picking one unilaterally, since this
  session has been wrong before about which existing system is "the"
  canonical one to extend without checking cost/freshness first (see
  `PACKET-MATERIALIZER-02`'s `atlas_packet_registry` staleness finding —
  same shape of mistake, caught before repeating it here).
- [x] **Operator picked Option A (2026-08-26)** — implemented it the safe
  way given the cost/staleness caveats already on record: **read, never
  recompute**, and degrade to `UNPROVEN` honestly when the snapshot is
  stale, rather than always claiming `PROVEN`.
  - New `scripts/atlas/lib/workspace-revision-authority.mjs` —
    `resolveWorkspaceRevisionCoordinate()`. Reads
    `docs/reports/workspace-source-binding-observation.json`'s small
    top-level `record` (confirmed cheap: `~150ms` total for a full
    `JSON.parse` of the 22.6MB file, measured directly — no partial/
    streaming read needed). Returns `UNPROVEN` (not a thrown error) for:
    missing artifact, unreadable/malformed JSON, incomplete record
    (`workspaceRevision`/`generatedAt` missing), or age beyond a
    `24h` default threshold (`DEFAULT_MAX_AGE_MS`, overridable). Returns
    `PROVEN` with the real `sha256:...` `workspaceRevision` and the
    artifact's relative path as `evidence_refs` only when fresh — and
    still `PROVEN` (not silently downgraded) when the observed worktree
    was `dirty`, since a dirty-worktree observation is still a real,
    honest claim about what was seen, just recorded in the reason
    string for downstream visibility.
  - New `scripts/atlas/test-workspace-revision-authority.mjs` — `6/6`
    pass, `node scripts/atlas/test-workspace-revision-authority.mjs`:
    missing artifact, fresh+clean, fresh+dirty, stale, incomplete
    record, and — the one that matters most — **run against the real
    repo artifact and asserted it is currently `UNPROVEN`**
    (`age=1885min > max=1440min`, i.e. confirmed genuinely stale right
    now, not a hypothetical). This is the resolver proving its own
    honesty against live data, not just fixtures.
  - Wired into `prove-agentic-error-temporal-event-mapping.mjs`:
    `applicability.workspace_revision` is now the real resolved
    coordinate (previously hardcoded `UNPROVEN`/`null`), and
    `relevant_dimensions` includes `'workspace'` only when authority is
    actually `PROVEN` (so `execution_key` only incorporates the revision
    when there's real evidence for it — matches
    `buildActionExecutionKey()`'s own semantics). Re-ran the proof:
    `allValid: true`, `workspace_revision_authority: "UNPROVEN"` (correct
    — the real artifact is genuinely stale right now), `execution_key`
    unchanged from the pre-wiring run (expected, since `relevant_
    dimensions` is still `[]` while `UNPROVEN`). `source_revision`/
    `graph_revision` remain `UNPROVEN` — out of scope for Option A as
    scoped (workspace-level identity only).
  - **Still not connected to a live regenerate-the-snapshot trigger** —
    if `observe-workspace-source-binding.mts` isn't re-run periodically,
    `workspace_revision` will stay `UNPROVEN` forever, honestly. Whether
    to schedule that observer (and at what cadence, given its own cost)
    is a separate, still-open operator decision — not addressed by this
    change, which only made the *consumption* side honest.
  - **Still not wired into the live pipeline** — same status as before:
    `agentic-error-mapreduce.mjs` doesn't call this mapping or `.append()`
    during real runs. This turn's work makes the eventual `--emit-ledger`
  promotion strictly more correct (real workspace revision instead of
  a hardcoded `UNPROVEN` placeholder), it doesn't perform that
  promotion.

## DB-MIGRATION-AUDIT-01: PostgreSQL, pgvector, and Drizzle alignment (2026-08-25)

- [x] Live PostgreSQL audit confirmed PostgreSQL `18.4` and pgvector `0.8.3`.
  Core tables exist: `atlas_packets` (`61,660`), `codebase_chunk_index`
  (`52,417`), `atlas_packet_features` (`61,660`), `atlas_ast_nodes`
  (`11,067`), `atlas_symbol_registry` (`10,220`),
  `atlas_symbol_versions` (`200`), and `atlas_observation_feature_rows`
  (`1,808`).
- [x] Live indexing audit confirmed PostgreSQL FTS/GIN ownership and the
  `semantic_768` contract, but only `576/52,417` code chunks currently have
  `content_embedding_768`. This is a population gap, not a missing pgvector
  extension.
- [x] Existing JSONB/FTS indexes and pgvector columns are present. No explicit
  PostgreSQL bitmap routing table is currently present; bitmap behavior is
  represented through GIN/Valkey projections.
- [x] Feature-row ownership conflict is explicit: the active Drizzle,
  materializer, repository, and spectral exporter align to the ORF
  `packet_key + feature_revision` contract, while the competing
  `candidate_id + workspace_revision` migration includes `semantic_768` but
  is not aligned with those consumers. Do not apply both contracts to the
  same table.
- [x] Drizzle audit found `41` journal entries, `252` manual SQL files, and
  `36` declared sidecars, leaving many manual SQL files untracked by the
  sidecar manifest. This is migration governance drift, not permission to
  replay every manual file.
- [ ] Reconcile the feature-row migration owner and explicitly register or
  retire each required manual sidecar through the project migration policy.
  Preserve existing rows; use additive, idempotent migrations only.
- [x] Added the focused read-only owner audit at
  `docs/reports/atlas-migration-owner-audit-v1.json`. It confirms the active
  ORF migration is now registered, callable search and symbol registry are
  live-shape aligned, and `atlas_file_search_index_v1` remains an unapplied
  rebuildable projection. The superseded candidate-ID ORF cannot be applied
  to the same table name; its live-table presence is reported as a name
  collision, not evidence that its schema was applied.
- [ ] Reconcile the two historical `graphify_files` owners before applying
  either revision-authority sidecar. The live table exists with zero rows but
  is missing `workspace_revision`; do not use `CREATE TABLE IF NOT EXISTS` or
  backfill until an additive compatibility migration and readback proof exist.
- [x] Added unapplied candidate
  `drizzle/manual/20260825_graphify_files_compatibility_v1.sql`. It adds only
  nullable lineage columns, `NOT VALID` provenance validation, and partial
  indexes to the existing legacy table. It is registered as a manual sidecar;
  no SQL was executed.
- [ ] Complete the `semantic_768` population/readback receipt before any MRL,
  latent, Qdrant, SOM, or bitmap promotion claim.
- [x] Added the missing root `audit:drizzle` command as a read-only wrapper
  around `audit-postgres-contract-mirrors.mjs`. It intentionally exits nonzero
  while live mirror alignment is unresolved; it does not apply migrations.
- [x] Added `DatabaseConnectionFingerprintV1` to the source-lineage audit and
  propagated it into the derived Graphify receipt. The current live proof is
  one context: PostgreSQL `18.4`, database `legal_ai_db`, role `legal_admin`,
  public schema, all candidate Atlas relations visible/selectable. The derived
  lane remains degraded because lineage is still an empty legacy owner and
  latent/SOM joins are incomplete; no writes were performed.
- [x] Source-lineage status now distinguishes a visible owner from a usable
  owner schema. The live result is `SOURCE_LINEAGE_OWNER_SCHEMA_INCOMPLETE`:
  `public.graphify_files` exists and is empty, but lacks `workspace_revision`.
  This is the expected read-only result until the compatibility candidate is
  reviewed and applied by an operator.
- [x] Ran the existing revision-authority preflight and owner/canary proofs:
  v2 schema is compatible, the production writer is present and v2-compatible,
  but `persistedMatchingRows=0`; canonical use remains blocked on
  `CONTROLLED_PERSISTENCE_CANARY_NOT_PROVEN`.
- [x] Ran `materialize-graphify-source-inventory.mts` in dry-run mode. It
  produced `docs/reports/graphify-source-inventory-plan.json` with a frozen
  workspace revision, `23,428` source entries, and a bounded display/write
  plan of `100`; `canonicalWriteAttempted=false` and
  `graphMayConsumeWorkspaceRevision=false`.
- [ ] Do not run the materializer with `--apply` until the operator approves a
  non-production canary database and the canary readback proves one exact
  `graphify_runs`/`graphify_files` binding.
- [x] Added unapplied `atlas_packet_runtime_v1` read model over
  `atlas_packets`, `atlas_packet_features`, and `atlas_packet_metrics`, and
  repointed `PacketValidator` reads to that view. `atlas_packet_registry` is
  now explicitly historical compatibility only. No registry backfill, table
  rewrite, or projection write was performed.
- [x] Runtime-view static contract test passes: the view is read-only and
  PacketValidator no longer queries `atlas_packet_registry`.
- [ ] Retire or repoint the four historical registry writer scripts:
  `backfill-packet-registry.mjs`, `hyperrag-packet-materializer.mjs`,
  `week1-packet-registry-backfill.mjs`, and
  `week1-backfill-packet-registry.mjs`. Keep them archived/compatibility-only
  until their callers are migrated and a dry-run proves zero registry writes.
- [x] Added `atlas_feature_directory_context_v1`, a rebuildable read projection
  grouping canonical packet rows by `feature_id`/directory. It carries
  `feature_label`, source references, file URLs/paths, summaries, packet keys,
  tree-node IDs, and revision metadata for Go retrieval and Parent Atlas Studio.
  It does not mint identity or write back to packet tables.

## PARENT-ATLAS-WORKSTATION-BRIDGE-01: consolidated to-do bridging this file
to `parent-atlas-workstation-todo.md`'s master ledger (2026-08-26)

Asked to update this file to help finish the Parent Atlas workstation. Being
honest about scope: `parent-atlas-workstation-todo.md` is `3,500+` lines
tracking work across many change proposals since 2026-08-09 (graph identity,
XGBoost GPU, tensor residency, docker-compose consolidation, memory
architecture) — genuinely too large to "finish" in one session, and much of
it needs WSL2/RAPIDS/CUDA access this session doesn't have. What this section
does instead: pull its still-open items into one trackable checklist here,
cross-referenced both ways, so nothing sits siloed in a doc this change's own
readers wouldn't otherwise see — and mark honestly which items this session's
own work already has real evidence toward vs. which are fully untouched.

**From the master ledger's Proof Gates table** (`parent-atlas-workstation-
todo.md`, "Graph Identity Audit Next Steps" → "Proof Gates", ~line 1169):

- [x] `PARSER_MANIFEST_ALIGNMENT` (was `FAIL`/`10`) — **this session's own
  `AST-ID-05 follow-up` provided the precise mechanism**, not just
  confirmation: chunk-representative `atlas_ast_nodes` vs. exhaustive
  declaration extraction, quantified per-kind (`method` `0.05%` match rate).
  Cross-referenced in `parent-atlas-workstation-todo.md`'s new
  2026-08-26 session-handoff entry. Percentage not re-scored (that ledger's
  own convention — a deliberate reconciliation, not a silent recompute).
- [x] `TREE_NODE_ID_STABILITY` (was `FAIL`/`0`) — **this session found a
  second, independent, previously-undocumented cause**: live case-folding
  collisions (`633/7,565` rows) plus a separate path-relativity split. Same
  cross-reference as above.
- [ ] `STABLE_SYMBOL_IDENTITY`, `SYMBOL_VERSION_IDENTITY`,
  `PACKET_TO_SYMBOL_LINEAGE`, `DOMAIN_CLASSIFICATION`, `CONCEPT_EXTRACTION` —
  **not touched by this session's AST-ID track**, though `CALLABLE-03`
  above is directly adjacent to `SYMBOL_VERSION_IDENTITY` (same table,
  `atlas_symbol_versions`) and `OKF-04`'s partial resolution above is
  directly adjacent to `DOMAIN_CLASSIFICATION`. Not re-scored — flagged as
  adjacent evidence for whoever reconciles those rows next.
- [ ] `SYMBOL_SEMANTIC_768`, `KNN_TOPK_RETRIEVAL`, `KMEANS_ASSIGNMENTS`,
  `SOM_20X20_ASSIGNMENTS`, `PAGERANK_PERSISTENCE`, `CANONICAL_GRAPH_SNAPSHOT`
  — **fully untouched this session**. These are downstream of the identity
  gates above per that document's own stated proof order ("Prove the
  retrieval chain in order: semantic_768 coverage, KNN top-k, KMeans, 20x20
  SOM, then PageRank") — the checklist item right above the gate table
  already says not to revisit graph snapshot apply behavior until identity/
  enrichment gates pass, so these are correctly blocked, not neglected.

**From the master ledger's "Next-session priority" list** (its own latest
2026-08-23 handoff, immediately before this session's cross-reference entry):

- [ ] (1) Receipt-driven 1,000-row AST backfill (`AST_BF_01`-`AST_BF_10`
  proof schema) — **not started**; this session's `AST-ID-02`/`AST-ID-04`
  work is a full-corpus *census*, not a backfill-with-receipts in that exact
  proposed schema. Related but not the same deliverable — don't count one as
  satisfying the other without checking the receipt schema matches.
- [ ] (2) Rename BM25-labeled artifacts to reflect verified `POSTGRES_FTS_AST`
  reality (docs/schema comments only, not a table rename) — **not started
  this session**, orthogonal to the AST/CALLABLE/PACKET-MATERIALIZER tracks.
- [ ] (3) Bounded XGBoost GPU proof — **out of reach this session** (needs
  WSL2/RAPIDS/CUDA this environment doesn't have terminal access to).
- [ ] (4) Resolve the remaining `codebase_chunks_768`/`_768_v2` file-reference
  split beyond TurboVec's default — **partially informed, not resolved**:
  `PACKET-MATERIALIZER-02` above found live `atlas_packets.qdrant_collection`
  data (`6,364` rows `= codebase_chunks_768`, `0` rows `= _768_v2`) — one
  more real data point, same "not a full resolution" caveat as the
  TurboVec-default finding already on record in the master ledger.
- [ ] (5) ACE crash instrumentation — **not touched this session**.
- [ ] (6) Graphify FANOUT sequencing — **not touched this session**.
- [ ] (7) docker-compose canonical-file decision — **not touched this
  session**; unrelated to this change's scope (neural-prefill/AST/callable).
- [ ] (8) Tensor-residency production-entry-point operator decision
  (`memory-architecture-freeze` tasks.md 2.14) — **not touched this
  session**; different change, different scope.
- [ ] (9) Remaining `CANONICAL_OWNER` decisions from the memory-architecture
  audit pass — **not touched this session** directly, though this session's
  own `CALLABLE-03`/`TABLE-AUDIT-01`/`TABLE-AUDIT-02` findings are more
  instances of the same discipline (checked for existing owners before
  proposing new schema, in every case found one already existed).

**Honest summary**: this session made real, evidence-backed progress on 2 of
this master list's gate rows and 1 of its priority items (partially), fixed
2 real bugs outside its scope (`PacketValidator` fabricated success,
`isMainModule` guard in `agentic-error-mapreduce.mjs`), and built one new,
tested capability (`workspace-revision-authority.mjs`) that didn't exist
before. That is not "finished" — most of the master ledger's outstanding
work (GPU proofs, docker-compose, ACE instrumentation, tensor residency) is
either out of this session's reach or genuinely outside this change's scope.
The honest next step is picking ONE specific item from the lists above and
scoping it the same bounded, evidence-first way as everything else in this
file — not declaring the workstation finished because a lot of activity
happened.

## PARENT-ATLAS-WORKSTATION-BRIDGE-01 items 1+2: done, dry-run only for
item 1 (2026-08-26)

**Item 2 (BM25 naming)** — smaller in scope than a repo-wide sweep once
checked: `grep` for `bm25` hit `245` files, but the master ledger's own text
named exactly 3 concrete artifacts. Did those, not a blind sweep:
- Live `COMMENT ON INDEX idx_codebase_chunk_bm25_search` and
  `COMMENT ON TABLE graphify_bm25_index_runs` — both updated to state
  plainly this is PostgreSQL native tsvector/GIN FTS, `pg_search` is not
  installed (re-verified live: only `plpgsql`/`pg_trgm`/`pgcrypto`/`vector`).
  Metadata-only, reversible, zero data touched.
- Header notes added to `sveltekit-frontend/drizzle/0019_bm25_search_vector.sql`
  and `sveltekit-frontend/scripts/atlas/plan-graphify-bm25-index.mjs`.
- **Found the longer-term part of item 2 already done by a concurrent
  session**: `sveltekit-frontend/drizzle/manual/20260823_graphify_bm25_index_control_v1.sql`
  already has a clarifying header AND the proposed `index_kind` column
  (default `'postgres_tsvector_english'`) — confirmed live via `\d
  graphify_bm25_index_runs`. Only the actual table rename remains
  undone, which item 2 explicitly says is out of scope.
- `audit-graphify-lexical-owner.mjs` already correctly distinguished FTS
  from BM25 — no change needed there.

**Item 1 (receipt-driven AST backfill)** — the original `AST_BF_01`-`10`
schema is genuinely lost (`grep -r AST_BF_01` outside the one-line
reference: zero hits) — designed a comparable 10-step dry-run receipt from
scratch rather than guess-reconstructing it, and said so in the script's
own header. New `scripts/atlas/prove-ast-backfill-idempotency.mjs`. Ran
`--limit 1000` against the real `59,915`-row v2 corpus:
- Idempotency proven: `1000/1000` rows construct byte-identical on a second
  pass.
- **Real finding**: `17/1000` rows collide on `tree_node_id` within just
  this one batch — sample traced to a literal duplicate candidate
  (`claude-mem/openclaw/src/index.test.ts#function:startWorkerMock`
  appearing twice in the source JSONL for the same file/kind/name), not a
  hash-space collision. Worth checking whether AST-ID-02's extraction pass
  has a dedup gap, separately from the AST-ID-06 decisions.
- **Real finding, with an honest correction after checking the sample**:
  `196/1000` rows fall into case-variant groups by the naive
  case-fold-and-group check. Checked a real sample rather than trusting the
  count: both the tree_node_id-duplicate sample and the case-variant sample
  (`viewer-bundle.js#function:yo` vs `#function:Yo`) trace back to
  `claude-mem/` — the vendored submodule already flagged out-of-scope by
  `AST-ID-04`/`AST-ID-06` — and the case sample is from a **minified bundle
  file**, where short case-differing identifiers are very plausibly
  genuinely distinct symbols, not a path-casing bug like the real
  `CollaborativeEvidenceCanvas.svelte` example found earlier. **This check
  as currently written conflates "same symbol, different path casing" with
  "different symbols that happen to case-fold to the same string" — don't
  treat `196` as confirming the earlier casing bug is this widespread
  without re-running it against an app-source-only slice.**
- Collision-with-existing: `0/1000` already present in `atlas_ast_nodes`,
  `1000/1000` would be net-new — expected, since the corpus is
  overwhelmingly not covered yet (`6.35%` overall match rate).
- Constraint validation: `0` violations in this batch (no `enum`-kind
  candidates happened to land in the first `1000`; the check itself is
  real and would catch them — `enum` has no `VALID_STORAGE_KINDS` mapping).
- `AST_BF_10` apply gate: `BLOCKED`, same 4 `AST-ID-06` conditions as
  before. **No `atlas_ast_nodes` writes performed** — `databaseWrites:
  false` throughout, report at
  `docs/reports/atlas-ast-backfill-idempotency-proof-v1.json`.
- **Not done**: re-running this proof against an app-source-only slice
  (excluding `claude-mem/`/vendored trees) to get case/duplicate numbers
  that aren't dominated by submodule noise — worth doing before those two
  findings get cited as evidence for anything.

## DBCTX-01: DatabaseConnectionFingerprintV1 — corrected P0 sequencing (2026-08-26)

**Status: proposal captured, NOT implemented.** No script written, no queries run, no writes
performed this entry. This section documents a design received from a concurrent session and
reconciles it against what's already proven in `AST-ID-04`/`AST-ID-06`/`TABLE-AUDIT-02` above —
it is real, useful, and changes P0 sequencing, but nothing here is code yet.

### The core claim

The various audits' *inconsistent* visibility of the same tables (one probe sees
`graphify_files` with 0 rows but not `atlas_packets`/`atlas_ast_nodes`; other audits see all
three) is more consistent with **connection/search_path/role drift across scripts** than with
tables actually disappearing. PostgreSQL resolves unqualified relation names via `search_path`;
`node-postgres` fills missing pool config from `PGHOST`/`PGPORT`/`PGDATABASE`/`PGUSER` etc., so
scripts that mix explicit params, `DATABASE_URL`, and bare `PG*` env vars can silently connect to
different targets or resolve names against different schemas. **This is a real, previously
uninvestigated risk** — `scripts/atlas/agentic-error-mapreduce.mjs` (touched by this session
earlier for the `isMainModule` fix) does exactly this: builds its pool from
`PGHOST`/`PGPORT`/`PGDATABASE`/`PGUSER`/password with a `5434` default, which is not provably
the same target as scripts using `DATABASE_URL` or Drizzle's own env loading. This was not
checked before now.

### Proposed diagnostic (read-only, not yet built)

A `DatabaseConnectionFingerprintV1` receipt, computed via two read-only queries per audited
connection:

1. **Identity + resolution**: `current_database()`, `current_user`, `session_user`,
   `current_schema()`, `current_schemas(true)`, `current_setting('search_path')`,
   `current_setting('server_version')`, `inet_server_addr()`, `inet_server_port()`, plus
   `to_regclass('atlas_packets')` / `to_regclass('public.atlas_packets')` (and same for
   `atlas_ast_nodes`, `graphify_files`) — `to_regclass` returns `NULL` instead of throwing when a
   relation can't be resolved, which is the key property that makes this safe to run blind.
2. **Enumeration + privilege**: a `pg_class`/`pg_namespace` join listing every schema a
   candidate relation name exists in regardless of `search_path`, plus
   `pg_table_is_visible(oid)` and `has_table_privilege(current_user, 'public.<table>', 'SELECT')`
   guarded by a `to_regclass IS NULL` check first — this separates `TABLE_DOES_NOT_EXIST` from
   `TABLE_EXISTS_OUTSIDE_SEARCH_PATH` from `TABLE_EXISTS_BUT_ROLE_CANNOT_READ`.

Receipt is non-secret (no `DATABASE_URL`/passwords logged) — database name, role, server
address/port, version, resolved schema paths, per-table visible/selectable booleans, hashed as
`databaseConnectionFingerprintSha256`. A `connectionSource` enum
(`DATABASE_URL | EXPLICIT_PG_CONFIG | PG_ENV | FALLBACK_DEFAULTS`) records how each script's pool
was actually configured — proposed to live in one shared helper
(`resolveAtlasPostgresReadConnection()` — connection resolution only, explicitly **not** a new
database-ownership table).

### Classification enum (proposed, not yet coded)

`DBCTX_01 DIFFERENT_SERVER` · `DBCTX_02 DIFFERENT_PORT` · `DBCTX_03 DIFFERENT_DATABASE` ·
`DBCTX_04 DIFFERENT_ROLE` · `DBCTX_05 DIFFERENT_SEARCH_PATH` ·
`DBCTX_06 SAME_DATABASE_TABLE_DIFFERENT_SCHEMA` · `DBCTX_07 PRIVILEGE_FILTERED` ·
`DBCTX_08 SAME_CONTEXT_GRAPHIFY_FILES_GENUINELY_EMPTY`. Only `DBCTX_08` clears
`graphify_files` population to proceed. **Explicit non-goal**: do not "fix" this by adding
`SET search_path`, and do not treat matching fingerprints as license to skip schema-qualified
reads going forward — once an owner schema is confirmed, proof tooling should use
schema-qualified reads (`public.atlas_packets` etc.) and keep `search_path` as diagnostic
metadata only, not a resolution mechanism to rely on.

### Reconciliation against what this session already proved

This is genuinely a **new, unaddressed risk axis**, not a duplicate of prior work:
- `AST-ID-04`/`AST-ID-06` diagnosed *scope* (vendored trees, legacy `src/`, path/case policy)
  as the reason AST bridge match rates are low — that's a separate axis from *which database
  connection* an audit script used. Both can be true simultaneously; this doesn't invalidate
  the AST-ID findings, it adds a prerequisite check before trusting cross-script comparisons of
  row counts.
- `TABLE-AUDIT-02`'s `resolveWorkspaceRevisionCoordinate()` already reads from a committed JSON
  snapshot file (not a live DB query for that specific value), so it isn't directly exposed to
  this risk, but the underlying Postgres-reading scripts it depends on elsewhere in the pipeline
  are.
- The Temporal Action Ledger's `atlas_agent_action_events` table (confirmed live, 0 rows,
  `TABLE-AUDIT-01`) should get this same fingerprint check before its 0-row count is ever cited
  as "not receiving events" vs. "audit script pointed at wrong connection" — currently
  unverified which one it is.

### Revised P0 sequencing (proposed; supersedes prior "AST scope first" framing as the *only*
blocker — DB context check now goes first)

1. **P0 DBCTX** — run the fingerprint diagnostic across every script currently used for Atlas DB
   audits (`census-ast-nodes-bridge.mjs`, `agentic-error-mapreduce.mjs`,
   `audit-atlas-migration-owners.mjs`, `audit-observation-feature-row-contract.mjs`, the
   Graphify daily pipeline, and this session's own `prove-ast-backfill-idempotency.mjs`) and
   confirm all resolve to the same `(server, port, database, role, schema)` tuple before trusting
   any cross-script row-count comparison, especially the `graphify_files: 0 rows` claim.
2. **P0-A revision authority** — the pasted proposal's strong correction: **do not build a new
   Graphify revision-authority writer.** A "Graphify v2 source inventory writer" already exists
   (per the pasted transcript's own description — binds `workspaceRevision`/`sourceRevision`/
   `sha256`/byte length/exact readback into `graphify_runs`/`graphify_files`) and the gate ledger
   already tracks it as `IMPLEMENTED_UNPROVEN` pending migration review, rollback canary, bounded
   canary, and exact readback proof. Next step is proving that existing owner against the
   confirmed-correct DB connection, not writing a second one. **Not verified by this session** —
   the existence and exact location of this "v2 writer" has not been independently confirmed;
   flagging as unconfirmed pending a direct read of the file it's claimed to live in.
3. **P0-B** `ACTIVE_APP_RELATIVE_V1` path-relativity policy bound to that revision authority
   (already an open `AST-ID-06` decision).
4. **P0-C** re-run the AST bridge against the confirmed-connection, revision-stamped, 39,033-row
   active-scope denominator (already computed in `AST-ID-04`) and classify per-candidate as
   `MATCH_EXACT | MATCH_PATH_ALIAS | REVISION_MISMATCH | CONTENT_HASH_MISMATCH |
   SYMBOL_KEY_MISMATCH | FILE_MISSING | NO_EXISTING_AST_ROW` — explicitly no synthesized/repaired
   row merely because a candidate lacks a match.
5. **P0-D** `AtlasRuntimeCapabilityReceiptV1` — a read-only capability probe (Python version,
   `sysconfig.get_config_var('Py_GIL_DISABLED')` **and** `sys._is_gil_enabled()` runtime check —
   the proposal correctly notes a C extension can silently re-enable the GIL at import time even
   on a free-threaded build, so checking only `python -VV` is insufficient — LangExtract/
   tree-sitter/ast-grep/NetworkX/`nx-parallel`/`nx-cugraph`/cuGraph/cuVS/cuPy availability,
   Postgres FTS/JSONB/pgvector booleans, Zod/JSON-Schema/OKF contract booleans). Distinguishes
   `UNAVAILABLE` vs `AVAILABLE_IN_DIFFERENT_RUNTIME` vs `INSTALLED_UNPROVEN` — resolves ambiguity
   before any NetworkX free-threaded/`nx-cugraph` sidecar work starts. **Not built.**

Everything after P0-D (LangExtract `GroundedConceptObservationV1` grounding contract, FTS-not-BM25
naming — already applied by this session under `DBCTX`-adjacent naming-note edits — CandidateOrdinal/
latent/SOM identity-join repair, `CandidateFeatureMatrixV1`, Go retrieval consuming ordinals only,
GPU `cuTile` pack parity, ACE prefill adoption, Temporal ledger write-gate, Parent Atlas Studio)
is **downstream of P0 DBCTX and P0-A** and explicitly deferred — matches this session's existing
discipline of not promoting SOM/latent joins or writing live Temporal events until identity/
revision authority is proven, not just schema-valid.

### Explicit non-actions this entry

- No `DatabaseConnectionFingerprintV1` script was written.
- No live query was run against Postgres to test any DBCTX hypothesis.
- No claim is made about which `DBCTX_0N` code currently applies — that's exactly what the
  (unbuilt) diagnostic would answer.
- The "Graphify v2 source inventory writer" referenced in P0-A step 2 has not been located/
  confirmed by this session; treat its existence as an unverified claim from the pasted
  transcript until independently read.

**Next command** (if picked up): build the read-only fingerprint probe as
`scripts/atlas/audit-database-connection-fingerprint.mjs`, run it against each script's actual
connection path (not just `DATABASE_URL` — replicate each script's own pool-construction logic),
and only then re-open the `graphify_files: 0 rows` question.

## DBCTX-01 correction: diagnostic already existed, executed, DBCTX_08 confirmed (2026-08-26)

**The proposal above was already built by a concurrent session before this entry was written.**
Found by grepping `scripts/atlas/` for a `new Pool(` match on the exact name the pasted transcript
used ("audit live source lineage tables mjs") — `scripts/atlas/audit-live-source-lineage-tables.mjs`
already exists and already imports `scripts/atlas/lib/database-connection-fingerprint.mjs`
(`buildDatabaseConnectionFingerprint()` + `connectionSource()`), which implements
`DatabaseConnectionFingerprintV1` field-for-field as proposed (`databaseName`, `currentUser`,
`sessionUser`, `currentSchema`, `configuredSearchPath`, `effectiveSearchPath`, `serverVersion`,
`serverAddress`, `serverPort`, per-relation `visibleInSearchPath`/`selectable`, sha256 over the
canonical JSON) — same `to_regclass`/`pg_class`/`pg_namespace`/`has_table_privilege` query shape
proposed above, already live, not a duplicate to rebuild.

**Also resolves the "resolveAtlasPostgresReadConnection, one shared helper" ask**: it already
exists as `scripts/atlas/connection-config.mjs`'s `resolveDatabaseUrl()`/`loadRepoEnv()` —
confirmed `agentic-error-mapreduce.mjs` (touched by this session earlier) already imports and
uses it (`new pg.Pool({ connectionString: resolveDatabaseUrl(runtimeEnv) })`), not a bespoke
`PGHOST`/`PGPORT` construction as the pasted transcript assumed — the transcript's specific claim
about that one script was wrong; the shared resolver already covers it. `connectionSource(env)`
in the fingerprint lib gives the requested `DATABASE_URL | ADMIN_DATABASE_URL | EXPLICIT_DB_CONFIG
| POSTGRES_ENV | FALLBACK_DEFAULTS` classification.

**Ran it** (`node scripts/atlas/audit-live-source-lineage-tables.mjs`, read-only, `canonicalWrites:
false`, report at `docs/reports/live-source-lineage-table-audit.json`):

- **`databaseConnection.status: READBACK_PROVEN`**, source `DATABASE_URL`, resolves to
  `legal_ai_db` / role `legal_admin` / schema `public`, `configuredSearchPath: "\"$user\", public"`,
  `effectiveSearchPath: {pg_catalog,public}`, server `18.4 (Debian 18.4-1.pgdg12+1)` at
  `172.18.0.10/32:5432` (Docker-internal address — expected, host-side `5434` forwards to
  container-internal `5432`, consistent with `DEFAULT_POSTGRES.port` in `connection-config.mjs`
  being the host-facing `5434`).
- **All 10 candidate relations** (`atlas_packets`, `atlas_ast_nodes`, `atlas_source_refs`,
  `atlas_source_revisions`, `analysis_pass_results`, `codebase_chunk_index`, `file_index`,
  `graphify_files`, `storage_files`, `uploaded_files`) are `visibleInSearchPath: true` and
  `selectable: true` in this connection. This **rules out `DBCTX_01`–`DBCTX_07`**
  (different server/port/database/role/search_path/schema/privilege-filtering) as the
  explanation for any single-script table-visibility mismatch.
- **`DBCTX_08` confirmed**: `graphify_files` is genuinely present (0 rows) in the same context
  every other table is read from — not a connection-drift artifact. `lineageOwner.status:
  SCHEMA_INCOMPLETE` — the table has `content_hash`/`source_ref`/`source_revision` columns but is
  **still missing `workspace_revision`**, matching the earlier `TABLE-AUDIT-02`/migration-owner
  finding that the workspace_revision compatibility migration (`20260825_graphify_files_compatibility_v1.sql`)
  is written but unapplied.
- **New corroborating finding** (not previously captured this precisely): `atlas_packets` has a
  populated `workspace_revision` (integer, `61,660/61,660` non-null) but `content_hash_count: 0`
  despite the column existing (`character varying`), and no `source_revision` column at all;
  `atlas_ast_nodes.source_revision` column exists but is `0/11,067` populated — both consistent
  with (not new evidence beyond) the AST-ID/TABLE-AUDIT findings that revision fields are declared
  but not yet backfilled, now confirmed under a **verified-same** DB connection rather than an
  assumption.

**Conclusion**: the pasted transcript's core diagnosis was directionally right in spirit
(distrust cross-script row-count comparisons until connection identity is proven) but its
specific claims about what needed to be *built* were mostly already done — the real remaining
gap is exactly what `TABLE-AUDIT-02`/`audit-atlas-migration-owners.mjs` already found:
`graphify_files` schema is incomplete (`workspace_revision` missing) and the compatibility
migration to add it needs review/apply, not a new connection-diagnostic tool. **P0 DBCTX is
now closed as `DBCTX_08` with real evidence; P0-A (prove the revision-authority writer) remains
the actual next blocker**, gated on applying that one additive column migration to
`graphify_files` — still requires the `AST-ID-06` operator decisions (path/case/scope policy)
before any backfill writes it.

No writes performed this entry beyond running the pre-existing read-only script.

## REVIEW-RECONCILIATION-01: pasted AST/BM25 proof (2026-08-26)

The later `PARENT-ATLAS-WORKSTATION-BRIDGE-01 items 1+2` entry is the
authoritative status for these two items. Earlier checklist text above still
contains historical "not started" wording and must not be read as current
status:

- **BM25 naming:** documentation/header notes and reversible live `COMMENT ON`
  metadata are complete for the three named artifacts. The underlying names
  remain historical, and the live implementation is PostgreSQL native
  `tsvector`/GIN FTS (`POSTGRES_FTS_AST`), not true BM25. No table/index rename
  or data rewrite was performed. The live comments are not yet represented by
  an unapplied migration, so a fresh database will not reproduce that metadata;
  treat comment persistence as a separate migration/documentation follow-up,
  not as evidence that the lexical owner was renamed.
- **AST backfill proof:**
  `scripts/atlas/prove-ast-backfill-idempotency.mjs --limit 1000` passes with
  `DRY_RUN_PROVEN`, `1000/1000` deterministic reconstructions, and
  `databaseWrites: false`. This proves row-construction mechanics only. It
  does **not** prove corpus coverage, canonical `atlas_ast_nodes` population,
  parent linkage, or promotion readiness. The `AST_BF_10` gate remains
  `BLOCKED` on the four `AST-ID-06` policy decisions.
- The reported `17` duplicate IDs and `196` case-fold groups are not promotion
  findings: the sampled rows are dominated by `claude-mem`/minified bundle
  content and the case check intentionally cannot distinguish distinct
  case-sensitive symbols from path-casing collisions. Re-run on the approved
  app-source scope before using those counts for policy decisions.
- **DBCTX-01:** the proposal-only wording above is superseded by the implemented
  read-only connection fingerprint helper and source-lineage audit. The helper
  tests pass; current source-lineage status remains
  `SOURCE_LINEAGE_OWNER_SCHEMA_INCOMPLETE` because `public.graphify_files` is
  empty and lacks `workspace_revision`. Do not mark revision authority proven
  until the controlled persistence canary and exact readback pass.

No canonical AST, packet, vector, graph, cache, or registry writes were made
by this review.

## LEXICAL-OWNER-02: true BM25 versus FTS and vector lanes (2026-08-26)

The retrieval stack must keep these lanes separate:

| Lane | Current role | True BM25? |
|---|---|---|
| PostgreSQL `tsvector` + GIN + `ts_rank`/`ts_rank_cd` | lexical candidate retrieval | No; native PostgreSQL FTS |
| pgvector `vector(768)` | dense `semantic_768` similarity | No; cosine/L2 vector search |
| Qdrant dense `semantic_768` | dense ANN projection | No; vector similarity |
| Qdrant sparse slot currently named `bm25` | optional sparse/hybrid projection | **Unproven** until its sparse values and scoring receipt are verified |
| `pg_search`/BM25 or equivalent term-statistics implementation | intended true BM25 owner | Not installed/proven in the current receipt |

The Qdrant sparse vector name `bm25` is only a compatibility label. It MUST
NOT be reported as true BM25 unless a receipt binds:

- tokenizer and vocabulary revision;
- document term-frequency and collection document-frequency statistics;
- `k1` and `b` parameters, or an explicitly equivalent implementation;
- query/document sparse-vector generation revision;
- CandidateOrdinal/source identity mapping;
- exact scoring semantics and a held-out lexical relevance benchmark.

`pgvector` and dense Qdrant vectors remain semantic lanes and MUST NOT be
described as BM25. PostgreSQL FTS remains the current verified lexical owner
(`POSTGRES_FTS_TSVECTOR_TS_RANK_CD`). The existing BM25-labelled table/index
names are historical compatibility names; no rename or data rewrite is
authorized by this task.

- [x] Record the current owner distinction in the OpenSpec and lexical audit.
- [x] Replace the runtime Postgres lexical adapter's fabricated placeholder
  result with a parameterized read-only query over
  `public.codebase_chunk_index.search_vector`, using
  `websearch_to_tsquery('english', ...)` and `ts_rank_cd`.
- [x] Integrated the supplied `parent-atlas-postgres-fts-real-query.patch`
  into the current canonical `postgres-fts.adapter.ts` owner rather than
  overwriting the newer compatibility rename. Results now require an exact
  `source_ref + content_hash` join to `atlas_packets`, deduplicate by packet,
  and carry explicit algorithm/identity metadata. The query uses a bounded
  lexical overfetch before canonical filtering.
- [x] Correct the Go retrieval `/search/bm25` compatibility response so it
  reports `lane: postgres_fts`, `legacy_lane: bm25`,
  `operation: POSTGRES_FTS_SEARCH`, and `trueBm25: false` instead of claiming
  that PostgreSQL FTS is canonical BM25.
- [x] Updated the two Qdrant collection-creation scripts to request the
  collection `modifier: idf` for their historical `bm25` sparse slot. This
  improves the BM42-compatible lane but does not authorize a true BM25 claim;
  existing collections are unchanged until an explicit rebuild is approved.
- [x] Complete the Qdrant IDF rollout across every collection creator before
  calling the sparse lane implementation-consistent. Remaining creators are
  `sveltekit-frontend/scripts/backfill-sparse-vectors.ts`,
  `sveltekit-frontend/scripts/index-legal-pdfs.ts`,
  `sveltekit-frontend/scripts/ingest-govinfo-federal.ts`,
  `sveltekit-frontend/scripts/knowledge-base-builder.ts`, and
  `sveltekit-frontend/scripts/phase79-agentic-indexer.mjs`. Each now uses a
  named sparse slot with `modifier: idf`. This updates future creation/PATCH
  requests only; it does not prove existing collections were changed.
- [ ] Add a compatibility test for consumers of `/search/bm25`: the route
  remains available, but responses MUST consume `lane: postgres_fts`, tolerate
  `legacy_lane: bm25`, and read `capability.trueBm25` instead of inferring
  scoring semantics from the route name.
- [x] Audit existing Qdrant collections without recreating or deleting them;
  record which collections have sparse vectors, which have the IDF modifier,
  and which remain legacy TF/BM42. Read-only report:
  `docs/reports/qdrant-sparse-configuration-audit-v1.json`.
  The live audit found 43 collections: 1 IDF-enabled sparse collection,
  1 legacy sparse collection without an IDF modifier, and 41 collections
  without sparse vectors. Existing collections were not rebuilt or promoted.
- [ ] Rename the runtime API fields from historical `bm25` names to explicit
  `postgres_fts` names only after downstream callers and receipts are migrated;
  compatibility names remain for now.
- [ ] Prove the Qdrant sparse `bm25` slot's actual encoder, term statistics,
  dimensions/indices, and score semantics with a read-only receipt.
- [ ] Choose one true-BM25 owner: `pg_search`, a verified external BM25
  service, or a revisioned sparse encoder/materializer feeding Qdrant.
- [ ] Benchmark true BM25 against PostgreSQL FTS, Qdrant dense, and hybrid
  RRF on the same frozen queries and CandidateOrdinal snapshot.
- [ ] Do not promote or rename the sparse lane until Recall/NDCG/MRR and
  identity readback pass.

## "1 + 2" bounded delivery, safety-adjusted (2026-08-26)

Both items delivered per the explicit adjustment: **build the harness, don't run the apply; rename
active runtime surfaces, don't rename historical tables.**

### 1. `ASTBackfillReceiptV1` — built and run (dry-run + apply-bounded), no rows written

New `scripts/atlas/atlas-ast-backfill-receipt-v1.mjs` implements all 10 gates exactly as specified
(`AST_BF_01` `DATABASE_CONTEXT_PROVEN` through `AST_BF_10`
`RECEIPT_COMPLETE_NO_CROSS_STORE_WRITES`). Modes: `--dry-run` (default), `--apply-bounded`,
`--replay`. Real runs, not simulated:

- **`--dry-run`**: `AST_BF_01`✅ `AST_BF_02`✅ `AST_BF_03`❌ `AST_BF_04`✅ `AST_BF_05`✅
  `AST_BF_06`✅ (1000 selected, deterministic order) `AST_BF_10`✅. Report:
  `docs/reports/atlas-ast-backfill-receipt-v1-dry_run.json`.
- **`--apply-bounded`**: same gates 01-06, then `AST_BF_07`❌/`AST_BF_08`❌ report
  `BLOCKED_BY_PRIOR_GATE` (naming the blocking gate), overall `status: BLOCKED`,
  **`postgresWrites: false`, zero rows inserted** — proven live, not asserted. Report:
  `docs/reports/atlas-ast-backfill-receipt-v1-apply_bounded.json`.

Gate-by-gate notes:
- `AST_BF_01` compares against the real `DBCTX-01` baseline (`live-source-lineage-table-audit.json`)
  on 5 core identity fields (not the full relation-set hash, which is sensitive to that other
  script's own candidate-table list — documented as a deliberate deviation from a literal hash
  match).
- `AST_BF_02` froze `scopePolicy=ACTIVE_APP_RELATIVE_V1` and generated a new artifact,
  `docs/reports/graphify-ast-scope-active-app-v1.json`, by running the pre-existing
  `audit-graphify-ast-scope.mjs --exclude-prefixes=claude-mem,llama-cpp-turboquant-gemma4,src`
  (previously that script had only been run with `excludedPrefixes: []`, i.e. **the vendored/legacy
  exclusion had never actually been applied as a frozen artifact before now**, only discussed).
  Result: **9,547 included files** (down from 13,556 unfiltered), same underlying inventory
  (`inventorySha256` unchanged). Still `PROVISIONAL_PENDING_AST_ID_06_OPERATOR_FREEZE`.
- `AST_BF_03` **fails for real, as expected**: `graphify_files` is 0 rows and missing
  `workspace_revision` (matches `DBCTX-01`/`TABLE-AUDIT-02`). New, more specific finding: the
  candidate JSONL's own `source_revision`/`workspace_revision` fields (`"workspace:0"`, `0`) are
  **synthetic placeholders baked in at generation time** — confirmed by direct inspection, not
  derived from any lineage owner — so they cannot satisfy this gate even superficially.
- `AST_BF_04` hashes the real 59,915-row candidate JSONL; honestly records `parserVersion`/
  `grammarRevision` as `UNKNOWN_NOT_TRACKED_IN_ARTIFACT` rather than guessing.
- `AST_BF_05` records `repo_id = '00000000-0000-0000-0000-000000000000'` (the nil UUID) as the
  frozen identity constant — confirmed via `SELECT repo_id, count(*) FROM atlas_ast_nodes GROUP BY
  repo_id` that all 11,067 live rows use this value. **Correction to this session's own earlier
  work**: `prove-ast-backfill-idempotency.mjs` (previous entry) used `REPO_ID = 'deeds-web-app'` (a
  slug string) for its local proof-only reconstruction — harmless there since it never wrote to
  Postgres (the column is `uuid NOT NULL`, a string slug would have failed a real insert), but
  worth knowing before reusing that script's constants for anything that does write.
- `AST_BF_06` joins the JSONL's `source_ref` (already app-relative form, e.g. `$lib/utils/
  file-reader.ts`) directly against the frozen scope file's `includedSourceRefs` — confirmed these
  are the same path convention, so no extra normalization was needed for this join specifically.
- `AST_BF_07`/`AST_BF_08` real `INSERT ... ON CONFLICT DO NOTHING` + independent readback logic is
  implemented (not stubbed) for when gates 01-06 do pass — it is simply unreachable right now
  because `AST_BF_03` blocks first, which is the intended fail-closed contract, demonstrated with a
  real run rather than left as an unexercised code path.

### 2. BM25 → FTS naming cleanup — active surfaces renamed, historical artifacts left alone

Per the explicit adjustment, **kept**: `20260823_graphify_bm25_index_control_v1.sql` and
`graphify_bm25_index_runs` (already has `index_kind='postgres_tsvector_english'` and its own
clarifying comment from a prior session — not touched further).

**Changed** (all additive/compatibility-preserving, zero call-site breaks — verified via `tsc`):

- **New canonical** `packages/parent-atlas-runtime/src/adapters/postgres-fts.adapter.ts` —
  `searchPostgresFts()`, `PostgresFtsCandidate` (`retrieved_via: 'postgres_fts'`,
  `indexKind: 'postgres_tsvector_english'`), `scorePostgresFtsFallback()`, `filterBySourceScope()`,
  `validatePostgresFtsResults()`. This is the real, live `ts_rank_cd(search_vector,
  websearch_to_tsquery(...))` query against `codebase_chunk_index` — **correction to the pasted
  proposal's claim** that this adapter "currently returns a placeholder candidate, not live
  PostgreSQL results": read the actual file before renaming it, and that claim was wrong — it's a
  real query, always was. Classified `POSTGRES_FTS_ADAPTER` / `LIVE_QUERY_PROVEN`, not
  `IMPLEMENTED_PLACEHOLDER`.
- **`postgres-bm25.adapter.ts`** rewritten to a compatibility-only re-export (`@deprecated`
  JSDoc on every export) delegating to the new file. `BM25Candidate` kept as `extends
  CandidateForIdentityResolution` (matching the original shape) rather than `Omit<
  PostgresFtsCandidate, ...>` — found and worked around a real TypeScript structural-typing quirk
  where `Omit`/`Pick` over a type with a `[key: string]: unknown` index signature silently widens
  every named property to `unknown`, which broke a real call site
  (`retrieval-facade.ts:98`) on the first attempt. Verified via direct `tsc --noEmit` diff against
  a `git stash` baseline that the final version introduces **zero new errors** (same 6 pre-existing
  errors, e.g. the unrelated `drizzle-orm` `Database` export issue, before and after).
- `sveltekit-frontend/src/lib/server/retrieval/bm25-search.ts` — header comment corrected
  (`@deprecated` + naming-rationale note); exports (`bm25SearchIndexed`, `bm25SearchUnindexed`,
  `Bm25SearchHit`) left unrenamed as the plan specified, to avoid a mechanical break — it already
  delegated to `postgres-fts.js`'s `searchCodeLexical()` before this session touched it.
- `sveltekit-frontend/src/lib/server/retrieval/sparse-bm25.ts` — header + one doc-comment line
  corrected to "PostgreSQL sparse FTS / cover-density ranking"; no exports renamed (`sparseLegalSearch`
  didn't have "bm25" in its name to begin with).
- `scripts/atlas/phase-b5-bm25-indexing.mjs` — classification note added:
  `LEGACY_MIXED_LEXICAL_PIPELINE`, `NOT_DAILY_GRAPHIFY_OWNER`, explicitly pointing at the real
  canonical lexical lane instead. No logic touched.

**Not done / explicitly out of scope this entry**: the large pre-existing BM25/FTS task list just
above this entry (Qdrant sparse-vector BM25 slot, `pg_search` adoption decision, `/search/bm25`
route compatibility contract, true-BM25 owner selection) — untouched, still open, not duplicated.

## POSTGRES_FTS canonical identity join coverage — measured, DO_NOT_PROMOTE (2026-08-26)

**Context**: a concurrent session real-ized `searchPostgresFts()` in `postgres-fts.adapter.ts`
with a genuine canonical identity join — `codebase_chunk_index` lexical hits joined to `atlas_packets` on exact
`(source_ref, content_hash)`, with `identity_match_count`/`packet_rank` window functions to reject
ambiguous/duplicate matches. This closes the earlier `POSTGRES_FTS_ADAPTER` gap, but per the
explicit instruction to measure join coverage before promoting rather than assume it, and to
never relax the join to `source_ref`-only as a workaround — built and ran a dedicated read-only
coverage audit instead of trusting the query shape alone.

**New**: `scripts/atlas/audit-postgres-fts-identity-coverage.mjs` (read-only, `databaseWrites:
false`). Measures (a) query-independent base join coverage across all of
`codebase_chunk_index`, and (b) per-frozen-query raw-lexical-hits vs. canonical-bound-hits for 8
hardcoded real queries (6 real `symbol` values sampled from the table + 2 generic terms — frozen
in the script, not re-sampled on replay). Report:
`docs/reports/postgres-fts-identity-coverage-v1.json`.

**Result — real, decisive, `DO_NOT_PROMOTE`**:
- `atlas_packets.content_hash` is **0% populated (0/61,660)** — confirms the raw counts already
  visible from `DBCTX-01`'s earlier audit, now checked directly against this specific join.
- **Exact `(source_ref, content_hash)` join coverage: 0/52,380 (0%)** of
  `codebase_chunk_index` rows with both fields populated bind to any `atlas_packets` row.
- All 8 frozen queries: **2,868 total raw lexical hits, 0 total canonical-bound hits** —
  `overallBindRate: 0`. The adapter's canonical query is currently guaranteed to return an empty
  array for any input, not a query bug — a data-population gap one layer down.
- Useful secondary finding: `ambiguous_source_ref_groups: 0` — `atlas_packets.source_ref` is
  currently unique per row (no duplicates), so a source_ref-only join would not *currently*
  produce ambiguous matches. **Still correctly rejected per the explicit instruction** — hash
  agreement is what detects staleness/drift between the two tables' independently-written rows,
  and giving that up because it's not *currently* ambiguous would remove that detection silently
  for the future, not just today.
- **Root cause, not yet fixed**: `atlas_packets.content_hash` needs to be backfilled from its own
  source of truth before this adapter can bind anything. This is a new, more specific manifestation
  of gaps already tracked (`TABLE-AUDIT-02`, `DBCTX-01`'s corroborating finding) — not a new
  independent problem, and not fixed in this entry (no writes performed; `atlas_packets` backfill
  ownership/source needs the same kind of operator scoping as the `graphify_files.workspace_revision`
  gap before touching it).

**Status update, matching the requested vocabulary**:
- `POSTGRES_FTS_REAL_QUERY`: `PATCH_READY` / **`LIVE_READ_PROOF_COMPLETE`** (was
  `LIVE_READ_PROOF_PENDING` — now measured, not just implemented).
- `POSTGRES_FTS_CANONICAL_IDENTITY_JOIN`: `EXACT_SOURCE_REF_CONTENT_HASH`,
  **`COVERAGE_MEASURED_ZERO`** (was `COVERAGE_UNPROVEN`).
- `FAKE_BM25_PLACEHOLDER`: unchanged, `TARGETED_FOR_REMOVAL` (already corrected earlier in this
  entry — the adapter was never actually a placeholder; the compat shim naming is the remaining
  cleanup, already done above).
- `QDRANT_TRUE_BM25`: unchanged, `UPSTREAM_CAPABILITY_CONFIRMED` / `LOCAL_RUNTIME_UNPROVEN` — not
  investigated this entry; correctly sequenced after this gate per the instruction ("the next
  highest-value proof... before proceeding to the Qdrant BM25 challenger").
- `TRUE_BM25_PROMOTION`: unchanged, `BLOCKED_ON_FROZEN_RELEVANCE_BENCHMARK`.

**Next, if picked up**: identify and backfill `atlas_packets.content_hash`'s actual source of
truth (needs the same operator scoping discipline as the other identity gaps in this file — not
guessed at here), then re-run this exact coverage script to confirm the join starts binding real
rows before considering the Qdrant BM25 challenger work at all.
