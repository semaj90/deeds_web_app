# Helper MCP Alignment Branch Review — 2026-10-03

## Scope

- Reviewed `origin/chatgpt/helper-mcp-alignment-20261003` at `c2d44050a33f72f75f7afdd4a25a507d331b7c0e` against `origin/main` at `fbc2b6729b07db486a905a71a20bd0ce1cc17255`.
- The branch is three commits ahead, `origin/main` is its ancestor, and the diff is limited to three files (297 insertions). No checkout, merge, or runtime write was performed.
- `git diff --check origin/main...FETCH_HEAD` passed. The branch adds a static integration map, a pure assertion helper, four unit tests, and SvelteKit guidance. It does not wire SearchRuntime or MCP `tools/list` at runtime.

## Findings

1. **P2 — semantic helper owner reference points at the embedder, not the registered retrieval helper.** The map names `canonical-embed.ts:embedSemantic768Canonical` (`mcp-helper-integration-v1.ts:64-73`), while the existing helper registry assigns `semantic-768` to `retrieval/semantic-search-workflow.ts` (`helper-registry-v1.ts:55`). The map should distinguish embedding owner from retrieval-helper owner, or use the existing registry owner as `ownerRef`.
2. **P2 — vote guard does not enforce one semantic vote across all roles.** It rejects extra votes only from `EXECUTOR` and `DIAGNOSTIC_MCP` (`mcp-helper-integration-v1.ts:199-205`). An additional semantic `HELPER` or `MCP_SURFACE` with `separateFusionVote: true` passes. The current map happens to contain one semantic vote, but the guard does not preserve that invariant. The test only promotes a TurboVec executor (`mcp-helper-integration-v1.spec.ts:27-36`).
3. **P2 — declared authority validation is effectively type-level, not runtime-tested.** The interface fixes `canonicalAuthority` to literal `false`; no test supplies malformed runtime data to prove the assertion rejects it. The exported assertion should accept an unknown/runtime input or validate through a schema if runtime validation is intended.
4. **Proof boundary — mapping is not a live registry/fusion proof.** MCP tool names and helper IDs are static strings; no test resolves them against live `tools/list`, helper registry entries, or SearchRuntime vote receipts. Treat this slice as a useful architecture manifest and unit-tested local guard, not as production lane enforcement.

## Status

- **Implemented:** lane/role inventory; executor-versus-lane distinction in the data; SearXNG acquisition classification; local negative test for executor vote inflation; frontend guidance.
- **Not proven:** exact-one semantic vote enforcement; owner-reference reconciliation; live MCP/helper-registry parity; runtime SearchRuntime fusion behavior; local execution of this branch's Vitest suite.
- **Recommended next patch:** reconcile the semantic owner reference, enforce at most one semantic vote with an explicit vote owner across every role, and add negative tests for duplicate helper/MCP votes and malformed authority. Then run the branch's focused Vitest file before considering merge.

## Validation

- Branch ancestry/scope: read-only Git comparison; verified three commits and three changed files.
- Whitespace: `git diff --check origin/main...FETCH_HEAD` passed.
- Runtime tests: not run in this checkout; the branch is not checked out and the active worktree has unrelated dirty changes.
