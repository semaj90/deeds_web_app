## Why

A `/code-review` background pass (2026-08-22) over the working tree's in-flight diff (not authored by this session — likely concurrent-agent work) found 8 real findings, most severe: a silent reversal of the frozen `semantic_512` canonical-embedding decision back to 768-dim, which breaks a live caller outright (`ATLAS_SEMANTIC512_QUERY_DIMENSION` throws on every invocation of `/api/admin/atlas/synthesize`'s semantic512 exact-KNN branch). This is recorded here, not fixed, so the record survives a context compaction and a future session can act on it with full context rather than rediscovering it.

**Cross-reference**: two existing OpenSpec changes already disagree on this exact question — `openspec/changes/parent-atlas-semantic-512-canonicalization/` and `openspec/changes/parent-atlas-semantic-768-canonical-contract/`. Their names alone mirror finding #7 below (dual competing canonical-representation owners). A future session resolving this should read both before deciding anything, not just this file.

## What Changes (proposed — none of this has been implemented)

Per root CLAUDE.md's Embedding Dimensions Policy section (STALE-flagged, pointing at `parent-atlas-semantic-512-canonicalization/tasks.md` as the operator-corrected source of truth): the persisted canonical semantic representation is `semantic_512` (native 768 → MRL prefix [0:512] → L2 renorm), not 768. The diff under review reverses this without an OpenSpec change, without updating CLAUDE.md, and without checking downstream callers.

**8 findings, ranked most severe first — all unfixed, all need operator/future-session judgment before touching:**

1. **`sveltekit-frontend/src/lib/server/atlas/retrieval/qdrant-semantic-projection.ts:6`** — `ATLAS_CANONICAL_SEMANTIC_DIMENSION` flipped from 512 to 768, reversing the frozen decision. Root cause of #2.
2. **`sveltekit-frontend/src/lib/server/atlas/retrieval/atlas-rapids-semantic512-client.ts:69`** — its dimension guard now compares a 768 canonical constant against a 512-dim vector built by `embedSemantic512()` at its only call site (`routes/api/admin/atlas/synthesize/+server.ts:195`), so `exactKnn()` throws `ATLAS_SEMANTIC512_QUERY_DIMENSION` on every call. **This endpoint's semantic512 branch is currently unreachable if the reviewed diff is live.**
3. **`sveltekit-frontend/src/lib/server/atlas/language/api-contract-observation-v1.spec.ts:3`** — imports `buildApiContractObservationV1`, which the diff removed from the module under test (only `compileApiContractObservationV1` survives, different input shape). Spec/typecheck fails immediately.
4. **`sveltekit-frontend/src/lib/server/atlas/indexing/node-tree-sitter-ast-provider.ts:156`** — new `utf8ByteOffset()` may double-convert byte offsets if the native tree-sitter binding's `startIndex`/`endIndex` are already byte offsets (common), corrupting structural evidence for any file with multi-byte characters (non-ASCII identifiers, emoji, accented text). **Needs verification against the actual binding's documented offset semantics before either "fixing" or dismissing.**
5. **`packages/parent-atlas-runtime/src/adapters/qdrant-recall.adapter.ts:44`** — repointed to `codebase_chunks_768_v2`; `packages/parent-atlas-retrieval/src/turbovec/turbovec-search.ts` (5 call sites, untouched) still defaults to the old `codebase_chunks_768`. Two retrieval lanes silently query different collections if both are live.
6. **`sveltekit-frontend/src/lib/server/embedding/embedding-contract.ts:78`** — same rename-not-propagated pattern as #5: `qdrant_collection` renamed to `codebase_chunks_768_v2`, but `src/mcp/trace-mcp-server.ts:9949` and `src/lib/server/acp/packet-assembler.ts:103,262` still hardcode the literal `'codebase_chunks_768'` instead of importing the constant.
7. **`sveltekit-frontend/src/lib/server/atlas/retrieval/semantic-512.ts:42`** — `embedSemantic512()`'s docstring downgraded from "canonical persisted representation" to "derived... not the native semantic owner", while a new `semantic-768.ts` stands up as a parallel canonical embedder. Two competing canonical owners for the same logical representation — the exact pattern CLAUDE.md's Duplication Prevention rule (Aug 9 2026) exists to catch.
8. **`packages/parent-atlas-retrieval/src/gpu/simdjson-bridge.ts:216`** — `fastJsonParse()` encodes the input string to UTF-8 twice per call (once for the OOM-guard byte-length check, once independently inside the cache-key hash). Minor perf, not correctness; lowest priority.

## Non-Goals

- This proposal does NOT decide 512 vs 768 as canonical. That decision already exists (frozen, per CLAUDE.md, in favor of 512) — findings 1-2 are about an *undocumented reversal* of that decision, not a request to re-litigate it. If a future session believes 768 should actually become canonical, that needs its own explicit, documented decision reconciling the two existing conflicting OpenSpec changes referenced above — not a silent code change.
- This proposal does NOT fix any of the 8 findings. Zero code was changed as part of this proposal — it exists purely to survive compaction with full context intact.

## Impact

- **Code affected** (not yet changed by this proposal): the 8 files listed above.
- **Whose diff this is**: not this session's — the working tree already contained these changes when `/code-review` ran. Unclear which agent/session authored them; a future session should check `git log`/`git blame` on these exact files before assuming authorship or intent.
- **Downstream risk if left unresolved**: silent retrieval-quality degradation (findings 5-6, inconsistent collections across lanes with no error surfaced) and a hard functional break (finding 2, an endpoint branch that always throws) are the two most urgent.
