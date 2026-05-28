# Atlas Component Profiles
Generated: 2026-05-28T03:30:53.155Z

## Summary
Total profiles: 2432

### Counts by kind
- **db_table**: 18
- **file**: 1892
- **api_route**: 6
- **redis_key**: 228
- **qdrant_collection**: 75
- **cuda_bridge**: 206
- **libtorch_addon**: 7

## Sample entries
- **llm-stuck-events** (db_table) — import { pgTable, text, jsonb, boolean, timestamp } from 'drizzle-orm/pg-core'; — imports: 1
- **context-assembler** (file) — import { normalizeLabels } from '@/lib/server/labels/normalize-labels'; — imports: 2
- **index** (file) — export * from './cluster-tags-cache'; — imports: 0
- **variance-recovery-schema** (db_table) — import { z } from 'zod'; — imports: 1
- **feature-mapping-graph-cli** (file) —  * @fileoverview CLI entry point to run the entire feature mapping graph workflow. * This script orchestrates the entire process for end-to-end testing. — imports: 2
- **feature-mapping-graph** (file) —  * @fileoverview LangGraph orchestrator for building a Feature Map from codebase structure and metadata. * This graph guides the discovery process, ensuring all relevant code, metadata, and relationships are mapped. — imports: 8
- **metadata-detection-node** (file) —  * @fileoverview Node responsible for analyzing file content for usage patterns related to JSONB metadata. * This simulates deep semantic analysis of metadata usage across the codebase. — imports: 1
- **rerank-node** (file) —  * @fileoverview Node responsible for reranking candidate features using vector and trust scores. * This simulates the TurboVec/Atlas reranking flow. — imports: 1
- **scan-directory-node** (file) —  * @fileoverview Node module responsible for scanning directories and collecting file paths and basic metadata. * This node simulates file system traversal and initial metadata extraction. — imports: 3
- **schema-usage-node** (db_table) —  * @fileoverview Node responsible for analyzing schema and usage to build metadata context. * This node utilizes db.table_inspect and trace.kag_search to understand JSONB usage. — imports: 2
- **subgraph-expand-node** (file) —  * @fileoverview Node responsible for deep-diving into graph structures to find related components. * This node expands the context graph beyond immediate dependencies. — imports: 1
- **toon-context-node** (file) —  * @fileoverview Node responsible for creating the TOON context packet (compact summary). * This node synthesizes all gathered information into a single, highly compact context blob. — imports: 1
- **write-feature-index-node** (file) —  * @fileoverview Node responsible for persisting the final feature index and cache traces. * This writes the structured data to Postgres and Redis. — imports: 2
- **learning-loop** (file) — import { Redis } from '@redis'; — imports: 2
- **openai-facade** (file) — import { assembleACEContext } from '@/lib/server/ace/context-assembler'; — imports: 3
- **auth-utils** (file) — import { cookies } from 'next/headers'; — imports: 2
- **agent-memory** (db_table) — import { pgTable, text, jsonb, timestamp, integer, index } from 'drizzle-orm/pg-core'; — imports: 1
- **synthesis-logs** (db_table) — import { pgTable, text, jsonb, timestamp, integer, index } from 'drizzle-orm/pg-core'; — imports: 1
- **schema-engram** (db_table) — import { pgTable, text, integer, timestamp } from 'drizzle-orm/pg-core'; — imports: 2
- **flow-enforcer** (file) — import { getGatewayState, saveGatewayMessage, updateMessageStatus } from './state-manager'; — imports: 1

## Next steps
- Review `.tmp/atlas-component-profiles.jsonl` for completeness
- Load into Postgres table `atlas_component_profiles` (schema: sourceRef TEXT PRIMARY KEY, payload JSONB)
- Index into Qdrant collection `atlas_component_profiles_768` with `embeddinggemma:latest`
- Cache hot items in Redis key `atlas:profiles:hot`

## Notes
- This scan uses heuristics. Manually review high-risk/native files for correctness.