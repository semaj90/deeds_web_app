# Code knowledge cards and grounded capability bridge (proposal-only)

Owner inventory must precede any live wiring: `docs/.okf/schema.yaml` is a repo-local convention, not Google's OKF specification. Canonical symbols remain owned by the existing symbol registry/reconciliation writer; packet identity by PostgreSQL; OaK and ACE/TRACE retain their existing runtime owners.

The five discriminated card types are `symbol`, `module`, `package`, `library_nuance` and `citation`. Typed TypeScript contracts live under `packages/parent-atlas/src/core/code-knowledge-card-v1.ts`, mirrored by strict Pydantic contracts under `python/atlas_compute/code_knowledge_cards_v1.py`.

The `compileSymbolEvidenceBundleV1` function prepares a **proposal-only** payload for `oak.find_symbol_evidence`, not an implemented OaK RPC, producer, tool registration, or validator-registry binding. It filters out cards lacking exact revisions, source span, receipt and predicate IDs, and explicit admission. Its admission bit is an input assertion, not proof of an independently verified join. Runtime consumers must independently resolve the receipt/predicate/source against canonical owners before use.

**Unproven:** LSP extraction, package/compiler fanout, external library/version citations, registry registration, ACE/TRACE projection, production caller and independent E2E readback. Never upsert semantic vectors or assert evidence admission from these contracts alone.
