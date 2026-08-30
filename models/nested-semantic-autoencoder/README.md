# nested-semantic-autoencoder

**Status**: TRAINED, INDEXED, PARITY-PROVEN | **Live consumers**: NONE | **Canonical**: NO

## TL;DR

A tiny PyTorch model (`768 → 384 → 256`, ~394K encoder params, ~1.5 MB FP32) that compresses the
canonical `semantic_768` (EmbeddingGemma) embedding into a learned, Matryoshka-style nested
representation: `latent_256` (physical bottleneck), with `latent_128`/`latent_64` derived for free
as L2-renormalized prefixes of `latent_256` — no separate weights, no separate storage.

It is **not built on EmbeddingGemma's ONNX model** — it's a fully separate, downstream model that
consumes EmbeddingGemma's *output* as its *input*. EmbeddingGemma's own ONNX model
(`models/embeddinggemma_300m_onnx/model.onnx`) is 291 MB; this model is ~200x smaller.

Both Postgres (`codebase_chunk_index.latent_256`) and Qdrant (`codebase_chunks_latent256`) are
fully backfilled (55,169/55,169 rows/points) and proven: `knn_recall@10` beats the free
`semantic_mrl_256` MRL truncation (0.8957 vs 0.8575), and Qdrant's live HNSW index matches exact
brute-force search at 0.9995 overlap@10 across the full corpus.

**Nothing calls this model or these columns/collections yet.** That is a deliberate, verified
stopping point (see "Why nothing consumes this yet" below), not an oversight.

## Files

| File | Purpose |
|---|---|
| `ae_meta.json` | Full provenance: architecture, checksums, training config, all recorded metrics, receipt paths |
| `python/checkpoints/nested_semantic_autoencoder_v3_full01.pt` | The actual weights (gitignored — `*.pt` is repo-wide ignored per build-artifact policy; this file lives locally, not in git) |
| `python/atlas_compute/latent_autoencoder.py` | Model definition (`NestedSemanticAutoencoder`, `NestedAutoencoderConfig`) |
| `python/train_latent_autoencoder.py` | Training script that produced this checkpoint |
| `python/compare_semantic_representation_recall.py` | The recall-comparison benchmark that justified building this model |
| `python/backfill_latent_256.py` | Postgres backfill (real forward pass, not a prefix truncation) |
| `python/provision_qdrant_latent256.py` | Qdrant collection provisioning + backfill |
| `python/prove_latent256_ann_exact_parity.py` | The ANN-vs-exact parity proof |

Full build history: `openspec/changes/parent-atlas-neural-prefill-encoder/tasks.md`
(search for `latent_256` — six dated sections cover recall comparison → 3-tier retrain →
Postgres migration → Qdrant migration → ANN parity → this packaging step).

## Architecture

```
semantic_768 (EmbeddingGemma output, L2-normalized)
  -> Linear(768, 384) -> GELU -> Linear(384, 256) -> LayerNorm(256) -> L2-normalize
  = latent_256                                    [physical bottleneck, this is what's stored]

latent_256[:, :128] -> L2-normalize = latent_128  [free, derived at query time, NOT stored]
latent_128[:, :64]  -> L2-normalize = latent_64   [free, derived at query time, NOT stored]
```

Three decoder heads (`decoder256`, `decoder128`, `decoder64`) exist in the checkpoint but are
**only used during training** to compute reconstruction loss. Inference only needs the encoder
(394,368 of the checkpoint's 1,454,592 total params).

## Loading it

```python
import torch
from atlas_compute.latent_autoencoder import NestedSemanticAutoencoder, NestedAutoencoderConfig

model = NestedSemanticAutoencoder(NestedAutoencoderConfig())
state_dict = torch.load(
    "python/checkpoints/nested_semantic_autoencoder_v3_full01.pt",
    map_location="cpu",  # or "cuda"
    weights_only=True,
)
model.load_state_dict(state_dict)
model.eval()

# semantic_768: torch.Tensor [N, 768], NOT pre-normalized (the model normalizes internally)
latent_256, latent_128, latent_64 = model.encode(semantic_768)
```

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
