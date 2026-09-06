## 1. `ORNITH-ANALYSIS-ADAPTER-01` — close as already-satisfied (evidence already gathered)

- [x] 1.1 Read all 12 files under `sveltekit-frontend/src/lib/server/analysis/` originally
      flagged by string-matching (`gemma4`/`ollama`/`llama-server`/port references):
      `worker.ts`, `summarizer.ts`, `holistic-synthesizer.ts`, `entity-extractor-unified.ts`,
      `gemma4-nlp-reranker.ts`, `ast-langextract-bridge.ts`, `vlm-evidence-analyzer.ts`,
      `granite-docling.ts`, `evidence-analysis-pipeline.ts`, `agentic-fix-proposal.ts`,
      `hmm-error-classifier.ts`, `batch-error-analysis.ts`. Result: 4 already call
      `resolveLlamaInferenceTarget()` directly; 2 delegate to one of those 4; 1 resolves through a
      re-export barrel to `VLM_MODELS.legal` (confirmed `'ornith-1.5-9b'` at
      `sveltekit-frontend/src/lib/server/ollama.ts:24`); 1 was a false-positive text-classification
      regex, not a model call; 3 correctly use the separate VLM lane (`LOCAL_VLM_MODEL`); 1 has a
      cosmetic-only stale string in a non-executed error-message suggestion. Zero require
      functional rerouting.
- [x] 1.2 Confirmed live: the currently-running **text-only** Ornith profile has no vision modality
      loaded (`GET :8090/props` → `modalities: {vision: false, audio: false}`,
      `model_alias: "ornith-1.5-9b"`). **Corrected same day (web-verified)**: this is a local
      configuration fact, not a model capability limit — Ornith 1.5 9B is upstream vision-capable
      (see task group 4, `ORNITH-VLM-MMPROJ-01`).
- [x] 1.3 Confirmed `models/mmproj-F16.gguf` (990MB, dated before Ornith existed) is documented in
      `models/model-manifest.json` as `"Gemma 4 SigLIP mmproj (vision tower)"` — not usable with
      Ornith's different base-model architecture. No cross-model reuse attempted. The fix is
      acquiring the correct Ornith-specific projector (task group 4), not repurposing this one.
- [x] 1.4 `ORNITH-ANALYSIS-ADAPTER-01`: **CLOSED — `ALREADY_SATISFIED`**. Record this verdict in
      `docs/reports/parent-atlas-workstation-phase-11-17-implementation-plan-v1.md`'s Phase 11
      section (already done, same-day correction pass) so no other concurrent session re-derives
      or duplicates this same audit.
- [x] 1.5 Swept all 16 remaining files from CLAUDE.md's 20-file list not already covered by task
      1.1's `analysis/` scope. Read actual call sites in each (not grep-level) before concluding
      anything:
      - **13 of 16 need nothing**: `legal-skills.tool.ts` (CLAUDE.md's cited "3× `/api/generate`"
        is stale — now just an `/api/tags` health probe), `gemma4-synthesis-generator.ts` and
        `gemma4-decomposition-planner.ts` and `gemma-tool-router.ts` (already call
        `resolveLlamaInferenceTarget()` / `VLM_MODELS` directly), `mcp/server.ts` and
        `semantic-health/+server.ts` (Ollama used only for its sanctioned roles — `/api/tags`
        health, `/api/embed` embeddings), `emotion-context.ts` and `gpu-process-machine.ts` (call
        this app's own internal `/api/chat`/`/api/ai/emotion` routes, not Ollama directly),
        `chat-memory.ts`, `ace-error-kag.ts`, `route-feature-map.ts` (a route registry listing, not
        a call site), `repository-provenance-workflow.ts`, `service-integrations.ts`,
        `service-worker.ts` (matches its own app route path for SW caching, unrelated to Ollama).
      - **1 of 16 was a genuine live bug, now fixed**: `src/routes/(app)/chat/[id]/+page.server.ts`'s
        `send` form action (the real, wired message-send handler for the `/chat/[id]` page) called
        Ollama's native `/api/generate` directly with `stream: true` and `model: LLM_MODEL_ID` — a
        llama-server GGUF/alias identifier (e.g. `hforf.gguf`, `ornith-1.5-9b`), never an
        Ollama-pulled tag. Confirmed this bypassed the repo's own `ollamaFetch()` TurboQuant
        intercept shim (`src/lib/server/ollama.ts`), which explicitly only intercepts
        **non-streaming** `/api/chat`/`/api/generate` calls (`if (ollamaBody.stream !== false)
        return null`) — so this streaming call had no safety net and would send Ollama a model
        name it almost certainly doesn't have pulled. **Fixed**: rewrote `streamOllamaResponse` →
        `streamLlamaServerResponse`, now calls `resolveLlamaInferenceTarget()` (live discovery) and
        `POST {baseUrl}/v1/chat/completions` directly with `messages`/`stream: true`, parsing
        OpenAI-style SSE (`data: {...}` / `[DONE]`) instead of Ollama's NDJSON — matching this
        repo's own documented "llama-server `:8090` — always `stream: true`" pattern (root
        `CLAUDE.md`). Removed now-dead `getOllamaUrl`/`ollamaFetch`/unused `Redis` type imports.
        Verified with `esbuild` bundle transform (clean, no syntax errors) — full `tsc`
        unavailable standalone due to an unrelated repo-wide `three.js` type-lib resolution issue.
      - **1 of 16 looked identical but is actually already safe**: `src/routes/api/whisper/transcribe/+server.ts`'s
        `enrichTranscription()` also calls `ollamaFetch('/api/generate', { model: LLM_MODEL_ID,
        stream: false, ... })` for a post-transcription case summary — but because this call is
        **non-streaming**, it DOES get transparently intercepted and routed to llama-server's real
        `/v1/chat/completions` (the intercept's own header comment states the design intent
        explicitly: *"Ollama remains embeddings-only in this deployment; it is never a chat
        fallback"*). It only ever reaches a genuine (and would-be-broken) Ollama call if
        llama-server/TurboQuant health-checks fail — already wrapped in try/catch, warns and
        continues without a summary rather than breaking the transcription itself. Left as-is:
        not a live bug, and the degraded-fallback path failing is arguably correct behavior anyway
        when llama-server is genuinely down.

## 2. `ANALYSIS-PASS-CURRENT-SELECTION-01` — build and run the replay proof (the real remaining work)

- [x] 2.1 Read `analysis-pass-current.ts` in full. It does NOT implement selection logic itself —
      it queries a Postgres VIEW, `analysis_pass_current`, and reports statistics
      (`buildAnalysisPassCurrentProofSnapshot()`). The real selection logic lives in
      `sveltekit-frontend/drizzle/manual/analysis_pass_current.sql`: `SELECT DISTINCT ON
      (packet_key, source_revision, pass_type, pass_revision, input_hash) ... WHERE status =
      'succeeded' ORDER BY ..., created_at DESC, id DESC` — a 5-column composite identity, not the
      simpler "(packet, pass-type)" this task's own original wording assumed.
- [x] 2.2 Read `analysis-pass-boundary.ts` in full. It is NOT an input-validation or
      authorization boundary (both candidate meanings this task's wording raised) — it's a
      proof/introspection function (`buildAnalysisPassBoundaryProofSnapshot()`) that reports
      whether "current" is enforced by the view alone (`currentBoundaryKind: 'view_only'`) versus
      a real unique constraint, and explicitly returns `reuseBoundary: 'application_level_reuse'` —
      confirming (matches prior session memory "PF4H boundary uniqueness not required") that
      nothing in the database prevents duplicate rows for the same logical identity; the DISTINCT
      ON view only picks one deterministically at *read* time.
- [x] 2.3/2.4 Found and reused a pre-existing script with the same intended purpose
      (`scripts/atlas/prove-analysis-pass-current-selection-v1.mjs`, committed 2026-09-04 by a
      concurrent session) rather than creating a duplicate — per this repo's Duplication
      Prevention rule. The existing version only sampled 5 arbitrary rows and checked field
      non-nullness (honestly reported `BLOCKED_INCOMPLETE_SELECTION_METADATA`, not a false
      positive, but never tested actual DISTINCT ON selection semantics). **Rewrote it** to: read
      the LIVE deployed view definition via `pg_get_viewdef()` and diff it against the file on
      disk; extract the live view's actual status filter/tiebreak from that live definition
      (never hardcoded); find and test one real single-unsuperseded-identity case; find and test
      one real duplicate-identity case, independently computing the expected winner under a full
      `created_at DESC, id DESC` order and comparing it to what the view actually returned; count
      identity groups with genuine timestamp ties within the live-filtered bucket. Found and fixed
      a real bug in my own first draft along the way (SQL parameter-numbering mismatch when an
      identity column was NULL) before it ran cleanly. Ran it live against real Postgres data —
      receipt at `docs/reports/parent-atlas/analysis-pass-current-selection-v1.json`.

      **Both replay scenarios from the spec PASSED on real data**: a real single-row identity
      (`packet:0004b466d863` / `embedding`) → view returns exactly 1 row; a real 5-row duplicate
      identity (`packet:fb1a78fd2216` / `summarization`, ids 8045/8254/8256/8257/8258, no tied
      timestamps) → view returns exactly 1 row (id 8258), matching the independently-computed
      expected winner under `created_at DESC, id DESC`. **The DISTINCT ON selection logic itself
      is correct.**
- [x] 2.5 **Real bug found, recorded here rather than silently patched — no `CREATE OR REPLACE
      VIEW` was run against the live database.** The **deployed** `analysis_pass_current` view
      does not match its own source-of-truth file:

      | | Live deployed view (`pg_get_viewdef`) | File on disk (`analysis_pass_current.sql`) |
      |---|---|---|
      | Status filter | `WHERE status = 'success'` | `WHERE status = 'succeeded'` |
      | Tiebreak | `ORDER BY ..., created_at DESC` (no `id`) | `ORDER BY ..., created_at DESC, id DESC` |

      This is genuine DB/file drift, not a hypothetical: someone edited the `.sql` file (adding
      the `id DESC` tiebreak and switching the status literal) but that edit was never re-applied
      to the live database. Consequences, confirmed against real data (statuses censused live:
      `'success'` = 11,076 rows, June 2026, pass_types `summarization`/`embedding`/`cache_push`;
      `'succeeded'` = 19 rows, Aug 2026, pass_types `code_feature_registry`/`pos-concept-tagging` —
      matching the current TypeScript type `AnalysisPassLedgerInput.status: 'succeeded' | 'skipped'
      | 'failed'`, so `'succeeded'` is the current canonical writer's convention and `'success'` is
      an older, differently-typed writer generation):
      1. The live view currently surfaces "current" rows only from the **older** 11,076-row
         `'success'` bucket — the 19 rows written by the current typed contract (`'succeeded'`)
         are entirely invisible to `analysis_pass_current` today.
      2. If the live view is ever redeployed to exactly match the file on disk (switching the
         filter to `'succeeded'`), it would flip to the opposite problem — the 11,076 legacy rows
         would become invisible instead, unless something migrates their status value first.
         **Neither the current live state nor a naive "just deploy the file" fix covers both
         conventions** — this needs an explicit decision (migrate old rows' status value?
         broaden the filter to `IN ('success','succeeded')`? something else?), not a blind
         `CREATE OR REPLACE`.
      3. The missing `id DESC` tiebreak in the live view is not yet causing observable
         nondeterminism (0 identity groups have tied timestamps in the `'success'` bucket it
         currently queries), but all 4 real duplicate-identity groups in the `'succeeded'` bucket
         DO have exact tied timestamps (same millisecond) — meaning if the view is ever pointed at
         that bucket without also picking up the tiebreak from the file, "current" selection for
         those 4 groups becomes genuinely nondeterministic (Postgres does not guarantee a stable
         pick among `DISTINCT ON` ties without a fully-specifying `ORDER BY`). The two fixes (status
         literal + tiebreak) are coupled findings, not independent ones.
      4. `analysis-pass-current.spec.ts`'s existing test only checks the snapshot function's
         *shape* (never throws, valid enum values) — it does not and would not have caught any of
         this, since it never inspects the view's actual deployed definition or selection
         semantics.

      **Not fixed here** — redeploying `analysis_pass_current` is a DDL change to a view an
      unknown number of live consumers may already depend on for its current (if incomplete)
      behavior; per this repo's Agent Execution Integrity and canonical-mutation-authorization
      rules, this requires an explicit operator decision on which status convention(s) to cover
      before any `CREATE OR REPLACE VIEW` runs, not a same-pass fix bundled into a proof task.

## 3. Deferred Engram ingestion lane — investigate before deciding to build

- [x] 3.1 Read `sveltekit-frontend/src/lib/server/ai/engram-memory.ts` and
      `sveltekit-frontend/src/lib/server/memory/local-engram-memory-adapter.ts` in full (both
      complete, non-stub implementations — not missing config, not incomplete code). Then traced
      every caller of every exported write method (`grep`-confirmed against live call sites, not
      assumed from names) to find the actual reason "ingestion" never fires.
- [x] 3.2 **Finding recorded plainly — this is a real, three-way duplication/dead-code question,
      not a missing dependency or config gap. Requires an operator decision (see below), not a
      build task.**

      **Read side is wired and live**: `LocalEngramMemoryAdapterImpl.getRoutingHints()` has 2 real
      callers — `sveltekit-frontend/src/lib/server/retrieval/hyperrag-fusion-service.ts:217` and
      `sveltekit-frontend/src/lib/server/features/ai/ai/intent-ranker.ts:362`. Both consume
      `didYouMean`/`priorQueries`/`bmuHints`/`workflowMemories` from Redis.

      **Two of its three write paths have zero callers anywhere in `src/`** (grep-confirmed,
      `\.recordTransition\(` and `recordWorkflowMemory` both return no matches outside their own
      definition file):
      - `LocalEngramMemoryAdapterImpl.recordTransition()` — dead. The bigram-transition writes
        that `getRoutingHints()` actually reads back (`ace:engram:bigram:*`, `ace:engram:query:*`)
        are populated by a **separate, independently-implemented** `recordEngramTransition()` in
        `sveltekit-frontend/src/lib/server/search/engram-bigram.ts`, called live from
        `src/routes/api/sse/chat/+server.ts:1848` and
        `src/lib/server/features/ai/ace/context-assembler.ts:3700`. Both implementations write
        into the *same* Redis keyspace but with different query-normalization
        (`ai/engram-memory.ts`'s `hashQuery()` only lowercases+trims; `search/engram-bigram.ts`'s
        `normalizeQuery()` also collapses internal whitespace) and different TTL/trim policy
        (`ai/engram-memory.ts`: 7d/14d, no cap; `search/engram-bigram.ts`: 3d/7d, capped at 200
        entries via `zremrangebyrank`). A query with irregular internal whitespace would hash
        differently between the two — a latent correctness gap, not just redundant code.
      - `recordWorkflowMemory()` — dead. This is the actual "ingestion" the phase-11 plan meant:
        it's the only writer of `ace:engram:workflow:hot:{hash}`, the key `getRoutingHints()`
        reads into `workflowMemories`. The `EngramWorkflowMemory` type
        (`memoryType: 'retrieval_lesson' | 'debug_lesson' | 'workflow_lesson'`, `accepted`,
        `testsPassed`, `reward`) and its forbidden-field sanitizer (blocks
        `hiddenThoughts`/`kv_cache`/`tensor`/`rope`/etc. per this repo's Agent Execution Integrity
        rules) exist ONLY in this one file (`grep`-confirmed repo-wide under
        `sveltekit-frontend/src` — zero other references to `EngramWorkflowMemory`,
        `workflow_lesson`, `retrieval_lesson`, or `debug_lesson`). Nothing anywhere constructs one
        and calls `recordWorkflowMemory` — "deferred" meant exactly this: the receiving end was
        built (types, sanitizer, TTL, read-side consumer) but nothing was ever wired to produce a
        validated lesson to feed it. This is not a config/dependency gap — it's an unfinished
        producer half of an otherwise-complete scaffold.

      **A third, fully independent write path exists outside the app entirely**:
      `scripts/atlas/engram-plugin-adapter.mjs` (`createRedisEngramAdapter`) writes
      `ace:engram:lesson:{id}` + a `ace:engram:lessons` SET index, driven by the standalone CLI
      `scripts/atlas/sync-engram-memory.mjs --write` (`memory_type: 'workflow_lesson'` — same
      string literal as `EngramWorkflowMemory.memoryType`, but a completely different schema:
      `id`/`memory_type`/`tags`, not `featureKeys`/`clusters`/`accepted`/`testsPassed`/`reward`).
      This script also parses `REDIS_URL` directly (`new Redis(options.url ||
      process.env.REDIS_URL || ...)`), which is the exact anti-pattern this repo's own
      `sveltekit-frontend/CLAUDE.md` "Valkey/Redis Connection Pattern" section forbids
      ("Never hardcode `redis://` URLs... extract host/port/password separately"). Nothing in
      `src/` reads `ace:engram:lesson:*` — this third path is a closed loop with no consumer.

      **Net finding**: "Engram ingestion: created + wired; deferred" undersells the real state.
      The read side is genuinely wired and live. What's actually deferred/missing is (a) a real
      producer for `recordWorkflowMemory` (no code anywhere decides "this was a validated lesson,
      go record it"), and (b) reconciliation of three non-communicating write implementations
      that all use the `ace:engram:*` prefix, two of which silently duplicate the same bigram
      capability with different correctness properties.
- [ ] 3.3 **Stopping here per this task's own instruction — this needs an operator decision, not
      unauthorized build work.** Open questions for the operator, not assumed: (a) which bigram
      writer is canonical — `search/engram-bigram.ts` (currently the only one actually invoked) or
      `ai/engram-memory.ts` (richer BMU/SOM-cell linkage, currently unused) — and should the other
      be archived per this repo's archive-not-delete convention; (b) what event in the real
      pipeline should count as "a validated lesson" worth calling `recordWorkflowMemory` for (e.g.
      a `graphify_runs` completion with zero hard-fail gates? an accepted agentic fix with passing
      tests?) — this is a product/architecture decision, not a wiring gap; (c) whether the
      standalone `scripts/atlas/sync-engram-memory.mjs` lesson-sync path should be retired,
      reconciled into the same schema as `EngramWorkflowMemory`, or left as a genuinely separate
      capability (it syncs workspace/cluster/feature-level memories, not per-query workflow
      lessons — plausibly a different logical capability that only *looks* like a duplicate because
      of the shared `ace:engram:` prefix and `workflow_lesson` string). Do not build a fix for any
      of these until the operator picks a direction.

## 4. `ORNITH-VLM-MMPROJ-01` — narrow gate: register the real Ornith projector, prove one profile

Not another model architecture project. Web-verified 2026-09-05: Ornith 1.5 9B is upstream
vision-capable; `ornith-ai/Ornith-1.5-9B-GGUF` on Hugging Face ships
`mmproj-Ornith-1.5-9B-BF16.gguf`, auto-resolvable via llama.cpp's `-hf` flag or loadable via
`--mmproj`.

- [x] 4.1 Acquired `mmproj-Ornith-1.5-9B-BF16.gguf` (921,704,672 bytes) to `models/` via direct HTTPS
      from `ornith-ai/Ornith-1.5-9B-GGUF` on Hugging Face. Verified sha256
      `626f9f90627402a6bf4a999111d0fbd69b5fcca7aa8ba089d69e5f10e8858e1d` byte-for-byte matches the
      HF-published `X-Linked-ETag`/`X-Xet-Hash` from the pre-download HEAD request — not merely
      "download succeeded," a real independent hash comparison.
- [x] 4.2 Added a new `ornith-1.5-mmproj` entry to `models/model-manifest.json` (kept the existing
      `gemma4-mmproj` entry untouched, added matching `modelFamily`/`compatibleModelIds` fields to
      both so resolution can key on family rather than a flat pointer): `modelFamily: "ornith-1.5"`,
      `compatibleModelIds: ["hforf-gguf"]`, `artifactSha256`, `artifactSizeBytes`, `sourceUrl`,
      `verifiedAt`. Explicit notes field states the two projectors are architecturally incompatible
      (Ornith: `qwen3_5_vision`, hidden_size 1152, depth 27; Gemma4: `gemma4_vision`,
      pooling_kernel_size 3, vision_soft_tokens 280) and must never be cross-loaded.
- [x] 4.3 Rewrote `scripts/launch-turboquant.ps1`'s mmproj resolution: added `ModelFamily`/
      `WantsVision` fields to every startup profile (including retroactively fixing the legacy
      `ornith` 1.0 profile, which previously had no family designation and could have opportunistically
      loaded the Gemma4 mmproj cross-family — now resolves to an empty candidate list for
      `ornith-1.0` instead). New `Resolve-FamilyMmprojCandidates` function + family-scoped env var
      (`ORNITH_MMPROJ_PATH`, falls back to legacy `TURBO_MMPROJ_PATH` only for the `gemma4` family).
      Throws before launch if a `WantsVision` profile can't resolve its family's projector. Loading
      gate rewritten from the old `Id -eq 'ornith-1.5'` special-case to
      `$wantsVision -or ($modelFamily -eq 'gemma4')`. Syntax-validated with PowerShell's own AST
      parser (0 errors) both before and after the incidental banner fix below.
- [x] 4.4 Added the `ornith-1.5-vlm` profile (same model/template/context as `ornith-1.5`, differs
      only in `WantsVision: $true`) to the `-StartupProfile` `ValidateSet` and profile list. The
      existing `ornith-1.5` profile is unchanged and confirmed post-change to still skip mmproj
      entirely (live log: `"Multimodal projector: not attempted for model family 'ornith-1.5'
      (profile 'ornith-1.5' does not request vision)"`).
- [x] 4.5 **Live-proven.** Stopped only the `:8090` chat process (PID identified via
      `Get-CimInstance Win32_Process` command-line inspection — left the separate `:8081` embedding
      server, a different PID, untouched throughout). Started `-StartupProfile ornith-1.5-vlm` on
      the pinned `C:\Users\james\Desktop\llama-server-cuda\llama-server.exe` binary. `GET :8090/props`
      → `model_alias: "ornith-1.5-9b"`, `modalities: {"vision": true, "audio": false}`. Launch log
      confirms the family-keyed resolver actually fired: `"Multimodal projector: loading
      ...mmproj-Ornith-1.5-9B-BF16.gguf (family 'ornith-1.5', wantsVision=True)"`.
- [x] 4.6 **All 4 smoke tests passed, real responses** (full transcript in
      `docs/reports/ornith-vlm-mmproj-01-proof-v1.json`): (1) text completion → exact
      `SMOKE_TEXT_OK`; (2) tool call → real `tool_calls` array,
      `get_weather({"city":"Boston"})`, `finish_reason: "tool_calls"`; (3) JSON structured output →
      valid `{"name":"test","count":3}`; (4) image understanding, real 3.1MB PNG
      (`sveltekit-frontend/static/yorha-celestial.png`), no prior context → *"A collection of 16
      celestial-themed logos featuring white wings, golden halos, and stars arranged in a grid
      against a starry night sky"* — semantically accurate, not a generic/hallucinated fallback
      description (confirms real vision-token processing, not just request acceptance).
- [x] 4.7 No dedicated pre-existing regression fixture file was found for the text-only profile
      (checked — none committed), so the same 3 text/tool/JSON smoke calls above served as the
      regression check: `model` / `system_fingerprint` stayed `ornith-1.5-9b` /
      `b8757-a29e4c0b7` across every call, and no request ever fell back to a Gemma4 identity or
      template. Recorded as `notCompletedThisPass` in the receipt rather than silently claiming a
      fixture-based regression proof that didn't exist.
- [x] 4.8 VRAM measured (not assumed): before switching to `ornith-1.5-vlm`, 7578MiB
      used/447MiB free; after, 7421MiB used/604MiB free. **Did not match the expected ~922MB
      delta** and no OOM occurred despite the tight 447MiB starting headroom — recorded honestly
      as an open discrepancy (likely explained by KV-cache/allocator differences between the
      killed and fresh process, not investigated further) rather than forced to match the a priori
      expectation. Reverted `:8090` back to the plain `ornith-1.5` text profile immediately after
      the proof, confirmed live (`modalities.vision: false` again) — this change does not leave
      the shared `:8090` server running in the heavier VLM state by default, matching the design's
      stated intent to preserve text-mode headroom unless a caller explicitly opts in.
      **Incidental fix**: found and fixed the "TurboQuant ready" banner deriving its
      `text-only`/`with VLM` label solely from the `-TextOnly` switch — it printed `"with VLM"` on
      every non-`-TextOnly` launch even when no `--mmproj` flag was ever added (pre-existing bug,
      unrelated to this change's core scope, fixed in passing since it directly touched the same
      resolution variables).
- [x] 4.9 Updated `specs/analysis-pass-ornith-adapter/spec.md`'s VLM-lane requirement (see edit
      below) to reflect a genuinely `LIVE_GET_PROVEN` local Ornith-VLM path — per the receipt at
      `docs/reports/ornith-vlm-mmproj-01-proof-v1.json`. **The old Gemma4 VLM path
      (`vlm-evidence-analyzer.ts`, `granite-docling.ts`,
      `evidence-analysis-pipeline.ts`'s VLM branch) is explicitly NOT retired by this task** —
      retiring it is a separate, larger decision (those call sites may have reasons beyond "Ornith
      can now also do vision," e.g. throughput, prompt format, existing evidence-pipeline
      integration) that this gate's scope never included; flagging it as a follow-up decision for
      the operator, not auto-closing it.

## 5. Closeout

- [x] 5.1 Confirmed: no second receipt owner was introduced. All work extended the existing
      trio (`analysis-pass-results.ts`/`analysis-pass-current.ts`/`analysis-pass-boundary.ts`) or a
      pre-existing proof script (`scripts/atlas/prove-analysis-pass-current-selection-v1.mjs`,
      rewritten in place, not duplicated). The Engram three-way duplication finding (task 3) is a
      pre-existing condition this change discovered and recorded, not something it introduced.
- [x] 5.2 Updated `docs/reports/parent-atlas-workstation-phase-11-17-implementation-plan-v1.md`'s
      Phase 11 section with the full closure evidence for all four gates this change owned. Status
      left at `PARTIAL` (not promoted to complete) — two genuinely open items remain (the
      `analysis_pass_current` view-source drift, and the Engram bigram-writer/lesson-trigger
      decisions), both explicitly requiring an operator decision this change does not make on its
      own, per this repo's Agent Execution Integrity rules.
- [x] 5.3 `npx openspec validate parent-atlas-analysis-pass-ornith-adapter --strict` — passes.
- [x] 5.4 **Vision projector ownership registry freeze (2026-09-06).** Updated
      `models/model-manifest.json` with explicit `ORNITH_VISION_PRODUCTION` and
      `GEMMA_VISION_PRODUCTION` profiles, family-matched projector IDs and checksums, and the
      non-production `ORNITH_MODEL_GEMMA_PROJECTOR` compatibility profile. Ornith's projector
      checksum is frozen as
      `626f9f90627402a6bf4a999111d0fbd69b5fcca7aa8ba089d69e5f10e8858e1d`; the locally measured
      Gemma projector checksum is recorded separately. Cross-family loading is not permitted,
      and the default `ornith-1.5` text profile remains projector-free. This is registry/provenance
      work only; it does not claim a live cross-family compatibility proof or retire the existing
      Gemma4 evidence pipeline.
