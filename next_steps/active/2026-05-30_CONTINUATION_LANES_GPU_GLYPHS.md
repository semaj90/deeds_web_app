# 2026-05-30 — Continuation: G17 Fix → Drizzle Cleanup → GPU Lanes → pg18+Redis+Bitfrost → CHR97

## Mission
Execute 5 follow-ups in order:

1. **G17 localhost violations** — patch `timeline-builder.ts` + `mcp-tool-bridge.ts` to use `ENV.*` getters; confirm WSL2 ↔ Docker bridge respects `opencode` config; reset audit gate to ALL PASS.
2. **Drizzle / Postgres 18 / TypeScript schema cleanup** — introspect live DB, reconcile `userId: uuid()` declarations vs the now-integer reality, capture clean `audit:contracts` baseline.
3. **GPU acceleration for all 9 parent atlas lanes** — wire `tensorrt_bridge.node` into lane extractors that today are pure JS (centroid math, edge degree, lane-level cosine).
4. **pg18 + Redis clustering + Bitfrost** — validate co-tenancy in side container; confirm L1/L2 cache + Bitfrost semantic cache don't fight pg18 connection pool.
5. **CHR97 sprite generator + ACE packet injection** — last piece. AlphaGo-style self-play eval to ready data for Unsloth training.
might need gemma4 jailbreaking, pixel tracking bit byte com nibbler, and/or custom reward function engineering to get good training data. Focus on data quality over quantity here. token mapping and reward function design will be critical to get meaningful glyphs that actually improve the lane performance. Start with a small set of high-quality training pairs and iterate from there. using alphago, cpu training like street fighter cpu vs cpu to finish task faster.

6. finish out task, look at nvidia unsloth later, multi head attention, gemma4 jailbreak for better feature extraction, etc. but first get the core pipeline working with GPU acceleration and the CHR97 generator to create a feedback loop for improving the lane features in the parent atlas.

7. mtp drafters, speculative decoding, once the GPU lanes are working and we have a steady stream of training data from the CHR97 generator, we can start experimenting with different model architectures and reward functions to see what produces the best lane-level features for the parent atlas. This will be an iterative process of training, evaluating, and refining until we see a meaningful improvement in lane performance.

8. kanban finish out, opencode project manager to test training worked, goal to create? or do something, requires data, data is ingested, quantized, reduced, semantically understood, indexed, retrieved, and then used to create training pairs for a custom model that can generate better lane-level features for the parent atlas. this is a full pipeline from raw data to model training, with multiple feedback loops for quality control and iteration. the GPU acceleration will help speed up the feature extraction and similarity calculations, while the CHR97 sprite generator will provide a visual way to evaluate the learned features and their impact on lane performance.
## Scope discipline

- No new directories outside `scripts/atlas/`, `sveltekit-frontend/src/lib/`, and `memory/exports/`.
- No global Drizzle migration without operator approval — only `drizzle-kit introspect` + read-only diff reports.
- GPU work must keep CPU fallback (per existing pattern in `som-clustering-pipeline.mjs`).
- CHR97 layer reuses existing `chr97-builder.ts` + `cartridge-tensor-bridge.ts` — no rewrites.

## Status snapshot at start

- Parent atlas: 9 lanes, 10,748 nodes, 9,400 edges (audit lane wired earlier today)
- CouchDB: 11,136 docs archived
- Redis: 10,732 nodes warmed (24h TTL)
- pg17 dump: 644M validated, restorable on pg18.4
- pg18 side container: running on :5433, pgvector 0.8.2
- 78 glyphs with rewards (heuristic fallback), 20 training pairs generated
- 28-step audit: `allPass=false`, G17 ×2 open

## Execution log

Tracked in this file as each section completes.