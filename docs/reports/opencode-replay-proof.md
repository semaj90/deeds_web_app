# OpenCode replay proof — 2026-08-13

Status: partial proof

What was verified:

- `opencode --version` returns `1.18.18`.
- Direct llama-server smoke through the capture proxy passed after the injector fix.
- OpenCode session replay preserved native `tool_calls[]` and the matching `tool_call_id`.
- No raw `<tool_call>` XML leakage was observed in the captured replay history.

What failed:

- A replay continuation that read `sveltekit-frontend/src/lib/server/services/knowledge-search/ACPToolRegistry.ts` blew the OpenCode context budget.
- The failure was a context-size failure, not a serialization failure:
  - `AI_APICallError: request (503389 tokens) exceeds the available context size (65536 tokens)`
  - same shape repeated on later retries

Relevant capture files:

- `.tmp/opencode-capture/2026-08-13T18-23-46-891Z-request.jsonl`
- `.tmp/opencode-capture/2026-08-13T18-24-11-861Z-request.jsonl`
- `.tmp/opencode-capture/2026-08-13T18-24-40-959Z-request.jsonl`

Key note:

- The replay history itself is intact in the captured request bodies.
- The blocker now is the size of the tool result / follow-on context, not raw XML tool-call corruption.

Next run recommendation:

- Re-run the replay proof with a small file and a bounded tool result.
- Keep `parallel_tool_calls=false`.
- Keep the proxy capture enabled.

