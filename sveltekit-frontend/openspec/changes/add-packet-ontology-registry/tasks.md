## 1. Database Schema Migration

- [ ] 1.1 Create Drizzle migration file: add packet_type enum to database
- [ ] 1.2 Add packet_type enum type to Drizzle schema (code, test, doc, prompt, tool, schema, api, spec)
- [ ] 1.3 Add packet_ontology JSONB column to atlas_packets schema
- [ ] 1.4 Add parent_packet_key (nullable uuid FK) column to atlas_packets schema
- [ ] 1.5 Add related_packets (text array) column to atlas_packets schema
- [ ] 1.6 Add telemetry JSONB column to atlas_packets schema
- [ ] 1.7 Add tool_capabilities JSONB column to tool_registry schema
- [ ] 1.8 Add tool_constraints JSONB column to tool_registry schema
- [ ] 1.9 Add tool_examples JSONB column to tool_registry schema
- [ ] 1.10 Add tool_tags text array column to tool_registry schema
- [ ] 1.11 Add failure_modes JSONB column to tool_registry schema
- [ ] 1.12 Add success_count int column to tool_registry schema
- [ ] 1.13 Add failure_count int column to tool_registry schema
- [ ] 1.14 Add avg_latency_ms real column to tool_registry schema
- [ ] 1.15 Add timeout_count int column to tool_registry schema
- [ ] 1.16 Add schema_mismatch_count int column to tool_registry schema
- [ ] 1.17 Add false_positive_rate real column to tool_registry schema
- [ ] 1.18 Add rolling_success_rate_7d real column to tool_registry schema
- [ ] 1.19 Create tool_execution_log table (tool_id, query text(500), success bool, latency_ms int, error_type text, timestamp)
- [ ] 1.20 Add index on tool_execution_log (tool_id, timestamp) for stats refresh performance
- [ ] 1.21 Test migration dry-run: npm run atlas:phase10:schema:migration:dry
- [ ] 1.22 Apply migration: npm run atlas:phase10:schema:migration:apply
- [ ] 1.23 Verify all columns exist in live Postgres: SELECT column_name FROM information_schema.columns WHERE table_name = 'atlas_packets'

## 2. Materialized View for Telemetry

- [ ] 2.1 Create materialized view tool_execution_stats_7d SQL script
- [ ] 2.2 Join tool_execution_log with 7-day window and group by tool_id
- [ ] 2.3 Compute aggregates: COUNT(success=true), COUNT(success=false), AVG(latency_ms), COUNT(error_type='timeout'), COUNT(error_type='schema_mismatch'), (COUNT(success=false) / COUNT(*))
- [ ] 2.4 Test materialized view creation script on dev database
- [ ] 2.5 Create hourly refresh trigger (via pg_cron or RabbitMQ scheduled message)
- [ ] 2.6 Test refresh completes in <30 seconds with 10K sample log entries
- [ ] 2.7 Verify stats accuracy: insert test data, refresh, check computed values

## 3. RabbitMQ Telemetry Infrastructure

- [ ] 3.1 Create RabbitMQ queue declaration: tool.telemetry (durable=true, persistent messages)
- [ ] 3.2 Wire selectTool() to emit telemetry event to tool.telemetry queue (after tool execution)
- [ ] 3.3 Create telemetry event schema (tool_id, query:string[500], success:bool, latency_ms:int, error_type?:string, timestamp:ISO8601)
- [ ] 3.4 Create RabbitMQ consumer worker (consume tool.telemetry, prefetch=1, insert into tool_execution_log)
- [ ] 3.5 Add error handling to consumer: nack + retry up to 3 times, then send to dead-letter queue
- [ ] 3.6 Add consumer graceful shutdown: finish processing before closing channel
- [ ] 3.7 Create npm script to start telemetry consumer: npm run worker:tool-telemetry
- [ ] 3.8 Test telemetry emission: call selectTool, verify queue has event
- [ ] 3.9 Test consumer: feed 10 sample events, verify tool_execution_log has 10 rows
- [ ] 3.10 Test error handling: feed malformed event, verify DLQ behavior
- [ ] 3.11 Verify non-blocking: tool selection latency unchanged after telemetry wiring

## 4. Tool Embedding Enrichment

- [ ] 4.1 Update tool metadata structure to include: tool.input_schema, tool.output_schema, tool.examples, tool.limitations (in tool_registry or separate object)
- [ ] 4.2 Identify 6 canonical tools and gather/populate missing metadata fields
- [ ] 4.3 Create tool-embedding-context builder: concatenate name + description + schemas + examples + domains + limitations
- [ ] 4.4 Create embedding regeneration script: npm run atlas:phase10:tool-embeddings:regenerate --dry-run
- [ ] 4.5 Verify embedding text <10KB (truncate examples/limitations if needed)
- [ ] 4.6 Test embedding generation produces 384-dim vectors
- [ ] 4.7 Add Qdrant update logic: upsert embeddings to tool_registry collection
- [ ] 4.8 Verify Qdrant HNSW index is recomputed after upsert
- [ ] 4.9 Test schema-aware search: query "tools that take file paths", verify relevant tools returned
- [ ] 4.10 Run full embedding regeneration: npm run atlas:phase10:tool-embeddings:regenerate
- [ ] 4.11 Verify idempotency: run regeneration twice, same results both times
- [ ] 4.12 Test backward compatibility: Phase 9 tool queries still work

## 5. Schema Compatibility Filtering (Preparation)

- [ ] 5.1 Create schema compatibility validation function: validateToolSchema(query, tool_registry_row) -> bool
- [ ] 5.2 Add Qdrant payload filter predicates: supported_packet_types, supported_languages, supported_extensions (read from tool_registry ontology)
- [ ] 5.3 Test filter logic: query with packet_type='code', verify only tools supporting code are candidates
- [ ] 5.4 Integrate filters into rankTools() (optional in Phase 10, required in Phase 11)
- [ ] 5.5 Document filter behavior: which filters are optional vs. required, default behavior if missing metadata

## 6. Packet Type Backfill (Priority Subset)

- [ ] 6.1 Create backfill script: assign packet_type for highest-priority packets (code, test)
- [ ] 6.2 Identify packet-type sources: use feature_id patterns, source_ref file extensions, AST analysis results
- [ ] 6.3 Write backfill dry-run: npm run atlas:phase10:backfill:packet-type:dry
- [ ] 6.4 Test on 100 sample packets, verify assignments are sensible
- [ ] 6.5 Run full backfill for code+test packets only (defer doc/prompt/tool to Phase 10b)
- [ ] 6.6 Verify backfill accuracy: spot-check 10 rows, confirm packet_type matches content

## 7. Feedback Loop Integration

- [ ] 7.1 Wire tool_registry telemetry columns to be read from materialized view (or sync on refresh)
- [ ] 7.2 Update selectTool() to read rolling_success_rate_7d and avg_latency_ms from tool_registry
- [ ] 7.3 Pass telemetry signals to HMM observation layer (prepare for Phase 11, don't wire yet)
- [ ] 7.4 Add fallback logic: if stats unavailable, use neutral values (success_rate=0.5)
- [ ] 7.5 Test end-to-end: execute tool → log telemetry → refresh stats → read stats in next query

## 8. Integration Testing

- [ ] 8.1 Create integration test: 50 tool selections, verify telemetry logged for each
- [ ] 8.2 Test stats refresh: run materialized view refresh, verify success_count/failure_count computed
- [ ] 8.3 Test HMM observation layer reads stats (dry-run, no ranking changes yet)
- [ ] 8.4 Test backward compatibility: all Phase 9 tests still pass
- [ ] 8.5 Test error scenarios: tool timeout, schema mismatch, API failure all logged with correct error_type
- [ ] 8.6 Performance test: 1000 tool selections, verify <1ms telemetry overhead per selection
- [ ] 8.7 Verify no data loss: all telemetry events are persisted (after RabbitMQ refresh window)

## 9. npm Scripts and CLI

- [ ] 9.1 Add npm script: atlas:phase10:schema:migration:dry
- [ ] 9.2 Add npm script: atlas:phase10:schema:migration:apply
- [ ] 9.3 Add npm script: atlas:phase10:tool-embeddings:regenerate
- [ ] 9.4 Add npm script: atlas:phase10:tool-embeddings:regenerate:dry
- [ ] 9.5 Add npm script: atlas:phase10:backfill:packet-type:dry
- [ ] 9.6 Add npm script: atlas:phase10:backfill:packet-type:apply
- [ ] 9.7 Add npm script: worker:tool-telemetry (background consumer)
- [ ] 9.8 Add npm script: atlas:phase10:stats:refresh (manual refresh if needed)
- [ ] 9.9 Add npm script: atlas:phase10:validate (smoke test all Phase 10 components)

## 10. Documentation and Monitoring

- [ ] 10.1 Document packet_type enum values and usage in Drizzle schema
- [ ] 10.2 Document tool ontology fields in tool_registry (capabilities, constraints, examples, tags)
- [ ] 10.3 Document telemetry logging architecture (emit → queue → consumer → log → refresh → stats)
- [ ] 10.4 Document materialized view refresh schedule and performance
- [ ] 10.5 Create dashboard/query for telemetry observability (success_rate by tool, latency distribution)
- [ ] 10.6 Document fallback behavior (if telemetry unavailable)
- [ ] 10.7 Create runbook for troubleshooting telemetry issues
- [ ] 10.8 Document Phase 10 completion gates (all tasks done, all tests pass, backward compat verified)

