#!/usr/bin/env node
/**
 * @file scripts/atlas/audit-recommendation-sourceref.mjs
 * @description Producer: Audit sourceRef normalization logic.
 *
 * Analyzes how sourceRef values are normalized across recommendation sources.
 * Shows before/after for sample packets and identifies collisions.
 *
 * Outputs: docs/reports/recommendation-sourceref-audit.json
 */

import fs from 'node:fs/promises';
import { existsSync, createReadStream } from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const ATLAS_SEEDS = path.join(ROOT, '.tmp', 'atlas-cartridge-seeds.jsonl');
const OUT_JSON = path.join(ROOT, 'docs', 'reports', 'recommendation-sourceref-audit.json');

/**
 * Read NDJSON file
 */
async function readNdjson(filePath) {
  const rows = [];
  if (!existsSync(filePath)) return rows;
  const rl = readline.createInterface({
    input: createReadStream(filePath),
    crlfDelay: Infinity,
  });
  for await (const line of rl) {
    if (!line.trim()) continue;
    try {
      rows.push(JSON.parse(line));
    } catch {
      // skip
    }
  }
  return rows;
}

/**
 * Normalize a sourceRef to canonical form
 * Rules:
 *   1. Convert \ to /
 *   2. Remove leading ./, ../, /, etc.
 *   3. Remove Windows drive letters (C:/)
 *   4. Lowercase for comparison
 *   5. Deduplicate // → /
 */
function normalizeSourceRef(sourceRef) {
  if (!sourceRef) return null;
  let s = String(sourceRef).trim();
  if (!s) return null;

  // Convert backslashes to forward slashes
  s = s.replace(/\\/g, '/');

  // Remove leading protocols (file://)
  s = s.replace(/^file:\/\//i, '');

  // Remove Windows drive letters
  s = s.replace(/^[a-zA-Z]:\//, '');

  // Remove leading ./ and ../
  while (s.startsWith('./') || s.startsWith('../')) {
    if (s.startsWith('./')) {
      s = s.slice(2);
    } else if (s.startsWith('../')) {
      s = s.slice(3);
    }
  }

  // Remove leading /
  s = s.replace(/^\/+/, '');

  // Deduplicate //
  s = s.replace(/\/+/g, '/');

  // Trim trailing slashes
  s = s.replace(/\/$/, '');

  // Lowercase
  s = s.toLowerCase();

  return s || null;
}

async function main() {
  console.log('\n── Recommendation SourceRef Normalization Audit ─────────────\n');

  // Load seeds
  console.log(`Reading: ${ATLAS_SEEDS}`);
  const seeds = await readNdjson(ATLAS_SEEDS);
  console.log(`  Total seeds: ${seeds.length}\n`);

  if (seeds.length === 0) {
    await fs.mkdir(path.dirname(OUT_JSON), { recursive: true });
    await fs.writeFile(OUT_JSON, JSON.stringify({
      total_seeds: 0,
      reason: 'no seeds to audit',
      gates: { audit: 'SKIP' }
    }, null, 2));
    process.exit(0);
  }

  // Sample analysis: take first 100 seeds with sourceRef
  const seedsWithRef = seeds.filter(s => s.sourceRef || s.source_ref).slice(0, 100);
  console.log(`Seeds with sourceRef: ${seedsWithRef.length}\n`);

  // Normalize and collect
  const normalizationSamples = [];
  const normalizedMap = new Map(); // normalized → list of original values

  for (const seed of seedsWithRef) {
    const original = seed.sourceRef || seed.source_ref || '';
    const normalized = normalizeSourceRef(original);

    normalizationSamples.push({
      original,
      normalized,
      feature_id: seed.feature_id,
      status: seed.status,
    });

    if (normalized) {
      if (!normalizedMap.has(normalized)) {
        normalizedMap.set(normalized, []);
      }
      normalizedMap.get(normalized).push(original);
    }
  }

  // Identify collisions
  const collisions = [];
  for (const [normalized, originals] of normalizedMap) {
    const uniqueOriginals = [...new Set(originals)];
    if (uniqueOriginals.length > 1) {
      collisions.push({
        normalized_ref: normalized,
        collision_count: uniqueOriginals.length,
        original_variants: uniqueOriginals,
      });
    }
  }

  console.log(`Normalization samples: ${normalizationSamples.length}`);
  console.log(`Unique normalized refs: ${normalizedMap.size}`);
  console.log(`Collisions (multiple originals → same normalized): ${collisions.length}\n`);

  // Show sample normalization
  console.log('Sample normalization (first 10):');
  for (const sample of normalizationSamples.slice(0, 10)) {
    const match = sample.original === sample.normalized ? '(no change)' : '';
    console.log(`  ${sample.original}`);
    console.log(`    → ${sample.normalized} ${match}`);
  }

  if (collisions.length > 0) {
    console.log('\nCollision examples (first 5):');
    for (const collision of collisions.slice(0, 5)) {
      console.log(`  ${collision.normalized_ref}`);
      for (const orig of collision.original_variants.slice(0, 3)) {
        console.log(`    ← ${orig}`);
      }
    }
  } else {
    console.log('\n✓ No collisions detected (all original sourceRefs normalize to unique values)');
  }
  console.log('');

  // Check for over-aggressive normalization
  const warningCases = normalizationSamples.filter(s => {
    // Cases where normalization might be too aggressive
    // (e.g., loses important context)
    if (!s.original || !s.normalized) return false;
    if (s.original.length > s.normalized.length * 2) return true; // huge reduction
    if (s.original.includes('..') && !s.normalized.includes('..')) return true; // removes parent refs
    return false;
  });

  if (warningCases.length > 0) {
    console.log(`⚠  Potential over-aggressive normalization: ${warningCases.length} cases`);
    for (const w of warningCases.slice(0, 3)) {
      console.log(`  ${w.original} → ${w.normalized} (reduction: ${w.original.length} → ${w.normalized.length} chars)`);
    }
    console.log('');
  }

  // Build report
  const report = {
    generated_at: new Date().toISOString(),
    total_seeds: seeds.length,
    seeds_with_sourceref: seedsWithRef.length,
    normalization_samples: normalizationSamples.length,
    unique_normalized: normalizedMap.size,
    collisions_total: collisions.length,
    over_aggressive_normalizations: warningCases.length,
    collision_examples: collisions.slice(0, 10),
    normalization_samples: normalizationSamples.slice(0, 20),
    gates: {
      audit: 'PASS',
      no_collisions: collisions.length === 0 ? 'PASS' : 'WARN',
      no_over_aggressive: warningCases.length === 0 ? 'PASS' : 'WARN',
    },
    evidence: [
      'scripts/atlas/audit-recommendation-sourceref.mjs',
      '.tmp/atlas-cartridge-seeds.jsonl',
    ],
  };

  // Write report
  await fs.mkdir(path.dirname(OUT_JSON), { recursive: true });
  await fs.writeFile(OUT_JSON, JSON.stringify(report, null, 2) + '\n', 'utf8');

  console.log(`✓ Audit complete`);
  console.log(`✓ Report: ${path.relative(ROOT, OUT_JSON)}\n`);
}

main().catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
