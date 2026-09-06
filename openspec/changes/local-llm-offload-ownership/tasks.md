# LOCAL-LLM-OFFLOAD-OWNERSHIP-01

Kept as its own small change per operator direction — not appended to the 5,990-line
`parent-atlas-retrieval-lineage-dag-convergence/tasks.md`. Unrelated to that ledger's Postgres/
Qdrant/Neo4j lineage work; no overlap, no shared state.

## 1. Caller census (done)

- [x] Grepped `sveltekit-frontend/scripts/{mcp,atlas,tests,validate}` for
  `gemma4-offload|gemma4_chat|gemma4_summarize|gemma4_classify|gemma4_health`. Found 3 files:
  the MCP script itself, `scripts/atlas/audit-engram-adapter-decision.mjs` (a boundary-audit
  regex checking *other* code doesn't call `gemma4_chat` directly — a check about the alias, not
  a caller of it; left as-is, still valid), `scripts/tests/audit-gemma4-boundary.mjs` (same
  pattern — a static direct-call detector, left as-is).
- [x] Grepped root `scripts/{atlas,mcp,tests,validate}` — only remaining hit after this session's
  edits is `scripts/atlas/build-mcp-tool-registry-index.mjs`'s own header comment (intentional,
  documents the filename/compat-alias relationship).
- [x] Checked `.claude/skills/{trace-mcp-tooling,metadata-context-analysis}/SKILL.md` and their
  `.opencode` mirrors: found already migrated by a concurrent session before this gate was
  registered (references `local-llm-offload` conceptually, `gemma4-offload.repo_report_answer` as
  a compatibility-labeled call, `Ornith 1.5` as current runtime). Not re-edited — verified correct
  as found.
- [x] Extended census to `sveltekit-frontend/src/` and `.mcp.json` (root + `mcp-server-mcp/`).
  `.mcp.json` files: zero hits. `src/`: 2 real hits, both fixed (see §8) —
  `src/lib/server/okf/mastra-workflows.okf.yaml` (`provider: gemma4-offload` on the
  `classify-error` tool definition) and `src/lib/server/ai/gemma4.ts` (`streamGemma4WithTools`
  hardcoded `const modelName = 'gemma4-offload'` and used it as the literal `model` field sent to
  llama-server via `bifrost(modelName)` — confirmed live against `:8090` that llama-server
  currently ignores an unrecognized `model` field and just serves whatever's loaded, so this was
  not causing a visible failure, but was silently wrong and would break under a stricter/multi-
  model proxy). Both files are currently unwired scaffolds (zero live callers of
  `mastra-okf-loader.ts` or `streamGemma4WithTools` found) — fixed for correctness anyway, not
  deleted, per this repo's "don't delete unwired scaffolds" convention.
- [x] Swept `docs/` for *executable* references (`mcporter call gemma4-offload...`, JSON-RPC
  `tools/call` payloads naming a `gemma4_*` tool) rather than every prose mention — 5 files hit,
  all generated report/data artifacts (`mcp-tool-registry-index.md`/`.json`,
  `model-inventory.json`, two `ignored-directory-audit*.json`), none hand-authored runbook steps a
  person would copy-paste. `mcp-tool-registry-index.md` already reflects this gate's own fix
  (correctly documents `gemma4_summarize` as the deprecated alias of canonical `repo_summarize`,
  from this session's live regeneration run in §5). No action needed — these regenerate from their
  producing scripts, which are already fixed.
- [ ] **Still open**: no exhaustive prose-level sweep of every `docs/` markdown file was done (only
  the executable-reference pattern above) — narrative docs that merely *mention* "gemma4-offload"
  by name were not touched, consistent with proposal.md's non-goal of not rewriting historical
  material. Non-`docs/`, non-`src/`, non-`scripts/` surfaces (e.g. any config outside the two
  `.mcp.json` files already checked) remain unswept. This is what still blocks Phase 4 (alias
  removal) with full confidence.

## 2. Canonical MCP tool surface (done, live-proven)

- [x] Added `repo_chat`, `repo_summarize`, `repo_classify`, `repo_llm_health` to
  `sveltekit-frontend/scripts/mcp/gemma4-offload-mcp.mjs`, each delegating to the exact same
  implementation function as its `gemma4_*` counterpart (`runChat`/`runSummarize`/`runClassify`/
  `runHealth`) — no behavior fork possible between alias and canonical name.
  `repo_report_answer` (also `runChat`) was already present from the concurrent session.
- [x] `SERVER_INFO.name` changed `gemma4-offload` -> `local-llm-offload`; version bumped
  `0.2.0` -> `0.3.0`. Log prefix updated to match.
- [x] Live JSON-RPC smoke (stdio, this session, `:8090` up with `ornith-1.5-9b` loaded):
  `initialize` -> `serverInfo.name: "local-llm-offload"`; `tools/list` -> 9 tools (5 canonical +
  4 deprecated); `tools/call repo_llm_health` -> real `LocalLlmOffloadReceiptV1` envelope,
  `loadedModel: "ornith-1.5-9b"`, `configuredModel: null` (no `LLAMA_PRIMARY_MODEL` set),
  `modelMatch: true`, `canonicalTools`/`deprecatedAliases` both populated correctly,
  `writesPerformed: false`. Fallback backend (`atomic-llama`, `:1337`) correctly reported down —
  not running on this host, expected.

## 3. Fail-closed model resolution (done, real bug fixed)

- [x] `discoverModel()` rewritten: `ids.length === 0` always throws (previously a bug — with
  `preferredModel` set and zero observed ids, the old code returned `preferredModel` anyway
  instead of throwing "no models observed"). `preferredModel` set + not in `ids` -> throws
  (unchanged, was already correct). `preferredModel` unset + `ids.length === 1` -> trust it
  (single observed model, not a guess). `preferredModel` unset + `ids.length > 1` -> throws
  (previously silently picked `ids[0]` — this was the exact anti-pattern the operator flagged).
- [x] `probeBackend()` now reports `configured_model`/`loaded_model`/`model_match` explicitly per
  backend, feeding the receipt's top-level `configuredModel`/`loadedModel`/`modelMatch`.

## 4. Validator gates G30/G31 (done, real bug fixed)

- [x] G30 (`full-system.mjs`): tool-count assertion raised `>=4` -> `>=9` (5 canonical + 4
  deprecated); comments updated to name `local-llm-offload` as canonical, `gemma4-offload` as the
  compatibility registration key. Live-run: **pass**, "9 tools registered".
- [x] G31: **found and fixed a real, pre-existing bug** — it parsed `body.turboquant` /
  `body.ollama` from the health-tool response, but the tool's actual JSON shape has never had
  those top-level fields (it returns `{ backends: [...] }`); this repo's chat/synthesis path also
  never routes through Ollama at all (Ollama is embeddings-only, and even that lane is mid-phase-
  out per root `CLAUDE.md`'s 2026-09-03 note) — so `ollama` was doubly wrong, both a shape
  mismatch and the wrong service name. G31 could therefore never truly pass, only warn (both
  parsed fields always `undefined` -> `liveCount === 0` -> forced `warn`). Rewritten to parse the
  real `backends[]` array and check `health === 'ok' && models === 'ok'` per entry, calling the
  canonical `repo_llm_health` tool name. Live-run: **pass**,
  `llama-primary=ok/ok atomic-llama=down(...)/error(...) loadedModel=ornith-1.5-9b modelMatch=true`.
- [x] Gate id/name labels updated: `mcp:gemma4-offload-handshake` -> `mcp:local-llm-offload-handshake`,
  `mcp:gemma4-offload-roundtrip` -> `mcp:local-llm-offload-roundtrip`. Both re-run individually via
  `node scripts/validate/full-system.mjs --gate=G30` / `--gate=G31` after the rename — both pass.

## 5. Direct :8090 summarizer for the build script (done, operator-requested mid-session)

- [x] `scripts/atlas/build-mcp-tool-registry-index.mjs`'s former MCP-spawned summarizer replaced
  with `summarizeWithLocalLlm()` —
  a direct `POST :8090/v1/chat/completions` call. Model still observed via `GET :8090/v1/models`
  (fails closed to `null` -> deterministic fallback summary on any ambiguity/error, never guesses).
  Unused `spawn` import and `GEMMA_MCP` path constant removed.
- [x] Live-run end-to-end: `node scripts/atlas/build-mcp-tool-registry-index.mjs` ->
  `docs/reports/mcp-tool-registry-index.json` regenerated with a real Ornith-generated
  `overall_summary` (not the deterministic fallback text), confirming the direct HTTP path works.

## 6. Config identity (partial — done where safe, not re-doing concurrent-session work)

- [x] `sveltekit-frontend/opencode.json`'s `gemma4-offload` MCP entry `description` field updated
  to state canonical identity, canonical tool names, and "resolve model live, don't hardcode".
  Registration key itself left unchanged (see proposal.md Non-Goals — renaming it now would
  require either a duplicate process registration or a synchronized breaking rename across every
  skill/config that still says `mcp__gemma4-offload__*`).
- [x] Verified (not re-edited) `.claude/skills/{trace-mcp-tooling,metadata-context-analysis}/SKILL.md`
  and `.opencode` mirrors were already updated by a concurrent session with correct
  `local-llm-offload`/`Ornith 1.5`/compatibility-alias language before this gate started.

## 7. Fixed live stale-model hardcoding found during extended census (done)

- [x] `src/lib/server/ai/gemma4.ts`: `streamGemma4WithTools` now resolves the actual loaded model
  instead of the hardcoded literal. First pass called the low-level
  `resolveLoadedLlamaModel()` (`llama-server-model-resolver.ts`) directly; **revised** after
  spotting that a concurrent session's edits to `summarizer.ts`/`analyzer.ts`/
  `langextractBatch.ts` (see §8) all consistently use a higher-level wrapper,
  `resolveLlamaInferenceTarget()` (`src/lib/server/llm/runtime-contract.ts`) — which itself calls
  `resolveLoadedLlamaModel()` but additionally enforces an allowed-model-family policy
  (`allowedModelFamilies: ['ornith-1.5']`) and a `CONFIGURED_VERIFY`/`LOADED_ACTIVE` selection-mode
  contract with a checksummed receipt. Switched `gemma4.ts` to the same wrapper for consistency
  with the now-established repo-wide convention (confirmed live: `ROTORQUANT_MODEL_PATH`/
  `TURBO_MODEL_PATH` are both set in `.env`, which `runtime-contract.ts` requires at import time).
  `checkSemanticCache`/`saveToSemanticCache` now key on the real resolved model id, not a fake
  name. Verified: `tsgo --noEmit` repo-wide error count unchanged at 73, zero new errors, zero
  errors in this file. Not exercised end-to-end at runtime (the function has zero live callers —
  same unwired-scaffold status as before; full SvelteKit `$lib` alias resolution needed to actually
  invoke it isn't available outside the dev server) — confidence instead comes from: (a) type
  correctness, (b) the same underlying `resolveLoadedLlamaModel()` primitive already live-verified
  in this session's `gemma4-offload-mcp.mjs` smoke test against real `:8090`.
- [x] `src/lib/server/okf/mastra-workflows.okf.yaml`: `classify-error` tool's `provider` field
  `gemma4-offload` -> `local-llm-offload` with an explanatory comment; description no longer names
  Gemma4 specifically. `llm_completion` step type's description `"Call LLM (Gemma4 or Ollama)"`
  corrected — Ollama is never a chat/generation backend in this repo (embeddings-only), so listing
  it as an LLM-call alternative was actively wrong, not just stale naming. YAML re-parsed
  successfully after edit (`js-yaml` load, all top-level keys intact).
- [x] `stepTypes.llm_completion`'s two active workflow model literals were updated to the observed
  `ornith-1.5-9b` runtime; the MCP registration key and historical comments remain compatibility
  metadata, not model selection.

## 8. Active summarizer/NLP endpoint alignment

- [x] `analysis/summarizer.ts`, `nlp/analyzer.ts`, and `tools/handlers/langextractBatch.ts` use
  the canonical llama-server `/v1` boundary for generation/extraction. Ollama remains reserved
  for the EmbeddingGemma embedding lane.
- [x] Bounded fallback behavior remains deterministic when llama-server is unavailable; no
  alternate Ollama generation path was introduced.
- [x] `atlas/context-chunk-synthesizer.ts` and corrective query reformulation in
  `retrieval/orchestrator.ts` now use the resolved llama-server `/v1` target. The only remaining
  Ollama call in `retrieval/orchestrator.ts` is the explicit EmbeddingGemma `/api/embeddings` lane.
- [x] `streaming/chunked-response.ts` now streams from llama-server `/v1`; its retained Ollama
  call is limited to the explicit EmbeddingGemma `/api/embeddings` request. `tools/handlers/clusterTag.ts`
  now generates cluster summaries through the resolved llama-server model.
- [x] `services/knowledge-search/KnowledgeIndexer.ts` now defaults summary generation to the
  observed `ornith-1.5-9b` model; its existing `bifrostChat` path remains the llama-server-backed
  synthesis adapter while its embedding configuration remains separate.

## 10. Real bug found via live smoke, not just naming: two system-role messages broke Ornith's chat template

While live-verifying that `next_steps/active/2026-05-09_gemma4-mcp-synthesis-loop.md`'s
`mcporter call gemma4-offload.gemma4_summarize` runbook example still works, `repo_summarize`
(and, by the same code path, `gemma4_summarize`, `repo_classify`, `gemma4_classify`, and any
`repo_chat`/`gemma4_chat` call that passes an explicit `system` argument) **failed outright**
against the live `:8090` backend:

```
Jinja Exception: System message must be at the beginning.
```

Root cause: `buildRepoAuditMessages()` sent two separate `{role: 'system', ...}` entries
(`REPO_AUDIT_GUARDRAIL` first, then the caller's optional `system` string second) followed by the
user message. Ornith 1.5's chat template rejects a second system-role message even when it still
precedes the user turn — it expects exactly one leading system entry, not one-per-instruction.
This was a real, live-breaking bug independent of the naming migration; it would have broken these
tools under the old `gemma4_*`-only names too, since the message-construction code was never
tool-name-dependent.

- [x] `buildRepoAuditMessages()` rewritten to merge the guardrail and the optional caller `system`
  string into a single system-role message, then the user message — two messages total, matching
  what the template requires.
- [x] Live-reverified after the fix against real `:8090`/`ornith-1.5-9b`:
  `repo_summarize` on a synthetic repo-evidence string -> real generated summary (not an error, not
  the drift fallback). `repo_classify` on a synthetic mismatch scenario -> correctly classified
  `"mismatch"` from a 2-label set.
  `node scripts/validate/full-system.mjs --gate=G30` and `--gate=G31` both re-run after this
  fix — both still pass.
- [x] `next_steps/active/2026-05-09_gemma4-mcp-synthesis-loop.md`'s runbook example updated to call
  `repo_summarize` (canonical) with a note that `gemma4-offload` is the registration-key alias, not
  the tool name — this is an active (not archived) planning doc with a copy-pasteable command, so
  it was in scope unlike the `docs/reports/*` generated artifacts in item 1.

## 9. Open items (not done this session)

- [x] Extended caller census (this pass): `.vscode/`, `.codex/`, `.cline/`, root `package.json` +
  `sveltekit-frontend/package.json`, `memory/` (executable-reference pattern) — all clean, zero
  hits. `next_steps/` (executable-reference pattern) — 1 hit, fixed (see §10).
- [x] Further extended (bounded per-directory greps, one directory at a time to stay under
  ripgrep's 20s timeout): `services/`, `python/`, `config/`, `configs/`, `tools/`, `specs/`,
  `openspec-changes/`, `vscode-extension/`, `workers/` — all clean. `graphify/` — 1 hit, in
  `frozen-graph-snapshot-v2.json`; **deliberately not touched**, it's a frozen reference oracle
  (the NetworkX/cuGraph PageRank parity snapshot documented in root `CLAUDE.md`) — mutating frozen
  fixture data to satisfy a naming preference would break reproducibility guarantees for unrelated
  work and is explicitly the kind of historical artifact this gate's proposal.md excludes.
- [ ] Full repo-wide caller census beyond everything checked across items 1, 9, and 10 above (still
  not exhaustive — narrative-only mentions in `docs/`/`memory`/elsewhere were deliberately not
  swept, per proposal.md's non-goal). Required before Phase 4 alias removal. **Attempted and
  abandoned this session**: a repo-root grep for the executable-reference pattern (same one used
  successfully for `docs/`, `memory/`, `next_steps/`) timed out at 20s even scoped to that narrow
  pattern — this repo has ~90 top-level directories, most of them non-source data
  (`models/`, `minio-data/`, `qdrant/`, `neo4j/`, `redis/`, `backups/`, `storage/`,
  `training-datasets/`, `triton-model-repository/`, etc.), and the environment was under heavy
  concurrent I/O load from other active sessions/agents at the time. Every census pass actually
  completed in this gate found at most 1-2 real hits per sweep, everything else already-fixed or
  historical — treating the live-code/config/active-runbook surface as reasonably covered and
  leaving the remaining exhaustive prose sweep as a deliberately deferred, separate task rather
  than forcing an expensive full-repo scan under current load.
- [ ] **Generation-boundary follow-up:** the verified active summarizer, NLP analyzer, LangExtract
  fallback, context-chunk synthesizer, corrective-query, generic service-adapter, tiered cold-cache,
  unified research self-prompt, queue synthesis, cluster-summary, and inference-router fallback
  paths now use the resolved llama-server `/v1` model. Remaining `/api/chat`/`/api/generate` hits
  are compatibility wrappers, VLM/lifecycle candidates, tests/docs, or must be separately
  attributed before removal. Do not claim a repository-wide Ollama removal until each is proven
  live or classified as embedding-only, compatibility, historical, or dead code.
- [x] The auxiliary generation pass in `adapters/service-integrations.ts`, tiered L3 cold inference,
  unified-research self-prompting, RabbitMQ synthesis worker, cluster-summary synthesis, and the
  inference-router text fallback now call llama-server `/v1/chat/completions` and resolve the
  observed model from `/v1/models`. Their Ollama-shaped names/configuration remain compatibility
  surface only; no embedding calls were changed.
- [x] `ai/ollama-client.ts::generateCompletion` now uses the same resolved llama-server
  `/v1/chat/completions` boundary and adapts the OpenAI response to its legacy return shape;
  its embedding and model-list helpers remain Ollama-specific by design.
- [x] `inference/vlm-lifecycle.ts` no longer sends an Ollama `keep_alive=0` request while
  switching llama-server modes; llama-server process/launcher lifecycle owns release, and the
  unsupported release request now fails visibly. Embedding model release in `gpu-arbiter.ts`
  remains an allowed Ollama embedding-lane operation.
- [x] Cross-encoder scoring no longer falls back to Ollama generation; unavailable governed
  inference returns the existing neutral score. ACE error-KAG generation now uses resolved
  llama-server `/v1`; its Ollama use remains embedding-only. Contextual-tool detection remains
  open for caller attribution. Its live route now always resolves llama-server `/v1`; embedding
  calls such as `/api/embed` and `/api/embeddings` remain explicitly out of scope.
- [x] The live simulation strategy synthesis path now resolves the active llama-server model and
  uses OpenAI-compatible `/v1/chat/completions`; stale Gemma4/Ollama descriptions were removed
  from the contextual tool definitions.
- [x] The FF1 repair planner now resolves the active llama-server model for repair-plan generation;
  its Ollama call remains limited to EmbeddingGemma retrieval context.
- [x] `audit/gemma-tool-router.ts` now uses llama-server `/v1` for audit planning and final
  synthesis. Its remaining Ollama call is the explicit query embedding request only.
- [ ] `docs/reports/mcp-tool-registry-index.md`/`.json` regeneration should be re-run and reviewed
  as part of any later MCP manifest rebuild pass this gate's proposal.md mentions but does not
  itself perform beyond the one live confirmation run above.
- [ ] No attempt made to rename the MCP process registration key or the script filename
  (`gemma4-offload-mcp.mjs`) — deliberately deferred to Phase 4, per proposal.md.
- [ ] Old-alias vs canonical-name **output** parity is guaranteed by shared implementation
  (`gemma4_chat` and `repo_chat` literally call the same `runChat` function) rather than by a
  separate A/B live-call proof — considered sufficient given the code-level guarantee, but flagged
  here in case a future reviewer wants an explicit two-call diff receipt.

## Validation record

- `node --check scripts/mcp/gemma4-offload-mcp.mjs` — syntax OK.
- `node --check scripts/atlas/build-mcp-tool-registry-index.mjs` — syntax OK.
- Live stdio smoke of the MCP (`initialize` + `tools/list` + `tools/call repo_llm_health`) — see
  §2 above.
- `node scripts/validate/full-system.mjs --gate=G30` — pass.
- `node scripts/validate/full-system.mjs --gate=G31` — pass.
- `node scripts/atlas/build-mcp-tool-registry-index.mjs` — full run, real Ornith-generated summary
  confirmed in output.
- `POST :8090/v1/chat/completions` with `model: "gemma4-offload"` (the pre-fix literal) — confirmed
  live that llama-server ignores the unrecognized id and serves the loaded model anyway (echoes
  back `"model":"ornith-1.5-9b"`), establishing this was silently wrong rather than failing loudly.
- `sveltekit-frontend/src/lib/server/ai/gemma4.ts` — `tsgo --noEmit` repo-wide: 73 errors, same as
  the pre-existing baseline, 0 in this file, 0 new anywhere.
- `js-yaml` parse of `mastra-workflows.okf.yaml` after edit — succeeds, structure intact.
- Live `tools/call repo_summarize` and `tools/call repo_classify` against real `:8090`/
  `ornith-1.5-9b` after the §10 message-construction fix — both return real generated content, not
  errors. `node scripts/validate/full-system.mjs --gate=G30`/`--gate=G31` re-run clean after the fix.
- No database, Qdrant, Neo4j, or Redis writes performed by any change in this gate.
