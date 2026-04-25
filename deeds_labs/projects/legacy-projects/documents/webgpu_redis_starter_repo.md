# webgpu-redis-starter (Node + worker_threads + Redis + SvelteKit WebGPU demo)

This repo now includes **docker-compose.yml** for full local orchestration with:
- Redis
- MinIO (S3-compatible storage)
- Node orchestrator + worker threads (with multi-core scheduling in `server/mcp/server.mjs`)
- SvelteKit dev server (Vite)

---

## Repo layout

```
webgpu-redis-starter/
├─ README.md
├─ docker-compose.yml              # Full stack (Redis, MinIO, Node orchestrator, SvelteKit)
├─ package.json
├─ tsconfig.json
├─ server/
│  ├─ src/
│  │  ├─ index.ts                  # API server (Express + Redis + enqueue)
│  │  ├─ worker/mesh_worker.ts      # worker_threads example (preprocess)
│  │  ├─ gpu_mock/service.ts        # mock GPU service accepting ArrayBuffer
│  │  ├─ redisHelpers.ts            # helper functions for caching + jobs
│  │  └─ types.ts
│  ├─ mcp/server.mjs                # multi-core pool orchestrator (Node worker_threads)
│  └─ Dockerfile
├─ sveltekit-demo/
│  ├─ package.json
│  ├─ Dockerfile
│  ├─ src/
│  │  ├─ routes/+page.svelte        # demo page & modal
│  │  ├─ lib/client-cache.ts        # IndexedDB helper (idb wrapper)
│  │  ├─ lib/webgpu/conv.wgsl       # WGSL convolution shader
│  │  └─ lib/webgpu/runner.ts       # browser WebGPU runner for convolution
│  └─ static/
└─ tests/
   └─ cache.test.ts                 # basic tests for Redis caching correctness
```

---

## docker-compose.yml (added)

```yaml
version: '3.9'

services:
  redis:
    image: redis:7
    ports:
      - "6379:6379"

  minio:
    image: minio/minio
    command: server /data --console-address ":9001"
    ports:
      - "9000:9000"
      - "9001:9001"
    environment:
      MINIO_ROOT_USER: minio
      MINIO_ROOT_PASSWORD: minio123
    volumes:
      - ./minio-data:/data

  orchestrator:
    build: ./server
    depends_on:
      - redis
      - minio
    environment:
      REDIS_URL: redis://redis:6379
      MINIO_URL: http://minio:9000
      MINIO_ACCESS_KEY: minio
      MINIO_SECRET_KEY: minio123
    ports:
      - "3000:3000"
    command: ["node", "./mcp/server.mjs"]

  sveltekit:
    build: ./sveltekit-demo
    volumes:
      - ./sveltekit-demo:/app
      - /app/node_modules
    ports:
      - "5173:5173"
    environment:
      VITE_API_URL: http://orchestrator:3000
```

---

## Multi-core pool orchestrator (`server/mcp/server.mjs`)

```js
import { cpus } from 'os';
import { Worker } from 'worker_threads';
import path from 'path';

const numCores = cpus().length;
const workers = [];

for (let i = 0; i < numCores; i++) {
  const worker = new Worker(path.resolve('./src/worker/mesh_worker.js'));
  worker.on('message', (msg) => {
    console.log(`[Worker ${i}]`, msg);
  });
  workers.push(worker);
}

// Simple round-robin scheduling
let current = 0;
export function dispatchJob(job) {
  const worker = workers[current];
  current = (current + 1) % workers.length;
  worker.postMessage(job);
}

console.log(`MCP orchestrator running with ${numCores} workers.`);
```

---

## Workflow
- `docker compose up` starts everything.
- Orchestrator runs `mcp/server.mjs`, spawning one worker per CPU core.
- Jobs are distributed round-robin across workers.
- Workers push results to Redis (small blobs) or MinIO (large assets).
- SvelteKit talks to orchestrator via REST API and displays cached results with SSR.

---

Would you like me to also wire **Protobuf schemas** into this MCP orchestrator (so workers, Redis, and SvelteKit all share a binary contract for jobs/results), or keep JSON for now?


---

## Added: `proto/` directory + TypeScript stubs (protobufjs)

### proto/job.proto

```proto
syntax = "proto3";
package webgpu;

message Meta {
  string key = 1;
  string engine_version = 2;
  string kind = 3;
  uint64 size_bytes = 4;
  string dtype = 5;
  repeated uint64 shape = 6;
  string origin = 7;
  string created_at = 8;
}

message JobPayload {
  Meta meta = 1;
  bytes data = 2;
  string s3_key = 3;
  map<string,string> params = 4;
}

enum JobStatus {
  UNKNOWN = 0;
  QUEUED = 1;
  RUNNING = 2;
  DONE = 3;
  FAILED = 4;
}

message Job {
  string job_id = 1;
  JobPayload payload = 2;
  JobStatus status = 3;
  string enqueue_at = 4;
  string started_at = 5;
  string finished_at = 6;
  string worker_id = 7;
  string error = 8;
}

message Result {
  string job_id = 1;
  Meta meta = 2;
  bytes result_data = 3;
  string s3_key = 4;
  string produced_at = 5;
  map<string,string> extras = 6;
}
```

### Generate TypeScript stubs (protobufjs)

Install:
```
npm install protobufjs --save
```

Generate static module (recommended for runtime performance):
```
# from repo root
npx pbjs -t static-module -w commonjs -o server/src/proto/job_pb.js proto/job.proto
npx pbts -o server/src/proto/job_pb.d.ts server/src/proto/job_pb.js
```

This produces `job_pb.js` and `job_pb.d.ts` which you can `require`/`import` in Node worker and server code.

---

## Added: Node example files (wired with protobuf)

### server/src/enqueue.ts

```ts
// server/src/enqueue.ts
import Redis from 'ioredis';
import path from 'path';
import fs from 'fs';

const redis = new Redis(process.env.REDIS_URL || 'redis://redis:6379');

// load generated protobuf static module
const jobProto = require('./proto/job_pb');

export async function enqueueJob(payloadObj: any) {
  const Job = jobProto.webgpu.Job;
  const JobPayload = jobProto.webgpu.JobPayload;

  const jobId = 'job:' + Date.now().toString(36) + Math.random().toString(36).slice(2,8);

  const payloadMessage = JobPayload.create(payloadObj.payload);
  const jobMessage = Job.create({
    job_id: jobId,
    payload: payloadMessage,
    status: jobProto.webgpu.JobStatus.QUEUED,
    enqueue_at: new Date().toISOString()
  });

  const buffer = Job.encode(jobMessage).finish();

  // reliable enqueue: push to list
  await redis.rpushBuffer('queue:render:proto', Buffer.from(buffer));

  // write light metadata
  await redis.set(`job:meta:${jobId}`, JSON.stringify({ status: 'QUEUED', enqueue_at: new Date().toISOString() }));

  return jobId;
}

// simple HTTP wrapper (optional)
export async function enqueueHttp(req, res) {
  try {
    const body = req.body;
    const jobId = await enqueueJob(body);
    res.status(202).json({ jobId });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
```


### server/src/worker/mesh_worker.js

```js
// server/src/worker/mesh_worker.js
const { parentPort } = require('worker_threads');
const Redis = require('ioredis');
const path = require('path');

const redis = new Redis(process.env.REDIS_URL || 'redis://redis:6379');

// require generated protobuf static module
const jobProto = require('../proto/job_pb');
const Job = jobProto.webgpu.Job;
const Result = jobProto.webgpu.Result;

parentPort.on('message', async (msg) => {
  // msg could be a Buffer containing a Job proto
  try {
    let jobBuf = null;
    if (Buffer.isBuffer(msg)) jobBuf = msg;
    else if (msg && msg.buffer) jobBuf = Buffer.from(msg.buffer);
    else {
      parentPort.postMessage({ error: 'invalid message' });
      return;
    }

    const job = Job.decode(jobBuf);
    const jobId = job.job_id;
    parentPort.postMessage({ job: jobId, status: 'processing' });

    // Example CPU preprocess: pretend to do packing / small work
    // If job.payload.data exists, we can read it (Buffer/Uint8Array)
    const payloadData = job.payload && job.payload.data ? job.payload.data : null;

    // Simulate processing time
    await new Promise((r) => setTimeout(r, 200));

    // Create a small Result proto
    const resultObj = {
      job_id: jobId,
      meta: job.payload.meta,
      result_data: Buffer.from(JSON.stringify({ message: 'ok' })),
      produced_at: new Date().toISOString(),
      extras: { worker: process.pid.toString() }
    };

    const resBuf = Result.encode(resultObj).finish();

    // store result proto in Redis under content key
    const key = job.payload.meta && job.payload.meta.key ? job.payload.meta.key : jobId;
    await redis.setBuffer(`cache:asset:proto:${key}`, Buffer.from(resBuf));
    await redis.set(`meta:asset:${key}`, JSON.stringify({ size: resBuf.length, kind: job.payload.meta.kind || 'unknown', engineVersion: job.payload.meta.engine_version || 'v1' }));

    await redis.publish('channel:render_complete', jobId);

    parentPort.postMessage({ job: jobId, status: 'done' });
  } catch (e) {
    parentPort.postMessage({ error: e.message });
  }
});
```


### server/src/api/status.js (simple status endpoint)

```js
// server/src/api/status.js
const express = require('express');
const router = express.Router();
const Redis = require('ioredis');
const redis = new Redis(process.env.REDIS_URL || 'redis://redis:6379');

router.get('/job/:id', async (req, res) => {
  const id = req.params.id;
  const meta = await redis.get(`job:meta:${id}`);
  if (!meta) return res.status(404).json({ error: 'not found' });
  return res.json(JSON.parse(meta));
});

router.get('/asset/:key', async (req, res) => {
  const key = req.params.key;
  const buf = await redis.getBuffer(`cache:asset:proto:${key}`);
  if (!buf) return res.status(404).json({ error: 'not found' });
  res.setHeader('Content-Type', 'application/octet-stream');
  res.send(buf);
});

module.exports = router;
```

---

## How to wire generated stubs into code

1. Generate `job_pb.js` and `job_pb.d.ts` with `pbjs`/`pbts` as above.
2. Place them under `server/src/proto/` and `require('./proto/job_pb')` from worker and enqueue code as shown.
3. If you prefer dynamic decoding at runtime, use `protobufjs.load('./proto/job.proto')` and then `root.lookupType(...)` but static modules are faster.

---

## How to cache outputs of local LLMs (Gemma 3) — LangExtract / vLLM / Ollama / llama.cpp guidance

Below is an actionable plan and recommendations for caching model outputs and integrating LangExtract for structured extraction.

### 1) Which runtime to use for serving local Gemma3?
- **vLLM**: optimized for high-throughput GPU inference, batching, and prefix caching. Best when you have GPU resources and expect many concurrent requests. It supports model architectures via Hugging Face formats and is production-ready for server-side deployments.
- **Ollama**: user-friendly local model manager, easy to run Gemma 3 and other models locally. Great for quick setups and small teams, supports a REST-like API. Simpler but less throughput than vLLM.
- **llama.cpp / ggml**: lightweight, can run on CPU or in WASM in browser; good for low-resource setups or in-browser inference. Not ideal for high-performance server-side GPU serving.

**Recommendation**: For server-side production with GPU and the need to cache/combine contexts, use **vLLM** as the primary serving layer. Use **Ollama** for simpler dev workflows or as an alternative when you prefer convenience. Use **llama.cpp wasm** for browser-only, offline demos.

### 2) Where to cache outputs (and what to cache)
- **Cache keys**: content-addressable. For LLM outputs, include: `model_name`, `model_version` (weights hash), `prompt_hash` (sha256 of canonicalized prompt + system messages + temperature + top_p + other params), `context_keys` (list of embeddings keys used), and `engine_version`.
- **What to store**:
  - Full completion tokens (recommended for exact replay): store token ids as compact integers (e.g., int16/varint) and model params used.
  - Decoded text for quick lookup (UTF-8 string).
  - Extracted structured data (LangExtract outputs) as Protobuf/JSON in Redis or Postgres.
  - Embeddings / feature maps used to produce the response (for provenance + re-ranking) — store in Redis or S3 depending on size.
- **Storage locations**:
  - Small items (decoded text, token arrays, structured JSON): Redis (with TTL) or Postgres (for persistence & query).
  - Large binary (full token streams, large context windows): S3/MinIO + Redis pointer.

### 3) Integrating LangExtract
- **LangExtract** (Google project) can produce structured outputs from LLM responses. Use it as a post-processing step:
  1. Run the LLM (vLLM/Ollama) to get raw tokens/text.
  2. Feed the text + instruction to LangExtract to produce structured data (entities, tables, etc.).
  3. Store LangExtract outputs in your cache (Redis for small JSON or Postgres for large/structured storage). Include provenance fields: `model_job_id`, `prompt_hash`, timestamps.

This architecture lets you serve raw text quickly (from cache) and also query structured fields for downstream features (search, filtering).

### 4) Prefix caching and retrieval-augmented caching
- **Prefix caching**: vLLM supports caching of key/value KV caches for attention layers. If users often share the same system prompt or long prefixes, cache the KV state so decoding can resume faster. Store KV caches on disk (MMAP) or in a binary store keyed by `prefix_hash` and `model_version`.
- **RAG / embedding cache**: store embeddings for documents in `pgvector` (Postgres) or Pinecone, use them to build context. Cache the selected top-K doc keys and their concatenated prompt hash as part of the LLM cache key.

### 5) Reproducibility & determinism
- Save `generation_params` (temp, top_p, max_tokens, seed) with each cached entry. When serving from cache, ensure you can mark responses as exact-match cached vs regenerated.

### 6) Implementation sketch (Node)
- After model produces text, do:
  1. `prompt_hash = sha256(canonicalizedPrompt)`
  2. `cacheKey = sha256(model_name + model_version + prompt_hash + JSON.stringify(params))`
  3. Save small result: `redis.set(cacheKey, resultJson)` and `redis.set(cacheKey:meta, metaJson)`
  4. Optionally save large binary tokens to MinIO and store pointer in Redis.

### 7) Serving flow with LangExtract
1. Client requests generation → server computes `cacheKey`. If Redis hit → return cached. If miss → send request to vLLM/Ollama.
2. Model returns raw text → server passes text to LangExtract (local Python microservice or via gRPC) to extract structured data.
3. Store both raw text and LangExtract output in cache and Postgres (for long-term queries).
4. Return both text and structured data to client.

### 8) Do you need llama.cpp WASM?
- **Use llama.cpp WASM** only if you need in-browser inference or offline capability inside the browser. For server-side caching and high-performance GPU inference, run vLLM or Ollama on server hardware and do not rely on WASM.

---

If you want I can do the following immediately:

1. Generate the `proto/` directory and static TypeScript stubs (I already added the proto text above and pbjs instructions). I can also include a small `generate-proto.sh` script in the repo.
2. Wire the Node example files into the canvas repo (I already added examples above). I can now also add the Drizzle migration + SvelteKit API route for storing embeddings in `pgvector`.

Which of the two (1 or 2) should I output into the canvas now?"}]}
