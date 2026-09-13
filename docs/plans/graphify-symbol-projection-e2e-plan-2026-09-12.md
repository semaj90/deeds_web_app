# Graphify Symbol Projection — End-to-End Implementation Plan

Date: 2026-09-12
Status: PLAN ONLY — no Graphify run, schema mutation, symbol write, edge write, semantic write, or projection write is authorized by this document.

## Executive decision

Do **not** repair `scripts/atlas/index-engine.ts` into a production owner.

That file was a Phase 110 Stage 1–2 prototype that combined four responsibilities:

1. open/close a Graphify run,
2. persist `graphify_files`,
3. extract/persist symbols,
4. generate/persist embeddings.

The current architecture already split those responsibilities into better owners. The replacement should therefore be a narrow **Graphify structural projection writer** that consumes revision-qualified structural evidence and writes only `graphify_symbols` / `graphify_edges` after authority gates pass.

`index-engine.ts` remains untouched until the replacement lane is proven. After parity/provenance proof, archive it; do not silently delete it.

## Existing owners to preserve

| Capability | Existing owner / candidate | Required decision |
|---|---|---|
| workspace/source revision authority | workspace/source binding + current Graphify run-owner/source-owner audits | must be PROVEN before writes |
| Graphify source inventory | `graphify-source-inventory-writer-v2.ts` | reuse; do not duplicate |
| structural parsing/materialization | `graphify-structural-materializer.ts` + treesitter-chunker sidecar | reuse |
| structural evidence normalization | `graphify-structural-intelligence-adapter.ts` | reuse |
| three-producer structural contract | `packages/parent-atlas/src/core/structural-extraction-fabric.ts` | reuse |
| ast-grep structural evidence | `ast-grep-extractor.ts` + Parent Atlas adapters | enrichment only; no canonical identity |
| compiler/LSP resolution | compiler-semantic resolver lane | use for resolvable references where applicable |
| symbol persistence target | `graphify_symbols` FK-anchored to `graphify_files` | adopt as structural symbol projection |
| edge persistence target | `graphify_edges` FK-anchored to `graphify_symbols` | adopt as structural edge projection |
| representation lineage | `atlas_representations` migration 0152 candidate | separate lane; not part of symbol writer |
| old `atlas_symbol_registry` repository | legacy/parallel identity model | do not make it the Graphify symbol writer |

## Why the old indexer must not be repaired as-is

The current `scripts/atlas/index-engine.ts` has both mechanical and architectural defects:

- duplicate imports,
- an unterminated module import,
- leaked task-progress/conflict artifacts in the function body,
- no callers,
- a regex symbol extractor instead of the proven structural pipeline,
- an assumed embedding service mixed into the structural transaction,
- run lifecycle ownership duplicated from newer Graphify owners,
- a `stableSymbolKey` formula that includes source revision / byte position / matched source text and therefore behaves like version/coordinate identity rather than stable logical symbol identity,
- symbol/representation lineage conflated in one path.

The useful intent to preserve is only: **persist deterministic structural symbol and edge projections for a revision-qualified Graphify source cohort.**

## Target pipeline

```text
WorkspaceRevisionRecordV1
        +
WorkspaceSourceBindingV1
        |
        v
Graphify source inventory writer
        |
        v
graphify_files
        |
        v
structural materializer (Tree-sitter / treesitter-chunker)
        |
        +--> ast-grep enrichment
        +--> LangExtract enrichment
        +--> LSP/compiler semantic evidence
        |
        v
GraphifyStructuralIntelligenceResult
        |
        +--> symbol_nominations[]
        +--> reference_facts[]
        +--> receipt.canonicalPromotionMayBeAttempted
        |
        v
SYMBOL-PROJECTION-PREFLIGHT-01
        |
        +-- blocked --> receipt only, zero writes
        |
        v
GraphifySymbolProjectionWriterV1
        |
        +--> graphify_symbols
        +--> graphify_edges
        |
        v
exact readback + checksums
        |
        v
GraphifySymbolProjectionReceiptV1
        |
        v
Graphify completion / promotion board
```

## Frozen invariants

1. `graphify_files` owns source/workspace revision binding. The symbol writer may not invent or backfill source authority.
2. `graphify_symbols` is a structural projection, not a second semantic representation store.
3. Embeddings / `atlas_representations` are a separate capability and are not called from the symbol writer.
4. Tree-sitter/treesitter-chunker remains the primary structural producer. ast-grep is deterministic enrichment/search, not canonical identity authority.
5. Every symbol row must bind to an existing `graphify_files.file_id` for the same admitted source cohort.
6. Every edge row must bind to a persisted subject symbol; unresolved targets remain explicit instead of fabricated.
7. No live write is permitted unless the current workspace revision, source revision, and terminal Graphify execution binding are all admitted.
8. A completed coordinator stage is not a terminal run-owner receipt.
9. Retrying the same projection input must be idempotent.
10. Promotion is downstream of exact readback, not implied by successful INSERT.

# Implementation gates

## GSP-0 — Ownership and caller census

Goal: prove no second live symbol writer exists.

Actions:
- search every `INSERT INTO graphify_symbols`, `graphifySymbols`, `graphify_edges`, and `runIndexEngine` reference;
- classify each occurrence as canonical owner, test/proof, audit, dead/orphan, migration, or legacy;
- verify `runIndexEngine` has zero callers;
- record the old Phase 110 file as `DEAD_BROKEN_PROTOTYPE`, not `LIVE_OWNER`.

Exit criteria:
- exactly one planned write owner for `graphify_symbols` / `graphify_edges`;
- no ambiguous live caller remains.

Smoke:
```bash
rg -n "runIndexEngine\(|INSERT INTO (public\.)?graphify_symbols|INSERT INTO (public\.)?graphify_edges|graphifySymbols|graphifyEdges" scripts packages sveltekit-frontend
```

## GSP-1 — Projection contract

Add pure schemas/types before any SQL writer:

- `GraphifySymbolProjectionCandidateV1`
- `GraphifyEdgeProjectionCandidateV1`
- `GraphifySymbolProjectionBatchV1`
- `GraphifySymbolProjectionReceiptV1`

Required symbol candidate fields:
- `fileId`
- `workspaceRevision`
- `sourceRef`
- `sourceRevision`
- `stableSymbolKey`
- `symbolKind`
- `qualifiedName`
- `parentStableSymbolKey?`
- `startByte/endByte`
- `startRow/endRow`
- `signatureText?`
- `sourceTextHash`
- `astFingerprint`
- `upstreamNodeId`
- `upstreamSymbolId?`
- `upstreamChunkId`
- `extractorRevision`

Required edge candidate fields:
- `workspaceId`
- `workspaceRevision`
- `sourceRevision`
- `subjectStableSymbolKey`
- `predicate`
- `objectStableSymbolKey?`
- `unresolvedTarget?`
- `evidenceKind`
- `evidenceSpan`
- `confidence`
- `evidenceRefs[]`

Contract rule: `objectStableSymbolKey` XOR `unresolvedTarget` for reference-bearing edges.

## GSP-2 — Pure mapper from structural fabric

Implement a pure transform from:

```text
StructuralExtractionFabricResultV1
+ exact graphify_files binding
```

to projection candidates.

### Symbol key rule

Use the existing nomination `symbol_key` as the logical projected stable key. Do **not** reintroduce the old Phase 110 formula that included `sourceRevision`, byte position, and source text.

This preserves the current Parent Atlas distinction:

- logical structural symbol key = stable-ish nomination coordinate,
- source/file revision = version binding,
- byte/AST coordinate = revision-specific evidence.

### AST fingerprint rule

Do not invent a fingerprint from arbitrary source text. Prefer a deterministic parser-derived identity already available from the canonical structural observation / native structural evidence. If the exact source is not currently carried through the Graphify structural result, add the field to the projection input contract and keep the writer blocked until it is present.

### Parent rule

Resolve `parent_symbol_id` only through another symbol in the same source projection batch using an explicit parent nomination/stable key. No name-only database lookup.

## GSP-3 — Preflight authority gate

Implement `proveGraphifySymbolProjectionPreflightV1()` as a pure/read-only gate.

Must require:
- current admitted `workspaceRevision` matches batch,
- current terminal Graphify run-owner exists and is canonical,
- every batch source has a matching `graphify_files` row,
- `graphify_files.workspace_revision` matches admitted workspace revision,
- code/source revision matches the structural input,
- structural receipt says `canonicalPromotionMayBeAttempted === true`,
- native provenance mode is strict,
- compatibility IDs count is zero,
- duplicate candidate identities are zero,
- every byte span is valid and inside the source byte length.

Output statuses:
- `READY`
- `BLOCKED_WORKSPACE_REVISION`
- `BLOCKED_TERMINAL_RUN_OWNER`
- `BLOCKED_SOURCE_BINDING`
- `BLOCKED_SOURCE_REVISION`
- `BLOCKED_NON_NATIVE_PROVENANCE`
- `BLOCKED_DUPLICATE_SYMBOL_KEY`
- `BLOCKED_INVALID_SPAN`
- `BLOCKED_AST_FINGERPRINT_MISSING`

Zero-write invariant: this gate performs no mutation.

## GSP-4 — Transactional symbol writer

Create a narrow writer, e.g.:

`src/lib/server/atlas/indexing/graphify-symbol-projection-writer-v1.ts`

Responsibilities only:
- accept a preflight-approved batch,
- open/use one transaction,
- insert/upsert symbols,
- resolve parent IDs from same-batch inserted/read-back rows,
- exact readback,
- emit receipt.

Recommended idempotency key:

```text
(file_id, stable_symbol_key)
```

which matches the existing table constraint.

On conflict:
- allow no-op/readback when all deterministic fields match;
- fail closed on mismatched structural payload for the same `(file_id, stable_symbol_key)`.

Do not silently update the row to a different AST coordinate under the same revision binding.

## GSP-5 — Transactional edge writer

After symbol readback succeeds:
- create stable-key -> symbol-id map from the persisted batch;
- insert edges;
- map internal targets only when target resolution is proven;
- preserve unresolved target text/status otherwise;
- retain source revision and evidence span.

Do not fabricate graph edges merely to reach 100% internal resolution. Terminal external/unresolved classifications are valid when explicitly classified by the compiler-semantic lane.

## GSP-6 — Receipt and checksum

`GraphifySymbolProjectionReceiptV1` should include:

- `runId`
- `executionId`
- `workspaceId`
- `workspaceRevision`
- `sourceCount`
- `symbolCandidateCount`
- `symbolInsertedCount`
- `symbolExistingIdenticalCount`
- `edgeCandidateCount`
- `edgeInsertedCount`
- `edgeExternalOrUnresolvedCount`
- `duplicateCount`
- `revisionMismatchCount`
- `readbackMismatchCount`
- `inputChecksum`
- `symbolReadbackChecksum`
- `edgeReadbackChecksum`
- `producerRevision`
- `canonicalAuthority: false` until the downstream Graphify completion/admission gate accepts it.

## GSP-7 — Coordinator wiring

Wire only after GSP-0..6 are proven.

The daily coordinator should call the symbol projection lane only when:

```text
snapshot admitted
AND source inventory bound
AND structural materialization complete
AND structural intelligence promotable
AND terminal execution binding is valid
```

A coordinator-stage completion alone must never authorize the writer.

Do not wire the old `index-engine.ts`.

## GSP-8 — Archive the broken prototype

Only after replacement proof:
- move `scripts/atlas/index-engine.ts` under the repo's archive convention or replace it with a short tombstone/readme pointer;
- preserve Git history;
- add a static audit that rejects future live imports/callers of the archived module.

# Test strategy

## Layer A — compile/static smoke

Required:
```bash
npx tsc --noEmit --pretty false
npx vitest run <new focused specs>
npx openspec validate parent-atlas-retrieval-lineage-dag-convergence --type change --strict --json
```

Add a focused source audit that asserts:
- no conflict/task-progress markers in live source,
- old `index-engine.ts` has no live callers,
- no new embedding import exists in symbol projection writer.

## Layer B — pure fixture tests

Fixtures must cover:
- top-level function,
- nested function/method,
- class + method,
- interface/type/enum,
- overloaded/duplicate names in different containers,
- anonymous constructs that should not be promoted as named symbols,
- Unicode identifiers/text,
- CRLF and LF source,
- TS and TSX parser distinction,
- Svelte script context,
- Python fixture if supported by structural producer.

Assertions:
- deterministic candidate ordering,
- stable key unchanged when only declaration body changes,
- source revision changes without changing stable key for same logical nomination,
- coordinate/source hash changes when source changes,
- parent mapping exact,
- zero duplicate `(fileId, stableSymbolKey)` candidates.

## Layer C — parser parity tests

Use treesitter-chunker as primary evidence producer. Compare a bounded cohort against ast-grep outlines/observations as a challenger/enrichment signal.

Do **not** require identical node universes: the parity target is the named declaration subset and exact source spans.

Metrics:
- declaration recall,
- exact-span agreement,
- qualified-name agreement,
- symbol-kind agreement,
- parent-container agreement,
- native upstream ID coverage.

## Layer D — disposable database integration

Use an isolated transaction or disposable DB fixture.

Cases:
1. insert one source + symbols + edges;
2. rerun identical batch -> no duplicates;
3. same stable key + mismatched deterministic payload -> fail closed;
4. missing `graphify_files` parent -> FK/preflight failure;
5. source revision mismatch -> zero writes;
6. workspace revision mismatch -> zero writes;
7. duplicate symbol candidate in same batch -> zero writes;
8. resolved internal edge -> symbol FK populated;
9. unresolved/external target -> explicit unresolved target retained;
10. transaction failure midway -> zero partial rows.

## Layer E — read-only live canary

Before any live write, run a current-workspace read-only canary over 1 then 5 files:

```text
source binding
 -> materializer
 -> structural intelligence
 -> projection mapper
 -> preflight
 -> SQL plan / would-write receipt
```

Expected output:
- candidates > 0 for files known to contain declarations,
- zero revision mismatches,
- zero compatibility IDs,
- zero duplicate stable keys,
- all file bindings exact,
- **writes = 0**.

## Layer F — bounded live write canary

Only after explicit authorization and terminal run-owner gate passes:
- 1 file,
- one transaction,
- exact readback,
- re-run same canary to prove idempotency,
- rollback/delete only through an explicitly approved cleanup path if needed; never ad-hoc SQL cleanup.

Then scale: 5 files -> 25 files -> admitted cohort.

## Layer G — deep corpus validation

For the admitted cohort compute:
- source coverage,
- symbols/source distribution,
- duplicate stable-key count,
- parent resolution rate,
- edge terminal-classification distribution,
- readback checksum equality,
- orphan symbol count,
- orphan edge count,
- source/workspace revision mismatch count,
- deterministic rerun checksum equality.

Hard gates:
```text
orphan_symbol_count = 0
orphan_edge_subject_count = 0
workspace_revision_mismatch = 0
source_revision_mismatch = 0
readback_mismatch = 0
unclassified_edge_count = 0
```

Internal edge resolution does NOT need to be 100%; terminal external/ambiguous/unresolved outcomes are allowed when deterministically classified.

## Layer H — fault injection

Inject:
- sidecar unavailable,
- parser diagnostic/error node,
- truncated/changed source between observation and write,
- Postgres disconnect before insert,
- Postgres disconnect after symbol insert before edge insert,
- duplicate concurrent writer attempt,
- stale terminal run receipt,
- dirty workspace revision mismatch.

Every case must either:
- complete atomically and produce exact receipt, or
- fail closed with no partial canonical projection.

# Promotion gates

The lane is not production-ready until all are true:

```text
SYMBOL-WRITER-OWNER-UNIQUE              PROVEN
STRUCTURAL-PRODUCER-NATIVE              PROVEN
WORKSPACE-REVISION-BOUND                PROVEN
SOURCE-REVISION-BOUND                   PROVEN
TERMINAL-RUN-OWNER-BOUND                PROVEN
SYMBOL-CANDIDATE-DETERMINISM            PROVEN
SYMBOL-DB-IDEMPOTENCY                   PROVEN
EDGE-TERMINAL-CLASSIFICATION            PROVEN
TRANSACTION-ROLLBACK                    PROVEN
LIVE-READBACK-CHECKSUM                  PROVEN
RERUN-DETERMINISM                       PROVEN
OLD-INDEX-ENGINE-NO-CALLERS             PROVEN
```

Only then may the promotion board consider `graphify_symbols` / `graphify_edges` populated by a canonical Graphify structural projection lane.

# Explicit non-goals

This plan does not:
- apply migration 0152,
- write `atlas_representations`,
- generate embeddings,
- change semantic_768 ownership,
- switch RRF callers,
- create a new graph revision,
- authorize Graphify daily,
- backfill historical packet/source revisions,
- promote `atlas_symbol_registry` as the structural owner.

# Immediate next actions

1. Run GSP-0 ownership/caller census against the live local worktree, not only GitHub main.
2. Freeze `GraphifySymbolProjectionCandidateV1` / receipt schemas.
3. Build the pure mapper with no SQL.
4. Add fixture/parity tests and fail-closed preflight.
5. Only then implement transactional symbol/edge writes.
6. Prove a read-only 1-file and 5-file canary.
7. Reconcile with `CURRENT-SOURCE-TERMINAL-EXECUTION-01`; do not live-write until that gate is admitted.
