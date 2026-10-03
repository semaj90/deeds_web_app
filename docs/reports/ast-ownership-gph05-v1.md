# GPH-05 AST ownership audit (read-only)

Date: 2026-09-24
Change: `parent-atlas-code-ingestion-pipeline`
Result: `GPH_05_OWNER_PARTIAL`

## Execution

Ran `node scripts/atlas/audit-ast-ownership.mjs` without `--write`.
Result: `PROVEN_AUDIT`; lifecycle validity, registry-based caller enumeration,
replacement-candidate presence, and no-superseded-import detection all passed.
The command reported one live caller and two importers for
`scripts/atlas/knowledge-layer/ast-extractor.ts`, while direct repository search
found its `parseAndExtract` export only through
`scripts/atlas/knowledge-layer/index.ts`. The audit is a static text matcher and
its stdout omits caller paths; its status therefore proves the script's scan
completed, not canonical production ownership. The persisted
`docs/reports/ast-ownership-receipt.json` is dated 2026-08-14 and is historical.

The requested `scripts/atlas/verify-traces-3f.mjs` was not present at that path
and no file of that name was found in the repository scan.

## Owner matrix

| Classification | Entrypoint / caller | Extractor and output contract | Identity / revision | Consumer and persistence | Fallback / reachability / canonical IDs |
|---|---|---|---|---|---|
| `MIGRATION_CANDIDATE` | `scripts/atlas/knowledge-layer/index.ts` re-exports `parseAndExtract`; no direct runtime caller found | `scripts/atlas/knowledge-layer/ast-extractor.ts`; legacy `ASTResult` symbols/edges/errors | Emits a local `id` based on language, row, and name; shown implementation does not accept source revision as input; spans/locations are not canonical identity | Barrel only; no canonical persistence consumer established | No explicit fallback or proven production reachability; emitted IDs are not shown to be GIS canonical IDs |
| `MIGRATION_CANDIDATE` | `scripts/graphify/stages/stage1-structural-extract.py` invokes `scripts/graphify/lib/ts-ast-extractor.mjs` | Tree-sitter symbol JSON/`tree_node_ids` | Stage selects packet identity/source reference and `sha256`; its selected packet fields do not establish `source_revision` qualification | Updates `atlas_packets.payload.tree_node_ids` | Executable Graphify stage with a write path; this is not proof of canonical `symbol_id` ownership. No owner cutover was observed |
| `MIGRATION_CANDIDATE` | `sveltekit-frontend/scripts/atlas/ast-treesitter-facts.mjs` (explicit CLI) | web-tree-sitter facts: `tree_node_id`, `ast_symbols`, imports, exports | Documented tree-node derivation includes source ref, language, kind, name, and line; no source revision participates | With `--apply`, updates `codebase_chunk_index.ast_symbols`, `ast_imports`, `ast_exports`, and `ast_facts_at`; requires/executes DDL for columns | Explicit dry-run/apply switch; independently executable projection writer, not a demonstrated canonical symbol-registry owner |
| `CANONICAL_RUNTIME_OWNER` (structural evidence only; not canonical symbol identity) | `AST_CHUNK` operation and live structural-lane adapter | `GraphifyStructuralMaterializer` → 8095 `POST /ast/chunk` → `atlas.ast.evidence.v1` | Receives source revision; uses an anchor token when revision authority is unproven; readiness blocks canonical promotion when revision/provenance is insufficient | Materializer returns `persistence: NOT_ATTEMPTED`; GIS symbol resolution/persistence is separate | Typed status/diagnostics and `fallback: NONE`; no stable `symbol_id`/`symbol_version_id` minted by this layer |
| `SHADOW_REPLACEMENT` | `NodeTreeSitterAstProvider`, injected into `GraphifyStructuralMaterializer` in parity/tests | Native Node Tree-sitter structural-evidence provider | Parser/grammar revisions reported; identity normalization remains downstream | No independent persistence path established | Bounded parity evidence is not runtime owner selection; no canonical IDs emitted by provider |
| `CANONICAL_RUNTIME_OWNER` (Graphify symbol-table path; canonical identity status unresolved) | `scripts/atlas/graphify-symbol-extractor-v1.mts`; default parser is `ts-ast-extractor.mjs`, optional `--use-lsp` switches producer | Extracted code symbols and embedded Markdown-fence symbols persisted to `graphify_symbols` | Reads `source_revision` and workspace revision from `graphify_files`; `stableSymbolKey` uses `file_id`, kind, qualified path; `graphify_symbols` insert shown here does not persist source/workspace revision | `graphify_symbols` table; `atlas_ast_nodes` is a separate writer path for document structure | Explicit dry-run default / `--apply`; parser choice is an explicit flag, not first-result selection. Competes as a durable symbol output owner with GIS registry, but equivalence/canonical authority and revision lifecycle are not established |
| `FALLBACK` / parallel feature extraction | Analysis worker → `extractAstAndEntities` → `ast-langextract-bridge`; also source/POS packet builder | Miniforge analysis features plus local `ast-grep` features; returns `ExtractedFeature[]` | Context may qualify feature evidence with source/workspace/provider revisions; without context marks it unqualified; feature output has no canonical symbol identity | Analysis worker writes feature/edge records and synchronizes Qdrant tags; source/POS builder embeds extracted names in a derived packet | Sidecar errors are diagnostic; local AST-Grep runs for code and feature lanes are aggregated/deduped, not selected as one canonical AST result. No `symbol_id` owner here |
| `MIGRATION_CANDIDATE` (projection-only writer) | `Graphify` daily stage runner / `index-full-repo-for-search.mjs` AST chunk path | AST-derived chunk/fact projections | Source path and parser metadata are visible; exact canonical revision handoff is not established by this audit | Writes code-chunk / retrieval projection data; not the GIS symbol registry | CLI reachability exists; canonical ownership and fallback composition remain unproven |
| `CANONICAL_RUNTIME_OWNER` (canonical symbol identity/admission only) | GIS symbol nomination/resolution/version registry | Existing nomination → `symbolResolutionSchema` → `symbolVersionSchema` contract | `stable_symbol_id` independent of source revision; `symbol_version_id` revision-bound; byte spans are version evidence | `atlas_symbol_registry` and `atlas_symbol_versions`; focused mock-pool identity test, not live readback | Explicit `allow_create` gate; canonical identity owner is distinct from parser/extractor owner |

## Invariant assessment

1. **Exactly one production AST extraction owner:** not proven. Multiple distinct
   executable producers and projection writers remain, and no single owner/cutover
   receipt connects all production callers.
2. **Parity does not imply ownership:** preserved; GPH-03 is bounded parity only.
3. **Stable `symbol_id` / revision-bound `symbol_version_id`:** code-level GIS
   registry test evidence exists (GPH-04); no new live registry readback performed.
4. **Spans are evidence, not identity:** consistent with the GPH-04 registry
   contract; legacy line-derived tree node IDs remain a separate projection identity.
5. **No first-result consumer:** not established globally. The analysis bridge
   aggregates/deduplicates multiple feature sources, while Graphify has separate
   provider and writer paths.
6. **Fallback explicit and typed:** explicit in the new structural materializer
   (`fallback: NONE`, status/diagnostics); legacy/analysis and Graphify stage
   fallback behavior is not shown to converge on that boundary.
7. **Legacy cannot write after cutover:** not applicable/proven because no owner
   cutover has occurred. Existing explicit-write paths remain.

## Disposition

`GPH_05_OWNER_PARTIAL`: the canonical symbol identity/admission owner is identified,
and the replacement structural provider is revision-aware, but production AST
extraction and projection paths are not proven to converge on one canonical owner.
Keep GPH-06 and production owner transition open. No lifecycle change, Graphify
run, database/cache/projection write, or source mutation was performed.
