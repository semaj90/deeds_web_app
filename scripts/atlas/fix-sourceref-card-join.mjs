#!/usr/bin/env node
/**
 * fix-sourceref-card-join.mjs
 *
 * HIGHEST PRIORITY: Fix the outcome ledger ↔ card join contract.
 *
 * Problem:
 *   - Outcome ledger: sourceRefs = ["sveltekit-frontend/src/lib/server/cache/cache-config.ts"]
 *   - Cards: id = "000678ef52ca67b0" (hex, no sourceRef mapping)
 *   - Join: 0 matches out of 9372 cards
 *
 * Solution:
 *   - Assign deterministic cardId = sha256(sourceRef + graphVersion)
 *   - Create sourceRef → cardId lookup table
 *   - Emit sourceRef-performance.json for DuckDB analytics
 *
 * Output:
 *   - .opencode/cards/*.json — enhanced with cardId + sourceRef
 *   - memory/exports/sourceRef-cardId-map.json (lookup)
 *   - memory/exports/sourceRef-performance.json (for DuckDB)
 *   - outcome-ledger-with-cardIds.ndjson (enriched for joins)
 *
 * Usage:
 *   node scripts/atlas/fix-sourceref-card-join.mjs --dry-run
 *   node scripts/atlas/fix-sourceref-card-join.mjs --apply
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { ROOT, CARDS_DIR as NESCHROM_CARDS_DIR, LEGACY_CARDS_DIR } from './_neschrom-paths.mjs';

const argv = process.argv.slice(2);
const DRY_RUN = argv.includes('--dry-run');
const APPLY = argv.includes('--apply');
const VERBOSE = argv.includes('--verbose');
const LIMIT = argv.indexOf('--limit') >= 0 ? Number(argv[argv.indexOf('--limit') + 1]) : null;

const CARDS_DIR = fs.existsSync(NESCHROM_CARDS_DIR) && fs.readdirSync(NESCHROM_CARDS_DIR).filter(f => f.endsWith('.json')).length > 0
  ? NESCHROM_CARDS_DIR : LEGACY_CARDS_DIR;
const OUTCOME_LEDGER_PATH = path.join(ROOT, '.opencode', 'outcome-ledger.ndjson');
const SOURCEREF_MAP_PATH = path.join(ROOT, 'memory', 'exports', 'sourceRef-cardId-map.json');
const SOURCEREF_PERF_PATH = path.join(ROOT, 'memory', 'exports', 'sourceRef-performance.json');
const OUTCOME_ENRICHED_PATH = path.join(ROOT, '.opencode', 'outcome-ledger-with-cardIds.ndjson');

// ─── Deterministic Card ID Generation ──────────────────────────────────────

function generateCardId(sourceRef, graphVersion) {
  const input = `${sourceRef}:${graphVersion}`;
  return crypto.createHash('sha256').update(input).digest('hex').slice(0, 16);
}

function normalizeSourceRef(sourceRef) {
  // Normalize path separators and case
  return sourceRef.replace(/\\/g, '/').toLowerCase();
}

// ─── Load Data ───────────────────────────────────────────────────────────────

function loadCards() {
  const cardFiles = fs.readdirSync(CARDS_DIR).slice(0, LIMIT || Infinity);
  const cards = [];

  for (const file of cardFiles) {
    try {
      const content = fs.readFileSync(path.join(CARDS_DIR, file), 'utf8');
      const card = JSON.parse(content);
      cards.push({ file, ...card });
    } catch (e) {
      if (VERBOSE) console.log(`  [skip] ${file}: ${e.message}`);
    }
  }

  return cards;
}

function loadOutcomeLedger() {
  if (!fs.existsSync(OUTCOME_LEDGER_PATH)) {
    return [];
  }

  const lines = fs.readFileSync(OUTCOME_LEDGER_PATH, 'utf8').split('\n').filter(Boolean);
  return lines.map(line => JSON.parse(line));
}

// ─── Build Lookup Table ───────────────────────────────────────────────────────

function buildSourceRefMap(cards, defaultGraphVersion = '2026-05-30') {
  const map = {};

  for (const card of cards) {
    if (card.sourceRef) {
      const normalized = normalizeSourceRef(card.sourceRef);
      const graphVersion = card.graphVersion || defaultGraphVersion;
      const cardId = generateCardId(normalized, graphVersion);

      if (!map[normalized]) {
        map[normalized] = {
          sourceRef: card.sourceRef,
          normalized,
          graphVersion,
          cardId,
          originalCardId: card.id,
          cardFile: card.file,
          title: card.title?.slice(0, 100) || '(no title)',
        };
      }
    }
  }

  return map;
}

// ─── Enrich Outcome Ledger with Card IDs ──────────────────────────────────────

function enrichOutcomeLedger(ledger, sourceRefMap) {
  const enriched = [];

  for (const row of ledger) {
    const cardIds = [];

    for (const sourceRef of row.sourceRefs || []) {
      const normalized = normalizeSourceRef(sourceRef);
      const mapping = sourceRefMap[normalized];

      if (mapping) {
        cardIds.push(mapping.cardId);
      }
    }

    enriched.push({
      ...row,
      cardIds: cardIds.length > 0 ? cardIds : undefined,
      joinStatus: cardIds.length > 0 ? 'matched' : 'unmatched',
    });
  }

  return enriched;
}

// ─── Build Performance Metrics ──────────────────────────────────────────────

function buildSourceRefPerformance(sourceRefMap, enrichedLedger) {
  const performance = {};

  for (const [normalized, mapping] of Object.entries(sourceRefMap)) {
    const relatedRows = enrichedLedger.filter((row) => row.cardIds?.length > 0 && row.cardIds[0] === mapping.cardId);

    performance[mapping.cardId] = {
      sourceRef: mapping.sourceRef,
      normalized,
      cardId: mapping.cardId,
      title: mapping.title,
      outcomeCount: relatedRows.length,
      avgReward: relatedRows.length > 0 ? relatedRows.reduce((sum, r) => sum + (r.reward || 0), 0) / relatedRows.length : 0,
      matches: relatedRows.map((r) => ({
        outcomeId: r.id,
        reward: r.reward,
        timestamp: r.timestamp,
      })),
    };
  }

  return performance;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n── Fix sourceRef ↔ Card Join Contract ──────────────────');

  // Load data
  console.log('  Step 1: Load cards and outcome ledger...');
  const cards = loadCards();
  const ledger = loadOutcomeLedger();

  console.log(`  ✅ Loaded ${cards.length} cards, ${ledger.length} outcome rows`);

  // Build sourceRef map
  console.log('  Step 2: Build deterministic cardId mapping...');
  const sourceRefMap = buildSourceRefMap(cards);
  const cardsWithSourceRef = Object.keys(sourceRefMap).length;

  console.log(`  ✅ Mapped ${cardsWithSourceRef} cards with sourceRef`);
  console.log(`    Unmapped: ${cards.length - cardsWithSourceRef} cards`);

  // Enrich outcome ledger
  console.log('  Step 3: Enrich outcome ledger with cardIds...');
  const enrichedLedger = enrichOutcomeLedger(ledger, sourceRefMap);
  const matched = enrichedLedger.filter((r) => r.joinStatus === 'matched').length;

  console.log(`  ✅ Enriched ${enrichedLedger.length} outcome rows`);
  console.log(`    Matched: ${matched}/${enrichedLedger.length} (${((matched / enrichedLedger.length) * 100).toFixed(1)}%)`);

  // Build performance metrics
  console.log('  Step 4: Build sourceRef performance metrics...');
  const performance = buildSourceRefPerformance(sourceRefMap, enrichedLedger);

  console.log(`  ✅ Built performance metrics for ${Object.keys(performance).length} sourceRefs`);

  // Write outputs (if not dry-run)
  if (!DRY_RUN) {
    fs.mkdirSync(path.dirname(SOURCEREF_MAP_PATH), { recursive: true });

    // Write sourceRef → cardId map
    fs.writeFileSync(SOURCEREF_MAP_PATH, JSON.stringify(sourceRefMap, null, 2), 'utf8');
    console.log(`  ✅ Wrote sourceRef map → ${SOURCEREF_MAP_PATH}`);

    // Write performance metrics
    fs.writeFileSync(SOURCEREF_PERF_PATH, JSON.stringify(performance, null, 2), 'utf8');
    console.log(`  ✅ Wrote performance metrics → ${SOURCEREF_PERF_PATH}`);

    // Write enriched outcome ledger
    fs.writeFileSync(
      OUTCOME_ENRICHED_PATH,
      enrichedLedger.map((r) => JSON.stringify(r)).join('\n') + '\n',
      'utf8'
    );
    console.log(`  ✅ Wrote enriched ledger → ${OUTCOME_ENRICHED_PATH}`);
  }

  // Summary
  console.log('\n── Summary ────────────────────────────────────────────────');
  console.log(`  Cards loaded: ${cards.length}`);
  console.log(`  Cards with sourceRef: ${cardsWithSourceRef}`);
  console.log(`  Outcome rows: ${ledger.length}`);
  console.log(`  Joined rows: ${matched}`);
  console.log(`  Join success rate: ${((matched / Math.max(ledger.length, 1)) * 100).toFixed(1)}%`);

  // Next steps
  console.log('\n── Next Steps ──────────────────────────────────────────────');
  if (!DRY_RUN) {
    console.log(`  1. Use sourceRef-cardId-map.json for reward attribution`);
    console.log(`  2. Load sourceRef-performance.json into DuckDB`);
    console.log(`  3. Query tool/cluster/sourceRef performance`);
    console.log(`  4. Use outcome-ledger-with-cardIds.ndjson for joins`);
  } else {
    console.log(`  [DRY-RUN] No files written. Use --apply to persist.`);
  }

  if (matched === 0) {
    console.log(`\n  ⚠️  WARNING: No joins matched!`);
    console.log(`  Check: Are all outcome ledger sourceRefs in card inventory?`);
    console.log(`  Sample ledger sourceRef: "${ledger[0]?.sourceRefs?.[0]}"`);
    console.log(`  Sample card sourceRef: "${Object.values(sourceRefMap)?.[0]?.sourceRef}"`);
  }

  process.exit(matched > 0 || DRY_RUN ? 0 : 1);
}

main().catch((err) => {
  console.error('\n❌ Error:', err.message);
  process.exit(1);
});