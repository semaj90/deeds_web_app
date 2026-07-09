## Why

The current tool selection system (Phase 9, MVP 7/10 production-ready) lacks infrastructure to learn from execution history or route based on operational telemetry. HMM state validation works deterministically but observes only embedding similarity — not classifier confidence, schema compatibility, or tool reliability. Phase 10 unifies all searchable objects (packets, tools, prompts, schemas) under a single ontology with telemetry integration, enabling the multi-signal observation layer and feedback loop required for Phase 11 (XGBoost) and Phase 12 (Viterbi HMM).

## What Changes

- **New schema fields on `atlas_packets`**: Add `packet_type enum` (code, test, doc, prompt, tool, schema, api, spec), `packet_ontology jsonb` (capabilities, constraints, examples, tags), `parent_packet_key`, `related_packets text[]`, `telemetry jsonb` for execution history.
- **Extend `tool_registry`** with matching ontology structure: `tool_capabilities jsonb`, `tool_constraints jsonb`, `tool_examples jsonb`, `tool_tags text[]`, `failure_modes jsonb`, plus telemetry columns (`success_count`, `failure_count`, `avg_latency_ms`, `timeout_count`, `schema_mismatch_count`, `false_positive_rate`, `rolling_success_rate_7d`).
- **Create `tool_execution_log` table**: Record every tool invocation (tool_id, query, success, latency, error_type, timestamp).
- **Add materialized view** for rolling statistics: success_rate, avg_latency, timeout_count updated hourly.
- **Wire telemetry feedback loop**: Tool execution → log event → hourly stats refresh → next routing consults fresh statistics.
- **Update tool registry indexing** (Phase 9 follow-up): Embed richer context (name, description, input/output schemas, examples, domains, limitations) instead of summaries only.

## Capabilities

### New Capabilities

- `packet-ontology-schema`: Add `packet_type` enum and ontology JSONB fields to `atlas_packets` for hierarchical relationships and capabilities metadata (1-2 weeks).
- `tool-registry-ontology`: Extend `tool_registry` with capabilities, constraints, examples, tags, and failure tracking for schema-aware tool filtering (1-2 weeks).
- `tool-telemetry-collection`: Create `tool_execution_log` table and log every tool invocation with success/failure/latency metrics (1 week).
- `telemetry-materialized-view`: Build hourly-refreshing materialized view of rolling success rates, latencies, timeout counts, and schema mismatches for operational visibility (3-5 days).
- `tool-embedding-enrichment`: Regenerate tool embeddings with full schema context (name, description, I/O, examples, domains, limitations) for better Qdrant signals (2-3 days).
- `feedback-loop-wiring`: Wire tool execution → telemetry logging → statistics refresh → multi-signal observation layer for HMM state inference (1 week).

### Modified Capabilities

- `tool-registry-index`: Enhance tool registry with richer embedding source and schema compatibility filtering (Phase 9 follow-up, existing capability expanded).

## Impact

- **Database schema**: 8 new columns on `atlas_packets`, 8 new columns + 1 table on tool infrastructure, 1 new materialized view.
- **Code paths**: Tool execution layer (wherever selectTool is called) → add telemetry logging; HMM state inference layer → read telemetry for multi-signal observations.
- **APIs**: `/api/tools/search` response shape may add telemetry fields; Phase 11 will add XGBoost confidence to observation.
- **Performance**: Hourly stats refresh is non-blocking; tool execution logging is async. Qdrant filtering by schema compatibility reduces candidate set before ANN search (faster).
- **Breaking changes**: None. Backward-compatible schema additions; telemetry is additive.

