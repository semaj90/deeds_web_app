## Why

Parent Atlas needs a durable, evidence-grounded knowledge maintenance fabric for generated architecture/wiki pages without introducing another agent authority, database owner, or documentation root. OpenWiki demonstrates useful correctness patterns—resolver-owned evidence versions, stale-claim preflight, sparse reconciliation, resumable page jobs, rollback, per-page completion, provenance, and deterministic OKF/index projection—that map cleanly onto existing Parent Atlas identity, OaK, evidence, ontology, and governance contracts.

## What Changes

- Add native Parent Atlas evidence-resource/resolver contracts with resolver-owned revisions.
- Add fail-closed contextual relocation below exact source/symbol/AST/LSP ownership.
- Add checksum-sealed knowledge claims, atomic mutation, preflight, and sparse reconciliation.
- Add page/run durability, provenance, OKF/index, semantic, ontology, and replay gates in bounded phases.
- Preserve Master TOC, OpenSpec, CLAUDE.md, PostgreSQL, Neo4j, Qdrant, Valkey, and OaK ownership boundaries.
- Keep the first implementation file-only and pure: no database migration or live-store writes.

## Capabilities

### New Capabilities

- `grounded-knowledge-fabric`: revision-qualified knowledge claims and deterministic page maintenance.

### Modified Capabilities

- None.

## Impact

Primary code lands under `packages/parent-atlas/src/core/knowledge/`. Later server adapters may land under `sveltekit-frontend/src/lib/server/atlas/knowledge/` only after current workstation-local changes are reconciled. Generated knowledge remains subordinate to document governance and Master TOC. Ontology promotion remains gated by `ConceptAdmissionV1` / `OntologyLinkedTupleV1`; this fabric has no ontology authority.
