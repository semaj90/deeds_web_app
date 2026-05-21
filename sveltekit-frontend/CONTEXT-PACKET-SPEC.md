# Context Packet (OpenCode JSON Spec)

## Rule

Context must never be raw code dumps.

It must be:
- structured
- compressed
- traceable
- tool-aware

## Format

```json
{
  "goal": "Short paragraph describing objective",
  "context": {
    "query": "Original user query",
    "features": [
      {
        "path": "src/lib/server/gateway/flow-enforcer.ts",
        "labels": ["gateway", "state", "flow"],
        "summary": "Central flow enforcement logic"
      }
    ],
    "memory": [
      {
        "type": "recent",
        "value": "Previous related user action"
      }
    ]
  },
  "files": [
    {
      "path": "src/routes/api/chat/stream/+server.ts",
      "lines": "1-120",
      "change": "Add SSE streaming and TOON integration"
    }
  ],
  "constraints": [
    "Must use SvelteKit server routes",
    "Must use MCP POST JSON-RPC",
    "Must not call LLM outside Bifrost",
    "Must keep Redis writes under 10ms",
    "Must preserve prompt prefix stability"
  ],
  "mcp": {
    "tools_used": [
      "trace.kag_search",
      "engram.ace_packet_inject",
      "engram.chat_memory_store"
    ],
    "notes": "All tools must be invoked via POST /mcp"
  },
  "plan": [
    "Call trace.kag_search",
    "Build feature labels",
    "Build TOON packet",
    "Call Bifrost",
    "Stream via SSE",
    "Persist memory to Redis"
  ]
}
```

## TOON Variant (LLM Input Only)

```json
{
  "q": "user query",
  "f": [
    {
      "p": "file.ts",
      "l": ["label"],
      "s": "summary"
    }
  ],
  "m": ["recent memory"]
}
```

## Pipeline Mapping

trace -> features -> TOON -> Bifrost -> Gemma4

## Rules

- never pass full files to LLM
- always compress to TOON
- always include feature labels
- always include recent memory
- always route through Bifrost
