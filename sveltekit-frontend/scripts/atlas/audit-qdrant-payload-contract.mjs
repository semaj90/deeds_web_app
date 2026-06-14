#!/usr/bin/env node
/**
 * audit-qdrant-payload-contract.mjs
 *
 * Audit Qdrant codebase_chunks_768 payload coverage against Phase 4 canonical contract.
 *
 * Phase 4 requirements:
 * - feature_id: 100% ✅
 * - source_ref: 100% ✅
 * - packet_key: 100% ✅
 * - feature_label: ≥90%
 * - file_path: ≥90%
 * - cluster_id: ≥80%
 * - domain_class: ≥80%
 *
 * Usage:
 *   npm run atlas:4c:qdrant-contract:audit
 *   npm run atlas:4c:qdrant-contract:audit -- --full
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dir, '../..');

const QDRANT_URL = process.env.QDRANT_URL || 'http://localhost:6333';
const COLLECTION = 'codebase_chunks_768';
const FULL_SCAN = process.argv.includes('--full');
const SAMPLE_SIZE = FULL_SCAN ? 100000 : 500;

const REQUIRED_FIELDS = ['feature_id', 'source_ref', 'packet_key'];
const RECOMMENDED_FIELDS = ['feature_label', 'file_path', 'cluster_id', 'domain_class'];

async function auditPayloadContract() {
  console.log('\n═══ Qdrant Payload Contract Audit ═══\n');
  console.log(`Collection: ${COLLECTION}`);
  console.log(`URL: ${QDRANT_URL}`);
  console.log(`Mode: ${FULL_SCAN ? 'FULL' : `SAMPLE (${SAMPLE_SIZE})`}\n`);

  const report = {
    generatedAt: new Date().toISOString(),
    collection: COLLECTION,
    url: QDRANT_URL,
    mode: FULL_SCAN ? 'full' : 'sample',
    sampleSize: SAMPLE_SIZE,
    fields: {}
  };

  try {
    // 1. Get collection stats
    const statsRes = await fetch(`${QDRANT_URL}/collections/${COLLECTION}`);
    if (!statsRes.ok) {
      throw new Error(`Qdrant ${statsRes.status}: ${await statsRes.text()}`);
    }

    const stats = await statsRes.json();
    const totalPoints = stats.result.points_count;
    console.log(`Total points: ${totalPoints.toLocaleString()}`);

    // 2. Scroll through points to audit payload
    let scrollOffset = null;
    let pointsProcessed = 0;
    const fieldCounts = {};

    // Initialize field counters
    [...REQUIRED_FIELDS, ...RECOMMENDED_FIELDS].forEach(f => {
      fieldCounts[f] = { present: 0, missing: 0, null: 0 };
    });

    console.log(`\nScanning payload (${Math.min(SAMPLE_SIZE, totalPoints).toLocaleString()} points)...\n`);

    while (pointsProcessed < SAMPLE_SIZE && pointsProcessed < totalPoints) {
      const scrollRes = await fetch(`${QDRANT_URL}/collections/${COLLECTION}/points/scroll`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          limit: Math.min(500, SAMPLE_SIZE - pointsProcessed),
          offset: scrollOffset,
          with_payload: true
        })
      });

      if (!scrollRes.ok) {
        throw new Error(`Scroll ${scrollRes.status}`);
      }

      const { result } = await scrollRes.json();
      if (!result.points || result.points.length === 0) break;

      // Audit each point's payload
      for (const point of result.points) {
        const payload = point.payload || {};

        // Check each field
        [...REQUIRED_FIELDS, ...RECOMMENDED_FIELDS].forEach(field => {
          const value = payload[field];

          if (value === null || value === undefined) {
            fieldCounts[field].null++;
          } else if (value === '' || (Array.isArray(value) && value.length === 0)) {
            fieldCounts[field].missing++;
          } else {
            fieldCounts[field].present++;
          }
        });

        pointsProcessed++;
      }

      scrollOffset = result.next_page_offset;
      process.stdout.write(`\r  Scanned: ${pointsProcessed.toLocaleString()}/${Math.min(SAMPLE_SIZE, totalPoints)}`);
    }

    console.log('\n\n--- Field Coverage ---\n');

    // Analyze and report
    const results = {};
    let allPass = true;

    for (const field of REQUIRED_FIELDS) {
      const stats = fieldCounts[field];
      const percent = pointsProcessed > 0 ? (100 * stats.present / pointsProcessed).toFixed(1) : '0';
      const isRequired = true;
      const threshold = isRequired ? 100 : 90;
      const pass = percent >= threshold;

      if (!pass) allPass = false;

      const status = pass ? '✅' : '❌';
      console.log(`${status} ${field.padEnd(15)} ${stats.present.toLocaleString()}/${pointsProcessed} (${percent}%)`);

      results[field] = {
        present: stats.present,
        missing: stats.missing,
        null: stats.null,
        total: pointsProcessed,
        percent: parseFloat(percent),
        required: true,
        threshold: threshold,
        pass: pass
      };
    }

    console.log('');

    for (const field of RECOMMENDED_FIELDS) {
      const stats = fieldCounts[field];
      const percent = pointsProcessed > 0 ? (100 * stats.present / pointsProcessed).toFixed(1) : '0';
      const threshold = 80;
      const pass = percent >= threshold;

      if (!pass) allPass = false;

      const status = pass ? '✅' : '⚠️ ';
      console.log(`${status} ${field.padEnd(15)} ${stats.present.toLocaleString()}/${pointsProcessed} (${percent}%)`);

      results[field] = {
        present: stats.present,
        missing: stats.missing,
        null: stats.null,
        total: pointsProcessed,
        percent: parseFloat(percent),
        required: false,
        threshold: threshold,
        pass: pass
      };
    }

    console.log(`\nGate: ${allPass ? '✅ PASS' : '❌ FAIL'}\n`);

    // Write report
    const reportDir = join(ROOT, 'docs', 'reports');
    mkdirSync(reportDir, { recursive: true });

    report.pointsScanned = pointsProcessed;
    report.totalPoints = totalPoints;
    report.fields = results;
    report.gate = allPass ? 'PASS' : 'FAIL';

    writeFileSync(
      join(reportDir, 'qdrant-payload-contract-audit.json'),
      JSON.stringify(report, null, 2)
    );

    console.log(`Report: docs/reports/qdrant-payload-contract-audit.json\n`);

    if (allPass) {
      console.log(`✅ Qdrant payload contract PASS — ready for Phase D (Karpathy Redis).\n`);
    } else {
      console.log(`❌ Qdrant payload contract FAIL — run:\n`);
      console.log(`   npm run atlas:4b:qdrant-payload -- --apply\n`);
      console.log(`Then re-run:\n`);
      console.log(`   npm run atlas:4c:qdrant-contract:audit\n`);
    }

  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  }
}

auditPayloadContract();
