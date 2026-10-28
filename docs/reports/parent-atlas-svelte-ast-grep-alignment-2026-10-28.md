# Svelte and ast-grep alignment: how it works, what is wrong, how to improve (2026-10-28)
**Status**: audit plus focused span-preserving extractor update | **ast-grep**: 0.45.3 | **Svelte**: 5.53.3 | **Gate**: Canonical Gate V2 FAIL

## TL;DR
ast-grep has **no Svelte language**. `sgconfig.yml` maps `*.svelte` to the **HTML** grammar. The CLI injects `<script>` as TypeScript/JavaScript; its config comments distinguish that from the Node binding, which does not inject. HTML parsing remains wrong for template syntax (`{#if}`, snippets, handlers produce ERROR nodes). The symbol adapter now reuses the span-carrying script splitter and compiler-AST snippet observations. The correct split remains: ast-grep for script structure, Svelte compiler AST for template structure. Several Svelte splitters still need one owner.

## 1. How it works today (layers)
| Layer | Component | What it does for `.svelte` | Evidence |
|---|---|---|---|
| Files | `*.svelte`, `*.svelte.ts` / `.svelte.js` | `.svelte.ts` is plain TypeScript to ast-grep (the glob `*.svelte` does not match it) | Tested: `store.svelte.ts` with `$state` parsed as TypeScript |
| Config | `sgconfig.yml` (root, tracked, commit `e1cbfd49614`, 2026-10-17) | `languageGlobs: html: ["*.svelte"]`, `ruleDirs: []` (no rules) | File read; not git-ignored |
| ast-grep CLI | built-in HTML host language | Script injection: `lang="ts"` is TypeScript, no `lang` is JavaScript, `<script module>` works. Offsets are absolute file bytes | Clean-directory test with only the repo config (below) |
| ast-grep Node binding | `parse(Lang.Html, src)` in repo libs | **No injection observed**: the script body is one `raw_text` node; `{#if` gives `text` + `ERROR`. Repo libs therefore extract script blocks themselves and parse them as TS/JS | Node dump of a Svelte 5 fixture. `findInFiles` was not tested |
| Symbol extraction | `scripts/atlas/lib/ast-grep-symbol-extraction.mjs` | Regex block extraction (`<script...>([\s\S]*?)</script>`) returns **text only, no offsets**; three rune patterns (`$state`, `$derived`, `const $derived`); snippet names by regex `{#snippet name(` | Code read |
| Compiler splitter | `svelte-dom-splitter-v1.mjs` | Template nodes, runes and event handlers with UTF-8 byte spans, via `svelte/compiler`; fail-closed | Header read |
| Cross-check | `svelte-rune-crosscheck-v1.mjs` | Compiler splitter vs ast-grep on extracted script text; two independent parsers must agree | Header read |
| This session | `svelte-script-scope-v1`, `svelte-template-chunks-v1`, `svelte-template-references-v1`, `enclosing-declaration-v1` | Script scope with UTF-8 offsets; template block extents; scope-resolved template references; enclosing declarations | Committed; 937/937 components parsed |
| Sidecar | `:8095 /ast/chunk` (treesitter-chunker 4.0.0) | Script is one fragment; `if`/`each` opening line only; no snippet/render | Probed |
| LSP | svelte-language-server 0.18.3 | Template definition queries time out | Other session's receipts |

## 2. Verified behaviour of the ast-grep CLI on Svelte
Clean directory, only the repo's `sgconfig.yml`:
| File | Pattern | Language reported | Bytes |
|---|---|---|---|
| `<script lang="ts">` | `let $A = $state($B)` | TypeScript | 60-82 |
| `<script>` (no lang) | same | JavaScript | 11-29 |
| `<script module lang="ts">` + `<script lang="ts">` | `const $A = 1`, `let $A = $state($B)` | TypeScript | 35-52, 84-102 |
| CRLF + emoji + accents before the script | `let $A = $state($B)` | TypeScript | 69-91; **readback of the bytes equals the match text** |
Byte offsets were hand-checked against the source for two of the files.

## 3. What the HTML grammar gets wrong (template)
Parsing a Svelte 5 component with the HTML grammar:
| Construct | Result |
|---|---|
| `<p class="a">`, `<li>` | correct `element` nodes |
| `{#if n > 0}` | `text` + `ERROR` nodes |
| `{/if}`, `{#snippet row(x)}`, `{/snippet}`, `{x}` | plain `text` (no structure) |
| `<button onclick={() => n++}>` | `ERROR` nodes at the arrow function; attribute value split |
Consequence: never use ast-grep patterns on `.svelte` for blocks, snippets, render tags or handlers. Matches would be wrong or silent.

## 4. Gaps
| # | Gap | Impact |
|---|---|---|
| G1 | `sgconfig.yml` accurately distinguishes CLI injection from Node binding behavior | Resolved in config |
| G2 | Symbol extraction previously used regex for blocks/snippet names and dropped offsets | Fixed for script offsets and compiler-AST snippet spans; exact byte-readback tests pass |
| G3 | `ruleDirs: []`: no ast-grep rules for Svelte 5 conventions | Rune/legacy checks (`export let`, `$:`, `on:click`, `<slot>`) are not structural gates |
| G4 | At least four Svelte splitters overlap (dom-splitter, template-chunks, template-references, the other session's observations) | Duplicate-owner risk; see ownership rules |
| G5 | Node binding does not inject; CLI does | The same query behaves differently in CLI vs library code |
| G6 | No Svelte language for ast-grep, no template-level structural matching | Only the compiler AST can see template structure |
| G7 | Svelte files have no symbol-version rows (0 of 937) and component default exports are implicit | Component edges cannot reach a symbol version (see relation pipeline report) |

## 5. How to make it better (ranked)
| # | Change | Effort | Risk | Why |
|---|---|---|---|---|
| 1 | Correct the `sgconfig.yml` comment | done | none | CLI/Node distinction is documented |
| 2 | Replace adapter-local regex extraction with offset-carrying `extractScriptBlocks` and compiler-AST snippet names | done | low | Exact UTF-8 observation spans are tested |
| 3 | Add ast-grep YAML rules under `ruleDirs` for script-level Svelte conventions (runes present; legacy `export let`, `$:`, `createEventDispatcher` absent) | small | low | Fixes G3; structural, replaces text grep gates. Template-level legacy checks (`on:click`, `<slot>`) are untested with the HTML grammar |
| 4 | Three-way agreement harness over the 937 components: CLI-injected ast-grep rune matches vs compiler splitter vs `svelte-script-scope-v1`, with byte readback and a checksummed receipt | medium | low | Extends the existing two-way rune cross-check |
| 5 | Choose one owner for Svelte template structure (compiler-based) and make the others thin consumers; run `npm run atlas:audit:ownership` | medium | low | Fixes G4 |
| 6 | Test whether the Node binding can use the CLI's injection path (`findInFiles` with `sgconfig`) | small | none | Fixes G5 if yes |
| 7 | Custom Svelte language via `customLanguages` (compiled grammar `.dll` + `languageInjections`) | large | medium (native code, grammar gaps, supply chain) | Only if template-level structural matching in ast-grep is needed; the compiler already covers it. Keep as a challenger |

Do not: install an unverified grammar crate, build `themixednuts` crates, fork a grammar, or replace the compiler as the correctness reference.

## 6. Open questions
- Does the Node binding's `findInFiles` honour `sgconfig.yml` injection? (untested)
- Does the HTML grammar match legacy template attributes such as `on:click` and the `<slot>` element reliably? (untested)
- Which splitter becomes the single template owner? (decision)
- Is a Svelte-aware ast-grep language worth the native-code maintenance? (decision; recommendation: no for now)

## Sources
- [ast-grep custom language support](https://ast-grep.github.io/advanced/custom-language.html)
- [ast-grep sgconfig reference](https://ast-grep.github.io/reference/sgconfig.html)
- [Svelte 5 ast-grep rules (custom parser)](https://sveltethemes.dev/jvz-devx/ast-grep-svelte-rules)
- Local: `sgconfig.yml`, `scripts/atlas/svelte-dom-splitter-v1.mjs`, `scripts/atlas/svelte-rune-crosscheck-v1.mjs`, `scripts/atlas/lib/ast-grep-symbol-extraction.mjs`

## Addendum: span-preserving ast-grep symbol observations (2026-10-27)

- `ast-grep-symbol-extraction.mjs` now reuses `extractScriptBlocks()` for `.svelte` scripts, carrying each script's UTF-8 base offset into observations. Snippet names and complete snippet spans come from the existing Svelte compiler-AST chunk owner. The public `symbols` string list remains compatible; `observations` is additive.
- A CRLF/Unicode/multiple-script fixture checks original-byte readback for imports, runes, declarations, module-script functions, and snippets. Focused extractor/template/scope tests pass 29/29.
- Existing read-only rune fusion over 937 components reports 6,202 `AGREED_INDEPENDENT`, zero compiler parse errors, and deterministic two-pass output digest `sha256:ce6d115595d1b148788f3e15f94d11cfcfe798efb969144af3bd03b6ef77eed5`. Receipt `.tmp/atlas/svelte-rune-fusion-after-span-extractor-20261027-v1.json`; receipt checksum `sha256:82467a07b2139522ea30dd12caff95a73d49bd69f6f42e9c84a562c3435b5d7f`.
- The separate Tree-sitter v6 comparison still fails parity and is not a source of authority. Svelte LSP template binding remains unverified after the prior bounded definition timeout. NB trust-gate tests pass 3/3 after deferring the scikit-learn import until trust checks finish; the combined suite has 7 model-test errors because local `scikit-learn` is unavailable. No dependency was installed. With no verified human labels, classifier accuracy and learned reranking remain unproven. No service or datastore changed.
