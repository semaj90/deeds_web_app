# Feature Card DuckDB Inspect

Generated: 2026-06-03T04:05:46.019Z

DuckDB: C:\Users\james\AppData\Local\Programs\DuckDB\duckdb.exe
DB: C:\Users\james\Videos\deeds-web-app\sveltekit-frontend\docs\reports\feature-card.duckdb
Exists: yes

Table: feature_cards
Terms table: feature_card_terms
Rows: 19

## Term Counts
- label: 243
- import: 62
- dependency: 40
- module: 33
- networking: 32
- language: 24
- cache: 13
- fallback: 7
- offline: 5

## Top Labels
- feature-map: 19
- lang:TypeScript: 19
- status:active: 12
- net:Postgres: 10
- net:Redis: 10
- store:Postgres: 10
- cache:Redis hot cache: 9
- store:Redis: 9
- net:Qdrant: 6
- store:Qdrant: 5
- module:src/lib/server/atlas: 4
- module:src/lib/server/retrieval: 4
- net:Neo4j: 4
- store:Neo4j: 4
- cluster:72: 3

## Preview
- feature-map:gpu-compute-plane (feature) [rank 95] GPU Compute Plane Integration — resilient GPU-accelerated graph analysis and retrieval fallback coordination. Status active. Service GpuPipeline; stores Redis, Qdrant, Postgres; clusters none; modules src/lib/server/gpu…
- feature-map:hyperrag-fusion (feature) [rank 95] HyperRAG Retrieval (L0-L11) — multi-signal retrieval fusion (Lexical/Topology/Task/Graph). Status active. Service HyperRagFusionService; stores Qdrant, Redis, Neo4j, Postgres; clusters 72, 73, 94, 25, 32, 47, 92, 82, 20…
- feature-map:atlas-reconciliation (feature) [rank 95] Master Atlas Reconciliation — drift detection and automatic manifold repair. Status active. Service ManifoldDriftMonitor; stores Redis, Postgres, Qdrant; clusters none; modules scripts/atlas/detect-manifold-drift.mjs; i…
- feature-map:ace-envelope (feature) [rank 95] ACE / BitFrost Context Cache — low-latency context assembly and budgeting. Status active. Service ContextPacketBudgeter; stores Redis, Postgres; clusters 72, 94; modules src/lib/server/ace; imports ContextPacketBudgeter…
- feature-map:hypergraph-4d (feature) [rank 95] Manifold4 / Hypergraph / Topological Routing — 4D manifold routing (som_x, som_y, semantic_z, activity_w). Status active. Service HypergraphRoutingService; stores Redis, Qdrant; clusters 72, 73; modules src/lib/server/r…
- feature-map:ingestion-layer (feature) [rank 95] Docling / LangExtract / OCR Ingestion — multimodal document and code ingestion pipeline. Status active. Service TopologyProcessor; stores Postgres, Qdrant; clusters 32, 92; modules src/lib/server/db/schema/topology.ts;…
- feature-map:legal-product (feature) [rank 95] Legal-AI Product Layer (KAG/DAG) — high-level legal reasoning and synthesis. Status active. Service Gemma4Synthesizer; stores Neo4j, Postgres; clusters 47; modules src/lib/server/ai, src/lib/server/kag; imports Gemma4Sy…
- feature-map:feature-atlas (feature) [rank 95] Feature Mapping Atlas — central registry for architectural intents and anchors. Status active. Service MasterFeatureMap; stores Postgres; clusters none; modules docs/atlas-index, scripts/atlas, src/lib/server/atlas; imp…
- feature-map:karpathy-blend (feature) [rank 95] Karpathy / GPU Blend / Codebase Indexing — NanoFlow streaming context synthesis and autoencoding. Status active. Service KarpathyBlendOrchestrator; stores Redis; clusters none; modules src/lib/server/ace; imports Karpat…
- feature-map:route-map (feature) [rank 95] Route / Env / Sidecar Map — mapping routes to services, envs, and sidecars. Status active. Service RouteFeatureMap; stores Postgres; clusters none; modules src/lib/server/atlas, src/lib/server/atlas/route-feature-map.ts…