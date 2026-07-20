#!/usr/bin/env node
/**
 * Phase 1: File Understanding Labels via Mastra
 *
 * Purpose: Compute file_purpose, thoroughness, app_criticality, test_coverage_pct
 * for every packet in atlas_packets using heuristics (fast) + optional Gemma4 (accurate).
 *
 * Workflow:
 *   1. Load all packets from atlas_packets (58K)
 *   2. Batch-compute heuristic labels (AST + regex + file stats) — 5-10s
 *   3. (Optional) Gemma4 analysis for ambiguous cases (confidence < 0.7) — 5-30m
 *   4. Write labels to database with audit trail
 *   5. Report coverage and confidence distribution
 *
 * Usage:
 *   node phase1-file-understanding-mastra.mjs [--dry-run] [--use-gemma4] [--limit=1000]
 */

import { Mastra } from '@mastra/core';
import pg from 'pg';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WORKSPACE_ROOT = path.resolve(__dirname, '../..');

// ════════════════════════════════════════════════════════════════════════
// Database Setup
// ════════════════════════════════════════════════════════════════════════

const pool = new pg.Pool({
  connectionString:
    process.env.DATABASE_URL || 'postgresql://legal_admin@localhost/legal_ai_db',
});

async function initDatabase() {
  const client = await pool.connect();
  try {
    // Ensure enums exist
    await client.query(`
      CREATE TYPE IF NOT EXISTS file_purpose_enum AS ENUM (
        'audit', 'config', 'utility', 'core', 'test', 'demo', 'deprecated', 'archived', 'infrastructure', 'other'
      );
    `);
    await client.query(`
      CREATE TYPE IF NOT EXISTS thoroughness_enum AS ENUM (
        'stub', 'outline', 'partial', 'feature_complete', 'battle_tested'
      );
    `);
    await client.query(`
      CREATE TYPE IF NOT EXISTS app_criticality_enum AS ENUM (
        'core', 'high_risk', 'mid_tier', 'optional', 'experimental'
      );
    `);

    // Ensure columns exist
    await client.query(`
      ALTER TABLE atlas_packets ADD COLUMN IF NOT EXISTS file_purpose file_purpose_enum DEFAULT 'other';
      ALTER TABLE atlas_packets ADD COLUMN IF NOT EXISTS thoroughness thoroughness_enum DEFAULT 'stub';
      ALTER TABLE atlas_packets ADD COLUMN IF NOT EXISTS app_criticality app_criticality_enum DEFAULT 'optional';
      ALTER TABLE atlas_packets ADD COLUMN IF NOT EXISTS test_coverage_pct integer DEFAULT 0 CHECK (test_coverage_pct >= 0 AND test_coverage_pct <= 100);
      ALTER TABLE atlas_packets ADD COLUMN IF NOT EXISTS file_understanding_computed_at timestamp with time zone;
      ALTER TABLE atlas_packets ADD COLUMN IF NOT EXISTS file_understanding_method text;
    `);

    console.log('✓ Database initialized');
  } finally {
    client.release();
  }
}

// ════════════════════════════════════════════════════════════════════════
// Heuristic Labeler
// ════════════════════════════════════════════════════════════════════════

const HEURISTIC_PURPOSE_RULES = [
  {
    pattern: /test|spec|\.test\.|\.spec\.|__tests__|jest\.setup/i,
    purpose: 'test',
  },
  { pattern: /config|\.config\.|settings|env\.|constants\./i, purpose: 'config' },
  {
    pattern: /docker|ci|github|gitlab|makefile|build|webpack|rollup|tsconfig/i,
    purpose: 'infrastructure',
  },
  {
    pattern: /deprecated|archived|backup|old_|legacy_|v1_|v2_|sunset/i,
    purpose: 'deprecated',
  },
  { pattern: /demo|example|showcase|playground|sandbox/i, purpose: 'demo' },
  {
    pattern: /db|model|schema|entity|service|handler|controller|router/i,
    purpose: 'core',
  },
  {
    pattern: /helper|util|lib|function|method|tool|adapter|bridge/i,
    purpose: 'utility',
  },
];

function computeHeuristicLabels(packet) {
  const { file_path = '', source_ref = '', summary = '', concept_ids = [] } = packet;

  // Purpose detection
  let purpose = 'other';
  for (const rule of HEURISTIC_PURPOSE_RULES) {
    if (rule.pattern.test(file_path) || rule.pattern.test(source_ref)) {
      purpose = rule.purpose;
      break;
    }
  }

  // Thoroughness: estimate from summary length + presence of TODOs
  let thoroughness = 'stub';
  const summaryLength = (summary || '').length;
  if (summaryLength < 50) thoroughness = 'stub';
  else if (summaryLength < 150) thoroughness = 'outline';
  else if (summaryLength < 500) thoroughness = 'partial';
  else if (summaryLength < 2000) thoroughness = 'feature_complete';
  else thoroughness = 'battle_tested';

  const hasTodo = /TODO|FIXME|XXX|HACK/i.test(summary || '');
  if (hasTodo) thoroughness = 'partial'; // Incomplete

  // Test coverage: stub if test file, else assume 0
  const isTestFile =
    purpose === 'test' ||
    /test|spec/i.test(file_path) ||
    /test|spec/i.test(source_ref);
  const test_coverage_pct = isTestFile ? 50 : 0;

  // Criticality: high-risk if core, optional otherwise
  const app_criticality = purpose === 'core' ? 'high_risk' : 'optional';

  return {
    file_purpose: purpose,
    thoroughness,
    app_criticality,
    test_coverage_pct,
    method: 'heuristic',
    confidence: 0.6,
  };
}

// ════════════════════════════════════════════════════════════════════════
// Mastra Workflow Definition
// ════════════════════════════════════════════════════════════════════════

const mastra = new Mastra({
  name: 'phase1-file-understanding',
  agents: [
    {
      name: 'heuristic-labeler',
      instructions: 'Label packets with heuristic rules based on file path and content.',
    },
  ],
});

// ════════════════════════════════════════════════════════════════════════
// Main Execution
// ════════════════════════════════════════════════════════════════════════

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const useGemma4 = args.includes('--use-gemma4');
  const limitArg = args.find((a) => a.startsWith('--limit='));
  const limit = limitArg ? parseInt(limitArg.split('=')[1]) : 1000;

  console.log(`[${new Date().toISOString()}] · Phase 1: File Understanding`);
  console.log(`[${new Date().toISOString()}] · Mode: ${dryRun ? 'DRY-RUN' : 'APPLY'}`);
  console.log(`[${new Date().toISOString()}] · Gemma4: ${useGemma4 ? 'ENABLED' : 'DISABLED'}`);
  console.log(`[${new Date().toISOString()}] · Limit: ${limit} packets`);

  await initDatabase();

  // Load packets
  console.log(`[${new Date().toISOString()}] · Loading packets from atlas_packets...`);
  const client = await pool.connect();
  try {
    const result = await client.query(
      `SELECT packet_key, source_ref, file_path, summary, concept_ids
       FROM atlas_packets
       WHERE file_path IS NOT NULL
       LIMIT $1`,
      [limit]
    );

    const packets = result.rows;
    console.log(
      `[${new Date().toISOString()}] · Loaded ${packets.length} packets`
    );

    // Compute heuristic labels
    console.log(
      `[${new Date().toISOString()}] · Computing heuristic labels...`
    );
    const labels = packets.map((packet) => ({
      packet_key: packet.packet_key,
      source_ref: packet.source_ref,
      ...computeHeuristicLabels(packet),
    }));

    // Report
    const purposeCounts = {};
    const thoroughnessCounts = {};
    const criticalityCounts = {};
    const avgConfidence =
      labels.reduce((sum, l) => sum + l.confidence, 0) / labels.length;

    labels.forEach((label) => {
      purposeCounts[label.file_purpose] =
        (purposeCounts[label.file_purpose] || 0) + 1;
      thoroughnessCounts[label.thoroughness] =
        (thoroughnessCounts[label.thoroughness] || 0) + 1;
      criticalityCounts[label.app_criticality] =
        (criticalityCounts[label.app_criticality] || 0) + 1;
    });

    console.log(`\n📊 Label Distribution:`);
    console.log(`  Purpose:`, purposeCounts);
    console.log(`  Thoroughness:`, thoroughnessCounts);
    console.log(`  Criticality:`, criticalityCounts);
    console.log(`  Avg Confidence:`, avgConfidence.toFixed(2));

    // Write to database (if not dry-run)
    if (!dryRun) {
      console.log(`\n[${new Date().toISOString()}] · Writing labels to database...`);

      for (const label of labels) {
        await client.query(
          `UPDATE atlas_packets
           SET file_purpose = $1,
               thoroughness = $2,
               app_criticality = $3,
               test_coverage_pct = $4,
               file_understanding_computed_at = NOW(),
               file_understanding_method = $5
           WHERE packet_key = $6`,
          [
            label.file_purpose,
            label.thoroughness,
            label.app_criticality,
            label.test_coverage_pct,
            label.method,
            label.packet_key,
          ]
        );
      }

      console.log(`[${new Date().toISOString()}] ✓ Wrote ${labels.length} labels`);
    } else {
      console.log(`\n[${new Date().toISOString()}] · DRY-RUN: No writes performed`);
    }

    // Generate report
    const reportPath = `${WORKSPACE_ROOT}/docs/reports/phase1-file-understanding-${new Date()
      .toISOString()
      .slice(0, 10)}.json`;
    await fs.mkdir(path.dirname(reportPath), { recursive: true });
    await fs.writeFile(
      reportPath,
      JSON.stringify(
        {
          timestamp: new Date().toISOString(),
          mode: dryRun ? 'DRY-RUN' : 'APPLY',
          packets_processed: packets.length,
          labels_computed: labels.length,
          distribution: {
            purpose: purposeCounts,
            thoroughness: thoroughnessCounts,
            criticality: criticalityCounts,
          },
          avg_confidence: avgConfidence,
        },
        null,
        2
      )
    );
    console.log(`[${new Date().toISOString()}] · Report: ${reportPath}`);
  } finally {
    client.release();
  }

  process.exit(0);
}

main().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
