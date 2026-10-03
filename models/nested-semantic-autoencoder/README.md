# nested-semantic-autoencoder

**Historical v3 checkpoint**: `768 → 384 → 256` | **Live consumers**: NONE | **Canonical**: NO | **Promotion**: CANDIDATE
**Current candidate definition**: `768 → 512 → 256 → 128`, with `latent_64` derived from `latent_128`; not trained or promoted.

## TL;DR

A historical PyTorch checkpoint (`768 → 384 → 256`, ~394K encoder params, ~1.5 MB FP32) was trained on a historical
768-D embedding column. The old run labels its input `semantic_768`/EmbeddingGemma, but read
`codebase_chunk_index.content_embedding`, not the currently declared canonical
`content_embedding_768`; canonical source/model/tokenizer lineage for that input is not proven.
It produces a learned, Matryoshka-style nested
representation: `latent_256` (physical bottleneck), with `latent_128`/`latent_64` derived for free
as L2-renormalized prefixes of `latent_256` — no separate weights, no separate storage. This is
historical state, not the architecture for future training; do not reuse its 384-D layer/checkpoint
for the current EmbeddingGemma-derived candidate.

The current candidate model definition is `768 → 512 → 256 → 128`; it learns the 128-D bottleneck
separately, derives `latent_64` as a normalized prefix of `latent_128`, and leaves 4-D topology to
its separate revisioned projection. The implementation is code-only until canonical semantic input
writer/provenance is proven and an explicitly approved training run creates a new checkpoint.

It is **not built on EmbeddingGemma's ONNX model** — it's a fully separate, downstream model that
consumes EmbeddingGemma's *output* as its *input*. EmbeddingGemma's own ONNX model
(`models/embeddinggemma_300m_onnx/model.onnx`) is 291 MB; this model is ~200x smaller.

Historical receipts report 55,169 Postgres latent bindings and 55,169 Qdrant points. The recorded
recall and ANN parity results are valid for those historical artifacts, but do not prove their
input was the admitted canonical `semantic_768` cohort, and do not promote the representation.

**Nothing calls this model or these columns/collections yet.** That is a deliberate, verified
stopping point (see "Why nothing consumes this yet" below), not an oversight.

## Files

| File | Purpose |
|---|---|
| `ae_meta.json` | Historical artifact metadata and checksums; input authority remains unproven |
| `python/checkpoints/nested_semantic_autoencoder_v3_full01.pt` | The actual weights (gitignored — `*.pt` is repo-wide ignored per build-artifact policy; this file lives locally, not in git) |
| `python/atlas_compute/latent_autoencoder.py` | Model definition (`NestedSemanticAutoencoder`, `NestedAutoencoderConfig`) |
| `python/train_latent_autoencoder.py` | Current candidate trainer; it did **not** produce the historical v3 checkpoint described above |
| `python/compare_semantic_representation_recall.py` | The recall-comparison benchmark that justified building this model |
| `python/backfill_latent_256.py` | Postgres backfill (real forward pass, not a prefix truncation) |
| `python/provision_qdrant_latent256.py` | Qdrant collection provisioning + backfill |
| `python/prove_latent256_ann_exact_parity.py` | The ANN-vs-exact parity proof |

Full build history: `openspec/changes/parent-atlas-neural-prefill-encoder/tasks.md`
(search for `latent_256` — six dated sections cover recall comparison → 3-tier retrain →
Postgres migration → Qdrant migration → ANN parity → this packaging step).

## Architecture

The current candidate encoder has a 512-wide hidden stage. `semantic_mrl_512` is a different,
independent EmbeddingGemma representation and must not be confused with that hidden stage. Neither
one makes a 512-D autoencoder output. The historical 384-wide checkpoint below remains a separate,
incompatible artifact; it is not the candidate checkpoint.

```
CURRENT CANDIDATE — CODE DEFINITION ONLY; NO TRAINED CHECKPOINT
canonical semantic_768 (EmbeddingGemma, 768-D)
  -> Linear(768, 512) -> GELU                    [internal hidden stage; not persisted]
  -> Linear(512, 256) -> LayerNorm -> L2-normalize
  = latent_256                                    [learned intermediate representation]
  -> Linear(256, 128) -> LayerNorm -> L2-normalize
  = latent_128                                    [learned bottleneck]

latent_128[:, :64]  -> L2-normalize = latent_64   [derived prefix; no additional learned layer]

latent_256 -> separate, revisioned topology projection -> topology_4d
                                                      [not produced by this autoencoder]

HISTORICAL V3 CHECKPOINT — DO NOT LOAD AS THE CURRENT CANDIDATE
semantic_768? (input lineage not proven)
  -> Linear(768, 384) -> GELU -> Linear(384, 256) -> latent_256
```

The candidate implementation has reconstruction heads for training/evaluation; they do not add
dimensions to the emitted latent family. The historical checkpoint has a different parameter ABI
and cannot be loaded into the candidate definition. The 4-D topology result belongs to its own
projection revision and receipt; it must not be inferred from AE dimensionality or checkpoint
metadata.

## Data and projection boundaries

- **Canonical dense input**: EmbeddingGemma `semantic_768` (768 values), owned by PostgreSQL
  `codebase_chunk_index.content_embedding_768`. The 384-D MiniLM cross-encoder is a separate
  reranking role; replacing the dense embedding model does not itself replace that reranker.
- **Qdrant**: a rebuildable mirror of canonical 768-D vectors (`content`) plus revision-qualified
  payload tags. Point IDs remain projection IDs, never packet identity. Qdrant tags, cluster IDs,
  and RFF/error/signature lanes are derived metadata, not canonical source evidence.
- **RFF naming in this repository**: `backfill-graphify-rff-embeddings-768.mjs` creates
  EmbeddingGemma error/signature embeddings in their dedicated columns. It is not a 768→512 random
  Fourier transform and is not an AE stage. Keep its writer/provenance contract separate.
- **KMeans/SOM/topology**: clustering and the 4-D topology coordinates are derived projections
  over an explicitly revisioned input matrix. Cluster/tag values may route or filter retrieval;
  they cannot create identity, alter canonical vectors, or add an independent retrieval vote.
- **Autoencoder candidate**: consumes an exact, frozen, provenance-qualified `semantic_768` input
  cohort. Its outputs are candidate projections until quality evaluation, readback, and explicit
  promotion. No full database copy is required: the raw FP32 matrix is 768 × 4 bytes per row
  (about 49.6 MB for 16,151 rows, before identity/manifest overhead). Do not include source text or
  unrelated database tables in the training snapshot.

## Historical checkpoint note

`nested_semantic_autoencoder_v3_full01.pt` has the old 768→384→256 parameter ABI. Do not load it
with the current `NestedSemanticAutoencoder` definition: those architectures are incompatible, and
the historical source/model/tokenizer lineage is not proven. The current candidate has no trained
checkpoint yet.

## Why nothing consumes this yet

Verified live, not assumed (2026-08-29 audit, recorded in the OpenSpec ledger):

- **Zero TS/JS references** to `latent_256` exist outside this repo's own schema migration
  (`grep -rln "latent_256" sveltekit-frontend/src/` returns one file: `schema-postgres.ts`).
- **The existing TS-side "autoencoder" retrieval lane
  (`src/lib/server/retrieval/autoencoder-compression-pipeline.ts`) is dormant**, not a wiring
  point — its own docstring admits a "sum-pooling MVP" placeholder, and caller-tracing through
  the `$lib/gpu` barrel confirms zero external consumers.
- **The real blocker is query-time inference**: encoding a *fresh query* into `latent_256`
  requires running this PyTorch model at request time. TypeScript can't do that directly. Options
  considered: (a) a new persistent FastAPI sidecar loading this checkpoint, (b) an ONNX export run
  through the existing `src/lib/ai/onnx/` path, (c) candidate-side-only reranking (skip live query
  encoding), (d) defer. **Operator chose (d)** — `:8095` (miniforge sidecar) and `:8090`
  (TurboQuant llama-server) are both already live on the same 8GB RTX 3060 Ti; a third persistent
  GPU-adjacent service is a real VRAM-contention risk, not hypothetical, and this repo's own
  governance rule (`parent-atlas-memory-architecture-freeze/proposal.md`, "vertical spine"
  addendum) explicitly requires that decision be made deliberately, not by default.

## If a FastAPI hosting service is built later

Requirements, for whoever picks this up (not yet built — this is a checklist, not a plan of
record):

1. **Inference**: `FastAPI` + plain `torch.load()` (matching `python/miniforge_nlp_sidecar.py`'s
   existing pattern) — **not Triton**. Triton is reserved in this repo's inference cascade for
   the heavy models (`Triton TensorRT :8000`); this is a sub-millisecond 3-layer MLP, and Triton's
   dynamic-batching multi-model design adds process/VRAM overhead for zero benefit at this scale.
2. **Transport**: plain REST, matching the sibling `:8095` sidecar, not gRPC (gRPC is used
   elsewhere in this repo for `embedding-client.ts`/`retrieval-client.ts` on `:50051`/`:50053`,
   but adding a proto for one simple endpoint isn't worth the maintenance cost here).
3. **Contract**: `POST /encode` — input `{ vectors: number[][] }` (each 768-dim, L2-normalized or
   not, model normalizes internally), output `{ latent_256, latent_128, latent_64: number[][] }`.
   `GET /health` returning `{ checkpoint_revision, device, cuda_available }`.
4. **Metadata/parameter indexing**: register the model in the existing `model_registry` Postgres
   table (`sveltekit-frontend/src/lib/server/db/schema-postgres.ts`) — `backend: 'pytorch'`,
   `capability: 'embedding'`, `embeddingDims: 256`, `healthEndpoint` pointing at the new service's
   `/health`, `metadata` JSONB carrying the same provenance as `ae_meta.json`. This table already
   exists and is exactly designed for this — do not build a parallel registry.
5. **VRAM budget decision**: explicit sign-off needed on whether this shares a GPU process with
   an existing service or runs standalone — given the encoder's ~1.5 MB weight footprint, sharing
   the CUDA context with `miniforge_nlp_sidecar.py` (`:8095`, already PyTorch-capable per its own
   `RESTRUCTURAL_PROVENANCE`/AST tooling) is worth evaluating before adding a fourth GPU process.
6. **ANN retrieval wiring** (separate from #1-5, downstream): once query-time encoding exists,
   `src/lib/server/retrieval/unified-orchestrator.ts` needs an explicit decision on how a
   `latent_256` signal folds into the existing 6-signal blend — a weight-tuning/evaluation task,
   not a mechanical wire-up. Do not silently add a 7th weight without re-evaluating the blend.
