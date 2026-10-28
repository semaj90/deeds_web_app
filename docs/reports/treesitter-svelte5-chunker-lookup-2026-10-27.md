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
