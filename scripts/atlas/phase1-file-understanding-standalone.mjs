#!/usr/bin/env node
/**
 * Phase 1: File Understanding Labels (Standalone)
 *
 * Purpose: Compute file_purpose, thoroughness, app_criticality, test_coverage_pct
 * for every packet in atlas_packets using fast heuristics (regex + file stats).
 *
 * Workflow:
 *   1. Load all packets from atlas_packets
 *   2. Batch-compute heuristic labels — 5-10s
 *   3. Write labels to database with audit trail
 *   4. Report coverage and confidence distribution
 *
 * Usage:
 *   node scripts/atlas/phase1-file-understanding-standalone.mjs [--dry-run] [--limit=1000]
 */

import pg from 'pg';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WORKSPACE_ROOT = path.resolve(__dirname, '../..');

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const LIMIT = args.find(a => a.startsWith('--limit='))?.split('=')[1] ?
  parseInt(args.find(a => a.startsWith('--limit='))?.split('=')[1]) :
  null;

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://legal_admin@localhost/legal_ai_db',
});

// ════════════════════════════════════════════════════════════════════════
// Heuristic Label Computation
// ════════════════════════════════════════════════════════════════════════

const HEURISTIC_RULES = {
  purpose: {
    test: /test|spec|\.test\.|\.spec\.|__tests__|jest\.setup/i,
    config: /config|\.config\.|settings|env\.|constants\./i,
    infrastructure: /docker|ci|github|gitlab|jenkins|kubernetes|dockerfile|makefile/i,
    core: /db|model|schema|service|api|handler|controller|handler|middleware/i,
    utility: /helper|util|lib|function|constants|types|interface|abstract/i,
    audit: /audit|log|logger|monitoring|metric|trace/i,
    demo: /demo|example|showcase|sample/i,
    deprecated: /deprecated|legacy|old|obsolete|removed/i,
    archived: /archive|backup|old_code|history/i,
  },
};

function computeHeuristicLabels(packet) {
  const sourceRef = packet.source_ref || '';
  const summary = packet.summary || '';
  const summaryLength = summary.trim().length;

  // File purpose (regex matching on source_ref)
  let filePurpose = 'other';
  let purposeConfidence = 0.5;
  for (const [purpose, regex] of Object.entries(HEURISTIC_RULES.purpose)) {
    if (regex.test(sourceRef)) {
      filePurpose = purpose;
      purposeConfidence = 0.6;
      break;
    }
  }

  // Thoroughness (based on summary length)
  let thoroughness = 'stub';
  let thoroughnessNum = 1;
  if (summaryLength >= 2000) {
    thoroughness = 'battle_tested';
    thoroughnessNum = 5;
  } else if (summaryLength >= 500) {
    thoroughness = 'feature_complete';
    thoroughnessNum = 4;
  } else if (summaryLength >= 150) {
    thoroughness = 'partial';
    thoroughnessNum = 3;
  } else if (summaryLength >= 50) {
    thoroughness = 'outline';
    thoroughnessNum = 2;
  }

  // Test coverage heuristic
  let testCoveragePct = 0;
  if (filePurpose === 'test') {
    testCoveragePct = 50;
  }

  // Criticality
  let appCriticality = 'optional';
  if (filePurpose === 'core') {
    appCriticality = 'high_risk';
  } else if (filePurpose === 'infrastructure' || filePurpose === 'db' || filePurpose === 'auth') {
    appCriticality = 'high_risk';
  } else if (filePurpose === 'utility' || filePurpose === 'helper') {
    appCriticality = 'mid_tier';
  }

  return {
    file_purpose: filePurpose,
    thoroughness: thoroughness,
    app_criticality: appCriticality,
    test_coverage_pct: testCoveragePct,
    confidence: purposeConfidence,
    method: 'heuristic',
  };
}

// ════════════════════════════════════════════════════════════════════════
// Main Execution
// ════════════════════════════════════════════════════════════════════════

async function main() {
  const startTime = Date.now();

  console.log(`🔍 Phase 1: File Understanding Labels (${DRY_RUN ? 'DRY-RUN' : 'APPLY'})`);
  console.log(`📦 Database: ${process.env.DATABASE_URL || 'postgresql://legal_admin@localhost/legal_ai_db'}`);

  const client = await pool.connect();

  try {
    // Create enums if they don't exist
    console.log('\n📝 Checking enums...');
    try {
      await client.query(`CREATE TYPE file_purpose_enum AS ENUM ('audit', 'config', 'utility', 'core', 'test', 'demo', 'deprecated', 'archived', 'infrastructure', 'other');`);
    } catch (e) {
      if (e.code !== '42710') throw e; // 42710 = type already exists
    }
    try {
      await client.query(`CREATE TYPE thoroughness_enum AS ENUM ('stub', 'outline', 'partial', 'feature_complete', 'battle_tested');`);
    } catch (e) {
      if (e.code !== '42710') throw e;
    }
    try {
      await client.query(`CREATE TYPE app_criticality_enum AS ENUM ('core', 'high_risk', 'mid_tier', 'optional', 'experimental');`);
    } catch (e) {
      if (e.code !== '42710') throw e;
    }

    // Add columns if they don't exist
    console.log('🏗️  Ensuring columns exist...');
    const checkColumns = await client.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'atlas_packets'
      AND column_name IN ('file_purpose', 'thoroughness', 'app_criticality', 'test_coverage_pct');
    `);

    if (checkColumns.rows.length < 4) {
      const missingColumns =
        !checkColumns.rows.find(r => r.column_name === 'file_purpose')
          ? 'file_purpose file_purpose_enum DEFAULT \'other\',' : '';
      const colThoroughness =
        !checkColumns.rows.find(r => r.column_name === 'thoroughness')
          ? 'thoroughness thoroughness_enum DEFAULT \'stub\',' : '';
      const colCriticality =
        !checkColumns.rows.find(r => r.column_name === 'app_criticality')
          ? 'app_criticality app_criticality_enum DEFAULT \'optional\',' : '';
      const colCoverage =
        !checkColumns.rows.find(r => r.column_name === 'test_coverage_pct')
          ? 'test_coverage_pct INTEGER DEFAULT 0,' : '';

      if (missingColumns || colThoroughness || colCriticality || colCoverage) {
        const addCols = `ALTER TABLE atlas_packets ADD COLUMN IF NOT EXISTS
          ${missingColumns} ${colThoroughness} ${colCriticality} ${colCoverage}
          file_understanding_computed_at TIMESTAMP,
          file_understanding_method TEXT;`.replace(/,\s*,/g, ',').replace(/,\s*file_understanding/,', file_understanding');

        console.log(`  Adding missing columns...`);
        if (missingColumns) await client.query(`ALTER TABLE atlas_packets ADD COLUMN IF NOT EXISTS file_purpose file_purpose_enum DEFAULT 'other';`);
        if (colThoroughness) await client.query(`ALTER TABLE atlas_packets ADD COLUMN IF NOT EXISTS thoroughness thoroughness_enum DEFAULT 'stub';`);
        if (colCriticality) await client.query(`ALTER TABLE atlas_packets ADD COLUMN IF NOT EXISTS app_criticality app_criticality_enum DEFAULT 'optional';`);
        if (colCoverage) await client.query(`ALTER TABLE atlas_packets ADD COLUMN IF NOT EXISTS test_coverage_pct INTEGER DEFAULT 0;`);
        await client.query(`ALTER TABLE atlas_packets ADD COLUMN IF NOT EXISTS file_understanding_computed_at TIMESTAMP;`);
        await client.query(`ALTER TABLE atlas_packets ADD COLUMN IF NOT EXISTS file_understanding_method TEXT;`);
      }
    }

    // Load packets
    console.log('\n📥 Loading packets...');
    let query = 'SELECT packet_key, source_ref, summary FROM atlas_packets WHERE source_ref IS NOT NULL';
    if (LIMIT) {
      query += ` LIMIT ${LIMIT}`;
    }

    const result = await client.query(query);
    const packets = result.rows;

    console.log(`✅ Loaded ${packets.length} packets`);

    // Compute labels
    console.log('\n🧠 Computing heuristic labels...');
    const labeledPackets = packets.map(packet => {
      const labels = computeHeuristicLabels(packet);
      return {
        packet_key: packet.packet_key,
        ...labels,
      };
    });

    // Statistics
    const purposeDist = {};
    const thoroughnessDist = {};
    const criticalityDist = {};
    let totalConfidence = 0;
    let zeroCoverageCount = 0;

    for (const pkg of labeledPackets) {
      purposeDist[pkg.file_purpose] = (purposeDist[pkg.file_purpose] || 0) + 1;
      thoroughnessDist[pkg.thoroughness] = (thoroughnessDist[pkg.thoroughness] || 0) + 1;
      criticalityDist[pkg.app_criticality] = (criticalityDist[pkg.app_criticality] || 0) + 1;
      totalConfidence += pkg.confidence;
      if (pkg.test_coverage_pct === 0) zeroCoverageCount++;
    }

    const avgConfidence = (totalConfidence / labeledPackets.length).toFixed(3);

    console.log('\n📊 Label Distribution:');
    console.log('  Purpose:', purposeDist);
    console.log('  Thoroughness:', thoroughnessDist);
    console.log('  Criticality:', criticalityDist);
    console.log(`  Avg Confidence: ${avgConfidence}`);
    console.log(`  Zero Test Coverage: ${zeroCoverageCount} (${((zeroCoverageCount / labeledPackets.length) * 100).toFixed(1)}%)`);

    if (DRY_RUN) {
      console.log('\n✨ DRY-RUN: No database changes made');
      const elapsedTime = ((Date.now() - startTime) / 1000).toFixed(2);
      console.log(`⏱️  Completed in ${elapsedTime}s`);
      process.exit(0);
    }

    // Write labels to database
    console.log('\n💾 Writing labels to database...');
    const updateQuery = `
      UPDATE atlas_packets
      SET
        file_purpose = $2::file_purpose_enum,
        thoroughness = $3::thoroughness_enum,
        app_criticality = $4::app_criticality_enum,
        test_coverage_pct = $5,
        file_understanding_computed_at = NOW(),
        file_understanding_method = $6,
        updated_at = NOW()
      WHERE packet_key = $1;
    `;

    let updateCount = 0;
    for (const pkg of labeledPackets) {
      await client.query(updateQuery, [
        pkg.packet_key,
        pkg.file_purpose,
        pkg.thoroughness,
        pkg.app_criticality,
        pkg.test_coverage_pct,
        pkg.method,
      ]);
      updateCount++;
      if (updateCount % 1000 === 0) {
        console.log(`  Updated ${updateCount}/${labeledPackets.length}...`);
      }
    }

    console.log(`✅ Updated ${updateCount} packets`);

    // Generate report
    const reportPath = path.join(WORKSPACE_ROOT, 'docs', 'reports', `phase1-file-understanding-${new Date().toISOString().split('T')[0]}.json`);
    const report = {
      timestamp: new Date().toISOString(),
      mode: 'heuristic',
      total_packets: labeledPackets.length,
      distribution: {
        purpose: purposeDist,
        thoroughness: thoroughnessDist,
        criticality: criticalityDist,
      },
      metrics: {
        avg_confidence: parseFloat(avgConfidence),
        zero_test_coverage: zeroCoverageCount,
        coverage_percentage: ((1 - zeroCoverageCount / labeledPackets.length) * 100).toFixed(1),
      },
    };

    await fs.mkdir(path.dirname(reportPath), { recursive: true });
    await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
    console.log(`\n📄 Report saved to ${reportPath}`);

    const elapsedTime = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`\n✨ Completed in ${elapsedTime}s`);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(err => {
  console.error('❌ Error:', err);
  process.exit(1);
});
