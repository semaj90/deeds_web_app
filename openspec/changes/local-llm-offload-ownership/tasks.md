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

## 11. Ollama embeddings-only + Gemma4 swap-out + archive alignment (2026-09-19)

**Done (code edits, no service or datastore writes).**
- App source moved to `SERVER_CHAT_MODEL` (`ornith-1.5-9b`): 6 files round 1, 8 files round 2 (server defaults), 12 Svelte
  components + `utils/ollama.ts`, 3 test routes. 22 pipeline scripts and 8 test scripts now default to
  `process.env.LLAMA_SERVER_MODEL || 'ornith-1.5-9b'`. Verified: 42 test files / 152 tests pass in touched dirs; edited
  Svelte files compile; edited JS/Python/TS parse.
- `ollamaFetch()` already blocks Ollama chat: `/api/chat` and `/api/generate` that llama-server cannot serve return 503
  `LLAMA_SERVER_CHAT_UNAVAILABLE` (no fallback). Raw-`fetch` bypasses fixed: `YoRHaAIChat.svelte` (now fails closed),
  `docker/image-synthesis/app.py`, `docker/clickhouse-mirror/clickhouse-mirror.py` (now llama-server `/v1/chat/completions`).
- Because llama-server ignores unrecognized model ids (see Validation record), literal swaps change labels and ACE
  cache-key identity, not routing. `modelQuant: 'iq4_xs'` in `autonomous-agent.ts` cache keys is still stale (Ornith quant unconfirmed).

**Open, not done.**
- [ ] `EnhancedLegalAIChatWithSynthesis.svelte`: 3 browser calls direct to Ollama `/api/generate` (`stream:true`, expects
      `{response}` NDJSON). Needs a same-origin streaming route or adapter; operator to choose.
- [ ] `docker/image-synthesis` and `docker/clickhouse-mirror` edited in source only; image-synthesis container still runs
      old code. Rebuild deferred (Docker instability, see ops notes).
- [ ] `LLMSelector.svelte` entry is `id: 'ornith-1.5'` but still `provider: 'ollama'` with the Ollama endpoint.
- [ ] `semantic-health/+server.ts` checks the chat model against Ollama `/api/tags` (cannot be true now).
- [ ] Pre-existing, unrelated: `scripts/agent/agent-scheduler-orchestrator.mjs:312` syntax error (`updateEngram HotnessMetrics`);
      present in the committed version.

**Archive alignment phases (audit BEFORE any archive; nothing has been moved).**
Candidates: `docker/clickhouse-mirror/` (no compose service, no container, no app caller; only ClickHouse in the stack is
Langfuse's), `scripts/tests/test-ollama-cached-gemma4.mjs` + `test-ollama-direct.mjs` (exercise disabled Ollama chat),
`scripts/unify-models.mjs` (replaces a string with itself), `docker/image-synthesis/` (RUNNING, healthy on :8092, no
caller found; decision required, not a default archive). 384-lane writers are tracked in
`parent-atlas-semantic-768-canonical-contract` (not duplicated here).
- [ ] **A0 Audit** per candidate: callers (`rg` over `src/`, `scripts/`, `package.json` scripts, compose, docs, OpenSpec),
      last commit date, runtime state (container/port), and gitignored-only references.
- [ ] **A1 Classify** each as LIVE_OWNER / COMPATIBILITY / FIXTURE / DOCUMENTATION / ARCHIVED / STALE with the evidence attached.
- [ ] **A2 Operator decision** recorded per candidate (archive / keep / rebuild). `image-synthesis` needs VRAM measurement first.
- [ ] **A3 Archive mechanics** (only after A2): copy to `deeds_labs/archive/<date>/`, compute SHA-256, add
      `docs/archive-manifest.json` entry (path, sha256, date, reason, recovery command); remove dangling npm-script/compose refs.
- [ ] **A4 Verify**: no dangling imports/refs, touched tests still pass, restore proof (copy back, SHA matches).
- [ ] **A5 Remove from active tree** last. No deletion; recovery path documented.

**Remaining scripts pass (2026-09-19).** Model literals swapped to `process.env.LLAMA_SERVER_MODEL || 'ornith-1.5-9b'` in
22 root scripts, 8 `scripts/tests/*`, and 47 `sveltekit-frontend/scripts/*` (46 parse clean; `graphify-svg-architecture.mjs`
has a syntax error at line 150 that also exists in the committed version). Shared helper
`scripts/atlas/lib/llama-inference.mjs` (`llamaChat`) header/default updated to Ornith. Exempt on purpose: identity-sensitive
launchers/health gates/benchmarks (19 files: `ensure-llama-server`, `turboquant/*`, `smoke-draft-model-policy`,
`run-service-health-check`, `preflight.ts`, semantic-cache smokes, `scripts/tests/*` under frontend, etc.),
`scripts/vlm-server/app.py`, `gemma4-tool-call-sanitizer.mjs`, `scripts/test/evaluation/*`.
- [x] Ollama chat converted/removed: `atlas/batch-summarize-clusters.mjs` (now `llamaChat`), `graph/synthesize-next-actions.mjs`
      (Ollama tier removed), `synth/run-loop.mjs` (Ollama fallback removed; its preflight still counts Ollama as a reachable
      backend, minor mismatch).
- [ ] 16 scripts still POST to Ollama `/api/chat|generate` with a swapped model name (so they cannot work): sole-path
      (convert to `llamaChat`): `atlas/export-packets-for-colab.mts` (Python string), `atlas/gemma4-batch-summaries.mjs`,
      `atlas/langgraph-gemma4-synthesis.mjs`, `atlas/packet-rpc-4d-manifold.mjs`, `codebase-semantic-indexer.ts`,
      `generate-timeline-synthesis.mjs` (streaming), `graphify-svg-architecture.mjs` (also syntax error), `karpathy-tag-parallel.mjs`,
      `llms/som-cluster-cards.mjs`, `mcp/agent-orchestrator.mjs`, `run-hypergraph.ts`;
      fallback-tier (remove Ollama tier): `enrich-evidence-image-tags.mjs`, `karpathy-tag.mjs`, `skills/codebase-todo-aggregator.mjs`,
      `summarize-clusters-pg.ts`; images (needs mmproj-capable request shape): `screenshots/caption-screenshots-gemma4.mjs`.
- [x] Batch 1 converted to `llamaChat` (parse-checked, not executed): `atlas/gemma4-batch-summaries.mjs`, `atlas/langgraph-gemma4-synthesis.mjs`,
      `atlas/packet-rpc-4d-manifold.mjs`. **13 of the 16 remain** (the list above minus these 3). `langgraph-gemma4-synthesis.mjs` still
      declares an unused `OLLAMA_URL`/`GEMMA4_MODEL`.
- [x] Batch 2 (Ollama fallback tier removed, parse-checked, not executed): `enrich-evidence-image-tags.mjs`, `karpathy-tag.mjs`,
      `skills/codebase-todo-aggregator.mjs`, `summarize-clusters-pg.ts`. **9 of the original 16 remain**: `codebase-semantic-indexer.ts`,
      `generate-timeline-synthesis.mjs` (streaming), `graphify-svg-architecture.mjs` (pre-existing syntax error), `karpathy-tag-parallel.mjs`,
      `llms/som-cluster-cards.mjs`, `mcp/agent-orchestrator.mjs`, `run-hypergraph.ts`, `atlas/export-packets-for-colab.mts`,
      `screenshots/caption-screenshots-gemma4.mjs` (images). Possible now-unused vars (`OLLAMA_MODEL`, `USE_TURBO`) left in batch 2 files.
- [x] **Correction + guard (2026-09-19):** the earlier "9 remain" undercounted. A repo-wide guard test,
      `sveltekit-frontend/src/lib/server/ai/ollama-chat-callers.guard.spec.ts` (1/1 passing), finds **31 files** that raw-fetch Ollama
      `/api/chat|generate`, including root scripts whose model name was swapped without converting the endpoint
      (`build-documents-atlas`, `consolidate-gemma4`, `couchdb-turbovec-ingest`, `multi-pass-enrichment`) plus `constitution-pipeline`,
      `gemma3-legal-agent`, `phase76-*`, `batch_repair_chat.py`, several `mcp/*` scripts, and the browser component.
      `gpu-arbiter.ts` is a false positive (unloads the embedding model). Convert or archive each, then delete it from the guard list;
      the test fails if a NEW raw caller appears. Batches 1-2 converted 7 scripts that are no longer on the list.
- [x] Batch 3 (2026-09-19, parse-checked, not executed): converted `build-documents-atlas.mjs`, `docs-atlas/couchdb-turbovec-ingest.mjs`,
      `consolidate/consolidate-gemma4.mjs` to `llamaChat`. `phase-b/multi-pass-enrichment.mjs` also converted (2 call sites) after repeated Windows file-lock retries (`UNKNOWN -4094`).
      Guard list is now **27** files. Root cause of the earlier lock errors: background `git.exe` processes on this large repo.
- [x] Batch 4 (2026-09-19, parse-checked, not executed): converted `phase76-ace-prompt-engineer.mjs`, `phase76-knowledge-builder.mjs`,
      `constitution-pipeline.mjs` (vision: sends `images` as OpenAI `image_url` parts to llama-server + mmproj; **untested against the live vision server**).
      Guard list is now **24** files. Skipped on purpose: `gemma3-legal-agent.mjs` (long multi-part prompt; legacy Gemma3 agent, archive candidate) and
      `batch_repair_chat.py` (is actually JavaScript in a `.py` file, streams; likely dead, archive candidate). Remaining guard list also
      includes `hyperrag-expand`, `cluster-summarize.ts`, the `mcp/*` scripts, `test-ollama-*` tests, `run-service-health-check.mjs`, and the browser component.
- [ ] Archive candidates still unmoved (see A0-A5 above); `unify-models.mjs` is a no-op mass replacer.

### 11.H Handoff (2026-09-19) - resume here

**Verify first (all read-only).** Guard test: `cd sveltekit-frontend && npx vitest run src/lib/server/ai/ollama-chat-callers.guard.spec.ts`
(green = 13 known raw Ollama chat callers after batch 5, 2026-09-19; run with `--testTimeout=180000`, the default 30 s can expire on a loaded box; it FAILS if a new one appears or a listed one is fixed but not removed from the list).
The 384-writer guard: `.../src/lib/server/atlas/embedding-384-writers.guard.spec.ts` (5 known writers, green). A vitest run of the guard takes
~15-40 s; run it in the background (a 100 s wrapper timeout produced a false "fail" once).

**Conversion recipe (what worked).** Script-side helper: `scripts/atlas/lib/llama-inference.mjs` -> `llamaChat(promptOrMessages, {maxTokens, temperature, timeoutMs})`
(llama-server :8090 `/chat/completions`, non-streaming, strips Gemma4 channel markers only). Convert the fetch block in place, keep the prompt and the
code that consumes the answer (`const x = { response: await llamaChat(...) }` preserves downstream `.response`). Images: pass
`[{role:'user',content:[{type:'text',...},{type:'image_url',image_url:{url:'data:image/png;base64,...'}}]}]` (needs the mmproj profile, see below).
Fallback-tier scripts: delete the Ollama tier instead (fail closed). After each batch: `esbuild transformSync` parse check, remove the file from the
guard list, rerun the guard. Windows: writes intermittently fail with `UNKNOWN -4094` (background `git.exe` / editor holds the file); retry 3-4x with a pause.

**Batch 5 done (2026-09-19, parse-checked only, not run live):** converted to llama-server `hyperrag-expand`, `cluster-summarize.ts`, `codebase-semantic-indexer.ts`,
`llms/som-cluster-cards`, `karpathy-tag-parallel`, `run-hypergraph.ts`, `summarize-codebase-llm`, `mcp/{contextual-prompt-engineer,demo-svelte5-query,query-db-for-svelte5-errors}` via `llamaChat`;
`mcp/agent-orchestrator.mjs` calls `:8090/v1/chat/completions` directly with tool calls (arguments stringified to/from OpenAI shape). Demo scripts lost Ollama token stats (print `n/a`).
`codebase-semantic-indexer.ts` now caches an empty tag result when llama-server errors (previously skipped caching on non-OK).

**Still on the guard list (13).**
- Archive candidates, do not convert: `scripts/batch_repair_chat.py` (JavaScript in a .py file, streams), `scripts/gemma3-legal-agent.mjs`,
  `scripts/tests/test-ollama-direct.mjs`, `sveltekit-frontend/scripts/{test-ollama-docling.js,test-ollama-inference.js,mcp/test-direct-ollama.mjs,tests/fix-cluster4.mjs}`.
- Legitimate, keep: `sveltekit-frontend/src/lib/server/inference/gpu-arbiter.ts` (unloads the EMBEDDING model, keep_alive 0).
- To convert next: streaming: `generate-timeline-synthesis.mjs`; images: `screenshots/caption-screenshots-gemma4.mjs`;
  syntax error already in HEAD (fix first): `graphify-svg-architecture.mjs:150`; health probe (review, may be legitimate): `startup/run-service-health-check.mjs`.
- Browser: `src/lib/components/ai/EnhancedLegalAIChatWithSynthesis.svelte` (3 direct Ollama `/api/generate` streams). Needs an operator-chosen same-origin streaming route.

**Runtime state changed this session (not in git).** llama-server :8090 was restarted with `-StartupProfile ornith-1.5-vlm` (Ornith 1.5 9B + mmproj, `/props` shows
`vision:true`; VRAM ~7.9/8.2 GB). `legal-ai-docling-vlm` recreated from the rebuilt image (`app_ornith`), healthy; `docker-compose.yml` now sets
`ORNITH_MMPROJ_PATH=models/mmproj-Ornith-1.5-9B-BF16.gguf` and `LLAMA_SERVER_URL` from `DOCLING_LLAMA_SERVER_URL` (default `host.docker.internal:8090`; the repo `.env` value
`127.0.0.1` is unreachable from a container). `sveltekit-frontend/.env`: `EMBEDDING_PROVIDER`/`EMBEDDING_BACKEND` set to `ollama` (ONNX QInt8 export measured cosine ~0 vs Ollama,
not a valid fallback). Docker note: a stuck container-name reservation cost time; if `compose up` says the name is in use, check `docker ps -a` for `Created` containers
under a prefixed name before removing anything.

**Not rebuilt / not run.** `docker/image-synthesis` (RUNNING, healthy :8092, no app callers; source edited to use llama-server; container still old code) and
`docker/clickhouse-mirror` (no compose service, no container, no caller; source edited) need a rebuild or, more likely, an archive decision (A0-A5 above).
None of the converted scripts was executed against a live llama-server; only parse-checked. `constitution-pipeline.mjs` vision path untested.

**Open decisions for the operator.** (1) streaming route for the browser chat component; (2) archive vs rebuild `image-synthesis` (measure VRAM first) and archive
`clickhouse-mirror`; (3) `LLMSelector.svelte` entry still `provider:'ollama'`; (4) `semantic-health/+server.ts` checks the chat model against Ollama `/api/tags`;
(5) `modelQuant: 'iq4_xs'` in ACE cache keys is stale (Ornith quant unconfirmed); (6) derive `SERVER_CHAT_MODEL` from `LLAMA_SERVER_MODEL`/the live resolver instead of a constant.

**Related threads (recorded elsewhere).** Qdrant `codebase_chunks_768` identity census (328,348 points; ~52k v2 generation mirrored into the base collection;
`content_hash` looks file-level so source+hash overcounts duplicates) and the 384-lane census are in `parent-atlas-semantic-768-canonical-contract/tasks.md`
(section "SEMANTIC-768-TRUNCATION-AND-384-CENSUS"). Manual-migration review of the 7 priority-1 lineage files is in `manual-migration-reconciliation/tasks.md` (MMR1.9a);
`0050_add_summary_quality_score.sql` is proposed DEFERRED (5 scripts still write `summary_quality_score`, column absent live).
The Ollama/Ornith work was committed 2026-09-19 as a scoped commit (only files touched by this thread); ~300 unrelated pre-existing working-tree changes (audit reports, OpenSpec audit scripts, langgraph/docker edits, submodules) were deliberately left uncommitted.

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
