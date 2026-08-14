# Parent Atlas Query Adaptive Synthesis (QAS)

## Goal
Add a shadow, evidence-preserving query-adaptive synthesis lane that:
1. routes a user query into the existing Parent Atlas domain/SOM topology,
2. activates reusable software heads,
3. builds a bounded query×candidate feature matrix,
4. applies query-conditioned length-squared / low-rank-inspired sampling,
5. promotes selected candidates back to exact canonical evidence,
6. builds an evidence-bearing context manifest,
7. produces and ranks bounded DAG plan candidates,
8. records receipts for offline policy/program learning,
9. feeds only recommendation/residency hints back to ACE/BitFrost.

## Non-goals
- No new canonical identity store.
- No generative reconstruction of source, symbols, provenance, or packet identity.
- No direct mutation of Graphify structural facts from QAS.
- No GRPO/PPO training in the request path.
- No arbitrary base-model parameter stitching.
- No multi-adapter blending until single-adapter selection proves value.
- No replacement of the existing retrieval executor/fusion owner.
- No browser/WebGPU ownership of canonical packet storage.

## Owners
- Graphify: structural facts.
- PostgreSQL: canonical truth / receipts.
- Existing retrieval executor: candidate retrieval/fusion.
- Existing SOM/manifold lane: topology routing.
- Existing GPU bridge: bounded tensor ops where already proven.
- QAS: shadow recommendation, context/program/adapter/file selection.
- ACE/BitFrost: residency/prefetch policy.
- llama.cpp / TRT-LLM: model execution.
- GEPA/DSPy/GRPO: offline experiments only until separately promoted.

## Promotion rule
Approximate selection may choose what to inspect. Every promoted file/packet/symbol must be resolved through the existing exact canonical lookup before entering the final context.
