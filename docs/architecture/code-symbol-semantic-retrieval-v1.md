---
documentStatus: ACTIVE_SUPPORTING
topicIds:
  - code-symbol-semantic-retrieval
---

# Code-Symbol Semantic Retrieval for Agentic DAG Synthesis V1

- Status: DESIGN / NOT WIRED / NOT ADMITTED
- Authority: existing Parent Atlas source, symbol, chunk-semantic, and retrieval owners
- Task: [`SYMBOL-SEMANTIC-RETRIEVAL-01`](../../openspec/changes/parent-atlas-compiler-semantic-graph-resolution/tasks.md)
- Related design: [Domain Classification and Agentic Retrieval Alignment V1](../.okf/architecture/domain-classification-and-agentic-retrieval-v1.md)

## Goal

Allow agentic DAG synthesis to retrieve exact code-symbol evidence plus semantic context without
creating a second symbol registry, embedding authority, or retrieval/fusion owner. This is a
planned integration: existing symbol indexing and chunk semantic search do not yet prove a
revision-qualified symbol-semantic retrieval path with a real DAG caller.

## Existing owners to compose

| Concern | Existing owner | Use and boundary |
| --- | --- | --- |
| Canonical symbol version | `atlas_symbol_versions` in `sveltekit-frontend/src/lib/server/db/schema/atlas-structural-intelligence.ts` | `symbolVersionId` plus exact `sourceRef`, `sourceRevision`, `workspaceRevision`, and source span. Never replace it with a compiler symbol, qualified name, AST node, path, or ordinal. |
| Callable projection | `atlas_callable_search` in the same schema | Rebuildable lexical/metadata lookup projection; not canonical identity or a vector authority. |
| TS/JS semantic extraction | `sveltekit-frontend/src/lib/server/atlas/language/ts-morph-semantic-enrichment.ts` and existing LSP/compiler owners | Definitions, types, references, and project-aware relationships, bound to the exact source/config revision. |
| Polyglot syntax | Existing Tree-sitter/CST and ast-grep owners | Tree-sitter supplies syntax nodes/ranges; ast-grep narrows structural candidates. Neither alone proves compiler semantics or Atlas identity. |
| Dense semantic retrieval | Existing canonical `semantic_768` chunk lane | Search descriptive, source-grounded chunk text. A bare symbol-name embedding or same-dimension vector is not proven symbol-level representation parity. |
| Fusion and context | `sveltekit-frontend/src/lib/server/retrieval/search-runtime.ts` and existing ContextManifest/ACE owners | Normalize/deduplicate once by canonical identity, fuse once, then pass only validated bounded evidence to synthesis. |
| Agentic control | Existing OaK function catalog and PrimeAgent/FSM/DAG | The read function returns evidence; deterministic policy chooses the next step; model output does not authorize execution or writes. |

## Recommended function module

Add one typed, read-only OaK function to the existing function catalog:

```ts
oak.find_symbol_evidence(query, scope, budget)
```

It composes exact symbol/name lookup, lexical search, compiler/LSP or AST evidence, and semantic
candidate retrieval only when the symbol-to-source/chunk and representation joins qualify. Its
receipt should bind request/profile/function revisions, canonical `symbolVersionId` and packet/source
references, source/workspace revisions, byte spans, lane provenance, budgets, and output checksum.
It returns explicit `UNAVAILABLE` reasons for unqualified lanes; missing graph/semantic evidence is
not a numeric zero. SearchRuntime remains the only cross-lane fusion owner.

## Language-library nuances

- **TypeScript/JavaScript:** prefer the TypeScript Compiler API or existing ts-morph/LSP integration
  for symbol/type/reference semantics. The compiler's `Symbol` is a compiler-internal semantic
  object, not the Atlas `symbolVersionId`; project configuration and source revision affect results.
- **Multiple languages:** use the existing Tree-sitter grammars for consistent CST nodes and byte
  ranges. Treat them as syntax evidence; compiler-specific type/reference facts require the relevant
  language server/compiler provider.
- **Structural pruning:** ast-grep's Node API is documented as experimental. Keep its matches as
  bounded candidates/refinement evidence, not canonical edges or identity.
- **Semantic search:** first retrieve source-bound chunks using the current recipe; join hits to
  symbol versions through exact source/chunk coordinates. Define and evaluate a separate symbol-text
  recipe before considering any symbol-vector population.
- **Agentic synthesis:** produce a ContextManifest from validated evidence, then let the existing
  FSM/DAG call the allow-listed function. No raw lane hits go directly to the model.

## Proof gates

1. Resolve one fixture symbol uniquely to `symbolVersionId`, exact source/workspace revisions, and a
   byte-verified span; reject stale/ambiguous identity.
2. Demonstrate exact chunk-to-symbol join for semantic candidates, or report that lane unavailable.
3. Emit a deterministic function receipt and prove a read-only DAG/ContextManifest caller consumes
   it under fixed candidate/time/token budgets.
4. Compare against the existing exact/lexical/compiler baseline before any ranking change.
5. Consider persistence or an index only after a measured query-plan bottleneck and a reviewed
   representation contract. No DDL, embedding backfill, Qdrant/Valkey write, or production ranking
   change is authorized by this document.

## Code capability knowledge cards — CODE-KNOW-01..18

The repo-local `.okf` card set is a design-only, non-authoritative documentation projection. Keep
the existing `kind` vocabulary unchanged (`Concept` remains the base kind); use optional
`spec.card_kind` for the seven typed variants. The current contract is in
[`docs/.okf/schema.yaml`](../.okf/schema.yaml) and
[`.okf/indexes/code-capability-knowledge-v1.yaml`](../../.okf/indexes/code-capability-knowledge-v1.yaml).
The corresponding open implementation gates are tracked in
[`tasks.md`](../../openspec/changes/parent-atlas-compiler-semantic-graph-resolution/tasks.md).

1. **CODE-KNOW-01 — owner:** confirm the repo-local schema and `.okf/manifest.yaml` registry own this projection.
2. **CODE-KNOW-02 — compatibility:** make `spec.card_kind` optional for existing cards.
3. **CODE-KNOW-03 — base kind:** preserve `kind: Concept`; do not extend the base `kind` enum.
4. **CODE-KNOW-04 — identity:** resolve `canonical_id` and `packet_key` from existing Atlas owners only.
5. **CODE-KNOW-05 — revisions:** distinguish exact `source_revision` from admitted `workspace_revision`.
6. **CODE-KNOW-06 — evidence:** bind evidence references and citations to exact source coordinates.
7. **CODE-KNOW-07 — symbol:** require an existing `symbol_version_id` for SymbolKnowledgeCard.
8. **CODE-KNOW-08 — module:** require a source-qualified `module_ref` for ModuleKnowledgeCard.
9. **CODE-KNOW-09 — package:** require a source-qualified `package_ref` for PackageKnowledgeCard.
10. **CODE-KNOW-10 — library:** bind LibraryKnowledgeCard to a named library and explicit version scope.
11. **CODE-KNOW-11 — validator:** bind ValidatorKnowledgeCard to existing validator ID and revision.
12. **CODE-KNOW-12 — artifact:** bind GeneratedArtifactBindingCard to artifact checksum and exact input refs.
13. **CODE-KNOW-13 — agent:** describe AgentCapabilityCard allowed moves without granting execution permission.
14. **CODE-KNOW-14 — semantics:** keep capabilities, constraints, validators, and dependencies typed and descriptive.
15. **CODE-KNOW-15 — authority:** every card has `canonical_authority: false`; no card mints identity or promotes ontology.
16. **CODE-KNOW-16 — transport:** any Pydantic mirror rejects extra fields and validates transport only.
17. **CODE-KNOW-17 — OpenWiki:** publish cards only as DERIVED_DOCUMENTATION, never as evidence or authority.
18. **CODE-KNOW-18 — admission:** validate schema/checksum/revisions before any future population; no tables, DDL, backfill, or projection writes in this tranche.

## References

- [TypeScript Compiler API](https://github.com/microsoft/TypeScript/wiki/Using-the-Compiler-API)
- [TypeScript Language Service API](https://github.com/microsoft/TypeScript/wiki/Using-the-Language-Service-API)
- [Tree-sitter](https://tree-sitter.github.io/tree-sitter/)
- [ast-grep Node API](https://ast-grep.github.io/reference/api) (experimental)
