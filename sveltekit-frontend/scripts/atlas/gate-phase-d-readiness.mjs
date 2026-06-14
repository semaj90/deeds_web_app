#!/usr/bin/env node
/**
 * gate-phase-d-readiness.mjs
 *
 * Validate that Phase D (higher-hop enrichment) can proceed safely.
 *
 * Gate: At least 40% of Qdrant points are canonical-matched (source_ref + packet_key).
 * If gate passes: Phase D enrichment can enrich the canonical cohort.
 * If gate fails: Phase D is blocked until Phase 14 DuckDB reconciliation.
 */

const QDRANT_URL = process.env.QDRANT_URL || 'http://localhost:6333';
const COLLECTION = 'codebase_chunks_768';
const MIN_CANONICAL_PERCENT = 40;
const SAMPLE_SIZE = 500;

async function validateReadiness() {
  console.log('\n═══ Phase D Readiness Gate ═══\n');
  console.log(`Gate: At least ${MIN_CANONICAL_PERCENT}% canonical-matched points`);
  console.log(`Sample size: ${SAMPLE_SIZE}\n`);

  // Sample
  const scrollRes = await fetch(`${QDRANT_URL}/collections/${COLLECTION}/points/scroll`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ limit: SAMPLE_SIZE, with_payload: true })
  });

  if (!scrollRes.ok) throw new Error(`Qdrant error: ${scrollRes.status}`);

  const { result } = await scrollRes.json();
  const points = result.points || [];

  // Classify
  let canonicalMatched = 0;
  for (const point of points) {
    const p = point.payload || {};
    const sourceRef = p.source_ref ?? p.sourceRef ?? p.canonicalSourceRef ?? p.path ?? null;
    const packetKey = p.packet_key ?? p.packetKey ?? null;

    if (sourceRef && packetKey) {
      canonicalMatched++;
    }
  }

  const percent = (100 * canonicalMatched) / points.length;

  // Report
  console.log(`Canonical-matched: ${canonicalMatched}/${points.length} (${percent.toFixed(1)}%)`);
  console.log(`Required: ${MIN_CANONICAL_PERCENT}%\n`);

  if (percent >= MIN_CANONICAL_PERCENT) {
    console.log(`✅ PASS — Phase D enrichment APPROVED`);
    console.log(`\nNext steps:`);
    console.log(`1. npm run atlas:phase-d:enrich-feature-cards`);
    console.log(`   ├─ somCluster from metadata.som_cluster`);
    console.log(`   ├─ glyphRecord from GlyphRecord mapper`);
    console.log(`   ├─ qdrantHit from Qdrant point metadata`);
    console.log(`   ├─ redisHotKey from cache key path`);
    console.log(`   └─ neo4jNodeId from Neo4j graph`);
    console.log(`\n2. Run verification: npm run atlas:phase-d:verify`);
    console.log(`\n3. Publish enriched cards to Phase 14 (DuckDB import)`);
    return true;
  } else {
    console.log(`❌ FAIL — Phase D enrichment BLOCKED`);
    console.log(`\nReason: Only ${percent.toFixed(1)}% of points are canonical-matched`);
    console.log(`\nAlternatives:`);
    console.log(`1. (Recommended) Accept MVP limitation & defer to Phase 14`);
    console.log(`   - DuckDB will consolidate canonical + legacy cohorts`);
    console.log(`   - Enrich only the ${canonicalMatched} canonical-matched points now`);
    console.log(`   - Phase 15 will re-ingest legacy cohort after reconciliation`);
    console.log(`\n2. (Not recommended) Force Phase D on legacy points`);
    console.log(`   - Creates dangling enrichments without packet_key anchor`);
    console.log(`   - Will require cleanup during Phase 14`);
    return false;
  }
}

validateReadiness()
  .then((passed) => {
    process.exit(passed ? 0 : 1);
  })
  .catch((err) => {
    console.error('Error:', err);
    process.exit(1);
  });
