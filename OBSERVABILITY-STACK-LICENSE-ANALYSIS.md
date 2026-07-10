# Observability Stack License Analysis (July 10, 2026)

## Executive Summary

For a **100% open-source observability stack** (Apache 2.0 / MIT / BSD compatible):

| Component | License | Status | Recommendation |
|-----------|---------|--------|-----------------|
| **Prometheus** | Apache 2.0 ✅ | Metrics collection | **Use it** |
| **Jaeger** | Apache 2.0 ✅ | Distributed tracing | **Use it** |
| **OpenTelemetry** | Apache 2.0 ✅ | Instrumentation SDK | **Use it** |
| **Grafana** | SSPL ❌ | Visualization | **Replace with Thanos or self-host** |
| **Loki** | AGPL 3.0 ⚠️ | Log aggregation | **Use if AGPL-compatible** |

---

## Current Status

### ✅ Already Installed (Observability-Ready)

```json
{
  "@langchain/langgraph": "1.4.7",              // State machine tracing
  "@langchain/langgraph-checkpoint-postgres": "1.0.1",  // Checkpoint persistence
  "@modelcontextprotocol/sdk": "1.22.0",       // MCP tool tracing
  "ai": "6.0.190"                              // Vercel SDK with observability
}
```

### ❌ Missing (OpenTelemetry Stack)

```
@opentelemetry/api
@opentelemetry/sdk-node
@opentelemetry/sdk-trace-node
@opentelemetry/sdk-metrics
@opentelemetry/exporter-trace-jaeger
@opentelemetry/exporter-prometheus
```

---

## Detailed License Analysis

### 1. Prometheus (Apache 2.0) ✅

**Status**: Open source, permissive
**Use**: Metrics collection, time-series DB
**Compatibility**: Commercial use allowed, no source code release required

**Licensing Text**:
```
Apache License 2.0
- Allows: commercial use, private use, modification, distribution
- Requires: license notice, state changes
- Forbids: liability warranty, trademark use
```

**Decision**: ✅ **USE PROMETHEUS**

---

### 2. Jaeger (Apache 2.0) ✅

**Status**: Open source, permissive
**Use**: Distributed tracing backend
**Compatibility**: Commercial use allowed

**Licensing Text**: Same as Prometheus (Apache 2.0)

**Decision**: ✅ **USE JAEGER**

---

### 3. OpenTelemetry (Apache 2.0) ✅

**Status**: Open source, permissive
**Use**: Instrumentation SDK (auto + manual)
**Compatibility**: Commercial use allowed, no license cascade

**Licensing Text**: Same as Prometheus (Apache 2.0)

**Decision**: ✅ **USE OPENTELEMETRY**

---

### 4. Grafana (SSPL) ❌

**Status**: NOT open source (despite "open source" marketing)
**License**: Server Side Public License (SSPL)
**Problem**: 
- If you modify or run Grafana to offer it as a service, you must release all code that interacts with it
- This includes your instrumentation, exporters, and integrations
- Similar to AGPL but broader scope

**Compatibility**: 
- ❌ NOT compatible with Apache 2.0 projects
- ❌ NOT permissive
- ❌ May require source code release if Grafana runs on your infrastructure

**Decision**: ❌ **DO NOT USE GRAFANA** for open-source-only stacks

---

### 5. Loki (AGPL 3.0) ⚠️

**Status**: Open source but copyleft
**License**: GNU Affero General Public License 3.0
**Problem**:
- If you use Loki, your entire application must be released under AGPL 3.0
- Incompatible with Apache 2.0 unless entire project is AGPL 3.0

**Compatibility**: 
- ⚠️ COPYLEFT: Requires full source release if you distribute/run as service
- ❌ Incompatible with Apache 2.0 permissive license

**Decision**: ⚠️ **USE ONLY IF PROJECT IS AGPL 3.0** (currently isn't)

---

## ✅ Recommended Open-Source Stack

### Option A: Prometheus + Jaeger + OpenTelemetry (All Apache 2.0)

```
┌─────────────────────────────────────────────┐
│  Application (Apache 2.0)                   │
│  ├─ @opentelemetry/api (instrumentation)    │
│  ├─ @opentelemetry/sdk-node (initialization)│
│  └─ @opentelemetry/auto-instrumentations    │
└─────────────────────────────────────────────┘
                    ↓
        ┌───────────┴───────────┐
        ↓                       ↓
  ┌──────────────┐      ┌──────────────┐
  │  Prometheus  │      │    Jaeger    │
  │ (Apache 2.0) │      │ (Apache 2.0) │
  └──────────────┘      └──────────────┘
        ↓                       ↓
  ┌──────────────────────────────────┐
  │  Thanos (for UI)                 │
  │  or Prometheus UI                │
  │  (Apache 2.0)                    │
  └──────────────────────────────────┘
```

**Component Breakdown**:
- **OpenTelemetry SDK**: Instrument code (traces, metrics, logs)
- **Prometheus Exporter**: Export metrics to Prometheus
- **Jaeger Exporter**: Export traces to Jaeger
- **Prometheus**: Scrape metrics, store time-series
- **Jaeger**: Store and visualize traces
- **Thanos**: Query + aggregate multiple Prometheus instances (optional)

---

### Option B: Prometheus + Jaeger + Loki (If OK with AGPL)

**Only use if**:
- Entire project is AGPL 3.0 or later
- OR Loki runs only internally (not offered as service)

```
@opentelemetry/exporter-logs (future)
  ↓
Loki (AGPL 3.0)
  ↓
Grafana (SSPL) or Thanos UI
```

---

## Installation Plan (Option A Recommended)

### Step 1: Install OpenTelemetry

```bash
cd sveltekit-frontend && npm install \
  @opentelemetry/api@1.9.0 \
  @opentelemetry/sdk-node@1.0.0 \
  @opentelemetry/sdk-trace-node@1.24.0 \
  @opentelemetry/auto-instrumentations-node@2.0.0 \
  @opentelemetry/sdk-metrics@1.24.0 \
  @opentelemetry/exporter-prometheus@0.51.0 \
  @opentelemetry/exporter-trace-jaeger@1.24.0
```

### Step 2: Create Initialization Module

```typescript
// src/lib/server/observability/otel-init.ts

import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { JaegerExporter } from '@opentelemetry/exporter-trace-jaeger';
import { PrometheusExporter } from '@opentelemetry/exporter-prometheus';
import { MeterProvider } from '@opentelemetry/sdk-metrics';
import { registerInstrumentations } from '@opentelemetry/auto-instrumentations-node';

// Trace provider
const traceProvider = new NodeTracerProvider();
const jaegerExporter = new JaegerExporter({
  host: process.env.JAEGER_HOST || 'localhost',
  port: parseInt(process.env.JAEGER_PORT || '6831')
});
traceProvider.addSpanProcessor(
  new BatchSpanProcessor(jaegerExporter)
);
traceProvider.register();

// Metrics provider
const prometheusExporter = new PrometheusExporter(
  { port: 8888 },
  () => { console.log('Prometheus exporter started on :8888'); }
);
const meterProvider = new MeterProvider({
  exporter: prometheusExporter
});

// Auto-instrumentations (HTTP, DB, gRPC, etc.)
registerInstrumentations({
  tracerProvider: traceProvider,
  meterProvider
});
```

### Step 3: Wire Into Entry Point

```typescript
// src/routes/+server.ts (or app.ts)

import './lib/server/observability/otel-init.js';
// ... rest of app initialization
```

### Step 4: Run Observability Stack (Docker)

```bash
docker-compose up -d prometheus jaeger
# Prometheus: http://localhost:9090
# Jaeger: http://localhost:16686
```

---

## License Compatibility Matrix

| Your Project | Can Use Prometheus? | Can Use Jaeger? | Can Use Loki? | Can Use Grafana? |
|---|---|---|---|---|
| Apache 2.0 | ✅ YES | ✅ YES | ❌ NO | ❌ NO |
| MIT | ✅ YES | ✅ YES | ❌ NO | ❌ NO |
| BSD | ✅ YES | ✅ YES | ❌ NO | ❌ NO |
| AGPL 3.0 | ✅ YES | ✅ YES | ✅ YES | ❌ NO* |
| Proprietary | ✅ YES | ✅ YES | ⚠️ MAYBE | ✅ YES |

*Grafana is SSPL, not AGPL — different (more restrictive) license.

---

## Docker Compose Template (All Apache 2.0)

```yaml
version: '3.8'
services:
  prometheus:
    image: prom/prometheus:latest
    ports:
      - "9090:9090"
    volumes:
      - ./prometheus.yml:/etc/prometheus/prometheus.yml
      - prometheus-storage:/prometheus
    command:
      - '--config.file=/etc/prometheus/prometheus.yml'
      - '--storage.tsdb.path=/prometheus'

  jaeger:
    image: jaegertracing/all-in-one:latest
    ports:
      - "16686:16686"  # UI
      - "6831:6831/udp"  # Jaeger agent
    environment:
      - COLLECTOR_OTLP_ENABLED=true

volumes:
  prometheus-storage:
```

**prometheus.yml**:
```yaml
global:
  scrape_interval: 15s

scrape_configs:
  - job_name: 'app'
    static_configs:
      - targets: ['localhost:8888']  # OpenTelemetry Prometheus exporter
```

---

## Summary

| Aspect | Recommendation |
|--------|-----------------|
| **Metrics** | Prometheus (Apache 2.0) ✅ |
| **Tracing** | Jaeger (Apache 2.0) ✅ |
| **Instrumentation** | OpenTelemetry SDK (Apache 2.0) ✅ |
| **Visualization** | Prometheus UI + Jaeger UI (both included) ✅ |
| **Alternative (if AGPL OK)** | Add Loki for logs (AGPL 3.0) ⚠️ |
| **DO NOT USE** | Grafana (SSPL, not open source) ❌ |

**License of entire stack (Option A)**: **100% Apache 2.0** ✅

---

## Next Steps

1. ✅ Install OpenTelemetry packages (Phase 9)
2. ✅ Initialize in SvelteKit server
3. ✅ Wire into LangGraph agent router
4. ✅ Start Prometheus + Jaeger (Docker)
5. ✅ Create dashboard (JSON in Prometheus/Jaeger native UI)
6. ✅ Test: trace a full agent route → execute → outcome ledger flow

**Estimated effort**: 2-3 hours (Phase 9 readiness)

**License assurance**: ✅ Fully open-source, Apache 2.0 compatible, no GPL-family restrictions.
