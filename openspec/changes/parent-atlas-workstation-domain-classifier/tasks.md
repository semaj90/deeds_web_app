# Tasks — Parent Atlas Workstation Domain Classifier

## Local claim reconciliation (2026-08-20)

The supplied Phase 6/85 note describes Query Routing V2, an EmbeddingGemma
`classification_mrl_128` tensor, and a PyTorch trainer, but those files and a
matching OpenSpec are not present in this checkout. The local implementation
remains the V1 neural-routing feature contract. Focused V1 query-routing,
neural-routing, and RAPIDS capability-probe tests pass 10/10. This does not
prove the claimed classifier, dataset, executor-policy training, or MiniLM
retirement; no model training or runtime/index writes were performed.

## Revision-qualified classification export (2026-08-20)

- [x] Added a pure `EmbeddingGemmaClassificationExampleV1` exporter beside the
      existing V1 dataset owner.
- [x] Requires feature, model, prompt, and label revisions; supports explicit
      `FEATURES_ONLY` rows and only marks a row `TRAINING_READY` when a finite,
      normalized 128-d `classification_mrl_128` vector is supplied.
- [x] Focused exporter/query tests pass 4/4 in the dedicated exporter lane. The exporter does not call Ollama,
      train PyTorch, write JSONL, mutate retrieval policy, or write stores.
- [ ] A live query/label producer and same-corpus EmbeddingGemma  embeddinggemma ast cst semantic 768, 512, 256, 128, derived latent256, latent128-d dataset
      remain unproven; MiniLM retirement remains blocked.
- [x] Added an explicit adapter from verified `ToolTrainingExampleV1` rows;
      domain, operation, retrieval-needs, and all revision metadata remain
      required inputs and are never inferred from `toolId` or query text.
- [x] Added the local fixture harness `npm run atlas:embedding:classification:export:proof`;
      it produced one `FEATURES_ONLY` row with zero training-ready rows and
      reported `FIXTURE_PROVEN_LIVE_PRODUCER_NOT_WIRED` without store writes.
- [x] Added a pure adapter from the existing workflow-loop execution receipt;
      it requires an explicit successful, replay-stable receipt before a caller
      may mark a row verified and unions receipt evidence into the export row.
- [ ] The workflow loop still has no live classifier producer. It does not own
      EmbeddingGemma inference, domain/operation labels, retrieval-needs labels,
      or classifier policy revisions; no live wiring is claimed.
- [x] Audited the live error-agent API route and recorded the missing producer
      inputs in `docs/reports/query-routing-live-producer-audit.json`.

## Classification export proof recheck (2026-09-11)

- [x] Re-ran `npm run atlas:embedding:classification:export:proof`.
- [x] Fixture result remains `FIXTURE_PROVEN_LIVE_PRODUCER_NOT_WIRED` with
      `canonicalWrites=false`.
- [ ] Keep the live classifier export blocked until a same-corpus producer
      supplies grounded AST/CST evidence, EmbeddingGemma representation
      revisions, labels, and replay-stable source lineage.

Evidence: `docs/reports/query-routing-classification-export-proof.json`.
Status: `FIXTURE_PROVEN_LIVE_PRODUCER_NOT_WIRED`; authority=false;
writesPerformed=false.
First blocker: `LIVE_CLASSIFIER_PRODUCER_NOT_WIRED`.
Next gate: current source-bound query/label producer proof.

## Built this session (2026-08-12)

- [x] New module: `sveltekit-frontend/src/lib/server/ai/parent-atlas-workstation-domain-classifier.ts`
      — domain taxonomy, concept patterns, real tree-sitter chunking, gated LLM summary via
      llama-server, embeddinggemma reuse, Qdrant ingest, Redis centroid materialization, CLI entry.
- [x] `tsc --noEmit -p .` clean for this file (0 errors referencing it).
- [x] Live-verified tree-sitter parse works on this machine (not assumed) and llama-server is up
      with `hforf.gguf` loaded.
- [x] OpenSpec proposal documenting the copy-source, the 3 real upgrades, and the deliberate
      Qdrant/Redis namespace separation from the existing AUTH/DATA/API/UI classifier.
- [x] Live classifier proof now exists for the local lane: real chunk extraction and domain
      scoring are executing, including the `tree-sitter-typescript` ESM import fix
      (`tsLangModule.typescript ?? tsLangModule.default?.typescript`).

## Exact runtime map now in use

This is the file map the current implementation is aligned to:

| Lane | Files |
|---|---|
| Extraction | `docker/miniforge-nlp-sidecar/Dockerfile`, `docker/miniforge-nlp-sidecar/docker-compose.yml`, `sveltekit-frontend/src/lib/server/analysis/ast-langextract-bridge.ts`, `sveltekit-frontend/src/lib/server/ai/parent-atlas-workstation-domain-classifier.ts` |
| Packet synthesis | `sveltekit-frontend/src/lib/server/analysis/source-pos-concept-packet.ts`, `sveltekit-frontend/src/lib/server/analysis/code-evidence-synthesizer.ts`, `sveltekit-frontend/src/lib/server/analysis/analysis-pass-results.ts`, `sveltekit-frontend/src/lib/server/analysis/code-evidence-readback.ts` |
| Live worker wiring | `sveltekit-frontend/src/lib/server/analysis/worker.ts` |
| Graphify board consumer | `sveltekit-frontend/src/lib/server/atlas/board/daily-graphify-board-recommendations.ts`, `sveltekit-frontend/src/lib/server/analytics/recommendation-policy.ts` |
| TurboVec retrieval | `sveltekit-frontend/src/lib/server/retrieval/turbovec-prefilter.ts`, `sveltekit-frontend/src/lib/server/retrieval/turbovec-rerank.ts`, `sveltekit-frontend/src/lib/server/grpc/turbovec-cuda-client.ts`, `packages/parent-atlas-retrieval/src/index.ts` |

TurboVec remains retrieval acceleration only; it does not participate in extraction or evidence synthesis.

## Updated priority after the latest logs

| Item | State | Notes |
|---|---|---|
| Local classifier logic is proven live | PROVEN | live Tree-sitter / domain logic already exercised |
| First-class code evidence receipt builder is now wired through `analysis/code-evidence-synthesizer.ts` | WIRED | worker path threads the receipt |
| Durable Postgres / outbox write plane is healthy enough for end-to-end receipts | OPEN | durability still blocked by the write plane |
| Qdrant / Redis sidecar write path re-proof is still required before promoting the pipeline | OPEN | sidecar write path still needs re-proof |
| Live durable receipt persistence still depends on the degraded write plane | OPEN | still blocked until durable persistence recovers |

## Sidecar wiring — IN PROGRESS 2026-08-12 (same session, "wire it up ... conda nlp docker sidecar")

| Item | State | Notes |
|---|---|---|
| Discovered `docker/miniforge-nlp-sidecar/` and its live capabilities | PROVEN | live container and tooling verified |
| Found and fixed the `POST /analyze` bug | PROVEN | one-line guard fix landed |
| Confirmed no other unguarded `control5.` access exists | PROVEN | scan completed |
| Rewired `parent-atlas-workstation-domain-classifier.ts` to try the sidecar first | WIRED | sidecar is now the first path, fallback remains local |
| Rebuild in progress | OPEN | build / smoke / CLI proof still pending |

## isMainModule Windows sweep — CLOSED 2026-08-12 (repo-wide, prompted by this task's own test failure)

- [x] Found the same bug in `ace-domain-evidence-extractor.mts` while testing `collectSemanticEvidence()`
      (see below) and in this task's own `parent-atlas-workstation-domain-classifier.ts` while
      running its first live CLI test — both exited 0 with zero output, `main()` silently never ran.
- [x] Root cause: `import.meta.url === \`file://${process.argv[1]}\`` never matches on Windows
      (backslash path vs. real `file://` URL). Fixed both files with
      `process.argv[1] === fileURLToPath(import.meta.url)`.
- [x] Swept the whole repo for the same pattern (plus a second broken variant,
      `process.argv[1] === import.meta.url.replace('file://', '')`) — found **35 files total**,
      fixed all 35 (script + manual verification, not a blind find-replace — each file's
      `fileURLToPath` import was checked/inserted correctly, verified via grep for duplicate
      imports and `node --check` / `tsc --noEmit` for syntax/type correctness after the edit).
- [x] Found and corrected a pre-existing, unrelated bug while syntax-checking the sweep:
      `scripts/ai/embed_and_index_scenarios.mjs` contained two entire scripts concatenated into one
      file. The duplicate implementation was removed after preserving the first script's behavior.
- [x] Documented the pattern + canonical fix in `CLAUDE.md`'s "Key Lessons" section so future
      scripts don't reintroduce it.
- [x] Removed the redundant Windows-unsafe `process.argv[1].endsWith(...)` main-module
      fallbacks from `scripts/atlas/load-profiles-to-postgres.mjs`,
      `scripts/atlas/build-component-profiles.mjs`, and
      `scripts/atlas/build-ast-topology-dry-run.mjs`. Each now uses a guarded,
      path-normalized `fileURLToPath(import.meta.url)` comparison.
- [x] Removed the pre-existing file-concatenation corruption from
      `scripts/ai/embed_and_index_scenarios.mjs`, preserving the first script's
      behavior and eliminating the unreachable duplicate implementation.

## Next session — pick up here

| Item | State | Notes |
|---|---|---|
| First real end-to-end run on one real file | OPEN | isolate tree-sitter, embedding, Qdrant, Redis from the LLM call first |
| Second run with `--with-llm-summary` on the same file | OPEN | confirm real summaries and record cost per chunk |
| Decide whether to batch over the atlas source directories | OPEN | needs explicit approval before any broad LLM run |
| Register this capability in the runtime ownership registry only after a proven end-to-end run | OPEN | can only promote after receipt exists |
| Decide whether live wiring belongs in a startup hook, npm script, or CLI-only path | OPEN | product decision still open |

## Re-verification pass (2026-09-05, read-only — no code/schema/index changes)

Cross-checked every open item above against the live repo and the rest of the OpenSpec portfolio,
not just re-stated. Nothing has moved since the 2026-08-12/08-20 entries above; recorded here so a
future session doesn't have to re-derive the same checks.

- **Wiring status unchanged.** `grep -rl "parent-atlas-workstation-domain-classifier" sveltekit-frontend/src`
  returns zero callers outside the module's own file. `classifyWorkstationDomain`/
  `classifyWorkstationFile`/`embedAndIngestWorkstationNodes` are still exported but invoked from
  nowhere in the live tree — the "NOT WIRED INTO ANY LIVE ROUTE" premise from `proposal.md`'s
  header and the "Next session — pick up here" table above both still hold exactly as written.
- **Not superseded by `DOMAIN-CLASSIFIER-OWNER-01`** (closed 2026-09-04 in
  `openspec/changes/parent-atlas-retrieval-lineage-dag-convergence/tasks.md`), despite the
  name similarity and both landing on "9 domains." Checked directly:
  `sveltekit-frontend/src/lib/server/atlas/domain-taxonomy.ts`'s `CANONICAL_DOMAINS` is
  `['auth','ui','retrieval','network','database','cache','agent','graph','ml']` — a generic
  code/query routing taxonomy, unrelated to this change's Parent-Atlas-Workstation architecture
  lanes (`IDENTITY, EXPORT_STORAGE, GRAPH, TELEMETRY, EMBEDDING, OKF_ONTOLOGY, TRANSPORT, COMPILER,
  RUNTIME_TRAINING`). Independently corroborated by `parent-atlas-search-classifier-sidecar/tasks.md`
  (closed, 36/36), which explicitly lists this change as "kept fully separate — do not touch its
  files from this change" and classifies `parent-atlas-workstation-domain-classifier.ts` as its own
  legitimate second `CANONICAL_OWNER` under `WORKSTATION_LANE_CLASSIFICATION`, not a duplicate to
  consolidate.
- **Line 22's "live query/label producer + `classification_mrl_128`" blocker is correctly tracked
  in a sibling change, not duplicated here.** `openspec/changes/parent-atlas-query-routing-classifier/tasks.md`
  owns this exact work stream (`classification_768 -> classification_mrl_128` MRL truncate+L2
  projection) and is itself still open at the blocking step: `NLP-1`'s "Produce fixture embeddings
  with the proven EmbeddingGemma executor" and "Verify 128-d norm/digest determinism" remain
  unchecked there too. MiniLM retirement (this change's line 22) accordingly remains blocked — not
  resolved, but the right place to watch is that sibling file, not to re-derive the blocker here.
- **Line 33 (workflow loop has no live classifier producer)** — no new evidence found anywhere in
  the portfolio; still accurately open.
- **Lines 108/115 (isMainModule sweep leftovers) re-verified live, unchanged:**
  `scripts/ai/embed_and_index_scenarios.mjs` now has one shebang and passes `node --check`; its
  prior file-concatenation corruption was removed in this pass.
  `scripts/atlas/load-profiles-to-postgres.mjs`, `scripts/atlas/build-component-profiles.mjs`, and
  `scripts/atlas/build-ast-topology-dry-run.mjs` all still carry the redundant
  `|| process.argv[1].endsWith('...')` fallback clause alongside the correct primary
  `fileURLToPath(import.meta.url)` comparison — harmless, still a trivial follow-up, not done.

**Net effect of this pass**: no items closed, no items newly blocked, no duplicate-owner risk found.
This change remains exactly what its own "Next session — pick up here" table says: waiting on a
first real end-to-end proof run (tree-sitter → embedding → Qdrant → Redis, LLM summary as a second
pass) before any live-wiring decision is worth making.

## Read-only lineage recheck (2026-09-09)

- [x] Ran `scripts/atlas/audit-domain-classifier-lineage-v1.mjs` against the
  live PostgreSQL surfaces in a read-only transaction.
- [x] Current result is `CLASSIFIER_LINEAGE_BLOCKED`: `classifier_rows=3,352`,
  `source_ref_present=3,351`, `source_revision_available=148`,
  `workspace_revision_available=3,352`, `source_namespace_available=0`,
  `revision_qualified_join=148`, and `missing_graphify_join=3,204`.
- [ ] Do not promote classifier/domain labels or wire them as canonical ontology
  identity. Resolve the Graphify source namespace and current source/revision
  join first; `workspace_revision` availability alone is not sufficient.

Evidence: `docs/reports/domain-classifier-lineage-v1.json`.

## Classifier contract recheck (2026-09-11)

- [x] Re-ran the focused classifier contract suite without retraining,
  checkpoint replacement, or runtime promotion.
- [x] `domain-classification-adapter-v1.spec.ts`, `domain-taxonomy.spec.ts`,
  and `classifier-feature-manifest.spec.ts` passed: `10/10` tests.
- [ ] Keep classifier probabilities as routing/ranking features only; do not
  promote them to canonical ontology identity or an additional retrieval vote.
- [ ] Current-source admission remains blocked by
  `CLASSIFIER_LINEAGE_BLOCKED`; the latest lineage receipt still reports only
  `148` revision-qualified joins and `3,204` missing Graphify joins.

Evidence: focused Vitest output and `docs/reports/domain-classifier-lineage-v1.json`.

## Admitted snapshot gate recheck (2026-09-19)

- [x] Read-only source snapshot adapter proves the selected admitted registry
      matches `24,456/24,456` usable snapshot entries.
- [ ] Keep classifier training/export closed while the current worktree is
      not byte-identical to that admitted snapshot (`492` content mismatches,
      `8` missing files).

Evidence: `.tmp/knowledge-source-snapshot-live-v1.json`,
`docs/reports/domain-classifier-training-readiness-v1.json`.

## Current-cohort checkpoint admission recheck (2026-09-16)

- [x] Added the read-only `scripts/atlas/plan-domain-classifier-cohort-admission-v1.mjs`
  planner. It resolves each weak-label row through the selected Graphify execution and
  `atlas_packets`, checks workspace/source/content identity, and emits a deterministic
  `trainingManifestChecksum` without retraining or persistence.
- [x] Ran the planner against execution
  `74d50c86-8194-45ea-8c3d-61aab737ef83`, workspace revision
  `sha256:e24bb97187ea6394eeba457dd849915f570045b7a1867780fdc7aa9ea62b9acc`, and all 35
  bundle rows. Result: `13 PACKET_MISSING`, `8 PACKET_UNQUALIFIED`,
  `13 PACKET_DUPLICATE_UNQUALIFIED` (legacy `ace:packet` and `packet:` namespaces, all
  lineage fields null), `1 CONTENT_DIGEST_MISMATCH`, `CURRENT_ADMITTED=0`,
  `promotionEligible=false`,
  `writesPerformed=false`.
- [ ] Classifier checkpoint training/evaluation is still not admitted. The existing checkpoint
  remains historical until its training rows resolve to a current packet cohort and a held-out
  evaluation receipt is produced with the same manifest/checkpoint lineage.

Evidence: `docs/reports/domain-classifier-cohort-admission-v1.json`.

## ACE/domain-taxonomy real-corpus parity recheck (2026-09-18)

- [x] Added the read-only bounded parity harness
  `scripts/atlas/prove-domain-classifier-parity-v1.mts` comparing the ACE
  classifier in `sveltekit-frontend/src/lib/server/ace/features/domain-classifier.ts`
  with the existing `sveltekit-frontend/src/lib/server/atlas/domain-taxonomy.ts`.
- [x] The checked-in real-corpus fixture preserves `sourceRef`,
  `sourceRevision`, and `contentDigest` for every comparison row. The latest
  receipt reports `0` exact matches, `6` disagreements, and `6` missing-label
  observations; disagreement and missing-label entries now also retain the
  source revision, content digest, and both classifier confidences for review.
  This is `PARITY_REVIEW_REQUIRED`, not a taxonomy promotion.
- [x] Added an explicit training-readiness contract. The latest result is
  `DOMAIN_CLASSIFIER_TRAINING_READY_FALSE` because no operator-approved
  minimum corpus/class-coverage rule has been supplied. The current small
  fixture must not establish that threshold.
- [x] Keep the ACE caller unchanged until disagreements are reviewed. Do not
  replace the existing checkpoint, promote labels, or write a training set.

  Evidence: `docs/reports/domain-classifier-parity-review-v1.json`; all six
  disagreements were reviewed, retained as non-promotional, and no caller,
  checkpoint, or training dataset was changed.

Evidence: `docs/reports/domain-classifier-parity-v1.json`,
`sveltekit-frontend/src/lib/server/ace/features/domain-classifier-parity-v1.ts`.

- [x] Hardened the admission planner so it no longer derives an expected `packet_key` from
  `source_ref`. Packet identity must come from the canonical PostgreSQL packet row; UUIDv5
  namespace keys remain a separate projection/index concern and cannot participate in
  classifier admission.

- [x] Added `scripts/atlas/report-domain-packet-namespace-reconciliation-v1.mjs` and ran it
  against the admission receipt. It groups packet rows by the derived UUIDv5 index and reports
  `13 PACKET_MISSING`, `9 SINGLE_UNQUALIFIED_CANDIDATE`, and
  `13 DUPLICATE_NAMESPACES_UNQUALIFIED`; `promotionEligibleGroups=0` and
  `writesPerformed=false`. No namespace was selected or overwritten.

Evidence: `docs/reports/domain-packet-namespace-reconciliation-v1.json`.

Follow-up proof for the classifier gate: the current packet digest producer
was rerun against the selected execution and workspace revision at the bounded
500-row boundary. It classified `241 READY_INSERT`, `235
LEGACY_LINEAGE_FIELDS_MISSING`, `22 LEGACY_CONTENT_HASH_UNQUALIFIED`, and `2
SOURCE_CONTENT_DIGEST_MISMATCH`. The rollback-only transactional canary
inserted 241 and updated 235 rows, read back the exact expected values, passed,
and rolled back with `writesPerformed=false`. This proves the packet upsert
mechanics, not durable current-corpus promotion; the 22 historical hash-only
rows and 2 byte mismatches remain quarantined. A true revision-qualified
identity collision remains a separate fail-closed status.

Evidence: `docs/reports/current-packet-digest-producer-v1.json`.

Follow-up hardening (2026-09-16): the producer no longer derives a packet key
from `source_ref`. It now resolves packet identity only from the canonical
`atlas_packets` row, classifies missing rows as `MISSING_PACKET` and multiple
source matches as `PACKET_IDENTITY_AMBIGUOUS`, and leaves both out of the apply
set. A bounded read-only rerun reported `17 MISSING_PACKET` and
`8 LEGACY_LINEAGE_FIELDS_MISSING`, with `inserted=0`, `updated=0`, and
`writesPerformed=false`.

## N-ary evidence lineage hardening (2026-09-16)

- [x] Reused the existing `event-hypergraph-contract.ts` owner for ontology
  tuples; no second HyperGraphRAG edge/fusion owner was introduced.
- [x] Removed the NLP compiler's unsafe request-id → `packetKey` and
  `sourceRevision` → `workspaceRevision` fallbacks. Missing canonical lineage
  now fails with `HYPERGRAPH_LINEAGE_UNAVAILABLE` instead of inventing packet
  identity or a workspace revision.
- [x] Added route-level lineage fields and a typed non-promotional `409`
  response when the NLP request cannot produce a revision-qualified bundle.
- [x] Focused compiler/analysis tests pass `8/8`; this proves fail-closed
  composition only. It does not prove live packet admission, HyperRAG API
  promotion, classifier checkpoint admission, or graph-derived promotion.
- [ ] Keep n-ary tuple output blocked from canonical promotion until the
  selected Graphify execution, source→packet→chunk closure, and semantic
  cohort are read back for the same workspace revision.

- [x] Added `admitOntologyEventTuplesV1` as the derived-evidence admission
  boundary. It requires an existing packet-bearing event and an exact match
  to the supplied packet/source/workspace/source/representation revision
  cohort; missing events, duplicate tuples, and revision/identity mismatches
  are typed rejections.
- [x] Tuple admission is explicitly non-promotional: it creates no packet,
  pairwise edge, retrieval hit, or RRF vote (`voteCount=0`), and reports
  `canonicalAuthority=false` / `writesPerformed=false`.

Evidence: `sveltekit-frontend/src/lib/server/analysis/nlp-feature-compiler.ts`,
`sveltekit-frontend/src/routes/api/nlp/analyze/+server.ts`,
`sveltekit-frontend/src/routes/api/codebase-index/analyze/+server.ts`, and the
focused Vitest output (`8/8`). Detailed receipt:
`docs/reports/nary-hypergraph-lineage-hardening-v1.json`.

### HyperRAG canonical identity boundary (2026-09-16)

- [x] HyperRAG normalization now requires canonical `packet_key` and
  `source_ref`; Qdrant point IDs, transport IDs, file paths, array positions,
  and source-path-as-packet fallbacks are rejected.
- [x] Focused identity and regression tests pass `11/11` across the HyperRAG
  identity boundary and n-ary compiler contracts.
- [ ] Revision-qualified HyperRAG cache admission and live MCP/API readback
  remain open. The public route's query-only exact-match cache is now
  quarantined; it must not be treated as current ACE/BitFrost admission until
  the existing ContextManifest identity envelope is supplied and read back.

### Snapshot quiescence hardening (2026-09-16)

- [x] Added bounded read-only quiescence retries to the maintained workspace
  snapshot capture owner. A transient scan difference is retried against a
  fresh observation; observations are never merged and no authority is
  inferred.
- [x] Exhausted retries preserve `CAPTURE_BLOCKED` with
  `WORKSPACE_CHANGED_BETWEEN_SCANS`; the helper cannot convert a changing
  worktree into a stable workspace revision.
- [x] Snapshot capture fixture passes with stable replay and deliberate nested
  repository drift detection. Daily Graphify remains independently gated by
  the admitted snapshot and selected execution owner.
- [x] Live read-only capture completed after the quiescence hardening: one
  stable attempt, 25,668 sources across 7 repositories, zero violations, and
  snapshot revision `sha256:f22cc64278dbd5ccc197c62c2ee5b2ac3345dbdcf24d7eb4ac5c367b0b62ccf9`.
  This is a stable capture/readback artifact only; it is not an admitted
  workspace revision and does not authorize Graphify, packet, cache, or
  projection writes.

Evidence: `sveltekit-frontend/src/lib/server/retrieval/hyperrag-packet-rpc.ts`,
`sveltekit-frontend/src/lib/server/retrieval/hyperrag-packet-rpc.identity.spec.ts`,
and `docs/reports/hyperrag-canonical-identity-boundary-v1.json`.

- [x] Verified the frozen UUIDv5 index contract against PostgreSQL with
  `scripts/atlas/prove-uuidv5-parity-v1.mts`: exact match `100/100`, UUID version `5/100`,
  deterministic replay `20/20`, collision count `0`, and `writesPerformed=false`.
  This proves the index algorithm is interoperable with PostgreSQL; it does not promote any
  packet namespace or classifier row.

Evidence: `docs/reports/uuidv5-parity-v1.json`.

### Unified context pipeline adapter (derived, non-authoritative)

### Incremental workspace event head (derived contract; durable storage not yet authorized)

- [x] Added `WorkspaceEventV1`, `WorkspaceHeadV1`, and derived
  `WorkspaceInvalidationV1` contracts. A full `WorkspaceSnapshotV1` remains a
  checkpoint/compaction artifact; ordinary source changes advance an ordered
  event head instead of requiring another whole-repository seal.
- [x] Added pure optimistic append/reducer checks for workspace identity, base
  snapshot, sequence, previous head, event checksum, and derived head revision.
  Invalidations are emitted only for explicit canonical participants and remain
  non-authoritative with `writesPerformed=false`.
- [x] Focused event-sourcing tests pass 3/3. Durable Postgres event/head tables,
  event admission, and production invalidation workers remain intentionally open
  until the existing migration and canonical writer owners are audited.

- [x] Added `GraphifyDeltaBatchV1` source classification for ADDED, CHANGED,
  UNCHANGED, and DELETED files, plus stale-result rejection/requeue when a
  source changes during a batch. Added deterministic event replay against the
  lightweight workspace head; focused workspace event/delta tests pass 7/7.
  Daily Graphify wiring, CAS binding application, durable event storage, and
  snapshot compaction remain open and are not claimed by this contract proof.
- [ ] `GDA-COMPACT-10` remains gated for durable implementation. Added the
  read-only `assessWorkspaceCompactionV1` evaluator plus the high-water-mark
  `planWorkspaceHeadCompactionV1` planner. The planner captures an event cut,
  validates sequence/predecessor continuity, derives a deterministic candidate
  revision, and ignores later events without reading the worktree. Focused
  compaction tests now pass 5/5, including replay from a previously compacted
  nonzero sequence; durable snapshot construction, base-pointer
  advancement, and readback still require explicit authorization.
- [x] Added the read-only `atlas:workspace:head:compaction:plan` database
  planner. It reads only the event/head sidecar, plans through a selected
  high-water mark, reports sequence/predecessor validation and a deterministic
  candidate checksum, and returns `BLOCKED_SIDECAR_NOT_APPLIED` when the
  durable tables are absent. It never scans the worktree or performs writes;
  current live proof is therefore explicit sidecar absence, not compaction
  completion.
- [x] Ran the read-only delta planner against the prior `ea92e7...` and current
  `f22cc6...` checkpoint artifacts: 24,714 unchanged, 651 changed, 303 added,
  and 0 deleted sources. This proves bounded delta planning can continue while
  the worktree changes; it does not admit bindings, select a Graphify owner, or
  perform projections.
- [x] Added the pure `WorkspaceBindingCasPlanV1` gate. It plans source upsert,
  tombstone, noop, superseded, and stale-head-conflict outcomes without
  modifying `atlas_workspace_source_bindings`; focused CAS tests cover the
  optimistic precondition and deletion behavior.
- [x] Added head-scoped Graphify owner resolution. Historical executions without
  an admitted `workspaceHeadRevision` remain unresolved; equivalent terminal
  executions at one explicit head may supply a read-only evidence owner, while
  mutation authority remains null. Focused resolution tests cover unresolved,
  equivalent, and conflicting head candidates.
- [x] Added a deterministic batch CAS planner for source bindings and ran it
  only against checkpoint artifacts. Duplicate source refs fail closed; ready,
  noop, tombstone, and stale-head-conflict outcomes remain non-mutating until
  the durable projector is explicitly authorized.
- [x] Added the dependency-cone invalidation projector. It invalidates only
  packet/chunk/feature/representation/graph/cache descendants whose recorded
  source dependency is stale; matching revisions and unrelated sources remain
  untouched. Focused selective-invalidation tests pass.
- [x] Added the bounded packet/chunk repair planner. It requires exact source,
  workspace, packet digest, and chunk-lineage evidence; missing, ambiguous,
  stale, or mismatched rows become typed blockers rather than synthetic repair
  targets. The planner performs no packet/chunk writes.
  The preflight now accepts the explicitly selected compatibility `--run-id`
  for read-only join-funnel diagnostics without treating that run as canonical.
  Current live result remains `BLOCKED_EXECUTION_RUN_BRIDGE`: the selected run
  has zero matching `graphify_files` rows, although `23,743` source refs have
  legacy evidence under six other run IDs. This is recorded as
  `RUN_FILE_EVIDENCE_UNDER_OTHER_RUN`; it does not authorize cross-run joining
  or make downstream packet/chunk counts promotion evidence. The bounded 52-
  source diagnostic currently classifies `38 PACKET_MISSING`, `14
  PACKET_REVISION_MISMATCH`, and `52 CHUNK_MISSING`.
  A separate direct execution-membership audit over 128 rows confirms the
  current source bindings themselves are internally aligned (`128/128` source,
  revision, content, and workspace matches), but only `4/128` sources have
  proven packet/chunk lineage and `0/128` have packet content matches. This is
  partial diagnostic evidence only; it does not authorize promotion or a
  cross-run repair. The corrected hash-grain audit now compares the source
  digest to `codebase_chunk_index.file_content_hash` (not chunk-scoped
  `content_hash`); the latest bounded 20-row run finds `1/20` exact
  file-content matches and `0/20` packet-content matches. The same run finds
  `5/20` source-level packet rows, `0/20` packet revision matches, and
  `0/20` full packet identities.
  The promotion preflight carries the same hash-grain rule into its candidate
  decision: a source whole-file digest is compared only with
  `codebase_chunk_index.file_content_hash`; chunk-scoped `content_hash` is not
  used for source identity. A bounded 52-row rerun reports
  `chunk_file_content_matches=0` and `firstFailingBoundary=RUN_FILE_MISSING`
  because the requested compatibility run has no `graphify_files` rows. This
  remains read-only diagnostic evidence and does not permit cross-run joining.
  The planner now separates missing run evidence from missing run registration.
  Read-only comparison found legacy run `48485685-e773-4433-a1f8-00f5524cca44`
  has `23,758` file rows and `23,743` source-reference matches, including
  `23,169` exact source-revision/content-digest matches, but has no qualifying
  `graphify_runs` registry row for the admitted workspace revision (its
  registered revision is different). Its typed result is therefore
  `RUN_REGISTRY_MISSING`, not an implicit canonical-run substitution.

Evidence: `sveltekit-frontend/src/lib/server/atlas/workspace/workspace-event-sourcing-v1.ts`,
`sveltekit-frontend/src/lib/server/atlas/workspace/workspace-event-sourcing-v1.spec.ts`,
and `docs/reports/workspace-event-sourcing-v1.json`.

- [x] Added `UnifiedContextPipelineDescriptorV1` as a pure composition contract
  over the existing classifier, chunk-stream, ContextManifest/ACE, Graphify
  ordinal, simdjson, NetworkX, TurboVec, PostgreSQL/pgvector, Qdrant, and
  PyTorch-SIMT boundaries. It does not create a second cache, graph, fusion,
  or identity owner.
- [x] The descriptor fails closed when current lineage is incomplete, keeps
  classifier output non-canonical, separates JSON control transport from typed
  numeric graph payloads, and derives a deterministic cache key without raw
  prompt text, hidden state, KV cache, tensors, or GPU pointers.
- [x] Added a pure adapter from the existing `DomainPrediction` evidence shape
  to classifier revision, checkpoint checksum, feature revision, and
  non-canonical pipeline evidence. It does not alter packet identity or
  authorize promotion.
- [x] Focused adapter tests pass 5/5, including ACE/BitFrost identity bridge
  rejection for incomplete lineage. This is contract/wiring proof only; it
  does not promote the blocked current packet cohort or claim live classifier,
  GPU, Qdrant, or FastAPI execution.

Evidence: `sveltekit-frontend/src/lib/server/atlas/pipeline/unified-context-pipeline-v1.ts`,
`sveltekit-frontend/src/lib/server/atlas/pipeline/unified-context-pipeline-v1.spec.ts`.

### Stages 3-9 orchestration scaffolding (non-authoritative)

- [x] Added `atlas-pipeline-stage-contracts-v1.ts` and focused tests for the
  CandidateOrdinal admission boundary, GraphSnapshot/GraphOrdinal manifests,
  structural feature vectors, semantic-derived latent plans, nullable feature
  matrix metadata, and ACE/BitFrost residency decisions.
- [x] Reused the existing CandidateOrdinalMap, semantic representation, and
  ACE/BitFrost identity owners; no second identity, cache, graph, or fusion owner
  was introduced.
- [x] Missing current source/chunk authority returns an explicit
  `BLOCKED_LINEAGE` result. No synthetic revisions, vectors, candidates, cache
  entries, or receipts are produced.
- [x] Stage contract tests pass 10/10; orchestration contract tests pass 7/7
  (17/17 total), including duplicate LUT fail-closed behavior, blocked QLoRA
  state, topology/transport validation, NES/CHROM97 canary write prohibition,
  lineage-required packet admission/summary envelopes, deterministic summary
  checksums, and duplicate-free canary preflight.
- [x] Packet summaries now use the existing canonical SHA-256 encoding utility;
  `buildPacketSummaryV1()` and `parsePacketSummaryV1()` prove deterministic
  checksum/readback parity and reject tampered summary content in memory.
  This is fixture proof only; PostgreSQL admission and projection fanout remain
  blocked and no stores are written.

- [x] Added fail-closed Stage 10–13 seams for domain/LUT evidence, offline
  QLoRA snapshot identity, 4D topology coordinates, subordinate Arrow/JSONL/
  MsgPack transport artifacts, and the NES/CHROM97 packet-fabric canary.
  These contracts do not train, fan out, warm caches, write projections, or
  promote model output.
- [x] Added the streaming `plan-neschrom97-packet-fabric-admission-v1.mjs`
  ingress planner. The bounded 45-record corpus is valid and duplicate-free,
  but all 45 records lack canonical workspace/source/content lineage, so the
  planner emits `PACKET_FABRIC_ADMISSION_BLOCKED` with input checksum
  `sha256:8819087b6b0e0554e243bce280dbdc7dee0c646d6a59e63418d68493c08edaf0`.
  It performs no identity synthesis or datastore/projection writes.
- [x] Added optional `--resolve-source-evidence` mode to the same planner. It
  hashes readable referenced source bytes as unadmitted evidence only: the
  latest bounded run resolved 43 records fully and 2 partially. These hashes
  are never promoted to workspace/source revisions or packet identity.
- [x] Wired the stage-contract registry into `AtlasExecutionPipelineV1`; every
  binding remains explicitly non-promotion-eligible and participates in the
  deterministic pipeline checksum.
- [x] Added exact-one contract-binding validation for each runtime stage;
  missing, duplicate, and unknown bindings fail closed.
- [x] Reused the existing semantic representation and structural graph snapshot
  owners through adapters; blocked semantic construction throws without creating
  synthetic revisions or checksums.

**Status:** `CODE_SCAFFOLD_COMPLETE`, `LIVE_PROMOTION_BLOCKED`.

Evidence: `sveltekit-frontend/src/lib/server/atlas/orchestration/atlas-pipeline-stage-contracts-v1.ts`,
`docs/reports/atlas-execution-pipeline-v1.json`.

- [x] Added the read-only `atlas:pipeline:promotion:plan` gate aggregator. It
  combines snapshot, Graphify owner, packet/chunk, durable event, classifier,
  and ACE evidence without treating missing reports as success. It always
  emits `writesPerformed=false`, keeps projections non-canonical, and reports
  the first remaining gate; it does not authorize migration, packet repair,
  or projection writes. The command is now exposed as
  `npm run atlas:pipeline:promotion:plan` and live execution reports
  `BLOCKED_DUPLICATE_OWNER` as the first gate.
  cache warming, vector projection, or model promotion.

Evidence: `scripts/atlas/plan-atlas-pipeline-promotion-v1.mjs`,
`docs/reports/atlas-pipeline-promotion-v1.json`.

- [x] Added the `WorkspaceEventHeadStoreV1` adapter seam with caller-owned
  event identity, optimistic head sequencing, idempotent same-checksum retry,
  collision rejection, and exact event/head readback validation. The adapter
  is fixture-proven only; the planned PostgreSQL sidecar remains unapplied and
  no durable event/head write is claimed.

Evidence: `sveltekit-frontend/src/lib/server/atlas/workspace/workspace-event-head-durable-adapter-v1.ts`.

Remaining blockers are unchanged: current Graphify execution/source→packet→chunk
authority, semantic cohort admission, live durable event readback, and GPU parity.

Latest read-only reconciliation against execution
`74d50c86-8194-45ea-8c3d-61aab737ef83` confirms the lineage blocker: 24,456
source bindings, 0 exact packet digest matches, 7,902 missing packet rows, 20
digest mismatches, and 627 lineage-linked sources. `writesPerformed=false`.

The bounded packet-digest producer ladder also completed read-only at limits
1/5/52/500. The 500-row result was 241 `READY_INSERT`, 235
`LEGACY_LINEAGE_FIELDS_MISSING`, 22 `LEGACY_CONTENT_HASH_UNQUALIFIED`, and 2
`SOURCE_CONTENT_DIGEST_MISMATCH`; no insert, update, or readback mutation was
performed.

A fresh two-pass snapshot also completed read-only with 25,667 sources across
7 repositories and zero capture violations. It produced candidate revision
`sha256:aff603af68664e1b42b57fec4efaad26bad4182e1d1267e48d9edfb8d5d00922`.
The authority preflight is `CANDIDATE_READY_FOR_EXPLICIT_TOURNAMENT_ADMISSION`;
authority remains false and no downstream execution was relabeled.

The read-only Graphify owner-resolution planner was rerun after this receipt and
now proves `DUPLICATE_EQUIVALENT_EXECUTIONS`: two terminal executions have one
distinct evidence signature, with execution
`74d50c86-8194-45ea-8c3d-61aab737ef83` already read back as
`canonical_authority=true` and execution
`0dba1c0d-2cf7-4f35-a61b-c77956f60d3d` classified as the equivalent duplicate.
This is classification evidence only (`safeToApply=false`,
`writesPerformed=false`); it does not repair packet digests or authorize any
downstream promotion.

Follow-up bridge hardening (2026-09-16): the execution→run bridge planner now
also verifies parser/extraction contract parity, completed `SOURCE_SELECTION`,
manifest digest equality with the stage output checksum, and exact equality
between the run manifest count and V2 execution membership count (25,542).
The guarded apply requires a frozen planner checksum and uses the V1
authorization flag; a rollback-canary path is available but was not invoked.
The packet/chunk preflight now emits a read-only join funnel. Current live
evidence is `execution_membership_rows=25,542`,
`legacy_run_source_rows=0`, `source_ref_matches=0`,
`source_revision_matches=0`, `content_digest_matches=0`,
`packet_source_matches=17,398`, `packet_revision_matches=0`,
`packet_digest_matches=0`, `chunk_source_matches=20,132`, and
`chunk_revision_matches=0`, with verdict
`BLOCKED_EXECUTION_RUN_BRIDGE`. No database or projection writes occurred.

The next bounded packet-digest plan was also rerun against that canonical
execution at the 128-row boundary. It produced `113 READY_INSERT`, `14
LEGACY_LINEAGE_FIELDS_MISSING`, and `1 SOURCE_CONTENT_DIGEST_MISMATCH`; the
mutation plan was not attempted and `writesPerformed=false`. This narrows the
next canary input but does not make packet admission current-authoritative.
Evidence: `docs/reports/current-packet-digest-producer-v1.json`.

The producer was then hardened to batch-resolve canonical packet rows from
PostgreSQL instead of issuing one lookup per source. The corrected 500-row
read-only run classified `221 MISSING_PACKET`, `255
LEGACY_LINEAGE_FIELDS_MISSING`, `22 LEGACY_CONTENT_HASH_UNQUALIFIED`, and `2
SOURCE_CONTENT_DIGEST_MISMATCH`; it produced no synthetic packet keys and no
inserts, updates, or readback writes (`writesPerformed=false`).

The planned durable event/head seam now also has a concrete Postgres adapter:
`sveltekit-frontend/src/lib/server/atlas/workspace/workspace-event-head-postgres-adapter-v1.ts`.
It uses the existing `pg` pool, locks the current head inside the transaction,
round-trips event participants, preserves caller-owned event identity, and
validates the event/head readback. This is implementation evidence only: the
sidecar is still unapplied, the adapter has no active production caller, and
the live durable readback gate remains open (`writesPerformed=false`).

The read-only schema audit now separates implementation from live authority:
`adapterImplemented=true`, `storageReady=false`, and `liveReadbackProven=false`.
The current migration checksum is recorded by the audit and changes whenever
the reviewed sidecar changes. The Drizzle mirror and sidecar now have a focused
parity check for both foreign keys and delete semantics. A guarded transactional
runner, `scripts/atlas/apply-workspace-event-head-sidecar-v1.mjs`, is available
through `npm run atlas:workspace:event-head:sidecar:preflight`; its dry-run
returned `READY_FOR_AUTHORIZATION` with `writesPerformed=false`. This keeps an
explicit migration-owner authorization and a live readback canary as separate
open gates, so an artifact-only implementation pass is not reported as durable
authority.

### Live Drizzle/PostgreSQL mirror audit (2026-09-17)

- [x] Re-ran the root `audit:drizzle` mirror audit against the reachable
  PostgreSQL instance. The report checked 11 tables; 6 static contracts are
  aligned, 3 live tables are aligned, and 4 expected live tables are absent.
  The audit completed with `liveUnavailable=0` and `writesPerformed=false`.
- [x] Corrected the SQL parser to exclude table-level `CONSTRAINT` and
  `ON DELETE/UPDATE` clauses from column discovery. The workspace event/head
  sidecar now reports static SQL/Drizzle alignment rather than false column
  drift; this changed the static-aligned count from 4 to 6 without changing
  the live database.
- [x] Corrected quoted SQL column extraction. The `feature_registry` result
  now exposes its real historical column mismatch instead of silently treating
  the manual contract as empty; it remains a review item, not an automatic
  migration recommendation.
- [ ] Schema/index promotion remains blocked. The current report identifies
  static index drift for `kanban_tasks` and `nes_chrom_packets`; static column
  drift for `feature_registry`, `atlas_workspace_event_participants`,
  `atlas_workspace_heads`, `task_semantic_packets`, and `atlas_packets`; and
  live column drift for `task_semantic_packets`, `atlas_packets`,
  `parent_atlas_documents`, and `route_runtime_packets`.
- [ ] The event/head sidecar is not live: `atlas_workspace_events`,
  `atlas_workspace_event_participants`, and `atlas_workspace_heads` are all
  absent from the live database. The read-only sidecar audit therefore remains
  `NOT_APPLIED_PLANNED_SIDECAR`, and compaction remains
  `BLOCKED_SIDECAR_NOT_APPLIED`.
- [ ] Do not run DDL or alter existing rows from this audit. Each mismatch
  requires an owner-level migration disposition, exact Drizzle/manual SQL
  reconciliation, and post-apply readback before its gate can be promoted.

Evidence: `docs/reports/postgres-contract-mirrors-report.json`,
`docs/reports/postgres-contract-mirrors-report.md`,
`docs/reports/workspace-event-head-schema-audit-v1.json`, and
`docs/reports/workspace-head-compaction-plan-v1.json`.

### Historical schema snapshot scope (2026-09-17)

- [x] Ran the SvelteKit `schema:drift:check` read-only comparison. It reports
  `SCHEMA_DRIFT_DETECTED` with 157 blocks, 241 warnings, and 175 notes while
  comparing a 369-table historical snapshot with 552 live tables.
- [ ] This broad result is inventory evidence, not migration authorization.
  Many findings are missing historical tables or extra manual/sidecar tables;
  they must be classified by owner before any DDL is proposed. The targeted
  `audit:drizzle` mirror report remains the authority for the 11 scoped Parent
  Atlas contracts.
- [ ] Do not resolve the broad 157-block result by running a global migration,
  `drizzle-kit push`, or creating duplicate tables. Reconcile only an explicitly
  authorized owner-scoped contract and require post-apply readback.
- [x] Extended `scripts/atlas/apply-workspace-event-head-sidecar-v1.mjs` with
  an explicit `--rollback-canary` path. When separately authorized, it applies
  the reviewed SQL inside one transaction, verifies tables/constraints/triggers,
  records the readback, and rolls back; ordinary dry-run remains the default.
  No canary was invoked in this pass.

Evidence: `docs/reports/schema/expected-vs-live.diff.json` and
`docs/reports/postgres-contract-mirrors-report.json`.

### Migration-owner classification (2026-09-17)

- [x] Ran the read-only `audit-atlas-migration-owners.mjs` against the
  reachable PostgreSQL instance. It reports four live shape-aligned owners:
  `graphify_source_inventory`, `callable_search_projection`,
  `observation_feature_rows_active`, and `symbol_registry`.
- [x] Classified `observation_feature_rows_superseded_candidate` as
  `superseded_unapplied`; it is not an additional promotion owner.
- [ ] `feature_registry` remains `MISSING_MANIFEST_REGISTRATION`: its live
  table is absent and the proposal is not registered in the sidecar manifest.
  This is an owner-review item, not permission to create a table.
- [ ] `graphify_file_search_projection` remains `SIDECAR_UNAPPLIED`: its
  planned sidecar is not live. It must not be treated as an available index
  or used to authorize packet/search promotion.
- [x] Confirmed the audit is live and read-only: `writes=false`, no DDL, no
  row updates, and no projection/cache writes.

Evidence: `docs/reports/atlas-migration-owner-audit-v1.json`.

### Current owner/lineage recheck (2026-09-17)

- [x] Re-ran the owner-resolution planner for the admitted execution cohort.
  It still reports `DUPLICATE_EQUIVALENT_EXECUTIONS` with two candidates and
  one evidence signature; the preferred execution remains
  `74d50c86-8194-45ea-8c3d-61aab737ef83`. `safeToApply=false` and
  `writesPerformed=false` remain explicit.
- [x] Re-ran the execution→run bridge planner. It remains
  `READY_FOR_EXPLICIT_BINDING` with one candidate compatibility run and
  `25,542` execution-membership rows; no binding was applied.
- [x] Re-ran the packet/chunk promotion preflight with the explicit selected
  execution. It remains `BLOCKED_EXECUTION_RUN_BRIDGE` with zero eligible
  candidates, so no packet/chunk promotion was attempted.
- [x] Re-ran the compaction planner. It remains
  `BLOCKED_SIDECAR_NOT_APPLIED`; no worktree scan or snapshot write occurred.

Evidence: `docs/reports/current-graphify-execution-owner-resolution-v1.json`,
`docs/reports/graphify-execution-run-bridge-v1.json`,
`docs/reports/packet-chunk-lineage-promotion-preflight-v1.json`, and
`docs/reports/workspace-head-compaction-plan-v1.json`.

### Stage 13 workflow receipt boundary (2026-09-17)

- [x] Removed the fabricated initial FSM observation from
  `atlas-mastra-workflow.ts`. Until the real prior tool receipt is carried
  into the FSM, the workflow now emits `PRIOR_TOOL_RECEIPT_REQUIRED` with
  `lastToolSucceeded=false`, zero evidence, and `validationStatus=FAIL`.
  It cannot advance on an unobserved tool call.
- [x] Focused workflow tests pass 5/5 and OpenSpec strict validation passes.
- [ ] Live Mastra/Go retrieval and independent validation receipt remain
  unproven; the compatibility shim and missing receipt are still explicit
  Stage 13 blockers.

Evidence: `sveltekit-frontend/src/lib/server/atlas/atlas-mastra-workflow.ts`
and `sveltekit-frontend/src/lib/server/atlas/atlas-mastra-workflow.spec.ts`.

- [x] Hardened the retrieval adapter’s FSM guard as well: it no longer marks
  an unobserved discovery call as successful. The adapter now preserves the
  explicit `PRIOR_TOOL_RECEIPT_REQUIRED` failure while discovery evidence is
  unavailable; focused adapter/semantic/workflow tests pass 13/13.

Evidence: `sveltekit-frontend/src/lib/server/atlas/atlas-mastra-adapter.ts`.

- [x] Replaced the retrieval adapter's remaining successful placeholder
  observation with the same fail-closed `PRIOR_TOOL_RECEIPT_REQUIRED`
  boundary. The adapter cannot pass the FSM gate using zero evidence.
  Adapter, semantic-tool, and workflow tests pass 13/13.

- [x] Removed wall-clock timestamp fallbacks from the shared runtime context.
  Omitted workspace/packet revisions now remain explicitly unqualified, and
  `isAtlasRuntimeRevisionQualified()` exposes the admission check. Focused
  runtime/workflow/adapter tests pass 15/15.
- [ ] Legacy callers that omit revisions remain diagnostic-only until they
  provide caller-owned workspace and packet lineage.

- [x] Runtime receipts are now validated with
  `RuntimeToolReceiptV1Schema`, exported through `atlas-index.ts`, and
  malformed receipt payloads are rejected before FSM projection. The workflow
  accepts an optional caller-owned prior receipt and preserves workspace and
  packet revisions in its request context; 18 focused tests pass.
- [ ] The live Mastra/Go boundary still does not produce and thread a durable
  receipt, so Stage 13 remains `LIVE_PROMOTION_BLOCKED`.

- [x] Added `RuntimeToolReceiptV1` and the pure
  `observationFromRuntimeToolReceiptV1()` adapter in
  `atlas-runtime-context.ts`. A real receipt projects tool outcome, evidence,
  validation, and failure facts into the FSM; a missing receipt remains
  `PRIOR_TOOL_RECEIPT_REQUIRED` with `FAIL`, zero evidence, and no success.
- [x] Changed semantic-tool observation defaults to fail closed when no prior
  receipt is supplied. Added focused receipt projection tests; 12/12 related
  workflow/runtime tests pass.
- [ ] Live receipt propagation from the Mastra/Go execution boundary remains
  open. The new type is a projection contract and does not claim live durable
  retrieval or validation readback.

Evidence: `sveltekit-frontend/src/lib/server/atlas/atlas-runtime-context.ts`,
`sveltekit-frontend/src/lib/server/atlas/atlas-runtime-receipt.spec.ts`, and
`sveltekit-frontend/src/lib/server/atlas/atlas-semantic-tools.ts`.

## Latest reconciliation (2026-09-17)

- [x] Stage 13 request-context revisions are now split explicitly: the
  caller-owned `workspaceRevision` and `packetRevision` are required by
  `createAtlasRequestContext()` and are passed unchanged into the runtime.
  Blank values fail closed with `ADMITTED_WORKSPACE_REVISION_REQUIRED` or
  `PACKET_REVISION_REQUIRED`; focused request-context, receipt, and workflow
  tests pass `15/15`.
- [x] Runtime tool receipts now preserve the full run/workspace/packet identity
  and reject mismatches with `ATLAS_TOOL_RECEIPT_IDENTITY_MISMATCH`. MUTATE
  additionally requires a successful `atlas.validate_change` receipt with
  `validationStatus=PASS` and caller-owned runtime mutation authority.
- [ ] Live receipt propagation remains open: `proto/active/retrieval.proto`
  currently exposes retrieval identity on chunks but no Stage 13 tool receipt,
  and no live Mastra/Go receipt producer was added. Promotion and durable
  writes remain blocked.
- [ ] Future receipt integration requires an additive protocol contract first:
  `CodebaseSearchRequest` currently has no run/workspace/packet revision
  identity, and `CodebaseSearchResponse` has no receipt field. Do not derive a
  receipt from Qdrant chunk metadata; update the proto, generated Go/TypeScript
  bindings, request adapters, and Go producer together, then prove identity
  preservation and unavailable-service failure receipts end to end.
- [x] Audited the proposed root `ts-proto@2.12.4` dependency and removed it:
  no Parent Atlas workstation script invokes it, and it is unrelated to the
  WSL2 RAPIDS lane. `protoc` and Go remain available for generated Go bindings.
- [x] Provisioned the existing protobufjs-compatible frontend generator as
  `protobufjs-cli@1.1.3`; both `pbjs` and `pbts` execute locally. This restores
  a reproducible path for the current `retrieval_pb.js/.d.ts` format, but does
  not itself prove a new receipt contract.
- [x] Defined the v2 wire contract: add a shared,
  caller-owned request context containing `toolCallId`, `runId`, `workspaceId`,
  `workspaceRevision`, `packetKey`, and `packetRevision`; return one
  `atlas.tool-receipt.v1` with the same identity plus outcome, evidence count,
  nullable confidence/checksum/error fields, validation status, authority, and
  write facts. Unavailable paths must return explicit failed receipts and
  identity mismatches must be rejected before FSM observation.
- [x] Enhanced the draft to `AtlasRequestContextV2` and
  `AtlasToolReceiptV2`, including deterministic `receipt_id` and
  `receipt_checksum`; regenerated Go bindings and wired the real Go HTTP
  fallback to send context and map valid v2 receipts into the internal FSM
  projection. The producer remains non-canonical and write-free.
- [x] Added focused Go receipt proofs for identity preservation, replay-stable
  checksums, incomplete-identity fail-closed behavior, and explicit unavailable
  retrieval failure. The focused service test command passes.
- [x] Restored the stale Qdrant hostname test helper with numeric-host
  preservation, IPv4 preference, and lookup-failure fallback; full
  `go test ./...` now passes for the retrieval service.
- [x] Regenerated the current protobufjs TypeScript artifacts with the pinned
  frontend-only `protobufjs-cli@1.1.3`; the v2 messages and fields are present
  in `retrieval_pb.js/.d.ts`. The generated files are current to the proto
  source, while live gRPC service proof remains a separate gate.
- [x] Rebuilt and recreated only `legal-ai-go-retrieval` with `--no-deps` after
  the compose dependency name conflict. Live health is `READY_FULL`; a bounded
  search returned one chunk and an `atlas.tool-receipt.v2` preserving the full
  supplied identity with `PASS`, deterministic output/receipt checksums, and
  `writes_performed=false`. Durable persistence and promotion remain separate
  open gates.
- [x] Compared both available protobufjs CLI paths against the prior
  `retrieval_pb.js/.d.ts`: the nested `protobufjs@6.11.6` CLI emits a 738 KB
  JavaScript artifact and `protobufjs-cli@1.1.3` emits about 823 KB, versus
  the prior 429 KB artifact. Neither reproduces the old shape, so the current
  proto source was regenerated explicitly and the resulting generated files
  are tracked as an intentional compatibility update.
- [x] Verified the live WSL2 lane without mutation using
  `~/miniforge3/envs/atlas-rapids-cu13`: `torch 2.13.0+cu130`, `cudf
  26.06.01`, `cugraph 26.06.00`, `cuvs 26.06.00`, and
  `torch.cuda.is_available()=true`. The environment is pinned by
  `scripts/atlas/environments/atlas-rapids-cu13.yml`; it has no Node or
  protobuf-generator dependency coupling.
- [x] Detached the legacy root `scripts/compile-protos.mjs`/`ts-proto`
  generator from the normal frontend build. `build` now runs `vite build`
  against checked-in artifacts; protobuf regeneration is explicit through
  the frontend-only `compile:retrieval-proto` script.
- [x] Preserved the optional Firecrawl boundary during build repair: its
  loader now uses a dynamic package specifier, so the paid provider remains
  fail-closed and does not become an unconditional runtime dependency.
- [x] Corrected one stale SvelteKit build import in the semantic-contract
  approval route: Neo4j now resolves through the canonical
  `$lib/server/neo4j-driver.js` module rather than the nonexistent graph alias.
- [x] Frontend build dependency audit added only the packages required by
  existing imports: `nodemailer@10.0.10` for SMTP notifications,
  `mammoth@1.12.3` for DOCX extraction, and `@babylonjs/loaders@9.23.0` to
  match the existing Babylon core version. The build now reaches 4,663
  modules; remaining failure is the pre-existing third-party
  `svelte-tiptap` legacy `$$restProps`/`<slot>` incompatibility with Svelte 5
  runes mode and is outside this protobuf/tooling change.

- [x] The selected Graphify execution→run bridge was explicitly applied with
  frozen planner checksum and independent readback:
  `BRIDGE_APPLIED_READBACK_PROVEN`; `writesPerformed=true` for the bridge only.
- [x] Snapshot authority and source selection were revalidated for workspace
  revision `sha256:e24bb97187ea6394eeba457dd849915f570045b7a1867780fdc7aa9ea62b9acc`.
- [x] Read-only packet/chunk and source-ref audits were rerun. Packet promotion
  remains `BLOCKED_NO_QUALIFIED_CANDIDATE`; canonical packet digest matches remain
  `0`, with `7,902` missing packet rows and `20` digest mismatches in the full
  reconciliation scope.
- [x] The bounded 500-row packet-digest plan produced no inserts or updates:
  `221 MISSING_PACKET`, `255 LEGACY_LINEAGE_FIELDS_MISSING`, `22
  LEGACY_CONTENT_HASH_UNQUALIFIED`, and `2 SOURCE_CONTENT_DIGEST_MISMATCH`.
- [ ] Registry reconciliation remains read-only. The current plan has no clean
  selectable missing-row subset, and the existing apply script is hardcoded to
  an obsolete 111-row checksum; no registry insert was authorized or performed.
- [ ] Structural lineage remains blocked: the selected cohort has `0` exact
  packet matches, `0` exact chunk matches, and `0` exact structural matches;
  file-hash matches remain diagnostic only.

Evidence: `docs/reports/graphify-execution-run-bridge-apply-v1.json`,
`docs/reports/current-source-selection-input-v1.json`,
`docs/reports/packet-chunk-lineage-promotion-preflight-v1.json`,
`docs/reports/current-packet-chunk-identity-reconciliation-v1.json`,
`docs/reports/current-packet-digest-bridge-v1.json`, and
`docs/reports/selected-graphify-structural-lineage-v1.json`.

## Reference

See `proposal.md` for the full source-copy rationale, the 3 upgrades, and the namespace-separation
table. Do not re-derive what's already there.
