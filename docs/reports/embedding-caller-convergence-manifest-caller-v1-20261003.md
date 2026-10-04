# Embedding Caller Convergence — Manifest Builder Slice

Date: 2026-10-03

## Change

`scripts/atlas/build-mcp-tool-manifest-packets.mjs` no longer posts vectors directly to Ollama `/api/embeddings`. It now uses the shared embedding API client, calls `/api/embed` with explicit `unprompted_legacy` mode to preserve the existing document recipe, validates the returned 768-dimensional vector and recipe receipt, and includes that receipt in the Qdrant point payload. `EMBEDDING_API_URL`, `SELF_URL`, or `PUBLIC_API_URL` supplies the application base URL; invalid or absent configuration fails closed for Qdrant apply before the Postgres pool is created. Dry-run and `--no-qdrant` behavior do not require the embedding service.

The same recipe contract is now wired into the existing `executeEmbeddingInputV1` owner in the `dual-lane`, `reranked-search`, and `tags/search` query routes. Together with the existing `statutes/search`, `precedents/search`, and `glossary/search` adapters, six SvelteKit search paths explicitly preserve `unprompted_legacy` until their target corpus recipes are independently qualified.

## Proof

- `node --test scripts/atlas/lib/embedding-api-client-v1.test.mjs`: 5/5 passed, including URL resolution, apply preflight, builder integration shape, recipe receipt, and vector validation.
- `node --check scripts/atlas/build-mcp-tool-manifest-packets.mjs`: passed.
- Focused SvelteKit tests: 5 files, 10 passed and 12 existing TODO cases (`embedding-query-route-adapter`, execution adapter, and route test suites for dual-lane, reranked-search, and tags search). Existing generated route tests primarily exercise authorization guards; the new adapter-wiring assertions cover the changed embedding boundary.
- `npm run check` was interrupted after several minutes with no diagnostics and is recorded as `INCOMPLETE_RESOURCE_LIMIT`, not a pass.
- `npx openspec validate parent-atlas-openspec-task-triage-pipeline --strict`: valid. The separate nested consolidation change fails strict validation because it contains no OpenSpec delta spec; its task ledger cannot be used as a valid strict change until that existing structural gap is resolved.
- `rg` confirms the builder has no direct `/api/embeddings` caller and uses the canonical API client.
- `git diff --check` passed for the edited implementation paths.

## Boundaries

- No apply run; no Postgres, Qdrant, Neo4j, Valkey, or SeaweedFS writes.
- The caller explicitly retains `unprompted_legacy`; this is not proof that the shared or TaskCard corpus has one recipe, nor proof of output parity with previously persisted vectors.
- No TaskCard vectors were generated. Remaining direct embedding callers, corpus-specific executor parity, query/document prefix decisions, and the full caller guard remain open.
- The builder itself was not run because its dry-run writes a shared report artifact; review and isolate that output before any invocation.

likely_cause: The tool-manifest builder bypassed the established embedding adapter and called Ollama directly, so mode and recipe provenance were not centrally validated.
evidence: `scripts/atlas/build-mcp-tool-manifest-packets.mjs`; `scripts/atlas/lib/embedding-api-client-v1.mjs`; 5 focused Node tests; 10 focused Vitest tests.
patch_targets: [`scripts/atlas/build-mcp-tool-manifest-packets.mjs`, `scripts/atlas/lib/embedding-api-client-v1.mjs`, `scripts/atlas/lib/embedding-api-client-v1.test.mjs`, `sveltekit-frontend/src/mcp/trace-mcp-server.ts`, `sveltekit-frontend/src/routes/api/embed/+server.ts`, `sveltekit-frontend/src/routes/api/retrieval/dual-lane/+server.ts`, `sveltekit-frontend/src/routes/api/retrieval/reranked-search/+server.ts`, `sveltekit-frontend/src/routes/api/tags/search/+server.ts`, `sveltekit-frontend/src/lib/server/embedding/embedding-query-route-adapter-v1.spec.ts`, `sveltekit-frontend/openspec/changes/parent-atlas-gpu-compute-lanes-consolidation/tasks.md`, `openspec/changes/parent-atlas-openspec-task-triage-pipeline/tasks.md`]
safe_next_command: `git diff --check -- scripts/atlas/build-mcp-tool-manifest-packets.mjs scripts/atlas/lib/embedding-api-client-v1.mjs scripts/atlas/lib/embedding-api-client-v1.test.mjs`
smoke_command: `node --test scripts/atlas/lib/embedding-api-client-v1.test.mjs`
report_path: `docs/reports/embedding-caller-convergence-manifest-caller-v1-20261003.md`
