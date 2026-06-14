#!/usr/bin/env node
/**
 * verify-feature-edges.mjs
 *
 * Verify feature edges output for correctness.
 * Checks:
 *   - source_feature and target_feature presence
 *   - edge_type validity
 *   - weight > 0
 *   - no duplicate edges
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dir, '../..');

const edgesPath = path.join(ROOT, 'docs/reports/atlas-feature-edges.json');

function log(...args) {
  console.log(`[${new Date().toISOString()}]`, ...args);
}

function main() {
  if (!fs.existsSync(edgesPath)) {
    console.error(`✗ Feature edges not found: ${edgesPath}`);
    process.exit(1);
  }

  const edges = JSON.parse(fs.readFileSync(edgesPath, 'utf-8'));
  let pass = true;

  log(`Verifying ${edges.length} feature edges...\n`);

  const edgeKeys = new Set();
  let missingSource = 0;
  let missingTarget = 0;
  let missingWeight = 0;
  let duplicates = 0;

  const validTypes = new Set(['SHARES_SOURCE', 'SHARES_COMMUNITY', 'SEMANTIC_SIMILAR']);

  for (const edge of edges) {
    if (!edge.source_feature) {
      missingSource++;
      pass = false;
    }

    if (!edge.target_feature) {
      missingTarget++;
      pass = false;
    }

    if (!edge.weight || edge.weight === 0) {
      missingWeight++;
      pass = false;
    }

    if (!validTypes.has(edge.edge_type)) {
      log(`  Warning: Unknown edge_type ${edge.edge_type}`);
    }

    const key = `${edge.source_feature}→${edge.target_feature}`;
    if (edgeKeys.has(key)) {
      duplicates++;
      pass = false;
    }
    edgeKeys.add(key);
  }

  log(`Edge count: ${edges.length}`);
  log(`  Unique edges: ${edgeKeys.size}`);
  log(`  Missing source: ${missingSource}`);
  log(`  Missing target: ${missingTarget}`);
  log(`  Missing weight: ${missingWeight}`);
  log(`  Duplicates: ${duplicates}`);

  if (pass && missingSource === 0 && missingTarget === 0 && missingWeight === 0) {
    log(`\n✓ Feature edges VERIFIED`);
    process.exit(0);
  } else {
    log(`\n✗ Feature edges FAILED verification`);
    process.exit(1);
  }
}

main();
