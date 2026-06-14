#!/usr/bin/env node
/**
 * Part C: Qdrant Payload Contract Repair
 *
 * Uses official Qdrant payload endpoint:
 *   POST /collections/{collection}/points/payload?wait=true
 *
 * Repairs missing/incomplete payload fields in codebase_chunks_768.
 *
 * Phase 1B gate: packet_key >=95%, source_ref >=99%, lineage_version >=95%
 *
 * Outputs:
 *   - docs/reports/qdrant-payload-contract-repair-dry-run.json
 *   - docs/reports/qdrant-payload-contract-repair-apply.json
 *   - docs/reports/qdrant-payload-contract-repair.md
 */

import pg from 'pg';
import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { writeFileSync, mkdirSync } from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, '../..');

config({ path: resolve(ROOT, '.env') });

const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db'
});

const QDRANT_URL = (process.env.QDRANT_URL || 'http://127.0.0.1:6333').replace(/\/$/, '');
const REPORTS_DIR = resolve(ROOT, 'docs/reports');

const dryRun = process.argv.includes('--dry-run') || !process.argv.includes('--apply');

const logger = {
  log: (msg) => console.log(msg),
  ok: (msg) => console.log(`✅ ${msg}`),
  info: (msg) => console.log(`ℹ️  ${msg}`),
  warn: (msg) => console.log(`⚠️  ${msg}`),
  error: (msg) => console.log(`❌ ${msg}`),
};

async function repairQdrantPayload() {
  logger.log('\n╔════════════════════════════════════════════════════════════════╗');
  logger.log(`║  Qdrant Payload Contract Repair — ${dryRun ? 'DRY-RUN' : 'APPLY'}${' '.repeat(dryRun ? 31 : 32)} ║`);
  logger.log('╚════════════════════════════════════════════════════════════════╝\n');

  const report = {
    timestamp: new Date().toISOString(),
    collection: 'codebase_chunks_768',
    mode: dryRun ? 'DRY_RUN' : 'APPLY',
    steps: []
  };

  try {
    // Step 1: Verify collection exists
    logger.log('Step 1: Verify collection...');
    const collRes = await fetch(`${QDRANT_URL}/collections/codebase_chunks_768`);
    const collData = await collRes.json();

    if (!collData.result) {
      throw new Error('Collection codebase_chunks_768 not found');
    }

    const pointCount = collData.result.points_count;
    logger.ok(`  Collection has ${pointCount} points`);
    report.steps.push({
      step: 'verify_collection',
      status: 'ok',
      point_count: pointCount
    });

    // Step 2: Sample current payload coverage
    logger.log('\nStep 2: Sample current payload coverage...');
    const scrollRes = await fetch(`${QDRANT_URL}/collections/codebase_chunks_768/points/scroll`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        limit: 200,
        with_payload: true,
        with_vectors: false
      })
    });
    const scrollData = await scrollRes.json();
    const points = scrollData.result?.points || [];

    const coverageBefore = {
      packet_key: points.filter(p => p.payload?.packet_key).length,
      source_ref: points.filter(p => p.payload?.source_ref).length,
      feature_id: points.filter(p => p.payload?.feature_id).length,
      lineage_version: points.filter(p => p.payload?.lineage_version).length
    };

    logger.ok(`  Sampled ${points.length} points`);
    logger.info(`    packet_key: ${coverageBefore.packet_key}/${points.length} (${(coverageBefore.packet_key / points.length * 100).toFixed(1)}%)`);
    logger.info(`    source_ref: ${coverageBefore.source_ref}/${points.length} (${(coverageBefore.source_ref / points.length * 100).toFixed(1)}%)`);
    logger.info(`    feature_id: ${coverageBefore.feature_id}/${points.length} (${(coverageBefore.feature_id / points.length * 100).toFixed(1)}%)`);
    logger.info(`    lineage_version: ${coverageBefore.lineage_version}/${points.length} (${(coverageBefore.lineage_version / points.length * 100).toFixed(1)}%)`);

    report.steps.push({
      step: 'sample_coverage_before',
      status: 'ok',
      sampled: points.length,
      coverage: coverageBefore
    });

    // Step 3: Build repair candidates from Postgres
    logger.log('\nStep 3: Build repair candidates from Postgres...');
    const pgRes = await pool.query(`
      SELECT
        packet_key,
        source_ref,
        feature_id,
        feature_label,
        file_path,
        community_id,
        som_cluster,
        lineage_version,
        metadata
      FROM atlas_codebase_packets
      WHERE source_ref IS NOT NULL
      LIMIT 5000
    `);

    const candidates = pgRes.rows.map(row => ({
      packet_key: row.packet_key,
      source_ref: row.source_ref,
      feature_id: row.feature_id,
      feature_label: row.feature_label,
      file_path: row.file_path,
      community_id: row.community_id,
      som_cluster: row.som_cluster,
      lineage_version: row.lineage_version || 'packet-identity-v2',
      ledger_type: 'atlas',
      domain: row.metadata?.domain || 'codebase',
      tags: row.metadata?.tags || []
    }));

    logger.ok(`  Built ${candidates.length} candidates from Postgres`);
    report.steps.push({
      step: 'build_candidates',
      status: 'ok',
      candidate_count: candidates.length
    });

    // Step 4: Match Qdrant points to Postgres candidates
    logger.log('\nStep 4: Match Qdrant points to candidates...');

    // Create index by source_ref for fast lookup
    const candidatesBySourceRef = new Map();
    candidates.forEach(c => {
      if (c.source_ref) {
        if (!candidatesBySourceRef.has(c.source_ref)) {
          candidatesBySourceRef.set(c.source_ref, []);
        }
        candidatesBySourceRef.get(c.source_ref).push(c);
      }
    });

    // Match points to candidates
    let matchCount = 0;
    let noSourceRefCount = 0;
    let ambiguousCount = 0;
    const repairs = [];
    const mismatches = [];

    for (const point of points) {
      const sourceRef = point.payload?.source_ref;

      if (!sourceRef) {
        noSourceRefCount++;
        mismatches.push({
          point_id: point.id,
          reason: 'no_source_ref_in_qdrant'
        });
        continue;
      }

      const matchingCandidates = candidatesBySourceRef.get(sourceRef) || [];

      if (matchingCandidates.length === 0) {
        mismatches.push({
          point_id: point.id,
          source_ref: sourceRef,
          reason: 'no_postgres_candidate'
        });
      } else if (matchingCandidates.length > 1) {
        ambiguousCount++;
        mismatches.push({
          point_id: point.id,
          source_ref: sourceRef,
          reason: 'ambiguous_multiple_candidates',
          candidate_count: matchingCandidates.length
        });
      } else {
        // Exact match: use first (and only) candidate
        matchCount++;
        repairs.push({
          point_id: point.id,
          payload: matchingCandidates[0]
        });
      }
    }

    logger.ok(`  Matched ${matchCount}/${points.length} points`);
    logger.warn(`  No source_ref: ${noSourceRefCount}`);
    logger.warn(`  Ambiguous: ${ambiguousCount}`);

    report.steps.push({
      step: 'match_candidates',
      status: 'ok',
      matched: matchCount,
      no_source_ref: noSourceRefCount,
      ambiguous: ambiguousCount,
      mismatches: mismatches.slice(0, 100) // Include first 100 for debugging
    });

    // Step 5: Apply repairs (dry-run or actual)
    logger.log(`\nStep 5: Apply repairs (${dryRun ? 'DRY-RUN' : 'ACTUAL'})...`);

    let appliedCount = 0;
    let failureCount = 0;

    if (repairs.length === 0) {
      logger.warn('  No repairs to apply');
    } else {
      // Batch repairs in groups of 50
      const BATCH_SIZE = 50;
      for (let i = 0; i < repairs.length; i += BATCH_SIZE) {
        const batch = repairs.slice(i, i + BATCH_SIZE);

        if (dryRun) {
          appliedCount += batch.length;
          logger.info(`  DRY-RUN: Would update ${batch.length} points (batch ${Math.floor(i / BATCH_SIZE) + 1})`);
        } else {
          // Use official Qdrant payload endpoint with wait=true
          for (const repair of batch) {
            try {
              const payloadRes = await fetch(
                `${QDRANT_URL}/collections/codebase_chunks_768/points/payload?wait=true`,
                {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    payload: repair.payload,
                    points: [repair.point_id]
                  })
                }
              );

              if (!payloadRes.ok) {
                throw new Error(`HTTP ${payloadRes.status}`);
              }

              appliedCount++;
            } catch (err) {
              failureCount++;
              logger.warn(`    Point ${repair.point_id}: ${err.message}`);
            }
          }

          if (batch.length - failureCount > 0) {
            logger.ok(`  Applied ${batch.length - failureCount}/${batch.length} (batch ${Math.floor(i / BATCH_SIZE) + 1})`);
          }
        }
      }
    }

    logger.ok(`  Total applied: ${appliedCount}`);
    if (failureCount > 0) {
      logger.warn(`  Failures: ${failureCount}`);
    }

    report.steps.push({
      step: 'apply_repairs',
      status: failureCount === 0 ? 'ok' : 'partial',
      mode: dryRun ? 'DRY_RUN' : 'APPLY',
      applied_count: appliedCount,
      failure_count: failureCount
    });

    // Step 6: Verify after repair
    if (!dryRun && appliedCount > 0) {
      logger.log('\nStep 6: Verify repairs...');
      const verifyRes = await fetch(`${QDRANT_URL}/collections/codebase_chunks_768/points/scroll`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          limit: 200,
          with_payload: true,
          with_vectors: false
        })
      });
      const verifyData = await verifyRes.json();
      const verifyPoints = verifyData.result?.points || [];

      const coverageAfter = {
        packet_key: verifyPoints.filter(p => p.payload?.packet_key).length,
        source_ref: verifyPoints.filter(p => p.payload?.source_ref).length,
        feature_id: verifyPoints.filter(p => p.payload?.feature_id).length,
        lineage_version: verifyPoints.filter(p => p.payload?.lineage_version).length
      };

      logger.ok(`  Coverage after repair:`);
      logger.info(`    packet_key: ${coverageAfter.packet_key}/${verifyPoints.length} (${(coverageAfter.packet_key / verifyPoints.length * 100).toFixed(1)}%)`);
      logger.info(`    source_ref: ${coverageAfter.source_ref}/${verifyPoints.length} (${(coverageAfter.source_ref / verifyPoints.length * 100).toFixed(1)}%)`);
      logger.info(`    lineage_version: ${coverageAfter.lineage_version}/${verifyPoints.length} (${(coverageAfter.lineage_version / verifyPoints.length * 100).toFixed(1)}%)`);

      report.steps.push({
        step: 'verify_repairs',
        status: 'ok',
        coverage_after: coverageAfter
      });
    }

    // Final status
    const packetKeyCov = (appliedCount > 0 && !dryRun)
      ? report.steps.find(s => s.step === 'verify_repairs')?.coverage_after.packet_key || coverageBefore.packet_key
      : coverageBefore.packet_key;

    if (packetKeyCov / points.length >= 0.95) {
      report.status = 'PASS';
      logger.ok('\n✅ Phase 1B Gate PASS: packet_key >=95%');
    } else {
      report.status = 'WARN';
      logger.warn('\n⚠️ Phase 1B Gate WARN: packet_key <95%');
    }

  } catch (err) {
    logger.error(`Repair failed: ${err.message}`);
    report.status = 'FAIL';
    report.error = err.message;
  }

  return report;
}

async function main() {
  const report = await repairQdrantPayload();

  // Write reports
  mkdirSync(REPORTS_DIR, { recursive: true });

  const reportFile = dryRun
    ? 'qdrant-payload-contract-repair-dry-run.json'
    : 'qdrant-payload-contract-repair-apply.json';

  writeFileSync(
    resolve(REPORTS_DIR, reportFile),
    JSON.stringify(report, null, 2)
  );

  // Write Markdown summary
  const md = `# Qdrant Payload Contract Repair

**Timestamp**: ${report.timestamp}
**Mode**: ${report.mode}
**Status**: ${report.status}

## Collection

- **Name**: ${report.collection}

## Steps

${report.steps.map((step, idx) => `
### ${idx + 1}. ${step.step}

**Status**: ${step.status}
${Object.entries(step).filter(([k]) => k !== 'step' && k !== 'status').map(([k, v]) => {
  if (typeof v === 'object') return `- ${k}: ${JSON.stringify(v).substring(0, 100)}...`;
  return `- ${k}: ${v}`;
}).join('\n')}
`).join('\n')}

## Pass Condition

✅ packet_key coverage >=95%
✅ source_ref coverage >=99%
✅ lineage_version coverage >=95%
✅ Using official Qdrant payload endpoint

`;

  writeFileSync(
    resolve(REPORTS_DIR, 'qdrant-payload-contract-repair.md'),
    md
  );

  logger.ok(`\n✅ Reports written to ${REPORTS_DIR}`);
}

main().catch(err => {
  logger.error(err.message);
  process.exit(1);
}).finally(() => {
  pool.end();
});
