# Phase 10B MCP Inspection

Use this command for Phase 10B port/model/config inspection.

## Rules

- Do not use `read` first.
- Do not read guessed paths.
- Do not ask the user which file to read.
- Use MCP/search first.
- Only read confirmed sourceRefs or small line windows.

## Required Tool Order

1. `trace.kag_search`
2. `context.build_kv_packet`
3. `graph.expand_neighborhood`
4. `turbovec.rank_chunks` only if candidate set is large
5. `engram.chat_memory_recent` only if conversational memory is needed
6. `rg` inside confirmed paths
7. 40–80 line read window only

## Searches to Run

Search for:

```txt
ensure-llama-server GEMMA4_BASE_URL LLAMA_SERVER_PATH ROTORQUANT_MODEL_PATH TURBO_MODEL_PATH 8090

Then search for:

8791 8792 8793 mcp turbovec engram langextract opencode

Then use:

rg -n "GEMMA4_BASE_URL|LLAMA_SERVER_PATH|ROTORQUANT_MODEL_PATH|TURBO_MODEL_PATH|8090|8791|8792|8793" .
Output

Return only:

confirmed paths
sourceRefs
commands to run
port/model mapping
proposed fixes

Do not read whole files.


Then in OpenCode, run:

```txt
/phase10b-mcp

Or:

@atlas-context /phase10b-mcp

Why this works: your uploaded trace shows the agent keeps saying it understands MCP-first, then still calls Read src\lib\server\ai\openai-facade.ts. A command file gives OpenCode a concrete repeatable workflow instead of relying on conversational instruction.

Also add this to atlas-context.md:

## OpenCode Tool Enforcement

When the user says "use MCP tools" or runs `/phase10b-mcp`, direct `read` is forbidden until a sourceRef/path is confirmed by MCP search or `rg`.

If a path is guessed, do not read it.

If you cannot call MCP, say:
MCP_TOOL_NOT_AVAILABLE

Then provide the exact `rg` command fallback.

Test prompt:

/phase10b-mcp inspect Phase 10B ports and model resolution

Expected behavior:

MCP/search first → confirmed paths → small line window

Bad behavior:

Read src/lib/server/env.server.ts
Read openai-facade.ts
