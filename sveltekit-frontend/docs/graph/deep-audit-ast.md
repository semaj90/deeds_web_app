# Deep AST Audit

Generated: 2026-05-05T14:05:41.807Z
Graph files: 3374

## Summary

| Gate | Description | Count |
| :--- | :--- | ---: |
| D1 | @vite-ignore variable imports | 8 |
| D2 | CJS require() in .ts/.mjs | 7 |
| D3 | Native .node addon loads | 15 |
| D4 | worker_threads / new Worker | 23 |
| D5 | Proto / gRPC contract refs | 13 |
| D6 | Hardcoded localhost outside env.server.ts | 9 |
| D7 | Browser globals in SSR .svelte without guard | 4 |
| D8 | ssrUnsafe routes missing ssr=false | 5 |
| D9 | Likely orphans (0 fanIn, no dynImport ref) | 840 |
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

- `src\mcp\server.ts:1674` — const { createHash } = require('crypto') as typeof import('crypto');
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

**23** findings

- `src\lib\workers\compute-worker.mjs:10` — import { parentPort } from 'worker_threads';
- `src\lib\workers\ast-graph-worker.mjs:16` — import { parentPort } from 'worker_threads';
- `src\lib\webgpu\texture-streaming.ts:230` — this.compressionWorker = new Worker(this.workerUrl);
- `src\lib\utils\dynamic-imports.ts:86` — // SIMD GPU tiling uses server-side compute-pool.ts + worker_threads
- `src\lib\server\workers\compute-pool.ts:5` — * (clustering, forensics, regex, embeddings) to worker_threads.
- `src\lib\server\workers\compute-pool.ts:19` — import { Worker } from 'worker_threads';
- `src\lib\server\workers\compute-pool.ts:80` — const worker = new Worker(workerPath);
- `src\lib\server\workers\compute-pool.ts:300` — // SharedArrayBuffer is always available in Node.js worker_threads context
- `src\lib\server\ml\topic-cluster.ts:275` — * Offloads to worker_threads to avoid blocking the event loop.
- `src\lib\server\graph\codebase-scanner-v2.ts:121` — const RE_WORKER     = /worker_threads|new Worker\(|Worker\('/;
- `src\lib\server\gpu\mapreduce-worker.mjs:10` — import { parentPort, workerData } from 'worker_threads';
- `src\lib\server\gpu\mapreduce-runner.mjs:8` — * Vite dev server transforms worker_threads internally, causing spawned
- `src\lib\server\gpu\mapreduce-runner.mjs:29` — import { Worker } from 'worker_threads';
- `src\lib\server\gpu\mapreduce-runner.mjs:77` — const worker = new Worker(workerPath, {
- `src\lib\server\gpu\mapreduce-cuda-analyzer.ts:137` — // Vite dev server transforms worker_threads internally, causing zombie workers.
- `src\lib\server\ff1\registry.ts:13` — *   worker        — offload to a Node worker_threads worker
- `src\lib\server\analysis\forensics.ts:6` — * For large documents (>10KB), offloads regex work to worker_threads.
- `src\lib\server\analysis\forensics.ts:196` — * Async forensics — offloads to worker_threads for large documents.
- `src\lib\components\graph\GraphifyViewer.svelte:332` — layoutWorker = new Worker(
- `src\lib\ai\onnx\session.ts:95` — worker_threads: { Worker: undefined, parentPort: null, isMainThread: true, workerData: undefined, threadId: 0 },
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

## D6 — Hardcoded localhost outside env.server.ts

**9** findings

- `src\lib\server\langextract-client.ts:117` — const probe = await fetch(`http://127.0.0.1:${port}/health`, {
- `src\lib\server\langextract-client.ts:124` — resolvedUrl = `http://127.0.0.1:${port}`;
- `src\lib\server\endpoints.ts:16` — return getEnvUrl('ENHANCED_RAG_URL', 'http://enhanced-rag:8094', 'http://localhost:8094');
- `src\lib\server\services\langextract-service.ts:50` — 'http://localhost:8095', // python (phase66)
- `src\lib\server\services\langextract-service.ts:51` — 'http://localhost:8090' // go (langextract-go)
- `src\lib\server\grpc\generation-client.ts:142` — constructor(baseUrl: string = 'http://localhost:50052', timeout: number = 120_000) {
- `src\lib\server\env\endpoints.ts:6` — const localFallback = 'http://localhost:11434';
- `src\lib\server\db\seed-citations.ts:168` — curl http://localhost:5173/api/citations
- `src\lib\server\clients\ollama.ts:14` — const localhostFallback = 'http://localhost:11434';

---

## D7 — Browser globals in SSR .svelte without guard

**4** findings

- `src\routes\(app)\rag-search\+page.svelte:38` — const urlParams = $derived(typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null);
- `src\routes\(app)\chat\+page.svelte:9` — const urlParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
- `src\routes\(app)\analysis-center\+page.svelte:223` — let webgpuCapable = $derived(typeof navigator !== 'undefined' && !!navigator.gpu);
- `src\routes\(app)\chat\[id]\+page.svelte:16` — const urlParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;

---

## D8 — ssrUnsafe routes missing ssr=false

**5** findings

- `src/routes/(app)/admin/dev-tools/+page.svelte:1` — ssrUnsafe + isRoute, no `export const ssr = false` on sibling +page.{ts,server.ts}
- `src/routes/(app)/citations/law/+page.svelte:1` — ssrUnsafe + isRoute, no `export const ssr = false` on sibling +page.{ts,server.ts}
- `src/routes/(app)/citations/law/[citation]/+page.svelte:1` — ssrUnsafe + isRoute, no `export const ssr = false` on sibling +page.{ts,server.ts}
- `src/routes/(app)/citations/[...label]/+page.svelte:1` — ssrUnsafe + isRoute, no `export const ssr = false` on sibling +page.{ts,server.ts}
- `src/routes/(app)/demos/ace-pipeline/+page.svelte:1` — ssrUnsafe + isRoute, no `export const ssr = false` on sibling +page.{ts,server.ts}

---

## D9 — Likely orphans (0 fanIn, no dynImport ref)

**840** findings (showing first 30)

- `src/ambient-legacy.d.ts:1` — fanIn=0, no dynImport consumer, 16 LOC, tags=[ts,src,ambient-legacy.d.ts]
- `src/app.d.ts:1` — fanIn=0, no dynImport consumer, 95 LOC, tags=[ts,src,app.d.ts]
- `src/custom-modules.d.ts:1` — fanIn=0, no dynImport consumer, 29 LOC, tags=[ts,src,custom-modules.d.ts]
- `src/env.d.ts:1` — fanIn=0, no dynImport consumer, 14 LOC, tags=[ts,src,env.d.ts]
- `src/global.d.ts:1` — fanIn=0, no dynImport consumer, 124 LOC, tags=[ts,src,global.d.ts]
- `src/hooks.client.ts:1` — fanIn=0, no dynImport consumer, 159 LOC, tags=[ts,src,hooks.client.ts]
- `src/hooks.server.ts:1` — fanIn=0, no dynImport consumer, 1015 LOC, tags=[ts,src,hooks.server.ts]
- `src/lib/ai/base64-fp32-quantizer.ts:1` — fanIn=0, no dynImport consumer, 340 LOC, tags=[ts,src,lib]
- `src/lib/ai/citation-cache.ts:1` — fanIn=0, no dynImport consumer, 430 LOC, tags=[ts,src,lib]
- `src/lib/ai/client-quality.ts:1` — fanIn=0, no dynImport consumer, 343 LOC, tags=[ts,src,lib]
- `src/lib/ai/e2b/inference.ts:1` — fanIn=0, no dynImport consumer, 213 LOC, tags=[ts,src,lib]
- `src/lib/ai/e2b/session.ts:1` — fanIn=0, no dynImport consumer, 311 LOC, tags=[ts,src,lib]
- `src/lib/ai/emotion-context.ts:1` — fanIn=0, no dynImport consumer, 317 LOC, tags=[ts,src,lib]
- `src/lib/ai/hypergraph.ts:1` — fanIn=0, no dynImport consumer, 88 LOC, tags=[ts,src,lib]
- `src/lib/ai/model-ids.ts:1` — fanIn=0, no dynImport consumer, 356 LOC, tags=[ts,src,lib]
- `src/lib/ai/ollama-config.ts:1` — fanIn=0, no dynImport consumer, 69 LOC, tags=[ts,src,lib]
- `src/lib/ai/unified-generation.ts:1` — fanIn=0, no dynImport consumer, 435 LOC, tags=[ts,src,lib]
- `src/lib/ambient-events.d.ts:1` — fanIn=0, no dynImport consumer, 22 LOC, tags=[ts,src,lib]
- `src/lib/cache/cache-invalidation.ts:1` — fanIn=0, no dynImport consumer, 49 LOC, tags=[ts,src,lib]
- `src/lib/cache/offline-fetch.ts:1` — fanIn=0, no dynImport consumer, 75 LOC, tags=[ts,src,lib]
- `src/lib/client/db/loki-client.ts:1` — fanIn=0, no dynImport consumer, 91 LOC, tags=[ts,src,lib]
- `src/lib/client/search-client.ts:1` — fanIn=0, no dynImport consumer, 170 LOC, tags=[ts,src,lib]
- `src/lib/client-logging.ts:1` — fanIn=0, no dynImport consumer, 29 LOC, tags=[ts,src,lib]
- `src/lib/command-center-manifest.ts:1` — fanIn=0, no dynImport consumer, 270 LOC, tags=[ts,src,lib]
- `src/lib/components/ai/index.ts:1` — fanIn=0, no dynImport consumer, 15 LOC, tags=[ts,src,lib]
- `src/lib/components/canvas/hybrid/types.ts:1` — fanIn=0, no dynImport consumer, 50 LOC, tags=[ts,src,lib]
- `src/lib/components/cases/index.ts:1` — fanIn=0, no dynImport consumer, 17 LOC, tags=[ts,src,lib]
- `src/lib/components/codebase/index.ts:1` — fanIn=0, no dynImport consumer, 15 LOC, tags=[ts,src,lib]
- `src/lib/components/components-shims.d.ts:1` — fanIn=0, no dynImport consumer, 7 LOC, tags=[ts,src,lib]
- `src/lib/components/dashboard/gamification-types.ts:1` — fanIn=0, no dynImport consumer, 134 LOC, tags=[ts,src,lib]
