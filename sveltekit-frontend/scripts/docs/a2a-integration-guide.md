# Google Agent2Agent (A2A) Protocol — Integration Guide

**Protocol**: Google Agent2Agent (A2A) v1 — [spec](https://google.github.io/A2A/specification/)  
**Status in this codebase**: ✅ Implemented (April 2026)  
**Entry points**:
- `GET /.well-known/agent.json` — AgentCard discovery
- `POST /api/ai/agent` — accepts both native format and A2A Task envelope

---

## What A2A Is

A2A is an HTTP-based protocol for agent-to-agent communication. Unlike MCP (which connects an LLM
to tools), A2A connects **agents to other agents** — enabling orchestrators to discover, invoke,
and stream results from remote agents across services or organizations.

```
MCP:  LLM ←→ tools (files, APIs, databases)
A2A:  Agent ←→ Agent (peer-to-peer orchestration)
```

An A2A agent exposes:
1. **AgentCard** at `/.well-known/agent.json` — capabilities, auth, skills
2. **Task endpoint** — accepts `Task` objects, returns `TaskResult` or SSE stream

---

## Architecture in This Codebase

```
External Orchestrator / Another Agent
  │
  ├─ GET /.well-known/agent.json          ← discover capabilities
  │    └─ src/routes/.well-known/agent.json/+server.ts
  │
  └─ POST /api/ai/agent
       ├─ { query, pipeline }              ← native format (unchanged)
       │
       ├─ { id, message: { role, parts } } ← A2A tasks/send
       │    └─ returns TaskResult JSON
       │
       └─ same + Accept: text/event-stream ← A2A tasks/sendSubscribe
            └─ returns SSE: task_status + task_artifact events
                 │
                 └─ runGemma4Agent() ← 4 tools:
                      rag_search       (Qdrant research_summaries)
                      case_search      (Postgres FTS)
                      memory_recall    (hyperedge 4D graph)
                      hyperedge_stats  (Grade A/B clusters)
```

---

## Protocol Reference

### 1. AgentCard (`/.well-known/agent.json`)

Every A2A agent publishes a discovery document at this well-known path.

```json
{
  "name": "Deeds Legal AI Agent",
  "description": "...",
  "url": "https://yourdomain.com/api/ai/agent",
  "version": "1.0.0",
  "provider": { "organization": "...", "url": "..." },
  "authentication": { "schemes": ["Bearer"] },
  "defaultInputModes": ["text/plain", "application/json"],
  "defaultOutputModes": ["application/json", "text/event-stream"],
  "capabilities": {
    "streaming": true,
    "pushNotifications": false,
    "stateTransitionHistory": false
  },
  "skills": [
    {
      "id": "legal-rag",
      "name": "Legal RAG Search",
      "description": "...",
      "tags": ["legal", "rag"],
      "examples": ["What is hearsay under FRE 801?"],
      "inputModes": ["text/plain"],
      "outputModes": ["application/json"]
    }
  ]
}
```

**Test it:**
```bash
curl http://localhost:5173/.well-known/agent.json | jq .name
# → "Deeds Legal AI Agent"
```

VS Code task: `🌐 A2A: Discover AgentCard`

---

### 2. Task Object (Request Body)

All A2A requests use a `Task` envelope:

```typescript
interface Task {
  id: string;                    // Client-generated unique ID
  message: {
    role: 'user' | 'agent';
    parts: Array<
      | { text: string }         // Text input (most common)
      | { data: Record<string, unknown> }  // Structured data
    >;
  };
  metadata?: Record<string, unknown>;  // Pass pipeline, caseId, etc.
}
```

**Example:**
```json
{
  "id": "task-20260503-001",
  "message": {
    "role": "user",
    "parts": [{ "text": "What is the best-evidence rule?" }]
  },
  "metadata": {
    "pipeline": "ace",
    "caseId": "c9b79f5d-..."
  }
}
```

**Detection**: The endpoint auto-detects A2A vs native by presence of the `message` key.

---

### 3. Non-Streaming Response (`tasks/send`)

```bash
curl -X POST http://localhost:5173/api/ai/agent \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{
    "id": "task-001",
    "message": { "role": "user", "parts": [{ "text": "Explain hearsay" }] }
  }'
```

**Response — `TaskResult`:**
```json
{
  "id": "task-001",
  "status": { "state": "completed" },
  "artifacts": [
    {
      "name": "answer",
      "parts": [{ "text": "Hearsay is an out-of-court statement..." }]
    },
    {
      "name": "metadata",
      "parts": [{ "data": {
        "toolsUsed": ["rag_search", "memory_recall"],
        "rounds": 2,
        "durationMs": 3420
      }}]
    }
  ],
  "metadata": { "pipeline": "ace" }
}
```

**Task states**: `submitted` → `working` → `completed` | `failed` | `canceled`

---

### 4. Streaming Response (`tasks/sendSubscribe`)

Add `Accept: text/event-stream` to get SSE:

```bash
curl -X POST http://localhost:5173/api/ai/agent \
  -H "Content-Type: application/json" \
  -H "Accept: text/event-stream" \
  -H "Authorization: Bearer <token>" \
  -d '{ "id": "task-002", "message": { "role": "user", "parts": [{ "text": "..." }] } }'
```

**SSE event stream:**
```
event: task_status
data: {"id":"task-002","status":{"state":"submitted"},"final":false}

event: task_status
data: {"id":"task-002","status":{"state":"working"},"final":false}

event: task_artifact
data: {"id":"task-002","artifact":{"name":"answer","index":0,"parts":[{"text":"..."}]}}

event: task_artifact
data: {"id":"task-002","artifact":{"name":"metadata","index":1,"parts":[{"data":{...}}]}}

event: task_status
data: {"id":"task-002","status":{"state":"completed"},"final":true}
```

**`final: true`** on the last `task_status` event signals stream completion.

VS Code tasks: `🌐 A2A: Send Task SSE (tasks/sendSubscribe — streaming)`

---

## Authentication

A2A uses Bearer tokens — same auth as the existing API:

```bash
# With auth token (production)
curl -H "Authorization: Bearer <jwt_token>" ...

# Dev bypass (dev server only — DEV_BYPASS_AUTH=true)
curl -H "x-dev-bypass-auth: true" ...
```

The AgentCard advertises `"authentication": { "schemes": ["Bearer"] }`.  
OAuth2 with client_credentials flow is the recommended production path for agent-to-agent auth.

---

## Calling This Agent from Another Agent (TypeScript SDK)

```typescript
// A2A client — use from any TypeScript agent/orchestrator

interface A2AClient {
  agentUrl: string;
  authToken?: string;
}

async function sendA2ATask(
  client: A2AClient,
  query: string,
  opts: { taskId?: string; pipeline?: string; stream?: boolean } = {},
): Promise<string> {
  const taskId = opts.taskId ?? `task-${Date.now()}`;
  const task = {
    id:      taskId,
    message: { role: 'user', parts: [{ text: query }] },
    metadata: { pipeline: opts.pipeline ?? 'ace' },
  };

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (client.authToken) headers['Authorization'] = `Bearer ${client.authToken}`;
  if (opts.stream)       headers['Accept'] = 'text/event-stream';

  const res = await fetch(client.agentUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify(task),
    signal: AbortSignal.timeout(120_000),
  });

  if (!res.ok) throw new Error(`A2A error ${res.status}`);

  if (opts.stream) {
    // Collect streaming answer
    let answer = '';
    const reader = res.body!.getReader();
    const dec = new TextDecoder();
    let buf = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const lines = buf.split('\n');
      buf = lines.pop() ?? '';
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        try {
          const ev = JSON.parse(line.slice(6));
          const text = ev.artifact?.parts?.[0]?.text;
          if (text) answer = text; // last answer artifact wins
        } catch { /* skip */ }
      }
    }
    return answer;
  }

  // Non-streaming
  const result = await res.json() as {
    status: { state: string };
    artifacts?: Array<{ name: string; parts: Array<{ text?: string }> }>;
  };

  if (result.status.state === 'failed') throw new Error('A2A task failed');
  return result.artifacts?.find(a => a.name === 'answer')?.parts?.[0]?.text ?? '';
}

// Usage
const answer = await sendA2ATask(
  { agentUrl: 'http://localhost:5173/api/ai/agent', authToken: myJwt },
  'What is the business records exception to hearsay?',
  { pipeline: 'ace', stream: true },
);
```

---

## Exposing a New Skill

To add a new skill to the agent:

### 1. Add the skill to the AgentCard

In [src/routes/.well-known/agent.json/+server.ts](../../src/routes/.well-known/agent.json/+server.ts):

```typescript
{
  id: 'my-new-skill',
  name: 'My New Skill',
  description: 'What it does...',
  tags: ['tag1', 'tag2'],
  examples: ['Example query'],
  inputModes: ['text/plain'],
  outputModes: ['application/json'],
}
```

### 2. Add the tool to gemma4-agent

In [src/lib/server/ai/gemma4-agent.ts](../../src/lib/server/ai/gemma4-agent.ts), add to the tools array and `executeTool` switch:

```typescript
// In TOOLS array:
{
  type: 'function',
  function: {
    name: 'my_new_tool',
    description: 'What the model should call this for',
    parameters: {
      type: 'object',
      properties: { query: { type: 'string' } },
      required: ['query'],
    },
  },
}

// In executeTool():
if (name === 'my_new_tool') {
  const results = await myNewSearch(args.query as string);
  return JSON.stringify(results);
}
```

### 3. Route skill ID → tool in A2A metadata (optional)

Pass `skillId` in task metadata to hint which tool to prioritize:
```json
{ "metadata": { "pipeline": "ace", "skillId": "my-new-skill" } }
```

---

## A2A vs MCP — When to Use Which

| Scenario | Use |
|----------|-----|
| LLM needs to call a database / API | **MCP** (`src/mcp/server.ts`) |
| External orchestrator invokes this agent | **A2A** (`/api/ai/agent`) |
| VS Code extension talks to agent | **A2A** or native format |
| Multi-agent pipeline (agent chains agent) | **A2A** |
| Single-agent tool use | **MCP** |
| Streaming result to browser | **SSE** via A2A `tasks/sendSubscribe` |

---

## Multi-Agent Orchestration Pattern

This agent can act as both **orchestrator** and **sub-agent**:

```
User Query
  │
  ▼
Deeds Legal AI Agent  (this codebase)
  │  discovers via /.well-known/agent.json
  ├──▶ Evidence Analysis Agent  (separate service)
  │       POST /api/ai/agent (A2A Task)
  │       ← TaskResult { artifacts: [{ name: 'analysis', ... }] }
  │
  ├──▶ Citation Lookup Agent   (another service)
  │       POST /api/ai/agent (A2A Task + stream)
  │       ← SSE task_artifact events
  │
  └──▶ Merge results → final answer → user
```

To orchestrate other A2A agents from inside `gemma4-agent.ts`, add an `a2a_delegate` tool:

```typescript
// In gemma4-agent.ts TOOLS array:
{
  type: 'function',
  function: {
    name: 'a2a_delegate',
    description: 'Delegate a sub-query to a specialist A2A agent',
    parameters: {
      type: 'object',
      properties: {
        agentUrl: { type: 'string', description: 'Target agent URL' },
        query:    { type: 'string' },
      },
      required: ['agentUrl', 'query'],
    },
  },
}

// In executeTool():
if (name === 'a2a_delegate') {
  const answer = await sendA2ATask(
    { agentUrl: args.agentUrl as string },
    args.query as string,
  );
  return JSON.stringify({ answer });
}
```

---

## VS Code Tasks

| Task | What it does |
|------|-------------|
| `🌐 A2A: Discover AgentCard` | Fetch `/.well-known/agent.json`, print skills |
| `🌐 A2A: Send Task (non-streaming)` | Send A2A Task, print answer + tool metadata |
| `🌐 A2A: Send Task SSE (streaming)` | Stream task_status + task_artifact events |
| `🌐 A2A: Full Protocol Test` | Discover → send in sequence |

All tasks prompt for a query string and require dev server on `:5173`.

---

## Future Integration Roadmap

### Near-term (ready to wire)
- [ ] **OAuth2 client_credentials** for production agent-to-agent auth (replace Bearer JWT)
- [ ] **`a2a_delegate` tool** in `gemma4-agent.ts` — let Gemma4 orchestrate sub-agents
- [ ] **Push notifications** — webhook URL in task metadata for async long-running tasks
- [ ] **Task cancellation** — `DELETE /api/ai/agent/:taskId` (A2A `tasks/cancel`)

### Medium-term
- [ ] **State transition history** — persist `TaskResult` to Redis/Postgres by `taskId`
- [ ] **Multi-turn tasks** — `tasks/send` with previous `taskId` for conversation threads
- [ ] **Skill routing** — map `metadata.skillId` to specific tool subsets in `runGemma4Agent`
- [ ] **A2A task queue** — RabbitMQ backend for GPU-bound tasks (avoid timeout on long queries)

### Long-term
- [ ] **Agent registry** — list of known peer agents with their AgentCards (Redis cache)
- [ ] **Federated legal AI** — multiple courthouse agents discoverable via A2A
- [ ] **tsgo LSP + A2A** — TypeScript 7.0 `tsgo --lsp` + A2A tool for IDE-native agent queries

---

## Testing Checklist

```bash
# 1. Dev server running
npm run dev

# 2. AgentCard discovery
curl http://localhost:5173/.well-known/agent.json | jq '{name,skills: [.skills[].id]}'

# 3. Native format (unchanged, no regression)
curl -X POST http://localhost:5173/api/ai/agent \
  -H "Content-Type: application/json" \
  -H "x-dev-bypass-auth: true" \
  -d '{"query":"What is hearsay?","pipeline":"ace"}' | jq .answer

# 4. A2A tasks/send
curl -X POST http://localhost:5173/api/ai/agent \
  -H "Content-Type: application/json" \
  -H "x-dev-bypass-auth: true" \
  -d '{"id":"t1","message":{"role":"user","parts":[{"text":"What is hearsay?"}]}}' \
  | jq '{state: .status.state, answer: .artifacts[0].parts[0].text}'

# 5. A2A tasks/sendSubscribe (streaming)
curl -X POST http://localhost:5173/api/ai/agent \
  -H "Content-Type: application/json" \
  -H "Accept: text/event-stream" \
  -H "x-dev-bypass-auth: true" \
  -d '{"id":"t2","message":{"role":"user","parts":[{"text":"Explain FRE 803"}]}}' \
  --no-buffer

# 6. Rate limit (21 rapid requests should get 429)
for i in $(seq 1 21); do
  curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:5173/api/ai/agent \
    -H "Content-Type: application/json" \
    -H "x-dev-bypass-auth: true" \
    -d '{"query":"test","pipeline":"ace"}'
done
```

---

## Sources

- [Google A2A Specification](https://google.github.io/A2A/specification/)
- [A2A GitHub](https://github.com/google/A2A)
- [A2A vs MCP comparison — Google Blog](https://developers.googleblog.com/en/a2a-a-new-era-of-agent-interoperability/)
- [TypeScript 7.0 — scripts/docs/typescript-7-release-notes.md](./typescript-7-release-notes.md)
- [Gemma4 agent — src/lib/server/ai/gemma4-agent.ts](../../src/lib/server/ai/gemma4-agent.ts)
- [Agent endpoint — src/routes/api/ai/agent/+server.ts](../../src/routes/api/ai/agent/+server.ts)
- [AgentCard — src/routes/.well-known/agent.json/+server.ts](../../src/routes/.well-known/agent.json/+server.ts)
