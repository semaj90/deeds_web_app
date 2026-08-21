# GPH-18 — Structural persistence/readback proof

Status: `IMPLEMENTED_UNPROVEN / REVISION_OWNER_BLOCKED`

## Purpose

Identify and prove the existing canonical structural evidence persistence/readback surface without inventing `source_revision` or authorizing writes.

The existing owner is:

```text
Graphify structural evidence
        |
        v
packages/parent-atlas/src/core/evidence-ledger-repository.ts
        |
        v
atlas_evidence
```

`atlas_evidence.source_revision` is `NOT NULL`. That is a storage contract, not a revision-owner proof.

Current EMB3A/GPH evidence says canonical source revision ownership remains `NOT_PROVEN`. Therefore GPH-18 must remain read-only until that separate gate is accepted.

## Read-only proof

From `sveltekit-frontend/`:

```bash
npx vitest run \
  src/lib/server/atlas/indexing/graphify-structural-persistence-proof-v1.spec.ts

npx tsx scripts/atlas/prove-graphify-structural-persistence-readback.mts
```

The collector starts a PostgreSQL `READ ONLY` transaction and performs only:

1. `atlas_evidence` existence/schema introspection;
2. `(source_ref, source_revision)` index detection;
3. structural evidence row counts;
4. detection of suspicious pseudo-revisions such as `content:*` and `anchor:*` in canonical `source_revision`;
5. repository `readback()` against one already-existing `code.structural` row when available;
6. rollback and JSON proof emission.

It performs no `INSERT`, `UPDATE`, `DELETE`, Qdrant write, Valkey write, symbol promotion, or entity promotion.

Default report:

```text
sveltekit-frontend/docs/reports/graphify-structural-persistence-readback.json
```

## Expected current state

With revision ownership still unproven, a healthy database should produce one of:

```text
PERSISTENCE_OWNER_IDENTIFIED_NO_STRUCTURAL_ROWS_REVISION_BLOCKED
```

or, when a pre-existing structural evidence row can be read back:

```text
PERSISTENCE_OWNER_IDENTIFIED_READBACK_PROVEN_REVISION_BLOCKED
```

Required properties:

```text
persistenceOwner             PARENT_ATLAS_ATLAS_EVIDENCE_LEDGER
canonicalTable               atlas_evidence
tableExists                  true
requiredColumnsPresent       true
sourceRevisionNotNull        true
sourceRevisionIndexPresent   true
suspiciousPseudoRevisionCount 0
revisionOwnerProven          false
canonicalWriteAttempted      false
canonicalPersistenceAuthorized false
```

Existing-row readback, when present, additionally requires:

```text
repositoryReadbackExistingRowProven true
```

## Hard failure states

The proof exits non-zero for:

```text
PERSISTENCE_OWNER_NOT_READY
PERSISTENCE_OWNER_IDENTIFIED_READBACK_FAILED
PERSISTENCE_OWNER_IDENTIFIED_PSEUDOREVISION_DETECTED
```

A pseudo-revision detection is especially important: content hashes and parser anchor tokens belong in payload/correlation metadata and must never occupy canonical `atlas_evidence.source_revision` merely because the column is required.

## Revision owner transition

`ATLAS_SOURCE_REVISION_OWNER_PROVEN=1` is intentionally not a discovery mechanism. It may only be supplied by an operator after a separate accepted revision-owner proof has identified and populated canonical source revision authority.

Do not set it to make this proof green.

Even after that gate is accepted, a controlled write/readback canary is required before GPH-18 becomes `PROVEN_CANONICAL_PERSISTENCE`.

## Gate relationship

```text
GPH-17 LIVE_REACHABILITY_PROVEN
        |
        v
GPH-18 persistence owner/readback identified
        |
        +---- source revision owner NOT_PROVEN ---> BLOCK
        |
        v
revision owner separately PROVEN
        |
        v
controlled structural write/readback canary
        |
        v
GPH-18 PROVEN_CANONICAL_PERSISTENCE
        |
        v
GPH-19 canonical owner acceptance
```
