#!/usr/bin/env node
/**
 * atlas-parent-indexing.mjs
 *
 * Map-reduce style joins for parent-atlas canonical tables.
 * Ingest atlas cards + outcomes into parent lookup tables (in-memory join).
 * Export to CSV for Bitfrost cache warmup and offline analysis.
 *
 * Usage:
 *   node scripts/atlas-parent-indexing.mjs --dry-run
 *   node scripts/atlas-parent-indexing.mjs --apply
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dir, '..');

const argv = process.argv.slice(2);
const DRY_RUN = argv.includes('--dry-run');
const APPLY = argv.includes('--apply');
const VERBOSE = argv.includes('--verbose');

const CARDS_DIR = path.join(ROOT, '.opencode', 'cards');
const EXPORT_DIR = path.join(ROOT, 'memory', 'exports', 'parent-atlas');
const REPORT_PATH = path.join(ROOT, 'memory', 'exports', 'parent-atlas-report.json');

// ─── CSV Helper ──────────────────────────────────────────────────────────

function toCsvRow(obj) {
  return Object.values(obj)
    .map(v => {
      if (v === null || v === undefined) return '';
      if (typeof v === 'string') return `"${v.replace(/"/g, '""')}"`;
      return String(v);
    })
    .join(',');
}

// ─── Main ────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n── Atlas Parent Indexing (Map-Reduce Join) ──────────');

  // Step 1: Load all cards
  console.log('  Step 1: Load all cards from .opencode/cards/...');
  const cards = [];
  const cardMap = {};

  if (fs.existsSync(CARDS_DIR)) {
    const files = fs.readdirSync(CARDS_DIR);
    for (const file of files) {
      if (!file.endsWith('.json')) continue;

      try {
        const content = fs.readFileSync(path.join(CARDS_DIR, file), 'utf8');
        const card = JSON.parse(content);

        cards.push(card);
        cardMap[card.id] = card;
      } catch (e) {
        if (VERBOSE) console.log(`  [skip] ${file}`);
      }
    }
  }

  console.log(`  ✅ Loaded ${cards.length} cards`);

  // Step 2: Load outcomes
  console.log('  Step 2: Load outcomes from outcome ledger...');
  const outcomes = [];
  const outcomeFile = path.join(ROOT, '.opencode', 'outcome-ledger-with-cardIds.ndjson');

  if (fs.existsSync(outcomeFile)) {
    const content = fs.readFileSync(outcomeFile, 'utf8');
    const lines = content.trim().split('\n');

    for (const line of lines) {
      try {
        const obj = JSON.parse(line);
        outcomes.push(obj);
      } catch (e) {
        if (VERBOSE) console.log(`  [skip line]`);
      }
    }
  }

  console.log(`  ✅ Loaded ${outcomes.length} outcomes`);

  // Step 3: Build parent atlas index (map-reduce join)
  console.log('  Step 3: Join cards + outcomes → parent atlas index...');

  const parentAtlas = [];
  const clusterSummary = {};

  for (const card of cards) {
    const cardOutcomes = outcomes.filter((o) => o.cardIds?.includes(card.id));

    const entry = {
      id: card.id,
      sourceRef: card.sourceRef || '',
      kind: card.kind || 'unknown',
      som_bmu_row: card.som_bmu_row || '',
      som_bmu_col: card.som_bmu_col || '',
      som_bmu_distance: card.som_bmu_distance || '',
      reward_count: card.reward?.count || 0,
      reward_avg: card.reward?.avg || '',
      reward_total: card.reward?.total || '',
      outcome_count: cardOutcomes.length,
      outcome_reward_sum: cardOutcomes.reduce((sum, o) => sum + (o.reward || 0), 0),
      vector64: card.vector64 ? 'yes' : 'no',
    };

    parentAtlas.push(entry);

    // Aggregate by SOM cluster
    if (card.som_bmu_row !== undefined && card.som_bmu_col !== undefined) {
      const clusterKey = `${card.som_bmu_row},${card.som_bmu_col}`;
      if (!clusterSummary[clusterKey]) {
        clusterSummary[clusterKey] = {
          som_bmu_row: card.som_bmu_row,
          som_bmu_col: card.som_bmu_col,
          card_count: 0,
          avg_reward: 0,
          total_reward: 0,
          cards_with_rewards: 0,
        };
      }
      clusterSummary[clusterKey].card_count++;
      clusterSummary[clusterKey].total_reward += card.reward?.total || 0;
      if (card.reward?.avg) {
        clusterSummary[clusterKey].cards_with_rewards++;
        clusterSummary[clusterKey].avg_reward =
          clusterSummary[clusterKey].total_reward / clusterSummary[clusterKey].cards_with_rewards;
      }
    }
  }

  console.log(`  ✅ Built parent atlas index (${parentAtlas.length} entries)`);
  console.log(`  ✅ Computed cluster summary (${Object.keys(clusterSummary).length} clusters)`);

  // Step 4: Export to CSV
  console.log('  Step 4: Export canonical tables to CSV...');

  if (!DRY_RUN) {
    fs.mkdirSync(EXPORT_DIR, { recursive: true });

    // Parent atlas index CSV
    const parentAtlasHeaders = Object.keys(parentAtlas[0]).join(',');
    const parentAtlasCsv =
      parentAtlasHeaders +
      '\n' +
      parentAtlas.map((entry) => toCsvRow(entry)).join('\n');

    fs.writeFileSync(path.join(EXPORT_DIR, 'parent_atlas_index.csv'), parentAtlasCsv, 'utf8');
    console.log(`  ✅ Exported parent atlas index → ${EXPORT_DIR}/parent_atlas_index.csv`);

    // Cluster summary CSV
    const clusterEntries = Object.values(clusterSummary);
    const clusterHeaders = Object.keys(clusterEntries[0]).join(',');
    const clusterCsv =
      clusterHeaders +
      '\n' +
      clusterEntries.map((entry) => toCsvRow(entry)).join('\n');

    fs.writeFileSync(path.join(EXPORT_DIR, 'cluster_summary.csv'), clusterCsv, 'utf8');
    console.log(`  ✅ Exported cluster summary → ${EXPORT_DIR}/cluster_summary.csv`);

    // Parent atlas index JSON (for Redis cache)
    const parentAtlasJson = {
      timestamp: new Date().toISOString(),
      entries: parentAtlas,
    };
    fs.writeFileSync(
      path.join(EXPORT_DIR, 'parent_atlas_index.json'),
      JSON.stringify(parentAtlasJson, null, 2),
      'utf8'
    );
    console.log(`  ✅ Exported parent atlas JSON → ${EXPORT_DIR}/parent_atlas_index.json`);
  }

  // Generate report
  const report = {
    timestamp: new Date().toISOString(),
    mode: DRY_RUN ? 'dry-run' : 'apply',
    phase: 'Atlas Parent Indexing',
    data: {
      cards_loaded: cards.length,
      outcomes_loaded: outcomes.length,
      parent_atlas_entries: parentAtlas.length,
      cluster_summaries: Object.keys(clusterSummary).length,
    },
    status: 'Parent atlas indexing complete, canonical tables ready for Bitfrost cache',
    nextSteps: [
      '1. Load parent_atlas_index.csv into Redis cache for semantic reranking',
      '2. Use cluster_summary.csv for SOM topology-aware recommendations',
      '3. Archive parent_atlas_index.json to CouchDB for durability',
      '4. Proceed to Postgres 18 compatibility check',
    ],
  };

  console.log('\n── Summary ────────────────────────────────────────────────');
  console.log(`  Cards: ${cards.length}`);
  console.log(`  Outcomes: ${outcomes.length}`);
  console.log(`  Parent atlas entries: ${parentAtlas.length}`);
  console.log(`  SOM clusters: ${Object.keys(clusterSummary).length}`);
  console.log(`  Status: ${report.status}`);

  if (!DRY_RUN) {
    fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
    fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2), 'utf8');
    console.log(`  ✅ Wrote report → ${REPORT_PATH}`);
  }

  if (DRY_RUN) {
    console.log('\n[DRY-RUN] Parent indexing preview complete. Use --apply to export.');
  } else {
    console.log('\n✅ Parent atlas indexing complete!');
    console.log(`\nExports ready in: ${EXPORT_DIR}/`);
    console.log('  - parent_atlas_index.csv (for Bitfrost cache warmup)');
    console.log('  - parent_atlas_index.json (for Redis cache)');
    console.log('  - cluster_summary.csv (for SOM topology analysis)');
  }

  process.exit(0);
}

main().catch((err) => {
  console.error('\n❌ Error:', err.message);
  if (VERBOSE) console.error(err.stack);
  process.exit(1);
});
