# Phase 2 Quick Reference — June 14, 2026

## Status: Part 1 ✅ COMPLETE | Part 2 ✅ INFRASTRUCTURE COMPLETE (enrichment pending)

---

## One-Liner Commands

```bash
# Phase 2 Part 1: Packet-Ref Normalization
npm run atlas:trace-packet-refs:audit           # Classify legacy refs (output: audit.json/.md)
npm run atlas:trace-packet-refs:dry             # Preview backfill (MERGE semantics)
npm run atlas:trace-packet-refs:apply           # Commit normalized USED_PACKET edges

# Phase 2 Part 2: Higher-Hop Enrichment Fields
npm run atlas:higher-hop:fields:audit           # Check field availability (60% baseline)
npm run atlas:higher-hop:fields:dry             # Preview enrichment (199 backfills ready)
npm run atlas:higher-hop:fields:apply           # Apply enrichment (future)
npm run atlas:higher-hop:fields:verify          # Verify gates (target: 70% average)
```

---

## Architecture Summary

### Phase 2 Part 1: Packet-Ref Normalization
- **Goal:** Resolve legacy trace packet refs to canonical packet identity
- **Pattern:** Audit (classify) → Backfill (map) → Seed (populate graph)
- **Ledger:** `atlas_trace_packet_ref_map` (canonical → legacy mapping)
- **Output:** USED_PACKET edges in Neo4j with `lineage_version="packet-identity-v2"`
- **Status:** ✅ Complete

### Phase 2 Part 2: Higher-Hop Enrichment Fields
- **Goal:** Audit and populate 5 enrichment fields across mirrors
- **Fields:** somCluster, glyphRecord, qdrantHit, redisHotKey, neo4jNode
- **Pattern:** Audit (coverage) → Backfill (populate) → Verify (gates)
- **Coverage Target:** ≥70% average (all 6 gates must PASS)
- **Status:** ✅ Infrastructure complete (enrichment work pending)

---

## Gate Status (June 14, 2026)

| Gate | Coverage | Threshold | Status | Next |
|------|----------|-----------|--------|------|
| somCluster | 100% | 80% | ✅ PASS | stable |
| glyphRecord | 0% | 60% | ❌ FAIL | create atlas_svg_glyphs table |
| qdrantHit | 0% | 90% | ❌ FAIL | enrich Qdrant payload |
| redisHotKey | 100% | 50% | ✅ PASS | stable |
| neo4jNode | 99% | 70% | ✅ PASS | stable |
| **Average** | **59.8%** | **70%** | ❌ FAIL | Phase 2 Part 3 work |

---

## Phase 2 Part 3: Next Steps

### 1. Create atlas_svg_glyphs Table
```sql
CREATE TABLE atlas_svg_glyphs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  packet_key VARCHAR(255) UNIQUE NOT NULL,
  source_ref VARCHAR(255),
  glyph_id VARCHAR(255),
  glyph_type VARCHAR(50),
  created_at TIMESTAMP DEFAULT now()
);
CREATE INDEX idx_svg_glyphs_packet_key ON atlas_svg_glyphs(packet_key);
```

### 2. Enrich Qdrant Payload
```bash
npm run atlas:higher-hop:qdrant-payload:enrich --dry-run
npm run atlas:higher-hop:qdrant-payload:enrich --apply
```

### 3. Re-Verify Gates
```bash
npm run atlas:higher-hop:fields:audit && \
npm run atlas:higher-hop:fields:verify
```

### 4. Target: GATE PASS
- Average coverage ≥70%
- All 6 gates individually marked ✅ PASS

---

## File Map

| File | Purpose | Status |
|------|---------|--------|
| `scripts/atlas/audit-trace-packet-ref-normalization.mjs` | Phase 2 Part 1: Classify legacy refs | ✅ COMPLETE |
| `scripts/atlas/backfill-trace-packet-ref-normalization.mjs` | Phase 2 Part 1: Build normalization map | ✅ COMPLETE |
| `scripts/atlas/seed-neo4j-bounded-used-packet-edges-normalized.mjs` | Phase 2 Part 1: Seed Neo4j edges | ✅ COMPLETE |
| `scripts/atlas/audit-higher-hop-enrichment-fields.mjs` | Phase 2 Part 2: Audit field availability | ✅ COMPLETE |
| `scripts/atlas/backfill-higher-hop-enrichment-fields.mjs` | Phase 2 Part 2: Populate enrichment fields | ✅ COMPLETE |
| `scripts/atlas/verify-higher-hop-enrichment-gate.mjs` | Phase 2 Part 2: Verify production gates | ✅ COMPLETE |
| `docs/PHASE-2-HIGHER-HOP-ENRICHMENT-COMPLETION.md` | Full Phase 2 documentation | ✅ COMPLETE |

---

## Troubleshooting

### Atlas_svg_glyphs Table Missing
Expected during Phase 2 Part 2 — table will be created in Phase 2 Part 3.
Scripts gracefully skip and mark as "table_missing".

### Qdrant Hit Coverage at 0%
Expected — Qdrant payload enrichment is Phase 2 Part 3 work.
Run `npm run atlas:higher-hop:qdrant-payload:enrich` after that's implemented.

### Gate Average Below 70%
Normal until Phase 2 Part 3 enrichment work is complete.
Once glyphRecord and qdrantHit fields are populated, average will exceed 70%.

---

## Monitoring

```bash
# Full Phase 2 workflow (preview)
npm run atlas:trace-packet-refs:audit && \
npm run atlas:higher-hop:fields:audit && \
npm run atlas:higher-hop:fields:verify

# Check reports
ls -lh docs/reports/*trace-packet* docs/reports/*higher-hop*
cat docs/reports/higher-hop-enrichment-gate-verify.json
```

---

## Integration with Phase 1B

```
Phase 1B Complete:
  ✅ 18 indexes (B-tree/GIN/BRIN/sparse)
  ✅ SOM clustering (3,251/3,251 packets, 272 clusters)
  ✅ Bifrost prefilter (L1 exact-match + L2 semantic)
  ✅ Redis SOM cell cache (272/400 cells, 300s TTL)

Phase 2 Part 1 Complete:
  ✅ Packet-ref normalization (audit → backfill → seed)
  ✅ Neo4j USED_PACKET edges normalized
  ✅ Lineage version 2 enforced

Phase 2 Part 2 Complete (This Commit):
  ✅ Higher-hop enrichment audit infrastructure
  ✅ Five enrichment fields defined and audited
  ✅ Dry-run + apply patterns verified

Phase 2 Part 3 Pending:
  ⏳ Qdrant payload enrichment (qdrantHit)
  ⏳ atlas_svg_glyphs table + backfill (glyphRecord)
  ⏳ GATE PASS verification (average ≥70%)
```

---

## Key Metrics

| Metric | Value | Status |
|--------|-------|--------|
| Audit script execution time | ~5s | ✅ |
| Backfill dry-run time | ~10s | ✅ |
| Verify script time | ~15s | ✅ |
| Baseline coverage (average) | 59.8% | ⏳ |
| Target coverage (average) | 70%+ | ⏳ |
| somCluster coverage | 100% | ✅ |
| redisHotKey coverage | 100% | ✅ |
| neo4jNode coverage | 99% | ✅ |

---

**Last Updated:** June 14, 2026  
**Next Action:** Phase 2 Part 3 — Qdrant enrichment + GATE PASS

