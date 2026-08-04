---
paths:
  - "**/*"
---

# Agent loop safety

## Incident (2026-08-04)

A Cline task in PLAN MODE tried `write_to_file`, was correctly rejected
("Tool 'write_to_file' is not available in PLAN MODE"), and then retried
the **identical rejected call 1,506 times in under 9 minutes** with no
adaptation. Root cause: the model's own reasoning stream leaked an
unclosed `<|think|>` tag into its response (the app's sanitizer stripped
`<thinking>`/`<|endthinking|>` but not `<|think|>` — fixed in
`sveltekit-frontend/src/lib/server/ollama.ts` `sanitizeModelOutput`),
corrupting its view of tool-call state so it never registered the
rejection and never asked to switch to ACT MODE.

## Rule 1 — check cache before triggering an agent/MCP tool call

Before invoking an agent loop or an MCP tool call that can be answered
from cache, check the packet cache first:

```
bifrost:packet:{packet_key}       — semantic/LLM result cache
bitfrost:retrieval:*              — retrieval result cache
```

Skip the tool/agent call entirely on a cache hit. This is a token-cost
gate, not a correctness gate — a cache miss always falls through to the
real call. See `.clinerules/10-backend-retrieval.md` for the full key
namespace and TTLs.

## Rule 2 — never retry an identically-rejected tool call

If a tool call is rejected (mode mismatch, permission denial, validation
error) and the error text is byte-identical to the previous rejection,
STOP. Do not retry the same call. Either:
- change the call (different tool, different args, different mode), or
- surface the blocker to the user and wait

A model that cannot tell "rejected once" from "rejected 1,000 times" has
lost track of its own conversation state — that is a signal to halt, not
to keep trying faster.

## Rule 3 — thinking/control tokens must never reach tool-call planning

Any text fed back into an agent's next planning step must be sanitized
of model-internal control tokens first (`<think>`, `<|think|>`,
`<thinking>`, `<|channel>`, `<|im_start|>`, etc. — see
`sanitizeModelOutput` in `sveltekit-frontend/src/lib/server/ollama.ts`
for the canonical strip list). An unsanitized leak is not cosmetic — it
can corrupt the model's own state tracking, as in the incident above.
