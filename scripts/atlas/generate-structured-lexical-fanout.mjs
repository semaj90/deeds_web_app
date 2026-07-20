#!/usr/bin/env node

/**
 * Generate Structured-Lexical-Fanout Report
 *
 * Aggregates Phase 1 file understanding labels (file_purpose, thoroughness, app_criticality)
 * with optional lexical/semantic enrichment into a canonical fanout report.
 *
 * Input: atlas_packets with file understanding labels
 * Output: docs/reports/structured-lexical-fanout.json (804+ files)
 *
 * Usage:
 *   node scripts/atlas/generate-structured-lexical-fanout.mjs [--dry-run] [--with-lexical]
 *
 * The fanout report is consumed by:
 *   - scripts/atlas/derive-openspec-ids.mjs
 *   - scripts/atlas/derive-gsd-ids.mjs
 */

import pg from 'pg';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WORKSPACE_ROOT = path.resolve(__dirname, '../..');

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const WITH_LEXICAL = args.includes('--with-lexical');
const LIMIT = args.find(a => a.startsWith('--limit='))?.split('=')[1] ?
  parseInt(args.find(a => a.startsWith('--limit='))?.split('=')[1]) :
  null;

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://legal_admin@localhost/legal_ai_db',
});

async function main() {
  const startTime = Date.now();

  console.log(`\n🔍 Generating Structured-Lexical-Fanout Report`);
  console.log(`📋 Mode: ${DRY_RUN ? 'DRY-RUN' : 'APPLY'}`);
  console.log(`📚 Include lexical: ${WITH_LEXICAL ? 'YES' : 'NO'}`);

  const client = await pool.connect();

  try {
    // ════════════════════════════════════════════════════════════════════════
    // Step 1: Load packets with file understanding labels
    // ════════════════════════════════════════════════════════════════════════

    console.log(`\n📥 Step 1: Loading packets with file understanding labels...`);

    let query = `
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
        embedding_model,
        created_at,
        updated_at
      FROM atlas_packets
      WHERE
        packet_key IS NOT NULL
        AND source_ref IS NOT NULL
        AND (file_purpose IS NOT NULL OR thoroughness IS NOT NULL OR app_criticality IS NOT NULL)
      ORDER BY packet_key ASC
    `;

    if (LIMIT) {
      query += ` LIMIT ${LIMIT}`;
    }

    const result = await client.query(query);
    const packets = result.rows;

    console.log(`✅ Loaded ${packets.length} packets with file understanding`);

    if (packets.length === 0) {
      console.warn(`⚠️  No packets found. Run Phase 1 first: npm run phase1:file-understanding`);
      return;
    }

    // ════════════════════════════════════════════════════════════════════════
    // Step 2: Aggregate into fanout structure
    // ════════════════════════════════════════════════════════════════════════

    console.log(`\n📊 Step 2: Aggregating fanout structure...`);

    const files = [];
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

    // Track distributions
    const domainClasses = new Set();
    let titleIdCount = 0;
    let treeNodeIdCount = 0;
    let summaryCount = 0;

    for (const packet of packets) {
      const file = {
        packet_key: packet.packet_key,
        source_ref: packet.source_ref,
        file_path: packet.file_path,
        title_id: packet.title_id,
        tree_node_ids: packet.tree_node_ids,
        domain_class: packet.domain_class || 'unknown',
        file_purpose: packet.file_purpose || 'other',
        thoroughness: packet.thoroughness || 'stub',
        app_criticality: packet.app_criticality || 'optional',
        test_coverage_pct: packet.test_coverage_pct || 0,
        summary: packet.summary || null,
        embedding_model: packet.embedding_model || null,
      };

      // Track coverage
      if (packet.title_id) titleIdCount++;
      if (packet.tree_node_ids) treeNodeIdCount++;
      if (packet.summary) summaryCount++;

      // Track domain class
      if (packet.domain_class) {
        domainClasses.add(packet.domain_class);
        statistics.domain_class_distribution[packet.domain_class] =
          (statistics.domain_class_distribution[packet.domain_class] || 0) + 1;
      }

      // Track file purpose
      statistics.file_purpose_distribution[file.file_purpose] =
        (statistics.file_purpose_distribution[file.file_purpose] || 0) + 1;

      // Track thoroughness
      statistics.thoroughness_distribution[file.thoroughness] =
        (statistics.thoroughness_distribution[file.thoroughness] || 0) + 1;

      // Track app criticality
      statistics.app_criticality_distribution[file.app_criticality] =
        (statistics.app_criticality_distribution[file.app_criticality] || 0) + 1;

      files.push(file);
    }

    statistics.title_id_coverage = ((titleIdCount / packets.length) * 100).toFixed(1);
    statistics.tree_node_id_coverage = ((treeNodeIdCount / packets.length) * 100).toFixed(1);
    statistics.summary_coverage = ((summaryCount / packets.length) * 100).toFixed(1);

    console.log(`  Domain classes: ${domainClasses.size}`);
    console.log(`  File purpose categories: ${Object.keys(statistics.file_purpose_distribution).length}`);
    console.log(`  Title ID coverage: ${statistics.title_id_coverage}%`);
    console.log(`  Tree node ID coverage: ${statistics.tree_node_id_coverage}%`);
    console.log(`  Summary coverage: ${statistics.summary_coverage}%`);

    // ════════════════════════════════════════════════════════════════════════
    // Step 3: Build final fanout report
    // ════════════════════════════════════════════════════════════════════════

    console.log(`\n📋 Step 3: Building final fanout report...`);

    const fanoutReport = {
      generated_at: new Date().toISOString(),
      version: '1.0',
      source: 'structured-lexical-fanout',
      metadata: {
        total_files: files.length,
        domain_classes: Array.from(domainClasses),
        includes_lexical: WITH_LEXICAL,
        schema_version: 1,
      },
      statistics,
      files,
    };

    // ════════════════════════════════════════════════════════════════════════
    // Step 4: Write report
    // ════════════════════════════════════════════════════════════════════════

    const reportPath = path.join(WORKSPACE_ROOT, 'docs/reports/structured-lexical-fanout.json');

    if (DRY_RUN) {
      console.log(`\n✨ DRY-RUN: Would write report to ${reportPath}`);
      console.log(`  Files: ${files.length}`);
      console.log(`  Size: ${JSON.stringify(fanoutReport).length} bytes`);
    } else {
      console.log(`\n💾 Writing fanout report to ${reportPath}...`);
      await fs.mkdir(path.dirname(reportPath), { recursive: true });
      await fs.writeFile(reportPath, JSON.stringify(fanoutReport, null, 2));
      console.log(`✅ Report written successfully`);
    }

    // ════════════════════════════════════════════════════════════════════════
    // Step 5: Summary
    // ════════════════════════════════════════════════════════════════════════

    const elapsedTime = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`\n${'═'.repeat(60)}`);
    console.log(`✨ Fanout Report Generation Complete`);
    console.log(`${'═'.repeat(60)}`);
    console.log(`📊 Statistics:`);
    console.log(`  Total packets processed: ${files.length}`);
    console.log(`  Domain classes: ${domainClasses.size}`);
    console.log(`  File purposes: ${Object.keys(statistics.file_purpose_distribution).length}`);
    console.log(`  Coverage:`);
    console.log(`    - Title IDs: ${statistics.title_id_coverage}%`);
    console.log(`    - Tree node IDs: ${statistics.tree_node_id_coverage}%`);
    console.log(`    - Summaries: ${statistics.summary_coverage}%`);
    console.log(`⏱️  Elapsed time: ${elapsedTime}s`);
    console.log(`\n✅ Next step: npm run atlas:derive:openspec-ids`);

  } catch (err) {
    console.error(`\n❌ Error: ${err.message}`);
    console.error(err.stack);
    process.exit(1);
  } finally {
    await client.release();
    await pool.end();
  }
}

main();
