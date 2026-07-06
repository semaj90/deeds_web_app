# Telemetry Observability Queries — Session 119a

**Purpose**: Query telemetry to surface implementation clusters and debug agentic workflows.

---

## Query 1: MCP Tool Success Rate by Tool Name

**Endpoint**: `/api/telemetry/aggregated-mcp-tools`

**Use case**: Which tools are failing? Which succeed reliably?

```bash
curl -X GET "http://localhost:5173/api/telemetry/aggregated-mcp-tools" \
  -H "Content-Type: application/json"

# Returns:
{
  "total_tools_invoked": 9,
  "tools": {
    "identity:recover": {
      "call_count": 127,
      "success_count": 124,
      "error_count": 3,
      "total_duration_ms": 5334,
      "avg_duration_ms": 42.0,
      "p50_duration_ms": 38,
      "p95_duration_ms": 68,
      "success_rate": 0.976,
      "last_error": null
    },
    "envelope:validate": {
      "call_count": 89,
      "success_count": 89,
      "error_count": 0,
      "total_duration_ms": 1780,
      "avg_duration_ms": 20.0,
      "p50_duration_ms": 18,
      "p95_duration_ms": 35,
      "success_rate": 1.0,
      "last_error": null
    },
    ...
  },
  "aggregated_at": "2026-07-06T13:54:31.000Z"
}
```

**Interpretation**:
- `success_rate < 0.95` → investigate last_error, p95 latency spike
- `avg_duration_ms > p95_duration_ms` → data corruption or outlier; recompute percentiles
- `call_count == 0` → tool never invoked (check dispatcher routing)

---

## Query 2: Dispatcher Node Latency Breakdown

**Endpoint**: `/api/telemetry/aggregated-dispatcher-nodes`

**Use case**: Which dispatcher nodes are bottlenecks? Which take longest?

```bash
curl -X GET "http://localhost:5173/api/telemetry/aggregated-dispatcher-nodes" \
  -H "Content-Type: application/json"

# Returns:
{
  "total_nodes": 9,
  "nodes": {
    "node_recover_identity": {
      "call_count": 127,
      "total_duration_ms": 12_450,
      "avg_duration_ms": 98.0,
      "p50_duration_ms": 85,
      "p95_duration_ms": 180,
      "async_ops": [
        {
          "op_type": "mcp_tool_call",
          "service": "mcp",
          "operation": "identity:recover",
          "avg_duration_ms": 42.0,
          "count": 127
        },
        {
          "op_type": "postgres_query",
          "service": "postgres",
          "operation": "read_packet",
          "avg_duration_ms": 8.0,
          "count": 127
        }
      ]
    },
    ...
  },
  "aggregated_at": "2026-07-06T13:54:31.000Z"
}
```

**Interpretation**:
- `avg_duration_ms > p95_duration_ms` → outlier latencies; check for retries
- `mcp_tool_call` dominating → optimize tool execution time (p95)
- `postgres_query` high → add index or cache layer

---

## Query 3: Implementation Cluster Discovery

**Endpoint**: `/api/telemetry/implementation-clusters?tool_name={name}&feature_id={id}`

**Use case**: Find all files, routes, tests, and summaries for a feature implementation.

```bash
curl -X GET "http://localhost:5173/api/telemetry/implementation-clusters?tool_name=identity:recover&feature_id=auth.sessions" \
  -H "Content-Type: application/json"

# Returns:
{
  "clusters": [
    {
      "cluster_id": "identity:recover:auth.sessions",
      "tool_name": "identity:recover",
      "node_id": "node_recover_identity",
      "feature_id": "auth.sessions",
      "files": [
        {
          "path": "src/lib/server/dispatch/mcp-tool-implementations.ts",
          "type": "implementation",
          "last_modified": "2026-07-06T13:50:00.000Z"
        },
        {
          "path": "tests/telemetry/mcp-tool-telemetry.spec.ts",
          "type": "test",
          "last_modified": "2026-07-06T13:54:31.000Z"
        }
      ],
      "routes": [
        {
          "path": "/api/ai/agent",
          "method": "POST",
          "handler": "agent dispatcher node"
        }
      ],
      "tools": [
        {
          "name": "identity:recover",
          "params": ["packetKey", "sourceRef", "featureId"],
          "returns": "ToolResult"
        }
      ],
      "tests": [
        {
          "path": "tests/telemetry/mcp-tool-telemetry.spec.ts",
          "passing": 11,
          "total": 11
        },
        {
          "path": "tests/telemetry/dispatcher-mcp-tool-integration.spec.ts",
          "passing": 3,
          "total": 3
        }
      ],
      "summaries": [],
      "graph_neighbors": [],
      "metrics": {
        "total_calls": 127,
        "success_rate": 0.976,
        "avg_duration_ms": 42.0,
        "p50_duration_ms": 38,
        "p95_duration_ms": 68,
        "error_count": 3,
        "last_error": null
      },
      "confidence": 0.92
    }
  ],
  "summary": {
    "total_clusters": 1,
    "total_telemetry_events": 127,
    "aggregated_at": "2026-07-06T13:54:31.000Z"
  }
}
```

**Interpretation**:
- **confidence < 0.7** → incomplete cluster (missing files, tests, or summaries)
- **success_rate < 0.95** → production issue; investigate last_error + error_count
- **Graph neighbors** empty → feature is isolated, no cross-feature dependencies detected

---

## Query 4: Telemetry Time-Series (Latency Over Time)

**Endpoint**: `/api/telemetry/time-series?tool_name={name}&window_seconds=3600`

**Use case**: Is latency trending up? Degrading over time?

```bash
curl -X GET "http://localhost:5173/api/telemetry/time-series?tool_name=identity:recover&window_seconds=3600" \
  -H "Content-Type: application/json"

# Returns:
{
  "tool_name": "identity:recover",
  "window_seconds": 3600,
  "samples": [
    {
      "timestamp": "2026-07-06T12:00:00.000Z",
      "p50_duration_ms": 35,
      "p95_duration_ms": 55,
      "call_count": 12,
      "error_count": 0
    },
    {
      "timestamp": "2026-07-06T12:15:00.000Z",
      "p50_duration_ms": 38,
      "p95_duration_ms": 62,
      "call_count": 15,
      "error_count": 0
    },
    {
      "timestamp": "2026-07-06T12:30:00.000Z",
      "p50_duration_ms": 42,
      "p95_duration_ms": 68,
      "call_count": 18,
      "error_count": 1
    },
    ...
  ],
  "trend": "stable",  // or "degrading", "improving"
  "summary": {
    "total_window_duration_seconds": 3600,
    "total_calls": 127,
    "total_errors": 3,
    "avg_p95_latency_ms": 65.2
  }
}
```

**Interpretation**:
- **trend: degrading** → investigate resource contention, GC pauses, or capacity limits
- **error_count spike** → correlate with logs to identify root cause
- **p95 > 2× p50** → high variability; queue depth or retries suspected

---

## Query 5: Redis Telemetry Key Scan

**Endpoint**: `/api/telemetry/keys?pattern=telemetry:mcp:*`

**Use case**: What telemetry keys exist in Redis? How much storage consumed?

```bash
curl -X GET "http://localhost:5173/api/telemetry/keys?pattern=telemetry:mcp:*" \
  -H "Content-Type: application/json"

# Returns:
{
  "pattern": "telemetry:mcp:*",
  "keys_found": 382,
  "sample_keys": [
    "telemetry:mcp:identity:recover:1720264471234",
    "telemetry:mcp:envelope:validate:1720264472156",
    "telemetry:mcp:mirror:sync_qdrant:1720264473087",
    ...
  ],
  "key_distribution": {
    "telemetry:mcp:identity:recover:*": 127,
    "telemetry:mcp:envelope:validate:*": 89,
    "telemetry:mcp:mirror:sync_neo4j:*": 45,
    ...
  },
  "estimated_storage_bytes": 1_234_567,
  "ttl_seconds": 86400,
  "expires_at": "2026-07-07T13:54:31.000Z"
}
```

**Interpretation**:
- **keys_found == 0** → telemetry not being emitted; check for Redis connection errors
- **keys_found > 100K** → consider increasing TTL or pruning old keys
- **ttl_seconds** approaching expiration → keys about to be deleted

---

## Query 6: Error Rate Trend

**Endpoint**: `/api/telemetry/errors?tool_name={name}&hours=24`

**Use case**: How many tools are erroring? Which ones? What are the errors?

```bash
curl -X GET "http://localhost:5173/api/telemetry/errors?tool_name=&hours=24" \
  -H "Content-Type: application/json"

# Returns:
{
  "window_hours": 24,
  "error_summary": {
    "total_errors": 47,
    "total_calls": 12847,
    "error_rate": 0.00365,
    "errors_by_tool": [
      {
        "tool_name": "identity:recover",
        "error_count": 3,
        "error_messages": [
          "Packet identity recovery failed: missing packet_key",
          "Postgres deferred write failed: connection timeout"
        ]
      },
      {
        "tool_name": "graph:expand",
        "error_count": 44,
        "error_messages": [
          "Neo4j connection refused: ECONNREFUSED 127.0.0.1:7687",
          "Neo4j connection refused: ECONNREFUSED 127.0.0.1:7687",
          ...
        ]
      }
    ]
  },
  "alerts": [
    {
      "severity": "critical",
      "message": "graph:expand has 93.6% error rate (44/47 total errors)",
      "recommendation": "Check Neo4j service health; 7 consecutive errors suggest connection pool exhaustion"
    }
  ]
}
```

**Interpretation**:
- **error_rate > 0.05** (5%) → production issue, requires immediate attention
- **error_rate 0.01-0.05** → monitor, but not critical
- **error_rate < 0.01** → acceptable, likely transient network blips

---

## Grafana Dashboard Queries

Copy these into Grafana (with Redis datasource):

### P50 Latency per Tool (Graph)

```
SELECT tool_name, avg(p50_duration_ms) FROM telemetry:mcp:* GROUP BY tool_name
```

### Success Rate by Tool (Stat/Number)

```
SELECT COUNT(CASE WHEN status='success' THEN 1 END) * 100 / COUNT(*) as success_rate
FROM telemetry:mcp:*
GROUP BY tool_name
```

### Tool Call Volume (Bar Chart)

```
SELECT tool_name, COUNT(*) as call_count
FROM telemetry:mcp:*
WHERE timestamp > NOW() - INTERVAL '1 hour'
GROUP BY tool_name
```

### Error Count Over Time (Time Series)

```
SELECT timestamp, COUNT(*) as error_count
FROM telemetry:mcp:*
WHERE status='error'
GROUP BY timestamp, tool_name
```

---

## Summary

**Three-layer observability approach**:

1. **Aggregated metrics** (Query 1-2): overall tool health, node latency, success rates
2. **Implementation clusters** (Query 3): find all files, routes, tests for a feature
3. **Time-series trends** (Query 4-6): spot degradation, errors, capacity issues

**Action thresholds**:
- **Success rate < 0.95** → page on-call
- **p95 latency > 500ms** → investigate; likely resource contention
- **Error count > 50 in 1hr** → critical alert; check logs
- **Confidence < 0.7 on cluster** → incomplete implementation; verify all files exist

---

## Next Steps (Task 1.10)

- Wire implementation cluster discovery to real Redis telemetry (currently mocked)
- Add time-series queries to Grafana
- Create alert rules for thresholds above
- Document runbook for common issues
