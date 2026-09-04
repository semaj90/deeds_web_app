## Remaining task dependency map (2026-09-02)

The remaining work is intentionally ordered by evidence dependency. Do not use
checkbox completion percentage as permission to skip a blocker.

1. **Active packet admission:** `PKT-LINEAGE-08` (explicit authorization required) →
   exact production-entrypoint canary → packet readback/replay. `LINEAGE-02` is a
   separate blocked archaeology helper and must not be treated as an executable
   cohort-selection gate until its population origin is proven.
2. **Qdrant reconciliation:** `RETRIEVAL-01J` → `RETRIEVAL-01K` →
   `RETRIEVAL-01L`.
3. **OaK execution:** `DAG-RUNTIME-01D.2` authoritative four-leg revision
   bundle → `DAG-RUNTIME-01D` deterministic A/B replay →
   `DAG-RUNTIME-01E` ContextManifest receipt linkage.
4. **Representation:** `NESTED-TRAIN-02` → `NESTED-REP-01`.
5. **Promotion:** `PROMOTION-01` → `PROMOTION-02`.
6. **Validation record:** items 44 and 45 close only after the evidence-link
   and mutation-scope audit is complete.

Current execution priority is the narrow `PKT-LINEAGE-08` production-entrypoint
proof, followed by `RETRIEVAL-01L` governance closeout. `LINEAGE-02` remains
`BLOCKED_UNGROUNDED`: recover the origin, owner, and checksum of the requested
bounded cohort. `151128` is unsupported, and the historical `15128/768` literal
has no authoritative cohort artifact. Until one is found, `cohortSize` remains
`UNRESOLVED`; do not execute either value.
The stale-run/cohort-origin and revision-bundle investigations are read-only
helper lanes; they may produce evidence but may not select a replacement cohort
or mark tasks complete. OaK replay, ONNX/WebGPU promotion, nested
representation work, and new Qdrant mutation work remain downstream or
separately blocked.

## TENSORRT-RTX-ATEN-BRIDGE-01 (2026-09-03, deferred — no installation)

TensorRT-RTX is an optional decoder challenger, not a replacement for the
existing PyTorch/ATen decoder and not part of the RAPIDS graph environment.
The current `docker/atlas-neural-decoder/Dockerfile` is the pinned
`pytorch/pytorch:2.13.0-cuda13.2-cudnn9-runtime` baseline. It does not contain
TensorRT-RTX. `simd-bridge/cpp/tensor_bridge.cc` is a legacy JSON/N-API bridge
with a TensorRT comment/stub; it is not an implemented `torch::Tensor` or
`NvInfer` integration. Keep it classified `OPTIONAL_CHALLENGER_NOT_WIRED`.

The existing WSL RAPIDS environment is `/home/james/miniforge3/envs/atlas-rapids-cu13`
and is the sole proven RAPIDS diagnostic/executor environment. The generic
`rapids` environment does not exist. Package scripts must use the named
environment directly; do not install an alias or a second RAPIDS environment.
The Docker `atlas-gpu-8098` service remains a separate production RAPIDS
boundary and must not be copied into the decoder image.

Do not begin this gate until the PyTorch decoder baseline is independently
proven. When authorized, execute in this order:

1. PyTorch decoder baseline receipt.
2. C++/ATen ABI smoke test using the exact decoder PyTorch/CUDA ABI.
3. TensorRT-RTX SDK/runtime identity and ONNX engine parity.
4. Zero-copy device-buffer lifetime proof: CUDA device, dtype, contiguous
   shape, stable addresses through `enqueueV3`, dedicated non-default stream,
   and no CPU round trip.
5. Engine/runtime cache identity bound to model, engine, CUDA, and adapter
   checksums; no source truth, hidden reasoning, KV cache, or tensors in
   Valkey.
6. Bounded latency/VRAM comparison. CUDA Graph capture is a later optional
   optimization and cannot be used to claim baseline correctness.

Required status fields are `created`, `wired`, `proven`, and `done`; this
section is currently only a deferred design/ownership record. No TensorRT-RTX
installation, CUDA upgrade, Docker rebuild, or decoder production cutover is
authorized by this task.

## CUTILE-PYTORCH-KERNEL-PILOT-01 (2026-09-03, deferred — no installation)

cuTile is not part of the current RAPIDS or decoder owners. If a measured
kernel gap is later identified, use the existing WSL `atlas-rapids-cu13`
environment for one bounded pilot. Pass PyTorch CUDA tensors directly to a
cuTile kernel on an explicit stream and return a device tensor without a CPU
round trip. Use cuTile's disposable compiled-cubin cache only; it must never
contain source truth, ACE packets, hidden reasoning, KV cache, or tensor data.

The pilot requires current-stream/device-pointer proof, numerical parity with
the existing PyTorch/cuVS implementation, a benchmark showing benefit, and a
specialization/GPU-target cache invalidation test. Do not install cuTile,
change the RAPIDS image, or create a production cuTile owner in this gate.

## ATLAS-GPU-8098-CUDA13-CONVERGENCE-01 (2026-09-03, deferred — no rebuild)

The current `atlas-gpu-8098` image remains the supported CUDA-12 RAPIDS 26.08
HTTP boundary. A future CUDA-13 comparison may use the official
`nvcr.io/nvidia/rapidsai/base:26.08-cuda13-py3.13` image or a smaller measured
custom image, but only after parity and resource receipts are collected. This
task does not authorize rebuilding, pulling, or switching the service.

## SEMANTIC-COHORT-AUTHORITY-01 (2026-09-03, read-only gate)

`LINEAGE-02` consumes a first-class `SemanticCohortAuthorityV1`, not a number
copied from task prose. The authority artifact must define `cohortId`,
`cohortOwner`, `populationDefinition`, `sourcePopulation`, `selectionRule`,
`representationId=semantic_768`, workspace/source or source-set revision,
`representationRevision`, `populationCount`, `populationChecksum`, and linked
evidence. Until those fields are independently available, the gate remains
`BLOCKED_UNGROUNDED` with `cohortSize=UNRESOLVED`.

The 15-row lineage-qualified semantic cohort is diagnostic-only. The 55,169-row
semantic snapshot is a separate matrix/representation artifact and does not
inherit lineage authority from the 15-row proof. Neither cohort may be silently
substituted for the undocumented historical `15128/768` literal.

The capability registry already contains an XGBoost CUDA entry, but its note
says the GPU harness has not been executed and recorded as live proof. Classify
XGBoost as `IMPLEMENTED_UNPROVEN`, not `PROVEN`; it remains separate from the
WSL RAPIDS/cuGraph owner and does not justify installing cuML. SearchRuntime
remains the candidate owner; PyTorch/cuVS, NetworkX/cuGraph, and XGBoost produce
bounded signals or challenger results only.

## Completion rubric for the remaining tasks (2026-09-02)

A task is complete only when its required proof tier and receipt exist. Code
presence, a dry-run report, or a task narrative alone is not completion proof.

| Proof tier | What it proves | What it cannot prove |
|---|---|---|
| `STATIC_CONTRACT` | schema, resolver, or registry shape is valid | live owner or data correctness |
| `FIXTURE_REPLAY` | deterministic behavior on controlled input | production coverage or lineage authority |
| `LIVE_READ` | real current owner/data can be read and checked | permission to mutate or promotion |
| `AUTHORIZED_MUTATION` | explicit target-list write, readback, and rollback evidence | collection-wide safety by implication |

Apply these completion predicates:

- `LINEAGE-01`: `LIVE_READ`; stable workspace UUID, explicit repository key
  and directory scope, completed Graphify run, independent workspace/source
  revisions, and zero ambiguity.
- `PKT-LINEAGE-08`: `LIVE_READ` plus one separately authorized bounded success
  canary through the real writer; refusal alone is insufficient. Require full
  1:N membership readback and idempotent replay.
- `LINEAGE-02`: exact requested cohort artifact and checksum; otherwise keep
  `BLOCKED_ARTIFACT_UNPROVEN`.
- `RETRIEVAL-01J`: `LIVE_READ`; zero ambiguity inside the eligible projection
  cohort, with ineligible missing points separately classified.
- `RETRIEVAL-01K`: `AUTHORIZED_MUTATION`; explicit Qdrant targets, preimage,
  readback, unchanged vector/point ID, and replay.
- `RETRIEVAL-01L`: only after 01J/01K plus rollback and ownership receipts.
- `DAG-RUNTIME-01D.2`: one mutually consistent persisted four-leg revision
  bundle (source, candidate, graph, representation); fixture values do not
  satisfy this gate.
- `DAG-RUNTIME-01D`: fixture replay may close only its fixture subtask; live
  replay requires 01D.2 and two identical zero-write executions.
- `DAG-RUNTIME-01E`: only after live 01D; link the exact ContextManifest and
  validation receipts.
- `NESTED-TRAIN-02`/`NESTED-REP-01`: immutable cohort, frozen seed, training
  receipt, and one CandidateOrdinal universe; native MRL and learned latent
  representations remain distinct.
- `PROMOTION-01/02`: governance gates requiring independent lineage,
  representation, projection, migration, authorization, readback, and rollback
  evidence.
- Validation items 44/45 close last, after every checked item has a linked
  receipt and mutation scope is reconciled.

Minimum safe smoke set:

```text
node scripts/atlas/audit-workspace-source-namespace-v1.mjs
node scripts/atlas/audit-graphify-stale-run-reconciliation-v1.mjs
node scripts/atlas/plan-packet-chunk-lineage-promotion-v1.mjs
openspec validate parent-atlas-retrieval-lineage-dag-convergence --type change --strict --json
```

Do not mark a blocked task complete merely because a lower proof tier passes.

**Evidence synchronization pass (2026-09-02, concurrent session, bookkeeping only — no runtime
work, no writes to Postgres/Qdrant/Neo4j/Valkey).** Checkbox state had fallen behind existing
receipts in several places; corrected in place above rather than deferred:
`RETRIEVAL-01K` closed (`[x]`) — its canary/readback/replay evidence already existed and proved
`DONE`, the checkbox was simply stale. `RETRIEVAL-01J` reworded to the correct acceptance scope
(zero ambiguous/conflicting targets *within the projection-eligible cohort*, with the
675-row projection-ineligible population separately explained) rather than the literal
"zero missing targets" the original wording implied but the evidence never showed.
`RETRIEVAL-01L` stays open, explicitly for the audit-artifact/protocol-freeze reason, not the
final live state (which is already good). `PKT-LINEAGE-08` relabeled
`BLOCKED_NO_ELIGIBLE_CANDIDATE` / `IMPLEMENTATION_PROVEN` + `SUCCESS_POPULATION_UNAVAILABLE` —
this is a candidate-availability blocker, not unfinished coding. `DAG-RUNTIME-01D` relabeled
`BLOCKED_BY_01D.2` rather than independently `OPEN`. `LINEAGE-01`/`LINEAGE-02` given explicit
current-status tags (`OPEN / PARTIAL_AUTHORITY`, `BLOCKED_ARTIFACT_UNPROVEN`) matching their
already-existing evidence text. New corroborating evidence added to `LINEAGE-01`'s trail from an
independent read-only audit (`WORKSPACE-OWNER-BINDING-01`,
`docs/reports/workspace-owner-binding-01.json`; `SOURCE-NAMESPACE-CONTRACT-01`,
`docs/reports/source-namespace-v1-proof.json` — a typed `SourceNamespaceV1` contract at
`sveltekit-frontend/src/lib/server/atlas/embedding/source-namespace-v1.ts`, live-proven against
all 885 `graphify_files` rows, zero failures): independently reaches the same
`WORKSPACE_SOURCE_NAMESPACE_BLOCKED`-equivalent conclusion as this file's own
`workspace-source-namespace-v1.json`, and additionally proves `graphify_files.workspace_revision`
is NULL for 512/885 (58%) of rows — the precise shape of why a single revisioned binding does not
yet exist. No naming or artifact collision with this file's existing work was found. Corrected
next-step ordering for `LINEAGE-01`: resolve the workspace/repository/directory namespace binding
**and** the stale Graphify run lifecycle (abandon/supersede/legitimately resume — a
human/lifecycle decision, not something to force by running `graphify:daily` to manufacture a
fresh revision token) before `PKT-LINEAGE-08` preflight can have a naturally-qualified candidate
to test its success branch against.

## 0. Governance admission

- [x] CONV-0A — Establish this convergence change as the active planning
  authority. `openspec status`, strict validation, and apply-instructions
  resolution all pass for the repo-local change. No planning command applies
  runtime work or mutates stores.
- [x] CONV-0B — Generate a read-only OpenSpec portfolio classification from the
  root change store. The report records task progress, declared gate references,
  blockers, supersession hints, and one explicit `CURRENT_AUTHORITY` for this
  convergence change without deriving queue priority from completion percentage
  or applying any change. See
  `scripts/atlas/audit-openspec-portfolio-v1.mjs` and
  `docs/reports/openspec-portfolio-v1.json`.

## 1. Lineage and semantic reader

- [x] LINEAGE-01 — **`CLOSED / WORKSPACE_SOURCE_NAMESPACE_PROVEN`** (2026-09-03, see the
  final UPDATE below — was `OPEN / PARTIAL_AUTHORITY` as of 2026-09-02). Workspace
  owner (`workspaceId=625743d2-092b-4fa8-abe0-9dc094920c80`, repositoryId='deeds-web-app') is
  real and proven, but the relevant Graphify run is orphaned/stale and cannot supply an
  authoritative completed revision — this is a partial, not full, authority state. Prove full
  source namespace and source-revision authority;
  the prior bounded read-only source audit independently confirmed exact content-hash agreement
  for 111 observed Graphify rows, but that proves content integrity for those observed rows only
  and does not close the missing
  completed-run or authoritative namespace predicates. Evidence:
  `docs/reports/current-graphify-source-revision-v1.json`.
  The current default-run audit now fails closed when its run ID resolves to zero rows
  (`SOURCE_AUTHORITY_UNAVAILABLE`, `rowCount: 0`) instead of incorrectly reporting a successful
  content match. A real run ID must be supplied before any current source authority claim.
  retain fail-closed behavior for missing or placeholder lineage. Consolidated
  from the packet<->chunk lineage program's existing corpus-wide evidence
  (same underlying census, different task label): `graphify_files.workspace_id`
  is the only real namespace/revision authority found (885 rows, 778/61,660
  packets = 1.26% coverage); `atlas_packets.repository_id` is confirmed
  corrupted (58,365/58,365 distinct, synthetic) and explicitly rejected as an
  authority. Fail-closed behavior verified via `PacketChunkMembershipV1Schema`'s
  `.refine()` (9/9 tests) and the full-corpus `BACKFILL-DRY-01` classification
  (60,882 unproven packets correctly left `UNPROVEN`, zero fabricated).
  Verdict is low-coverage-but-correct, not full-coverage — see
  `docs/reports/lineage-01-source-namespace-revision-authority-v1.json`.
  The follow-up read-only binding audit now records the stable workspace UUID,
  logical workspace key, repository key, and directory scope, but the current
  Graphify run is still `RUNNING` with no completion receipt and zero completed
  owner runs. Therefore this task remains open until a completed run proves the
  binding end to end. See
  `docs/reports/workspace-source-namespace-v1.json` and

  **UPDATE 2026-09-03 (see `GRAPHIFY-LIFECYCLE-OWNER-01` above for full detail)**: the
  "zero completed owner runs" clause above is now stale — a real, full-corpus (25,258 files)
  `graphify_runs` completion was applied and independently SQL-verified
  (`run_id: 369e4270-7689-4536-8816-4ec4a5517b3e`, `status: COMPLETED`,
  `completedGraphifyRunCount: 0 → 1`). Two of the namespace audit's 9 checks
  (`completedOwnerAvailable`, `workspaceRevisionAvailable`) now pass. Status is still
  `OPEN`, not because of the completed-run gap anymore, but because of a **different, newly
  surfaced** blocker: `logicalKeyResolvesExactlyOneWorkspace: false` — the `workspaces` table
  has no key/slug/identifier column at all (only `id, title, description, case_id, created_by,
  created_at, updated_at`), so it structurally can never match the configured logical workspace
  key. This is a `workspaces` schema gap, not a Graphify lifecycle gap — needs its own decision
  (add a key column via migration, or change the audit's matching logic) before this task can
  reach `WORKSPACE_SOURCE_NAMESPACE_PROVEN`.
  `docs/reports/graphify-stale-run-reconciliation-v1.json`.

  **UPDATE 2026-09-03 (2nd)**: `workspaces.logical_key` migration applied and independently
  verified (see `GRAPHIFY-LIFECYCLE-OWNER-01` above). Re-ran the namespace audit: **all 9
  checks now pass**, including `logicalKeyResolvesExactlyOneWorkspace`. Every substantive
  predicate this task depends on is now genuinely true. The audit script's own `status` field
  still prints `WORKSPACE_SOURCE_NAMESPACE_BLOCKED` due to a confirmed script bug (not a real
  gap — see `GRAPHIFY-LIFECYCLE-OWNER-01` for the exact line and fix). **This task
  (`LINEAGE-01`) is therefore evidence-complete but not yet formally closed** — closing it
  should wait for the one-line script fix + a `PROVEN` status string, not be declared done from
  the underlying checks alone (that would repeat this file's own "no completion claim without
  matching tool evidence" rule from a different angle).

  **UPDATE 2026-09-03 (3rd, final) — CLOSED, `WORKSPACE_SOURCE_NAMESPACE_PROVEN`.** Fixed the
  script bug flagged above, precisely and minimally, only after confirming via a scoped grep
  (`scripts/`, `sveltekit-frontend/src`, `sveltekit-frontend/scripts` — no other consumer of
  `checks.absolutePathNamespaceDependency` exists anywhere) that nothing else depended on the
  field's current shape. Root cause exactly as diagnosed: `absolutePathNamespaceDependency` is
  the one check in the object whose *passing* value is `false`, not `true`, but the completion
  test (`Object.values(checks).every(v => v === true || v === 0)`) treated every field
  uniformly. Replaced with a per-check `passingValueByCheck` map (`{
  absolutePathNamespaceDependency: false, ambiguity: 0 }`, everything else defaults to `true`),
  with an inline comment explaining why, so a future reader doesn't hit the same trap. **Re-ran
  the audit fresh: `status: WORKSPACE_SOURCE_NAMESPACE_PROVEN`, all 9 checks pass** —
  `docs/reports/workspace-source-namespace-v1.json`, `generatedAt: 2026-09-03T01:53:31.814Z`.
  Sanity-checked the unrelated writer spec suite still passes (13/13) to confirm no incidental
  regression from touching a different file in the same session. **`LINEAGE-01` is genuinely,
  formally closed** — real completed full-corpus run, real workspace revision, real logical-key
  binding, real script fix, all independently verified via SQL/test runs/live script output
  across this session, not asserted from partial evidence.
- [ ] LINEAGE-02 — **`BLOCKED_ARTIFACT_UNPROVEN`** / helper
  `LINEAGE-02-COHORT-ORIGIN-01`. Do not reconstruct the exact `15128/768`
  requirement by inference or match it to an unrelated existing artifact.
  The literal was introduced in the initial convergence-task scaffold by
  commit `128e052ba44` and is not backed by a database query, fixture, report,
  or measured cohort. Follow-up commit `5e5c78580c` explicitly recorded that
  `git log --all -S "15128"` found no cohort artifact. `151128` has no
  meaningful repository match and is unsupported. Keep `cohortSize` unresolved
  until an authoritative artifact defines the population; do not execute
  either number or substitute the 55,169-row semantic snapshot. Do not use
  repaired Qdrant metadata for source qualification. See the open-questions
  section of the LINEAGE-01 evidence report.

  **UPDATE 2026-09-03 — independent `SEMANTIC-COHORT-AUTHORITY-01` audit (operator-run, web
  search included) corroborates this entry exactly, formalized with an explicit classification
  enum.** `classification: UNKNOWN` (not `STALE_LITERAL` — that would imply we know `15128` once
  referred to a real cohort that later went stale, which is not established; not `TYPO` — that
  would imply we know what number was intended, which is also not established).
  `authorityStatus: BLOCKED_UNGROUNDED`. `writesPerformed: false`. Every required authority field
  (`population definition`, `source table/query`, `expected row count`, `workspace/source/
  representation revision binding`, `originating producer/report`) is `UNPROVEN`; none found.
  Population/dimension/revision/producer all `UNPROVEN`; `768` alone is real (the genuine
  `semantic_768` dimension, independently confirmed via the frozen 55,169-row manifest and v4
  training snapshot) but its pairing with `15128` specifically is not. **Independently re-checked
  this same session** (not just trusting the operator's report): `grep -rn "15128" .` across the
  repo (excluding `node_modules`) turns up exactly one other hit —
  `docs/reports/atlas-vector-manifest-v1-2026-08-04.json:151305`, `"matrix_row": 15128` — read in
  context, this is the sequential per-point index of one row inside a much-larger vector manifest
  (that file has well over 15,128 entries), not a definition of a 15,128-row *cohort*. This
  corroborates `UNKNOWN`, it does not weaken it — a coincidental numeric match inside an unrelated
  larger dataset is not provenance.

  **Three populations must stay explicitly distinct, never conflated**:
  1. `LINEAGE-02` / `"15128/768"` — population `UNKNOWN`, authority `UNPROVEN`, **KNN execution
     NOT allowed**.
  2. The existing 15-row `SEMANTIC_768_COHORT_PROVEN` canary — population **exactly 15**,
     `semantic_768`, lineage `PROVEN` (real `workspaceRevision`, 15/15 exact chunk bindings,
     `content_embedding_768`, producer metadata, `canonicalAuthority: postgres`) — **read-only
     diagnostic KNN only**, any receipt from it must carry `diagnosticOnly: true,
     promotionAuthority: false, fullCorpusInference: false, candidateCount: 15` so it can never be
     read back later as if it proved something about a larger population.
  3. The 55,169-row frozen `semantic_768` matrix — population **exactly 55,169**, matrix identity
     `PROVEN` and reproducible, but source-revision qualification remains incomplete (per
     `LINEAGE-01`'s own prior findings) — **full-corpus KNN gate stays `BLOCKED`**.

  Do not map `15128` to either of the other two populations, do not extrapolate the 15-row proof
  to the 55,169-row corpus, and do not change the literal `15128` to `151128` anywhere — both
  remain equally unsupported; changing one to the other would fabricate false precision, not
  resolve the gap. `LINEAGE-02` stays blocked until (and only until) a real originating artifact
  or producer is found — a lightweight archaeology helper (`LINEAGE-02-COHORT-ORIGIN-01`,
  `SEMANTIC-SNAPSHOT-PROVENANCE-RECOVERY-01`) may keep watching for one, but does not become
  active P0 execution capacity. Active P0 stays `PKT-LINEAGE-08` → `RETRIEVAL-01L`.
- [x] RETRIEVAL-01A — Canonical `semantic_768` execution ownership was proven
  for the bounded B/D oracle cohort; retain scope limits.
- [x] RETRIEVAL-01B — `_768_v2` reader canary and exact PostgreSQL hydration were
  proven for the bounded cohort.
- [x] RETRIEVAL-01C — Projection result and canonical content hydration were
  separated through `ProjectionCandidateV1`.
- [x] RETRIEVAL-01D — Read-only reader replay was proven on the bounded cohort.
- [x] RETRIEVAL-01E — Named-vector execution and 50-query reader canary were
  corrected/proven within recorded scope.
- [x] RETRIEVAL-01G — Audit historical impact of pre-existing empty Qdrant
  results across all live readers. Consolidated from a concurrent
  investigation landed the same day (commit `128e052ba4`): two distinct
  root causes found and fixed together — (1) generation contamination in
  the pre-fix default collection (`QDRANT-READER-SHADOW-01`: 42% wrong
  top-1 self-match across a 50-query frozen set; 100% on the canonical
  `_768_v2` collection), and (2) a missing named-vector `using` parameter
  causing hard Qdrant 400s silently caught and returned as empty `[]`
  (`QDRANT-READER-FIX-02` canary: 0/50 zero-hit queries post-fix). All 9
  live readers funnel through one `QdrantSearchBackend.search()`
  implementation, so one fix corrected all call sites. One open,
  explicitly-flagged gap not closed here: `turbovec-search.ts`'s own
  hardcoded collection defaults (not the active backend by default, so no
  live impact under normal configuration). See
  `docs/reports/retrieval-01g-empty-result-historical-impact-v1.json`.
- [x] RETRIEVAL-01H — Freeze narrow semantic reader ownership only. Already
  satisfied by the same commit's `QDRANT_SEMANTIC_READER_OWNERSHIP`
  boundary: `ProjectionRegistryV1` (`RETRIEVAL-01I`, already frozen)
  explicitly scopes itself to `semantic_768`/`qdrant`/`codebase_chunks_768_v2`
  only, with TurboVec and any other executor explicitly out of scope (a new
  representation requires a new resolver branch, never a change to this
  one). See `docs/reports/writer-root-01-representation-owner-01-results.json`
  and `src/lib/server/atlas/retrieval/projection-registry-v1.ts` header.
- [x] RETRIEVAL-01I — `ProjectionRegistryV1` defined and frozen
  (`src/lib/server/atlas/retrieval/projection-registry-v1.ts`, 4/4 tests):
  fail-closed resolution of canonical packet identity + representation to a
  live-validated Qdrant projection coordinate (collection, vector name,
  physical point, revisions). Requires live payload `postgres_id` to match
  the requested canonical identity before resolving — never trusts a stored
  point-id field blindly.
- [x] RETRIEVAL-01J — **`DONE / ACCEPTANCE_SCOPE_RECONCILED`** (2026-09-02, wording
  correction, do not rerun reconciliation). The dry reconciliation did not literally produce
  zero missing targets — it found 6,312 present / 675 `QDRANT_POINT_MISSING`, with zero
  identity conflicts, zero revision mismatches, zero foreign chunks. The 675 were later fully
  explained (`QDRANT-POINT-MISSING-POPULATION-01`,
  `docs/reports/qdrant-point-missing-population-01-v1.json`): all 675 exist in Postgres, all
  675 carry `embedding_eligible=false`, and none were found under the alternate `qdrant_id`
  column either — `MISSING_POPULATION_EXPLAINED_BY_EMBEDDING_ELIGIBILITY_POLICY`. The correct
  acceptance condition is zero ambiguous/conflicting targets **within the projection-eligible
  cohort**, with all projection-ineligible missing targets separately classified and explained
  — which is what actually happened. Do not write `missingTargets = 0`; that did not happen.
  Under the corrected scope this task is arguably already satisfied — closing this out is a
  wording/scope correction, not another reconciliation run. Original wording retained below for
  history: dry-run stale bridge reconciliation with zero ambiguous or missing targets.
- [x] RETRIEVAL-01K — **`DONE / RECON_CANARY_PROVEN`** (2026-09-02, checkbox was stale relative
  to already-existing evidence). `PKT-LINEAGE-11 RECON-CANARY-01`: selectedPoints=6,
  pointsWritten=6, readbackExact=6, vectorChanges=0, pointIdChanges=0, deletes=0,
  replayChanges=0 — a tiny separately-authorized reconciliation canary with exact projection
  identity readback and no legacy point deletion, exactly as this task required. Do not rerun
  this canary. See the `PKT-LINEAGE-11`/`RECON-CANARY-01` evidence earlier in this file and
  `docs/reports/bridge-recon-replay-v1.json`.
- [ ] RETRIEVAL-01L — **`OPEN`** (2026-09-02, status confirmed — subtle, not simply "blocked").
  The final live state is good: 6,312 present canonical projections reconciled, 0 exact patches
  remaining, 0 blocking conflicts, 675 policy-ineligible missing points correctly left
  untouched (`FINAL_STATE_IDEMPOTENCY_PROVEN`). But the exact original 6,306-entry consumed
  bulk proposal was not durably recoverable/replayable
  (`ORIGINAL_PATCH_SET_REPLAY_UNPROVEN` / `AUDIT_REPLAY_INCOMPLETE_ORIGINAL_ARTIFACT_NOT_DURABLE`
  — see `PKT-LINEAGE-13 RECON-CLOSEOUT-01` below). This task should close only when projection
  ownership governance freezes the future protocol (immutable proposal artifact,
  `consumedProposalChecksum`, `targetPointSetChecksum`, apply receipt with
  rollback/preimage artifact and exact readback, replay that consumes the exact same proposal)
  — not by rerunning the historical bulk reconciliation merely to repair its audit artifact.
  Freeze full Qdrant projection ownership only after rollback
  and parity proof.

  **UPDATE 2026-09-03 — protocol hardening implemented, promotion still closed.**
  `scripts/atlas/audit-bridge-recon-dry-04-v1.mjs` now accepts an explicit artifact path and emits
  proposal, target, preimage, and rollback checksums. `scripts/atlas/apply-bridge-recon-dry-04-v1.mjs`
  accepts `--proposal=<immutable-artifact>` and records `consumedProposalChecksum`,
  `consumedTargetPointSetChecksum`, `preimageChecksum`, and `rollbackChecksum` in apply/replay
  receipts. Fresh read-only artifact `docs/reports/bridge-recon-dry-05-v1.json` found the expected
  7,421 lineage memberships, 6,312 present Qdrant points, 1,109 missing physical points, and zero
  proposed patches. The increase from the earlier 675 missing points is explained by the 434 new
  PKT-LINEAGE-08 memberships; it is recorded as live state drift, not a repair authorization.
  No Qdrant mutation was performed. `RETRIEVAL-01L` remains open until a non-empty frozen proposal
  receives an authorized apply, exact readback, rollback artifact, and same-proposal replay.
- [x] RETRIEVAL-02 — Census every Qdrant query for explicit named-vector
  selection; do not mass-edit callers. Audit-only, zero callers modified.
  Static scan of every direct Qdrant-like `.query(`/`.search(` call site
  under `sveltekit-frontend/src/lib/server` (excluding the 9 canonical
  callers already covered by `RETRIEVAL-01G`/`01H`): 32 direct call sites
  across 25 files. Three real false-positive/false-negative classes were
  found and corrected during the scan itself (Postgres `client.query()`
  SQL/transaction-control calls misclassified as Qdrant; the older
  `vector: { name, vector }` named-vector shape misclassified as missing
  selection; JSDoc/comment example lines misclassified as real call sites)
  — each documented in the report's own methodology section.
  **v2 tightening (2026-09-01, per operator review):** the original v1 pass
  reported "19 confidently missing `using`" from static heuristics alone.
  Per the review's explicit correction — "a missing `using` is a proven
  defect only after target collection, collection vector schema, and
  required vector name are all known" — v2 adds a live, read-only Qdrant
  schema lookup (`GET /collections/<name>`) per resolvable literal
  collection name and reclassifies every site into exactly one of
  `NAMED_VECTOR_REQUIRED_MISSING` / `DEFAULT_VECTOR_VALID` /
  `EXPLICIT_NAMED_VECTOR_VALID` / `COLLECTION_SCHEMA_UNKNOWN`. Result: only
  **3 proven defects** survive schema verification (down from 19 unverified
  heuristic guesses) — `atlas/retrieval/qdrant-semantic-scorer.ts:89`
  (querying the canonical `QDRANT_SEMANTIC_COLLECTION` = `codebase_chunks_768_v2`
  directly, live-confirmed `NAMED_VECTORS`, same missing-`using` defect
  class `RETRIEVAL-01G` fixed only in `qdrant-search.ts`),
  `retrieval/go-retrieval-orchestrator.ts:203`, and
  `retrieval/parallel-orchestrator.ts:164` (both querying literal
  `codebase_chunks_768`, also live-confirmed `NAMED_VECTORS`). One real
  false-positive from v1 was caught and corrected in the process:
  `ace/tag-sync.ts:135` queries `document_tags`, which is live-confirmed
  `SINGLE_DEFAULT_VECTOR` — v1 would have wrongly counted this as a defect;
  v2 correctly classifies it `DEFAULT_VECTOR_VALID`. The remaining 16 sites
  are `COLLECTION_SCHEMA_UNKNOWN` (unresolvable variable/constant
  collection expressions, or a live lookup confirming the named collection
  doesn't currently exist) and are explicitly NOT counted as proven
  defects — absence of proof is not proof of a defect. Per this task's
  instruction, none of the 3 proven defects were remediated — this is
  audit evidence for a future, separate remediation decision. See
  `docs/reports/retrieval-02-qdrant-named-vector-census-v1.json` and
  `scripts/atlas/retrieval-02-qdrant-named-vector-census.mjs`.
- [x] RF-IDENTITY-SEMANTICS-02 — Preserve the existing dedup precedence while
  distinguishing canonical Atlas identity from projection and grouping
  evidence: `content_hash` is `projection_exact`, `source_ref` is
  `source_group`, and lane-local IDs remain `degraded`. Focused identity/RRF
  tests passed 18/18; no persistence or projection ownership changed. See
  `docs/reports/rf-identity-semantics-02-v1.json`.
  **Naming collision note (2026-09-01):** this entry documents the initial,
  same-day V1 status-broadening only (`ResolvedIdentity.status` widened
  in-place). The operator's full review of this same correction — adding a
  `canonical_chunk_id` tier (consumed only from proven ProjectionRegistryV1/
  lineage hydration, never reconstructed) and a `HashContractV1` gate on
  `content_hash` (unqualified hashes must not reach `PROJECTION_EXACT`,
  since this repo has a confirmed historical hash domain that hashed
  generated artifact content, not source bytes) — landed as the fuller,
  additive `resolveCanonicalIdentityV2()` under the SAME task name in the
  sibling `parent-atlas-retrieval-fusion-reachability` change's `tasks.md`.
  Both are real and both are live (additive, non-conflicting code); this
  note exists so a future reader doesn't assume one supersedes the other
  without checking — the fusion-reachability entry is the complete
  implementation of the operator's full review.

## 2. OaK DAG runtime convergence

- [x] DAG-RUNTIME-01A — Repair the semantic owner contract with an exact callable
  implementation reference for `searchQdrantCodeStrictV1`. It does not alias
  `search_hybrid`, and preserves Qdrant, `semantic_768`, `_768_v2`, and named
  vector `content` lineage. Package build and focused semantic handler tests passed.
- [x] DAG-RUNTIME-01A.1 — Resolve the bounded replay subset to exact callable
  implementation references for AST evidence, graph expansion, PostgreSQL FTS,
  semantic Qdrant, KAG neighbor reads, and ACE ContextManifest compilation.
  The references are statically registered; no dynamic import or coarse action-kind
  fallback is used. Package build and focused owner tests passed.
- [x] DAG-RUNTIME-01B.1 — Added the exact KAG neighbor-read contract
  `parent-atlas.kag.neighbor-read.strict.v1` for canonical-ID neighbor reads.
  It is not an alias for packet lookup or generic BFS. Package build and focused
  KAG handler tests passed.
- [x] DAG-RUNTIME-01B — Register strict read-only owners for semantic Qdrant,
  PostgreSQL/KAG, AST evidence, graph expansion, and context compilation in the
  exact-reference runtime registry. Registry tests passed; live replay remains open.
- [x] DAG-RUNTIME-01C — Retain bound arguments and require parameter-checksum
  equality at execution admission. Existing
  `kernel-dag-execution-binding-v1.ts` retains `boundArguments`, rejects
  missing/mismatched checksums, and rejects output-schema mismatches. Binding
  and registry tests passed 5/5; package build passed. Evidence:
  `docs/reports/kernel-dag-execution-binding-v1.json`.
- [x] DAG-RUNTIME-01C.1 — Added the exact ACE ContextManifest adapter
  `parent-atlas.context-manifest.ace.v1`. It validates an assembled ACEContext,
  accepts the actual compiler options, and performs no retrieval or persistence.
  Package build and focused context-handler tests passed.
- [ ] DAG-RUNTIME-01D — **`BLOCKED_BY_01D.2`** (2026-09-02, status corrected — not merely
  `OPEN`/independently runnable). Source revision is split between stale-but-persisted and
  fresh-but-unpersisted values, the candidate revision is a bounded n=15 canary, graph revision
  is fixture-only, and representation authority was never independently resolved — those are
  individually real values but not one coherent world-state, so this cannot proceed until
  `DAG-RUNTIME-01D.2` produces an authoritative four-leg revision bundle. Execute a frozen
  bounded plan twice and compare normalized
  outputs, evidence, statuses, and deterministic receipt checksums.
- [x] DAG-RUNTIME-01D.1 — Proved the registered lexical and semantic owners on a
  bounded mocked read-only replay. Two runs produced the same deterministic
  execution checksum, both actions succeeded, and all writes remained false.
  This is fixture proof only; live dependency replay remains open.
- [ ] DAG-RUNTIME-01D.2 — **`BLOCKED_REVISION_BUNDLE_UNPROVEN`** (2026-09-02, formalized). Run the
  frozen replay against explicitly configured read-only live owners after exact source, candidate,
  graph, and representation revisions are available. WSL2 RAPIDS FastAPI runtime is now reachable
  at `127.0.0.1:8098` in `atlas-rapids-cu13` with HTTP 200 health, RTX 3060 Ti, cuVS/cuGraph 26.06,
  and no writes. This proves runtime availability only. Per the "OaK revision qualification"
  section below, the 4-leg revision bundle (source/candidate/graph/representation) is confirmed
  NOT authoritative — a mix of stale/orphaned, fresh-but-unpersisted, bounded-canary-scoped, and
  fixture-only values, not one coherent live world-state. Do not spend further effort on this gate
  until a coherent revision bundle exists; do not run `graphify:daily` or generate a new Graphify
  run merely to manufacture one (that would invert the dependency — a replay gate should consume a
  revision that the graph lifecycle naturally produces, not force an expensive rebuild to obtain a
  token).
- [ ] DAG-RUNTIME-01E — **`BLOCKED_BY_01D.2`**. Link the execution receipt to ContextManifest and
  validation receipts while preserving zero-write/non-canonical semantics.

## 3. Representation and learned AE

**Representation policy freeze (2026-09-02, clarification, no code/data change).** This section's
narrow current focus on `semantic_768` is deliberate scoping, not a claim that Parent Atlas is
"768-only." The full representation fabric stays:

- **Canonical semantic baseline**: `semantic_768` — physical owner
  `codebase_chunk_index.content_embedding` (halfvec(768)), canonical executor `:8081`
  EmbeddingGemma, retrieval projection Qdrant `codebase_chunks_768_v2`. `ACTIVE / PROVEN` as an
  executor (per `ORT-CPU-RUNTIME-01`/`ORT-CPU-SEMANTIC-PARITY-01` above); lineage/`canonicalAuthority`
  proof is what `LINEAGE-01`/`PKT-LINEAGE-08` above are still establishing.
- **Compact residency/LOD representations (learned nested family)** — corrected 2026-09-02: these
  are NOT merely offline benchmarking challengers. `semantic_768 -> NestedSemanticAutoencoder ->
  latent_256` (the physical learned latent), with `latent_128 = latent_256[:128]+L2` and
  `latent_64 = latent_128[:64]+L2` (equivalently `latent_256[:64]+L2`) as DERIVED slices of the
  SAME learned coordinate family (`latent_64 ⊂ latent_128 ⊂ latent_256`) — do not train independent
  128-/64-dim autoencoders when one nested contract already produces all three. The INTENDED design
  (see below) is that `latent_64`/`latent_128` serve as operational hot/warm representation levels
  for cheap routing, candidate pruning, and progressive query expansion — canonical identity does
  not change when a candidate is promoted `latent_64 -> latent_128 -> semantic_768`; only how much
  representation detail has been materialized/consulted changes. **This progressive-expansion
  wiring does NOT exist in live code today** — verified by grepping the live hot/warm/cold
  systems that do exist (`packet-lod-manifest.ts`'s text-LOD system, `retrieval-promotion-policy.ts`'s
  rank-based cache-destination system): neither references `latent_64`/`latent_128`/`latent_256`/
  `semantic_mrl_128` at all. Those two systems govern *text/packet* caching (which LOD of summary/
  content materializes, which cache tier a packet lands in by retrieval rank) — a real, separate,
  already-live mechanism, not the embedding-representation-selection mechanism described here. This
  is design intent for a future `RepresentationLODPolicyV1` (query classification + residency signal
  + confidence + breadth/entropy + latency/byte/GPU budget -> `{initialRepresentation, expansionOrder,
  stopConditions}`), not yet built. `semantic_mrl_128` (native/truncated MRL of `semantic_768`) is a
  distinct mechanism from the learned nested family — both can participate in the warm tier once
  built, but are not interchangeable implementations. All representations below `semantic_768`
  remain `EXPERIMENT` status today — the LOD/residency role is the target design, not current fact.
  **Refinement (2026-09-02): `ResidencyState` (`HOT`/`WARM`/`COLD` — a cost/cache-tier concept) and
  `RepresentationLOD` (`IDENTITY`/`LATENT_64`/`LATENT_128`/`SEMANTIC_768`/`STRUCTURAL`/`SOURCE` — a
  representation-detail concept) must stay two separate enums when this is eventually implemented,
  not a permanent `HOT=latent_64` / `WARM=latent_128` / `COLD=semantic_768` identity mapping. They
  will often correlate but are not the same axis — a HOT candidate may already have `semantic_768`
  resident (e.g. a frequently-hit packet), and a COLD candidate might initially have only identity
  available. A future policy consumes both signals independently.**
- **Structural representations (separate domain, never compete with semantic)**: `topology_128`,
  `topology_64`, `graphOrdinal`. A `topology_128` vector is a structural-neighborhood signal, not a
  smaller `semantic_768` — semantic similarity, compressed semantic/routing signal, and structural
  neighborhood are three different meanings and must not be conflated even when dimensions match.
- **Legacy, do not promote**: `semantic_384`, `topology_ae64_v1` (the old topology AE family — keep
  distinct from the current nested semantic family above).
- **Executor policy**: `:8081` EmbeddingGemma = `ADMITTED` for `semantic_768`. ONNX QInt8 =
  `NOT_ADMITTED` (per `ORT-CPU-SEMANTIC-PARITY-01`). A future FP16/FP32 ONNX re-export stays a
  challenger only until it clears its own parity gate.

Why the current gate talks almost entirely about `semantic_768`: `NESTED-TRAIN-02`/`NESTED-REP-01`
below need one coherent, revision-qualified baseline population to compare the smaller
representations against — comparing representations across different populations/revisions would
produce meaningless results. Fixing `semantic_768`'s canonical lineage first is a prerequisite for
a *valid* representation comparison, not a decision to make `semantic_768` the only representation.
**Canonical baseline does not mean mandatory first retrieval representation** — the intended
hot/warm/cold design (once built) has many queries terminate at a cheaper LOD (`latent_64` ->
`latent_128`) without ever touching `semantic_768`, while `semantic_768` stays the authoritative
semantic comparison surface whenever promotion to full detail is actually required. `latent_64` and
`latent_128` are conceptually HOT/WARM stops on a single progressive-expansion path toward
`semantic_768` -> structural neighborhood -> source spans/AST/KAG evidence -> ContextManifest, not
independent alternative representations competing for the same query.

**Representation policy status (2026-09-02): `REPRESENTATION-POLICY-CLARIFICATION` = `DONE`. Live
latent residency routing = `NOT_BUILT`.** Dependency order, explicit: lineage/revision baseline
(`LINEAGE-01`/`PKT-LINEAGE-08` above) -> `NESTED-TRAIN-02` -> `NESTED-REP-01` (quality proof +
residency/early-stop proof) -> **only if the lower LODs prove genuinely useful** ->
`REPRESENTATION-LOD-POLICY-01` -> live progressive-expansion wiring. `RepresentationLODPolicyV1` is
explicitly **deferred** until `NESTED-REP-01` produces real evidence — do not build policy machinery
around `latent_64` merely because it is cheaper; the residency proof below is what would actually
justify it.

- [ ] NESTED-TRAIN-02 — Retrain the nested AE from an immutable source snapshot,
  grouped train/eval split, frozen seeds, CUDA receipt, and new checkpoint hash.
- [ ] NESTED-REP-01 — Answers TWO distinct questions, not one (corrected 2026-09-02):
  (1) **Quality**: compare `semantic_768`, native `semantic_mrl_128`, learned `latent_128`, and
  learned `latent_64` on the same CandidateOrdinal cohort — recall@K, MRR, overlap, bytes,
  latency, projection checksums, replay (the original scope, unchanged).
  (2) **Residency**: at which LOD can a query be answered without paying for the next
  representation? — i.e. does `latent_64` alone suffice for enough queries (sufficient
  confidence/breadth) to justify it as a real HOT-tier first-pass stop before expanding to
  `latent_128` then `semantic_768`, per the intended `RepresentationLODPolicyV1` design in this
  section's policy note above. Question (2) is the more Parent-Atlas-specific one and is what
  would actually justify building the not-yet-existing progressive-expansion wiring. The residency
  evaluation report should include a `safe-stop %` column per LOD — the fraction of queries for
  which that representation satisfies a frozen confidence/breadth criterion without requiring
  promotion to the next LOD — not just raw quality metrics:
  ```
  LOD               recall@10   MRR   p95 ms   bytes   safe-stop %
  latent_64
  latent_128
  semantic_mrl_128
  semantic_768
  ```
  `safe-stop %` answers "does `latent_64` terminate 55% of routine queries, `latent_128` another
  25%, leaving only 20% requiring `semantic_768`?" — the design goal is avoiding unnecessary
  representation expansion, not compression quality alone.

## 4. Promotion safety

- [ ] PROMOTION-01 — Keep source lineage, graph identity, feature layout,
  projection ownership, and migration baseline as independent blockers.
- [ ] PROMOTION-02 — Permit writes only through an explicit target list,
  rollback plan, readback receipt, and human authorization.

## 5. Packet<->chunk lineage (historical reconstruction + future capture)

Full evidence trail: `docs/reports/workstation-lineage-resume-01-results.json`
(see `handoff_2026-09-01` for the complete commit list and status block).
Root cause: `scripts/atlas/register-orphaned-chunks.mjs` (the active
`atlas_packets` producer) discovers chunks via `DISTINCT relative_path`,
never captures `codebase_chunk_index.chunk_id`/`content_hash`/revision.
`atlas_packets` is FILE-granularity (proven corpus-wide invariant);
`codebase_chunk_index` is chunk-granularity — the relationship is 1:N
lineage MEMBERSHIP, not 1:1 identity.

- [x] PKT-LINEAGE-01 — Trace the packet-creation writer, identify root cause
  of the packet<->chunk fan-out (`register-orphaned-chunks.mjs`'s `DISTINCT
  relative_path` design; also found `backfill-unified-id-hierarchy.mjs`
  live-corrupted `chunk_id`/`repository_id` for ~58,000+ packets via
  `randomUUID()`).
- [x] PKT-LINEAGE-02 — Prove `atlas_packets` FILE granularity is a
  corpus-wide invariant (0/61,660 packets have >1 `source_ref`), correcting
  the earlier 1:1-identity framing to 1:N membership.
- [x] PKT-LINEAGE-03 — Identify `sourceRevision`/`sourceNamespace` authority:
  `graphify_files` (885 rows, real, 100% populated internally, but only
  ~1.4% corpus coverage). `atlas_packets.repository_id` confirmed corrupted
  (58,365/58,365 populated values all distinct).
- [x] PKT-LINEAGE-04 — Read-only historical backfill scope census (aggregate,
  then full row-level in v2): 577/61,660 packets admissible as
  `MEMBERSHIP_EXACT_REVISION_PROVEN`; 4,110 `NAMESPACE_UNPROVEN`; 56,973
  `NO_MEMBER`. Reproducible: 3 independent runs, identical checksums.
- [x] PKT-LINEAGE-05 — Freeze `PacketChunkMembershipV1` contract
  (`src/lib/server/atlas/lineage/packet-chunk-membership-v1.ts`, 9/9 tests)
  and `atlas_packet_chunk_lineage` migration
  (`drizzle/manual/20260901_atlas_packet_chunk_lineage.sql`), proved
  disposable-DB-first. `UNIQUE(packet_key, canonical_chunk_id)` only —
  producer revision is provenance on the canonical row, never a second row.
  `chunk_ordinal` nullable (no reliable producer ordinal signal exists).
- [x] PKT-LINEAGE-06 — Future-capture writer canary
  (`scripts/atlas/packet-chunk-lineage-canary-01.mts`): 3 real shapes
  written + read-back verified, 1 orphan correctly refused (fail-closed,
  no fabricated namespace).
- [x] PKT-LINEAGE-07 — Historical-reconstruction canary
  (`scripts/atlas/packet-chunk-lineage-backfill-canary-01.mts`): 4 real
  historical packets promoted from the frozen dry-run artifact (SINGLE/FEW/
  MANY/overlap-with-06), atomic per-packet-set writes, replay-proven
  idempotent under the corrected uniqueness key.
- [ ] PKT-LINEAGE-08 (PROMOTION-01) — **`IMPLEMENTATION_PROVEN / SUCCESS_CANARY_PENDING`**.
  The corrected production entrypoint and exact `--source-refs-file` targeting are proven by
  read-only preflight: 50 real orphan candidates and 434 namespace-qualified memberships are
  eligible, with `writesPerformed: false`. The latest durable apply receipt records
  `mode: apply`, `registered: 0`, and `status: no_orphans`; it does not prove that the intended
  50-packet/434-membership success branch was applied or read back. Keep the gate open until one
  separately authorized targeted apply produces direct SQL evidence for packet membership,
  followed by idempotent replay. No Qdrant, Neo4j, graph, or Valkey writes are authorized by the
  preflight. Evidence: `docs/reports/packet-chunk-lineage-promotion-preflight-v1.json`,
  `docs/reports/pkt-lineage-08-eligible-source-refs-v1.json`, and the latest
  `docs/reports/chunk-registration-report.json`.
  **Historical notes below remain retained; their earlier success-branch claims are superseded.**
  Fresh read-only preflight after this status correction now reports
  `BLOCKED_NO_QUALIFIED_CANDIDATE` with `eligibleCandidateCount: 0`. The older 50-source
  allowlist is therefore stale for current execution and must not be applied or regenerated
  into a new write scope without a new authoritative preflight and explicit authorization.
  Direct authority lookup confirms the three remaining files have chunk rows but no matching
  `graphify_files.workspace_id`/`code_source_revision` and no populated `atlas_source_refs`
  namespace or commit revision. This is an authority-coverage gap, not a packet-writer defect.
  A separate manifest check confirms all three are present with `canonicalAdmission: true` and
  stable content hashes, but the manifest carries no `sourceRevision`. Therefore the next repair
  is additive source-revision/workspace metadata enrichment for already-admitted files; do not
  treat manifest presence or content hash alone as sufficient lineage authority.
  Read-only lifecycle binding confirms the newest completed `graphify_runs` row
  (`78818366-2410-4643-8e5d-e995c75a2ad5`) has zero `graphify_files` rows attached; the
  25,317 current file rows remain attached primarily to the older completed run
  (`369e4270-7689-4536-8816-4ec4a5517b3e`). The source-authority repair must therefore bind
  file observations to the completed run that actually produced them before PKT-LINEAGE-08
  can obtain a current qualified candidate. No run or file rows were modified.
  The bounded run/file census makes the split concrete: completed run
  `369e4270-7689-4536-8816-4ec4a5517b3e` owns 25,258 file rows, with 25,258 source revisions
  and content hashes; the four newer completed runs own zero file rows, while 59 additional
  file rows remain attached to older `RUNNING` runs. This is the current evidence boundary for
  source authority and must be reconciled before any lineage promotion.
  Added the read-only validator `scripts/atlas/audit-graphify-run-file-binding-v1.mjs` and
  receipt `docs/reports/graphify-run-file-binding-v1.json`. Current classification is
  `COMPLETED_BOUND: 1`, `COMPLETED_UNBOUND: 4`, `RUNNING_BOUND_NOT_TERMINAL: 2`, and
  `RUNNING_UNBOUND: 3`. A completed bound owner exists, but the lifecycle contract still needs
  one current run/file binding selected explicitly; no run or file rows were modified.
  The bound completed owner does not cover the three remaining packet candidates: a direct
  read-only lookup finds no `graphify_files` rows for any of their `source_ref` values. Their
  chunk rows and source-manifest entries are therefore insufficient for packet lineage; they
  require an explicit source-selection/materialization decision before any new Graphify owner
  can be claimed.
  Historical preflight history (2026-09-03, re-run after
  `LINEAGE-01` closed — see below; was `BLOCKED_NO_ELIGIBLE_CANDIDATE` as of 2026-09-02). Was
  **`BLOCKED_NO_ELIGIBLE_CANDIDATE`** (2026-09-02, status
  corrected — this is not unfinished coding). The live preflight already proved
  `implementationCorrect: PASS`, `authorityProvenBeforeMutation: PASS`,
  `packetMembershipAtomicity: PASS`, with `liveEligibleCandidateCount: 0` and outcome
  `REFUSED_WITH_ZERO_WRITES`. Correct framing: `IMPLEMENTATION_PROVEN` /
  `SUCCESS_POPULATION_UNAVAILABLE` — the future-capture writer and its fail-closed refusal path
  are both proven; what remains blocked is a naturally-qualified namespace+revision candidate to
  exercise the success branch, not further coding. Do not fabricate a candidate and do not run
  `graphify:daily` merely to manufacture a fresh revision token — see `LINEAGE-01`'s stale
  Graphify run lifecycle blocker, which is the actual upstream dependency here. Wire the
  corrected membership-writing
  logic into the live `register-orphaned-chunks.mjs` production path so
  future packet creation captures real lineage. The path is now implemented
  behind the explicit `--capture-lineage` opt-in: it requires the additive
  `atlas_packet_chunk_lineage` table, reads real `codebase_chunk_index.chunk_id`
  values plus `graphify_files.workspace_id`, and commits each packet and its
  complete membership set transactionally. Dry-run evidence is in
  `docs/reports/chunk-registration-report.json`; at that earlier point the
  production canary/apply remained separately authorized. A bounded
  authorized apply canary on 2026-09-01 exercised the active entrypoint:
  one orphan packet row was inserted, but its 22 memberships were correctly
  refused because `graphify_files.workspace_id` was absent; readback confirmed
  zero lineage rows. This proves the fail-closed branch, not the
  namespace-qualified success branch. See
  `docs/reports/chunk-registration-report.json`.

  **UPDATE 2026-09-03 — unblocked, re-run confirms a real, direct effect of the `LINEAGE-01`
  closure above, not assumed.** Re-ran `scripts/atlas/plan-packet-chunk-lineage-promotion-v1.mjs`
  fresh (confirmed read-only: `writesPerformed: false`, `promotionAuthorized: false`,
  `rollback: "Transaction rollback before commit; no transaction was opened by this
  preflight."`). Result: **`liveEligibleCandidateCount: 4`** (was 0), **`verdict:
  READY_FOR_AUTHORIZATION`** (was `BLOCKED_NO_ELIGIBLE_CANDIDATE`). 4 of the 10 sampled
  candidates now resolve a real `namespace` (`workspace:625743d2-...c80`) and real
  `sourceRevision` (a genuine sha256, e.g. `sha256:b947f3ace9...`) — direct consequence of the
  real full-corpus `graphify_files` write this session, which is exactly what this preflight
  reads to resolve namespace/revision per candidate. The other 6 sampled candidates remain
  correctly `BLOCKED_LINEAGE_AUTHORITY` (`namespace: null, sourceRevision: null` — mostly
  `sveltekit-frontend/artifacts/*.json` report files, likely never indexed by the source-file
  extension filter Graphify uses, so genuinely absent from `graphify_files`, not a bug).
  `plannedWrites: {atlas_packets: 1, atlas_packet_chunk_lineage: 1, qdrant: 0, graph: 0, cache:
  0}` — this is the read-only preflight plan only; the actual promotion apply is a real Postgres
  write and remains separately authorized, not executed by this preflight run. Report:
  `docs/reports/packet-chunk-lineage-promotion-preflight-v1.json`,
  `preflightChecksum: sha256:f6f2a7cc7c...`.

  **UPDATE 2026-09-03 (2nd) — authorized apply attempted; real, honest outcome: safe but did not
  exercise the intended success branch.** Before applying, re-ran the preflight at
  `--limit=100` (its max): **`eligibleCandidateCount: 50`**, not 4 — the earlier "4" was an
  artifact of the default `--limit=10` sample, not the true bounded population. Ran the
  authorized apply scoped to the originally-authorized count anyway (`register-orphaned-chunks.mjs
  --apply --capture-lineage --limit=4 --verbose`) rather than silently expanding to 50 without
  re-confirming. **Result, read from `docs/reports/chunk-registration-report.json` and
  independently re-confirmed via direct SQL, not just the script's own summary line**:
  `registered: 4` (`atlas_packets` rows genuinely created — `SELECT ... FROM atlas_packets
  WHERE created_at >= '2026-09-03 01:59:00+00'` confirms exactly 4 real rows), but
  `sourceRefsWithNamespace: 0, membershipsWritten: 0` — **zero lineage rows were written**
  (`SELECT count(*) FROM atlas_packet_chunk_lineage WHERE created_at >= ...` = 0, confirmed
  independently). **Root cause, found by reading the apply script's own query (line 177 of
  `register-orphaned-chunks.mjs`): `ORDER BY cci.relative_path` — purely alphabetical.** The
  4 orphans it picked (`artifacts/domain_label_audit_v1.json`, `artifacts/domain_label_map_v1.json`,
  the quantization-recall eval JSON, `phase1_5_membership_contract.json`) are exactly the 4 the
  preflight had separately classified `BLOCKED_LINEAGE_AUTHORITY` — **not** the `xgboost-*` /
  `.codex_louvain_audit.mjs` candidates the preflight found `READY_FOR_AUTHORIZATION`. The apply
  script has no flag to target specific source_refs; its own selection order has no relationship
  to the preflight's eligibility classification. **Not a bug, and not harmful** — the fail-closed
  lineage-skip behavior worked exactly as designed for genuinely unresolvable refs, and packet
  registration is idempotent (`ON CONFLICT DO NOTHING`) — but it means this specific apply did
  not demonstrate the real membership-write success branch the preflight's `READY_FOR_AUTHORIZATION`
  candidates promised. Reaching those specific candidates would need a larger `--limit` (the
  script processes alphabetically; `xgboost-*` and `.codex_louvain_audit.mjs` sort well after the
  `artifacts/*.json` files) — not attempted further this pass without re-confirming the larger
  scope first, since 50-eligible-of-100-sampled is a materially different write size than the
  4 originally discussed.

  **UPDATE 2026-09-03 (3rd) — the targeting gap identified above is now fixed and dry-run-proven;
  actual authorized apply intentionally not executed this pass, pending explicit go-ahead (see
  below).** Re-ran the read-only preflight fresh (`node
  scripts/atlas/plan-packet-chunk-lineage-promotion-v1.mjs --limit=100`): unchanged,
  `eligibleCandidateCount: 50`, `verdict: READY_FOR_AUTHORIZATION`, `writesPerformed: false` — same
  50 `xgboost-*`/`.codex_louvain_audit.mjs`-family candidates as the prior UPDATE, confirming this
  is still the live, real, stable eligible cohort (not a fluke of the earlier run). Added a new
  `--source-refs-file=<path>` flag to `register-orphaned-chunks.mjs` (JSON array of exact
  `source_ref` strings; each entry re-verified live against `codebase_chunk_index`/`atlas_packets`
  before use, never trusted blindly from the file) — this directly closes the root cause identified
  above (`ORDER BY cci.relative_path` has no relationship to any external eligibility
  classification). Materialized the current 50 eligible `sourceRef`s from the fresh preflight's own
  report into `docs/reports/pkt-lineage-08-eligible-source-refs-v1.json`, then **dry-run only**
  (`--capture-lineage --source-refs-file=docs/reports/pkt-lineage-08-eligible-source-refs-v1.json`,
  no `--apply`, confirmed zero writes): `allowlist: {requested: 50, resolvedAsOrphan: 50,
  notFoundOrAlreadyRegistered: []}` — all 50 requested candidates independently re-confirmed live
  as real, current orphans, and `lineage: {sourceRefsWithNamespace: 50, sourceRefsWithoutNamespace:
  0, membershipsPlanned: 434}` — every one of the 50 resolves a real namespace via
  `graphify_files`, planning exactly 434 real membership rows. This is the concrete proof that the
  targeting fix would exercise the true success branch (namespace-qualified packet + membership
  write) that the earlier limit=4 apply missed. **The actual authorized apply
  (`--apply --capture-lineage --source-refs-file=...`, a genuine 50-packet + 434-lineage-row
  production Postgres write) was deliberately NOT run this pass** — per this file's own
  `AUTHORIZED_MUTATION` proof-tier requirement and the same "separately authorized" convention
  used throughout this section, plus this exact script having already had a scale-up attempt
  blocked by the session's own classifier earlier in this engagement. Evidence:
  `docs/reports/pkt-lineage-08-eligible-source-refs-v1.json` (the allowlist),
  `docs/reports/chunk-registration-report.json` (the dry-run proof, `mode: 'dry-run'`).
  **Fresh readiness supersession (2026-09-03):**
  `node scripts/atlas/plan-packet-chunk-lineage-promotion-v1.mjs --limit=100` now reports
  `BLOCKED_NO_QUALIFIED_CANDIDATE`, `eligibleCandidateCount=0`, and zero planned writes.
  This current receipt supersedes the older 50-candidate preflight for execution purposes;
  do not reuse its allowlist or infer that the success branch is currently available.
  Evidence: `docs/reports/packet-chunk-lineage-promotion-preflight-v1.json`.
- [x] PKT-LINEAGE-09 (BACKFILL-PROMOTION-01) — Separately authorized and
  applied the full 6,987-row admitted cohort (all 577 packets) after a fresh
  classification confirmed the frozen cohort. Readback and idempotent replay
  passed with zero conflicts, duplicate pairs, or synthetic IDs. Evidence:
  `docs/reports/pkt-lineage-09-fresh-classification-v1.json`,
  `docs/reports/pkt-lineage-09-historical-promotion-replay-v1.json`.
  This remains separate from PKT-LINEAGE-08 (future capture vs. historical
  reconstruction are different risk profiles).
- [x] PKT-LINEAGE-10 (BRIDGE-RECON-DRY-03/04) — Reconcile Qdrant projections per
  packet<->chunk MEMBERSHIP (not per packet alone), consuming only eligible
  rows from the canonical membership table. Superseded by the fresh
  fail-closed dry-04 receipt; see
  `docs/reports/bridge-recon-dry-04-v1.json`.
- [x] PKT-LINEAGE-11 (RECON-CANARY-01) — Tiny bounded Qdrant metadata
  write canary. Proven previously; full authorized reconciliation is now
  separately receipted below.

## Three bounded tracks — 2026-09-01/02 session (re-verified concurrent-session evidence, closed 1 real caller-mismatch bug)

**Track A (PKT-LINEAGE-08/09 preflight) — CONFIRMED, no new writes.** A concurrent session's
`scripts/atlas/plan-packet-chunk-lineage-promotion-v1.mjs` (read-only, verified: only `SELECT`
queries, `pool.query` never called with INSERT/UPDATE) was inspected line-by-line and re-run fresh.
Result, normalized to the required success-state shape:
```
implementationCorrect: PASS (chunkOrdinal fabrication bug fixed in bb1572e0a6, verified no drift)
chunkOrdinal: NULL (frozen contract honored)
authorityProvenBeforeMutation: PASS
packetMembershipAtomicity: PASS
authorityUnprovenFixture: REFUSED_WITH_ZERO_WRITES (BLOCKED_LINEAGE_AUTHORITY x10/10 candidates)
liveEligibleCandidateCount: 0
liveProductionCanary: BLOCKED_NO_ELIGIBLE_CANDIDATE
futureWriterSemantics: PROVEN
```
**Scope note (added after external review caught an overreach in this session's own chat summary,
not in this file): this Track A result covers PKT-LINEAGE-08's live-write canary only, on a small
10-row sample. It is NOT the full-population PKT-LINEAGE-09 dry classification** — see the
dedicated "PKT-LINEAGE-09 fresh historical classification" section further below for that, which
was a separate, larger, later step in this same session.
Not a stall condition — this is the correct, expected state until a source cohort with a single
unambiguous namespace+revision actually appears. No live orphan was fabricated to force a canary.
PKT-LINEAGE-09/10/11 remain correctly blocked per their existing entries above; do not re-attempt
until `eligibleCandidateCount > 0` on a fresh re-run.

**Track B (RF-IDENTITY-CALLER-MATRIX-01) — DONE. Verdict: `V2_READY_FOR_CANONICAL_HYDRATION`.**
Mapped every live caller of both name-colliding `resolveCanonicalIdentity` implementations plus
`resolveCanonicalIdentityV2`:
- `ace/identity-contract.ts::resolveCanonicalIdentity` — 3 live callers (`types/retrieval.ts`,
  `ace/retrieval/evidence-lanes.ts`, `ace/indexed-source-packet.ts`). No `content_hash` field
  exists in this module at all; `source_ref` is `status: 'degraded'`, never canonical.
- `retrieval/identity-resolution.ts::resolveCanonicalIdentity` (V1) — reaches the canonical
  `SearchRuntime` spine via `search-runtime.ts:814`'s dynamic import of
  `retrieve-candidates.ts::retrieveAllCandidates` (8 production call sites) plus
  `rrf-integration.ts`. `content_hash` → `'projection_exact'`; `source_ref` → `'source_group'`.
  **Neither is ever `'canonical'` on this live path.**
- `resolveCanonicalIdentityV2` — zero production callers (test-only). Safe to wire as the
  hydration-time resolver in `RF-QDRANT-HYDRATION-02` without migrating existing V1 callers first.

**content_hash CANONICAL anywhere live: NO. source_ref CANONICAL anywhere live: NO.**
No `V1_LIVE_SEMANTIC_COLLISION`. Proceed to `RF-QDRANT-HYDRATION-02` (not started this session).

**Real bug found and fixed instead (smallest-necessary migration, not a new abstraction):**
RF-IDENTITY-SEMANTICS-02's broadening of `resolveCanonicalIdentity`'s `status` field to 4 values
(`canonical | projection_exact | source_group | degraded`) was never propagated to the `Candidate`/
`LaneGroup`/`AggregatedCandidate.identityStatus` type declarations in `search-runtime.ts` (still
`'canonical' | 'degraded'`). This was a **live, currently-broken `tsc --noEmit` compile** — 8 real
`TS2322` errors in `retrieve-candidates.ts`, confirmed by running `tsc` directly, not assumed.
Fixed by widening all 3 type declarations to the full 4-way union — **zero runtime/dedup behavior
change**, verified by reading `fuseSearchRuntimeCandidates`'s dedup logic first: every branch
already tests `identityStatus === 'canonical'` and treats every other value (including the two new
ones) identically to `'degraded'`, so neither `content_hash` nor `source_ref` was ever at risk of
being wrongly promoted to a canonical dedup key even before the type fix — this was purely a stale
type contract, not a semantic bug. One stale test
(`retrieve-candidates-identity.test.ts`, asserting the pre-correction `content_hash → 'canonical'`
expectation) was also fixed to match the corrected precedence. `tsc --noEmit` now clean on both
files; all 32 tests across the 3 identity/fusion suites pass. Did not touch RETRIEVAL-02's 3 proven
Qdrant defects, did not start RF7, did not create a V3 resolver.

**Track C (GRAPHIFY-STALE-RUN-RECON-01) — DONE, read-only, re-run fresh, unchanged.**
`scripts/atlas/audit-graphify-stale-run-reconciliation-v1.mjs` (verified genuinely read-only:
`pool.query` calls are all `SELECT`) re-run live. One `graphify_runs` record for the expected
workspace revision (`sha256:55edaaad...`), `status: 'RUNNING'`, `completed_at: null`, started
2026-08-28T04:01:23Z — **zero `pg_stat_activity` or `pg_locks` evidence of a live backing
process** (both empty arrays), meaning this is an orphaned record from a dead/killed process, not
something still executing. `completedOwnerCount: 0` for this workspace revision.
Normalized to the exact required 3-way enum: **`STALE_RUN_NON_PROMOTABLE`** (not
`READINESS_REPLAY_SUFFICIENT` — `promotionAllowed`/`graphRevisionAllowed` are both explicitly
`false`; not `FRESH_GRAPHIFY_REQUIRED` — that's a stronger claim than this evidence proves, and
would require an explicit human abandonment-review decision, not an automatic assertion). Per
explicit instruction, `graphify:daily` was **not** run to silence this. No OaK/DAG-runtime work
follows from this track's `STALE_RUN_NON_PROMOTABLE` result until a human decides to abandon or
resume the orphaned run.

**Follow-up (2026-09-02, re-verified independently, strengthens the case for `FRESH_GRAPHIFY_REQUIRED`
without asserting it unilaterally).** `docs/reports/graphify-stale-run-reconciliation-v2.json`:
confirmed all 5 recorded `graphify_runs` rows (not just the one workspace-revision-matched record
above) are `RUNNING`/`completed_at: null`, 5-6 days old, zero backing process
(`.tmp/graphify-daemon.pid` itself stale since 2026-06-28, its PID not running). New evidence this
pass: the completion-plan pipeline (`plan-graphify-run-completion-v1.mjs`,
`docs/reports/graphify-run-completion-plan-v1.json`) shows only 2 real blockers remain —
`CANONICAL_GRAPHIFY_RUN_NOT_COMPLETED` and `STRUCTURAL_RESOLUTION_RECEIPT_INCOMPLETE` (workspace
ownership/revision-matching/source-selection/structural-processing are already satisfied) — and the
structural-resolution gap traces to a real, understood, bounded cause: the existing resolution
receipt classified only 210/9,730 unresolved-target edges (a partial sample), not a bug. **But
before spending compute closing that gap, checked whether it would even matter**: the selected
owner run (`14643371-...`) is anchored to `repository_revision=1bb240fb20f1d4ba5651d8a4da9a10c9d6337aaf`,
which is **278 commits behind current HEAD** (`git log 1bb240fb..HEAD --oneline | wc -l` = 278).
Also confirmed: **no apply mechanism exists anywhere in `scripts/atlas/`** to actually transition a
`graphify_runs` row to `COMPLETED` — `plan-graphify-run-completion-v1.mjs` only plans, never applies.
Resolving the remaining ~9,520 structural edges for this specific stale run would therefore very
likely be wasted effort even if it succeeded, since (a) there is nothing yet to apply the completion
with, and (b) the resulting anchor would already be 278 commits stale versus HEAD the moment it
existed. This strengthens, but does not itself decide, the case that the correct lifecycle action is
a **fresh** graphify run against current HEAD rather than resuming any of the 5 orphaned ones —
still an explicit human/lifecycle decision, not run by this pass. `graphify:daily` was again **not**
run.

**`graphify:daily` explicitly authorized and run (2026-09-02, operator instruction: "graphify:daily
is supposed to run every vs code workspace startup").** Real result, not a no-op: 6/11 fanout steps
succeeded — repository provenance dry-run (33,301 files, structural fact count 131,492), dedup
validation, `materialize-addressable-packets --apply` (61,660 addressable rows), cold-processing
pipeline (0 errors), Phase 8 LangExtract entities, summary ranking (5,000 rows), summary envelope
build+queue (501 envelopes to RabbitMQ `phase8.summary.envelopes`), and feature-envelope
materialization (61,661/61,661 packets now carry an envelope). **Root cause of the historical
stale-run pattern found**: the chain halts at step 6/11, `atlas:phase16:latent:apply`, on a
deliberate fail-closed guard — `LATENT_LEGACY_WRITER_APPLY_BLOCKED: use the revision-qualified
canary producer; explicit --legacy-unsafe-apply is required for diagnostic legacy persistence` —
not a crash or a silent failure. This same guard almost certainly explains why all 5 recorded
`graphify_runs` rows above stayed `RUNNING` for 5-6 days: any full `graphify:daily` invocation
during that window would hit this identical blocker and halt before ever reaching a completion
receipt. **Separate follow-up needed, not resolved here**: identify the revision-qualified canary
producer this guard references and whether it should replace `atlas:phase16:latent:apply` in the
fanout chain, or whether this step should be made non-blocking for the overall `graphify:daily`
completion signal. Full log: `tmp/graphify-daily-run.log` (repo-local scratch, not committed).

**Follow-up resolved (2026-09-02): the referenced producer does not exist.** Grepped for
`RepresentationArtifactV1` (the contract `backfill-latent-vectors.mjs`'s own header comment names
as "not the promotion producer for") across `sveltekit-frontend/src`: exactly one real file,
`sveltekit-frontend/src/lib/server/atlas/tensors/representation-artifact-v1.ts`, and its only
importer anywhere in the tree is its own `representation-artifact-v1.spec.ts`. No script, route, or
worker constructs or writes a `RepresentationArtifactV1` for `latent_64`/`latent_128`. The
`LATENT_LEGACY_WRITER_APPLY_BLOCKED` guard is therefore not deferring to a real alternative — it
is fail-closed against a producer that was never built. Practical effect: `latent_64`/`latent_128`
backfill is currently unreachable by any live path (the legacy writer refuses `--apply` without
`--legacy-unsafe-apply`, and the "correct" replacement it names doesn't exist), and
`atlas:phase16:latent:apply` will keep halting `graphify:daily` at step 6/11 on every future run
until either (a) `representation-artifact-v1.ts` gets a real writer wired to this step, or (b) an
operator decides the step should be skipped/non-blocking for the completion signal. Not decided or
built here — this is a human product decision, not something to resolve by loosening the guard.

**Correction (2026-09-02) — the above was incomplete.** Checking only the TS
`RepresentationArtifactV1` contract for a consumer missed the real producer, which is a bare
Python script never wired to that TS contract or to any `package.json` script. Full
`LATENT-PHASE16-OWNER-01` trace below, both producers evidenced live, not assumed.

## LATENT-PHASE16-OWNER-01 (2026-09-02, done — owner identified, npm wiring gap found)

**Old writer** — `npm run atlas:phase16:latent:apply` (`sveltekit-frontend/package.json` line
987) → `node scripts/atlas/backfill-latent-vectors.mjs --apply`.

| Field | Value |
|---|---|
| representationId | `latent_64` (bare, no version suffix) |
| representationFamily | **LEGACY_SEMANTIC_LATENT_PRODUCER** — trained directly on semantic_768 vectors via a classic bottleneck autoencoder (768→128→64), not the frozen nested-MRL-truncation family, and not topology-derived either |
| inputRepresentation | 768-dim vectors pulled live from Qdrant `codebase_chunks_768` (NOT Postgres `content_embedding` — a different source of truth than the current policy) |
| inputDimension → outputDimension | 768 → 128 (hidden, unpersisted) → 64 |
| modelRevision/producerRevision | none — `models/autoencoder/ae_meta.json` has a bare `timestamp: "2026-06-19T16:13:04Z"`, no checksum, no revision string |
| workspaceRevision / sourceRevision / candidateSnapshotRevision / representationRevision | **none of these exist in the script at all** — only a bare integer `metadata->>'ae_epoch'` tag |
| CandidateOrdinalMap / checksum | none |
| inputPopulationDefinition | all points in Qdrant `codebase_chunks_768`, filtered by `isCanonicalPacketPayload()` heuristic — not a Postgres-driven eligible-cohort query |
| physical destination | Postgres `atlas_packets.latent_64` (**bytea**, not vector/halfvec) + Redis `gpu:autoencoder:latent_64:{qdrant_id}` (TTL 7d) + `models/autoencoder/autoencoder_latent_index.json` |
| Qdrant collection | none written (read-only source) |
| canonicalWritesAllowed | no explicit flag — writes straight to `atlas_packets`, a canonical table, with zero revision gate beyond the bare `ae_epoch` int |
| graphifyDailyCriticalPath | **yes** — step 6/11, `atlas:phase16:latent:apply` |
| Live evidence of a prior real run | `docs/reports/backfill-latent-vectors-writeback.json` (2026-08-03): `total_processed: 5000, postgres.updated: 8316, matchRate: 166.32%` — more Postgres rows updated than input rows processed (one Qdrant vector fanned out to multiple `atlas_packets` rows via `source_ref` match), a real anomaly, not investigated further here |

**New writer** — `python/backfill_latent_256.py`. **Zero `package.json` wiring anywhere in the
repo** (`rg backfill_latent_256 -g '*.json'` = 0 hits) — bare/manual Python invocation only.

| Field | Value |
|---|---|
| representationId | `latent_256` (persisted) + `latent_64` (persisted) + `latent_128` (computed in the same forward pass, **not persisted** — no Postgres column exists for it yet) |
| representationFamily | **CURRENT_NESTED_PRODUCER** — one `NestedSemanticAutoencoder.encode()` forward pass producing all three nested outputs together, matching this file's frozen representation policy exactly |
| inputRepresentation | `codebase_chunk_index.content_embedding` (Postgres, canonical semantic_768 — correct source per policy, unlike the legacy writer) |
| inputDimension → outputDimension | 768 → 256 (halfvec, persisted) / 64 (vector, persisted) / 128 (in-memory only) |
| modelRevision/producerRevision | `model_checksum` from `docs/reports/latent-autoencoder-training-receipt-v3-full01.json`, truncated to 64 chars — a real, checked-in training receipt, not a bare timestamp |
| workspaceRevision / sourceRevision / candidateSnapshotRevision | **still none** — keyed purely by `codebase_chunk_index.id::uuid`, no source_ref/workspace binding at all. Real gap shared with the legacy writer, just less severe (at least the model revision is a real checksum) |
| CandidateOrdinalMap / checksum | none — no per-vector checksum, no ordinal map |
| inputPopulationDefinition | `WHERE content_embedding IS NOT NULL AND (latent_256_checkpoint_revision != current OR latent_64 IS NULL OR latent64_model != current)` — a real idempotent incremental-delta query against Postgres, re-runnable safely |
| physical destination | Postgres `codebase_chunk_index.latent_256` (halfvec(256)) + `.latent_256_checkpoint_revision` (varchar64) + `.latent_64` (vector(64)) + `.latent64_model` (text) + `.latent_embedding_valid` (bool) + `.latent_embedding_validated_at` (timestamptz). Both `latent_256` and `latent_64` have live HNSW indexes (`idx_codebase_chunk_latent_256_hnsw`, `idx_codebase_chunk_latent64_hnsw`) |
| Qdrant collection | none written — script's own docstring notes this is a deliberate follow-up, not an oversight |
| canonicalWritesAllowed | writes to `codebase_chunk_index`, the correct canonical chunk table (per this repo's own storage-role rules), gated by an idempotent checkpoint-revision WHERE clause |
| graphifyDailyCriticalPath | **no** — not wired to any npm script, not in the fanout chain at all |
| Live evidence, verified not assumed | `docker exec` query: `latent_256_checkpoint_revision` is a single uniform value (`d6e9395e60f0bb...654259`) across all 55,169 populated rows, and it **exactly matches** `model_checksum` in the checked-in training receipt — proves this exact script (or a byte-identical rerun of it) produced the live corpus. `latent_256` coverage: 55,169/55,853 (98.8%, matches the semantic_768 population exactly — no drift). **`latent_64` coverage on this table is only 200/55,853 (0.36%)** — a real, unexplained incompleteness: `latent_256` and `latent_64` are written in the same UPDATE statement per row, so 54,969 rows have `latent_256` but NOT `latent_64`, meaning either an earlier `--limit=200` proof run wrote both columns and a later full run somehow didn't complete the `latent_64` side, or two different invocations diverged. **Not investigated further this pass** — flagged as its own gap, separate from the phase16-ownership question. |

**Drizzle schema drift found as a byproduct**: `schema-postgres.ts` line 4476-4477 comments
`latent_128/latent_64 are NOT stored separately: they're free prefix+renormalize views of
latent_256, derived at query time` — this is **false against live Postgres**, which has real,
indexed, populated `latent_64` and `latent64_model`/`latent64_meta`/`latent64_validated_at`/
`latent64_msgpack` columns that the Drizzle schema file doesn't declare at all. Not fixed here
(schema-declaration accuracy, not a blocking issue) — flagged for whoever next touches this table
in Drizzle.

**Classification verdict**: legacy writer = `LEGACY_SEMANTIC_LATENT_PRODUCER` (wrong table, wrong
input source, no model revision, still the thing wired into `graphify:daily`). Current writer =
`CURRENT_NESTED_PRODUCER` (right table, right input source, real model revision, already
98.8%-populated for `latent_256`) but is completely unwired from any pipeline and has its own
`latent_64` completion gap.

**Recommendation for `LATENT-PHASE16-CONVERGENCE-01` (next gate, not done here per explicit
instruction not to use `--legacy-unsafe-apply` and not to interleave fixes into this trace pass)**:
Option A — replace `atlas:phase16:latent:apply`'s target with a thin wrapper invoking
`python/backfill_latent_256.py --apply` (already idempotent, already proven at 98.8% for
latent_256; would need the latent_64 gap above resolved or explicitly deferred first). This is
preferred over Option B (making phase16 non-blocking) because the current producer is not merely
an "optional experiment" — it's the real, live, checksum-verified owner of the frozen
representation policy's canonical nested-latent family, just missing pipeline wiring. Not applied
here — decision + implementation belongs to `LATENT-PHASE16-CONVERGENCE-01`.

**Revised recommendation (2026-09-02, supersedes the "Option A: wire it now" line above).**
Operator correction: do not wire `backfill_latent_256.py` into `package.json` yet, and do not make
phase16 non-blocking either — the producer is real and live-proven, so this is a convergence path,
not a dead-experiment-removal path. Split into ordered sub-gates before any pipeline wiring:
`LATENT-PHASE16-CONVERGENCE-01A` (revision qualification + `RepresentationArtifactV1` production
contract) run together with `LATENT64-STATE-RECON-01` (read-only, explain the 200-vs-55,169 gap),
then `LATENT-SCHEMA-ALIGN-01` (Drizzle declaration fix, no migration), then
`LATENT-PHASE16-CONVERGENCE-01B` (thin revision-qualified wrapper, fail-closed on missing
revision flags, emits a real `RepresentationArtifactV1` receipt), then
`LATENT-PHASE16-CANARY-01` (bounded ~128-200 row cohort, deterministic replay proof), only then
`graphify:daily` again.

### LATENT-PHASE16-CONVERGENCE-01A (2026-09-02, contract half done — extended, not net-new)

**Finding: the `RepresentationArtifactV1` contract already existed and already carried almost
every field requested** (`sveltekit-frontend/src/lib/server/atlas/tensors/representation-artifact-v1.ts`,
originally built in an earlier session — see that file's own spec history). It already had
`representationId`, `representationRevision`, `inputRepresentationId`/`inputRepresentationRevision`,
`workspaceRevision` (schema-enforced `sha256:`-prefixed), `sourceRevisionDigest` (same),
optional bounded-execution coordinates (`candidateSnapshotRevision` + `ordinalMapChecksum`),
`producerId`/`producerRevision`, `modelRevision`, `parametersDigest`, `inputDigest`,
`inputPopulationChecksum`, `outputDigest`, `tensorDigest`/`artifactDigest`, and
`canonicalAuthority: literal(false)` enforced via `assertPromotionReadyRepresentationArtifact()`.
**Genuinely missing were exactly the three fields the operator flagged**: `eligibleCount` and
`writtenCount` alongside the existing bare `rowCount`. Added both, plus a `superRefine` invariant
(`eligibleCount <= rowCount`, `writtenCount <= eligibleCount`) so a receipt claiming more writes
than eligible rows — or more eligible rows than the total population — fails schema validation
rather than silently passing. Added 3 new spec cases (eligibleCount-exceeds-rowCount rejection,
writtenCount-exceeds-eligibleCount rejection, zero-effective-write idempotent-replay acceptance).
6/6 tests pass (`npx vitest run representation-artifact-v1.spec.ts`). Still zero real producer
constructs one of these objects — the contract is schema-complete but remains unconsumed; that's
`LATENT-PHASE16-CONVERGENCE-01B`'s job (the wrapper around `backfill_latent_256.py`), not done here.

### LATENT64-STATE-RECON-01 (2026-09-02, done — READ-ONLY, root cause confirmed via git history)

**Question**: why does `codebase_chunk_index` have `latent_256` populated for 55,169/55,853 rows
but `latent_64` for only 200/55,853, given the current script writes both in the same `UPDATE`
statement per row?

**Method**: `git log --follow -p -- python/backfill_latent_256.py` (2 real commits total, not
assumed from file content alone).

**Root cause, confirmed not inferred**: the script has exactly two versions.
- `f144c4a1c8` (2026-08-29, "Add latent_256 backfill script, dry-run + 50-row apply proven") — this
  version's forward pass discards the latent_64 output (`latent256, _latent128, _latent64 =
  model.encode(tensor)`, underscore-prefixed = unused) and its `UPDATE` statement writes only
  `latent_256 = %s, latent_256_checkpoint_revision = %s` — **no `latent_64` column in the SQL at
  all**.
- `751ba21bc0` (2026-08-30, "Commit session BM25/latent-derive additions...") — rewrote the file to
  also persist `latent_64`, `latent64_model`, `latent_embedding_valid`, `latent_embedding_validated_at`.
- The full-corpus 55,169-row `latent_256` population was produced by (or before) the
  `f144c4a1c8` version, which structurally could not have written `latent_64` no matter how many
  rows it processed. The 200-row `latent_64` population is from a later, small run of the
  `751ba21bc0` version that was never scaled to the full corpus.

**Classification: `OLD_PRODUCER_VERSION`** (primary — the bulk of the gap is architectural, not a
data-quality accident) **with the 200-row subset being a `PARTIAL_LIMITED_RUN`** of the updated
script. Not `COLUMN_WRITE_FAILURE`, not `SCHEMA_MISMATCH`, not `CHECKPOINT_MISMATCH` — ruled out
by direct verification, not by elimination alone:
- **Same model checksum?** Yes — live query confirms `latent64_model` for all 200 rows equals
  `latent_256_checkpoint_revision` for those same 200 rows, both matching the training receipt's
  `model_checksum`. No checkpoint drift.
- **Same semantic_768 input population / same latent_256 rows?** Yes — live query confirms all 200
  `latent_64`-populated rows are a strict subset of the 55,169 `latent_256`-populated rows
  (`latent_64 IS NOT NULL AND latent_256 IS NULL` = 0 rows). No disjoint population.
- **Same producer code revision?** **No — this is the actual root cause**, per the git evidence
  above.
- **Expected latent_64 derivation deterministic?** Yes in principle — `model.eval()` mode (dropout
  disabled), pure forward pass, single checkpoint file, no stochastic component at inference time.
  Not independently re-verified by an actual second-run diff in this pass (that's what
  `LATENT-PHASE16-CANARY-01`'s replay proof is for), but nothing in the code path introduces
  non-determinism.

**Conclusion for the next gate**: the missing 54,969 rows are a **bounded, well-understood repair
population** — same checkpoint, same input source, same table, only a code-revision timing gap.
Per explicit instruction, **not bulk-filled here**. This becomes safe to execute only after
`LATENT-PHASE16-CONVERGENCE-01B`'s revision-qualified wrapper exists (so the repair run itself
emits a real `RepresentationArtifactV1` receipt) and `LATENT-PHASE16-CANARY-01` proves determinism
on a bounded cohort first.

**`.vscode/tasks.json` fix (2026-09-02).** Found and fixed a second, independent reason
`graphify:daily` was not firing on startup: the `"🗺️ Startup: Auto-Map Codebase (graphify:daily)"`
task had no `runOptions.runOn: "folderOpen"` of its own — it only ran indirectly via
`dependsOn` from `"🗂️ Startup: Parent Atlas Refresh"`. Added `runOptions: {"runOn": "folderOpen",
"instanceLimit": 1}` directly to the graphify:daily task so it fires independently on every
workspace open, not contingent on another task's indirect trigger chain succeeding first.

**Two minor data-quality anomalies from this run, flagged not fixed.** Full error scan of
`tmp/graphify-daily-run.log` found nothing beyond the `LATENT_LEGACY_WRITER_APPLY_BLOCKED` halt
above, plus: (1) `atlas:phase8:step3:langextract:apply` skipped one packet
(`sha256:4ff58c17ae76b8b115e4cd94`) — missing `source_ref`/`feature_id`, correctly self-reported as
skipped rather than crashing. (2) `atlas:summary:envelopes:build:apply` quarantined one packet
(`packet:85c18f8d09ac`, `sourceRef=sveltekit-frontend/artifacts/cs_domain_hierarchy_v1.json`) —
missing `title_id`, correctly quarantined rather than silently dropped. Both are single-row,
non-blocking, and each pipeline's own validation caught them as designed (fail-closed, not
fail-silent). Not investigated further this pass — worth checking whether these are the same
underlying malformed packet (both are `atlas_packets` rows missing required fields) if this
recurs on a future `graphify:daily` run.

## RF-QDRANT-HYDRATION-02 (2026-09-02, done — WIRED, not yet DEDUP_PROVEN)

Read-only discovery first: `ProjectionRegistryV1` (`sveltekit-frontend/src/lib/server/atlas/retrieval/projection-registry-v1.ts`)
already exists, is fully tested (`projection-registry-v1.spec.ts`), and already matches the target
hydration ontology exactly — canonical packet identity + representation identity resolves to a
projection coordinate, validated against the live Qdrant point's own `postgres_id` payload rather
than trusted blindly (the exact anti-pattern that produced the earlier 7,773-row stale-payload
finding). It had **zero production callers** — a correctly-designed, fully dead path. This is the
real RF-QDRANT-HYDRATION-02 finding, not "needs to be built from scratch."

Wired it (smallest necessary integration, no new abstraction, no V3):
- `retrieve-candidates.ts::retrieveQdrant` (the `semantic_768`/`codebase_chunks_768_v2` dense lane
  — matches `ProjectionRegistryV1`'s declared scope exactly) now calls a new
  `hydrateCanonicalChunkIds()` helper on both its primary and dense-only-fallback return paths,
  right before returning candidates.
- `hydrateCanonicalChunkIds()` batches by unique Qdrant point id (dedup first — `resolveProjectionsBatch`
  does not guarantee output order matches input order, so results are matched back by key, never
  by array position), calls `resolveProjectionsBatch()` once per `retrieveQdrant()` invocation, and
  sets a new `Candidate.canonicalChunkId` field ONLY on `ok: true` results.
- **Fail-open by design**: wrapped in try/catch: a `ProjectionRegistryV1` error (network, schema
  drift) never drops or blocks candidates already resolved via the existing V1
  `resolveCanonicalIdentity` precedence — it only adds evidence, never subtracts it.
- **Scope boundary honored**: `canonicalChunkId` is observability/evidence only in this step. It is
  NOT yet consumed by `resolveCanonicalIdentityV2` or by `fuseSearchRuntimeCandidates`'s dedup —
  that remains on the existing V1 `identityStatus` precedence, untouched. Wiring `canonicalChunkId`
  into V2-based dedup is a distinct, separate future step (not started), consistent with "don't
  create another identity abstraction, don't skip to bulk migration."
- 4 new focused unit tests added (`__tests__/qdrant-hydration.test.ts`): validated-attach,
  fail-open-on-throw, no-op-on-empty-list, dedup-into-one-lookup. `tsc --noEmit` clean on all 3
  touched files (`retrieve-candidates.ts`, `search-runtime.ts`, `projection-registry-v1.ts`); 38/38
  tests pass across the full identity/fusion/hydration suite set.

**Status honestly**: `WIRED` (per this repo's enforced status-language rules) — the hydration path
is live and observable on every dense-lane query, but not yet `DEDUP_PROVEN` (no live-traffic
evidence yet of how often `canonicalChunkId` actually resolves `ok: true` vs. `PROJECTION_NOT_FOUND`/
`CANONICAL_IDENTITY_MISMATCH` on real queries — that requires a live-replay proof, not claimed
here). Next: `RF5-LIVE-REPLAY-01` (in parallel per the frozen lane plan) and, separately, the
V2-dedup consumption step once hydration's real-traffic hit rate is observed.

## RF5-LIVE-REPLAY-01 (2026-09-02, done) — 1 real bug found and fixed, 2 cases already safe

Ran all 5 named hard cases from the fusion-reachability change's frozen RF5-LIVE-REPLAY-01 spec
against `fuseSearchRuntimeCandidates`, using fixture-based candidates (not live traffic replay —
"replay" here means replaying the invariant against representative synthetic inputs, consistent
with this session's fixture-first proof pattern elsewhere):

1. **Same entity via multiple Qdrant physical hits** — already correctly deduped (pre-existing
   `RF5 within-lane canonical dedup` test suite covers this; reasserted here for the record).
2. **Same entity via multiple backend-local IDs** — same as above, already correct.
3. **Same packet with multiple legitimate canonical chunks** — **real, live bug found and fixed**.
   `getFusionIdentityKey()` only ever considered `symbolVersionId || packetKey || id` — `packetKey`
   is file/packet-granular, not chunk-granular, so two genuinely distinct chunks of the same packet
   were silently collapsing into one fused result (dropping a legitimate hit). Fixed by making the
   `packetKey` tier check `canonicalChunkId` (RF-QDRANT-HYDRATION-02's hydrated, Qdrant-validated
   chunk identity) when present, producing a `packetKey::chunk:canonicalChunkId` composite key —
   purely additive: `canonicalChunkId` is unset on every candidate that existed before today's
   hydration wiring, so this is zero behavior change for all pre-existing traffic/tests. A control
   test confirms the fix disambiguates rather than over-splits (same packet+chunk pair from two
   lanes still dedupes to one vote).
4. **Same source_ref with different canonical chunks** — already safe by construction: any
   non-`'canonical'`-status candidate (including `source_group`) dedupes on its backend-local id
   (`fallback_id`/`qdrantPointId`), never on `source_ref` itself, so distinct chunks with a shared
   `source_ref` were never at risk of merging.
5. **Same content_hash but unproven hash domain** — already safe by construction, for a narrower
   reason than the spec anticipated: V1 fusion (the live path) never promotes `content_hash` to the
   `'canonical'` dedup tier at all (it is always `'projection_exact'`, which uses the backend-local
   key like case 4) — hash-domain qualification is a `resolveCanonicalIdentityV2`-only concept that
   is not yet wired into fusion, so the specific failure mode the spec worried about (a wrong-domain
   hash silently over-merging with a canonical entity) cannot occur on the current live path. This
   will need re-checking once/if `resolveCanonicalIdentityV2` is ever wired into fusion directly.

5 new tests added to `search-runtime-fusion.test.ts` (`RF5-LIVE-REPLAY-01` describe block); 43/43
tests pass across the full identity/fusion/hydration suite; `tsc --noEmit` clean on all 3 touched
files. Next per the frozen lane plan: OaK revision qualification (read-only, when convenient) —
`RF6-OWNER-MATRIX-01`/`RF6-LIVE-REPLAY-01` remain explicitly not started (RF6 is a separate,
larger per-pipeline census task, not implied by this task's completion).

## OaK revision qualification (2026-09-02, read-only, done) — bundle NOT authoritative, DAG-RUNTIME-01D.2 correctly stays blocked

Read-only qualification of the 4 revision legs `DAG-RUNTIME-01D.2` needs before a live replay is
eligible: source, candidate, graph, representation. No revision was fabricated; each finding below
cites the concurrent-session artifact it came from (all genuinely read-only: every one asserts
`writesPerformed: false`/`canonicalWritesAllowed: false`/`readOnly: true`).

- **Source revision — NOT unified.** Two different, non-interchangeable values exist:
  (1) `sha256:55edaaad...` (24,192 sources) — the value bound to the `graphify_runs` row, but that
  row is the same orphaned `RUNNING`/`completed_at: null` record found in this task's own
  `GRAPHIFY-STALE-RUN-RECON-01` track (see above) — `docs/reports/current-graphify-run-owner-v1.json`
  confirms `authoritativeGraphRun: false`, `graphRevisionAllowed: false`. (2) `sha256:8a3a9085...`
  (25,048 sources) — a freshly, correctly re-derived live workspace revision from
  `docs/reports/graphify-revision-owner-v2.json`, but explicitly `revisionOwnerProven: false` and
  `persistedMatchingRows: 0` (zero DB rows currently bound to it — `blockers:
  ["CONTROLLED_PERSISTENCE_CANARY_NOT_PROVEN"]`). Neither value is simultaneously live, complete,
  AND persisted/bound.
- **Candidate revision — real but out of scope for this bundle.** `candidateSnapshotRevision:
  "lineage-qualified-canary:sha256:...:v1:15"` (`docs/reports/current-candidate-feature-matrix-manifest-v1.json`,
  status `GRAPH_FEATURE_MATRIX_REPLAY_PROVEN`) — a genuine, bounded n=15 canary revision in its own
  independent namespace, not demonstrated to correspond to either source revision above.
- **Graph revision — explicitly fixture-only.** `astGraphRevision: sha256:914f8880...`
  (`docs/reports/ast-structural-revision-v1.json`) carries `status: "PROVEN_FIXTURE_ONLY"` in its
  own field — not a live-corpus revision by its own admission.
- **Representation revision — not separately catalogued this pass.** Dozens of reports reference
  `representationRevision`/`representation_revision` fields; no single dedicated
  "representation-revision-authority" report was found in a reasonable-effort search. Recorded
  honestly as unresolved rather than assumed absent or fabricated as present.

**Verdict: the complete 4-leg revision bundle is NOT authoritative** — each leg is independently
real evidence, but they do not currently form one mutually-consistent, live, persisted bundle (a
mix of stale/orphaned, fresh-but-unpersisted, bounded-canary-scoped, and fixture-only values).
Per the explicit instruction, `DAG-RUNTIME-01D.2` and any live `DAG-RUNTIME-01D.2`/`01E` work
remains correctly blocked — this qualification pass changes nothing about that gate, it only makes
the reason precise and evidence-linked instead of a general "not yet proven."

## PKT-LINEAGE-09 fresh historical classification (2026-09-02, read-only, done) — `READY_FOR_HISTORICAL_PROMOTION_AUTHORIZATION`

**Correction to this file's own prior "Lane A: CLOSED" characterization** (external review caught
this): PKT-LINEAGE-08's live-canary absence does not close Lane A. PKT-LINEAGE-09's fresh dry
classification was the actual next step, deliberately separable from 08's canary, and had not yet
been run. It has now been run.

**The frozen baseline's own producer script was not found anywhere in the repository** — searched
by filename (`packet-chunk-lineage-backfill-dry-01*`) and by distinctive field names
(`MEMBERSHIP_EXACT_REVISION_PROVEN`, `frozenAuthority`, `admittedPacketSetChecksum`) across
`scripts/atlas/*.mjs`/`*.mts`. Rather than treat this as a blocker, wrote an independent
reconstruction (`scripts/atlas/audit-pkt-lineage-09-fresh-classification-v1.mjs`) from the frozen
baseline's own documented methodology (same `frozenAuthority`: `atlas_packets`,
`codebase_chunk_index`, `graphify_files`; same exclusion of `atlas_packet_chunk_lineage` as
comparison-target-only) and ran it fresh, read-only, full population (no `LIMIT`).

**Headline result — exact match on every promotion-relevant number:**
```
                        baseline    fresh     match
population              61,660      61,660    YES
admittedPackets            577         577    YES
proposedMembershipRows   6,987       6,987    YES
```
**Real, explained discrepancy in the rejected-bucket split (not glossed over):**
```
                        baseline    fresh
namespaceUnproven         4,110      60,882
noMember                  56,973        201
```
Both splits independently sum correctly to 61,660 (`4,110+56,973+577` and `60,882+201+577`), so
this is a bucketing-order difference, not an arithmetic error. **My fresh split's 778 = 577+201
"namespace-proven" figure exactly matches `LINEAGE-01`'s independently-audited
`namespaceProven: 778, namespaceUnproven: 60,882`** (`docs/reports/lineage-01-source-namespace-revision-authority-v1.json`)
— now a third independent confirmation of the same 778/60,882 split. The original frozen baseline
evidently checked chunk-membership before namespace/revision proof (labeling anything with zero
chunk rows as `NO_MEMBER` regardless of namespace status), while this fresh classifier and
`LINEAGE-01` both check namespace/revision proof first. **Classified as `SAFE_EXPLAINED_DRIFT`, not
`UNEXPLAINED_DRIFT`**: the bucketing convention differs, but the set that actually gets promoted
(admitted packets + proposed memberships) is byte-for-byte identical either way.

**Live canonical comparison** against the existing `atlas_packet_chunk_lineage` table (which does
already have rows — from an earlier promotion event, not from this session):
```
alreadyCanonicalIdentical:      89   (existing rows the fresh proposal exactly reproduces)
newInserts:                  6,898   (would-be new rows, not yet applied)
conflicts:                       0   (no existing row disagrees with the fresh proposal)
deletesRequired:                 0   (required to be zero per the task spec — confirmed)
existingRowsNotInFreshProposal:  0
```

**Verdict: `READY_FOR_HISTORICAL_PROMOTION_AUTHORIZATION`.** Row-level checksums were NOT compared
against the baseline (its serialization method is unrecoverable without its source script) — only
aggregate counts and the live canonical table, which is a materially stronger evidence surface
than a stored checksum from unknown code anyway. Report:
`docs/reports/pkt-lineage-09-fresh-classification-v1.json`. **No historical write was performed or
proposed for execution — this is the dry classification only.** `PKT-LINEAGE-09` (apply),
`PKT-LINEAGE-10`, `PKT-LINEAGE-11` remain separately gated on explicit future authorization, per
the standing instruction that a promotion-ready classification is not itself an apply decision.

## PKT-LINEAGE-09-HISTORICAL-PROMOTION-01 (2026-09-02) — `HISTORICAL_LINEAGE_PROMOTION_PROVEN`, then PKT-LINEAGE-10 read-only

**Authorized and executed per explicit operator instruction.** This is the first production
database write of this session. Two scripts, run in sequence:

1. **`freeze-pkt-lineage-09-proposal-v1.mjs`** (read-only) — re-ran the classification and
   persisted the full 6,987-row proposal to `docs/reports/pkt-lineage-09-frozen-proposal-v1.json`
   (the aggregate summary artifact from the prior task did not itself contain the row-level data
   needed for apply to consume verbatim). Determinism check against the prior classification run
   passed on every field (population/admitted/membership-count/namespace-unproven/no-member all
   matched) — confirmed the live DB had not drifted since the dry classification.
2. **`apply-pkt-lineage-09-historical-promotion-v1.mjs`** — verified schema contract
   (`UNIQUE(packet_key, canonical_chunk_id)` present, `chunk_ordinal` nullable) and re-diffed the
   frozen proposal against the live `atlas_packet_chunk_lineage` table immediately before writing
   (0 conflicts found). Applied via 577 independent per-packet atomic transactions: `INSERT ...
   ON CONFLICT (packet_key, canonical_chunk_id) DO NOTHING`, then a same-transaction readback
   verifying the packet's complete membership set exactly matches the frozen proposal before
   `COMMIT` (any mismatch would `ROLLBACK` — none occurred).

**Apply result** (`docs/reports/pkt-lineage-09-historical-promotion-apply-v1.json`):
```
packetsProcessed: 577   rowsBefore: 89     rowsInserted: 6,898   rowsAlreadyIdentical: 89
rowsAfter: 6,987        rollbacks: 0       conflicts: 0          duplicatePairs: 0   syntheticIds: 0
verdict: HISTORICAL_LINEAGE_PROMOTION_PROVEN
```
**Replay result** (`docs/reports/pkt-lineage-09-historical-promotion-replay-v1.json`, idempotency
proof — the exact same apply run a second time):
```
rowsBefore: 6,987   rowsInserted: 0   rowsAlreadyIdentical: 6,987   rowsAfter: 6,987
rollbacks: 0   conflicts: 0   duplicatePairs: 0
verdict: HISTORICAL_LINEAGE_PROMOTION_PROVEN
```
No synthetic IDs, no source_ref fanout, no representative-chunk substitution, no deletion (`DELETE`
is never issued anywhere in the apply script), no writes to Qdrant/Neo4j/Redis — Postgres only.
The canonical 1:N packet→chunk bridge (`atlas_packet_chunk_lineage`) now exists for all 577
namespace+revision-qualified packets.

## PKT-LINEAGE-10 (BRIDGE-RECON-DRY-03) (2026-09-02, read-only, done)

Run immediately after the apply succeeded, per instruction. `scripts/atlas/audit-bridge-recon-dry-03-v1.mjs`
consumes **only** the physical `(packet_key, canonical_chunk_id, chunk_row_id)` rows from the
now-populated `atlas_packet_chunk_lineage` table — never `source_ref` fanout (a 30-membership file
packet yields exactly 30 membership mappings, not 30 guesses from a shared file path). Joins each
row's `chunk_row_id` (the `codebase_chunk_index.id` UUID) directly into live Qdrant
`codebase_chunks_768_v2`, per the proven `physicalPointId === canonicalPacketIdentity` mapping.

```
lineageRowCount: 6,987
EXACT_CANONICAL_MEMBERSHIP: 6,312   (point exists, self-consistent, payload not yet reconciled)
ALREADY_RECONCILED:             0   (expected — this is the first reconciliation pass)
QDRANT_POINT_MISSING:          675   (no live Qdrant point for this chunk_row_id at all)
PROJECTION_REGISTRY_MISSING:     0
PAYLOAD_IDENTITY_CONFLICT:       0
REVISION_MISMATCH:               0
FOREIGN_CHUNK:                   0
proposedMutationCount: 6,312 (payload patches only: packet_key/canonical_chunk_id/source_namespace/
                              source_revision — NOT proposed for the 675 missing points)
writesPerformed: false
```
Zero contradictory evidence (no identity conflicts, no revision mismatches, no foreign-chunk
attribution) — a clean result, not glossed over. Full classification + exact proposed mutation set
in `docs/reports/bridge-recon-dry-03-v1.json`.

**Per explicit instruction: stopping here.** `PKT-LINEAGE-11`/`RECON-CANARY-01` are NOT authorized
by this result — no Qdrant write was proposed for execution or applied. RF6 refactoring/RF7 were
not started. OaK remains `BLOCKED_REVISION_BUNDLE_UNPROVEN`. `graphify:daily` was not run.

## PKT-LINEAGE-11 (RECON-CANARY-01) (2026-09-02) — `RECON_CANARY_PROVEN`, the first Qdrant write

Authorized and executed per explicit operator instruction, immediately after `BRIDGE-RECON-DRY-03`.
Consumed **only** the existing `bridge-recon-dry-03-v1.json` classifications plus
`pkt-lineage-09-frozen-proposal-v1.json` (for `sourceNamespace`/`sourceRevision`) — no identity was
rediscovered from `source_ref`/`content_hash`/Qdrant payload during selection or mutation.

**Cohort** (6 points, deterministic, all restricted to `EXACT_CANONICAL_MEMBERSHIP` rows — zero
identity conflict, zero revision mismatch, zero foreign-chunk attribution per the dry run):
```
2× SINGLE_MEMBER  (packet:08007d10d8a0, packet:080a1ec5ed80)
2× FEW_MEMBER     (ace:packet:7802b2572378 — both of its 2 members, full packet)
2× MULTI_MEMBER   (ace:packet:0051e908c9be — 2 of its 30 members, sampled)
```
No point already carried the expected metadata (`ALREADY_RECONCILED` was 0 for the whole corpus
per the dry run), so the "one point tests no-op replay" ask was not satisfiable from live data —
noted honestly rather than fabricated; idempotency was instead proven by replaying the full canary
patch a second time (below).

**Per-point protocol**: fetch (payload+vector) → freeze preimage checksum → immediately-before-
write re-fetch and verify preimage unchanged (would abort as `PREIMAGE_DRIFT`, none occurred) →
`POST .../points/payload` (set-payload only — `packet_key`, `canonical_chunk_id`,
`source_namespace`, `source_revision`; never the vector, never the point ID, never other payload
fields) → readback verifying exact expected payload, unchanged vector fingerprint, unchanged
point ID.

**Apply result** (`docs/reports/pkt-lineage-11-recon-canary-01-apply-v1.json`):
```
selectedPoints: 6   pointsWritten: 6   readbackExact: 6
preimageDrift: 0   identityConflicts: 0   revisionMismatches: 0   foreignChunkIds: 0
vectorChanges: 0   pointIdChanges: 0   deletes: 0   unexpectedPayloadChanges: 0
verdict: RECON_CANARY_PROVEN
```
**Replay result** (`docs/reports/pkt-lineage-11-recon-canary-01-replay-v1.json`, same 6 points,
identical patch reapplied):
```
replayEffectiveChanges: 0   (all other fields identical to apply — see above)
verdict: RECON_CANARY_PROVEN
```
The 675-row `QDRANT_POINT_MISSING` cohort was never touched — no Qdrant point was created,
consistent with the explicit instruction that missing-point rows are a separate population
question (stale packets / intentionally unprojected chunks / incomplete projection / another
generation), not a reconciliation failure to be papered over.

**Per explicit instruction: stopping here.** Full Qdrant reconciliation (the remaining 6,306
`EXACT_CANONICAL_MEMBERSHIP` rows) is NOT authorized by this canary — it requires a separately
authorized, refreshed full dry reconciliation against these now-proven mutation semantics first.
`RF7` not started. OaK remains `BLOCKED_REVISION_BUNDLE_UNPROVEN`. `graphify:daily` not run.

## BRIDGE-RECON-DRY-04 / FULL RECONCILIATION (2026-09-02) — proven with bounded resume

The fresh read-only gate consumed only `atlas_packet_chunk_lineage` membership rows and the
proven Qdrant physical-point mapping. It classified every row without source-ref fan-out:

```
ALREADY_RECONCILED:   6 before apply; 6,312 after apply
EXACT_PATCH_REQUIRED: 6,306 before apply
QDRANT_POINT_MISSING: 675 (untouched)
PREIMAGE_DRIFT:       0
IDENTITY_CONFLICT:    0
REVISION_MISMATCH:    0
FOREIGN_CHUNK:        0
```

The authorized apply changed only the approved lineage payload fields for the 6,306 present
points. A transient readback failure halted the first pass before continuation; the resumable
apply then completed with 3,564 effective changes and 2,742 exact idempotent skips. All 6,306
targets passed payload, vector, and point-ID readback. No missing points were created and no
points or vectors were deleted or replaced. See:
`docs/reports/bridge-recon-dry-04-v1.json`, `docs/reports/bridge-recon-apply-v1.json`.

The post-apply audit found 6,312 already reconciled points and the same 675 missing physical
points. The replay target was reconstructed from the prior dry-03 classifications because the
post-apply audit overwrote the serialized dry-04 patch list. It produced zero effective changes
and exact readback for all 6,312 targets; this is recorded as a replay proof with that artifact
limitation, not as a claim that the original serialized 6,306-entry artifact was preserved:
`docs/reports/bridge-recon-replay-v1.json`.

Status: `FULL_QDRANT_LINEAGE_RECONCILIATION_PROVEN` for the 6,312 present projections. The 675
missing physical points remain a separate unresolved population and were not created. OaK
replay, RF6/RF7, graphify daily, and legacy cleanup remain stopped.

### QDRANT-VECTOR-WRITER-OWNER-01 (2026-09-02, read-only writer-ownership audit)

The "transient readback failure" above was investigated for root cause before accepting it as
benign, per explicit instruction not to promote "something else is rewriting this collection"
from inference to fact without tracing it. Read-only only; no scripts executed, no processes
touched, no mutation performed.

- **Live process/service census**: no running process (Node, Python, or Docker) currently reaches
  `codebase_chunks_768_v2`. The TurboVec sidecar targets the separate `codebase_chunks_768`
  collection at dim 64, not this one. No graphify/backfill/embedding job is currently alive.
- **Static writer census**: exactly one real `VECTOR_WRITER` found for this collection —
  `sveltekit-frontend/src/lib/server/ace/ace-materializer.ts` (`embedText()` →
  `qdrant.upsert('codebase_chunks_768_v2', {...})`). Structurally ruled out for this incident: its
  point IDs are minted as `` `${packetKey}:${Date.now()}` ``, which can never collide with the
  stable lineage-sourced UUIDs that showed the readback failure. Three other files
  (`qdrant-provision-768v2.mjs`, `qdrant-parity-repair-core.mjs`, `qdrant-summary-sync.ts`) were
  not deep-dived and are left `UNKNOWN`, not cleared.
- **Qdrant observation probe**: took 5 of the exact previously-failed physical point IDs, read
  vector fingerprint + `indexed_at` at T0, waited 6s, read again at T1 — `STABLE_DURING_PROBE`,
  zero change. `indexed_at` on all 5 reads `2026-07-29T17:0x`, over a month old and untouched by
  any of this session's activity (payload-only writes don't touch it).
- **Log/receipt correlation**: several of the exact point IDs that failed the first attempt's
  vector-fingerprint check later reported `skippedAlreadyApplied: true` in the successful run —
  meaning that write had already landed correctly before the failure was reported. The only code
  change between the failing and succeeding runs was adding a 5-attempt/250ms-backoff retry
  around the same fingerprint-equality check.

**Verdict: `VECTOR_DRIFT_NOT_CURRENTLY_REPRODUCIBLE`.** No external vector writer identified or
reproduced. **Correction (2026-09-02, external review)**: the original working label for this —
"a read-after-write consistency race" — overclaimed. Without timestamped same-process write/read
evidence, the correct label is `SUPERSEDED_TRANSIENT_READ_VISIBILITY_FAILURE`: the later evidence
proves the affected points had become reconciled and that retrying reads eliminated the symptom,
which is consistent with a read-after-write race, Qdrant visibility/eventual-consistency timing,
or overlap with the concurrent apply itself — but does not distinguish between them. 3 static
writer candidates were not fully cleared either. If this signal recurs, re-run this same audit
rather than assuming it is the same benign cause.

### PKT-LINEAGE-13 RECON-CLOSEOUT-01 (2026-09-02, read-only evidence freeze — no bulk mutation, no replay against the wrong population)

Closes the successful full Qdrant reconciliation above without recreating or rerunning the bulk
mutation. Read-only only: zero Qdrant reads/writes, zero Postgres reads/writes performed by this
step — all values sourced from already-existing local report artifacts. Script:
`scripts/atlas/freeze-pkt-lineage-13-recon-closeout-01-v1.mjs`. Result:
`docs/reports/pkt-lineage-13-recon-closeout-01-v1.json`.

**Step 1 — original 6,306-patch set recoverability**: `bridge-recon-apply-v1.json`'s `results`
array carries only `pointId, effectiveChange, skippedAlreadyApplied, exactPayload,
unchangedVector, unchangedId` for all 6,306 entries — no `packetKey`, `canonicalChunkId`,
`sourceNamespace`, `sourceRevision`, proposed payload, or `proposedPayloadChecksum`. Verdict:
`ORIGINAL_PATCH_SET_NOT_DURABLY_RECOVERABLE` — an audit-history defect, not a reason to doubt or
undo the already-proven mutation.

**Step 2 — frozen final-state evidence**: `lineageRows: 6,987`, `qdrantPresent: 6,312`,
`qdrantMissing: 675`, pre-apply `alreadyReconciled: 6` / `exactPatchRequired: 6,306`, apply
`effectiveChanges: 3,564` / `skippedAlreadyApplied: 2,742` / `readbackExact: 6,306` /
`vectorChanges: 0` / `pointIdChanges: 0` / `deletes: 0` / `missingPointsCreated: 0`, post-apply
`alreadyReconciled: 6,312` / `exactPatchRequired: 0` / `blockingCount: 0`.

**Step 3 — idempotency closeout, corrected**: the replay that actually ran
(`bridge-recon-replay-v1.json`) used the DRY-03 reconstruction fallback — **not** the original
6,306-patch artifact. DRY-03 predates the six RECON-CANARY-01 writes and is a different, smaller,
earlier target population than the real bulk proposal it superseded; its
`source_namespace`/`source_revision` values are also pulled live from the current point rather
than from the lineage table, making its zero-change result close to tautological. **This does not
prove the original 6,306-patch set replays idempotently** — it proves a different, smaller
historical population stayed stable, which is a weaker and distinct claim, explicitly not treated
as equivalent. `originalPatchSetReplayVerdict: ORIGINAL_PATCH_SET_REPLAY_UNPROVEN`.

In place of a fabricated exact replay, a read-only idempotency **state** proof was used instead:
the post-apply `BRIDGE-RECON-DRY-04` rerun (`generatedAt: 2026-09-02T02:57:36Z`) is itself a fresh,
independent, live-Qdrant + live-Postgres-lineage comparison — not a self-report by the apply
script — and it shows all 6,312 present canonical memberships already equal their authoritative
lineage payload (`ALREADY_RECONCILED === qdrantPointsFound`, `EXACT_PATCH_REQUIRED: 0`).
`FINAL_STATE_IDEMPOTENCY_PROVEN`.

**Step 4 — lifecycle defect, recorded for future protocol only, no retroactive change**:
`bridge-recon-dry-04-v1.json` is a single mutable path both the dry classifier and the apply
script read/overwrite in place, so the exact proposal an apply consumed cannot be recovered once a
later dry rerun overwrites it. Future protocol should emit immutable versioned artifacts per run
(e.g. `bridge-recon-dry-05-v1.json`, `bridge-recon-apply-<runId>-v1.json`) and have apply/replay
receipts record `consumedProposalChecksum` / `consumedTargetPointSetChecksum`. Historical evidence
is not altered by this recommendation.

**Step 5 — attribution**: `BRIDGE-RECON-DRY-04`, the 6,306-patch apply, and the DRY-03-fallback
replay were executed by a concurrent process/session outside this session's authorization chain.
This session performed only: `PKT-LINEAGE-09` historical promotion, `PKT-LINEAGE-10`
`BRIDGE-RECON-DRY-03` (read-only), `PKT-LINEAGE-11` `RECON-CANARY-01` (the 6-point canary
apply+replay), `CONCURRENT-RECON-STATE-AUDIT-01`, `QDRANT-VECTOR-WRITER-OWNER-01`, and this
`PKT-LINEAGE-13` evidence freeze — all read-only except the bounded canary. This session did not
author or authorize the concurrent bulk apply or its replay.

**Final verdict: `FULL_QDRANT_LINEAGE_RECONCILIATION_STATE_PROVEN` /
`AUDIT_REPLAY_INCOMPLETE_ORIGINAL_ARTIFACT_NOT_DURABLE`.** The live reconciliation itself is
effectively complete and independently state-verified; the audit trail proving the *original*
6,306-entry proposal specifically (rather than the current live state) is not durable, which is a
recordkeeping gap, not an open correctness risk. Stopping here. Not rerunning bulk reconciliation.
Not touching the 675 `QDRANT_POINT_MISSING` rows. `RF6`/`RF7` not started. ACE not resumed.
`graphify:daily` not run.

### QDRANT-POINT-MISSING-POPULATION-01 (2026-09-02, read-only characterization, closes the "separate unresolved population" question)

The 675 `QDRANT_POINT_MISSING` rows left untouched throughout this track were left as an open
question ("stale packets / intentionally unprojected chunks / incomplete projection / another
generation"). Characterized read-only, zero Postgres/Qdrant writes. Script:
`scripts/atlas/audit-qdrant-point-missing-population-v1.mjs`. Result:
`docs/reports/qdrant-point-missing-population-01-v1.json`.

- All 675 rows exist in Postgres `codebase_chunk_index` (`not_in_pg_at_all: 0`).
- All 675/675 (100%) carry `embedding_eligible = false` — a clean, total correlation, not a
  partial or coincidental one.
- Ruled out an identity-column mismatch before accepting this at face value: sampled 25 rows'
  `qdrant_id` column values (distinct from the `id` column used as `chunk_row_id` throughout this
  track) and confirmed Qdrant has no point under those IDs either
  (`foundInQdrantUnderQdrantIdColumn: 0`) — this is not a case of the lineage table pointing at
  the wrong UUID column.
- Distribution: 517 under `sveltekit-frontend/`, 152 under `scripts/`, 4 under `src/`, 2 under
  `simd-bridge/` — consistent with test/tooling/script files being excluded from embedding, not
  core application code.
- **Verdict: `MISSING_POPULATION_EXPLAINED_BY_EMBEDDING_ELIGIBILITY_POLICY`.** The Qdrant mirror
  correctly reflects Postgres's own eligibility policy; this is not a reconciliation defect.
- **Open anomaly, flagged not fixed**: 28 of the 675 (all under `sveltekit-frontend/`) have a
  non-null `content_embedding` in Postgres despite `embedding_eligible = false`. Not investigated
  further — would require reading the ingestion/eligibility-policy code, out of scope for this
  read-only characterization.

**Mismatch follow-up 2026-09-02:** the 28-row anomaly was characterized without mutation by
`scripts/atlas/audit-embedding-eligibility-mismatch-v1.mjs`, producing
`docs/reports/embedding-eligibility-mismatch-v1.json`. All 28 have 768-dimensional Postgres
`content_embedding` values, `embedding_model = embeddinggemma:latest`,
`embedding_normalized = true`, and no `content_embedding_768` value; all 647 remaining rows have
neither vector. The result is `ELIGIBILITY_VECTOR_STATE_MISMATCH_REQUIRES_POLICY_AUDIT`.
This is evidence of a producer/eligibility-policy mismatch, not evidence that the rows are
eligible for Qdrant projection. Keep backfill and projection blocked until the writer and policy
owner are traced.

The mismatch receipt also records that the 28 rows have no `source_ref`, so they are not currently
eligible for canonical source/revision admission even if a future policy decision permits their
embedding state. Their vectors must remain diagnostic legacy state until source identity is proven.

**Legacy path bridge check 2026-09-02:** a read-only lookup found one
`graphify_files` record for the shared relative path, but its `content_hash`
(`57a4837b...`) differs from the hashes on the 28 vector rows. The receipt
`docs/reports/legacy-embedding-lineage-bridge-v1.json` therefore classifies
this as `PATH_ONLY_BRIDGE_FOUND_SOURCE_IDENTITY_STILL_UNPROVEN`. Do not reuse
that record or infer chunk identity from path/workspace revision alone.

**Prevention repair 2026-09-02:** the active writer was traced to
`scripts/atlas/backfill-graphify-file-embeddings-768.mjs`. Its prior selection predicate checked
only `content_embedding IS NULL`, recency, and non-empty source text; it did not enforce the
eligibility policy. The predicate now also requires `embedding_eligible = true`. This prevents
future ineligible rows from receiving `content_embedding` through this writer. The existing 28
rows remain unchanged and require a separate policy decision; this patch is not a backfill,
cleanup, or projection authorization.

This closes the population question this track raised without touching Qdrant or Postgres.

**Current-population audit correction 2026-09-03:** the first rerun of
`audit-qdrant-point-missing-population-v1.mjs` silently read its historical fixed input
`bridge-recon-dry-04-v1.json`, so its 675-row result was not evidence about the current
7,421-membership state. The audit now accepts `--artifact-path` and records
`sourceArtifactPath`; rerunning against `docs/reports/bridge-recon-dry-05-v1.json` produced
`docs/reports/qdrant-point-missing-population-02-v1.json` read-only:

- 1,109 missing physical points, all present in Postgres and all `embedding_eligible = false`;
- 0 eligible rows, 0 missing Postgres rows, and 0 sampled points found under the alternate
  `qdrant_id` values;
- 462 rows nevertheless have a non-null legacy `content_embedding` despite ineligibility,
  so the eligibility/vector-state anomaly remains open and is not a projection authorization;
- verdict remains `MISSING_POPULATION_EXPLAINED_BY_EMBEDDING_ELIGIBILITY_POLICY` for the
  missing-point classification, with the 462-row producer/policy mismatch explicitly flagged;
- no Postgres or Qdrant writes. `RETRIEVAL-01L` remains open pending a non-empty immutable
  proposal, authorized apply, exact readback, rollback artifact, and same-proposal replay.

The companion mismatch audit was given the same explicit-artifact inputs and produced
`docs/reports/embedding-eligibility-mismatch-02-v1.json`: 462 mismatches, verdict
`ELIGIBILITY_VECTOR_STATE_MISMATCH_REQUIRES_POLICY_AUDIT`. This confirms the anomaly is current
for the 1,109-row population, while retaining the prior conclusion that no vector should be
projected or repaired until eligibility and source-lineage policy ownership is proven.
The report identifies `scripts/atlas/backfill-graphify-file-embeddings-768.mjs` as the current
guarded writer (`content_embedding IS NULL AND embedding_eligible = true`) and records historical
commit `ee807652571` as having omitted that guard. All 462 mismatches also lack `source_ref`, so
they remain unqualified legacy vector state; this traces the likely producer defect but does not
authorize cleanup, eligibility changes, or Qdrant projection.

## Validation record

- [x] OpenSpec validation passes for proposal/design/tasks/spec consistency.
  Verified with the installed CLI using `openspec validate parent-atlas-retrieval-lineage-dag-convergence --type change --strict --json` (1/1 change passed).
- [ ] All completed items above have linked reports, not merely code existence.
  **Interim spot-check run 2026-09-02 (read-only, not the final checkoff — boxes above stay
  unchecked until a deliberate full pass)**: `scripts/atlas/audit-tasks-md-evidence-links-v1.mjs`
  grouped every `[x]` bullet with its full continuation text and checked for a `docs/reports/*.json`
  path, a backticked source-file path, or an explicit test-pass count. 19/30 real checked items
  cite real evidence. 11 do not: `RETRIEVAL-01A`, `RETRIEVAL-01B`, `RETRIEVAL-01C`,
  `RETRIEVAL-01D`, `RETRIEVAL-01E`, `DAG-RUNTIME-01D.1`, `PKT-LINEAGE-02`, `PKT-LINEAGE-03`,
  `PKT-LINEAGE-04`, `PKT-LINEAGE-11` are one- or two-line "was proven"/"proven previously"
  assertions with no file path, report reference, or test count anywhere in their block — bare
  claims, not linked evidence, even though the underlying work may well be real. This is a real
  gap this validation item exists to catch, not a false positive from the checker (each was
  manually spot-checked). Not resolved this pass — resolving it means either finding/adding the
  actual evidence reference for each of the 11, or downgrading them to `[ ]` if no evidence can be
  recovered. Left for the deliberate final pass this validation item is scoped for.
- [ ] No database, Qdrant, graph, cache, or production mutation occurs during
  read-only gates.
  **Interim spot-check run 2026-09-02**: this evidence-synchronization pass itself performed zero
  Postgres/Qdrant/Neo4j/Valkey writes (checkbox-state and status-label edits to this file only).
  The one authorized exception in this file's own history is `PKT-LINEAGE-11 RECON-CANARY-01`
  (6-point bounded Qdrant canary, explicitly separately-authorized, already documented as such at
  its own bullet and in `RETRIEVAL-01K` above) — correctly the only mutation among the gates this
  file tracks. Not a full line-by-line audit of every `[x]` item's underlying script for stray
  writes; that deeper check is left for the deliberate final pass.

## GRAPHIFY-RECOVERY-CROSSREF-01 (2026-09-02, done — READ-ONLY, no boxes checked, cross-reference only)

**Purpose**: `openspec/changes/parent-atlas-graphify-recovery-proof-ladder/tasks.md` (18 phases,
portfolio-audit-reported "0/9") describes Graphify recovery work independently. Before creating
more recovery gates under this file's own authority, check whether that ladder's 18 phases already
describe — or would duplicate/compete with — the `LATENT-PHASE16-*` / `LATENT64-STATE-RECON-01` /
stale-run-reconciliation / startup-fix work done in this file today. Per instruction: no boxes
checked in either file, this section only records the classification.

**The "0/9" is a measurement artifact, not a true completion score.** The proof-ladder file has 18
narrated phases, most already `PASS`/`PARTIAL_PROVEN`/`DONE, VERIFIED LIVE` in prose — but the
portfolio scanner apparently only counts literal `- [ ]` markdown checkboxes, and the file has
exactly 9 of those, all in one unrelated section (`## Neo4j → Qdrant fan-out lane`, line ~516-537),
none checked. Reading the whole file shows substantially more real progress than "0/9" implies.
Recorded here so nobody reads "0/9" and assumes near-total non-progress.

| Ladder phase | Its own status | Classification vs. today's `parent-atlas-retrieval-lineage-dag-convergence` evidence |
|---|---|---|
| Phase 1 — inventory real execution chain | DONE this session (their own) | `PARTIALLY_PROVEN` — complementary, not duplicate. Their inventory covers the whole 11-stage daily chain at a shallow level; today's `LATENT-PHASE16-OWNER-01` traced the phase-16 latent step specifically to file/field/table depth they didn't reach. |
| Phase 2 — proof-ladder runner (`validate-parent-atlas-integration-proof.mjs`) | PASS (extended, not runtime-proven end to end) | `OUT_OF_SCOPE` — a generic gate-runner tool; current authority's work doesn't depend on or use it. |
| Phase 3 — coordinator lock | PASS (PID-based file lock, `.graphify-daily-start.lock`) | `STILL_REQUIRED` to cross-check, not `OUT_OF_SCOPE` by evidence — **today's stale-run recon checked a *different* file**, `.tmp/graphify-daemon.pid` (found stale, PID 11724 not running, dated June 28), never `.graphify-daily-start.lock`. These may be two distinct lock mechanisms; not conflated here, not reconciled either. Does not block `LATENT-PHASE16` convergence either way. |
| Phase 4 — feature-envelope lock/concurrency | `PARTIAL_PROVEN` (real 2-process race test) | `PARTIALLY_PROVEN` — unrelated proof surface (concurrency guarantees vs. today's single real run), complementary not duplicate. |
| Phase 5 — diagnose competing writers | WIRED, RAN_LIVE_ONCE (single point-in-time snapshot, no contention observed) | `OUT_OF_SCOPE` for the current P0 — real, useful, but not on the latent/phase16 critical path. |
| Phase 6 — feature-envelope writes deterministic | DONE, VERIFIED LIVE (`--apply --limit=5` proof) | `ALREADY_PROVEN_BY_CURRENT_AUTHORITY` — today's real, independent `graphify:daily` run re-confirms this exact fact at full scale: 61,661/61,661 packets carry a feature envelope, recorded in this file's own "graphify:daily real-run result" entry above. Same conclusion, fresh independent evidence, no conflict. |
| Phase 7 — feature-envelope proof report | NOT STARTED | `OUT_OF_SCOPE` for current P0 — not blocking, not produced by today's work either. |
| **Phase 8 — latent-backfill diagnostic** | `PARTIAL_PROVEN`, entirely scoped to **`backfill-latent-vectors.mjs`** (default limit, batch size, resume/checkpoint, memory bounds) | **`SUPERSEDED`** — this is the exact same script `LATENT-PHASE16-OWNER-01` classified today as `LEGACY_SEMANTIC_LATENT_PRODUCER`: wrong table (`atlas_packets.latent_64` bytea), wrong input source (Qdrant not Postgres), no real model/workspace revision. Today's evidence concluded this script should be *replaced* by `backfill_latent_256.py` (`LATENT-PHASE16-CONVERGENCE-01B`), not hardened. Continuing Phase 8's diagnostic work on the legacy script would invest effort in a producer current authority has already decided not to keep as phase16's long-term owner. |
| **Phase 9 — bounded streaming latent backfill** | `PARTIAL_PROVEN`, same legacy script | **`SUPERSEDED`**, same reasoning as Phase 8. |
| **Phase 10 — latent-backfill tests** | NOT STARTED, same legacy script | **`SUPERSEDED`**, same reasoning. |
| Phase 11 — foreground Graphify proof run | NOT STARTED (gated behind Phases 8-10 in their own plan) | `PARTIALLY_PROVEN` — today's real `graphify:daily` run *was* a genuine foreground run (not backgrounded, real exit code, real log) and produced real evidence (6/11 steps, halt at phase16), even though it wasn't gated behind the ladder's own prerequisite chain and didn't complete. `STILL_REQUIRED` to actually finish once `LATENT-PHASE16-CONVERGENCE-01` closes — this is precisely what "then rerun `graphify:daily`, prove all 11/11" in this file's own updated order already commits to doing. |
| Phase 12 — atomic artifact publication | NOT STARTED | `OUT_OF_SCOPE` for current P0. |
| Phase 13 — verify downstream artifacts | NOT STARTED | `OUT_OF_SCOPE` for current P0. |
| Phase 14 — Studio lane integration | NOT STARTED | `OUT_OF_SCOPE` for current P0. |
| Phase 15 — tRPC read API | NOT STARTED | `OUT_OF_SCOPE` for current P0. |
| Phase 16 (their numbering — OpenTelemetry) | NOT STARTED | `OUT_OF_SCOPE`. **Naming collision flagged, not a real relationship**: this ladder's own "Phase 16" (OpenTelemetry spans) has nothing to do with `atlas:phase16:latent:apply`'s "phase16" (the daily-chain step 6/11 numbering) — pure numeric coincidence between two unrelated numbering schemes. Do not conflate when reading either file. |
| Phase 17 — proof-ladder tests | NOT STARTED | `OUT_OF_SCOPE`. |
| Phase 18 — deliverables | PARTIAL (most report artifacts not written) | `OUT_OF_SCOPE` for current P0, real outstanding work in the ladder's own scope. |
| "Scoped codebase-graph.json refresh" addendum (H1-H14) | H1-H5, H12 `PROVEN`; H6-H11, H13-H14 not exercised; **known outstanding risk: the live canonical `docs/graph/codebase-graph.json` is still a corrupted 13-file artifact from an orphaned-probe incident, never repaired** | `STILL_REQUIRED` / distinct open risk, **not touched or known-to by today's `graphify:daily` run** — that run's own log was not checked against whether it exercised `index-codebase-fast.mjs`'s `--publish-canonical` path (H13). Not verified either way this pass; flagged, not resolved. |
| "Neo4j → Qdrant fan-out lane" (the 9 unchecked `- [ ]` items) | 0/9, explicitly `queued behind control-plane proofs` in the ladder's own text | `OUT_OF_SCOPE` for current P0 — separate lane (graph→Qdrant projection fan-out), not latent/phase16-related. This is the literal source of the portfolio tool's "0/9" reading. |

**Net read**: the proof-ladder file is not a competing Graphify-lifecycle authority that needs
reconciling wholesale — most of its scope (Studio UI, tRPC, OpenTelemetry, artifact-publication
safety, fan-out lane) is genuinely orthogonal to the current P0. The one substantive overlap is
Phases 8-10, and today's evidence resolves that overlap by superseding them (the legacy script they
were about to harden is being replaced, not hardened) rather than leaving two plans pointed at the
same script. `parent-atlas-retrieval-lineage-dag-convergence` remains the single current execution
authority for the latent/phase16/lineage blocker; `parent-atlas-graphify-recovery-proof-ladder`
is correctly read as an evidence/dependency provider for the unrelated lanes it covers (feature-
envelope concurrency proof, codebase-graph.json publication safety, coordinator locking), not a
second lifecycle authority. No boxes checked in either file this pass, per instruction.

## LATENT-SCHEMA-ALIGN-01 (2026-09-02, done — declaration-only, no migration)

**Corrected the false comment found during `LATENT-PHASE16-OWNER-01`**: `schema-postgres.ts`
claimed `latent_128/latent_64 are NOT stored separately: they're free prefix+renormalize views of
latent_256, derived at query time` — live Postgres has a real, indexed, populated `latent_64
vector(64)` column plus 6 supporting columns Drizzle never declared at all. The claim was only
half wrong: `latent_128` genuinely has no Postgres column (confirmed — `backfill_latent_256.py`
keeps it in-memory only), but `latent_64` does.

**Added 7 columns to `codebaseChunkIndex` in `sveltekit-frontend/src/lib/server/db/schema-postgres.ts`**,
types matched exactly against live `\d codebase_chunk_index` output (not guessed):
`latent64` (`vector(64)`), `latent64Model` (`text`, default `'packet-autoencoder-768-64'`),
`latent64Meta` (`jsonb`, default `'{"gates": {}, "validated_at": null}'::jsonb`),
`latent64ValidatedAt` (`timestamptz`), `latent64Msgpack` (`bytea`, via a local `customType` helper
matching the existing pattern already used in `schema/atlas-packets.ts` and
`schema/packet-binary-registry.ts` — not centralized, consistent with existing repo convention,
not fixed here), `latentEmbeddingValid` (`boolean`), `latentEmbeddingValidatedAt` (`timestamptz`).
Added `customType` to the file's `drizzle-orm/pg-core` import list.

**Explicitly not declared**: the 4 live HNSW/checksum indexes on these columns
(`idx_codebase_chunk_latent64_hnsw`, `idx_codebase_chunk_latent_valid`,
`idx_codebase_chunk_latent_256_hnsw`, `idx_codebase_chunk_latent_256_checkpoint_revision`) —
consistent with this repo's own established convention (documented in project CLAUDE.md) of
keeping HNSW/GIN indexes in manual SQL rather than Drizzle's `index()` API, which cannot express
`vector_cosine_ops`/`halfvec_cosine_ops` opclasses. Declaring them incorrectly (as plain B-tree)
would be worse than not declaring them at all.

**No migration created or run** — every column added already exists on the live table; this is
declaration-alignment only, per explicit instruction and this repo's own Drizzle Safety Rule
(never blindly regenerate migrations against live tables).

**Verification**: IDE TypeScript diagnostics re-scanned the file after the edit and no longer flag
the `Cannot find name 'bytea'` error that appeared mid-edit (before the `customType` import/const
landed). Also ran a full-repo `npx tsc --noEmit` (backgrounded, completed after this section was
first drafted) and grepped its output for `schema-postgres.ts` — **zero matches**, i.e. zero
TypeScript errors attributed to this file post-edit, despite this repo's large pre-existing
baseline error count elsewhere (documented in project CLAUDE.md history). Both checks agree: clean.

## LATENT-PHASE16-CONVERGENCE-01B (2026-09-02, wrapper built; direct npm wiring proven, daily orchestrator handoff OPEN)

**Built** `scripts/atlas/latent256-revision-qualified-wrapper.mts` — the revision-qualified owner
of the phase16 latent step, replacing `backfill-latent-vectors.mjs` as the pipeline's target. Thin
by design: does not derive workspace/repository identity, source snapshot identity, semantic input
revision, model checksum, producer revision, or input population checksum itself — the caller must
supply a frozen corpus input bundle, or the wrapper
fails closed before spawning any subprocess or touching Postgres beyond a read.

Fail-closed guards, all live-tested this pass (not just code-read):
- Missing any of the 8 required corpus input flags → exit 1, `LATENT256_WRAPPER_FAIL_CLOSED`, zero DB
  connection attempted. Verified: `npx tsx .../latent256-revision-qualified-wrapper.mts` with no
  args → exit 1, correct message.
- `--legacy-unsafe-apply` is never accepted, even if passed — hard-refused before any other check.
  Verified: passing it alone → exit 1, refusal message, no fallthrough to the missing-flags check.
- `--apply` without an explicit `--limit` → exit 1, refused. **This is the guard that prevents the
  wrapper from ever being used to bulk-fill the 54,969-row `latent_64` gap found in
  `LATENT64-STATE-RECON-01` before `LATENT-PHASE16-CANARY-01` proves determinism.** Verified with
  all 4 corpus revision flags present + `--apply`, no `--limit` → exit 1, correct refusal.
- A full dry-run with all 4 corpus revision flags supplied (fabricated test values, not real workspace/
  source revisions) ran end-to-end: real Postgres read (`rowCount: 55853, eligibleCount: 54969` —
  matching `LATENT64-STATE-RECON-01`'s numbers exactly, independent confirmation), real
  `python/backfill_latent_256.py` subprocess invocation in dry-run mode, real
  `RepresentationArtifactV1` construction, Zod-validated
  (`RepresentationArtifactV1Schema.parse()` + `assertPromotionReadyRepresentationArtifact()`, both
  passed), written to `docs/reports/latent-phase16-representation-artifact-<runId>.json`. Because
  this run used fabricated test revision strings (`sha256:test-workspace-canary` etc., not real
  values), the output was moved to `docs/reports/smoke-tests/latent256-wrapper-smoke-test-fabricated-revisions.json`
  and must not be read as a real canary result — `LATENT-PHASE16-CANARY-01` (next) needs to supply
  real revision values, not this smoke test's placeholders.

**`inputDigest`/`outputDigest`/`tensorDigest` are real, not placeholders**: `inputDigest` = sha256
over the newline-joined, id-ordered eligible cohort (captured from Postgres *before* invoking the
producer, so it's provably tied to the population this run actually considered).
`outputDigest`/`tensorDigest` = sha256 over the touched rows' identity+revision fields and raw
latent vector text respectively, re-queried *after* the producer runs. `artifactDigest` = sha256
over the rest of the artifact object, computed last.

**Direct `package.json` wiring**: `atlas:phase16:latent:dry` and `atlas:phase16:latent:apply` (the exact
targets `graphify:daily`'s fanout chain step 6/11 invokes) now point at the new wrapper via
`npx tsx`. The old legacy script is preserved, not deleted, under a new
`atlas:phase16:latent:legacy:dry` script name (dry-run only — no `:apply` variant added for it,
since real writes through the legacy path should never be an npm one-liner). **Live-verified**:
`npm run atlas:phase16:latent:apply` from `sveltekit-frontend/` (matching exactly how the daily
fanout invokes it) → exit 1, fails closed on missing revision flags — same protective outcome as
before, now for the architecturally correct reason and from the correct owner, not
`LATENT_LEGACY_WRITER_APPLY_BLOCKED` anymore.

**Status correction**: this proves the direct npm scripts resolve to the new owner, but it does
**not** prove the daily fanout can execute it. The fanout currently passes only the script name to
the package runner; it does not yet provide the required workspace/repository identity, source
snapshot identity, semantic input revision, model checksum, producer revision, and input
population checksum values. Keep
this sub-gate open for the orchestrator handoff rather than calling the whole pipeline wired.

**Deliberately not done this pass** (per instruction — canary comes first): no real revision
values were computed or supplied; no rows were written to `codebase_chunk_index` by this wrapper;
`graphify:daily`'s own orchestrator/fanout script was NOT modified to supply real revision
arguments to this step — that remains a distinct, later wiring gap (the orchestrator currently
calls this step with no extra args at all, so a real `graphify:daily` run today would still fail
closed here, just via the new wrapper's missing-flags guard instead of the old
`LATENT_LEGACY_WRITER_APPLY_BLOCKED` message). Closing that gap is implied by "rerun graphify:daily"
in the ordered plan but not explicitly its own named gate yet — flagged here so it isn't lost.

### LATENT-PHASE16-CONVERGENCE-01B.1 (2026-09-02, done — ownership boundary corrected, code-only, no execution)

**Operator correction applied**: 01B's wrapper let the caller assert `producerRevision` as an
arbitrary string and had no `transformPolicyRevision` field at all — meaning
`representationRevision` was derivable from a caller-supplied lie, and had no way to reflect a
change to normalization/prefix semantics/dtype/postprocessing that didn't also change the model
checksum. Corrected both.

**`RepresentationArtifactV1Schema`** (`sveltekit-frontend/src/lib/server/atlas/tensors/representation-artifact-v1.ts`):
added `transformPolicyRevision: z.string().min(1)` as a required field, documented as "identity of
the frozen transform contract... must change if any of these change, not just the model checksum."
8/8 spec tests still pass after the fixture update.

**`latent256-revision-qualified-wrapper.mts`** rewritten for the corrected ownership boundary:
- **Required input-authority flags reduced to 6** (down from 8): `--workspace-id`,
  `--repository-id`, `--workspace-revision`, `--input-representation-revision`,
  `--input-population-checksum`, `--model-checksum`, plus one of
  `--source-snapshot-revision` / `--source-revision-set-checksum` (either satisfies — both are
  sha256:-prefixed source-identity assertions, live-tested with the alternate name).
- **`--producer-revision` removed from accepted input entirely** — not just "no longer required,"
  actively **forbidden**. `deriveProducerRevision()` computes it as
  `producer:sha256:${sha256(sha256(wrapperSourceFile) + ':' + sha256(pythonProducerFile))}` — a
  real checksum over this wrapper's own source and `python/backfill_latent_256.py`'s source, read
  fresh at runtime via `fileURLToPath(import.meta.url)`. A future edit to either file changes
  `producerRevision` automatically, which correctly cascades into `outputRepresentationRevision`.
- **`transformPolicyRevision` is frozen, not caller-suppliable**: `TRANSFORM_POLICY_DEFINITION` is
  an inline constant object (`nested-semantic-autoencoder-v1` — documents latent_256 as the
  learned output, latent_128/latent_64 as `l2_renormalize(latent_256[:n])` prefix derivations, and
  the semantic_768 input contract), hashed once at runtime via `deriveTransformPolicyRevision()`.
- **8 flags are now a hard-refused forbidden list** (`FORBIDDEN_CALLER_FLAGS`, checked and refused
  *before* the missing-flags check so the caller gets a specific, distinct error): `producer-revision`,
  `output-representation-revision`, `representation-revision`, `transform-policy-revision`,
  `candidate-snapshot-revision`, `ordinal-map-checksum`, `graph-revision`, `ast-revision`,
  `cst-revision`. Live-verified: passing `--producer-revision fake` alone → exit 1, the new
  specific forbidden-flag message, not the generic missing-flags message.
- `deriveRepresentationRevision()` now takes `transformPolicyRevision` as an explicit input
  (previously an inline string literal `'NestedSemanticAutoencoder.encode:v3;...'` baked directly
  into the hash input, not a separately identified/recorded policy).

**Live determinism proof (2 identical runs, same flags, no code changes between them)**:
`producerRevision`, `transformPolicyRevision`, and the derived `outputRepresentationRevision` were
byte-identical across both runs (`producer:sha256:1376e801ce1e637f58...`,
`nested-semantic-autoencoder-v1:sha256:a62ede5621...`,
`latent_256:nested-semantic-autoencoder:sha256:510bae173f...`). Both runs used fabricated
`workspaceRevision`/`sourceSnapshotRevision` test values (correctly, since `SEM768-CORPUS-BUNDLE-01`
has not run yet) but a real, correct `inputPopulationChecksum` matching the live 54,969-row
eligible cohort — the wrapper's own cross-check against the recomputed digest passed. Outputs moved
to `docs/reports/smoke-tests/latent256-wrapper-smoke-test-01b1-run{1,2-determinism-check}.json` —
smoke tests, not real canary evidence (real `workspaceRevision`/`sourceSnapshotRevision` still
pending `SEM768-CORPUS-BUNDLE-01`).

**No execution performed beyond dry-run smoke tests** — no rows written, `graphify:daily` not run,
`SEM768-CORPUS-BUNDLE-01` not yet started (next).

### LATENT-PHASE16-ORCHESTRATOR-BINDING-01 (OPEN — required before canary)

Add a read-only, fail-closed revision-bundle handoff at the existing fanout owner. The handoff may
consume only an already authoritative corpus bundle; it must not derive revisions from timestamps,
working-tree state, candidate snapshots, Qdrant payloads, or ordinal maps.

**Correction (2026-09-02, superseded twice — first by `LATENT-PHASE16-CONVERGENCE-01B.1`, then by
`SEM768-CORPUS-BUNDLE-01`'s bundle-consumption update)**: this list originally named 7-8 separate
CLI flags the fanout would need to construct piecemeal (`--workspace-id`, `--repository-id`,
`--workspace-revision`, `--source-snapshot-revision`, `--input-representation-revision`,
`--input-population-checksum`, `--model-checksum`, plus briefly `--producer-revision` before that
was corrected out). The wrapper's real current CLI surface is now just **two flags**:
`--corpus-bundle <path>` (a `SemanticCorpusBundleV1` report — carries workspace/repository
identity, semantic input representation revision, population checksum, and source authority
status all in one admitted, checksummed object) and `--model-checksum <64-hex>` (the
NestedSemanticAutoencoder's own, separate authority). The orchestrator binding, when built, needs
to resolve/reference one admitted bundle file path, not assemble 7 independent strings that could
each come from a different "world." All 8 originally-named flags plus `--producer-revision` are
now on the wrapper's `FORBIDDEN_CALLER_FLAGS` hard-refusal list.

If the authoritative bundle is unavailable, the fanout must fail with a typed blocker before
spawning Phase 16 — the wrapper itself already does this (`SEMANTIC_CORPUS_BUNDLE_MISSING`,
`SEMANTIC_CORPUS_BUNDLE_INVALID`, `SEMANTIC_POPULATION_CHECKSUM_MISMATCH`,
`MODEL_CHECKSUM_MISMATCH`), live-tested. `SOURCE_LINEAGE_UNPROVEN` is deliberately NOT one of these
fatal codes — `sourceAuthorityStatus: PARTIAL`/`UNPROVEN` is honestly propagated into the output
receipt, not treated as a Phase 16 blocker (see `SEM768-CORPUS-BUNDLE-01` below for why). Do not
weaken the wrapper, add synthetic defaults, or run `graphify:daily` as a way to discover the
values. Acceptance requires a focused command-construction test, missing-bundle fail-closed
coverage, and proof that apply mode remains explicitly bounded.

**Historical blocker evidence, now resolved differently than expected (2026-09-02)**:
`docs/reports/graphify-revision-owner-v2-retry.json`/`current-graphify-source-revision-v1.json`
were originally treated as the missing prerequisite for an admitted bundle — they aren't, and per
the operator correction below, don't need to be: `SEM768-CORPUS-BUNDLE-01` admits a
representation-scoped bundle without either of them, recording `sourceAuthorityStatus: PARTIAL`
honestly instead of blocking on their absence. The orchestrator handoff itself remains open;
no revision values were fabricated and no fanout command was changed.

### SEM768-CORPUS-BUNDLE-01 (2026-09-02, done — REPRESENTATION-SCOPED, `ADMITTED_REPRESENTATION_INPUT_ONLY`)

**Operator correction applied, supersedes the first draft of this gate.** The first draft blocked
on `WORKSPACE_REVISION_UNADMITTED`/`SOURCE_SNAPSHOT_UNADMITTED` and treated those as fatal —
wrong: Graphify cannot be the prerequisite for this bundle (Graphify is itself blocked on Phase
16), and `LINEAGE-01` cannot be the prerequisite either (it stays open until a completed Graphify
lifecycle exists). Requiring either would recreate the exact circular dependency this gate exists
to remove. Reframed with `authorityScope=REPRESENTATION_INPUT`, distinct from
`CANONICAL_SOURCE_LINEAGE`: this bundle proves the exact semantic_768 population, its
representation revision, its producer, and a deterministic population checksum — it does NOT
claim the source/workspace world is canonically lineage-qualified. That is `LINEAGE-01`'s job,
separately, later.

**New contract**: `SemanticCorpusBundleV1Schema`
(`sveltekit-frontend/src/lib/server/atlas/tensors/semantic-corpus-bundle-v1.ts`) — `workspaceId`/
`repositoryId` (stable identity, never conflated with a content revision),
`representationId='semantic_768'`, `representationRevision`, `eligibilityPolicyRevision`,
`eligibleCount`, `populationChecksum`, `modelRevision`, `producerRevision`,
`sourceAuthorityStatus: 'PROVEN'|'PARTIAL'|'UNPROVEN'` (source-side honesty, not a binary
admitted/blocked collapse), optional `sourceSnapshotRevision`/`sourceRevisionSetChecksum` (never
fabricated — populated only if an authoritative owner actually supplies them), a bundle-level
`checksum`, `canonicalAuthority: false`, `authorityScope: 'REPRESENTATION_INPUT'`. A `superRefine`
enforces `PROVEN` requires an actual referenced source revision (can't claim proof with nothing to
point at). 6/6 spec tests pass.

**Corrected a real mistake found in my own first implementation attempt of the corrected script**:
guessed the dominant cohort's producer was `backfill-graphify-file-embeddings-768.mjs` (a
llama.cpp/GGUF-based pipeline) without checking who actually wrote those rows — wrong. Traced
properly: `scripts/atlas/reembed-corpus-document-prefix-v1.mjs` is the real producer (confirmed via
its own checked-in apply receipt, `docs/reports/atlas-corpus-reembed-document-prefix-v1-apply.json`,
52,324 rows updated 2026-08-25) — Ollama `embeddinggemma:latest`, document-prompt format
(`title: {relative_path|"none"} | text: {content}`), tagging rows `embedding_model =
'embeddinggemma:latest:eg-task-prefix-v1'`. Also found this producer does NOT update
`embedding_version` on re-embed — meaning the `embedding_version='qdrant-backfill-v1'` value seen
on most of these rows is a **stale leftover from an earlier, different producer**, not a reliable
revision constituent. `representationRevision` is derived from the real, current constituents
(model tag, prompt format, producer source checksum), not from that stale field.

**Bundle is scoped to the dominant cohort by eligibility policy, not the whole heterogeneous
corpus**: `eligibilityPolicyRevision` = `embedding_model = 'embeddinggemma:latest:eg-task-prefix-v1'
AND content_embedding IS NOT NULL` (deliberately ignores the stale `embedding_version` field).
**Live result, real query, not the 51,788 figure from the superseded first draft**: `eligibleCount:
52364` (the correct scope — includes both the stale-tagged bulk rows AND the ~576 rows that got a
newer per-row-hash `embedding_version` from a later individual repair pass, since both share the
same real, current `embedding_model`). Matches the real apply receipt's `updated: 52324` closely
(40-row delta explained honestly in the report as later drift, not an error). The other ~19
cohorts from the population-heterogeneity survey remain excluded by this policy, not silently
folded in.

**Determinism proved**: ran twice, `representationRevision`/`producerRevision`/
`eligibilityPolicyRevision`/`populationChecksum`/`checksum` byte-identical both times.
`populationChecksum` computed exactly per instruction: `ORDER BY id` (physical chunk-row identity
— explicitly flagged as not a claim of *canonical* chunk identity, matching this session's earlier
`SEM768-CANONICAL-CHUNK-OWNER-01` finding), hashing `id:content_hash:representationRevision:
ELIGIBLE` per row, never raw DB row order or vector bytes alone.

**`sourceAuthorityStatus: PARTIAL`** — real evidence exists on both sides (a workspace revision
value is present but `revisionOwnerProven: false`; the source audit proves 111 real per-source
byte matches but no corpus-wide source-set revision), so neither `UNPROVEN` (there is real
evidence) nor `PROVEN` (nothing is admitted) is honest. No `sourceSnapshotRevision`/
`sourceRevisionSetChecksum` populated — correctly absent, not fabricated.

**Output**: `docs/reports/sem768-corpus-bundle-01.json` — `status:
ADMITTED_REPRESENTATION_INPUT_ONLY` (a real admission this time, not blocked). Also carries a
companion `eligibleIds[]` array (52,364 entries, outside the Zod-validated `bundle` object
deliberately — kept out of the schema so the schema stays a small receipt shape, not a data dump)
so downstream consumers can independently re-verify `populationChecksum` against live Postgres.

**`LATENT-PHASE16-CONVERGENCE-01B.1` wrapper updated to consume this bundle**, replacing the 6
separate CLI input-authority flags with a single `--corpus-bundle <path>` (plus the still-separate
`--model-checksum` for the NestedSemanticAutoencoder's own authority). The wrapper: (1) Zod-
validates the bundle, (2) recomputes the bundle's own self-consistency `checksum` and fails closed
on mismatch (`SEMANTIC_CORPUS_BUNDLE_INVALID`) — live-tested against a hand-tampered copy
(`eligibleCount` edited to `999`), correctly refused; (3) re-queries Postgres for the bundle's
exact `eligibleIds`, recomputes `populationChecksum` live, and fails closed on drift
(`SEMANTIC_POPULATION_CHECKSUM_MISMATCH`); (4) intersects the bundle's admitted population with
the existing latent-staleness filter to get the actual phase16-eligible cohort. **Live-verified,
real dry-run against the real admitted bundle**: `corpusBundleRowCount: 52364`,
`latentEligibleCount: 52174` (190 rows already current under this checkpoint), full
`RepresentationArtifactV1` receipt written and Zod-validated, `sourceAuthorityStatus: PARTIAL`
propagated through with no fabricated `sourceRevisionDigest`.

**`RepresentationArtifactV1Schema` updated in lockstep**: `workspaceRevision`/`sourceRevisionDigest`
are now optional (previously required `sha256:`-prefixed strings — would have forced a fake value
under `PARTIAL`/`UNPROVEN` source authority), added required `sourceAuthorityStatus` mirroring the
corpus bundle's, with the same `PROVEN`-requires-a-reference invariant. 11/11 spec tests pass
(3 new: UNPROVEN-with-no-revision accepted, PARTIAL-with-only-workspace-identity accepted,
PROVEN-without-reference rejected).

**Not done, per explicit instruction**: `graphify:daily` not run, no latent rows written beyond
dry-run smoke tests (moved to `docs/reports/smoke-tests/`), `latent_64` gap not repaired,
`LATENT-PHASE16-ORCHESTRATOR-BINDING-01` not yet updated to resolve/pass this bundle from the
fanout (still its own open gate, now genuinely unblocked rather than blocked-behind-Graphify).

### LATENT-PHASE16-ORCHESTRATOR-BINDING-01 (2026-09-02, done — resolved by fanout owner, real end-to-end proof through `npm run`)

Built `scripts/atlas/latent-phase16-fanout-step.mjs` — the fail-closed handoff at the existing
fanout owner. Confirmed via direct read of `scripts/startup/run-atlas-phase8-fanout.mjs`'s
`runStep()` that every phase8 step is invoked identically as bare `npm run <script>` with zero
per-step args — so the binding has to live entirely inside the npm script itself, which is why
this is a new script the npm targets point at, not a fanout-array change.

**What it does, in order, fail-closed at every step**: (1) runs `SEM768-CORPUS-BUNDLE-01` fresh
(read-only, real Postgres read) — if it doesn't exit 0, refuses to spawn Phase 16 at all
(`SEMANTIC_CORPUS_BUNDLE_MISSING`); (2) checks the resulting report's `status ===
'ADMITTED_REPRESENTATION_INPUT_ONLY'` — anything else refuses (`SEMANTIC_CORPUS_BUNDLE_INVALID`);
(3) reads `model_checksum` from the checked-in training receipt (not a fanout-supplied value —
it's a fixed, checked-in file, so there's nothing for the orchestrator to invent or get wrong
here); (4) invokes `latent256-revision-qualified-wrapper.mts` with exactly
`--corpus-bundle <resolved-path> --model-checksum <from-receipt>` plus whatever the caller passed
through (`--apply`/`--limit`). **The fanout therefore resolves and passes ONE coherent artifact
reference, not 4-8 independently-suppliable CLI values that could each come from a different
world** — the exact correction requested.

**`package.json` rewired**: `atlas:phase16:latent:dry`/`:apply` (the exact targets the phase8
fanout invokes at step 6/11) now point at this new resolver script instead of the wrapper
directly. Added `atlas:phase16:latent:wrapper:dry` as a preserved direct-wrapper entry point
(useful for `LATENT-PHASE16-CANARY-01`'s explicit-bundle-path testing next).

**Real bug found and fixed while live-testing**: the resolver's first version spawned
`npx tsx ...` via `spawnSync` without `shell: true` and silently failed to launch on Windows
(`npx`/`npm` are `.cmd` shims, not raw executables — `spawnSync` needs shell resolution to invoke
them). Matches the exact same pattern already present in `run-atlas-phase8-fanout.mjs`'s own
`runStep()` (`shell: true` there too) — should have been copied from the start; caught immediately
via a real failing test run, not assumed correct from code review alone.

**Live-verified via the exact real invocation path** (`npm run atlas:phase16:latent:dry` from
`sveltekit-frontend/`, matching precisely how `graphify:daily`'s fanout calls it): exit 0, fresh
bundle resolved (`eligibleCount: 52364`, `sourceAuthorityStatus: PARTIAL`), model checksum read
from the receipt, wrapper invoked and completed (`latentEligibleCount: 52174`,
`BACKFILL_DRY_RUN_PROVEN`), real `RepresentationArtifactV1` receipt written and validated.

**`npm run atlas:phase16:latent:apply` correctly still fails closed** — bundle resolution
succeeds, but the wrapper's own `APPLY_REQUIRES_LIMIT` guard refuses because the fanout's apply
plan entry (`['atlas:phase16:latent:apply', 'apply']` in `run-atlas-phase8-fanout.mjs`) passes no
`--limit`. **This is correct, not a remaining bug**: per the ordered plan, unbounded/bulk apply
stays refused until `LATENT-PHASE16-CANARY-01` proves determinism on a bounded cohort and an
operator makes an explicit scale decision. A future `graphify:daily` run today would halt at this
exact step for this exact reason — a narrow, canary-gated wait, not the old architectural mismatch
(`LATENT_LEGACY_WRITER_APPLY_BLOCKED`) or an unadmitted-bundle block.

**Superseded by later evidence:** `graphify:daily` has not been rerun. A separately authorized
bounded apply touched 256 PostgreSQL rows across two moving-window invocations; that was recorded
as an invalid replay in `docs/reports/latent-phase16-canary-apply-incident-v1.json`. The frozen-ID
repair and dry-run validation now exist, but bounded apply idempotence remains unproven.

### LATENT-PHASE16-CANARY-01 (2026-09-03, PROVEN — full history retained, not rewritten)

**Full canary history, none relabeled**:
- Dry-run #1 + dry-run replay: **PROVEN** (14/14 checksum fields byte-identical across two runs).
- First bounded `--apply --limit 200`: **FAILED_SCOPE_ENFORCEMENT** — 188 admitted, 12 out-of-scope.
  This was a valuable failed canary that caught exactly the defect the gate exists to catch — not
  rewritten as a success.
- Scope-enforcement fix (`--ids-file` allowlist): **PROVEN**.
- Corrected `--apply --limit 700`: **PROVEN** — `eligibleCount: 80, writtenCount: 80`, 0 out-of-scope.
- **Corrected identical replay: now also PROVEN** (this pass, see below).

### LATENT-PHASE16-CANARY-REPLAY-01 (2026-09-03, done — PROVEN)

Replayed the exact same frozen allowlist as the corrected 80-row apply: same
`docs/reports/sem768-corpus-bundle-01.json` (verified unchanged, `bundle.checksum` identical to
when the 80-row apply ran), same `--limit 700` (deterministically reconstructs the identical
700-id cohort from the unchanged bundle — `cohortIds = [...bundleEligibleIds].sort().slice(0,700)`).
Ran `--apply --limit 700` twice, back-to-back, against this frozen cohort.

**Result: `latentEligibleCount: 0`, `writtenCount: 0`, `NO_ELIGIBLE_ROWS`, both times** — the 700-id
cohort's 80 previously-stale rows are now current (from the corrected apply), and the other 620
were already current before that. This is the required idempotency proof: same frozen allowlist →
zero stale rows selected → zero effective writes, not "same values written again."

**14/14 required fields byte-identical between the two replay runs**: `representationRevision`,
`inputRepresentationRevision`, `transformPolicyRevision`, `producerRevision`, `modelChecksum`,
`inputDigest`, `inputPopulationChecksum`, `outputDigest`, `outputPopulationChecksum`,
`tensorDigest`, `artifactDigest`, `eligibleCount`, `writtenCount`, `rowCount` — `ALL_MATCH: true`.
Direct SQL confirms **zero rows touched** in the replay window (`latent_embedding_validated_at`
unchanged) — zero out-of-scope writes, because zero writes at all.

**One honest note, not glossed over**: `producerRevision` (and consequently
`outputRepresentationRevision`) in these two replay runs does NOT match the original corrected
80-row apply's receipt — a concurrent session edited the wrapper or python producer source between
that run and this replay, which correctly and automatically changed the derived producer/output
revisions (this is the intended behavior of deriving `producerRevision` from a source-file
checksum, not a bug). The replay pair compared here (run 2 vs run 3, both at the *current* code
state) is the meaningful comparison for proving allowlist stability — a code change between the
original apply and the replay does not invalidate the idempotency proof, since the allowlist
(bundle + cohort) itself is what's being tested for drift, and it did not drift.

**36 out-of-scope `latent_64` rows — final classification, does not count as admitted evidence**:
- numeric validity: not disproven (real values, real checkpoint, real semantic_768 input)
- admission provenance: not valid under `SemanticCorpusBundleV1`
- production treatment: excluded from current admitted representation evidence
- disposition: left unchanged (operator decision) — not reverted, not counted toward this canary's
  PROVEN status, not counted toward the admitted Phase16 artifact population.

**`LATENT-PHASE16-CANARY-01 = PROVEN`.**

**Code change required first**: the wrapper's eligibility query only honored `--limit` when
`--apply` was set — dry-run mode always ran against the full bundle-intersected-with-staleness
population (52,174 rows), which isn't a "small deterministic 128-200 row canary." Fixed: `--limit`
is now honored in dry-run mode too (bounds the query, not just the apply-mode write), while the
existing rule (`--apply` without `--limit` fails closed) is unchanged. 17/17 spec tests
(representation-artifact-v1 + semantic-corpus-bundle-v1) still pass after the change.

**Dry-run + replay: PROVEN, real evidence.** Ran the wrapper twice, identically, against the real
admitted bundle with `--limit 200`:
```
npx tsx scripts/atlas/latent256-revision-qualified-wrapper.mts \
  --corpus-bundle docs/reports/sem768-corpus-bundle-01.json \
  --model-checksum d6e9395e60f0bb039dd03368012697c5c393d36bb001b8f020b6d7ba22654259 \
  --limit 200
```
Both runs: `latentEligibleCount: 200`, `writtenCount: 0` (correct — dry-run). Programmatic
field-by-field diff of the two receipts confirms **every required field byte-identical**:
`representationRevision`, `inputRepresentationRevision`, `transformPolicyRevision`,
`producerRevision`, `modelChecksum`, `inputDigest`, `inputPopulationChecksum`, `outputDigest`,
`outputPopulationChecksum`, `tensorDigest`, `artifactDigest`, `eligibleCount`, `writtenCount`,
`rowCount` — `ALL_MATCH: true`. This satisfies "semantic input exact, model checksum exact,
revision bundle exact, artifact checksum stable" from the original canary spec. Receipts archived
at `docs/reports/smoke-tests/latent256-canary-dryrun-replay-{1,2}.json`.

**Additional 128-row replay confirmation (2026-09-02): PROVEN.** The existing fanout resolver was
invoked directly with `node scripts/atlas/latent-phase16-fanout-step.mjs --limit 128` because the
PowerShell/npm forwarding form dropped the `--limit` option. Both read-only runs processed exactly
128 rows, wrote zero rows, and produced byte-identical `outputDigest`, `tensorDigest`, and
`artifactDigest` values. The normalized receipt is
`docs/reports/latent-phase16-canary-v1.json`. This confirms the read-only replay; it does not
authorize bounded apply or a `graphify:daily` rerun.

**Bounded apply half: NOT proven; first attempt recorded as an incident.** The plan explicitly requires this to be "separately authorized"
— distinct from the dry-run/replay proof above, which needed no such gate since it performs zero
writes. A bounded `--apply --limit 200` run against this same cohort would write real
`latent_256`/`latent_64` vectors to 200 production `codebase_chunk_index` rows — a real,
consequential write this session has consistently held back pending explicit authorization at
every prior step. Not run without it. Once authorized, the plan is: run
`--apply --limit 200` once (expect `writtenCount: 200`, real `latent_256`/`latent_64`/
`latent64_model`/`latent_256_checkpoint_revision` values written), then immediately replay the
identical command (expect `writtenCount: 0` — those 200 rows now already match the current
checkpoint, proving idempotent replay), and diff both receipts' `outputDigest`/`tensorDigest`
against expectations (replay's `tensorDigest` should match run 1's, since the underlying vectors
don't change on a no-op replay).

**Apply incident (2026-09-02):** The first authorized 128-row apply updated 128 rows on each of two
invocations, but the second invocation was not a replay of the first cohort: `LIMIT` is applied
after the staleness predicate, so the eligible window advances after the first write. This is
recorded at `docs/reports/latent-phase16-canary-apply-incident-v1.json`. Do not run another apply
until the exact cohort IDs are frozen and passed to the executor.

**Repair validation (2026-09-02): PROVEN for cohort selection.** The wrapper now freezes a sorted
128-ID cohort before the staleness filter and passes it to `backfill_latent_256.py` through
`--ids-file`. Two subsequent dry-runs selected the same frozen cohort and both returned zero
eligible rows and zero writes. Evidence: `docs/reports/latent-phase16-frozen-cohort-replay-v1.json`.
This fixes the moving-window defect, but does not retroactively prove the earlier apply replay.

**Valid bounded apply/replay (2026-09-03): PROVEN.** The frozen 128-ID legacy cohort was applied
once (`writtenCount: 128`) and replayed with the identical cohort manifest (`eligibleCount: 0`,
`writtenCount: 0`). Evidence: `docs/reports/latent-phase16-frozen-cohort-apply-replay-v1.json`.
This proves bounded idempotence for this cohort only; it does not authorize bulk repair or a
`graphify:daily` rerun.

**Additional blocker (2026-09-02): legacy `latent64_model` marker.** A read-only audit found
`latent_64` rows carrying `packet-autoencoder-768-64`, while the new executor's eligibility
predicate expects the checkpoint SHA-256. Consequently, rows with a matching `latent_256` can
still be selected as stale. Evidence: `docs/reports/latent64-model-marker-reconciliation-v1.json`.
Do not apply again until legacy marker reconciliation and exact derived-vector validation are
defined.

**Legacy cohort clarification (2026-09-02):** The marker cohort contains 55,117 rows and zero
stored `latent_64` values; 684 of those rows also lack `content_embedding`. Numeric parity is
therefore unavailable for this cohort. Evidence: `docs/reports/latent64-legacy-marker-cohort-v1.json`.
Treat it as missing derived output, not as validated legacy vectors.

**Not done**: no bulk repair of the 54,969-row `latent_64` gap (explicitly out of scope for this
gate). `graphify:daily` not rerun — waits for the bounded-apply half above.

**Bounded apply half: RUN, real bug found, real fix verified (2026-09-02, operator-authorized).**
The first bounded `--apply --limit 200` run wrote 200 rows for real, but the wrapper's own
post-write verification reported `writtenCount: 188`, not 200 — investigated rather than assumed
correct. Direct SQL confirmed the discrepancy was real: 12 of the 200 written rows carried
`embedding_model = 'embeddinggemma:latest'` (the OLD, non-admitted cohort), not the bundle's
admitted `'embeddinggemma:latest:eg-task-prefix-v1'` tag — `backfill_latent_256.py`'s own
eligibility query (`ORDER BY id LIMIT N`) had no awareness of the wrapper's bundle-scoped id list
at the time, so it silently picked 12 rows from outside the admitted population. **Full blast
radius, checked directly**: 36 rows total out-of-scope for `latent_64` across 3 separate write
bursts (Aug 30 canary, this session's 200-row apply, and an independent 256-row burst from a
concurrent session/process that left no receipt file and was already finished by the time it was
found — confirmed via `pg_stat_activity` and running-process checks, no active writer at
investigation time). `latent_256`'s much larger 2,805-row out-of-scope population is unrelated,
pre-dates any bundle concept (June-August bulk run), and was left alone per its own established
finding above.

**Operator decision: fix the code, leave all 36 rows as-is** (real, correct values, just written
outside current bundle admission — not reverted). The fix (`--ids-file`, constraining python to an
explicit id allowlist instead of its own independent query) already existed in the tree by the
time this was investigated — built concurrently, described from a different angle ("moving-window
defect") two paragraphs above. **Independently live-verified here with a real, authorized bounded
apply**: ran `--apply --limit 700` against the real admitted bundle — `eligibleCount: 80,
writtenCount: 80` (exact match, no undercounting this time), and a direct SQL check of the 80
freshly-written rows confirms **100% `embedding_model = 'embeddinggemma:latest:eg-task-prefix-v1'`
— zero contamination**. The fix holds under a real write, not just a dry-run replay.

### SEM768-PROMPT-FORMAT-VERIFICATION-01 (2026-09-03, done — READ-ONLY web verification, no gap found)

Per "what are we missing" self-audit before the `graphify:daily` terminal run: verified via live
web search (Google's own EmbeddingGemma docs, not assumed) that the document-side prompt format
`reembed-corpus-document-prefix-v1.mjs` uses — `title: {title|"none"} | text: {content}` — is the
**exact official Google-documented format**, not a guess this repo invented. Also checked the
query side: `sveltekit-frontend/src/lib/server/atlas/embedding/embeddinggemma-task-representation-v1.ts`
already implements the correct official query format (`task: search result | query: ...`,
`task: code retrieval | query: ...`), tested in its own spec file. **No gap found** — the admitted
`SemanticCorpusBundleV1`'s underlying embeddings use the correct, documented prompt contract on
both the document and query sides. Not investigated further this pass: whether the query-side
formatter is actually wired into the live retrieval path at runtime (a different, broader question
than Phase16's scope) — flagged for a future retrieval-pipeline audit, not this change.

### GRAPHIFY-LIFECYCLE-OWNER-01 (2026-09-03, historical audit — superseded by live wiring proof)

The following audit snapshot predates `GRAPHIFY-OPEN-CLOSE-LIVE-WIRING-01` and must not be used
as the current lifecycle state. Its `currentRunCount: 0`, `transitionPrimitiveExists: false`, and
"no COMPLETED writer" findings were true at that earlier observation, but are superseded by the
later live-entrypoint receipt and independent SQL readback recorded below. The current lifecycle
proof is `graphify-daily-lifecycle-v1.json`, run
`862b952b-7623-434e-818e-407c1531abaf`, `status=COMPLETED`.

Ran the existing `scripts/atlas/audit-graphify-lifecycle-owner-v1.mjs` (already built, not by this
session) fresh, right after `graphify:daily`'s confirmed terminal completion, to check whether that
completion registered canonically. **It did not — result: `lifecycleOwnerStatus:
LIFECYCLE_OWNER_UNPROVEN`, `currentRunCount: 0`, `runningRunCount: 5`, `staleRunCount: 5`,
`eligibleForFreshRun: false`.** Same 5 stale `graphify_runs` rows as before (Aug 27-28, all
`status: 'RUNNING'`, all `completed_at: NULL`) — the fresh completion added zero rows.

**Root cause, verified by reading the code (`transitionPrimitiveExists: false` in the audit
report, confirmed by grep, not just trusted)**: `graphify_runs.status`/`.completed_at` have
**no writer anywhere in this repo that ever sets them to `COMPLETED`**. The only writer touching
this table is `graphify-source-inventory-writer-v2.ts` (`INSERT ... ON CONFLICT DO UPDATE SET
configuration = ... || EXCLUDED.configuration` — an upsert of manifest/config fields only, never
`status`). No `UPDATE graphify_runs SET status = 'COMPLETED'` exists in the codebase.
`plan-graphify-run-completion-v1.mjs` is `PLANNER_ONLY` (plans a completion, never applies one).

**This means two structurally disconnected "graphify is done" signals exist in this repo**:
1. The npm/log-level signal this session proved real (`graphify:daily complete`, 11/11 fanout
   steps, phase16 exact-match write count) — genuinely real, verified independently via direct SQL
   on `codebase_chunk_index`, not dependent on `graphify_runs` at all.
2. The Postgres `graphify_runs.status = 'COMPLETED'` signal — has **never fired once**, for any
   run, ever, in this repo's history. Not a regression from anything done this session; the
   writer code to do it simply does not exist yet.

**Why this isn't cosmetic**: `graphify_runs` is referenced by 27 files repo-wide (`rg -l
graphify_runs`), several of them (`prove-graphify-revision-owner-v2.mts`,
`exact-promotion-postgres-executor.ts`, `plan-current-structural-edge-resolution-v1.mjs`) in the
exact lineage/promotion machinery `LINEAGE-01` (next queued gate) is likely to touch. If any of
those gate on `status = 'COMPLETED'`, they will see `currentRunCount: 0` and be structurally
blocked the same way Phase16 was — this needs checking before `LINEAGE-01` starts, not after.

**One suggestive but unconfirmed correlation, not asserted as fact**: the newest stale row
(`14643371-f6f2-4131-906b-235a5c06619a`, `workspace_revision:
sha256:55edaaadab0cef724593287c7c908dad6cdc1b25039a752a6b5dab2c0c44fac9`,
`source_manifest_source_count: 24192`) has the same source count magnitude this session's work
has referenced elsewhere as the current corpus — it MAY be the row a completion-writer should
close, but this was not verified against the actual completed run's workspace_revision (the
phase8-fanout chain does not appear to read or write `workspace_revision` in this exact sha256
form), so do not assume they're the same run without checking.

**Decision needed before proceeding (flagging per this session's established pattern — not
deciding unilaterally):** is `graphify_runs` (a) live, load-bearing lifecycle state that needs a
real completion-transition primitive built now (retroactively closing the matching stale row, or
leaving stale rows as history and opening a fresh row for future runs), or (b) legacy machinery
superseded by the log-based signal this session already proved, safe to leave `UNPROVEN` while
`LINEAGE-01` proceeds on a different, non-`graphify_runs` completion signal. Not decided here.
`writesPerformed: false` — this audit made no changes, per its own read-only contract.

**Follow-up check (2026-09-03, per operator instruction "check LINEAGE-01's actual dependency
first"): CONFIRMED — LINEAGE-01 is genuinely blocked on this, not hypothetically.** LINEAGE-01's
own existing status text (line ~146-148 above) says verbatim: *"the current Graphify run is still
`RUNNING` with no completion receipt and zero completed owner runs. Therefore this task remains
open until a completed run proves the binding end to end."* That is the `graphify_runs`-table
signal, not the log-based `graphify:daily complete` signal this session proved real — LINEAGE-01
was written expecting exactly the DB-level completion this audit found never gets written.

**Second confirmation — the just-completed fanout chain doesn't touch `graphify_runs` at all**:
read `scripts/startup/run-atlas-phase8-fanout.mjs`'s only `run_id` reference (line 86) — it's an
in-memory/Redis progress-heartbeat snapshot (`schema_version: 'atlas-progress-v1'`), completely
unrelated to the Postgres `graphify_runs` table. Also found a **third**, separate lifecycle table
referenced by `scripts/atlas/daily-graphify-mastra-workflow.mjs`:
`graphify_workflow_runs` (with its own `current_phase` column) — not investigated further this
pass, but worth noting there may be 3 disconnected "is graphify done" signals in this repo, not 2.

**Scope check before building anything**: opening a `graphify_runs` row correctly requires
`workspace_id`, `repository_revision`, `parser_contract_version`, `extraction_contract_version`,
and (for the existing unique constraint `graphify_runs_workspace_revision_parser_uq_v2`) a
`workspace_revision` that doesn't collide with a stale row — none of which the fanout chain
currently computes or has access to. This is real design work (which fields, whether to close a
stale row retroactively or open fresh, whether the 3rd table changes the picture), not a
one-line fix — flagging as its own decision point rather than building blind.

**Operator decision: build the completion writer now.** Scoped narrowly per the check above —
built and live-proved the missing **primitive** (close-one-row), not a full open+close wiring
into the live fanout chain (that still needs a resolved `WorkspaceRevisionRecordV1`, itself
gated behind LINEAGE-01's own open namespace work — building it here would recreate the exact
circular dependency this file flags repeatedly elsewhere).

- **Added** `completeGraphifyRunInTransactionV2` / `completeGraphifyRunV2` to
  `sveltekit-frontend/src/lib/server/atlas/indexing/graphify-source-inventory-writer-v2.ts`
  (alongside the existing writer, same file, same fail-closed + independent-readback
  discipline: `UPDATE ... WHERE run_id=$1 AND workspace_id=$2 AND status='RUNNING'`, requires
  exactly 1 row affected, then a separate `SELECT` readback that must independently agree).
  Deliberately does not decide which row to close or open new rows — a pure primitive.
- **Unit-proved**: 4 new tests in the companion `.spec.ts` (close succeeds; fails closed on no
  matching RUNNING row; fails closed on readback disagreement; fails closed on missing
  `completed_at`) — 7/7 total tests in the file pass (`npx vitest run
  .../graphify-source-inventory-writer-v2.spec.ts`).
- **Live-proved against real Postgres, not just mocked**: inserted one throwaway test row
  (`run_id: 06cbd539-...`, fake `workspace_revision`/`source_manifest_digest`, real
  `workspace_id` for FK validity, `status: 'RUNNING'`) via direct SQL, then closed it through
  the actual TypeScript function (`scripts/atlas/prove-graphify-run-completion-primitive-v1.mjs`,
  invoked via `npx tsx` from `sveltekit-frontend/` for module-alias resolution). Independently
  verified via a separate `SELECT` (not just trusting the function's own return value):
  `status: COMPLETED, completed_at: 2026-09-03 00:34:16.688959+00`. Re-ran the same close
  against the now-COMPLETED row and confirmed it fails closed
  (`GRAPHIFY_RUN_COMPLETION_CONFLICT_OR_NOT_RUNNING`) rather than silently no-opping. Deleted
  the throwaway test row afterward (`DELETE FROM graphify_runs WHERE run_id = '06cbd539-...'`)
  — **the 5 real stale rows were never touched, read from, or written to by this proof.**

**Still open, deliberately not attempted this pass**: wiring an *open* call
(`writeGraphifySourceInventoryInTransactionV2`, which requires a resolved
`WorkspaceRevisionRecordV1`) plus this new *close* call into the live `graphify:daily` fanout
chain so future runs self-register end to end; and the decision on whether to retroactively
close any of the 5 real stale rows (the one correlation noted above — `14643371-...` — remains
unconfirmed, not enough evidence to act on). Both are `LINEAGE-01`-adjacent, not blocking it:
the primitive LINEAGE-01 needs (a way to prove *some* run reached `COMPLETED`) now exists and is
proven; using it on a real run is separate follow-up work.

**Independent re-verification of the background `graphify:daily` run (task `bglgi9fp0`), post-
compaction (2026-09-03)**: the task was no longer tracked in this fresh session's background
registry (`TaskOutput` returned `No task found` — expected, registries don't persist across
sessions), so fell back to reading `tmp/graphify-daily-run-3.log` directly, per instruction.
Re-derived every claim from the log/DB fresh rather than trusting the earlier summary:
- `grep -c "^\[phase8-fanout\] ✓"` = **11**, `grep -c "^\[phase8-fanout\] ✗"` = **0** — all 11
  fanout steps genuinely passed.
- Phase16 step log line (line 405): `{"event":"latent256_wrapper_complete","status":
  "BACKFILL_APPLY_PROVEN","mode":"APPLY","eligibleCount":300,"writtenCount":300,...}` — exact
  match, no undercounting.
- Log ends with the literal string `graphify:daily complete` (last line).
- **Out-of-scope check, direct SQL, independent of the code path**: `SELECT embedding_model,
  count(*) FROM codebase_chunk_index WHERE latent_embedding_validated_at BETWEEN
  '2026-09-03 00:11:00+00' AND '2026-09-03 00:13:00+00' GROUP BY embedding_model` — returned
  exactly one row: `embeddinggemma:latest:eg-task-prefix-v1 | 300`. **100% of the 300 written
  rows carry the admitted bundle's tag, zero contamination, zero rows outside scope.**

No new gap found in this re-verification pass — this confirms the earlier HANDOFF claim was
accurate, now backed by a second, independent check rather than resting on the first one.

**Follow-up check on the open sub-question above** ("can LINEAGE-01 proceed with just the
proven primitive existing, without backdating the 5 stale rows?"): ran
`scripts/atlas/audit-workspace-source-namespace-v1.mjs` fresh. **Answer: no.** Result:
`status: WORKSPACE_SOURCE_NAMESPACE_BLOCKED, completedGraphifyRunCount: 0`. This script gates
specifically on a real `graphify_runs.status='COMPLETED'` count, not on the primitive's mere
existence — proving the closer function works in isolation doesn't satisfy it. LINEAGE-01
remains concretely, currently blocked, confirmed live (not inferred from the earlier text).
Two ways to unblock, both flagged, neither done: (a) wire the full open+close into the live
`graphify:daily` fanout chain so a *future* run produces a genuinely fresh completed row, or
(b) decide whether to retroactively close one or more of the 5 real stale rows. Not decided here.

**Operator decision: wire full open+close into the chain. Investigated the concrete
implementation and found a real complication before writing any code (2026-09-03).** Searched
for existing, non-test callers of `writeGraphifySourceInventoryInTransactionV2` to reuse rather
than reimplement identity resolution — found exactly one real (non-spec) caller,
`sveltekit-frontend/scripts/atlas/apply-current-source-graphify-batch-v1.mts`. Read it in full:

- It's explicitly gated `if (process.env.ATLAS_NON_PRODUCTION_DATABASE !== '1') throw new Error
  ('CURRENT_SOURCE_GRAPHIFY_NON_PRODUCTION_DATABASE_REQUIRED')`, plus a second confirmation
  string literally named `AUTHORIZE_NON_PRODUCTION_GRAPHIFY_APPLY_FOR_FROZEN_111_SOURCE_PLAN`.
- Its `configuration` payload tags every row it writes `nonProduction: true, boundedBatch: true,
  currentSourceCohort: true` against a **frozen 111-source plan** — a deliberate, bounded
  canary, not a full-corpus writer.
- **This means the only existing production-callable opener for `graphify_runs` was built
  specifically to never touch the real production database or the real corpus.** No script
  anywhere in this repo currently resolves a full-corpus `WorkspaceRevisionRecordV1` +
  per-file `WorkspaceSourceBindingV1[]` for the actual ~50K+ source tree.

**Why the tempting shortcut was rejected**: `audit-workspace-source-namespace-v1.mjs`'s
`completedGraphifyRunCount` check (the thing actually blocking LINEAGE-01) only counts rows
with `status='COMPLETED'`, with no check on `source_manifest_source_count` or the
`nonProduction`/`boundedBatch` configuration flags. Running the 111-source canary against real
production and closing it with the new primitive **would technically flip that count from 0 to
1 and unblock the audit script** — but the resulting row would still be tagged
`nonProduction: true` against 111 files, not a genuine full-corpus completion. Recording a
`COMPLETED` production row from a script explicitly built to say "this isn't production" would
be exactly the evidence-laundering failure mode this repo's own "AGENT EXECUTION INTEGRITY"
rules (root CLAUDE.md) exist to prevent — satisfying a gate's letter while hollowing out its
substance. **Not done.**

**Real scope, now visible, flagged rather than silently attempted**: a genuine full-corpus
opener needs to resolve `WorkspaceSourceBindingV1` (sourceRevision/contentDigest/byteLength/
gitBlobOid) for the entire real source tree (tens of thousands of files, not 111), wire that
resolution plus the existing writer's open call into the start of
`scripts/startup/run-atlas-phase8-fanout.mjs`, and call the now-proven
`completeGraphifyRunV2` at the end. Stopping here to get direction rather than either (a) taking
the technically-passing-but-substantively-hollow canary shortcut, or (b) starting an open-ended
full-corpus resolution build unprompted.

**Operator decision: search for an existing corpus hasher before assuming nothing exists (right
call — one already did).** Found `sveltekit-frontend/scripts/atlas/observe-workspace-source-
binding.mts` — genuinely real, full-corpus, and **not** gated behind
`ATLAS_NON_PRODUCTION_DATABASE` (it's pure read-only observation, no DB write at all). Ran it
fresh: `git ls-files` (tracked + untracked, excluding gitignored) → per-file content hashing via
`deriveCodeSourceRevisionV1` → `buildWorkspaceRevisionRecordV1`/`buildWorkspaceSourceBindingsV1`.
Real result: **`sourceCount: 25258`, `dirty: true`, `skipped: 106`,
workspaceRevision: sha256:7a95c0843ebb4203309bc4396ba31313fbd973d08439822ee2bdbd39531fb401,
canonicalWriteAttempted: false**. This corrects the earlier "no script anywhere resolves a
full-corpus binding" claim in this same section — that was wrong; the resolver exists and works,
I hadn't searched deeply enough before writing it.

**What's actually still missing, now much more precisely scoped**: not identity resolution (that
exists and just proved itself against the real 25,258-file corpus) — it's a **production-safe
writer**. Both real (non-spec) callers of `writeGraphifySourceInventoryInTransactionV2` found so
far (`apply-current-source-graphify-batch-v1.mts`, frozen to 111 files;
`apply-graphify-source-inventory-batch-v1.mts`, capped at `min(128, ...)` files per invocation)
are deliberately gated `ATLAS_NON_PRODUCTION_DATABASE=1` + an explicit confirmation string —
neither has ever been run, or is currently capable of running, against the real production
database at real corpus scale (25,258 files, not ≤128). Writing the real corpus through the
existing per-file-INSERT transaction loop (`writeGraphifySourceInventoryInTransactionV2`'s file
loop, one `INSERT ... RETURNING` + one independent `SELECT` readback per file) at 25,258 files
inside one transaction is untested at this scale, and deliberately flipping a
`NON_PRODUCTION_DATABASE_REQUIRED` gate that whoever built it clearly intended as a safety rail
is a real-risk, explicit-authorization decision — not something to do because a generic
"wire full open+close" choice was made earlier without this detail visible. Also unaddressed:
`dirty: true` — the observation was taken against an uncommitted working tree; whether that's
acceptable for a canonical `graphify_runs` completion, or whether it should require a clean
tree first, is a judgment call not yet made anywhere in this repo.

**Operator decision: build + authorize a bounded production writer. Built, canaried, and ran
for real (2026-09-03) — GRAPHIFY-LIFECYCLE-OWNER-01's original blocker is now genuinely
resolved.**

- **Built** `sveltekit-frontend/scripts/atlas/apply-full-corpus-graphify-inventory-v1.mts` —
  a new, separate production writer (existing non-production canaries untouched). Reuses the
  already-proven `writeGraphifySourceInventoryV2` and `completeGraphifyRunV2` unmodified; adds
  no new SQL. Batches the real 25,258-file observation into `batchSize`-sized groups (default
  1000, one transaction per batch, not one 25K-row transaction), all against the same `record`
  so every batch upserts onto the same `run_id`. Explicit gate: `--apply` +
  `--confirm AUTHORIZE_FULL_CORPUS_GRAPHIFY_PRODUCTION_APPLY_V1` + a valid workspace UUID;
  default is dry-run (plan only). Dry-run proved the plan first: 26 batches × 1000
  (last batch 258), `totalSourceCount: 25258`.
- **Bounded canary first** (`--limit 500`): real write, real close, independently verified via
  SQL (`count(*) FROM graphify_files WHERE last_seen_run_id = ... = 500`). Found a real design
  flaw from this: closing a run after only a partial batch leaves it un-resumable, since
  `completeGraphifyRunV2` requires `status='RUNNING'`. **Not left in place** — deleted the
  500-file test run's `graphify_files` rows and its `graphify_runs` row (`DELETE ... WHERE
  run_id/last_seen_run_id = '91e812b1-...'`) before the real run, same discipline as the
  earlier completion-primitive proof (insert test data, verify, delete — never leave a
  misleading partial-completion artifact in a production lifecycle table).
- **Real, complete, uninterrupted full-corpus apply, no `--limit`**: all 26 batches wrote
  1000/1000 (last: 258/258) — `totalWritten: 25258`, `runId:
  369e4270-7689-4536-8816-4ec4a5517b3e`, `completion.status: COMPLETED`. **Independently
  verified via direct SQL** (separate from the script's own return value):
  `graphify_runs` row shows `status=COMPLETED, completed_at=2026-09-03 00:55:51+00,
  source_manifest_source_count=25258`; `SELECT count(*) FROM graphify_files WHERE
  last_seen_run_id = ...` = **25258**, exact match.
- **Re-ran `audit-workspace-source-namespace-v1.mjs` fresh to confirm real effect on the actual
  blocking check, not just trust the write succeeded**: `completedGraphifyRunCount: 0 → 1`. Of
  the audit's 9 required checks, **the two this work targeted now flip true**:
  `completedOwnerAvailable: true` (was false — this was the literal
  `GRAPHIFY-LIFECYCLE-OWNER-01` blocker) and `workspaceRevisionAvailable: true`. **This part of
  the original problem is genuinely, verifiably closed.**

**LINEAGE-01 overall remains `WORKSPACE_SOURCE_NAMESPACE_BLOCKED` — but now for a completely
different, unrelated reason, discovered only after fixing the graphify_runs gap**: the sole
remaining failing check is `logicalKeyResolvesExactlyOneWorkspace: false`
(`candidateKeyColumns: [], matchingKeyColumns: []`). Checked why: `\d workspaces` shows the
table has only `id, title, description, case_id, created_by, created_at, updated_at` — no
name/key/slug/identifier/code-shaped column at all, so the audit's column-name regex can never
match the configured `logicalWorkspaceKey` (`"legal-ai:deeds-web-app"`) against anything. The
one live row's `description` explains its own provenance: *"Backfilled owner for the
workspace_id already in consistent use across every graphify_runs row as of 2026-08-29...
Created to satisfy the graphify_runs / graphify_files NOT NULL workspace_id contract"* — i.e.
this `workspaces` row was itself a synthetic backfill, never designed with a logical-key column.
**This is a distinct, pre-existing schema gap, not something introduced or touched by this
session's work, and not attempted here** — fixing it means either a `workspaces` schema
migration (adds a key/slug column; real, separate scope, touches shared infra per this repo's
Drizzle Safety Rules) or revisiting the audit script's matching logic. Flagged for `LINEAGE-01`
proper, not decided or started.

**Follow-up investigation (2026-09-03, read-only)**: confirmed `workspaces` is not declared in
the canonical Drizzle schema at all (`rg "pgTable\('workspaces'"
sveltekit-frontend/src/lib/server/db/schema-postgres.ts` — zero hits) — any change needs a
manual `drizzle/manual/*.sql` migration, per this repo's established convention. Found real
precedent for exactly this table: `drizzle/manual/graphify_workspace_owner_backfill.sql`
(2026-08-29) already backfilled this same synthetic workspace row + added the two FK
constraints, idempotent, well-documented header. Traced the missing key value to its source:
`scripts/atlas/daily-graphify-config.json` declares `"workspace_id": "legal-ai:deeds-web-app"`
(the logical key the audit is looking for) alongside `"workspace_uuid":
"625743d2-...c80"` (the real UUID owner) — the config already asserts the binding; `workspaces`
just has no column to hold it. A small, well-scoped fix is visible (add one text column, e.g.
`logical_key`, backfill the one real row with the config's own asserted value) but this is a
genuine schema-touching decision (new column on a production table) — not executed without
authorization, per this session's established discipline for anything past read-only audit.

**Operator decision: yes, build + apply the migration. Built, applied, and re-verified
(2026-09-03).** New `drizzle/manual/workspaces_logical_key_backfill.sql` (idempotent, same
convention as the existing `graphify_workspace_owner_backfill.sql` for this same table):
`ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS logical_key text` + a partial unique index
(`WHERE logical_key IS NOT NULL`) + one `UPDATE` backfilling the single real workspace row with
the value already asserted in `daily-graphify-config.json`. Applied directly via
`docker exec ... psql < workspaces_logical_key_backfill.sql` (`ALTER TABLE`, `CREATE INDEX`,
`UPDATE 1`). **Independently verified via a separate SELECT**: `logical_key =
'legal-ai:deeds-web-app'` on the one real row, matching config exactly.

**Re-ran `audit-workspace-source-namespace-v1.mjs` fresh. Result: all 9 checks now pass**
(`logicalKeyResolvesExactlyOneWorkspace: true` — was the last failing one — plus all 8 others
already true/0 from earlier this session), **but `status` still prints
`WORKSPACE_SOURCE_NAMESPACE_BLOCKED`, not `PROVEN`.** Read the script's own completion logic to
find out why rather than assume a stale check: `if (Object.values(checks).every((value) =>
value === true || value === 0))`. **This is a real, confirmed bug in the audit script itself**,
not a remaining data gap: `checks.absolutePathNamespaceDependency` is a hardcoded literal
`false` (meant as "no absolute-path dependency exists — good"), but the completion test only
accepts `value === true || value === 0` — a boolean `false` satisfies neither, so
`WORKSPACE_SOURCE_NAMESPACE_PROVEN` is **structurally unreachable** regardless of how many real
conditions are satisfied, as long as that field stays a literal `false`. **Not fixed here** —
editing an audit/gate script's pass condition without explicit sign-off would itself be exactly
the kind of quiet gate-loosening this session's evidence-integrity discipline exists to prevent,
even though in this specific case the fix is obviously "accept `false` as passing for this one
field, since `false` is its own correct/good value." Flagging precisely rather than silently
patching: **every substantive LINEAGE-01 predicate this script checks is now genuinely true**
(real completed full-corpus run, real workspace revision, real logical-key binding) — the
remaining `BLOCKED` label is a script defect, not evidence of remaining lineage work. Next
session's call: patch the `every(...)` condition (one-line fix, e.g. `value === true || value
=== 0 || value === false && key === 'absolutePathNamespaceDependency'`, or more simply give the
field a `true`-meaning name/value instead of an inverted one), then confirm `status` flips to
`PROVEN`, then close `LINEAGE-01` itself with this evidence.

### GRAPHIFY-WORKSPACE-REVISION-AWARENESS-01 (2026-09-03, operator-directed — done, one real gap
flagged not fixed)

Operator instruction, in full: freeze the distinction between `workspaceRevision` (which exact
source bytes a run consumed — knowable even while derived work is incomplete) and
`repositoryRevision`/Git HEAD (which the working tree can diverge from via modified/untracked
files); do this **before** `GRAPHIFY-OPEN-CLOSE-WIRING-01`, since the two are conceptually
separable and the completed full-corpus write above already produced this evidence without
needing derived-graph completion. Trace `workspace-revision-origin-runtime-v1.ts` and
`WorkspaceRevisionRecordV1` to determine whether the existing contract already represents
evidence-only source-snapshot identity, or conflates it with canonical/admitted authority — and
if it conflates, split it (`WorkspaceSnapshotEvidenceV1` vs `AdmittedWorkspaceRevisionV1`)
rather than weakening `LINEAGE-01`. Verify determinism (same bytes → same revision, Git HEAD
alone must not substitute for it) via replay + a controlled fixture change. Do not modify the 5
historical stale rows; do not rerun `graphify:daily` until proven.

**Traced both files. Finding: the contract already does exactly what was asked — no split
needed.** `workspace-revision-origin-runtime-v1.ts::materializeWorkspaceRevisionOriginV1` is a
reusable runtime wrapper around the same `buildWorkspaceRevisionRecordV1`/
`buildWorkspaceSourceBindingsV1` functions this session already used for the real full-corpus
write (same identity mechanism, not a second competing one).
`workspace-source-binding-v1.ts::workspaceRevisionRecordV1Schema` (line 49) carries
`canonicalAuthority: z.literal(false)` as a hardcoded Zod literal on the type itself — **every
instance of `WorkspaceRevisionRecordV1` is evidence-only by construction, can never claim
canonical admission**. This is already exactly the operator's requested `WorkspaceSnapshotEvidenceV1`
boundary; it just carries a different name. Introducing a second, differently-named type for the
same already-correct contract would itself violate this repo's own duplication-prevention rule
(root CLAUDE.md, "ONE canonical owner per capability") — not done.

**Hash composition, read directly from `buildWorkspaceRevisionRecordV1` (lines 132-172), not
assumed**: `workspaceRevision = sha256:${digest(entries.map({sourceRef, sourceRevision,
contentDigest, byteLength, gitBlobOid}))}` — `entries` sorted by `sourceRef` first
(`normalizeManifest`), so enumeration order can't matter. **Confirms every one of the operator's
"must NOT derive from" list is genuinely excluded**: `generatedAt` (timestamp) and
`producerRevision` are recorded as separate record fields and folded only into the outer
`checksum` (a whole-record tamper-evidence hash, a different field from `workspaceRevision`
itself) — never into `workspaceRevision`. No `graphRevision`, GPU state, Qdrant/Neo4j counts,
candidate snapshot, or completion status appears anywhere in this file. `repositoryId`/
`baseCommitOid` (repositoryRevision) are stored as sibling fields on the record, never part of
the `workspaceRevision` hash input — **Git HEAD is architecturally incapable of substituting for
workspaceRevision**, not just conventionally avoided.

**Verified live, not just read — two different methods, one succeeded cleanly, one revealed a
real environment fact worth recording honestly**:
- First attempt: ran the real `observe-workspace-source-binding.mts` twice back-to-back against
  the live, actively-edited repo, expecting identical output. **Got two different
  `workspaceRevision` values** (`sha256:82ada9bf...` at `sourceCount: 25263`, then
  `sha256:96baafe6...` moments later). **Not a determinism bug** — this repo has multiple
  concurrent sessions genuinely editing files in real time (documented repeatedly elsewhere in
  this file and in root CLAUDE.md's own "concurrent-session editing" notes); the live tree
  itself changed between the two invocations, so "same input" wasn't actually satisfied. Correct
  outcome for a content-addressed hash to react to that, and recording the false-start honestly
  rather than pretending it was proof of a bug or silently redoing it until it looked clean.
- Second, correct method: ran the existing `workspace-source-binding-v1.spec.ts` — this already
  has 8 tests against **fixed, controlled fixtures** (not the live moving repo), and its titles
  map directly onto the operator's requested checks: `'is deterministic regardless of input
  enumeration order'`, `'changes when exact working-tree bytes change even with the same Git
  HEAD'` (the modified/untracked-vs-commit-snapshot scenario), `'keeps Git commit changes as
  provenance when the indexed byte manifest is identical'` (Git HEAD changing alone, bytes
  unchanged → `workspaceRevision` must NOT change — the exact "Git HEAD alone is not
  substituted" proof requested), `'changes on rename even when Git content/blob provenance is
  unchanged'`, plus binding-level tests. **8/8 passed** (`npx vitest run
  src/lib/server/atlas/identity/workspace-source-binding-v1.spec.ts`).

**One real, precise gap found and flagged, not silently accepted**: the operator's requested
hash-input list includes `workspaceId` and `directoryScope` (and, implicitly,
`sourceInventoryContractVersion`/`exclusionPolicyRevision`) as inputs to `workspaceRevision`
itself. The live schema does **not** include any of these in the `sourceManifestDigest` hash —
only `repositoryId` is recorded (as a sibling field, not hashed into `workspaceRevision`), and
neither `workspaceId` nor `directoryScope` appear anywhere in this file at all (they're supplied
separately by callers, e.g. the writer script's `--workspace-id` flag). **Practical impact for
this repo today: none** — there is exactly one live workspace (`625743d2-...c80`) and one
directory scope (`"."`, whole repo), so no collision is possible in practice. **Latent risk if
this repo ever adds a second workspace or a scoped (non-whole-repo) indexing run**: two different
`(workspaceId, directoryScope)` pairs that happen to select an identical file set would produce
the identical `workspaceRevision`, silently conflating two logically distinct runs. Not fixed
here — flagged as a real, scoped follow-up (`workspaceId`/`directoryScope` need to enter the
`workspaceRevision` hash, not just live as sibling metadata) for whenever multi-workspace/scoped
indexing becomes real, not invented work against a single-workspace repo today.

**Conclusion**: `GRAPHIFY-WORKSPACE-REVISION-AWARENESS-01` is satisfied by the existing contract
plus this session's real full-corpus write (which already produced and consumed exactly this
evidence, in the correct order: source inventory → `WorkspaceRevisionRecordV1` → open
`graphify_runs` RUNNING → ... → close COMPLETED — matching the operator's requested chain
exactly, not by coincidence but because that's the order the writer scripts already enforce).
No code changes were needed to satisfy this gate; the one real latent gap (multi-workspace hash
scoping) is recorded above for later, not blocking anything today.

### GRAPHIFY-OPEN-CLOSE-WIRING-01 (2026-09-03, operator-directed — workspace_revision as
lifecycle metadata, not run identity)

Operator instruction, in full: `workspace_revision` should be nullable during the RUNNING phase
of a `graphify_runs` row's lifecycle rather than manufactured just to satisfy a NOT NULL
constraint — run identity is `run_id + workspace_id + repository_revision + started_at`, known
immediately at open; `workspace_revision`/`source_manifest_digest` become known only once source
inventory finishes and must stay NULL until then. NULL while unavailable is honest; a fake
hash/timestamp fallback is wrong. A completed run eligible for `LINEAGE-01`'s canonical
admission must still have a real, present `workspace_revision` — this is a runtime/application
invariant to enforce, not something the DB schema needs to force immediately. First inspect
whether the column is actually nullable and whether the existing unique constraint assumes
non-null before touching anything; report the exact constraint before applying any migration.
Do not synthesize `workspace_revision`. Do not make it part of run identity. Do not touch the 5
historical stale rows.

**Inspected the live schema directly (`information_schema.columns`, not `\d` eyeballing) before
writing any code, per instruction.** Result: **`workspace_revision` and
`source_manifest_digest` are already `is_nullable = 'YES'`** — no migration needed for
nullability. Confirmed `repository_revision` is `is_nullable = 'NO'` (matches the operator's
"run identity known at open" framing, though the operator's own diagram had listed
`repository_revision` as "maybe known" — flagging the mismatch, not changing it, since the
operator's actual ask was about `workspace_revision`). **Checked the existing unique
constraint precisely**: `graphify_runs_workspace_revision_parser_uq_v2 UNIQUE (workspace_id,
workspace_revision, parser_contract_version) WHERE workspace_revision IS NOT NULL` — already a
**partial** index. Rows with `workspace_revision IS NULL` are excluded from this constraint
entirely (not merely "NULLs are distinct," genuinely outside the index's scope), matching the
operator's explicit warning about NULL semantics in unique constraints — this schema already
gets it right, and correctly does NOT rely on that constraint to exclude concurrent
same-workspace NULL-revision RUNNING rows (per the operator's instruction, `run_id` is the
actual identity; a "no more than one active run" rule, if ever needed, would be a separate
concern, not attempted here). **No schema migration needed at all for this gate.**

**Built the missing code-level primitives** (the actual gap — no existing writer opened a bare
row without a full revision already in hand) in
`graphify-source-inventory-writer-v2.ts`, alongside the existing proven functions:
- `openGraphifyRunInTransactionV1`/`openGraphifyRunV1` — bare `INSERT ... status='RUNNING'`
  with `workspace_revision` never set (column omitted from the INSERT entirely, so it takes its
  NULL default) — deliberately does not reuse the upsert-INSERT in
  `writeGraphifySourceInventoryInTransactionV2`, which always binds a real revision as part of
  one call (exactly the "manufacture a revision merely to open a row" pattern this exists to
  avoid). Fail-closed + independent readback, same discipline as every other primitive this
  session added.
- `bindWorkspaceRevisionInTransactionV1`/`bindWorkspaceRevisionV1` — `UPDATE ... SET
  workspace_revision=$1, source_manifest_digest=$2, source_manifest_source_count=$3 WHERE
  run_id=$4 AND workspace_id=$5 AND status='RUNNING' AND workspace_revision IS NULL` — a
  **one-time bind**, not an upsert; fails closed if the run doesn't exist, isn't RUNNING, or
  already has a revision bound (a run's source-snapshot identity should not silently change
  after being set once).
- **Unit-proved**: 6 new tests (open succeeds with NULL revision; open fails closed on an
  unexpected non-null revision from the INSERT; open fails closed on readback disagreement;
  bind succeeds; bind fails closed when not RUNNING/already bound; bind fails closed on readback
  disagreement) — **13/13 total tests pass** in the file (`npx vitest run
  .../graphify-source-inventory-writer-v2.spec.ts`).
- **Live-proved against real Postgres, full lifecycle in one run, not just mocked**:
  `scripts/atlas/prove-graphify-open-bind-complete-lifecycle-v1.mjs` — opened a real bare
  RUNNING row (independently confirmed via a separate SQL SELECT: `status: RUNNING,
  workspace_revision: null`), bound a (fixture) `WorkspaceRevisionRecordV1` to that same
  `run_id`, completed it via the existing `completeGraphifyRunInTransactionV2`, independently
  re-confirmed via SQL (`status: COMPLETED, workspace_revision: sha256:111...`), then deleted
  the throwaway test row. **Post-cleanup `graphify_runs` inventory confirmed via SQL: exactly 6
  rows — the 5 historical stale rows (untouched, unchanged) plus the one real 25,258-file
  completed run from earlier this session. Zero test residue.**

**Not attempted, per instruction — the LINEAGE-01-side enforcement**: "LINEAGE-01 must refuse
canonical promotion if its required workspace/source revision evidence remains NULL" is an
application-level invariant for `LINEAGE-01` itself to enforce (e.g. in whatever eventually
consumes `graphify_runs` for canonical admission), not something this writer-primitives change
should add — flagged for `LINEAGE-01` proper. Also not attempted: actually wiring
`openGraphifyRunV1`/`bindWorkspaceRevisionV1` into the live `graphify:daily` fanout chain itself
(the primitives are proven; wiring them into the real pipeline, and deciding whether/how to
retire the existing all-in-one `writeGraphifySourceInventoryV2` open path in favor of this
split one, is separate follow-up work, not done here). Per instruction: `graphify:daily` was
**not** rerun this pass.

## HANDOFF — 2026-09-03 (context-limited stopping point, before /compact)

**Everything through `LATENT-PHASE16-CANARY-01 = PROVEN` is done and validated** (see that section
and `LATENT-PHASE16-CANARY-REPLAY-01` above). Full gate chain complete: `LATENT-PHASE16-OWNER-01`
→ `LATENT64-STATE-RECON-01` → `LATENT-SCHEMA-ALIGN-01` → `LATENT-PHASE16-CONVERGENCE-01B` →
`01B.1` → `SEM768-CORPUS-BUNDLE-01` → `LATENT-PHASE16-ORCHESTRATOR-BINDING-01` →
`LATENT-PHASE16-CANARY-01`/`CANARY-REPLAY-01` (PROVEN) → `SEM768-PROMPT-FORMAT-VERIFICATION-01`.

**`graphify:daily` COMPLETED — CONFIRMED TERMINAL, first genuine completion in this repo's
recorded history.** Background task `bglgi9fp0` finished exit code 0, log at
`tmp/graphify-daily-run-3.log`. Verified, not just trusted:
- **11/11 phase8-fanout steps passed** (`grep -c '✓'` = 11, `grep -c '✗'` = 0).
- **Phase16 step (6/11)**: `eligibleCount: 300, writtenCount: 300` (exact match, no undercounting),
  `✓ atlas:phase16:latent:apply completed in 26.0s`.
- **Zero out-of-scope writes, confirmed via direct SQL**: all 300 rows with
  `latent_embedding_validated_at` in the run's write window carry
  `embedding_model = 'embeddinggemma:latest:eg-task-prefix-v1'` — 100% in-scope, 0 contamination.
- Post-fanout steps (feature-map-sync: 4,748 files upserted; BM25 plan; embedding-alignment
  checks) completed too, some correctly `DRY_RUN`/`DEFERRED` (expected, not failures — e.g. BM25
  plan correctly reports `no_completed_graphify_candidates` since this is the first-ever
  completion, nothing to index yet). Log ends `graphify:daily complete`.

**Next session should**:
0. **STALE — this whole numbered list predates the real closure work below.**
   `GRAPHIFY-LIFECYCLE-OWNER-01`, `GRAPHIFY-WORKSPACE-REVISION-AWARENESS-01`,
   `GRAPHIFY-OPEN-CLOSE-WIRING-01`, and **`LINEAGE-01` (now `CLOSED /
   WORKSPACE_SOURCE_NAMESPACE_PROVEN`, 2026-09-03)** are all done — see their own sections
   above, all independently verified (SQL, unit tests, live script runs), all
   `openspec validate --strict` clean. **Next real step: `PKT-LINEAGE-IDENTITY-LINK-AUTH-01` →
   `PKT-LINEAGE-08`**, not the items numbered below (kept for their still-relevant side notes:
   the 36 out-of-scope rows, and the possibly-unblocked downstream consumers).
1. **`GRAPHIFY-LIFECYCLE-OWNER-01`**: audit run + real gap found + the missing completion
   primitive built and live-proved (see that section above) — but **not fully closed**. The
   fanout chain still doesn't open or close a real `graphify_runs` row end to end (that needs a
   resolved `WorkspaceRevisionRecordV1`, gated behind LINEAGE-01), and the 5 real stale rows are
   still stale (deliberately not touched — the one suggestive correlation was unconfirmed).
   Next: either wire the full open+close into the fanout chain, or decide the 5 stale rows'
   fate, or confirm LINEAGE-01 can proceed with just the *proven primitive* existing (its own
   text only requires "a completed run proves the binding end to end" — check whether that's
   satisfiable once LINEAGE-01's namespace work resolves a real `WorkspaceRevisionRecordV1` and
   this primitive closes it, without also requiring backdating the 5 old rows).
2. Historical ordering only: **`LINEAGE-01` → `PKT-LINEAGE-IDENTITY-LINK-AUTH-01` →
   `PKT-LINEAGE-08`**. Do not use this stale note as the current queue: `LINEAGE-01` is
   closed, `PKT-LINEAGE-08` is ready for explicit authorization, and the active queue is
   defined by the coordination index near the end of this file.
3. The 36 out-of-scope `latent_64` rows remain classified debt (not reverted, not counted as
   admitted evidence) — no action needed unless a future session wants to build a second
   `SemanticCorpusBundleV1` admitting the `'embeddinggemma:latest'` (non-task-prefix) cohort to
   absorb them.
4. Since this is the first-ever completion, downstream consumers that were previously
   `DEFERRED`/blocked on "no completed Graphify run" (BM25 index plan, query-adaptive sampling,
   possibly others) may now have real work available — worth a fresh look, not assumed still blocked.
5. A **third** disconnected lifecycle table, `graphify_workflow_runs` (referenced by
   `scripts/atlas/daily-graphify-mastra-workflow.mjs`), was noticed but not investigated this
   pass — worth checking whether it's yet another "is graphify done" signal that needs
   reconciling, or unrelated.
7. Concurrent-session editing of this same `tasks.md` and the wrapper/python files was observed
   repeatedly throughout this session (producerRevision changed between runs due to a concurrent
   edit) — re-read this file's current state before continuing, don't assume it matches this
   handoff exactly.

### REPRESENTATION-VOCABULARY-01 (OPEN — contract boundary recorded)

Freeze the representation vocabulary before adding executor comparisons:

- `semantic_768` is the canonical source-text dense representation.
- `semantic_mrl_512`, `semantic_mrl_256`, and `semantic_mrl_128` are prefix-plus-L2
  derived views of that specific `semantic_768` parent.
- `latent_256` is the physical NestedSemanticAutoencoder artifact.
- `latent_128` and `latent_64` are derived nested-AE views, not MRL aliases.
- AST/CST, `graphRevision`, `candidateSnapshotRevision`, and `ordinalMapChecksum` are
  structural or execution coordinates, not Phase 16 representation inputs.

The following are deliberately excluded from the corpus-wide Phase 16 artifact: NetworkX JSON
serialization, cuDF edge tables, cuGraph internal coordinates, cuVS indexes, CandidateOrdinal,
candidate snapshots, graph revisions, AST/CST revisions, and cache residency state. They may be
bound to a later execution or projection receipt, but cannot change `representationRevision`.

### GRAPH-JSON-COMPARISON-01 (PROVEN_BOUNDED — downstream fixture gate)

The deterministic NetworkX JSON snapshot already exists and is proven as a read-only CPU-oracle
artifact at `python/parent_atlas_ontology/networkx_snapshot.py`. It preserves
`ProjectionNodeKeyV1`, derived external ordinals, graph semantics, graph revision, and checksums;
it is not corpus-representation identity, canonical storage, or the cuDF/cuGraph hot path.
The literal node-link interchange round trip is now implemented by
`node_link_roundtrip_receipt()` and covered by
`python/parent_atlas_ontology/test_networkx_snapshot_replay.py` (`3 passed`). It restores one
shared incidence fixture and requires stable normalized node/edge checksums plus preservation of
the external ordinal map. This is bounded fixture proof only; it does not promote the JSON artifact
to canonical storage or prove the cuDF/cuGraph executor gate.

### NEO4J-CONCEPT-NETWORKX-EXPORT-01 (IMPLEMENTED / LIVE-READ-PROVEN — derived only)

The read-only adapter `scripts/atlas/export-neo4j-concept-networkx-v1.py` reuses
Neo4j as a source projection and NetworkX as the CPU graph/interchange layer. It
exports bounded `Concept`, `Ontology`, and `Domain` nodes plus real incident
relationships to bounded `Packet`, `Feature`, `Trace`, `SourceRef`, and
`TreeNode` context nodes, with stable external keys where available and explicit
degraded identity when only a Neo4j element ID exists. The output is node-link
JSON with `graphRevision` and `projectionChecksum`; it excludes embeddings,
tensors, KV cache, and hidden model state. It is suitable as compact input to
LangExtract/Ornith DAG synthesis, not as ontology admission or canonical graph
identity. Live execution read 19,702 concept-family nodes and 2,000 bounded
incident relationships (including `USED_CONCEPT`, `IN_DOMAIN`, and
`HAS_ONTOLOGY`), with `canonicalAuthority=false` and `writesPerformed=false`.
The export orders the bounded sample by relationship type so the receipt does
not hide lower-volume relation families behind the large `USED_CONCEPT` lane.
Revision fields are carried through when Neo4j supplies them; the current
receipt has 7 nodes with a source revision and 0 with a workspace revision.
Therefore this remains a derived synthesis input only, not a canonical
promotion candidate. `CONCEPT-GRAPH-REVISION-ENRICHMENT-01` remains open for a
read-only source/workspace binding audit.

Receipt: `docs/reports/neo4j-concept-networkx-export-v1.json`. Existing fixture
projection remains the semantic n-ary tuple owner; this export does not replace
`OntologyLinkedTupleV1` or the existing `8095` synthesis-context-graph route.

### ONTOLOGY-LINKED-TUPLE-GRAPH-ADDON-01 (BOUNDARY DEFINED — implementation open)

Graph exports have two intentionally separate inputs. Neo4j concept/context
edges remain ordinary derived graph edges in the NetworkX node-link export.
Validated `OntologyLinkedTupleV1` values must enter through
`python/parent_atlas_ontology/adapter.py::OntologyLinkedTupleAdapter` and the
existing `networkx_snapshot.py` n-ary relation-node projection. That projection
preserves tuple identity, participant roles, evidence, and external ordinals;
it never converts a Neo4j binary edge into a tuple, creates participant cliques,
or promotes a relationship. A future composition receipt may reference both
artifacts by checksum for DAG/LangExtract context, but must retain their
separate schemas and `canonicalAuthority=false`/`writesPerformed=false`.

### GRAPH-CONTEXT-DAG-COMPOSITION-01 (IMPLEMENTED / FIXTURE-PROVEN — read-only)

The script `scripts/atlas/compose-graph-context-dag-input-v1.py` composes
references to the live Neo4j/NetworkX export and the existing validated
`OntologyLinkedTupleV1` projection. It binds both artifact checksums and the
graph revision into one bounded input receipt for LangExtract, Ornith, and DAG
synthesis while preserving separate schemas. It carries no embeddings, CUDA
buffers, tensors, hidden reasoning, or cache state. Receipt:
`docs/reports/graph-context-dag-composition-v1.json`.

This proves composition only; it does not prove live model execution, ACE
admission, BitFrost residency, ontology promotion, or canonical writes.
No existing runtime caller consumes this script's report yet; the current
`8095` synthesis-context-graph route is a separate packet/LangExtract path.
`GRAPH-CONTEXT-DAG-CONSUMER-01` is therefore open and must reuse the existing
ContextManifest/DAG admission boundary rather than introducing another context
store or HTTP service.

The script `scripts/atlas/audit-graph-context-dag-consumer-v1.mjs` now validates
the script-level handoff: both referenced artifacts exist, checksums and graph
revision are present, and all read-only safety flags hold. Receipt:
`docs/reports/graph-context-dag-consumer-v1.json`. This is
`SCRIPT_HANDOFF_VALIDATED`, not a live production ContextManifest invocation;
the existing runtime consumer remains the next integration boundary.

The existing read-only gate `scripts/atlas/prove-ornith-agent-dag-readonly-gate-v1.mjs`
also passes (`ORNITH_AGENT_DAG_READONLY_GATE_PROVEN`, validation `ACCEPTED`, zero
mutation nodes). Its receipt is adjacent execution proof only; it does not yet
consume the new graph-context artifact. `GRAPH-CONTEXT-CONTEXTMANIFEST-ADAPTER-01`
remains open for that explicit checksum-bound adapter.

### GPU-EXECUTOR-COMPARISON-01 (OPEN — after JSON fixture gate)

Consume the same frozen projection through typed cuDF columns and compare executor results by
external `ProjectionNodeKeyV1`, never raw internal IDs. Keep cuGraph/cuVS as rebuildable executor
lanes. Record whether cuGraph renumbering occurred, restore external IDs explicitly when needed,
and keep NetworkX as the CPU correctness oracle. This gate is diagnostic/executor validation only;
it does not promote graph relationships, ontology tuples, latent artifacts, or canonical identity.
The direct WSL2/Miniforge `atlas-rapids-cu13` path is preferred for algorithm parity; HTTP `8098`
deployment is a separate service-readiness gate and must not be treated as proof that cuGraph is
unavailable.

### GRAPH-LINK-TOPOLOGY-01 (PROVEN_BOUNDED — direct executor challenger)

The bounded CPU primitive `bounded_incidence_jaccard()` now keeps the shared `NARY_INCIDENCE`
graph as input and generates an explicit candidate-pair list from shared relation-node
neighborhoods without materializing participant cliques. Focused NetworkX coverage passes (`4`
tests). The cuGraph challenger route is now implemented at `/v1/graph/jaccard`; it accepts the
same explicit bounded node-key pairs, validates resident identity, and restores results by
external node key. Direct WSL2 execution is now proven by
`scripts/atlas/prove-nary-jaccard-cugraph-parity-v1.py`: the same frozen incidence projection and
CPU candidate-pair checksum produced 15 CPU pairs and 15 GPU pairs, with zero missing/extra pairs
and `maxAbsoluteError=0.0`. Use Jaccard
neighborhood similarity as the first CPU/GPU-comparable feature (`NetworkX jaccard_coefficient`
against cuGraph `jaccard`/`jaccard_coefficient`), with candidate pairs and scores normalized by
external `ProjectionNodeKeyV1`. Overlap or cosine similarity may be diagnostic follow-ups; do not
select an algorithm solely because it can enumerate all pairs. cuGraph documents that unrestricted
cosine candidate generation can grow exponentially.

Do not expand n-ary relations into participant cliques, infer missing canonical relationships, or
write Neo4j/Postgres/Qdrant/Valkey data. Preserve relation nodes and role-bearing incidence edges;
the output is a rebuildable topology feature with `canonicalAuthority=false` and
`writesPerformed=false`. Require a frozen projection/checksum, explicit candidate-pair checksum,
CPU/GPU score parity, and deterministic external-key normalization before any later challenger
use. This proves only the bounded direct-Python executor path; `RAPIDS-SIDECAR-LIVE-01` remains
separate and the HTTP route is not required for this algorithm proof.

### RAPIDS-CROSS-RUNTIME-JACCARD-01 (PROVEN_BOUNDED)

The existing 21-node undirected incidence fixture was loaded through HTTP `8098` and the same
three external `ProjectionNodeKeyV1` pairs were evaluated by NetworkX, WSL cuGraph, and the Docker
cuGraph sidecar. All three returned identical normalized scores (`1.0`, `1.0`, `0.0`), with the
same graph/projection/ordinal checksums, `renumbered=false`, zero missing or extra pairs, and
zero maximum absolute error. This is bounded cross-runtime executor proof only; it does not
promote the topology or establish canonical relationship ownership.

### GRAPHIFY-DAILY-NULL-GAP-AUDIT-01 (2026-09-03, READ-ONLY — CLASSIFIED)

Audited the latest workflow receipt and deferred embedding/query-adaptive reports. The remaining
nulls are honest absence markers and MUST remain null until authoritative inputs exist:
`inputLineageChecksum` is null when no admitted embedding cohort was selected;
`featureRevision`/`inputPath` are null when sampling is deferred for a missing feature matrix;
and `inputPath`/`baselinePath` are null when evaluation is deferred for missing input or baseline.
No timestamp, current-working-tree value, or guessed revision may replace them.

The companion report is `docs/reports/graphify-daily-null-gap-audit-v1.json`. Actual gaps remain:
identity is partial (`duplicateIds=481`), semantic and GPU stages are bounded partial probes,
BM25 has no completed Graphify candidate, query-adaptive work lacks its feature matrix/baseline,
source namespace authority is not emitted by this receipt, and the next lifecycle gate remains
`GRAPHIFY_RUN_WRITER_AND_SOURCE_BINDING_READBACK`. The successful process exit is therefore
`PROCESS_COMPLETE_WITH_PARTIAL_STAGES`, not canonical Graphify completion. This audit changed no
production store and added no synthetic values.

### MCP-TOOL-VITERBI-ACE-BRIDGE-04 (2026-09-03, DEEP INTEGRATION AUDIT)

The live atlas-tools smoke passed all 10 checks: initialize, tools/list, classify_intent,
build_agentic_rag_context, and build_recommendation. BitFrost tracking capability also passed.
TRACE static inventory reports 119 registered tools. These are genuine component-health proofs,
not proof that the whole MCP catalog is converged.

The AST registry-parity audit found catalog drift in `src/mcp/server.ts`: 22 handler-without-listing
entries and 7 duplicate names across the base MCP server and TRACE server. Therefore tool
selection/execution is working at the protocol level, but the registry is not yet a single exact
revisioned authority for Viterbi admission. Do not “fix” this by hiding handlers or deleting
duplicates; classify each as canonical listing, delegated alias, legacy/dead, or intentionally
private, then emit one revisioned registry. ACE/BitFrost/centroids remain downstream context/cache
layers and are not the remedy for catalog drift. No datastore mutation occurred in this audit.

### MCP-TOOL-VITERBI-ACE-BRIDGE-03 (2026-09-03, REGISTRY AUDIT — REVISION REQUIRED)

The existing registry currently indexes 327 tools (175 TRACE tools and 190 manifest-derived
tools), but `docs/reports/mcp-tool-registry-index.json` is dated 2026-08-22 and has no explicit
content revision or checksum. This is insufficient for live Viterbi admission: a proposal must
bind to the exact registry contents used for selection. The next safe step is a read-only registry
loader that derives a stable content checksum from the existing report and normalizes tool ID,
MCP name, permission, source reference, and transport. It MUST NOT rebuild tool packets or write
Postgres/Qdrant/Valkey. Until that revision is available, Viterbi output remains fixture/proposal
only and cannot be treated as a current MCP tool selection.

### MCP-TOOL-VITERBI-ACE-BRIDGE-02 (2026-09-03, FIXTURE-ONLY PROPOSAL — PROVEN)

Added `mcp-tool-viterbi-bridge-v1.ts` and focused tests. The bridge reuses the existing k-best
Viterbi decoder, validates the selected tool against a supplied registry revision, rejects unknown
or write-capable tools before execution, and returns a bounded `PROPOSED` result with
`executionPerformed=false`, `writesPerformed=false`, and `canonicalAuthority=false`. Tests pass
3/3. It does not call TRACE/atlas-tools, create ACE/BitFrost/centroid records, or access a
datastore. The next gate is to feed real NLP observations and the existing registry manifest into
this proposal seam, still without execution or promotion.

### MCP-TOOL-VITERBI-ACE-BRIDGE-01 (2026-09-03, AUDIT — INTEGRATION OPEN)

The repo already has a MCP tool registry, TRACE server, rule-based HMM selector, generic k-best
Viterbi decoder, runtime selector, and ACE packet assembler. Do not create duplicate ACE,
BitFrost, centroid, or registry stores. The missing bridge is to feed bounded NLP observations
into a deterministic Viterbi proposal, validate the proposed tool IDs against one revisioned MCP
registry, then pass only admitted read-only tools into SearchRuntime/ACE ContextManifest and the
TRACE/atlas-tools execution boundary.

The current HMM selector is explicitly a rule-based MVP and the Viterbi decoder is generic and
not wired to tool selection. The runtime selector also has a legacy direct-Qdrant tool-manifest
path without a proven registry revision/checksum admission. ACE/BitFrost remain context assembly
and disposable cache layers; they do not own MCP tool identity, authorization, or execution.
Unknown tools, missing registry identity, permission mismatch, and write-capable tools must fail
closed. Selection is a proposal, not execution. See
`docs/reports/mcp-tool-routing-ace-bitfrost-viterbi-gap-v1.json`. This audit made no datastore
changes.

### WORKSPACE-REVISION-AWARE-GRAPHIFY-OPEN-05 (2026-09-03, DRY-RUN ADAPTER CONTRACT — PROVEN)

Added coverage proving that `createGraphifyLifecycleWriterDepsV1` constructs exactly three
explicit owner calls (`open`, `fanout`, `close`) without invoking the database client during
construction. Combined with the composition tests, the isolated lifecycle seam now passes 4/4:
adapter construction is side-effect free, the exact revision/bindings propagate to open and
fanout, the exact run ID propagates to close, fanout failure prevents close, and a missing run ID
fails closed. This remains a pre-live integration proof; `graphify:daily` is not wired and no
`graphify_runs` row was created.

### WORKSPACE-REVISION-AWARE-GRAPHIFY-OPEN-04 (2026-09-03, WRITER ADAPTER — NOT LIVE WIRED)

Added `createGraphifyLifecycleWriterDepsV1` beside the tested composition seam. It binds the
existing `writeGraphifySourceInventoryV2` and `completeGraphifyRunV2` implementations to one
caller-supplied workspace ID, parser/extraction contract versions, and fanout callback. The
adapter does not invent revisions, choose historical rows, or execute by itself; invocation is
still explicit. This keeps the canonical writer ownership in the existing writer module while
making the eventual open→fanout→close startup integration injectable and testable. No startup
command was changed and no database row was created by this step.

### WORKSPACE-REVISION-AWARE-GRAPHIFY-OPEN-03 (2026-09-03, READ-ONLY INPUT AUDIT — READY)

Added `scripts/atlas/audit-graphify-lifecycle-entrypoint-v1.mts` to exercise the existing
workspace-revision origin owner without opening a database transaction. The audit resolved the
current working-tree record as `workspaceRevision=sha256:96baafe600fec977283cdb5ebc5fb9dcd4be995dbd200f37eefa12c71f598bef`,
`repositoryRevision` from the current Git HEAD, and `bindingCount=25264`. It reports
`READY_FOR_INJECTED_WIRING`; `liveStartupWired=false`, `graphifyRunsWritten=false`, and
`writesPerformed=false`.

The revision differs from the earlier receipt because the working tree changed; this confirms
that the value is content-derived and must be captured once per run, not hardcoded. The audit
does not claim Graphify completion, does not reuse historical rows, and does not close a run. The
next authorized step is to pass this record into the existing open writer in a controlled
integration path, then carry the returned run ID through fanout and close/readback.

### WORKSPACE-REVISION-AWARE-GRAPHIFY-OPEN-02 (2026-09-03, COMPOSITION SEAM — TEST-PROVEN)

Added the isolated `runGraphifyLifecycleCompositionV1` seam in
`sveltekit-frontend/src/lib/server/atlas/indexing/graphify-lifecycle-composition-v1.ts`.
It composes injected open, fanout, and close operations, propagates the exact opened `runId`,
fails closed when no run ID is returned, and does not close a run when fanout fails. Focused
Vitest coverage passes 3/3. This is a composition proof only: it is not wired into
`graphify:daily`, does not select or modify historical rows, and does not perform a live database
write. The next gate is wiring this seam to the existing revision-origin and Graphify writer
owners behind an explicit operator-authorized live run.

### WORKSPACE-REVISION-AWARE-GRAPHIFY-OPEN-01 (2026-09-03, CONTRACT FROZEN — IMPLEMENTATION OPEN)

Workspace revision awareness is now a required lifecycle input, independent of GPU/Karpathy
completion. A validated `WorkspaceRevisionRecordV1` identifies the Graphify run and its source
snapshot; it does not imply that structural, semantic, GPU, or Karpathy-derived outputs are
complete.

Required before opening a new authoritative `graphify_runs` row:

- `workspaceRevision` from the canonical workspace/source revision owner;
- repository revision and source-manifest identity from that same record;
- exact source bindings and parser/extraction contract versions;
- one propagated run ID used by the fanout and its completion readback.

Allowed until downstream work is proven:

- `graphRevision=null` when structural graph admission is incomplete;
- `representationRevision=null` when no authoritative semantic artifact is admitted;
- GPU/Karpathy stage status `PARTIAL` or `DEFERRED` with explicit blockers.

The implementation MUST NOT use timestamps, workspace directory paths, GPU runtime versions, or
Karpathy artifact names as substitutes for `workspaceRevision`. It MUST NOT mark a run canonical
because the workspace revision exists alone. The next implementation is a dependency-injected
open→fanout→close test path; live wiring and any historical-row disposition remain separately
authorized. No runtime or datastore change was made while freezing this contract.

### GRAPHIFY-OPEN-CLOSE-WIRING-01 (2026-09-03, READ-ONLY TRACE — NOT IMPLEMENTED)

Traced the live entrypoints. `graphify:daily` delegates to
`npm run graphify:daily:chain`; that chain invokes the cold-processing stage,
`run-atlas-phase8-fanout.mjs`, Qdrant tag mirroring, and feature-map sync. The
phase8 fanout creates only an in-memory timestamp-based progress `run_id` and
does not call `writeGraphifySourceInventoryInTransactionV2` or
`completeGraphifyRunV2`. The open writer requires a validated
`WorkspaceRevisionRecordV1`, its source bindings, parser/extraction contract
versions, and a transaction; the close writer requires the exact persisted
`run_id` and workspace ID.

The existing completion planner remains read-only and currently reports
`COMPLETION_PLAN_BLOCKED` for `CANONICAL_GRAPHIFY_RUN_NOT_COMPLETED` and
`STRUCTURAL_RESOLUTION_RECEIPT_INCOMPLETE`, with `graphRevision=null`. This
null is correct: no authoritative graph revision has been admitted. The safe
implementation boundary is therefore a composition wrapper that resolves one
validated workspace revision, opens one run before the chain, carries the
exact run ID through the chain, and closes that same run only after required
stages and independent readback pass. It must not reinterpret the five
historical `RUNNING` rows or fabricate a graph revision. No wiring or store
mutation was performed in this trace.

### GRAPHIFY-RUN-WRITER-READBACK-01 (2026-09-03, READ-ONLY — STILL BLOCKED)

Re-ran the existing lifecycle and namespace audits after the successful `graphify:daily`
process. The lifecycle result remains `LIFECYCLE_OWNER_UNPROVEN`: 5 `RUNNING` rows, 5 stale
rows, 0 current rows, and only `RUNNING` in the discovered supported-state vocabulary.
`eligibleForFreshRun=false` with blockers `LIFECYCLE_OWNER_UNPROVEN`,
`STALE_RUNS_NOT_RECONCILED`, `CURRENT_RUN_NOT_ESTABLISHED`, `SOURCE_NAMESPACE_UNPROVEN`, and
`REPOSITORY_REVISION_NOT_CURRENT`.

The namespace audit independently remains `WORKSPACE_SOURCE_NAMESPACE_BLOCKED` with
`completedGraphifyRunCount=0`. The successful process/log signal therefore still cannot be
promoted to a canonical `graphify_runs` completion or source-namespace authority. The newly
proven close-one-row primitive is not sufficient by itself; full open+close wiring and the
identity decision for the five historical rows remain separate gates. No stale row was updated,
no Graphify rerun was started, and no production store was changed.
## MCP-TOOL-REGISTRY-DRIFT-CLASSIFICATION-01

- [x] Classify the 22 handler-without-listing entries from the parity report against their actual definitions and dispatch paths.
- [x] Classify the 7 cross-file duplicate names as canonical TRACE ownership with stdio compatibility aliases.
- [x] Preserve all registrations and handlers during classification; no datastore or canonical projection writes.
- [x] Generate a revisioned MCP manifest from canonical and delegated definitions. Satisfied by the
  existing `docs/reports/mcp-tool-registry-index.json` receipt and its recorded content checksum;
  task 59 carries the detailed evidence. No regeneration was performed.
- [ ] Census compatibility callers before removing or changing any legacy/private handler.

Evidence: `docs/reports/mcp-tool-registry-drift-classification-v1.json`, `docs/reports/parent-atlas-mcp-tool-registry-parity.json`; atlas-tools smoke 10/10; BitFrost tracking capability proof present.

## MCP-ACE-BITFROST-ALIGNMENT-AUDIT-01

- [x] Classify the ten live `atlas-tools` MCP names explicitly in the Parent Atlas
  policy layer (2026-09-03). Nine are read-only; `record_outcome` is write-capable and
  approval-required. Unknown future names remain `UNKNOWN`/fail-closed. Focused policy
  coverage is tested in `mcp-tool-policy-classifier-v1.spec.ts`.
- [x] Audit outcome ownership (2026-09-03): two writers append to the shared
  `.opencode/outcome-ledger.ndjson`; `atlas-tools` also projects to Neo4j, while the
  recommendation workflow can mark its `record_outcome` stage before a durable receipt
  exists. A third shared append path is also present in
  `scripts/atlas/lib/agentic-toolgan-core.mjs`, and the SvelteKit observability helper has
  multiple callers. Separately, telemetry writes the Postgres `outcome_ledger` table; that is
  a different persistence lane and must not be conflated with the NDJSON ledger. No writer was
  deleted or merged. Evidence:
  `docs/reports/mcp-outcome-owner-audit-v1.json`.
- [x] Re-run OpenSpec status and strict validation; current authority remains singular.
- [x] Re-run atlas-tools smoke; 10 checks pass.
- [x] Reconcile MCP parity drift against imported/delegated definitions and compatibility aliases.
- [x] Confirm ACE caller census and selected route status.
- [x] Confirm BitFrost tracking capability separately from live invalidation safety.
- [x] Confirm Graphify latent fanout is optional to canonical completion but still wrapper-coupled.
- [x] Generate a revisioned/checksummed MCP manifest (`docs/reports/mcp-tool-registry-index.json`; 339 tools; content revision `sha256:84487fe9b2184b19ac6d340b808d95d9605554825d44ab5f26959ad097321df4`).
- [x] Bind the Viterbi proposal bridge to the generated manifest shape; require matching `content_revision` and `content_checksum`, and preserve proposal-only execution.
- [ ] Add the production caller that loads the generated manifest and supplies bounded NLP frames.
- [x] Verify the existing runtime selector consumes the revisioned manifest and fails closed on invalid identity; 5/5 query probes returned registry selections.
- [ ] Restore/prove dense Qdrant tool-manifest coverage and embedding availability before claiming dense MCP pickup.
- [x] Audit existing producers: manifest packets are generated, but no authorized tool-manifest-to-Qdrant projection producer was found; do not invent one during routing work.
- [ ] Prove one TRACE/stdio alias replay equivalent before changing registrations.
- [ ] Wire one ACE caller through authoritative SearchRuntime revisions and ContextManifestV2.
- [x] Preserve incomplete ACE/process enrichment metadata as explicit `null` (2026-09-03).
  `AtlasProcessPacketV1.graphRevision` is now nullable and the legacy ACE adapter no longer
  invents `graph:parent-atlas` when structural authority is unavailable. Nulls remain visible
  through the packet/manifest boundary; strict ContextManifestV2/BitFrost admission still
  requires authoritative revisions and therefore does not promote incomplete payloads.
  Regression coverage: `ace-context-manifest.spec.ts`.
- [ ] Prove BitFrost mutation invalidation and disconnect flush safety.
- [ ] MCP-OUTCOME-RECEIPT-OWNER-01 — select one durable AgentWorkReceipt owner, remove
  stale/default graph-version fallbacks, and require the workflow RECORD stage to succeed
  only after the receipt is durably acknowledged. Migration remains blocked until the
  contract includes request/workspace/source/graph revisions, tool refs, checksums, and
  validation receipts. Existing `sveltekit-frontend/src/lib/server/observability/outcome-ledger.ts`
  is reusable only as a low-level append helper; it is not yet the typed receipt owner because
  it accepts arbitrary records and suppresses append failures. The additive contract now exists
  at `sveltekit-frontend/src/lib/server/observability/agent-work-receipt-v1.ts`; writer migration
  and durable acknowledgement remain open. The two stale graph-version defaults were removed;
  unavailable graph metadata now remains `null`.
- [x] Record the receipt-owner recommendation (2026-09-03): Postgres `outcome_ledger` is
  the durable canonical owner; `.opencode/outcome-ledger.ndjson` remains a non-canonical local
  diagnostic projection. No migration was performed. Evidence:
  `docs/reports/mcp-outcome-receipt-owner-decision-v1.json`.
- [x] Audit the typed-receipt adapter boundary (2026-09-03): the live `public.outcome_ledger`
  is the 10-column schema from `drizzle/0111_tool_call_runtime_contract.sql`. A second
  migration defines an incompatible state-transition schema under the same table name; both
  use `CREATE TABLE IF NOT EXISTS`, so this is a migration conflict and must not be resolved
  by rerunning or overwriting either definition. Receipt identity, idempotency, acknowledgement,
  and UUID mapping remain open. Evidence:
  `docs/reports/mcp-outcome-receipt-adapter-audit-v1.json`.
- [ ] MCP-OUTCOME-RECEIPT-ADAPTER-01 — design an additive adapter for the live outcome ledger,
  preserve incomplete receipt metadata as explicit null/metadata, require Postgres acknowledgement,
  and prove idempotent readback/replay before migrating any writer.
- [x] Add pure receipt-to-live-ledger mapping (2026-09-03):
  `agent-work-receipt-outcome-adapter-v1.ts` maps `AgentWorkReceiptV1` to the current
  10-column schema without treating `runId` as `traceId` or coercing non-UUID identifiers.
  Unavailable revisions remain explicit `null`; receipt identity and provenance remain in
  metadata. Persistence, acknowledgement, idempotency, and writer migration are still open.
- [x] Design the additive receipt identity migration (2026-09-03): live `outcome_ledger` has
  zero rows and no receipt identity index, so nullable `receipt_id`, `run_id`, receipt status,
  and completion fields can be added without backfill. A partial unique receipt index and
  checksum-conflict behavior are specified, but no migration was created or applied. Evidence:
  `docs/reports/mcp-outcome-receipt-adapter-audit-v1.json`.
- [x] Create the reviewed additive migration file (2026-09-03):
  `drizzle/manual/20260903_outcome_receipt_identity_additive_v1.sql` adds only nullable receipt
  identity/status fields and a partial unique receipt index. It has not been applied; normal
  migration-owner review and explicit authorization remain required.
- [x] Apply and independently verify the additive receipt identity migration (2026-09-03):
  `outcome_ledger` now has nullable `receipt_id`, `run_id`, `receipt_schema`, `receipt_status`,
  `writes_performed`, and `completion_checksum`, plus a partial unique receipt index. The table
  remains empty; no existing rows were changed. Typed writer wiring and acknowledgement/replay
  proof remain open.
- [x] Add the isolated typed Postgres receipt writer (2026-09-03):
  `recordAgentWorkReceiptV1` validates `AgentWorkReceiptV1`, writes Postgres first, returns
  acknowledgement, treats identical `receipt_id` replay as idempotent, and rejects checksum
  conflicts. Legacy writers are not migrated yet. Focused tests cover insert/replay/conflict.
- [ ] Migrate one bounded workflow RECORD stage to the typed writer. The recommendation workflow
  is a standalone `.mjs` CLI while the writer is server-side TypeScript; choose and prove one
  explicit runtime boundary first. Do not duplicate receipt SQL or silently keep NDJSON as a
  success acknowledgement. Current analysis: `mcp-outcome-receipt-adapter-v1.json`.
- [x] Wire the recommendation RECORD stage through the explicit receipt endpoint (2026-09-03):
  `agentic-recommendation-workflow.mjs` now requires Postgres acknowledgement before appending
  the diagnostic NDJSON projection; endpoint failure is fail-closed. Internal service-token
  authentication is supported. A fresh workflow-level live proof remains pending.
- [x] Live-prove the recommendation RECORD ordering (2026-09-03): workflow query
  `receipt adapter bounded proof` produced receipt `aaaba8c5101454f3ec8c8685`; Postgres
  acknowledgement preceded the NDJSON projection, and SQL readback reported `SUCCEEDED`
  with `writes_performed=false`. Broader caller migration remains open. Evidence:
  `docs/reports/mcp-outcome-receipt-adapter-audit-v1.json`.
- [x] Correct replay projection semantics (2026-09-03): identical receipt replay now emits
  diagnostic `RECEIPT_REPLAY` with `canonicalMutation=false` and the canonical completion
  checksum, rather than a second normal completed-work event. Existing historical NDJSON lines
  are unchanged; new replay behavior is covered by syntax and focused writer tests.
- [x] Live-prove frozen recommendation replay (2026-09-03): receipt
  `99b274c796d325176819298a` returned the existing Postgres row with an equal checksum and
  emitted `RECEIPT_REPLAY`/`canonicalMutation=false` in NDJSON. No second canonical receipt
  was created. Broader NDJSON-writer convergence remains open.
- [x] Live-prove receipt fail-closed behavior (2026-09-03): malformed input returned `400`,
  Postgres row delta was `0`, NDJSON delta was `0`, and no service secret appeared in the
  response. Receipt safety gates are complete; the next mainline is
  `ACE-FEATURE-SOURCE-OWNER-01`.
- [x] Define the explicit server boundary for receipt persistence (2026-09-03):
  `POST /api/agent-work-receipts` validates `AgentWorkReceiptV1`, requires an authenticated
  caller, delegates to the typed Postgres writer, and returns stable acknowledgement/replay/error
  fields. Live endpoint proof and CLI migration remain open.
- [x] Live-prove the receipt endpoint (2026-09-03): one bounded test receipt was acknowledged
  into Postgres, an identical replay returned the same ledger ID with `replayed=true`, and
  independent SQL readback matched status/checksum. Test receipt:
  `live-receipt-20260903-01`. No Qdrant, Neo4j, Valkey, or NDJSON writes occurred. CLI migration
  and broader caller migration remain open.
- [ ] Decouple optional latent fanout from canonical Graphify completion.

Evidence: `docs/reports/mcp-ace-bitfrost-alignment-audit-v1.json`, `docs/reports/mcp-tool-registry-drift-classification-v1.json`, `docs/reports/ace-route-revision-authority-v1.json`, `docs/reports/bitfrost-valkey-tracking-proof.json`, `docs/reports/graphify-fanout-criticality-01.json`.

## SOM-AE-KNN-KMEANS-ALIGNMENT-01

- [x] Keep `semantic_768` as the canonical representation and keep `semantic_mrl_512/256/128` as derived truncation views.
- [x] Keep `latent_256` as the learned nested-autoencoder artifact; `latent_128` and `latent_64` are derived prefix+L2 views unless a separate artifact contract proves otherwise.
- [x] Keep NetworkX node-link JSON as deterministic interchange/CPU-oracle data only; it is not a GPU hot path or canonical identity source.
- [x] Keep one shared projection for KNN, KMeans, SOM, NetworkX, cuDF, and cuGraph; do not rebuild topology per algorithm.
- [x] Keep MCP/ACE routing separate from SOM/AE artifact production; registry selection cannot create vectors, centroids, or graph identity.
- [ ] Freeze the shared candidate population and `CandidateOrdinalMapV1` before production KNN/KMeans/SOM execution.
- [ ] Freeze `topK`, distance metric, candidate-pair checksum, feature/representation revision, and deterministic parameter checksum.
- [ ] Prove exact KNN output population before KMeans or SOM consumes it.
- [ ] Prove KMeans centroid membership and centroid checksums before SOM warm/residency use.
- [ ] Run SOM 20x20 only from the frozen shared matrix; record coordinates as derived features, not identity or retrieval votes.
- [ ] Run AE training/fanout only after KNN/KMeans/top-K alignment is proven; no latent or centroid writes in the current tranche.

Implementation references and current gaps:

- Candidate ordinal authority: `sveltekit-frontend/src/lib/server/atlas/features/canonical-candidate-v1.ts` (`CandidateOrdinalMapV1`, `materializeCandidateOrdinalMap`). The map is schema-backed and checksum-bearing, but a production frozen population receipt for this tranche is not yet proven.
- Exact KNN executor: `python/atlas_compute/cuvs_analytics.py` (`run_cuvs_exact_knn`, `run_cuvs_all_neighbors`). It already records `top_k`, metric, row/dimension counts, and neighbor/distance checksums; the missing gate is binding those results to the admitted candidate map and input population checksum.
- KMeans executor: `python/atlas_compute/cluster_softmax.py` (`run_cuvs_soft_kmeans`). It records cluster parameters and replay data, but centroid membership/checksum admission is still open.
- SOM executor: `python/atlas_compute/som.py` (`train_deterministic_som`). It supports deterministic 20x20 execution; `python/atlas_compute/aligned_snapshot_experiment_v2.py` currently derives `kmeans_clusters` and `som_grid_rows` from population size when omitted. Production execution MUST supply frozen values and reject implicit derivation for this gate.
- Shared experiment coordinator: `python/atlas_compute/aligned_snapshot_experiment_v2.py`. It currently executes exact KNN, KMeans, and SOM over the same loaded semantic matrix, but does not yet prove the `CandidateOrdinalMapV1`/population receipt before downstream stages.
- Required report: `docs/reports/som-ae-knn-kmeans-alignment-v1.json`; this is a read-only proof receipt, not an artifact writer.
- Candidate-map admission audit: `scripts/atlas/audit-candidate-ordinal-admission-v1.mjs` → `docs/reports/candidate-ordinal-admission-v1.json`. The existing 4,951-row map is `CANDIDATE_ORDINAL_ADMISSION_READY` for diagnostic use (dense `0..4950`, zero missing/duplicates, checksum aligned); this does not authorize joining it to the separate 55,169-row semantic export or running downstream algorithms.
- KNN parameter audit: `scripts/atlas/audit-knn-parameter-freeze-v1.mjs` → `docs/reports/knn-parameter-freeze-v1.json`. Reuse the existing experiment configuration, but require an explicit query population; an empty `query_canonical_ids` list must not silently become the first 32 candidates.
- KNN query population freeze: `scripts/atlas/freeze-knn-query-population-v1.mjs` → `docs/reports/knn-query-population-freeze-v1.json`. The bounded proof population is explicitly recorded from admitted ordinals; it is not an implicit coordinator fallback.
- KNN population join remains blocked until the frozen query IDs join the semantic vector snapshot used by the executor. Current audit evidence records 4,951 admitted candidates versus 55,169 semantic snapshot keys with zero intersection; do not execute KNN across mismatched universes.
- The current semantic export is keyed by `codebase_chunk_index.id`, while the existing candidate map contains `proto:*`/`packet:*` identities. A direct canonical-ID join is therefore invalid; resolve the semantic candidate-population owner before generating any KNN receipt.
- Semantic cohort audit: `scripts/atlas/audit-semantic-candidate-cohort-v1.mjs` → `docs/reports/semantic-candidate-cohort-v1.json`. The 55,169-row semantic snapshot resolves in `codebase_chunk_index` and has 55,169 `chunk_id`/`content_hash` values, but only 52,380 `source_ref` values and zero exact authoritative workspace-source bindings. `atlas_source_refs` is diagnostic coverage only (32,239 reference matches, 2,067 content-hash matches, 0 populated `commit_sha` values); it must not substitute for an authoritative revision binding.
- Result: `SEMANTIC_CANDIDATE_COHORT_BLOCKED`; do not materialize a semantic ordinal map or run KNN/KMeans/SOM/AE against this snapshot until the canonical source-snapshot/revision-set owner covers the same population. No database, vector-store, graph, cache, or latent-row writes were performed.
- PostgreSQL read-only enrichment shows the semantic snapshot has `chunk_id` and `content_hash` for all 55,169 rows, `source_ref` for 52,380, and `repo_id` for 38,969. Define `SEMANTIC_CANDIDATE_COHORT_V1` from this owner and reject the 2,789 rows without authoritative `source_ref`; never map them through packet IDs or synthetic fallbacks.
- Semantic cohort audit: `scripts/atlas/audit-semantic-candidate-cohort-v1.mjs` → `docs/reports/semantic-candidate-cohort-v1.json`. Admission also requires an authoritative source revision; missing `source_revision` cannot be replaced with `indexed_at`, workspace ID, or current wall-clock time.
- The cohort auditor now checks `atlas_workspace_source_bindings` by exact `repo_id`, `canonical_source_ref`, and `content_digest == content_hash`. Current authoritative binding coverage is zero, so no semantic candidate ordinal map may be materialized from this snapshot yet.

### SEMANTIC-CANDIDATE-COHORT-IMPLEMENTATION-SLICE-01 (15 narrow tasks)

- [x] 01 Run the existing semantic snapshot audit read-only and record the exact row count, vector checksum, and node-key owner.
- [x] 02 Audit the existing `CandidateOrdinalMapV1` independently; do not treat its `proto:*`/`packet:*` IDs as semantic vector IDs.
- [x] 03 Freeze an explicit bounded query population from the admitted candidate map; prohibit an empty query list from becoming an implicit executor default.
- [x] 04 Freeze KNN parameters (`topK`, metric, candidate-pair policy, and parameter checksum) independently of execution.
- [x] 05 Test direct intersection between frozen query IDs and semantic snapshot keys; record zero intersection as a blocking result.
- [x] 06 Inspect `codebase_chunk_index` for exact semantic-row enrichment fields (`chunk_id`, `source_ref`, `content_hash`, `repo_id`).
- [x] 07 Audit `atlas_workspace_source_bindings` as the authoritative source-revision candidate using exact reference and content-digest equality.
- [x] 08 Audit `atlas_source_refs` and `graphify_files` as diagnostic alternatives without promoting workspace IDs, paths, or empty commit SHAs to source identity.
- [x] 09 Produce `semantic-candidate-cohort-v1.json` with resolved, hydratable, revision-qualified, and rejected counts.
- [x] 10 Fail closed when `source_ref` is missing; do not create packet, source-ref, or synthetic identity fallbacks.
- [x] 11 Fail closed when authoritative source revision coverage is incomplete; do not use `indexed_at`, wall-clock time, or workspace ID as a revision.
- [x] 12 Resolve the canonical source-snapshot or revision-set owner that covers the semantic export population. Audit result: `graphify_files` is the only observed source-revision-bearing owner candidate, but its proven coverage is limited to 778/61,660 packet rows and zero of the 55,169 semantic snapshot rows; no owner currently covers the semantic export population.
- [ ] 13 Re-run the cohort audit against that owner and require exact content-hash/revision parity for every admitted row.
- [ ] 14 Only after cohort admission, materialize one semantic `CandidateOrdinalMapV1` bound to the exact vector snapshot and freeze its checksum.
- [ ] 15 Run bounded exact KNN, then attach the KNN receipt before permitting KMeans, SOM, or AE/fanout.

Task 13 is currently blocked, not skipped: the available `graphify_files` owner has only 778 proven revision-qualified rows, while the semantic snapshot requires coverage for 55,169 rows. `atlas_source_refs` has no populated commit revision and remains diagnostic-only. The next admissible change is a read-only source-snapshot/revision-set artifact or an existing owner that covers the exact semantic population; do not broaden the cohort to force a pass.

The existing `python/atlas_compute/semantic_snapshot_freeze.py` contract already requires `canonical_revision/source_revision` per row and emits `row_identity_checksum`, `canonical_order_checksum`, and `input_file_checksum`. The current `semantic-768-real-frozen` export was produced directly from `codebase_chunk_index.id`/`content_embedding` and does not carry that source-lineage contract. Reuse the freeze contract when a properly hydrated source snapshot exists; do not retrofit revisions from timestamps, paths, workspace IDs, or unpopulated commit fields.

The existing `docs/reports/semantic768-ae-training-snapshot-v4.json` is useful for matrix/order identity (`rowCount=55,169`, matrix and ordinal checksums) but is not sufficient for source admission: it reports only `sourceRefCoverage=4,480`, has no source-revision-set checksum, and declares `canonicalSourceColumn=codebase_chunk_index.content_embedding`. Treat its `FROZEN_SNAPSHOT_PROVEN` status as representation/matrix proof only, not lineage proof.

Producer audit: `python/atlas_compute/gpu_mini_fabric/export_semantic_768_fixture.py` selects only `id::text` and `content_embedding::text` from `codebase_chunk_index` ordered by `id`, then writes the matrix, UUID node-key list, and lightweight manifest. It does not consume `semantic_snapshot_freeze.py` and cannot reconstruct per-row `canonical_revision/source_revision` after export. The safe repair is an additive read-only source-input manifest/hydration step followed by the existing freeze contract; never overwrite or relabel the current matrix as lineage-qualified.

The existing `scripts/atlas/audit-current-source-evidence-hydration-v1.mjs` proves only a separate 111-source cohort: `exactRevisionMatches=111`, but `contentHydrated=0`, `authoritativeNamespaces=0`, and `evidenceSpanReady=0`. Its result cannot be promoted to the 55,169-row semantic cohort; a future hydration audit must report both populations separately.

Scope clarification: `docs/reports/lineage-semantic-768-cohort-v1.json` proves a separate 15-row lineage-qualified semantic canary (`sourceRevision`, `workspaceRevision`, exact `codebaseChunkId`, vector presence, and producer metadata). It is eligible for an explicitly labeled bounded diagnostic KNN replay, but it is not evidence for full 55,169-row cohort admission and must not advance the corpus-wide CandidateOrdinal/KNN/SOM/AE gates.

## CURRENT-SOURCE-COHORT-OWNER-01 (2026-09-03, owner found; semantics require repair before regeneration)

The existing owner is `scripts/atlas/build-current-source-projection-cohort-v1.mjs`,
which produces `docs/reports/current-source-projection-cohort-v1.json` from the
source-manifest/projection comparison. The artifact is not a current selection
authority: its eligibility is based on namespace plus file-byte equality and does
not join each source to the current `graphify_files` `code_source_revision`.

The companion `scripts/atlas/audit-current-source-cohort-lineage-v1.mjs` currently
uses whole-workspace equality as its primary filter. That is too coarse for file-local
reuse in a dirty workspace. Before regenerating the cohort, repair/reuse this owner
with an exact per-source join:

`sourceRef` + `sourceRevision/codeSourceRevision` + parser/extraction revisions.

Preserve both observation and Graphify workspace revisions in the receipt and record
when they differ; never synthesize a workspace match. Whole-workspace equality remains
required for graph-dependent features such as PageRank, communities, cross-file edges,
and CandidateOrdinal snapshots. The old 111-source result remains a historical canary,
not the current selection authority.

Required follow-up artifact: `docs/reports/current-source-projection-cohort-v2.json`
with exact-match, changed, missing, ambiguous, revision-unproven, workspace-match,
and workspace-mismatch/source-exact counts, plus a deterministic selection checksum
and `writesPerformed=false`. Do not run the existing v1 builder again until this gate
is repaired.

Read-only execution on 2026-09-03 confirmed the distinction: the repaired builder
produces 52 exact source-revision/content matches, but `currentWorkspaceMatched=0`
and `workspaceMismatchAfterSourceQualification=52`. The companion projection audit
therefore found `lineageRows=52`, `projectionRows=52`, and
`PROJECTION_EXACT_FILE_BYTES_ADMITTED=52`. This permits file-local source evidence
review, but does not admit graph-wide features or a current workspace snapshot.
Receipts: `docs/reports/current-source-cohort-lineage-v1.json` and
`docs/reports/current-source-cohort-projection-alignment-v1.json`.

The current lifecycle-owner audit remains `GRAPHIFY_RUN_OWNER_BLOCKED`: the expected
workspace revision resolves to the stale `RUNNING` run `14643371-f6f2-4131-906b-235a5c06619a`
with no `completed_at`, while the newer completed run is not bound to the current
`graphify_files` rows. Do not close, supersede, or rewrite either run implicitly; the
owner decision must be explicit before regenerating the projection cohort or exercising
`PKT-LINEAGE-08`.

Builder audit detail: `build-current-source-projection-cohort-v1.mjs` currently admits
only `namespace.classification === EXACT_CURRENT` plus
`classification === EXACT_FILE_BYTES`. Its output does not carry or verify an exact
`sourceRef -> code_source_revision/source_revision` binding. The companion lineage
audit then applies one whole-workspace revision filter, which produced 52 Graphify
matches but 0 current/revision-qualified rows on 2026-09-03. The repair must add
per-source revision qualification and explicit mismatch categories before any cohort
regeneration; do not weaken the check by accepting the stale workspace snapshot.

Caller audit confirms this builder has no production callers: only
`audit-current-source-cohort-lineage-v1.mjs` and
`audit-current-source-cohort-projection-alignment-v1.mjs` consume its report.
Therefore repair the existing owner in place rather than creating a v2 builder or
parallel cohort authority. The repaired report must preserve the existing diagnostic
fields while adding the exact Graphify binding, source revision, content-hash match,
parser/extraction revision evidence, and classifications for `EXACT`, `CHANGED`,
`MISSING`, `AMBIGUOUS`, and `REVISION_UNPROVEN`.

### PKT-LINEAGE-08 authority boundary recheck (2026-09-03, read-only)

The fresh `scripts/atlas/audit-graphify-packet-lineage-census-v1.mjs` run must be
read alongside, not merged with, the packet-corpus audit and promotion preflight:

- `graphify-packet-lineage-census-v1.json`: 61,715 packet rows; 17,307 exact
  source-ref joins; 25,162 graphify source/content-revision observations match the
  workspace binding, but 44,407 packet rows have no graphify source and 155 source
  observations have content/revision mismatch. This is not a clean backfill gate.
- `candidate-corpus-lineage-v1.json`: 61,715 packet rows; `admittedCount=0`, because
  packet-local `metadata.source_revision` is absent for 61,714 rows. The audit
  intentionally does not promote `graphify_files.code_source_revision` into packet
  metadata as a fallback.
- `packet-chunk-lineage-promotion-preflight-v1.json`: `eligibleCandidateCount=0` and
  `verdict=BLOCKED_NO_QUALIFIED_CANDIDATE`. It requires a chunk source absent from
  `atlas_packets` plus exactly one workspace namespace and one source revision from
  `graphify_files`; the current candidate universe is not a qualified bounded set.

These results are consistent: graphify-side source evidence exists for some rows, but
the packet admission authority and the current orphan-chunk promotion population are
not yet joined under one authoritative source/namespace/revision contract. Do not
copy graphify revisions into packets, reuse the stale 50-source allowlist, or infer a
promotion candidate from content hashes alone. Keep `PKT-LINEAGE-08` blocked pending
an explicitly authorized, additive source metadata/materialization decision and a
new preflight. All three runs were read-only; no packet, chunk-lineage, Qdrant,
graph, cache, or execution-ledger writes occurred.

The follow-up `scripts/atlas/audit-current-source-evidence-hydration-v1.mjs` run
further narrows the gap: all 52 source-revision matches remain exact, but only 9
have content hydrated, 0 have an authoritative namespace, and 0 are evidence-span
ready or classifier ready. The owner census shows that no current table provides all
of source revision, content, evidence span, and source namespace. Missing reasons are
43 `CANONICAL_CHUNK_OWNER_MISSING` and 9
`CHUNK_OWNER_HAS_CONTENT_BUT_NO_SOURCE_REVISION`. Keep the next gate as
`RESOLVE_REVISION_BOUND_CONTENT_AND_SOURCE_NAMESPACE_AUTHORITY`; do not add a second
chunk owner or promote `codebase_chunk_index` content without an explicit revision
and namespace binding. Receipt: `docs/reports/current-source-evidence-hydration-v1.json`.

The subsequent `scripts/atlas/audit-current-source-registry-contract-v1.mjs`
read-only audit confirms that the existing registry is present but not currently
joined to the active selection authority: `atlas_source_refs` contains 22,604
distinct source keys and the workspace-binding table contains 111 rows, while the
current source plan selects 0 rows and reports 0 exact registry/binding key matches.
The registry does contain `workspace_revision` and `source_revision` fields, but the
audit proves neither a current selected cohort nor a namespace binding. Keep this as
an additive owner-join gap; do not backfill, copy revisions, or create a second source
registry. Receipt: `docs/reports/current-source-registry-contract-v1.json`.

The live table audit identifies `public.graphify_files` as the existing schema-level
owner for the minimum source lineage tuple (`source_ref`, `source_revision`,
`content_hash`, `workspace_revision`): 25,317 rows are present and all 25,317 have
those four fields populated at the column level. This closes schema discovery only;
it does not close admission. The current packet/source joins still have missing or
stale coverage, `atlas_source_refs` has no proven active namespace join, and the
source plan selects no rows. Reuse `graphify_files` as the source evidence owner,
but require an explicit selection join and namespace contract before any packet
materialization or promotion. Receipt: `docs/reports/live-source-lineage-table-audit.json`.

The existing `scripts/atlas/plan-current-source-graphify-batch-v1.mjs` then selected
52 bound sources with the unchanged selection checksum, but found
`currentGraphifyExact=0` and `graphifyRevisionOrContentMismatch=52`. Its status was
corrected from the misleading `CURRENT_GRAPHIFY_BATCH_PLAN_READY` to
`CURRENT_GRAPHIFY_BATCH_PLAN_BLOCKED_REVIEW`; a batch is ready only when every
selected source has exact workspace, source-revision, content-hash, and byte-length
readback. No apply path was invoked.

### Staged observation versus canonical admission (2026-09-03)

The current lineage blocker does not require discarding or withholding every source
observation. The existing ingestion/materialization path may retain a complete staged
record for each observed source and preserve unavailable enrichment fields as `null`
(for example namespace, evidence span, classifier result, or a not-yet-proven source
revision). NLP/AST/CST passes may consume those staged records and emit bounded,
non-canonical observations with their own producer and input checksums.

This is explicitly two-phase:

1. `STAGED_OBSERVATION`: retain source reference, available bytes/content hash,
   timestamps, and honest nullable enrichment fields; run NLP passes read-only or
   through the existing bounded observation writer.
2. `CANONICAL_ADMISSION`: require authoritative namespace, exact source/workspace
   revision, content binding, evidence spans, and independent readback before packet,
   CandidateOrdinal, semantic, graph, or ranking promotion.

Do not use staged nulls as synthetic revisions, do not overwrite existing packet
identity, and do not let NLP output promote a source. This permits indexing and NLP
coverage to progress while `PKT-LINEAGE-08` remains correctly blocked.

### Staged observation ranking and supersession

After staging and NLP passes, observations may be ranked for retrieval or review,
but ranking is evidence-only. Rank records must retain `observationId`, `sourceRef`,
input/content checksum, producer revision, availability state, and the ranking
policy revision. A score is not a source-revision or ontology authority.

An older observation may be marked `SUPERSEDED` only when a newer receipt proves the
same logical scope, source/content identity, producer family, and replacement
checksum. Otherwise retain it as `HISTORICAL`, `BLOCKED`, or `INCOMPLETE`; do not
silently replace it because a newer timestamp exists. Canonical packet, lineage,
CandidateOrdinal, representation, and graph artifacts remain governed by their own
admission gates.

Owner audit result: reuse the existing append-only `analysis_pass_results` lane for
NLP/analysis receipts and bounded replay. Do not create a generic observation table.
The repository contract audit also found two incompatible manual proposals for
`atlas_observation_feature_rows`: the active ORF `packet_key + feature_revision`
filter schema matches Drizzle, materializer, repository, and spectral exporter;
the alternate `candidate_id + workspace_revision` semantic-vector draft does not
match those consumers and remains an unapplied superseded proposal. Keep semantic
vectors in the canonical `semantic_768` vector lane rather than merging them into
ORF. Receipt: `docs/reports/atlas-observation-feature-row-contract-v1.json`.

The `analysis_pass_results` contract confirms the intended staging behavior: `packet_key`
is required, while `source_ref`, `source_revision`, and `workspace_revision` are
nullable and the input-hash builder preserves missing values as `null`. This is the
appropriate existing store for incomplete NLP pass receipts. Its code-evidence
integration-event path still requires source identity and producer fields, so staged
passes must not emit that canonical integration event until those fields are proven.
Add ranking/supersession metadata only as pass output/provenance; do not update or
delete older rows in place.

Focused validation passed with an isolated Vitest worker: `analysis-pass-results.spec.ts`
reported 4/4 tests. The proof covers deterministic input identity, source-revision
sensitivity, deterministic payload hashing, and preservation of nullable provenance
defaults. This proves the staging ledger contract only; it does not prove a live NLP
batch or canonical source admission.

The existing `scripts/atlas/analysis-pass-orchestrator.mts` dry-run was inspected
against its available 3-row fixture. It is a legacy Gemma4-summary importer, not the
current Ornith NLP/recognition path: it hardcodes `gemma4_summary_v1` and the legacy
Gemma4 model name, and its apply mode would also project into summary layers and
BitFrost. The dry-run made no writes. Classify this importer as `HISTORICAL_STAGED`
until its model and destination contracts are explicitly revised; do not rank its
outputs against current observations or mark them `SUPERSEDED` solely by timestamp.

## GRAPHIFY-RUN-IDENTITY-SEPARATION-01 (2026-09-03, read-only finding)

- [ ] Separate workspace snapshot identity from execution identity before further lifecycle repair.
  `workspaceRevision` remains a deterministic source-manifest identity and may be reused when
  bytes are unchanged; `runId`, `startedAt`, `completedAt`, and environment metadata identify one
  execution attempt and must be fresh per attempt.
- [x] Read-only code audit found `sveltekit-frontend/scripts/atlas/materialize-graphify-source-inventory.mts`
  uses `ON CONFLICT (workspace_id, workspace_revision, parser_contract_version) DO UPDATE`,
  which can reuse a logical snapshot row instead of creating a new execution receipt. The schema
  contains the corresponding uniqueness boundary in
  `sveltekit-frontend/drizzle/manual/20260822_graphify_revision_authority_v2.sql`.
- [x] Transaction tracing confirms the returned `run_id` from that upsert is then passed into
  every `graphify_files.first_seen_run_id`/`last_seen_run_id` write and used by the file readback.
  Therefore a repeat over identical bytes can refresh an existing logical run and relabel file
  observations under the reused execution ID; this is the concrete run/snapshot coupling to fix.
- [x] Current run/file census is consistent with this finding: one completed run owns the main
  file population, newer completed runs have zero file rows, and some file rows remain tied to
  non-terminal runs. No historical rows were changed.
- [x] `GRAPHIFY-EXECUTION-LEDGER-SCHEMA-02`: finalize the smallest additive execution ledger
  contract (static proof complete; migration remains unapplied).
  `workspace_revision` remains the exact source-manifest identity; every attempt receives a fresh
  `execution_id`; historical `graphify_runs` remains compatibility state only. Membership is
  immutable under `(execution_id, source_ref)` and retains `legacy_file_id` only as optional lineage.
- [x] Added the canonical unapplied draft
  `sveltekit-frontend/drizzle/manual/20260903_graphify_execution_ledger_v1.sql` with additive
  `graphify_executions`, `graphify_execution_files`, and `graphify_execution_stages` tables.
  It constrains execution/stage statuses and terminal timestamps, supports `COMPLETED_REUSED`
  without reusing `execution_id`, and leaves historical tables unchanged. It is not registered or
  applied; `scripts/atlas/test-graphify-execution-ledger-schema-02.mjs` passes
  (`PROVEN_STATIC_CONTRACT`), while disposable-DB application and explicit migration authorization
  remain required before runtime use.
  The earlier root-level `drizzle/manual/20260903_graphify_execution_identity_v1.sql` is now only
  a non-executable compatibility pointer, preventing a second migration authority.
- `scripts/atlas/plan-graphify-execution-ledger-coordinator-v1.mjs` now produces a dry coordinator
  plan from the existing source-selection receipt: 25,419 bindings, a valid workspace revision,
  fresh execution identity, fixed advisory-lock namespace/key, and the ten lifecycle stages. The
  plan explicitly keeps migration unapplied and requires authorization/canary proof; it performs
  no writes. Receipt: `docs/reports/graphify-execution-ledger-coordinator-plan-v1.json`.
- [ ] `GRAPHIFY-DAILY-COORDINATOR-01`: use a dedicated connection with the frozen session advisory
  lock namespace/key, capture fresh workspace/source bindings, create source-selection membership,
  and transition one execution through its stages. Do not use `graphify_runs.run_id` as attempt identity.
- Audit finding: the existing `scripts/atlas/graphify-daily-lifecycle-open-v1.mjs` and
  `graphify-daily-lifecycle-complete-v1.mjs` are legacy `graphify_runs` lifecycle wrappers. No
  implementation currently owns `graphify_executions` or `SOURCE_SELECTION`. The new coordinator
  must be a separate owner after migration authorization; do not retrofit the legacy wrappers or
  infer readiness from unrelated `execution_id` tables.
- The existing read-only producer audit is ready for injected wiring: 25,419 source bindings,
  108 skipped entries, workspace revision `sha256:35e032dee4202bcb34e31efed5baebcd602d4b7e23e7c98d226f5bb2aa75aeb3`,
  and no writes. Receipt: `docs/reports/graphify-lifecycle-entrypoint-v1.json`. This proves the
  source-selection producer, not the new execution-ledger coordinator.
- [ ] `GRAPHIFY-DAILY-CANARY-02`: prove executions A/B over identical bytes have distinct IDs but
  equal workspace/manifest/source revisions, then execution C changes only the modified source and
  receives a new workspace revision. Require independent SQL readback and zero out-of-scope writes.
  **Partial progress (2026-09-04), NOT closing this checkbox yet — only half proven.** Run A/B half
  proven live against the real dev DB, inside one `BEGIN...ROLLBACK` transaction (zero persistent
  writes, verified via `to_regclass` before/after): `execution_id_a != execution_id_b` (true),
  `workspace_revision_a == workspace_revision_b` (true), 2 independent `graphify_execution_files`
  rows correctly bound per execution_id under the same source cohort (4 rows total, 2+2, not
  deduped across executions). Script: `sveltekit-frontend/scripts/atlas/graphify-daily-canary-02-proof-2026-09-04.sql`
  (reusable, documents both a local-psql and a docker-exec invocation method). **Run C
  (changed-source-bytes -> different workspaceRevision) deliberately NOT attempted** — doing it
  honestly requires a real second workspace_revision computed the same way production does (sha256
  of the sorted exact-byte source manifest after changing one canary source), not a second
  synthetic literal; faking that value would prove nothing. Left open for a follow-up pass.

## REMAINING-TASK-PRIORITY-AND-HELPERS-01 (30 unchecked items)

Use this as the coordination index for the remaining unchecked items. A helper may produce an audit, test, or proposal, but may not mark a task complete without a linked receipt and may not mutate canonical stores. One helper owns one lane at a time; helpers must not create competing revision, ordinal, graph, cache, or lifecycle authorities.

### P0 — unblock the dependency graph

1. `PKT-LINEAGE-08 / PROMOTION-01` — ready for explicit authorization; prove the real packet-writer entrypoint with one bounded source, exact membership readback, and idempotent replay. This is the first executable mutation-capable gate, but it remains dormant until authorization is explicit.
2. `CURRENT-SOURCE-COHORT-OWNER-01` — repair the existing cohort owner and
   change admission from whole-workspace equality to exact per-source lineage
   before any cohort regeneration.
3. `LINEAGE-02` — `LINEAGE-02-COHORT-ORIGIN-01`; recover the authoritative
   cohort definition, owner, population checksum, and candidate-selection
   evidence. Keep `cohortSize=UNRESOLVED` until those exist; do not infer or
   substitute the 55,169-row semantic snapshot.
4. `DAG-RUNTIME-01D.2` — blocked revision-bundle gate; source, candidate, graph, and representation revisions are not one authoritative world-state.
5. `RETRIEVAL-01L` — governance closeout; freeze the durable proposal/rollback/readback/replay protocol for full Qdrant projection ownership. Do not rerun historical bulk reconciliation merely to recreate an unavailable proposal artifact.
6. `PKT-LINEAGE-08` production-entrypoint proof — subordinate to item 1; no historical backfill or broad packet scan.

### P1 — execute after the P0 owner decisions

7. `DAG-RUNTIME-01D` — deterministic live replay, only after 01D.2.
8. `DAG-RUNTIME-01E` — ContextManifest and validation-receipt linkage, only after 01D.
9. `ACE / MCP caller adoption` — one strict ACE caller through SearchRuntime and ContextManifestV2; keep the other legacy callers unchanged.
10. `BitFrost invalidation` — prove Valkey mutation invalidation and tracking-disconnect flush safety separately.
11. `MCP manifest/caller/alias items` — finish only the missing manifest, bounded NLP caller, and TRACE alias replay; dense tool projection remains a separate proof.
12. `PKT-LINEAGE-09` — execute only the frozen, reverified backfill cohort after the required authorization and drift check.
13. `PKT-LINEAGE-10/11` — reconcile from the canonical membership table, then run the tiny Qdrant canary only after zero-ambiguity dry reconciliation.

### P2 — validation hygiene and optional/derived lanes

13. Validation item 44 — audit every completed checkbox for a real report/test/evidence link; do not rubber-stamp.
14. Validation item 45 — audit read-only claims against actual commands; retain the documented separately authorized Qdrant exception.
15. `NESTED-TRAIN-02` — blocked until a lineage-qualified semantic source snapshot exists.
16. `NESTED-REP-01` — blocked until the new AE baseline exists; evaluate quality and safe-stop residency separately.
17. `PROMOTION-02` — apply authorization/readback/rollback policy only after the specific target lane is selected.
18. `DENSE MCP TOOL-MANIFEST` — restore only if an authorized producer and embedding contract are identified; do not invent a projection writer.
19. `ACE RESIDENCY` — after live ACE adoption and invalidation; distinguish residency state from representation LOD.
20. `CENTROID-BITFROST` — after invalidation; metadata/prefetch hint only, never candidate exclusion or identity authority.

### P3 — blocked by the semantic cohort and downstream representation order

21. `CandidateOrdinalMapV1` semantic materialization — task 14 in the implementation slice, blocked by task 13.
22. Frozen KNN/top-K execution — task 15 in the implementation slice, blocked by semantic cohort admission.
23. KNN output-population proof — no execution against mismatched UUID/proto/packet universes.
24. KMeans centroid-membership proof — only from the exact KNN/shared matrix population.
25. SOM 20x20 replay — explicit grid and seed only; derived coordinates, never identity.
26. AE/fanout — last in the chain; no latent writes in the current read-only tranche.
27. `NESTED-TRAIN-02` bulk retraining — never start from the current lineage-incomplete export.
28. `NESTED-REP-01` promotion/residency wiring — do not build `RepresentationLODPolicyV1` from design intent alone.
29. `PROMOTION-01` broad promotion completion — remains a cross-lane acceptance task, not permission to write.
30. `PROMOTION-02` broad apply — remains blocked until a specific target list, rollback artifact, and human authorization exist.

### Helper coordination contract

- `AUDIT-HELPER`: owns items 2–4 and 13–14; read-only reports, no status mutation.
- `LINEAGE-HELPER`: owns items 1, 5, 11–12; may prepare a bounded proposal, but apply requires authorization.
- `OAK-HELPER`: owns items 6–7; exact implementation refs, revision bundle, deterministic receipts.
- `ACE-BITFROST-HELPER`: owns items 8–9 and 19–20; one caller, then invalidation, then residency/prefetch.
- `MCP-HELPER`: owns item 10 and 18; live discovery/manifest parity only, no dense projection creation.
- `REPRESENTATION-HELPER`: owns items 15–17 and 21–30 only after the semantic cohort gate passes.

Agentic error-fixing rule: every helper starts from the latest receipt, reproduces the smallest failing case, makes the narrowest owner-local change, reruns the focused test, and reports `CREATED`, `WIRED`, `PROVEN`, or `BLOCKED`. A passing fixture or a generated task is not production completion.

Implementation rule: tasks 12–15 are sequential and read-only until their receipts are independently proven. Task 12 resolved the owner candidate but did not prove coverage; the current result remains `SEMANTIC_CANDIDATE_COHORT_BLOCKED` with zero authoritative binding coverage. KNN, KMeans, SOM, latent fanout, ACE/BitFrost, and centroid promotion remain blocked on this slice.

Execution order is strict: `CandidateOrdinalMapV1` admission → frozen KNN/top-K receipt → KNN population proof → KMeans centroid membership proof → explicit SOM 20x20 replay → AE/fanout. Until each receipt is linked, downstream stages remain `BLOCKED` even if their standalone unit tests pass.

Dependency rule: `SOM/AE TRAIN` is **BLOCKED** while `KNN`, `KMeans`, or `topK` population/parameter alignment is unresolved. `NetworkX JSON`, `cuDF/cuGraph`, centroids, and ACE/BitFrost may consume the same frozen projection only after its revision and checksum are admitted. No canonical relationship promotion follows from these executor proofs.

Evidence basis: existing `ProjectionOrdinalMapV1`, NetworkX replay, bounded cuGraph parity reports, `docs/reports/mcp-ace-bitfrost-alignment-audit-v1.json`, and the current Graphify/semantic representation contracts.

## MCP-TOOL-REGISTRY-REVISION-01 (2026-09-03, operator-directed -- DONE, all phases proven)

Successor to `MCP-TOOL-VITERBI-ACE-BRIDGE-01..04` and `MCP-TOOL-REGISTRY-DRIFT-CLASSIFICATION-01`
(this gate's own `nextGate` pointer). Builds server-qualified `(serverAuthorityId, toolName)`
tool identity, real live `tools/list` discovery (replacing the static AST/manifest-derived
registry as authority), split surface/policy revisions, six-value handler classification, an
explicit TRACE count-anomaly census, and a proposal-only `ToolProposalV1` bridge extension --
without executing a single tool or mutating any datastore. Plan approved and executed per
`C:\Users\james\.claude\plans\optimized-coalescing-koala.md`.

**Real correction found during Phase B, not assumed from static research**: the live
"atlas-tools" MCP server this repo's own `.mcp.json` actually wires up (and the one
"atlas-tools smoke 10/10" throughout this file refers to) is
`sveltekit-frontend/scripts/mcp/atlas-tools-mcp.mjs` (raw newline-delimited JSON-RPC, no SDK,
`SERVER_INFO.name: 'atlas-tools'`) -- **not** `sveltekit-frontend/src/mcp/server.ts`
(`'deeds-legal-server'`, ~88 tools), which the existing AST parity/drift audit is scoped to.
Checked directly: no script under `scripts/` spawns `src/mcp/server.ts` anywhere (it's only
referenced as a "critical file must exist" check in `init-workspace.sh` and
`benchmark-retrieval-e2e.mjs`). This gate's live discovery targets the two servers actually
reachable in this environment -- `atlas-tools-mcp.mjs` (stdio) and `trace-mcp-server.ts` (HTTP
`:8788`, confirmed live) -- `src/mcp/server.ts`'s live status remains an open, flagged, unresolved
question, not silently assumed either way.

- [x] **Phase A** -- Types + checksum primitives.
  `sveltekit-frontend/src/lib/server/retrieval/mcp-tool-registry-types-v1.ts` (Zod schemas:
  `MCPToolRefV1`, `MCPToolSurfaceRevisionV1`, `MCPToolPolicyRevisionV1`, `MCPRegistryAdmissionV1`,
  `ToolProposalV1`, six-value `MCPHandlerClassificationV1`, `READ|WRITE|ADMIN|UNKNOWN`
  `MCPPermissionClassV1`) + `mcp-registry-checksum-v1.ts` (real sha256, key-sorted canonical JSON,
  `deriveServerAuthorityId`, annotations-excluding `canonicalizeJsonSchema`). 28/28 tests pass
  (`mcp-registry-checksum-v1.spec.ts` 14, `mcp-tool-registry-types-v1.spec.ts` 14).
- [x] **Phase B** -- Live discovery. `scripts/atlas/discover-mcp-tools-live-v1.mts` -- real
  `initialize`->`tools/list` via `@modelcontextprotocol/sdk`'s `Client`, stdio for atlas-tools,
  Streamable HTTP for TRACE. **Live results**: atlas-tools 10 tools (matches the smoke count
  exactly), TRACE 175 tools (matches the static registry index's `trace_tools` figure exactly),
  **TRACE live-advertises `capabilities.tools.listChanged: true`** -- a real correction to this
  session's own static-grep-based research, which had concluded neither server advertises it.
  atlas-tools does not advertise it (confirmed, matches research). **Found and fixed a real
  determinism bug before shipping**: the first version hashed `discoveredAt` (a timestamp) into
  `toolSurfaceRevision`, making it non-deterministic across immediate re-runs with an unchanged
  tool set -- caught by literally running discovery twice and diffing, not assumed correct. Fixed
  by excluding `discoveredAt` from the hash input entirely; two more consecutive runs then
  produced byte-identical `toolSurfaceRevision` for both servers. Evidence:
  `docs/reports/mcp-tool-surface-live-v1.json`.
- [x] **Phase C** -- Policy reconciliation. `mcp-tool-policy-classifier-v1.ts` joins live tool
  refs against `atlas-tool-registry.ts`'s `permission`/`humanApproval` fields and
  `ACPToolRegistry.ts`'s `DRY_RUN_TOOLS` set -- read+reconcile only, no new execution allowlist.
  9/9 tests pass. `scripts/atlas/build-mcp-registry-admission-v1.mts` assembles
  `MCPRegistryAdmissionV1` per server (`registryRevision = sha256(toolSurfaceRevision +
  toolPolicyRevision)`). Evidence: `docs/reports/mcp-registry-admission-v1.json`.
- [x] **Phase D** -- Handler classification reconciliation. `mcp-handler-classification-v1.ts`
  re-classifies the existing 22 `PRIVATE`/`LEGACY`/`DELEGATED_CANONICAL` handlers and 7 `ALIAS`
  duplicates into the six-value taxonomy, using live TRACE discovery as the only independently
  verifiable side (the `src/mcp/server.ts` side rests on AST evidence only, honestly labeled as
  such, never silently promoted). Real result: all 7 original duplicates confirmed live on TRACE
  (`DEPRECATED_ALIAS`); **6 more names previously classified `DELEGATED_CANONICAL`
  (`phase109a_*` x 5, `ldr_research`) turned out to also be live on TRACE under the identical
  name** -- reclassified `DEPRECATED_ALIAS` too, a genuine new finding live discovery caught that
  the AST audit alone had missed. The remaining 16 entries (7 `atlas.*` "delegated" names + 9
  dispatcher-only names) are `UNKNOWN`, fail-closed, since only AST evidence exists for them and
  `src/mcp/server.ts`'s live status is unconfirmed. 6/6 tests pass. Evidence:
  `docs/reports/mcp-handler-classification-v1.json`.

  **CORRECTION (2026-09-03, post-close, operator-directed)**: the `DEPRECATED_ALIAS` label on the
  13 duplicate names above overstates what live discovery actually proved. Per current MCP
  protocol semantics, tool-name uniqueness is **server-local**, not global -- two different MCP
  servers legitimately advertising a tool under the same bare name is not evidence that one is a
  deprecated/superseded alias of the other, only that a name collision exists across servers.
  Live discovery proved exactly that: the name is live on TRACE. It did **not** prove ownership,
  deprecation, or supersession direction, and `src/mcp/server.ts` (the presumed other side of the
  "alias") is not itself proven live in this repo (see the correction below and this gate's own
  earlier note). Treat the 13-count as **cross-server name-collision evidence**, not canonical
  deprecation authority, until independent ownership/deprecation evidence exists. Follow-up
  hardening (`MCP-TOOL-REGISTRY-HARDENING-01`, added below) will record this as an explicit
  `crossServerNameCollision: true` field alongside `(serverAuthorityId, toolName)` selector
  identity, separate from the `MCPHandlerClassificationV1` taxonomy -- not a rewrite of the
  taxonomy's existing values.
- [x] **Phase E** -- TRACE count-anomaly census. `scripts/atlas/census-trace-tool-counts-v1.mjs`.
  Real result: `TRACE_LIVE_TOOLS_LIST=175`, `TRACE_STATIC_DECLARATIONS=119` (cross-checked by
  direct extraction against the parity report's own count, exact match),
  `TRACE_HANDLER_IMPLEMENTATIONS=119` (trivially equals static declarations for
  `registerTool()`-shaped servers, stated explicitly rather than a false distinction),
  `TRACE_MANIFEST_ENTRIES=16` (only 16 of the registry index's 339 total `by_layer` entries
  actually tag `source_ref`/`service` as TRACE -- the file's own `trace_tools: 175` top-level
  figure matches live discovery exactly, suggesting it was itself live-sourced at generation
  time despite the file's static/AST framing; its separate `manifest_tools: 206` figure is
  **not** a TRACE-specific count at all). The historical "327/175/190" figures cited earlier in
  this file predate current disk contents and cannot be reproduced -- treated as stale, not
  forced to reconcile. Evidence: `docs/reports/trace-tool-count-census-v1.json`.
- [x] **Phase F** -- `ToolProposalV1`/bridge v2 extension. Added
  `proposeMcpToolWithViterbiV2()` to `mcp-tool-viterbi-bridge-v1.ts` (existing
  `proposeMcpToolWithViterbiV1()`/`McpToolSelectionProposalV1` untouched, still 5/5 passing).
  Composite `(serverAuthorityId, toolName)` candidate ids make the k-best decoder's existing
  duplicate-id guard a real cross-server safety net. Surfaces `rank`/`pathScore`
  (already computed by `decodeKBestViterbi`, previously discarded) and `observationsDigest`.
  13/13 new tests (`mcp-tool-viterbi-bridge-v2.spec.ts`) prove every acceptance-criteria row:
  unknown server/tool/schema-mismatch/stale-revision/unknown-permission/WRITE-and-ADMIN-without-
  approval all FAIL correctly; identical inputs -> identical `registryRevision`; schema-only vs
  policy-only changes move only their own revision; same `toolName` on two different servers
  resolves to two independent, non-colliding proposals; `executionAuthorized`/
  `executionPerformed`/`writesPerformed` are always `false`.
- [x] **Phase G** -- Final live-but-read-only verification. Re-ran
  `discover-mcp-tools-live-v1.mts` once more immediately before closing this gate: both
  `atlas-tools` (stdio) and `trace` (`:8788`) reachable. **61/61 tests pass** across all 6 new
  spec files (`mcp-registry-checksum-v1`, `mcp-tool-registry-types-v1`,
  `mcp-tool-policy-classifier-v1`, `mcp-handler-classification-v1`,
  `mcp-tool-viterbi-bridge-v1` (unchanged), `mcp-tool-viterbi-bridge-v2`). No `tools/call`
  anywhere in this gate's code (verified: every new file's only server-facing calls are
  `initialize`/`tools/list`). No Postgres/Qdrant/Redis/Neo4j write anywhere.

**Explicitly deferred, per plan and operator instruction**: `notifications/tools/list_changed`
listener/invalidation logic (only the `listChangedSupported` schema field ships now -- real live
value already captured: `true` for TRACE, `false` for atlas-tools); feeding real NLP observations
into Viterbi frames; any actual `tools/call`; adding `capabilities.tools.listChanged` to either
server's own construction (TRACE already advertises it independently of anything in this gate).
All deferred to `MCP-VITERBI-LIVE-OBSERVATION-ADMISSION-01`. `hmm-tool-selector.ts` and
`viterbi-router.ts` flagged as possibly-competing/misleadingly-named owners per this repo's "ONE
canonical owner per capability" rule -- not touched. `src/mcp/server.ts`'s live-launch status
remains an open, unresolved finding, not silently assumed.

Evidence: `docs/reports/mcp-tool-surface-live-v1.json`, `docs/reports/mcp-registry-admission-v1.json`,
`docs/reports/mcp-handler-classification-v1.json`, `docs/reports/trace-tool-count-census-v1.json`.

**Post-close error check (2026-09-03)**: ran `npx tsgo --noEmit` (fast TS 7 native checker) filtered
to all 6 new/modified files. Found **one real, pre-existing error** unrelated to any new code --
`McpToolRegistryIndexV1.tools?: readonly Array<{...}>` in the original (untouched-until-now)
`mcp-tool-viterbi-bridge-v1.ts` used invalid syntax (`readonly` before `Array<T>`, TS1354).
Fixed to `ReadonlyArray<{...}>`. Re-ran `tsgo --noEmit`: zero errors across all 6 files. Re-ran
all 61 tests: still 61/61 pass. Re-ran all four standalone scripts fresh
(`discover-mcp-tools-live-v1.mts`, `build-mcp-registry-admission-v1.mts`,
`build-mcp-handler-classification-v1.mts`, `census-trace-tool-counts-v1.mjs`): identical results
to the original run (`ALL_SERVERS_REACHABLE`/`ALL_SERVERS_ADMITTED`, 175/119/119/16 census
counts, 16 UNKNOWN / 13 DEPRECATED_ALIAS classification counts) -- confirms the earlier run
wasn't a fluke and nothing regressed from the type fix.

**Broader collateral-damage check (2026-09-03, same day)**: ran the entire
`src/lib/server/retrieval/` test directory (70 files, 409 tests), not just the 6 new files, to
check for anything this gate might have broken elsewhere. Result: **7 files / 20 tests fail**
(`prefilter.test.ts`, `summary-card-retrieval.test.ts`, `unified-orchestrator.spec.ts`,
`canonical-rerank-route.spec.ts`, `executor-tree-test.server.test.ts`, `qdrant-sync-payload.spec.ts`,
`__tests__/cross-ranker.test.ts`):

**CORRECTION (2026-09-03, post-close, operator-directed)**: the original wording here
("all confirmed pre-existing, none caused by this gate") overstated what the evidence actually
shows. `git status --porcelain` returning empty on all 7 files proves those files were not
*edited* by this session -- it is not temporal proof the failures existed *before* this gate ran,
since an untouched test can fail because a dependency it imports changed elsewhere. No pre-session
baseline receipt for these 7 files/20 tests exists in this repo to establish that. The evidence
that *does* hold: none of the 7 files reference MCP/registry/Viterbi at all, and all 6 of this
gate's own new spec files pass within the same full-directory run (61/61, matching every isolated
run before it). Correct statement: **`NO_MCP_LINKED_REGRESSION_IDENTIFIED`** -- not
"confirmed pre-existing." Not investigated or fixed here -- out of scope for
`MCP-TOOL-REGISTRY-REVISION-01`, flagged for whoever owns `retrieval/` next (likely needs live
Postgres/Qdrant infra this test run didn't have, based on the failure shapes, but not confirmed).

**Full-repo error check (2026-09-03, third pass, strictly stronger than the two checks above)**:
the two checks above scoped to the 6 new files and to `retrieval/` only. This pass ran
`npx tsgo --noEmit` across the **entire repo** (`tsconfig.json`, no path filter). Result: **48
pre-existing errors**, zero of them in this gate's 6 files. Every error is either a missing
optional npm package (`pdf-lib`, `mammoth`, `nodemailer`, `fastmcp`, `piper-wasm`,
`@mendable/firecrawl-js`, `@playwright/test` -- `TS2307`) or unrelated type drift in
vector/qdrant/trpc/topology code (`image-search.ts`, `multi-store.ts`, `ast-sidecar.ts`,
`feature-tracking-layer.ts`, `nlp-observation-lineage-v1.ts`, `qdrant-http.ts`,
`live-structural-lane-provider.ts`, `research/search/+server.ts`). Verified via
`git status --porcelain` on all 8 non-`TS2307` error files: empty output, none touched by this
session. Also re-ran the live discovery script twice more this pass and diffed
`toolSurfaceRevision` directly (not just eyeballing the printed summary): both servers'
checksums came back byte-identical across the two runs (`atlas-tools:
14ff8f5fb513deb24c4fbdadccc58a6d4e2250c0cef859d1cb3336c370e76b5e`,
`trace: ef13f47e1ad3bba8fb2bf9f08a493742dd68fe1b5719b457e1e6afbbb224188a`) -- fourth and fifth
consecutive determinism-preserving runs, counting the two from Phase B. All four scripts re-run
again with identical figures to every prior run. This closes out the collateral-damage question
at full-repo scope, not just `retrieval/` scope -- nothing in this gate's own files, and no
regression anywhere else in the repo attributable to this session.

## HANDOFF — 2026-09-03 (MCP-TOOL-REGISTRY-REVISION-01 complete)

**`MCP-TOOL-REGISTRY-REVISION-01` is DONE** -- all 7 phases (A-G) built, tested, and verified
against the real, live, running `atlas-tools` and `trace` MCP servers. See the full section
above for complete evidence. Summary for a fresh session:

**What exists now, real and proven**:
- `sveltekit-frontend/src/lib/server/retrieval/mcp-tool-registry-types-v1.ts` -- canonical Zod
  types (`MCPToolRefV1`, `MCPToolSurfaceRevisionV1`, `MCPToolPolicyRevisionV1`,
  `MCPRegistryAdmissionV1`, `ToolProposalV1`).
- `mcp-registry-checksum-v1.ts` -- real sha256 checksum primitives (deterministic, key-sorted,
  annotations-excluding).
- `scripts/atlas/discover-mcp-tools-live-v1.mts` -- real live `tools/list` discovery. Confirmed
  working: atlas-tools (stdio, `sveltekit-frontend/scripts/mcp/atlas-tools-mcp.mjs`) = 10 tools;
  trace (HTTP `:8788`) = 175 tools, `listChanged: true`.
- `mcp-tool-policy-classifier-v1.ts` + `scripts/atlas/build-mcp-registry-admission-v1.mts` --
  policy reconciliation + admission assembly.
- `mcp-handler-classification-v1.ts` + `scripts/atlas/build-mcp-handler-classification-v1.mts` --
  six-value handler classification, supersedes the old PRIVATE/LEGACY/DELEGATED_CANONICAL/ALIAS
  taxonomy with live-verified evidence.
- `scripts/atlas/census-trace-tool-counts-v1.mjs` -- resolves the historical count anomaly with
  real named-set evidence (327/175/190 no longer reproducible from current disk contents; the
  real live/static/manifest figures are 175/119/16).
- `proposeMcpToolWithViterbiV2()` added to the existing `mcp-tool-viterbi-bridge-v1.ts` (v1
  untouched, still passing) -- server-qualified, split-revision, proposal-only tool selection.
  13/13 tests prove every acceptance-criteria row from the operator's spec.
- 61/61 tests pass across all 6 new files; zero TypeScript errors (`tsgo --noEmit`); all 4
  standalone scripts re-run cleanly with consistent results across 5 consecutive live-discovery
  runs (byte-identical `toolSurfaceRevision` each time); confirmed no collateral damage to the
  other 64 pre-existing files in `retrieval/` **or to the full repo** (full-repo `tsgo --noEmit`:
  48 pre-existing errors, all missing-optional-package or unrelated type drift, none in files
  this session touched, verified via `git status --porcelain`).

**Real corrections/findings made along the way** (all recorded in detail in the section above --
worth reading before assuming anything about MCP server identity in this repo):
1. The live "atlas-tools" server is `scripts/mcp/atlas-tools-mcp.mjs`, NOT
   `src/mcp/server.ts` (`'deeds-legal-server'`) -- the latter has no confirmed live launcher
   anywhere in `scripts/`, despite being the AST parity audit's actual target.
2. TRACE already advertises `listChanged: true` live -- this session's own earlier static-grep
   research had wrongly concluded neither server does.
3. A real non-determinism bug (timestamp leaking into a content hash) was caught and fixed via a
   live two-run diff, not assumed correct from code review alone.
4. 6 tool names (`phase109a_*` x5, `ldr_research`) previously AST-classified
   `DELEGATED_CANONICAL` are confirmed live duplicates on TRACE -- reclassified with real
   evidence, a genuine finding live discovery caught that AST alone had missed.

**Explicitly deferred to `MCP-VITERBI-LIVE-OBSERVATION-ADMISSION-01`** (not started): real
`tools/list_changed` notification handling (only the schema field is reserved), feeding real NLP
observations into Viterbi frames, any actual `tools/call`, resolving `src/mcp/server.ts`'s live
status.

**Next session should**:
1. Decide whether to start `MCP-VITERBI-LIVE-OBSERVATION-ADMISSION-01`, or return to the
   Graphify/lineage thread (`PKT-LINEAGE-IDENTITY-LINK-AUTH-01` -> `PKT-LINEAGE-08`, both still
   open from earlier in this file -- unrelated to the MCP work, was the active thread before the
   operator redirected to MCP registry work).
2. The 7 pre-existing `retrieval/` test failures (flagged above, not investigated) are a
   separate, real gap if anyone owns that directory next -- not caused by this session.
3. `src/mcp/server.ts`'s live-launch status is a genuinely open question (real file, AST-audited,
   but no confirmed launcher found) -- worth resolving before trusting the old
   `mcp-tool-registry-drift-classification-v1.json`'s PRIVATE/LEGACY findings on that file as
   still-relevant to a currently-running system.
4. Plan file for this gate, if useful for reference: `C:\Users\james\.claude\plans\optimized-coalescing-koala.md`.

## HANDOFF CORRECTION — MCP registry post-close verification and hardening boundary (2026-09-03)

`MCP-TOOL-REGISTRY-REVISION-01` remains **`PROVEN_V1` / DONE**. This section does not reopen or
discard the gate above -- it corrects two overstated claims in the HANDOFF section above it,
records one small cleanup check, and opens the follow-up hardening gate the original handoff had
only informally pointed at.

**What stays, unchanged, strongest evidence carried forward**: the touched MCP surface (6 new/
modified files) is clean -- targeted TypeScript check is zero errors (after correcting the
pre-existing invalid `readonly Array<T>` syntax to `ReadonlyArray<T>`); 61/61 MCP-focused tests
pass; live discovery remains deterministic against the two actually-configured, reachable servers
(`parent-atlas:mcp:atlas-tools` = 10 tools, `parent-atlas:mcp:trace` = 175 tools) -- two more
consecutive live discoveries produced byte-identical `toolSurfaceRevision` values for both
servers; registry admission, handler classification, and TRACE census scripts re-run successfully
with stable figures; all report JSON artifacts parse successfully; no `tools/call` occurred; no
Postgres/Qdrant/Valkey/Redis/Neo4j mutation occurred.

**Correction 1 -- broader retrieval test-failure wording.** The wider `src/lib/server/retrieval/`
test run observed 7 failing files / 20 failing tests outside this gate's own MCP suite. These
failures are outside the files this gate modified, and no MCP-registry/Viterbi dependency was
identified in the reported failures. The correct statement is
**`NO_MCP_LINKED_REGRESSION_IDENTIFIED`** -- not "confirmed pre-existing." `git status
--porcelain` proving the failing test files were untouched is useful evidence that this session
did not directly edit them, but it is not by itself temporal proof the failures existed *before*
this gate ran -- an untouched test can fail because a dependency it imports changed elsewhere.
Treat these 7 files/20 tests as pre-existing only if a pre-session baseline receipt is later found
proving the same failures already existed; none exists in this repo today. The full-repository
typecheck similarly reports unrelated, existing missing-module/type-drift errors outside the
touched MCP surface -- those are correctly *not* folded into this gate's own error count, and that
framing stands unchanged.

**Correction 2 -- cross-server duplicate-name classification.** Live discovery proves that
multiple tool names occur on more than one MCP server. That proves a **cross-server name
collision**, not by itself that either implementation is deprecated or an alias. Per current MCP
protocol semantics, tool-name uniqueness is server-local, not global -- and because
`src/mcp/server.ts` is not currently proven to be a live server in this repo (see this gate's own
Phase B/D notes above), the existing 13-count `DEPRECATED_ALIAS` classification should not be
treated as canonical deprecation authority derived solely from identical names. Follow-up
hardening (below) will preserve `(serverAuthorityId, toolName)` as selector identity and record
same-name overlaps separately, e.g. `crossServerNameCollision: true`. If independent
ownership/deprecation evidence later proves an actual alias relationship, that separate evidence
may promote the classification to `DEPRECATED_ALIAS` -- not identical-name evidence alone. No
public MCP tool should be removed or renamed as part of this correction.

**Cleanup check performed**: the earlier determinism-debugging pass copied `/tmp/surface-run1.json`
into the repo root as `surface-run1-tmp.json` for a manual checksum comparison. Checked: `ls
surface-run1-tmp.json` -> not found; `git status --porcelain -- surface-run1-tmp.json` -> empty.
It was already removed (via `rm` immediately after the comparison, in the same command chain that
created it) -- confirmed, not assumed. No action needed.

**MCP protocol context for the hardening boundary below**: the MCP 2026-07-28 protocol revision
removes the handshake session model, carries protocol identity on each request, introduces server
discovery, and makes list responses cacheable with freshness hints. This gate's `initialize` ->
`tools/list` discovery path is proven, legacy-compatible runtime behavior against the two servers
actually running today -- it is not being upgraded to the new protocol revision in this gate.
`MCP-TOOL-REGISTRY-HARDENING-01` below records which protocol was actually negotiated per server
rather than assuming or upgrading it. For long-lived registry hashes, RFC 8785 JCS (recursively
sort object properties, preserve array order exactly) remains the correct canonicalization target
-- `mcp-registry-checksum-v1.ts`'s existing `canonicalJsonStringify()` already does exactly this
(recursive key-sort, array order preserved); no rewrite needed, just naming the standard it already
matches.

### MCP-TOOL-REGISTRY-HARDENING-01 (OPEN)

`MCP-TOOL-REGISTRY-REVISION-01` proved the live registry mechanism. Before real Viterbi
observations or `tools/call`, harden the identity contract **without rewriting the proven v1
implementation**. Required deltas:

- **Protocol coordinate**: record the actual negotiated MCP protocol version per server, and
  record which protocol era's discovery mechanism was used. Do not upgrade the MCP SDK or force
  the 2026-07-28 protocol in this gate.
- **Logical authority vs. transport**: `serverAuthorityId` is the logical Parent Atlas server
  identity and must not change merely because TRACE is reached over HTTP vs. stdio. Add a
  separate `discoveryTransportFingerprint` for transport/endpoint identity.
- **Global candidate-universe revision**: the existing per-server `registryRevision` remains
  useful. Add one deterministic `globalRegistryRevision` over the sorted surface+policy revisions
  of every server participating in the Viterbi candidate universe. `ToolProposalV1` must bind
  both the global candidate-universe revision and the selected server's own tool revisions.
- **Descriptor vs. schema revisions**: preserve `toolSchemaDigest` for input/output schema
  identity. Add `toolDescriptorDigest` for the complete advertised tool descriptor. Advertised
  `annotations`/metadata may participate in surface change-detection, but MUST NOT become Parent
  Atlas permission authority (unchanged from this gate's own existing rule).
- **Canonical JSON**: align long-lived revision serialization explicitly with RFC 8785 JCS
  semantics -- recursively sort object properties, preserve all JSON array ordering, never
  semantically rewrite JSON Schema merely for hashing.
- **Tool-list freshness/change semantics**: TRACE currently advertises `tools.listChanged: true`;
  atlas-tools does not. Record the actual protocol-aware change/freshness mode now. Listener
  subscription implementation itself remains deferred until before actual tool execution.
- **Execution invariant, unchanged**: selection remains proposal-only --
  `executionAuthorized: false`, `executionPerformed: false`. No datastore/cache mutation.

## Main Parent Atlas ordering (2026-09-03, operator-directed)

The MCP lane is healthy enough to pause after hardening. **The durable world mainline remains**:
`WORKSPACE-SOURCE-NAMESPACE-GATE-POLARITY-01` (formal `LINEAGE-01`) ->
`GRAPHIFY-OPEN-CLOSE-LIVE-WIRING-01` (one lifecycle-aware `graphify:daily`) -> exact
packet<->source lineage authorization (`PKT-LINEAGE-IDENTITY-LINK-AUTH-01` -> `PKT-LINEAGE-08`).

MCP continues in parallel, not instead of the mainline: `MCP-TOOL-REGISTRY-HARDENING-01` ->
`MCP-VITERBI-LIVE-OBSERVATION-ADMISSION-01` -> `MCP-TOOL-PERMISSION-ADMISSION-01`
(protocol-aware registry invalidation/freshness) -> `MCP-ACE-CONTEXT-BRIDGE-01` (bounded, read-only
tool-execution canary).

**Do not let ACE, BitFrost, centroids, Viterbi, TRACE, or MCP registry state become canonical
packet/source representation authority.** That authority stays Postgres, per this file's
standing rule throughout.

**Immediate next steps, in order**:
1. (Done, this pass) Checked `surface-run1-tmp.json` -- already removed, confirmed via
   `git status --porcelain`, no action needed.
2. (Done, this pass) Patched this file with the handoff correction above -- overstated
   "confirmed pre-existing" wording changed to `NO_MCP_LINKED_REGRESSION_IDENTIFIED` (unless a
   baseline receipt later proves temporal pre-existence); overstated same-name
   `DEPRECATED_ALIAS` claims downgraded to explicit cross-server-collision framing pending
   independent deprecation authority.
3. (Done, this pass) Added `MCP-TOOL-REGISTRY-HARDENING-01` as OPEN.
   `MCP-TOOL-REGISTRY-REVISION-01` was not reopened.
4. `openspec validate --strict` -- run after this edit, see result below.
5. Return to Parent Atlas's durable world: `WORKSPACE-SOURCE-NAMESPACE-GATE-POLARITY-01` /
   `LINEAGE-01`. Do not re-run `graphify:daily` merely because a stale hook requests it. Do not
   begin real MCP `tools/call` yet.

The main alignment is now clearer: today's MCP work is real and reusable, it just needs a small
identity-hardening layer. The highest-value unfinished Parent Atlas work is still formal lineage
closure and lifecycle-owned Graphify -- not another broad MCP or GPU expansion.

## DEPENDENCY-CAPABILITY-GUARD-01 (2026-09-03, operator-directed policy — POLICY_ADOPTED)

Invariant `NO_NEW_CAPABILITY_OWNER_WITHOUT_PROVEN_GAP`: never `pip install`/`conda install`/`docker
pull`/`build`/`npm install` merely because a library could help. Resolve every dependency mutation
against `docs/reports/runtime-capability-registry-v1.json` first — test whether the available
owner satisfies the caller's transport, ABI, latency, isolation, and failure-domain contract;
reuse it when it does, and only then consider the smallest new package or pinned environment
rebuild. A pinned rebuild is not a new capability owner, but still requires exact image/package
identity and replay evidence.
Full policy text (decision tree, required fields before any install, layer discipline for
CUDA/cuTile/SIMT/Tensor Cores) recorded in root `CLAUDE.md` under
"DEPENDENCY-CAPABILITY-GUARD-01 — no install without a proven capability gap" so it applies as a
durable, repo-wide rule, not just to this OpenSpec change.

**Real, verified finding this pass (not fixed, flagged for a future minimal-rebuild task)**:
`docker/atlas-gpu-8098/Dockerfile` builds `FROM rapidsai/base:26.08-cuda12-py3.13-amd64` — a
broad/full prebuilt RAPIDS environment — but
`services/atlas-gpu-8098/app.py` + `python/atlas_rapids_graph_runtime.py` (verified live via
`grep '^import|^from'` across both files, not assumed) only ever import `cudf`/`cugraph` (both
lazily, inside function bodies), plus `fastapi`/`pydantic`/`pyarrow` for the HTTP boundary. The
actual capability need (`graph.jaccard.gpu`) was already proven live on `wsl::atlas-rapids-cu13`
(cuVS/cuGraph/cuDF/CuPy/PyTorch 26.06.x, RTX 3060 Ti — see `GPU-MINI-FABRIC-01` above) before this
Docker image was ever built, per `GRAPH-LINK-TOPOLOGY-01`/`RAPIDS-CROSS-RUNTIME-JACCARD-01` above.
This is exactly the "installed a whole framework for one primitive" pattern this policy exists to
prevent, confirmed as real (not hypothetical) evidence for adopting the policy.

**Registry**: `docs/reports/runtime-capability-registry-v1.json` — `wsl::atlas-rapids-cu13`
(preferred owner, `installAllowed: false`) and `docker::atlas-gpu-8098` (secondary owner, real
imports vs. base-image contents documented, `minimalRebuildTarget` recorded) entries, a
per-capability owner map (`graph.jaccard.gpu`, `graph.pagerank.gpu`, `graph.bfs.gpu`,
`ann.exact.gpu`, `ann.cagra.gpu`), `tile.programming.gpu (cuTile)` explicitly frozen
`AVAILABLE_FUTURE_CHALLENGER` / `installAllowed: false` pending an `ACE-RADIX-01` cuTile-half PASS
with an Ampere-capable CUDA 13.2-generation TileIR toolchain. This does not require a system-wide
CUDA upgrade if the isolated Python environment supplies the compiler components, and a
`prohibitedDuplicateOwners` list.

**Explicitly not done this pass**: rebuilding `docker/atlas-gpu-8098` to a minimal image (real,
scoped follow-up — swap the base image for a slim CUDA+Python base and pip-install only
`cudf`/`cugraph`/`fastapi`/`uvicorn`/`pyarrow`/`pandas`/`pydantic`, then re-prove
`RAPIDS-CROSS-RUNTIME-JACCARD-01`'s 3-way parity still holds); installing/upgrading any package
anywhere; touching `wsl::atlas-rapids-cu13`.

## GRAPHIFY-OPEN-CLOSE-LIVE-WIRING-01 (2026-09-03, DONE — live-proven by the real entrypoint, not a standalone script)

Wires the proven `openGraphifyRunV1`/`bindWorkspaceRevisionV1`/`completeGraphifyRunV2` primitives
(previously exercised only by `scripts/atlas/prove-graphify-open-bind-complete-lifecycle-v1.mjs`,
per `GRAPHIFY-LIFECYCLE-OWNER-01`/`GRAPHIFY-OPEN-CLOSE-WIRING-01` above) into the actual live
`npm run graphify:daily` entrypoint (`scripts/startup/run-graphify-daily-startup.mjs`) for the
first time. Confirmed from real log evidence (`tmp/graphify-daily-run-3.log`, the prior
confirmed-terminal run) that no `graphify_runs` open/bind/close activity occurred anywhere in the
real chain before this — the primitives had zero callers outside their own spec and two standalone
proof scripts.

**New files**:
- `scripts/atlas/graphify-daily-lifecycle-open-v1.mjs` — opens a bare `graphify_runs` row
  (`workspace_id: 625743d2-092b-4fa8-abe0-9dc094920c80`, from
  `scripts/atlas/daily-graphify-config.json`'s `workspace_uuid`), then materializes a real
  `WorkspaceRevisionRecordV1` + full `WorkspaceSourceBindingV1[]` set via the existing
  `materializeWorkspaceRevisionOriginV1()` (a pure, already-built function — real `git ls-files` +
  per-file content-hash walk, no new logic invented), and binds it to the opened row. Writes a
  receipt to `docs/reports/graphify-daily-lifecycle-v1.json`.
- `scripts/atlas/graphify-daily-lifecycle-complete-v1.mjs` — reads that receipt and closes exactly
  that row (`RUNNING` → `COMPLETED`) via `completeGraphifyRunV2`, fail-closed if the receipt is
  missing or already completed.

**Wiring in `run-graphify-daily-startup.mjs`**: open+bind runs immediately before the real
`DAILY_CHAIN_SCRIPT` (`npm run graphify:daily:chain`) execution; complete runs immediately after
it succeeds. Both steps are deliberately **non-fatal** (wrapped in try/catch, matching this file's
existing pattern for optional stages like NES/CHROM packet materialization) — lifecycle
bookkeeping must never block the real indexing work it observes.

**Live-proven twice, independently SQL-verified both times**:
1. **Standalone dry test** (isolated scripts, before wiring into the orchestrator): opened, bound
   (25,300 real source files, real content hashes), and completed run `5b2e18fc-...` in ~32s.
   Verified via direct `psql` after each step, not just the scripts' own printed output.
2. **Real entrypoint run** (the actual authorization target — `npm run graphify:daily` invoked
   with zero manual intervention): opened+bound run `862b952b-...` at the correct point in the
   real chain, then — after the full `DAILY_CHAIN_SCRIPT` genuinely succeeded (dedup-validation →
   materialize → cold-processing → phase8-fanout's 11/11 sub-steps, including the 439.8s Neo4j GDS
   step, 10/10 gates passed → qdrant tag-mirror → feature-map-sync, 109,776 Qdrant points scanned,
   4,748 files upserted to `atlas_feature_map`) — completed it. **Independently re-verified via a
   fresh `psql` query, not the script's own log**: `status: COMPLETED`, real `workspace_revision`
   (`sha256:b55e...`), `source_manifest_source_count: 25301`, `started_at`/`completed_at` 731.5s
   apart. This is the third genuine open→bound→completed `graphify_runs` row in this repo's
   history, and the first one produced by the live entrypoint rather than a standalone script.

**Real, unrelated finding surfaced by this run (not caused by this wiring, not fixed here)**: a
*later* optional step in the same `graphify:daily` invocation, `atlas:bm25:index:plan`, failed with
a Windows filesystem error (`UNKNOWN: unknown error, open
'...\\sveltekit-frontend\\docs\\reports\\graphify-bm25-index-plan.json'`) — this caused the overall
npm process to exit non-zero (`ERROR: graphify:daily failed`, fallback disabled). **This is exactly
why the lifecycle close was placed immediately after the core indexing chain rather than at the
very end of the wrapper script**: the `graphify_runs` row correctly shows `COMPLETED` because the
indexing work it represents genuinely finished, independent of a later, unrelated optional step's
transient failure. Not investigated further — flagged for whoever owns the BM25 planning step next;
likely a transient Windows file-handle/antivirus lock, not a logic bug (the same script has
presumably run before without this).

Evidence: `docs/reports/graphify-daily-lifecycle-v1.json`, `tmp/graphify-daily-lifecycle-wiring-live-run.log`,
direct SQL readback quoted above.

**Precondition for the architecture freeze below is now satisfied**: `GRAPHIFY-OPEN-CLOSE-LIVE-WIRING-01`'s
live run reached canonical `COMPLETED` (`run_id: 862b952b-7623-434e-818e-407c1531abaf`, independently
SQL-verified above). Its bound `workspace_revision` (`sha256:b55e7e34618f693e459cb226607dba2df700c44d7ba3185e40417ddaaa78461e`)
is the frozen `graphRevision` the graph-feature-parity gates below consume — not a fresh
`graphify:daily` run manufactured to obtain one.

## PARENT ATLAS CANDIDATE PIPELINE ARCHITECTURE FREEZE (2026-09-03, operator-directed — PLANNED, not executed)

Freezes the intended shape of one convergent candidate pipeline — features and executors feeding
one ranking stage, not separate competing retrieval systems. This section registers architecture
and five new `OPEN` gates; **no code was written and no gate below was started this pass** — this
is a planning/registration entry, matching this file's existing "Staged, not yet built" convention
(see root CLAUDE.md's GPU-MINI-FABRIC-01 for the same pattern). Per `DEPENDENCY-CAPABILITY-GUARD-01`
above: no new dependency installs, no new canonical stores. Postgres remains sole authority;
NetworkX/cuGraph/cuVS/XGBoost/PyTorch are all derived executors, never identity or relevance
authorities.

### Architecture

```
SOURCE / GRAPH WORLD
source bytes -> AST/CST/imports/calls/refs -> Graphify -> StructuralGraphSnapshotV1
  -> graphRevision -> canonical PostgreSQL evidence
        |                    |                    |
   DOMAIN FEATURES      SEMANTIC KNN         GRAPH FEATURES
   Python classifier    semantic_768         NetworkX (CPU) / cuGraph (GPU)
   -> domain probs      -> cuVS exact Top-K  -> PageRank/PPR/etc.
        |____________________|____________________|
                             v
                    CandidateFeatureV1
                             v
                    XGBoost reranker
                             v
                       final Top-K
                             v
              ACE / ContextManifest -> PromptPlan
```

1. **Graphify owns graph creation** — nodes, typed edges, source evidence, revision identity,
   `graphRevision`. NetworkX and cuGraph never create canonical graph identity; NetworkX is the
   CPU correctness/reference graph, cuGraph is the GPU execution projection of the *same*
   `GraphSnapshotV1` edge list. Both must bind identical `graphRevision`, `vertexMapChecksum`,
   `edgeSetChecksum` — this is what prevents "NetworkX world A" and "cuGraph world B" from quietly
   producing incomparable scores.
2. **PageRank is a structural feature, not retrieval authority.** NetworkX PageRank = CPU
   oracle/fixture correctness; cuGraph PageRank = GPU production executor, consuming the same
   `graphRevision`-scoped graph. Output shape: `StructuralFeatureV1 { graphRevision, graphOrdinal,
   pagerank, algorithmRevision }`. PageRank must never become `CandidateOrdinal` — keep
   `GraphOrdinal` (persistent coordinate inside one graph snapshot) and `CandidateOrdinal`
   (temporary coordinate inside one query snapshot) as distinct axes. Candidate assembly path:
   canonical packet -> `GraphOrdinal` lookup -> PageRank feature -> `CandidateOrdinal`. PageRank
   is `graphRevision`-scoped and batch-materialized once per graph revision (Postgres/Neo4j derived
   projection), never recomputed per query; Personalized PageRank (query/seed-scoped) is a distinct,
   later, optional query-time expansion — not built here.
3. **Semantic KNN/Top-K belongs to cuVS.** `semantic_768 -> cuVS brute-force (exact oracle) ->
   Top-K`, with CAGRA/Qdrant HNSW as ANN production/challenger executors under the *same* logical
   lane — preserves this file's existing `LANE != EXECUTOR` rule (semantic lane executors =
   `{cuvs_exact, cagra, qdrant_hnsw}`, one logical vote).
4. **Domain classification produces probabilities/features, not a hard authority.** One contract,
   `DomainClassificationV1 { canonicalId, sourceRevision, classifierFamily, classifierRevision,
   trainingSnapshotRevision, probabilities: {...}, predictedDomain, confidence, evidenceRefs[] }`.
   Rules / Naive Bayes / XGBoost / PyTorch become classifier executors/challengers under this one
   contract, not four independent domain authorities. `predictedDomain` is merely `argmax(probabilities)`
   — the `domainProbabilityVector` itself is the more useful ranking feature.
5. **XGBoost ranks candidates, it does not replace semantic search.** Consumes
   `CandidateFeatureMatrixV1 [N candidates x F frozen features]` (lexical score, semantic
   cosine/rank, domain probabilities, PageRank/PPR/graph distance, AST type, centrality, retrieval
   breadth, source recency, packet utility, classifier confidence, query-classification signals)
   and produces `rerankScore`. XGBoost score is a learned ranking *feature/output*, never canonical
   relevance truth. Its model identity requires `modelRevision`, `trainingSnapshotRevision`,
   `featureLayoutRevision`, `evaluationReceipt` before its ranking weight rises above zero.
6. **PyTorch owns models XGBoost cannot express well** — `NestedSemanticAutoencoder`, learned
   representation projection, neural reranker, cross-encoder, future domain neural classifier,
   policy/value models. Do not duplicate XGBoost's tabular-ranking role in PyTorch without
   evidence; the ranking matrix (cosine, PageRank, domainProb, rank, breadth, latency, graph
   distance) is exactly where boosted trees are the right tool.
7. **Reinforcement learning is deferred, later, and never a relevance/identity authority.** Not
   inside Graphify; does not directly change ranking weights online yet. Eventual shape: STATE
   (query features, candidate features, lane availability, domain probabilities, latency/token
   budget, residency state) -> ACTION (expand latent64->128? run semantic768? request structural
   neighbors? increase K? invoke reranker? stop?) -> REWARD (answer utility, citation quality,
   retrieval recall proxy, latency/token/GPU cost penalty, tool failure penalty) — a future
   retrieval *policy controller*, not a relevance oracle. Per `DEPENDENCY-CAPABILITY-GUARD-01`:
   first prove the capability gap (TorchRL provides the standard building blocks, but is not
   installed now); start with offline logged-policy evaluation over this pipeline's own receipts
   before introducing any new dependency.

### CandidateFeatureV1 (convergence contract)

```
CandidateFeatureV1 {
  canonicalId; packetKey;
  sourceRevision; graphRevision; representationRevision; candidateSnapshotRevision;
  lexical: { exact; fts; trigram; };
  semantic: { cosine; exactRank; executor; };
  domain: { probabilities; predictedDomain; confidence; classifierRevision; };
  structural: { pagerank; ppr?; degree; community?; graphDistance?; };
  representation: { lod; semantic768Available; latent128Available; latent64Available; };
  xgboost?: { score; modelRevision; featureLayoutRevision; };
}
```

`CandidateSnapshotV1 = ordered CandidateFeatureV1[] + ordinal map + all input revisions` is the
artifact ACE/ContextManifest consumes — not raw per-lane hits.

### Five new gates (all `OPEN`, none started — registered, not executed, this pass)

- [ ] `DOMAIN-CLASSIFIER-OWNER-01` — audit existing domain classifiers (rules / SQL / Naive Bayes /
  Python ML sidecar / XGBoost); establish the one `DomainClassificationV1` contract above. Models
  become executors/challengers, not independent authorities.
- [ ] `GRAPH-PAGERANK-PARITY-01` — build NetworkX and cuGraph projections from the *same*
  `StructuralGraphSnapshotV1` (the one frozen by `GRAPHIFY-OPEN-CLOSE-LIVE-WIRING-01`'s completed
  run above), binding identical `graphRevision`/`vertexMapChecksum`/`edgeSetChecksum`. NetworkX =
  CPU correctness oracle; cuGraph = GPU executor (reuses `wsl::atlas-rapids-cu13`'s already-proven
  `graph.pagerank.gpu` capability per `docs/reports/runtime-capability-registry-v1.json` — no new
  runtime). Compare PageRank with a frozen tolerance and a replay receipt.
- [ ] `SEMANTIC-TOPK-01` — on an admitted semantic cohort (not `LINEAGE-02`'s ungrounded `15128`;
  the proven 15-row canary or a properly-authorized cohort only), `cuVS brute-force` = exact
  oracle, `CAGRA`/Qdrant = ANN executors/challengers. Preserve `LANE != EXECUTOR`.
- [ ] `CANDIDATE-FEATURE-MATRIX-01` — join lexical scores, semantic exact score/rank, domain
  probability vector, PageRank/structural signals, and representation state by canonical identity
  and exact revisions into `CandidateFeatureMatrixV1`.
- [ ] `XGBOOST-RERANKER-EVAL-01` — train/evaluate only on the frozen `CandidateFeatureMatrixV1`.
  Use GPU (`device=cuda, tree_method=hist`) only if `runtime-capability-registry-v1.json` proves it
  live in an existing runtime first (currently `HARNESS_EXISTS_NOT_YET_RUN` — run
  `prove_atlas_xgboost_gpu_runtime_v1.py` and record a real `liveProof` before relying on GPU here;
  do not install another runtime merely for this). Keep production XGBoost ranking weight at `0`
  until the frozen evaluation passes.

  **Cross-reference (2026-09-03, `BEST-FIT-SCORE-AUDIT-01`)**: this gate concerns a *future*
  training/eval XGBoost path over `CandidateFeatureMatrixV1` (not built yet). A DIFFERENT,
  already-deployed XGBoost path exists today in `canonical-rerank-executor.ts:487-501` — real
  sidecar `xgbScore` placed into `crossEncoderScore`, `blendScores()` called with
  `{...DEFAULT_BLEND_WEIGHTS, crossEncoder: 0}`. Verified live by direct code read (this session,
  not just cited from the audit). **Ambiguous intent, not resolved here**: this line's own "Keep
  production XGBoost ranking weight at 0 until the frozen evaluation passes" reads as if
  `crossEncoder: 0` on the live path is a deliberate safety gate — but it could equally be an
  accidental consequence of nobody having wired a real weight for that path yet. Which one is true
  is exactly what `openspec/changes/parent-atlas-best-fit-score-fabric/tasks.md`'s
  `XGBOOST-RERANK-ACTIVATION-01` (task 3) should establish before this gate starts — don't assume
  either reading, and don't start training against the live path's current output as if it reflects
  a working, ranking-active XGBoost signal.

`RL-RETRIEVAL-POLICY-01` stays at P3/experiment — not registered as an active gate — until
immutable `Query -> CandidateSnapshot -> Decision -> Outcome` receipts have actually accumulated
from the pipeline above.

### Execution order

`GRAPHIFY-OPEN-CLOSE-LIVE-WIRING-01` (DONE, `graphRevision` frozen) -> `DOMAIN-CLASSIFIER-OWNER-01`
-> `GRAPH-PAGERANK-PARITY-01` -> `SEMANTIC-TOPK-01` -> `CANDIDATE-FEATURE-MATRIX-01` ->
`XGBOOST-RERANKER-EVAL-01` -> (existing) ACE/ContextManifest -> `RL-RETRIEVAL-POLICY-01` (P3/experiment,
offline-evaluation-only until real outcome receipts exist).

Do not inject XGBoost/PyTorch/RL into any currently-running Graphify process. Do not modify
`run-graphify-daily-startup.mjs` or its lifecycle wiring for this section's purposes — the frozen
`graphRevision` from the already-completed run above is the only thing these gates need from it.

## HANDOFF — 2026-09-03 (committed + pushed, session boundary)

**Committed and pushed to `origin/main`**: `62950e66b2` (`85e6f3d509..62950e66b2`). A stale
`.git/index.lock` (0 bytes, ~9h old) was removed first — verified safe: the only running `git.exe`
processes were 7 harmless `git fsmonitor--daemon` background watchers, none holding the index
lock. Full `git status --porcelain` (285 entries: 108 modified, 177 untracked) was reviewed before
staging — no secrets/credentials/build-artifacts found (`grep -iE
"\.env$|credential|secret|password|\.pem$|\.key$"` and `node_modules|dist/|build/` both came back
empty) — then staged and committed as one comprehensive commit (292 files, +747,576/-109,706),
since the bulk of the diff is this multi-session engagement's own accumulated real evidence
artifacts (ontology/taxonomy/latent-phase16/semantic-corpus-bundle/source-namespace work spanning
many prior compacted sessions, not just this visible stretch), all consistent with this ledger's
own documented conventions — not unreviewed or unrelated concurrent-session churn.

**What this pass added, on top of everything already recorded in its own sections above**:
1. `MCP-TOOL-REGISTRY-REVISION-01` (DONE) + its post-close `HANDOFF CORRECTION` +
   `MCP-TOOL-REGISTRY-HARDENING-01` (OPEN) — see those sections for full detail.
2. `GRAPHIFY-OPEN-CLOSE-LIVE-WIRING-01` (DONE) — the real `npm run graphify:daily` entrypoint now
   genuinely opens/binds/completes a `graphify_runs` row on its own; live-proven twice, SQL-verified
   both times.
3. `PKT-LINEAGE-08`'s real targeting gap fixed (`--source-refs-file` on
   `register-orphaned-chunks.mjs`), dry-run proven against the live 50-candidate eligible cohort;
   the actual authorized apply is still not run — remains the next real step if/when authorized.
4. `DEPENDENCY-CAPABILITY-GUARD-01` adopted as a durable policy (root `CLAUDE.md` +
   `docs/reports/runtime-capability-registry-v1.json`), with a real, verified over-install finding
   in `docker/atlas-gpu-8098` (not fixed, flagged for a future minimal-rebuild task).
5. `LINEAGE-02`'s `"15128/768"` literal: independently corroborated `UNKNOWN` /
   `BLOCKED_UNGROUNDED` via a fresh `SEMANTIC-COHORT-AUTHORITY-01` audit (operator-run) plus my own
   independent repo-wide grep check. Not changed to `151128`. Three populations (ungrounded
   `15128`, proven 15-row diagnostic canary, 55,169-row frozen-but-source-incomplete matrix) kept
   explicitly distinct.
6. `PARENT ATLAS CANDIDATE PIPELINE ARCHITECTURE FREEZE` — registers the intended convergent
   pipeline (`CandidateFeatureV1`) and five new `OPEN` gates (`DOMAIN-CLASSIFIER-OWNER-01`,
   `GRAPH-PAGERANK-PARITY-01`, `SEMANTIC-TOPK-01`, `CANDIDATE-FEATURE-MATRIX-01`,
   `XGBOOST-RERANKER-EVAL-01`), `RL-RETRIEVAL-POLICY-01` held at P3/experiment. Registration only —
   none of the five gates started this pass.

**Next session should, in priority order**:
1. Decide whether to start the candidate-pipeline gates (`DOMAIN-CLASSIFIER-OWNER-01` first, per
   the frozen execution order) or continue the durable P0 mainline
   (`PKT-LINEAGE-08`'s authorized apply, or `RETRIEVAL-01L` governance closeout) — both are real,
   neither is started.
2. `MCP-TOOL-REGISTRY-HARDENING-01` (OPEN) if MCP work continues — not urgent, MCP is healthy
   enough to pause per its own recorded note.
3. `docker/atlas-gpu-8098`'s minimal-rebuild follow-up (real, flagged, not urgent — the image
   works, it's just heavier than it needs to be).
4. The 7 pre-existing `retrieval/` test failures and `src/mcp/server.ts`'s live-launch status
   (both flagged in earlier HANDOFF sections above, still open, still not this session's to fix).

**Cross-reference (2026-09-03, separate session — corrected same day)**: two sessions
independently built near-identical `ConceptDefinitionV1`/`ConceptV1` +
`TermObservationV1`/`ConceptRecognitionV1` contracts in parallel; see
`openspec/changes/parent-atlas-ontology-kernel/tasks.md`'s `ONTO-PY-CONCEPT-INTEGRATION-01`
addendum for the full account. The canonical one that landed is
`sveltekit-frontend/src/lib/server/atlas/taxonomy/entity-concept-taxonomy-v1.ts` (has a working
resolver + hyperedge-based promotion path); a second, less-complete version was built and
deliberately left uncommitted to avoid a duplicate schema owner. One real finding from the
abandoned exploration survived into that addendum: mechanically deriving proposals from
`domain_mapping.py` alongside `domain-taxonomy.ts` found 3 direct label collisions
(`retrieval`/`database`/`graph` are canonical labels in BOTH taxonomies) — worth folding into a
future run of the concurrent session's own `sveltekit-frontend/scripts/atlas/concept-seed-dry-v1.mts`.
Directly relevant to this file's `DOMAIN-CLASSIFIER-OWNER-01` gate (registered but not started,
item 6 above) — read the ontology-kernel addendum before starting that gate.
5. Concurrent-session editing of this file was observed and handled cleanly throughout (edits
   applied against re-read current content each time) — re-read this file's current state before
   continuing, per this session's own repeated practice, don't assume it still matches this
   handoff exactly by the time a new session starts.

## GRAPHIFY-EXECUTION-LEDGER-SCHEMA-02 (2026-09-03)

**Scope note**: this section's underlying work (`GRAPHIFY-RUN-IDENTITY-SEPARATION-01` diagnosis +
the additive `20260903_graphify_execution_ledger_v1.sql` migration draft) was done in a separate
session that initially staged it under a would-be new OpenSpec change
(`parent-atlas-graphify-daily-coordinator`). That change was never created on disk. Per this
repo's own portfolio-authority invariant (`node scripts/atlas/audit-openspec-portfolio-v1.mjs`,
`currentAuthorityCount = 1`, `currentAuthority = parent-atlas-retrieval-lineage-dag-convergence`),
a second OpenSpec change would have contradicted that invariant — this work belongs here instead,
under the existing `GRAPHIFY_RUN_LIFECYCLE` blocker and alongside `PKT-LINEAGE-08`'s own Graphify
lifecycle/stale-run findings recorded elsewhere in this file.

Context:
`GRAPHIFY-RUN-IDENTITY-SEPARATION-01` proved that the current `graphify_runs` table mixes logical
snapshot identity with execution identity — `materialize-graphify-source-inventory.mts` can reuse
one `run_id` through `ON CONFLICT(workspace_id, workspace_revision, parser_contract_version)`.
That means `graphify_runs.run_id` cannot serve as "this attempt's" identity; a rerun over
unchanged bytes silently reuses the prior run's row rather than recording a fresh attempt.

Frozen identities (matches this file's existing `workspaceRevision`/`sourceRevision` vocabulary
elsewhere — not a new naming scheme):

```
workspaceRevision
  = deterministic exact selected-source manifest identity
  = unchanged execution does NOT change it

sourceRevision
  = deterministic exact source-byte identity

executionId
  = fresh UUID for every Graphify attempt (this is the corrected "attempt identity" —
    NOT graphify_runs.run_id)

graphRevision
  = derived graph artifact identity

timestamps / OS / WSL / container
  = execution provenance only, never part of any identity comparison
```

**Correction to an earlier (obsolete) acceptance framing**: an earlier draft of this work asserted
"new runId / same workspaceRevision when bytes unchanged / same runId on graphify_files" as the
target contract. That is superseded now that the execution ledger exists. The correct assertion is:

```
new executionId
same workspaceRevision when bytes unchanged

graphify_execution_files.execution_id == new executionId

legacy graphify_files.last_seen_run_id = compatibility state only
```

`graphify_runs.run_id` must no longer be presented as the new-attempt identity anywhere in future
work on this ledger.

- [x] `GRAPHIFY-RUN-IDENTITY-SEPARATION-01` diagnosis recorded (above).
- [x] Additive migration drafted: `sveltekit-frontend/drizzle/manual/20260903_graphify_execution_ledger_v1.sql`
      (new tables `graphify_executions` + `graphify_execution_files`, no changes to existing
      `graphify_runs`/`graphify_files` rows or indexes).
- [x] Current migration syntax proven, rollback-only, against the live `legal-ai-postgres`
      container's `legal_ai_db` — re-run against the canonical draft AFTER the append-only trigger
      was added below (does not inherit the earlier, now-invalidated evidence). **Caught and fixed
      a real proof-methodology bug in the same pass**: the first rollback attempt used
      `psql -c 'BEGIN;' -f migration.sql -c 'ROLLBACK;'`, but the migration file's own internal
      `BEGIN;`/`COMMIT;` closed and committed the outer transaction before the wrapper's `ROLLBACK`
      could run — this silently applied the migration to the live DB instead of proving it in
      isolation. Caught immediately via `to_regclass()`, the 3 empty (0-row) tables + trigger
      function were dropped to restore prior state (verified `to_regclass` NULL again), and the
      proof was redone with the file's `BEGIN;`/`COMMIT;` lines stripped so the outer transaction
      wrapper actually controls commit/rollback. Second run: all `CREATE TABLE`/`CREATE
      INDEX`/`CREATE FUNCTION`/`CREATE TRIGGER`/`COMMENT` statements succeed, ends `ROLLBACK`
      (never `COMMIT`), `to_regclass()` confirms nothing persisted.
- [x] Review `graphify_executions` contract: `execution_id UUID PK`, `workspace_revision`,
      `legacy_graphify_run_id` (compatibility-only, no canonical-authority claim),
      parser/extraction/graph revisions, `status`, `started_at`, `last_heartbeat_at`,
      `completed_at`, environment metadata. **(2026-09-04, reviewed against the live migration
      text)** `sveltekit-frontend/drizzle/manual/20260903_graphify_execution_ledger_v1.sql` lines
      45-79 declares every field named here exactly: `execution_id uuid PRIMARY KEY`,
      `workspace_revision text NOT NULL` (CHECK'd `^sha256:...$`), `legacy_graphify_run_id uuid
      REFERENCES graphify_runs(run_id)` (nullable, compatibility-only per its own comment),
      `parser_contract_version`/`extraction_contract_version`/`graph_algorithm_revision`,
      `status`, `started_at`, `last_heartbeat_at`, `completed_at`, plus `trigger_kind` /
      `scheduler_revision` / `environment_revision` for environment metadata. Confirmed the
      companion root-level file `drizzle/manual/20260903_graphify_execution_identity_v1.sql` is a
      non-executable pointer to this one canonical file, not a second migration authority (no
      duplication). Review only -- no schema change, no apply.
- [x] Review `graphify_execution_files` contract: `PRIMARY KEY (execution_id, source_ref)`,
      recording `source_ref`, `code_source_revision`, `workspace_revision`, `content_hash`,
      `byte_length`; `legacy_file_id` optional provenance only. **(2026-09-04)** Same migration
      lines 104-122: `PRIMARY KEY (execution_id, source_ref)`, `source_ref text NOT NULL`,
      `code_source_revision text NOT NULL` (CHECK'd sha256), `workspace_revision text NOT NULL`,
      `content_hash text NOT NULL`, `byte_length bigint NOT NULL`, `legacy_file_id uuid NULL` with
      no FK/NOT NULL constraint -- exactly "optional provenance only" as specified. Matches.
- [x] Review `graphify_execution_stages` contract:
      `OPEN → SOURCE_SELECTION → INVENTORY → AST_PARSE → STRUCTURAL_EXTRACT → SEMANTIC_ENRICH →
      GRAPH_BUILD → PROJECT → VALIDATE → CLOSE`. **(2026-09-04)** Migration lines 145-146's CHECK
      constraint enumerates exactly these 10 stage names in exactly this order. Matches.
- [x] Execution terminal-state constraints: `COMPLETED | COMPLETED_REUSED | FAILED | ABANDONED`
      require `completed_at IS NOT NULL`; `RUNNING` requires `completed_at IS NULL`. **(2026-09-04)**
      Migration lines 82-84: `CHECK (status IN ('RUNNING', 'COMPLETED', 'COMPLETED_REUSED',
      'FAILED', 'ABANDONED'))` plus `CHECK ((status = 'RUNNING' AND completed_at IS NULL) OR
      (status <> 'RUNNING' AND completed_at IS NOT NULL))` -- exactly this rule, database-enforced,
      not merely documented. Matches.
- [x] Prove `graphify_execution_files` is append-only evidence — no ordinary UPDATE/DELETE
      lifecycle. Closed the DB-enforcement gap flagged in the read-only review pass below: added
      `graphify_execution_files_reject_mutation()` + `BEFORE UPDATE`/`BEFORE DELETE` triggers to
      the migration (additive only — new `CREATE FUNCTION`/`CREATE TRIGGER`, no `ALTER` on
      existing objects, scoped to `graphify_execution_files` only — deliberately NOT applied to
      `graphify_execution_stages`, whose status/timestamp columns are meant to transition in
      place). Behaviorally proven, not just DDL-checked: inside one rolled-back transaction,
      applied the migration, inserted one throwaway `workspaces` row + one `graphify_executions`
      row + one `graphify_execution_files` row, attempted an `UPDATE` (rejected: `graphify_execution_files
      is append-only evidence: UPDATE is not permitted (execution_id=..., source_ref=proof/only.ts)`)
      and a `DELETE` (same rejection, `DELETE is not permitted`), then `ROLLBACK`. Verified live
      afterward: `to_regclass('public.graphify_executions')` NULL and the fixture workspace row
      count is 0 — nothing leaked.
- [x] Freeze the coordinator session advisory-lock contract: one dedicated PostgreSQL connection,
      session-level lock held for the complete coordinator lifetime, unlock in `finally`, no giant
      long-running transaction. **(2026-09-04, live-verified against the real dev DB, rolled back,
      zero persistent footprint)** Ran the frozen namespace/key from
      `docs/reports/graphify-execution-ledger-coordinator-plan-v1.json`
      (`pg_try_advisory_lock(119041, 641934821)`) inside one `BEGIN...ROLLBACK` transaction, applied
      the full migration DDL body in that same transaction, and confirmed live: first `try_lock`
      succeeds; `to_regclass` before/after the transaction shows the tables never persisted;
      `pg_locks` shows zero rows for that (classid, objid) key after the session closed.
      **Real correction to the contract wording, found live, not assumed**: PostgreSQL session-level
      advisory locks are re-entrant/stacked per session -- a second `pg_try_advisory_lock` call for
      the SAME key on the SAME connection also returns `true` (increments an internal hold count),
      it does not report "already held" or fail. This means "unlock in `finally`" is only safe if
      the coordinator calls `pg_try_advisory_lock` **exactly once** per execution attempt on its
      dedicated connection -- a stray second acquire (e.g. a retry path that re-calls try-lock
      without checking whether it already holds the lock) would require a matching SECOND unlock to
      fully release, or the lock persists past the intended `finally` release. Recorded here so the
      eventual `GRAPHIFY-DAILY-COORDINATOR-01` implementation gets this right the first time.
      Proof script: `scripts/atlas/graphify-daily-canary-02-proof-2026-09-04.sql` (see the linked
      canary note under `GRAPHIFY-DAILY-CANARY-02` below for the paired execution-identity proof
      run in the same transaction).
- [x] Identify ONE durable inventory-persistence owner. `graphify-source-inventory-writer-v2.ts`
      is the preferred candidate; `materialize-graphify-source-inventory.mts` should eventually
      become a thin wrapper rather than retaining an independent SQL implementation. **(2026-09-04,
      confirmed live, not assumed)**
      `sveltekit-frontend/src/lib/server/atlas/indexing/graphify-source-inventory-writer-v2.ts`
      (658 lines) has 5 real callers: `graphify-lifecycle-composition-v1.ts` (production
      composition path), 3 `apply-*-graphify-*-batch-v1.mts` scripts, and its own spec file.
      `sveltekit-frontend/scripts/atlas/materialize-graphify-source-inventory.mts` (264 lines) has
      exactly 1 caller (`prove-graphify-revision-owner-v2.mts`) and, checked directly, still
      contains its own independent `INSERT INTO graphify_runs` / `INSERT INTO graphify_files` SQL
      via a locally-constructed `pg.Pool` -- it does NOT import or delegate to writer-v2 at all.
      This confirms the suspicion in this task's own wording: writer-v2 is the durable owner;
      materialize-graphify-source-inventory.mts still needs the thin-wrapper refactor, not yet
      done (out of scope for this identification-only task -- tracked as a follow-up, not a new
      gate).
- [ ] Do NOT change the existing `graphify_runs` unique index yet.
- [ ] Do NOT rewrite historical `graphify_runs` rows.
- [ ] Do NOT run broad `graphify:daily` yet — see the "ignore the stale codebase-graph.json hook"
      note below; running it prematurely would muddy the evidence this gate needs.
- [ ] Do NOT retry `PKT-LINEAGE-08`'s authorized apply from this gate — that item's own
      prerequisites (recorded earlier in this file) are unrelated to and independent of this ledger.

## GRAPHIFY-DAILY-COORDINATOR-01

- [ ] Fresh `WorkspaceRevisionRecordV1` generated for this execution.
- [ ] Exact `WorkspaceSourceBindingV1[]` frozen before downstream stages.
- [ ] `SOURCE_SELECTION` freezes: selected source count, source refs, source revisions, content
      digests, byte lengths, workspace revision, manifest checksum, selection-policy revision.
- [ ] Insert fresh `execution_id` every attempt.
- [ ] Every source observation appended to `graphify_execution_files` under that `execution_id`.
- [ ] Heartbeat updates only the active execution record.
- [ ] Successful execution ends `COMPLETED`.
- [ ] Reused already-proven derivation ends `COMPLETED_REUSED` while still receiving a NEW
      `execution_id`.
- [ ] Failure ends `FAILED`.
- [ ] Dead coordinator may later be explicitly reconciled to `ABANDONED`. Never infer `COMPLETED`.
- [ ] Independent readback proves: execution status terminal; `completed_at` present; execution
      file count == frozen source count; workspace revisions all match; source revisions all
      present; content digests all match; mandatory stages terminal.

## GRAPHIFY-DAILY-CANARY-02

```
Run A, bounded source cohort:
  executionId = EA
  workspaceRevision = W1
  sourceCount = N

Run B without byte changes:
  executionId = EB
  EB != EA
  workspaceRevision = W1
  same manifest checksum
  same source revisions

Run C after changing exactly one canary source:
  executionId = EC
  EC != EB
  workspaceRevision = W2
  W2 != W1                     <- corrected: run C's workspaceRevision must DIFFER from run A/B's
                                   (an earlier draft of this canary incorrectly asserted
                                   "workspaceRevisionC == W123 PASS" — that is wrong; changing one
                                   selected source's exact bytes must change workspaceRevision)
  changed sourceRevision differs
  unchanged sourceRevisions remain identical
```

Required: stale RUNNING rows created = 0; missing source revisions = 0; digest mismatches = 0;
writes outside canary scope = 0.

Only after this gate:
```
GRAPHIFY-RUN-FILE-BINDING-01
  ↓
SOURCE-SELECTION-AUTHORITY-01
  ↓
SOURCE-REGISTRY-TO-CHUNK-HYDRATION-02
  ↓
PKT-LINEAGE-08 preflight
```

Then run:
```
npx openspec validate parent-atlas-retrieval-lineage-dag-convergence --type change --strict --json
node scripts/atlas/audit-openspec-portfolio-v1.mjs
```
The portfolio audit should continue to report `currentAuthorityCount = 1` /
`currentAuthority = parent-atlas-retrieval-lineage-dag-convergence` — that is an explicit repo
invariant, not a side effect to be reintroduced accidentally by a future change proposal.

**LSP negative-proof cross-reference (kept separate, not part of this gate)**: the same session's
LSP work (`openspec/changes/parent-atlas-compiler-semantic-graph-resolution/tasks.md`,
`LSP-UTF8-BOUNDARY-GUARD-01` / `LSP-CROSS-FILE-TARGET-PROOF-01`) is independent of Graphify
execution-ledger repair and proceeds on its own track — UTF-8 boundary guard PROVEN, byte
conversion math PROVEN, cross-file `.mjs` LSP jump NOT_PROVEN (do not attempt to force target
identity from AST evidence to close that gap; its next investigation is tsserver/project
configuration or a different known cross-file TS fixture).

## GRAPHIFY-EXECUTION-LEDGER-SCHEMA-02 — read-only review findings (2026-09-03, follow-up)

Scoped, read-only pass over the contract-review checklist items above. Note: the migration syntax
proof item above was found already re-flagged `[ ]` by a concurrent edit to this exact file
(the canonical `20260903_graphify_execution_ledger_v1.sql` draft changed after an earlier proof
ran, correctly invalidating that evidence) — this pass does NOT re-run that proof and does NOT
check that item; it only reviews contract shape against the current on-disk migration.

- Contract review (`graphify_executions` / `graphify_execution_files` / `graphify_execution_stages`
  / terminal-state CHECK constraints): read the live migration file directly (not from memory) and
  confirmed each column/CHECK named in the checklist above is present as described, including the
  `RUNNING ⟺ completed_at IS NULL` / non-RUNNING ⟺ `completed_at IS NOT NULL` constraint on
  `graphify_executions` and the analogous `PENDING/RUNNING` vs `COMPLETED/SKIPPED/FAILED` split on
  `graphify_execution_stages`. Not marking the checklist items `[x]` myself, since "review" here
  plausibly means sign-off by whichever session owns this gate's proof run, not just a read.
- **Append-only gap — closed same session, see the checkbox above**: was "in practice" only (no
  DDL enforcement) when this note was first written; a `BEFORE UPDATE`/`BEFORE DELETE` trigger was
  added to the migration afterward and behaviorally proven (real `UPDATE`/`DELETE` attempts inside
  a rolled-back transaction both correctly rejected). Left this paragraph in place rather than
  deleting it, since it's still the accurate record of what the gap *was* before the fix — the
  checklist item above is the current, authoritative status.
- **Inventory-persistence-owner recommendation independently corroborated via grep, not just
  asserted**: `graphify-source-inventory-writer-v2.ts` has 3 live script consumers
  (`apply-current-source-graphify-batch-v1.mts`, `apply-full-corpus-graphify-inventory-v1.mts`,
  `apply-graphify-source-inventory-batch-v1.mts`) plus one composition module
  (`graphify-lifecycle-composition-v1.ts`, itself referenced only by its own spec — not yet wired
  into a live entrypoint). `materialize-graphify-source-inventory.mts` has exactly one referrer
  repo-wide, a proof script (`prove-graphify-revision-owner-v2.mts`) — it is not invoked by any
  npm script or other live entrypoint. This confirms (does not change) the checklist's existing
  recommendation to standardize on `graphify-source-inventory-writer-v2.ts`.
- Not attempted in this pass (deliberately, per this gate's own "Do NOT" list and the concurrent
  migration-syntax flag above): no disposable-DB proof run, no coordinator/advisory-lock code, no
  `graphify:daily` invocation, no `PKT-LINEAGE-08` retry.

## PARENT ATLAS REPRESENTATION FABRIC — GATE REGISTRATION (2026-09-03)

**Scope note**: registration only, matching this file's own established pattern (see "PARENT ATLAS
CANDIDATE PIPELINE ARCHITECTURE FREEZE" earlier in this file for precedent) — none of the 8 gates
below are started by this entry. Filed under this change per the single-authority portfolio
invariant (`currentAuthority = parent-atlas-retrieval-lineage-dag-convergence`), not a new
OpenSpec change.

**One factual conflict found and NOT silently resolved either way** — a proposed correction this
session asserted `latent_128`/`latent_64` are pure derived views (`prefix + L2-renormalize` of
`latent_256`) with no separate physical storage, and that the Postgres migration "deliberately says
do not store separate 128/64 columns." That contradicts this file's own already-verified live
finding at `LATENT-PHASE16-OWNER-01` above (lines ~1014-1037): `codebase_chunk_index.latent_64` is
a real, physically-persisted `vector(64)` column with a live HNSW index
(`idx_codebase_chunk_latent64_hnsw`), written by `python/backfill_latent_256.py` in the same
UPDATE statement as `latent_256` — not computed on demand from a prefix+renorm of `latent_256`.
Re-verified live in this pass (not re-trusting the earlier note blind): `SELECT count(*) FROM
codebase_chunk_index WHERE latent_256 IS NOT NULL` = 55,169 (matches Qdrant `codebase_chunks_latent256`
point count exactly, `mean_overlap_at_k = 0.9995` per `docs/reports/latent256-ann-exact-parity-v1.json`
— both these figures corroborate the proposed correction's other claims). `latent_128` genuinely
has no column and no Qdrant collection — it IS in-memory-only, matching the proposal for that one
dimension. **Net finding: the proposed correction is right about `latent_256` (physical, trained,
populated, parity-proven) and right about `latent_128` (no storage, derive on demand), but wrong
about `latent_64` specifically — that one already has real, populated (if incomplete —
`LATENT-PHASE16-OWNER-01` recorded only 0.36% coverage as of 2026-09-02, a separate open gap) physical
storage in production, and any future `RepresentationRegistryV1` must describe `latent_64` as
`physicalStore: EXISTING_COLUMN` (with its own known-incomplete-coverage caveat), not
`physicalStore: NONE / deriveFrom: latent_256`.** Whoever builds `LATENT256-REPRESENTATION-CONTRACT-02`
below must reconcile this before freezing the registry, not copy either source's claim uncritically.

**Kanban revision-binding bug — confirmed live in this pass, not just carried forward from the
proposal**: `sveltekit-frontend/src/lib/server/atlas/board/daily-graphify-board-recommendations.ts`
line 113, `workspaceRevision: boardGenerated` — a generated/observed timestamp value is being
assigned directly to the `workspaceRevision` field of the board's evidence packet, which is exactly
the timestamp-as-revision violation this file's own frozen identity model (see
`GRAPHIFY-EXECUTION-LEDGER-SCHEMA-02` above) prohibits. Real, not hypothetical.

**Gates registered, in the proposed priority order** (all `OPEN`, none started):

1. `LATENT256-REPRESENTATION-CONTRACT-02` — **DONE, same session**:
   `sveltekit-frontend/src/lib/server/atlas/tensors/representation-artifact-v1.ts` now exports
   `NESTED_LATENT_REPRESENTATION_FAMILY_V1`, a frozen registry with `latent_256`
   (`physical: true`, `parentRepresentationId: null`, `inputRepresentationId: 'semantic_768'`),
   `latent_128` (`physical: false`, `parentRepresentationId: 'latent_256'`,
   `inputRepresentationId: 'latent_256'`), `latent_64` (`physical: true`,
   `parentRepresentationId: 'latent_256'`, `inputRepresentationId: 'semantic_768'` — matching the
   live producer's actual same-forward-pass behavior, NOT a derived-view chain, per the conflict
   reconciliation above). Uses the bare `latent_256`/`latent_128`/`latent_64` naming this file's own
   pre-existing test fixture already used — never introduced the `ae_`-prefixed variant the stale
   example implied, since that naming never actually appeared anywhere live. Two real bugs fixed in
   `assertPromotionReadyRepresentationArtifact`, not just relabeled: (1) it previously special-cased
   only the literal string `'ae_latent_64'` and unconditionally required `inputRepresentationId ===
   'semantic_768'` for every other representationId — which would have wrongly rejected a
   legitimate `latent_128` artifact correctly declaring `latent_256` as its input, the exact
   derived-view relationship this family is supposed to support; (2) the pre-existing test fixture
   itself had `representationId: 'latent_256'` paired with `dimensions: 64` — a real mismatch never
   caught before because the old code never checked dimensions against any representationId other
   than the hardcoded `'ae_latent_64'` string, which never matched this fixture's `'latent_256'` id
   at all. Fixed the fixture (`dimensions: 256`), not the check. Added
   `assertRepresentationFamilyRevisionBinding(artifacts[])` — the cross-artifact check the ask
   explicitly wanted ("one family revision should bind all three... so you cannot accidentally
   derive 128 from one 256 checkpoint and label it as another revision"): throws
   `REPRESENTATION_FAMILY_REVISION_MISMATCH` if any two family-member artifacts disagree on
   `modelChecksum`/`modelRevision`/`parametersDigest`/`transformPolicyRevision`. 19/19 tests pass
   (11 pre-existing + 8 new, one new test asserting the exact revision-mismatch rejection). Real
   caller count checked before editing: this contract has zero production callers today (only its
   own spec, plus one unrelated comment reference in `mcp-tool-registry-types-v1.ts`) — low blast
   radius, confirmed via grep, not assumed.
2. `LATENT256-QUERY-ENCODER-01` — host/export the trained `NestedSemanticAutoencoder` encoder for
   query-side use (currently `PostgresLatent256CandidateProvider` is candidate-side-hydration only:
   confirmed live, its own docstring cites `models/nested-semantic-autoencoder/README.md:
   canonicalAuthority=false, queryEncoder=false, activeRetrievalLane=false`). Without this, Qdrant
   `codebase_chunks_latent256` cannot be queried directly — only used for candidate-side dedup/
   diversity after a `semantic_768` primary retrieval. Evaluate reusing an existing PyTorch-capable
   process (e.g. `:8095`) before standing up a new one, per the proposal's own suggestion — not
   independently verified in this pass.
3. `GO-RETRIEVAL-REPRESENTATION-ROUTING-01` — **PARTIALLY DONE, same session**: the wire-level
   field + a minimal, honest `representationRegistry` are real and tested; actual cross-
   representation execution stays deliberately unbuilt because it has nothing real to route to
   yet (gate 2 blocked — no live query-time `latent_256` encoder). Scoped down from the full
   `RepresentationRequestV1` ask (`queryVectorRef`/`executorPreference` not added — no second
   executor exists yet either, so those fields would be speculative) to what's honestly buildable
   now: `proto/active/retrieval.proto`'s `CodebaseSearchRequest` gained `representation_id`
   (field 10, empty = current default behavior, zero change for every existing caller) and
   `CodebaseSearchResponse` gained `representation_used` (field 4, always set) +
   `representation_fallback_reason` (field 5, non-empty only when the request's representation
   couldn't be honored). Regenerated `.pb.go`/`_grpc.pb.go` via `protoc` + `protoc-gen-go`/
   `protoc-gen-go-grpc` (both confirmed installed at `$GOPATH/bin`; the repo's own `generate.sh`
   failed on this host with a `protoc-gen-go: file not found` PATH-translation bug under Git
   Bash — worked around by invoking `protoc` directly with explicit native Windows paths, not by
   patching the script; flagged, not fixed, since it's an existing script issue orthogonal to
   this gate). `services/go-retrieval-service/main.go` gained a `representationRegistry` map
   (`semantic_768`: dimension 768, `codebase_chunks_768`, `queryEncoder: true`; `latent_256`:
   dimension 256, `codebase_chunks_latent256`, `queryEncoder: false` — real collection name, real
   dimension, matches `LATENT256-REPRESENTATION-CONTRACT-02` above, not a placeholder) and
   `resolveRepresentation()`, which **never silently substitutes**: an unknown or
   not-yet-query-executable representation falls back to `semantic_768` AND returns a non-empty
   machine-readable reason (`REPRESENTATION_UNKNOWN:<id>` / `REPRESENTATION_NOT_QUERY_EXECUTABLE:<id>`)
   that `searchCodebase()` surfaces on every response path, including its 3 early-error returns —
   not just the happy path. `entry.collection` is deliberately NOT yet wired into actual query
   execution (still hardcoded to `collectionCodebase` via `s.embed()`/`s.qdrantSearchCodebase()`)
   since doing so for `latent_256` would require a query embedding that cannot be produced yet;
   wiring it is the direct, mechanical next step once gate 2 closes. Wired the field through both
   entrypoints — gRPC (`CodebaseSearchRequest.RepresentationId`) and the HTTP JSON facade
   (`httpSearchCodebase`'s request struct gained `representation_id`) — not just one. Verified,
   not assumed: `go build ./...`, `go vet ./...`, and the full existing `go test ./...` suite all
   pass clean (10.3s, includes the pre-existing `lanes_test.go`/`tag-filter_test.go`), plus 5 new
   tests in `services/go-retrieval-service/representation_test.go` covering the default path, the
   explicit-semantic_768 path, the unknown-representation fallback, the not-yet-executable
   fallback, and a regression guard pinning `latent_256`'s registry entry (dimension 256, real
   collection name, `queryEncoder` still `false`) so a future edit can't silently flip it live
   without a test failing first.
4. `DAG-PARAMETER-MATERIALIZATION-01` — **IMPLEMENTED / FOCUSED-PROVEN.** Added the pure
   `ParameterArtifactV1` builder and wired `planKernelBoundDagV1()` so each planned operator
   receives a deterministic `parameterArtifactRef` and `parameterChecksum`. The artifact is
   schema/revision-qualified, canonicalAuthority=false, writesPerformed=false, and is not
   persisted by this change. Package build plus focused planner/artifact tests passed 5/5.
   Runtime loading by Go Retrieval/FastAPI/Python executors remains a separate follow-up gate.
5. `DAG-PARAMETER-EXECUTOR-CONSUMER-AUDIT-01` — **IMPLEMENTED / FOCUSED-PROVEN.** The core
   binding and shared OaK adapter now resolve and verify `ParameterArtifactV1` before handler
   invocation. The seven handlers remain thin consumers of the verified argument map; no
   production constructor using `parameterArtifactRef: null` was found. Remaining null references
   are compatibility/test fixtures only. Focused binding, executor, and adapter tests pass 9/9;
   the read-only audit is recorded in `docs/reports/dag-parameter-executor-consumers-v1.json`.
   No runtime, database, cache, or artifact-store writes occurred.
6. `DAG-PARAMETER-SCOPE-AUDIT-01` — **PARTIALLY IMPLEMENTED / FOCUSED-PROVEN.** The planner
   now accepts prevalidated `operatorArgumentsByOperatorId` and uses the scoped object when
   present; the legacy request-wide fallback remains for compatibility. The focused scoped-
   argument replay passes, while schema-registry-driven projection and parent-output binding
   remain open. Receipt: `docs/reports/dag-parameter-scope-v1.json`. No runtime, database,
   cache, or artifact-store writes occurred.
7. `DAG-PARAMETER-SCHEMA-COVERAGE-01` — **OPEN / SCRIPT-AUDITED.** The real symbol-repair
   operator library contains 18 operators, of which 6 declare a `parameterSchemaRef` and 12
   intentionally declare `null`. This is coverage evidence, not permission to invent schemas;
   the next step is to define schemas only for operators with proven tunable parameters. Receipt:
   `docs/reports/kernel-parameter-schema-coverage-v1.json`.
8. `DAG-PARAMETER-SCHEMA-OWNER-AUDIT-01` — **OPEN / SCRIPT-AUDITED.** `param:graph-hop-bound`
   maps to the existing graph-expand input schema, but it is not yet an exact artifact validator.
   `param:top-k` and `param:token-budget` have multiple nearby request/context owners and no
   single exact kernel parameter validator. Receipt: `docs/reports/kernel-parameter-schema-owners-v1.json`.
   No runtime, database, cache, or artifact-store writes occurred.
9. `FETCH-LATENT-OPERATOR-01` — map `FETCH_LATENT` to a real kernel operator: `latent_256` fetch
   (Postgres/Qdrant provider, physical), `latent_128`/`latent_64` derive-by-transform
   (`PREFIX_L2` from `latent_256`) **for `latent_128` only** — per the conflict-reconciliation
   above, `latent_64`'s real fetch path should hit its own physical column, not a derived-transform
   path, until/unless a future decision explicitly retires that column in favor of pure derivation.
   Output shape: `CandidateRepresentationSliceV1` (checksums + ordinals, never raw floats in DAG
   JSON) — consistent with this file's existing large-array-by-reference rule.
10. `CANDIDATE-FEATURE-MATRIX-REPRESENTATION-01` — `CandidateFeatureMatrixManifestV1` references
   (`latent256Ref`/`latent128ViewRef`/`latent64ViewRef` as artifact/storage-address + ordinal-
   alignment checksums) rather than embedding vectors in feature rows. No such manifest concept
   exists in this file yet — this is net-new registration, not a correction of prior work.
8. `KANBAN-RECOMMENDATION-REVISION-BINDING-01` — **PARTIALLY DONE, same session**: the
   `workspaceRevision`/`graphRevision` half of this gate is fixed and proven; `featureRevision`/
   `policyRevision`/`sourceRevision`/`executionId` are unchanged (already came from real
   `context.*` params or a stable literal, not from `board.generated` — only `workspaceRevision`
   was the timestamp-mislabeled-as-revision bug) and `sourceRevisionDigest` is NOT added (no such
   field exists on the target schema; out of scope for this pass, flagged not silently dropped).
   Changes: new `src/lib/server/atlas/board/graphify-current-workspace-revision.ts` —
   `resolveCurrentGraphifyWorkspaceRevision()` reads the most recent `graphify_runs` row with a
   real `sha256:`-prefixed `workspace_revision` (preferring `COMPLETED` status), returns `null`
   (never a fabricated value) when none exists or the DB is unreachable — verified both paths live:
   a real query against `legal-ai-postgres` returns
   `workspace_revision=sha256:b39bca3b...f7c80cd, status=COMPLETED`, and a DB-unavailable unit-test
   environment degrades to `null` without throwing (2/2 new tests pass in
   `graphify-current-workspace-revision.spec.ts`). `daily-graphify-board-recommendations.ts`:
   `buildEvidencePacket`/`buildFeatureRow` now take `workspaceRevision`/`runGraphRevision`
   parameters instead of the old `boardGenerated` value; `context.workspaceRevision`/
   `context.graphRevision` let callers override the live-resolved value, `null` is a legitimate,
   explicitly-propagated outcome. Regression-verified: the pre-existing
   `daily-graphify-board-recommendations.spec.ts` (no DB in its test env) still passes end-to-end —
   caught and fixed a real regression this same pass, where the first version of this fix made the
   DB query throw unconditionally and broke that spec; wrapped in try/catch per this repo's
   Degraded Response Contract before it was left in that state. `tsgo --noEmit` reports 0 errors
   touching either file. **`GO-RETRIEVAL-REPRESENTATION-ROUTING-01`'s `executionId` field and
   gate 8's tournament work remain genuinely blocked on nothing from this gate anymore for the
   revision-identity reason originally stated** — the timestamp-as-revision bug is closed.
8. `RECOMMENDATION-TOURNAMENT-01` — expand the existing `GraphifyTaskCandidate` →
   `EventRecommendationFeatureRow` → `RecommendationPolicy` → `DailyGraphifyBoardRecommendation`
   pipeline (not replace it) with a challenger slot: deterministic policy stays `ACTIVE`; XGBoost
   and a low-rank/Tang-inspired challenger (name it `TangInspiredRecommendationChallengerV1`, never
   `...Canonical...` — it needs its own effective-rank/conditioning/sampling-efficiency/quality
   proof before promotion consideration, per the proposal's own caveat about restrictive
   applicability conditions) run `SHADOW` only. No challenger creates or reorders a Kanban task
   until an explicit `RecommendationTournamentV1`/`RecommendationReceiptV1` promotion, matching the
   `XGBOOST_RERANK_MODE=off/shadow/active` pattern already adopted in
   `parent-atlas-best-fit-score-fabric`'s `XGBOOST-RERANK-ACTIVATION-01` — reuse that pattern
   rather than inventing a second shadow/active vocabulary.

**Not registered as a gate**: Ewin Tang's algorithm as a retrieval-lane authority — explicitly out
of scope per the proposal's own framing (strong low-rank/conditioning assumptions, evaluated best
under restrictive conditions per the practical-evaluation literature it cites) and per this file's
existing `RL-RETRIEVAL-POLICY-01` precedent of holding experimental algorithms at
challenger/shadow status until proven. It belongs only inside gate 8's challenger slot.

**Do NOT** (carried forward from the proposal, consistent with this file's existing guardrails):
create `latent_128`/`latent_64` as new tables merely because they're "missing" — `latent_128`
genuinely has none and should stay a derived view; `latent_64` already has one, use it, don't
duplicate it. Do not let gate 8's challenger work start before gate 7 fixes the revision-identity
bug it depends on. Do not treat this registration as license to start `graphify:daily` or retry
`PKT-LINEAGE-08` — unrelated to and not unblocked by any of the above.

## SYNTHESIS-CONTEXT-GRAPH-01 (2026-09-03, DONE — direct user request, adjacent to but not one of the 8 gates above)

User asked directly for a networkx graph, built from oaklib + langextract, feeding `llm_synthesis`,
sourced from "pre-fill neural decoder DAG synthesis" — not itself one of the 8 registered gates
above, but touches the same representation-fabric territory (packet identity, representation
references never embedded as raw floats) so recorded here rather than under a separate authority.

**Before building anything, checked the operator's own prior decision on the adjacent question**
(gate 2, `LATENT256-QUERY-ENCODER-01`, still `OPEN`/not started): `models/nested-semantic-autoencoder/README.md`
records an explicit 2026-08-29 decision to defer standing up any new query-time GPU-adjacent
process, citing VRAM contention with the two already-live services on this 8GB card. Surfaced this
to the user before touching it (AskUserQuestion) — chose to evaluate `:8095` sharing only. Live
verification found the README's own "already PyTorch-capable" premise for that specific sharing
path is **currently false**: `docker exec miniforge-nlp-sidecar python -c "import torch"` →
`ModuleNotFoundError`, and the container has no `nvidia-smi` binary and no GPU reservation in
`docker/miniforge-nlp-sidecar/docker-compose.yml` — it is a plain CPU container today, not a
CUDA-context-sharing candidate as currently built. Not fixed (adding torch+CUDA to this container
is itself a real infra decision requiring the same sign-off the README already asks for) —
recorded as a finding, gate 2 stays `OPEN`.

**What was actually built** (does not require gate 2 — deliberately routed around it): a new
bounded FastAPI router on the already-live `:8095` sidecar combining two capabilities already
proven live in that exact container (`networkx==3.6.1`, `oaklib==0.7.4` — both already pinned in
`docker/miniforge-nlp-sidecar/Dockerfile`, zero new dependencies, satisfies
`DEPENDENCY-CAPABILITY-GUARD-01`):

- `python/atlas_synthesis_context_graph.py` — `POST /synthesis/context-graph`. Nodes: `PACKET`
  (one per candidate), `CONCEPT_MENTION` (one per LangExtract-grounded span, reusing the existing,
  proven `legacy._grounded_extractions()` — the same function `POST /extract`'s `grounded` pass
  already calls, not a new extraction path), `ONTOLOGY_CONCEPT` (one per successfully-oaklib-grounded
  `attributes.concept_id`, via the existing `atlas_oak_kernel._adapter()`/`AtlasPostgresOntologyAdapter`/
  `OboGraphInterface` accessors — reused, not reimplemented). Edges, returned as `(u, v, edge_type)`
  tuples per the literal request ("networkx graph... tuples"): `PACKET -MENTIONS-> CONCEPT_MENTION`,
  `CONCEPT_MENTION -GROUNDS_TO-> ONTOLOGY_CONCEPT`, optionally `ONTOLOGY_CONCEPT -IS_A-> ONTOLOGY_CONCEPT`
  (bounded 1-hop ancestors, `include_ontology_neighbors` flag, capped at 20 neighbors/concept — no
  unbounded traversal). Each candidate carries an optional `source_representation_ref` — an opaque
  string for a future neural-decoder representation-slice checksum/reference; this module never
  calls the neural-decoder service (`atlas_neural_decoder_service.py`, port 8121) itself and never
  embeds raw floats in the graph, per this repo's own large-array-by-reference rule (see
  `FETCH-LATENT-OPERATOR-01`/`CANDIDATE-FEATURE-MATRIX-REPRESENTATION-01` above for the DAG-side
  half of this same rule).
- Degrades correctly, does not throw: `ATLAS_OAK_ADAPTER` is unconfigured by default in this
  container (verified live: `GET /oak/health` → `adapterConfigured: false`) — the endpoint still
  returns the `PACKET`→`CONCEPT_MENTION` graph from LangExtract alone, `grounding.adapterConfigured: false`,
  zero `ONTOLOGY_CONCEPT` nodes. Also degrades if adapter construction itself throws (caught, not
  propagated).
- **Not itself `llm_synthesis`** — per this repo's existing rule that raw evidence must pass through
  bounded context assembly before reaching a model, this endpoint hands off a compact, checksum-stable
  (`graphChecksum`, deterministic — proven via a same-input-same-output test) context graph;
  `llmSynthesisPerformed: false` is explicit in every response. A future Ornith synthesis call is the
  consumer, not built here.
- Mounted in the real container entrypoint (`docker/miniforge-nlp-sidecar/Dockerfile`'s
  `CMD ["python", "/app/python/miniforge_nlp_sidecar_oak.py"]`), not a parallel/unwired module —
  `app.include_router(synthesis_context_graph_router)` added alongside the existing `oak_router`
  mount.
- **Tests**: `python/test_atlas_synthesis_context_graph.py`, 7/7 pass inside the real container
  (`docker exec miniforge-nlp-sidecar ... python -m pytest`) — covers the ungrounded-adapter path,
  the grounded path, "never call `label()` when no `concept_id` was extracted", adapter-construction
  failure degrading cleanly, `source_representation_ref` round-tripping without ever carrying a
  vector, the `MAX_CANDIDATES` bound, and checksum determinism.
- **Live end-to-end smoke test, real Ornith call through the actual container** (not mocked): the
  container was restarted (bind-mounted `python/` source, uvicorn does not hot-reload by default —
  matches this same file's own documented `UVICORN_RELOAD` finding elsewhere), `GET /openapi.json`
  confirms `/synthesis/context-graph` is registered, and a real `POST` against it returned a valid
  envelope (`nodeCount: 1, edgeCount: 0` — zero extractions for that specific test sentence, cross-
  checked against the pre-existing, already-proven `POST /extract` endpoint given the identical
  text, which independently returned the same zero-concept result — confirms this is real current
  LangExtract/Ornith behavior for that input, not a bug in the new code).

## GATE 2/4/5 CORRECTIONS + FETCH_LATENT CANDIDATE-SIDE HANDLER (2026-09-03, same session)

**Correction to gate 2 (`LATENT256-QUERY-ENCODER-01`) — the earlier "OPEN, deferred" status was
itself based on a stale source.** `models/nested-semantic-autoencoder/README.md` (2026-08-29)
said hosting a query-time encoder was operator-deferred; that framing predates a separately-landed
Neural Decoder Container (`python/atlas_neural_decoder_service.py`, port 8121). Live-verified this
pass: `curl :8121/health` → `"status":"ok","device":"cuda"`, real GPU. `.env` has
`NEURAL_DECODER_URL=http://127.0.0.1:8121` configured. A real `FETCH_LATENT` handler
(`sveltekit-frontend/src/lib/server/atlas/policy/oak-dag-neural-latent-handler-v1.ts`) already
calls it via `runNeuralDecoderPrefillCallerV1`, in `SHADOW_READONLY` mode (observes, never affects
ranking — a deliberate product choice, not a missing capability), and is registered in
`oak-dag-runtime-registry-v1.ts`. **Nuance, not glossed over**: the whole DAG execution path
(planner → executor → this handler) has zero live route callers — real, tested, but currently
unwired into any HTTP-triggered production traffic. **Revised gate 2 status: encoder hosting is
DONE; promoting it out of SHADOW mode and wiring the DAG path into a live route are separate,
still-open decisions**, not this gate's original "host the encoder" ask. Surfaced this correction
to the user directly (it reversed an earlier answer given this same session) before continuing.

**Gate 4 (`DAG-PARAMETER-MATERIALIZATION-01`) — corrected, was ALREADY DONE, not a gap.** The
registered claim ("planner emits `parameterArtifactRef: null` for every action") was checked
against the live planner (`packages/parent-atlas/src/core/kernel-bound-dag-planner-v1.ts`) and
found false: every action gets a real `parameterArtifactRef` via `buildParameterArtifactV1()`
(checksum-verified, schema-validated), and the executor
(`kernel-bound-dag-execution-adapter-v1.ts`) already resolves it correctly via
`resolveKernelDagParameterArtifactV1()`. A pre-existing test
(`kernel-bound-dag-planner-v1.spec.ts:25`) already asserted this. No code change needed — the
registration's own honest caveat ("not independently re-verified... re-check before trusting at
face value") did its job.

**Gate 5 (`FETCH-LATENT-OPERATOR-01`) — DONE for the candidate-side sub-case.** Confirmed live
that `FETCH_LATENT` existed in `DagActionKind` but had zero operator-kind mapping in the planner's
`actionKindForOperator` — the registration's premise here was correct. Built the candidate-side
half (fetching an already-stored candidate's `latent_256` by id — pure Postgres read, no GPU, no
dependency on gate 2's encoder):
- `packages/parent-atlas/src/core/kernel-operator-library-v1.ts`: added
  `FETCH_LATENT_REPRESENTATION` to `KERNEL_OPERATOR_KIND_VALUES`.
- `kernel-bound-dag-planner-v1.ts`: mapped `FETCH_LATENT_REPRESENTATION → 'FETCH_LATENT'` in
  `actionKindForOperator`. New planner test proves it lowers correctly (`actionKind === 'FETCH_LATENT'`,
  real `parameterArtifactRef`).
- `candidate-representation-slice-v1.ts` (new): `CandidateRepresentationSliceV1` — checksums +
  ordinals only, matches the registration's exact ask and this repo's no-raw-vectors-in-DAG-JSON
  rule. 5 tests, including a `found > requested` rejection and an ordinal-count-mismatch rejection.
- `oak-candidate-latent-owner-v1.ts` (new): governed input contract for the candidate-side fetch,
  distinct from the existing query-time encoder's owner contract (`oak-neural-latent-owner-v1.ts`)
  — same pattern, different sub-case.
- `sveltekit-frontend/src/lib/server/atlas/policy/oak-dag-candidate-latent-handler-v1.ts` (new):
  wraps the existing, already-proven `PostgresLatent256CandidateProvider` (candidate-side
  hydration, real Postgres read of `codebase_chunk_index.latent_256`). Raw `vectors` map is read
  and then deliberately discarded — never crosses into the returned
  `CandidateRepresentationSliceV1`. Registered in `oak-dag-runtime-registry-v1.ts` alongside the
  query-time encoder handler, under a distinct `operatorId`/`implementationRef` — no collision,
  both legitimately share the `FETCH_LATENT` action kind (matches this file's existing
  many-operators-one-action-kind pattern).
- **Two real pre-existing/adjacent bugs found and fixed while testing, not routed around**:
  (1) `oak-dag-runtime-registry-v1.spec.ts` hardcoded `toHaveLength(6)` — already stale before
  this session's addition (the neural-latent handler alone had already made it 7); fixed to 8 with
  a comment explaining the staleness wasn't caused by this change. (2) A dynamic
  `await import('./oak-dag-runtime-registry-v1.js')` in this session's own first draft of the new
  handler's third test transitively hit `src/lib/server/ollama.ts`'s `ROTORQUANT_MODEL_PATH`
  required-env throw — an unrelated, pre-existing environment-config gap. Rewrote that test to
  compare the two handler factories directly instead of depending on the full registry import
  graph, proving the same "no collision" claim without the fragile dependency.
- Verified: `packages/parent-atlas` `tsc` build clean; 9/9 package-side tests pass
  (`candidate-representation-slice-v1.spec.ts` + `kernel-bound-dag-planner-v1.spec.ts`,
  including the new `FETCH_LATENT_REPRESENTATION` test); 5/5 sveltekit-frontend-side tests pass
  (`oak-dag-candidate-latent-handler-v1.spec.ts` + `oak-dag-runtime-registry-v1.spec.ts`, after
  both fixes above).
- **Not built this pass**: the QUERY-TIME `latent_128`/`latent_64` derive-by-`PREFIX_L2` transform
  sub-case (only the physical `latent_256` candidate-side fetch was built); wiring the DAG
  execution path into any live HTTP route (still zero callers, per the gate-2 correction above);
  promoting the query-time encoder out of `SHADOW_READONLY`.

## 2026-09-03 PROOF-GATED STATUS TABLE (supersedes the scattered ~2026-08-27 status)

**Provenance note**: no single literal table matching this shape was found on disk — the
underlying facts already exist as prose across `openspec/changes/parent-atlas-neural-prefill-encoder/tasks.md`
("Current Workstation Alignment (2026-08-28)", CANARY-01..04) and this file's own §5
(`PKT-LINEAGE-01..08`). This table is a dated synthesis of those, in the corrected form directed
by the operator, not an edit-in-place of a table that was searched for and not found.

| Lane | Current state | Next gate |
|---|---|---|
| Replay admission | `PROVEN` (`FROZEN_REFERENCE`), 10/135 → 10/135, still valid | Preserve cohort checksum; do not reopen unless source scope changes |
| Frozen DAG | `PROVEN` (`FROZEN`), checksum remains reference evidence | Freeze the DAG artifact itself. **Not** "no more topology work" — topology/representation admission is now a separate lane (see rows below) |
| Graphify source byte integrity | `PROVEN_BOUND_OWNER` / `LIFECYCLE_SPLIT` — one completed run (`369e4270-7689-4536-8816-4ec4a5517b3e`) owns 25,258 files, all 25,258 with source revisions/hashes; 4 newer completed runs are unbound, plus stale RUNNING states | `GRAPHIFY-EXECUTION-LEDGER-SCHEMA-02` coordinator canary: immutable execution↔source membership |
| Packet↔chunk integrity | 15/15 exact current canary `PROVEN`; old 332-exact/4,148-ambiguous numbers are no longer the useful promotion boundary | Scale 15 → 128 → 768; resolve or exclude the 74 ambiguous mappings + 243 revision-unproven rows |
| Workspace/source namespace | `PROVEN` — one workspace, explicit repository/directory scope, zero ambiguity, completed owner available | Bind this authority into the new Graphify execution/source ledger and the packet-lineage success canary |
| Source lineage (`PKT-LINEAGE-08`) | `IMPLEMENTATION_PROVEN` / `SUCCESS_CANARY_PENDING` — no longer well-summarized as "61,126 missing joins"; current preflight found 50 real orphan candidates, 434 namespace-qualified memberships; residual blocker is 3 files lacking Graphify source-revision authority | Finish Graphify lifecycle source-selection authority, then one explicitly authorized bounded success canary |
| `CandidateOrdinal` | `PROVEN_CANARY` — real 15-row `CandidateOrdinalMapV1` through the canonical owner | Scale exact-identity cohort to 128, then 768. No aliases, no fuzzy basename, no synthetic revisions |
| `semantic_768` | 15/15 exact canary `PROVEN`, including deterministic `ContextManifest` replay | Expand with the exact-lineage cohort; bind model/representation/vector revisions for the 128/768 expansion |
| `CandidateFeatureMatrix` | `PROVEN_CANARY` — 15 rows/25 features, manifest exists, deterministic A/B replay, 7 graph-bearing candidates / 8 graph-absent, ranking promotion `false` | Scale identity parity to 128 → 768, then admit representation refs (GPU features) under the same ordinal checksum |
| Learned representation family | `latent_256` physical; `latent_128`/`latent_64` derived. Storage/indexing exists (see `LATENT256-REPRESENTATION-CONTRACT-02` above); representation identity/provenance is not promotion-complete | Representation-ledger readback: parent revision, transform-policy, derived-view checksum, hot/warm/cold admission |
| Go Retrieval + latent use | `semantic_768` remains current query authority; `latent_256` has candidate-side hydration (see `GO-RETRIEVAL-REPRESENTATION-ROUTING-01` above) but is not an independent query lane yet | Query-encoder representation-routing contract, no extra RRF vote |
| DAG parameters | Contract already has `parameterArtifactRef`/`parameterChecksum` and `FETCH_LATENT` — **corrected same session**: the planner does NOT emit null; it already materializes a real `ParameterArtifactV1` per action (see `DAG-PARAMETER-MATERIALIZATION-01` correction above) | `FETCH_LATENT` candidate-side operator done this session (`FETCH-LATENT-OPERATOR-01`); query-time sub-case already live via the existing `SHADOW_READONLY` handler (see gate-2 correction above) |
| Hot/warm/cold | Policy conceptually aligned: cold=`semantic_768`, warm=`latent_256`, hot=`latent_128`, hot-L1=`latent_64` | Prove representation-ledger readback (128 vs 64, topology residency tournament) before default promotion |

**The biggest update is the overall flow.** OLD framing: 61k lineage gap → `CandidateOrdinal`
blocked → `CandidateFeatureMatrix` not ready. CURRENT framing: Graphify lifecycle-ownership
repair + exact source-selection namespace → 15-row packet/chunk lineage `PROVEN` → 15-row
`CandidateOrdinalMapV1` `PROVEN` → 15-row `semantic_768` `PROVEN` → 15/25 `CandidateFeatureMatrixManifestV1`
`PROVEN` (deterministic `ContextManifest` replay `PROVEN`) → scale exact identity 15 → 128 → 768
(`OPEN`). The CandidateOrdinal/feature-matrix *machinery* is no longer what's blocked — the
blocker is scaling exact identity and fixing execution/source ownership so the already-proven
canary contracts can safely widen.

**Corrected V1 completion boundary** (supersedes the earlier "15 exact lineage rows →
`CandidateOrdinalMapV1` → `semantic_768` exact retrieval → deterministic `ContextManifestV1` →
frozen validator → bounded read-only DAG → `ExecutionReceiptV1` → `WORKSTATION_V1_PROVEN`" framing):

```
GRAPHIFY EXECUTION AUTHORITY (fresh executionId, exact workspaceRevision, frozen source-selection manifest)
  → LINEAGE COHORT (15 proven; 128, 768 open)
  → CandidateOrdinalMapV1 (semantic_768, REQUIRED)
  → CandidateFeatureMatrixManifestV1
      latent_256 ref   — OPTIONAL, WARM
      latent_128 view  — OPTIONAL, HOT
      latent_64 view   — OPTIONAL, HOT-L1
  → ContextManifestV1 (Frozen Validator)
  → ParameterArtifactV1 (TypedRepairDagV1)
  → ExecutionReceiptV1 → WORKSTATION_V1_PROVEN
```

Representation features stay **optional evidence** in V1, never a new blocker ahead of lineage —
`semantic_768` remains the required semantic authority.

**Highest-priority chain, corrected**:
`GRAPHIFY-EXECUTION-LEDGER-SCHEMA-02` → `GRAPHIFY-DAILY-COORDINATOR-01` → `GRAPHIFY-DAILY-CANARY-02`
→ `SOURCE-SELECTION-AUTHORITY-01` → `PKT-LINEAGE-08` success canary → 15→128 exact lineage →
128→768 exact lineage → `CandidateFeatureMatrix` parity → latent representation admission → DAG
parameter materialization (already proven, see correction above) → bounded read-only DAG receipt.

**Scope note on the remainder of this operator message (not undertaken this pass)**: the same
message went on to propose ~15 additional gates (`TREE-SITTER-STRUCTURAL-UNIT-01` through
`PATCH-PROPOSAL-VALIDATION-01`), a full `LSP-CROSS-FILE-SOURCE-READER-01` architecture spec, and a
`BestFitScoreV1`/OKF-calibration workstream. None of that is registered or started here — it is
substantially larger than a single-session scope and deserves its own dedicated pass (likely its
own OpenSpec change or changes, not force-fit under this file's single-authority scope without
review). Flagging its existence here so it isn't lost, not registering it as gates yet.

## SESSION HANDOFF (2026-09-03, end of session)

**Error check, run at session end**: `packages/parent-atlas` `tsc -p tsconfig.json` — 0 errors.
`services/go-retrieval-service` — `go build ./...`, `go vet ./...`, `go test ./...` all pass
(0.09s). `sveltekit-frontend` `tsgo --noEmit` — 87 errors repo-wide, **none touching any file this
session edited or created**; every one is pre-existing (missing npm packages —
`@mendable/firecrawl-js`, `pdf-lib`, `nodemailer`, `nodejs-whisper`, `piper-wasm`, `fastmcp`,
`mammoth`, `@playwright/test`; `QdrantClient.search` API drift; unrelated schema-export
mismatches). Confirmed by cross-referencing every error's file path against this session's touched
file list below — zero overlap.

**Files this session actually created or edited** (verified against `git status`, not assumed):

*Closed/corrected gates (this file, `parent-atlas-retrieval-lineage-dag-convergence`)*:
- `sveltekit-frontend/drizzle/manual/20260903_graphify_execution_ledger_v1.sql` — append-only
  trigger added; migration proof redone correctly after catching a real rollback-methodology bug
  mid-session (first attempt silently committed to the live DB, caught via `to_regclass()`,
  reverted, redone with the migration's own `BEGIN`/`COMMIT` stripped).
- `sveltekit-frontend/src/lib/server/atlas/tensors/representation-artifact-v1.ts` (+`.spec.ts`) —
  `NESTED_LATENT_REPRESENTATION_FAMILY_V1`, `assertRepresentationFamilyRevisionBinding()`.
- `sveltekit-frontend/src/lib/server/atlas/board/graphify-current-workspace-revision.ts` (new,
  +`.spec.ts`), `daily-graphify-board-recommendations.ts` (edited) — real `workspaceRevision`
  resolver, degrades to `null` on DB failure per this repo's Degraded Response Contract.
- `python/atlas_synthesis_context_graph.py` (new, +`test_atlas_synthesis_context_graph.py`),
  `python/miniforge_nlp_sidecar_oak.py` (edited) — `POST /synthesis/context-graph` on the live
  `:8095` sidecar. Live end-to-end smoke-tested through the real container.
- `proto/active/retrieval.proto`, `services/go-retrieval-service/main.go` (+ regenerated
  `proto/retrieval/retrieval.pb.go`/`retrieval_grpc.pb.go`, + new `representation_test.go`) —
  `representation_id`/`representation_used`/`representation_fallback_reason` wire fields,
  `resolveRepresentation()` registry, never-silent-fallback.
- `packages/parent-atlas/src/core/kernel-operator-library-v1.ts`,
  `kernel-bound-dag-planner-v1.ts` (+`.spec.ts`), `candidate-representation-slice-v1.ts` (new,
  +`.spec.ts`), `oak-candidate-latent-owner-v1.ts` (new), `src/index.ts` (barrel) — `FETCH_LATENT_REPRESENTATION`
  operator kind, `CandidateRepresentationSliceV1` contract.
- `sveltekit-frontend/src/lib/server/atlas/policy/oak-dag-candidate-latent-handler-v1.ts` (new,
  +`.spec.ts`), `oak-dag-runtime-registry-v1.ts` (+`.spec.ts`, fixed a pre-existing stale hardcoded
  handler count) — candidate-side `FETCH_LATENT` handler wrapping
  `PostgresLatent256CandidateProvider`.

*Registered but not built* (still `OPEN`, tracked in this file, not started): gate 6
(`CANDIDATE-FEATURE-MATRIX-REPRESENTATION-01`), gate 8 (`RECOMMENDATION-TOURNAMENT-01`), the
`latent_128`/`latent_64` derive-by-transform sub-case of `FETCH_LATENT`, wiring the DAG execution
path into any live HTTP route, promoting the query-time neural-decoder encoder out of
`SHADOW_READONLY`, and the large operator-dictated ~15-gate/LSP/`BestFitScoreV1` workstream flagged
in the section immediately above this one.

**Two corrections made mid-session that reversed earlier statements in this same conversation**,
recorded here so a fresh session doesn't have to re-derive them: (1) gate 2
(`LATENT256-QUERY-ENCODER-01`) is NOT blocked — a live GPU query-time encoder already exists
(`:8121`), just running in `SHADOW_READONLY`; (2) gate 4 (`DAG-PARAMETER-MATERIALIZATION-01`) was
never actually broken — the planner already materializes real `ParameterArtifactV1`s per action.

**Next-session starting point**: `npx openspec validate parent-atlas-retrieval-lineage-dag-convergence
--type change --strict --json` and `node scripts/atlas/audit-openspec-portfolio-v1.mjs` both pass
clean as of this handoff — re-run both first thing, since this file is under heavy concurrent
editing (multiple sections in this same file were found modified by other sessions mid-turn,
several times, throughout this session). Read the file's current tail before appending — do not
assume it still ends where this handoff says it does.

## FETCH-LATENT-DERIVED-VIEWS-02 (2026-09-04)

**OPEN_CONTRACT_GAP / LIVE_REPLAY_OPEN.** A read-only audit of the existing owners is recorded
in `docs/reports/fetch-latent-derived-views-v2.json`. `latent_256` remains the persisted learned
parent served by `PostgresLatent256CandidateProvider`; `latent_128` remains a virtual `PREFIX_L2`
view derived from that parent; `latent_64` remains an existing physically persisted learned output
and must not be recreated through a second derived-view or storage path.

The audit found one unresolved contradiction: an existing candidate-feature fixture still labels
`latent_64` as `NESTED_PREFIX_L2_RENORMALIZE` from `latent_256`, despite the authoritative family
contract classifying the persisted `latent_64` column as a learned output from `semantic_768`. This
must be reconciled before representation bindings are admitted to the feature matrix.

The audit added no provider, table, collection, cache record, Graphify run, or retrieval vote. It
proves the existing owner/shape declarations only. Live persisted-vector readback,
CandidateOrdinal parity, derived checksums, and query-time promotion remain **UNPROVEN**. Raw
vectors remain excluded from DAG JSON, with `canonicalAuthority=false` and `writesPerformed=false`.

The next gate is `CANDIDATE-FEATURE-MATRIX-REPRESENTATION-01`: reuse these owners and add only
representation references plus ordinal-alignment checksums to the existing feature-matrix manifest.

## CANDIDATE-FEATURE-MATRIX-REPRESENTATION-01 (2026-09-04)

**STATIC_OWNER_SURFACE_PROVEN / MANIFEST_OPEN.** The read-only audit
`docs/reports/candidate-feature-matrix-representation-v1.json` confirms that the existing
CandidateOrdinal owner, feature-row/snapshot owners, latent-256 hydration receipt, and
representation-family contract already expose the required identity/revision inputs. A dedicated
manifest still does not exist and is intentionally not created in this script-first pass.

The future manifest must carry opaque references and checksums for `latent_256`, `latent_128`, and
`latent_64`, plus representation availability/alignment by the same CandidateOrdinal map. It must
not contain raw vectors, create a new retrieval vote, or change ranking behavior. Live snapshot
replay and cross-representation ordinal parity remain **UNPROVEN**.

## LATENT-REPRESENTATION-SEMANTICS-03 + FETCH-LATENT-DERIVED-VIEWS-02 latent_128 derive (2026-09-04, real code, not audit-only)

**Concurrent-session note**: the two sections immediately above this one (registered moments
earlier by a different session, same file) are script-first, read-only audits. This section
implements real, tested code that resolves the exact contradiction the `FETCH-LATENT-DERIVED-VIEWS-02`
audit flagged as unresolved -- "an existing candidate-feature fixture still labels `latent_64` as
`NESTED_PREFIX_L2_RENORMALIZE` from `latent_256`, despite the authoritative family contract
classifying the persisted `latent_64` column as a learned output from `semantic_768`." That
contradiction is now resolved in code, not just flagged:

- `packages/parent-atlas/src/core/latent-derived-view-transform-v1.ts` (+`.spec.ts`, 7 tests) --
  new, pure, DB-free `deriveNestedPrefixL2RenormalizedView(parentVector, targetDimensions)`
  (prefix + L2-renormalize). Exported from the package barrel, package rebuilt (`tsc -p
  tsconfig.json`, 0 errors) so `sveltekit-frontend` actually sees the new export.
- `sveltekit-frontend/src/lib/server/atlas/tensors/representation-artifact-v1.ts` --
  `NESTED_LATENT_REPRESENTATION_FAMILY_V1` members now carry two independent axes,
  `origin: 'LEARNED' | 'DERIVED'` and `materialization: 'VIRTUAL' | 'PERSISTED'`, plus a
  `coProducedWith` field for the case neither axis alone can express: `latent_64` is
  `LEARNED` + `PERSISTED` (own NestedSemanticAutoencoder forward pass over `semantic_768`) but
  **co-produced with** `latent_256` in the same run/checkpoint, not derived from it.
  `latent_128` is the true `DERIVED` + `VIRTUAL` case (`transform:
  'NESTED_PREFIX_L2_RENORMALIZE'`, `parentRepresentationId: 'latent_256'`). `latent_256` itself is
  `LEARNED` + `PERSISTED`, `coProducedWith: null`. This directly corrects an operator proposal
  earlier in this same conversation turn that framed `latent_64` as `DERIVED` with
  `parentRepresentationId: 'latent_256'` -- that framing is what the audit fixture above also got
  wrong, per this file's own already-existing, unchanged live audit. 3 new tests added
  (22/22 pass), backward-compatible with all 19 pre-existing tests in the same file.
- `packages/parent-atlas/src/core/oak-candidate-latent-owner-v1.ts` -- `oakCandidateLatentInputV1Schema`
  gained `representationId: z.enum(['latent_256', 'latent_128']).default('latent_256')`.
  `latent_64` deliberately excluded from this candidate-side fetch contract -- codebase_chunk_index
  has no `latent_64_checkpoint_revision` column (checked live via `grep` across every
  `drizzle/*.sql` migration; only `latent_256_checkpoint_revision` exists), so there is no column
  to bind provenance against without asserting an unproven identity between two independently
  writable columns. Left open, not faked.
- `sveltekit-frontend/src/lib/server/atlas/policy/oak-dag-candidate-latent-handler-v1.ts` -- now
  branches on `representationId`. `latent_256` path unchanged (exact physical read, as before).
  New `latent_128` path: reuses the SAME `PostgresLatent256CandidateProvider.hydrate()` call (no
  new query), applies `deriveNestedPrefixL2RenormalizedView` per candidate, computes a derived
  `vectorsChecksum` distinct from the parent's, folds any dimension-mismatched or non-finite parent
  vector into `degraded` (never thrown past the handler). Raw vectors (parent AND derived) are
  still discarded before the function returns -- only `CandidateRepresentationSliceV1`
  (checksums/ordinals) crosses into the DAG receipt, same hard rule as before. 2 new tests added
  (7/7 pass in this file): one proving the derived checksum differs from a plain `latent_256`
  checksum of the identical fixture (proves the transform actually ran), one proving a
  shape-invalid parent vector degrades rather than throwing.

**What remains open** (unchanged from the audit sections above, not narrowed by this work):
`CANDIDATE-FEATURE-MATRIX-REPRESENTATION-01`'s manifest itself (no `CandidateFeatureMatrixManifestV1`
representation-columns implementation exists yet -- this round only fixed the representation family
contract and the candidate-side fetch handler it depends on); `latent_64` candidate-side FETCH_LATENT
(blocked on the missing checkpoint-revision column, tracked above); the query-time neural-decoder
encoder at `:8121` remains `SHADOW_READONLY`, untouched by this round; no DAG execution path was
wired into any live HTTP route.

**Verification this round**: `packages/parent-atlas` `tsc -p tsconfig.json` -- 0 errors, package
rebuilt. `sveltekit-frontend` `tsgo --noEmit -p tsconfig.json` -- 0 errors in either touched file
(grepped by filename against the full run). Package's own vitest suite (`vitest run` from
`packages/parent-atlas`, using `sveltekit-frontend`'s vitest binary since the package has no
vitest config of its own) -- 190/190 `.spec.ts` tests pass (the 86 `test/*.test.mjs` "failures" in
that same run are a pre-existing, unrelated node:test-runner-only test suite that vitest cannot
collect -- not a regression, confirmed by the 0-failed/190-passed spec-test tally in the same
output). `sveltekit-frontend` vitest: `representation-artifact-v1.spec.ts` 22/22 pass,
`oak-dag-candidate-latent-handler-v1.spec.ts` 7/7 pass.

**Manifest planning follow-up (2026-09-04).** The script-first plan
`docs/reports/candidate-feature-matrix-representation-plan-v1.json` freezes the intended manifest
shape: `semantic_768` is required; latent-256 is an optional persisted parent; latent-128 is an
optional virtual view; latent-64 is an optional persisted physical output. Unavailable live
bindings remain `null`; no fallback identity is permitted. The manifest uses opaque artifact
references and ordered CandidateOrdinal/alignment checksums, never inline vectors. Live binding and
replay remain open.
