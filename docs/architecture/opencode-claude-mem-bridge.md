# OpenCode Claude-Mem Bridge

This repo uses Claude-Mem only as an OpenCode observation source. It is not a canonical memory backend.

## What It Installs

Nothing new at runtime.

- The OpenCode plugin already lives in the user config at `C:\Users\james\.config\opencode\plugins\claude-mem.js`.
- The bridge uses the repo-local Node helper at `scripts/opencode/post-memory.mjs`.
- The helper uses packages already present in the repo, including `node-fetch`.
- There is no nginx requirement for this bridge.
- There is no `npx` install step for the bridge itself.

## Data Flow

```text
OpenCode / Claude-Mem observation
→ POST /api/memory/claude-mem
→ Postgres agent_memory_observations
→ EmbeddingGemma 768d embedding
→ Qdrant agent_memory_observations
→ Redis ace:memory:claude-mem:latest
→ ACE / NES cards
```

## Invocation

Use the helper directly:

```powershell
node scripts/opencode/post-memory.mjs --file .tmp\observation.json
```

Or pipe JSON:

```powershell
Get-Content .tmp\observation.json | node scripts/opencode/post-memory.mjs
```

The OpenCode command template lives at:

- [`.opencode/command/post-memory.md`](</C:/Users/james/Videos/deeds-web-app/.opencode/command/post-memory.md>)

The repo-level alias is:

```powershell
npm run opencode:post-memory -- --file .tmp\observation.json
```

## Behavior

- best-effort only
- 1500ms timeout in the plugin-side mirror
- skips silently or logs once if SvelteKit is down
- never stores hidden reasoning
- never makes SQLite canonical

## Canonical Lane Boundaries

Keep these separate:

- `agent_observations` = OpenCode timeline and progressive session notes
- `agent_memory_observations` = Claude-Mem/OpenCode mirrored observations
- `intent_synthesis` = sanitized synthesis outputs
- `intent_synthesis_rewards` = reward and feedback loop

Current memory hierarchy:

1. Postgres as durable memory truth
2. pgvector as durable semantic recall for canonical rows
3. Qdrant for semantic search and tag-based recall
4. Redis for hot latest memory and cached summaries
5. ACE / NES for prompt-facing context cards
6. `llm_synthesis` for sanitized agentic-thinking summaries and synthesis logs

Operational rules:

- use the existing Karpathy-indexed Redis cache as the hot retrieval lane for authority and cluster overlays
- keep Redis Agent Memory Server as an isolated Redis 8 evaluation lane only
- treat MCP as a tool/interface layer, not the durable memory store
- keep GPU / WebGPU / CUDA acceleration as later optional work
- keep DuckDB analytical work as later optional work, not a new source of truth
- keep LangGraph optional for later stateful branching only
- maintain 768d canonical writes; legacy 384d tables stay compat-only until a migration/backfill plan exists

## What To Label

Use stable labels in the observation payload so feature mapping does not drift:

- `source`
- `ide`
- `session_id`
- `observation_id`
- `project_path`
- `summary`
- `tags`
- `source_refs`
- `tool_calls`
- `raw_json`

Keep canonical feature IDs in the atlas/feature-registry lane. Do not invent new feature labels in the memory bridge unless the registry is updated too.

## OpenCode Packet Shape

Use explicit packets so the bridge stays deterministic:

```json
{
  "goal": "what the agent is trying to accomplish",
  "context": "short operational context",
  "files": ["absolute-or-repo-relative file paths"],
  "constraints": ["safety and canonical-lane constraints"],
  "mcp": ["which MCP lanes are relevant"],
  "plan": ["small ordered steps"]
}
```

Keep prompt-cache prefixes free of raw code dumps. Prefer summaries, file references, and generated cards.
Prefer `rg`, globbing, and narrow file hits before opening new `.md` files end to end.
Use vector search for single-fact lookups and agentic search for code navigation.

## Agentic Thinking Rule

Use OpenCode to emit compact observation packets, not long context dumps.

- store the observation record in `agent_memory_observations`
- store the sanitized summary or model-level synthesis in `llm_synthesis`
- keep raw hidden reasoning out of both lanes
- use Qdrant for semantic meaning search over the curated summary set
- use Redis hot keys for the latest card and recent overlay only
- use ACE / NES cards for the tool-facing context that the model should see next
- when the corpus is tiny, feed prompt engineering from HyperGraph RAG plus tricubic search instead of stuffing the prompt

## Roadmap Notes

The 768d -> 64d autoencoder / SOM lane already exists in code and tests:

- centroid promotion
- cluster stabilization
- JSON graph stabilization
- validation remains the active work item

## Port and Listener Audit

Audit the actual listeners before assuming a lane is up.

```powershell
netstat -ano | findstr ":5173"
netstat -ano | findstr ":37777"
netstat -ano | findstr ":8788"
netstat -ano | findstr ":8791"
netstat -ano | findstr ":8792"
netstat -ano | findstr ":8793"
```

Current lanes to keep separate:

- `5173`: SvelteKit memory API
- `37777`: Claude-Mem worker, if used
- `8788`: TRACE MCP
- `8791-8793`: optional MCP sidecars and related drift cleanup
- `6380/8010/9010`: isolated Redis 8 eval lane

## Audit Plan

Use this order for stack-wide verification:

1. OpenCode startup gate
2. Claude-Mem smoke
3. Redis 8 eval smoke
4. Postgres/Qdrant/Redis round-trip
5. MCP/TurboVec transport drift cleanup
6. feature-label registry alignment
7. broader schema and test cleanup

## Future Acceleration Backlog

- Phase 10B: TurboVec + Qdrant optimization
- Phase 11: cuVS / CUDA sidecar benchmark
- Phase 12: CUDA streams / tensor bridge / RNN experiments
- Phase 13: graph synthesis + feature MapReduce
- Phase 14: DuckDB + LangGraph + Langfuse
- Phase 15: feature labeling + pruning
- Phase 16: implement missing features

## Semantic Index Lane

Make the codebase semantic indexer a first-class operational lane:

- add a `codebase:semantic-index` alias
- add `--smoke` and `--report` modes
- emit stable report files for semantic index health and checklist mining
- keep `.md` / `.txt` checklist extraction in the same semantic lane
- detect empty checklist items (`[ ]`) and surface missing work as task candidates
- keep startup task regeneration tied to verified semantic index outputs
- keep summary archive sources updated in place

Recommended report sources:

- `docs/graph/batch-gpu-analysis-report.json`
- `docs/graph/codebase-map.md`
- `memory/atlas/codebase-atlas.latest.md`

Useful commands:

```powershell
npm run opencode:startup:mcp
npm run memory:claude-mem:smoke
npm run smoke:redis8-eval
npm run memory:agent-observation:smoke
```

## Related Docs

- [`docs/security/CLAUDE_MEM.md`](</C:/Users/james/Videos/deeds-web-app/docs/security/CLAUDE_MEM.md>)
- [`docs/operations/stack-audit-playbook.md`](</C:/Users/james/Videos/deeds-web-app/docs/operations/stack-audit-playbook.md>)
