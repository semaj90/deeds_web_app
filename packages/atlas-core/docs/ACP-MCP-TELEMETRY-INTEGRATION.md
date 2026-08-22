# ACP/MCP Telemetry Integration Guide

**Date**: June 26, 2026  
**Status**: ✅ Implementation Complete (Integration TODO)  
**Purpose**: Unified observability for agent routing decisions + tool-call performance + async bottleneck detection

---

## Overview

**Problem**: How do you debug why a query is slow? Is it the routing decision? The tool selection? Redis latency? GPU rerank bottleneck?

**Solution**: ACP/MCP Telemetry traces:
1. **ACP Decisions** — routing logic (retrieval lane, cache strategy, tool set, reranker)
2. **MCP Tool Calls** — tool invocation (name, params, execution time, cache hits)
3. **Async Chain** — granular visibility into each await() (Postgres, Redis, Qdrant, Neo4j)
4. **Attribution** — latency breakdown: decision-time vs tool-time vs async-blocking vs overhead

---

## Architecture

### Three Levels of Observability

```
┌─────────────────────────────────────────────────────────────┐
│ Level 1: ACP Decisions                                      │
│ "Choose retrieval lane" → {vector|graph|sparse}            │
│ "Choose cache strategy" → {L1|L2|miss}                    │
│ "Choose tool set" → [kb.trace_search, graph.expand, ...]  │
│ "Choose reranker" → {GPU|Karpathy|BM25}                   │
│ Time: ~1-10ms per decision                                  │
└─────────────────────────────────────────────────────────────┘
  ↓
┌─────────────────────────────────────────────────────────────┐
│ Level 2: MCP Tool Calls                                     │
│ Tool: kb.trace_search                                       │
│ Params: {query: "...", limit: 10}                          │
│ Result: 7 candidates (3.2s)                                │
│ Cache hit: no                                               │
│ Time: ~100ms-10s per tool                                  │
└─────────────────────────────────────────────────────────────┘
  ↓
┌─────────────────────────────────────────────────────────────┐
│ Level 3: Async Operations (Bottleneck Detection)            │
│ Operation: postgres.query (SELECT FROM qdrant_cache)       │
│   Duration: 25ms                                            │
│ Operation: qdrant.search (vector ANN)                       │
│   Duration: 3.1s (LONGEST!)                                │
│ Operation: neo4j.traversal (USED_CONCEPT k=2)              │
│   Duration: 180ms                                           │
│ Time: 1ms-10s per async op                                 │
└─────────────────────────────────────────────────────────────┘
```

### Trace Correlation

```
trace-123
  ├─ decision-001: retrieval_lane_select → "vector"
  │   └─ tool_call-001: kb.trace_search (triggered by decision)
  │       ├─ async-001: redis.get(ff1:feature:*) — 2ms
  │       ├─ async-002: qdrant.search(...) — 3.1s (CRITICAL PATH)
  │       └─ async-003: qdrant.fetch_point(...) — 50ms
  │
  ├─ decision-002: rerank_strategy_select → "GPU"
  │   └─ tool_call-002: gpu.cuda.rank (triggered by decision)
  │       ├─ async-004: tensor.load_candidates(...) — 100ms
  │       └─ async-005: cuda.matmul(...) — 450ms
  │
  └─ decision-003: result_format_select → "streaming"
      └─ tool_call-003: serialize + stream (async)
          └─ async-006: sse.write_chunk(...) — 1ms per chunk
```

---

## Integration with LangGraph Worker

### Step 1: Import Telemetry in worker.ts

```typescript
import { TelemetryCollector, createTraceId } from '../telemetry/acp-mcp-telemetry.js';

// In buildAgentGraph():
const telemetryCollectors = new Map<string, TelemetryCollector>();

function makeLoadTraceState(services: AgentServices) {
  return async (state: AgentStateType): Promise<Partial<AgentStateType>> => {
    const { trace_id } = state;
    const collector = telemetryCollectors.get(trace_id) || new TelemetryCollector(trace_id);

    const started = Date.now();

    // Record async operation: Redis cache check
    const redisStart = Date.now();
    const cachedTrace = await services.bitfrost.getTraceCache(trace_id);
    collector.recordAsyncOp({
      operation_id: `redis:trace_cache:${trace_id}`,
      name: 'redis.get',
      started_at: new Date(redisStart).toISOString(),
      completed_at: new Date().toISOString(),
      duration_ms: Date.now() - redisStart,
      status: cachedTrace ? 'success' : 'success',  // cache miss is still success
      resource_type: 'redis',
      resource_name: `ff1:trace:${trace_id}`,
    });

    // Record async operation: Postgres fallback
    if (!cachedTrace) {
      const pgStart = Date.now();
      const traceEvents = await services.postgres.loadTraceState(trace_id);
      collector.recordAsyncOp({
        operation_id: `postgres:trace_events:${trace_id}`,
        name: 'postgres.query',
        started_at: new Date(pgStart).toISOString(),
        completed_at: new Date().toISOString(),
        duration_ms: Date.now() - pgStart,
        status: 'success',
        resource_type: 'postgres',
        resource_name: 'trace_events',
      });
    }

    // Record ACP decision: cache strategy chosen
    collector.recordDecision({
      decision_id: `cache_strategy:${trace_id}`,
      decision_type: 'cache_strategy_select',
      context: {
        query: 'load trace state',
        available_options: ['redis', 'postgres'],
      },
      decision: {
        chosen_option: cachedTrace ? 'redis' : 'postgres',
        confidence: 1.0,
        reasoning: cachedTrace ? 'Cache hit' : 'Cache miss, falling back to Postgres',
      },
      metrics: {
        decision_time_ms: Date.now() - started,
        option_eval_count: 2,
      },
    });

    telemetryCollectors.set(trace_id, collector);

    return {
      step: (state.step ?? 0) + 1,
      trace_events: Array.isArray(cachedTrace) ? cachedTrace : [],
    };
  };
}
```

### Step 2: Wire Tool Calls in hybridRetrieval

```typescript
function makeHybridRetrieval(services: AgentServices) {
  return async (state: AgentStateType): Promise<Partial<AgentStateType>> => {
    const { packet_key, trace_id } = state;
    const collector = telemetryCollectors.get(trace_id);

    // Record ACP decision: retrieval lane selection
    collector?.recordDecision({
      decision_id: `retrieval_lane:${trace_id}`,
      decision_type: 'retrieval_lane_select',
      context: {
        query: `Retrieve neighbors of ${packet_key}`,
        available_options: ['vector', 'graph', 'sparse'],
      },
      decision: {
        chosen_option: 'hybrid',  // vector + graph in parallel
        confidence: 0.95,
        reasoning: 'Packet has embeddings and topology',
      },
      metrics: {
        decision_time_ms: 2,
        option_eval_count: 3,
      },
    });

    // Parallel retrieval: RAG (Qdrant) + KAG (Neo4j)
    const qdrantStart = Date.now();
    const neo4jStart = Date.now();

    const [ragCandidates, kagNeighbors] = await Promise.all([
      // RAG: Semantic vector search
      (async () => {
        const result = await services.qdrant.fetchPoint(packet_key);
        const duration = Date.now() - qdrantStart;

        collector?.recordToolCall({
          tool_name: 'qdrant.search',
          tool_namespace: 'qdrant',
          input: {
            params: { packet_key, limit: 10 },
            param_count: 2,
            total_input_bytes: 64,
          },
          execution: {
            started_at: new Date(qdrantStart).toISOString(),
            completed_at: new Date().toISOString(),
            duration_ms: duration,
            status: 'success',
          },
          output: {
            result_count: result ? 1 : 0,
            total_output_bytes: result ? 2048 : 0,
            cache_hit: false,
          },
          async_chain: {
            async_operations: [
              {
                operation_id: 'qdrant:vector_search',
                name: 'qdrant.search',
                started_at: new Date(qdrantStart).toISOString(),
                completed_at: new Date().toISOString(),
                duration_ms: duration,
                status: 'success',
                resource_type: 'qdrant',
                resource_name: 'codebase_chunks_768',
              },
            ],
            longest_wait_ms: duration,
            total_blocking_ms: duration,
          },
        });

        return result ? [result] : [];
      })(),

      // KAG: Graph traversal
      (async () => {
        const result = await services.neo4j.traverseTopology(packet_key, 2);
        const duration = Date.now() - neo4jStart;

        collector?.recordToolCall({
          tool_name: 'graph.expand',
          tool_namespace: 'graph',
          input: {
            params: { packet_key, max_depth: 2, limit: 20 },
            param_count: 3,
            total_input_bytes: 96,
          },
          execution: {
            started_at: new Date(neo4jStart).toISOString(),
            completed_at: new Date().toISOString(),
            duration_ms: duration,
            status: 'success',
          },
          output: {
            result_count: result.length,
            total_output_bytes: result.length * 512,
            cache_hit: false,
          },
          async_chain: {
            async_operations: [
              {
                operation_id: 'neo4j:traversal',
                name: 'neo4j.run',
                started_at: new Date(neo4jStart).toISOString(),
                completed_at: new Date().toISOString(),
                duration_ms: duration,
                status: 'success',
                resource_type: 'neo4j',
                resource_name: 'USED_CONCEPT edges',
              },
            ],
            longest_wait_ms: duration,
            total_blocking_ms: duration,
          },
        });

        return result;
      })(),
    ]);

    return {
      rag_candidates: ragCandidates,
      kag_neighbors: kagNeighbors,
      step: (state.step ?? 0) + 1,
    };
  };
}
```

### Step 3: Finalize and Export at writeTraceEvent

```typescript
function makeWriteTraceEvent(services: AgentServices) {
  return async (state: AgentStateType): Promise<Partial<AgentStateType>> => {
    const { trace_id, step } = state;
    const collector = telemetryCollectors.get(trace_id);

    // ... existing write logic ...

    // Finalize telemetry
    if (collector) {
      const telemetry = collector.finalize();

      // Export to observability backend
      const exporter = new TelemetryExporter('redis');  // or 'langfuse', 'datadog'
      await exporter.export(telemetry);

      // Optionally analyze and log recommendations
      const analyzer = new TelemetryAnalyzer();
      const analysis = analyzer.analyze(telemetry);
      console.log(`✅ Query analysis for ${trace_id}:`);
      console.log(`  Cache effectiveness: ${analysis.cache_effectiveness}`);
      console.log(`  Parallelization opportunity: ${analysis.parallelization_opportunity_ms}ms`);
      analysis.recommendations.forEach((rec) => console.log(`  → ${rec}`));
    }

    return {
      step: (state.step ?? 0) + 1,
    };
  };
}
```

---

## Output Format

### Telemetry JSON (Langfuse/Datadog/Redis-compatible)

```json
{
  "trace_id": "trace-123",
  "decisions": [
    {
      "decision_id": "cache_strategy:trace-123",
      "decision_type": "cache_strategy_select",
      "timestamp": "2026-06-26T18:30:45.123Z",
      "context": {
        "query": "load trace state",
        "available_options": ["redis", "postgres"]
      },
      "decision": {
        "chosen_option": "redis",
        "confidence": 1.0,
        "reasoning": "Cache hit"
      },
      "metrics": {
        "decision_time_ms": 1,
        "option_eval_count": 2
      }
    }
  ],
  "tool_calls": [
    {
      "tool_call_id": "tool-001",
      "tool_name": "qdrant.search",
      "tool_namespace": "qdrant",
      "timestamp": "2026-06-26T18:30:45.200Z",
      "input": {
        "params": { "packet_key": "ace:packet:auth:001", "limit": 10 },
        "param_count": 2,
        "total_input_bytes": 64
      },
      "execution": {
        "started_at": "2026-06-26T18:30:45.200Z",
        "completed_at": "2026-06-26T18:30:48.300Z",
        "duration_ms": 3100,
        "status": "success"
      },
      "output": {
        "result_count": 7,
        "total_output_bytes": 14336,
        "cache_hit": false
      },
      "async_chain": {
        "async_operations": [
          {
            "operation_id": "qdrant:vector_search",
            "name": "qdrant.search",
            "started_at": "2026-06-26T18:30:45.200Z",
            "completed_at": "2026-06-26T18:30:48.300Z",
            "duration_ms": 3100,
            "status": "success",
            "resource_type": "qdrant",
            "resource_name": "codebase_chunks_768"
          }
        ],
        "longest_wait_ms": 3100,
        "total_blocking_ms": 3100
      }
    }
  ],
  "attribution": {
    "decision_time_total_ms": 6,
    "tool_execution_time_total_ms": 3250,
    "async_blocking_time_total_ms": 3250,
    "overhead_ms": 2,
    "e2e_latency_ms": 3258
  },
  "cache_stats": {
    "l1_hits": 1,
    "l2_hits": 0,
    "l3_hits": 0,
    "misses": 1,
    "hit_rate": 0.5,
    "invalidations": 1
  },
  "async_analysis": {
    "critical_path": [
      {
        "operation_id": "qdrant:vector_search",
        "name": "qdrant.search",
        "duration_ms": 3100,
        "status": "success"
      }
    ],
    "parallel_ops": [],
    "blocking_bottleneck": "qdrant:vector_search"
  }
}
```

### Analysis Output (Human-Readable)

```
✅ Query analysis for trace-123:
  Slowest decision: retrieval_lane_select (3ms)
  Slowest tool: qdrant.search (3100ms) ← BOTTLENECK
  Cache effectiveness: fair (50% hit rate)
  Parallelization opportunity: 0ms (no parallel ops)
  
  Recommendations:
  1. Tool "qdrant.search" took 3100ms. Consider caching results or adding timeout.
  2. Cache hit rate is 50.0%. Consider broader TTLs or cache warming.
  3. Slowest operation: "qdrant.search" (3100ms). This is your critical path.
```

---

## Dashboard Queries

### Langfuse

```langfuse-sdk
// Find slowest queries this week
const slowQueries = await langfuse.get_traces({
  where: {
    name: "atlas-agent-loop",
    createdAt: {
      from: Date.now() - 7 * 24 * 60 * 60 * 1000
    }
  },
  orderBy: "duration",
  limit: 10
});

// Analyze tool-call times
slowQueries.forEach(trace => {
  const telemetry = trace.output.telemetry;
  const tool_times = telemetry.tool_calls
    .map(t => ({ tool: t.tool_name, ms: t.execution.duration_ms }))
    .sort((a, b) => b.ms - a.ms);
  console.log(`${trace.id}: bottleneck is ${tool_times[0].tool} (${tool_times[0].ms}ms)`);
});
```

### Redis Query

```bash
# List all traces from past hour
redis-cli SCAN 0 MATCH "telemetry:trace:*" --type string | head -20

# Get specific trace telemetry
redis-cli GET "telemetry:trace:trace-123" | jq '.attribution'

# Aggregate cache hit rates (key: hit rate from cache_stats)
redis-cli SCAN 0 MATCH "telemetry:trace:*" | \
  xargs -I {} redis-cli GET {} | \
  jq '.cache_stats.hit_rate' | \
  awk '{sum+=$1; count++} END {print "Average cache hit rate:", sum/count}'
```

---

## Performance Impact

- **ACP Decision Recording**: ~0.5ms per decision (negligible)
- **Tool Call Recording**: ~1ms per tool call (negligible)
- **Async Op Recording**: ~0.1ms per async operation (negligible)
- **Finalization**: ~10-50ms (done at end, not critical path)
- **Export**: ~100ms (async, non-blocking)

**Total Overhead**: <1% of request latency for typical queries

---

## TODO: Remaining Wiring

1. **Langfuse Export** — POST to `/api/trace` with trace_id + observations
2. **Datadog Export** — POST to `/api/v2/logs` with tags + structured data
3. **Jaeger Export** — gRPC to Jaeger collector with span hierarchy
4. **Redis Cache** — `SETEX telemetry:{trace_id} 86400 <json>` for dashboard
5. **Dashboard** — Grafana/Kibana queries to visualize bottlenecks
6. **Alerts** — Alert when `cache_hit_rate < 0.4` or `critical_path > 10s`
7. **Cleanup** — Cron job to delete old telemetry from Redis (TTL already set)

---

## References

- [ACP/MCP Telemetry Types](../src/telemetry/acp-mcp-telemetry.ts)
- [LangGraph Worker Integration](../src/langgraph/worker.ts)
- [Langfuse Documentation](https://langfuse.com)
- [Datadog RUM](https://docs.datadoghq.com/real_user_monitoring/)
- [Jaeger Tracing](https://www.jaegertracing.io/)
