# Parent Atlas Agentic File Compiler — test-later checklist

The current branch intentionally creates deterministic contracts and pure/injected adapters without activating production mutation or replacing the existing Mastra shim.

When the workstation is ready, validate in this order:

1. Run focused Vitest suites under `src/lib/server/atlas/agentic-file-compiler/*.spec.ts`.
2. Run TypeScript/Svelte checks for the frontend package.
3. Run existing retrieval lane/fusion tests and confirm one logical semantic vote regardless of Qdrant/cuVS/CAGRA/DiskANN/TurboVec executor.
4. Run existing AST replacement parity; Tree-sitter remains structural truth and ast-grep remains query/rewrite only.
5. Validate query classification -> RetrievalPlanV1 -> ExactPromotionV1 fixtures.
6. Validate PromptPlanV1/compiled cache-key determinism under shuffled evidence revision input.
7. Validate AtlasWorkflowSpecV1 -> MastraWorkflowGraphV1 parity.
8. Only after real `@mastra/core` installation is proven, run suspend/resume snapshot parity and compare `atlasWorkflowChecksum` on restart.
9. Run file-mutation guard and validation barrier in dry-run/injected-filesystem mode.
10. Only then wire live action persistence and filesystem mutation behind approval/authorization.
11. After a successful fixture mutation, verify eager lexical/AST/semantic_768/Qdrant/graph refresh and lazy CAGRA/DiskANN rebuild behavior.

No production database migration, cache invalidation, GPU index rebuild, or filesystem mutation is required merely to compile these files.
