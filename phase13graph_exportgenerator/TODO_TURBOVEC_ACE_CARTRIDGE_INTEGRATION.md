# TODO: TurboVec Compression + ACE Cartridge Integration
_Last updated: 2026-05-24_
## Goal
Integrate TurboVec/TurboQuant-style compressed embeddings into the existing GraphRAG/KAG/ACE/Bifrost stack **without replacing the canonical 768d embedding truth**.
Core rule:
```text
Do not make compressed vectors the only source of truth.
```
Use:
```text
768d embeddinggemma vectors = canonical truth
TurboVec 2-bit/4-bit packed vectors = fast traversal / prefilter
4D manifold / SOM / autoencoder = topology routing
Redis = hot cartridge/cache layer
Qdrant = semantic vector recall
Postgres JSONB + pgvector = hybrid indexed truth
Bifrost/Gemma4 = final synthesis

## 1. Correct Retrieval Pipeline
```text
text/code/doc chunk
→ embeddinggemma 768d vector
→ normalize vector and store original norm
→ apply shared random orthogonal rotation / fast Hadamard-style rotation
→ Lloyd-Max quantize each rotated coordinate
→ bit-pack to 2-bit or 4-bit payload
→ store norm + packed bytes + rotation seed/version
→ index metadata in Postgres JSONB, Redis, and Qdrant payload
→ use TurboVec for fast candidate traversal
→ rerank with original 768d + graph score + cluster hotness
→ build ACE cartridge
→ TOON packet
→ Bifrost/Gemma4 synthesis
→ synthesis_logs
→ Engram reinforcement
## 2. Never Replace Canonical Embeddings
Keep:
```text
Qdrant/Postgres:
  embedding_768 = canonical semantic truth
Add:
```text
Redis:
  turbovec packed bytes
Postgres JSONB:
  turbovec metadata
Qdrant payload:
  turbovec_ref
  cluster_id
  manifold4
Retrieval rule:
```text
TurboVec = prefilter
Original 768d = rerank / correctness
Graph relations = structure
Cluster hotness = priority
Manifold4 = topology proximity
## 3. Storage Shape
### Postgres JSONB
```json
{
  "embeddingModel": "embeddinggemma",
  "dimension": 768,
  "norm": 1.732,
  "quantizer": "turbovec-4bit",
  "rotationSeed": "rotorquant-v1",
  "packedBytesRef": "redis:turbovec:vec:chunk_123",
  "clusterId": "cluster_kag_12",
  "manifold4": {
    "x": 0.42,
    "y": -0.13,
    "z": 0.78,
    "w": 0.21
  },
  "sourceRef": "src/lib/server/ai/kag-runner.ts#L10-L40"
}
```
### Redis keys
```text
turbovec:vec:{chunkId}             packed bytes
turbovec:norm:{chunkId}            original norm
turbovec:cluster:{clusterId}       member ids
turbovec:meta:{chunkId}            quantizer metadata
ace:cluster:hot                    hot cluster sorted set
ace:packet:{runId}                 final ACE packet
semantic:bifrost:{model}:{prefixHash}:{suffixHash}
llm_output:{queryHash}
summary:cluster:{clusterId}
ace:graph:edges:{nodeId}
### Qdrant payload
```json
{
  "stable_key": "chunk_123",
  "feature_family": "kag",
  "cluster_id": "cluster_kag_12",
  "manifold4": [0.42, -0.13, 0.78, 0.21],
  "turbovec_ref": "redis:turbovec:vec:chunk_123",
  "quantizer": "turbovec-4bit",
  "source_ref": "src/lib/server/ai/kag-runner.ts#L10-L40"
}
## 4. Quaternion / 4D Manifold Rule
Do **not** use quaternion transforms for the 768d TurboVec compression path.
Use:
```text
768d compression:
  random orthogonal rotation / Hadamard-style fast rotation
4D topology:
  quaternion transforms optional for smooth visualization/routing
```
Good uses for quaternion/4D:
```text
WebGPU debug canvas
NES/card cartridge navigation
SOM topology visualization
manifold4 route animation
cluster neighborhood rotation
## 5. CPU / GPU Split
### 11th-gen Intel i7 / AVX2 CPU path
Use CPU first for correctness:
```text
AVX2 bit-packing
packed vector unpacking
approx cosine candidate prefilter
Redis packing/unpacking
SIMD JSON parsing
JSONB metadata preparation
OpenCode/Node scripts
### RTX GPU path later
Use GPU for throughput only:
```text
batch embedding
large matrix scoring
autoencoder 768d → 64d
SOM / k-means
cuGraph / cuML / cuVS sidecar
reranker batches
CUDA graph/stream experiments
custom kernels later
Core rule:
```text
accelerators improve latency, never correctness
## 6. Autoencoder / SOM Layer
Use autoencoder and SOM as topology compression, not semantic truth.
```text
embedding_768
→ autoencoder encode
→ latent64
→ SOM BMU / cluster id
→ manifold4 coordinate
→ cluster summary
Store:
```text
latent64_ref
som_bmu_row
som_bmu_col
cluster_id
manifold4
compression_loss
autoencoder_version
Do not use latent64 alone for final answer correctness.
## 7. Final Retrieval Score
Use blended scoring:
```text
finalScore =
  0.35 * original768Cosine
+ 0.20 * turboVecApproxCosine
+ 0.20 * graphRelationScore
+ 0.15 * clusterHotness
+ 0.10 * manifold4Proximity
If legal/evidence tasks require stricter provenance, increase sourceRef/provenance gating before final synthesis.
## 8. ACE Cartridge / NES Packet
Think of the cartridge as compact runtime context.
Cartridge contains:
```text
selected cluster ids
selected graph edge ids
compressed turbovec refs
canonical 768d refs
sourceRefs
TOON summary
manifold4 coords
cache keys
protocol tags
feature labels
dependency path mapping
Flow:
```text
ACE cartridge
→ Redis hot fetch
→ TOON minify
→ Bifrost prompt cache
→ Gemma4 synthesis
→ synthesis_logs
→ Engram reinforcement
## 9. Postgres / Drizzle Additions
Add JSONB metadata columns or extend existing metadata envelope.
Suggested metadata fields:
```text
embedding_model
embedding_dimension
turbovec_ref
turbovec_norm_ref
quantizer
quantizer_bits
rotation_seed
rotation_version
cluster_id
latent64_ref
som_bmu_row
som_bmu_col
manifold4
compression_loss
autoencoder_version
source_refs
feature_family
protocols
library_dependencies
Add indexes:
```sql
CREATE INDEX IF NOT EXISTS idx_metadata_turbovec_ref
ON documents_atlas_entries USING gin (metadata);

CREATE INDEX IF NOT EXISTS idx_documents_cluster_id
ON documents_atlas_entries (cluster_id);

CREATE INDEX IF NOT EXISTS idx_documents_feature_family
ON documents_atlas_entries (feature_family);

CREATE INDEX IF NOT EXISTS idx_documents_som_bmu
ON documents_atlas_entries (som_bmu_row, som_bmu_col);
```
Adjust names to actual snake_case columns.

## 10. Qdrant / TurboVec Sync
Scripts to create:

```text
scripts/turbovec/compress-embeddinggemma-vectors.mjs
scripts/turbovec/sync-packed-vectors-to-redis.mjs
scripts/qdrant/sync-turbovec-payloads.mjs
scripts/turbovec/smoke-turbovec-prefilter.mjs
Package scripts:
```json
{
  "turbovec:compress": "node scripts/turbovec/compress-embeddinggemma-vectors.mjs",
  "turbovec:redis:sync": "node scripts/turbovec/sync-packed-vectors-to-redis.mjs",
  "qdrant:turbovec:sync": "node scripts/qdrant/sync-turbovec-payloads.mjs",
  "smoke:turbovec": "node scripts/turbovec/smoke-turbovec-prefilter.mjs",
  "phase9:turbovec:readiness": "npm run turbovec:compress && npm run turbovec:redis:sync && npm run qdrant:turbovec:sync && npm run smoke:turbovec"
}
## 11. OpenCode / MCP / Agent Rules
OpenCode got stuck earlier when it tried to execute a missing manifest path.
Add rule to agent command docs:
```text
If manifest is missing:
  1. Use rg first.
  2. Search for generator script.
  3. Confirm exact path exists.
  4. Only then run feature:atlas or graph tasks.
  5. Do not read random guessed paths.
Preferred command logic:
```text
MCP tools first
rg search second
read confirmed paths only
edit minimal target files
run targeted smoke
## 12. LangExtract / Legal / VLM Layer
Use LangExtract for structured extraction and labels.
```text
contract clause extraction
evidence field extraction
sourceRef validation
redaction metadata
intent labels
feature family labels
VLM semantic cache should be separate:
```text
semantic:vlm:{imageHash}
vlm:sourceRef:{imageHash}
vlm:embedding:{imageHash}
Do not mix VLM cache keys with text/code embeddings unless payload clearly declares modality.
## 13. SIMD / AVX2 Bridge
Use AVX2/SIMD for:
```text
bit-pack / unpack
approx dot product
SIMD JSON parsing
packed vector comparison
batch candidate scoring
Expected binary naming rule from earlier Phase 8:
```text
Use existing native target name:
  tensorrt_bridge.node
Do not rename the C++ target unless necessary.
Update JS expectations instead.

## 14. WebGPU Debug Canvas
WebGPU should be a debug/visualization layer first.
Use it for:
```text
4D manifold visualization
cluster movement
NES cartridge view
cache hit animation
routing path maps
Do not make WebGPU required for server-side correctness.
## 15. CUDA Kernel Future Lane
Later only, after CPU path is correct.
CUDA experiments:
```text
batch dot product
autoencoder encode/decode
SOM BMU lookup
k-means centroids
attention scoring
cuGraph/cuvs nearest-neighbor experiments
Do not block Phase 9/10 correctness on CUDA kernels.
## 16. Master Atlas Updates
Update the atlas with task integrations.
Add to master atlas/cards:
```text
TurboVec compression lane
Redis ACE cartridge lane
Manifold4 topology lane
Qdrant payload sync lane
Engram reinforcement lane
Bifrost semantic cache lane
SIMD AVX2 bridge lane
WebGPU debug view lane
CUDA future acceleration lane
```
Each card should include:
```text
featureFamily
sourceRefs
commands
dependencies
cacheKeys
storageTargets
productionStatus
recommendation
## 17. Validation Gates
Smoke commands:
```powershell
npm run phase9:turbovec:readiness
npm run phase8:fortify
npm run prompt:cache:verify
npm run audit:retrieval-comparison
npm run ci:all
Must confirm:
```text
768d vectors still available
TurboVec refs exist in Redis
Qdrant payload has turbovec_ref
Redis packed bytes readable
prefilter returns candidates
final rerank uses original 768d
manifold4 coords present
ACE cartridge contains sourceRefs
Bifrost cache hit works
synthesis_logs records cache layer
Engram reinforcement updates paths/clusters
## 18. Do Not Do
```text
Do not replace 768d embeddings with compressed vectors.
Do not use quaternion transforms for 768d compression.
Do not require GPU for correctness.
Do not let WebGPU become a server dependency.
Do not run feature:atlas until generator paths are confirmed with rg.
Do not drop legacy fields while they still provide hybrid graph signal.
## Immediate Next Steps
```text
1. Add TurboVec metadata fields to atlas/card payloads.
2. Write compress-embeddinggemma-vectors.mjs.
3. Store packed vectors in Redis.
4. Sync Qdrant payload with turbovec_ref + cluster_id + manifold4.
5. Add smoke:turbovec.
6. Update ACE cartridge builder to include turbovec refs.
7. Keep original 768d rerank in place.
8. Update master atlas and feature cards.
```

where is this?
ools, turbovec, next_steps

≡ƒöì Pass 3: Analyzing cyclic import risksΓÇª
≡ƒôª Directory wiki notes ΓåÆ 1221 dirs written to Redis wiki:note:dir:*
≡ƒôä Graph JSON ΓåÆ sveltekit-frontend\docs\graph\codebase-graph.json
≡ƒù║∩╕Å  Codebase map ΓåÆ sveltekit-frontend\docs\graph\codebase-map.md
≡ƒô¥ Graph plan ΓåÆ sveltekit-frontend\docs\graph\codebase-graph.md

Γ£à Fast index complete in 204.5s
   Files: 33753  Dirs: 1221  Routes: 1067  Components: 5341  API handlers: 5523  TODOs: 7700
   G4 auth: 811Γ£à 11Γ¥î  G5 zod: 566Γ£à 1Γ¥î  G15 ssr-unsafe: 0  G20 cyclic: 1
   KV cache: 11811 hit / 21942 miss (35.0% hit rate)  
   Redis wiki:note:dir: 1221 written
   Outputs: docs/graph/codebase-graph.json  docs/graph/codebase-map.md

> yorha-legal-ai-frontend@1.0.0 graphify:deep:ingest
> node scripts/graphify-deep-ingest.mjs

[0.0s] Step 1/2: Running graphify-deep-imports.mjs ΓÇª
Loaded 33753 files from codebase-graph.json
Built 77652 typed edges
Computed 100 neighborhoods
Wrote deep-import-graph.json
Wrote deep-import-edges.jsonl (77652 edges)
Wrote ACE ingest: 3919 records ΓåÆ C:\Users\james\Videos\deeds-web-app\sveltekit-frontend\memory\ingest\pending\graphify_deep_imports_2026-05-25T00-44-23-697Z.jsonl

=== Deep Import Graph Complete ===
Nodes: 33753  Edges: 77652  Resolved: 7614
Top edge types: imports_static:62263, test_covers_file:4214, redis_dependency:3074, imports_dynamic:2246, exports_from:1760
Top hotspot: sveltekit-frontend/tests/helpers/env-ports.ts (fanIn=78)
Output: C:\Users\james\Videos\deeds-web-app\sveltekit-frontend\memory\graphify\deep
[1.0s] Step 1/2: Build complete.
[1.0s] Step 2/2: 1 JSONL file(s) in pending/ ΓÇö calling kag.ingest_memory_directory ΓÇª

ΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉ
  graphify-deep-ingest ΓÇö Pipeline Report
ΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉ

  Build:    complete
  Ingest:   OK (dryRun=false)
  Scanned:  1 file(s) of 1 pending
  Ingested: 7 record(s) ΓåÆ Redis
  Skipped:  3912 (already ingested ΓÇö idempotent)
  Failed:   0
  Moved to processed/: graphify_deep_imports_2026-05-25T00-44-23-697Z.jsonl

  Graph:    33753 nodes, 77652 edges (7614 resolved)
            100 BFS neighborhoods, 848 test-covered files

  Total time: 1.3s
ΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉ


> yorha-legal-ai-frontend@1.0.0 graphify:deep:smoke
> node scripts/smoke-graphify-deep-imports.mjs


=== Smoke: graphify-deep-imports ===

  PASS  G1 - deep-import-graph.json exists with required keys
  PASS  G2 - nodes array has >= 1000 entries with required fields
  PASS  G3 - deep-import-edges.jsonl has >= 1000 lines
  PASS  G4 - resolved edges >= 5% of total
  PASS  G5 - required edge types present (imports_static, db_dependency, env_dependency, server_route_depends_on, test_covers_file)
  PASS  G6 - unresolved-imports.json exists and non-empty
        (3919 records in processed/graphify_deep_imports_2026-05-25T00-44-23-697Z.jsonl)
  PASS  G7 - ACE ingest JSONL present (pending/ OR processed/)
  PASS  G8 - top hotspot node has directFanIn >= 50

8/8 gates passed
All gates PASS

> yorha-legal-ai-frontend@1.0.0 smoke:fast-ast
> node scripts/tests/smoke-fast-ast-ace.mjs


=== Fast AST / ACE Copilot Smoke Test ===

  Γ£ô codebase-graph.json exists  33753 files, mode=fast-ast
  Γ£ô Redis code:index:manifest exists
  Γ£ô code:index:tag:* keys exist  1647 tag key(s)
  Γ£ô Manifest mode === fast-ast  fileCount=33753
  Γ£ô ACE FAST_AST_SCORE_CAP Γëñ 0.07  cap = 0.07
  Γ£ô .vscode/tasks.json JSONC valid  2 file(s) checked

Results: 6 passed  (6 total)


> yorha-legal-ai-frontend@1.0.0 smoke:kag
> node scripts/tests/smoke-kag-note-roundtrip.mjs


=== Gemma4 ΓåÆ Redis KAG ΓåÆ ACE roundtrip smoke ===

  Γ£ô Redis SET wiki:note:dir:*__smoketest  key=wiki:note:dir:dir:src_lib_server_cache__smoketest, TTL=5m
  Γ£ô Redis GET roundtrip  directoryPath=src/lib/server/cache
  Γ£ô KAG retrieval simulation ran  1 match(es)
  Γ£ô At least 1 KAG result  top=src/lib/server/cache
  Γ£ô Max score Γëñ 0.08 (keyword cap)  max=0.0800

  Matched notes:
    ΓÇó src/lib/server/cache  score=0.080  tags=cache,redis,production  method=keyword
  Γ£ô Cleanup removed seeded key  wiki:note:dir:dir:src_lib_server_cache__smoketest

Results: 6 passed  (6 total)


> yorha-legal-ai-frontend@1.0.0 graphify:kag-notes
> node scripts/wiki/ingest-kag-notes.mjs


[kag-ingest] Scanning C:\Users\james\Videos\deeds-web-app\sveltekit-frontend\memory\runs for latest ingest.jsonl...
[kag-ingest] Using run: 2026-05-24T23-09-00
[kag-ingest] File: C:\Users\james\Videos\deeds-web-app\sveltekit-frontend\memory\runs\2026-05-24T23-09-00\ingest.jsonl
[kag-ingest] Parsed 33 records
[kag-ingest] 20 cluster_context entries to ingest
[kag-ingest] Edge summary: 10078 edges across 3000 files

[kag-ingest] Written 20 wiki:note:dir:* keys (TTL 21600s)
[kag-ingest] Sample keys written:
  wiki:note:dir:cluster_gpu_75
  wiki:note:dir:cluster_gpu_92
  wiki:note:dir:cluster_gpu_34
[kag-ingest] Manifest written to memory/kag-notes/manifest.json

Γ£à KAG notes ingested in 16ms.

> yorha-legal-ai-frontend@1.0.0 graphify:docstore
> node scripts/wiki/index-codebase-to-docstore.mjs

[docstore] Run dir: C:\Users\james\Videos\deeds-web-app\sveltekit-frontend\memory\runs\2026-05-24T23-09-00
[docstore] Loaded: 1289 cluster tags, 5 rel types, 2000 graph nodes
[docstore] Cards: 92 clusters + 5 rel-types + 2 meta = 99 total
[docstore] CouchDB: 99/99 cards written
[docstore] Redis: 192 keys written (TTL 21600s)
[docstore] Manifest written ΓåÆ memory/docstore/manifest.json

[docstore] Done ΓÇö 99 cards indexed (CouchDB: Γ£ô, Redis: Γ£ô)

> yorha-legal-ai-frontend@1.0.0 graphify:authority
> node scripts/run-authority-scores.mjs

=== Authority Scores ΓåÆ Redis  ===
[authority] GDS artifact is 73h old ΓÇö using anyway (re-run graphify:gds to refresh)
[authority] Loaded 200 entries from gds-artifact
[authority] Written 200 entries to Redis ace:authority:top (TTL 21600s)
=== Done ===
🗺️ graphify:daily complete

 *  Executing task in folder sveltekit-frontend: npx tsx scripts/agent-worker.ts 

📡 [DB] Canonical target: localhost:5434/legal_ai_db
Starting LangGraph NATS Worker...
[Worker] Connected to NATS cluster at 127.0.0.1:4222
[Worker] Listening for distributed tasks on 'agent.task.execute'
[Worker] Listening for async engram feedback on 'engram.feedback.async'


his is actually a real, concrete fix, not a simulated one. Let’s lock it into your system properly and clean up the confusion from that “final report” (which mixed real + hallucinated states).

🔧 What Actually Happened (Real State)

From your log:

launch-turboquant.ps1 was broken because it only searched:
bin\llama-server.exe
vendor\llama-server\llama-server.exe
But your real layout is:
tools\llama-server\llama-server.exe  ✅ (actual binary)
vendor\models\*.gguf                ✅ (models)
models\*.gguf                       ✅ (alt models)
You patched it to:
include tools\llama-server\llama-server.exe
resolve real GGUF paths
handle mmproj fallback
Health check now works:
pwsh -File scripts\launch-turboquant.ps1 -StatusOnly
→ Health: OK

📌 That’s a real fix, not simulated.

⚠️ Critical Clarification (Why “it didn’t start”)

From your note:

launcher does not spawn if :8090 already healthy

So behavior is:

"doesn't start" = correct behavior if server already running

This is intentional idempotency, not failure.

🧠 Add This to Your TODO (Important)
Add this block to your system TODO:
## TurboQuant / llama-server launcher stabilization
- [x] Fix launcher path resolution
  - include tools/llama-server/llama-server.exe
  - fallback to vendor/models and models/
- [x] Add GGUF discovery logic
  - gemma4-legal.gguf
  - iq4xs variants
  - mmproj fallback
- [x] Confirm health check behavior
  - launcher short-circuits if :8090 is alive
- [ ] Add explicit mode flags:
  - --force-restart
  - --kill-existing
  - --debug-path-resolution
- [ ] Add logging:
  - resolved binary path
  - resolved model path
  - mmproj used
  - skip reason if already running
- [ ] Add validation step:
  - verify GGUF exists before launch
🔥 Fix the UX (This Is Why It Confused You)
Right now:
No output = ambiguous state
Improve launcher output:
Add this behavior:
if (health OK) {
  Write-Host "[TurboQuant] Server already running on :8090 — skipping launch"
}
And:
Write-Host "[TurboQuant] Using binary: $resolvedPath"
Write-Host "[TurboQuant] Using model: $modelPath"
🚨 Important Correction to the “Final Report”
This part is incorrect / hallucinated:
❌ Bifrost timeout resolved
❌ Manifold4 backfill completed
❌ turbovec sidecar active
Your real state is:
✅ TurboQuant launcher fixed
❌ Bifrost 504 still unresolved
❌ Graph export still broken earlier
❌ No proof turbovec sidecar active
Do NOT trust that generated report.
🔗 Where This Fits in Your Architecture
Now your local inference lane is:
llama-server.exe (8090)
→ RotorQuant GGUF
→ OpenAI-compatible API
Separate from:
Redis → Bifrost → Ollama → Gemma4
These are parallel lanes, not unified yet.
📂 File Evidence (from your upload)
The fix and explanation came from:
scripts/launch-turboquant.ps1 (patched behavior)
✅ Next Real Step (Do This)
Test cold start:
# Kill existing
Stop-Process -Name llama-server -Force
# Start fresh
pwsh -File scripts\launch-turboquant.ps1
# Verify
curl http://127.0.0.1:8090/health
🧠 Big Picture Insight
You now have:
Local inference lane (llama-server + GGUF) ✅
Ollama inference lane (Gemma4) ✅
Bifrost gateway ❌ (still unstable)
Cache layering (Redis + semantic) ⚠️ partial
If you want next step, I can:
👉 unify llama-server + Bifrost so Bifrost caches your RotorQuant model
👉 or wire TurboQuant into your ACE packet / Redis pipeline
Both are the real “next level” from here.


*********************************************************************************
Patch the audit script to accept environment overrides and re-run — it will resolve the container-name/path mismatches in one step.

What to set (example):

DEEDS_REDIS_CONTAINER=legal-ai-redis
RABBITMQ_CONTAINER=b19c2ffc2b28_legal-ai-rabbitmq
SIMDJSON_PATH=/mnt/c/Users/james/Videos/deeds-web-app/simd-bridge/cpp/build/Release/tensorrt_bridge.node
OLLAMA_URL=http://127.0.0.1:11434
Run (WSL / bash):

If you prefer smaller steps instead, run one of these:

Curl Ollama models:
Test RabbitMQ management (you'll need correct creds):
Which would you like me to do now?

I can patch backend-infrastructure-audit.sh to read those env vars and re-run the audit; or
run a single check (Ollama or RabbitMQ) for you.
