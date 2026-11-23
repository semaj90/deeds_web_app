# OpenSpec 14.8k Task Triage Report (v1)

- **Changes Scanned**: 126
- **Total Task Rows**: 14842
- **Durable Key**: `<change>:<bareId>:<ordinal>` (`#Lnn` locator only)
- **Authority**: Non-canonical read-only triage (`writesPerformed: false`)

## Bucket Counts

| Bucket | Count | Meaning |
| :--- | ---: | :--- |
| `DONE` | 8311 | Already checked `[x]` |
| `CODE_ONLY_TESTABLE` | 4042 | Safe local code + unit/Vitest/pytest scope |
| `PROOF_PENDING` | 1162 | Partial `[~]` or awaits parity/Playwright/readback proof |
| `APPROVAL_OR_DB_GATED` | 671 | Requires DB migration, staging env, or operator action |
| `PHASE20_OR_GPU_BLOCKED` | 656 | Blocked by Phase 20 deferral or GPU/CUDA/cuVS lease |

## Top 20 `CODE_ONLY_TESTABLE` Batch Candidates (`atlas.topk.v1`)

| Rank | Score | Durable Key | Locator | Summary |
| :---: | :---: | :--- | :--- | :--- |
| 1 | 95 | `parent-atlas-ml-graph-retrieval-convergence:SCAF-04:1` | `openspec/changes/parent-atlas-ml-graph-retrieval-convergence/tasks.md#L87` | SCAF-04 Run tests in existing Python environment: `PYTHONPATH=python python -m unittest discover -s python/tests -p test_ranking_alignmen... |
| 2 | 95 | `parent-atlas-ml-graph-retrieval-convergence:TILE-03:1` | `openspec/changes/parent-atlas-ml-graph-retrieval-convergence/tasks.md#L120` | TILE-03 Execute `PYTHONPATH=python python -m unittest discover -s python/tests -p test_candidate_concept_tile_v1.py -v`; record runtime r... |
| 3 | 95 | `parent-atlas-ml-graph-retrieval-convergence:ASYNC-04:1` | `openspec/changes/parent-atlas-ml-graph-retrieval-convergence/tasks.md#L194` | ASYNC-04 Execute tests via `PYTHONPATH=python python -m unittest discover -s python/tests -p test_async_dag_worker_v1.py -v`. |
| 4 | 95 | `parent-atlas-semantic-768-canonical-contract:TASK-L1453:1` | `openspec/changes/parent-atlas-semantic-768-canonical-contract/tasks.md#L1453` | Keep `semantic-packet-writer.ts` a provisional candidate only. Schema |
| 5 | 85 | `crime-scene-reconstruction:DEC-D:1` | `openspec/changes/crime-scene-reconstruction/tasks.md#L83` | DEC-D Pose model and keypoint format: COCO-17 is already defined in the repo (`pose-skeleton-schema-v1.ts`). The plan proposes MediaPipe ... |
| 6 | 85 | `parent-atlas-ace-rlm-bitfrost-integration:TASK-L16047:1` | `openspec/changes/parent-atlas-ace-rlm-bitfrost-integration/tasks.md#L16047` | Run `optional-search-tool-contract.spec.ts` successfully. The focused Vitest process stalled before reporting this spec; it was interrupt... |
| 7 | 85 | `parent-atlas-ace-rlm-bitfrost-integration:RECEIPT-WRITER-01:4` | `openspec/changes/parent-atlas-ace-rlm-bitfrost-integration/tasks.md#L16639` | RECEIPT-WRITER-01 (candidate, not verified end to end) `test-receipt-ingest-v1.ts` parses a vitest JSON report into `AtlasTestExecutionRe... |
| 8 | 85 | `parent-atlas-ace-rlm-bitfrost-integration:ALIGN-GEMM-GAP-10:1` | `openspec/changes/parent-atlas-ace-rlm-bitfrost-integration/tasks.md#L16687` | ALIGN-GEMM-GAP-10 `features/canonical-candidate-v1.ts::resolveCanonicalCandidateByOrdinal` re-parses the entire map with zod on EVERY cal... |
| 9 | 85 | `parent-atlas-compute-rank-cache-eval-dspy-gepa:HGR-FACT-01:1` | `openspec/changes/parent-atlas-compute-rank-cache-eval-dspy-gepa/tasks.md#L564` | HGR-FACT-01 — reuse `grounded_nlp_fact_v1.py` strict dataclass and TypeScript canonical checksum roundtrip for extracted n-ary role-beari... |
| 10 | 85 | `parent-atlas-ml-graph-retrieval-convergence:ML-DATA-01:1` | `openspec/changes/parent-atlas-ml-graph-retrieval-convergence/tasks.md#L16` | ML-DATA-01 Trace the actual feature/label producer from `ranking-features.ts`, existing policy reranker and XGBoost grouped ranking input... |
| 11 | 85 | `parent-atlas-ml-graph-retrieval-convergence:SCAF-06:1` | `openspec/changes/parent-atlas-ml-graph-retrieval-convergence/tasks.md#L89` | SCAF-06 Tie the new 8-feature adapter to the actual existing `ranking-features.ts` / XGBoost/ListMLE feature shape and model inputs via e... |
| 12 | 85 | `parent-atlas-ontology-kernel:NEXT-06:1` | `openspec/changes/parent-atlas-ontology-kernel/tasks.md#L5517` | NEXT-06 READY - Full-corpus extractor DRY RUN over all 238 indexed `+server.ts` routes (the 20-route sample was clean): measure extractio... |
| 13 | 85 | `parent-atlas-tensor-residency-integration:MIG-17:1` | `openspec/changes/parent-atlas-tensor-residency-integration/tasks.md#L3012` | MIG-17 Python judge gate `python/tests/test_atlas_summary_claim_judge_v1.py` (negative case with bare alias `hforf`) is NOT_PROVEN in thi... |
| 14 | 80 | `atlas-directory-first-analysis-v1:TASK-L127:1` | `openspec/changes/atlas-directory-first-analysis-v1/tasks.md#L127` | 6.7 Reconcile the extension routing table in the coverage core with `helper-registry-v1.ts`; add an owner validator for `projection-admis... |
| 15 | 80 | `crime-scene-reconstruction:REG-DEQ-01:1` | `openspec/changes/crime-scene-reconstruction/tasks.md#L397` | REG-DEQ-01 Dequeue exists only in residency (`server/atlas/residency/residency-controller-v1.ts`) and packet binary registry. Not connect... |
| 16 | 80 | `local-llm-offload-ownership:TASK-L284:1` | `openspec/changes/local-llm-offload-ownership/tasks.md#L284` | `semantic-health/+server.ts` checks the chat model against Ollama `/api/tags` (cannot be true now). |
| 17 | 80 | `parent-atlas-ace-rlm-bitfrost-integration:TASK-L7217:1` | `openspec/changes/parent-atlas-ace-rlm-bitfrost-integration/tasks.md#L7217` | Reconcile `ace-wiki.ts` with the HEVAL raw-trace/wiki/skill separation |
| 18 | 80 | `parent-atlas-ace-rlm-bitfrost-integration:ACE-MATERIALIZER-DOMAIN-09:1` | `openspec/changes/parent-atlas-ace-rlm-bitfrost-integration/tasks.md#L13018` | ACE-MATERIALIZER-DOMAIN-09: extend the existing read/join step in `ace-materializer.ts` to |
| 19 | 80 | `parent-atlas-ace-rlm-bitfrost-integration:PIPE-LUT-01:1` | `openspec/changes/parent-atlas-ace-rlm-bitfrost-integration/tasks.md#L14619` | PIPE-LUT-01 Map the "Pokemon ROM-bank" LUT frame (compressed-packets + LOD scripts, freeze Addendum 9) onto `packet-lod-manifest.ts` / |
| 20 | 80 | `parent-atlas-ace-rlm-bitfrost-integration:RECEIPT-RESOLVE-01:1` | `openspec/changes/parent-atlas-ace-rlm-bitfrost-integration/tasks.md#L16537` | RECEIPT-RESOLVE-01 change `patch-tournament.ts` to resolve `evidenceRef` through the verification table once it exists (builds on TOURN-E... |
