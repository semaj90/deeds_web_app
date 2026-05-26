# Production Roadmap — SvelteKit 2 + Drizzle-ORM

This to-do list tracks the path to a high-concurrency, byte-stable production deployment of the Deeds Web App and its TRACE AI pipeline.

## Redis 8 Eval Lane

- Opt-in only; the Redis 7 app stack remains the default runtime.
- Start + smoke: `npm run startup:redis8-eval`
- Smoke only: `npm run smoke:redis8-eval`
- TRACE startup opt-in: `$env:ENABLE_REDIS8_EVAL='true'; npm run trace:start`
- OpenCode/Gemma4 hook: `npm run opencode:redis8-eval`

## 🚀 P0 — Production Infrastructure & Seeding
- [ ] **Dependency Realization**: Run `npm install` to materialize `zod-to-json-schema` bridge and `ts-morph` dependencies.
- [ ] **Hypergraph Seeding**: Run `npm run hypergraph:seed` to hydrate Neo4j and Qdrant with the codebase graph.
- [ ] **Atlas Validation**: Run `npm run smoke:atlas` to verify context lookup; dev-server-down runs may skip the HTTP probe.

## 🧩 P1 — Feature Mapping Atlas
- [ ] **Feature Annotation**: Execute `node scripts/features/record-feature-implementation.ts` for all current P0/P1 features.
- [ ] **Activity Monitoring**: Deploy `scripts/activity/log-developer-activity.mjs` as a background watcher (or via cron).
- [ ] **Semantic Consistency**: Implement `context.prefetch_feature_context` MCP tool to use topology coordinates for pre-edit context packing.

## 🛠️ P2 — SvelteKit 2 & Drizzle-ORM Hardening
- [ ] **Drizzle Migrations**: Audit and apply zero-downtime migrations for `feature_implementations` and `error_fingerprints`.
- [ ] **Svelte 5 Runes**: Ensure all new UI components strictly use Svelte 5 runes (`$state`, `$derived`, etc.).
- [ ] **Auth Guarding**: Verify `locals.user` presence on all mission-critical API routes.

## ⚡ P3 — Performance & GPU (8GB VRAM)
- [ ] **Clang Native Bridge**: Validate the LibTorch bridge compilation via Clang/LLVM for production environments.
- [ ] **Batch Reranking**: Enable LibTorch/CUDA async reranking for high-volume retrieval (query vs 5k candidates).
- [ ] **Memory Tracing**: "Autoencode the Loop" — ensure every synthesis run generates a searchable memory trace in Redis/Neo4j.

---

## 📈 Current Status
- **MCP Server**: ✅ Healthy (8788)
- **Error Memory**: ✅ Ingest/Recall verified
- **GraphRAG**: ✅ Registered & Callable
- **Activity Logging**: ✅ Script implemented
- **Feature Recording**: ✅ Script implemented

## 📅 Next Session Target
- Execute `npm install` and `npm run hypergraph:seed`.
- Formally map the **CS Topological Sort** corpus to calibrate Gemma4's semantic understanding.
