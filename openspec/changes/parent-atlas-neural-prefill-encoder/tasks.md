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
| Qdrant semantic/RFF fan-out | 48% | semantic/signature prefetch and RRF path; bounded RFF writer exists; 384 lane now explicitly marked direct-slice compatibility | live dry-run is `BLOCKED_DIMENSION_CONTRACT`; error lane is `vector(384)`, signature lane is `halfvec(768)` |
| `latent_128` warm representation | 25% | manifest, adaptive-memory contracts, provisional backfill script | learned post-fan-out encoder and promotion gate |
| `latent_64` hot representation | 30% | vector manifest, simulated Phase 5 bridge, residency tests | trained nested encoder and LibTorch parity |
| LibTorch/RTX inference | 45% | native addon and GPU wrappers exist | model loading, CPU/RTX parity, no-fallback receipt |
| XGBoost ranking/domain head | 55% | trainer, GPU device gate, feature export commands | post-fan-out latent features and live NDCG proof |
| Logistic/NB baselines | 15% | available contracts/capability surfaces | reproducible baseline artifacts and comparison |
| ACE/Valkey/SOM pre-fill | 40% | cache/SOM contracts and packet paths | projection wiring after latent promotion |
| MiniCoil/uniCOIL/SPLADE bi-encoder sparse lane | 10% | discovery terms and sparse adapter surfaces only | model/runtime owner, vocabulary, sparse index, and recall proof |
| Candidate matrix to low-rank shortlist | 25% | 25-column TypeScript matrix; deterministic PyTorch low-rank nomination primitive | live 512-to-96 receipt joined to RRF candidates and exact-rerank quality proof |

The current trainer inventory distinguishes configuration from executable
ownership: Quaterion is selectable in the agent trainer schema and test
fixtures, but no installed Quaterion package, trained artifact, or serving
receipt has been found. AdamW/`weight_decay` is already owned by the Python
autoencoder. XGBoost ranking is an existing contract/trainer direction, but a
live qid-grouped LambdaMART receipt is not yet proven.

**Overall weighted readiness: approximately 39%.** This is not a claim that
39% of production traffic is covered. Native EmbeddingGemma MRL is now the
first compact-representation proof path; the learned, revisioned encoder and
post-fan-out projection remain challenger work.

Latest live gate: `docs/reports/graphify-rff-embedding-backfill-v1.json`
reported `BLOCKED_DIMENSION_CONTRACT` for a read-only limit-64 run on
2026-08-24. No rows or projections were written. The RFF contract must be
reconciled before `latent_128` can be promoted after fan-out. A separate legacy
Phase 1 dry-run reached Ollama and generated a 256-row sample, but its source
still targets the legacy 384-dimensional schema; this is execution evidence,
not a successful write or 768 migration.

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
| Low-rank nomination | `python/atlas_compute/low_rank.py` | CREATED + unit-proven | live `SAMPLE_CANDIDATES` receipt with 512 -> 96 ordinals |
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
- [ ] NE-23B Add a query/candidate representation compatibility gate covering
  model revision, `QUERY`/`DOCUMENT` encoder roles, representation family,
  output dimension, normalization, and metric.
- [ ] NE-23C Require MRL query/candidate pairs to use the same EmbeddingGemma
  revision, task roles, MRL prefix dimension, renormalization, and metric;
  require learned latent pairs to use the same learned projection revision and
  normalization.
- [ ] NE-23D Add a bounded `SAMPLE_CANDIDATES` proof using the existing
  CandidateFeatureMatrix and a deterministic low-rank row projection. The
  receipt must preserve CandidateOrdinals, record rank/target count/device,
  and explicitly identify the policy as Tang-inspired rather than Tang's
  algorithm.
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
