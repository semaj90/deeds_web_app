# parent-atlas-okf-knowledge-layers

Four-layer knowledge architecture (Parent Atlas = canonical evidence, OKF = portable knowledge bundles, OpenWiki = doc synthesis, Deep Agents/LangGraph = agent runtime) so none of them silently becomes a competing source of truth. First bounded slice: `PARENT_ATLAS_KNOWLEDGE_GAP_AUDIT_V1` — design/audit only, not yet implemented.

**See also**: `parent-atlas-retrieval-lod-algorithm-taxonomy` reuses this change's status vocabulary
(`PROVEN | PARTIAL_PROVEN | NOT_PROVEN | CONTRADICTED | STALE | MOCK | STUB | MISSING | BLOCKED`)
rather than inventing a new one, and registering that taxonomy as an actual OKF page is blocked on
this change's `PARENT_ATLAS_KNOWLEDGE_GAP_AUDIT_V1` slice landing first.

**Correction needed (found 2026-08-08, not yet reconciled)**: this "not yet implemented" claim
conflicts with what's actually on disk. `docs/okf/parent-atlas/index.md` already exists with
frontmatter `status: PARTIAL_PROVEN`, generated from this change's own `proposal.md`/`design.md`/
`tasks.md`, and a real `gaps/` directory contains 9 populated gap writeups
(`agentic-error-fixing.md`, `fragmented-representations.md`, `missing-cluster-run-lineage.md`,
`missing-concept-edge-ledger.md`, `missing-domain-lineage.md`, `missing-library-review.md`,
`missing-som-run-lineage.md`, `mock-stub-resolution.md`, `topology-schema-drift.md`). Either this
README is stale (the audit slice has actually landed, at least partially) or `docs/okf/
parent-atlas/` was generated ahead of the design being finalized — that distinction matters and
needs to be resolved by re-reading `design.md`/`tasks.md` against the generated bundle, not
assumed. Found via `openspec/changes/parent-atlas-agentic-repair-bundle-integration`'s Phase 17
repo sweep; see that change for the full list of other real infrastructure discovered in the same
pass (4D manifold, hypergraph, token-map, glyph cache, Engram).

**See also**: `parent-atlas-retrieval-lod-algorithm-taxonomy` is a candidate OKF concept file once
`PARENT_ATLAS_KNOWLEDGE_GAP_AUDIT_V1` lands — it reuses this change's status vocabulary
(`PROVEN | PARTIAL_PROVEN | NOT_PROVEN | ...`) rather than inventing a new one, and should not be
registered as a durable OKF page before this slice's validator exists.
