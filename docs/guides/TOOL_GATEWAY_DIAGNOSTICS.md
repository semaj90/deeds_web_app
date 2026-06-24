# Tool Gateway Diagnostics Guide

**Purpose**: Trace tool invocation failures through the bounded tool gateway and Gemma4 agent dispatcher.

## Quick Start

### 1. Check Tool Status

```bash
# Get summary of all tool calls
curl http://localhost:5173/api/agent/rpc?diagnostic=summary

# Expected output:
# {
#   "totalRequests": 42,
#   "successCount": 38,
#   "failureCount": 4,
#   "toolDistribution": { "rag_search": 25, "case_search": 12, ... },
#   "errorDistribution": { "Unknown tool": 2, "Timeout": 2 },
#   "averageDurationMs": 245
# }
```

### 2. View Full Diagnostic Log

```bash
# Get last 100 diagnostic entries
curl http://localhost:5173/api/agent/rpc?diagnostic=log

# Filter by tool name
curl "http://localhost:5173/api/agent/rpc?diagnostic=log&tool=rag_search"

# Filter by phase
curl "http://localhost:5173/api/agent/rpc?diagnostic=log&phase=execute"
```

### 3. Export Full Report

```bash
# Get complete report with log + summary
curl http://localhost:5173/api/agent/rpc?diagnostic=report > tool-report.json
```

### 4. Clear Diagnostics

```bash
# Reset the log
curl -X POST http://localhost:5173/api/agent/rpc \
  -H "Content-Type: application/json" \
  -d '{"method":"tools/diagnostics","params":{"type":"clear"}}'
```

## Diagnostic Phases

Each tool invocation is traced through these phases:

| Phase | Meaning | Typical Issues |
|-------|---------|----------------|
| **request** | RPC endpoint received the call | Malformed JSON, missing method |
| **parse** | Arguments extracted and validated | Type mismatches, invalid structure |
| **route** | Dispatcher selected (tool-registry / gemma4-agent / trace-mcp) | Unknown tool, registration missing |
| **validate** | Arguments checked against schema | Missing required params, bad types |
| **dispatch** | Actual function invocation starts | Unregistered tool, handler crash |
| **execute** | Function running (captures duration + errors) | Timeout, DB failure, external service down |
| **result** | Response normalized to JSON-RPC format | Serialization error, large result |

## Common Error Patterns

### Pattern 1: "Unknown tool" at Dispatch Phase

```json
{
  "phase": "dispatch",
  "toolName": "my_tool",
  "success": false,
  "error": "Unknown tool: my_tool. Available: topology-status, packet-search, startup-briefing"
}
```

**Diagnosis**: Tool not registered in `tool-registry.ts`

**Fix**:
1. Check tool is imported in `register-tools.ts`
2. Verify tool calls `registerTool()` in its module
3. Restart dev server to reload tool registration

### Pattern 2: Timeout at Execute Phase

```json
{
  "phase": "execute",
  "toolName": "rag_search",
  "success": false,
  "durationMs": 12000,
  "error": "VRAM contention: embedding unavailable"
}
```

**Diagnosis**: Embedding service overloaded or crashed

**Fix**:
1. Check Ollama is running: `curl http://localhost:11434/api/tags`
2. Check GPU memory: `nvidia-smi`
3. Reduce concurrent requests or batch size

### Pattern 3: Routing to Wrong Dispatcher

```json
{
  "phase": "route",
  "toolName": "trace.kag_search",
  "message": "Routed to unknown: tool not in registry and TRACE_MCP_URL not set"
}
```

**Diagnosis**: MCP tool but TRACE MCP server not running or URL not configured

**Fix**:
1. Set `TRACE_MCP_URL` in `.env`: `TRACE_MCP_URL=http://localhost:8788`
2. Start TRACE MCP server: `npm run mcp:server`
3. Verify it's accessible: `curl http://localhost:8788/mcp -X POST -d '{"method":"tools/list"}'`

### Pattern 4: Validation Failure

```json
{
  "phase": "validate",
  "toolName": "topology_search",
  "success": false,
  "details": {
    "issues": ["Missing required parameter: query", "radius must be between 0.05 and 2.0"]
  }
}
```

**Diagnosis**: Arguments don't match schema

**Fix**:
1. Check tool definition in `gemma4-agent.ts` or `tool-manifest.ts`
2. Verify required parameters are provided
3. Check parameter types match schema (string, number, enum, etc.)

## Real-World Debugging Example

**Scenario**: Gemma4 calls `rag_search` but gets an error.

**Step 1: Check Summary**
```bash
curl http://localhost:5173/api/agent/rpc?diagnostic=summary
# → "rag_search": 5 calls, 3 failed
```

**Step 2: View rag_search Log**
```bash
curl "http://localhost:5173/api/agent/rpc?diagnostic=log&tool=rag_search"
# → [5 entries, showing request → parse → dispatch → execute → result]
```

**Step 3: Identify Failed Entry**
```json
{
  "phase": "execute",
  "toolName": "rag_search",
  "success": false,
  "durationMs": 2150,
  "error": "Collection not found: codebase_chunks_768"
}
```

**Step 4: Root Cause**
- Qdrant collection doesn't exist or was deleted

**Step 5: Fix**
```bash
# Recreate collection or check Qdrant health
curl http://localhost:6333/collections/codebase_chunks_768
npm run qdrant:setup  # or similar rebuild command
```

## Integration with Gemma4 Agent

The diagnostics are **automatically** captured when Gemma4 calls tools via the agent loop.

### Tool Flow

```
Gemma4 Chat → tool_calls (native or manual JSON)
  ↓
gemma4-agent.ts: parseToolRequest() + allowlist check
  ↓
dispatchTool() [line 2251] ← execution starts here
  ↓
ToolDiagnostics.logDispatch() ← diagnostic logged
  ↓
In-process handler (rag_search, case_search, etc.)
  OR TRACE MCP proxy (trace.*, graph.*, etc.)
  ↓
ToolDiagnostics.logExecution() ← result logged
  ↓
Tool result → role:"tool" message appended
  ↓
Loop or final answer
```

## Tool Routing Decision Tree

When `dispatchTool(name, args)` is called:

```
Is name in ALLOWED_TOOLS.read?
  ├─ YES → In-process handler (rag_search, case_search, memory_recall, etc.)
  │   └─ Execute handler, log as "execute"
  │
  ├─ Is name in ALLOWED_TOOLS.write (and allowWriteTools=true)?
  │   ├─ YES → In-process handler (apply_shadow_patch, revert_fix, etc.)
  │   │   └─ Execute handler, log as "execute"
  │   │
  │   └─ NO → Return error "not permitted in this context"
  │
  └─ Is name MCP format (contains dot: "trace.kag_search", "graph.expand")?
      └─ YES → Proxy to TRACE MCP :8788
          └─ callTraceMcp() → log as "execute"
      └─ NO → Return error "Unknown tool"
```

## Viewing Diagnostics in Browser

Add a `/api/agent/diagnostics` page to your dashboard:

```html
<!-- src/routes/(app)/admin/tool-diagnostics/+page.svelte -->
<script>
  import { onMount } from 'svelte';

  let summary = $state(null);
  let log = $state([]);
  let autoRefresh = $state(false);

  onMount(() => {
    const refresh = async () => {
      const res = await fetch('/api/agent/rpc?diagnostic=report');
      const data = await res.json();
      summary = data.summary;
      log = data.log;
    };

    refresh();
    if (autoRefresh) {
      const interval = setInterval(refresh, 2000);
      return () => clearInterval(interval);
    }
  });

  const clearLogs = async () => {
    await fetch('/api/agent/rpc', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ method: 'tools/diagnostics', params: { type: 'clear' } }),
    });
    summary = null;
    log = [];
  };
</script>

<div>
  <h2>Tool Gateway Diagnostics</h2>

  <label>
    <input type="checkbox" bind:checked={autoRefresh} />
    Auto-refresh every 2s
  </label>

  {#if summary}
    <table>
      <tr>
        <td>Total Requests</td>
        <td>{summary.totalRequests}</td>
      </tr>
      <tr>
        <td>Success Rate</td>
        <td>{((summary.successCount / summary.totalRequests) * 100).toFixed(1)}%</td>
      </tr>
      <tr>
        <td>Avg Duration</td>
        <td>{summary.averageDurationMs.toFixed(0)}ms</td>
      </tr>
    </table>
  {/if}

  <button onclick={clearLogs}>Clear Logs</button>

  <table>
    <thead>
      <tr>
        <th>Tool</th>
        <th>Phase</th>
        <th>Status</th>
        <th>Duration</th>
        <th>Error</th>
      </tr>
    </thead>
    <tbody>
      {#each log as entry}
        <tr class={entry.success ? 'success' : 'error'}>
          <td>{entry.toolName}</td>
          <td>{entry.phase}</td>
          <td>{entry.success ? '✓' : '✗'}</td>
          <td>{entry.durationMs ?? '—'}ms</td>
          <td>{entry.error ?? '—'}</td>
        </tr>
      {/each}
    </tbody>
  </table>
</div>
```

## Configuring Diagnostics Level

Set in `env.server.ts`:

```typescript
export const TOOL_DIAGNOSTICS_LEVEL =
  (process.env.TOOL_DIAGNOSTICS_LEVEL as 'off' | 'summary' | 'full') ?? 'full';

// Then in tool dispatch:
if (TOOL_DIAGNOSTICS_LEVEL === 'full') {
  ToolDiagnostics.logExecution(...);
} else if (TOOL_DIAGNOSTICS_LEVEL === 'summary') {
  // Only log errors
}
```

## Performance Notes

- **Log size**: Bounded at 1,000 entries to prevent memory bloat
- **Overhead**: Diagnostics add ~1-2ms per tool call (negligible)
- **Storage**: All diagnostics are in-memory; cleared on server restart
- **Export**: Full report can be exported via `/api/agent/rpc?diagnostic=report`

## Next Steps

1. **Monitor**: Check `/api/agent/rpc?diagnostic=summary` periodically
2. **Alert**: Add alerting when error rate > 5% or avg duration > 1000ms
3. **Dashboard**: Build a real-time tool dashboard using the diagnostic APIs
4. **Archive**: Log diagnostics to file/DB for historical analysis