#!/usr/bin/env node

/**
 * Generate Structured-Lexical-Fanout Report (Docker Postgres)
 *
 * Queries Postgres via docker exec to build the fanout JSON report.
 * This bypasses connection string issues by using docker directly.
 */

import { execSync } from 'child_process';
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

async function queryPostgres(sql) {
  try {
    const cmd = `docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c "${sql.replace(/"/g, '\\"')}" --json`;
    const output = execSync(cmd, { encoding: 'utf-8' });
    return JSON.parse(output);
  } catch (err) {
    console.error(`Query failed: ${err.message}`);
    throw err;
  }
}

async function main() {
  const startTime = Date.now();

  console.log(`\n🔍 Generating Structured-Lexical-Fanout Report`);
  console.log(`📋 Mode: ${DRY_RUN ? 'DRY-RUN' : 'APPLY'}`);
  console.log(`📦 Database: Postgres (via docker)`);

  try {
    // ════════════════════════════════════════════════════════════════════════
    // Step 1: Query packets with file understanding labels
    // ════════════════════════════════════════════════════════════════════════

    console.log(`\n📥 Step 1: Loading packets...`);

    let sql = `
      SELECT
        packet_key,
        source_ref,
        file_path,
        title_id,
        tree_node_ids,
        domain_class,
        file_purpose,
        thoroughness,
        app_criticality,
        test_coverage_pct,
        summary,
        embedding_model
      FROM atlas_packets
      WHERE
        packet_key IS NOT NULL
        AND source_ref IS NOT NULL
    `;

    if (LIMIT) {
      sql += ` LIMIT ${LIMIT}`;
    } else {
      sql += ` LIMIT 58365`;
    }

    // Use simpler command that returns CSV
    const csvCmd = `docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c "\\COPY (${sql}) TO STDOUT WITH CSV HEADER"`;
    let csvOutput;
    try {
      csvOutput = execSync(csvCmd, { encoding: 'utf-8' });
    } catch (err) {
      console.error(`CSV export failed, trying JSON format...`);
      // Fallback: query a smaller batch
      sql += ' OFFSET 0';
      const jsonCmd = `docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c "SELECT COUNT(*) FROM atlas_packets" --tuples-only`;
      const countOutput = execSync(jsonCmd, { encoding: 'utf-8' });
      const packetCount = parseInt(countOutput.trim());
      console.log(`✅ Loaded count: ${packetCount} packets`);

      // Build fanout with direct SQL query results
      const dataCmd = `docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -t -A -F '|' -c "SELECT packet_key, source_ref, file_path, title_id, domain_class, file_purpose, thoroughness, app_criticality FROM atlas_packets WHERE packet_key IS NOT NULL LIMIT 100"`;
      csvOutput = execSync(dataCmd, { encoding: 'utf-8' });
    }

    // Parse CSV output
    const lines = csvOutput.trim().split('\n');
    const headers = lines[0]?.split(',') || [];
    const packets = [];

    for (let i = 1; i < Math.min(lines.length, LIMIT ? LIMIT + 1 : lines.length); i++) {
      const values = lines[i].split(',');
      const packet = {};
      headers.forEach((header, idx) => {
        const clean = header.trim().replace(/^"(.*)"$/, '$1');
        packet[clean] = values[idx]?.trim().replace(/^"(.*)"$/, '$1') || null;
      });
      packets.push(packet);
    }

    console.log(`✅ Loaded ${packets.length} packets`);

    if (packets.length === 0) {
      console.warn(`⚠️  No packets found. Querying total count...`);
      const countCmd = `docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -t -c "SELECT COUNT(*) FROM atlas_packets"`;
      const totalCount = execSync(countCmd, { encoding: 'utf-8' }).trim();
      console.log(`Total packets in DB: ${totalCount}`);
      return;
    }

    // ════════════════════════════════════════════════════════════════════════
    // Step 2: Build statistics
    // ════════════════════════════════════════════════════════════════════════

    console.log(`\n📊 Step 2: Building statistics...`);

    const statistics = {
      total_packets: packets.length,
      domain_class_distribution: {},
      file_purpose_distribution: {},
      thoroughness_distribution: {},
      app_criticality_distribution: {},
      title_id_coverage: 0,
      tree_node_id_coverage: 0,
      summary_coverage: 0,
    };

    let titleIdCount = 0;
    let treeNodeIdCount = 0;
    let summaryCount = 0;

    for (const packet of packets) {
      // Count distributions
      if (packet.domain_class) {
        statistics.domain_class_distribution[packet.domain_class] =
          (statistics.domain_class_distribution[packet.domain_class] || 0) + 1;
      }

      if (packet.file_purpose) {
        statistics.file_purpose_distribution[packet.file_purpose] =
          (statistics.file_purpose_distribution[packet.file_purpose] || 0) + 1;
      }

      if (packet.thoroughness) {
        statistics.thoroughness_distribution[packet.thoroughness] =
          (statistics.thoroughness_distribution[packet.thoroughness] || 0) + 1;
      }

      if (packet.app_criticality) {
        statistics.app_criticality_distribution[packet.app_criticality] =
          (statistics.app_criticality_distribution[packet.app_criticality] || 0) + 1;
      }

      if (packet.title_id) titleIdCount++;
      if (packet.tree_node_ids) treeNodeIdCount++;
      if (packet.summary) summaryCount++;
    }

    statistics.title_id_coverage = ((titleIdCount / packets.length) * 100).toFixed(1);
    statistics.tree_node_id_coverage = ((treeNodeIdCount / packets.length) * 100).toFixed(1);
    statistics.summary_coverage = ((summaryCount / packets.length) * 100).toFixed(1);

    console.log(`  Domain classes: ${Object.keys(statistics.domain_class_distribution).length}`);
    console.log(`  File purposes: ${Object.keys(statistics.file_purpose_distribution).length}`);
    console.log(`  Title ID coverage: ${statistics.title_id_coverage}%`);
    console.log(`  Tree node ID coverage: ${statistics.tree_node_id_coverage}%`);
    console.log(`  Summary coverage: ${statistics.summary_coverage}%`);

    // ════════════════════════════════════════════════════════════════════════
    // Step 3: Build fanout report
    // ════════════════════════════════════════════════════════════════════════

    const fanoutReport = {
      generated_at: new Date().toISOString(),
      version: '1.0',
      source: 'structured-lexical-fanout',
      metadata: {
        total_files: packets.length,
        includes_lexical: false,
        schema_version: 1,
      },
      statistics,
      files: packets,
    };

    // ════════════════════════════════════════════════════════════════════════
    // Step 4: Write report
    // ════════════════════════════════════════════════════════════════════════

    const reportPath = path.join(WORKSPACE_ROOT, 'docs/reports/structured-lexical-fanout.json');

    if (DRY_RUN) {
      console.log(`\n✨ DRY-RUN: Would write to ${reportPath}`);
      console.log(`  Files: ${packets.length}`);
      console.log(`  Size: ${JSON.stringify(fanoutReport).length} bytes`);
    } else {
      console.log(`\n💾 Writing fanout report...`);
      await fs.mkdir(path.dirname(reportPath), { recursive: true });
      await fs.writeFile(reportPath, JSON.stringify(fanoutReport, null, 2));
      console.log(`✅ Report written to ${reportPath}`);
    }

    // ════════════════════════════════════════════════════════════════════════
    // Step 5: Summary
    // ════════════════════════════════════════════════════════════════════════

    const elapsedTime = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`\n${'═'.repeat(60)}`);
    console.log(`✨ Fanout Report Complete`);
    console.log(`${'═'.repeat(60)}`);
    console.log(`📊 Packets: ${packets.length}`);
    console.log(`📝 Domain classes: ${Object.keys(statistics.domain_class_distribution).length}`);
    console.log(`⏱️  Time: ${elapsedTime}s`);
    console.log(`\n✅ Next: npm run atlas:derive:openspec-ids`);

  } catch (err) {
    console.error(`\n❌ Error: ${err.message}`);
    process.exit(1);
  }
}

main();
