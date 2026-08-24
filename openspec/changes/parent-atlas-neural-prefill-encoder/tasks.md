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
| `latent_128` warm representation | 25% | manifest, adaptive-memory contracts, provisional backfill script | learned post-fan-out encoder and promotion gate |
| `latent_64` hot representation | 30% | vector manifest, simulated Phase 5 bridge, residency tests | trained nested encoder and LibTorch parity |
| LibTorch/RTX inference | 45% | native addon and GPU wrappers exist | model loading, CPU/RTX parity, no-fallback receipt |
| XGBoost ranking/domain head | 55% | trainer, GPU device gate, feature export commands | post-fan-out latent features and live NDCG proof |
| Logistic/NB baselines | 15% | available contracts/capability surfaces | reproducible baseline artifacts and comparison |
| ACE/Valkey/SOM pre-fill | 40% | cache/SOM contracts and packet paths | projection wiring after latent promotion |
| MiniCoil/uniCOIL/SPLADE bi-encoder sparse lane | 10% | discovery terms and sparse adapter surfaces only | model/runtime owner, vocabulary, sparse index, and recall proof |
| Candidate matrix to low-rank shortlist | 50% | deterministic PyTorch nomination plus read-only PostgreSQL ORF receipt for 768? 512 inputs -> 96 CandidateOrdinals | exact semantic_768 rerank, RRF join, and Recall/NDCG quality proof |
| Daily Graphify NLP/AST prefill | 80% | bounded export -> AST identity -> OKF classification -> packet aggregation -> 174-row ORF materialization passes; optional startup preflight fails open with a degraded receipt | full daily adoption and canonical symbol promotion |
| Parameter/artifact lookup | 65% | revision-aware lookup contract and compatibility tests | durable registry adoption and live artifact resolution |
| QLoRA boundary | 55% | read-only gate forbids online training/canonical writes; artifact metadata contract added | verified tournament tuples, checkpoint, and held-out shadow evaluation |

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
- The 512-to-96 shortlist remains a nomination receipt until exact
  `semantic_768` rerank plus labeled Recall/NDCG evidence is attached.

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
  degraded reason if unavailable; no writes.
- [ ] G-02 Canonical symbol promotion: run
  `npm run atlas:features:ast-symbols:review:dry` and report declaration-like
  nomination counts, registry matches, ambiguous keys, and unresolved keys.
  Do not run a promotion/apply command.
- [ ] G-03 Feature-row ownership: run the observation feature migration audit
  and report the single active table/schema, primary key, vector dimensions,
  and conflicting migrations. Do not apply a migration in this step.
- [ ] G-04 Canonical embedding coverage: report populated
  `content_embedding_768`, Qdrant `codebase_chunks_768`, and source-revision
  overlap from the existing read-only ranking diagnostic.
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
