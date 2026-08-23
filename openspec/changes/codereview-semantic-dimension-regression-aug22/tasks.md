## 1. Triage — establish ground truth before touching anything

- [ ] 1.1 Run `git log -3 --oneline -- sveltekit-frontend/src/lib/server/atlas/retrieval/qdrant-semantic-projection.ts` and `git blame` on the changed lines to identify which commit/session/agent authored this diff. This proposal's author (this session) did not write these changes — confirm whose work it is before deciding how to proceed.
- [ ] 1.2 Determine whether this diff is committed, staged, or still working-tree-only. If uncommitted, decide whether to keep, revert, or hand back to whoever authored it — do not silently discard someone else's in-progress work (per this repo's standing "investigate before deleting/overwriting" rule).
- [ ] 1.3 Read both `openspec/changes/parent-atlas-semantic-512-canonicalization/` and `openspec/changes/parent-atlas-semantic-768-canonical-contract/` in full. Determine which (if either) is the currently-active, non-superseded decision. Their coexistence is itself evidence of unresolved architecture drift — do not assume either is authoritative without reading both.

## 2. Fix the functional break (finding #2) — only after 1.1-1.3

- [ ] 2.1 If 512 is confirmed still canonical (per current CLAUDE.md and MEMORY.md): revert `ATLAS_CANONICAL_SEMANTIC_DIMENSION` in `qdrant-semantic-projection.ts` back to 512, restoring `atlas-rapids-semantic512-client.ts`'s dimension check to a working state.
- [ ] 2.2 If 768 is intended to become canonical instead (a real possibility — do not assume without checking task 1.3's outcome): `atlas-rapids-semantic512-client.ts`'s `exactKnn()` call site and `embedSemantic512()` itself need to be updated together, consistently, with an explicit new OpenSpec decision reconciling the two existing conflicting changes — not a standalone patch to just this one file.
- [ ] 2.3 Either way: add or confirm an integration test that actually calls `/api/admin/atlas/synthesize`'s semantic512 branch end-to-end, so this class of always-throws regression is caught by CI next time, not by a code-review pass discovering it after the fact.

## 3. Fix the spec/test break (finding #3)

- [ ] 3.1 Determine whether `api-contract-observation-v1.spec.ts` should be updated to use `compileApiContractObservationV1` with the new nomination-object input shape, or whether `buildApiContractObservationV1` should be restored. Depends on which function is the actual intended canonical builder post-diff — check the diff's own intent (commit message, if committed) before choosing.

## 4. Investigate, don't assume (finding #4 — AST byte offsets)

- [ ] 4.1 Check the actual node-tree-sitter native binding's documented return type for `startIndex`/`endIndex` (byte offset vs UTF-16 code-unit offset) — do not trust either the new code's assumption or the reviewer's hypothesis without checking the binding's own source/docs.
- [ ] 4.2 If double-conversion is confirmed: write a test with a real multi-byte-character source file (emoji, accented text, or non-ASCII identifier) asserting the byte offsets line up with `Buffer.byteLength()` ground truth, before and after any fix — this exact class of bug is silent and easy to reintroduce.

## 5. Reconcile the Qdrant collection rename (findings #5, #6)

- [ ] 5.1 Decide: is `codebase_chunks_768_v2` meant to fully replace `codebase_chunks_768`, or coexist as a distinct collection? Check whether `codebase_chunks_768_v2` has actually been backfilled to parity (row/point count comparison) — if not, the two collections are NOT interchangeable and every caller must agree on which one to use.
- [ ] 5.2 Once decided, propagate consistently: `turbovec-search.ts`'s default `collection` parameter, `trace-mcp-server.ts:9949`, and `packet-assembler.ts:103,262` should all import the same constant from `embedding-contract.ts` rather than each hardcoding their own literal — this is the actual root cause (no single source of truth for the collection name), not just 3 independent typos.

## 6. Resolve the dual-embedder duplication (finding #7)

- [ ] 6.1 Per CLAUDE.md's Duplication Prevention rule: classify `semantic-512.ts` and the new `semantic-768.ts` as CANONICAL_OWNER / BACKEND / EXPERIMENT / DEAD — do not leave both implicitly claiming canonical status via contradictory docstrings. This decision is upstream of and should probably happen before 2.1/2.2 above, since it's the same underlying question.

## 7. Low-priority cleanup (finding #8)

- [ ] 7.1 `simdjson-bridge.ts`'s `fastJsonParse()`: compute the UTF-8 buffer once, reuse its byte length and pass it (or the buffer itself) into `fnv1aKey()` instead of two independent encodes. Pure performance, safe to defer — do this last, after all correctness findings above are resolved.
