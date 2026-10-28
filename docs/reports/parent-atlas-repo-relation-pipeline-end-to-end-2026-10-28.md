# Parent Atlas: repo analysis to relations, end to end (2026-10-28)
**Status**: read-only proposals only, no relation persisted | **Gate**: Canonical Gate V2 FAIL | **Supersedes**: the earlier chat table (corrected below)

## TL;DR
Source bytes become relation *proposals* through nine built, read-only stages. Nothing is persisted: no relation writer is authorized, the outbox tables are empty, and the first blocker is a noncanonical Graphify execution (`01a1763a…`). A symbol-level Naive Bayes lane now exists as a proposal ranker built from existing parts; it cannot be trained yet because no human-reviewed labels exist.

## Corrected stage table
| # | Stage | Owner (existing) | Measured state |
|---|---|---|---|
| 1 | Admitted source bytes | Graphify execution `01a1763a…`, `graphify_execution_file_membership_v2` (29,026 rows, 949 `.svelte`) | Gated: execution not canonical; no snapshot UUID for relation scope |
| 2 | Structure (CST/AST) | `:8095` `/ast/chunk` (treesitter-chunker 4.0.0), AST-grep | TS/JS import edges only. **Svelte: 0 import edges, script is one fragment**; templates via `svelte-template-chunks-v1` (937/937 parsed, 7,813 chunks) |
| 3 | Lexical scope | `ast-lexical-scope-v1`, `svelte-script-scope-v1`, `svelte-template-references-v1` | Lexical only. Svelte template refs 41,947, 0 span mismatches |
| 4 | Import resolution | `ImportResolutionV1` (`import-resolution-contract-v1`) | TS sample: 6/95 bindings verified. **Svelte: 257/2,631 verified (9.8%)**; 1,165 `EXPORT_NOT_EXPORTED` (confirmed cause: 1,068 default imports of `.svelte` components + 97 named imports from barrel `index.ts` files that re-export `.svelte` defaults) |
| 5 | Attribution (caller endpoint) | `containing-symbol-attribution-v1`, `enclosing-declaration-v1` (proposal-only) | 13/383. 369 misses are files with **no symbol-version rows** (logic is sound). Svelte: 357 direct calls, 141 in a named function |
| 6 | Compiler check | typescript-language-server, Svelte language server | Module file confirmed for the 6 facts (file level only). Name level and **Svelte template definitions not confirmed (query times out)** |
| 7 | Mapping | `structural-reference-relation-mapping-v1` | Built; proposal-only |
| 8 | Contract validation | `canonical-relation-contract-v1` | Built. LLM, similarity or Naive Bayes outputs are `PROPOSAL_ONLY` |
| 9 | Insert-or-verify | `atlas_relationships` (603), `atlas_relationship_evidence` (603) | No live writer authorized; registry-v1 DDL unapplied |
| 10 | Projection | `atlas_projection_outbox`, `atlas_projection_state` | Both **0 rows** (re-checked 2026-10-28); nothing ever projected |

Relation types in the contract: CONTAINS, MATERIALIZES, DERIVED_FROM, USES_CONCEPT, IMPORTS, IMPORTS_SYMBOL, EXPORTS, CALLS, REFERENCES, EXTENDS, IMPLEMENTS. **No `TESTED_BY`**: whether test-file uses are CALLS or a separate edge is undecided.

## Corrections to the earlier answer
| Earlier claim | Correction |
|---|---|
| "6 of 95 is low because no writer creates versions at a new workspace revision" | Matching is exact on **source** revision; workspace revision is only reported. The misses are coverage (files without rows) and unfollowable exports. All 257 Svelte matches carry the prior workspace revision `23413763…`, not `c63620c4…`: valid for file bytes, not proof of current membership |
| Stage 5 "13/383, narrowest point" | A data gap, not logic: 0 of 937 Svelte components and some spec files have symbol-version rows |
| Svelte omitted | Added: no sidecar imports, no template LSP confirmation, no symbol rows, implicit component default exports |

## Symbol Naive Bayes lane (new, built from existing parts)
`python/atlas_symbol_nb_lane_v1.py` + `test_atlas_symbol_nb_lane_v1.py` (13/13; evaluator suite 14/14 unchanged).
| Part | Reused from |
|---|---|
| `MultinomialNB` estimator | `python/train_domain_classifier.py` (domain-level NB + LR) |
| Gold rules: human reviewer provenance, `NON_GOLD_CHOICES`, 200 rows / 30 per class | `python/atlas_domain_classifier_eval_v1.py` (imported, not copied) |
| Three-way gate accept 0.85 / reject 0.4, leakage-field stripping | `scripts/atlas/lib/domain-classification-dag-v1.mjs` |
| Symbol records | `atlas_corpus_lib/structural_observation_v1.py`, `enclosing-declaration-v1`, `ImportResolutionV1` |
- **Target:** `domain_class` per symbol (reviewed taxonomy). Symbol *kind* stays AST-derived; the lane never decides identity or relations.
- **Features:** name sub-words, kind, import-specifier segments, directory segments. Identity and revision fields are never tokens (tested).
- **Refuses to train** without trusted gold (`InsufficientTrustedLabels`); `mechanics_only` models are flagged `trustedForScoring=false`. Predictions are `humanLabel=false`, `canonicalAuthority=false`.
- **Uses in the relation pipeline:** (a) propose a domain for a symbol with three-way abstention; (b) `rank_candidates` orders AMBIGUOUS definition candidates (21 Svelte `MODULE_AMBIGUOUS`, `STAR_AMBIGUOUS`) by domain agreement for a reviewer. It never admits a candidate or resolves an ambiguity; exact source_ref, revision and byte-span evidence still decides.
- **Not proven:** accuracy. Zero human-reviewed labels exist (the 44-row batch is unlabelled), so no metric can be computed. Fixtures in the tests are synthetic mechanics checks.

## Component default exports (confirmed 2026-10-28)
Receipt `.tmp/atlas/svelte-import-symbol-version-audit-20261028-v3.json` (sha256:6accd1ad…1d704, replay-stable): `EXPORT_NOT_EXPORTED` splits into `DEFAULT:.svelte` 1,068 and `NAMED:.ts` 97. A sample of 12 of the 97 are all barrel files (e.g. `export { default as Badge } from './Badge.svelte'`). So component-to-component imports cannot reach a symbol version by construction: a `.svelte` default export is implicit and `.svelte` files have no symbol-version rows. The mechanism inside the export follower (why barrel re-exports of `.svelte` defaults end as not exported) was not inspected.

## Blockers, in order
1. Canonical execution `01a1763a…` and a snapshot UUID for relation scope.
2. Registry-v1 DDL unapplied; six nested scopes unmapped.
3. Symbol-version rows for Svelte files and for the current workspace revision (no writer).
4. Template definitions via the Svelte language server (timeout).
5. Human-reviewed labels for the NB lane (floor 200 total / 30 per class).

## Decisions needed
- Relation type for test-file uses (`TESTED_BY` vs CALLS).
- Component identity for `.svelte` default imports (file-level entity vs module-level IMPORTS only).
- Which reviewer labels the first symbol batch (never a model).

## Receipts
`.tmp/atlas/`: `lsp-import-confirmation-20261027-v2.json` (sha256:d7aaa89b…a2a3), `svelte-import-symbol-version-audit-20261028.json` (sha256:7731f406…c743), `containing-symbol-audit-20261027.json` (sha256:f8365ddf…669a), `import-resolution-contract-smoke-20261027.json` (sha256:099add21…e7bb). Ledger: `openspec/changes/atlas-directory-first-analysis-v1/tasks.md` §6.M40, M48, M51, M52.
