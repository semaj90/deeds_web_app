#!/usr/bin/env node
/**
 * verify-feature-cards.mjs
 *
 * Verify feature cards output for completeness and correctness.
 * Checks:
 *   - feature_id presence and uniqueness
 *   - packet_count > 0
 *   - paths/source_refs alignment
 *   - tag completeness
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dir, '../..');

const cardsPath = path.join(ROOT, 'docs/reports/atlas-feature-cards.json');

function log(...args) {
  console.log(`[${new Date().toISOString()}]`, ...args);
}

function main() {
  if (!fs.existsSync(cardsPath)) {
    console.error(`✗ Feature cards not found: ${cardsPath}`);
    process.exit(1);
  }

  const cards = JSON.parse(fs.readFileSync(cardsPath, 'utf-8'));
  let pass = true;

  log(`Verifying ${cards.length} feature cards...\n`);

  const featureIds = new Set();
  let missingFeatureId = 0;
  let missingPackets = 0;
  let mismatchedPaths = 0;
  let emptyTags = 0;

  for (const card of cards) {
    if (!card.feature_id) {
      missingFeatureId++;
      pass = false;
      continue;
    }

    if (featureIds.has(card.feature_id)) {
      log(`✗ Duplicate feature_id: ${card.feature_id}`);
      pass = false;
    }
    featureIds.add(card.feature_id);

    if (!card.packet_count || card.packet_count === 0) {
      missingPackets++;
      pass = false;
    }

    if (card.paths?.length !== card.file_count) {
      mismatchedPaths++;
      log(`  Warning: ${card.feature_id} paths count mismatch`);
    }

    if (!card.tags || card.tags.length === 0) {
      emptyTags++;
    }
  }

  log(`Feature IDs: ${featureIds.size} unique`);
  log(`  Missing feature_id: ${missingFeatureId}`);
  log(`  Missing packets: ${missingPackets}`);
  log(`  Path mismatches: ${mismatchedPaths}`);
  log(`  Empty tags: ${emptyTags}`);

  if (pass && missingFeatureId === 0 && missingPackets === 0) {
    log(`\n✓ Feature cards VERIFIED (${cards.length} cards)`);
    process.exit(0);
  } else {
    log(`\n✗ Feature cards FAILED verification`);
    process.exit(1);
  }
}

main();
