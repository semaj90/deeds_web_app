# `.opencode/tasks/` — Workspace Task Manager Layer

**Pattern**: filesystem-first task metadata (like `.DS_Store` for project managers).
**Consumers**: VS Code, OpenCode, Gemma4 agent, LangGraph workflows.
**Mirror targets**: Postgres (`workspace_tasks`, `task_semantic_packets`), Qdrant (`task_semantic_packets` collection), Redis (`agent_pickup_queue:ready`), Langfuse traces.

---

## Directory Layout

```
.opencode/tasks/
├── README.md                        (this file)
├── _index.json                      (workspace-level task index — VS Code reads this at startup)
├── _feature_labels.json             (stable feature_id ↔ semantic_path map)
├── active/
│   ├── task_<id>.json               (one file per task — full metadata)
│   └── task_<id>.summary.md         (Gemma4-generated summary, human-readable)
├── done/
│   └── task_<id>.json               (completed tasks — moved here on finish)
└── blocked/
    └── task_<id>.json               (blocked tasks)
```

## Why filesystem-first?

1. **Zero-startup dependency**: VS Code opens the workspace and immediately sees the task list — no DB connection required.
2. **Git-trackable**: task lifecycle changes show in commits, reviewable in PRs.
3. **OpenCode native**: `.opencode/` is already the OpenCode workspace root; tasks fit there naturally.
4. **Agent-friendly**: Gemma4 reads `_index.json` to find next task without query layer.
5. **DB mirror is async**: Postgres + Qdrant + Redis can lag; filesystem is always up to date.

## `_index.json` schema (workspace-level — VS Code reads this)

```json
{
  "workspace_id": "deeds-web-app",
  "version": 1,
  "updated_at": "2026-05-30T18:00:00Z",
  "tasks_by_status": {
    "todo": [{"id": "...", "title": "...", "feature_id": "ai-retrieval", "priority": "high"}],
    "doing": [],
    "blocked": [],
    "done": []
  },
  "next_ready_task_id": "...",
  "feature_label_count": 13
}
```

## `task_<id>.json` schema (per-task)

```json
{
  "id": "task_a0ccc3d0",
  "workspace_id": "deeds-web-app",
  "title": "Add health probe for TRACE MCP transport verification",
  "description": "...",
  "status": "todo",
  "priority": "high",
  "risk": "low",
  "feature_id": "ai-retrieval",
  "semantic_path": ["mcp", "trace", "health"],
  "source": "opencode",
  "source_ref": "rec_trace_mcp_verification",
  "related_file_paths": [
    "sveltekit-frontend/src/mcp/trace-mcp-server.ts",
    "sveltekit-frontend/src/routes/api/health/+server.ts"
  ],
  "qdrant_point_id": null,
  "summary_llm": null,
  "summary_model": null,
  "cluster_id": null,
  "centroid_id": null,
  "agent_pickup_ready": false,
  "created_at": "2026-05-30T01:50:15.021Z",
  "updated_at": "2026-05-30T18:00:00Z",
  "mirror": {
    "postgres_id": null,
    "qdrant_point_id": null,
    "redis_queue_key": null,
    "langfuse_trace_id": null
  }
}
```

## `_feature_labels.json` (stable feature_id catalog)

```json
{
  "version": 1,
  "labels": {
    "evidence": {"display": "Evidence Pipeline", "pillar": "evidence", "semantic_path": ["evidence"]},
    "ai-retrieval": {"display": "AI Retrieval (RAG/KAG)", "pillar": "ai-retrieval", "semantic_path": ["rag", "kag"]},
    "ai-inference": {"display": "AI Inference (LLM serving)", "pillar": "ai-inference", "semantic_path": ["llm", "gpu"]},
    "cases": {"display": "Case Management", "pillar": "cases-legal", "semantic_path": ["cases"]},
    "legal-corpus": {"display": "Legal Corpus", "pillar": "cases-legal", "semantic_path": ["legal", "statutes"]},
    "data-layer": {"display": "Database + Schema", "pillar": "data-layer", "semantic_path": ["db", "drizzle"]},
    "cache-storage": {"display": "Cache + Storage", "pillar": "cache-storage", "semantic_path": ["redis", "seaweedfs"]},
    "vector-graph": {"display": "Vector + Graph DB", "pillar": "vector-graph", "semantic_path": ["qdrant", "neo4j"]},
    "agents-mcp": {"display": "Agents + MCP Tools", "pillar": "agents-mcp", "semantic_path": ["mcp", "agents"]},
    "queue-streaming": {"display": "Queue + Streaming", "pillar": "queue-streaming", "semantic_path": ["rabbitmq", "sse"]},
    "security-middleware": {"display": "Security", "pillar": "security-middleware", "semantic_path": ["auth", "csrf"]},
    "observability": {"display": "Observability", "pillar": "analytics", "semantic_path": ["langfuse", "analytics"]},
    "platform": {"display": "Platform Cross-cutting", "pillar": "platform", "semantic_path": ["env", "config"]}
  }
}
```

## Workflow

1. **Task created** (operator / OpenCode / Gemma4 / audit):
   - Write `active/task_<id>.json` with status=todo
   - Update `_index.json` (`tasks_by_status.todo` push)

2. **Task semantically enriched** (gemma4-summarizer.mjs):
   - Generate `summary_llm` via Gemma4 (gemma4-rotorquant:latest)
   - Embed summary (embeddinggemma:latest → 768d)
   - Upsert into Qdrant `task_semantic_packets` collection
   - Update `qdrant_point_id`, `summary_llm`, `summary_model` in JSON
   - Mirror to Postgres `task_semantic_packets` table

3. **Related files attached** (qdrant-relate.mjs):
   - Vector search in `codebase_chunks_768` filtered by `cluster_id`
   - Top N results → `related_file_paths`
   - Mirror to Postgres `task_file_links`

4. **Cluster assignment** (cluster-assign.mjs):
   - Find nearest centroid → `cluster_id`, `centroid_id`
   - Mirror to Postgres `task_cluster_links`

5. **Pickup ready signal** (set agent_pickup_ready=true):
   - LPUSH to Redis `agent_pickup_queue:ready:<workspace_id>`
   - Insert Postgres `agent_pickup_queue` row

6. **Agent picks up** (OpenCode / Gemma4):
   - BRPOP from Redis queue
   - Read `task_<id>.json` for full context
   - Start Langfuse trace; write trace_id to JSON `mirror.langfuse_trace_id`
   - Execute work; emit `agent_run_events`

7. **Task done**:
   - Move `active/task_<id>.json` → `done/task_<id>.json`
   - Update `_index.json`
   - Mirror status=done to Postgres + Qdrant payload

## Storage roles (where each piece lives)

| Concern | Filesystem | Postgres | Qdrant | Redis | Langfuse | SeaweedFS |
|---|---|---|---|---|---|---|
| Task metadata (truth) | ✅ JSON files | mirror | payload | — | — | — |
| Semantic vector (768d) | — | — | ✅ vector | — | — | — |
| Hot queue | — | — | — | ✅ list | — | — |
| Trace timeline | — | mirror | — | — | ✅ traces | — |
| Big artifacts (logs, snapshots) | path ref | path ref | — | — | — | ✅ blob |
| Cluster centroids | — | mirror | ✅ payload | — | — | — |

## Reading the layer (TypeScript)

```typescript
// From sveltekit-frontend
import { TaskManager } from '$lib/server/task-semantic/task-manager';

const tasks = await TaskManager.listReady({ workspace: 'deeds-web-app', limit: 5 });
const next = await TaskManager.pickup({ agentName: 'gemma4-agent' });
await TaskManager.complete(next.id, { outcome: 'patched', files_changed: 3 });
```

## CLI helpers

```bash
# Inspect workspace task index
cat .opencode/tasks/_index.json | jq '.tasks_by_status'

# List all "todo" tasks
ls .opencode/tasks/active/

# Find next ready task
jq -r '.next_ready_task_id' .opencode/tasks/_index.json

# Get full task metadata
cat .opencode/tasks/active/task_<id>.json | jq

# Read Gemma4 summary
cat .opencode/tasks/active/task_<id>.summary.md
```
