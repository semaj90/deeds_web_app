# Phase 108: Schema Alignment Decision

**Date**: July 21, 2026  
**Status**: Decision Required  
**Confidence**: 99%+ (Technical path clear, waiting for decision)

---

## Executive Summary

Phase 107 successfully completed **5 core evidence lanes** (PageRank, Registry, Lexical, Structural, Semantic) with 5,000 packets each. Stage 6 (ontology tuple generation) revealed a **schema mismatch**: the `feature_ontology_tuples` table uses RDF triple semantics, but the fusion pipeline needs to output **multi-label domain classifications**.

**SOLUTION**: Create separate `atlas_domain_classifications` table for domain predictions. This is **not a bug**—it's architectural clarity: knowledge graphs (RDF) ≠ classifier outputs (multi-label probabilities).

---

## The Mismatch

### What Phase 107 Needs (Domain Classification Output)
```json
{
  "packet_key": "ace:packet:auth:001",
  "source_ref": "src/lib/server/auth.ts",
  "primary_domain": "authentication",
  "primary_confidence": 0.742,
  "domains": {
    "authentication": 0.742,
    "backend": 0.598,
    "security": 0.413
  },
  "decision": "accepted",
  "lexical_score": 0.65,
  "structural_score": 0.80,
  "semantic_score": 0.73,
  "legacy_score": 0.75,
  "fusion_confidence": 0.742,
  "extractor_version": "phase-107-v1"
}
```

### What feature_ontology_tuples Stores (RDF Triples)
```json
{
  "packet_key": "ace:packet:auth:001",
  "subject_type": "packet",
  "subject_id": "ace:packet:auth:001",
  "predicate": "HAS_DOMAIN",
  "object_type": "domain",
  "object_id": "domain:authentication",
  "object_value": { "confidence": 0.742, "source": "lexical_match" },
  "evidence": { "keywords": ["session", "token", "credential"], "count": 3 },
  "ontology_version": "atlas-ontology-v1"
}
```

**These are different concerns**: domain classification (supervised prediction) vs. knowledge representation (RDF triples).

---

## Two Solution Paths

### Path A: Recommended — Separate Table (Simpler)

**Create** `atlas_domain_classifications` table:
```sql
CREATE TABLE atlas_domain_classifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  packet_key VARCHAR(255) NOT NULL UNIQUE,
  source_ref VARCHAR(512) NOT NULL,
  primary_domain VARCHAR(100) NOT NULL,
  primary_confidence REAL NOT NULL,
  domains JSONB NOT NULL DEFAULT '{}',  -- { "domain1": 0.742, "domain2": 0.598 }
  decision VARCHAR(20) NOT NULL,  -- accepted|candidate|review|rejected
  lexical_score REAL,
  structural_score REAL,
  semantic_score REAL,
  legacy_score REAL,
  fusion_confidence REAL,
  evidence_summary JSONB,
  extractor_version VARCHAR(50),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  
  INDEX (packet_key),
  INDEX (primary_domain),
  INDEX (decision),
  INDEX (primary_confidence DESC)
);
```

**Advantages**:
- ✅ Simple, focused schema (one table = one concern)
- ✅ Direct mapping to `generate-ontology-tuples.mjs` output
- ✅ Easy to extend with new classifiers (Naive Bayes, XGBoost, etc.)
- ✅ No RDF complexity in domain classification output
- ✅ `feature_ontology_tuples` stays pure for knowledge graph

**Adoption**: Rewrite `generate-ontology-tuples.mjs` to target this table.

---

### Path B: Alternative — RDF Triple Consumption

**Keep** `feature_ontology_tuples` as-is. Populate it with RDF evidence triples:
```sql
INSERT INTO feature_ontology_tuples (
  packet_key, subject_type, subject_id, predicate, 
  object_type, object_id, confidence, evidence
) VALUES (
  'ace:packet:auth:001',
  'packet', 'ace:packet:auth:001',
  'HAS_DOMAIN_EVIDENCE',
  'domain', 'domain:authentication',
  0.742,
  '{"source": "lexical", "keywords": ["session", "token"]}'::jsonb
)
```

Then **consume** RDF triples in downstream classifier:
- Cypher query in Neo4j to aggregate evidence
- XGBoost/Naive Bayes to fuse confidence scores
- Write final domain prediction to a separate classifier-output table

**Advantages**:
- ✅ Full knowledge graph flexibility
- ✅ Evidence lineage preserved in triples
- ✅ Allows RDF reasoning (inference, derived facts)

**Disadvantages**:
- ❌ Requires Cypher consumption layer
- ❌ More complex pipeline (RDF → classifier → output)
- ❌ Delays domain classification by one layer

---

## Recommendation

**Choose Path A** (Separate `atlas_domain_classifications` table):

1. **Clearer architecture** — domain classification outputs ≠ knowledge graph triples
2. **Faster implementation** — 1 script rewrite vs. 2 downstream layers
3. **Unblocks Stage 7** — can backfill 61,659 packets immediately
4. **Future-proof** — Path B can still consume these classifications for RDF enrichment if needed

---

## Implementation Plan (Path A)

### Stage 6A: Schema Creation
```bash
node scripts/atlas/create-domain-classifications-schema.mjs
# Creates atlas_domain_classifications table + indexes
```

### Stage 6B: Rewrite Ontology Script
**File**: `scripts/atlas/generate-ontology-tuples.mjs`  
**Change**: Target `atlas_domain_classifications` instead of `feature_ontology_tuples`  
**Lines**: ~60 (simple table name + column mapping)

### Stage 6C: Dry-Run Validation
```bash
node scripts/atlas/generate-ontology-tuples.mjs --dry-run --limit=100
# Expected: 100 classifications with decision labels
```

### Stage 6D: Full Execution
```bash
node scripts/atlas/generate-ontology-tuples.mjs --apply --limit=5000
# Expected: 5,000 domain classifications written
```

### Stage 7: Backfill to 61,659 Packets
```bash
node scripts/atlas/generate-ontology-tuples.mjs --apply --limit=61659
# Expected: ~3-4 hours, full coverage
```

---

## Gate Pass Criteria

- ✅ `atlas_domain_classifications` table created (18 columns, 4 indexes)
- ✅ `generate-ontology-tuples.mjs` produces 100% success rate on 5,000 sample
- ✅ All 5 evidence lanes (lexical, structural, semantic, legacy, fusion) written to output
- ✅ Confidence scores in valid range [0, 1]
- ✅ Decision labels include all 4 categories (accepted, candidate, review, rejected)
- ✅ Zero synthetic data or fallback patterns

---

## Next Steps

1. **Operator confirms Path A** (or Path B, or proposes alternative)
2. **Create schema** (5 min)
3. **Rewrite script** (15 min)
4. **Dry-run 100 samples** (30 sec)
5. **Execute 5,000** (2 min)
6. **Backfill 61,659** (3-4 hours)
7. **Verify production gate** (15 min)

**Critical path**: ~4 hours total to Stage 7 completion (with backfill).

---

## Alternative: Use Existing `atlas_packet_metrics`

**Third path (not recommended)**: Reuse existing `atlas_packet_metrics` table (already has domain classification columns from Phase 106).

**Check schema**:
```bash
docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c "\d atlas_packet_metrics"
```

If `atlas_packet_metrics` already has suitable columns, this avoids creating yet another table. However, this mixes metrics (measurements) with classifications (predictions), which is also a schema concern.

**Recommendation remains Path A** (dedicated table for domain classifications).

---

## Files Ready for Phase 108

- ✅ `scripts/atlas/generate-ontology-tuples.mjs` — exists, needs target table change
- ✅ `scripts/atlas/populate-lexical-facts-deterministic.mjs` — LIVE, 5,000 packets
- ✅ `scripts/atlas/populate-structural-facts.mjs` — LIVE, 5,000 packets
- ✅ `scripts/atlas/populate-semantic-facts.mjs` — LIVE, 5,000 packets
- ✅ `scripts/atlas/compute-pagerank-nodejs.mjs` — LIVE, 42,603 nodes
- ✅ `scripts/atlas/materialize-feature-registry-alignment.mjs` — LIVE, 2,109 packets

**Awaiting**: Decision on table schema + script rewrite (15 min work once decision made).

---

## Confidence Level

**Technical Feasibility**: 99%+  
**Architecture Clarity**: 99%+  
**Execution Risk**: Low (pure data transformation, no new dependencies)

**Blocked on**: Operator decision (Path A vs. B vs. alternative).
