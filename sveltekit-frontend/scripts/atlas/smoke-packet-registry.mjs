#!/usr/bin/env node
/**
 * P4 Smoke Test: Canonical Packet Registry Validation
 * Validates packet_topology_projection table, orphan detection, and simdjson bridge
 * CPU worker fetches packets → simdjson validates → startup truth report
 */

import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Worker } from 'worker_threads';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');

const report = {
  timestamp: new Date().toISOString(),
  phase: 'smoke-packet-registry',
  status: 'PASS',
  summary: {
    packetsScanned: 0,
    packetsValid: 0,
    orphanPointsDetected: 0,
    simdJsonParseTests: 0,
    simdJsonParseValid: 0,
    topologyProjectionGates: {}
  },
  issues: [],
  warnings: []
};

async function fetchPacketsIntoFile() {
  const client = new pg.Client({
    connectionString: process.env.DATABASE_URL || 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db'
  });

  try {
    await client.connect();
    console.log('📦 Fetching packets into .tmp/packet-registry-smoke.json...');

    // Fetch sample packets from packet_topology_projection
    const result = await client.query(`
      SELECT
        packet_key,
        feature_id,
        source_ref,
        som_row,
        som_col,
        manifold_x,
        manifold_y,
        manifold_z,
        manifold_w,
        qdrant_point_id,
        qdrant_joinable,
        community_id,
        metadata
      FROM packet_topology_projection
      LIMIT 100
    `);

    report.summary.packetsScanned = result.rows.length;

    // Write to .tmp for worker consumption
    const tmpDir = path.join(ROOT, '.tmp');
    if (!fs.existsSync(tmpDir)) {
      fs.mkdirSync(tmpDir, { recursive: true });
    }

    const filePath = path.join(tmpDir, 'packet-registry-smoke.json');
    fs.writeFileSync(filePath, JSON.stringify({
      packets: result.rows,
      timestamp: new Date().toISOString()
    }, null, 2));

    console.log(`✅ Fetched ${result.rows.length} packets to ${filePath}`);
    return filePath;
  } catch (err) {
    report.issues.push(`Fetch packets failed: ${err.message}`);
    report.status = 'FAIL';
    throw err;
  } finally {
    await client.end();
  }
}

async function validatePacketsWithWorker(filePath) {
  return new Promise((resolve, reject) => {
    console.log('🧵 Spawning worker thread for simdjson validation...');

    const worker = new Worker(path.join(__dirname, 'workers', 'packet-validator-worker.mjs'), {
      workerData: { filePath }
    });

    const results = { valid: 0, invalid: 0, errors: [] };

    worker.on('message', (msg) => {
      if (msg.type === 'result') {
        results.valid = msg.valid;
        results.invalid = msg.invalid;
        results.errors = msg.errors;
      } else if (msg.type === 'progress') {
        console.log(`  ⏳ ${msg.message}`);
      }
    });

    worker.on('error', reject);
    worker.on('exit', (code) => {
      if (code === 0) {
        resolve(results);
      } else {
        reject(new Error(`Worker exited with code ${code}`));
      }
    });
  });
}

async function checkOrphanPoints() {
  const client = new pg.Client({
    connectionString: process.env.DATABASE_URL || 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db'
  });

  try {
    await client.connect();
    console.log('🔍 Checking orphan points...');

    const result = await client.query(`
      SELECT COUNT(*) as count
      FROM qdrant_orphan_points
      WHERE resolved = false
    `);

    const orphanCount = parseInt(result.rows[0].count, 10);
    report.summary.orphanPointsDetected = orphanCount;

    if (orphanCount > 0) {
      report.warnings.push(`${orphanCount} unresolved orphan points detected`);
    } else {
      console.log('✅ No unresolved orphan points');
    }
  } catch (err) {
    report.warnings.push(`Orphan point check failed: ${err.message}`);
  } finally {
    await client.end();
  }
}

async function validateTopologyProjection() {
  const client = new pg.Client({
    connectionString: process.env.DATABASE_URL || 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db'
  });

  try {
    await client.connect();
    console.log('📊 Validating packet_topology_projection gates...');

    // Gate 1: Table exists
    const tableCheck = await client.query(`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'packet_topology_projection'
      ) as exists
    `);
    report.summary.topologyProjectionGates.tableExists = tableCheck.rows[0].exists ? 'PASS' : 'FAIL';
    if (!tableCheck.rows[0].exists) {
      report.issues.push('packet_topology_projection table does not exist');
      report.status = 'FAIL';
      return;
    }

    // Gate 2: Required columns
    const columnCheck = await client.query(`
      SELECT COUNT(*) as count FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'packet_topology_projection'
      AND column_name IN (
        'packet_key', 'feature_id', 'source_ref', 'som_row', 'som_col',
        'manifold_x', 'manifold_y', 'manifold_z', 'manifold_w',
        'qdrant_point_id', 'qdrant_joinable'
      )
    `);
    const columnCount = parseInt(columnCheck.rows[0].count, 10);
    report.summary.topologyProjectionGates.requiredColumnsExist = columnCount === 11 ? 'PASS' : 'FAIL';
    if (columnCount < 11) {
      report.warnings.push(`Only ${columnCount}/11 required columns present`);
    }

    // Gate 3: Row count
    const rowCheck = await client.query(`
      SELECT COUNT(*) as count FROM packet_topology_projection
    `);
    const rowCount = parseInt(rowCheck.rows[0].count, 10);
    report.summary.topologyProjectionGates.hasRows = rowCount > 0 ? 'PASS' : 'WARN';
    console.log(`✅ Topology projection: ${rowCount} rows`);

    // Gate 4: Manifold coordinates validity
    const manifoldCheck = await client.query(`
      SELECT COUNT(*) as count FROM packet_topology_projection
      WHERE manifold_x IS NOT NULL
        AND manifold_y IS NOT NULL
        AND manifold_z IS NOT NULL
        AND manifold_w IS NOT NULL
    `);
    const manifoldCount = parseInt(manifoldCheck.rows[0].count, 10);
    const manifoldCoverage = rowCount > 0 ? ((manifoldCount / rowCount) * 100).toFixed(1) : 0;
    report.summary.topologyProjectionGates.manifoldCoordinates = manifoldCount > rowCount * 0.8 ? 'PASS' : 'WARN';
    console.log(`✅ Manifold coordinates: ${manifoldCount}/${rowCount} (${manifoldCoverage}%)`);

    // Gate 5: Qdrant joinability
    const qdrantCheck = await client.query(`
      SELECT COUNT(*) as count FROM packet_topology_projection
      WHERE qdrant_joinable = true AND qdrant_point_id IS NOT NULL
    `);
    const qdrantJoinable = parseInt(qdrantCheck.rows[0].count, 10);
    const qdrantCoverage = rowCount > 0 ? ((qdrantJoinable / rowCount) * 100).toFixed(1) : 0;
    report.summary.topologyProjectionGates.qdrantJoinable = qdrantJoinable > rowCount * 0.5 ? 'PASS' : 'WARN';
    console.log(`✅ Qdrant joinable: ${qdrantJoinable}/${rowCount} (${qdrantCoverage}%)`);
  } catch (err) {
    report.issues.push(`Topology projection validation failed: ${err.message}`);
    report.status = 'FAIL';
  } finally {
    await client.end();
  }
}

async function main() {
  console.log('🔍 P4 Canonical Packet Registry Smoke Test\n');

  try {
    // Step 1: Validate topology projection schema/gates
    await validateTopologyProjection();

    // Step 2: Check orphan points
    await checkOrphanPoints();

    // Step 3: Fetch packets to file
    const filePath = await fetchPacketsIntoFile();

    // Step 4: Validate with worker (simdjson if available, fallback to JSON.parse)
    const workerResults = await validatePacketsWithWorker(filePath);
    report.summary.simdJsonParseTests = workerResults.valid + workerResults.invalid;
    report.summary.simdJsonParseValid = workerResults.valid;
    if (workerResults.errors.length > 0) {
      report.issues.push(...workerResults.errors);
    }

    // Determine overall status
    const failGates = Object.entries(report.summary.topologyProjectionGates)
      .filter(([_, v]) => v === 'FAIL');
    if (failGates.length > 0) {
      report.status = 'FAIL';
    } else if (report.issues.length > 0) {
      report.status = 'FAIL';
    } else if (report.warnings.length > 0) {
      report.status = 'WARN';
    }

    // Write report
    const reportPath = path.join(ROOT, '.tmp', 'smoke-packet-registry.json');
    if (!fs.existsSync(path.dirname(reportPath))) {
      fs.mkdirSync(path.dirname(reportPath), { recursive: true });
    }
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

    // Print summary
    console.log('\n📊 Smoke Test Results:');
    console.log(`  Status: ${report.status}`);
    console.log(`  Packets scanned: ${report.summary.packetsScanned}`);
    console.log(`  simdjson parse valid: ${report.summary.simdJsonParseValid}/${report.summary.simdJsonParseTests}`);
    console.log(`  Orphan points: ${report.summary.orphanPointsDetected}`);
    console.log(`\n✅ Report: ${reportPath}`);

    if (report.warnings.length > 0) {
      console.log('\n⚠️ Warnings:');
      report.warnings.forEach(w => console.log(`  • ${w}`));
    }

    if (report.issues.length > 0) {
      console.log('\n❌ Issues:');
      report.issues.forEach(i => console.log(`  • ${i}`));
    }

    process.exit(report.status === 'FAIL' ? 1 : 0);
  } catch (err) {
    console.error('❌ Fatal error:', err.message);
    process.exit(1);
  }
}

main();