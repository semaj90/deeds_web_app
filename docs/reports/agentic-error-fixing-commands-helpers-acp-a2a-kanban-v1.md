# Feature-Label Agentic Error Fixing: Repository Alignment

**Date:** 2026-11-26
**Status:** design and repository-owner audit; no production wiring or live repair proof.
**Companion proposal:** [feature-label-agentic-error-fixing-v1.yaml](../../.okf/pipelines/feature-label-agentic-error-fixing-v1.yaml)
**Authority:** proposal only. PostgreSQL 18 and the owning OpenSpec tasks remain authoritative.

## Executive readout

The repository has SearchRuntime, PostgreSQL/pgvector, a CPU ONNX embedding reference, code search, a bounded DSPy RLM bridge, error fingerprinting, Kanban DAG prefill, and ACP/A2A/MCP surfaces. The verified path still needs current workspace byte readback, a scoped PG18 evidence replay, six runtime providers, and a live verified packet handoff to Gemma. The route already has in-memory checksum validation and hydration code for admitted packets.

## What owns what

| Need | Existing owner / boundary | Current proof status |
|---|---|---|
| Query fan-out and one fusion | SvelteKit `src/lib/server/retrieval/search-runtime.ts`; executors normalize into logical lanes | Owner exists. Do not give Qdrant, Neo4j, OAK, PageRank, or GPU results a second fusion vote. |
| Dense code retrieval | `packet-dense-search.ts`; canonical vector owner is PG18 `codebase_chunk_index.content_embedding_768`; Qdrant is a projection | Prior live inventory: 274,428/274,465 vectors. This says coverage, not source qualification or citation proof. |
| AST/CST and symbols | Existing parser/LSP/AST-grep/Tree-sitter owners and `:8095` NLP/structure service | Inventory must bind parser observations to exact source revision and UTF-8 byte spans before admission. Do not rebuild indexing from scratch. |
| Embeddings | Existing EmbeddingGemma `semantic_768` CPU ONNX reference at `:8094` | Prior supplied benchmark: batch 16/32 about 13.31–13.75 texts/s. RTX/TensorRT-RTX remains NOT_INSTALLED_OR_PROVEN; preserve CPU reference. |
| NLP/extraction | `:8095` FastAPI sidecar for bounded intent/OAK/structured extraction | Treat classifications and extracted relations as proposals; verify live model/configuration before calling it an embedding or reranker. |
| RAPIDS/GPU compute | `:8098` is the proposed/existing WSL2 RAPIDS executor lane; cuVS/cuGraph/cuTile are challengers | No production dispatch should be inferred from packages or fixtures. Require live environment, lease, bounded VRAM, CPU oracle parity and receipt. |
| Error identity | `canonicalErrorJoinKeyV1` in `error-fingerprint.ts` | Existing owner; shared `errkey:<sha256>` is a join key, not a task identity. |
| Kanban DAG prefill | `kanban-dag-prefill-v1.ts` plus existing task/workflow owners | Candidate ordering only. A board card is a projection; unresolved task links remain unresolved. |
| Scoped evidence and RLM | `ace_bitfrost_caller_v1.py`, `dspy_predict_ace_recommender_v1.py` | The bounded readback/RLM contract and mock/focused tests were reported passing (16 tests). Live PG18 readback and a production RLM caller are not proven. |
| Authorization and execution route | `verified-context-runtime-v1.ts`, `mastra-agent` route, actor-workspace grant owner | Six upstream providers remain missing. The route contains packet checksum validation and hydration. Live handoff remains unproven. |
| Mutation isolation | Git worktree per repair candidate | Correct boundary for edits, tests and patch tournaments. Record worktree ID, branch, base commit and preimage digest; independently validate outside the RLM. |

### Device/runtime inventory commands

These are read-only inventory commands; they do not grant permission to release VRAM or start GPU work.

```powershell
# Windows CPU, OS and memory
Get-CimInstance Win32_Processor | Select-Object Name,NumberOfCores,NumberOfLogicalProcessors
Get-CimInstance Win32_OperatingSystem | Select-Object Caption,Version,FreePhysicalMemory

# NVIDIA device/driver/VRAM
nvidia-smi --query-gpu=name,driver_version,memory.total,memory.used,memory.free --format=csv,noheader

# WSL distributions and current Linux process/port identity
wsl --list --verbose
wsl -e bash -lc 'uname -a; cat /etc/os-release; lscpu; free -h; ss -ltnp | grep -E ":(8094|8095|8098)"'

# Current PowerShell process; for MCP requests use requestId/workspaceId instead
$PID
```

Use the existing documented `scripts/manage-llama-8090-vram.ps1 -Action status` to inspect llama-server state. Never use image-wide process termination. MCP stdio request IDs and authenticated workspace IDs identify calls/scopes; terminal PIDs identify OS processes only.

## Existing helpers and actual gaps

### Reuse first

- `sveltekit-frontend/src/lib/server/features/ai/ace/error-fingerprint.ts` — canonical runtime error join-key normalizer.
- `sveltekit-frontend/src/lib/server/atlas/kanban/kanban-dag-prefill-v1.ts` — task dependency/prefill proposal.
- `sveltekit-frontend/src/lib/server/retrieval/search-runtime.ts` — search lane normalization and sole fusion owner.
- `sveltekit-frontend/src/lib/server/retrieval/packet-dense-search.ts` — dense candidate executor, not ACE evidence.
- `python/atlas_graph_runtime/ace_bitfrost_caller_v1.py` — `build_pg18_chunk_body_scoped_readback_v1`; use exact admitted chunk rows, not the summary callback.
- `python/atlas_graph_runtime/dspy_predict_ace_recommender_v1.py` — `create_bounded_dspy_rlm_v1`, `run_bounded_dspy_rlm_v1`; tools are constrained to selected manifest evidence.
- `sveltekit-frontend/src/lib/server/atlas/execution/verified-context-runtime-v1.ts` — fail-closed provider contract.
- `sveltekit-frontend/src/lib/server/acp/acp-mcp-integration.ts` and `acp-grpc-quic-bridge.ts` — existing protocol/transport seams; not permission to bypass registry authorization.

### Verified ledger corrections

The earlier draft of this report incorrectly listed `A2A-RPC-32601` and `CLASSIFY-MAP-01` as open. The current `openspec/changes/e2e-error-intelligence-kanban/tasks.md` marks both complete: unknown A2A methods return JSON-RPC `-32601`, and the five additional canonical classification codes are present. Other QA decisions and runtime proof remain open. Specifically, `openspec/changes/parent-atlas-agentic-repair-fabric/tasks.md` still has `KANBAN-RUNTIME-PROOF-01` open; it calls for a deterministic read-only repair diagnostic, receipt and replay before any separate worktree edit gate.

### First failed gate from the supplied run

The reseal and the initial source-selection run each matched all 32,819 recorded files. Derivation produced a candidate with `authority=false` and `workspaceRevision=null`. The source-selection plan recorded `SOURCE_INVENTORY_HYGIENE_NOT_BOUND_TO_SNAPSHOT`, `SOURCE_SELECTION_CHECKSUM_MISMATCH`, and `CANONICAL_SOURCE_COUNT_MISMATCH`. The later hygiene run recorded `SNAPSHOT_BYTES_READBACK_NOT_PROVEN`. The four generated report paths checked were absent from the snapshot, so the cause of the later byte mismatch remains open. Use explicit paths for the manifest and companion receipts when preparing the next candidate.

An independent comparison against the clean detached worktree at `750d2e89e9e` returned `ALTERNATE_SOURCE_READBACK_BLOCKED` with 11,847 exact byte matches, 20,959 changed files, and 13 missing files. The admitted-manifest readback command returned `ADMISSION_MANIFEST_OUTSIDE_SCRATCH_ROOT` before byte validation. Gate 1 still reports `EXECUTION_AUTHORITY_UNAVAILABLE` with `null` current-workspace counts. The cohort audit leaves those counts unset pending independent evidence for the admitted workspace revision.

### Follow-up evidence

| Check | Command or artifact | Observed result |
|---|---|---|
| Route and error fingerprint fixtures | `npx --no-install vitest run --config vitest.lane-contracts.config.ts src/lib/server/atlas/mastra-agent-route.spec.ts src/lib/server/atlas/board/runtime-error-priorities.spec.ts src/lib/server/atlas/agentic/contracts/repair-episode-verifier-v1.spec.ts` from `sveltekit-frontend` | 3 files and 24 tests passed, including the missing-UUID refusal and the shared error fingerprint checks. |
| Backlog | Run `extractOpenTodosV1` from `scripts/atlas/extract-master-open-todos-v1.mjs` over the four tracker files. Output `.tmp/review/master-open-todos-prime-followup-v1.json`. | 258 open entries, 246 unique after case and whitespace normalization, 12 duplicate groups. |
| Detached byte comparison | `node_modules/.bin/tsx.cmd scripts/atlas/reseal-current-workspace-snapshot-v1.mts --snapshot=docs/reports/workspace-source-snapshots/001fa4071615924881105ae8b67c819d30921a83a322350ea957e56a0d2ed106.json --source-read-root=.tmp/atlas/currentness-detached-worktree --report=.tmp/review/detached-worktree-reseal-prime-followup-v1.json` | `ALTERNATE_SOURCE_READBACK_BLOCKED`. The alternate-root mode refuses canonical report destinations. |
| Admitted-manifest readback | `node_modules/.bin/tsx.cmd scripts/atlas/diag-snapshot-readback-v1.mts` | Exit 1 with `ADMISSION_MANIFEST_OUTSIDE_SCRATCH_ROOT`. |
| Workspace frame | `node scripts/atlas/audit-current-workspace-frame-admission-v1.mjs --output=.tmp/review/current-workspace-frame-prime-followup-v1.json` | `EXECUTION_AUTHORITY_UNAVAILABLE`, `WORKSPACE_CURRENTNESS_READBACK_REQUIRED`, 52 exact source revision matches in the previous cohort receipt, and `null` current-workspace comparisons. |
| Native addon | Load `simd-bridge/cpp/build-x64-cuda/Release/tensorrt_bridge.node` in Node and run `simdJsonValidateAstSpans` on `éx` | 52 exports. Correct span passed. Mid-codepoint and out-of-bounds spans were rejected. CPU span validation scope. |

The Arrow file writer already streams RecordBatches with IPC V5 metadata. The MLP has a streaming scoring path and a row-capped full-array convenience path. The packet Arrow export still selects the legacy `atlas_packets.embedding` as `semantic_768`. Obtain a revision-qualified `codebase_chunk_index.content_embedding_768` cohort before using this export for a ranking comparison.

The topology view defined in `0150_unified_cross_ranker.sql` exposes a packet key and scores, substitutes `0.5` for absent PageRank, and lacks source, workspace, and graph revisions. A live advisory join needs a source that carries those revisions and distinguishes missing scores. Keep the existing feature join in shadow mode. The forest helper still serializes vectors into Valkey, so it remains out of the caller path.

## OpenSpec, ACP/A2A, and Kanban alignment

| Ledger | Relevant responsibility | Current noted state |
|---|---|---|
| `openspec/changes/e2e-error-intelligence-kanban/tasks.md` | Error code map, ACP/A2A request/response contracts, QA issue-to-task linkage | `A2A-RPC-32601` and `CLASSIFY-MAP-01` are marked complete; QA decision/scheduler and task foreign-key decisions remain review items. |
| `openspec/changes/parent-atlas-agentic-repair-fabric/tasks.md` | Runtime ownership and repair execution | `KANBAN-RUNTIME-PROOF-01` remains open; board/workflow authority and fixture replay must be resolved. |
| `openspec/changes/parent-atlas-agentic-repair-bundle-integration/tasks.md` | Repair bundle and validation integration | Keep as a dependency ledger; do not copy its task IDs into a new task system. |
| `openspec/changes/feature-label-semantic-derivation/tasks.md` | Derived label proposal and human/promotion safeguards | `feature_label` remains a proposal/display feature, not identity or permission. |
| `openspec/changes/parent-atlas-agent-framework-integration-hardening/tasks.md` | ACP/A2A/MCP/framework alignment and verified ACE handoff | Its tasks remain the framework execution ledger; Mastra is not required to fix missing source authority or providers. |

ACP should dispatch only registered server tools after authentication/authorization. A2A is for independently deployable agents; keep local SvelteKit/Python calls local otherwise. MCP is transport and tool description, not a source of identity or permission. Do not make the Kanban board a second task authority: cards should point to canonical `task_id`, owning OpenSpec task and receipts.

## All-routes QA feature review

OpenSpec `QA-FULLSWEEP-01` owns the fixture integration. The [proposal](../../.okf/pipelines/all-routes-qa-feature-review-v1.json) references the existing QA labels and the existing all-routes filesystem inventory. Generate the per-path review sheet from the repository root:

```powershell
node scripts/atlas/build-openspec-workboard-v1.mjs --task-snapshot-stdout --include-secondary-roots > .tmp/review/feature-label-workboard-current-v1.json
node scripts/atlas/plan-all-routes-qa-features-v1.mjs --workboard-snapshot .tmp/review/feature-label-workboard-current-v1.json > .tmp/review/all-routes-qa-ast-workboard-v1.json
```

At Git base `750d2e89e9e` plus working-tree changes, the planner found 917 API paths. It emitted 150 proposed labels, 108 shared-family review rows, and 659 rows outside these eight families. The exact-segment probe accepted `/api/chat/messages`, left `/api/chatty` and `/notes/api/chat` unmapped, flagged `/api/atlas/search` and `/api/health` for review, and rejected duplicate family assignments. The eight fixture handlers and two existing controls now carry TypeScript AST observations with file hashes and UTF-8 span offsets and hashes. A compact workboard snapshot binds the plan to the exact open task and the current `tasks.md` bytes. The AST probes rejected a method mentioned only in a comment or private declaration and rejected malformed TypeScript.

| QA label | Proposed | Shared-family review | First fixture |
|---|---:|---:|---|
| `ai.chat` | 10 | 2 | `GET /api/llm/runtime-status` |
| `ai.contextual` | 33 | 0 | `GET /api/ace/status` |
| `ai.analysis` | 12 | 0 | `GET /api/vlm/status` |
| `ai.recommendations` | 6 | 1 | `GET /api/recommendations` |
| `poi.directory` | 16 | 0 | `GET /api/persons-of-interest` |
| `reports.builder` | 24 | 50 | `GET /api/reports` |
| `search.hybrid` | 35 | 0 | `GET /api/search` |
| `admin.error_brain` | 14 | 55 | `GET /api/errors/summary` |

1. Review the eight fixture rows first. Keep existing ACP and A2A tests as tagged controls. Stub service calls, caches, and analytics or use seeded records as specified for each fixture. In particular, `GET /api/search` records analytics.
2. When a route and method are approved, add the existing `@feature:` tag to its fixture. Keep explicit test tags authoritative for QA grouping. The review sheet supplies no automatic input to the fingerprint.
3. Run the fixture cohort twice and compare normalized issues, expected refusals, and fingerprint stability. Keep the separate page sweep for browser navigation coverage.
4. Use reproducible failures to evaluate repair evidence. Start with exact route, error code, test, source symbol, and scoped OpenSpec text. Compare lexical Top K against the existing hybrid owner after canonical source verification.

### Offline repair batch checkpoint

The existing runner accepts `--workboard-snapshot` for the compact snapshot. Its preview exposes a full `bindingFingerprint` for each diagnostic. Supply `--workboard-task-binding <bindingFingerprint>=<exact-open-task-key>` once per reviewed association. The shorter report fingerprint remains available for display. A label or AST observation supplies a routing hint and source location. The explicit diagnostic-to-task binding still needs review.

From the repository root, `node scripts/atlas/run-agentic-error-fixing-v1.mjs --offline --file .tmp/review/feature-label-repair-fixture-input-v1.txt --report .tmp/review/feature-label-repair-unbound-v1.json` emitted `PLAN_READY` with two synthetic candidates. I bound the full fingerprints to `e2e-error-intelligence-kanban:QA-FULLSWEEP-01` and `e2e-error-intelligence-kanban:SERVER-LOG-LINK-01` using `.tmp/review/feature-label-workboard-current-v1.json`. The bound and repeated runs both emitted `PLAN_READY`, `candidateCount: 2`, `writesPerformed: false`, and `deterministicPlanChecksum: sha256:2ddb9715f5f76ea89fb5c87f179fa02b68f6a582df82b43bf2fe5b71f6628ecd`. The receipts are `.tmp/review/feature-label-repair-bound-v1.json` and `.tmp/review/feature-label-repair-replay-v1.json`. The resolver rejected a closed task and refused changed `tasks.md` bytes.

The AST and compact task-snapshot support are created, wired, and proven for offline planning and fixture replay.

### Eight-route fixture checkpoint

From `sveltekit-frontend`, run the suite with separate JSON outputs for each pass:

```powershell
foreach ($run in @(1, 2)) {
  $out = "../.tmp/review/qa-feature-route-cohort-pass-$run-v1.json"
  npx --no-install vitest run --config vitest.lane-contracts.config.ts tests/lane-contracts/qa-feature-route-cohort.spec.ts --maxWorkers=1 --reporter=default --reporter=json --outputFile=$out
  if ($LASTEXITCODE -ne 0) { break }
}
```

Both runs passed 18/18 with identical named outcomes at Git base `750d2e89e9e` plus working-tree changes. The suite calls the real GET handlers with stubbed dependencies. It checks each unauthenticated refusal, seeded or stubbed authenticated branches, caller filters on both POI queries and the report query, and stable grouping of a controlled 503 across runs. The 401 companion event was suppressed in both replays. Fixture proof covers the eight routes. The Playwright sweep, live service results, and semantic repair retrieval remain separate open gates.

The refreshed AST review after adding the ledger checkpoint is `.tmp/review/all-routes-qa-ast-workboard-post-fixtures-v1.json`. It uses the compact snapshot `.tmp/review/feature-label-workboard-post-fixtures-v1.json`. Earlier offline replay receipts retain their original ledger hashes.

### Frozen symbol and workboard checkpoint

The local corpus uses the route AST plan, compact workboard, existing `.okf/languages/typescript.yaml` profile, and the combined language OBO. The corpus schema records local source and UTF-8 span hashes, a TypeScript language ID, and proposed OBO IDs. Live LSP readback is `NOT_OBSERVED`. The workspace revision is unset and the corpus has `trainingEligible: false`.

```powershell
py -3.13 scripts/atlas/freeze-qa-symbol-corpus-v1.py --route-plan .tmp/review/all-routes-qa-ast-workboard-post-fixtures-v1.json --workboard .tmp/review/feature-label-workboard-post-fixtures-v1.json --out .tmp/review/frozen-qa-symbol-corpus-v1
```

At Git base `750d2e89e9e` plus working-tree changes, the command reported 10 symbol rows and 15,926 workboard rows. It streamed 512 rows at a time into 32 Parquet row groups. The 26,916,513-byte workboard produced a 2,193,619-byte task index. The index SHA-256 is `af9439081e5a42dc7286cdf138a85efb6e20b4a62515db7406d37c35b96db637`.

An independent CPU Polars scan read back all 15,926 rows and found exactly one `QA-FULLSWEEP-01` row matching its task revision. The exact symbol lookup found one `GET /api/llm/runtime-status` row. The lookalike route did not match and a deliberately altered span digest was rejected with `SYMBOL_SPAN_CHECKSUM_MISMATCH`. The [frozen corpus schema](../.okf/schemas/frozen-symbol-corpus-v1.schema.json) and local `.tmp/review/frozen-qa-symbol-corpus-v1/` artifacts provide a baseline for future retrieval comparisons. The PostgreSQL symbol owner and Gate 1 remain separate.

### Exact and lexical lookup evaluation

```powershell
node scripts/atlas/evaluate-frozen-qa-symbol-lookup-v1.mjs --corpus .tmp/review/frozen-qa-symbol-corpus-v1 > .tmp/review/frozen-qa-symbol-lookup-evaluation-v1.json
```

At Git base `750d2e89e9e`, the evaluator independently rechecked all ten source files and AST spans against the frozen corpus. It reused the existing local BM25 ranker over route, method, file, QA label, and language metadata. Both exact lookup and BM25 ranked all ten explicit targets first. BM25 found 3 of 8 natural language targets in its top three and returned candidates on 4 of 5 negative queries. Using exact lookup for structured requests and BM25 for prose retained the 3 of 8 prose hits and returned zero hits on the five negatives. Changed source bytes and an out-of-bounds span were refused in an adversarial probe. The corpus and hand-authored queries support a local comparison. Live SearchRuntime, embeddings, and trained ranking remain outside this proof.

### QA assertion text comparison

The evaluator can enrich the existing BM25 documents with passing, feature-tagged QA assertion titles. It checks the test report path, current fixture hash, and the literal assertion titles. The controlled 503 fixture now explicitly asserts `HTTP_INTERNAL_ERROR`. The report includes only fixture text and evidence hashes for the added terms.

Run from `sveltekit-frontend`:

```powershell
$spec = 'tests/lane-contracts/qa-feature-route-cohort.spec.ts'
$out = '../.tmp/review/qa-feature-route-cohort-lexical-v1.json'
$before = (Get-FileHash -LiteralPath $spec -Algorithm SHA256).Hash.ToLowerInvariant()
npx --no-install vitest run --config vitest.lane-contracts.config.ts $spec --maxWorkers=1 --reporter=default --reporter=json --outputFile=$out
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
if ((Get-FileHash -LiteralPath $spec -Algorithm SHA256).Hash.ToLowerInvariant() -ne $before) { throw 'QA_FIXTURE_CHANGED_DURING_RUN' }
node ../scripts/atlas/evaluate-frozen-qa-symbol-lookup-v1.mjs --corpus ../.tmp/review/frozen-qa-symbol-corpus-v1 --qa-report $out --qa-fixture-sha256 "sha256:$before" > ../.tmp/review/frozen-qa-symbol-qa-lexical-evaluation-v1.json
```

At Git base `750d2e89e9e` plus working-tree changes, the fixture passed 18/18 and supplied nine assertion titles across eight routes. The evaluator rechecked ten AST spans. On the separate hand-authored QA query set, the unchanged route guard kept 10/10 exact queries at rank one and returned zero hits on five negative cases. Adding the assertion text raised prose Top 3 from 5/10 to 9/10 and MRR@3 from 0.50 to 0.90. The cross-owner ingest job question still missed its ACE status target. The original baseline replay retained its scores. A failing QA report was refused with `QA_FIXTURE_RUN_NOT_PASSING`. This is an offline comparison on a small development set. Live ranking and broader relevance evaluation remain open.

## Compute/training choices

- **Do not add Airflow now.** The current target is one vertical evidence path; existing PG18 jobs/outbox and scheduler are the starting owners. Add an orchestrator only after a demonstrated scheduling gap.
- **Do not start QLoRA, `.pth` or `.safetensors` training yet.** Those are artifact formats/workflows, not provenance. First collect verified repair episodes, independent outcomes, reviewed labels and held-out splits; then use the authorized artifact registry with checksums, base-model/tokenizer/recipe revisions and rollback receipt.
- **KMeans, SOM, PCA/SVD, Ewin-Tang sampling and 4D topology** can propose neighborhoods or tournament candidates. They are not evidence, graph edges, ranking votes, or task links. Evaluate on a frozen ordinal map and ablate against the baseline.
- **cuTile/SIMT/cuVS/cuGraph** remain optional accelerator challengers. First finish a bounded CPU path and parity oracle; then benchmark under the documented VRAM lease and restore workflow. They do not replace PG18 or Qdrant’s own index format.
- **AST/CST indexing** should reuse current Tree-sitter, AST-grep, LSP/symbol and packet/chunk lineage owners. The missing proof is current exact-byte/source-revision binding into SearchRuntime and ACE, not another parser or index.

## Ordered next steps

1. **Make Gate 1 repeatable:** resolve the admitted manifest path with the workspace admission owner, then rerun independent readback. Bind hygiene and source selection to the same snapshot and report inputs before comparing their counts and checksums. Keep alternate-checkout comparisons in `.tmp`.
2. **Replay one already authorized chunk without a model:** after currentness is admitted, use one narrow existing grant and the exact PG18 chunk owner. Verify selected-node cardinality, source/workspace revisions, digest and UTF-8 span. Do not create revisions from `content_hash`.
3. **Run non-production DSPy Predict and RLM on that same manifest:** verify citation replay, receipt checksum, token accounting (active tokenizer plus prompt/interpreter/tool overhead), timeout/cancel behavior, and read-only execution.
4. Wire the six unresolved providers and prove that the existing route verifies and hydrates the packet and that the model consumes the verified ContextManifest.
5. **Build worktree repair tournament:** bind candidate files to verified feature/task evidence; create an isolated worktree; run independent tests/readback; return a proposal plus receipt for human acceptance. Do not train or auto-apply.

### Useful, non-destructive commands

```powershell
# Inspect status only; do not release GPU as part of this work
powershell -File scripts/manage-llama-8090-vram.ps1 -Action status

# Inspect workspace admission receipt (use .tmp for new output)
node scripts/atlas/audit-current-workspace-frame-admission-v1.mjs --output=.tmp/review/current-workspace-frame-admission-v1.json

# Focused bounded-RLM / PG18 callback contract tests
py -3.13 -m pytest python/tests/test_ace_bitfrost_caller_v1.py python/tests/test_dspy_predict_ace_recommender_v1.py python/tests/test_doc14_bounded_rlm_recommender_v1.py -q

# Framework route tests
cd sveltekit-frontend
npx vitest run --config vitest.lane-contracts.config.ts src/lib/server/atlas/mastra-agent-route.spec.ts
```

The pytest results are historical. The follow-up table records the fresh route, fingerprint, detached checkout, and currentness checks. The snapshot and source-selection pipeline results describe the supplied run. The follow-up scope covered repository files, local diagnostic artifacts, and fixture tests.

## GAN status

| State | Result |
|---|---|
| `CREATED` | The companion YAML proposal and this alignment report exist. |
| `WIRED` | Existing search, error, Kanban, ACP/A2A, PG18 callback and RLM owners exist; this proposed feature-label repair path is not wired end to end. |
| `UNIT_PROVEN` | The follow-up passed 24 route and fingerprint tests. Historical PG18/RLM results are recorded separately. |
| `LIVE_PROVEN` | No current-workspace-authorized PG18 chunk readback or live RLM replay is established. |
| `DONE` | No. Gate 1, live evidence readback, production provider handoff and independent repair receipt remain open. |

### Structured closeout

```yaml
likely_cause: The proposal path is blocked at current workspace source selection, before live scoped PG18 evidence can be replayed into the bounded RLM.
evidence:
  - "Supplied reseal output: 32,819/32,819 exact snapshot bytes."
  - "Supplied derive output: workspace revision candidate only; authority=false and workspaceRevision=null."
  - "Supplied source-selection output: blocked, 30,073 selected rows versus 32,819 snapshot rows."
  - "OpenSpec e2e-error-intelligence-kanban marks A2A-RPC-32601 and CLASSIFY-MAP-01 complete."
  - "OpenSpec parent-atlas-agentic-repair-fabric leaves KANBAN-RUNTIME-PROOF-01 open."
patch_targets:
  - ".okf/pipelines/feature-label-agentic-error-fixing-v1.yaml"
  - "docs/reports/agentic-error-fixing-commands-helpers-acp-a2a-kanban-v1.md"
safe_next_command: "Re-run the currentness capture/preflight chain from a quiet worktree and direct outputs to .tmp; do not run admission while the result is blocked."
smoke_command: "py -3.13 -m pytest python/tests/test_ace_bitfrost_caller_v1.py python/tests/test_dspy_predict_ace_recommender_v1.py python/tests/test_doc14_bounded_rlm_recommender_v1.py -q"
report_path: "docs/reports/agentic-error-fixing-commands-helpers-acp-a2a-kanban-v1.md"
```
