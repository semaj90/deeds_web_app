# Svelte-next grammar fusion audit (2026-10-27)

**Verdict:** `PARSE_PASS_EXTENT_PARITY_PARTIAL`. `tree-sitter-svelte-next` is useful as a bounded structural challenger, but it is not ready to replace the Svelte compiler AST or enter a production path.

## Pinned candidate

- Crate: `tree-sitter-svelte-next` **0.1.1**, published 2026-02-11; crate SHA-256 `56f88190d0743e897c3e148a7e241aba0a8844b8afe816943851426e3f7b9753`.
- Disposable harness pinned Tree-sitter **0.26.5** and grammar ABI **14**. The crate's node-types SHA-256 is `18aecc6d00acda9369784b5d4054d4bc9b53dbe2d21533f4af90b0b6b1537a6c`.
- Injection, locals, and highlight queries compile against the grammar. Their SHA-256 values are respectively `ebfe2cae1c322c2a8670d3ed76474c312b576b6f2537de602736da4f1c77f0b3`, `6928e1e9b85792862f41c8a0f92e872ff2d7a0c94b8f7c77fbac70bb3a01c1a2`, and `aae3a1ef1409f897f6970e49df93adf85273ff450dec0470c0bc5539aaba1e14`.

## Bounded parity results

The ten files are the existing hash-pinned cohort from `.tmp/atlas/svelte-htmlx-cohort-compare-20261028-v1.json`. Three additional fixtures reused the 326-byte CRLF/Unicode example with CRLF, LF, and mixed line endings (326, 311, and 320 UTF-8 bytes).

- All 13 parser inputs matched their source digests; all parsed without error or missing nodes, all visited node ranges were valid UTF-8 source boundaries, and two separately initialized parser instances in one harness run produced identical observations.
- Across the compiler-located constructs in the 13 inputs: `each_block` 37/37 exact spans; `snippet_block` 7/7; `render_tag` 9/9; `if_block` 150/162. The 12 if-block extent disagreements occur in `+page.svelte`, `SuggestionsList.svelte`, and `AnalysisPanel.svelte`. Counts match (162/162) only when the grammar's `if_statement` and `else_if_block` nodes are combined; count parity does not make their extents correct.
- This sample contains no `await_block` or `key_block`, so those features remain untested. The grammar emits `script_element` nodes, but script contents remain raw Svelte text: the injection query compiling is not proof that a consumer injected TypeScript or extracted runes. Event attributes are generic attributes, not verified semantic event facts.
- Against HTMLX 0.1.16 on the same ten files, Svelte-next recognizes 159 if-related nodes versus HTMLX's 147; both have the same 147 exact compiler spans. Svelte-next therefore surfaces 12 additional candidates but gives them incorrect extents. It does not improve exact span parity in this cohort.

## Integration boundary

- Keep `svelte/compiler` as the template structure and span owner; retain Svelte-next only as a proposal-only CST challenger.
- Keep ast-grep on its existing TypeScript/JavaScript script path. Custom-language registration and Svelte-next-to-ast-grep injection were not tested; no `sgconfig.yml` change was made.
- LSP semantic binding was not retried; the previous bounded template-definition request timed out. No semantic resolution, revision-bound symbol identity, or canonical relation is established here.
- No production dependencies, Python sidecar, services, database, graph, cache, index, or GPU workload changed.

## Receipt and validation

- Read-only receipt: `.tmp/atlas/svelte-next-v1/svelte-next-grammar-fusion-readonly-20261027-v1.json`; file SHA-256 `83f7759f02c1e313224b8ca8169728990ce6962d36559686f6f2f8d0d470c85c`.
- The receipt records `PARSE_PASS_EXTENT_PARITY_PARTIAL`, no writes, and no canonical authority. Canonical Gate V2 remains `FAIL`.
- Focused Svelte extractor, reference, fusion, and ast-grep tests pass **31/31**. `openspec validate atlas-directory-first-analysis-v1 --strict` passes. Scoped `git diff --check` reports only the existing LF-to-CRLF warning for `tasks.md`.

**Go/no-go:** GO for further isolated grammar research; NO-GO for sidecar, ast-grep, or canonical-pipeline integration. The first remaining parser blocker is the 12 `if_block` extent disagreements; semantic/LSP binding is a separate unresolved gate.
