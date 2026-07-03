#!/usr/bin/env node
/**
 * Populate Code Feature Edges from SOM Topology
 *
 * Creates bidirectional edges between code features in topologically similar
 * SOM clusters to enable graph-based PageRank computation.
 *
 * Usage:
 *   npm run atlas:code-features:edges:populate --dry-run
 *   npm run atlas:code-features:edges:populate:apply
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import readline from 'node:readline';
import { loadRepoEnv, resolveDatabaseUrl } from '../../../scripts/atlas/connection-config.mjs';

const { Pool } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run') || !args.includes('--apply');
const verbose = args.includes('--verbose');
const completeGraph = args.includes('--complete-graph');
const repoEnv = loadRepoEnv(process.env);

const pool = new Pool({
  connectionString: resolveDatabaseUrl(repoEnv),
  max: 5,
});

const proof = {
  timestamp: new Date().toISOString(),
  mode: dryRun ? 'dry-run' : 'apply',
  stats: {
    features_total: 0,
    edges_read: 0,
    feature_edges_created: 0,
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
    console.warn(`Could not read NDJSON: ${err.message}`);
  }
  return items;
}

async function insertEdge(client, fromFeatureId, toFeatureId, relation, weight) {
  try {
    if (!dryRun) {
      await client.query(`
        INSERT INTO code_feature_edges (from_feature_id, to_feature_id, relation, confidence)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT DO NOTHING
      `, [fromFeatureId, toFeatureId, relation, weight]);
    }

    proof.stats.feature_edges_created++;
  } catch (err) {
    proof.errors.push({
      edge: `${fromFeatureId} → ${toFeatureId}`,
      relation,
      error: err.message
    });
    proof.stats.errors++;
  }
}

/**
 * Populate code_feature_edges with scoped structural graph edges.
 * Complete graph mode remains available behind --complete-graph, but the
 * default is file-local so PageRank/GDS receives useful signal instead of
 * millions of uniform all-to-all edges.
 */
async function populateEdges(client) {
  // Get all code features
  const featuresResult = await client.query(`
    SELECT feature_id, source_ref, symbol, kind, line_start
    FROM code_features
    WHERE feature_id IS NOT NULL
      AND source_ref IS NOT NULL
    ORDER BY source_ref, COALESCE(line_start, 999999), kind, symbol
  `);
  const featureRows = featuresResult.rows;
  const features = featureRows.map(r => r.feature_id);
  proof.stats.features_total = features.length;
  console.log(`✓ Loaded ${features.length} code features`);

  // Load topology edges for weighting
  const edgesPath = path.join(REPO_ROOT, '..', '.opencode/ndjson/graph-edges.ndjson');
  const topoEdges = await readNDJSON(edgesPath);
  proof.stats.edges_read = topoEdges.length;
  console.log(`✓ Loaded ${topoEdges.length} topology edges`);

  if (completeGraph) {
    console.warn('⚠ --complete-graph enabled: this can create many low-signal edges.');
    for (let i = 0; i < features.length; i++) {
      for (let j = i + 1; j < features.length; j++) {
        const weight = 1.0 / Math.max(1, features.length - 1);
        await insertEdge(client, features[i], features[j], 'DEPENDS_ON', weight);
        await insertEdge(client, features[j], features[i], 'DEPENDS_ON', weight);
      }
    }
  } else {
    const bySource = new Map();
    for (const row of featureRows) {
      const list = bySource.get(row.source_ref) ?? [];
      list.push(row);
      bySource.set(row.source_ref, list);
    }

    for (const rows of bySource.values()) {
      const sorted = rows.sort((a, b) => Number(a.line_start ?? 999999) - Number(b.line_start ?? 999999));

      for (let i = 0; i < sorted.length - 1; i++) {
        await insertEdge(client, sorted[i].feature_id, sorted[i + 1].feature_id, 'NEXT_IN_FILE', 0.8);
      }

      const imports = sorted.filter((row) => String(row.kind ?? '').includes('import'));
      const codeNodes = sorted.filter((row) => /function|method|exported|class|type|route|mcp_tool|drizzle_table/.test(String(row.kind ?? '')));
      for (const imp of imports.slice(0, 25)) {
        for (const target of codeNodes.slice(0, 50)) {
          if (imp.feature_id !== target.feature_id) {
            await insertEdge(client, imp.feature_id, target.feature_id, 'SUPPORTS_IN_FILE', 0.6);
          }
        }
      }
    }

    const bySymbol = new Map();
    for (const row of featureRows) {
      const symbol = String(row.symbol ?? '').trim().toLowerCase();
      if (!symbol || symbol.length < 4) continue;
      const list = bySymbol.get(symbol) ?? [];
      list.push(row);
      bySymbol.set(symbol, list);
    }

    for (const rows of bySymbol.values()) {
      if (rows.length < 2 || rows.length > 25) continue;
      for (let i = 0; i < rows.length; i++) {
        for (let j = i + 1; j < rows.length; j++) {
          await insertEdge(client, rows[i].feature_id, rows[j].feature_id, 'SAME_SYMBOL', 0.7);
          await insertEdge(client, rows[j].feature_id, rows[i].feature_id, 'SAME_SYMBOL', 0.7);
        }
      }
    }
  }

  if (verbose) {
    console.log(`  Created ${proof.stats.feature_edges_created} feature edges`);
  }
}

async function main() {
  console.log(`📊 Code Feature Edges Population\n`);
  console.log(`Mode: ${dryRun ? 'DRY-RUN (no writes)' : 'APPLY (writes enabled)'}`);
  console.log(`Strategy: ${completeGraph ? 'complete graph between all code features' : 'file-scoped structural graph'}\n`);

  try {
    console.log(`Connecting to database...`);
    await pool.connect();
    console.log(`✓ Connected\n`);

    console.log(`[1/2] Fetching code features...`);
    await populateEdges(pool);

    // Write proof report
    const reportsDir = path.join(REPO_ROOT, 'docs/reports');
    try {
      await fs.mkdir(reportsDir, { recursive: true });
    } catch (err) {
      // Directory may already exist
    }

    if (!dryRun) {
      await fs.writeFile(
        path.join(reportsDir, 'code-feature-edges-population-proof.json'),
        JSON.stringify(proof, null, 2)
      );
    }

    console.log(`\n✅ Population complete`);
    console.log(`Summary:`);
    console.log(`  Features: ${proof.stats.features_total}`);
    console.log(`  Topology edges read: ${proof.stats.edges_read}`);
    console.log(`  Feature edges created: ${proof.stats.feature_edges_created}`);
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
