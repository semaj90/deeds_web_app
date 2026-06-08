#!/usr/bin/env node
/**
 * backfill-som-coordinates.mjs
 *
 * Backfill SOM coordinates from Phase 5 metrics into card objects.
 * Reads som-metrics.json and writes som_bmu_row/col/index to each card.
 *
 * Usage:
 *   node scripts/atlas/backfill-som-coordinates.mjs --dry-run
 *   node scripts/atlas/backfill-som-coordinates.mjs --apply
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROOT, CARDS_DIR, LEGACY_CARDS_DIR } from './_neschrom-paths.mjs';

const argv = process.argv.slice(2);
const DRY_RUN = argv.includes('--dry-run');
const APPLY = argv.includes('--apply');
const VERBOSE = argv.includes('--verbose');

// Read from neschrom97/cards/ (primary) + .opencode/cards/ (legacy)
const ACTIVE_CARDS_DIR = fs.existsSync(CARDS_DIR) && fs.readdirSync(CARDS_DIR).length > 0
  ? CARDS_DIR : LEGACY_CARDS_DIR;
const SOM_METRICS_PATH = path.join(ROOT, 'memory', 'exports', 'som-metrics.json');

async function main() {
  console.log('\n── Backfill SOM Coordinates ───────────────────────────');

  // Load SOM metrics
  console.log('  Step 1: Load SOM metrics...');
  if (!fs.existsSync(SOM_METRICS_PATH)) {
    console.error(`  ❌ SOM metrics not found: ${SOM_METRICS_PATH}`);
    console.error('  Run Phase 5 first: node scripts/atlas/som-clustering-pipeline.mjs --apply');
    process.exit(1);
  }

  const somMetrics = JSON.parse(fs.readFileSync(SOM_METRICS_PATH, 'utf8'));
  const assignments = somMetrics.allAssignments || somMetrics.sampleAssignments || [];
  console.log(`  ✅ Loaded ${assignments.length} SOM assignments`);

  // Create assignment map
  const assignmentMap = {};
  for (const assign of assignments) {
    assignmentMap[assign.cardId] = {
      som_bmu_row: assign.bmuRow,
      som_bmu_col: assign.bmuCol,
      som_bmu_index: assign.bmuIndex || (assign.bmuRow * 20 + assign.bmuCol),
      som_bmu_distance: assign.bmuDistance,
    };
  }

  // Step 2: Load and backfill cards
  console.log('  Step 2: Load and backfill card objects...');
  let updated = 0;
  let skipped = 0;

  if (fs.existsSync(ACTIVE_CARDS_DIR)) {
    const files = fs.readdirSync(ACTIVE_CARDS_DIR);
    for (const file of files) {
      if (!file.endsWith('.json')) continue;

      try {
        const cardPath = path.join(ACTIVE_CARDS_DIR, file);
        const content = fs.readFileSync(cardPath, 'utf8');
        const card = JSON.parse(content);

        // Backfill SOM coordinates if in assignment map
        if (assignmentMap[card.id]) {
          const somData = assignmentMap[card.id];
          card.som_bmu_row = somData.som_bmu_row;
          card.som_bmu_col = somData.som_bmu_col;
          card.som_bmu_index = somData.som_bmu_index;
          card.som_bmu_distance = somData.som_bmu_distance;

          if (!DRY_RUN) {
            fs.writeFileSync(cardPath, JSON.stringify(card, null, 2), 'utf8');
          }

          updated++;
        } else {
          skipped++;
        }
      } catch (e) {
        if (VERBOSE) console.log(`  [error] ${file}: ${e.message}`);
      }
    }
  }

  console.log(`  ✅ Updated ${updated} cards`);
  console.log(`  ⚠️  Skipped ${skipped} cards (no SOM assignment)`);

  if (DRY_RUN) {
    console.log('\n[DRY-RUN] Backfill preview complete. Use --apply to save.');
  } else if (APPLY) {
    console.log('\n✅ SOM coordinates backfilled into card objects!');
  }

  process.exit(0);
}

main().catch((err) => {
  console.error('\n❌ Error:', err.message);
  process.exit(1);
});
