# Embedding Backfill and VS Code Startup OOM Review

Date: 2026-11-12 (local)

## Finding

The VS Code folder-open backfill task currently invokes `worker:embedding:batch:dry`. The backfill entry point, `scripts/atlas/p1-embedding-backfill.mjs`, is a fail-closed report: it exits with `BLOCKED_UNQUALIFIED_SOURCE_REVISION`, `canonicalAuthority: false`, and `writesPerformed: false`. Its reported blockers are missing source/workspace revision bindings, unreconciled target columns, and missing model/producer pins. It does not call Ollama, generate vectors, or write PostgreSQL.

There were separate folder-open tasks that could create GPU or embedding load:

- `Dev Server (GPU, detached)` starts `npm run dev:gpu`.
- `Startup: Semantic Valkey Smoke` calls `/api/embed` and falls back to Ollama `/api/embeddings` with `embeddinggemma:latest`; the request can load that model on demand.
- `Startup: Daily Graphify Gate + Karpathy GPU` runs the admitted Karpathy GPU enrichment after its Graphify gate.

Those three tasks now use `runOn: userRequest`. The backfill admission preview remains `runOn: folderOpen` and remains no-write.

## OOM attribution

The previously captured failure was `tsgo` failing a Windows `VirtualAlloc` request with `errno=1455`. That is a system virtual-memory/commit failure from the native TypeScript check, not a CUDA out-of-memory report. It happened in an environment with concurrent services and GPU processes, so resource contention is plausible, but the available evidence does not prove Ollama caused that specific failure.

At this review, the Ollama process was a child of `ollama app.exe`, whose parent was Windows Explorer; this does not show VS Code launched Ollama. `ollama ps` showed no loaded Ollama model. `nvidia-smi` reported an RTX 3060 Ti with 8,192 MiB total, 7,148 MiB used, and 877 MiB free at the time sampled. This is a momentary reading and does not identify which process caused the prior `VirtualAlloc` failure.

## Embedding fallback boundary

The active `generateEmbeddings` implementation attempts configured OpenAI-compatible HTTP, optional gRPC, optional QUIC/NATS, then HTTP batch/sequential Ollama. If those attempts fail, it throws `EmbeddingGenerationError`; this path does not invoke the documented local ONNX fallback. The batch-to-sequential retry is transport fallback, not a graceful CPU/model fallback. It may retry against the same Ollama-backed provider.

Do not silently substitute a different model or execution artifact for canonical backfill. Until the model artifact revision and producer are pinned and parity is proven, the correct behavior is to block. A future low-memory fallback must use the same qualified model representation or remain a non-canonical challenger with its own receipt.

## Verification performed

- Read `.vscode/tasks.json`, the backfill entry point, `dev-gpu-runtime.mjs`, the semantic Valkey smoke, and `src/lib/server/grpc/embedding-client.ts`.
- Read-only `ollama ps`: no loaded model was listed.
- Read-only `nvidia-smi`: 8,192 MiB total, 7,148 MiB used, 877 MiB free, 33% utilization.
- Parsed `.vscode/tasks.json` with `jsonc-parser`; the three high-resource tasks report `userRequest` after the edit.
- `git diff --check -- .vscode/tasks.json`: exit code 0.
- No Ollama model was started, no embedding/backfill was run, and no database or GPU workload was launched.

## GAN status

- **CREATED:** Backfill admission guard, embedding provider chain, VS Code startup tasks.
- **WIRED:** The folder-open backfill task reaches only the dry admission preview. Separate startup tasks could call Ollama or start GPU work; those are now manual.
- **PROVEN:** The admission preview's source reports a fail-closed/no-write state; current task configuration parses and points high-resource tasks to manual invocation. The previous compiler OOM is recorded as `VirtualAlloc`/`errno=1455`.
- **DONE:** No. Embedding production and backfill remain blocked until source revision, target column, and exact model/producer revisions are qualified. The cause of the previous compiler OOM is not proven.

## Structured handoff

- **likely_cause:** Automatic VS Code startup could overlap GPU development and Ollama-backed embedding smoke work with the native checker, while the observed `tsgo` failure itself is a Windows system-memory allocation failure whose specific cause is unproven.
- **evidence:** `.vscode/tasks.json`; `scripts/atlas/p1-embedding-backfill.mjs`; `sveltekit-frontend/scripts/startup/dev-gpu-runtime.mjs`; `sveltekit-frontend/scripts/tests/smoke-semantic-valkey.mjs`; `sveltekit-frontend/src/lib/server/grpc/embedding-client.ts`.
- **patch_targets:** `.vscode/tasks.json`.
- **safe_next_command:** `git diff -- .vscode/tasks.json`.
- **smoke_command:** `node -e "const fs=require('fs');const j=require(require.resolve('jsonc-parser',{paths:['./sveltekit-frontend']}));const e=[];const x=j.parse(fs.readFileSync('.vscode/tasks.json','utf8'),e,{allowTrailingComma:true});if(e.length)process.exit(1);for(const n of ['Dev Server (GPU, detached)','🧪 Startup: Semantic Valkey Smoke','🌅 Startup: Daily Graphify Gate + Karpathy GPU (gated, 24h cycle)'])if(x.tasks.find(t=>t.label===n)?.runOptions?.runOn!=='userRequest')process.exit(2);console.log('startup resource gates OK')"`.
- **report_path:** `docs/reports/embeddinggemma-backfill-startup-oom-review-20261112.md`.
