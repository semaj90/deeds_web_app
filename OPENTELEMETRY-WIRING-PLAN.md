# OpenTelemetry Wiring Plan — LangGraph / ACP / MCP / Langfuse Integration

**Date**: July 7, 2026  
**Status**: 🟡 PLANNING (Not yet implemented)  
**Goal**: End-to-end trace_id propagation from user request through LangGraph → ACP → MCP → retrieval → Gemma4 → Langfuse

---

## Architecture Overview

```
User Request (OpenCode / SvelteKit route)
  ↓ [root span: agent.request]
LangGraph Workflow
  ↓ [span: langgraph.node.bitmap_gate]
  ↓ [span: langgraph.node.hmm_state]
ACP Job Enqueue/Run
  ↓ [span: acp.job.enqueue]
  ↓ [span: acp.job.run]
MCP Tool Dispatch
  ↓ [span: mcp.tool.trace.kag_search]
Retrieval (Qdrant/Neo4j/Postgres)
  ↓ [span: retrieval.qdrant.search]
  ↓ [span: retrieval.rrf.fuse]
Gemma4 Synthesis
  ↓ [span: llm.gemma4.synthesize]
OpenTelemetry Collector
  ↓
Langfuse OTLP Endpoint (http://localhost:3030/api/public/otel)
  ↓
Langfuse UI (http://localhost:3030/traces)
```

---

## Step 1: Fix OpenCode Tool Execution (Prerequisite)

### Current Issue
Gemma4 prints fake tool syntax instead of calling MCP tools:
```
<execute_bash>
rg "benchmark" .
</execute_bash>
```

### Root Cause
- `.opencode/system.md` / `AGENTS.md` still reference old tool syntax
- Gemma4 model not trained for OpenCode protocol
- MCP transport not properly wired

### Fix (Priority Order)

**1a. Remove fake tool syntax from `.opencode/system.md`**
```bash
# Remove lines like:
<execute_bash>command</execute_bash>
<read_file>path</read_file>
# Replace with: "Call MCP tool X with params Y"
```

**1b. Update permission config (singular, not old tool config)**
```json
{
  "permission": "allow-all-tools",
  "mcp": {
    "url": "http://127.0.0.1:8788/mcp",
    "headers": { "Accept": "application/json, text/event-stream" }
  }
}
```

**1c. Verify TRACE MCP HTTP endpoint**
```bash
curl http://127.0.0.1:8788/mcp -X POST \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"tools/list","params":{},"id":1}' \
  | jq '.result.tools | length'
# Expected: 42+ tools
```

**1d. Test grep/read inside OpenCode**
- Execute: `/grep some_pattern .` via OpenCode
- Execute: `/read src/lib/server/file.ts` via OpenCode
- Verify: Output appears in chat, not fake XML

**1e. If still broken, use tool-capable executor**
- Gemma4 is for planning/review only
- Switch executor to Claude / Qwen (has tool training)
- Keep Gemma4 as secondary analyst

---

## Step 2: OpenTelemetry Bootstrap (SvelteKit Startup)

### Install Dependencies
```bash
npm install \
  @opentelemetry/sdk-node \
  @opentelemetry/api \
  @opentelemetry/sdk-trace-node \
  @opentelemetry/exporter-trace-otlp-http \
  @opentelemetry/auto-instrumentations-node \
  @opentelemetry/resources \
  @opentelemetry/semantic-conventions
```

### Create OTel Initialization Module
**File**: `src/lib/server/observability/otel-init.ts`

```typescript
import { NodeSDK } from '@opentelemetry/sdk-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { Resource } from '@opentelemetry/resources';
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';
import { ConsoleSpanExporter, SimpleSpanProcessor } from '@opentelemetry/sdk-trace-node';

export function initOTel() {
  const resource = Resource.default().merge(
    new Resource({
      [SemanticResourceAttributes.SERVICE_NAME]: 'yorha-legal-ai',
      [SemanticResourceAttributes.SERVICE_VERSION]: '1.0.0',
    }),
  );

  const sdk = new NodeSDK({
    resource,
    traceExporter: new OTLPTraceExporter({
      url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://localhost:4318/v1/traces',
      timeout: 10000,
    }),
    instrumentations: [getNodeAutoInstrumentations()],
  });

  // Optional: console export for debugging
  if (process.env.NODE_ENV === 'development') {
    const provider = sdk.getNodeTracerProvider();
    provider.addSpanProcessor(new SimpleSpanProcessor(new ConsoleSpanExporter()));
  }

  sdk.start();
  console.log('✅ OpenTelemetry initialized');

  return sdk;
}
```

### Wire into SvelteKit Startup
**File**: `src/lib/server/init.ts` (or create if missing)

```typescript
import { initOTel } from './observability/otel-init';

// Call early, before any other imports that might create spans
export const otelSdk = initOTel();
```

**File**: `sveltekit-frontend/svelte.config.js` (hooks.server.ts startup)

```typescript
// hooks.server.ts
import { otelSdk } from '$lib/server/init';

export const handle = async ({ event, resolve }) => {
  // OTel already initialized at module load time
  return resolve(event);
};
```

### Environment Variables
**Add to `.env`:**
```
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318/v1/traces
OTEL_EXPORTER_OTLP_TIMEOUT=10000
```

---

## Step 3: Trace Context Propagation

### Create Tracer Utility
**File**: `src/lib/server/observability/tracer.ts`

```typescript
import { trace, context, SpanStatusCode } from '@opentelemetry/api';

const tracer = trace.getTracer('yorha-agent-system', '1.0.0');

export function createSpan(
  name: string,
  attributes?: Record<string, any>,
  parentContext?: any,
) {
  return tracer.startSpan(name, { attributes }, parentContext);
}

export async function withSpan<T>(
  name: string,
  fn: () => Promise<T>,
  attributes?: Record<string, any>,
): Promise<T> {
  const span = tracer.startSpan(name, { attributes });
  try {
    const result = await context.with(trace.setSpan(context.active(), span), fn);
    span.setStatus({ code: SpanStatusCode.OK });
    return result;
  } catch (err) {
    span.recordException(err as Error);
    span.setStatus({ code: SpanStatusCode.ERROR });
    throw err;
  } finally {
    span.end();
  }
}

// Extract trace_id from current span for propagation
export function getTraceId(): string {
  const activeSpan = trace.getActiveSpan();
  return activeSpan?.spanContext().traceId || 'unknown';
}
```

---

## Step 4: Wire LangGraph Node Spans

### Wrap Each Node
**File**: `src/lib/server/langgraph/worker.ts` (example node)

```typescript
import { withSpan } from '$lib/server/observability/tracer';

const loadTraceStateNode = async (context: any) => {
  return withSpan(
    'langgraph.node.load_trace_state',
    async () => {
      // Existing node logic
      const state = await loadState(context.sessionId);
      return { state };
    },
    {
      'session_id': context.sessionId,
      'packet_key': context.packetKey,
      'trace_id': getTraceId(),
    },
  );
};

const packetRegistryLookupNode = async (context: any) => {
  return withSpan(
    'langgraph.node.packet_registry_lookup',
    async () => {
      const packet = await lookupPacket(context.packetKey);
      return { packet };
    },
    {
      'packet_key': context.packetKey,
      'feature_id': packet?.feature_id,
      'source_ref': packet?.source_ref,
    },
  );
};

// Apply to all nodes in workflow
```

---

## Step 5: Wire ACP Job Spans

### ACP Job Enqueue
**File**: `src/lib/server/acp/acp-dispatcher.ts`

```typescript
export async function enqueueJob(jobSpec: ACPJobSpec) {
  return withSpan(
    'acp.job.enqueue',
    async () => {
      const jobId = generateJobId();
      await queue.enqueue({
        jobId,
        spec: jobSpec,
        traceId: getTraceId(),  // Propagate trace_id
      });
      return jobId;
    },
    {
      'acp.job_type': jobSpec.type,
      'acp.job_id': jobId,
      'trace_id': getTraceId(),
    },
  );
}
```

### ACP Job Run
**File**: `src/lib/server/acp/acp-worker.ts`

```typescript
export async function runJob(job: ACPJob) {
  return withSpan(
    'acp.job.run',
    async () => {
      // Run the job
      const result = await job.execute();
      return result;
    },
    {
      'acp.job_id': job.jobId,
      'acp.job_type': job.spec.type,
      'trace_id': job.traceId,  // Use propagated trace_id
    },
  );
}
```

---

## Step 6: Wire MCP Tool Spans

### Wrap Tool Invocation
**File**: `src/lib/server/mcp/mcp-executor.ts`

```typescript
export async function invokeMCPTool(
  toolName: string,
  params: Record<string, any>,
) {
  return withSpan(
    `mcp.tool.${toolName}`,
    async () => {
      const result = await mcpClient.invokeTool(toolName, params);
      return result;
    },
    {
      'tool.name': toolName,
      'tool.params_count': Object.keys(params).length,
      'trace_id': getTraceId(),
    },
  );
}
```

---

## Step 7: Wire Retrieval Spans

### Qdrant Search
```typescript
export async function searchQdrant(query: Float32Array, topK: number) {
  return withSpan(
    'retrieval.qdrant.search',
    async () => {
      const results = await qdrantClient.search(query, topK);
      return results;
    },
    {
      'retrieval.top_k': topK,
      'retrieval.collection': 'codebase_chunks_768',
      'retrieval.query_dim': query.length,
      'trace_id': getTraceId(),
    },
  );
}
```

### RRF Fusion
```typescript
export async function rrfFuseResults(signals: Signal[]) {
  return withSpan(
    'retrieval.rrf.fuse',
    async () => {
      const fused = fuse(signals);
      return fused;
    },
    {
      'retrieval.signal_count': signals.length,
      'retrieval.result_count': fused.length,
      'trace_id': getTraceId(),
    },
  );
}
```

---

## Step 8: Wire Gemma4 Synthesis Span

### Wrap LLM Call
**File**: `src/lib/server/ai/gemma4-synthesizer.ts`

```typescript
export async function synthesize(prompt: string, context: string) {
  return withSpan(
    'llm.gemma4.synthesize',
    async () => {
      const response = await llama.generate({
        model: 'gemma4-legal-iq4xs-direct.gguf',
        prompt: `${context}\n\n${prompt}`,
        stream: false,
        max_tokens: 512,
      });
      return response;
    },
    {
      'llm.model': 'gemma4-legal-iq4xs-direct.gguf',
      'llm.prompt_tokens': Math.ceil(prompt.length / 4),
      'llm.max_tokens': 512,
      'trace_id': getTraceId(),
    },
  );
}
```

---

## Step 9: OpenTelemetry Collector (Optional but Recommended)

### Docker Compose Entry
```yaml
otel-collector:
  image: otel/opentelemetry-collector:latest
  ports:
    - "4317:4317"  # gRPC
    - "4318:4318"  # HTTP
  volumes:
    - ./otel-collector-config.yaml:/etc/otel-collector-config.yaml
  command: ["--config=/etc/otel-collector-config.yaml"]
  environment:
    GOGC: 80
```

### Collector Config
**File**: `otel-collector-config.yaml`

```yaml
receivers:
  otlp:
    protocols:
      http:
        endpoint: 0.0.0.0:4318
      grpc:
        endpoint: 0.0.0.0:4317

exporters:
  otlp:
    endpoint: localhost:3030
    headers:
      "Authorization": "Bearer ${LANGFUSE_API_KEY}"

processors:
  batch:
    send_batch_size: 100
    timeout: 10s

service:
  pipelines:
    traces:
      receivers: [otlp]
      processors: [batch]
      exporters: [otlp]
```

---

## Step 10: Langfuse OTLP Ingestion

### Configure Langfuse to Receive OTLP
Langfuse supports OTLP at: `http://localhost:3030/api/public/otel`

**App side**: Point OTEL_EXPORTER_OTLP_ENDPOINT to collector OR directly to Langfuse:
```
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:3030/api/public/otel
```

**Langfuse UI**: Traces appear under Traces tab with full span hierarchy

---

## Span Attribute Reference

### Root Span Attributes
```typescript
{
  'trace_id': string,           // Propagated through all spans
  'session_id': string,          // User session
  'task_id': string,             // Task within session
  'agent.name': 'gemma4-opencode',
  'environment': 'development' | 'production'
}
```

### LangGraph Node Attributes
```typescript
{
  'langgraph.node_name': string,
  'langgraph.state_keys': string[],
  'hmm.state': string,
  'bitmap.score': number,
}
```

### ACP Job Attributes
```typescript
{
  'acp.job_id': string,
  'acp.job_type': string,
  'acp.priority': number,
}
```

### Retrieval Attributes
```typescript
{
  'retrieval.top_k': number,
  'retrieval.result_count': number,
  'retrieval.latency_ms': number,
  'packet_key': string,
  'feature_id': string,
}
```

### LLM Attributes
```typescript
{
  'llm.model': string,
  'llm.prompt_tokens': number,
  'llm.completion_tokens': number,
  'llm.latency_ms': number,
}
```

---

## Implementation Roadmap

| Phase | Task | Timeline | Status |
|-------|------|----------|--------|
| **P0** | Fix OpenCode tool execution | 2-3h | ⏳ PENDING |
| **P1** | OTel bootstrap + tracer utils | 1-2h | ⏳ PENDING |
| **P2** | Wire LangGraph nodes | 1-2h | ⏳ PENDING |
| **P3** | Wire ACP jobs | 30-45m | ⏳ PENDING |
| **P4** | Wire MCP tools | 30-45m | ⏳ PENDING |
| **P5** | Wire retrieval spans | 1-2h | ⏳ PENDING |
| **P6** | Wire Gemma4 LLM | 30m | ⏳ PENDING |
| **P7** | Test end-to-end trace propagation | 1-2h | ⏳ PENDING |
| **P8** | Verify Langfuse ingestion | 30m | ⏳ PENDING |
| **P9** | Add ClickHouse (optional) | 2-3h | 🔄 DEFER |
| **P10** | Wire A2A (after trace_id working) | 2-4h | 🔄 DEFER |

---

## Testing Checklist

- [ ] P0: Gemma4 executes `/grep` via MCP, output appears in chat
- [ ] P1: OTel SDK initializes without errors at startup
- [ ] P2: LangGraph node spans appear in Langfuse with correct attributes
- [ ] P3: ACP job enqueue/run spans chain correctly (parent-child)
- [ ] P4: MCP tool spans show in Langfuse with tool name and params
- [ ] P5: Retrieval spans (Qdrant/Neo4j/RRF) appear with latency
- [ ] P6: Gemma4 synthesis span shows token counts
- [ ] P7: Single trace_id propagates from request through all spans
- [ ] P8: Langfuse UI shows full trace tree (request → langgraph → acp → mcp → retrieval → llm)

---

## Dependencies

```json
{
  "@opentelemetry/sdk-node": "^0.48.0",
  "@opentelemetry/api": "^1.7.0",
  "@opentelemetry/sdk-trace-node": "^0.48.0",
  "@opentelemetry/exporter-trace-otlp-http": "^0.48.0",
  "@opentelemetry/auto-instrumentations-node": "^0.40.0",
  "@opentelemetry/resources": "^1.20.0",
  "@opentelemetry/semantic-conventions": "^1.20.0"
}
```

---

## References

- [OpenTelemetry SDK for Node.js](https://opentelemetry.io/docs/instrumentation/js/getting-started/nodejs/)
- [Langfuse OTLP Integration](https://langfuse.com/docs/integrations/opentelemetry)
- [A2A Spec](https://github.com/anthropics/a2a-specification) (wire AFTER trace_id working)
- [LangGraph Tracing](https://langchain-ai.github.io/langgraph/how-tos/human-in-the-loop/)

---

## Defer: A2A Integration (After Trace_ID Propagation)

Once end-to-end trace_id propagation is confirmed working:
1. Add `a2a.message.send` span wrapping agent RPC calls
2. Add `a2a.message.receive` span on remote agent side
3. Propagate trace_id in A2A message headers
4. Verify traces span multiple agent processes

---

**Status**: Planning complete. Ready for P0 (OpenCode fix) and P1-P8 (OTel wiring).
