## Why

The repository has separate upload, NLP, ontology, ranking, and agent-planning owners, but no single SvelteKit feature contract that turns source-qualified evidence into inspectable proposals across those lanes. A small, modular proposal surface can reuse those owners while keeping summaries, taxonomy, recommendations, and verification clearly non-canonical until independently admitted.

## What Changes

- Add a Zod-validated, source-grounded `EvidenceClaimV1` contract for `who`, `what`, `why`, `how`, and case context; every claim retains exact source spans, content digest, source/workspace revision where available, and explicit verification state.
- Define importable SvelteKit server helpers that validate source bytes, verify exact spans, normalize claims, build immutable timeline view models, and assemble proposal cards without becoming upload, identity, or persistence owners.
- Specify four cooperating proposal workflows: evidence synthesis; taxonomy and timeline; low-rank recommendation; recursive verification and repair planning.
- Reuse the existing evidence upload/worker, 8095 NLP/AST/LangExtract, Ornith `:8090`, OAK, PostgreSQL/pgvector, and agent-planning boundaries. Require owner/caller audits before wiring any runtime path.
- Keep all four outputs proposal-only. No canonical label promotion, database/Qdrant/graph/cache writes, model training, autonomous patch application, or production ranking changes are introduced.

## Capabilities

### New Capabilities
- `evidence-agent-proposals`: source-grounded claim synthesis and four bounded proposal workflows exposed through SvelteKit.

### Modified Capabilities
- None. Existing upload, ontology, retrieval, and repair contracts remain their respective owners.

## Impact

- SvelteKit evidence server modules and proposal-card UI, after existing owner/caller review.
- Reuses `process-evidence-document-v1`, the 8095 AST/LangExtract bridge, existing summary/provider configuration, OAK resolution, PostgreSQL/pgvector retrieval, and current agentic verification seams; no second worker pool or duplicate ingestion route.
- Adds one OpenSpec capability contract and tests. New model/service dependencies and persistent schema changes are out of scope.
