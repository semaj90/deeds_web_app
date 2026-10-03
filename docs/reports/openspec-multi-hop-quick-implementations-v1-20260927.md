# OpenSpec multi-hop quick-implementation queue

Snapshot date: 2026-09-27  
Full task projection: [`openspec-multihop-quick-queue-v1-20260927.json`](openspec-multihop-quick-queue-v1-20260927.json)  
Generated markdown index: [`openspec-multihop-quick-queue-v1-20260927.md`](openspec-multihop-quick-queue-v1-20260927.md)

## Portfolio census

The isolated workboard builder read the current direct OpenSpec change boards
without replacing the existing shared workboard or task files:

- 88 change boards; 9,850 checklist rows.
- 6,492 checked; 3,358 unchecked.
- 2,516 heuristic-actionable, 786 dependency-waiting, 54 historical/superseded,
  and 2 rows not assigned to those execution buckets.
- 13 boards have only 1–5 unchecked rows, but that is not evidence those rows
  are quick: several require operator decisions, live services, or writes.
- The raw `rg --files openspec -g tasks.md` census finds 94 files. The extra six
  are nested/archive/support task ledgers, not additional direct change boards
  in this projection.

Program-wave open counts:

| Wave | Open rows |
| --- | ---: |
| Unclassified | 550 |
| Acceleration | 570 |
| Adaptive DAG and ContextManifest | 57 |
| Authority and lineage | 88 |
| Candidate features and matrices | 198 |
| Canonical ingestion and index fabric | 405 |
| Identity and source qualification | 329 |
| LDR and validation | 164 |
| Learning and challengers | 229 |
| Packet and chunk lineage | 152 |
| Projections and executors | 233 |
| Retrieval lane convergence | 379 |

The previous `openspec-workboard-hierarchy-v2.json` snapshot is stale against
11 currently edited task boards. The fresh projection is advisory only: it was
built with no scheduler-selection file and an intentionally absent controller
snapshot, so execution classifications are text heuristics, not readiness or
permission. All work remains `NOT_SELECTED` until the existing explicit
scheduler-selection process says otherwise. No task was selected or marked
complete by this report.

## Current AFC authority

Use [`afc-helper-owner-verification-v2.json`](afc-helper-owner-verification-v2.json)
as the current helper-owner baseline. Do not use older manual v1/v2/v3 mapping
receipts or their `nextGate` fields as current control state. The latest helper-
owner v2 receipt closes dense
four-executor fixture parity, the graph-PPR role classification, and docs
non-fusion classification. It leaves these gates open:

1. `AFC-STRUCT-WRITE-TRACE-01`: the actual producer-to-persisted-row edge is
   still unproven; the Graphify materializer itself reports no persistence.
2. `AFC-LEXICAL-LANE-01`: reconcile `lexical_exact`, SearchRuntime `rg` and
   `lexical`, and whether PostgreSQL FTS has an adapter.
3. `AFC-PROMOTE-01`: manual contract-promotion decision after owner mappings.

The AFC ledger wording was corrected in this pass: dense four-executor fixture
coverage is closed (fixture-only; no live GPU parity), and the negative
Graphify persistence finding is separated from the still-open actual writer
lineage question.

## Ordered short-hop path

The order below is a dependency plan, not a scheduler selection.

### Hop 0 — reconcile the board (done)

Refresh the all-board projection, use the v2 AFC receipt as current authority,
and correct the stale lane/lineage descriptions without changing runtime code.

### Hop 1 — record local-artifact destination (done)

`PERSISTENCE-DECISION-01` is recorded as `FILES_ONLY_SEALED_ARTIFACT` in the
repair-candidate feature-matrix ledger. The scope is local sealed files only,
under `.tmp/atlas/semantic-representations-v1/`; this does not choose a
canonical durable store or authorize database/projection writes.

### Hop 2 — bind the exact embedded input (next; contract + fixture)

The real compiler emits a `selectionPolicyRevision` and a checksum for its
rendered text. However, `sem-input-02-mixed-canary-v1.mjs` tokenizes that full
text and then embeds only `renderedText.slice(0, 4000)` when it is longer. The
8/8 receipt therefore does not bind the exact endpoint input to the rendered
artifact checksum. Freeze a revisioned input-budget/selection policy and prove
the exact same bytes are token-counted, hashed, and embedded. Do not scale the
implicit 4,000-character behavior.

### Hop 3 — build and test the resumable materializer (code + fixtures)

`SEM-MATERIALIZE-01A` is not implemented yet. The source census found no
full-corpus sharded materializer. Once Hop 2 is closed, bind each exact
embedded input and policy revision to embedding/vector receipts, seal
per-shard revisions and checksums, and fail closed on mismatches.

### Hop 4 — bounded multi-shard smoke (after Hop 3)

`SEM-MATERIALIZE-01B`: test a small cohort with bounded concurrency, stable
checksums, interrupted-run resume, and a verified no-datastore-call boundary.
Do not reuse the old ~32-minute projection as an estimate for this different
compiler/materializer path.

### Hop 5 — full local-only materialization (after Hops 2–4)

`SEM-MATERIALIZE-01C`: materialize all 16,151 rows only to sealed local files.
The user's files-only decision authorizes this target, but the run is not yet
safe to launch until the sharded driver and smoke have passed.

### Hop 6 — independent readback, then V4 composition

`SEM-READBACK-01` verifies full unique ordinal coverage, candidate/map/source
identity, policy and representation revisions, dimensions, norms, and checksums.
Only then run the already-planned full-cohort ACE V4 pure join; it must not
embed, fetch, or write to a datastore.

### Independent AFC lane (can proceed in small review hops)

- `AFC-STRUCT-WRITE-TRACE-01A` negative producer finding is recorded; the
  parent `AFC-STRUCT-WRITE-TRACE-01` remains open until the actual writer input
  lineage is traced or explicitly classified disconnected.
- `AFC-LEXICAL-LANE-01` is a separate read-only owner trace and does not depend
  on semantic materialization.
- `AFC-PROMOTE-01` remains a human decision; do not turn a passing fixture or
  owner census into automatic promotion.
- Query-radix acceptance/shadow wiring and RLM integration remain downstream
  of the owner/promotion gates.

## Safety and interpretation

- This is a refreshed portfolio index plus a short-hop proposal, not a global
  rewrite of 88 boards.
- No unrelated task checkbox was changed, and no task was closed from a
  percentage, heuristic, or stale receipt.
- `FILES_ONLY_SEALED_ARTIFACT` permits local generated artifacts only; no
  PostgreSQL, Qdrant, Valkey, Neo4j, Graphify apply, or cache writes.
- The report does not claim semantic materialization has started or completed.
- Fast work means a bounded, independently verifiable hop—not skipping source
  identity, provenance, operator approval, or readback.

## Owner-grouped execution waves (refreshed from the same census)

The attached multi-agent proposal correctly groups changes by shared owners,
not by OpenSpec change. Its progress figures are stale in a few places; use the
fresh projection above as the count source. One read-only owner audit has been
started per shared domain, with non-overlapping report outputs:

| Wave | Coordinated owner group | Current board counts | Scope of the audit |
| --- | --- | --- | --- |
| 0 | `parent-atlas-openspec-tasks-audit-fabric` | 11/11 complete (attachment said 11/12) | Verified by [`openspec-tasks-audit-fabric-closure-v1.json`](openspec-tasks-audit-fabric-closure-v1.json); strict OpenSpec validation passed. Archive remains an operator choice. |
| 1 | OAK fanout + OKF knowledge layers + ontology kernel | 33/36; 38/45; 221/313 | Audit complete; see [`oak-okf-near-closure-v1.json`](oak-okf-near-closure-v1.json) and [`ontology-kernel-critical-path-v1.json`](ontology-kernel-critical-path-v1.json). |
| 2 | Neural prefill + prefill/residency + memory freeze + KV research + PCA/SVD | 1531/2185; 125/152; 19/31; 10/88; 7/18 | Audit complete; ORNITH-CACHE-01 metadata probe recorded, with cache capabilities and immutable model digest still unproven. |
| 3 | NLP sidecar + observation/policy routing + pass fabric + native C ABI + ONNX/WebGPU | 88/148; 16/26; 25/40; 15/56; 14/63; 4/17 | Read-only census complete; see [`routing-sidecar-native-critical-path-v1.json`](routing-sidecar-native-critical-path-v1.json). |
| 4 | OpenCode replay proof | 2/19 | Keep read-only and downstream until routing/workboard boundaries stabilize. |

Do not dispatch separate workers for neural-prefill versus prefill/residency,
or for OAK/OKF versus ontology-kernel: their contracts share owners. Reports
from the current audit wave must be reviewed before selecting any additional
implementation hops. Historical counts and report paths in the attachment are
not authoritative when they disagree with this census.

### Audit results and proof limits

- **Ontology:** current counts are 33/36 OAK, 38/45 OKF, and 221/313 ontology
  kernel. The OKF profile/validator already exists; a fresh in-memory audit
  found 25 manifest files and 0 valid. Treat this as negative evidence awaiting
  owner disposition, not as an invitation to rewrite the validator. Suggested
  first bounded hops are pure `DOMAIN-OWNER-05/06` normalizer fixtures and a
  separate read-only `CONCEPT-01` label census. No registry/database writes.
- **Prefill:** 54 gates were classified across the overlapping prefill,
  residency, memory, encoder, and prefix-cache surfaces. The existing probe
  observed runtime revision `b8757-a29e4c0b7` and model name `ornith-1.5-9b`.
  All cache behavior settings/capabilities remain `UNPROVEN`, and
  `modelSha256` is null. The sealed diagnostic is
  [`ornith-cache-capability-live-readonly-v1.json`](ornith-cache-capability-live-readonly-v1.json);
  it performed GET metadata reads only—no inference, cache warm, or writes.
- **Routing/native:** the six-change census totals 344 tasks (162 complete,
  182 open). The two proposed focused suites passed: 4 tests total, and strict
  OpenSpec validation passed for both touched changes. They do not close the
  larger gates. ORF-5P remains open because numeric tensor flattening has no
  implementation; the three passing router-row tests cover projection
  stability, representation separation, and identity drift only. The one
  mocked pass test covers deterministic duplicate reuse, not the full logical
  identity/execution identity and stochastic-history matrix.

The execution queue is therefore two-level:

1. Finish the three read-only owner-group audits and verify the already-complete
   OpenSpec audit-fabric board.
2. Select only proof-backed, non-overlapping quick hops from those reports.
3. Keep the already-approved files-only semantic path independent: exact input
   byte/policy binding → resumable shard driver → bounded resume/no-write smoke
   → full local cohort → independent readback → pure V4 composition.
4. Leave production enablement, database/projection writes, and downstream
   OpenCode replay behind their explicit promotion/runtime gates.
