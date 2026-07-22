# Domain Classifier Implementation Audit

Generated: 2026-07-21

## Live database state

Database: `legal_ai_db`
Schema: `public`

| Table | Rows | Status |
|---|---:|---|
| `feature_domain_facts` | 61,659 | present |
| `feature_lexical_facts` | 0 | present but empty |
| `feature_structural_facts` | 0 | present but empty |
| `feature_ontology_tuples` | 0 | present but empty |

`feature_domain_predictions` is not present in the live database.
`feature_packet_bindings` is not present in the live database.

## Implementation inventory

### `sveltekit-frontend/src/lib/server/classifier/domain-classifier.ts`
- Status: `PARTIAL`
- Role: keyword-based domain classification for AST enrichment
- Signals: lexical keywords only, no POS, no provenance, no multi-label output
- Taxonomy: compact Atlas taxonomy (`auth`, `retrieval`, `embedding`, `graph`, `storage`, etc.)

### `sveltekit-frontend/src/lib/server/enrichment/domain-classifier.ts`
- Status: `PARTIAL`
- Role: lexical + semantic + external validation
- Signals: lexical keyword scoring, optional LDR validation, optional external scrape validation
- Gaps: no persisted multi-label distribution table, no POS extraction, no explicit provenance record contract

### `scripts/atlas/classify-domain-ontology.mjs`
- Status: `DEPRECATED`
- Role: legacy direct `atlas_packets.domain_class` writer
- Gaps: bypasses canonical fact tables and writes directly to `atlas_packets` and Redis

### `scripts/atlas/domain-classifier-with-semantic-validation.mts`
- Status: `PARTIAL`
- Role: three-tier lexical / semantic / validated classifier
- Signals: lexical keyword match, LDR semantic validation, Firecrawl/Playwright external validation
- Gaps: heuristic only, no canonical multi-label prediction table, no POS/lemma lane

### `scripts/atlas/phase-107-f-field-materializer.mts`
- Status: `PARTIAL`
- Role: field-level precedence resolver
- Precedence: `feature_domain_facts` -> `atlas_packets` -> heuristic fallback
- Gaps: writes only `feature_packet_bindings` rows for domain resolution; lexical/structural/ontology lanes are still unresolved in the live database

## Current contract mismatch

The live `feature_domain_facts` table is populated, but the supporting normalized fact tables are still empty:
- `feature_lexical_facts`
- `feature_structural_facts`
- `feature_ontology_tuples`

That means the final domain decision cannot yet be fully fused from lexical + structural + semantic + provenance evidence in the canonical tables alone.

## Recommended next safe action

1. Keep `feature_domain_facts` as the canonical domain signal table.
2. Add a multi-label prediction table for non-canonical per-domain probabilities.
3. Populate lexical, structural, and ontology fact lanes before promoting any broader fusion policy.
4. Keep legacy direct `atlas_packets.domain_class` writers disabled for canonical decisions.

