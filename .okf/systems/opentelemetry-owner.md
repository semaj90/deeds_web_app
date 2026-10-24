---
type: system
title: OpenTelemetry Owner (trace producer and export boundary)
id: system/opentelemetry-owner
status: active
owners:
  - legal-ai-team
source_refs:
  - sveltekit-frontend/src/lib/server/observability/opentelemetry.ts
  - sveltekit-frontend/src/lib/server/observability/opentelemetry.spec.ts
  - sveltekit-frontend/src/lib/server/observability/offline-receipt-telemetry-v1.ts
  - sveltekit-frontend/src/lib/server/observability/offline-receipt-telemetry-v1.spec.ts
  - sveltekit-frontend/package.json
  - sveltekit-frontend/src/hooks.server.ts
related:
  - system/mastra-owner
  - system/trpc-owner
---

# OpenTelemetry owner

## Responsibility

The OpenTelemetry SDK is the only trace producer and propagation owner for the SvelteKit app. It does not decide admission. Langfuse is the durable trace backend and readback surface. Offline receipts are mapped by `offline-receipt-telemetry-v1.ts`, which is a mapping component and not a second tracer.

## Source and dependencies

| Item | Location |
|---|---|
| Startup owner | `sveltekit-frontend/src/lib/server/observability/opentelemetry.ts` (`ensureOpenTelemetry`, `resolveOtlpTracesUrl`, `isOpenTelemetryEnabled`) |
| Trace exporter | `@opentelemetry/exporter-trace-otlp-http` 0.220.0, declared directly in `sveltekit-frontend/package.json` (exact version; lockfile records it as a root dependency; the lockfile is gitignored) |
| SDK | `@opentelemetry/sdk-node` 0.220.0, `@opentelemetry/sdk-trace-base` 2.9.0, `@opentelemetry/sdk-metrics` 2.9.0, `@opentelemetry/auto-instrumentations-node` 0.78.0 |
| Call site | `sveltekit-frontend/src/hooks.server.ts` imports `ensureOpenTelemetry` |
| Receipt mapper | `sveltekit-frontend/src/lib/server/observability/offline-receipt-telemetry-v1.ts` |

## Configuration contract

| Condition | Behavior | Proof |
|---|---|---|
| No telemetry environment | SDK off; no exporter created | `opentelemetry.spec.ts` (disabled by default) |
| `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT` set | OTLP/HTTP trace exporter at that URL | spec; live readback (below) |
| Only `OTEL_EXPORTER_OTLP_ENDPOINT` set | OTLP/HTTP to `<base>/v1/traces`, trailing slashes removed | spec |
| Both set | explicit traces endpoint wins | spec |
| `OTEL_TRACES_EXPORTER=console` | console exporter even when an endpoint is set | spec |
| Enable flag only (`OTEL_ENABLED`) | SDK on, traces stay on console; never a remote default | spec |
| Exporter or SDK failure | logged as non-fatal; `started: false`; no throw into request handling | spec |

Metrics always use `ConsoleMetricExporter` on a 60 s interval (`OTEL_METRIC_EXPORT_INTERVAL_MS`). No metrics backend is configured.

## Privacy and receipt boundary

- The exporter sends auto-instrumented span attributes, including HTTP route and status. Redaction (OBS-06, `telemetry-redaction-v1.ts`) wraps the trace exporter: only allowlisted attribute keys are exported, URL-valued attributes are reduced to their path (query, fragment and credentials dropped), span events are removed, and values are bounded. Metrics are not redacted by this wrapper.
- `offline-receipt-telemetry-v1.ts` maps receipts to `serviceHealth` (always `NOT_MEASURED`), `executionStatus`, `evidenceValidity`, `canonicalAdmission` (always `NOT_ADMITTED`), `receiptDigest`, `agentRunId` (always `null`) and `firstFailingBoundary`. It refuses receipts that claim admission or writes.
- No span, trace, HTTP success or DuckDB success can set `canonicalAdmission` to `ADMITTED`.
- Receipt fields are not yet attached to spans. That attachment is not implemented.

## Proven

- Unit and boundary behavior: `opentelemetry.spec.ts` 7/7 and `offline-receipt-telemetry-v1.spec.ts` 7/7 pass (the latter includes the real receipts on disk).
- Live (local, 2026-10-23): dev server with `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT` set in `sveltekit-frontend/.env` reports `traces=http://127.0.0.1:3030/api/public/otel/v1/traces`. Langfuse 3.200.0 (`langfuse-server`, healthy) received a real trace from `POST /api/atlas/mastra-agent`. Trace ID `26fff142cc19cc89de7364693aa19451` was read back by ID from Langfuse's public API; it contains the route and the HTTP 409 response.

## Unproven

- Attaching receipt fields to spans.
- Mastra tool execution traces with a real run ID (the route trace above is a refusal only).
- Metrics export to any backend.
- Live proof for OBS-06: after the path-only change, Qdrant client spans carry `url.path` and no query string, but the inbound route span for `POST /api/atlas/mastra-agent` did not appear in the newest 300 POST traces in Langfuse. The earlier pre-redaction trace did show the route. Diagnosis (temporary span-key log, since removed): the exporter received 288 spans in one refusal window: 259 CLIENT (kind 2, outbound Qdrant calls), 29 INTERNAL (kind 0), and zero SERVER spans (kind 1). The inbound route request produces no SERVER span. Likely cause, not yet proven: the SDK starts from `hooks.server.ts`, after the dev HTTP server exists, so the HTTP server instrumentation never wraps it. A fix needs the SDK loaded before the server is created (for example a Node preload or instrumentation entry in the dev start command); that changes the dev start contract and is not done.
- Receipt verdict attributes (OBS-07) are defined (`toSpanAttributesV1`) but are not yet attached to any span.
- Jaeger and the Collector in `docker/otel-trace/`: UNUSED / NOT_STARTED. Kept for review; not part of any proven path.
