# OpenCode Retrieval Atlas: rg + LangExtract Lane

This command defines the standard tool-first retrieval path for code-search questions.
It is used for prompts like "find where", "rg", "where is this symbol", or "show the implementation".
The lane turns a natural-language query into a compact, sourceRef-grounded packet before synthesis.

## Pipeline Overview
1. Query Ingestion (User -> Chat Endpoint):
The chat route receives a code-search intent and selects this lane.

2. Raw Search Stage (`rgSearch`):
The endpoint invokes `rgTool` to run ripgrep across the repository.
`rgTool` outputs:
- normalized match rows (path, line, text)
- sourceRefs used for citation
- compact `llm_output` text for downstream processing

3. Structure Extraction Stage (`langExtract`):
The endpoint passes `rgTool` output into `langExtractTool`.
`langExtractTool` extracts structured facts:
- files
- symbols
- APIs
- entities/keywords

4. Synthesis and Streaming Stage:
The chat endpoint combines user intent + rg matches + extracted structure.
The LLM response is streamed with strict sourceRef grounding.

5. Client Cache Stage (Cache Worker):
The final ACE packet (tool inputs + tool outputs + synthesis metadata) is posted to the browser worker.
The worker writes packet data to IndexedDB for deterministic reuse.

## Component Roles
| Component | Path | Responsibility | Input | Output |
| --- | --- | --- | --- | --- |
| rgTool | src/lib/server/ai/tools/rg-tool.ts | SourceRef-backed ripgrep wrapper | user query | matches + llm_output + sourceRefs |
| LangExtractTool | src/lib/server/ai/tools/langextract-tool.ts | Structured extraction from raw rg text | rg llm_output | entities/APIs/files/symbols JSON |
| Chat Endpoint | src/routes/api/chat/+server.ts | Orchestrates tools and streaming synthesis | user query + tool outputs | grounded stream response |
| Cache Worker | src/lib/workers/packet-cache.worker.ts | Persists full ACE packet client-side | packet payload | IndexedDB cache entry |

## Operational Rules
1. Tool-first mandatory:
If code-location intent is detected, run `rgSearch` before prose generation.

2. SourceRef grounding:
Answers must map claims to sourceRefs produced by tools.

3. Deterministic packet key:
Cache key should be derived from query hash + normalized tool inputs.

4. Prompt enforcement:
System prompt must expose and prioritize `rgSearch` and `langExtract`.

5. Graceful fallback:
If rg evidence is weak/noisy, report uncertainty and request broader search.

## Integration Notes
- Required packages (if missing): `ai`, `@ai-sdk/openai-compatible`, `zod`.
- Skills integration (optional): `npx skills add vercel/ai`.
- Keep this lane local-code first; external web retrieval is secondary.
