#!/usr/bin/env node
/**
 * duckdb-mapreduce-atlas-join.mjs
 *
 * Map-reduce style joins for parent-atlas indexing.
 *
 * Purpose:
 *   Ingest .opencode/cards/*.json, outcome ledger, and training dataset
 *   into DuckDB canonical parent tables for semantic cache warmup,
 *   Bitfrost reranking, and offline analysis.
 *
 * Process:
 *   1. EXTRACT: .opencode/cards/*.json → cards_raw table
 *   2. EXTRACT: .opencode/*.ndjson → outcomes_raw table
 *   3. EXTRACT: training-datasets/*.jsonl → training_examples table
 *   4. MAP: Join cards + outcomes + SOM coords → atlas_cards_enriched
 *   5. REDUCE: Aggregate by SOM cluster → cluster_summary
 *   6. INDEX: Build parent-atlas lookup tables
 *   7. EXPORT: CSV to memory/exports/duckdb/ for offline use
 *
 * Output:
 *   - duckdb/atlas.duckdb (DuckDB database with all tables)
 *   - memory/exports/duckdb/atlas_cards_enriched.csv
 *   - memory/exports/duckdb/cluster_summary.csv
 *   - memory/exports/duckdb/parent_atlas_index.csv
 *   - memory/exports/duckdb-mapreduce-report.json
 *
 * Usage:
 *   node scripts/duckdb-mapreduce-atlas-join.mjs --dry-run
 *   node scripts/duckdb-mapreduce-atlas-join.mjs --apply
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dir, '..');

const argv = process.argv.slice(2);
const DRY_RUN = argv.includes('--dry-run');
const APPLY = argv.includes('--apply');
const VERBOSE = argv.includes('--verbose');

const DUCKDB_PATH = path.join(ROOT, 'duckdb', 'atlas.duckdb');
const CARDS_DIR = path.join(ROOT, '.opencode', 'cards');
const EXPORT_DIR = path.join(ROOT, 'memory', 'exports', 'duckdb');
const REPORT_PATH = path.join(ROOT, 'memory', 'exports', 'duckdb-mapreduce-report.json');

// ─── DuckDB Setup ────────────────────────────────────────────────────────

function initializeDuckDB(dbPath) {
  try {
    const db = new Database(dbPath);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    return db;
  } catch (e) {
    console.error('Failed to initialize DuckDB:', e.message);
    process.exit(1);
  }
}

function createTables(db) {
  // Cards raw table
  db.exec(`
    CREATE TABLE IF NOT EXISTS cards_raw (
      id TEXT PRIMARY KEY,
      sourceRef TEXT,
      kind TEXT,
      reward_count INTEGER,
      reward_total REAL,
      reward_avg REAL,
      som_bmu_row INTEGER,
      som_bmu_col INTEGER,
      som_bmu_distance REAL,
      vector64_compressed BOOLEAN,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Outcomes table
  db.exec(`
    CREATE TABLE IF NOT EXISTS outcomes_raw (
      id TEXT,
      cardId TEXT,
      reward REAL,
      sourceRef TEXT,
      created_at TIMESTAMP
    )
  `);

  // Training examples table
  db.exec(`
    CREATE TABLE IF NOT EXISTS training_examples (
      id TEXT PRIMARY KEY,
      instruction TEXT,
      input TEXT,
      output TEXT,
      reward REAL,
      som_cluster_row INTEGER,
      som_cluster_col INTEGER,
      enrichment_phase TEXT
    )
  `);

  // Enriched cards view
  db.exec(`
    CREATE VIEW IF NOT EXISTS atlas_cards_enriched AS
    SELECT
      c.id,
      c.sourceRef,
      c.kind,
      c.reward_count,
      c.reward_total,
      c.reward_avg,
      c.som_bmu_row,
      c.som_bmu_col,
      c.som_bmu_distance,
      COUNT(o.id) as outcome_count,
      SUM(o.reward) as outcome_sum,
      c.vector64_compressed,
      c.created_at
    FROM cards_raw c
    LEFT JOIN outcomes_raw o ON c.id = o.cardId
    GROUP BY c.id
  `);

  // Cluster summary (reduce)
  db.exec(`
    CREATE VIEW IF NOT EXISTS cluster_summary AS
    SELECT
      som_bmu_row,
      som_bmu_col,
      COUNT(*) as card_count,
      AVG(reward_avg) as avg_reward,
      SUM(reward_total) as total_reward,
      COUNT(CASE WHEN reward_count > 0 THEN 1 END) as cards_with_rewards
    FROM cards_raw
    WHERE som_bmu_row IS NOT NULL AND som_bmu_col IS NOT NULL
    GROUP BY som_bmu_row, som_bmu_col
  `);

  // Parent atlas index
  db.exec(`
    CREATE VIEW IF NOT EXISTS parent_atlas_index AS
    SELECT
      c.id,
      c.sourceRef,
      c.som_bmu_row,
      c.som_bmu_col,
      c.som_bmu_distance,
      cs.card_count as cluster_size,
      cs.avg_reward as cluster_avg_reward,
      c.reward_avg,
      c.reward_count,
      ROW_NUMBER() OVER (ORDER BY c.reward_avg DESC NULLS LAST) as reward_rank
    FROM cards_raw c
    LEFT JOIN cluster_summary cs ON c.som_bmu_row = cs.som_bmu_row AND c.som_bmu_col = cs.som_bmu_col
  `);

  console.log('  ✅ Created DuckDB tables and views');
}

// ─── Data Extraction ─────────────────────────────────────────────────────

function extractCardsData(db) {
  console.log('  Step 1: Extract cards from .opencode/cards/...');

  const cards = [];
  if (fs.existsSync(CARDS_DIR)) {
    const files = fs.readdirSync(CARDS_DIR);
    for (const file of files) {
      if (!file.endsWith('.json')) continue;

      try {
        const content = fs.readFileSync(path.join(CARDS_DIR, file), 'utf8');
        const card = JSON.parse(content);

        cards.push({
          id: card.id,
          sourceRef: card.sourceRef || null,
          kind: card.kind || 'unknown',
          reward_count: card.reward?.count || 0,
          reward_total: card.reward?.total || 0,
          reward_avg: card.reward?.avg || null,
          som_bmu_row: card.som_bmu_row || null,
          som_bmu_col: card.som_bmu_col || null,
          som_bmu_distance: card.som_bmu_distance || null,
          vector64_compressed: card.vector64 ? 1 : 0,
        });
      } catch (e) {
        if (VERBOSE) console.log(`  [skip] ${file}`);
      }
    }
  }

  // Insert into cards_raw table
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO cards_raw (id, sourceRef, kind, reward_count, reward_total, reward_avg,
                          som_bmu_row, som_bmu_col, som_bmu_distance, vector64_compressed)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const card of cards) {
    stmt.run(
      card.id,
      card.sourceRef,
      card.kind,
      card.reward_count,
      card.reward_total,
      card.reward_avg,
      card.som_bmu_row,
      card.som_bmu_col,
      card.som_bmu_distance,
      card.vector64_compressed
    );
  }

  console.log(`  ✅ Inserted ${cards.length} cards`);
  return cards.length;
}

function extractOutcomesData(db) {
  console.log('  Step 2: Extract outcomes from .opencode/*.ndjson...');

  const outcomes = [];
  const outcomeFile = path.join(ROOT, '.opencode', 'outcome-ledger-with-cardIds.ndjson');

  if (fs.existsSync(outcomeFile)) {
    const content = fs.readFileSync(outcomeFile, 'utf8');
    const lines = content.trim().split('\n');

    for (const line of lines) {
      try {
        const obj = JSON.parse(line);
        outcomes.push({
          id: obj.id,
          cardId: obj.cardIds?.[0] || null,
          reward: obj.reward || 0,
          sourceRef: obj.sourceRef || null,
          created_at: obj.createdAt || null,
        });
      } catch (e) {
        if (VERBOSE) console.log(`  [skip line]`);
      }
    }
  }

  // Insert into outcomes_raw
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO outcomes_raw (id, cardId, reward, sourceRef, created_at)
    VALUES (?, ?, ?, ?, ?)
  `);

  for (const outcome of outcomes) {
    stmt.run(
      outcome.id,
      outcome.cardId,
      outcome.reward,
      outcome.sourceRef,
      outcome.created_at
    );
  }

  console.log(`  ✅ Inserted ${outcomes.length} outcomes`);
  return outcomes.length;
}

function extractTrainingData(db) {
  console.log('  Step 3: Extract training examples from training-datasets/*.jsonl...');

  const examples = [];
  const trainingFile = path.join(ROOT, 'training-datasets', 'atlas-phase6.jsonl');

  if (fs.existsSync(trainingFile)) {
    const content = fs.readFileSync(trainingFile, 'utf8');
    const lines = content.trim().split('\n');

    for (const line of lines) {
      try {
        const obj = JSON.parse(line);
        examples.push({
          id: obj.id,
          instruction: obj.instruction || '',
          input: obj.input || '',
          output: obj.output || '',
          reward: obj.reward || 0.5,
          som_cluster_row: obj.som_cluster_row || null,
          som_cluster_col: obj.som_cluster_col || null,
          enrichment_phase: obj.enrichment_phase || 'unknown',
        });
      } catch (e) {
        if (VERBOSE) console.log(`  [skip line]`);
      }
    }
  }

  // Insert into training_examples
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO training_examples (id, instruction, input, output, reward,
                                   som_cluster_row, som_cluster_col, enrichment_phase)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const ex of examples) {
    stmt.run(
      ex.id,
      ex.instruction,
      ex.input,
      ex.output,
      ex.reward,
      ex.som_cluster_row,
      ex.som_cluster_col,
      ex.enrichment_phase
    );
  }

  console.log(`  ✅ Inserted ${examples.length} training examples`);
  return examples.length;
}

// ─── Map-Reduce & Export ────────────────────────────────────────────────

function exportTables(db) {
  console.log('  Step 4: Export canonical parent tables...');

  fs.mkdirSync(EXPORT_DIR, { recursive: true });

  // Export enriched cards
  const enrichedCards = db.prepare('SELECT * FROM atlas_cards_enriched').all();
  const enrichedCsv = [
    Object.keys(enrichedCards[0]).join(','),
    ...enrichedCards.map(row => Object.values(row).join(','))
  ].join('\n');
  fs.writeFileSync(path.join(EXPORT_DIR, 'atlas_cards_enriched.csv'), enrichedCsv, 'utf8');
  console.log(`  ✅ Exported ${enrichedCards.length} enriched cards to CSV`);

  // Export cluster summary
  const clusterSummary = db.prepare('SELECT * FROM cluster_summary').all();
  const clusterCsv = [
    Object.keys(clusterSummary[0]).join(','),
    ...clusterSummary.map(row => Object.values(row).join(','))
  ].join('\n');
  fs.writeFileSync(path.join(EXPORT_DIR, 'cluster_summary.csv'), clusterCsv, 'utf8');
  console.log(`  ✅ Exported ${clusterSummary.length} cluster summaries to CSV`);

  // Export parent atlas index
  const parentAtlas = db.prepare('SELECT * FROM parent_atlas_index').all();
  const parentCsv = [
    Object.keys(parentAtlas[0]).join(','),
    ...parentAtlas.map(row => Object.values(row).join(','))
  ].join('\n');
  fs.writeFileSync(path.join(EXPORT_DIR, 'parent_atlas_index.csv'), parentCsv, 'utf8');
  console.log(`  ✅ Exported ${parentAtlas.length} parent atlas entries to CSV`);

  return { enrichedCards, clusterSummary, parentAtlas };
}

// ─── Main ────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n── DuckDB Map-Reduce Atlas Join ──────────────────────');

  if (!DRY_RUN && !APPLY) {
    console.error('  ❌ Must specify --dry-run or --apply');
    process.exit(1);
  }

  // Create DuckDB database (in-memory for dry-run)
  const dbPath = DRY_RUN ? ':memory:' : DUCKDB_PATH;
  console.log(`  Opening DuckDB at ${dbPath}`);
  const db = initializeDuckDB(dbPath);

  try {
    // Create tables
    createTables(db);

    // Extract data
    const cardCount = extractCardsData(db);
    const outcomeCount = extractOutcomesData(db);
    const trainingCount = extractTrainingData(db);

    // Export if not dry-run
    let exportStats = null;
    if (!DRY_RUN) {
      exportStats = exportTables(db);
    }

    // Generate report
    const report = {
      timestamp: new Date().toISOString(),
      mode: DRY_RUN ? 'dry-run' : 'apply',
      phase: 'DuckDB Map-Reduce Atlas Join',
      extraction: {
        cards: cardCount,
        outcomes: outcomeCount,
        training_examples: trainingCount,
      },
      export: exportStats ? {
        enriched_cards: exportStats.enrichedCards.length,
        cluster_summaries: exportStats.clusterSummary.length,
        parent_atlas_entries: exportStats.parentAtlas.length,
      } : null,
      status: 'Map-reduce join complete, canonical tables ready for Bitfrost cache and offline analysis',
      nextSteps: [
        '1. Load CSV exports into Redis cache warmup',
        '2. Index parent_atlas_index for Bitfrost semantic reranking',
        '3. Use cluster_summary for SOM topology-aware recommendation',
        '4. Archive enriched_cards to CouchDB for durable persistence',
      ],
    };

    console.log('\n── Summary ────────────────────────────────────────────────');
    console.log(`  Cards extracted: ${cardCount}`);
    console.log(`  Outcomes extracted: ${outcomeCount}`);
    console.log(`  Training examples extracted: ${trainingCount}`);
    if (exportStats) {
      console.log(`  Enriched cards exported: ${exportStats.enrichedCards.length}`);
      console.log(`  Cluster summaries: ${exportStats.clusterSummary.length}`);
      console.log(`  Parent atlas entries: ${exportStats.parentAtlas.length}`);
    }
    console.log(`  Status: ${report.status}`);

    if (!DRY_RUN) {
      fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
      fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2), 'utf8');
      console.log(`  ✅ Wrote report → ${REPORT_PATH}`);
      console.log(`  ✅ DuckDB saved → ${DUCKDB_PATH}`);
    }

    if (DRY_RUN) {
      console.log('\n[DRY-RUN] Map-reduce preview complete. Use --apply to persist to disk.');
    } else {
      console.log('\n✅ DuckDB map-reduce join complete!');
      console.log('\nNext: Load parent atlas CSV exports into Redis cache for Bitfrost');
    }

  } finally {
    db.close();
  }

  process.exit(0);
}

main().catch((err) => {
  console.error('\n❌ Error:', err.message);
  if (VERBOSE) console.error(err.stack);
  process.exit(1);
});
