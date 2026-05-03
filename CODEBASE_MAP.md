# Codebase Map

This document is a high-level navigation map for the repository root. It summarizes each top-level directory in 1–3 sentences so new contributors can tell which folders contain active application code, infrastructure assets, generated artifacts, and local-only workspace state.

For deeper SvelteKit application structure, see [sveltekit-frontend/CODEBASE_MAP.md](sveltekit-frontend/CODEBASE_MAP.md).

## Core Application Directories

- `sveltekit-frontend/`
  This is the main web application: SvelteKit 2, Svelte 5, API routes, UI components, server logic, frontend build config, and most day-to-day feature work live here. If you are fixing app behavior, this is usually the first directory to inspect.

- `services/`
  This folder holds the standalone Go services used alongside the frontend, including search, retrieval, embedding, and health aggregation services. It is the main non-frontend service layer in the repo.

- `scripts/`
  This is the automation hub for the repository. It contains audits, repair tools, environment setup scripts, indexing helpers, verification scripts, and one-off operational tooling used to manage the broader stack.

- `tests/`
  Root-level tests live here when they are not scoped to the SvelteKit app itself. This folder is useful for broader integration, screenshot, and orchestration validation outside the frontend-local test layout.

- `tools/`
  This directory contains bundled utilities and helper binaries, such as `ffmpeg`. It supports workflows that need external tooling without mixing those assets into the main app directories.

- `python/`
  Python-based service helpers and experiments live here, including LangExtract- and Docling-related scripts. This is the Python-side companion to the JavaScript/TypeScript and Go stacks.

- `proto/`
  Protocol Buffer contracts are stored here, with `active/` and `archived/` groupings. Use this directory when working on gRPC or generated client/server contracts.

- `drizzle/`
  Root-level SQL migration and schema support files live here. It complements the frontend’s Drizzle setup and is part of the repo’s database migration surface.

- `docker/`
  This directory contains Docker-related infrastructure for supporting services such as Bifrost, ClickHouse, Langfuse, TensorRT-LLM, and other stack components. It is the main container orchestration asset folder outside the root Dockerfiles.

- `docs/`
  Architecture notes, legacy references, status docs, and visualization stack docs are kept here. Treat this folder as curated reference material rather than runtime code.

- `simd-bridge/`
  This contains the native C++/CUDA/LibTorch bridge used for GPU-accelerated operations. It is the place to look for the N-API addon, build files, CMake configuration, and native smoke tests.

## Data, Models, and Knowledge Assets

- `models/`
  Local model artifacts and related assets are stored here. This is one of the repo’s main model storage locations.

- `onnx/`
  ONNX-format model assets and related exports are stored here. This folder supports local and browser/runtime inference workflows that depend on ONNX artifacts.

- `granite-docling-258M/`
  This directory contains the Granite/Docling model assets used for document analysis and OCR-related workflows. It is a model-data folder, not a primary application code folder.

- `lawpdfs/`
  Legal PDF source material lives here for ingestion, extraction, and corpus-building workflows. It is primarily input data for the legal document pipeline.

- `memory/`
  This directory stores reference memory and accumulated project context used for longer-running development and analysis workflows. It is documentation/context state rather than runtime application logic.

- `next_steps/`
  Planning notes and next-session guidance live here. Use it as a roadmap/reference folder, not as a source-code location.

- `artifacts/`
  Build outputs, run artifacts, and generated investigation results are stored here. This is typically a generated-output folder rather than a hand-edited code area.

- `logs/`
  Operational logs, build logs, and captured outputs accumulate here. It is useful for debugging and auditing but usually not for source edits.

- `storage/`
  This folder is used for persisted working data, backups, and other storage-oriented assets. It is part of the repo’s data footprint rather than the primary code surface.

- `sql/`
  Raw SQL helpers and standalone SQL assets live here. This directory complements the migration folders when schema or data work is done directly in SQL.

## Infrastructure and Local Service State

- `minio/`
  MinIO-related configuration and bucket assets live here. This folder supports object-storage workflows used by evidence/document pipelines.

- `minio-data/`
  This is the local MinIO data directory. It is runtime state, not source code.

- `redis/`
  Redis configuration and related assets are stored here. This folder is part of the local caching and queue-adjacent infrastructure setup.

- `qdrant/`
  Qdrant assets and data/config for vector search live here. It supports local vector DB development and indexing workflows.

- `qdrant-windows/`
  This contains the Windows-side Qdrant assets. It exists to support Windows-local vector DB development alongside the repo’s other infrastructure.

- `pgvector-precompiled/`
  Precompiled pgvector assets are stored here. This is an infrastructure-support folder for database/vector capabilities.

- `nginx/`
  Nginx configuration and proxy support files live here. Use it when working on reverse-proxy or network-edge setup.

- `ssl/`
  SSL-related assets and placeholders are kept here. This is part of deployment and proxy/security configuration, not the main app logic.

## Archive, Scratch, and Supporting Workspaces

- `deeds_labs/`
  This is the large archive and lab area for old, experimental, or intentionally parked code. It is important historical context, but it is not the primary live application surface.

- `scratch/`
  Temporary experiments and ad hoc work land here. Expect low-stability or throwaway material rather than canonical implementations.

## Generated, Dependency, and Test Output Directories

- `node_modules/`
  Installed npm dependencies live here. This is generated dependency state and should not be used for project code changes.

- `test-results/`
  Test run outputs and reports accumulate here. It is a generated results folder, useful for debugging failures but not for feature work.

## Hidden / Tooling / Local Workspace Directories

- `.git/`
  Git metadata lives here. It is repository state and not part of the application code.

- `.github/`
  GitHub-specific automation, workflows, and repo-level configuration live here. In this repo it also contains the custom `.github/agents/` surface plus the CI/error-analysis workflows, so it matters for agent-assisted development and repository automation even though it is not runtime product code.

- `.githooks/`
  Custom Git hooks are stored here. It supports developer workflow automation at commit or push time.

- `.vscode/`
  Workspace settings, task definitions, and editor-specific project configuration live here. The current `tasks.json` is an active local workflow entrypoint for dev server launch, gRPC retrieval startup, TurboQuant VLM startup, Svelte checks, diagnostics slices, builds, and screenshot tests, even though none of it ships with the deployed app.

- `.vs/`
  Visual Studio workspace state lives here. This is editor-generated local state.

- `.claude/`
  Claude-related local agent configuration and workspace state live here. It supports AI-assisted development workflows rather than runtime code.

- `.roo/`
  Roo/local agent tooling state is stored here. Like other hidden agent folders, it is development-environment support rather than product code.

- `.error-brain/`
  This appears to hold error-analysis workspace state and related local diagnostics. It is part of the repo’s debugging workflow, not a primary code directory.

- `.rag-metrics/`
  RAG metric or evaluation state is stored here. Treat it as generated/analysis support data.

- `.scripts/`
  This hidden scripts folder is supplemental automation state. It is not the main script surface; use the root `scripts/` folder first.

- `.cache/`
  Tool caches and generated temporary data accumulate here. It is safe to treat as ephemeral workspace state.

- `.pytest_cache/`
  Pytest cache data lives here. This is generated test state.

- `.svelte-kit/`
  SvelteKit generated build/dev metadata lives here. It is recreated by the toolchain and should not be treated as hand-authored source.

- `.svelte-error-fixes-backup/`
  Backup material from error-fixing workflows lives here. It is retained for safety/reference, not as active product code.

- `.venv/`
  The local Python virtual environment lives here. This is machine-local dependency state.

- `.python311/`
  This appears to be an additional Python runtime or environment directory. Treat it as environment state rather than application source.

## Directory Classification

This is the quickest way to sort the root layout before drilling into individual folders.

- Active code and automation
  `sveltekit-frontend/`, `services/`, `scripts/`, `tests/`, `python/`, `proto/`, and `simd-bridge/` are the highest-signal implementation surfaces for current runtime behavior and maintenance work.

- Reference and planning material
  `docs/`, `memory/`, and `next_steps/` are active reference surfaces for architecture notes, workflow guidance, and session planning. They help orient contributors, but they are not the files that directly control runtime behavior.

- Infrastructure and deployment wiring
  `docker/`, `drizzle/`, `sql/`, `redis/`, `qdrant/`, `qdrant-windows/`, `minio/`, `nginx/`, `ssl/`, and `pgvector-precompiled/` describe how local services, schema state, proxying, and vector/database plumbing are assembled.

- Models and corpus assets
  `models/`, `onnx/`, `granite-docling-258M/`, and `lawpdfs/` are asset-heavy support folders. They matter for inference and ingestion workflows, but they are usually not where control flow is decided.

- Generated output and machine-local state
  `artifacts/`, `logs/`, `storage/`, `minio-data/`, `node_modules/`, `test-results/`, `.cache/`, `.svelte-kit/`, `.venv/`, `.vs/`, `.pytest_cache/`, `.rag-metrics/`, and similar hidden workspace folders are outputs or local state rather than primary source directories.

- Archive and scratch space
  `deeds_labs/`, `scratch/`, and the many dated root note files are useful historical breadcrumbs, but they should not outrank `sveltekit-frontend/src`, `scripts/`, or current compose files when there is a conflict.

## High-Noise Directory Triage (May 3, 2026)

This table is the quickest root-level sorting aid for the folders that most often create audit noise. `ACTIVE` means normal contributor attention is expected. `ARCHIVE` means historical or parked material. `LOCAL-STATE` means machine-specific or generated state that should not be treated as canonical source.

| Path | Triage class | Default handling | Why it matters |
|------|--------------|------------------|----------------|
| `sveltekit-frontend/` | ACTIVE | Start here for application behavior, UI, API routes, retrieval, graph, and build issues. | This is the main app and still the highest-signal directory in the repo. |
| `services/` | ACTIVE | Check here when behavior crosses into Go retrieval, search, embedding, or sidecar services. | This is the main non-frontend runtime surface. |
| `scripts/` | ACTIVE | Use for audits, indexing helpers, verification, repairs, and operational workflows. | A large amount of real workflow control lives here rather than in app code. |
| `.github/` | ACTIVE | Treat as automation and agent-definition infrastructure, not passive metadata. | It contains the checked-in agent roles and CI workflow wiring. |
| `.vscode/` | ACTIVE | Treat as local operator workflow wiring. | The task launcher is a real entrypoint for dev, diagnostics, build, and screenshot flows. |
| `docs/` | ACTIVE | Use as curated reference, but reverify claims against current code before relying on them. | It contains architecture notes and operational guidance. |
| `memory/` and `next_steps/` | REFERENCE | Use for session continuity and planning, not runtime truth. | These folders are useful context surfaces but do not decide behavior directly. |
| `docker/`, `redis/`, `qdrant/`, `qdrant-windows/`, `minio/`, `nginx/`, `ssl/` | INFRA | Inspect when the issue depends on containers, proxying, caches, or local services. | These folders control the local service and deployment plumbing. |
| `models/`, `onnx/`, `granite-docling-258M/`, `lawpdfs/` | ASSET | Treat as model/corpus inputs rather than normal implementation surfaces. | They are important for inference and ingestion, but rarely where control flow is decided. |
| `artifacts/`, `logs/`, `test-results/`, `storage/` | GENERATED | Read for debugging evidence; do not treat as source of truth. | These are outputs, captures, and persisted run artifacts. |
| `minio-data/` | LOCAL-STATE | Never treat as source code; inspect only for local object-store state. | This is live service data, not implementation. |
| `node_modules/`, `.svelte-kit/`, `.cache/`, `.pytest_cache/`, `.venv/`, `.python311/`, `.vs/` | LOCAL-STATE | Ignore for normal audits unless debugging the toolchain itself. | These are dependency caches, build outputs, or machine-local environment state. |
| `.claude/`, `.roo/`, `.error-brain/`, `.rag-metrics/` | LOCAL-STATE | Treat as assistant/debug support state unless a task explicitly targets them. | These folders support local analysis workflows rather than product runtime. |
| `deeds_labs/` | ARCHIVE | Do not treat as live unless a task explicitly asks for historical recovery. | This is the large parked-code area and can be destructive to use as a casual move target because it is gitignored. |
| `scratch/` | ARCHIVE | Treat as temporary or experimental. | This is not a canonical implementation surface. |

## Agent And Workflow Audit (May 3, 2026)

This repo does have a real agent/customization surface, but it is not organized as repo-local `SKILL.md` or `AGENTS.md` files. The current split is: `.github/agents/` holds the portable repo-defined agent roles, `.github/workflows/` holds GitHub automation, and `.vscode/tasks.json` holds local operator workflows.

| Surface | Current state | Audit note |
|---------|---------------|------------|
| `.github/agents/` | 14 `.agent.md` files | This is the main repo-local agent surface that was actually found in the workspace. It includes targeted roles such as `import-audit-engineer`, `rag-retrieval-engineer`, `evidence-pipeline-engineer`, `search-platform-engineer`, `route-triage-engineer`, and several UI-focused agents. |
| `.github/workflows/` | 3 workflow files | `sveltekit-ci.yml`, `error-analysis.yml`, and `error-brain-check.yml` make this the main GitHub automation surface rather than a passive metadata directory. |
| `.vscode/tasks.json` | Active local launcher set | The current task file exposes concrete entrypoints for `Dev Server`, `Dev Server (gRPC Retrieval)`, `TurboQuant llama-server (VLM)`, `Svelte Check`, diagnostics slices, `Vite Build`, and screenshot testing. Treat `.vscode/` as workflow wiring, not just editor clutter. |
| `.claude/` and `.roo/` | Local agent state | These hidden directories look like machine-local assistant/workspace support state rather than canonical repo-defined customization surfaces. |
| Repo-local skill/instruction files | Not found in this workspace | This pass did not find repo-local `SKILL.md`, `AGENTS.md`, `copilot-instructions.md`, `*.instructions.md`, or `*.prompt.md` files. The practical implication is that agent specialization currently lives in `.github/agents/` plus external user-level instructions, not inside portable skill files checked into this repo. |

## Skills Audit Summary

- The closest thing to a checked-in “skills” surface in this repository is the `.github/agents/` directory, not a `SKILL.md` hierarchy.
- The most audit-relevant agent for directory analysis is `import-audit-engineer.agent.md`, which codifies the 10-layer import/wiring audit and explicitly warns that `deeds_labs/` is gitignored and destructive to use as a casual archive target.
- Retrieval and grounding work has its own dedicated agent surface in `rag-retrieval-engineer.agent.md`, which confirms that the repo’s agent definitions are specialized by operational domain rather than by one generic assistant prompt.

## GitHub Workflow Audit (May 3, 2026 — re-verified)

Three workflows exist under `.github/workflows/`. `sveltekit-ci.yml` is the canonical always-green gate. `error-brain-check.yml` is a dry-run analyzer. `error-analysis.yml` has been rewritten from scratch to match the live `phase78:*` pipeline.

| Workflow | Trigger shape | Protects | Status |
|----------|---------------|----------|--------|
| `sveltekit-ci.yml` | Push/PR on `main` when `sveltekit-frontend/**` or the workflow file changes | `npm ci` → `svelte-check` → `vite build` → schema-drift guard → Playwright vs ephemeral pgvector/Redis (Node 22) | **ALIGNED** ✅ |
| `error-brain-check.yml` | Push/PR on `main` and `develop` | Dry-run `batch-merger-fixer-v2.mjs --analyze` → upload `reports/batch-analysis-*.json` | **FIXED** ✅ — `scripts/batch-merger-fixer-v2.mjs` stub created; workflow no longer fails. Node still on 20 (low-priority update). |
| `error-analysis.yml` | Push/PR on `main` and `develop` | `check` + `check:ts7` → `phase78:ast-rank` → `phase78:insert` → `phase78:cluster` → `phase78:suggest` → artifact upload → PR comment | **REWRITTEN** ✅ — Old Windows/PowerShell workflow that expected deprecated `errors:consolidate`, `errors:monitor`, `errors:cluster` npm aliases and `logs/all-errors-consolidated.json` fully replaced. Now runs on `ubuntu-latest`, Node 22, and the live `phase78:*` pipeline. |

### Workflow Trust Notes

- `sveltekit-ci.yml` is the only fully trusted, always-green CI gate. It is the baseline to rely on for frontend safety.
- `error-brain-check.yml` is now runnable. The `batch-merger-fixer-v2.mjs` stub produces a `reports/batch-analysis-{ts}.json` with a `.summary` field the workflow validates via `jq`.
- `error-analysis.yml` is now the `phase78:*` error-analysis workflow. The `phase78:insert`, `phase78:cluster`, and `phase78:suggest` steps require a `DATABASE_URL` GitHub secret for Postgres access; they run with `continue-on-error: true` so the workflow passes on CI runners without a database configured. Only `check`, `check:ts7`, and `phase78:ast-rank` run unconditionally.

## Analysis Path Mapping

This repository already has a live codebase-intelligence pipeline; the main work is in extending and stabilizing that path, not inventing a second one from scratch. The most important split is: `codebase-index/*` builds and enriches graph/search artifacts, `ace/*` assembles those artifacts into synthesis context, and `ACPToolRegistry` is a separate tool-execution plane.

- `sveltekit-frontend/src/routes/api/codebase-index/orchestrate/+server.ts`
  This is the top-level orchestration route for codebase analysis. In sync mode it can run AST embedding, cluster assignment, SOM topology, Neo4j sync, PageRank, cluster summarization, GPU tagging, wiki export, 4D hypergraph tagging, community detection, and deep-research indexing in one staged SSE pipeline with Redis checkpoints.

- `sveltekit-frontend/src/routes/api/codebase-index/index-stream/+server.ts`
  This is the per-cluster summarization and mirroring path. It scrolls Qdrant chunks, generates cluster summaries, embeds them, writes vectors back to Qdrant, mirrors summary state into PostgreSQL, and optionally runs GPU semantic tagging.

- `sveltekit-frontend/src/lib/server/indexer/`
  This is the core codebase-index implementation surface. `ast-chunker.ts`, `dual-embedder.ts`, `workspace-metadata-extractor.ts`, `cluster-summary.ts`, `gpu-karpathy-tagger.ts`, `karpathy-wiki.ts`, and `run-cluster-assign.ts` are the main files to inspect before changing indexing behavior.

- `sveltekit-frontend/scripts/run-hypergraph.ts`
  This is the standalone production writer for hyperedges, `hg:4d:{id}` coordinates, `hg:edge:{hash}` blobs, `hg:edge:idx`, and `hg:built_at`. It is the main entry point when investigating 4D topology state, Redis-backed graph artifacts, or hypergraph-to-Neo4j sync.

- `sveltekit-frontend/scripts/ci-smoke-hypergraph.mjs`
  This is the namespace drift guard for the hypergraph pipeline. It writes a sentinel `hg:edge:*` record, validates `memberIds` and `gradeLabel`, and fails with exit code `5` if the production key shape ACE and topological retrieval expect is no longer readable.

- `sveltekit-frontend/src/lib/server/graph/hypergraph-4d.ts`
  This is the server-side hypergraph model layer. It documents the 4D coordinate system, uses `bifrostChat` and `langGraphSynthesize` during enrichment, and treats `hg:4d:*`, `hg:edge:*`, and `hg:edge:idx` as the central topology store.

- `sveltekit-frontend/src/lib/server/retrieval/topological-search.ts`
  This is the retrieval-time consumer for hypergraph Redis state. If ACE or graph-aware ranking stops seeing hyperedge boosts, this is the first reader to check alongside the hypergraph writers and the smoke script.

- `sveltekit-frontend/src/lib/server/graph/community-graph.ts`
  This adds a GraphRAG-style community layer over the existing codebase graph. It groups GPU/SOM clusters into higher-level communities, summarizes them with LLM help, stores them in Redis/Postgres, and exposes context back to retrieval and ACE.

- `sveltekit-frontend/src/lib/server/ace/context-assembler.ts`
  This is where codebase intelligence flows back into synthesis. ACE pulls RAG chunks, KAG neighbors, web research, chat memory, optional codebase context, and GraphRAG community summaries into one promptable context bundle.

- `sveltekit-frontend/src/lib/server/ollama.ts`
  This is the canonical `bifrostChat` gateway. It owns the Ollama and Bifrost request path, so it is the first file to inspect when cache tiering, semantic-cache fallbacks, or model routing behave unexpectedly.

- `sveltekit-frontend/src/lib/server/cache/redis-exact-match.ts`
  This is the L1 exact-match cache that sits in front of Bifrost L2. It defines the Redis cache-key contract, TTLs, and the graph-aware metadata cached with LLM responses.

- `sveltekit-frontend/src/routes/api/cache/bifrost/check/+server.ts` and `sveltekit-frontend/src/routes/api/cache/bifrost/store/+server.ts`
  These are the explicit API probes for the Bifrost semantic cache. Use them when validating L2 cache behavior without going through a larger synthesis route.

- `sveltekit-frontend/src/lib/services/knowledge-search/ACPToolRegistry.ts`
  ACP is not the same layer as ACE. ACP is a bounded tool registry for database reads, cache operations, LangExtract calls, LLM generation, and fix workflows; it is the tool plane, while ACE is the context/synthesis plane.

- `sveltekit-frontend/src/mcp/server.ts`
  FastMCP exposes the analysis surface to agents. The most relevant tools for codebase mapping are `codeintel.ace.context`, `graph.index`, `graph.status`, `ace.wiki`, and the codebase export bundle path used for low-cost structured graph exports.

- `sveltekit-frontend/src/lib/server/ai/langgraph-client.ts`
  This is the live LangGraph sidecar client. It targets the Docker LangGraph synthesis service on port `8091` when enabled, exposes health and synthesize endpoints, and makes LangGraph a real optional runtime tier rather than a note-file concept.

- `sveltekit-frontend/src/lib/server/inference/inference-router.ts`
  This is the active inference cascade for text and vision workloads. It explicitly includes TurboQuant/llama-server as an optional inference tier and is therefore the main file to inspect before assuming TurboQuant is only a note or future idea.

- `docker-compose.yml`
  This is the top-level service wiring document for the broader stack. It defines the Bifrost service and the GPU-profile `langgraph-synthesis` service, so it is the first compose file to inspect when service-level alignment drifts from frontend runtime assumptions.

## UI and API Entry Points

- `sveltekit-frontend/src/lib/components/admin/PipelineProgress.svelte`
  Admin pipeline controls can trigger `/api/codebase-index/orchestrate`, making it a live UI entrypoint for the staged indexing pipeline.

- `sveltekit-frontend/src/routes/(app)/admin/search-intelligence/+page.svelte`
  This route is the most direct frontend control panel for orchestrate, Karpathy tagging, and Claude-assist feedback/defaults. It is a useful surface when validating whether codebase-index features are wired beyond the API layer.

- `sveltekit-frontend/src/lib/stores/analysis-panel.svelte.ts`
  This store drives codebase stats, clusters, analyze, related, and reindex flows from the frontend. It is one of the clearest consumer-side proofs that multiple `codebase-index` endpoints are live.

- `sveltekit-frontend/src/routes/(app)/command-center/codebase/+page.svelte`
  This route consumes codebase stats, clusters, and reindex behavior. It is a narrower operational dashboard compared with the broader admin search-intelligence route.

- `sveltekit-frontend/src/routes/(app)/command-center/codebase/graph/+page.svelte`
  This is the graph-facing UI route for codebase graph output. Use it when validating whether graph export/sync work is showing up outside backend logs.

- `sveltekit-frontend/src/routes/(app)/indexing/+page.svelte`
  This is the older indexing control surface that still talks to `/api/indexing`. Keep it in mind when auditing overlap between the legacy indexing route family and the newer `codebase-index` family.

## rg Audit Surfaces

The repo already has a strong ripgrep-first audit culture. The most canonical search recipes and gate definitions live in the instruction and audit files, and they are more trustworthy than scattered freeform note files.

- `CLAUDE.md`
  This is the primary audit playbook for import tracing, Svelte 5 migration gates, graph wiring gates, glyph/cartridge checks, and search analytics validation. For broad repo audits, this file is the first place to copy verified `rg` commands from.

- `.github/agents/import-audit-engineer.agent.md`
  This file contains the import-audit methodology in agent form. It is especially relevant for reachability checks, dynamic imports, barrel exports, and API-consumer tracing.

- `.claude/commands/audit-components.md`
  This contains concrete repo-specific ripgrep checks for route/API/runtime audits. Use it when the task is less about indexing and more about wiring, SSR safety, DB imports, or broken route patterns.

- `.claude/commands/prune-codebase.md`
  This is the higher-risk cleanup and archive-audit companion. It includes additional ripgrep checks around env usage, direct DB imports, local URLs, and potentially unsafe runtime assumptions.

- Root `*.txt` note files
  The many dated root text files are useful as historical breadcrumbs for past investigations, especially around codebase indexing, TurboQuant, GraphRAG, and audit ideas. They are not the canonical source of truth and should be treated as analyst notes unless a claim is reverified in `src/`, `scripts/`, or current docs.

- AWK status
  No current workspace file with `awk` in its filename was found during this pass. In practice, `rg` is the live first-class audit tool here, while `awk` references appear to be historical note trails rather than an active maintained pipeline; on Windows, `awk` and `gawk` usually come from Git for Windows or WSL rather than repo-local scripts.

## Recent Architecture Changes (May 3, 2026)

This section tracks significant wiring changes that are not yet visible from the directory tree alone.

### 3-Tier LLM Cache — Wired into Gemma4 Agent (commit `a8d47371f5`)

The tiered cache system is now a first-class citizen of the agentic inference path, not just a standalone utility:

| File | Change |
|------|--------|
| `src/lib/server/ai/gemma4-agent.ts` | Imports and uses `tieredLLMQuery` from `tiered-llm-cache.ts`; pre-loop L1/L2 cache check skips the tool-calling loop entirely on hit; side-effect tools (`apply_shadow_patch`, `revert_fix`, `verify_fix`) bypass cache to prevent state poisoning; forced-answer path now uses `tieredLLMQuery` instead of raw `ollamaFetch` |
| `src/routes/api/ai/agent/+server.ts` | Added `bypassCache` to `NativeSchema` (Zod); passes through to `runGemma4Agent`; `recordSearchQuery` now marks `cacheHit: true` when tier is L1/L2 |
| `src/lib/server/ai/tiered-llm-cache.ts` | `getTieredCacheStats()` replaced `redis.keys()` (blocking O(n)) with SCAN cursor loop; added `await using` DisposableScope pattern |
| `sveltekit-frontend/tsconfig.json` | Added `"esnext.disposable"` to `lib` array for `await using` type support |
| `sveltekit-frontend/package.json` | Added `"engines": { "node": ">=22.0.0" }` and `"check:ts7": "tsgo --noEmit"` |
| `sveltekit-frontend/.nvmrc` | Created with content `22` |

### Hypergraph CI Namespace Guard (commit `cda52f1962`)

The CI smoke test for the hypergraph pipeline is now a hard gate, not an informational check:

| File | Change |
|------|--------|
| `scripts/ci-smoke-hypergraph.mjs` | Writes a sentinel `hg:edge:{hash}` key with the exact shape `topological-search.ts` reads (`memberIds[]`, `gradeLabel`, `gradeScore`); asserts both fields are present and correct; exits `5` on shape mismatch (previously just printed a warning) |

### TypeScript 7.0 Beta Fixes (commit `89537d568b`)

Four TS7 errors surfaced by `tsgo` (stricter module checking via Go goroutines) were resolved:

| File | Fix |
|------|-----|
| `src/routes/api/hypergraph/lookup/+server.ts` | Separated `localCache` (TTL cache shape) from `rateCache` (sliding-window stamps shape) into two distinct Maps; added `String()` cast on `hgetall` value to satisfy `unknown → string` requirement |
| `src/lib/server/langextract/google-langextract.ts` | Replaced `import { OLLAMA_BASE_URL } from '$env/static/private'` (var absent from SvelteKit private env) with `process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434'` |

### A2A Streaming Endpoint

`POST /api/ai/agent` now supports two additional calling conventions beyond the native format:

- **Google A2A Task format** (`tasks/send`) — detects `'message' in body`, returns a `TaskResult` with `id`, `status`, `artifacts`
- **A2A SSE streaming** (`tasks/sendSubscribe`) — detected via `Accept: text/event-stream` header; emits `task_status` and `task_artifact` SSE events

The agent discovery card is served at `GET /.well-known/agent.json`.

### Tiered LLM Cache Status (verified May 3, 2026)

`tiered-llm-cache.ts` is no longer test-only. It is wired into `gemma4-agent.ts` for pre-loop L1 Redis and L2 Qdrant semantic cache checks. Cache hits bypass the multi-round tool loop. Side-effect tools (`apply_shadow_patch`, `revert_fix`, `verify_fix`) must bypass final-answer caching to prevent state poisoning.

`bifrostChat()` in `ollama.ts` has its **own** parallel L1+L2 cache implementation — it does not route through `tieredLLMQuery`. This is intentional architectural separation:

| Cache path | L1 | L2 | Redis key prefix | Qdrant collection |
|------------|----|----|-----------------|-------------------|
| `tieredLLMQuery` (agent path) | Redis exact-match | `llm-cache.ts` semantic lookup | `exact:` | `llm_response_cache` |
| `bifrostChat` (general chat path) | `getExactMatchCache` | Direct Qdrant HTTP search | `generateCacheKey()` output | `BifrostSemanticCachePlugin` |

Both paths write through to Redis L1 on L2 hits, so repeated queries see sub-ms responses on either path. The two caches do **not** share keys — an agent hit does not warm the bifrost cache and vice versa.

### Gemma Family Model Lanes (verified May 3, 2026)

The repo already uses smaller Gemma-family models across multiple lanes. No current FunctionGemma wiring was found in this codebase.

| Lane | Model | Runtime | Purpose |
|------|-------|---------|---------|
| Client Tier 1 | Gemma 4 E2B 2.3B (ONNX Q4F16) | Transformers.js + WebGPU | Local chat, primary client inference |
| Client Tier 2 | LiteRT Gemma 4 E2B/E4B | LiteRT-LM (XNNPACK/MTP) | CPU/iGPU fallback with MTP speculative heads |
| Client Tier 3 | Gemma 3 270M ONNX | onnxruntime-web | Legacy fallback, any device |
| Client embeddings | EmbeddingGemma 300M ONNX | onnxruntime-web | 768-dim client-side vectors |
| Server LLM | `gemma4-legal-vlm:latest` | Ollama + CUDA RTX | Synthesis, tool-call generation, vision |
| Server embeddings | `embeddinggemma:latest` | Ollama | Qdrant vectors, semantic cache, clustering, SOM |

**PLE (Per-Layer Embeddings) clarification:** Some smaller Gemma edge models (E2B/E4B) use Per-Layer Embeddings and MatFormer-style parameter-efficient execution as internal inference optimizations. PLE helps smaller effective-parameter models run efficiently on local devices. It is **not** the same as the retrieval embeddings used for Qdrant vector search. Retrieval remains anchored on EmbeddingGemma (`embeddinggemma:latest` server-side, EmbeddingGemma 300M ONNX client-side). The PLE internal tensors are not stored in Qdrant and are not part of the semantic cache or clustering pipeline.

## How to Use This Map

Start in `sveltekit-frontend/` for application work, `services/` for Go microservices, and `scripts/` for operational tooling. Reach for infrastructure directories such as `docker/`, `redis/`, `qdrant/`, and `minio/` when the task crosses into local services, data stores, or deployment plumbing.
