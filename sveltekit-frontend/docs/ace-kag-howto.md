# ACE / KAG / Gemma4 — How-To Guide

**Last updated:** 2026-05-03
**Audience:** Developers running directory analysis, codebase tagging, and production-readiness audits without a SvelteKit dev server.

This is the operator's manual for the **fast AST → Redis KAG → Gemma4 → ACE** loop. Everything below is wired and proven by smoke tests in this repo.

---

## TL;DR — the 3-command happy path

```bash
cd sveltekit-frontend

# 1. Start Gemma4 inference (idempotent — skips if already running on :8090)
npm run turbo:start:detached

# 2. Build the fast AST index (Redis + docs/graph/codebase-graph.json)
npm run index:codebase:fast

# 3. Verify everything works (13 gates, ~30s)
npm run smoke:ace:gemma4
```

If 13/13 gates pass, the full path is operational. Run `npm run audit:dirs:full` next.

---

## Architecture at a glance

```
┌──────────────────────────────────────────────────────────────────────┐
│  Source files (src/lib, src/routes, ...)                             │
│        │                                                             │
│        ▼                                                             │
│  scripts/index-codebase-fast.mjs   (CPU-only AST/regex, ~5s)         │
│        │                                                             │
│        ├──► docs/graph/codebase-graph.json      (full file index)    │
│        ├──► docs/graph/codebase-map.md          (human-readable)     │
│        └──► Redis  code:index:manifest                               │
│                    code:index:tag:{word}                             │
│                    wiki:note:dir:{docId}        (24h TTL)            │
│                                                                      │
│  llama-server.exe :8090   (TurboQuant launch profile)                │
│   model: gemma4-legal-vlm GGUF + mmproj                              │
│   flags: -ngl 99 --flash-attn on -ctk q8_0 -ctv q8_0                 │
│        │                                                             │
│        ▼                                                             │
│  Gemma4 strict-JSON tagging  ────► Redis wiki:note:dir:* writes      │
│        │                                                             │
│        ▼                                                             │
│  ACE context-assembler.ts                                            │
│    └──► getDirectoryKAGContext(query, limit)                         │
│         └──► reads wiki:note:dir:* by tag → keyword/GPU-cosine rank  │
│              └──► injects "## KAG Directory Audit Notes" into prompt │
└──────────────────────────────────────────────────────────────────────┘
```

**Key cache layers** (different concerns, all coexist):

| Layer | Purpose | Speed | TTL |
|-------|---------|-------|-----|
| Redis L1 (exact-match) | SHA-256(messages) → cached completion | 5ms | 1h |
| Bifrost L2 (semantic, :3040) | Qdrant vector cosine ≥ 0.8 → cached completion | 2-5s | configurable |
| llama-server KV cache | Prompt prefix tokens reused, GPU VRAM | sub-second | wiped on restart |
| Redis general store | Wiki notes, fast-AST index, sessions | 5ms | varies |

---

## Service prerequisites

| Service | Port | Required for | How to start |
|---------|------|--------------|--------------|
| Redis | 6379 | All KAG/AST/cache features | `docker compose up redis` (or `deeds-redis-prod` container) |
| llama-server (TurboQuant) | 8090 | Gemma4 generation | `npm run turbo:start:detached` |
| Qdrant | 6333 | SOM coords for KAG ingestion (optional) | `docker compose up qdrant` |
| Bifrost | 3040 | L2 semantic cache (optional) | Go service, not required for fast-AST lane |
| SvelteKit dev | 5173 | `/api/codebase-index/summarize-dirs` ingestion | `npm run dev` (only for KAG ingest step) |

**Minimum to use this guide:** Redis + llama-server :8090. Everything else is optional and gracefully skipped.

---

## VS Code task reference (all under `Ctrl+Shift+P → Tasks: Run Task`)

### llama-server / TurboQuant — agentic prompts (no dev server)

| Task | What it does |
|------|--------------|
| `🦙 llama-server: Start Gemma4 VLM (TurboQuant :8090)` | Spawns detached llama-server.exe, waits for `/health` |
| `🦙 llama-server: Prompt Gemma4 — Directory Analysis` | Free-form question → analysis |
| `🦙 llama-server: Prompt Gemma4 — KAG Wiki Note (single dir)` | Generates structured PURPOSE/PATTERNS/GAPS/TAGS for one dir |
| `🦙 llama-server: Audit + KAG Ingest + Gemma4 Summary (full pipeline)` | 3-step: audit → POST /summarize-dirs → Gemma4 health summary |
| `🦙 llama-server: Interactive Chat with Gemma4 (terminal REPL)` | Multi-turn chat, `cache_prompt:true` reuses system prompt KV |
| `🦙 llama-server: Prompt Gemma4 — 4D SOM Topology Report` | Reads Redis SOM coords → Gemma4 cluster analysis |

### Quiet variants — log-to-file (chat-safe)

VS Code's chat session serializes terminal output. Multi-MB outputs blow up the chat. Use these for noisy runs:

| Task | What it does |
|------|--------------|
| `🤫 Quiet: Dir Audit (lib/server) → log file` | Tees full output to `logs/dir-audit-lib-server-<timestamp>.log`, shows first 80 lines |
| `🤫 Quiet: Prompt Gemma4 → log file` | Writes full Gemma4 response to `logs/gemma4-prompt-<timestamp>.log`, caps inline at 4000 chars |
| `🤫 Quiet: Full pipeline (audit + KAG + Gemma4) → log file` | All output to single timestamped log, last 60 lines inline |
| `📁 Open latest log file` | Opens the newest file from `logs/` in VS Code |

### Dir audit + KAG ingestion

| Task | What it does |
|------|--------------|
| `📂 Dir Map: Generate CODEBASE_DIRECTORY_MAP.md` | Walks 819 dirs, scores each, writes 1700-line map |
| `📂 Dir Audit: lib/server (direct LLM, no graph)` | Per-dir Gemma4 audit via TurboQuant |
| `📂 Dir Audit: routes/api (direct LLM, no graph)` | Same for API routes |
| `📂 Dir Audit + KAG Ingest: lib/server (via summarize-dirs API)` | Audits → POSTs to `/api/codebase-index/summarize-dirs` for full ingestion |

### TurboQuant — health & validation

| Task | What it does |
|------|--------------|
| `⚡ TurboQuant: Health Check` | `curl :8090/health \| python -m json.tool` |
| `⚡ TurboQuant: Test Inference (hearsay query)` | Cold inference timing |
| `⚡ TurboQuant: Cache Validation (3-run cold→warm→hot)` | Validates L1 + L2 + L3 cascade speedup |

---

## npm script reference (from `sveltekit-frontend/`)

### Indexing

```bash
npm run index:codebase:fast        # ~5s, writes JSON + Redis
npm run index:codebase:fast:plan   # also writes codebase-graph.md
npm run index:codebase:full        # GPU pipeline (heavy, requires services)
```

### Auditing

```bash
npm run audit:dirs                 # lib/server only, direct LLM
npm run audit:dirs:all             # lib + routes/api (depth 3)
npm run audit:dirs:map             # generates CODEBASE_DIRECTORY_MAP.md
npm run audit:dirs:full            # audit:dirs:all + audit:dirs:map
```

### Smoke tests

```bash
npm run smoke:fast-ast             # 6 gates  — graph JSON, Redis manifest, JSONC validation
npm run smoke:kag                  # 6 gates  — synthetic note → Redis → retrieval
npm run smoke:kag:gemma4           # 7 gates  — real Gemma4 strict-JSON contract
npm run smoke:ace                  # 12 gates — fast-ast + kag synthetic (CI safe)
npm run smoke:ace:gemma4           # 13 gates — full live verification
```

### Inference servers

```bash
npm run turbo:start                # foreground, vision + text (5.8GB VRAM)
npm run turbo:start:detached       # background, idempotent (skips if :8090 healthy)
npm run turbo:start:text:detached  # background, text-only (3.4GB VRAM)
```

---

## Gemma4 strict-JSON contract

The KAG pipeline depends on Gemma4 returning clean JSON without markdown fences or prose. Smoke `smoke:kag:gemma4` enforces this contract.

**Working prompt template:**

```
System: You are a codebase analyst. Return STRICT JSON ONLY (no prose, no markdown
        fence) with keys: summary (string, ≤300 chars), dominantTags (array of 5
        lowercase strings), auditScore (0-100). Nothing else.

User:   Directory: src/lib/server/cache
        Files: redis-exact-match.ts, dag-cache.ts, llm-cache.ts, cache-keys.ts
        Analyze for production readiness.
```

**Confirmed Gemma4 output (verified 2026-05-03):**

```json
{
  "summary": "Server-side caching layer providing Redis exact-match L1, DAG topological cache, and LLM completion cache...",
  "dominantTags": ["caching", "redis", "server-side", "performance", "typescript"],
  "auditScore": 65,
  "gaps": ["Lack of clear interface definition...", "Potential for circular dependencies..."],
  "nextSteps": ["Implement comprehensive unit tests...", "Define standard ICache interface..."]
}
```

**Key flags for stable output:**
- `temperature: 0.15` — keeps JSON structure tight
- `cache_prompt: true` — reuses system-prompt KV across calls (huge win on batch tagging)
- `max_tokens: 300-400` — enough for the 5-key contract

---

## ACE injection format

When `getDirectoryKAGContext` finds matches, ACE injects this block into the LLM prompt:

```
## KAG Directory Audit Notes
**src/lib/server/cache** (score=0.87 🔵gpu, audit=72, SOM(3,7))
Server-side caching layer providing Redis exact-match L1, DAG topological cache...
Tags: caching, redis, server-side, performance, typescript

**src/lib/server/inference** (score=0.71 🔵gpu, audit=68, SOM(2,7))
...
```

**Score legend:**
- `🔵gpu` — GPU batch cosine similarity ranking (note has `summaryEmbedding`, version ≥ 2)
- `⬜kw` — Keyword overlap fallback (legacy notes, score capped at 0.08)
- `SOM(row,col)` — 4D topology grid position (10×10 SOM)
- `audit=N` — Production-readiness score 0–100

---

## Workflows

### A. First-time setup (cold start)

```bash
# 1. Start Redis + Qdrant (Docker)
docker compose up -d redis qdrant

# 2. Start Gemma4 inference
cd sveltekit-frontend
npm run turbo:start:detached

# 3. Build fast AST index
npm run index:codebase:fast

# 4. Verify
npm run smoke:ace
# Expected: 12/12 passed
```

### B. Daily incremental — server changes only

```bash
# Re-index just the server files (~3s)
npm run index:codebase:fast

# Run audit on what changed
npm run audit:dirs

# Full smoke when in doubt
npm run smoke:ace:gemma4
```

### C. Production-readiness analysis

```bash
# 1. Full directory audit (writes plans to next_steps/active/)
npm run audit:dirs:full

# 2. Per-directory deep dive via VS Code
# Run: "🦙 llama-server: Prompt Gemma4 — KAG Wiki Note (single dir)"
# Input: lib/server/cache  (or any path under src/)

# 3. SOM topology overview
# Run: "🦙 llama-server: Prompt Gemma4 — 4D SOM Topology Report"
```

### D. CI / pre-deploy validation

```bash
# Headless, no LLM required
npm run smoke:fast-ast               # 6 gates, ~2s
npm run smoke:kag                    # 6 gates, ~1s (Redis only)

# Full live check (LLM + Redis + Qdrant)
npm run smoke:ace:gemma4             # 13 gates, ~30s
```

### E. Chat-safe noisy commands (avoid VS Code chat blowup)

```bash
# In VS Code, use the 🤫 Quiet variants instead of raw audit commands:
# - "🤫 Quiet: Dir Audit (lib/server) → log file"
# - "🤫 Quiet: Prompt Gemma4 → log file"
# - "🤫 Quiet: Full pipeline (audit + KAG + Gemma4) → log file"

# From shell, redirect manually:
npm run audit:dirs > logs/audit-$(date +%Y%m%d-%H%M%S).log 2>&1
```

---

## Troubleshooting

### `smoke:kag:gemma4` fails on Gemma4 strict JSON

**Cause:** Gemma4 returned markdown-wrapped JSON or extra prose.

**Fix:** Lower `temperature` to 0.1, tighten the system prompt with "Return ONLY a JSON object. Do not use markdown code fences." The smoke test already strips ```` ``` ```` fences but won't tolerate prose.

### `turbo:start:detached` says "TurboQuant already healthy" but :8090 doesn't respond later

**Cause:** Process died after health check (OOM, model load failure).

**Fix:** Check `nvidia-smi` for VRAM. The legal GGUF needs ~5.8GB VRAM with mmproj, ~3.4GB text-only. Use `npm run turbo:start:text:detached` if low on VRAM.

### Redis `code:index:manifest` exists but `code:index:tag:*` keys don't

**Cause:** Indexer ran before fast-AST tag extraction was wired, or `--skip-redis` was used.

**Fix:** Re-run `npm run index:codebase:fast` (without `--skip-redis`).

### `smoke:fast-ast` fails on JSONC validation

**Cause:** A VS Code task block has malformed JSON (trailing comma, unescaped quote).

**Fix:** Run `node sveltekit-frontend/scripts/tests/validate-vscode-tasks-jsonc.mjs` from repo root for a precise error offset.

### ACE returns 0 KAG results despite Redis having wiki notes

**Cause:** Query keywords don't overlap with note `summary` + `dominantTags`. Notes also need `summaryEmbedding` (version ≥ 2) for GPU ranking; legacy notes only match via keyword overlap (capped 0.08).

**Fix:** Re-run `POST /api/codebase-index/summarize-dirs` to upgrade notes to version 2 with embeddings.

### VS Code "RangeError: Invalid string length" in chat

**Cause:** Pasted a multi-MB audit/Gemma4 response into chat.

**Fix:** Use the `🤫 Quiet` variants. Open a new chat session. Paste only file paths.

---

## File reference

### Smoke tests

| File | Purpose |
|------|---------|
| [`scripts/tests/smoke-fast-ast-ace.mjs`](../scripts/tests/smoke-fast-ast-ace.mjs) | 6-gate static infra check |
| [`scripts/tests/smoke-kag-note-roundtrip.mjs`](../scripts/tests/smoke-kag-note-roundtrip.mjs) | Redis KAG roundtrip + optional Gemma4 |
| [`scripts/tests/validate-vscode-tasks-jsonc.mjs`](../scripts/tests/validate-vscode-tasks-jsonc.mjs) | JSONC parser for tasks.json |
| [`scripts/tests/bounded-output.mjs`](../scripts/tests/bounded-output.mjs) | Shared output capping helper |

### Indexer & audit

| File | Purpose |
|------|---------|
| [`scripts/index-codebase-fast.mjs`](../scripts/index-codebase-fast.mjs) | CPU-only AST indexer |
| [`scripts/tests/deep-directory-audit.mjs`](../scripts/tests/deep-directory-audit.mjs) | Per-dir Gemma4 audit with `--direct` flag |
| [`scripts/tests/generate-codebase-directory-map.mjs`](../scripts/tests/generate-codebase-directory-map.mjs) | 1700-line directory map generator |

### KAG / ACE wiring

| File | Purpose |
|------|---------|
| [`src/lib/server/graph/community-graph.ts`](../src/lib/server/graph/community-graph.ts) | `getDirectoryKAGContext()` — reads `wiki:note:dir:*`, GPU cosine + keyword fallback |
| [`src/lib/server/indexer/directory-summarizer.ts`](../src/lib/server/indexer/directory-summarizer.ts) | `ingestDirectorySummaries()` — writes to Redis + Postgres + Neo4j |
| [`src/lib/server/ace/context-assembler.ts`](../src/lib/server/ace/context-assembler.ts) | `assembleACEContext()` — injects KAG section into LLM prompt |
| [`src/routes/api/codebase-index/summarize-dirs/+server.ts`](../src/routes/api/codebase-index/summarize-dirs/+server.ts) | API: builds DirAuditEntry, fetches Qdrant SOM coords, calls ingest |

### Configuration

| File | Purpose |
|------|---------|
| [`docs/graph/codebase-graph.json`](graph/codebase-graph.json) | Full file index (2579 files) |
| [`docs/graph/codebase-map.md`](graph/codebase-map.md) | Human-readable scoreboard |
| [`docs/CODEBASE_DIRECTORY_MAP.md`](CODEBASE_DIRECTORY_MAP.md) | 819-dir scoreboard with tier indicators |
| `.vscode/tasks.json` (repo root) | All `🦙` / `🤫` / `📂` / `⚡` task definitions |
| `sveltekit-frontend/.vscode/tasks.json` | Frontend-specific tasks |

### Logs (gitignored)

```
sveltekit-frontend/logs/
  ├── dir-audit-lib-server-20260503-141523.log
  ├── gemma4-prompt-20260503-142001.log
  ├── full-pipeline-20260503-143000.log
  └── README.txt
```

---

## Naming convention notes

- **TurboQuant** in this repo = `llama-server.exe` + production launch flags (`-ngl 99 --flash-attn on -ctk q8_0 -ctv q8_0`) + health-check wrapper. **Same binary, different profile.**
- **Stable KV** = `q8_0` (always, this is the default). Experimental `turbo3` KV compression is NOT enabled — use only in benchmark tasks.
- **L1 cache** = Redis exact-match (5ms). **L2** = Bifrost semantic (2-5s). **L3** = llama-server KV (sub-second prefill skip). All three coexist; they cache different things.
- **Wiki note** = JSON document at `wiki:note:dir:{docId}` (24h TTL). **KAG context** = the rendered "## KAG Directory Audit Notes" block injected into Gemma4 prompts.

---

## Recent verification (2026-05-03)

```
$ npm run smoke:ace:gemma4

> smoke:fast-ast  →  6/6 passed   (codebase-graph.json, Redis manifest, tag keys, mode, score cap, JSONC valid)
> smoke:kag:gemma4 → 7/7 passed   (Gemma4 strict JSON, Redis SET, Redis GET, retrieval, score cap, cleanup)

Total: 13/13 gates green.
```
