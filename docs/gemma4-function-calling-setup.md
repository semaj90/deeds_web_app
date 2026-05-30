# Gemma4 Function-Calling Setup Guide

## Overview

This guide explains how to set up and use Gemma4 with OpenCode for automatic function-calling and semantic packet management in Redis.

## Architecture

```
User Query (OpenCode)
  ↓
Gemma4 Function Caller (gemma4-function-caller agent)
  ↓
Semantic Routing (if-then trigger analysis)
  ↓
MCP Tool Selection
  ├── trace.kag_search (semantic queries)
  ├── graph.expand_neighborhood (graph traversal)
  ├── topology.search_near (topology analysis)
  ├── context.build_kv_packet (context building)
  └── codebase.rg_search (code search)
  ↓
Redis Semantic Packet (gemma4:agent:function-caller:*)
  ↓
Tool Result → Context Injection → Model Output
```

## Configuration

### OpenCode Agents

Two new agents are configured in `opencode.json`:

#### 1. `antigravity` (Enhanced)
- **Purpose**: Minimal MCP-first agent with function-calling support
- **Tools**: Enabled (max 3 calls per query)
- **Function Calling**: Auto trigger mode with semantic routing
- **Redis**: Packets stored at `gemma4:agent:antigravity:*` (3600s TTL)

#### 2. `gemma4-function-caller` (NEW)
- **Purpose**: Automatic function-calling for tool dispatch
- **Tools**: Enabled (max 5 calls per query)
- **Parallel Calls**: Supported for batch operations
- **Semantic Routing**: Enabled (intelligent tool selection)
- **Redis**: Packets stored at `gemma4:agent:function-caller:*` (3600s TTL)

### Redis Packet Structure

```typescript
{
  key: "gemma4:agent:function-caller:{packet_id}",
  value: {
    id: string;              // SHA256 hash of tools
    timestamp: number;       // Unix milliseconds
    source: string;          // Agent name
    toolsCount: number;      // Number of tools
    tools: ToolDef[];
    context: string;         // Agent context
    metadata: Record<string, unknown>;
  },
  semantics: {
    type: "tool" | "prompt" | "context";
    tags: SemanticTag[];
    lastUpdated: number;
  }
}
```

## Usage

### 1. Build Tools from Graphify

```bash
npx ts-node scripts/redis-semantic-packet-manager.ts \
  --action build_tools \
  --source graphify
```

Output:
```
✅ Tool Packet Generated
   ID: a1b2c3d4e5f6
   Tools: 5
   Key: gemma4:tools:a1b2c3d4e5f6

Redis Command:
SET gemma4:tools:a1b2c3d4e5f6 '...' EX 86400
```

### 2. Generate Semantic Prompt from Todo List

```bash
npx ts-node scripts/redis-semantic-packet-manager.ts \
  --action generate_prompt \
  --source todo
```

Output:
```
✅ Prompt Packet Generated
   ID: f6e5d4c3b2a1
   Semantics: 4
   Triggers: 3
   Key: gemma4:prompt:f6e5d4c3b2a1
```

### 3. Extract Semantics from Text

```bash
npx ts-node scripts/redis-semantic-packet-manager.ts \
  --action extract \
  --semantic extract
```

Output:
```
✅ Semantics Extracted:

   [tools] (confidence: 90%)
     - trace.kag_search
     - graph.expand_neighborhood

   [domain] (confidence: 80%)
     - semantic search

   [triggers] (confidence: 85%)
     - if query contains tool names
```

### 4. List Redis Packets

```bash
npx ts-node scripts/redis-semantic-packet-manager.ts \
  --action list \
  --pattern "gemma4:tools:*"
```

## Semantic Extraction Patterns

The semantic extractor uses regex patterns to identify:

### Tool Names
```
Pattern: tool|function|command[\s:]+([a-z_][a-z0-9_]*)
Examples:
  "tool: trace.kag_search"
  "function search_codebase"
  "command expand_graph"
```

### Contexts
```
Pattern: context|scope|about[\s:]+([^.\n]+)
Examples:
  "context: semantic search"
  "about: graph traversal"
```

### Triggers
```
Pattern: if|when|trigger[\s]+([a-z_\s]+?)(?:then|→|-|:)
Examples:
  "if query contains 'dependencies' then expand_graph"
  "when semantic search fails → use hybrid_search"
```

### Semantic Markers
```
Pattern: #([a-z_][a-z0-9_]*)
Examples:
  "#important #retrieval"
  "#tool-calling #auto-dispatch"
```

## Function-Calling Trigger Rules

Gemma4 automatically selects tools based on query semantics:

### Rule 1: Semantic Queries
```
Query contains: "find", "search", "similar", "relevant"
→ Use: trace.kag_search, trace.atlas_query
```

### Rule 2: Graph Traversal
```
Query contains: "depends on", "related to", "connected", "expand"
→ Use: graph.expand_neighborhood, graph.shortest_path
```

### Rule 3: Topology Analysis
```
Query contains: "near", "cluster", "spatial", "proximity"
→ Use: topology.search_near, clusters.get_summary_lenses
```

### Rule 4: Context Building
```
Query contains: "context", "background", "information needed"
→ Use: context.build_kv_packet, context.get_compressed_card
```

### Rule 5: Code Search
```
Query contains: "code", "file", "function", "import", "symbol"
→ Use: codebase.rg_search, trace.explain_retrieval
```

## Advanced: Automatic If-Then Routing

The system supports automatic if-then rule creation from graphify outputs:

```typescript
// Example: Extracted from graphify output
{
  "if": "user_query.includes('dependencies')",
  "then": "call graph.expand_neighborhood",
  "fallback": "call codebase.rg_search",
  "confidence": 0.92
}
```

## Troubleshooting

### Issue: Tools Not Being Called

**Solution**: Check the query contains recognizable semantic markers:
- Semantic queries: add keywords like "find", "search", "similar"
- Graph queries: add "depends on", "related", "expand"
- Code search: add "file", "function", "import"

### Issue: Redis Packet Not Created

**Solution**: Verify Redis is running and accessible:
```bash
redis-cli ping
# Should return: PONG
```

### Issue: Semantic Tags Not Extracted

**Solution**: Ensure text contains standard markers:
- Use `#tag` syntax for semantic markers
- Use "tool:", "function:", "command:" prefixes
- Use "if/when/trigger" for conditional statements

## Advanced Usage

### Custom Semantic Extractor

```typescript
import { SemanticExtractor } from './scripts/redis-semantic-packet-manager';

const extractor = new SemanticExtractor(`
  Tool: my_custom_tool
  Description: Does something important
  #critical #performance
`);

const semantics = extractor.extract();
console.log(semantics);
```

### Custom Tool Packet

```typescript
import { ToolPacketBuilder, RedisPacketManager } from './scripts/redis-semantic-packet-manager';

const packet = new ToolPacketBuilder()
  .addTools([
    {
      name: 'my.custom.tool',
      description: 'Custom tool description',
      parameters: {
        query: { type: 'string', description: 'Search query' }
      },
      required: ['query']
    }
  ])
  .setContext('Custom context for my tool')
  .build();

const redisPacket = RedisPacketManager.encodeToolPacket(packet);
console.log(redisPacket.key);  // gemma4:tools:a1b2c3d4e5f6
```

### Custom Prompt from Todo

```typescript
import { PromptPacketBuilder } from './scripts/redis-semantic-packet-manager';

const packet = new PromptPacketBuilder()
  .fromTodoList('/path/to/todo.md')
  .addTriggers(['if task is urgent', 'if deadline is today'])
  .build();
```

## Integration with OpenCode

Use the `gemma4-function-caller` agent in OpenCode:

```bash
# Ask OpenCode to use the function-calling agent
opencode --agent gemma4-function-caller "What are the dependencies of the auth module?"
```

The agent will:
1. Analyze your query for semantic meaning
2. Select appropriate tools (e.g., `graph.expand_neighborhood`)
3. Execute tools in parallel if applicable
4. Cache results in Redis with semantic tags
5. Return synthesized answer with tool traces

## Performance Tuning

### Token Optimization
- Max tokens for tool context: 3000 (tunable via `max_tokens_for_tool_context`)
- Tool call limit: 5 per query (tunable via `max_calls`)
- Timeout: 8000ms per tool call (tunable via `timeout_ms`)

### Caching
- Redis TTL: 3600s (1 hour, tunable)
- Packet key prefix: `gemma4:agent:function-caller` (customizable)
- Semantic tag indexing: Enabled (GIN indexes for fast lookup)

### Parallelization
- Enable: `parallel_calls: true` in config
- Supports up to 5 concurrent tool calls
- Reduces total latency significantly for independent queries

## Monitoring

### Check Active Packets

```bash
# List all function-caller packets in Redis
redis-cli KEYS "gemma4:agent:function-caller:*"

# Get packet details
redis-cli GET "gemma4:agent:function-caller:a1b2c3d4e5f6"

# Count total packets
redis-cli KEYS "gemma4:agent:function-caller:*" | wc -l
```

### Monitor Tool Calls

Enable debug logging in OpenCode config:
```json
{
  "function_calling": {
    "debug": true,
    "log_calls": true,
    "log_results": true
  }
}
```

## References

- **Semantic Extraction**: `SemanticExtractor` class in redis-semantic-packet-manager.ts
- **Tool Definitions**: TRACE MCP tool list at `http://127.0.0.1:8788/mcp`
- **Function-Calling Spec**: OpenAI compatible format via @ai-sdk/openai-compatible
- **MCP Tools**: See TRACE MCP documentation for complete tool list

---

**Last Updated**: May 29, 2026
**Status**: Production Ready
**Tested With**: Gemma4-TurboQuant, OpenCode 1.x, Redis 7.x
