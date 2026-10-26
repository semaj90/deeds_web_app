# EmbeddingGemma 2 and Parent Atlas Indexing Audit V1

- status: `REFERENCE_ONLY`
- canonicalAuthority: `false`
- persistentWrites: `0`
- capturedModelWeights: `false`
- reviewedAt: `2026-10-24`

## Official model/API evidence

The local Firecrawl bundle is under `docs/.okf/embeddinggemma2/`: `hf-README.md`,
`hf-model-api.json`, `ollama-library-embeddinggemma.html`, and `crawl-receipt.json`.
Those are documentation and model metadata captures; they do not contain the
multi-gigabyte model weights. The HF API capture identifies
`google/embeddinggemma-2` as `feature-extraction`, with a pinned model revision
recorded in `hf-model-api.json`. Refresh capture checksums before relying on it
for a new experiment.

Google's Sentence Transformers guide documents a 768-dimensional embedding
output and query/document task prompts. Retrieval uses
`task: search result | query: ...` for queries and a titled `title: ... | text:
...` document form. Code retrieval has its own query prompt. The guide supports
`bfloat16` or `float32`; it warns against `float16`. It also documents MRL
truncation, which creates a different vector dimensionality/representation and
requires normalization and a separate evaluation. These instructions are not
proof that the local 300M ONNX, Ollama artifacts, current PostgreSQL vectors, or
Qdrant collections share the same tokenizer, weights, prompt recipe, or
representation revision.

EmbeddingGemma 2 is an embedding/feature-extraction model, not a generative
function-calling model. Use the existing generation/tool owner (Ornith through
the approved runtime) for tool calls; use EmbeddingGemma 2 only to encode text
or supported modalities for retrieval/classification experiments. Do not infer
tool-call support from a Hugging Face Space or wrapper around the model.

Official references:

- https://ai.google.dev/gemma/docs/embeddinggemma/inference-embeddinggemma-with-sentence-transformers
- https://ai.google.dev/gemma/docs/embeddinggemma/model_card_2
- https://huggingface.co/google/embeddinggemma-2
- Firecrawl source captures and checksums: `docs/.okf/embeddinggemma2/crawl-receipt.json`

Local artifact check on 2026-10-24 found the EmbeddingGemma 300M PyTorch
checkpoint at `models/embeddinggemma_300m/model.safetensors` (1,211,486,072
bytes) and the browser ONNX graph at
`sveltekit-frontend/static/embeddinggemma_300m_onnx/model.onnx` (304,859,643
bytes). No local `models/embeddinggemma_2/model.safetensors` was present. The
local 300M files were not proven to match the notebook's pinned Hub revision;
do not treat their presence or the ONNX graph as Gemma 2 or as a compatible
replacement for canonical vectors.

The Poincaré notebook's full synthetic CPU smoke completed with 21 synthetic
classes and 20 synthetic star edges (14/3/3 train/validation/test). It exported
the expected isolated files and marked the manifest `SMOKE_ONLY`, with no model
loaded, no role head, no canonical-store writes, and no production admission.
The adapter's synthetic test MRR was 1.0 versus 0.078 for the random-vector
baseline; this trivial synthetic topology is code-path evidence only and is not
a model-quality result. No GPU execution or real ontology training occurred.
An attempted local EmbeddingGemma 300M inference was stopped before model load:
the workstation reported only 0.54 GiB free physical memory, below the
checkpoint's 1.21 GB file size. This is a resource guard, not a model failure.
Use the notebook's Colab runtime after providing a real reviewed cohort; do not
retry local inference until memory headroom is restored.

## Existing domain/OAKLIB owners

- The PostgreSQL-owned taxonomy is declared by `.okf/domains/atlas-domain-taxonomy.yaml`;
  that YAML is a vocabulary snapshot, not the authority.
- `docs/.okf/schemas/domain-classification-batch-v1.schema.json` defines a
  proposal-only batch. `docs/.okf/schema.yaml` records the runtime taxonomy and
  classifier owners and states that upsert is not implemented.
- `scripts/atlas/export-domain-taxonomy-oaklib-snapshot-v1.mjs` and
  `scripts/atlas/lib/domain-taxonomy-oaklib-snapshot-v1.mjs` export a checksummed,
  noncanonical taxonomy snapshot for OAKLIB lookup. The Python adapter and
  sidecar route return concept candidates, not reviewed subject-predicate-object
  tuples. `python/parent_atlas_ontology/domain_tuple_bridge.py` is a bridge/helper,
  not an admitted tuple writer. Review/admission must remain with the existing
  taxonomy/evidence owner.
- The live 8095 candidate route and its authoritative source configuration were
  not established by this audit. A local Windows route/fixture result is not a
  live sidecar call or production tuple admission.
- The current `.tmp/atlas/domain-review-v3/candidates.jsonl` census contains 150
  rows: 3 have a packet key, 0 have a source revision, and 0 have a reviewed
  group. These are review candidates, not training labels or upsert inputs.
  The supplied 60-row crosswalk receipt is exact-slug-only,
  `REVIEW_REQUIRED`, `mappingsApplied: false`, and `canonicalAuthority: false`.

## Search, indexes, and radix boundary

`docs/.okf/architecture/domain-classification-indexing-implementation-v1.md`
is the implementation owner for reuse-first indexing. It explicitly keeps
classification as proposal-only, `semantic_768` under its existing owner,
SearchRuntime as the single fusion owner, and Postgres AIO/bitmap scans as query
planner/runtime behavior. No schema change, upsert, new index, or canonical
corpus write is authorized by this audit.

The read-only indexing census at
`.tmp/atlas/semantic-atlas-audit/indexing-surfaces-20261024.json` reports
PostgreSQL unavailable because its statement timed out. Its Qdrant census is a
projection inventory only; collection point counts and HNSW configuration do
not prove PostgreSQL parity, vector recipe compatibility, or corpus admission.
Retry the bounded read-only Postgres catalog/query-plan audit before asserting
live PostgreSQL 18 index availability or recommending an upsert/index change.

`scripts/atlas/ace-radix-01/fixture-v1.mjs` packs deterministic ACE residency
sort keys for the CUB `DeviceRadixSort::SortKeys` benchmark. That radix fixture
does not index ontology tuples or domain labels and is not in the classifier or
SearchRuntime production path. Do not introduce radix sorting as a prerequisite
for Postgres GIN/FTS, pgvector, or planner bitmap scans.

PostgreSQL 18's AIO can improve supported I/O operations, including bitmap heap
scans; bitmap index scans combine existing index matches and may require a later
sort. Neither is a user-defined bitmap index. pgvector HNSW/IVFFlat is a separate
semantic retrieval path; compare it against exact search with frozen,
revision-qualified candidates before changing a production representation.

## First blockers and safe next gates

1. Restore a bounded read-only PostgreSQL audit result; record actual version,
   extension, relevant columns/indexes, and representative `EXPLAIN` plans.
2. Review candidate rows and bind them through canonical packet/source identity,
   exact source/workspace revisions, and authorization. Keep missing values
   unresolved; do not derive canonical keys from filenames or labels.
3. Run the grounded mention → OAKLIB candidate → reviewed taxonomy crosswalk on
   one source-qualified fixture. Keep generated tuples proposal-only until
   independent review/admission exists.
4. For EmbeddingGemma 2, run a separate frozen query/document recipe evaluation
   with model and tokenizer revision, prompt policy, dimensions, dtype,
   normalization, and vector checksums. Do not mix its vectors with the existing
   `semantic_768` corpus or index before compatibility is independently proven.
5. Only after reviewed labels exist, evaluate a CPU classification baseline
   using source/document-grouped splits. KMeans clusters are exploratory
   unlabeled structure, not ontology truth; XGBoost/cuML are downstream
   challengers. CAGRA is an ANN index, not a decision forest.

## 2026-10-24 bounded read-only recheck

- PostgreSQL reports `18.4 (Debian 18.4-1.pgdg12+1)`, `io_method=worker`, and
  `effective_io_concurrency=16`. Installed vector/search extensions include
  `vector 0.8.3` and `pg_search 0.25.1`; the catalog census found 36 vector
  indexes (34 HNSW, 2 IVFFlat), with no DiskANN/Vamana extension available.
- The read-only catalog read returned 137 columns across the four relevant
  feature/taxonomy tables. The refreshed receipt is
  `docs/reports/pgvector-hnsw-ivfflat-diskann-audit-readonly-v2-20261024.json`.
  Its representative plans are planner-only `EXPLAIN (FORMAT JSON, SETTINGS)`:
  the source-ref sample chose an index-only scan and the semantic top-K sample
  chose the existing HNSW index. The semantic plan used a zero-vector placeholder
  and did not execute; this is not a latency, recall, or AIO throughput benchmark.
- Existing index findings remain diagnostic, not migration instructions:
  canonical HNSW has `ef_construction=64` versus a documented target of 200;
  duplicate HNSW definitions exist on `agent_observations`; and other legacy or
  duplicate IVFFlat/HNSW combinations remain. No DDL or data writes occurred.
- The local EmbeddingGemma 300M PyTorch checkpoint and browser ONNX artifact
  both exist. The browser artifact is
  `sveltekit-frontend/static/embeddinggemma_300m_onnx/model.onnx` (304,859,643
  bytes); the separate Hugging Face checkpoint is
  `models/embeddinggemma_300m/model.safetensors` (1,211,486,072 bytes). Do not
  copy either into the Go service: its current provider contract calls Ollama.
  This task uses the existing EmbeddingGemma 300M experiment; it does not load
  EmbeddingGemma 2. Embedding models produce vectors and do not perform
  generative function/tool calling.
- The draft domain-review JSONL has 150 rows: 3 contain a packet-key field, 0
  contain source or workspace revisions, 0 are reviewed, and 0 are canonical.
  Treat even the three packet-key values as unverified input, not identity.
- Windows-local OAKLIB route tests were previously reported passing 13/13, but
  the live `:8095` OpenAPI readback still exposes only
  `/extract/documentation-facts`; the local OAKLIB route is not deployed there.
  A fresh pytest attempt in this turn produced no output before interruption and
  is not counted as a test result. No sidecar restart or network exposure change
  was made.

## Candidate binding correction and verification

- Current source inspection found `bind_domain_review_candidates_v3.py` still
  called an obsolete helper signature and described a PostgreSQL packet-key join
  that the current helper no longer performs. The older
  `domain-calibration-v3-receipt.json` is historical evidence only; it is not a
  reproducible result from the current helper.
- Replaced that runner with a diagnostic-only readback under
  `.tmp/atlas/domain-review-v3/diagnostic-readback-v1/`. It observes local file
  hashes and exact text-span matches but explicitly nulls packet keys, canonical
  IDs, source revisions, and workspace revisions. The 150-row run observed 124
  local hashes and 72 exact spans; it bound zero identities or revisions and
  granted zero canonical authority. The new receipt distinguishes scratch-file
  creation from persistent-store or cache writes.
- Hardened the helper against caller-supplied workspace revisions and canonical
  IDs, preserving those only as `unverified*` values. Focused helper and index
  audit tests pass 10/10. The isolated Windows OAKLIB route suite now passes
  14/14 (three upstream deprecation warnings); this verifies the local route
  fixture, not the live `:8095` process. Live OpenAPI still lists only
  `/extract/documentation-facts`.
- The exact 72 spans are local byte/text observations, not authorization or
  admitted source revisions. A reviewed ontology tuple, authenticated source
  grant, and canonical indexing path remain unavailable; do not promote these
  candidates.
- Follow-up validation resolved the earlier silent pytest startup: isolated
  OAKLIB route tests pass 14/14 on Windows Python 3.13. The first whitespace
  scan used an incorrectly escaped pattern and produced false positives; a
  corrected byte-level check found no trailing whitespace in the changed code.

