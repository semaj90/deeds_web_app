#!/usr/bin/env node
/**
 * @file scripts/atlas/verify-recommendation-count.mjs
 * @description Verifier: Check final recommendation count after apply.
 *
 * Confirms that the materialization produced an acceptable number of
 * recommendations. If count < 100, documents defer reason.
 *
 * Outputs: docs/reports/recommendation-verify-report.json
 */

import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const RECS_JSON = path.join(ROOT, '.opencode', 'recommendations', 'recommendations.json');
const OUT_JSON = path.join(ROOT, 'docs', 'reports', 'recommendation-verify-report.json');

async function main() {
  console.log('\n── Recommendation Verification ───────────────────────────────\n');

  // Load current recommendations
  let recs = null;
  if (!existsSync(RECS_JSON)) {
    console.log(`⚠  No recommendations file: ${RECS_JSON}`);
    recs = { totalCount: 0, clusters: {} };
  } else {
    try {
      recs = JSON.parse(await fs.readFile(RECS_JSON, 'utf8'));
    } catch (e) {
      console.error(`❌ Cannot parse recommendations JSON: ${e.message}`);
      process.exit(1);
    }
  }

  const totalCount = recs.totalCount || 0;
  const clusterCount = Object.keys(recs.clusters || {}).length;

  console.log(`Total recommendations: ${totalCount}`);
  console.log(`Clusters: ${clusterCount}`);
  if (recs.clusters) {
    for (const [cluster, items] of Object.entries(recs.clusters)) {
      console.log(`  - ${cluster}: ${Array.isArray(items) ? items.length : 0}`);
    }
  }
  console.log('');

  // Verification gates
  const gates = {
    count_present: totalCount > 0 ? 'PASS' : 'FAIL',
    count_healthy: totalCount >= 100 ? 'PASS' : 'WARN',
    clusters_present: clusterCount > 0 ? 'PASS' : 'FAIL',
  };

  let deferReason = null;
  if (totalCount === 0) {
    deferReason = 'No recommendations generated — check source data and detection logic';
  } else if (totalCount < 5) {
    deferReason = `Only ${totalCount} recommendations (below expected minimum of 5–10) — investigate merge-key filters`;
  } else if (totalCount < 100) {
    deferReason = `${totalCount} recommendations (below healthy threshold of 100) — document reason for deferred items`;
  }

  console.log('Gates:');
  for (const [gate, status] of Object.entries(gates)) {
    console.log(`  ${gate}: ${status}`);
  }
  if (deferReason) {
    console.log(`  Defer reason: ${deferReason}`);
  }
  console.log('');

  if (totalCount < 100) {
    console.log(`⚠  Under-threshold: ${totalCount} < 100 (documented as deferred)\n`);
  } else {
    console.log(`✓ Healthy count: ${totalCount} >= 100\n`);
  }

  // Build report
  const report = {
    generated_at: new Date().toISOString(),
    total_recommendations: totalCount,
    cluster_count: clusterCount,
    clusters: Object.keys(recs.clusters || {}),
    gates,
    defer_reason: deferReason,
    status: totalCount >= 100 ? 'healthy' : totalCount > 0 ? 'degraded' : 'failed',
    next_action: deferReason
      ? 'Document reason in OPEN-LANES and coordinate with Lane 2 agent'
      : 'Proceed to next lane',
    evidence: [
      'scripts/atlas/verify-recommendation-count.mjs',
      '.opencode/recommendations/recommendations.json',
    ],
  };

  // Write report
  await fs.mkdir(path.dirname(OUT_JSON), { recursive: true });
  await fs.writeFile(OUT_JSON, JSON.stringify(report, null, 2) + '\n', 'utf8');

  console.log(`✓ Verification complete`);
  console.log(`✓ Report: ${path.relative(ROOT, OUT_JSON)}\n`);
}

main().catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
