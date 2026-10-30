---
type: runbook
title: OKF, OAK (:8095), rg and Domain Classification Cheat Sheet
id: runbook/okf-oak-domain-classification-cheatsheet
status: draft
owners:
  - legal-ai-team
source_refs:
  - .okf/manifest.yaml
  - .okf/schemas/
  - docs/reports/atlas-domain-classification-evidence-audit-2026-10-27.md
related: []
generated:
  by: claude-code:2026-10-29 (unreviewed; counts re-read live that day)
---

# OKF, OAK (:8095), rg and Domain Classification Cheat Sheet

**Status**: draft | **Date**: 2026-10-29 | **Authority**: none (`canonical_authority: false`)

## TL;DR

`.okf/` declares contracts and JSON schemas validate them. `rg` and Tree-sitter give evidence, the classifier and OAK on `:8095` give proposals, and PostgreSQL is truth. Nothing here creates identity.

## Who does what

| Piece | Job | Authority |
|---|---|---|
| `.okf/` (743 files) | Declares languages, domains, concepts, corpora, indexes | None |
| `.okf/schemas/*.schema.json` | Validates those files | Gate only |
| `rg` | Exact-text lexical lane | Not proof of structure |
| Tree-sitter, ast-grep | Structural facts, byte spans | Decides structure |
| `:8095` OAK | Concept lookup/search over an `atlas-postgres` adapter | Proposal only |
| Classifier | Proposes a domain label | Proposal only |
| PostgreSQL 18 | Canonical rows | Truth |

## `.okf` layout

| Dir | Files | Note |
|---|---|---|
| `docs/` | 677 | One folder, `dspy/` (332 md, 331 html, 8 json, 2 xml, 2 txt, 2 jsonl); contents not reviewed |
| `languages/` | 24 | 23 profiles + tree-sitter catalog |
| `schemas/` | 9 | See below |
| `domains/` | 8 | Includes `atlas-domain-taxonomy.yaml` (17 groups) |
| `concepts/` | 6 | Concept-gap records |
| `systems/` | 6 | |
| `indexes/`, `pipelines/` | 4 each | |
| `corpora/`, `tools/` | 2 each | `corpora/` feeds `atlas.keyword_corpus_search` |
| `predicates/`, `runbooks/`, `architecture/` | 1 each | `runbooks/` is not registered in `manifest.yaml` |

## Schemas

| Schema | Governs | Status (2026-10-27 audit) |
|---|---|---|
| `language-profile-v1` | `languages/*.yaml` | 23/23 validate |
| `domain-taxonomy-v1` | `domains/atlas-domain-taxonomy.yaml` | Validates; 17 groups match PostgreSQL `domain_taxonomy_v1` |
| `okf-concept-gap-v1` | `concepts/*.yaml` | 6/6 validate |
| `keyword-corpus` | `corpora/` | In use |
| `tree-sitter-language-catalog-v1` | `languages/…catalog-v1.json` | Registered |
| `feature-relationships-v1`, `nary-fact-proposal-v1`, `pca-projection-experiment-v1`, `tensor-kv-rpc-packet-v1` | not checked | Unverified |

## :8095 OAK

| Fact | Value |
|---|---|
| Library | oaklib 0.7.4, adapter `atlas-postgres` |
| Mode | `READ_ONLY_SHADOW`, `canonicalAuthority: false` |
| Frozen functions | `lookup`, `search`, `ancestors`, `descendants` |
| Routes | `/oak/{lookup,search,traverse,kernel,health,profile}`, `/oak/assertion/check`, `/oak/profile-check`, `/ontology/oaklib/{search,candidates}`, `/domain/candidate/bind` |
| Profile checker | `UNAVAILABLE` (no OWL profile check or reasoning) |
| Classify route | None. `/domain/candidate/bind` binds a calibration example and needs a source revision |

## OAK vs OaK vs DSPy (three different things)

| Name | What it is | What it may change |
|---|---|---|
| OAK (`oaklib`) | Python library; reads ontologies through an adapter (labels, search, relations, traversal) | Nothing about the configured source |
| OaK (Ontology-as-a-Kernel, arXiv:2608.22974) | Agent architecture: a task schema plus typed functions, frozen before inference | The kernel is frozen at inference; evidence under it can vary |
| DSPy (`dspy` 3.4.1, `gepa` 0.1.4 on :8122) | Metric-driven optimizer for LM programs | Instructions, demonstrations, LM weights |

- OAK itself is not deterministic: backends differ, search is not uniform across them, and an `llm:` adapter exists. Determinism here is our configuration: fixed non-LLM adapter, pinned ontology snapshot, explicit predicates for traversal, normalized ordering.
- Live `:8095` matches this: adapter `atlas-postgres`, mode `READ_ONLY_SHADOW`, frozen functions `lookup`, `search`, `ancestors`, `descendants`.
- DSPy optimization never grants authority to change the schema or function registry. Kernel changes need an explicit construction step and a new freeze. DSPy/GEPA stays shadow-only (no promotion).
- OaK does not make all state frozen or inaccessible: the agent, model and prompts still sit around the kernel.

## Domain classification flow

1. Evidence: `rg` text hits, Tree-sitter/ast-grep structure.
2. Classifier proposes a label; valid labels are the 17 `.okf` taxonomy groups.
3. `/domain/candidate/bind` binds the candidate with a source revision.
4. OAK resolves concepts. Result is a proposal.

## Current state

| Item | Value |
|---|---|
| `atlas_packets.domain_class` | 61,718 populated, 41 distinct values; 8 values (23,616 rows) match taxonomy IDs |
| `predicted_domain` | 4,412 (7%); 4,384 are `utility` |
| Reviewed gold rows | 0 (`NO_GOLD_LABELS`); trust floor is 200 rows, 30 per class |
| `atlas_ontology_concepts`, `atlas_ontology_relations` | 0 rows |
| `atlas_ontology_linked_tuples` | 0 rows |

## Rules

- A matching `packet_key` or `source_ref` is not exact ownership.
- OAK determinism is a property of your configuration, not oaklib.
- `rg` finding a word does not prove a symbol relationship.
- `rg` skips gitignored paths. `.tmp/` is ignored: `rg --files .tmp/atlas` sees 5 files, `rg --no-ignore --files .tmp/atlas` sees 23,646. Use `--no-ignore` (not `--uu`) when searching it, and do not read an empty result there as absence.
- Proposals never become canonical without a reviewed gate.

## Open gaps

- Profile checker down; ontology concept/relation tables empty.
- 41 stored `domain_class` values to 17 taxonomy groups: mapping unreviewed.
- No gold labels; domain-conditioned summaries wait for the classification gate.
