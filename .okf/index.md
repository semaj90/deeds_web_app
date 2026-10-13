---
type: index
title: OKF Knowledge Graph Index
id: index
status: active
owners:
  - legal-ai-team
updated: 2026-07-20
generated:
  by: human:james
---

# OKF Knowledge Graph — Deep Research & Canonical Packet Architecture

This directory contains curated knowledge concepts for the deeds-web-app legal AI platform. Each concept is a portable Markdown export of canonical Parent Atlas knowledge—not a second database or vector storage.

## Directory Structure

- **systems/**: Core architectural systems (HyperRAG, deep research orchestration, packet identity)
- **pipelines/**: Data flow and orchestration pipelines (content ingestion, web sources, retrieval, ranking, synthesis)
- **datasets/**: Corpus and data definitions (legal knowledge bases, training labels, references)
- **tools/**: Agentic tools and integrations (MCP servers, ML sidecars, synthesis models)
- **runbooks/**: Operational guides and setup procedures
- **concepts/**: Domain knowledge and decision records

## Key Concepts

### Knowledge Layer Boundaries
- ✅ **In OKF**: Curated stable concepts (architecture decisions, service ownership, data contracts, runbooks, metric definitions, API semantics, constraints, features, acceptance criteria)
- ❌ **NOT in OKF**: Source files, Qdrant points, event logs, raw embeddings, generated summaries, workflow events, tensor artifacts

### Identity Model
- Paths are identity: `/systems/hyperrag.md` → `id: system/hyperrag`
- Markdown with YAML frontmatter: human-readable, portable, version-controllable
- Source refs connect to canonical Parent Atlas (Postgres packet_key, source_ref)

### Canonical Authority
Postgres 18 remains the single source of truth for:
- Packet identity and chunks: `codebase_chunk_index` = 274,465 rows (verified 2026-10-12; older counts in prior notes are stale)
- Embeddings (768-dim via embeddinggemma): 219,998 `content_embedding_768`, 55,169 `halfvec` `content_embedding`
- Qdrant mirroring: `codebase_chunks_768` = 328,348 points (verified 2026-10-12)
- Neo4j topology mirrors
- Valkey/Redis cache layers
- Audit logs and decision traces

OKF serves as curated knowledge export, not replacement.

## Related Documents

- [Parent Atlas Compute and Retrieval Ownership](systems/parent-atlas-compute-ownership.md)
- [SvelteKit Vite/Vitest Lane](pipelines/sveltekit-vitest-validation.md)

- [Parent Atlas Canonical Architecture](../docs/architecture/CANONICAL-PACKET-WIRING-BLUEPRINT.md)
- [Deep Research Infrastructure](../docs/DEEP-RESEARCH-INDEX.md)
- [HyperRAG Control Panel Guide](../docs/architecture/trace-kag-web-development-guide.md)

## LUT: Lexical retrieval score sources

Source of truth: `docs/MASTER-TOC-v2.md` (section "Lexical retrieval score-source labels") and the code in `sveltekit-frontend/src/lib/server/retrieval/retrieve-candidates.ts`.

| `scoreSource` | Backend | Built-in or extension | Scoring treatment | Status |
|---|---|---|---|---|
| `postgres_fts` | PostgreSQL `ts_rank` on `codebase_chunk_index.search_vector` (GIN) | Built-in | Maps to `bm25Score`; summary hydration applies | Primary lexical lane; live probe returned 50 candidates, top 0.97 |
| `postgres_trigram` | `pg_trgm` similarity / ILIKE fallback | Extension (`pg_trgm`) | Maps to `bm25Score`; excluded from summary hydration | Fallback only |
| `pg_search` BM25 | ParadeDB index `idx_codebase_chunk_pgsearch_bm25` | Extension (`pg_search` 0.25.1) | Not wired | Challenger; not a vote |
| `rg_keyword` | ripgrep scan | External CLI | Summary-stale check only | Not a retrieval vote |

Rule: the label names the executor, not the algorithm. `ts_rank` is not Okapi BM25.

## LUT: MCP tool calling (atlas-tools)

Source: `.tmp/atlas/mcp-capability-census-v1.jsonl` (read-only census, 2026-10-12). Identity is `serverAuthorityId` + `toolName`. Transport success is not evidence: only a `VALIDATED` result counts as proof.

| `toolName` | Schema digest prefix | Handler | Outcome observed | Eligible for execution |
|---|---|---|---|---|
| `classify_intent` | `c87b9` | REACHABLE | Well-formed envelope (intent=planning, confidence 0.85) | Advisory only |
| `find_feature` | `bfade` | REACHABLE | Feature list, provenance UNRESOLVED | No |
| `find_dependencies` | `1a81a` | REACHABLE | PROJECTION_MISSING_FILE, UNRESOLVED | No |
| `find_route` | `b6a7c` | REACHABLE | Empty routes, UNRESOLVED | No |
| `find_source_refs` | `a057c` | REACHABLE | LOOKUP_FAILED / TRACE_TOOL_ERROR | No |
| `trace_database` | `1dc63` | REACHABLE | Empty traces, UNRESOLVED | No |
| `trace_tool_chain` | `65d61` | REACHABLE | Empty traces, UNRESOLVED | No |
| `build_agentic_rag_context` | `dfb4c` | REACHABLE | LIVE_RETRIEVAL_UNAVAILABLE | No |
| `build_recommendation` | `76050` | NOT_TESTED | Skipped (possibly write-like) | No |
| `record_outcome` | `11e2f` | NOT_TESTED | Skipped: write-class (NDJSON ledger, Neo4j) | No; do not call |

Notes:
- The census labels these rows `SMOKE_PASSED`; that label is too generous. Read as "call succeeded, no validated evidence."
- TRACE (`parent-atlas-mcp-trace`): 189 tools discovered by direct probe, none smoke-tested. The session client reported ECONNREFUSED on `:8788`, which is unresolved.
- Permissions are UNVERIFIED for every tool. A READ label is not a safety proof.
- `ops.*` gating is documentation only until authentication is verified (see MASTER-TOC-v2).
