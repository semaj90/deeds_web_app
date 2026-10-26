# Parent Atlas A–G progress audit — 2026-10-17

Verdict: **PARTIAL_IMPLEMENTATION / ORIGINAL_BATCH_ACCEPTANCE_NOT_ESTABLISHED**.
Scope: package targets, bounded implementation inspection, local historical A–C receipts, validator/native-parser follow-up tests and a real two-file local index/replay. No live database/service/model/GPU calls occurred. Source-revision propagation/backfill remains deferred and is not counted as an indexing blocker.

## Native parser integration follow-up — 2026-10-17

Batch A reuses `parseNodeTreeSitterSourceV1()` from the existing Node Tree-sitter provider and `parseSvelteStructuralSourceV1()` from the existing Svelte splitter. The provider uses its existing runtime/grammar loader; the splitter's parser entry point is import-safe and retains its CLI. The shared strict coordinate converter translates runtime UTF-16 indices to exact UTF-8 boundaries; every byte slice, node hash and parent containment is checked. Regex extraction is removed from Batch A.

Discovery uses bounded tracked-source candidates and the existing exact-target containment owner, excluding dependencies, environments and generated/archive folders. Traversal and directory-symlink escapes are fixture-tested; a rejected input does not discard valid siblings. Explicit selections exceeding the limit are rejected rather than silently truncated. Inputs are capped at 2 MiB, 50,000 observations per file and 100,000 per cohort. The local adapter supports TS/TSX/JS/JSX/Svelte; Python/Go remain explicit unsupported outcomes, with no heuristic fallback.

Default execution is index-only, bounded to 20 sources, with two independent parser passes. Source/workspace revisions and packet/feature identities stay null. The existing Batch A UUID namespace supplies local observation IDs, not canonical `tn_v1_` identities. Unadmitted `--apply` attempts are rejected before database initialization; no migration or production write occurred.

**Real cohort:** `ActionPopup.svelte` and the ACE summarize API route processed 2/2 in both passes, with zero failures/rejections/skips. The result contains **939 named/ranged native syntax observations and 937 parent edges** (166 Svelte, 773 TypeScript). A1–A5 PASS within this cohort. Independent disk readback verified all 939 byte slices, hashes and content-only input checksums. `canonicalAuthority=false`, `databaseInitialized=false`, `writesPerformed=false`; source-revision backfill stays deferred.

- Receipt: `sveltekit-frontend/reports/batch-a/batch-a-structural-audit-8cc307b9-8d08-486f-930e-eef853568ff2.json`.
- Snapshots: `batch-a-snapshot-8cc307b9-8d08-486f-930e-eef853568ff2-first.json` and `batch-a-snapshot-8cc307b9-8d08-486f-930e-eef853568ff2-replay.json` in that directory.
- Independently recomputed checksum for both: `sha256:e745aae0e3aa2c71656118a800f3ecaf3188c55e4141733e903a295dc443d8f1`.
- Registered `batch:a:validate` returned PASS on these two persisted local snapshots.
- Focused native/validator/CLI tests: **30/30 PASS**. Shared path tests: **6/6 PASS**, including a separate real directory-symlink containment fixture in the native tests. Svelte splitter syntax/import checks and focused helper/CLI TypeScript checks passed.
- Existing `node-tree-sitter-ast-provider.spec.ts` Vitest run emitted only its RUN banner and remained silent; its specific process tree was stopped. That suite is **NOT_VERIFIED**. No runtime service was stopped. A direct Node regression additionally checks the existing native provider request/evidence contract.

Next: review the diagnostic snapshot-to-existing governed writer/feature-consumer adapter, then expand a bounded supported cohort with explicit counts. Whole-corpus coverage, canonical persistence/participant joins, GraphRAG admission and B–G remain open. Source-revision backfill is not required merely to continue diagnostic indexing.

## Implementation update — Batch A validator and replay

The initial audit below is retained as historical evidence. Following the repair, **5/16** direct batch targets exist and **11** remain missing: the registered `batch:a:validate` target now exists. The old missing-file list and source hashes below describe the initial inspection, before this patch.

- Added an import-safe pure validator at `sveltekit-frontend/scripts/atlas/lib/batch-a-validation-v1.mts` with explicit PASS/FAIL/NOT_PROVEN outcomes. A1 uses an actual parser-node denominator; missing structural evidence stays NOT_PROVEN. A2 checks raw IDs before deduplication; A4 performs iterative cycle detection over parent edges/pointers; A5 uses the declared `node_id` namespace.
- A3 compares two captured input-bound snapshots with canonical object-key/row ordering while preserving node metadata and edge content. Missing replay stays NOT_PROVEN; changed inputs, nodes or edges fail. Source/workspace revision backfill is not required.
- Implemented the existing `batch:a:validate` command as bounded local JSON reads. Usage from the frontend: `npm run batch:a:validate -- --first <snapshot.json> --second <independent-snapshot.json>`. Same-file replay, malformed/legacy aggregate reports, oversized inputs and failed gates are rejected; the command makes no store writes.
- The existing materializer now retains raw duplicate observations and validates before loading the database module or invoking a writer. Imports do not execute its main function. The legacy regex producer correctly reports unknown native coverage and absent independent replay; it cannot receive a full A pass from its old placeholders.
- Audit and candidate snapshots use unique, exclusively created filenames. The original July report is preserved. Consumers should use the paths printed by the run instead of assuming the old fixed filename is current.
- Validation: `npx --no-install tsx --test scripts/atlas/lib/batch-a-validation-v1.test.mts` from `sveltekit-frontend` passed **19/19**. Tests include the three reproduced validator bugs, raw duplicates, changed inputs, canonical replay, parent/reference cycles, import safety, and two non-dry command invocations confined to a temporary one-file workspace. Both invocations exited blocked before database initialization and produced distinct local artifacts; temporary fixtures were removed by the tests.
- Focused TypeScript validation passed: `npx --no-install tsc --noEmit --module nodenext --moduleResolution nodenext --target es2022 --types node --skipLibCheck scripts/atlas/lib/batch-a-validation-v1.mts scripts/atlas/batch-a-determinism-validator.mts scripts/atlas/lib/batch-a-validation-v1.test.mts`.

At this earlier validator-only stage, native parsing and exact spans were still open; the follow-up above records their subsequent bounded implementation/proof. Canonical materialization, whole-corpus acceptance and B–G remain open.

## Measured progress

- 16 direct `tsx` targets registered by `batch:a` through `batch:g` commands: 4 exist and 12 are missing at their registered paths. This is entry-point reachability, not capability completeness.
- Existing direct targets: A materializer, B feature builder, D embedder, E benchmarker.
- Historical receipt directories found for A, B and C under `sveltekit-frontend/reports`, all dated 2026-07-27. Expected D/E/F/G directories are absent in that inspected report root; no assertion is made that equivalent artifacts cannot exist elsewhere.
- No A–G batch has complete current acceptance proof in the inspected evidence. No percentage of overall repository completion is inferred.

| Batch | Present evidence | Unclosed acceptance gap | Audit status |
|---|---|---|---|
| A | Registered materializer; historical report: 27,000 files, 146,655 observations, zero edges | Caller uses regex/fixed-window extraction, not Tree-sitter. A1 measures file-processing coverage rather than identified-node coverage; A3 is hardcoded true; cycle detection uses `hasCycles=false`; validator target absent. Zero-edge endpoint checks do not establish a useful parent graph. | Heuristic extraction exists; original A gates unproven |
| B | Registered builder; historical report: 58,304 nodes assigned, 37,236 unique feature IDs | `batch:b:validate` target absent; B4 determinism is hardcoded true. Actual B1–B5 meanings differ from roadmap definitions. | Feature-building path exists; independent replay missing |
| C | Historical report: 291,520 observations over 58,304 nodes and five named lanes; alternate observation script exists | All three registered C targets absent. Alternate script constructs label/metadata heuristics under lane names, including `langextract`; that does not prove independent provider calls, human review, locked labels or original C gate acceptance. | Legacy observations exist; reviewed-label workflow unproven |
| D | Registered 768-dimensional embedder | One combined prompt embedding is perturbed per row rather than independently embedding each input. Confidence is fixed at 0.92. `syncToPgvector` performs no canonical write while increasing a success counter; Qdrant gate is hardcoded true and D5 is tautological. Validator target absent; original D gates differ. | Existing script unsuitable as canonical embedding producer |
| E | Registered benchmarker | Embeds query but retrieval counts `ILIKE` matches; query vector is not used for vector ranking. Uses average PageRank/default 0.85 as confidence. Does not compare exact/pgvector/Qdrant, compute recall@10, or measure requested repeated-run p95 behavior. Validator target absent; E gate meanings differ. | Original three-engine search baseline unimplemented in this caller |
| F | Other Naive Bayes scripts exist elsewhere | Registered NB/XGBoost/validation targets absent. Equivalent reviewed training/evaluation caller not established by this audit. | Batch entry points missing; broader capability not declared absent |
| G | Existing separate ranking/tournament owners documented | Registered trainer/validator targets absent. No batch-specific evaluated model or receipt found in inspected roots. | Batch entry points missing; accepted ranking proof absent |

## Missing registered files

All paths below are relative to `sveltekit-frontend/scripts/atlas/`:

1. `batch-a-determinism-validator.mts`
2. `batch-b-determinism-validator.mts`
3. `batch-c-ontology-observation-emitter.mts`
4. `batch-c-control-set-reviewer.mts`
5. `batch-c-ontology-validator.mts`
6. `batch-d-determinism-validator.mts`
7. `batch-e-search-audit.mts`
8. `batch-f-naive-bayes-trainer.mts`
9. `batch-f-xgboost-trainer.mts`
10. `batch-f-classification-validator.mts`
11. `batch-g-ranking-trainer.mts`
12. `batch-g-ranking-validator.mts`

## Execution concerns found by source inspection

`batch:all` depends on missing targets, beginning with A's validator. `batch:dry-run` forwards `--dry-run` to D and E, but the inspected D/E implementations do not parse that flag. D contains Qdrant writes and Redis receipt/completion writes; E writes Redis receipt/completion keys. Treat that aggregate command as write-capable until the actual guards are repaired. Neither aggregate command was executed.

The original README says execution is authorized while the master roadmap says implementation is not yet authorized. These are conflicting historical document assertions; this audit does not interpret them as new write approval. The operator's current revision-deferral policy is explicit in the README and scope alignment note.

## Next implementation order

1. Reconcile package targets with existing owners before creating wrappers. Keep missing targets explicit rather than redirecting to similarly named scripts without behavioral comparison.
2. Repair A's original gates: native parser evidence through existing providers, actual node-coverage denominator, real two-run determinism, cycle detection and parent/edge coverage. Preserve the source-revision deferral.
3. Align B/C validators with the original gate definitions; expose real provider execution and the reviewed-label/locked-label workflow. Existing synthetic lane labels cannot substitute for those stages.
4. Retire D from the active canonical path through normal archival/ownership governance; route legitimate per-input embeddings through the existing canonical writer and model/input recipe, with exact readback. Do not republish perturbed vectors.
5. Implement E around existing exact/pgvector/Qdrant search owners on one frozen small cohort and the original query set, then compute actual recall and latency. Preserve one semantic-lane vote.
6. After reviewed labels and baselines exist, connect existing F/G trainers and rankers with frozen splits and independently evaluated artifacts.

The separate five-node exact AST extraction preflight in `docs/reports/graph-rag-single-source-preflight-20261017.md` is valid bounded progress. It does not establish that the legacy A producer became native or that the whole A–G chain passed.

## Evidence checksums

Checksums bind this audit to the bytes inspected; they do not impose source-revision backfill.

| Inspected file | SHA-256 |
|---|---|
| `sveltekit-frontend/package.json` | `d069487cb8a26a67fdb444427463e9abcfaab2d2dd657c18d5a0443f638c71ad` |
| A materializer | `dbaa20e9e26b9004110db39a0ffe71fa091378307384f239859eecc4e8d84624` |
| B feature builder | `f2bf225b6bfb8f4459738ea802003a0e97cdf396ded7996e45c4a681d58fbb89` |
| C alternate observation script | `4af16cf55aac30247f8ebf4cdb1ed47655695abf38d5e013d13f6a654ef07e8a` |
| D embedder | `b6a9e2e9b1922fcaeb4de6630fa9c665ea5e1d584bc356296a1efd801a58eb7f` |
| E benchmarker | `69a37438b22cb89306046575512bc27a73bdbc7e75ee97a1fdd23b6899f12896` |
| Historical A receipt | `e2a3b566a59c305c7f7eb75b9a3c2e1fa718b330d3a26e3d4e288462721c3f03` |
| Historical B receipt | `fd00bcc136b4de0ec0ae848aa4a4ddd0884ff797dde7b476267df20c18c6bd5a` |
| Historical C receipt | `25512870de8a38ae4ef27bf40c6fcba7af60c64e37f464ad7d73d338179eaf02` |

## Focused Batch A review — 2026-10-17

The review inspected the registered A producer and isolated its existing `validateGates` function with TypeScript transpilation. Only that pure function ran; the batch module, database imports, discovery, writes and main function did not execute. Three adversarial probes reproduced the findings below. This is validator behavior evidence, not a corpus extraction test.

1. **P1 — Empty extraction passes every gate.** At `batch-a-structural-materializer.mts:372`, A1 measures readable files minus thrown errors rather than nodes assigned identities. Calling `validateGates(1, 0, [], [], 0)` returns A1–A5 PASS with no extracted nodes. A successful read of an unsupported or unmatched file therefore cannot establish the roadmap's node-identity coverage. Preserve legitimate zero-symbol files as such, but measure actual parser node coverage and represent absent proof explicitly.
2. **P1 — Determinism and cycle checks are unconditional passes.** At lines 394 and 407, A3 uses `pass:true` and A4 sets `hasCycles=false`. A two-node directed cycle was accepted by A4 in the isolated probe. The missing replay validator cannot compensate for the hardcoded A3 result. Require two independent runs and real graph cycle detection; unavailable results must not become PASS.
3. **P1 — Writes precede admission checks.** Lines 488–492 write nodes and edges before line 498 calls the validator. A later failed gate changes only the exit/report status; it does not undo earlier writes. Prepare and validate the complete bounded candidate set before the existing write owner is invoked, then require its transaction and independent readback contract. Review output does not authorize a database run.
4. **P1 — Approximate UTF-16 ranges are labelled as byte coordinates.** Lines 210–211 use JavaScript regex indices and a fixed extra 100 characters, then lines 239–240 store those values as byte offsets. Non-ASCII prefixes invalidate the claimed byte positions; stored end offsets can also exceed source length because only the sliced text is clamped. Use exact native parser offsets from existing owners and verify slices against original bytes; source-revision deferral does not defer coordinate correctness.
5. **P2 — Endpoint validation uses a nonexistent field.** Line 416 reads `tree_node_version_id`, while the declared `TreeNode` and produced rows expose only `node_id` (line 224). With declared-shape nodes `a` and `b` and an edge `a -> b`, the isolated A5 probe reported one orphan. Validate against the actual shared identity field without inventing another identity namespace.
6. **P2 — Deduplication conceals uniqueness failures.** Lines 465–474 drop duplicate IDs before A2 counts duplicates. Preserve raw and deduplicated counts, classify exact repeated observations versus conflicting same-ID rows, and validate collisions before materialization. Deduplicated output alone does not prove raw identity uniqueness.
7. **P2 — Discovery omits Svelte and mixes source with local environments.** Lines 107–108 scan the repository parent relative to the current directory and omit `.svelte`; the exclusion list omits `.venv*`, `.tmp` and `.svelte-kit`. Use the existing tracked-source/candidate selector with explicit supported-language outcomes and a deterministic bounded order. Do not interpret the fixed 27,000 cap as current source coverage.

Probe results:

```json
{
  "mode": "ISOLATED_VALIDATOR_PROBE",
  "batchModuleImported": false,
  "databaseCalls": 0,
  "emptyExtractionAllGatesPass": true,
  "cycleAccepted": true,
  "declaredNodeShapeEndpointGate": { "gate_id": "A5", "pass": false, "orphanedEdges": 1 }
}
```

An existing alternative, `sveltekit-frontend/scripts/atlas/native-structural-materializer.mts`, already invokes a structural materializer and ast-grep, supports diagnostic nominations, and preserves a separate apply gate. It is a candidate integration owner, not a proven drop-in replacement: its nomination/entity output contract must be compared with Batch A's tree/edge consumers before redirecting the package command. Its production revision-closure gate must remain separate from the currently permitted index-first diagnostic work.

Repair order: expose the A validator as an import-safe pure module; fix raw coverage/uniqueness, cycle/endpoint checks and replay; bind the existing native parser outputs; validate all candidates before any writer; add no-store regression fixtures for the three reproduced failures plus Unicode, nested parents, short files and duplicate collisions. No source-revision backfill is a prerequisite for these repairs.

## Closeout

- likely_cause: Historical batch scripts and receipts diverged from the original acceptance contract, with missing entry points and placeholder pass logic.
- evidence: Current package target existence checks; source inspection of A–E; parsed historical July A–C receipts; original roadmap gate definitions.
- patch_targets: This report, ontology-kernel ledger, `docs/openspec/README.md`, Batch A materializer/native adapter/tests, existing Node Tree-sitter provider, existing Svelte splitter, replay validator and pure validator.
- safe_next_command: `rg -n 'atlas_tree_nodes|feature_id|feature_label|DRY_RUN' sveltekit-frontend/scripts/atlas/batch-b-feature-identity-builder.mts` — review the existing feature consumer before connecting the diagnostic native snapshots.
- smoke_command: `npx --no-install openspec validate parent-atlas-ontology-kernel --strict`
- report_path: `docs/reports/parent-atlas-ag-progress-audit-20261017.md`
- validation_scope: Initial static audit, 30 focused native/validator/CLI tests, 6 shared path tests, scoped TypeScript/OpenSpec/whitespace checks and a real two-file local index/replay/readback. Existing provider Vitest suite interrupted/unverified; no full application suite, full-corpus execution or live datastore/GPU operation.
