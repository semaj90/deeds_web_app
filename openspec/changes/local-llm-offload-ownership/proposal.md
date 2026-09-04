# local-llm-offload-ownership

## Why

The local repo-audit MCP (`sveltekit-frontend/scripts/mcp/gemma4-offload-mcp.mjs`) is already
model-neutral in implementation — it calls the OpenAI-compatible `/v1/models` and
`/v1/chat/completions` endpoints on llama-server `:8090`, so it already works with whatever model
the launcher/runtime loads (currently Ornith 1.5 9B; was Gemma4 historically). But its *identity*
was stale: server name `gemma4-offload`, tool names `gemma4_chat`/`gemma4_summarize`/
`gemma4_classify`/`gemma4_health`, and skill docs (`.claude/skills/trace-mcp-tooling/SKILL.md`,
`.opencode/skills/trace-mcp-tooling/SKILL.md`, `.claude/skills/metadata-context-analysis/SKILL.md`,
`.opencode/skills/metadata-context-analysis/SKILL.md`) told agents to "use Gemma4" by name.

Renaming everything to `ornith-offload` would just repeat the same failure the next time the
runtime model changes. This gate separates **capability identity** (stable:
`local-llm-offload`) from **model identity** (volatile: whatever `GET :8090/v1/models` reports),
and migrates callers compatibility-preservingly rather than as a breaking mass rename.

## What Changes

- Canonical MCP capability name: `local-llm-offload` (internal `serverInfo.name`, doc language).
  The MCP process registration key stays `gemma4-offload` for now (compatibility alias — a second
  registration under a new key would spawn a duplicate stdio process against the same backend,
  which is worse than a documented alias).
- Canonical tool names added, each a straight rename target of an existing tool:
  `repo_report_answer` (pre-existing), `repo_chat` (renames `gemma4_chat`), `repo_summarize`
  (renames `gemma4_summarize`), `repo_classify` (renames `gemma4_classify`), `repo_llm_health`
  (renames `gemma4_health`). The four `gemma4_*` names remain as deprecated aliases delegating to
  the exact same implementation functions — zero behavior fork.
- Model resolution policy fixed to fail closed: `GET /v1/models` is verification only, never
  selection. If `LLAMA_PRIMARY_MODEL` is set, it must appear in the observed list or the call
  throws. If unset, a single observed model is trusted (that's "observe the one running model",
  not "guess"); multiple observed models with none configured now throws instead of silently
  picking `data[0]`.
- `repo_llm_health` (and its `gemma4_health` alias) now returns a `LocalLlmOffloadReceiptV1`
  envelope with explicit `configuredModel`/`loadedModel`/`modelMatch`/`canonicalService`/
  `canonicalTools`/`deprecatedAliases`/`writesPerformed` fields.
- Fixed a real bug in `scripts/validate/full-system.mjs` gate G31: it parsed `body.turboquant` /
  `body.ollama` from the health tool's JSON response, but those fields never existed in the actual
  output shape (`{ backends: [...] }`) — this repo never routes chat/synthesis through Ollama at
  all (Ollama is embeddings-only, and even that is mid-phase-out per root `CLAUDE.md`). G31 could
  therefore only ever warn, never truly pass. Now parses the real `backends[]` array and reports
  `loadedModel`/`modelMatch`.
- `scripts/atlas/build-mcp-tool-registry-index.mjs`'s optional summarization step no longer spawns
  the whole MCP stdio process for one summarization call — it calls `POST :8090/v1/chat/completions`
  directly (still model-observed via `/v1/models`, still fails closed to the deterministic fallback
  on any ambiguity). Simpler and faster for a one-shot build script; the MCP process is still the
  right boundary for actual agent tool-calling.
- Skill docs (`.claude`/`.opencode` `trace-mcp-tooling` and `metadata-context-analysis`) and
  `sveltekit-frontend/opencode.json`'s `gemma4-offload` entry were already partially migrated by a
  concurrent session before this gate was registered — verified live, not re-done, and left as-is
  where already correct (see tasks.md for what was found already-done vs completed by this gate).

## Non-Goals (this pass)

- Not renaming the MCP process registration key (`gemma4-offload` in `opencode.json` / `.mcp.json`
  configs) — that's a Phase 4 action gated on caller census = 0, per the compatibility-preserving
  migration plan below.
- Not touching `EmbeddingGemma` / the embeddings lane at all — this gate is chat/synthesis-offload
  only.
- Not rewriting historical reports, session logs, or `memory/*.md` that use "gemma4-offload" as
  period-accurate terminology.
- No Postgres/Qdrant/Neo4j/Valkey writes; no model download or llama-server restart.

## Migration Phases

1. **Add canonical, keep aliases deprecated** — done this session (code).
2. **Migrate skills/configs to reference canonical names** — found already done by a concurrent
   session for the two skill pairs; `opencode.json` description updated this session.
3. **Prove alias parity + configured/loaded model match** — done this session (live smoke, see
   tasks.md).
4. **Remove `gemma4_*` aliases once caller census = 0** — not started; requires a broader
   repo-wide census beyond this session's scope (see tasks.md Open Items).
