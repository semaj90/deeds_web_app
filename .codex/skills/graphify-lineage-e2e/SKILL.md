---
name: graphify-lineage-e2e
description: Prove one qualified Parent Atlas packet through existing JSONL, POS, classification, feature, routing, representation, retrieval, canonical-resolution, and ContextManifest owners. Use for LINEAGE-E2E-01 or when auditing whether derived Graphify evidence preserves packet identity, revisions, checksums, and grounded evidence. Read-only by default; fail closed and never create a parallel canonical owner.
---

# Graphify Lineage E2E Proof

This skill orchestrates and verifies one vertical derivation proof. It discovers and invokes existing owners; it is not a Graphify implementation, new retrieval path, or canonical provenance system. Use `.codex/skills/graphify-pipeline-gap-audit/SKILL.md` for broader pipeline-owner inventory and read-only Graphify discovery. This skill applies the stricter single-packet execution gates below.

## Authority and modes

- The owning OpenSpec `tasks.md` is the claim ledger. Workstation TODOs and reports are projections, not authority.
- PostgreSQL owns canonical Atlas identity and admitted revision state. Graphify, Neo4j, Qdrant, Valkey/BitFrost, GPU ordinals, and local caches are derived or execution projections.
- Default to `AUDIT`. `PROPOSAL` may emit explicitly non-authoritative context/derivation artifacts. `APPLY` is disabled unless the user separately authorizes a specific existing apply procedure.
- Never run `graphify:daily`, refresh Graphify/Neo4j, apply migrations, backfill, populate caches, write incidence, start services, or write canonical stores as part of this skill without separate explicit authorization.
- Before running a command, inspect its implementation and establish its side effects. “Dry run” in a command name is not proof of safety.
- Diagnostic reports are allowed only when requested or required by the task. Mark them `canonicalAuthority: false`, `writesPerformed: false`, and distinguish report-file output from datastore writes.

## Success condition

`PROVEN` requires the **same frozen qualified packet** to traverse real existing owners:

```text
qualified packet
  → actual JSONL/parser owner
  → grounded POS owner
  → actual classifier
  → domain/intent and feature derivation
  → real routing owner
  → authoritative representation artifact
  → read-only retrieval executor
  → canonical candidate resolver
  → proposal-only ContextManifest
  → strict receipt validation
```

Every arrow is a separately evidenced derivation boundary. Component tests or independent service health do not prove the vertical path. Stop at the first mandatory stage that is missing, unqualified, or receives a different artifact.

## Operating procedure

### A. Discover and freeze one packet

1. Use the existing Graphify pipeline-gap audit, source search, contracts, callers, tests, and runtime receipts to locate owners. Graphify dependency output only nominates files/callers; corroborate current source and runtime wiring.
2. Reconcile existing provenance, derivation, receipt, artifact, and ContextManifest contracts before proposing types. Do not create `DerivedArtifactEdgeV1` or another canonical edge/schema merely because that exact name is absent.
3. Select exactly one already-qualified packet. Record its owner, qualification receipt/status, canonical serialized input, checksum, and authoritative identity before invoking any stage.
4. Freeze the input. Do not reconstruct a similar packet or substitute a second candidate later in the run.
5. Record the applicable Graphify snapshot. A dirty-worktree identity cannot be mixed with an older Graphify snapshot. If applicable source/workspace/graph revisions disagree, stop with `GRAPH_SNAPSHOT_MISMATCH`.

### B. Execute real owners in order

For every stage, identify the implementation path and symbol, actual caller, input contract, output contract, observed producer/model revision, and safe invocation. Execute the real owner if available in the selected mode. Capture actual input/output checksums and execution evidence. A manually constructed expected-shaped object is not owner execution.

| Gate | Required proof | Fail-closed result |
|---|---|---|
| `PACKET-01` | One qualified packet, frozen checksum, complete applicable canonical identity and revisions | `PACKET_NOT_QUALIFIED`, `PACKET_IDENTITY_INCOMPLETE`, or `PACKET_REVISION_INCOMPLETE` |
| `JSONL-01` | Actual parser/builder owner; input packet checksum; parser revision; output checksum; identity before/after; observed parser backend and parse counts | `JSONL_OWNER_NOT_EXECUTED` or `IDENTITY_DRIFT` |
| `POS-01` | Actual POS owner output with token, index, exact offsets/spans, source/tree binding, returned confidence, owner revision, and evidence refs | `POS_GROUNDING_INCOMPLETE` |
| `CLASSIFY-01` | Actual classifier call; service/model identity and revision; exact input checksum; domain/intent scores; output checksum and execution evidence | `CLASSIFIER_UNAVAILABLE` or `CLASSIFIER_LINEAGE_INCOMPLETE` |
| `FEATURE-01` | Real feature derivation; actual feature/producer revisions, input refs/checksums, output checksum, canonical identity | `FEATURE_LINEAGE_INCOMPLETE` |
| `ROUTE-01` | Existing routing owner called with this packet’s classifier/features; routing revision, input checksum, selected lanes, policy/decision IDs, reasons, output checksum | `ROUTING_NOT_EXERCISED` or `ROUTING_LINEAGE_INCOMPLETE` |
| `REPR-01` | Concrete representation artifact bound to canonical identity/input revision, representation family/revision, producer revision, output checksum, and model/config digest when applicable | `REPRESENTATION_LINEAGE_UNQUALIFIED` |
| `RETRIEVE-01` | Read-only lane and executor; query/candidate representation revisions; score/rank; retrieval config/revision; source/evidence refs | `RETRIEVAL_LINEAGE_INCOMPLETE` |
| `CANDIDATE-01` | Existing canonical resolver maps retrieval candidate to the exact expected canonical identity; record resolution source | `CANDIDATE_IDENTITY_UNRESOLVED` or `CANDIDATE_IDENTITY_MISMATCH` |
| `CONTEXT-01` | Proposal-only ContextManifest assembled from the same qualified candidate and full ancestry, with evidence refs and budget/checksum | `CONTEXT_MANIFEST_UNQUALIFIED` |
| `PROV-01` | Existing provenance/receipt semantics classified as canonical, compatible, diagnostic, orphaned, or unresolved | `PROVENANCE_OWNER_UNRESOLVED` |

Do not continue downstream after the first mandatory unqualified gate merely to create a complete-looking report. A proposal ContextManifest may be null when upstream lineage is incomplete.

For NDJSON inputs, inspect and reuse the existing `parseNdjsonTypedEvidence` owner before creating a parser. Its `parserExecution.backend` and native/fallback/cache counts must describe the execution observed for this invocation; addon availability alone is not proof that N-API parsed the input. When the native addon is available, compare the typed payload with V8 `JSON.parse` over the same frozen line and require a real native parse count for an N-API alignment claim. A V8 fallback is valid parser behavior but does not prove native alignment. This parser stage remains diagnostic and cannot establish packet/source authority.

### C. Compare identity and provenance

At every stage, preserve or explicitly classify applicability of:

```text
canonicalId
packetKey
symbolVersionId
treeNodeId
workspaceRevision
sourceRevision
graphRevision
```

Also capture stage provenance separately; it is not canonical identity:

```text
parserRevision
extractorRevision
posTaggerRevision
classifierRevision
featureRevision
routingRevision
representationRevision
retrieval revision/config
producerRevision
model/config digest when applicable
inputChecksum / outputChecksum
evidenceRefs
```

For each identity field, compare as `EQUAL`, `MISMATCH`, `MISSING_LEFT`, `MISSING_RIGHT`, or `NOT_APPLICABLE_WITH_PROOF`. Missing required identity is never equal and never a pass. Use `MISSING_REQUIRED_IDENTITY` when applicability is not proven.

### D. Enforce representation lineage

- Never substitute a family/dimension label such as `semantic_768@v1` for an artifact revision.
- Discover the actual representation producer and bind its output to the exact input/chunk, canonical identity, source revision, representation family/revision, producer revision, and output artifact/checksum. Include model/config digest where applicable.
- Equal vector dimension does not establish equal model, recipe, or representation.
- If the authoritative revision is null or missing, report `REPRESENTATION_LINEAGE_UNQUALIFIED` and stop. Do not fabricate a revision or claim downstream retrieval is lineage-qualified.

### E. Validate strictly and use negative controls

The validator must reject, not pass, any missing required field, identity drift, invented revision, hard-coded producer revision, unexecuted classifier, skipped routing, unresolved candidate, missing evidence, or ContextManifest built from a different candidate/run. Do not use permissive checks equivalent to `if (!left || !right) return true` or treating undefined values as equal.

Run at least one negative control when the existing validator/test harness allows it safely:

- wrong `sourceRevision` or `representationRevision`;
- missing `packetKey`;
- candidate from another `canonicalId`;
- classifier output bound to another input checksum;
- ContextManifest proposal from another retrieval run.

Expected outcome: `REJECTED_AS_EXPECTED`. If no validator exists, report the missing owner; do not build an unreviewed canonical validation framework inside this skill.

### F. Test determinism and mutation safety

- Replay the same frozen input twice when owner semantics permit deterministic replay. Compare input checksum, stage output checksums, identity, revisions, routing decision, candidate identity, and ContextManifest checksum.
- Classify changes as `EXPECTED_NONDETERMINISM`, `UNEXPECTED_NONDETERMINISM`, `REVISION_DRIFT`, or `INPUT_DRIFT`; do not normalize differences away.
- Use database-enforced read-only transactions for live database inspection. Inspect external writers, middleware, caches, and logs before invoking the path.
- Record attempted and committed writes by subsystem. Require zero committed canonical/projection/cache writes in `AUDIT` and `PROPOSAL`.

## Diagnostic report

Use a report such as `docs/reports/lineage-e2e-01-derivation-slice-v2.json` only when requested or needed by the task. This is a diagnostic envelope, not a canonical repository contract. Suggested shape:

```json
{
  "schema": "atlas.lineage-e2e-proof-diagnostic.v1",
  "status": "PARTIAL",
  "canonicalAuthority": false,
  "writesPerformed": false,
  "packet": {},
  "stages": [],
  "gates": {},
  "firstBlockingGate": null,
  "blockingReasons": [],
  "negativeControls": [],
  "contextManifestProposal": null,
  "writeReceipt": {}
}
```

Allowed final statuses: `PROVEN`, `PARTIAL`, `BLOCKED`, `INVALID`. `PROVEN` requires every mandatory gate above, a strict receipt, a rejected negative control, deterministic replay where applicable, and zero unauthorized writes. Otherwise remain `PARTIAL`, `BLOCKED`, or `INVALID` and name the first broken boundary.

The report/response must state:

```text
status
first_blocking_gate
qualified_packet
graph_snapshot_binding
owners_exercised / owners_missing
identity_fields_preserved / identity_fields_missing
revisions_proven / revisions_missing
evidence_preserved
routing_proven
representation_proven
retrieval_proven
context_manifest_proposed
negative_control
writes_performed
likely_cause
patch_targets
safe_next_command
smoke_command
report_path
```

Use `NOT_VERIFIED` when evidence was not obtained. Distinguish repository owner presence, focused-test proof, live component output, vertical proof, and proof usability; none implies the next.

## Stop conditions

Stop at the first mandatory unqualified boundary. Do not refresh Graphify to make a proof green. Do not combine current dirty-worktree identity with an older admitted graph snapshot. Do not let semantic similarity, a rank, cache hit, schema resemblance, generated classification, or independently passing component test substitute for canonical identity, exact revisions, grounded evidence, or real caller execution.

## Closeout

Conclude using the required fields in the repository's OpenCode Skill Contract:

```yaml
likely_cause: <one sentence>
evidence: <owners, paths, receipts, revisions, test/live result>
patch_targets: [<changed or reviewed paths>]
safe_next_command: <non-destructive command>
smoke_command: <focused controlled validation>
report_path: <existing or newly emitted diagnostic report>
```
