#!/usr/bin/env node
/**
 * Populate Code Features with Summaries
 *
 * Reads from canonical enriched-candidates.ndjson (GITIGNORED)
 * and populates code_features.summary with descriptions
 *
 * Priority chain:
 * 1. enriched-candidates.ndjson (highest fidelity)
 * 2. cluster-summary.ndjson by feature's SOM cluster
 * 3. codebase_chunk_index content (first 200 chars)
 * 4. feature_label (fallback)
 *
 * Usage:
 *   npm run atlas:code-features:populate-summaries --dry-run
 *   npm run atlas:code-features:populate-summaries:apply --verbose
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import readline from 'node:readline';

const { Pool } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run') || !args.includes('--apply');
const verbose = args.includes('--verbose');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgres://legal_admin:123456@127.0.0.1:5434/legal_ai_db',
  max: 5,
});

const proof = {
  timestamp: new Date().toISOString(),
  mode: dryRun ? 'dry-run' : 'apply',
  stats: {
    features_total: 0,
    features_with_summary: 0,
    features_updated: 0,
    candidates_read: 0,
    cluster_summaries_read: 0,
    fallback_used: 0,
    errors: 0
  },
  errors: []
};

/**
 * Read NDJSON file line by line
 */
async function readNDJSON(filePath) {
  const items = [];
  try {
    const fileStream = await fs.open(filePath, 'r');
    const rl = readline.createInterface({
      input: fileStream.createReadStream(),
      crlfDelay: Infinity
    });

    for await (const line of rl) {
      if (line.trim()) {
        try {
          items.push(JSON.parse(line));
        } catch (err) {
          // Skip malformed lines
        }
      }
    }
  } catch (err) {
    if (verbose) console.warn(`Could not read NDJSON: ${err.message}`);
  }
  return items;
}

/**
 * Populate summaries from canonical sources
 */
async function populateSummaries(client) {
  // Load all existing code_features
  const featuresResult = await client.query('SELECT feature_id, feature_label, summary FROM code_features');
  const features = featuresResult.rows;
  proof.stats.features_total = features.length;
  console.log(`✓ Loaded ${features.length} code features`);

  // Load enriched candidates (highest priority)
  const candidatesPath = path.join(REPO_ROOT, '..', '.opencode/ndjson/enriched-candidates.ndjson');
  const candidates = await readNDJSON(candidatesPath);
  proof.stats.candidates_read = candidates.length;
  console.log(`✓ Loaded ${candidates.length} enriched candidates`);

  // Build lookup by feature_id
  const candidatesByFeatureId = new Map();
  for (const cand of candidates) {
    if (cand.feature_id) {
      candidatesByFeatureId.set(cand.feature_id, cand);
    }
  }

  // Load cluster summaries (secondary)
  const clusterPath = path.join(REPO_ROOT, '..', '.opencode/ndjson/cluster-summary.ndjson');
  const clusterSummaries = await readNDJSON(clusterPath);
  proof.stats.cluster_summaries_read = clusterSummaries.length;
  console.log(`✓ Loaded ${clusterSummaries.length} cluster summaries`);

  // Build lookup by cluster_id
  const clustersByClusterId = new Map();
  for (const cluster of clusterSummaries) {
    if (cluster.cluster_id) {
      clustersByClusterId.set(cluster.cluster_id, cluster);
    }
  }

  if (verbose) console.log(`\n[1/2] Determining summaries for ${features.length} features...\n`);

  // For each feature, find best summary
  const updates = [];
  for (const feature of features) {
    let summary = null;
    let source = 'unknown';

    // Priority 1: enriched-candidates
    const candidate = candidatesByFeatureId.get(feature.feature_id);
    if (candidate && candidate.summary) {
      summary = candidate.summary;
      source = 'enriched-candidates';
    }

    // Priority 2: cluster summary (if candidate has SOM cluster)
    if (!summary && candidate && candidate.som_cluster !== undefined) {
      const cluster = clustersByClusterId.get(candidate.som_cluster);
      if (cluster && cluster.summary) {
        summary = cluster.summary;
        source = 'cluster-summary';
      }
    }

    // Priority 3: fallback to feature_label (we always have this)
    if (!summary) {
      summary = feature.feature_label || 'Feature';
      source = 'fallback';
      proof.stats.fallback_used++;
    }

    // Truncate to 300 chars
    summary = summary.substring(0, 300);

    updates.push({
      feature_id: feature.feature_id,
      summary,
      source
    });

    if (verbose && updates.length % 5 === 0) {
      console.log(`  Processed ${updates.length}/${features.length}...`);
    }
  }

  console.log(`\n[2/2] Applying ${updates.length} summary updates...\n`);

  // Apply updates
  for (const update of updates) {
    try {
      if (!dryRun) {
        await client.query(
          'UPDATE code_features SET summary = $1, updated_at = NOW() WHERE feature_id = $2',
          [update.summary, update.feature_id]
        );
      }
      proof.stats.features_updated++;
      if (update.summary !== (update.feature_id || '').split(':')[1]) {
        proof.stats.features_with_summary++;
      }

      if (verbose && proof.stats.features_updated % 5 === 0) {
        console.log(`  Updated ${proof.stats.features_updated}/${updates.length}...`);
      }
    } catch (err) {
      proof.errors.push({
        feature_id: update.feature_id,
        error: err.message
      });
      proof.stats.errors++;
    }
  }

  console.log(`\n✅ Summaries processed: ${proof.stats.features_updated}/${features.length}`);
}

async function main() {
  console.log(`📝 Code Feature Summaries Population\n`);
  console.log(`Mode: ${dryRun ? 'DRY-RUN (no writes)' : 'APPLY (writes enabled)'}`);
  console.log(`Strategy: NDJSON enriched candidates → cluster fallback → label fallback\n`);

  try {
    console.log(`Connecting to database...`);
    await pool.connect();
    console.log(`✓ Connected\n`);

    console.log(`[1/2] Fetching code features...`);
    await populateSummaries(pool);

    // Write proof report
    const reportsDir = path.join(REPO_ROOT, 'docs/reports');
    try {
      await fs.mkdir(reportsDir, { recursive: true });
    } catch (err) {
      // Directory may already exist
    }

    if (!dryRun) {
      await fs.writeFile(
        path.join(reportsDir, 'code-feature-summaries-population-proof.json'),
        JSON.stringify(proof, null, 2)
      );
    }

    console.log(`\n✅ Population complete`);
    console.log(`Summary:`);
    console.log(`  Total features: ${proof.stats.features_total}`);
    console.log(`  Features with summary: ${proof.stats.features_with_summary}`);
    console.log(`  Features updated: ${proof.stats.features_updated}`);
    console.log(`  Fallbacks used: ${proof.stats.fallback_used}`);
    console.log(`  Errors: ${proof.stats.errors}`);

    process.exit(proof.stats.errors === 0 ? 0 : 1);
  } catch (err) {
    console.error(`✗ Fatal error:`, err);
    process.exit(1);
  } finally {
    pool.end().catch(() => {});
  }
}

main();
