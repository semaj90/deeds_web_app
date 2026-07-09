## Context

**Current state (Phase 9, MVP 7/10 production-ready):**
- Tool registry exists as a separate index (6 tools: trace.kag_search, atlas.topology_expand, neo4j.dependency_closure, qdrant.dense_search, rg.lexical_search, gemma4.explain_code)
- Tool selection is deterministic (HMM state validator) but observes only embedding similarity
- Packets have identity metadata (packet_key, source_ref, feature_id, domain_class) but no unified ontology
- No telemetry on tool execution; no feedback loop from operational signals
- No schema compatibility filtering before tool ranking
- Separate registries: packets (Postgres), tools (tool_registry), prompts (TBD), schemas (TBD)

**Architectural goal:** Unify all searchable objects under a single ontology packet structure where tools are just `packet_type: "tool"` with additional fields.

**Constraints:**
- Backward compatible — no breaking changes to existing code
- Non-blocking — telemetry logging and stats refresh must not slow tool execution
- Deterministic — schema-based validation, not ML-dependent
- Production-safe — fallback to existing behavior if telemetry unavailable

## Goals / Non-Goals

**Goals:**
- Add unified ontology (packet_type, capabilities, constraints, examples, tags, parent/child relationships) to packets and tools
- Wire telemetry collection (success_count, failure_count, avg_latency_ms, timeout_count, schema_mismatch_count, rolling_success_rate_7d)
- Enable schema compatibility filtering (before Qdrant ANN, filter by supported_packet_types, supported_languages, supported_extensions, exclude deprecated)
- Build materialized view for rolling stats (hourly refresh, O(1) lookup for observation layer)
- Enrich tool embeddings with full schema context (name, description, I/O schemas, examples, domains, limitations) instead of summaries only
- Create feedback loop pattern: tool execution → log → refresh stats → next query reads stats

**Non-Goals:**
- ML training or model updates (XGBoost comes in Phase 11)
- Viterbi HMM inference (Phase 12)
- Full unified packet structure migration (Phase 12b stretch goal) — just lay the foundation
- Tool orchestration or chaining (separate feature, future phase)
- Real-time telemetry streaming (batch hourly refresh is sufficient for v1)

## Decisions

### Decision 1: Schema Additions vs. Table Redesign

**Choice:** Add new columns to existing tables (`atlas_packets`, `tool_registry`), create separate `tool_execution_log` table for telemetry events.

**Rationale:**
- Backward compatible: existing code continues to work
- Incremental deployment: Phase 9 doesn't need to know about ontology fields
- Isolation: telemetry is write-heavy; separate table avoids locking packet reads
- Future-proof: if we unify to single packet table later (Phase 12b), we migrate data, not schema

**Alternatives considered:**
- Redesign both tables with full ontology upfront — too risky, breaks all queries
- Store everything in JSONB — loses queryability, makes stats refresh O(n)

### Decision 2: Materialized View vs. Real-Time Telemetry Table

**Choice:** Hourly-refreshed materialized view (`tool_execution_stats_7d`) joins `tool_execution_log` with rolling window functions.

**Rationale:**
- Fast reads: O(1) stats lookup for observation layer (query time critical)
- Bounded compute: hourly refresh (off-peak window) instead of per-query aggregation
- Deterministic: stats are immutable after refresh hour (no stale cache issues)
- Easy rollback: if telemetry fails, view is stale but queries still work

**Alternatives considered:**
- Real-time aggregation on query — adds latency to tool selection path (unacceptable)
- Keep stats in Redis cache — loses durability, vulnerable to cache eviction during development
- Separate aggregation service — adds operational complexity, out of scope for Phase 10

### Decision 3: Packet Type as Enum vs. String

**Choice:** Use Postgres `ENUM` type with values: `code`, `test`, `doc`, `prompt`, `tool`, `schema`, `api`, `spec`.

**Rationale:**
- Type safety: prevents invalid values, enforced at DB layer
- Queryability: index compression, EXPLAIN ANALYZE clarity
- Drizzle support: clean enum mapping in TypeScript schema
- Future-proof: add new types by ALTER ENUM (online in Postgres 12+)

**Alternatives considered:**
- String column — loses type safety, prone to typos in filters
- Separate table with foreign key — over-normalized for an 8-value set

### Decision 4: Tool Embedding Enrichment Strategy

**Choice:** Regenerate tool embeddings by concatenating: `${name} ${description} Input schema: ${JSON.stringify(input_schema)} Output schema: ${JSON.stringify(output_schema)} Examples: ${examples.join('; ')} Domains: ${domains.join(', ')} Limitations: ${limitations}`

**Rationale:**
- Better semantic signals for Qdrant: schema fields help find tools by input/output type, supported domains
- Example: "find tools that take file paths" → name + input_schema in embedding captures intent
- Maintains 384-dim canonical embedding (project standard, not model-native 768-dim)

**Alternatives considered:**
- Keep summary-only embeddings — loses signal for schema-aware routing (Phase 11/12 will need this)
- Embed each field separately (multi-vector) — adds complexity, Phase 11+ work

### Decision 5: Telemetry Scope and Event Schema

**Choice:** Log every tool execution with: `{ tool_id, query, success: bool, latency_ms, error_type, timestamp }`. Compute rolling stats daily + hourly updates.

**Rationale:**
- Per-tool success_rate enables circuit breaker pattern (auto-QUARANTINE on low success)
- Per-tool latency signals operational degradation (separate from semantic quality)
- error_type allows bucketing (timeout vs schema_mismatch vs API failure)
- Hourly updates provide fresh stats without per-query overhead

**Alternatives considered:**
- Event streaming (Kafka/RabbitMQ) — adds infrastructure, Phase 7+ work, overkill for deterministic stats
- Per-query telemetry — too granular, creates storage overhead

### Decision 6: Integration Point for Telemetry Logging

**Choice:** Log telemetry in `selectTool()` function (after execution, before return) and wire into RabbitMQ `tool.telemetry` queue for async background writes.

**Rationale:**
- Non-blocking: tool selection latency unaffected (queue write is ~1ms)
- Reliable: RabbitMQ durable queue ensures no telemetry loss on process crash
- Decoupled: background worker refreshes stats on schedule, not on each query
- Testable: mock the queue in unit tests, no DB dependency

**Alternatives considered:**
- Synchronous Postgres INSERT — blocks tool execution, unacceptable
- Redis only — loses durability, development cache eviction risk

## Risks / Trade-offs

| Risk | Mitigation |
|------|-----------|
| **Schema evolution complexity** → Adding 16 columns to hot tables could slow migrations | Separate `tool_execution_log` table reduces `atlas_packets` churn. Test ALTER TABLE on production backup first. |
| **Telemetry logging dependency failure** → Tool selection blocked if queue write fails | Queue write is non-blocking (fire-and-forget). Fallback: silently skip telemetry, tool selection proceeds. |
| **Stale stats during off-peak hours** → Query at 3am sees yesterday's stats if refresh window missed | Document the hourly refresh window. Queries gracefully handle missing stats (fallback to zero/neutral values). |
| **Over-filtering with schema compatibility** → Too-strict filters reduce candidate pool, fallback to slower lexical search | Start conservative (no filters). Phase 11 will refine based on false positive rate. Can always loosen filters. |
| **Embedding context too large** → Tool embedding text >10KB for complex schemas | Truncate examples/limitations to summary form. Keep input/output schemas as JSON (compact representation). |
| **Circular dependency in ontology** → Tool depends on feature which depends on tool | Document hard rule: tools can reference features, features can't reference tools. Validator rejects cycles. |

## Migration Plan

**Phase 10 Deployment Order:**

1. **Week 1: Schema additions** (Drizzle migration)
   - Add packet_type enum to `atlas_packets`
   - Add ontology JSONB columns to `atlas_packets` (packet_ontology, parent_packet_key, related_packets, telemetry)
   - Create `tool_registry` ontology columns (tool_capabilities, tool_constraints, tool_examples, tool_tags, failure_modes)
   - Add telemetry columns to `tool_registry` (success_count, failure_count, avg_latency_ms, timeout_count, schema_mismatch_count, false_positive_rate, rolling_success_rate_7d)
   - Create `tool_execution_log` table
   - Dry-run: npm run atlas:phase10:schema:migration:dry
   - Apply: npm run atlas:phase10:schema:migration:apply

2. **Week 2: Telemetry infrastructure**
   - Create materialized view `tool_execution_stats_7d` (hourly refresh)
   - Wire `selectTool()` to emit telemetry to RabbitMQ `tool.telemetry` queue
   - Create background worker to consume queue and insert into `tool_execution_log`
   - Create scheduled job to refresh materialized view hourly
   - Test: Run 50+ tool selections, verify telemetry table populated, stats computed

3. **Week 2-3: Embedding regeneration**
   - Update phase9-tool-registry-index.mjs to use rich context
   - Regenerate all 6 tool embeddings
   - Verify Qdrant HNSW index updated
   - Test: "find tools with file path input" returns correct candidates

4. **Week 3: Integration & backfill**
   - Wire schema compatibility filtering into `rankTools()` (before score calculation)
   - Add filter predicates to HMM state inference (consult supported_packet_types from state's allowed tools)
   - Backfill packet_type (START with highest-priority: code → test → doc; leave remaining NULL for now)
   - Backfill tool ontology fields with parsed metadata from tool_registry
   - Test smoke: All Phase 9 tests still pass; new ontology fields don't break retrieval

**Rollback:**
- Columns are non-breaking; if telemetry infrastructure fails, rollback the queue consumer only
- Revert to Phase 9 state: `git revert <commit-hash>`, run schema rollback migration
- No data loss: `tool_execution_log` can be truncated without affecting packet/tool records

## Open Questions

1. **Should packet_type enum be mandatory or nullable on atlas_packets?** Proposal: start nullable (Phase 10), mandatory by Phase 12b when unification is complete.
2. **What is the failure mode for telemetry? Should tool execution be blocked if queue write fails?** Proposed: fire-and-forget queue write, never block tool selection.
3. **Should we backfill packet_type for all 58K+ packets in Phase 10, or defer to Phase 10b?** Proposed: backfill only highest-priority packets (code/test), others by Phase 10b.
4. **Do we need schema compatibility validation in Phase 10, or defer to Phase 11 when classifier has confidence?** Proposed: Phase 10 adds the capability (schema check function exists), Phase 11 wires it into observation.

