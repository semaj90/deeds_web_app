# OpenSpec: Parent Atlas Graph Retrieval Proof

## Why

Parent Atlas is still treating `tree_node_id` as if it were a stable graph/symbol identity, but the live pipeline shows it is a version-bound parse occurrence derived by heuristics and content/version hashing. That is sufficient for provisional structural inventory, but not for canonical symbol lineage, graph identity, or downstream analytics that need replayable revision boundaries.

This change narrows the contract before any uniqueness relaxation or graph-snapshot promotion:
- keep `tree_node_id` as a provisional structural linkage
- separate parse occurrence identity from stable symbol identity
- make parser runtime reality explicit instead of relying on declared parser intent
- defer canonical graph promotion until symbol, concept, semantic, and topology layers are independently proven

## What this proves

- `tree_node_id` can remain a valid structural join key for the current snapshot lane
- it is not yet the stable logical symbol identity
- `symbol_id` must own stable cross-revision symbol identity
- `symbol_version_id` or equivalent must own version-bound symbol occurrences
- parser manifest text and parser runtime implementation are separate proof claims
- graph snapshot apply remains blocked until the identity model is split

## Next bounded extension

The next downstream seam owned by this change is a bounded patch tournament for a single existing compile error. It is intentionally narrower than a full agentic repair loop:
- generate a small candidate set
- keep each candidate isolated in its own worktree
- run static and focused tests before any ranking
- emit a deterministic comparison packet and Kanban card
- require explicit approval before any patch is applied

This remains under the same change because it consumes the evidence pipeline and produces a recommendation artifact, not canonical state.

The live code paths that already sit closest to this seam are `scripts/atlas/agentic-recommendation-workflow.mjs`, `sveltekit-frontend/src/lib/server/ai/error-agent/workflow-loop.ts`, `sveltekit-frontend/src/lib/server/ace/atlas-tool-registry.ts`, and `sveltekit-frontend/src/lib/server/agent/execution-review.ts`.
