#!/usr/bin/env node
/**
 * Audit Parent Atlas Joins (Postgres ↔ Qdrant)
 *
 * Purpose: P3 phase audit—verify one-to-one join safety between atlas_packets
 * and Qdrant collections via qdrant_point_id normalization.
 *
 * Usage:
 *   npm run atlas:joins:audit -- --limit=1000 --verbose
 *   npm run atlas:joins:audit -- --limit=5000 --report=reports/qdrant-join-audit.json
 */

const LIMIT = parseInt(process.argv.find(a => a.startsWith('--limit='))?.split('=')[1] || '1000');
const REPORT_PATH = process.argv.find(a => a.startsWith('--report='))?.split('=')[1] || null;
const VERBOSE = process.argv.includes('--verbose');

async function auditJoins() {
  const DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';

  try {
    const { default: pg } = await import('pg');
    const path = await import('path');

    const pool = new pg.Pool({
      connectionString: DATABASE_URL,
      max: 2,
      connectionTimeoutMillis: 5000
    });

    try {
      console.log(`
╔════════════════════════════════════════════════════════════════╗
║     Parent Atlas Join Audit (Postgres ↔ Qdrant)               ║
╚════════════════════════════════════════════════════════════════╝

Limit:     ${LIMIT} packets
Report:    ${REPORT_PATH || '(none)'}
Timestamp: ${new Date().toISOString()}

`);

      // 1. Audit packet coverage
      console.log('📊 Auditing atlas_packets qdrant_point_id coverage...\n');
      const coverageRes = await pool.query(`
        SELECT
          COUNT(*) as total,
          COUNT(CASE WHEN qdrant_point_id IS NOT NULL THEN 1 END) as has_qdrant_id,
          COUNT(CASE WHEN qdrant_collection IS NOT NULL THEN 1 END) as has_collection
        FROM atlas_packets
        LIMIT $1
      `, [LIMIT]);

      const coverage = coverageRes.rows[0];
      const pctWithId = (coverage.has_qdrant_id / coverage.total * 100).toFixed(1);
      const pctWithCollection = (coverage.has_collection / coverage.total * 100).toFixed(1);

      console.log(`Total packets:           ${coverage.total}`);
      console.log(`  ✓ With qdrant_point_id: ${coverage.has_qdrant_id} (${pctWithId}%)`);
      console.log(`  ✓ With qdrant_collection: ${coverage.has_collection} (${pctWithCollection}%)\n`);

      // 2. Check normalized key consistency
      console.log('🔍 Checking normalized key consistency...\n');
      const consistencyRes = await pool.query(`
        SELECT
          COUNT(*) as total_checks,
          COUNT(CASE WHEN packet_key IS NOT NULL AND source_ref IS NOT NULL THEN 1 END) as has_identity,
          COUNT(CASE WHEN feature_id = feature_id THEN 1 END) as valid_feature_id,
          COUNT(CASE WHEN directory_path IS NOT NULL OR directory_path IS NULL THEN 1 END) as checked_directory
        FROM atlas_packets
        LIMIT $1
      `, [LIMIT]);

      const consistency = consistencyRes.rows[0];
      const identityPct = (consistency.has_identity / consistency.total_checks * 100).toFixed(1);

      console.log(`Identity fields present: ${consistency.has_identity} (${identityPct}%)`);
      console.log(`Valid feature_id:       ${consistency.valid_feature_id}`);
      console.log(`Directory coverage:     ${consistency.checked_directory}\n`);

      // 3. Find duplicate qdrant_point_ids (join safety issue)
      console.log('🔎 Detecting duplicate qdrant_point_id (one-to-many)...\n');
      const duplicateRes = await pool.query(`
        SELECT
          qdrant_point_id,
          qdrant_collection,
          COUNT(*) as packet_count,
          json_agg(json_build_object(
            'packet_id', packet_id,
            'packet_key', packet_key,
            'source_ref', source_ref
          ) ORDER BY packet_id) as packets
        FROM atlas_packets
        WHERE qdrant_point_id IS NOT NULL
        GROUP BY qdrant_point_id, qdrant_collection
        HAVING COUNT(*) > 1
        LIMIT 50
      `);

      const duplicates = duplicateRes.rows;
      if (duplicates.length > 0) {
        console.log(`⚠️  Found ${duplicates.length} duplicate qdrant_point_ids:\n`);
        duplicates.forEach((dup, idx) => {
          console.log(`  ${idx + 1}. QID ${dup.qdrant_point_id} (collection: ${dup.qdrant_collection})`);
          console.log(`     Packets: ${dup.packet_count}`);
          if (VERBOSE && dup.packets.length <= 3) {
            dup.packets.forEach(p => {
              console.log(`       - ${p.packet_key} (${p.source_ref})`);
            });
          }
        });
        console.log('');
      } else {
        console.log(`✅ No duplicate qdrant_point_ids found\n`);
      }

      // 4. Count join quality metrics
      console.log('📈 Join quality metrics...\n');
      const qualityRes = await pool.query(`
        SELECT
          COUNT(*) as total,
          COUNT(CASE WHEN qdrant_point_id IS NOT NULL AND packet_key IS NOT NULL THEN 1 END) as matched,
          COUNT(CASE WHEN qdrant_point_id IS NOT NULL AND packet_key IS NULL THEN 1 END) as missing_packet_key,
          COUNT(CASE WHEN qdrant_point_id IS NULL AND packet_key IS NOT NULL THEN 1 END) as missing_qdrant_id,
          COUNT(CASE WHEN qdrant_point_id IS NULL AND packet_key IS NULL THEN 1 END) as ambiguous
        FROM atlas_packets
        LIMIT $1
      `, [LIMIT]);

      const quality = qualityRes.rows[0];
      const matchedPct = (quality.matched / quality.total * 100).toFixed(1);
      const missingQdrantPct = (quality.missing_qdrant_id / quality.total * 100).toFixed(1);
      const ambiguousPct = (quality.ambiguous / quality.total * 100).toFixed(1);

      console.log(`Matched (both keys):     ${quality.matched} (${matchedPct}%)`);
      console.log(`Missing qdrant_point_id: ${quality.missing_qdrant_id} (${missingQdrantPct}%)`);
      console.log(`Missing packet_key:      ${quality.missing_packet_key}`);
      console.log(`Ambiguous (neither):     ${quality.ambiguous} (${ambiguousPct}%)\n`);

      // 5. Sample mismatches
      if (quality.missing_qdrant_id > 0) {
        console.log('📋 Sample packets missing qdrant_point_id:\n');
        const sampleRes = await pool.query(`
          SELECT
            packet_id, packet_key, source_ref, feature_id,
            qdrant_point_id, qdrant_collection
          FROM atlas_packets
          WHERE qdrant_point_id IS NULL AND packet_key IS NOT NULL
          LIMIT 5
        `);

        sampleRes.rows.forEach((row, idx) => {
          console.log(`  ${idx + 1}. ${row.packet_key}`);
          console.log(`     source_ref: ${row.source_ref}`);
          console.log(`     feature_id: ${row.feature_id}`);
          console.log('');
        });
      }

      // 6. Build audit report
      const auditReport = {
        timestamp: new Date().toISOString(),
        limit: LIMIT,
        coverage: {
          total_packets: coverage.total,
          with_qdrant_point_id: coverage.has_qdrant_id,
          with_qdrant_point_id_pct: parseFloat(pctWithId),
          with_qdrant_collection: coverage.has_collection
        },
        consistency: {
          has_identity_fields: consistency.has_identity,
          has_identity_pct: parseFloat(identityPct)
        },
        join_quality: {
          matched: quality.matched,
          matched_pct: parseFloat(matchedPct),
          missing_qdrant_id: quality.missing_qdrant_id,
          missing_qdrant_id_pct: parseFloat(missingQdrantPct),
          missing_packet_key: quality.missing_packet_key,
          ambiguous: quality.ambiguous,
          ambiguous_pct: parseFloat(ambiguousPct)
        },
        duplicate_qdrant_ids_found: duplicates.length,
        verdict: quality.matched >= (quality.total * 0.95) ? 'PASS' : 'REVIEW'
      };

      console.log(`═════════════════════════════════════════════════════════════════\n`);
      console.log(`Verdict: ${auditReport.verdict}`);
      console.log(`  Matched: ${auditReport.join_quality.matched_pct}% (target: ≥95%)`);
      console.log(`  Duplicates: ${auditReport.duplicate_qdrant_ids_found}`);
      console.log(`  Ambiguous: ${auditReport.join_quality.ambiguous_pct}%\n`);

      // 7. Write report if requested
      if (REPORT_PATH) {
        const { default: fs } = await import('fs');
        const reportFullPath = path.resolve(REPORT_PATH);
        fs.writeFileSync(reportFullPath, JSON.stringify(auditReport, null, 2));
        console.log(`📄 Report written to: ${reportFullPath}\n`);
      }

    } finally {
      await pool.end();
    }

  } catch (err) {
    console.error('❌ Join audit failed:', err.message);
    if (VERBOSE) console.error(err.stack);
    process.exit(1);
  }
}

auditJoins();
