#!/usr/bin/env node
/**
 * reward-attribution-pipeline.mjs
 *
 * PHASE 2: Reward Attribution Pipeline
 *
 * Purpose:
 *   Map outcome rewards to card objects using the sourceRef ↔ cardId join.
 *
 * Input:
 *   - .opencode/outcome-ledger-with-cardIds.ndjson (6 rows with matched cardIds)
 *   - memory/exports/sourceRef-cardId-map.json (1,380 lookup entries)
 *   - .opencode/cards/*.json (9,373 cards to enrich)
 *
 * Process:
 *   1. Load joined outcome ledger (all rows have cardIds)
 *   2. For each outcome row, extract reward + cardId
 *   3. Group rewards by cardId (avg + count)
 *   4. For each card, add reward metadata
 *   5. Write enriched cards back to disk
 *   6. Generate reward attribution report
 *
 * Output:
 *   - .opencode/cards/*.json — enriched with reward fields
 *   - memory/exports/reward-attribution-report.json
 *   - memory/exports/reward-summary.json (card-level aggregates)
 *
 * Usage:
 *   node scripts/atlas/reward-attribution-pipeline.mjs --dry-run
 *   node scripts/atlas/reward-attribution-pipeline.mjs --apply
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROOT, CARDS_DIR as NESCHROM_CARDS_DIR, LEGACY_CARDS_DIR } from './_neschrom-paths.mjs';

const argv = process.argv.slice(2);
const DRY_RUN = argv.includes('--dry-run');
const APPLY = argv.includes('--apply');
const VERBOSE = argv.includes('--verbose');

const CARDS_DIR = fs.existsSync(NESCHROM_CARDS_DIR) && fs.readdirSync(NESCHROM_CARDS_DIR).filter(f => f.endsWith('.json')).length > 0
  ? NESCHROM_CARDS_DIR : LEGACY_CARDS_DIR;
const OUTCOME_LEDGER_JOINED = path.join(ROOT, '.opencode', 'outcome-ledger-with-cardIds.ndjson');
const SOURCEREF_MAP = path.join(ROOT, 'memory', 'exports', 'sourceRef-cardId-map.json');
const REPORT_PATH = path.join(ROOT, 'memory', 'exports', 'reward-attribution-report.json');
const SUMMARY_PATH = path.join(ROOT, 'memory', 'exports', 'reward-summary.json');

// ─── Load Data ────────────────────────────────────────────────────────────

function loadOutcomeLedgerJoined() {
  if (!fs.existsSync(OUTCOME_LEDGER_JOINED)) {
    console.error(`❌ Joined ledger not found: ${OUTCOME_LEDGER_JOINED}`);
    console.error('   Run: npm run atlas:fix-joins:apply (to generate joined ledger)');
    return [];
  }

  const lines = fs.readFileSync(OUTCOME_LEDGER_JOINED, 'utf8').split('\n').filter(Boolean);
  const rows = [];

  for (const line of lines) {
    try {
      rows.push(JSON.parse(line));
    } catch (e) {
      if (VERBOSE) console.log(`  [skip] Invalid JSON: ${e.message}`);
    }
  }

  return rows;
}

function loadSourceRefMap() {
  if (!fs.existsSync(SOURCEREF_MAP)) {
    console.warn(`⚠️  SourceRef map not found: ${SOURCEREF_MAP}`);
    return {};
  }

  return JSON.parse(fs.readFileSync(SOURCEREF_MAP, 'utf8'));
}

function loadCard(cardId) {
  const cardPath = path.join(CARDS_DIR, `${cardId}.json`);
  if (!fs.existsSync(cardPath)) {
    return null;
  }

  try {
    return JSON.parse(fs.readFileSync(cardPath, 'utf8'));
  } catch (e) {
    if (VERBOSE) console.log(`  [skip] Failed to load card ${cardId}: ${e.message}`);
    return null;
  }
}

// ─── Main ────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n── Reward Attribution Pipeline (Phase 2) ──────────────────');

  // Load data
  console.log('  Step 1: Load outcome ledger (joined) and sourceRef map...');
  const ledger = loadOutcomeLedgerJoined();
  const sourceRefMap = loadSourceRefMap();

  if (ledger.length === 0) {
    console.error('  ❌ No joined outcome rows found');
    process.exit(1);
  }

  console.log(`  ✅ Loaded ${ledger.length} outcome rows (all matched)`);
  console.log(`  ✅ Loaded ${Object.keys(sourceRefMap).length} sourceRef mappings`);

  // Aggregate rewards by cardId
  console.log('  Step 2: Aggregate rewards by cardId...');
  const rewardsByCardId = {};
  const cardIdToSourceRef = {};

  for (const row of ledger) {
    if (!row.cardIds || row.cardIds.length === 0) {
      continue;
    }

    // Note: Each outcome row has one cardId in this dataset
    const cardId = row.cardIds[0];
    const reward = row.reward || 0;

    if (!rewardsByCardId[cardId]) {
      rewardsByCardId[cardId] = {
        rewards: [],
        count: 0,
        total: 0,
        avg: 0,
        min: reward,
        max: reward,
      };
    }

    rewardsByCardId[cardId].rewards.push(reward);
    rewardsByCardId[cardId].count++;
    rewardsByCardId[cardId].total += reward;
    rewardsByCardId[cardId].min = Math.min(rewardsByCardId[cardId].min, reward);
    rewardsByCardId[cardId].max = Math.max(rewardsByCardId[cardId].max, reward);
    rewardsByCardId[cardId].avg = rewardsByCardId[cardId].total / rewardsByCardId[cardId].count;

    // Track sourceRef for reference
    if (row.sourceRefs && row.sourceRefs.length > 0) {
      cardIdToSourceRef[cardId] = row.sourceRefs[0];
    }
  }

  console.log(`  ✅ Aggregated rewards for ${Object.keys(rewardsByCardId).length} cardIds`);

  // Enrich cards with rewards
  console.log('  Step 3: Enrich cards with reward metadata...');
  const enrichedCards = [];
  const stats = {
    totalCards: 0,
    cardsEnriched: 0,
    cardsNotFound: 0,
    totalRewardValue: 0,
    avgRewardValue: 0,
  };

  for (const cardId of Object.keys(rewardsByCardId)) {
    const card = loadCard(cardId);

    if (!card) {
      stats.cardsNotFound++;
      continue;
    }

    const rewardData = rewardsByCardId[cardId];

    // Add reward fields to card
    const enrichedCard = {
      ...card,
      reward: {
        count: rewardData.count,
        total: rewardData.total,
        avg: rewardData.avg,
        min: rewardData.min,
        max: rewardData.max,
        sourceRef: cardIdToSourceRef[cardId],
        enrichedAt: new Date().toISOString(),
        pipeline: 'reward-attribution-phase2',
      },
    };

    enrichedCards.push({ cardId, card: enrichedCard });

    stats.totalRewardValue += rewardData.total;
    stats.cardsEnriched++;

    if (VERBOSE) {
      console.log(`    ✓ ${cardId}: count=${rewardData.count}, avg=${rewardData.avg.toFixed(4)}`);
    }
  }

  stats.totalCards = enrichedCards.length;
  stats.avgRewardValue = stats.totalRewardValue / Math.max(stats.totalCards, 1);

  console.log(`  ✅ Enriched ${stats.cardsEnriched} cards with reward metadata`);
  if (stats.cardsNotFound > 0) {
    console.warn(`  ⚠️  ${stats.cardsNotFound} cards referenced but not found`);
  }

  // Write enriched cards (if not dry-run)
  if (!DRY_RUN) {
    console.log('  Step 4: Write enriched cards to disk...');

    fs.mkdirSync(CARDS_DIR, { recursive: true });

    for (const { cardId, card } of enrichedCards) {
      const cardPath = path.join(CARDS_DIR, `${cardId}.json`);
      fs.writeFileSync(cardPath, JSON.stringify(card, null, 2), 'utf8');
    }

    console.log(`  ✅ Wrote ${enrichedCards.length} enriched cards`);
  }

  // Generate reports
  console.log('  Step 5: Generate attribution reports...');

  const report = {
    timestamp: new Date().toISOString(),
    mode: DRY_RUN ? 'dry-run' : APPLY ? 'apply' : 'preview',
    phase: 'Phase 2: Reward Attribution',
    inputs: {
      outcomeRows: ledger.length,
      sourceRefMappings: Object.keys(sourceRefMap).length,
    },
    outputs: {
      cardsEnriched: stats.cardsEnriched,
      cardsNotFound: stats.cardsNotFound,
      totalRewardValue: parseFloat(stats.totalRewardValue.toFixed(4)),
      avgRewardValue: parseFloat(stats.avgRewardValue.toFixed(4)),
    },
    statistics: {
      rewardDistribution: {
        min: Math.min(...enrichedCards.map(e => e.card.reward.min)),
        max: Math.max(...enrichedCards.map(e => e.card.reward.max)),
        avg: stats.avgRewardValue,
        total: stats.totalRewardValue,
      },
      countDistribution: {
        min: Math.min(...enrichedCards.map(e => e.card.reward.count)),
        max: Math.max(...enrichedCards.map(e => e.card.reward.count)),
        total: enrichedCards.reduce((sum, e) => sum + e.card.reward.count, 0),
      },
    },
    nextSteps: [
      '1. Verify: enriched cards have reward fields',
      '2. Load reward-summary.json for analytics',
      '3. Begin Phase 3: Cluster Attribution',
      '4. Map GPU clusters to card objects',
      '5. Run Phase 4: Vector64 dry-run',
    ],
  };

  const summary = {
    timestamp: new Date().toISOString(),
    cardsWithRewards: enrichedCards.map(e => ({
      cardId: e.cardId,
      sourceRef: cardIdToSourceRef[e.cardId],
      reward: {
        count: e.card.reward.count,
        total: e.card.reward.total,
        avg: e.card.reward.avg,
      },
    })),
    statistics: report.statistics,
  };

  if (!DRY_RUN) {
    fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
    fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2), 'utf8');
    fs.writeFileSync(SUMMARY_PATH, JSON.stringify(summary, null, 2), 'utf8');
    console.log(`  ✅ Wrote report → ${REPORT_PATH}`);
    console.log(`  ✅ Wrote summary → ${SUMMARY_PATH}`);
  }

  // Summary
  console.log('\n── Summary ────────────────────────────────────────────────');
  console.log(`  Outcome rows processed: ${ledger.length}`);
  console.log(`  Cards enriched: ${stats.cardsEnriched}`);
  console.log(`  Total reward value: ${stats.totalRewardValue.toFixed(4)}`);
  console.log(`  Average reward per card: ${stats.avgRewardValue.toFixed(4)}`);
  console.log(`  Reward range: [${Math.min(...enrichedCards.map(e => e.card.reward.min)).toFixed(4)}, ${Math.max(...enrichedCards.map(e => e.card.reward.max)).toFixed(4)}]`);

  if (DRY_RUN) {
    console.log('\n[DRY-RUN] No cards written. Use --apply to persist.');
  } else if (APPLY) {
    console.log('\n✅ Reward attribution complete!');
    console.log('\nNext: Phase 3 - Cluster Attribution');
    console.log('  npm run atlas:cluster-attribution:apply');
  }

  process.exit(0);
}

main().catch((err) => {
  console.error('\n❌ Error:', err.message);
  if (VERBOSE) console.error(err.stack);
  process.exit(1);
});
