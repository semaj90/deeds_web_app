# Parent Atlas Autoencoder and Representation Audit

Date: 2026-10-14  
Scope: source and local-artifact audit only. No training, database query, Qdrant request, Redis/Valkey read or write, cache hydration, index operation, or GPU execution was performed.

## Historical result

Keep the 2026-07-07 JSONL as a historical failure; do not rewrite or promote it. It contains 100 rows, 29 with a non-null `packet_key` and 71 without one. Recomputed descriptive summaries are mean coordinate-wise Spearman **0.533615** (range 0.373451–0.697635) and mean reconstruction cosine **0.570602** (range 0.384766–0.730292). The script's documented `>0.85` threshold was not met.

This is not retrieval-quality evidence:

- The benchmark selects rows with `ORDER BY RANDOM()` from legacy `codebase_chunk_index.content_embedding`, not a frozen, revision-qualified query/corpus cohort with relevance judgments.
- `spearmans(embedding, reconstructed)` compares the ranks of 768 coordinates within each individual vector. It does not compare candidate rankings, Recall@K, MRR, or NDCG. The implementation also has no average-rank handling for ties.
- The trainer (`scripts/atlas/train-ae-pytorch.py`) uses `tanh` in all four layers; `scripts/atlas/correlation-benchmark-autoencoder.mjs` uses ReLU hidden layers and no final `tanh`. The archived calculation is therefore not a faithful forward replay of the stated trained model.
- The benchmark's `--dry-run` still connects to Redis and PostgreSQL and reads weights and random rows. It is not a local fixture-only test and was not run in this audit.

## Artifact and owner findings

- `models/autoencoder/ae_meta.json` records a 768→128→64→128→768 model, 9,000 train rows, 1,000 validation rows, 60 epochs, `best_val_loss=0.0007358284494839609`, CUDA, and timestamp `2026-06-19T16:13:04Z`. It does not bind rows to source identities/revisions, a canonical `semantic_768` representation/model revision, a deterministic split/seed, or a dataset checksum.
- The local `training_vectors.npy` header is `(10000, 768)`, little-endian float32, consistent in count with metadata, but has no visible identity/lineage envelope. Checkpoint tensor headers match the declared layer shapes. Shape and timestamp agreement do not prove training against the current canonical cohort.
- The legacy loader writes individual `autoencoder:weights:*` Redis keys. The current SvelteKit loader reads hashes `ace:autoencoder:weights` and `ace:autoencoder:meta`; separate legacy scripts also write the `ace:` family. These are distinct key contracts. No current Redis/Valkey contents or production consumer execution was checked.
- The current Python nested autoencoder is a different candidate architecture (`semantic_768`→512→256→128, normalized nested outputs), not a verified replacement for the legacy 768→128→64 model. The current `ae:train` owner and receipts do not establish that either model is presently promoted or running.
- The declared dense layers contain 214,080 parameters. No checkpoint-to-registry artifact digest or independent live readback was verified.

## GAN-validation status

| Claim | Status | Evidence boundary |
|---|---|---|
| Legacy checkpoint files and metadata exist | `CREATED` | Local files and NPY headers inspected |
| Historical benchmark produced 100 row records | `PROVEN_HISTORICAL_ONLY` | Existing JSONL parsed; not a current replay |
| Historical numeric quality gate passed | `FAIL` | Mean coordinate Spearman 0.533615 is below 0.85 |
| Historical metric proves retrieval ranking | `BLOCKED` | Coordinate-wise metric; random sample; no relevance labels |
| Historical benchmark faithfully replays trained activations | `FAIL` | Trainer uses tanh; benchmark uses ReLU |
| Current `semantic_768` cohort is qualified for AE evaluation | `NOT_VERIFIED` | No live read-only DB/Qdrant lineage audit performed |
| Current AE model/cache is wired and live-proven | `NOT_VERIFIED` | Different key families found; no runtime readback |
| Retraining or promotion is authorized | `NO` | No mutation or training performed |

## Required next gates

1. Preserve the historical benchmark and document its metric/activation defects as interpretation limits, not as a newly computed historical result.
2. Perform a bounded, read-only inventory of canonical PostgreSQL/Qdrant source IDs, source/workspace/representation revisions, model identity, vector checksums, and active aliases; reject rows lacking lineage. Do not use random sampling as a frozen cohort.
3. Establish which checkpoint digest and activation contract, if any, the current artifact registry and cache consumers accept. Inspect cache metadata read-only; do not load, delete, warm, or overwrite weights.
4. Build a separate deterministic CPU evaluator for full `semantic_768`, MRL prefix+renormalization variants, the historical averaging baseline, and the legacy AE only after exact cohort qualification. Keep retrieval judgments/ranking metrics separate from reconstruction/correlation metrics.
5. Require held-out source-group evaluation, exact Top-K oracle parity, cache cold/warm parity, and a versioned promotion receipt before a representation affects retrieval. Keep `semantic_768` canonical and AE outputs advisory until these gates pass.

No OpenSpec task is marked complete by this source/artifact review. No production data, cache, model, vector index, or GPU state changed.

## Current read-only evidence (2026-10-14)

The supplemental machine-readable receipt is `docs/reports/parent-atlas-autoencoder-evaluation-gate-2026-10-14.json`. It records a blocked state, not a promotion result.

- **PostgreSQL:** in a read-only transaction, the live census found 274,465 chunk rows and 219,998 `content_embedding_768` rows. Of those vectors, 219,864 have `source_ref`, but zero have `source_revision`, `workspace_revision`, or `representation_revision`; zero rows satisfy the required complete binding. This blocks a current production evaluation cohort.
- **Qdrant:** metadata-only collection inspection found 328,348 points in `codebase_chunks_768` (named dimensions `content:768`, `error:768`, `signature:768`), 53,380 in the 512 collection, 55,169 in latent-256, and 105,761 in topology-64. There are no active aliases. These are projection counts, not proof of source alignment or canonical row coverage.
- **Valkey:** read-only key metadata found none of the checked current or legacy autoencoder weight/meta/history keys; the legacy prefix scan completed with zero keys. This describes the instant of inspection only; it does not prove no other process, key namespace, or persisted checkpoint can load a model.
- **Embedding model:** the local `embeddinggemma:latest` runtime metadata resolved to digest `sha256:82f094e4c0e19bc4208c692996d4f1ecf14e82a8dee579ee1d2ca1175260058e`, 768-dimensional output, 2,048-token context, 512-token sliding window, and BF16. This is EmbeddingGemma v1 metadata, not evidence that every historical database vector used that immutable digest.
- **Frozen matrix exclusion:** the v4 artifact is byte-frozen and its 55,169×768 matrix checksum matches its manifest, but its source was `codebase_chunk_index.content_embedding` (`halfvec(768)`) and it lacks per-row source/workspace/representation revisions. It is therefore rejected for current production comparison despite the valid artifact checksum.
- **Historical diagnostics:** Session 121 and nested-AE v3 receipts remain diagnostic only. Their reported Recall@K/pairwise-ranking metrics use cohorts without current source/representation revision qualification and must not be presented as production retrieval quality. The checkpoint file digest and model-state digest are distinct digest subjects; the exact file SHA-256 recorded in the JSON receipt is `ac5c069d714bd1b07efdbe5abb1aea993c11b3851d427c508ce76e4eebb616c5`.

### Model width and context clarification

Embedding width and input context length are separate dimensions. The local EmbeddingGemma v1 runtime reports 768 output dimensions and 2K context; Google's v1 model card documents 768D and MRL output sizes 512/256/128. EmbeddingGemma 2 is a different model card/version with an 8K context. `all-MiniLM-L6-v2` outputs 384D; its model card describes training with sequence length 128 while truncating longer inputs at 256 wordpieces, so 128 is not its general runtime truncation limit. Derived `latent_256/128/64` vectors change representation width, not model context. Metadata enrichment and chunking can improve retrieval/context selection but do not enlarge a model's context window. [EmbeddingGemma v1 model card](https://ai.google.dev/gemma/docs/embeddinggemma/model_card) · [EmbeddingGemma 2 model card](https://ai.google.dev/gemma/docs/embeddinggemma/model_card_2?hl=en) · [MiniLM model card](https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2)

### Confirmed versus unproven

**Confirmed:** historical Gate 4 misses its recorded threshold; the evaluator's forward pass differs from the trainer; the evaluator omits explicit normalization verification; the present canonical rows lack required revisions; the frozen historical halfvec snapshot is not a qualified current cohort; the inspected Valkey keys are absent.

**Not established:** that the source data or producer model caused the failure; that MSE alone caused poor retrieval; that checkpoint tensors are corrupt/random; that historical MRL/AE metrics predict current production retrieval; or that the inspected cache namespace covers every consumer.

### Current code-path and admission audit

- `sveltekit-frontend/package.json` maps `ae:train` and `ae:train:dry` to `python/train_latent_autoencoder.py`; the checked OpenSpec/report evidence says the trainer remains blocked on admitted semantic input provenance. Training was not run in this audit.
- The legacy Redis weight loader at `sveltekit-frontend/src/lib/server/gpu/autoencoder-weights.ts` has a hard `NOT_ADMITTED` runtime guard until an immutable checkpoint descriptor and retrieval qualification receipt are approved. Its weight-read methods invoke that guard before reading Redis.
- `python/atlas_neural_decoder_service.py` is a separate candidate transform service. It checks a configured revision string, loads a `weights_only` checkpoint, and computes the file SHA-256 after loading; source inspection found no pre-load comparison to an allowlisted file digest or evaluation-receipt gate. The ACE caller is explicitly opt-in, `SHADOW_READONLY`, disabled by default, and its receipt declares zero canonical writes and zero added retrieval votes. If enabled, its injected feature-cache adapter may read/write Valkey; this audit did not invoke it. No live decoder execution was verified.
- `RepresentationArtifactV1` carries model/checkpoint-related checksum and revision, transformation identity, input/output population digests, and source-authority status, but does not carry an evaluation-receipt reference. Its `assertPromotionReadyRepresentationArtifact` checks family/dimension/input identity and non-canonical authority; a checked test explicitly shows an `UNPROVEN` artifact passes this assertion. Treat it as a structural artifact check, not sufficient retrieval-promotion admission. No production call to this assertion was found in the searched app paths; the revision-qualified wrapper uses it to emit a representation artifact and separately records its run status.
- **Actionable gate:** before any latent representation becomes a production retrieval executor, add/reuse a distinct fail-closed promotion admission that requires `PROVEN` source authority with content revisions, immutable input-model and checkpoint file digests, frozen cohort/split identity, transform/normalization revision, and an independently qualified evaluation receipt. Keep shadow computation separately opt-in and non-promotional.

### Gate status and safe next action

- `HISTORICAL_GATE_4`: **FAILED**, preserved; do not relax its historical threshold.
- `CURRENT_COHORT`: **BLOCKED**; zero live rows have all required revision bindings.
- `CURRENT_MODEL_CACHE`: **PARTIAL**; inspected namespaces absent, broader consumer/load-path audit remains open.
- `CPU_MRL_AE_COMPARISON`: **UNQUALIFIED DIAGNOSTICS EXIST; QUALIFIED EVALUATION NOT RUN**; wait for an independently read-back, immutable, revision-qualified cohort and evaluator provenance.
- `GPU/CAGRA`: **NOT RUN**; not eligible before the CPU oracle and existing GPU lease gates.

No training, GPU execution, checkpoint/cache mutation, Qdrant index operation, or database write occurred. Counts and cache state are point-in-time read-only evidence.

### Validation evidence

- `npm run ae:train:dry` from `sveltekit-frontend`: exit 0, status `TRAINING_BLOCKED`, reason `SEMANTIC_WRITER_AND_ADMITTED_INPUT_PROVENANCE_REQUIRED`; output explicitly reports `databaseRead=false`, `trainingPerformed=false`, and `checkpointWritten=false`. Planned architecture revision is `atlas.latent-ae.768-512-256-128.v2`; input writer/per-row provenance remains `NOT_PROVEN`.
- Static-only canonical writer audit command `node scripts/atlas/audit-semantic-768-writer-ownership-v1.mjs --static-only --output=.tmp/atlas/semantic-768-writer-ownership-static-2026-10-14.json`: exit 0, `OWNER_NOT_PROVEN`; live database census skipped. It finds two static `content_embedding_768` writer candidates: the 15-row lineage backfill and full-corpus backfill. Both source paths explicitly fail closed (`SEMANTIC_768_APPLY_BLOCKED:CANONICAL_WRITER_PROVENANCE_INCOMPLETE` and `SEMANTIC_768_LINEAGE_GATE_BLOCKED`). It also identifies three legacy `content_embedding` writers and 11 `atlas_packets.embedding` candidates. This is a regex-based source census, not proof of runtime reachability.
- `npx vitest run src/lib/server/atlas/tensors/representation-artifact-v1.spec.ts src/lib/server/ai/neural-decoder-client.spec.ts` from `sveltekit-frontend`: exit 0, 2 files and 35 tests passed. These are fixture/mocked contract tests; they do not prove live decoder execution or production admission.
- `npx openspec validate parent-atlas-gpu-graph-vector-substrate --type change --strict`: exit 0.
- Scoped `git diff --check`: exit 0. The checkpoint file SHA-256 independently matches the receipt; no runtime or store writes were performed.

### Path B retrieval-lane reconciliation (2026-10-14)

- `retrieveAllCandidates` calls PostgreSQL BM25, Qdrant dense, exact-symbol, AST, and ripgrep candidates; vector retrieval defaults on. The historical BM42 adapter is not called from this primary path.
- `retrieveQdrant` requests the `dense_768` query embedding and registered 768D collection/vector name, labels results `dense_768`, and attempts canonical chunk hydration. Source wiring does not prove every live result is revision-qualified or resolves to current source bytes.
- `createQdrantBM42Retriever` is intentionally inert and returns an empty result. However, BM42 remains in compatibility types and the fusion lane vocabulary, so an alternate caller can still inject it as a distinct vote. Retire only after a complete caller census and compatibility review.
- Dense executor aliases (`qdrant`, `turbovec`, `cuvs`, `cagra`, and dense-width labels) normalize to one logical `dense` lane. Fusion groups revision-qualified canonical identities per lane and records supporting executors without multiplying that lane's contribution. This is source/test behavior, not live multi-executor parity.
- `embedQueryForLane('dense_384')` rejects the retired lane. Remaining 384 fields/types/tests are compatibility references, not evidence of an active 384 query path. In the reviewed Qdrant dense path, title/summary payload fields are metadata, not separate named-vector votes.
- **Path B status:** lane separation and same-lane dense fusion are **WIRED**; live current-revision identity parity, end-to-end replay, and judged relevance are **NOT PROVEN**. BM42 is **INERT IN PRIMARY PATH / LEGACY SURFACE REMAINS**; 384 is **REJECTED AT QUERY EMBEDDING / LEGACY REFERENCES REMAIN**.
- **Next proof:** after source-lineage recovery, replay a frozen revision-qualified query/candidate set through active lanes; verify canonical IDs and exactly one semantic vote across dense executors; measure Recall@K/MRR/NDCG separately from reconstruction and coordinate-correlation metrics.

### Reconciliation of existing nested-AE comparison receipt (2026-10-13)

- `docs/reports/nested-autoencoder-v2-v3-retrieval-qualification-2026-10-13.json` contains previously reported Top-10 overlap diagnostics: v3 latent-256 `0.8875`, v3 latent-128 `0.8266`, v3 latent-64 `0.7516`, v2 latent-128 `0.8047`, v2 latent-64 `0.7469`, June latent-64 `0.085`, native MRL-512 `0.825`, and MRL-256 `0.713`. Preserve these as diagnostic overlap only; the receipt does not supply independently judged relevance or document the exact overlap computation sufficiently to relabel them as Recall@10.
- The same receipt reports a 55,169-row v4 snapshot with `sourceRevision`, `workspaceRevision`, `sourceDigest`, and `embeddingModelRevision` each populated on `0/55,169` rows; producer `embeddinggemma:latest` is mutable, and the source column is unqualified historical `codebase_chunk_index.content_embedding`. It marks production admission `BLOCKED` and source admission `NOT_PROVEN`.
- The receipt separately gives numerical evidence that 55,169 stored `latent_128` rows match normalized prefixes of `latent_256` at halfvec precision (minimum cosine `0.9999997616`, all within absolute-error threshold `1e-3`). This proves the numeric prefix relationship only; writer, canonical input provenance, and current-source admission remain unresolved.
- **Reconciled status:** prior MRL/AE overlap experiments **WERE REPORTED**, so “comparison not run” alone was too strong. A source-qualified, reproducible CPU evaluation with pinned cohort/model identity and independently grounded relevance **HAS NOT BEEN RUN**. Historical July Gate 4 remains failed; no promotion follows from these diagnostics.
