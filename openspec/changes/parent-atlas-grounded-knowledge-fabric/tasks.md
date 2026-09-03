# Parent Atlas Grounded Knowledge Fabric

Source design review: OpenWiki durability/reconciliation mechanisms, adapted to Parent Atlas identity/OaK/governance. OpenWiki runtime/database/controller are explicitly not dependencies.

- [x] **KNOW-01 — EvidenceResourceV1.** Typed namespaces, bounded source-location hints, deterministic resource key.
- [x] **KNOW-02 — EvidenceResolver registry.** One deterministic resolver per namespace plus phase-scoped exact cache; resolver owns evidence version/revision.
- [x] **KNOW-03 — Race/symlink-safe source resolver.** `RepositoryEvidenceResolverV1` resolves only repository-contained regular files, rejects traversal/symlink evidence, validates strict UTF-8, detects inspect/read races, and requires exact content/workspace agreement with an injected existing source-registry owner. It does not mint source revisions or query a new source store.
- [x] **KNOW-04 — Relocation hierarchy contract.** `relocateEvidenceHierarchyV1()` freezes exact sourceRevision/byte → symbolVersion → Tree-sitter → LSP/compiler → exact text → contextual anchor ordering. Structural ambiguity/unresolved results fail closed and do not fall through to textual guessing. Runtime readers remain adapters over existing Parent Atlas identity/AST/LSP owners.
- [x] **KNOW-05 — AtlasKnowledgeClaimV1.** Stable logical claim id, claim revision, content/evidence checksum, revision-qualified evidence, non-canonical authority.
- [x] **KNOW-06 — Atomic claim mutations.** ADD/CONFIRM/UPDATE/RETRACT validate targets and resolve all evidence before returning a next state; zero store writes.
- [x] **KNOW-07 — Claim preflight.** Re-resolve evidence and classify source/symbol/ontology/version/checksum drift deterministically; zero writes.
- [x] **KNOW-08 — Sparse reconciliation.** Preserve issue-free claims without model repetition; stale/unresolved claims require update or retraction.
- [ ] **KNOW-09 — Source snapshot/fingerprint.** `KnowledgeSourceSnapshotV1`, deterministic raw-worktree fingerprinting, and `KnowledgeSourceSnapshotAuditReceiptV1` now fail closed unless the frozen source set exactly matches injected source-registry rows and the raw-worktree fingerprint. Still requires a workstation read-only adapter/proof over the existing lineage owner before closure.
- [x] **KNOW-10 — PageJobV1 → OaK DAG binding.** `planKnowledgePageJobV1()` accepts only `PENDING` jobs and delegates lowering to `planKernelBoundDagV1()` using the active kernel manifest/function catalog/operator library. It produces a checksum-bound read-only/propose-only binding receipt; page jobs cannot invent DAG action kinds or mutation semantics.
- [ ] **KNOW-11 — Page snapshot/rollback.** `KnowledgePageSnapshotV1` contract exists; still implement exact before/after restoration proof around the file adapter.
- [ ] **KNOW-12 — Resumable generation run.** `KnowledgeGenerationRunV1` contract exists; still map BEGIN/PLAN/NEXT_PAGE/INSPECT/SUBMIT/FINISH to Parent Atlas typed DAG/execution receipts.
- [ ] **KNOW-13 — Durable page completion.** Claims persisted/proven before job completion can be recorded.
- [ ] **KNOW-14 — Page manifest replay.** Manifest currentness helper exists; still prove page bytes + claim set + evidence + verification receipt + source snapshot on two runs.
- [x] **KNOW-15 — Generated provenance contract.** Producer/model/program metadata advances only when page body bytes change; runtime write/readback proof remains downstream.
- [x] **KNOW-16 — OKF source projection contract.** Deterministic Parent Atlas-owned source IDs; preserve non-Parent-Atlas producers.
- [x] **KNOW-17 — Multi-producer verification contract.** Replace/remove only Parent Atlas verifier events; preserve human/other-process verification.
- [x] **KNOW-18 — Master TOC/index projection contract.** Deterministic `KnowledgeIndexV1` is ready to feed the existing Master TOC owner; no competing index authority.
- [x] **KNOW-19 — Admin graph projection contract.** Typed KnowledgePage/Claim/Evidence/Concept/OpenSpec/Receipt/Source graph; Markdown links are not ontology authority.
- [ ] **KNOW-20 — semantic_768 knowledge projection.** Index verified page/claim artifacts only after exact candidate/source revision qualification.
- [ ] **KNOW-21 — ConceptAdmission bridge.** Verified claims may nominate concept evidence but cannot mint ontology classes.
- [ ] **KNOW-22 — OntologyLinkedTuple bridge.** Promotion only through existing evidence/revision-qualified ontology owner.
- [ ] **KNOW-23 — Full two-run read-only replay.** Same frozen source snapshot → same claims/page/index checksums, zero writes outside bounded file artifacts.
- [ ] **KNOW-24 — Interruption/resume proof.** Completed pages remain durable recovery units; skipped/pending jobs resume without regenerating complete pages.
- [ ] **KNOW-25 — Failed-worker rollback proof.** Pre-submit failure restores page+claims exactly; post-submit failure never rolls back durable completion.

## Current tranche

Files remain additive under `packages/parent-atlas/src/core/knowledge/`. Source authority is injected from existing Parent Atlas lineage (`graphify_files`/source-registry adapters); structural identity is injected from existing revision-qualified symbol, Tree-sitter, and LSP/compiler owners. Page planning is delegated to the existing kernel-bound planner rather than a new agent controller. No PostgreSQL, Neo4j, Qdrant, Valkey, migration, MCP, CLAUDE.md, AGENTS.md, knowledge-page, or production mutation changes are authorized by this tranche.
