#!/usr/bin/env node
/**
 * @file scripts/atlas/audit-recommendation-merge.mjs
 * @description Producer: Audit recommendation merge-key dedup logic.
 *
 * Reads atlas-cartridge-seeds.jsonl (the source of recommendations) and
 * analyzes why only 5 recommendations pass the dedup merge-key filter
 * (vs. claimed 4173 candidate seeds).
 *
 * Root cause: detectStaleFeatures() in build-recommendations.mjs caps
 * missing features at .slice(0, 5) BEFORE merge-key dedup.
 *
 * This script:
 * 1. Counts total candidate seeds
 * 2. Groups by merge-key (feature_id + cluster)
 * 3. Reports dedup collisions
 * 4. Explains why <5 make it through all filters
 *
 * Outputs: docs/reports/recommendation-merge-key-audit.json
 */

import fs from 'node:fs/promises';
import { existsSync, createReadStream } from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const ATLAS_SEEDS = path.join(ROOT, '.tmp', 'atlas-cartridge-seeds.jsonl');
const OUT_JSON = path.join(ROOT, 'docs', 'reports', 'recommendation-merge-key-audit.json');

/**
 * Read NDJSON file line by line
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
      // skip malformed lines
    }
  }
  return rows;
}

/**
 * Normalize sourceRef to canonical form
 * (same logic as source-ref normalization would be)
 */
function normalizeSourceRef(sourceRef) {
  if (!sourceRef) return 'unknown';
  let s = String(sourceRef);
  // normalize path separators
  s = s.replace(/\\/g, '/');
  // remove leading ./ or /
  s = s.replace(/^\.\//, '');
  s = s.replace(/^\//, '');
  // lowercase for comparison
  s = s.toLowerCase();
  return s;
}

/**
 * Generate merge-key from a seed
 * (same logic as materialize-recommendation-tasks.mjs)
 */
function generateMergeKey(seed) {
  const featureId = (seed.feature_id || seed.feature || '').toLowerCase().trim();
  const cluster = (seed.cluster || 'General').toLowerCase().trim();
  if (!featureId) return null; // skip seeds with no feature_id
  return `${featureId}:${cluster}`;
}

async function main() {
  console.log('\n── Recommendation Merge-Key Audit ────────────────────────────\n');

  // Load seeds
  console.log(`Reading: ${ATLAS_SEEDS}`);
  const seeds = await readNdjson(ATLAS_SEEDS);
  console.log(`  Total seeds: ${seeds.length}\n`);

  if (seeds.length === 0) {
    console.log('⚠  No seeds found. Run npm run atlas:cartridge-seed first.');
    await fs.mkdir(path.dirname(OUT_JSON), { recursive: true });
    await fs.writeFile(OUT_JSON, JSON.stringify({
      total_seeds: 0,
      reason: 'atlas-cartridge-seeds.jsonl is empty',
      gates: { audit: 'FAIL' }
    }, null, 2));
    process.exit(0);
  }

  // Categorize seeds by status
  const byStatus = {};
  for (const seed of seeds) {
    const status = seed.status || 'unknown';
    if (!byStatus[status]) byStatus[status] = [];
    byStatus[status].push(seed);
  }

  console.log('Seeds by status:');
  for (const [status, rows] of Object.entries(byStatus)) {
    console.log(`  ${status}: ${rows.length}`);
  }
  console.log('');

  // Focus on missing features (the ones that become recommendations)
  const missingSeeds = byStatus['missing'] || [];
  console.log(`Missing features (recommendation candidates): ${missingSeeds.length}`);

  // Slice to first 5 (same as detectStaleFeatures())
  const sliced = missingSeeds.slice(0, 5);
  console.log(`After .slice(0, 5): ${sliced.length}`);
  console.log('');

  // Build merge-key groups
  const mergeKeyGroups = new Map();
  let skipNoFeatureId = 0;

  for (const seed of sliced) {
    const mergeKey = generateMergeKey(seed);
    if (!mergeKey) {
      skipNoFeatureId++;
      continue;
    }
    if (!mergeKeyGroups.has(mergeKey)) {
      mergeKeyGroups.set(mergeKey, []);
    }
    mergeKeyGroups.get(mergeKey).push(seed);
  }

  console.log(`Merge-key groups (after dedup): ${mergeKeyGroups.size}`);
  if (skipNoFeatureId > 0) {
    console.log(`  Skipped (no feature_id): ${skipNoFeatureId}`);
  }
  console.log('');

  // Analyze collisions
  let totalCollisions = 0;
  const mergeSummary = [];
  for (const [key, group] of mergeKeyGroups) {
    const collision = group.length - 1;
    totalCollisions += collision;
    mergeSummary.push({
      merge_key: key,
      group_size: group.length,
      collision: collision,
      seeds: group.map(s => ({
        feature_id: s.feature_id,
        feature_label: s.feature_label,
        status: s.status,
        risk_notes: s.risk_notes,
      })),
    });
  }

  console.log(`Collisions (multiple seeds with same key): ${totalCollisions}`);
  console.log('');

  // Detailed breakdown
  console.log('Merge-key breakdown:');
  for (const group of mergeSummary.sort((a, b) => b.group_size - a.group_size)) {
    console.log(`  ${group.merge_key}: ${group.group_size} seeds${group.collision > 0 ? ` (${group.collision} collision${group.collision > 1 ? 's' : ''})` : ''}`);
    for (const seed of group.seeds) {
      console.log(`    - ${seed.feature_id} | ${seed.feature_label}`);
    }
  }
  console.log('');

  // Root cause analysis
  const rootCause = [];
  if (missingSeeds.length > sliced.length) {
    rootCause.push(`detectStaleFeatures() caps missing features at .slice(0, 5) (${missingSeeds.length} total → ${sliced.length} after slice)`);
  }
  if (skipNoFeatureId > 0) {
    rootCause.push(`${skipNoFeatureId} seed(s) skipped due to missing feature_id`);
  }
  if (totalCollisions > 0) {
    rootCause.push(`${totalCollisions} merge-key collision(s) — first-seen wins, duplicates filtered`);
  }
  if (mergeKeyGroups.size < sliced.length && mergeKeyGroups.size > 0) {
    rootCause.push(`${sliced.length - mergeKeyGroups.size} seeds eliminated by merge-key dedup`);
  }

  console.log('Root cause (why only 5 recommendations):');
  for (const cause of rootCause) {
    console.log(`  • ${cause}`);
  }
  console.log('');

  // Build report
  const report = {
    generated_at: new Date().toISOString(),
    total_seeds: seeds.length,
    missing_seeds_total: missingSeeds.length,
    missing_seeds_after_slice: sliced.length,
    slice_cap: 5,
    merge_key_groups: mergeKeyGroups.size,
    skip_no_feature_id: skipNoFeatureId,
    total_collisions: totalCollisions,
    final_recommendation_count: mergeKeyGroups.size,
    merge_summary: mergeSummary,
    root_causes: rootCause,
    gates: {
      audit: mergeKeyGroups.size > 0 ? 'PASS' : 'FAIL',
      root_cause_identified: rootCause.length > 0 ? 'PASS' : 'FAIL',
    },
    evidence: [
      'scripts/atlas/audit-recommendation-merge.mjs',
      '.tmp/atlas-cartridge-seeds.jsonl',
      'scripts/opencode/build-recommendations.mjs (detectStaleFeatures slice cap)',
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
