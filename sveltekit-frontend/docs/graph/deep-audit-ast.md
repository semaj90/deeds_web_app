# Deep AST Audit

Generated: 2026-05-05T16:05:04.067Z
Graph files: 3374

## Summary

| Gate | Description | Count |
| :--- | :--- | ---: |
| D1 | @vite-ignore variable imports | 8 |
| D2 | CJS require() in .ts/.mjs | 7 |
| D3 | Native .node addon loads | 15 |
| D4 | worker_threads / new Worker | 26 |
| D5 | Proto / gRPC contract refs | 13 |
| D6 | Hardcoded localhost outside env.server.ts | 0 |
| D7 | Browser globals in SSR .svelte without guard | 0 |
| D8 | ssrUnsafe routes missing ssr=false | 0 |
| D9 | Likely orphans (0 fanIn, no dynImport ref) | 386 |
| D10 | ACE synthesis missing recordLlmOutputHit | 0 |

---

## D1 — @vite-ignore variable imports

**8** findings

- `src\lib\server\ocr\hybrid.ts:67` — const { getDocument } = await import(/* @vite-ignore */ pdfjsPath);
- `src\lib\server\ocr\hybrid.ts:68` — const { createCanvas } = await import(/* @vite-ignore */ canvasPath);
- `src\lib\server\db\drizzle.ts:27` — const mod = await import(/* @vite-ignore */ cachePath);
- `src\lib\server\analysis\granite-docling.ts:157` — const { getDocument } = await import(/* @vite-ignore */ pdfjsPath);
- `src\lib\server\analysis\granite-docling.ts:158` — const { createCanvas } = await import(/* @vite-ignore */ canvasPath);
- `src\lib\server\analysis\granite-docling.ts:189` — const { getDocument } = await import(/* @vite-ignore */ pdfjsPath);
- `src\lib\components\yorha\_simulations\CanvasBoard.svelte:160` — const module = await import(/* @vite-ignore */ enginePath).catch(() => null);
- `src\routes\(app)\demos\yorha\components\_simulations\CanvasBoard.svelte:160` — const module = await import(/* @vite-ignore */ enginePath).catch(() => null);

---

## D2 — CJS require() in .ts/.mjs

**7** findings

- `src\mcp\server.ts:1688` — const { createHash } = require('crypto') as typeof import('crypto');
- `src\lib\utils\fuse-import.ts:6` — Fuse = require('fuse.js');
- `src\lib\server\db\index-new.ts:20` — const { drizzle } = require('drizzle-orm/postgres-js');
- `src\routes\api\yorha\cluster-health\+server.ts:28` — const totalMem = require('os').totalmem();
- `src\routes\api\yorha\cluster-health\+server.ts:29` — const freeMem = require('os').freemem();
- `src\lib\server\evidence\services\ocr.ts:8` — const { createWorker } = require('tesseract.js');
- `src\lib\server\error-brain\transport\factory.ts:49` — const { getErrorBrainConfig } = require('../feature-flags');

---

## D3 — Native .node addon loads

**15** findings

- `src\lib\utils\simd-markdown-parser.ts:75` — const nodeRequire = isNode ? createRequire(import.meta.url) : null;
- `src\lib\server\phase72\astVectorizer.ts:9` — const candidate = path.resolve('build', 'Release', 'ast_error_vectorizer.node');
- `src\lib\server\phase72\astVectorizer.ts:18` — throw new Error('ASTVectorizer export missing from ast_error_vectorizer.node');
- `src\lib\server\gpu\simdjson-bridge.ts:22` — const esmRequire = createRequire(import.meta.url);
- `src\lib\server\gpu\simdjson-bridge.ts:40` — resolve(process.cwd(), '../simd-bridge/cpp/build/Release/tensorrt_bridge.node'),
- `src\lib\server\gpu\simdjson-bridge.ts:41` — resolve(process.cwd(), '../simd-bridge/cpp/build/tensorrt_bridge.node'),
- `src\lib\server\gpu\simdjson-bridge.ts:42` — resolve(process.cwd(), '../simd-bridge/build/Release/tensorrt_bridge.node'),
- `src\lib\server\gpu\pytorch-graph.ts:18` — const esmRequire = createRequire(import.meta.url);
- `src\lib\server\gpu\pytorch-graph.ts:113` — resolve(process.cwd(), '../simd-bridge/cpp/build/Release/tensorrt_bridge.node'),
- `src\lib\server\gpu\pytorch-graph.ts:114` — resolve(process.cwd(), '../simd-bridge/cpp/build/tensorrt_bridge.node'),
- `src\lib\server\gpu\pytorch-graph.ts:115` — resolve(process.cwd(), '../simd-bridge/build/Release/tensorrt_bridge.node'),
- `src\lib\server\gpu\libtorch-bridge.ts:25` — const esmRequire = createRequire(import.meta.url);
- `src\lib\server\gpu\libtorch-bridge.ts:200` — resolve(process.cwd(), '../simd-bridge/cpp/build/Release/tensorrt_bridge.node'),
- `src\lib\server\gpu\libtorch-bridge.ts:201` — resolve(process.cwd(), '../simd-bridge/cpp/build/tensorrt_bridge.node'),
- `src\lib\server\gpu\libtorch-bridge.ts:202` — resolve(process.cwd(), '../simd-bridge/build/Release/tensorrt_bridge.node'),

---

## D4 — worker_threads / new Worker

**26** findings

- `src\lib\workers\compute-worker.mjs:10` — import { parentPort } from 'worker_threads';
- `src\lib\workers\ast-graph-worker.mjs:16` — import { parentPort } from 'worker_threads';
- `src\lib\webgpu\texture-streaming.ts:230` — this.compressionWorker = new Worker(this.workerUrl);
- `src\lib\utils\dynamic-imports.ts:86` — // SIMD GPU tiling uses server-side compute-pool.ts + worker_threads
- `src\lib\server\workers\compute-pool.ts:5` — * (clustering, forensics, regex, embeddings) to worker_threads.
- `src\lib\server\workers\compute-pool.ts:19` — import { Worker } from 'worker_threads';
- `src\lib\server\workers\compute-pool.ts:80` — const worker = new Worker(workerPath);
- `src\lib\server\workers\compute-pool.ts:300` — // SharedArrayBuffer is always available in Node.js worker_threads context
- `src\lib\server\ml\topic-cluster.ts:275` — * Offloads to worker_threads to avoid blocking the event loop.
- `src\lib\server\langextract\native.ts:18` — *          worker_threads via compute-pool — escapes the V8 main loop the
- `src\lib\server\langextract\native.ts:116` — * which dispatches to a worker_threads-bound Gemma4 call.
- `src\lib\server\langextract\native.ts:195` — * Run native extraction inside the existing compute-pool worker_threads pool.
- `src\lib\server\gpu\mapreduce-worker.mjs:10` — import { parentPort, workerData } from 'worker_threads';
- `src\lib\server\gpu\mapreduce-runner.mjs:8` — * Vite dev server transforms worker_threads internally, causing spawned
- `src\lib\server\gpu\mapreduce-runner.mjs:29` — import { Worker } from 'worker_threads';
- `src\lib\server\gpu\mapreduce-runner.mjs:77` — const worker = new Worker(workerPath, {
- `src\lib\server\gpu\mapreduce-cuda-analyzer.ts:137` — // Vite dev server transforms worker_threads internally, causing zombie workers.
- `src\lib\server\graph\codebase-scanner-v2.ts:121` — const RE_WORKER     = /worker_threads|new Worker\(|Worker\('/;
- `src\lib\server\ff1\registry.ts:13` — *   worker        — offload to a Node worker_threads worker
- `src\lib\server\analysis\forensics.ts:6` — * For large documents (>10KB), offloads regex work to worker_threads.
- `src\lib\server\analysis\forensics.ts:196` — * Async forensics — offloads to worker_threads for large documents.
- `src\lib\ai\onnx\session.ts:95` — worker_threads: { Worker: undefined, parentPort: null, isMainThread: true, workerData: undefined, threadId: 0 },
- `src\lib\components\graph\GraphifyViewer.svelte:332` — layoutWorker = new Worker(
- `src\routes\api\codebase\wiki\index\+server.ts:10` — *   POST → try RabbitMQ publish → if unavailable, fall back to mapreduce worker_threads
- `src\routes\api\codebase\wiki\index\+server.ts:108` — * Fallback to mapreduce worker_threads path.
- `src\routes\api\codebase\wiki\index\+server.ts:158` — // Fallback to mapreduce worker_threads

---

## D5 — Proto / gRPC contract refs

**13** findings

- `src\routes\api\search\+server.ts:120` — const grpc = await import('@grpc/grpc-js');
- `src\lib\server\indexer\workspace-metadata-extractor.ts:75` — '.proto':  'protobuf',
- `src\lib\server\indexer\ast-chunker.ts:56` — '.proto',
- `src\lib\server\grpc\tool-router-client.ts:100` — const grpc = await import('@grpc/grpc-js');
- `src\lib\server\grpc\tool-calling-client.ts:97` — const grpc = await import('@grpc/grpc-js');
- `src\lib\server\grpc\retrieval-client.ts:4` — * Uses retrieval.proto's RetrievalService for RAG+KAG+DAG evidence search
- `src\lib\server\grpc\retrieval-client.test.ts:7` — loadPackageDefinition: vi.fn(),
- `src\lib\server\grpc\graph-ml-client.ts:76` — const grpc = await import('@grpc/grpc-js');
- `src\lib\server\grpc\embedding-client.ts:152` — const grpc = await import('@grpc/grpc-js');
- `src\lib\server\grpc\chr97-agent-client.ts:89` — const grpc = await import('@grpc/grpc-js');
- `src\lib\server\evidence\proto-serializer.ts:130` — const protoPath = join(process.cwd(), 'proto', 'active', 'evidence_metadata.proto');
- `src\routes\api\codebase-index\orchestrate\+server.ts:44` — '.proto',
- `src\routes\api\codebase\index\+server.ts:53` — '.proto',

---

## D9 — Likely orphans (0 fanIn, no dynImport ref)

> **D9 is a candidate queue, not a deletion list.**
>
> D9 no longer uses Graphify `fanIn` as a deletion signal. It uses `fanIn=0` only as a candidate source, then verifies candidates by scanning runtime imports, dynamic imports, type-only imports, and barrel re-exports. SvelteKit route entrypoints, hooks, service workers, type shims, generated declarations, stores, and barrels are excluded.
>
> Files listed here are likely unused, but still require `/audit-components` disposition before deletion or archive. Do not bulk-prune — let the skill classify the first 20-30, then archive in batches.

**386** findings (showing first 30)

- `src/ambient-legacy.d.ts:1` — 0 refs across static/dynamic/type/barrel/path scans; classification=true-orphan-candidate
- `src/app.d.ts:1` — 0 refs across static/dynamic/type/barrel/path scans; classification=true-orphan-candidate
- `src/custom-modules.d.ts:1` — 0 refs across static/dynamic/type/barrel/path scans; classification=true-orphan-candidate
- `src/env.d.ts:1` — 0 refs across static/dynamic/type/barrel/path scans; classification=true-orphan-candidate
- `src/global.d.ts:1` — 0 refs across static/dynamic/type/barrel/path scans; classification=true-orphan-candidate
- `src/lib/ai/base64-fp32-quantizer.ts:1` — 0 refs across static/dynamic/type/barrel/path scans; classification=true-orphan-candidate
- `src/lib/ai/unified-generation.ts:1` — 0 refs across static/dynamic/type/barrel/path scans; classification=true-orphan-candidate
- `src/lib/ambient-events.d.ts:1` — 0 refs across static/dynamic/type/barrel/path scans; classification=true-orphan-candidate
- `src/lib/client/db/loki-client.ts:1` — 0 refs across static/dynamic/type/barrel/path scans; classification=true-orphan-candidate
- `src/lib/client-logging.ts:1` — 0 refs across static/dynamic/type/barrel/path scans; classification=true-orphan-candidate
- `src/lib/components/audio/AudioAnalysisView.svelte:1` — 0 refs across static/dynamic/type/barrel/path scans; classification=true-orphan-candidate
- `src/lib/components/chat/AudioUploadWidget.svelte:1` — 0 refs across static/dynamic/type/barrel/path scans; classification=true-orphan-candidate
- `src/lib/components/chat/ChatPromptBar.svelte:1` — 0 refs across static/dynamic/type/barrel/path scans; classification=true-orphan-candidate
- `src/lib/components/codebase/TagDeleteDialog.svelte:1` — 0 refs across static/dynamic/type/barrel/path scans; classification=true-orphan-candidate
- `src/lib/components/components-shims.d.ts:1` — 0 refs across static/dynamic/type/barrel/path scans; classification=true-orphan-candidate
- `src/lib/components/document/DocumentAnalysisView.svelte:1` — 0 refs across static/dynamic/type/barrel/path scans; classification=true-orphan-candidate
- `src/lib/components/glyph/GlyphAtlasPanel.svelte:1` — 0 refs across static/dynamic/type/barrel/path scans; classification=true-orphan-candidate
- `src/lib/components/monitoring/CacheWarmUpControl.svelte:1` — 0 refs across static/dynamic/type/barrel/path scans; classification=true-orphan-candidate
- `src/lib/components/ui/bits/compound.ts:1` — 0 refs across static/dynamic/type/barrel/path scans; classification=true-orphan-candidate
- `src/lib/components/ui/ContextMenuSeparator.svelte:1` — 0 refs across static/dynamic/type/barrel/path scans; classification=true-orphan-candidate
- `src/lib/components/ui/gaming/constants/gaming-constants-minimal.ts:1` — 0 refs across static/dynamic/type/barrel/path scans; classification=true-orphan-candidate
- `src/lib/components/ui/gaming/types/gaming-types-minimal.ts:1` — 0 refs across static/dynamic/type/barrel/path scans; classification=true-orphan-candidate
- `src/lib/components/ui/IconContainer.svelte:1` — 0 refs across static/dynamic/type/barrel/path scans; classification=true-orphan-candidate
- `src/lib/components/ui/wrappers/bits/bits-overrides.ts:1` — 0 refs across static/dynamic/type/barrel/path scans; classification=true-orphan-candidate
- `src/lib/components/video/VideoAnalysisView.svelte:1` — 0 refs across static/dynamic/type/barrel/path scans; classification=true-orphan-candidate
- `src/lib/config/pgvector-gpu-config.js:1` — 0 refs across static/dynamic/type/barrel/path scans; classification=true-orphan-candidate
- `src/lib/config/redis-config.ts:1` — 0 refs across static/dynamic/type/barrel/path scans; classification=true-orphan-candidate
- `src/lib/data/route-groups-config.ts:1` — 0 refs across static/dynamic/type/barrel/path scans; classification=true-orphan-candidate
- `src/lib/db/schema/gpuInferenceDemo.ts:1` — 0 refs across static/dynamic/type/barrel/path scans; classification=true-orphan-candidate
- `src/lib/db/vite-error-schema.ts:1` — 0 refs across static/dynamic/type/barrel/path scans; classification=true-orphan-candidate

---

## Recommended Claude Code skills

Each skill is a multi-gate agentic pipeline that drills deeper than this AST audit. Run from Claude Code via `/<skill-name>`:

- /audit-components — verify 386 D9 orphan candidates with 8-gate test (G0 transitive-dep, G0.5 dynamic-import, G1-G8 disposition)
- /prune-codebase — full archive flow with G6 route reachability + reverse-dependency chain
- /deep-audit — full 47-gate sweep covering G1-G47 (compounds D1-D10 with infra, security, RL pipeline)
- /graphify — refresh codebase-graph.json + glyph_atlas + cluster_summaries; D9 false-positive count drops once new fanIn data lands

**Composition pattern**:
1. `/graphify` — refresh codebase-graph.json + cluster_summaries (~5 min)
2. `npm run audit:deep-ast` — refresh D1-D10 findings (~2s)
3. `/audit-components` (D9 candidates) — 8-gate disposition (wire/rewrite/archive/defer)
4. `/wire-modules` (D10 missing-import) — fix orphan call sites
5. `/deep-audit` — 47-gate sweep including this audit's output as Tier A baseline
