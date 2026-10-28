# Tree-sitter Svelte 5 chunker lookup (2026-10-27)

**Status**: web search only, NOT_PROVEN locally | **Scope**: does a tree-sitter chunker/grammar handle Svelte 5?

## TL;DR
Partly, and not proven. The `tree-sitter-grammars/tree-sitter-svelte` grammar parses Svelte 5 block syntax (`{#snippet}`, `{@render}`) per Zed's migration commit. An open issue asks for Svelte 5 event-attribute syntax. No search result states runes (`$state`, `$derived`, `$props`, `$effect`) coverage, and no result is dated 2026. I could not identify which chunker fork was meant earlier; the lookup below is by topic, not by that fork.

## Findings
| Item | Svelte 5 evidence | Caveat |
|---|---|---|
| tree-sitter-grammars/tree-sitter-svelte | Zed commit lists `{#snippet}` / `{@render}` support | commit date not shown; snippet bodies not yet treated as JS in that PR checklist |
| Same grammar, issue #16 | open request for Svelte 5 event listener syntax | open status per a listing captured earlier; current state unchecked |
| nvim-treesitter-svelte | separate `svelte5` parser on themixednuts/tree-sitter-htmlx | different grammar; not an answer for the grammars org one |
| claude-context-local `svelte_chunker.py` | chunks `script_element`, `style_element`, functions, classes | nothing Svelte 5 specific (runes, snippets) |
| tree-sitter-svelte-atom | fork for an older CLI (Atom) | unrelated to Svelte 5 |
| svelte-syntax (Rust crate) | typed AST for Svelte 5 runes mode | not a tree-sitter grammar |

## Local state (verified in repo)
- App uses Svelte 5: 886 of 937 `.svelte` files use runes; `svelte` 5.53.3; `runes: true` in `svelte.config.js`.
- `svelte-language-server` 0.18.3 + `svelte2tsx` 0.7.57 (Svelte 5 capable; nested `svelte` 4.2.20 is a fallback copy).
- `scripts/atlas/lib/svelte-script-scope-v1.mjs` does not rely on a Svelte grammar: it extracts `<script>` blocks and runs TS/JS scope analysis; template expressions are not analysed.

## Not proven
- Whether the grammar's current release parses runes inside `<script>` and snippet bodies.
- Whether the earlier-referenced fork differs from upstream on Svelte 5.

## Next (read-only)
- Parse 3 real runes components with the grammar the chunker uses; record node types for `$props()`, `{#snippet}`, `onclick={...}` and any ERROR nodes.

## Sources
- [tree-sitter-svelte issues (ecosyste.ms)](https://issues.ecosyste.ms/hosts/GitHub/repositories/tree-sitter-grammars%2Ftree-sitter-svelte/issues)
- [Zed: migrate to tree-sitter-grammars/tree-sitter-svelte](https://git.secluded.site/zed/commit/accff826ca842fc8c297fab317f464bc9c695d75)
- [nvim-treesitter-svelte](https://sveltethemes.dev/themixednuts/nvim-treesitter-svelte)
- [claude-context-local svelte_chunker.py](https://glama.ai/mcp/servers/@FarhanAliRaza/claude-context-local/blob/711d5ea26d78e060728fcf1259e103abcbefecc2/chunking/languages/svelte_chunker.py)
- [tree-sitter-svelte-atom](https://npmjs.com/package/tree-sitter-svelte-atom)
- [svelte-syntax 0.1.5](https://docs.rs/crate/svelte-syntax/0.1.5)

## Addendum: what treesitter-chunker 4.0.0 actually does for Svelte (read from the installed package in `miniforge-nlp-sidecar`)
| Finding | Evidence |
|---|---|
| Svelte plugin is Svelte 4-oriented | `chunker/languages/svelte.py` chunk types: `script_element`, `style_element`, `if/each/await/key_block`, `reactive_statement`, `store_subscription`, `on_directive`, `slot_element`; event check looks for `on:` / `bind:` / `use:` |
| No Svelte 5 handling in the plugin | 0 matches for snippet, render tag, `$state`, `$props` in `languages/svelte.py` |
| Template blocks are line-prefix text scans | `core.py::_svelte_control_flow_chunks` matches lines starting `{#if`, `{#each`, `{#await`, `{#key`; whole-line chunks only; no `{#snippet}` / `{@render}` |
| `$:` chunks are line scans of the script body | `core.py` ~L903; Svelte 4 reactive statements; runes are not chunked |
| Script contents are not parsed | the script stays one `script_element` fragment: no symbols, imports or exports (matches the probe) |
| Parser stack | `tree-sitter` 0.25.2, `tree-sitter-language-pack` 0.9.0; which Svelte grammar the pack loads was not identified |
| "load only" | no such string in the package; effectively the grammar loads and parses (CLEAN) but chunking rules stop at the script block and Svelte 4 constructs |

Implication: do not expect snippets, render tags, runes or script symbols from this chunker. Keep it as the parse-validity and script-span producer; take symbols and scope from `ast-grep-symbol-extraction.mjs` and `svelte-script-scope-v1`; template/snippet chunks need a separate proposal-only extractor (the official Svelte compiler's AST is the likely source).

Not yet checked: line-scan byte offsets under CRLF or non-ASCII lines (`core.py` uses `splitlines()`); the 4 incidental `snippet|render|rune` matches in `core.py`.

## Addendum 2: byte-span and compiler comparison (fixture: CRLF + multibyte `héllo 🚀` / `ünï`, 326 bytes; script `.tmp`-free, scratchpad only)
| Check | Result |
|---|---|
| Parse | `CLEAN`, 0 error nodes |
| Chunk start offsets vs official Svelte compiler (`svelte/compiler` modern AST, UTF-16 converted to UTF-8) | `if_block` 114 and `each_block` 181 match the compiler's block starts exactly, despite CRLF and multibyte text earlier in the file |
| Chunk extents | sidecar chunks cover only the opening line (`if_block` 114-125, `each_block` 181-199); compiler blocks are 114-179 and 181-224 |
| Missing vs compiler | `SnippetBlock` (226-265) and `RenderTag` (267-283) absent; `{:else}` branch absent |
| Ordering | `script_element` is emitted last, not in source order |
| Script | one `script_element` fragment (0-112), no symbols |
Conclusion: starts are trustworthy, extents and Svelte 5 constructs are not. A template extractor should take block extents and snippet/render nodes from the compiler AST and treat the sidecar chunks as parse-validity evidence only.

## Svelte inspector (no install needed)
- `@sveltejs/vite-plugin-svelte` 5.1.1 already depends on `@sveltejs/vite-plugin-svelte-inspector` 4.0.1 (installed).
- `svelte.config.js` has `vitePlugin.inspector: false`; the plugin also reads `SVELTE_INSPECTOR_OPTIONS` / `SVELTE_INSPECTOR_TOGGLE` from env (`options.js`).
- Dev-only activation without editing config: set `SVELTE_INSPECTOR_TOGGLE=alt-x` (or `SVELTE_INSPECTOR_OPTIONS={"toggleKeyCombo":"alt-x","showToggleButton":"always"}`) in `.env.local`, then restart `npm run dev`. Whether the env value overrides `inspector: false` in this repo is not yet tested.

## Addendum 3: compiler-AST template extractor (proposal-only, read-only)
- New: `scripts/atlas/lib/svelte-template-chunks-v1.mjs` + test (5/5 pass). Emits if/each/await/key blocks, `{#snippet}` (with name) and `{@render}` (with callee name) with compiler extents converted to UTF-8 bytes and read back from the source bytes.
- Fixture (CRLF + multibyte): if_block 114-179, each_block 181-224, snippet_block and render_tag present, 0 span mismatches, deterministic replay.
- Run over all 937 `.svelte` files in `sveltekit-frontend/src` (excl. node_modules/_archive/.svelte-kit): 937 extracted, 0 parse errors, 0 span mismatches; 7,813 chunks (if 5,794; each 1,779; render 189; snippet 48; key 3; await 0).
- Not done: template expression bindings, script-to-template references, LSP agreement, `<style lang="scss">`. Not wired into any pipeline; not committed.

## Addendum 4: real-component and package comparison (2026-10-27, read-only)

- A frozen 10-file current-worktree cohort was sent serially to the live `:8095/ast/chunk` endpoint and parsed with the installed Svelte compiler AST (`svelte/compiler` 5.53.3, `modern: true`). This is not an admitted workspace snapshot.
- The compiler parsed all 10 files and validated all 18,656 AST byte positions, including zero-width nodes. It found 4 `SnippetBlock` and 6 `RenderTag` nodes. The sidecar returned 197 chunks; all 197 spans were valid UTF-8 byte ranges. It emitted `CONSILIENCY_LF_BYTE_SPAN_REMAPPED` diagnostics, confirming that the bridge had to remap LF-relative chunk offsets.
- One sidecar result (`CommandCenterShell.svelte`) was `RECOVERED_WITH_ERRORS` with a Tree-sitter error at line 98, column 5, while the Svelte compiler parsed it. The other nine sidecar results were clean. The sidecar output did not emit snippet/render chunks, so parse validity is not extraction parity.
- A disposable-container smoke comparison of tree-sitter 0.25.2/language-pack 0.9.0, tree-sitter 0.26.0/language-pack 1.20.0, and tree-sitter 0.26.0/language-pack 1.22.1 parsed a small Svelte 5 fixture without `ERROR` or missing nodes and with the same selected node types. This does not establish chunker parity or justify upgrading the running sidecar; the newer pack did not change the observed grammar result.
- Direct inspection of chunker 4.0.0's line-scanning helper showed a CRLF offset defect for raw control-flow chunks; the HTTP bridge remapped the tested sidecar output to valid source-byte ranges. Keep the helper's output untrusted unless that bridge diagnostic and exact byte readback are checked.
- Svelte Inspector does not need installation: `@sveltejs/vite-plugin-svelte-inspector` 4.0.1 is already present transitively with `@sveltejs/vite-plugin-svelte` 5.1.1. Inspector remains disabled in `svelte.config.js`; no configuration or runtime change was made. The Neovim injection/textobject advice affects editor highlighting/navigation only, not repository extraction or source identity.
- Immutable cohort receipt: `.tmp/atlas/svelte5-real-component-comparison-db653528-155d-4f98-83d5-e9997ac387d6.json`; canonical JSON checksum `sha256:d314d460566c3a3ab60cd0174c89727dcf29969fef722c8f6af30b86de29f45e`; file checksum `sha256:1bda6bcce7778b4fd0cc7da1d1f73a02c12c83dbd25a29f67c68c09e889578a9`.

Conclusion: retain the current sidecar as bounded parse/chunk observation only; do not upgrade the live container for this result. The official Svelte compiler AST is the better source for proposal-only template/snippet extents. The comparison is a small worktree cohort, not full-corpus or canonical lineage proof.

## Addendum 5: frozen-cohort two-pass AST parity (2026-10-27, read-only)

- Extended `scripts/atlas/lib/svelte-template-chunks-v1.mjs` to emit proposal-only, byte-verified observations for alternate-branch bodies, each context/key and collection expressions, snippet parameters, render callee/arguments, event attributes, bindings, script identifier occurrences and template identifier occurrences. All name occurrences explicitly carry `symbolResolution: NOT_ATTEMPTED`; no name-based target identity is inferred. Compiler AST node types without typed observations and constructs without compiler-provided locations are listed explicitly.
- Added LF and mixed-newline/Unicode fixtures alongside the existing 326-byte CRLF fixture, nested blocks, exact byte-slice readback and independent compiler-AST extent comparisons. Focused tests pass **6/6**. The audit runner performed two passes over the same ten source-hash-pinned components; all replay digests are identical.
- Final receipt `.tmp/atlas/svelte5-template-parity-2026-10-28T00-38-27.930Z-bd52a06b-37dd-4201-b95b-29597ab15220.json` includes exact read-only PostgreSQL membership rows, the admission receipt digest, and current execution status/authority. It reports `BYTE_SLICE_VALID` (0 invalid spans), `SEMANTIC_EXTENT_MATCH` (all targeted AST extents match), and `EXTRACTION_COVERAGE=PARTIAL` (7/10 files include a compiler AST item without an exact source range: `IfBlock.alternate` delimiter or `EachBlock.index`). No selected compiler node types were missing. The report also enumerates AST node types not yet represented as typed observations.
- A read-only PostgreSQL transaction confirmed the ten source digests match the `c63620c4…` membership rows for execution `01a1763a…`; that execution remains noncanonical. A bounded `textDocument/definition` probe for `messages` at byte 2481 in `AgentChat.svelte`, using the exact source and workspace revisions, timed out under Svelte Language Server 0.18.3. No semantic reference, symbol identity or `StructuralReferenceFactV1` was emitted. No production/database writes occurred.
- Retried the same definition request with the existing Svelte TypeScript plugin explicitly enabled and a 30-second timeout; it also returned `LSP_TIMEOUT:textDocument/definition`, with zero targets. Immutable diagnostic receipt: `.tmp/atlas/svelte5-template-lsp-probe-1793148189042-65334065-b1bd-443e-af26-d1298b6e1c82.json`, logical checksum `sha256:bb33bd88ed99b4c0b3e70b1fa2b1650734fe3865065021fc5cf321795cafae88`, receipt checksum `sha256:cdd58e263708a5a30a00bf70b4c9760d65f3fb0cb257625683402fea2c84be90`.
- Receipt logical-content checksum: `sha256:6280b262470cca5ea813607aad54c84ec432c4cadee879183b15967f49d3a638`; receipt checksum: `sha256:08bcd3ae8f53c55eb68053c126cdc9602b4f515ebe270a1f40344edf0691a526`.

Result: byte-slice and targeted semantic-extent checks are verified for this ten-file cohort, but `SVELTE5_BYTE_SPAN_AND_AST_PARITY_READ_ONLY_VERIFIED` is **not reached**. First remaining blocker is `SVELTE_LSP_TEMPLATE_DEFINITION_TIMEOUT`; extraction coverage is separately partial for locationless compiler constructs. Keep Canonical Gate V2 `FAIL`, and do not promote these observations.

## Addendum 4: newer chunker stack vs installed, isolated container (no sidecar change)
Method: throwaway `docker run --rm` from the sidecar image, `pip install --target /tmp/new` (container-local), same exact-bytes fixtures (CRLF + multibyte, 326 bytes; and an LF copy), compared with the official Svelte compiler. Direct `chunker.chunk_file()` calls, not through `/ast/chunk`.
| Stack | Versions |
|---|---|
| Installed (running sidecar) | treesitter-chunker 4.0.0, tree-sitter 0.25.2, tree-sitter-language-pack 0.9.0 |
| Newest supported combination | treesitter-chunker 6.0.0, tree-sitter 0.26.0, tree-sitter-language-pack 1.20.0 (pack 1.22.1 is NOT installable with chunker 6.0.0: pip `ResolutionImpossible`; no `tree-sitter-svelte-next` on PyPI) |
| Fixture | Compiler reference (CRLF): Script 0-112, If 114-179, Each 181-224, Snippet 226-265, Render 267-283. (LF): Script 0-109, If 110-171, Each 172-213, Snippet 214-253, Render 254-270 |
| Construct | 4.0.0 CRLF | 6.0.0 CRLF | 4.0.0 / 6.0.0 LF |
|---|---|---|---|
| script_element | 0-109 (wrong, LF-translated) | 0-112 (correct) | 0-109 / 0-109 (correct) |
| if_block | 110-121 | 110-121 | 110-121 / 110-121 (opening line only; compiler 110-171) |
| each_block | 172-190 | 172-190 | 172-190 / 172-190 (opening line only; compiler 172-213) |
| snippet / render | absent | absent | absent / absent |
Findings:
- Chunker 6.0.0 fixes the CRLF byte span of `script_element` only. Block chunks are still opening-line only, `{#snippet}` / `{@render}` are still absent, and control-flow blocks under CRLF still report LF-normalized offsets (110/172 instead of 114/181). The sidecar's `/ast/chunk` earlier reported 114/181 for the CRLF fixture, so the sidecar layer evidently re-bases them; the mechanism was not inspected.
- Direct library calls drift on CRLF files (offsets relative to LF-normalized text), the failure the sidecar docstring warns about. Do not call `chunk_file` directly for byte spans.
- Conclusion: upgrading does not close the Svelte 5 extraction gap. Template/snippet coverage must come from the compiler-AST extractor. Upgrading the sidecar was not performed.

## Addendum 6: current Svelte 5 grammar candidate lookup (2026-10-28, web-only)

- Firecrawl inspection identifies `themixednuts/tree-sitter-htmlx` as the strongest candidate for an isolated Svelte 5 grammar comparison. The repository contains a distinct `tree-sitter-svelte` crate described as extending HTMLX; the documented interface is Rust/Cargo, not the running Python sidecar.
- The repository page reports latest source commit `c9b9cc3` (`Release 0.1.16 with declaration locals query fix`, 2026-06-02). The separate crates.io `tree-sitter-htmlx-svelte` package page identifies version `0.1.16`; Firecrawl search reported its publication as about 17 days ago, but the scraped package page did not expose a publication date. Treat package publish timing as unverified and distinguish it from the repository commit date.
- The public Svelte crate test directory includes `runes.rs`, `snippet_blocks.rs`, `render_tags.rs`, `if_blocks.rs`, `each_blocks.rs`, `await_blocks.rs`, `script_elements.rs`, and `recovery.rs`. These are useful candidate tests, not proof of complete compiler parity, exact UTF-8 spans, semantic binding, or production fitness. The listing did not establish dedicated event-attribute/binding tests.
- Comparator candidates are weaker: `PRRPCHT/tree-sitter-svelte-next` advertises Tree-sitter 0.25+ but its repository page shows four commits, no releases, and latest commit 2026-02-11; `tree-sitter-grammars/tree-sitter-svelte` shows latest commit 2024-10-19. Neither is established as a better fit than the HTMLX Svelte crate.
- No package was installed, no repository was cloned, and no sidecar or project dependency was changed. Next safe evaluation is a disposable Rust harness running the published `tree-sitter-htmlx-svelte` crate against the frozen LF/CRLF/mixed-newline + Unicode fixtures and comparing CST coverage, `ERROR`/missing nodes, and exact byte slices against the Svelte compiler receipt. Do not use this grammar as the semantic/LSP authority.

Sources: [candidate repository](https://github.com/themixednuts/tree-sitter-htmlx), [published crate](https://crates.io/crates/tree-sitter-htmlx-svelte), [Svelte crate tests](https://github.com/themixednuts/tree-sitter-htmlx/tree/main/crates/tree-sitter-svelte/tests), [tree-sitter-svelte-next](https://github.com/PRRPCHT/tree-sitter-svelte-next), [community Svelte grammar](https://github.com/tree-sitter-grammars/tree-sitter-svelte).

## Addendum 7: disposable grammar comparison (2026-10-28, read-only fixture)

- Compiled `tree-sitter-htmlx-svelte` 0.1.16 with Tree-sitter 0.26.13 in an ephemeral `rust:1.95-slim` container. The fixture directory was mounted read-only; the container was removed after the run. A direct Windows build did not run because this host lacks the C standard headers (`stdio.h`), so it is not counted as a parser failure.
- The same frozen 326-byte CRLF fixture, LF copy, and mixed-newline variant used the Svelte compiler extractor as the span reference. All three grammar parses had `hasError=false`, zero `ERROR`/missing nodes, and all recursively visited node ranges sliced valid UTF-8 source boundaries.
- Selected Tree-sitter node ranges exactly matched the compiler extractor for all three variants: CRLF `if_block 114–179`, `each_block 181–224`, `snippet_block 226–265`, `render_tag 267–283`; LF `110–171`, `172–213`, `214–253`, `254–270`; mixed newline `114–178`, `180–223`, `225–264`, `266–282`. The grammar exposed the targeted control-flow/snippet/render nodes. It parsed `<script>` as a generic element/raw text (no `script_element`, TypeScript, or rune node types appeared), and represented `onclick` as a generic attribute; embedded-script semantics and directive-specific extraction are not evidenced by this fixture.
- Result: `FIXTURE_PARSE_AND_SPAN_PARITY=PASS` for this bounded fixture only. This does not establish complete Svelte grammar coverage, language-server binding, extraction of all constructs, production suitability, or sidecar compatibility. No project dependency, running sidecar, canonical data, or service was changed. Temporary harness: `.tmp/atlas/svelte-grammar-compare/`.

## Addendum 8: hash-pinned Svelte cohort comparison (2026-10-28, disposable/read-only)

- Reused the ten-file source cohort from the independent Svelte compiler parity receipt `.tmp/atlas/svelte5-template-parity-2026-10-28T00-38-27.930Z-bd52a06b-37dd-4201-b95b-29597ab15220.json`. SHA-256 was checked against the sealed receipt immediately before parsing and again after; all ten files matched.
- Ran `tree-sitter-htmlx-svelte` 0.1.16 / Tree-sitter 0.26.13 in an ephemeral Rust container with the repository mounted read-only. Ten of ten parsed without `ERROR`/missing nodes; all visited CST byte ranges were valid UTF-8 slice boundaries.
- Compared structural node counts with the compiler receipt: exact counts for `each_block`, `snippet_block`, and `render_tag`; `if_block` counts differ in three files (`AnalysisPanel.svelte`, `SuggestionsList.svelte`, `+page.svelte`). The compiler receipt also records 33 unlocated constructs across the cohort. The grammar emitted zero `script_element` nodes, so embedded script/rune structure is not covered by this grammar result.
- Receipt `.tmp/atlas/svelte-htmlx-cohort-compare-20261028-v1.json`, logical checksum `sha256:8e846350c3a8f12d407d3886a1622b275a890d9c04d1ad58a09fc5b73bacf2e5`. Verdict: `COHORT_PARSE_PASS_STRUCTURAL_COVERAGE_PARTIAL`; this is not full span-to-compiler parity, language-server binding, sidecar compatibility, or canonical evidence. No production service, package dependency, datastore, or graph was changed.
- First grammar-cohort blocker: `SVELTE_HTMLX_IF_BLOCK_COUNT_MISMATCH` in three frozen components. Keep the grammar as an isolated comparison candidate; do not integrate or replace existing extraction owners on this evidence.

## Addendum 9: Tree-sitter chunker 4 vs 6 Svelte 5 comparison (2026-10-28, disposable/read-only)

- Reused the exact 326-byte CRLF/Unicode fixture, its LF copy, and the same ten SHA-256-pinned real Svelte components from the prior compiler parity receipts. The repository mount was read-only in an ephemeral container based on `deeds-miniforge-nlp-sidecar:latest`; v6 dependencies were installed only under the container's `/tmp/chunker-v6` target. The running `:8095` sidecar and project dependencies were not changed.
- Versions: v4 = `treesitter-chunker 4.0.0` / `tree-sitter 0.25.2` / pack `0.9.0`; v6 = `6.0.0` / `0.26.0` / pack `1.20.0`. The pinned v1.20.0 pack catalog identifies Svelte as `Himujjal/tree-sitter-svelte`, ABI 14, with bundled highlight/injection/local/indent/fold/tag queries ([pinned catalog](https://github.com/xberg-io/tree-sitter-language-pack/blob/v1.20.0/README.md)). This is not the separate Rust `tree-sitter-svelte-next` crate. The runtime Python Language object reports ABI 14 but does not expose its source revision.
- Fixture comparison against the existing official Svelte compiler extent reference: expected CRLF spans are script `0–112`, if `114–179`, each `181–224`, snippet `226–265`, render `267–283`. V6 fixes only the script end (`0–112` vs v4 `0–109`). Both produce truncated if/each spans (`110–121`, `172–190`) and omit snippet/render. On LF both script spans are `0–109`; template blocks remain truncated and snippet/render remain absent. Direct chunker offsets on CRLF otherwise reflect LF-normalized input and must not be treated as source-byte coordinates.
- Frozen 10-file cohort: each version emitted 197 chunks (147 if, 34 each, no await/key/snippet/render). Compiler reference emitted 203 target structures: 16 exact extent matches, 165 truncated/extended, 22 compiler-start structures not emitted, for both v4 and v6. One file has a parser error in each run. Raw chunker metadata has zero references, dependencies, imports, exports, calls, or symbol IDs; the source cohort itself contains 53 import statements, 89 rune occurrences, 1,337 compiler-observed template identifier occurrences, and 66 event attributes. These source counts are inventory signals, not extraction results.
- Independent source-slice check: v4 chunks: 0 exact raw-byte slices / 197 LF-normalized slices mapping back to matching source; v6: 16 exact raw-byte slices / 181 LF-normalized slices mapping back to matching source. Thus v6 improves a limited CRLF span case, not Svelte 5 structural extraction or general byte-coordinate correctness.
- Receipt generation replay over the same frozen inputs produced the same normalized logical checksum twice: `sha256:467954862a7cf3966ceaf5c7bc9b991cb5aa2e9e8637c97c4daaa40a6c4fe705`. Process-specific native pointer values were excluded from the checksum. The receipt records per-file compiler extent comparisons and source-level imports/runes/events. This replay verifies deterministic receipt construction from the captured parser outputs; it is not a second independent parser execution.
- Verdict: `COMPARISON_COMPLETE_WITH_GAPS`; `TREESITTER_CHUNKER_V6_SVELTE5_PARITY_READ_ONLY_VERIFIED` is **not achieved**. V6 does not improve cohort extraction over v4; it only corrects the CRLF `script_element` fixture span. No isolated upgrade proposal is recommended. Keep the compiler-AST extractor as the template-structure owner and Svelte LSP as the independent symbol-resolution owner; template-to-symbol/LSP resolution remains unproven. Canonical Gate V2 remains `FAIL`.
- Receipt: `.tmp/atlas/treesitter-chunker-v6-svelte5-parity-20261027-v1.json`. No datastore, Graphify, registry, graph, index, service, or production package writes occurred.

## Addendum 10: ast-grep Svelte 5 capability probe (2026-10-27, read-only)

- The pasted `Invalid Kind function` error is addressed in the current enclosing-declaration helper: `validKindsFor()` probes each candidate against the loaded grammar and filters unsupported kinds. Its focused tests pass. Do not use `function` as a universal ast-grep kind.
- A synthetic Svelte 5 component with a TypeScript script, `$state`, `$derived`, import, named function, `{#snippet}` and event handler passed through the existing helper. It returned the import, rune bindings, function and snippet name; the declaration span read back correctly from the `.svelte` UTF-8 bytes. Combined focused suites: 13/13 pass.
- Direct CLI test distinguishes the boundary: `ast-grep --lang svelte` exits 2 (`svelte is not supported`); the same `$state(...)` pattern over the extracted TypeScript script succeeds. The helper is therefore not parsing the whole Svelte component: it extracts `<script>` with a regex, parses that region as TS/JS, and recognizes snippet names with a regex. It does not structurally parse template expressions, control-flow blocks, event attributes or snippet bodies, and it does not establish LSP bindings or canonical symbol identity.
- Receipt `.tmp/atlas/svelte5-ast-grep-probe-20261027-v1.json`, checksum `sha256:135f15f95048455cb44942e4379b5f0053ce7ac0db3dee81b0caafd51f86248a`. No application, parser dependency, sidecar, or datastore was changed. Keep compiler AST as the template structure owner and Svelte LSP as the symbol-resolution owner.

## Addendum 11: configured HTML grammar against Svelte 5 syntax (2026-10-27, read-only)

- Verified `sgconfig.yml` maps `*.svelte` to ast-grep's built-in `html` grammar; the config describes it as a challenger, not the Svelte compiler authority. Parsed a fixture with `@ast-grep/napi` `Lang.Html`.
- The grammar recognized four ordinary HTML elements and a `script_element`, but treated script contents/runes as opaque `raw_text`. It produced five `ERROR` nodes on Svelte control-flow and arrow-event syntax; `{#snippet}`, `{/snippet}` and `{@render}` appeared as ordinary text rather than structural nodes. Template interpolations likewise remained text.
- Verdict: `HTML_MARKUP_ONLY_SVELTE_SYNTAX_UNSUPPORTED`. Do not use this grammar to derive Svelte control-flow, template-expression, event-handler, or symbol facts. The extracted-script TypeScript route remains useful for script-only analysis; the official Svelte compiler AST remains the template structure owner and LSP remains the binding verifier.
- Receipt `.tmp/atlas/svelte5-ast-grep-html-grammar-probe-20261027-v1.json`, checksum `sha256:564dd2f9ebee34acf7bec8013c45a6a8e65210dd3050df35a0ee0021f329dfe8`. No code, dependency, service, or datastore changes.

## Addendum 12: canonical Svelte symbol-version coverage (2026-10-27, read-only)

- Fresh read-only PostgreSQL census for execution `01a1763a-4355-71d7-9b81-2c7a1814a41f`, `repo:root`: 949 distinct Svelte membership paths, 933 exact-path Graphify file rows, all 933 `UNPROCESSED`, zero associated `graphify_symbols`, and zero Svelte rows in `atlas_symbol_versions` (32,897 rows total; 42,922 symbol registry identities total).
- Sixteen membership paths have no exact `graphify_files` path. A separate `atlas_ast_nodes` census found 1,477 Svelte rows over 844 paths, but none has a source revision or workspace identity. Those structural rows are not eligible symbol identity evidence.
- The existing reconciliation writer consumes `graphify_symbols` joined to `graphify_files` and exact revision bindings. With no Svelte symbol input rows, its zero Svelte output is explained by upstream extraction/processing coverage; it is not evidence that the writer should be bypassed. The older 937-file / 383-use attribution sample is not interchangeable with this refreshed 949-path membership census.
- Prior Svelte template-definition LSP query timed out; not retried. LSP binding remains unverified. Relation contract review found `CALLS` only for `Symbol -> Symbol`; there is no `TESTS` or `TESTED_BY` type. No enum changes proposed; static test association and runtime coverage require separate evidence contracts.
- Receipt `.tmp/atlas/svelte-symbol-identity-gap-20261027-v1.json`, body checksum `sha256:f605a8eeb27704a1aee9899d540c39ae7f7834f6208d6de9df1bc80badad0289`. No data writes. First blocker: upstream Svelte structural extraction and the 16 unmatched paths; canonical admission remains blocked.
