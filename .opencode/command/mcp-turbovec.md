# mcp-turbovec

Use TurboVec MCP tools to rerank candidate chunks.

## Steps
1. Accept candidate refs from TRACE or prior retrieval.
2. Rerank with TurboVec.
3. Emit top candidates with scores and source refs.
