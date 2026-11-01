# Domain Classification Taxonomy
**Status**: DRAFT, source-read only | **Date**: 2026-10-31 | **Canonical authority**: none (reference doc; Postgres tables are truth)

---

## TL;DR

Four different vocabularies share the word "domain". They are **not interchangeable**. The 13-group ontology is the navigation authority; the 9-value code enum, the 10-entry NES palette and the 9 UI topics are separate lists. All classification output is a **proposal** (confidence floor, fail closed, unresolved is a valid result); identity stays exact.

Not established by this pass: the live subgroup rows (Postgres was unreachable), a "40 concepts" set, and any ">140 languages" claim. See [Gaps](#gaps).

---

## Vocabularies

| # | Vocabulary | Size | Owner (source) | Use |
|---|---|---|---|---|
| 1 | Ontology top-level groups (`taxonomy_level` 0) | 13 | `atlas_domain_ontology`, root rows of `domain_taxonomy_v1` (read 2026-10-28); mirrored in `src/lib/demos/demo-domains.ts` | Navigation authority |
| 2 | Code canonical domains | 9 | `CANONICAL_DOMAINS` in `src/lib/server/atlas/domain-taxonomy.ts` (`parent-atlas-domain-taxonomy-v1`) | Deterministic code-file classifier |
| 3 | NES LUT palette | 10 | `NES_LUT_DOMAIN_PALETTE` in `scripts/atlas/lib/domain-taxonomy-nes-lut-batch-gemm-v1.mjs` | `lut_byte` (0x00-0x09) and `nes_hex` display |
| 4 | UI topics (facets inside Frontend & UI) | 9 | `DEMO_TOPICS` in `demo-domains.ts` | NOT ontology groups |

`atlas_domain_ontology` and `domain_taxonomy_v1` hold the same **17 IDs** with different metadata; no writer was found for `domain_taxonomy_v1` (capability-owner-matrix tasks).

## The 13 top-level groups

| ID | Label |
|---|---|
| `api` | API Design & Integration |
| `auth` | Authentication & Authorization |
| `cache` | Caching |
| `compiler` | Compiler & Language Tooling |
| `database` | Database & Persistence |
| `devops` | DevOps & Infrastructure |
| `error-handling` | Error Handling & Recovery |
| `frontend` | Frontend & UI |
| `gpu` | GPU & CUDA Acceleration |
| `graph` | Graph & Topology |
| `machine-learning` | Machine Learning |
| `retrieval` | Information Retrieval |
| `test` | Testing |

## Subgroups

17 IDs exist in total, so **4 rows are not top-level**. Their names are not in any source file read here. Table shape: `group_id` (unique), `group_label`, `parent_group_id`, `taxonomy_level`, `confidence`, `examples[]`. Read them with:

```sql
BEGIN READ ONLY;
SELECT group_id, parent_group_id, taxonomy_level, group_label FROM atlas_domain_ontology ORDER BY taxonomy_level, group_id;
COMMIT;
```

## Code classifier (vocabulary 2)

- Values: `auth, ui, retrieval, network, database, cache, agent, graph, ml`. Fallback label `general` (null domain).
- Evidence kinds: `path, import, export, symbol, ast, route, schema, dependency, lexical, semantic, neighbor`.
- Label sources: `deterministic | learned | weak_label | reviewed | fallback`.
- Legacy aliases fold in (`frontend`→`ui`, `api`→`network`, `db`→`database`, `ranking`/`vector_search`→`retrieval`, `orchestration`→`agent`, `topology`→`graph`, `machinelearning`→`ml`).
- Related: `domain-classification-adapter-v1.ts`, `domain-taxonomy-ml-bridge.ts`, `classification/graphify-domain-evidence-v1.ts`, `domain.classify` (TRACE, provisional), offline trainer `python/train_domain_classifier.py`.

## Bridging the vocabularies

- Crosswalk `atlas_domain_vocabulary_crosswalk_v1`: **NORMALIZED_EXACT only, no aliases**, `canonical = false` by CHECK (never filter with `canonical = true`).
- Join through view `v_chunk_domain_resolved_v1`, not a column.
- `UNRESOLVED` (`0x00`) is a first-class result. Never guess a mapping.
- `lut_byte` and `nes_hex` are different fields. The ACE palette in `python/parent_atlas_learning/ace_compiler.py` disagrees with the `.mjs` palette on `nes_hex` for 8 of 10 domains (one owner needed).

## Concepts, entities, relations

| Item | Where | Note |
|---|---|---|
| Ontology tuples | `feature_ontology_tuples` (`packet_key`, `source_ref`, `subject_type`, ...) | Table in `schema-postgres.ts`; contract `atlas/contracts/ontology-linked-tuple-v1.ts` |
| Concept resolution | OAKLIB kernel `python/atlas_oak_kernel.py` on `:8095`; TS `recognizeConceptV1` | Layered, not duplicated |
| Entity / pattern extraction | LangExtract (`langextract-client.ts`, `atlas/ai/langextract-transport.ts`), `:8095` sidecar | Evidence-only proposals; no identity |
| Relations | Neo4j edges, `graph_node_metrics` | Topology mirror only |

**"40 concepts" is not a defined set in this repo.** The only 40 found is a census of 40 distinct *feature labels* (11 exact slug matches, 29 unmatched). Define the list before documenting it.

## Languages and LSP

| Layer | Fact | Source |
|---|---|---|
| Structural (Tree-sitter via `:8095`) | **9** languages: typescript, tsx, javascript, jsx, python, rust, go, java, svelte | `atlas/indexing/structural-language-dispatch-v1.ts` |
| Resolution order | `LSP_LANGUAGE_ID` → `EXPLICIT_LANGUAGE` → `FILE_EXTENSION` | same file |
| Rejections | `UNSUPPORTED_LANGUAGE_HINT`, `LANGUAGE_HINT_CONFLICT`, `LANGUAGE_EXTENSION_CONFLICT`, `UNSUPPORTED_SOURCE_LANGUAGE` | same file |
| LSP servers (OpenCode) | typescript, svelte, json, css | `.opencode/opencode.jsonc` |
| ast-grep | TS/JS only in the helper registry | `agentic-file-compiler/helper-registry-v1.ts` |

An LSP `languageId` (e.g. `typescriptreact`) is an accepted **hint**; a conflict with the file extension rejects the file. It never overrides the extension.

## Gaps

| Gap | Status |
|---|---|
| ">140 languages" | No source support found. Structural coverage is 9. Do not cite 140 until a specific component (e.g. a multilingual embedding or NLP model) is named and verified |
| Subgroup names (4 non-top-level rows) | Needs live read-only query above |
| Legal-evidence taxonomy | None exists. The 13 groups describe **code**; uploads (leases, photos) need their own taxonomy: operator decision |
| Reviewed gold for accuracy | Floor 200 rows / 30 per class is unmet; agreement with crosswalk is a diagnostic, not accuracy |
| Live verification | Docker/Postgres down this pass; all counts above come from source and prior receipts |

## Rules

- Classification is probabilistic; identity (`packet_key`, `source_revision`, `source_ref`) is exact.
- Classifier output never mints identity, adds a retrieval vote, or promotes itself.
- Do not add a second classifier owner: extend the adapter/helpers listed above.
