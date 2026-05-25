# OpenCode Iteration Guide — Cache-First Repo Search, Tool Hygiene, and Phase Testing

## Purpose

This guide keeps OpenCode/Gemma4 from overloading context, repeatedly asking for paths, or looping on broken tools. It turns repo work into a deterministic workflow:

```txt
cache → atlas → rg/glob → compact sourceRefs → targeted read → test → JSONL memory
```

Use this alongside `opencode.json`, `.opencode/command/*.md`, `.opencode/skills/*/SKILL.md`, Redis, Qdrant, Postgres, and the Documents Atlas.

---

## Core Rules

1. Do not load large `.md` or `.txt` files into context.
2. Do not ask the user for paths if the repo can be searched.
3. Use Redis/cache/Atlas first.
4. Use `rg --files` and `rg -n` before any read.
5. Read exact line ranges only after path mapping.
6. Never rewrite `AGENTS.md`; append only if missing and log runtime history to JSONL.
7. If a tool loops or fails, switch strategy and log the stuck event.
8. Gemma4 is the reasoning/synthesis model; OpenCode controls execution.

---

## Recommended `opencode.json` Shape

Keep `opencode.json` focused only on OpenCode-valid config:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "model": "gemma4-local/gemma4-local",
  "small_model": "gemma4-local/gemma4-local",
  "default_agent": "antigravity",
  "shell": "pwsh.exe",
  "provider": {
    "gemma4-local": {
      "npm": "@ai-sdk/openai-compatible",
      "name": "Gemma4 Local",
      "options": {
        "baseURL": "http://127.0.0.1:8090/v1",
        "apiKey": "local"
      },
      "models": {
        "gemma4-local": {
          "name": "Gemma4 Local"
        }
      }
    }
  },
  "mcp": {
    "trace": {
      "type": "remote",
      "url": "http://127.0.0.1:8788/mcp",
      "enabled": true
    },
    "turbovec": {
      "type": "remote",
      "url": "http://127.0.0.1:8791/mcp",
      "enabled": true
    },
    "engram": {
      "type": "remote",
      "url": "http://127.0.0.1:8792/mcp",
      "enabled": true
    },
    "langextract": {
      "type": "remote",
      "url": "http://127.0.0.1:8793/mcp",
      "enabled": true
    }
  },
  "instructions": ["AGENTS.md"],
  "share": "disabled"
}
```

Do **not** put docs/resource registries in `opencode.json`.

Move those to:

```txt
docs/atlas/programming-doc-sources.json
```

---

## Context Budget Layout

```txt
AGENTS.md
  static rules only; keep short

.opencode/skills/*/SKILL.md
  large procedural logic, loaded on demand

.opencode/command/*.md
  reusable slash workflows

memory/facts/*.jsonl
  runtime learning and attempts

memory/subagents/subagent-log.jsonl
  subagent work logs

Redis
  hot cards, recent failures, cache hits

Postgres
  durable feature registry, atlas cards, documents atlas

Qdrant/TurboVec
  semantic retrieval and clustering
```

---

## Cache-First Search Order

When OpenCode needs repo context, use this order:

```txt
1. Redis hot cache
2. Postgres feature registry / atlas tables
3. Qdrant / TurboVec semantic cluster
4. JSONL memory facts
5. rg exact search
6. targeted file read
7. Gemma4 synthesis
```

---

## PowerShell Search Patterns

### Find candidate files

```powershell
rg --files | rg "mapreduce|feature|atlas|qdrant|reduce|index"
```

### Search scripts and package aliases

```powershell
rg -n "feature:atlas|map:features|reduce:features|index-features|mapreduce" package.json .\sveltekit-frontend\package.json
```

### Search implementation references

```powershell
rg -n -C 2 "feature_registry|featureKey|sourceRefs|qdrant|mapreduce|summary-card|codebase-summary" scripts src docs .opencode
```

### Sidecar migration audit

```powershell
rg --files drizzle | rg "0013_codeintel_indexes|0016_codeintel_schema|0016_courtroom_3d_animation|0018_output_meta_manifold4|0019_llm_context_cache"

rg -n -C 3 "CREATE TABLE|ALTER TABLE|CREATE INDEX|DROP TABLE|DROP INDEX|INSERT INTO|UPDATE " drizzle
```

### Query prior stuck events

```powershell
rg -n "feature:atlas|missing script|blocked|duplicate_tool_call|search.hybrid" memory
```

---

## Missing Script Workflow

If an npm script fails with `Missing script`, OpenCode must not ask for paths.

Run:

```powershell
rg --files | rg "mapreduce|feature|atlas|qdrant|reduce|index"

rg -n "feature:atlas|map:features|reduce:features|index-features|mapreduce" package.json .\sveltekit-frontend\package.json

rg -n -C 2 "feature_registry|featureKey|sourceRefs|qdrant|mapreduce|summary-card" scripts src docs .opencode
```

Return:

```json
{
  "diagnosis": "documented script is not wired in package.json",
  "existingScripts": [],
  "candidateFiles": [],
  "missingAliases": [],
  "packageJsonScriptsToAdd": {},
  "doNotEditYet": true
}
```

---

## OpenCode Commands to Maintain

Create or keep these short command files:

```txt
.opencode/command/repair-missing-npm-script.md
.opencode/command/recover-when-lost.md
.opencode/command/audit-sidecar-migrations.md
.opencode/command/mcp-health.md
.opencode/command/phase9-test.md
.opencode/command/feature-atlas.md
.opencode/command/log-subagent.md
```

Commands should be short. Heavy instructions belong in skills.

---

## Skills to Maintain

```txt
.opencode/skills/context-budget/SKILL.md
.opencode/skills/recover-when-lost/SKILL.md
.opencode/skills/drizzle-schema-review/SKILL.md
.opencode/skills/trace-mcp-tooling/SKILL.md
.opencode/skills/feature-atlas/SKILL.md
```

### Required Skill Rule

```md
Before reading:
1. Check Redis/Atlas/JSONL memory.
2. Use rg/glob.
3. Return sourceRefs.
4. Only then read exact line ranges.
```

---

## Lost-Agent Recovery Hook

Trigger when:

```txt
- repeated identical tool call
- missing script
- tool not found
- MCP unavailable
- asking user for path
- context overflow
- `Could not find oldString`
```

Recovery loop:

```txt
log JSONL → check Redis → search JSONL → rg path map → compact card → retry once
```

### JSONL log format

```json
{
  "ts": "2026-05-23T21:30:00Z",
  "agent": "opencode",
  "subagent": "trace-audit",
  "task": "repair feature atlas script",
  "status": "blocked",
  "reason": "missing script",
  "query": "feature:atlas",
  "toolsTried": ["npm run feature:atlas"],
  "sourceRefs": [],
  "nextAction": "search package.json and scripts with rg",
  "confidence": 0.42
}
```

---

## Post-Write Memory Hook

After any write/edit:

1. Do not update `AGENTS.md` with runtime history.
2. Append one event to:

```txt
memory/subagents/subagent-log.jsonl
```

3. Include:
   - target file
   - write type
   - marker/section
   - sourceRefs
   - command/tool used
   - result
   - next query

Example:

```powershell
node scripts/agent/log-subagent.mjs opencode post-write "append Lost Agent Recovery" success "section already existed or was appended safely"
```

---

## Safe `AGENTS.md` Update Policy

Never rewrite `AGENTS.md`.

Append only if a durable rule section is missing:

```powershell
$path = "AGENTS.md"
$marker = "## Lost Agent Recovery"

$content = Get-Content $path -Raw

if ($content -notlike "*$marker*") {
  Add-Content $path @"

## Lost Agent Recovery

If an agent gets lost, repeats itself, asks for paths, or hits missing scripts:

1. Do not ask the user to paste files.
2. Use rg/glob first.
3. Search Redis/JSONL facts before broad reads.
4. Build compact sourceRef cards.
5. Log the failure to memory/subagents/subagent-log.jsonl.
6. Do not modify AGENTS.md again for runtime history.

"@
  Write-Output "APPENDED_LOST_AGENT_RECOVERY"
} else {
  Write-Output "SECTION_ALREADY_EXISTS_NO_CHANGE"
}
```

---

## MCP Health Procedure

Run from Windows PowerShell:

```powershell
Test-NetConnection 127.0.0.1 -Port 8788
Test-NetConnection 127.0.0.1 -Port 8791
Test-NetConnection 127.0.0.1 -Port 8792
Test-NetConnection 127.0.0.1 -Port 8793
```

If sidecars fail:

```powershell
Set-Location C:\Users\james\Videos\deeds-web-app\sveltekit-frontend
npm run mcp:opencode-sidecars
```

If TRACE fails:

```powershell
npm run mcp:trace
```

Expected:

```txt
trace       8788
turbovec    8791
engram      8792
langextract 8793
```
---
## Phase 9 Testing Checklist
### Test A — Loop Prevention
Prompt:

```txt
search feature atlas
```

Expected:

```txt
no repeated search.hybrid
no infinite tool loop
fallback to reasoning or rg
```
### Test B — Tool Execution

Prompt:

```txt
expand graph neighbors for entity_edges
```

Expected:

```txt
tool call parsed once
graph expansion executes once
no repeat
```

### Test C — Failure Intelligence

Prompt:

```txt
feature:atlas missing script
```

Expected:

```txt
Atlas failure card used
known fix suggested
JSONL stuck event written
no repeated tool loop
```

### Test D — DAG Retry

Prompt:

```txt
run script that does not exist
```

Expected:

```txt
attempt 1 fails
attempt 2 changes strategy
attempt 3 suggests fix or stops
```

### Test E — SIMD Fallback

```powershell
node test-phase8-loop.mjs
```

Expected:

```txt
no crash
fallback JSON.parse works if simd_bridge.node missing
memory/clusters/graph_analysis_ready.json is written
```

---

## Tool Loop Guard Pattern

Use in the Gemma4/OpenCode adapter:

```ts
const seen = new Set<string>();

function preventLoop(toolCall: unknown) {
  const key = JSON.stringify(toolCall);

  if (seen.has(key)) {
    return {
      stop: true,
      reason: "duplicate_tool_call"
    };
  }

  seen.add(key);
  return { stop: false };
}
```

Strategy switch:

```ts
function adjustStrategy(ctx: any, result: string) {
  if (result.includes("duplicate_tool_call")) {
    ctx.strategy = "no_tools";
  }

  if (/timeout/i.test(result)) {
    ctx.strategy = "reduce_context";
  }

  if (/missing/i.test(result)) {
    ctx.strategy = "rg_search";
  }

  if (/mcp.*offline|failed to get tools/i.test(result)) {
    ctx.strategy = "fallback_search";
  }

  return ctx;
}
```

Tool gate:

```ts
function shouldUseTool(query: string, ctx: any) {
  if (ctx.strategy === "no_tools") return false;
  if (/search|find|rg/i.test(query)) return false;
  if (/error|fail|missing|timeout/i.test(query)) return false;
  if (/graph|expand|neighbors/i.test(query)) return true;
  return false;
}
```

---

## Phase 10 Checklist
Only start Phase 10 after Phase 9 loop control is stable.
### Reinforcement Loop
- [ ] Create `src/lib/server/ai/learning-loop.ts`
- [ ] Track fix successes
- [ ] Track fix failures
- [ ] Store weights in Redis
- [ ] Do not mutate prompts automatically without review
### Prompt Delta Registry
- [ ] Store prompt deltas separately
- [ ] Link each delta to sourceRefs
- [ ] Promote only after repeated success
- [ ] Keep rollback history
### Distributed Agent Workers
- [ ] Create `src/lib/server/ai/agent-worker.ts`
- [ ] Use RabbitMQ first
- [ ] NATS later if needed
- [ ] Listen for `agent.task.execute`
- [ ] Run DAG locally
- [ ] Publish result event
### GPU Embedding Compression
- [ ] Start with Python TurboVec/cuVS sidecar
- [ ] Keep C++/N-API later
- [ ] Keep Qdrant canonical
- [ ] Store compressed artifact metadata
### Schema Auto-Evolution
- [ ] Create `scripts/atlas/auto-schema-evolution.mjs`
- [ ] Scan repeated JSONB keys in atlas cards
- [ ] Draft sidecar migration only
- [ ] Never auto-apply migration
- [ ] Maintain sidecar manifest
---
## Best Operating Principle

```txt
OpenCode = executor
Gemma4 = reasoner
Redis = hot memory
Postgres = durable truth
Qdrant/TurboVec = semantic recall
JSONL = learning trail
Atlas = compressed knowledge
```

Do not let any single layer become the whole system.

"models":[{"name":"gemma4-legal.gguf","model":"gemma4-legal.gguf","modified_at":"","size":"","digest":"","type":"model","description":"","tags":[""],"capabilities":["completion","multimodal"],"parameters":"","details":{"parent_model":"","format":"gguf","family":"","families":[""],"parameter_size":"","quantization_level":""}}],"object":"list","data":[{"id":"gemma4-legal.gguf","aliases":[],"tags":[],"object":"model","created":1779672682,"owned_by":"llamacpp","meta":{"vocab_type":2,"n_vocab":262144,"n_ctx_train":131072,"n_embd":2560,"n_params":7518069290,"size":5319465128}}]}
