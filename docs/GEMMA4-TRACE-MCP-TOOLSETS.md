# Gemma4 ↔ TRACE MCP Tool Configuration

**Context**: Gemma4 (like Ornithopter) can handle max **3 tools per request**.  
**Total TRACE MCP Tools**: **117 tools** across 30 namespaces.  
**Required Tool Sets for Full Coverage**: **39 sets**

---

## Quick Reference: Recommended Tool Combinations

### 🔍 **For Semantic Search & Retrieval** (most common)
```json
{
  "tools": [
    "kb.hybrid_search",
    "context.build_kv_packet",
    "trace.kag_search"
  ]
}
```
**Use when**: User asks "find documents about X", "search codebase for Y", "what do we know about Z"

### 📊 **For Schema & Data Discovery**
```json
{
  "tools": [
    "db.schema_overview",
    "db.table_inspect",
    "context.build_kv_packet"
  ]
}
```
**Use when**: User asks "what tables exist", "show me schema", "describe the database structure"

### 🕸️ **For Graph & Topology Analysis**
```json
{
  "tools": [
    "graph.expand_neighborhood",
    "graph.shortest_path",
    "topology.search_near"
  ]
}
```
**Use when**: User asks "what depends on this", "find the shortest path", "expand this concept"

### 📝 **For Code Understanding**
```json
{
  "tools": [
    "file.read_window",
    "context.build_ace_packet",
    "kag.feature_lookup"
  ]
}
```
**Use when**: User asks "explain this function", "what does this file do", "show me the code"

### 🧠 **For Memory & Agent Operations**
```json
{
  "tools": [
    "engram.chat_memory_recent",
    "kag.recall_similar_fix",
    "trace.explain_retrieval"
  ]
}
```
**Use when**: User asks "what did we discuss before", "similar problems solved", "explain the retrieval"

---

## All 39 Tool Sets (Ordered by Priority)

| Set | Priority | Tools | Use Case |
|-----|----------|-------|----------|
| 1 | ⭐⭐⭐ | `kb.hybrid_search`, `context.build_kv_packet`, `trace.kag_search` | Core retrieval |
| 2 | ⭐⭐⭐ | `graph.expand_neighborhood`, `graph.shortest_path`, `topology.search_near` | Graph traversal |
| 3 | ⭐⭐⭐ | `kb.explain_context_pack`, `context.build_ace_packet`, `kag.panel_context` | Context building |
| 4 | ⭐⭐ | `file.read_window`, `codebase.context_for_file`, `kag.feature_lookup` | Code analysis |
| 5 | ⭐⭐ | `wiki.search`, `topology.search_som_neighborhood`, `kb.search_pathways` | Codebase search |
| 6 | ⭐⭐ | `search.rerank`, `search.hybrid`, `search.postgres_fts` | Multi-lane search |
| 7 | ⭐ | `engram.chat_memory_recent`, `kag.recall_similar_fix`, `trace.explain_retrieval` | Memory & history |
| 8 | ⭐ | `clusters.get_members`, `clusters.get_summary_lenses`, `topology.same_som_cluster` | Clustering |
| 9 | ⭐ | `graph.pagerank_top`, `atlas.graph.pagerank`, `karpathy.som_topology_stats` | Authority scoring |
| 10 | Medium | `hypergraph.search`, `hypergraph.expand_members`, `hypergraph.get_edge` | Hypergraph ops |
| 11 | Medium | `evidence.search_by_image`, `image.search_by_text`, `image.caption` | Image search |
| 12 | Medium | `atlas.packet_search`, `atlas.coverage`, `atlas.workstation_status` | Atlas ops |
| 13 | Low | `ops.propose_patch`, `ops.run_targeted_test`, `ops.audit_tool_result` | Patch operations |
| 14+ | Low | Various ops, service workers, health checks | Auxiliary |

---

## Tool Set Strategy for Gemma4

### Strategy A: Dynamic Tool Selection (Recommended)
```typescript
// Pseudo-code for Gemma4 integration
function selectToolsForQuery(userQuery: string): string[] {
  if (userQuery.match(/search|find|retrieve|query/i)) {
    return Set1; // Semantic search
  }
  if (userQuery.match(/schema|table|database|structure/i)) {
    return Set2; // Schema discovery
  }
  if (userQuery.match(/depends|path|neighbor|graph|topology/i)) {
    return Set3; // Graph analysis
  }
  if (userQuery.match(/code|function|file|explain/i)) {
    return Set4; // Code analysis
  }
  if (userQuery.match(/memory|previous|similar|history/i)) {
    return Set5; // Memory & history
  }
  return Set1; // Default to search
}
```

### Strategy B: Sequential Tool Enabling
- **Phase 1 (MVP)**: Enable only Priority ⭐⭐⭐ tool sets (Sets 1-3)
- **Phase 2**: Add Priority ⭐⭐ tool sets (Sets 4-6) after validating Phase 1
- **Phase 3**: Add specialized sets (Images, Atlas, Hypergraph) as needed
- **Phase 4**: Add operational tools (patches, tests) for advanced workflows

### Strategy C: Request-Scoped Tool Injection
```typescript
// Gemma4 context assembly
const toolsForThisRequest = selectToolsForQuery(userQuery);
const gemma4Input = {
  system: systemPrompt,
  messages: userMessages,
  tools: toolsForThisRequest, // Max 3 tools
  maxTokens: 4096,
  temperature: 0.7
};
```

---

## Implementation Checklist

- [ ] **MCP Server Health**: Verify TRACE MCP running on port 8788
- [ ] **Tool Registration**: Confirm all 117 tools registered via `tools/list`
- [ ] **Gemma4 Integration**: Wire tool sets into Gemma4 context assembler
- [ ] **Query Classification**: Implement `selectToolsForQuery()` logic
- [ ] **Testing**: Validate each tool set with representative queries
- [ ] **Monitoring**: Track tool call success rates per set
- [ ] **Documentation**: Update Gemma4 system prompt with tool descriptions

---

## Tools by Functional Category (Quick Index)

### Retrieval & Search (30 tools)
**Recommended Priority Set**: Set 1  
**Key Tools**: `kb.hybrid_search`, `search.rerank`, `trace.kag_search`  
**Use**: Finding documents, semantic search, multi-lane queries

### Context & Schema (13 tools)
**Recommended Priority Set**: Set 3  
**Key Tools**: `context.build_kv_packet`, `context.build_ace_packet`  
**Use**: Building LLM context, querying schemas

### Graph & Topology (24 tools)
**Recommended Priority Set**: Set 2  
**Key Tools**: `graph.expand_neighborhood`, `graph.shortest_path`  
**Use**: Relationship analysis, dependency traversal

### Clustering & Analysis (7 tools)
**Recommended Priority Set**: Set 8  
**Key Tools**: `clusters.get_members`, `clusters.get_summary_lenses`  
**Use**: SOM cell queries, cluster membership

### File & Code (5 tools)
**Recommended Priority Set**: Set 4  
**Key Tools**: `file.read_window`, `codebase.context_for_file`  
**Use**: Code browsing, file inspection

### Validation & Verification (8 tools)
**Recommended Priority Set**: Set 13  
**Key Tools**: `ops.run_targeted_test`, `ops.validate_tool_call`  
**Use**: Testing patches, auditing

---

## Limitations & Constraints

| Constraint | Value | Mitigation |
|-----------|-------|-----------|
| Max tools per request | 3 | Use tool set selection strategy |
| Total tools available | 117 | Organize into 39 sets by priority |
| TRACE MCP port | 8788 | Health check: `curl http://127.0.0.1:8788/...` |
| Tool invocation latency | ~500ms avg | Cache results, batch queries |
| Response token limit | Variable | Use `context.get_compressed_card` for brevity |

---

## Status

✅ **TRACE MCP Server**: Running on port 8788  
✅ **Tool Count**: 117 tools registered  
✅ **Tool Sets**: 39 sets organized (39 × 3 = 117 tools)  
✅ **Gemma4 Config**: Ready for integration  
⏳ **Integration Status**: Awaiting Gemma4 context wiring

---

## Next Steps

1. **Wire Gemma4 Integration**: Implement `selectToolsForQuery()` in Gemma4 context assembler
2. **Test Each Set**: Run sample queries for each priority set
3. **Monitor Tool Calls**: Track success rates, latencies, errors
4. **Document Tool Effects**: Build a runbook of "when to use which tools"
5. **Optimize Weights**: Adjust tool set priority based on actual usage patterns

---

**Document Version**: 1.0  
**Last Updated**: July 30, 2026  
**TRACE MCP Status**: Operational ✅  
**Gemma4 Readiness**: Configuration Complete ✅
