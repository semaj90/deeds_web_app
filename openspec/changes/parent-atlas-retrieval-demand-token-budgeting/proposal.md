## Why

Parent Atlas has separate owners for feature identity, retrieval reconciliation, HyperLogLog telemetry, and context assembly, but no single revision-qualified contract connects retrieval impressions and citations to exact model-token cost. This change defines that measurement seam so optimization work can be evaluated against useful evidence without introducing another canonical registry, agent pipeline, or ranking authority.

## What Changes

- Define a read-only-first retrieval-demand observation that references existing canonical candidate identity and source revisions, and distinguishes observed, selected, cited, and unavailable results.
- Define exact context-token accounting bound to the active tokenizer artifact/revision and admitted context, keeping character-based estimates explicitly approximate.
- Reuse existing feature-intelligence, retrieval-reconciliation, ACE/ContextManifest, HLL-monitoring, and Langfuse owners through an owner crosswalk; do not duplicate their registries or lifecycle tasks.
- Keep HLL as advisory breadth telemetry only. Exact identity, counts used for reconciliation, eligibility, ranking, eviction, and promotion remain outside HLL authority.
- Defer storage, instrumentation, MCP exposure, and optimization changes until the owner/revision audit and read-only contract tests pass.

## Capabilities

### New Capabilities
- `retrieval-demand-accounting`: Revision-qualified retrieval observations and exact tokenizer-bound context cost reporting, with explicit degraded-source and no-authority states.

### Modified Capabilities

## Impact

- Likely integration points: SearchRuntime retrieval receipts, canonical candidate resolution, ACE/ContextManifest assembly, existing tokenizer/context-budget helpers, HLL telemetry, and Langfuse tracing.
- Initial work is contract, owner-crosswalk, and fixture-test focused. No database schema changes, canonical writes, cache warming, vector codec changes, log ingestion, model training, or new MCP/ACP agent pipeline are authorized by this proposal.
- Existing `FI-ONTO-04`/`FI-ONTO-06`, retrieval reconciliation, and adaptive-backprop/HLL tasks remain their owners; this change records dependencies and integration gates only.
