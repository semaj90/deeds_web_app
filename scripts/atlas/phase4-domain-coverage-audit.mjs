#!/usr/bin/env node

/**
 * Phase 4: Domain Class Coverage Audit (DATA-LEVEL, not file-level)
 *
 * Verifies that atlas_packets.domain_class is populated across the dataset.
 * This is a REAL gate, not a file-existence smoke test.
 *
 * Success criteria:
 * - ≥95% of packets have domain_class IS NOT NULL
 * - ≥6 distinct domain_class values
 * - 0 orphaned packets (missing domain_class, source_ref, or feature_id)
 *
 * Usage:
 *   node scripts/atlas/phase4-domain-coverage-audit.mjs --apply
 */

import { Pool } from 'pg';

const APPLY = process.argv.includes('--apply');
const DRY_RUN = !APPLY;

const pgPool = new Pool({
  host: process.env.POSTGRES_HOST || 'localhost',
  port: parseInt(process.env.POSTGRES_PORT || '5434'),
  database: process.env.POSTGRES_DB || 'legal_ai_db',
  user: process.env.POSTGRES_USER || 'legal_admin',
  password: process.env.POSTGRES_PASSWORD || '123456',
});

async function auditDomainCoverage() {
  console.log('\n╔════════════════════════════════════════════════════════════════╗');
  console.log('║  Phase 4: Domain Class Coverage Audit (DATA-LEVEL)             ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  console.log(`Mode: ${DRY_RUN ? 'DRY-RUN' : 'APPLY'}\n`);

  try {
    // 1. Coverage audit
    console.log('📊 Coverage Audit:');
    const coverageResult = await pgPool.query(`
      SELECT
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE domain_class IS NOT NULL) as with_domain,
        ROUND(100.0 * COUNT(*) FILTER (WHERE domain_class IS NOT NULL) / COUNT(*), 1) as pct
      FROM atlas_packets
      WHERE packet_key IS NOT NULL
    `);

    const { total, with_domain, pct } = coverageResult.rows[0];
    console.log(`  Total packets: ${total}`);
    console.log(`  With domain_class: ${with_domain}`);
    console.log(`  Coverage: ${pct}%\n`);

    // 2. Distribution
    console.log('📈 Domain Class Distribution:');
    const distResult = await pgPool.query(`
      SELECT domain_class, COUNT(*) as cnt
      FROM atlas_packets
      WHERE domain_class IS NOT NULL
      GROUP BY domain_class
      ORDER BY cnt DESC
    `);

    const distinctCount = distResult.rows.length;
    for (const row of distResult.rows) {
      console.log(`  ${row.domain_class}: ${row.cnt}`);
    }
    console.log(`  Distinct values: ${distinctCount}\n`);

    // 3. Orphan check
    console.log('🔍 Orphan Detection:');
    const orphanResult = await pgPool.query(`
      SELECT COUNT(*) as orphan_count
      FROM atlas_packets
      WHERE packet_key IS NOT NULL
        AND (domain_class IS NULL OR source_ref IS NULL OR feature_id IS NULL)
    `);

    const orphanCount = orphanResult.rows[0].orphan_count;
    console.log(`  Orphaned packets: ${orphanCount}\n`);

    // 4. Gate evaluation
    console.log('🚪 Gate Evaluation:');
    const gatePassed =
      pct >= 95 &&
      distinctCount >= 6 &&
      orphanCount === 0;

    const checks = [
      { name: 'Coverage ≥95%', passed: pct >= 95, actual: pct },
      { name: 'Distinct values ≥6', passed: distinctCount >= 6, actual: distinctCount },
      { name: 'No orphans', passed: orphanCount === 0, actual: orphanCount },
    ];

    for (const check of checks) {
      const icon = check.passed ? '✅' : '❌';
      console.log(`  ${icon} ${check.name}: ${check.actual}`);
    }

    console.log(`\n${gatePassed ? '🟢 PASS' : '🔴 FAIL'}: Domain class coverage gate ${gatePassed ? 'passed' : 'FAILED'}\n`);

    if (!gatePassed) {
      console.log('📋 Recommendations:');
      if (pct < 95) {
        console.log(`  - Coverage is ${pct}% (need 95%). Run domain classifier on missing packets.`);
      }
      if (distinctCount < 6) {
        console.log(`  - Only ${distinctCount} distinct domain_class values (need ≥6). Check AST classifier rules.`);
      }
      if (orphanCount > 0) {
        console.log(`  - ${orphanCount} orphaned packets. Validate source_ref + feature_id lineage.`);
      }
    }

    await pgPool.end();
    process.exit(gatePassed ? 0 : 1);
  } catch (err) {
    console.error(`✗ Error: ${err.message}`);
    await pgPool.end();
    process.exit(1);
  }
}

auditDomainCoverage();
