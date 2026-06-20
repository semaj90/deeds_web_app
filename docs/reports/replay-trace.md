# Replay Breadth Benchmark Report

Generated at: 2026-06-20T16:33:57.116Z

## Summary Statistics

| Metric | Value |
|---|---|
| Total Queries Run | 50 |
| Successful Queries | 50 |
| Failed Queries | 0 |
| Cache Hits (Bitfrost Warm) | 10 |
| Total Packets Retrieved | 250 |
| Avg Packets / Query | 5.00 |

## Query Execution Table

| # | Query | Bucket | Cache Hit | Packets | Strategy | Status |
|---|---|---|---|---|---|---|
| 1 | `where is Redis Valkey cache config wired?` | golden | ❌ NO | 5 | fusion | ✅ PASS |
| 2 | `how is SeaweedFS filer configured for S3 gateway?` | golden | ❌ NO | 5 | fusion | ✅ PASS |
| 3 | `where is the LibTorch N-API addon defined?` | golden | ❌ NO | 5 | fusion | ✅ PASS |
| 4 | `where are the Drizzle schema files located?` | golden | ❌ NO | 5 | fusion | ✅ PASS |
| 5 | `what port is reserved for SeaweedFS Filer?` | golden | ❌ NO | 5 | fusion | ✅ PASS |
| 6 | `how is the LangGraph planning graph structured?` | golden | ❌ NO | 5 | fusion | ✅ PASS |
| 7 | `where is the Postgres database connection pool initialized?` | golden | ❌ NO | 5 | fusion | ✅ PASS |
| 8 | `how does the system handle schema migration sidecars?` | golden | ❌ NO | 5 | fusion | ✅ PASS |
| 9 | `what is the default collection name for Qdrant semantic search?` | golden | ❌ NO | 5 | fusion | ✅ PASS |
| 10 | `how is the GPU compute worker smoke test runner executed?` | golden | ❌ NO | 5 | fusion | ✅ PASS |
| 11 | `where is Redis Valkey cache config wired?` | cache-hit | ✅ YES | 5 | fusion | ✅ PASS |
| 12 | `how is SeaweedFS filer configured for S3 gateway?` | cache-hit | ✅ YES | 5 | fusion | ✅ PASS |
| 13 | `where is the LibTorch N-API addon defined?` | cache-hit | ✅ YES | 5 | fusion | ✅ PASS |
| 14 | `where are the Drizzle schema files located?` | cache-hit | ✅ YES | 5 | fusion | ✅ PASS |
| 15 | `what port is reserved for SeaweedFS Filer?` | cache-hit | ✅ YES | 5 | fusion | ✅ PASS |
| 16 | `how is the LangGraph planning graph structured?` | cache-hit | ✅ YES | 5 | fusion | ✅ PASS |
| 17 | `where is the Postgres database connection pool initialized?` | cache-hit | ✅ YES | 5 | fusion | ✅ PASS |
| 18 | `how does the system handle schema migration sidecars?` | cache-hit | ✅ YES | 5 | fusion | ✅ PASS |
| 19 | `what is the default collection name for Qdrant semantic search?` | cache-hit | ✅ YES | 5 | fusion | ✅ PASS |
| 20 | `how is the GPU compute worker smoke test runner executed?` | cache-hit | ✅ YES | 5 | fusion | ✅ PASS |
| 21 | `which files depend on the database schema client?` | graph-expansion | ❌ NO | 5 | fusion | ✅ PASS |
| 22 | `what is the relationship between atlas_packets and concept_records?` | graph-expansion | ❌ NO | 5 | fusion | ✅ PASS |
| 23 | `how are the error clusters linked to route health metrics?` | graph-expansion | ❌ NO | 5 | fusion | ✅ PASS |
| 24 | `which modules import the OpenAI facade or sidecar router?` | graph-expansion | ❌ NO | 5 | fusion | ✅ PASS |
| 25 | `show imports and dependents of the retrieval recorder` | graph-expansion | ❌ NO | 5 | fusion | ✅ PASS |
| 26 | `how are codebase embeddings connected to codebase files?` | graph-expansion | ❌ NO | 5 | fusion | ✅ PASS |
| 27 | `what is the link between parent atlas documents and card registry?` | graph-expansion | ❌ NO | 5 | fusion | ✅ PASS |
| 28 | `which components interact with the Redis cache gateway?` | graph-expansion | ❌ NO | 5 | fusion | ✅ PASS |
| 29 | `what calls the N-API autoencoderEncode function?` | graph-expansion | ❌ NO | 5 | fusion | ✅ PASS |
| 30 | `how does the route param guard script communicate with svelte check?` | graph-expansion | ❌ NO | 5 | fusion | ✅ PASS |
| 31 | `how is SDXL image generation service URL defined?` | low-density | ❌ NO | 5 | fusion | ✅ PASS |
| 32 | `where is ibm/granite-docling:258m configured?` | low-density | ❌ NO | 5 | fusion | ✅ PASS |
| 33 | `what is the fallback logic for feature ID placement?` | low-density | ❌ NO | 5 | fusion | ✅ PASS |
| 34 | `where is ComfyUI submit workflow smoke test located?` | low-density | ❌ NO | 5 | fusion | ✅ PASS |
| 35 | `how is the Triton VLM model routing configured?` | low-density | ❌ NO | 5 | fusion | ✅ PASS |
| 36 | `what is the purpose of the orphaned GenerationService gRPC?` | low-density | ❌ NO | 5 | fusion | ✅ PASS |
| 37 | `where is the WebGPU PageRank benchmark defined?` | low-density | ❌ NO | 5 | fusion | ✅ PASS |
| 38 | `how is the ComfyUI client strict check executed?` | low-density | ❌ NO | 5 | fusion | ✅ PASS |
| 39 | `where are the ComfyUI workflow JSON files stored?` | low-density | ❌ NO | 5 | fusion | ✅ PASS |
| 40 | `what is the fallback configuration for RabbitMQ DLQ?` | low-density | ❌ NO | 5 | fusion | ✅ PASS |
| 41 | `audit feature_id coverage in atlas_packets` | kanban-recommendation | ❌ NO | 5 | fusion | ✅ PASS |
| 42 | `how to resolve duplicate RETRIEVAL_GRPC_URL keys in env.server.ts?` | kanban-recommendation | ❌ NO | 5 | fusion | ✅ PASS |
| 43 | `what are the open lanes for Phase 20.6?` | kanban-recommendation | ❌ NO | 5 | fusion | ✅ PASS |
| 44 | `how is the SOM centroid codebook initialized?` | kanban-recommendation | ❌ NO | 5 | fusion | ✅ PASS |
| 45 | `where is the Phase 16 truth-promotion binding implemented?` | kanban-recommendation | ❌ NO | 5 | fusion | ✅ PASS |
| 46 | `how to backfill latent vectors to postgres atlas_packets?` | kanban-recommendation | ❌ NO | 5 | fusion | ✅ PASS |
| 47 | `what is the N-API call signature for autoencoderEncode?` | kanban-recommendation | ❌ NO | 5 | fusion | ✅ PASS |
| 48 | `how to train the SOM 20x20 grid on latent vectors?` | kanban-recommendation | ❌ NO | 5 | fusion | ✅ PASS |
| 49 | `where is the retrieval evaluation times schema barrel export?` | kanban-recommendation | ❌ NO | 5 | fusion | ✅ PASS |
| 50 | `how to run the 10-layer audit CLI tool?` | kanban-recommendation | ❌ NO | 5 | fusion | ✅ PASS |
