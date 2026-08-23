# Cross-reference: parent-atlas-workstation-todo.md vs this session's swarm merges (2026-08-22)

Status: **REVIEW NEXT-STEPS DRAFTED — not yet independently re-verified line by line**

## Why this file exists

`parent-atlas-workstation-todo.md` (2127 lines, last dated entry 2026-08-13) is the
long-running workstation log for Parent Atlas — a much broader, older thread than
this OpenSpec change's own `swarm-reconciliation-2026-08-21-addendum.md`. The two
threads turn out to be directly continuous: several of the swarm branches merged
into `main` this session (2026-08-21/22, see the sibling addendum file) are the
live execution of gates this older file explicitly called for but marked
`NOT_PROVEN` or left as open next steps. This file records that cross-reference
and a concrete next-steps-for-review list, without re-litigating the older file's
entire 2127 lines.

## Confirmed: PF-G0 packet-key duplication (todo file lines ~1930-1974) is resolved

The todo file's most consequential open finding was a **packet-key identity
collision**: two independently-designed, incompatible `computePacketKey`
implementations —

| | `compute-packet-key.ts` | `packet-key-builder.ts` |
|---|---|---|
| Signature | `({workspaceId, sourceRef, semanticAnchor})` | `(source_ref, tree_node_id, title_id)` |
| Formula | `sha256("pkt:v1:{ws}:{sourceRef}:{anchor}")`, 32-hex | `sha256("{source_ref}\|{tree_node_id}\|{title_id}")`, 64-hex |

The todo file left this as `packet-key-builder.ts remains a grain-unproven V2
candidate and must not become write authority yet`, with next steps: get a human
decision on which scheme wins, migrate callers, wire the winner into
`semantic-packet-writer.ts`.

**Verified live on `main` right now** (this session, via direct file/grep check,
not assumed from memory): both files still exist
(`sveltekit-frontend/src/lib/server/atlas/identity/{compute-packet-key,packet-key-builder}.ts`),
**and** a third file now exists to bridge them:
`sveltekit-frontend/src/lib/server/atlas/identity/packet-identity-resolver.ts`,
exporting `resolveCanonicalPacketKey()`, consumed by
`sveltekit-frontend/src/lib/server/atlas/vector/ace-packet-vector.ts`. This matches
this session's own memory record of "Session 200" work: a
`atlas_packet_identity_aliases` table (also confirmed present:
`sveltekit-frontend/drizzle/manual/atlas_packet_identity_aliases.sql`) plus an
additive, zero-PK/FK-mutation resolver — built specifically to reconcile this
exact collision without picking a winner or rewriting either scheme in place.

**What this means for the todo file's open items**: the "next session, in order"
list at the end of the todo file's PF-G0 section (get human decision → migrate
callers → wire resolver into writer → then PF4C-H) was **not followed literlally**
— instead, an alias/resolver seam was built that lets both schemes coexist without
a forced winner. This is a legitimate resolution strategy but is a **different
outcome than what the todo file's own next-steps prescribed**, so the todo file's
status language here is stale and should be updated to reflect the alias-resolver
approach rather than left implying an unresolved human decision is still pending.

## Likely connection: GS1_12 (todo file lines ~1976-2034) and this session's swarm merges

GS1_12 ("Source revision index safety") asks for a per-surface audit receipt
across `codebase_chunk_index`, `atlas_tree_nodes`, `graphify_symbols`,
`atlas_graph_nodes_v2`, Qdrant `semantic_768` payloads, and Neo4j graph projection
state — classifying each as `SAFE` / `RESOLVABLE` / `MIGRATION_REQUIRED` /
`HISTORICAL_REBUILD` / `NOT_VERSIONED`, with explicit fields for
`source_revision_present`, `tree_node_id_present`, `parse_node_id_present`,
`symbol_id_present`, `symbol_version_id_present`, `chunk_id_present`.

This session's swarm-branch merges (see
`swarm-reconciliation-2026-08-21-addendum.md` for full detail) introduced several
contracts that look like direct, independent progress on exactly this audit
surface, though **built as separate proof contracts, not as the single GS1_12
per-surface receipt the todo file specified**:

- `GraphifyWorkspaceManifestCompletenessV1` — proves a persisted
  `graphify_runs`/`graphify_files` pair covers every `WorkspaceRevisionRecordV1`
  source binding (directly overlaps GS1_12's `source_revision_present` /
  `revision_resolvable` fields for the `graphify_files` surface).
- `GraphSnapshotSourceRevisionBindingV1` — per-node source-ref/revision coverage
  receipt for a graph snapshot (directly overlaps GS1_12's
  `atlas_graph_nodes_v2` / `tree_node_id_present` surface).
- `StructuralObservationV1` / `StructuralParityComparatorV2` — provider-neutral
  AST symbol observation + Node-tree-sitter-vs-8095-sidecar parity comparator
  (overlaps GS1_12's `graphify_symbols` / `symbol_id_present` /
  `symbol_version_id_present` surface, and is also the origin of the
  ast-provider-corpus-parity-v2 kind-taxonomy finding already flagged in the
  sibling addendum).
- `GitRevisionSemanticsProofV1` — formally encodes the
  git-commit-provenance-vs-workspace-revision distinction GS1_12 implicitly
  depends on (a git commit OID is not a `source_revision`).
- `export-frozen-semantic-v2-source.mts` / `real_semantic_snapshot.py` — read-only
  exporters explicitly asserting `graphify_files.code_source_revision` /
  `graphify_runs.workspace_revision` as authority, `atlasPacketWorkspaceCacheEpochUsedAsAuthority: false`
  (overlaps GS1_12's Qdrant `semantic_768` payload surface).

**None of this constitutes a finished GS1_12** — the todo file's own acceptance
criterion is explicit: `SOURCE_REVISION_INDEX_SAFETY_PROVEN` requires one receipt
covering *every* listed surface with an explicit rebuild-vs-migrate decision, and
nothing merged this session produces that single consolidated receipt. What
*is* true: the individual proof primitives GS1_12 would need to build that
receipt from now largely exist, scattered across several newly-merged files
rather than assembled into the one audit the todo file asked for.

## Next steps for review (concrete, ordered)

1. **Re-run or write the actual GS1_12 consolidated audit** using the
   newly-merged primitives above as building blocks, rather than assuming GS1_12
   is closed because adjacent proof contracts now exist. This is the single
   highest-value next action — it was the todo file's own stated blocker before
   any further Layer 3/4 promotion work.
2. **Update `parent-atlas-workstation-todo.md`'s PF-G0 section** to reflect the
   alias/resolver outcome (`packet-identity-resolver.ts` +
   `atlas_packet_identity_aliases`) instead of the stale "next session: get human
   decision" framing — the decision was effectively made (coexist via resolver),
   just not narrated back into this file.
3. **Reconcile the duplicate GPU-residency-lease finding** (flagged in the
   sibling addendum: `candidate-feature-gpu-residency-v1.ts` vs
   `candidate-feature-gpu-resident-lease-v1.ts`) — this is a fresh instance of
   exactly the kind of two-independently-correct-halves-never-joined pattern the
   todo file's PF-G0 section already lived through once; worth applying the same
   "resolve via bridge, don't force a winner" lesson if it recurs.
4. **Verify `packet-key-builder.ts`'s `validatePacketKeyLineageChain()`** (the
   5-layer Postgres→Qdrant→Redis→RPC→ACE consistency check the todo file notes as
   a point in that scheme's favor) is actually exercised by
   `packet-identity-resolver.ts`'s resolution path, or whether it's dead weight
   now that the resolver bridges rather than replaces either scheme.
5. **Check whether the swarm's DAG-level temporal proof work** (merged this
   session as `agent/temporal-action-ledger`, see sibling addendum) has any
   bearing on the todo file's Pass Fabric section (`PF4C-H`, dependency DAG,
   invalidation engine, eligibility gate) — both threads independently use
   LangGraph `StateGraph`/DAG terminology; worth confirming they're the same
   DAG concept before assuming either closes the other's open items.
6. **The todo file itself needs a refresh pass**, separate from this cross-
   reference: it is now 9+ days stale relative to `main`'s actual state, and at
   least one of its own major open findings (PF-G0) has since been resolved by
   work this file doesn't mention. A dedicated session should walk its full
   "Next gates" / "Remaining lane gaps" tables against current `main` state
   rather than trusting the 2026-08-13 snapshot as current.

## Update: orphaned root `src/` tree archived (2026-08-22, later same day)

Item 3 above is resolved. Before archiving, root `src/` was compared file-by-file
(SHA-256 + basename) against `sveltekit-frontend/src/`: of 224 files (`src/**` +
`tests/{atlas,classifier,hmm,integration,opencode,retrieval,fixtures}/**`), 3 were
exact duplicates, 54 existed at the same relative path but were stale/superseded by a
materially larger live version, and 137 had no counterpart anywhere by basename. The
`openspec/changes/parent-atlas-agentic-repair-bundle-integration/tasks.md` T0a audit
(2026-08-08) had already salvaged the only two valuable pieces
(`pagerank-authority-contract.ts`/`pagerank-promotion-gate.ts` →
`sveltekit-frontend/src/lib/server/graph/`, `candidate-fusion.ts` →
`sveltekit-frontend/src/lib/server/retrieval/rrf-oracle.ts`) and explicitly recommended
archiving the rest once those two were copied out — confirmed both are live in
`sveltekit-frontend/` before proceeding. One further piece of in-flight uncommitted work
was found in the orphan tree: a Zod validator added to the orphan's own
`classifier/domain-classifier.ts`, which was ported onto the real
`sveltekit-frontend/src/lib/server/classifier/domain-classifier.ts` in the same commit
(zero existing importers of that function, confirmed no breakage risk). A second
uncommitted diff — per-candidate domain-affinity scoring added to the orphan's
`atlas/runtime/search-runtime.ts` — was deliberately left un-ported, since it has no
equivalent in the real 1359-line production `search-runtime.ts` and needs its own design
review before landing in a live retrieval path; it's preserved as-is in the archive copy.

All 224 files were copied to `deeds_labs/archive/2026-08-22/orphaned-root-src-tree/`
(per-file SHA-256 manifest at `_manifest.json` inside that directory) before removal from
their live location, per the repo's archive-not-delete convention. Manifest entry:
`docs/archive-manifest.json` (directory-level entry, dated 2026-08-22).

## Explicit non-claim

This cross-reference does **not** claim GS1_12 is closed, does **not** claim the
todo file's broader FANOUT-01/DB-ROLE-01/Pass-Fabric gates have advanced beyond
what's stated in the sibling addendum, and does **not** re-verify every one of
the todo file's 2127 lines — it connects the two most consequential threads
(PF-G0, GS1_12) where this session's independently-gathered evidence (the swarm
branch merges) turned out to be directly relevant, and lists what a next session
should check before trusting either file's status claims at face value.
