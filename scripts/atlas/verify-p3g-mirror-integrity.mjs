#!/usr/bin/env node
import pg from 'pg';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const { Pool } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');
const REPORTS_DIR = path.join(REPO_ROOT, 'docs/reports');
const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://legal_admin:postgres@localhost:5432/legal_ai_db';
const pool = new Pool({ connectionString: DATABASE_URL });

async function auditMirrorIntegrity() {
  const report = {
    timestamp: new Date().toISOString(),
    phase: 'P3g Mirror Integrity Gate',
    checks: {}
  };

  try {
    console.log('🔍 P3g Mirror Integrity Audit\n');

    const collisionResult = await pool.query(`
      SELECT qdrant_point_id, COUNT(*) as collision_count
      FROM nes_chrom_packets
      WHERE qdrant_point_id IS NOT NULL
      GROUP BY qdrant_point_id
      HAVING COUNT(*) > 1
      ORDER BY collision_count DESC
    `);

    report.checks.collision_detection = {
      duplicate_count: collisionResult.rows.length,
      verdict: collisionResult.rows.length === 0 ? 'PASS' : 'FAIL'
    };

    console.log(collisionResult.rows.length === 0 ? '✅ Zero duplicate qdrant_point_ids' : `❌ Found ${collisionResult.rows.length} duplicates`);

    const coverageResult = await pool.query(`
      SELECT
        COUNT(*) as total_packets,
        COUNT(qdrant_point_id) as with_qdrant_id,
        COUNT(*) - COUNT(qdrant_point_id) as missing_qdrant_id,
        ROUND(100.0 * COUNT(qdrant_point_id) / NULLIF(COUNT(*), 0), 2) as coverage_percent
      FROM nes_chrom_packets
    `);

    const coverage = coverageResult.rows[0];
    report.checks.coverage = coverage;
    console.log(`📊 Packets: ${coverage.total_packets} total, ${coverage.with_qdrant_id} with Qdrant ID`);

    const fieldsResult = await pool.query(`
      SELECT
        COUNT(source_ref) as with_source_ref,
        COUNT(feature_id) as with_feature_id,
        COUNT(packet_key) as with_packet_key,
        COUNT(summary) as with_summary
      FROM nes_chrom_packets
    `);

    report.checks.field_integrity = fieldsResult.rows[0];
    const fields = fieldsResult.rows[0];
    console.log(`📋 Field coverage: source_ref=${fields.with_source_ref}, feature_id=${fields.with_feature_id}, packet_key=${fields.with_packet_key}`);

    report.verdict = {
      collision_free: collisionResult.rows.length === 0,
      can_proceed_to_p4: collisionResult.rows.length === 0,
      required_action: collisionResult.rows.length === 0 ? 'proceed_to_p4' : 'repair_duplicates'
    };

    console.log('\n' + '='.repeat(80));
    if (report.verdict.collision_free) {
      console.log('✅ VERDICT: P3g mirror integrity PASS — zero collision duplicates');
      console.log('   Next: Neo4j SIMILAR_TOPOLOGY audit (P4 Phase 1.5)');
    } else {
      console.log('❌ VERDICT: P3g mirror integrity FAIL — repair before P4');
    }
    console.log('='.repeat(80));

    await fs.mkdir(REPORTS_DIR, { recursive: true });
    await fs.writeFile(
      path.join(REPORTS_DIR, 'p3g-mirror-integrity.json'),
      JSON.stringify(report, null, 2)
    );

    console.log(`\n📄 Report: docs/reports/p3g-mirror-integrity.json`);

  } catch (err) {
    console.error('❌ Error:', err.message);
    report.error = err.message;
  } finally {
    await pool.end();
  }
}

auditMirrorIntegrity().catch(console.error);
