# Parent Atlas — Phases 1–20 Master To-Do (2026-10-15)

**Status:** Consolidated ledger, not a completion claim. Built from the verified ledgers listed in Sources. Anything not checked this pass is marked `NOT_VERIFIED`. This is not a file-by-file review of the whole repository.

**Rules that apply to every row**
- A passing test, an existing file, a checked OpenSpec task, or a healthy service does not prove a phase.
- `source_revision` work is deferred until after P20 (operator decision, 2026-10-15; see CLAUDE.md).
- Phase numbers here are canonical workstation phases (P11–P25) or legacy rows (1–24). They are separate namespaces. Do not transfer status by number.

## Sources used

| Source | Used for |
|---|---|
| `parent-atlas-workstation-todo.md` (canonical index, sequencing map) | P11–P30 owners and boundaries |
| `docs/parent-atlas-workstation-todo.md` (2026-10-15 audit) | Legacy rows 1–24 status |
| `openspec/changes/parent-atlas-adaptive-backprop-hll-monitoring/tasks.md` | Phases 0–10, post-P20 backlog PX-01–PX-07 |
| `openspec/changes/parent-atlas-chunk-index-whole-file-hash/tasks.md` | ATLAS-SOURCE-REVISION-01 status |
| Kanban (`kanban_tasks`) | 166 tasks: 6 done, 160 pending (read 2026-10-15) |
| openspec | 109 change directories, 93 `parent-atlas-*` |

## Canonical phases P1–P20

Legacy rows 1–10 have no authoritative ledger (`NOT_VERIFIED`). The canonical index starts at P11.

| Phase | Owner | Status (source) | Remaining gate |
|---|---|---|---|
| P1–P10 | none found | `NOT_VERIFIED` | Locate owning change and receipts for each |
| P11 experience and memory | agentic run receipt binding; ACE RLM BitFrost | `PARTIAL / STALE PROJECTION` | Revalidate against owning OpenSpec |
| P12 source, revision, chunk authority | retrieval lineage DAG convergence | `PARTIAL` (1 source fully proven; 14,564/24,456 bound) | Post-P20 revision work; 1,086 nested gaps; 64 strict-check failures |
| P13 feature registry | candidate feature execution fabric | `PARTIAL` (0 eligible training candidates reported, not re-verified) | Eligible candidates without revision claims |
| P14 exact context cache | ACE BitFrost cache correctness | `IMPLEMENTED_BOUNDED` | Live wiring and measurement |
| P15 semantic retrieval, single fusion | retrieval fusion reachability | Owner exists | One fusion vote per lane, proven |
| P16 graph, KAG, ontology | retrieval lineage DAG; LOD taxonomy | `BLOCKED_CURRENT_GRAPH_BINDING`; PageRank authority not admissible (2 distinct scores, containment-only edges) | Admissible snapshot with reference edges |
| P17 NLP, structural facts, feature assembly | governed compute; candidate execution | `SCAFFOLD_ONLY` (no receipt-backed rows) | Receipt-backed assembly |
| P18 learned reranking evaluation | best-fit score fabric | `SCAFFOLD_ONLY`; 49 reviewed rows vs 200 trust floor | Reviewed labels, grouped held-out evaluation |
| P19 deterministic policy baseline | candidate execution; governed compute | `OPERATIONAL / OUTCOME PROOF OPEN` (443 loop rows) | Bind outcomes to replay and canonical ids |
| P20 program and workflow contracts | governed compute fabric | `OPERATIONAL / HARDENING OPEN`; currently gates P12 revision work | Hardening; contracts proven |

## Name-to-phase crosswalk

| Name | Canonical phase | Source |
|---|---|---|
| Engram memory and synthesis runtime (Ornith 1.5) | P11 experience and memory | canonical index; legacy row numbering remains separate |
| Graph, PageRank, Neo4j | P16 graph, KAG, ontology | canonical index |
| PyTorch / LibTorch numeric feature assembly, GPU ABI | P17 NLP and numeric feature assembly | canonical index |
| XGBoost reranker | P18 learned reranking evaluation | canonical index; not P16 |
| DSPy program contracts | P20 | canonical index |

Legacy labels (1–24) are not these canonical phases. Do not transfer status between them.

## Canonical phases P21–P25 (sequenced after P20)

| Phase | Status | Note |
|---|---|---|
| P21 reflective optimization (GEPA) | `EVAL_GATED` | Needs adversarial and tensor evaluation |
| P22 learned-policy research | `UNSPECIFIED` in legacy table | Separate lane, no crosswalk |
| P23 transport validation | Separate lane | Not the legacy row 23 |
| P24 GPU/vector residency | Derived execution lane | PARTIAL: the later read-only Function Registry replay resolves exact packet/chunk lineage and one candidate survives SearchRuntime through final Top-K. ContextManifest admission remains false because the live feature-profile readback has no row-level `feature_revision` and semantic/graph supplements are unqualified. This is not GPU-residency proof. |
| P25 PPO | Eval-only, not graded | No promotion implied |

## Cross-cutting tracks

| Track | State (verified) | Remaining |
|---|---|---|
| Kanban board | 166 tasks, 6 done, 160 pending; `repair-registry` IDs made deterministic; done-guard added; writer rollback proof replayed as SQL | Run the writer through the real TypeScript function; dedupe the migrated 3,313-line feed (143 distinct ids) |
| OpenSpec | 109 change dirs; adaptive-backprop change holds Phases 0–10 and PX-01–PX-07; chunk-index ledger holds ATLAS-SOURCE-REVISION-01 | Strict OpenSpec validation of edited changes; `NOT_VERIFIED` for the rest |
| Workboard / sequencing | Gate-sequencing map in workstation to-do | P12 vs P20 numbering conflict needs a decision |
| Production hardening | Typecheck passes (0 errors, last run); langgraph and function-registry specs pass | `NOT_VERIFIED` for full test suite; GPU embedding runs on CPU despite `EMBEDDING_REQUIRE_GPU=true` |
| Agentic plugins | Synthesis proof: LangExtract native pass, citation verifier fail-closed (8 unit cases) | Canonical prompt owner (`buildACEPromptCached`) not wired; grounding nondeterministic |
| npm build | `NOT_VERIFIED` this pass | Run build and check after the edits to `model-contracts.ts` and `repair-*` |
| Desktop app | `NOT_VERIFIED` | No evidence reviewed |
| Legal-AI SvelteKit 2 app | Typecheck passes; Svelte 5 rules apply (CLAUDE.md) | `NOT_VERIFIED` for runtime and route health |

## Open decisions

1. Resolve the P12 vs P20 numbering conflict (defer P12 in place, or renumber).
2. Authorize or refuse the five-row chunk apply. Deferred until after P20 by operator decision.
3. Choose the PageRank source (NetworkX/cuGraph) and provide reference edges.
4. Decide whether `EMBEDDING_REQUIRE_GPU=true` stays, since `:8097` runs on CPU.
5. Approve Valkey eviction-policy persistence and Langfuse secret rotation (both restart or change live services).

## Known inaccuracies in earlier notes

- The 14,628 bridge count omitted canonical packet revision checks; the stricter count is 14,564.
- The P12 cohort totals (25,542; 22,532 exact) were not found in any P12 receipt. Do not cite them.
- The May 19 execution checklist in `docs/session-notes/` predates the current evidence. Do not use it for status.

## Not yet covered (to complete in a follow-up session)

- [ ] **P1–P10:** find the owning OpenSpec change and receipts for each phase; score each only from its own evidence.
- [ ] **P11, P13, P17, P18, P19:** revalidate against owning OpenSpec; replace `SCAFFOLD_ONLY` and `STALE` labels with receipt-backed status.
- [ ] **P12 numbering:** decide whether P12 is deferred in place or renumbered; then update the sequencing map.
- [ ] **npm build:** run the production build in `sveltekit-frontend`, record the command, exit code, and output summary.
  - Commands confirmed (2026-10-15, read-only): `build` = `vite build`; `test` = `vitest` (no `test:run` script); `check` = `svelte-check --tsconfig ./tsconfig.json`. `node_modules` present. Not yet run.
- [ ] **Full test suite:** run the test command, record counts and failures, and triage each failure (none are assumed passing).
- [ ] **Kanban writer:** run `repair-loop.ts` upsert through the real TypeScript function in a rollback-only transaction; confirm deterministic IDs and the done-guard.
- [ ] **Kanban feed dedupe:** resolve the 3,313-line migrated feed (143 distinct ids) before any recurring writer runs.
- [ ] **OpenSpec validation:** run strict validation on each edited change (`adaptive-backprop-hll-monitoring`, `chunk-index-whole-file-hash`, and the others edited this session).
- [ ] **Desktop app:** identify the build target, run it, and record launch evidence.
- [ ] **Legal-AI SvelteKit app runtime:** start the dev server, load core routes, check console errors on each (no route is assumed healthy).
- [ ] **Agentic plugins:** verify each plugin's registration and the MCP tool counts against the live server, not the docs.
- [ ] **Canonical prompt owner:** route the synthesis proof through `buildACEPromptCached` (or record why not).
- [ ] **Grounding stability:** run the synthesis proof enough times to measure citation rejection rate.
- [ ] **GPU embedding:** resolve the `EMBEDDING_REQUIRE_GPU=true` vs CPU mismatch on `:8097`.
- [ ] **Runtime names:** use Ornith 1.5 for active synthesis/tool use and EmbeddingGemma for semantic embeddings; retain Gemma4 only where it names an actual WebGPU assistant/model-family artifact. Reconcile old references without changing historical evidence.
- [ ] **Source revision (after P20):** chunk apply, backfill, and propagation per the deferral rule.
- [ ] **Operator decisions:** Valkey eviction-policy persistence, Langfuse secret rotation, PageRank authority source.

## Legacy labels 1–24 (from the master feature to-dos)

Sources: `docs/reports/sessions/MASTER-FEATURE-TODO-2026-05-20.md` and `docs/master_feature_todo_1011.md`. These labels use their own numbering. The 1011 audit marks 19–24 as `NAMESPACE_CONFLICT`: the same number is used by different roadmaps. Do not transfer status to the canonical P-numbers above.

| Legacy label | Status in source | Remaining (from source) |
|---|---|---|
| Phase 1 | Contract done (unified Zod labeling schema); runtime blocker verified 2026-05-21 | Confirm runtime blocker still clear |
| Phase 4 | Bifrost warmup, in progress (`[/]`) | Finish warmup and measure |
| Phase 10–16 | Retrieval-loop and ML lane items; several checked, some with `RUNTIME_BLOCKED` | Re-verify blocked items |
| Phase 17 | Feature extractor upgraded; 35%, `SCAFFOLD_ONLY` | Admit `FeatureRowV1`, labels, held-out evaluation |
| Phase 18 | XGBoost reranker upgraded; 40%, `SCAFFOLD_ONLY` | Reviewed labels and grouped evaluation (trust floor not met) |
| Phase 19 | Lane-completion hook implemented; 443 rows, `OPERATIONAL` | Population only; outcome proof still open |
| Phase 20 | A6000 training lane (LLM tagging, Unsloth, LoRA, export) not started | Offline-only lane; not a startup dependency |
| Phase 21 | 75%, `EVAL_GATED` | Replay, cache, and degradation receipts are cited but not promotion proof |
| Phase 22 | XGBoost/RL experiments, `NAMESPACE_CONFLICT` | Later lane; keep distinct from Phase 18 |
| Phase 23 | QLoRA/SFT (eval-only); edge model `static/models/gemma4-e2b/` `MODEL_MISSING`; REAP in `docs/experiments/phase23-reap-cerebras-quantization.md` | Obtain and verify the edge artifact before any run |
| Phase 24 | DPO eval-only; Ornith/Titans research topics share the number but not the lane | No training run recorded |

Rollup items still open in the May master (from its "Phase 1-20 rollup gaps"): H4 write-enabled benchmark and FP16 comparison; deep Drizzle audit after archiving; parent-atlas refresh from the production-ready feature list.

## Audit: consolidation, supersession, skills, MCP, GAN validation (started 2026-10-15)

Verified counts so far (read-only):
- `.claude/skills/`: 14 skill directories.
- `.opencode/skills/`: 10 skill directories (`mcp-toolchain`, `metadata-context-analysis`, `openspec-*`, `openwiki`, `rg-atlas`, `trace-mcp-tooling`).

### Read-only reconciliation (2026-10-15)

- Skill overlap: 7 names are shared across Claude/OpenCode. Four `SKILL.md` files are byte-identical (`metadata-context-analysis`, `openspec-archive-change`, `openspec-sync-specs`, `trace-mcp-tooling`). Three OpenSpec skills differ only in command examples/entrypoint spelling in the inspected diffs (`openspec-apply-change`, `openspec-explore`, `openspec-propose`). This is duplication/drift, not evidence that either copy is superseded; no files were archived or changed. Claude-only `validating-parent-atlas` and `atlas-tools-mcp`, and OpenCode-only `mcp-toolchain`, are distinct roles pending caller/permission review.
- Skill loader/caller evidence: OpenCode config and `sveltekit-frontend/tests/opencode-mcp-config.spec.ts` explicitly reference the OpenCode MCP skills/agents; the Claude local settings reference `trace-mcp-tooling`. These prove configured references, not that live MCP tools are reachable. The Claude `atlas-tools-mcp` skill itself documents `record_outcome` as a write; do not treat that skill as uniformly read-only. No skill was deemed superseded.
- GAN filename census: a broad case-insensitive `gan` substring finds 21 files, including incidental matches such as `feature-organization-planner.mjs` and `organize-rg-search-transcripts.mjs`. A token/suffix-based inventory finds 12 GAN-named files (including tests, adapters, and `devops-smoke-gan.mjs`) plus 7 separate `agentic-toolgan-*` family files. The earlier “17 scripts” count is not reproducible under these explicit scopes. These counts do not show which scripts are active or superseded.
- MCP source census (TypeScript AST, 2026-10-15): scanned 47 non-test TS/JS files under `sveltekit-frontend/src/mcp`; found direct registration calls in 20 files, 201 call sites (194 `registerTool`, 7 `tool`). All 201 have an attached schema argument/property in source. This is presence/wiring-shape evidence, not semantic schema validity. The previous “24 registry files” count is not reproducible. The existing parity report covers only `server.ts` and `trace-mcp-server.ts`; it lists 85 tools in the former and 120 registrations in the latter, while current source AST reports 123 trace registrations. That receipt is stale and does not prove complete or live parity.
- Runtime/schema validation: NOT_RUN. No MCP server was started or called, no live tool schemas were fetched, and no validator with unreviewed side effects was executed. Existing `docs/reports/parent-atlas-mcp-tool-registry-parity.json` is static historical evidence only.
- Focused MCP tests: `npx vitest run tests/atlas/atlas-tool-registry.test.ts src/mcp/atlas-semantic-domain-registry.spec.ts src/lib/server/retrieval/mcp-tool-registry-types-v1.spec.ts` → 3 files / 17 tests passed. These cover selected contracts, not all 201 registrations or live server schemas; the semantic-domain spec printed a DB target but the test run itself is not treated as live database proof.
- OpenSpec evidence validation: `npx openspec validate parent-atlas-adaptive-backprop-hll-monitoring --strict` passed; scoped `git diff --check` passed. This validates the change artifact, not runtime or production behavior.
- Retrieval-packet architecture review: the proposal is directionally sound only when each representation stays an evidence layer. The 8095 FastAPI source exposes `/ast/chunk` with Tree-sitter signature/ancestry and byte spans; local `@ast-grep/napi` extraction is a separate provider. `createLiveStructuralLaneRetrieverV1` has no production caller found in the source search, so its contract tests do not prove an 8095 → SearchRuntime lane.
- Existing safe identity path: `packet_key` remains canonical; `title_id` is deterministic enrichment from packet key + generator version, with a human-readable slug selected from feature/symbol/domain evidence. Do not fuse AST/semantic/keyword scores into `title_id`; query-specific fusion belongs to SearchRuntime/RRF. A lookup map may be an ephemeral acceleration keyed by qualified packet identity/revision, but must not replace PostgreSQL or become identity.
- Existing transport/graph owners: `atlas.rpc-packet-registry.v1` is a lane/identity contract, not a new key-value store; ACP packet assembly and RPC contracts already exist. NetworkX already has a revision-bound read-only snapshot mirror and parity tests (`canonicalAuthority=false`, `writesPerformed=false`). Keep it downstream of the qualified graph snapshot; do not build a second graph from summaries or transport packets.
- Focused tests run: `npx vitest run src/lib/server/retrieval/adapters/live-structural-lane-provider.spec.ts src/lib/server/atlas/function-registry/function-registry-snapshot-loader-v1.spec.ts src/lib/server/ace/context/packet-assembler.test.ts` → 3 files / 8 tests passed. This is contract evidence only; the 8095 process, database lineage, actual SearchRuntime registration, and ContextManifest admission were not exercised.
- GAN validation execution: `scripts/atlas/prove-gan-adversarial-v1.mts` produced `docs/reports/gan-adversarial-proof-v1-consolidation-20261015.json`; independent JSON readback confirmed schema `atlas.gan-adversarial-proof.v1`, 16/16 adversarial probes, all five self-tests true, `canonicalAuthority=false`, `writesPerformed=false`, and all reported datastore write counters zero. The report-file SHA-256 is `716d1970bce3a5e816954bfdb05e3be38e013463cf426fc38f5066a63eaaa7f7`. This proves fixture rejection behavior only, not live corpus quality or pipeline readiness.
- GAN ownership/safety finding: package scripts expose the four `agentic-toolgan` plan/dedupe/execute/replay commands and `verify:rpc-gan`; the Tool-GAN execution wrapper defaults to NOT_EXECUTED dry-run and requires a governed receipt for apply, while outcome logging writes persistent ledgers. `prove-gan-audit-readonly-v1.mts` is a separate live DB reader that requires named receipts and writes a new report; `devops-smoke-gan.mjs` touches service health surfaces and writes reports; older provenance/Qdrant validators expose data-access/apply paths. None was run. Similar naming does not establish supersession; no script was archived.
- Proposed stage order for the live proof: source bytes + canonical packet/chunk binding → 8095 Tree-sitter observation and local AST-grep observation kept separately → normalized typed features/keywords with provenance → existing lexical/semantic/AST/graph candidate lanes → SearchRuntime single RRF/dedup → canonical identity and exact source-span hydration → ContextManifest → bounded DAG proposal/execution gates → NetworkX analysis from its own revision-qualified graph snapshot. AVX2/SIMDJSON may optimize bounded parse/transport only after profiling; it does not generate identity or accelerate semantic fusion by itself.
- 2026-10-15 ACP assembler follow-up: the no-summary `title_id` fallback now uses the existing packet-key/title-generator owner; focused regression passes 1/1. This fixes only title-label consistency. Canonical packet-key contract reconciliation, source-bound AST/keyword feature lookup, live `:8095` → SearchRuntime → ContextManifest proof, and NetworkX snapshot consumption remain open under `parent-atlas-rpc-packet-registry-fabric` tasks 7.9–7.13. No live sidecar or datastore was exercised for this fix.

Open audit tasks:
- [x] Reconcile inventory methodology: retain the explicit skill counts above; replace the ambiguous GAN and MCP counts with the scoped census in this section. Counts are inventory evidence only.
- [ ] For each skill directory, check for a duplicate or superseded skill with the same purpose across `.claude` and `.opencode`. Record the canonical owner and the superseded copy. Archive, do not delete.
- [ ] For each GAN validation script, record its owner, callers, and whether a newer script supersedes it. Archive superseded scripts with a manifest entry.
- [ ] Confirm that each MCP skill references a live tool, not a removed one.
- [ ] Reconcile schema semantics and handler wiring for the current 205 literal MCP registration call sites across 22 non-test source files plus one test. A fresh TRACE `tools/list` JSON-Schema compile pass covers 193 advertised inputs only; it does not prove handlers, source parity, or other servers.
- [ ] Wire or disqualify the live structural adapter: show its caller registration in the existing AST lane, then replay a source-bound candidate through SearchRuntime and ContextManifest. Do not infer wiring from the 8 passing contract tests.
- [ ] Keep `title_id` stable and query-independent; prove packet-key/generator-version determinism and verify AST, semantic, and keyword contributions remain retrieval features rather than identity inputs.
- [ ] Prove one complete packet → bounded DAG proposal → NetworkX snapshot consumer chain with identical packet/source/graph checksums; keep writes disabled and distinguish analytical mirror parity from production graph authority.
- [ ] Add the results as consolidation receipts in the owning OpenSpec change (not in CLAUDE.md).

### Follow-up evidence (2026-10-15)
- A bounded Python fixture also parsed through 8095 Tree-sitter into one revision-matched function chunk; receipt `docs/reports/atlas-ast-python-sidecar-observation-readonly-20261015.json`. The existing retrieval adapter still needs a dedicated Tree-sitter observation adapter for non-JS languages.
- AST extraction now fails closed for unsupported languages rather than retrying as TypeScript; LSP `javascriptreact`/`typescriptreact` IDs are explicit. Focused parser/provider tests passed 15/15; log `.tmp/atlas/ast-language-dispatch-tests-20261015.txt`.
- Live 8095 returned one source-revision-matched Tree-sitter observation with native IDs, signature, exact byte span and ancestry; receipt `docs/reports/atlas-ast-sidecar-observation-readonly-20261015.json`. This verifies parser output only—not production lane registration, SearchRuntime, or ContextManifest.
- Read-only MCP `tools/list` reached atlas-tools (10 tools) and TRACE (193 tools); no tool calls were executed. `context.prefetch_feature_context` has two source registration sites and remains an unresolved collision. Full schema/handler parity and skill-reference reconciliation remain open.
- Do not add an AST executable/helper per language now. Prefer the existing 8095 Tree-sitter provider for Python and other non-JS languages, with explicit LSP language IDs and exact source/native-identity joins; add a helper only after the existing lane contract and a measured capability gap justify it.
- AST helper audit: `helper-registry-v1.ts` already distinguishes the 8095 Tree-sitter chunker, local AST-grep, ts-morph, and LSP helpers. LSP IDs are dispatch hints, not proof that a language server ran. The diagnostic AST CLI can invoke an installed `ast-grep.exe` for supported grammars, but that executable is neither a language detector nor a live per-file service. Keep Python syntax evidence on 8095; use AST-grep only for explicitly selected structural patterns and preserve producer/span provenance. `codebase-memory-mcp` and the simdjson N-API bridge are not substitutes for language parsers or `tree_node_id` derivation. The existing DOM/CSR splitter is a separate semantic splitting experiment; qualify its real parser/source-span behavior before treating it as an AST helper.
- Svelte cross-check rerun: ten current `.svelte` source hashes matched their splitter receipts; 50 rune calls matched AST-grep with zero mismatches. The companion markup test is regex-count-only, not a second syntax parser. The run writes uniquely named temporary `.ts` and JSON receipts under `.tmp/atlas/`; outputs are diagnostic and make no canonical datastore writes. This is parser parity evidence, not source lineage, `tree_node_id`, SearchRuntime, hyperedge persistence, or ContextManifest proof.
- Active model naming: the workstation synthesis/tool-use runtime is Ornith 1.5 (`ornith-1.5-9b` per the current project contract); EmbeddingGemma remains the semantic embedding family. Gemma4 mentions in historical receipts are retained as history, not current synthesis configuration.
- Consolidation recheck (2026-10-15): skills remain 14 Claude / 10 OpenCode / 7 shared, with 4 identical shared copies and 3 syntax-only differences; no superseded copy proven. Fresh read-only MCP schema compilation passed TRACE 193/193, local offload 9/9, Atlas-tools mock 10/10, and task-kernel local facade 6/6. This initial four-surface receipt is superseded by the v2 refresh below, which also covers Engram and LDR and records TurboVec unavailable. Exact TRACE skill-name normalization, deployed agent authorization, and registry-to-handler proof remain open. GAN inventory is 12 validators/probes + 7 Tool-GAN files under `scripts/atlas`, plus three scoped scripts elsewhere; no validator ran and no supersession or archive was justified. Receipt: `docs/reports/parent-atlas-consolidation-recheck-v1-20261015.json`.

### Consolidation refresh — 2026-10-15 22:30Z
- Skill inventory is still 14 Claude / 10 OpenCode / 7 shared. Four shared files are identical and three vary only in OpenSpec command examples. No copy is proven superseded. OpenCode grants broad `trace*` to two agents; its `mcp-toolchain` agent also allows TurboVec, Engram and LangExtract prefixes, but those are not all declared in the root OpenCode MCP configuration. The frontend config is separate; live TRACE advertises 9 TRACE-, 4 Engram-, 1 TurboVec-named tools and no tool name containing `langextract`. Four-provider flow is not end-to-end proven.
- GAN inventory is 12 GAN-token files under `scripts/atlas`, 1 additional `validate-gan-tool-calls.mjs` under the frontend script tree, and 7 `agentic-toolgan` files. Legacy validators contain database proof-table insert paths; read-only audit corrects a historical source-ref-policy drift but does not establish supersession of the distinct validators. No GAN script was run or archived during this refresh.
- Fresh TRACE read-only `tools/list`: 193 unique names, no duplicates; Ajv 8.20.0 compiled 16 Draft 7 and 177 Draft 2020-12 input schemas with zero errors. Receipt `docs/reports/mcp-tool-surface-schema-validation-v1-20261015.json`, toolset SHA-256 `5024992e6d512be7d6c9355f95ad0e3452c6733f2f21914cdc55bc9aa0ea4199`. No tool calls. This is input-schema compilation only; handler behavior, all-server coverage, source parity, and runtime build identity remain open.
- Live `context.prefetch_feature_context` schema matches `new_tools.ts` and not the legacy inline TRACE declaration. The deployed build/source identity is unknown, so keep code collision reconciliation open and do not delete either definition yet.

### Consolidation verification refresh — 2026-10-15 23:23Z
- Rechecked the seven same-named skill copies across Claude/OpenCode/Codex: four byte-identical; three differ only in platform-specific OpenSpec command examples. No superseded copy is proven. The `atlas-tools-mcp` skill includes write-capable `record_outcome`; TRACE skill-name normalization remains open.
- GAN audit confirms the read-only report supersedes two historical source-ref-policy receipts only, not the three distinct `--apply`-guarded database validators. Live-packet and Tool-GAN ledger writers have local side effects; no GAN script ran or was archived. Family-wide supersession remains `NOT_VERIFIED`.
- Fresh TRACE `tools/list` returned 193 unique names and 193 schemas; Ajv compiled 16 Draft 7 and 177 Draft 2020-12 schemas with zero errors. No tool call or report write. Handler/source parity, deployed build identity, and authorization remain unproven.
- Current TRACE name reconciliation: scoped TypeScript-AST scan found 46 non-test `.ts` files under `src/mcp`, 17 with literal registrations, 191 sites / 190 unique names. 184 names overlap live TRACE; six literal source registrations are absent, and nine live names use helper/array registration (six Phase 109A, three native-acceleration). `context.prefetch_feature_context` remains duplicated in source. The September 14 disabled-tools receipt is stale for explaining current absence; do not claim the six are intentionally disabled without a fresh owner/config proof. The reported “24 registry files” count is unsupported in this defined scope.
- Receipt `docs/reports/mcp-source-live-reconciliation-20261015T232655Z.json` records source/live checksums, exact deltas, 193/193 schema compilation and limitations. Statuses: skill-copy comparison `PASS` (supersession `NOT_VERIFIED`); GAN review `PARTIAL`; live MCP list/schema `PASS`; source/runtime name parity `PARTIAL`; handler behavior/authorization `NOT_RUN`.
- Svelte rune cross-check: ten source-hash-matched components, 50 AST-grep/splitter rune matches, zero mismatches. Markup comparison is regex-count-only; scratch files and receipts are local `.tmp/atlas/` writes, not canonical datastore writes.
