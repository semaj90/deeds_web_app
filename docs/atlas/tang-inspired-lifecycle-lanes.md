# Parent Atlas Tang-Inspired Lifecycle Lanes

This layer reuses the canonical Query Adaptive Sampling owner at:

`sveltekit-frontend/src/lib/server/atlas/retrieval/query-adaptive-sampler.ts`

It does **not** implement Ewin Tang's recommendation theorem. Tang's result assumes a low-rank matrix plus special l2-sampling/query access. Parent Atlas borrows the systems principle: use compact weighted state to prioritize useful work instead of exhaustively materializing every possible downstream action.

## Ownership

| Lane | Tang-inspired role | Existing owner remains |
|---|---|---|
| INDEXING | prioritize expensive enrichment/rebuild work after canonical ingestion | Graphify/indexing owners |
| RERANKING | bound approximate challenger set before exact promotion | retrieval/reranker + exact promotion |
| PREFILL | prioritize evidence/warming candidates | ContextManifest compiler owns prompt admission |
| DECODE | adaptive MTP/speculative draft depth and draft cache tier | llama-server / TensorRT-LLM target verification |
| INFERENCE | prioritize runtime/model/cache residency | NativeComputePlan/GPU lease/runtime owner |
| ACE | hot-residency hints | ACE/BitFrost; cache never increases relevance |
| KANBAN | order already-ready tasks | existing Kanban task identity/promotion/dependency gates |
| WORKFLOW | order already-eligible DAG nodes | workflow/action/authorization/exact-promotion/validation owners |

## Decode / MTP

The decode helper uses observed acceptance, zero-accept streak, context size, batch size, and VRAM headroom to choose a bounded draft length. This is compatible with speculative systems that expose variable draft lengths. Target verification remains canonical; experimental cache codecs such as IsoQuant/TurboQuant/PolarQuant require their own quality receipts before production use.

## ACE / prefill invariant

Tang-inspired sampling can decide what to warm or evaluate first. It cannot decide what enters the prompt. The existing ContextManifest compiler remains the only admission owner, and BitFrost/cache residency remains a cost/latency feature rather than relevance evidence.

## Kanban / workflows

Task/DAG sampling is a scheduling optimization only. A blocked task stays blocked. Missing authorization, exact promotion, dependency completion, or validation gates cannot be bypassed by a high utility score.

## Proof requirements

Before claiming Tang-like complexity improvements, prove the concrete data structure supports the low-rank and l2-sampling/query assumptions required by the theorem. Until then all artifacts and comments must use `Tang-inspired` or `QAS` terminology, never `Tang theorem proven`.
