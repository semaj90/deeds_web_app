# NLP sidecar to OKF schema alignment (proposal)

Status: PROPOSED. Drafts only. Nothing is wired into the sidecar, the OKF tree, or the database.

Owner: `python/miniforge_nlp_sidecar_v2.py` (AST) and `python/miniforge_nlp_sidecar.py` (analyze, extract). The OKF target is `docs/.okf/schema.yaml`.

## 1. Identity mapping (decision required)

The OKF schema names the structural identity fields `tree_node_id` and `symbol_version_id`. The sidecar emits `upstream_node_id` and `upstream_symbol_id`. The OKF schema says a tree node ID is a syntax coordinate and never canonical identity.

| Sidecar field | OKF field | Proposed rule |
|---|---|---|
| `upstream_node_id` | `tree_node_id` | Map only if the sidecar derives it from the Tree-sitter node path and source revision. Stored as a syntax coordinate, never as identity. |
| `upstream_symbol_id` | `symbol_version_id` | Map only if the value is a versioned symbol identity. A bare symbol name must stay as `symbol_name` and be unmapped. |
| `upstream_chunk_id`, `upstream_file_id` | none | Keep as upstream-only. Do not promote. |

Open question: the producer's derivation of `upstream_symbol_id` is not verified. Decision DEC-NLP-01 is needed before any mapping is written.

## 2. Lexical feature schema (draft `atlas.nlp.lexical-feature.v1`)

Source: the `Feature` model in `python/miniforge_nlp_sidecar.py` (line 313).

| Field | Type | Notes |
|---|---|---|
| `kind` | string | Feature kind |
| `name` | string | Feature name |
| `description` | string | Human-readable |
| `source` | enum | `tree-sitter`, `ast-grep`, `langextract`, `regex`, `spacy`, `torch` |
| `lineNumber` | int or null | 1-based line |
| `confidence` | float 0–1 | Default 0.7; not evidence |
| `rawText` | string or null | Bounded; must not be the sole evidence |

Gap: the model has no `start_byte` or `end_byte`. A lexical feature cannot be admitted to source evidence without a byte span tied to `source_revision`. The draft requires adding both (or refusing admission). Status: GAP.

## 3. Analyze response schema (draft `atlas.nlp.analyze.v1`)

Source: `AnalyzeResponse` (line 494).

| Field | Proposed status |
|---|---|
| `document_id`, `provider_revision`, `source_type`, `extraction_mode` | Required |
| `features` (list of Feature) | Required, typed as the lexical schema above |
| `pass_results` (AnalysisPassResult) | Required; each carries `pass_revision`, `input_hash`, `output_hash`, `status` |
| `classification_proposal` | Required to be marked `canonical_authority: false` |
| `canonical_authority` | Constant `false` on the whole response |
| `source_revision` | Missing at top level. Must be added, or the response is not admissible as source evidence. |

## 4. Non-goals

- No change to the sidecar's runtime behaviour.
- No new SQL table.
- No schema is treated as authority until its tests pass and the operator approves it.
