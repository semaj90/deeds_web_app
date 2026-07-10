# Phase 2B: MCP Tool Deep Audit Report
**Date**: 2026-07-10T14:40:13.962Z
**Tools Discovered**: 20

## Summary
- **Read-Only**: 11 (55.0%)
- **Requires Auth**: 0 (0.0%)
- **Provides Source Refs**: 1 (5.0%)

## Domain Distribution
- Search: 3
- Knowledge-Augmented Generation: 3
- Knowledge Base: 2
- Tracing: 2
- Graph Analysis: 2
- Topology: 2
- Clustering: 2
- Database: 2
- Context Assembly: 1
- Operations: 1

## Risk Distribution
- low: 11
- medium: 9

## Tool Categories

### High-Risk Tools (0)


### Read-Only Tools (11)
- kb.trace_search (Knowledge Base)
- trace.kag_search (Tracing)
- topology.search_near (Topology)
- topology.cluster_summary (Topology)
- clusters.get_summary_lenses (Clustering)
- clusters.list_packets_in_cluster (Clustering)
- search.bm25_index (Search)
- search.semantic_index (Search)
- search.hybrid_blend (Search)
- db.schema_overview (Database)
- kag.synthesis (Knowledge-Augmented Generation)

### Tools with Source Refs (1)
- kb.trace_search

## Recommended Tool Blends (by Use Case)

### Code Search (vector + keyword blend)
- Primary: kb.trace_search (semantic search)
- Secondary: search.* tools (full-text index)
- Fallback: graph.expand_neighborhood (topology)

### Topology Traversal (graph + KAG blend)
- Primary: graph.expand_neighborhood
- Secondary: topology.search_near
- Fallback: clusters.get_summary_lenses

### Context Assembly (ACE pipeline)
- Primary: context.build_kv_packet
- Secondary: kag.* tools (knowledge synthesis)
- Tertiary: trace.explain_retrieval (debugging)

## Errors (1)
- [postgres_persist] password authentication failed for user "legal_admin"

## Next Steps (Phase 2B Continuation)
1. Create tool recommendation engine (query intent → tool blend)
2. Index tools into Qdrant named vectors (8-vector lane)
3. Build latency + success rate profiles for each tool
4. Wire into router as "escalate to manual" when gaps detected
5. Implement fallback: query LLM for next-best tool
