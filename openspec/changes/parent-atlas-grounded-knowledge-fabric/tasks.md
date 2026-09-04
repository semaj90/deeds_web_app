# Parent Atlas Grounded Knowledge Fabric

Source design review: OpenWiki durability/reconciliation mechanisms, adapted to Parent Atlas identity/OaK/governance. OpenWiki runtime/database/controller are explicitly not dependencies.

- [x] **KNOW-01 — EvidenceResourceV1.** Typed namespaces, bounded source-location hints, deterministic resource key.
- [x] **KNOW-02 — EvidenceResolver registry.** One deterministic resolver per namespace plus phase-scoped exact cache; resolver owns evidence version/revision.
- [x] **KNOW-03 — Race/symlink-safe source resolver.** Existing source registry remains revision authority; traversal/symlink/race conditions fail closed.
- [x] **KNOW-04 — Relocation hierarchy contract.** exact revision/byte → symbolVersion → Tree-sitter → LSP/compiler → exact text → context; structural disagreement fails closed.
- [x] **KNOW-05 — AtlasKnowledgeClaimV1.** Stable logical claim id, claim revision, evidence checksum, non-canonical authority.
- [x] **KNOW-06 — Atomic claim mutations.** Resolve all evidence before constructing a next claim set; zero store writes.
- [x] **KNOW-07 — Claim preflight.** Deterministic source/symbol/ontology/version/checksum drift classification.
- [x] **KNOW-08 — Sparse reconciliation.** Issue-free claims survive; stale/unresolved claims require explicit update/retraction.
- [ ] **KNOW-09 — Source snapshot/fingerprint.** Contract implemented; workstation adapter/proof against the live lineage owner remains open.
- [x] **KNOW-10 — PageJobV1 → OaK DAG binding.** Delegates to KernelBoundDagPlannerV1; read-only/propose-only only.
- [ ] **KNOW-11 — Page snapshot/rollback.** Exact pre-submit rollback controller exists. Durable snapshot artifact persistence + process-loss filesystem proof remain open.
- [ ] **KNOW-12 — Resumable generation run.** Lifecycle now requires `INSPECT` before `SUBMIT`; COMPLETE transitions require a verified typed `KnowledgePageCompletionReceiptV1`; opaque checksum-only completion is forbidden. Focused build/replay is still pending.
- [ ] **KNOW-13 — Durable page completion.** `KnowledgePagePersistenceReceiptV1` + `KnowledgePageCompletionReceiptV1` now bind readback-verified page/claim persistence, verification receipt, source snapshot, page snapshot, DAG binding, DAG execution receipt and CURRENT manifest identity. Runtime persistence adapter/readback proof remains open.
- [ ] **KNOW-14 — Page manifest replay.** Manifest currentness helper exists; prove page bytes + claim set + verification + source snapshot on two runs.
- [x] **KNOW-15 — Generated provenance contract.** Producer/model/program metadata advances only on body-byte change.
- [x] **KNOW-16 — OKF source projection contract.** Parent Atlas replaces only Parent Atlas-owned source entries.
- [x] **KNOW-17 — Multi-producer verification contract.** Parent Atlas replaces only `parent-atlas/*` verification events.
- [x] **KNOW-18 — Master TOC/index projection contract.** Deterministic KnowledgeIndexV1; no competing authority.
- [x] **KNOW-19 — Admin graph projection contract.** Derived KnowledgePage/Claim/Evidence/Concept/OpenSpec/Receipt/Source graph.
- [ ] **KNOW-20 — semantic_768 knowledge projection.** Verified page/claim artifacts only after exact source/revision qualification.
- [ ] **KNOW-21 — ConceptAdmission bridge.** Verified claims may nominate concept evidence but cannot mint ontology classes.
- [ ] **KNOW-22 — OntologyLinkedTuple bridge.** Promotion only through existing evidence/revision-qualified ontology owner.
- [ ] **KNOW-23 — Full two-run read-only replay.** Same frozen source snapshot → same claims/page/index checksums.
- [ ] **KNOW-24 — Interruption/resume proof.** Lifecycle preserves COMPLETE/SKIPPED state; workstation kill/resume proof remains open.
- [ ] **KNOW-25 — Failed-worker rollback proof.** Pre-submit failure restores page+claims exactly; post-submit failure never rolls back durable completion. Process-loss replay remains open.

## Current tranche

The branch remains additive under `packages/parent-atlas/src/core/knowledge/`. No PostgreSQL, Neo4j, Qdrant, Valkey, migration, MCP, CLAUDE.md, AGENTS.md, generated knowledge-page, or production-store mutation is authorized. PR #78 remains draft. As of 2026-09-04 its branch has diverged from current `main`; synchronization/rebase against current `main` is an explicit integration gate because the current kernel DAG spine includes `ParameterArtifactV1` materialization/resolution that is newer than the branch base.
