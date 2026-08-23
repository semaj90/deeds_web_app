# Ornith 9B tournament validation — 2026-08-22

Status: `WIRED / PARTIAL_PROVEN`

## Scope

This tranche adds an opt-in Ornith 9B challenger agent to the existing local
OpenAI-compatible :8090 lane. It does not replace Gemma4, change the default
model, or claim a live model-quality result.

Gemma4 Jinja templates remain Gemma-native. Ornith uses the GGUF/server
embedded `tokenizer.chat_template`; the launcher already prevents the Gemma4
override from being applied to `hforf.gguf`.

## Evidence

- `sveltekit-frontend/opencode.json` contains `ornith-9b` and the opt-in
  `ornith-tournament` agent.
- `scripts/launch-turboquant.ps1` keeps Ornith on its embedded template path.
- Gemma4 templates explicitly share the bounded policy: at most three supplied
  tools and at most one tool call per assistant turn.
- The TRACE MCP audit completed with 119 registered tools partitioned into 40
  sets of no more than three tools.
- GAN integration tests: `8/8 passed`.
- GAN deep-audit tests: `22/26 passed`; four failures remain in legacy
  hardening fixtures and are not promoted to model evidence.
- `opencode.json` parses successfully.
- SvelteKit tool parser/bridge/selection/profile tests: `14/14 passed`.
- Trace MCP AST parity: `119/119` unique registered handlers, with no
  duplicate names or unresolved handler registrations.
- Legacy `sveltekit-frontend/src/mcp/server.ts` parity remains blocked by 22
  handler/list mismatches; this is a separate legacy server surface.
- Removed the exposed `phase18_reranker` listing because its implementation
  still returns randomized placeholder scores. The source file is retained as
  a quarantined challenger until a real XGBoost model is loaded and attested.

## Promotion gates

| Gate | State |
|---|---|
| Config/model alias wired | `WIRED` |
| Gemma/Ornith template boundary | `WIRED` |
| Three-tool bounded audit | `PROVEN_FIXTURE` |
| GAN integration | `PROVEN_FIXTURE` |
| GAN deep audit | `PARTIAL_PROVEN` |
| SvelteKit tool contract tests | `PROVEN_FIXTURE` |
| Trace MCP handler parity | `PROVEN_STATIC` |
| Legacy MCP handler/list parity | `BLOCKED` |
| Placeholder reranker exposed | `REJECTED / QUARANTINED` |
| Ornith live `/props` capability receipt | `NOT_RUN` |
| Ornith multi-turn tool-call replay | `NOT_RUN` |
| τ-bench-style task score | `NOT_RUN` |
| durable receipt/reuse proof | `NOT_RUN` |
| production promotion | `BLOCKED` |

## Remaining work

1. Repair the four deep-audit fixture call-order/shape failures.
2. Start the intended Ornith 9B artifact on :8090 using its embedded template.
3. Run the bounded OpenAI-compatible props, system, streaming, and one-tool
   replay checks.
4. Run a fixed tournament corpus with tool-call validity, duplicate-call
   rate, argument-schema validity, recovery-after-tool-error, and durable
   receipt assertions.
5. Compare against the Gemma4 baseline using the same tool set and seed.

No Postgres, Qdrant, Neo4j, Valkey, or model-index writes were performed by
this tranche.
