# Proposal: Parent Atlas source-qualified corpus admission

## Why

Several pipelines now produce useful evidence, but each stops at a different boundary: diagnostic AST extraction, bounded documentation coverage, a Svelte language-server profile, embedding writes, feature-label schema drafts, and MCP retrieval. Their status has been mixed together in logs. This change coordinates them under one revision-qualified admission plan without replacing their existing owners or OpenSpec histories.

## What

Align the existing SvelteKit source analysis, AST V2 contract, documentation corpus, ontology and feature identity, embedding provenance, and retrieval workstreams into one admission path with explicit gates. Each gate is PASS, FAIL, BLOCKED, or UNKNOWN, and each is backed by a receipt.

## Status vocabulary

TESTED < DIAGNOSTIC < DRY_RUN < APPLIED < READBACK_PROVEN < ADMITTED. A milestone carries the highest level its evidence proves, and no higher.

## Accomplished (reported, with correct status)

| Workstream | Evidence | Status |
|---|---|---|
| Svelte AST extraction | 159 supported non-empty files, 6,310 chunks, source paths and revisions match | DIAGNOSTIC (dependency snapshot) |
| Svelte embedded TypeScript and NLP | original-file spans and NLP observations validated | PARTIAL |
| Svelte LSP | 35 symbols in a temporary project with linked dependencies | Hypothesis supported; frozen-snapshot proof pending |
| SvelteKit docs corpus | 5 raw pages, 233 chunk records, no page-coverage gaps | Bounded corpus complete; not globally comprehensive |
| Repository diagnostics | 392 sources across 49 bounded pages, zero failures, zero writes | PARTIAL; not admitted |
| Embeddings | 274,428 stored 768-d vectors; write and readback reported | Lineage missing; not qualified |
| MCP dense retrieval | runs over port 8788 | Runtime path works; evidence qualification incomplete |
| Feature label lifecycle | disposable PostgreSQL 18.4 tests; 12/12 contract tests | Schema prototype validated; production blocked |
| Domain normalizer | closed vocabulary check for nine technical domains | Format and vocabulary guard, not semantic classification |
| Graphify | snapshot execution reported; lifecycle receipt invalid | Downstream admission blocked |

## Non-goals

- No production DDL, database writes, vector writes, cache promotion, or model training without separate authorization.
- No rerun of completed parsing experiments.
- No replacement of existing OpenSpec changes.

## Authority

- `atlas_features` is the AST-derived structural fact table.
- `atlas_fi_features` is the product-feature candidate table.
- The operator approved the source-local identity, canonical concept, reviewed crosswalk, and canonical-concept label design for drafting and disposable validation. The existing V2 draft names these tables `atlas_feature_source_identities`, `atlas_feature_concepts`, `atlas_feature_concept_crosswalk`, and `atlas_feature_labels`; the older `canonical_feature_concepts` draft is superseded. Production application and identity minting remain separately gated.
- The nine technical domains, product capabilities, ontology concepts, source domain strings, and reviewed feature labels are separate vocabularies with typed crosswalks.
