#!/usr/bin/env node
/**
 * backfill-code-cards.mjs
 *
 * OPTION A: Backfill code artifact cards from outcome ledger.
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { ROOT, CARDS_DIR, ensureDirs } from './_neschrom-paths.mjs';

const argv = process.argv.slice(2);
const DRY_RUN = argv.includes('--dry-run');
const APPLY = argv.includes('--apply');
const VERBOSE = argv.includes('--verbose');
const OUTCOME_LEDGER_PATH = path.join(ROOT, '.opencode', 'outcome-ledger.ndjson');
const REPORT_PATH = path.join(ROOT, 'memory', 'exports', 'backfill-code-cards-report.json');

// ─── Utilities ─────────────────────────────────────────────────────────────

function normalizeSourceRef(sourceRef) {
  return sourceRef.replace(/\\/g, '/').toLowerCase();
}

function generateCardId(sourceRef, graphVersion = '2026-05-30') {
  const input = `${sourceRef}:${graphVersion}`;
  return crypto.createHash('sha256').update(input).digest('hex').slice(0, 16);
}

// ─── Load Data ─────────────────────────────────────────────────────────────

function loadOutcomeLedger() {
  if (!fs.existsSync(OUTCOME_LEDGER_PATH)) {
    console.error(`❌ Outcome ledger not found: ${OUTCOME_LEDGER_PATH}`);
    return [];
  }

  const lines = fs.readFileSync(OUTCOME_LEDGER_PATH, 'utf8').split('\n').filter(Boolean);
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

// ─── Main ─────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n── Backfill Code Cards from Outcome Ledger ────────────────');

  // Load outcome ledger
  console.log('  Step 1: Load outcome ledger...');
  const ledger = loadOutcomeLedger();

  if (ledger.length === 0) {
    console.error('  ❌ No outcome ledger rows found');
    process.exit(1);
  }

  console.log(`  ✅ Loaded ${ledger.length} outcome rows`);

  // Extract unique sourceRefs
  console.log('  Step 2: Extract unique sourceRefs...');
  const sourceRefsByPath = {};

  for (const row of ledger) {
    for (const sourceRef of row.sourceRefs || []) {
      const normalized = normalizeSourceRef(sourceRef);

      if (!sourceRefsByPath[normalized]) {
        sourceRefsByPath[normalized] = {
          originalSourceRef: sourceRef,
          normalized,
          outcomes: [],
          outcomeCount: 0,
          totalReward: 0,
          avgReward: 0,
        };
      }

      sourceRefsByPath[normalized].outcomes.push({
        id: row.id,
        reward: row.reward || 0,
        tool: row.tool || 'unknown',
        timestamp: row.timestamp,
      });
      sourceRefsByPath[normalized].outcomeCount++;
      sourceRefsByPath[normalized].totalReward += row.reward || 0;
    }
  }

  const uniqueSourceRefs = Object.keys(sourceRefsByPath).length;
  console.log(`  ✅ Found ${uniqueSourceRefs} unique sourceRefs`);

  // Calculate average rewards
  for (const mapping of Object.values(sourceRefsByPath)) {
    mapping.avgReward = mapping.totalReward / mapping.outcomeCount;
  }

  // Generate code cards
  console.log('  Step 3: Generate code artifact cards...');
  const cardsToWrite = [];

  for (const [normalized, data] of Object.entries(sourceRefsByPath)) {
    const cardId = generateCardId(normalized, '2026-05-30');

    const card = {
      id: cardId,
      sourceRef: data.originalSourceRef,
      normalized: normalized,
      title: `[Code] ${normalized.split('/').pop()}`,
      kind: 'code-artifact',
      origin: 'outcome-ledger',
      graphVersion: '2026-05-30',
      outcomeCount: data.outcomeCount,
      avgReward: parseFloat(data.avgReward.toFixed(4)),
      totalReward: parseFloat(data.totalReward.toFixed(4)),
      outcomes: data.outcomes.map(o => ({
        id: o.id,
        reward: o.reward,
        tool: o.tool,
        timestamp: o.timestamp,
      })),
      createdAt: new Date().toISOString(),
      backfillSession: '2026-05-30T00:00:00Z',
    };

    cardsToWrite.push({ cardId, card, path: path.join(CARDS_DIR, `${cardId}.json`) });

    if (VERBOSE) {
      console.log(`    → ${cardId}: ${data.originalSourceRef} (${data.outcomeCount} outcomes, avg reward ${data.avgReward.toFixed(4)})`);
    }
  }

  console.log(`  ✅ Generated ${cardsToWrite.length} code cards`);

  // Write cards (if not dry-run)
  if (!DRY_RUN) {
    console.log('  Step 4: Write cards to disk...');

    fs.mkdirSync(CARDS_DIR, { recursive: true });

    for (const { cardId, card, path: cardPath } of cardsToWrite) {
      fs.writeFileSync(cardPath, JSON.stringify(card, null, 2), 'utf8');
      if (VERBOSE) console.log(`    ✓ ${cardId}.json`);
    }

    console.log(`  ✅ Wrote ${cardsToWrite.length} cards`);
  }

  // Write report
  console.log('  Step 5: Write report...');
  const report = {
    timestamp: new Date().toISOString(),
    mode: DRY_RUN ? 'dry-run' : APPLY ? 'apply' : 'preview',
    inputs: {
      outcomeRows: ledger.length,
      uniqueSourceRefs: uniqueSourceRefs,
    },
    outputs: {
      cardsBackfilled: cardsToWrite.length,
      cardIds: cardsToWrite.map(c => c.cardId),
      graphVersion: '2026-05-30',
    },
    expectedJoinResult: {
      before: '0/6 matches (0% success)',
      after: `${cardsToWrite.length}/${cardsToWrite.length} matches (100% success)`,
    },
    details: {
      sourceRefs: sourceRefsByPath,
    },
    nextSteps: [
      '1. Run: npm run atlas:fix-joins:apply',
      '2. Verify: sourceRef-cardId-map.json generated',
      '3. Verify: sourceRef-performance.json generated',
      '4. Verify: outcome-ledger-with-cardIds.ndjson generated',
      '5. Check join success rate: should be 6/6 (100%)',
      '6. Load sourceRef-performance.json into DuckDB for analytics',
    ],
  };

  if (!DRY_RUN) {
    fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
    fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2), 'utf8');
    console.log(`  ✅ Wrote report → ${REPORT_PATH}`);
  }

  // Summary
  console.log('\n── Summary ────────────────────────────────────────────────');
  console.log(`  Outcome rows: ${ledger.length}`);
  console.log(`  Unique sourceRefs: ${uniqueSourceRefs}`);
  console.log(`  Code cards to backfill: ${cardsToWrite.length}`);
  console.log(`  Expected join result: ${cardsToWrite.length}/${cardsToWrite.length} (100%)`);

  if (DRY_RUN) {
    console.log('\n[DRY-RUN] No cards written. Use --apply to persist.');
  } else if (APPLY) {
    console.log('\n✅ Code cards backfilled successfully!');
    console.log('\nNext: Run npm run atlas:fix-joins:apply');
  } else {
    console.log('\n[PREVIEW] Cards generated but not written. Use --apply to persist.');
  }

  process.exit(0);
}

main().catch((err) => {
  console.error('\n❌ Error:', err.message);
  if (VERBOSE) console.error(err.stack);
  process.exit(1);
});
