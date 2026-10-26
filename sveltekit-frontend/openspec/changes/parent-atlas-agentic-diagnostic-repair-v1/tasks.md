# Tasks: Agentic diagnostic repair (v1)

Status vocabulary per root CLAUDE.md: CREATED / WIRED / DRY_RUN_PROVEN / APPLY_PROVEN / NOT_PROVEN / BLOCKED.
Nothing is done from aspiration. Each task names the receipt that proves it.
This change is separate from `parent-atlas-ace-json-dag-prefill-pipeline` and from the source-qualified corpus admission ledger.

## Goal and first milestone

Compile a bounded repair context from real diagnostics, and let a model propose a repair that a gate can verify.
It must never treat a quiet checker as success.

First milestone (one real case end to end):
one real SvelteKit diagnostic → exact source evidence → DAG-prefilled context → Ornith repair proposal →
isolated patch → passing verification → portable agent handoff receipt.

Do not start by fixing the remaining source diagnostics in bulk, and do not resolve the ontology tuples first.
The 539,124 unresolved ontology tuples must not block repairs.

## Evidence rules

- Retrieval projections (Qdrant, FTS, semantic neighbours) are candidates only. The compiler re-reads current source,
  verifies hashes, and rejects mismatched revisions before any evidence is used.
- Retrieval priority: 1 exact source span; 2 AST parent and enclosing symbol; 3 imports, definitions, callers;
  4 related diagnostics; 5 existing fix and test examples; 6 Qdrant semantic neighbours only when exact evidence is
  insufficient; 7 ontology and taxonomy (optional, never required).
- The ranking score is a recommendation, not a verdict on whether a patch works.
- Confidence in a repair proposal is a proposal score, not a probability of success.
- Patches that touch files outside the authorized scope, use `@ts-ignore` or unsafe casts to hide errors, or change
  unrelated behaviour without justification are rejected.

## Repair DAG (each node writes a receipt; a failed gate stops the run or asks for narrower evidence)

DIAG-01 capture baseline → DIAG-02 normalize and deduplicate → ROOT-01 cluster root causes → AST-01 read exact current source →
KAG-01 resolve dependency neighbourhood → RANK-01 score repair strategies → CTX-01 compile bounded ContextManifest →
LLM-01 Ornith proposes minimal patch → PATCH-01 apply in isolated workspace → TEST-01 svelte-check and targeted tests →
REVIEW-01 accept, reject or escalate → HANDOFF to Codex, Claude Code or Antigravity.

Inference boundary: `ContextManifestV1` → `PromptPlanV1` → llama-server `:8090` → `RepairProposalV1`.

## Tasks

- [~] **R01** Capture the authoritative svelte-check baseline.
      Evidence: command, exit code, duration, diagnostics, and a reproducibility receipt. The receipt records source hash,
      toolchain versions, workspace revision, and Git commit. Two identical runs must give stable diagnostics.
      Status 2026-10-21: BASELINE_CAPTURED_NOT_CLEAN_TREE. Receipt: `docs/reports/agentic-diagnostic-repair/r01-svelte-check-baseline.json`.
      Two runs (exit 0 both), diagnostics byte-identical. Result: 16,213 files, 0 errors, 15 warnings in 10 files
      (form label x8, unused CSS selector x4, click-without-key x2, line-clamp compat x1). The tree had 55 uncommitted
      entries, so this is not a clean-checkout baseline. Earlier "tens of thousands" figures use a different command or
      threshold and are not comparable.
      Recheck 2026-10-21: one fresh `npm run check -- --output machine` completed with exit 0 (16,213 files,
      0 errors, 15 warnings); output SHA-256 `b57fa39d6f64ddf39aa9fa1d329c9cd7dfeefcc24992348e3fce315d8c63a471`.
      Re-baseline with the project's own command, two runs: `docs/reports/agentic-diagnostic-repair/r01b-svelte-check-baseline.json`.
      Both exit 0 (347 s, 295 s), 16,213 files, 0 errors, 15 warnings in 10 files; diagnostic lines identical after the
      timestamp is stripped. Status BASELINE_REPEATED_STABLE_NOT_CLEAN_TREE. The baseline hash is not compared because its
      method is not reproduced. The tree now has 58 dirty entries (55 at R01). R04 must use the r01b receipt.
      The repeat was stopped before diagnostics when host free RAM measured 0.7 GiB; this does not prove two-run
      stability. The expanded-source replay is a separate baseline.
      Exclusion review follow-up: two fresh project-command runs in the current checkout are byte-identical after
      timestamp normalization and each reports 16,213 files, 0 errors, 0 warnings (6,567 source `.svelte`/`.ts` files
      exist under `src`; the tool's FILES count includes its wider program). The worktree is dirty (74 paths), so this
      is not a clean baseline and does not supersede the expanded-source scan. See
      `docs/reports/agentic-diagnostic-repair/r01-check-exclusion-audit-2026-10-21.json`.
      The configured check excludes 1,263 `.spec.ts`/`.test.ts` files, five `*.worker.ts` files, and the live
      `src/service-worker.ts`; it also excludes two `src/wasm/*.ts` files. Keep R01 partial until those executable
      exclusions receive explicit coverage/disposition and the expanded scan scope is reconciled.
      Fresh project-command pair recheck: exact `npm run check`, twice sequentially with targeted Node heap limit
      `--max-old-space-size=16384`; both exits 0, both reported 0 errors/0 warnings, and captured logs were byte-identical
      (`sha256:aac4f4c26806d15e777501c0788d23ec5113318ec4d765d0f773aeadbfc43e`). Durations were 595,982 ms and
      444,714 ms. Receipt: `.tmp/atlas/r01-current-check-20261021T184307142/receipt.json`; source/datastore writes 0.
      Toolchain/config/lock and Git HEAD are recorded there, but the dirty checkout and exclusion gap remain; this does
      not close R01's expanded-scope completeness or establish binding to the diagnostic's workspace revision.

- [~] **R02** Normalize diagnostics into canonical identities.
      Evidence: stable diagnostic IDs qualified by source and workspace revision. Report the totals by diagnostic source,
      distinct files, distinct codes, and repeated error signatures.
      Status 2026-10-21: IDENTITIES_CAPTURED. Receipt: `docs/reports/agentic-diagnostic-repair/r02-diagnostic-identities.json`.
      15 diagnostics, 0 parse failures, 15 unique IDs (`diag-` + sha256 of commit, dirty count, file, line, column,
      severity, code), 10 distinct files. The IDs are tied to the dirty tree, so they change when the working tree changes.
      Not done: "repeated error signatures" and per-source totals beyond the single svelte-check source.

- [~] **R03** Cluster likely root causes.
      Evidence: root-cause hypotheses, each with its dependent diagnostic set and estimated dependent count. The result
      shows whether the errors reduce to a much smaller number of causes.
      Status 2026-10-21: CLUSTERS_HYPOTHESIZED_NOT_VERIFIED. Receipt: `docs/reports/agentic-diagnostic-repair/r03-root-cause-clusters.json`.
      15 diagnostics reduce to 4 clusters: RC-01 form-label (8 diagnostics, 7 files, one change per file), RC-02 click on
      non-interactive element (2), RC-03 unused CSS in the client-inference demo (4, one page), RC-04 `line-clamp` (1).
      Dependent diagnostics: 0 throughout, since svelte warnings do not cascade. Hypotheses are from rule text and locations
      only; R04 must check each one against the source.
      Expanded-source signature dry-run: 2,204 diagnostics grouped into 456 exact normalized-message signatures;
      179 groups were generated-only. A transparent frequency/file-spread heuristic produced candidates only—not
      semantic root causes or a trained ranking. Receipt: `.tmp/atlas/diagnostic-repair-proposals/expanded-signature-rank-dry-run-2026-10-21.json`.
      Top-ranked signature: 21 `.ts`-extension import diagnostics across 21 files. A focused current-source audit found
      20 frontend paths clean at HEAD `3376feb172cdb41c86c764f6c6cbcb153f199889`; one `../scripts/*.mts` path is outside
      the frontend resolver's allowed root and was rejected. Representative test files explicitly import sibling `.ts`
      files. The standard `tsconfig.json` uses `moduleResolution: bundler` and does not set `allowImportingTsExtensions`;
      the captured expanded run used a temporary config that is no longer present. Therefore this is a strong
      configuration/cohort hypothesis, not a verified root cause; do not rewrite imports until the expanded config is
      reconstructed and the exact diagnostics are reproduced.

- [ ] **R04** Retrieve exact AST and dependency evidence.
      Evidence: current-source hash verification, plus a fail-closed evidence manifest. Any mismatched revision is
      rejected and listed.
      Gate distinction: a complete AST/chunk response proves parser coverage and source-span alignment only. AST-symbol
      linkage passes only when the diagnostic byte span is contained by exactly one resolved symbol/version whose
      sourceRef, sourceRevision, workspaceRevision, producer revision, and source hash match the frozen diagnostic
      input. Zero or multiple matches remain `SYMBOL_UNRESOLVED` / `SYMBOL_AMBIGUOUS`; never substitute a chunk ID,
      path, or symbol name for canonical symbol-version identity. Do not complete this gate without a qualified input.
      One diagnostic (`src/service-worker.ts:641`) passed current-source hash and complete 8095 AST span checks.
      This single-example dry run does not complete R04 for the ranked clusters or dependency edges. Receipt:
      `.tmp/atlas/diagnostic-repair-proposals/svelte-check-waituntil-proposal-2026-10-21.json`.
      The top R03 cluster's representative imports and clean-at-HEAD source hashes were reviewed, but AST and dependency
      evidence has not yet been captured for that cluster; R04 remains incomplete.
      Status 2026-10-21 (partial): source-span verification for all 15 diagnostics, 4 clusters. Receipt:
      `docs/reports/agentic-diagnostic-repair/r04-root-cause-source-verification.json`. RC-03 and RC-04 confirmed.
      RC-01 needs refining (3 field labels need association; 5 headings need a different fix). RC-02's
      role hypothesis is wrong: the role exists, and the missing piece is a key handler. Still open for this
      task: current-source hash and 8095 AST span checks for the 15 diagnostics.
      Current-check follow-up: the corrected label/keyboard/CSS sites are modified in this checkout, and two fresh
      project-command checks now report 0 diagnostics. This establishes a clean current result only within the
      configured scope; it does not prove the old 15 diagnostic identities against current bytes or satisfy the
      8095 AST/dependency evidence requirement. Keep R04 open and refresh the diagnostic cohort before ranking or
      building a repair ContextManifest. The exclusion audit found active code omitted from this check: the registered
      service worker and five `*.worker.ts` entries. A separate compiler-API probe (WebWorker library set) found three
      service-worker errors (including the `MessageEvent.waitUntil` mismatch and `localStorage` in an imported helper)
      plus four diagnostics in `browser-context-embed.worker.ts`. Treat these as targeted review findings, not final
      project-check results, until a maintained worker-specific config confirms them. Receipt:
      `docs/reports/agentic-diagnostic-repair/r01-check-exclusion-audit-2026-10-21.json`.
      Read-only single-case verification (2026-10-21): the captured `src/service-worker.ts:641` proposal's current source
      SHA-256, byte count, enclosing 8095 AST span/hash, and diagnostic offset were independently matched. Installed
      TypeScript 5.9.3 WebWorker declarations support the event-type hypothesis, but do not prove the maintained worker
      compiler configuration. The proposal lacks `workspaceRevision`; therefore no repair ContextManifest or repair-ready
      handoff was built. Report: `docs/reports/agentic-diagnostic-repair/r04-single-case-read-only-vertical-slice-2026-10-21.md`.
      Read-only lookup of `atlas_workspace_source_bindings` for the exact captured source ref and source revision returned
      zero rows. Two same-path bindings belong to a different source revision and different workspace revisions; neither
      qualifies this proposal. The transaction was `READ ONLY` and rolled back. Keep `WORKSPACE_BINDING_NOT_FOUND_FOR_CAPTURED_BYTES`.
      The existing admitted snapshot `sha256:6288726b73626ae58905b5ebdea42e709cb1af67b3e16186bcd8b2b88a89d98b` contains
      this path at source digest `b13b1a67f06b81ad8673a102ca986dd394927c275bb46b29cd94bbc4da17a4c9` / 19,654 bytes, not the
      captured 1340575e... / 20,710 bytes. It cannot qualify this diagnostic; path-only reconciliation is rejected.
      Writer review found only explicit apply paths: one is bound to an unrelated 111-row Graphify plan, the other to the
      stale admitted snapshot and a dry run with zero candidates. Neither applies; no writer was invoked.
      Configuration follow-up: both `tsconfig.json` and generated `.svelte-kit/tsconfig.json` exclude
      `src/service-worker.ts`; no dedicated worker config exists. The actual `npm run check` returned 0 errors and 0
      warnings, but did not validate this file. The targeted compiler program explicitly supplied the file and its
      declaration roots, reproducing TS2339 under the maintained compiler options. Keep worker-specific full-check and
      runtime proof open; the annotation recommendation remains advisory.
      Targeted TypeScript 5.9.3 compile using maintained `tsconfig.json` options and the existing service-worker declaration
      reproduced TS2339 at line 641. An in-memory-only `MessageEvent` -> `ExtendableMessageEvent` challenger removed all
      diagnostics for that source in the targeted program; no source edit was made. This is compile-time recommendation
      evidence, not a full Svelte check, runtime test, or source-revision admission. No direct test for this handler was found.
      Dependency trace: the handler passes `event.data` to `handlePhase18OfflineMessage`, whose documented action contract
      has five actions. `PHASE-18-ENVELOPE-WIRING-COMPLETE.md` shows an example sender shape and a wiring task, but no
      executable sender was found. Runtime usage/impact is therefore unknown; do not prioritize on the type error alone.
      Details are in the R04 report.
      R04 remains incomplete.
      2026-10-21 continuation recheck: exact read-only join against `atlas_workspace_source_bindings` returned 0 matches for the current `service-worker.ts` digest and for all 10 distinct current source hashes in the R02 warning cohort. Historical same-path rows have different source digests and do not qualify these captured diagnostics; no workspace revision was inferred and no rows were written. See the R04 report continuation note.
      Latest independent recheck: recomputed `src/service-worker.ts` as `sha256:1340575e8cd0b9f0322ca516837e44329d816b038d3a77218ab64cfcb2307c7e`; queried the healthy PostgreSQL container in `REPEATABLE READ READ ONLY` and rolled back. Exact binding count remains 0. The host planner's missing credential was avoidable through the container, but this confirms the actual blocker is absent source binding, not database availability.
      Alternate grounded diagnostic probe (2026-10-21; NOT ranking-eligible): expanded-scan task `svelte-check:0008f5722a324846e3733ce` points to `src/lib/server/atlas/policy/policy-pattern-extractor.spec.ts:57`, but its source log checksum is null in the local projection, so it cannot enter ranking under the checksum-bound-baseline requirement. Current test bytes (`sha256:9b139ed995d6daf2ef3f65c6a04674500eb5f83ec7721cd2fa3b2546fc5156e3`) have two exact source-binding rows; both the imported implementation and `policy-types.ts` also have exact rows under the same two workspace revisions. The 8095 AST endpoint returned COMPLETE, 16 chunks, matching source revision/path; `hmmPosterior` occupies bytes [334,375). The grounded human-review recommendation is to supply the four missing keys (`LOCATE`, `UNDERSTAND`, `VALIDATE`, `RECOVER`) in the test fixture while preserving its existing `TRACE`/`REPAIR` values. Exact historical config bytes are now separately shown to bind under those same candidate workspace revisions and reproduce the five TS2345s via the compiler API (receipt below); this still does not patch source or admit the finding because the execution workspace/toolchain and diagnostic-to-candidate-snapshot/ordinal are unresolved. See the R04 report's alternate diagnostic probe section.
      Checksummed focused Svelte-check capture (2026-10-21 local time): a temporary target-only tsconfig was used, then removed. The completed machine-verbose run recorded 357 files, 5 errors, 0 warnings, exit 1; the existing capture helper parsed exactly 5 TS2345 errors with 0 malformed lines. Log/capture artifact checksum is `sha256:ce7f9b2efa705edcf87356a1ebe00b0b1ad0be8ae081b0169f9b50c514cc49272`; receipt: `.tmp/atlas/agentic-diagnostic-repair/r04-policy-pattern-error-evidence.json`. Both `sourceRevision` and `workspaceRevision` remain null, `writesPerformed=false`, and `safeToApply=false`. The existing repair evidence adapter rejects this actual receipt with `REPAIR_EVIDENCE_WORKSPACE_REVISION_MISSING`, as intended. This establishes a checksum-bound diagnostic capture but still does not qualify a repair candidate or complete R04/R05.
      Exact configuration-lineage recheck: current frontend `tsconfig.json` is `sha256:6f1fcff10c32e0a25c806ef38f2174ff48f9430318fc3c66c2f50d7200a8c655`. A read-only `atlas_workspace_source_bindings` query returns only historical digest `sha256:82a3bc5e864a2556cd3abd75c4efc92c5df4e7c9ab64a7745d68d6280149cee2` for this path, under both workspace revisions used by the current source file/implementation bindings: `sha256:322ed1a6f8ffc52576314fde9a33afd1faba015c3fc8cd60609052c5ca2dfbaf` and `sha256:e24bb97187ea6394eeba457dd849915f570045b7a1867780fdc7aa9ea62b9acc`. The current config hash has no binding. This confirms the compiler config belongs to neither qualifying snapshot and cannot be filled in from the same-path historical row. Query ran `REPEATABLE READ READ ONLY` and rolled back.
      Exact-config reproduction (2026-10-21): replayed historical config bytes (`sha256:82a3bc5e...`) from Git into a temporary sibling config, verified the target source digest, and ran a scoped TypeScript compiler-API program. It reproduced 5 TS2345 diagnostics at lines 33, 39, 45, 51, and 57. Exact config, target source, and imported source digests bind under the same two candidate workspace revisions. Receipt: `.tmp/atlas/agentic-diagnostic-repair/r04-policy-pattern-bound-config-reproduction.json`, SHA-256 `4a9f3af109b108fa4b3a009e92bd49f91ca4a69f1d3f083407ec1bd317d6cfa9`. Still `DIAGNOSTIC_REPRODUCED_NOT_ADMITTED`: no unique execution workspace revision, `package-lock.json` is unbound, installed TypeScript 5.9.3 is not environment-qualified, and diagnostic-to-candidate-snapshot/ordinal binding is absent. Temporary config was removed. Focused DAG/output/replay tests passed 3 files / 8 tests; no model or datastore writes. Git commits containing the config predate the policy files; do not confuse commit IDs with the DB workspace revisions that bind both source and config.
      In-memory repair-recommendation check (2026-10-21): made a disposable sibling copy of the failing test, added zero-valued entries for `LOCATE`, `UNDERSTAND`, `VALIDATE`, `RECOVER` while preserving `TRACE=0.7` and `REPAIR=0.2`, and ran only that copy through Vitest. All 5/5 tests passed. The copy was deleted in `finally`; original tracked test remains unchanged. This validates the proposed test-fixture repair behavior only, not a source change, rank score, packet schema, or admission.
      Canonical chunk lookup: a `REPEATABLE READ READ ONLY` query found 4 `codebase_chunk_index` rows matching the exact target `file_content_hash` (lines 1–26, 23–40, 38–56, 52–64); every row has NULL workspace/source/representation revisions. No candidate snapshot/ordinal binding was found. These rows are not eligible ACE evidence; transaction rolled back.
      Packet-lineage follow-up: querying `atlas_packet_chunk_lineage` by those four chunk-row UUIDs and the exact source path returned 0 rows; no existing lineage bridge qualifies them. Read-only transaction rolled back.
      Follow-up: the admitted snapshot manifest contains hashes but no retrievable source bytes, and all 10 historical warning-file digests were absent from reachable Git history. Replaying the old source cohort locally is not supported by the available artifacts; obtain a newly authorized frozen source snapshot/binding for the actual diagnostic run rather than reconstructing or relabeling it.

- [ ] **R05** Compile the repair DAG and ContextManifest.
      Evidence: a deterministic, bounded prompt with a checksum. The same inputs produce the same bytes.
      Focused contract recheck (2026-10-21): `npx vitest run src/lib/server/atlas/evals/dspy-repair-output-v1.test.ts src/lib/server/atlas/agentic/contracts/agentic-dag-synthesis-v1.spec.ts src/lib/server/ace/agentic-repair-context-replay.spec.ts` passed 3 files / 8 tests. This validates the isolated output guard, DAG synthesis contract, and repair-context replay fixtures only; it does not build a real admitted ContextManifest, invoke the DSPy RPC, or prove a live repair slice. R05 remains open.
      Additional isolated contract recheck (2026-10-21): with `vitest.lane-contracts.config.ts`, `context-manifest-v2.spec.ts` passed 6/6, `context-manifest-prompt-plan-v1.spec.ts` passed 4/4, `ace-context-prompt-plan-bridge-v1.spec.ts` passed 5/5, and `ace-context-manifest-admission-v1.spec.ts` passed 12/12 (27/27 total). The default Vitest configuration stalled after startup for these suites; the lane-contract config completed. This proves helper/schema behavior only, not an admitted current-source manifest, live MCP/DSPy call, or end-to-end repair. R05 remains open.
      MCP parameter discovery (2026-10-21): schema-only stdio `initialize` + `tools/list` against `atlas-tools` returned 10 tool schemas; receipt `.tmp/atlas/agentic-diagnostic-repair/mcp-atlas-tools-list-receipt.json` (SHA-256 `703bc8682e4c530809ce8f46879e7a3e1210b8730ec85e0c52ee608f47428c6c`). Zero `tools/call` requests, zero datastore calls. Required args are exposed for `classify_intent`, `build_agentic_rag_context`, and `build_recommendation`; `record_outcome` is mutating and was not invoked. This does not satisfy live retrieval/DSPy/ContextManifest proof; R05 remains open.
      Follow-up local stdio probe: fetched the same 10 tool schemas, checked required argument keys, and invoked only pure `classify_intent` then `build_recommendation`; classifier output was passed through (`repair` / `retrieval` / `ace-pipeline`). Both returned successfully. No live retrieval, DSPy, ContextManifest, outcome recorder, or writes. The classifier domain is heuristic, not canonical. Focused Vitest rerun passed 3 files / 8 tests. This advances parameter-to-advisory plumbing only; R04/R05 remain incomplete because execution revision/toolchain, candidate ordinal, and admitted manifest are unresolved.
      Local `atlas-tools-mcp.mjs` now compiles the same schemas returned by `tools/list` and rejects invalid `tools/call` arguments before dispatch. `node --test scripts/mcp/atlas-tools-mcp.test.mjs` passed 37/37, including missing required fields, unexpected fields, valid empty args where `required=[]`, and refusal of malformed `record_outcome` before its handler. This validates the local server's argument boundary only; it does not grant permission, establish source evidence, or complete DSPy/ContextManifest admission. R05 remains open.
      Stdio protocol smoke with `ATLAS_TOOLS_MOCK=1`: initialize succeeded; tools/list returned 10 schemas; empty arguments for `classify_intent` were rejected; valid `prompt` arguments returned an advisory result. Receipt `.tmp/atlas/agentic-diagnostic-repair/r05-atlas-tools-stdio-schema-enforcement.json` (SHA-256 `39cb0aeefd0e716d46d69564ef77022d78536e6c20f7812ebd9ac779cd85f0ed`). Combined MCP and compute-admission suites passed 38/38. No retrieval, model, mutation, or datastore write. This is mock transport proof, not live evidence/DSPy/ACE integration.
      Scoped flow proof score (single TS2345 advisory; not repository-wide): 0% raw / 0% headline, with C1's missing unique frozen run limiting the headline to at most 10%. No full checkpoint has same-run evidence; component tests and local pure MCP calls remain component evidence only. See `docs/reports/agentic-diagnostic-repair/r04-single-case-read-only-vertical-slice-2026-10-21.md` for C0-C10 status and blockers.
      Parameter rule: `tools/list` with protocol `params: {}` retrieves argument schemas; a `tools/call` with `arguments: {}` is valid only if that tool schema allows empty input. No empty-input call was made.
      Mock pure-helper sequence: `classify_intent` returned `repair/frontend`; its actual returned intent/domain were passed to `build_recommendation` with grounded diagnostic evidence and no patch targets. Receipt: `.tmp/atlas/agentic-diagnostic-repair/r04-mcp-advisory-recommendation-mock.json`. No tools advertise `outputSchema`; `frontend` is not established as an approved canonical domain, and the suggested checker command is generic. No retrieval/model/outcome or datastore call. This demonstrates MCP argument flow to an untyped advisory only, not DSPy, ACE JSON packet creation, or ContextManifest admission.
      Live retrieval recheck: the actual local stdio `tools/call` for `build_agentic_rag_context` was schema-valid but returned `LIVE_RETRIEVAL_UNAVAILABLE` / `TRACE_EMPTY_RESPONSE` twice; zero cards, no fallback, no writes. TRACE health was green, but live `atlas.query`/`atlas.packet_search` remains unproven. Do not pass the helper's candidate `promptPacket` to DSPy/model; the source marks candidates unadmitted and `proofUsable=false`, and no source revision is available. `build_recommendation` is deterministic formatting, not DSPy. RPC identity review: UUIDv5-shaped `packet_key`, UUIDv7 `rpcCallId`, semantic `titleId`; `deriveUUID` is separate UUIDv8. This review does not resolve R04/R05 blockers or establish ContextManifest/DSPy/ACE injection.
      Transport isolation: direct TRACE `tools/list` succeeded (HTTP 200, 142,026-byte SSE); `runtime.sse_probe` succeeded in 185 ms; direct `atlas.query` returned HTTP 200 with an empty SSE body after about 6 seconds. Source contains a 5-second post-`handleRequest` response-finish wait before closing the stateless server/transport, while `atlas.query` awaits embedding, reranking, and Postgres join-back. The response wait now uses the bounded `MCP_RESPONSE_FINISH_TIMEOUT_MS=15000` helper; its finish/close/timeout tests pass 4/4, and `npm run check` reports 0 errors/0 warnings. This addresses the likely server cutoff, not proof of root cause. The live process was not restarted; live retrieval remains open, as does matching the upstream 12-second caller deadline and queue behavior.

- [ ] **R06** Implement the recommendation baseline.
      Evidence: ranked strategies from a deterministic heuristic or an XGBoost baseline. Features: exact symbol match,
      AST neighbourhood, dependency impact, diagnostic match, historical repair that passed validation, patch cost,
      revision confidence, and regression risk. A low-rank scorer `s(e,r) = (Ue)ᵀ(Vr) + wᵀx(e,r)` is a later challenger,
      evaluated on held-out repair tasks. It is not required for the first loop.
      Establish a deterministic CPU keyword/symbol baseline first. For per-language top-10 symbols, rank only
      revision-qualified `atlas_symbol_versions` joined to `atlas_symbol_registry`; report parser coverage and ties,
      and keep the list advisory. Reuse the existing indexed registry/version tables and `packet_ast_keyword_features`
      where their provenance contract fits; do not add a lookup table unless an `EXPLAIN (ANALYZE, BUFFERS)` benchmark
      shows the existing query is a bottleneck. XGBoost and PyTorch are separate challengers and must consume the same
      frozen row IDs, feature order/schema, splits, and labels before comparing CPU/GPU parity or ranking quality.
      LangExtract may propose grounded terms/spans, but is not required for keyword ranking and cannot author labels or
      symbol identity; validate every proposed span against frozen source bytes.

      **Package and language alignment gates (advisory until admitted):**
      - Treat the local npm cheat sheets and package-surface map as inventory inputs only. They cover a subset of
        installed packages and remain `EXTRACTED_UNVERIFIED`; bind every future usage example to the installed package
        version, exported symbol, source/documentation checksum, and a focused test before indexing it for retrieval.
        Do not describe package import counts as runtime usage or package guidance as authoritative documentation.
      - Build a language capability ledger from explicit sources: installed grammar manifest/version, extension aliases,
        parser/provider, AST node coverage, compiler/LSP lane, fixture result, and source revision. “140+ languages” is
        a coverage target, not a supported-language claim. Keep grammar-present, parser-tested, compiler-validated,
        and production-wired as separate statuses; unknown/unsupported languages abstain.
      - Align `package.json`, Python requirements, and the RAPIDS Conda YAML by existing owner and execution environment.
        Do not duplicate Torch/XGBoost/PyArrow/LangExtract dependencies across environments or add `jq`/`yq` as runtime
        dependencies without a tracked consumer. JSON/YAML parsing and validation must use the existing schema owners.
        The current Windows shell has `jq` but no `yq`; this is an operator-tool observation, not a package prerequisite.
      - Produce a derived inverse index `package or language -> files -> symbols -> source/workspace revisions` with
        deterministic ordering, deduplication, per-row provenance, and a checksum. It is a rebuildable local artifact,
        not a new canonical registry or database table. Keep candidate ordinals joined to canonical IDs through the
        existing resolver; never infer identity from a LUT, hash bucket, embedding, or file path.
      - For DAG/KAG synthesis, form a dry-run plan from qualified symbol/dependency edges and admitted package evidence.
        Validate required fields, exact revisions, edge types, authorization, idempotency key and request digest before
        proposing persistence. Do not run an upsert or populate canonical tables from package sheets, parser catalogs,
        LangExtract output, or unqualified graph edges. Existing execution journal and packet/projection outbox owners
        remain separate; PostgreSQL AIO/bitmap plans are query execution choices, not an application lookup table.
      - Retrieval/reindexing remains a distinct stage: freeze corpus and source revisions, run a lexical/symbol baseline,
        evaluate each reranker pass on identical candidate IDs and held-out reviewed labels, then emit a bounded reindex
        plan with expected inserts/updates/skips and checksums. Reindex/apply requires its existing owner, explicit
        authorization, and independent readback; no cache warming or projection writes are part of this task.
      - Environment check: `python/tests/test_language_catalog_v1.py` is present, but the current Windows Python 3.14
        lacks `pytest`; no npm alias or dependency was added because the intended Python test environment must be
        established first. Keep the language catalog at candidate status until that test and real grammar fixtures run.

- [ ] **R07** Probe Ornith and llama-server compatibility.
      Evidence: the loaded model identity, its context length, quantization, chat template, schema-constrained JSON
      output, and tool-call behaviour. Ornith 1.0 proof does not establish these for 1.5. Re-check live on `:8090`.
      Partial read-only proof (2026-10-21): `/health`, `/props`, `/v1/models` identify `ornith-1.5-9b`, default loaded
      context 65,536, reported training context 262,144, GGUF, 8,953,803,264 parameters, and template-advertised tool
      call support; quantization is not reported. DSPy 3.4.1 in the designated experiment venv constructs the existing
      `Predict(ComposeAcePacketProposal)` without an LM call. Receipt `.tmp/atlas/agentic-diagnostic-repair/r07-ornith-dspy-readonly-probe-v4.json`
      (SHA-256 `79f01533c02ffb4c4e885242e1f49df4cae05e1888d0cabc83c2a521d39b5cce`). No prompt, generation, actual tool
      execution, or ContextManifest was used. R07 remains open for permitted schema-constrained generation/tool-call
      behavior tests and quantization identification.

- [ ] **R08** Generate and verify the first isolated patch.
      Evidence: before and after diagnostics, and a targeted test receipt. Ornith proposes a minimal unified diff or
      structured edits in a separate step, so the proposal and the edit can be audited apart.

- [ ] **R09** Build the canonical coding-agent handoff.
      Evidence: one repair packet for Codex, Claude Code and Antigravity. Fields: diagnostic IDs with exact tool output and
      reproduction command; repository commit, workspace revision and source hashes; exact AST and source evidence with
      the dependency neighbourhood; ranked strategies and an optional Ornith diff; file allowlist and change budget;
      required tests and expected diagnostic reduction; and a machine-readable completion receipt. Adapters may format
      fields, but must not drop constraints or invent evidence.

- [ ] **R10** Evaluate 20–50 representative repair tasks.
      Cohort: a mix of Svelte component type errors, TypeScript contract errors, and dependency-related failures.
      Compare a direct coding-agent repair with a DAG-prefill-assisted repair on comparable tasks, under the same gates.
      Measure: verified diagnostic reduction, regression-free repair rate, changed lines, token cost, latency, escalation
      rate. Do not reward a repair merely for making the checker quiet.

## Proposal schema (for R07 and R08)

`atlas.repair-proposal.v1`: `diagnosticIds`, `rootCause`, `evidenceRefs`, `candidateFiles`, `repairStrategy`,
`confidence` (proposal score), `requiresHumanApproval` (true by default).

## Not in this change

- Writes to Postgres, Redis, Qdrant or Neo4j. Repair receipts are files.
- Auto-applying patches to the main worktree. PATCH-01 works in an isolated workspace only.
- Ontology tuple resolution as a prerequisite.
- Bulk fixing of the existing source diagnostics.

## Handoff (2026-10-21)

Verified facts (read from `package.json` and the scripts):
- `npm run check` = `svelte-check --tsconfig ./tsconfig.json`. R01 ran `npx svelte-check --output machine` with no
  `--tsconfig`, so R01 is not the project's own command. It must be re-run before R04 relies on it.
- `npm run check:logged:agentic` = `node scripts/svelte-check-capture.mjs --enhance --mcp-enrich`. This is the existing
  capture and MCP-enrichment path. Use it for R09 rather than building a second one (one-owner rule). Read its header
  first to confirm what enrichment it adds.
- `npm run dev:gpu` = `node scripts/startup/dev-gpu-runtime.mjs`. svelte-check is static and does not need the dev server.
  Do not start `dev:gpu` for repair checks unless a model step needs it. Check the GPU and `:8090` state first.
- TRACE MCP (`:8788`) was reported UP earlier and SvelteKit DOWN. Re-verify with the trace-mcp tooling skill before any
  step that depends on MCP.

Next steps (each writes a receipt under `docs/reports/agentic-diagnostic-repair/`):
1. Re-run R01 with the project's command (`npm run check -- --output machine`), twice. Record the mismatch with the old
   receipt. Evidence: `r01b-svelte-check-baseline.json`.
2. R04: for each cluster RC-01 to RC-04, read the exact source span (not retrieval) and confirm or reject the hypothesis.
   Evidence: one verdict per cluster, each with file:line.
3. Use `check:logged:agentic` output as MCP-enriched evidence only after step 2 has verified the source.
4. R05: build the ContextManifest from R04-verified evidence only. Reject anything unverified.
5. R07: probe the model actually loaded on `:8090` (identity, context, chat template, JSON output). Do not assume it.
6. Parent Atlas tracking: each step writes its receipt, and each repair task is one compact ACE JSON packet with
   `diagnosticIds`, `evidenceRefs`, `verdict`, and `receiptPath`. The packet schema is defined in R05, not before.

Design principles (from the review notes; not implemented, and not evidence):
- Learned components are challengers: an MLP, a low-rank scorer, MCTS or AlphaGo-style search, and a GAN validator.
  Supervised ground truth is human-reviewed labels only. Unreviewed proposals stay out of training.
- A 4,096-unit hidden layer is a feature transform, not 4,096 labels. The output size is the chosen taxonomy (15 or 21
  classes). Compare any MLP against a heuristic or XGBoost baseline before adopting it.
- Separate the decision policy from the environment state. The repair DAG is the state machine. A policy chooses among
  candidate actions, and the gates decide. A chosen action is never proof that it is correct.
- MCTS or self-play is for searching repair candidates only. Its reward must be verified diagnostic reduction plus
  passing tests, never "the checker is quiet".
- "140 languages" is an unverified count. Do not state it as fact. A per-language inventory needs a sourced list first.

Deferred, each as its own proposal after R06: MLP training, low-rank scorer, MCTS, GAN validation, the per-language audit,
and the binary, bytea, CUDA and ABI notes.

## Proposal: OpenSpec progress XP tracker (not implemented; not evidence)

Idea: award progress points (XP) for OpenSpec task completions, tied to the NES-LUT-indexed prompts that were used.
Contract delta: `specs/agentic-diagnostic-repair/spec.md` now defines complete-baseline, explainable-ranking,
review-only handoff, and receipt-derived XP requirements. Strict OpenSpec validation passes. This does not implement
an XP tracker or authorize source/model/store mutations.
Gates before any XP counts:
- XP is awarded only for a receipt that exists and verifies (R01 to R10 style), never for a model's claim of success.
- Each award references the task ID, receipt path, and the NES LUT entry, so it can be audited.
- XP is a progress indicator. It must not feed back into repair ranking or into ground-truth labels.

Research-name check (repo search, 2026-10-21):
- "Kimi 3" architecture: no references in the repo. Hits for "kimi" are unrelated (agent-name lists, index entries).
- "Titans 2.0": mentioned only as a research lane in `docs/architecture/ACP-GEMMA4-MEMORY-HIERARCHY.md`,
  `docs/master_feature_todo_1011.md` and `docs/reports/pipeline-comprehensive-report-20261019.md`. Not implemented.
- "MISRA": no references (hits are unrelated strings). Relevant only to the C/C++ native addon, if at all.
These names must not be used as design inputs until a source is added to the repo.

## Exclude audit (tsconfig.json, one pattern at a time)

Why: `npm run check` skips every file matched by `exclude`, so a "0 errors" baseline covers only what is not excluded.
The resolved config (`tsc --showConfig`) has 40 patterns. Each task below does the same four steps:
1. Count the files the pattern matches, and list a sample.
2. Check whether any matched file is imported by live code (`rg` for the import path). Dead or archived matches are
   candidates for removal, not for checking.
3. Run svelte-check with only this pattern removed (scratch tsconfig, no edit to the real one). Record new diagnostics.
4. Decide keep, narrow, or remove, with a receipt under `docs/reports/agentic-diagnostic-repair/exclude-audit/`.
Do not change the real `tsconfig.json` in this change. Each decision is applied in its own change with a before-and-after count.

Priority: `src/**` patterns first, since they can hide live code. Archive and backup patterns are checked last.

### Source-tree patterns (highest priority)
- [ ] **EX-01** `src/proto/**` (generated protobuf code?)
- [ ] **EX-02** `src/grpc/**`
- [ ] **EX-03** `src/flatbuf/**`
- [ ] **EX-04** `src/wasm/**`
- [ ] **EX-05** `src/**/*.js` (JavaScript files inside `src`; check for JS that should be typed or checked)
- [ ] **EX-06** `src/tests/**`
- [ ] **EX-07** `src/stories/**`
- [ ] **EX-08** `src/lib/_archive/**`
- [ ] **EX-09** `src/archived/**`
- [ ] **EX-10** `src/**/_disabled/**`
- [ ] **EX-11** `src/**/_yorha_legacy/**`
- [ ] **EX-12** `src/**/*.bak.*`

### Test, worker, and service-worker patterns
- [ ] **EX-13** `**/*.test.ts`
- [ ] **EX-14** `**/*.spec.ts`
- [ ] **EX-15** `**/*.stories.ts`
- [ ] **EX-16** `**/*.worker.ts` (web workers; these may be live code)
- [ ] **EX-17** `**/*.sw.ts`
- [ ] **EX-18** `**/service-worker.ts` (live service worker; check the registration path)

### Archive, backup, and build patterns
- [ ] **EX-19** `node_modules` and `**/node_modules/**` (both; expected empty)
- [ ] **EX-20** `build`
- [ ] **EX-21** `.svelte-kit` (generated; expected empty)
- [ ] **EX-22** `.svelte-check-tmp/**`
- [ ] **EX-23** `../.rag-metrics/**` (outside the project root; check whether it is reachable at all)
- [ ] **EX-24** `archives/**`
- [ ] **EX-25** `**/_archive/**`
- [ ] **EX-26** `src_fixed/**`
- [ ] **EX-27** `.phase72-backups/**`
- [ ] **EX-28** `.codemod-backups/**`
- [ ] **EX-29** `.svelte5-fix-backups/**`
- [ ] **EX-30** `backups/**`
- [ ] **EX-31** `agentic-error-resolution/fixed/**`
- [ ] **EX-32** `scripts/phase104-backups/**`
- [ ] **EX-33** `scripts/backup-consolidation/**`
- [ ] **EX-34** `reports/backups-*/**`
- [ ] **EX-35** `**/*.*backup*`
- [ ] **EX-36** `**/*.*bak*`
- [ ] **EX-37** `**/*.corruption-backup`
- [ ] **EX-38** `**/*.replaced`
- [ ] **EX-39** `**/*.any-backup`

Note: EX-35 and EX-36 are broad globs (`*backup*`, `*bak*`). They can match real source names, so check each match.
Coverage: `tsc --showConfig` lists 40 patterns. EX-19 covers two of them (`node_modules` and `**/node_modules/**`),
so the 39 tasks cover all 40 patterns.
