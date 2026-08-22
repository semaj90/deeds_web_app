# Parent Atlas gate / lane / phase ledger — 2026-08-21

This is the compact execution-order board for the current workstation tranche. It distinguishes merged/implemented/proven and prevents already-closed experiments from being reopened as blockers for unrelated lanes.

## Global rule

```text
WRITTEN != WIRED != PROVEN
```

No downstream phase may promote evidence past an upstream gate merely because a field is populated or a deterministic hash can be computed locally.

## Critical path

| Gate | State | Owner / proof | Next closure |
|---|---|---|---|
| CAND canonical identity + CandidateOrdinalMap | MERGED; prior focused proof exists | `canonical-candidate-v1.ts` | consume only; no second ordinal owner |
| FEAT Arrow / physical pack / CUDA parity | MERGED implementation; do not reopen contract | candidate feature snapshot/Arrow/GPU pack owners | rerun workstation parity only if current receipt is stale relative to revision set |
| REV workspace/source semantics | MERGED contract | `WorkspaceRevisionRecordV1`, `WorkspaceSourceBindingV1`, `CodeSourceRevisionV1` | consume as sole formula owner |
| REV durable Graphify owner | PR #29 IMPLEMENTED_UNPROVEN | Graphify v2 logical revision migration + canonical writer + read-only/controlled canaries | migration review → rollback canary → bounded committed non-prod canary → exact readback |
| GRAPH snapshot revision owner | PR #31 IMPLEMENTED_UNPROVEN | `GraphSnapshotRevisionV1` + snapshot migration/canaries | bind proven Graphify workspace revision; full-corpus writer integration/readback |
| QDRANT v2 active writer alignment | PR #30 IMPLEMENTED_UNPROVEN / focused tests reported separately | `codebase_chunks_768_v2`, strict payload builder | read-only lineage census → controlled writer population reconciliation; no ID substitution |
| FANOUT canonical admission | PR #33 WRITTEN_UNPROVEN | `FanoutAdmissionV1` | bounded unit proof after upstream contract convergence |
| FANOUT live Qdrant adapter | BLOCKED | semantic lane adapter | require REV + GRAPH + Qdrant lineage proof |
| cuVS exact normalization | BLOCKED | semantic executor | compare against exact/Qdrant evidence on same CandidateOrdinal map |
| CAGRA normalization | BLOCKED | ANN executor | Recall/order/latency proof; no extra vote |
| TurboVec normalization | BLOCKED | challenger executor | challenger-only parity/latency proof; no identity ownership |
| Neo4j/cuGraph BFS/PPR | BLOCKED | graph executors | admitted canonical seeds only; bounded CPU/GPU parity |

## Revision phase

Canonical world-state identity is:

```text
WorkspaceRevisionRecordV1.workspaceRevision
  = sha256:<sorted exact indexed source-byte manifest>

CodeSourceRevisionV1.sourceRevision
  = sha256:<exact UTF-8 source bytes>
```

Git commit/tree/blob IDs are provenance anchors only.

Graphify v2 target keeps both concepts:

```text
graphify_runs.repository_revision    Git provenance
graphify_runs.workspace_revision     logical workspace world state
graphify_runs.source_manifest_digest exact manifest digest

graphify_files.source_revision       legacy Git/file provenance
graphify_files.content_hash          exact byte digest
graphify_files.code_source_revision  logical source world state
```

### REV closure ladder

1. Pure contract tests.
2. Read-only schema/layout census.
3. Review `20260822_graphify_revision_authority_v2.sql`.
4. Apply only to intended non-production proof DB.
5. Writer rollback write/readback canary.
6. Controlled bounded commit canary.
7. Read-only canary observes exact matching persisted row.
8. Only then emit `REVISION_OWNER_PROVEN`.

Do not set authority override environment flags to bypass this sequence.

## Graph phase

`GraphSnapshotRevisionV1` binds, but does not mint, `workspaceRevision`.

```text
proven WorkspaceRevisionRecordV1
        +
exact graph sourceInventoryHash
        +
topologyHash
policyHash
identity/parser contract revisions
        ↓
GraphSnapshotRevisionV1
        ↓
graphRevision
```

`sourceInventoryRevision = sha256:<sourceInventoryHash>`.

A graph snapshot is FANOUT-ready only when:

- snapshot revision checksum readback passes;
- persisted workspace revision equals proven Graphify workspace revision;
- every source-backed graph node needed for canonical traversal has authoritative `CodeSourceRevisionV1`;
- selected node/edge rows all bind to the same immutable snapshot;
- no array position / Neo4j ID / Qdrant ID is used as canonical graph identity.

## Qdrant phase

Qdrant remains a retrieval projection.

```text
codebase_chunks_768_v2
  canonical_id
  packet_key / tree_node_id / symbol_version_id as applicable
  workspace_revision
  source_revision
  graph_revision where graph-bound
  representation_revision
  dense slot: content
```

Historical rows that lack canonical identity or revision lineage remain retrieval evidence only. `postgres_id`, Qdrant point ID, collection ordinal, or vector position must never repair/mint identity.

The active writer can be correct while historical population remains degraded; those are separate gates.

## FANOUT phase

`FanoutAdmissionV1` is the only new consumer boundary in this tranche.

```text
executor result
  ↓ canonical/revision checks
CandidateOrdinalMapV1 lookup
  ↓
existing CandidateOrdinal
```

It performs no ranking mutation, no RRF fusion, no canonical writes, and no ordinal remapping.

Mixed batches are legal:

```text
ADMITTED canonical hit → FANOUT seed
DEGRADED/UNRESOLVED hit → retrieval evidence only
```

## Queue / artifact phase

Do not make queue transport the blocker for revision/FANOUT unless a specific artifact proof depends on it.

Current handoff state reports QUEUE-05 artifact-store steps 1–3 proven live, while its producer redirection/readback/audit/benchmark remainder is still open. The queue remains observation/transport, never artifact truth.

Remaining QUEUE-05 work should retain:

- producer writes bytes to artifact owner first;
- queue event observes materialization, never creates it;
- checksum/readback before reusable success;
- duplicate event replay is idempotent;
- corruption yields failure evidence and never reusable success.

## GPU / graph execution phase after FANOUT

Order:

1. Qdrant admitted top-K → CandidateOrdinal.
2. cuVS exact executor parity on same candidates.
3. CAGRA ANN recall/order/latency against exact oracle.
4. TurboVec challenger comparison if still useful.
5. admitted graph seeds → Neo4j bounded BFS/PPR reference.
6. same ordinal seeds → cuGraph BFS/PPR.
7. CPU/GPU node-set and score parity receipt.
8. only then expose graph authority features to the existing ranking owner.

PageRank/PPR/graph affinity remain feature evidence; they do not become independent retrieval votes solely because multiple executors produced them.

## Deferred lanes that must not interrupt this path

Keep these downstream until the above gates close or a concrete production defect elevates them:

- new KMeans configurations (existing routing experiment stays cache-hint only);
- SOM 20×20 rework;
- new ordinal registry / GPU identity map;
- new ranker/fusion owner;
- low-rank/Tang promotion;
- GNN training;
- QLoRA/SFT/DPO/PPO;
- 4D/Jacobian geometry;
- additional TurboVec index family;
- broad Neo4j fanout before canonical seed admission.

## Immediate workstation sequence

```powershell
# PR #29 contracts
cd C:\Users\james\Videos\deeds_web_app\sveltekit-frontend
node_modules\.bin\vitest run `
  src/lib/server/atlas/indexing/code-revision-authority-v1.spec.ts `
  src/lib/server/atlas/indexing/code-revision-owner-canary-v1.spec.ts `
  src/lib/server/atlas/indexing/graphify-source-inventory-write-plan-v1.spec.ts `
  src/lib/server/atlas/indexing/graphify-source-inventory-writer-v1.spec.ts

npx tsx scripts/atlas/prove-code-revision-owner-canary.mts

# PR #31 bounded contract
node_modules\.bin\vitest run src/lib/server/atlas/graph/graph-snapshot-revision-v1.spec.ts

# PR #33 bounded FANOUT gate
node_modules\.bin\vitest run src/lib/server/atlas/retrieval/fanout-admission-v1.spec.ts
```

Do not run the controlled write canaries until the relevant manual migration is reviewed/applied in the intended non-production proof database.
