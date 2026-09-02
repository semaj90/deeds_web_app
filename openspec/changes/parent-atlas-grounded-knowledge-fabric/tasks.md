# Parent Atlas Grounded Knowledge Fabric

Source design review: OpenWiki durability/reconciliation mechanisms, adapted to Parent Atlas identity/OaK/governance. OpenWiki runtime/database/controller are explicitly not dependencies.

- [x] **KNOW-01 — EvidenceResourceV1.** Typed namespaces, bounded source-location hints, deterministic resource key.
- [x] **KNOW-02 — EvidenceResolver registry.** One deterministic resolver per namespace plus phase-scoped exact cache; resolver owns evidence version/revision.
- [ ] **KNOW-03 — Race/symlink-safe source resolver.** Implement server-side repository bytes resolver with no-follow/containment checks and exact source registry reconciliation. Do not duplicate source authority.
- [ ] **KNOW-04 — Relocation hierarchy.** Context-anchor fallback contract is implemented; still wire exact sourceRevision/byte → symbolVersion → Tree-sitter → LSP/compiler → exact text → context anchor.
- [x] **KNOW-05 — AtlasKnowledgeClaimV1.** Stable logical claim id, claim revision, content/evidence checksum, revision-qualified evidence, non-canonical authority.
- [x] **KNOW-06 — Atomic claim mutations.** ADD/CONFIRM/UPDATE/RETRACT validate targets and resolve all evidence before returning a next state; zero store writes.
- [x] **KNOW-07 — Claim preflight.** Re-resolve evidence and classify source/symbol/ontology/version/checksum drift deterministically; zero writes.
- [x] **KNOW-08 — Sparse reconciliation.** Preserve issue-free claims without model repetition; stale/unresolved claims require update or retraction.
- [ ] **KNOW-09 — Source snapshot/fingerprint.** Bind workspace/source registry checksums and raw-worktree audit fingerprint without creating a competing source authority.
- [ ] **KNOW-10 — PageJobV1.** Ordered bounded page job contract; no hidden Deep Agents loop.
- [ ] **KNOW-11 — Page snapshot/rollback.** Exact pre-worker page + claim state; rollback only before durable submit.
- [ ] **KNOW-12 — Resumable generation run.** BEGIN/PLAN/NEXT_PAGE/INSPECT/SUBMIT/FINISH mapped to Parent Atlas typed DAG/execution receipts.
- [ ] **KNOW-13 — Durable page completion.** Claims persisted/proven before job completion can be recorded.
- [ ] **KNOW-14 — Page manifest replay.** Page bytes + claim set + evidence + verification receipt + source snapshot must all match.
- [ ] **KNOW-15 — Generated provenance.** Advance producer/model/program metadata only when page body bytes change.
- [ ] **KNOW-16 — OKF source projection.** Deterministic Parent Atlas-owned source IDs; preserve non-Parent-Atlas producers.
- [ ] **KNOW-17 — Multi-producer verification.** Replace/remove only Parent Atlas verifier events; preserve human/other-process verification.
- [ ] **KNOW-18 — Master TOC/index projection.** Deterministic KnowledgeIndexV1 feeds existing Master TOC owner; no competing index authority.
- [ ] **KNOW-19 — Admin graph projection.** Typed KnowledgePage/Claim/Evidence/Concept/OpenSpec/Receipt/Source graph; Markdown links are not ontology authority.
- [ ] **KNOW-20 — semantic_768 knowledge projection.** Index verified page/claim artifacts only after exact candidate/source revision qualification.
- [ ] **KNOW-21 — ConceptAdmission bridge.** Verified claims may nominate concept evidence but cannot mint ontology classes.
- [ ] **KNOW-22 — OntologyLinkedTuple bridge.** Promotion only through existing evidence/revision-qualified ontology owner.
- [ ] **KNOW-23 — Full two-run read-only replay.** Same frozen source snapshot → same claims/page/index checksums, zero writes outside bounded file artifacts.
- [ ] **KNOW-24 — Interruption/resume proof.** Completed pages remain durable recovery units; skipped/pending jobs resume without regenerating complete pages.
- [ ] **KNOW-25 — Failed-worker rollback proof.** Pre-submit failure restores page+claims exactly; post-submit failure never rolls back durable completion.

## Current tranche

Files are additive under `packages/parent-atlas/src/core/knowledge/`. No PostgreSQL, Neo4j, Qdrant, Valkey, migration, MCP, CLAUDE.md, AGENTS.md, or production mutation changes are authorized by this tranche.
