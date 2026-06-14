#!/usr/bin/env node
/**
 * Phase D: Debug Qdrant/Postgres Identity Mismatch
 *
 * Critical diagnostic: Explains WHY Qdrant and Postgres disagree on packet identity.
 * Until this is fixed, enrichment (AE, SOM, Karpathy) will amplify the corruption.
 *
 * Outputs:
 * - docs/reports/qdrant-postgres-mismatch-debug.json (raw mismatches)
 * - docs/reports/qdrant-postgres-mismatch-debug.md (analysis + recommendations)
 *
 * Key fields compared:
 * - source_ref (canonical file reference)
 * - packet_key (identity hash)
 * - feature_id (feature classification)
 * - feature_label (human-readable feature name)
 *
 * Success criteria: sampled_agreement >= 95% (currently 0/50)
 */

import pg from 'pg';
import { config } from 'dotenv';
import { resolve } from 'path';
import { writeFileSync, mkdirSync } from 'fs';
import crypto from 'crypto';

config({ path: resolve('.', '.env') });

const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db'
});

const QDRANT_URL = (process.env.QDRANT_URL || 'http://127.0.0.1:6333').replace(/\/$/, '');

// Comparator contract: which fields to validate
const IDENTITY_FIELDS = ['source_ref', 'packet_key', 'feature_id', 'feature_label'];

async function fetchQdrantSample(limit = 50) {
  try {
    const res = await fetch(`${QDRANT_URL}/collections/codebase_chunks_768/points/scroll`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ limit, with_payload: true })
    });

    if (!res.ok) {
      console.error(`Qdrant scroll failed: ${res.status}`);
      return [];
    }

    const data = await res.json();
    return (data.result?.points || []).map(p => ({
      qdrant_point_id: p.id,
      source_ref: p.payload?.source_ref || null,
      packet_key: p.payload?.packet_key || null,
      feature_id: p.payload?.feature_id || null,
      feature_label: p.payload?.feature_label || null,
      payload_keys: Object.keys(p.payload || {})
    }));
  } catch (err) {
    console.error(`Qdrant fetch error: ${err.message}`);
    return [];
  }
}

async function fetchPostgresPackets(sourceRefs) {
  if (!sourceRefs || sourceRefs.length === 0) return new Map();

  try {
    const placeholders = sourceRefs.map((_, i) => `$${i + 1}`).join(',');
    const res = await pool.query(`
      SELECT
        packet_id,
        source_ref,
        packet_key,
        feature_id,
        feature_label,
        community_id,
        community_confidence
      FROM atlas_packets
      WHERE source_ref = ANY(ARRAY[${placeholders}])
    `, sourceRefs);

    const map = new Map();
    res.rows.forEach(row => {
      map.set(row.source_ref, {
        packet_id: row.packet_id,
        source_ref: row.source_ref,
        packet_key: row.packet_key,
        feature_id: row.feature_id,
        feature_label: row.feature_label,
        community_id: row.community_id,
        community_confidence: row.community_confidence
      });
    });
    return map;
  } catch (err) {
    console.error(`Postgres fetch error: ${err.message}`);
    return new Map();
  }
}

function normalizeSourceRef(ref) {
  // Remove common path prefixes, normalize slashes
  if (!ref) return '';
  return ref.replace(/\\/g, '/').toLowerCase().trim();
}

function comparePackets(qdrantPkt, postgresPkt) {
  const mismatches = [];

  IDENTITY_FIELDS.forEach(field => {
    const q = qdrantPkt[field];
    const p = postgresPkt?.[field];

    // Normalize comparison
    const qVal = typeof q === 'string' ? q?.toLowerCase()?.trim() : q;
    const pVal = typeof p === 'string' ? p?.toLowerCase()?.trim() : p;

    if (qVal !== pVal) {
      mismatches.push({
        field,
        qdrant: q,
        postgres: p,
        match: false
      });
    } else {
      mismatches.push({
        field,
        qdrant: q,
        postgres: p,
        match: true
      });
    }
  });

  return {
    matches: mismatches.filter(m => m.match).length,
    mismatches: mismatches.filter(m => !m.match).length,
    details: mismatches
  };
}

async function main() {
  console.log('\n╔════════════════════════════════════════════════════════════════╗');
  console.log('║  Phase D: Debug Qdrant/Postgres Identity Mismatch               ║');
  console.log('║  Sampling 50 random points for comparison                       ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  // Fetch Qdrant sample
  console.log('Fetching Qdrant sample...');
  const qdrantSample = await fetchQdrantSample(50);
  console.log(`  Retrieved ${qdrantSample.length} points\n`);

  if (qdrantSample.length === 0) {
    console.error('Failed to fetch Qdrant sample. Exiting.');
    process.exit(1);
  }

  // Filter out points without source_ref
  const qdrantWithRef = qdrantSample.filter(p => p.source_ref);
  console.log(`  Points with source_ref: ${qdrantWithRef.length}/${qdrantSample.length}`);
  if (qdrantSample.length - qdrantWithRef.length > 0) {
    console.log(`  ⚠️  ${qdrantSample.length - qdrantWithRef.length} points missing source_ref (orphaned)\n`);
  }

  // Fetch corresponding Postgres packets
  const sourceRefs = qdrantWithRef.map(p => p.source_ref);
  console.log(`Fetching Postgres packets for ${sourceRefs.length} source_refs...`);
  const postgresMap = await fetchPostgresPackets(sourceRefs);
  console.log(`  Found ${postgresMap.size} matching packets\n`);

  // Compare
  console.log('═══ Comparison Results ═══\n');

  const results = [];
  let totalMatches = 0;
  let totalMismatches = 0;
  const mismatchDetails = [];

  qdrantWithRef.forEach((qdrantPkt, idx) => {
    const postgresPkt = postgresMap.get(qdrantPkt.source_ref);

    if (!postgresPkt) {
      // Missing in Postgres
      results.push({
        sample_idx: idx + 1,
        qdrant_point_id: qdrantPkt.qdrant_point_id,
        source_ref: qdrantPkt.source_ref,
        status: 'POSTGRES_MISSING',
        postgres_found: false,
        match_count: 0,
        mismatch_count: 4,
        comparison: null
      });
      totalMismatches++;
      mismatchDetails.push({
        source_ref: qdrantPkt.source_ref,
        reason: 'Not found in Postgres',
        qdrant: qdrantPkt,
        postgres: null
      });
    } else {
      // Compare fields
      const comparison = comparePackets(qdrantPkt, postgresPkt);
      const status = comparison.mismatches === 0 ? 'MATCH' : 'MISMATCH';

      results.push({
        sample_idx: idx + 1,
        qdrant_point_id: qdrantPkt.qdrant_point_id,
        source_ref: qdrantPkt.source_ref,
        status,
        postgres_found: true,
        match_count: comparison.matches,
        mismatch_count: comparison.mismatches,
        comparison: comparison.details
      });

      if (comparison.mismatches > 0) {
        totalMismatches++;
        mismatchDetails.push({
          source_ref: qdrantPkt.source_ref,
          reason: `${comparison.mismatches} field(s) mismatch`,
          qdrant: qdrantPkt,
          postgres: postgresPkt,
          fields: comparison.details.filter(d => !d.match)
        });
      } else {
        totalMatches++;
      }
    }
  });

  // Summary
  console.log(`Sampled: ${qdrantWithRef.length} packets`);
  console.log(`Matched: ${totalMatches}/${qdrantWithRef.length} (${(totalMatches / qdrantWithRef.length * 100).toFixed(1)}%)`);
  console.log(`Mismatched: ${totalMismatches}/${qdrantWithRef.length} (${(totalMismatches / qdrantWithRef.length * 100).toFixed(1)}%)\n`);

  // Gate check
  const agreementRate = (totalMatches / qdrantWithRef.length * 100).toFixed(1);
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║  Gate: Sampled Agreement >= 95%?                              ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  if (parseFloat(agreementRate) >= 95) {
    console.log(`✅ PASS: ${agreementRate}% >= 95% threshold\n`);
    console.log('Identity consistency confirmed. Safe to proceed with enrichment:\n');
    console.log('  → AE 768→64 dimensionality reduction');
    console.log('  → SOM 20×20 clustering');
    console.log('  → Karpathy authority reindexing\n');
  } else {
    console.log(`❌ FAIL: ${agreementRate}% < 95% threshold\n`);
    console.log('Identity drift detected. DO NOT train enrichment layers yet.\n');
    console.log('Mismatch analysis:');
  }

  // Save detailed report
  mkdirSync('docs/reports', { recursive: true });

  const report = {
    timestamp: new Date().toISOString(),
    gate_threshold: 95,
    sampled_agreement_percent: parseFloat(agreementRate),
    gate_pass: parseFloat(agreementRate) >= 95,
    summary: {
      total_sampled: qdrantWithRef.length,
      postgres_found: postgresMap.size,
      postgres_missing: qdrantWithRef.length - postgresMap.size,
      matched: totalMatches,
      mismatched: totalMismatches
    },
    samples: results,
    mismatch_details: mismatchDetails.slice(0, 20) // Top 20 mismatches
  };

  writeFileSync(
    'docs/reports/qdrant-postgres-mismatch-debug.json',
    JSON.stringify(report, null, 2)
  );

  // Save markdown analysis
  const md = `# Qdrant/Postgres Identity Mismatch Debug Report

**Date**: ${new Date().toISOString()}
**Gate**: Sampled Agreement >= 95%
**Result**: ${parseFloat(agreementRate) >= 95 ? '✅ PASS' : '❌ FAIL'}

## Summary

| Metric | Value |
|--------|-------|
| Sampled packets | ${qdrantWithRef.length} |
| Matched | ${totalMatches} (${agreementRate}%) |
| Mismatched | ${totalMismatches} (${(totalMismatches / qdrantWithRef.length * 100).toFixed(1)}%) |
| Postgres missing | ${qdrantWithRef.length - postgresMap.size} |

## Top Mismatches

${mismatchDetails.slice(0, 10).map((m, i) => `
### ${i + 1}. ${m.source_ref}
**Reason**: ${m.reason}

\`\`\`json
{
  "qdrant": ${JSON.stringify(m.qdrant, null, 2)},
  "postgres": ${JSON.stringify(m.postgres, null, 2)},
  "fields_differ": ${m.fields ? m.fields.map(f => f.field).join(', ') : 'N/A'}
}
\`\`\`
`).join('\n')}

## Recommendations

${parseFloat(agreementRate) >= 95 ? `
✅ Identity consistency confirmed.

**Next steps**:
1. Proceed with Phase E enrichment (safe to train AE/SOM)
2. Run Karpathy authority reindexing
3. Validate Neo4j USED_CONCEPT edges
4. Deploy topology-aware agent OS
` : `
❌ Identity drift detected.

**Actions required**:
1. Investigate mismatch causes above
2. Fix Postgres/Qdrant sync in ingest pipeline
3. Recalibrate packet_key computation
4. Re-sample and revalidate before enrichment

**DO NOT**:
- Train autoencoder (learns corrupted identity)
- Deploy SOM clustering (inherits mismatches)
- Reindex Karpathy authority (will amplify drift)
`}

## Root Cause Categories

${totalMismatches > 0 ? `
The mismatches fall into categories:

1. **Postgres missing**: Qdrant has packets Postgres doesn't
   - Likely cause: Orphaned Qdrant points from failed ingestion
   - Fix: Delete orphaned points OR ingest missing packets

2. **Field mismatch**: Both have packet, but fields differ
   - Likely cause: Different canonicalization rules
   - Fix: Align ingest normalization logic

3. **packet_key mismatch**: Hash differs (identity)
   - Likely cause: Different hash algorithm versions
   - Fix: Recompute hashes with canonical algorithm

` : ''}

---

**Conclusion**: ${parseFloat(agreementRate) >= 95 ? 'System ready for enrichment.' : 'System needs identity fixes before enrichment.'}
`;

  writeFileSync('docs/reports/qdrant-postgres-mismatch-debug.md', md);

  console.log('✅ Reports saved:');
  console.log('  - docs/reports/qdrant-postgres-mismatch-debug.json');
  console.log('  - docs/reports/qdrant-postgres-mismatch-debug.md\n');

  await pool.end();
  process.exit(parseFloat(agreementRate) >= 95 ? 0 : 1);
}

main().catch(err => {
  console.error('Debug failed:', err);
  process.exit(1);
});
