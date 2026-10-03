## Context

Parent Atlas already has pure evidence, claim, provenance, OKF, and index contracts under `packages/parent-atlas/src/core/knowledge/`. The remaining work is to prove source-snapshot binding, page lifecycle durability, manifest replay, and admission-gated derived projections. The current repository also contains a read-only OKF freshness audit, but the existing `docs/.okf` directory is primarily documentation and extraction manifests rather than claim artifacts.

The fabric must remain subordinate to the existing source/workspace/packet authority chain. A model, OpenWiki-compatible document bundle, semantic projection, ontology tuple, or admin graph must not mint source revisions or canonical identity.

## Goals / Non-Goals

**Goals:**

- Bind every evidence resource and knowledge claim to resolver-owned source/workspace revisions and exact content checksums.
- Keep claim mutation, stale reconciliation, page completion, rollback, and replay deterministic and fail closed.
- Reuse the existing Kernel DAG, source resolver, ontology admission, Master TOC, and OKF projection owners.
- Provide read-only receipts for the remaining KNOW-09 through KNOW-25 gates before any durable adapter or projection is enabled.
- Preserve a clear distinction between `PROVEN_DERIVED`, `STALE`, `UNRESOLVED`, and `NOT_PRESENT` evidence states.

**Non-Goals:**

- No OpenWiki runtime dependency or second wiki/database owner.
- No PostgreSQL DDL, packet backfill, Qdrant/Valkey/Neo4j mutation, semantic projection, or ontology promotion in this change.
- No fabricated source/workspace/packet revision and no claim authority inferred from documentation presence.
- No replacement of the existing LangGraph checkpoint or agent-work receipt owner.

## Decisions

### Resolver-owned identity

`AtlasEvidenceResolverV1` remains the only source of evidence version, source revision, workspace binding, byte range, and content checksum. Claims may nominate a locator, but unresolved or ambiguous resolution produces a non-promotable receipt.

Alternatives considered: allowing OpenWiki/OKF producers to provide revisions was rejected because it would create a second source authority; deriving revisions from timestamps or path strings was rejected because it is not content-stable.

### Read-only-first lifecycle

The implementation order is: pure contract tests → frozen source snapshot receipt → page/claim replay → interruption/rollback proofs → explicitly authorized persistence adapter. The current OKF freshness audit is a derived audit and must continue to report `canonicalAuthority=false` and `writesPerformed=false`.

Alternatives considered: direct page or claim writes from the generator were rejected because partial evidence resolution would create mixed-currentness state.

### Sparse reconciliation and atomicity

Preflight computes the next claim set without mutating storage. Issue-free claims are retained; every stale/unresolved claim requires an explicit update or retraction. A failed evidence resolution invalidates the whole proposed batch.

Alternatives considered: replacing the whole claim set on every run was rejected because it causes churn and loses stable claims when a source is temporarily unavailable.

### Projection boundaries

Master TOC, OKF files, admin graph, semantic vectors, and ontology nominations consume verified claim/page receipts. They remain derived projections. `semantic_768` and ontology tuples are not produced until their existing source/revision admission gates pass.

Alternatives considered: making the knowledge fabric an identity or ontology owner was rejected because those authorities already belong to PostgreSQL/source admission and the existing ontology promotion contracts.

### Durable receipts

Future page/claim persistence must use the existing Drizzle/PostgreSQL receipt owner and remain separate from LangGraph checkpoint state. This change defines the readback contract and proof requirements; it does not add a new table or apply a migration.

## Risks / Trade-offs

- **[Source authority remains unavailable]** → Keep KNOW-09, KNOW-20–23, and live projections waiting; emit explicit first-failure receipts.
- **[Documentation is mistaken for a claim]** → Require claim metadata markers and report non-claim artifacts separately, as the OKF freshness audit does.
- **[Partial page mutation]** → Resolve all evidence and validate the completion receipt before any future persistence boundary.
- **[Stale replay evidence]** → Include source snapshot, workspace revision, claim-set checksum, page-byte checksum, and producer revision in replay receipts.
- **[Duplicate persistence owner]** → Reuse the existing agent-work/Drizzle owner; reject LangGraph-owned durable receipt tables.
- **[Projection authority leakage]** → Require `canonicalAuthority=false`, `promotionAuthorized=false`, and `writesPerformed=false` on derived receipts until independent admission/readback exists.

## Migration Plan

1. Run the existing pure knowledge contract tests and OKF claim freshness audit.
2. Add a read-only source snapshot/fingerprint adapter that consumes the admitted lineage receipt and refuses stale or missing authority.
3. Prove two-run page/claim/index replay from the same frozen snapshot.
4. Add interruption/resume and rollback fixtures using temporary filesystem state only.
5. Review the resulting receipts and explicitly authorize any future Drizzle persistence/readback work.
6. Only after source authority, claim/page completion, and readback gates pass may semantic, ontology, admin-graph, or external OKF projections be refreshed.

Rollback is receipt-level: discard unsubmitted derived artifacts and retain the prior verified claim/page set. No canonical store rollback is part of this change.

## Open Questions

- Which current admitted workspace/source snapshot will satisfy KNOW-09 without re-admitting stale worktree bytes?
- What exact operator approval and retention policy is required before durable page completion is enabled?
- Which existing page persistence adapter is the accepted Drizzle owner for KNOW-13, and what independent readback proves it?
- What source/revision-qualified claim population is sufficient for KNOW-20–23?
- When the current lineage gate closes, which existing semantic and ontology receipts should be consumed without creating new projection owners?
