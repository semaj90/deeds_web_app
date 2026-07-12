# P2 AST / Lexical / Repair Plan

Date: 2026-07-11

## Canonical dimension freeze

- `content_embedding`: 768-d
- model: `embeddinggemma:latest`
- version: `embeddinggemma-768-v1`
- current measured coverage: ~99.9%

Do not treat 384-d as canonical unless a separate projection/model is deliberately trained and validated.

## Identity scope

- Synthetic scan keys are temporary join helpers only.
- Canonical packet identity stays in `atlas_packets.packet_key` and the associated source/chunk join path.
- `tree_node_id` must be derived from deterministic source evidence, not from a filesystem scan key.
- AST, lexical, and Gemma4 summary outputs should attach to canonical packet rows after resolution.

## Verified script inventory

All referenced scripts exist in this checkout:

| Path | Exists |
|---|---:|
| `scripts/atlas/phase1-ast-grep-extraction.mjs` | yes |
| `scripts/atlas/phase1.5-ast-grep-extraction.mjs` | yes |
| `scripts/atlas/phase1.5-lexical-extraction.mjs` | yes |
| `scripts/atlas/phase2a-ast-grep-synthetic-key-fix.mjs` | yes |
| `../scripts/atlas/phase-2a-ast-grep-lexical-kmeans-topology.mjs` | yes |
| `scripts/atlas/phase2b-lexical-extraction-kmeans.mjs` | yes |

## Phase ordering

### P2.0 - preflight

1. Verify script existence.
2. Capture baseline counts.
3. Write `docs/reports/p2-feature-baseline.json`.

### P2B - AST extraction

Populate structural evidence only:

- `tree_node_id`
- symbol kind/name
- imports / exports
- function / class / method counts
- route / schema / test markers
- TODO / FIXME markers
- call / declaration relationships
- feature-label candidates

AST must not directly assign final `domain_class`.

### P2C - lexical extraction

Generate:

- token counts
- identifier terms
- BM25 terms
- keywords
- file extension / language
- path segments
- feature-label candidates
- top terms

Lexical extraction must not write K-means or final domain labels.

### P2D - identity repair

Only repair:

- synthetic packet keys
- missing canonical chunk UUID links
- tree_node_id linkage
- source_ref mismatch
- feature-row ownership

Never invent mappings from path similarity.

### P2E - feature labels

Generate deterministic labels from evidence:

- AST facts
- imports / exports
- lexical terms
- path vocabulary
- existing feature_id

Store evidence and confidence.

### P2F - LangExtract concepts

Run after structural and lexical extraction.

Start with:

- README files
- architecture docs
- specs
- comments
- docstrings
- TODO / FIXME
- API descriptions

Do not run over all chunks at once.

### P2G - domain dataset

Build reviewed labels only after evidence is stable:

- retrieval
- cache
- database
- graph
- inference
- agent orchestration
- authentication
- telemetry
- legal analysis
- frontend
- testing
- build tooling

## Validation gates

- AST writes are content-hash guarded.
- Synthetic tree IDs remain zero.
- Ambiguous source paths remain zero.
- Repeat runs are idempotent.
- AST coverage is measured only against AST-eligible code.
- Lexical extraction stores tokenization version and content hash.
- No domain label leakage during lexical stage.
- Domain classification is a later phase, not AST output.

## Immediate next safe command set

1. `npm run atlas:phase1:ast-grep:dry --limit=100`
2. `npm run atlas:phase1.5:lexical:dry --limit=100`
3. `npm run atlas:phase2a:ast-grep-fix:dry --limit=100`

Only after those dry-runs are clean should bounded applies run.
