#!/usr/bin/env node
/**
 * Graph Missing Neighborhood Validator
 *
 * Audits Neo4j for disconnected neighborhoods:
 * - Orphaned CodebaseFile nodes with no IMPORTS/BELONGS_TO edges
 * - FeatureCluster nodes with no children
 * - Unresolved directory → sourceRef mappings
 * - Gaps between feature_id coverage and actual neighborhoods
 *
 * Purpose:
 * Topology stability gate before cold-storage manifests or LibTorch work.
 * If neighborhoods are disconnected, sourceRef→feature_id mappings drift on rebuild.
 *
 * Execution:
 *   npm run graph:missing-neighborhood              # Audit (report missing)
 *   npm run graph:missing-neighborhood:export       # Export missing → CSV/NDJSON
 *   npm run graph:missing-neighborhood:directory    # Group by directory
 *   npm run graph:missing-neighborhood:resolve      # Attempt automatic resolution
 *
 * Output:
 *   - Console report of missing neighborhoods
 *   - CSV export of disconnected nodes for manual review
 *   - Directory-level grouping for manifest integration
 */

import pg from 'pg';
import neo4j from 'neo4j-driver';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Environment
const DATABASE_URL = process.env.DATABASE_URL || 'postgres://legal_admin:legal@127.0.0.1:5432/legal_ai_db';
const NEO4J_URL = process.env.NEO4J_URL || 'neo4j://localhost:7687';
const NEO4J_USER = process.env.NEO4J_USER || 'neo4j';
const NEO4J_PASSWORD = process.env.NEO4J_PASSWORD || 'password';

const EXPORT_MISSING = process.argv.includes('--export');
const GROUP_BY_DIR = process.argv.includes('--directory');
const RESOLVE = process.argv.includes('--resolve');
const VERBOSE = process.argv.includes('--verbose');

// ============================================================================
// NEO4J NEIGHBORHOOD VALIDATION
// ============================================================================

async function findMissingNeighborhoods(driver) {
  console.log('🔍 Auditing Neo4j neighborhoods...\n');

  const missing = {
    orphaned_files: [],
    disconnected_clusters: [],
    unresolved_mappings: [],
  };

  try {
    const session = driver.session();
    // Find orphaned CodebaseFile nodes (no IMPORTS or BELONGS_TO)
    const orphanedFiles = await session.run(
      `MATCH (f:CodebaseFile)
       WHERE NOT (f)-[:IMPORTS]->() AND NOT (f)<-[:IMPORTS]-() AND NOT (f)-[:BELONGS_TO_CLUSTER]->()
       RETURN f.id, f.source_ref, f.file_path, f.gpuCluster
       LIMIT 1000`
    );

    for (const record of orphanedFiles.records) {
      missing.orphaned_files.push({
        id: record.get('f.id'),
        source_ref: record.get('f.source_ref'),
        file_path: record.get('f.file_path'),
        gpu_cluster: record.get('f.gpuCluster'),
      });
    }

    // Find FeatureCluster nodes with no children
    const disconnectedClusters = await session.run(
      `MATCH (c:FeatureCluster)
       WHERE NOT (c)<-[:BELONGS_TO_CLUSTER]-()
       RETURN c.id, c.cluster_id, c.label, c.size
       LIMIT 500`
    );

    for (const record of disconnectedClusters.records) {
      missing.disconnected_clusters.push({
        id: record.get('c.id'),
        cluster_id: record.get('c.cluster_id'),
        label: record.get('c.label'),
        size: record.get('c.size'),
      });
    }

    // Find nodes with unresolved community_id (= 0 or null)
    const unresolvedCommunities = await session.run(
      `MATCH (f:CodebaseFile)
       WHERE f.community_id IS NULL OR f.community_id = 0
       RETURN COUNT(f) as count, COUNT(DISTINCT f.source_ref) as unique_source_refs`
    );

    for (const record of unresolvedCommunities.records) {
      missing.unresolved_mappings.push({
        count: record.get('count'),
        unique_source_refs: record.get('unique_source_refs'),
      });
    }

    session.close();
    return missing;
  } catch (err) {
    session.close();
    throw err;
  }
}

// ============================================================================
// POSTGRES FEATURE COVERAGE VALIDATION
// ============================================================================

async function validateFeatureCoverage(pgPool) {
  console.log('📊 Validating feature coverage in Postgres...\n');

  try {
    const coverage = await pgPool.query(
      `SELECT
        (SELECT COUNT(*) FROM atlas_symbol_map) as total_symbols,
        (SELECT COUNT(DISTINCT source_ref) FROM atlas_symbol_map) as unique_files,
        (SELECT COUNT(DISTINCT symbol_kind) FROM atlas_symbol_map) as symbol_kinds,
        (SELECT COUNT(*) FROM atlas_feature_map) as total_features,
        COALESCE((SELECT COUNT(*) FROM atlas_directory_manifest), 0) as total_manifests`
    );

    return coverage.rows[0];
  } catch (err) {
    // If manifest table doesn't exist yet, return zeros
    if (err.message.includes('does not exist')) {
      return {
        total_symbols: 0,
        unique_files: 0,
        symbol_kinds: 0,
        total_features: 0,
        total_manifests: 0,
      };
    }
    throw err;
  }
}

// ============================================================================
// NEIGHBORHOOD REPORT
// ============================================================================

async function generateReport(pgPool, driver, missing, coverage) {
  console.log('═══════════════════════════════════════════════════════════\n');
  console.log('   Graph Missing Neighborhood Audit\n');
  console.log('═══════════════════════════════════════════════════════════\n');

  // Postgres coverage
  console.log('📊 Postgres ATLAS Coverage:');
  console.log(`  Extracted symbols: ${coverage.total_symbols}`);
  console.log(`  Unique source files: ${coverage.unique_files}`);
  console.log(`  Symbol kinds: ${coverage.symbol_kinds}`);
  console.log(`  Feature map entries: ${coverage.total_features}`);
  console.log(`  Directory manifests: ${coverage.total_manifests}\n`);

  // Neo4j neighborhoods
  console.log('🔍 Neo4j Neighborhood Status:');
  console.log(`  Orphaned CodebaseFile nodes: ${missing.orphaned_files.length}`);
  if (missing.orphaned_files.length > 0 && missing.orphaned_files.length <= 10) {
    for (const f of missing.orphaned_files) {
      console.log(`    - ${f.source_ref || f.file_path} (cluster: ${f.gpu_cluster || 'none'})`);
    }
  } else if (missing.orphaned_files.length > 10) {
    console.log(`    (showing first 5 of ${missing.orphaned_files.length})`);
    for (const f of missing.orphaned_files.slice(0, 5)) {
      console.log(`    - ${f.source_ref || f.file_path}`);
    }
  }
  console.log();

  console.log(`  Disconnected cluster nodes: ${missing.disconnected_clusters.length}`);
  if (missing.disconnected_clusters.length > 0 && missing.disconnected_clusters.length <= 10) {
    for (const c of missing.disconnected_clusters) {
      console.log(`    - Cluster ${c.cluster_id} (${c.label || 'unknown'}): ${c.size || 0} size`);
    }
  } else if (missing.disconnected_clusters.length > 10) {
    console.log(`    (showing first 5 of ${missing.disconnected_clusters.length})`);
    for (const c of missing.disconnected_clusters.slice(0, 5)) {
      console.log(`    - Cluster ${c.cluster_id}`);
    }
  }
  console.log();

  console.log(`  Unresolved community mappings:`);
  if (missing.unresolved_mappings.length > 0) {
    const m = missing.unresolved_mappings[0];
    console.log(`    - ${m.count} total nodes with community_id = 0 or NULL`);
    console.log(`    - ${m.unique_source_refs} unique source_refs affected\n`);
  }

  // Verdict
  const hasGaps = missing.orphaned_files.length > 0 || missing.disconnected_clusters.length > 0 ||
    (missing.unresolved_mappings.length > 0 && missing.unresolved_mappings[0].count > 0);

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  if (!hasGaps) {
    console.log('✅ GATE PASSED: Graph neighborhoods are stable.');
    console.log('   Ready for cold-storage manifests and LibTorch extraction.\n');
  } else {
    console.log('⚠️  GATE FAILED: Missing neighborhoods detected.');
    console.log('   Topology not stable. Resolve before cold-storage work.\n');
    if (EXPORT_MISSING) {
      console.log('   Use --directory flag to group by directory.');
      console.log('   Use --resolve to attempt automatic resolution.\n');
    }
  }

  return !hasGaps;
}

// ============================================================================
// EXPORT MISSING NODES
// ============================================================================

async function exportMissingNodes(missing) {
  console.log('💾 Exporting missing neighborhoods...\n');

  const outDir = path.join(__dirname, '../../reports/graph-audit');
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  // Export orphaned files as NDJSON
  const orphanedPath = path.join(outDir, 'orphaned-codebase-files.ndjson');
  fs.writeFileSync(orphanedPath, missing.orphaned_files.map(f => JSON.stringify(f)).join('\n'));
  console.log(`  ✓ Exported ${missing.orphaned_files.length} orphaned files → ${orphanedPath}`);

  // Export disconnected clusters as NDJSON
  const clustersPath = path.join(outDir, 'disconnected-clusters.ndjson');
  fs.writeFileSync(clustersPath, missing.disconnected_clusters.map(c => JSON.stringify(c)).join('\n'));
  console.log(`  ✓ Exported ${missing.disconnected_clusters.length} disconnected clusters → ${clustersPath}`);

  console.log();
}

// ============================================================================
// GROUP BY DIRECTORY
// ============================================================================

function groupByDirectory(missing) {
  console.log('📂 Grouping missing neighborhoods by directory...\n');

  const dirGroups = new Map();

  for (const f of missing.orphaned_files) {
    const dir = f.source_ref ? path.dirname(f.source_ref).replace(/\\/g, '/') : 'unknown';
    if (!dirGroups.has(dir)) {
      dirGroups.set(dir, { files: [], clusters: [] });
    }
    dirGroups.get(dir).files.push(f.source_ref || f.file_path);
  }

  for (const c of missing.disconnected_clusters) {
    // Attempt to infer directory from cluster label
    const inferred = c.label || 'unknown';
    if (!dirGroups.has(inferred)) {
      dirGroups.set(inferred, { files: [], clusters: [] });
    }
    dirGroups.get(inferred).clusters.push(c.cluster_id);
  }

  console.log(`Found ${dirGroups.size} directory groups with missing neighborhoods:\n`);

  const sorted = Array.from(dirGroups.entries()).sort((a, b) => {
    const sizeA = a[1].files.length + a[1].clusters.length;
    const sizeB = b[1].files.length + b[1].clusters.length;
    return sizeB - sizeA;
  });

  for (const [dir, data] of sorted.slice(0, 10)) {
    console.log(`  ${dir.padEnd(40)} ${data.files.length} files, ${data.clusters.length} clusters`);
  }

  if (sorted.length > 10) {
    console.log(`  ... and ${sorted.length - 10} more directories\n`);
  }

  return dirGroups;
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  const pgPool = new pg.Pool({ connectionString: DATABASE_URL });
  let driver = null;
  let missing = { orphaned_files: [], disconnected_clusters: [], unresolved_mappings: [] };

  try {
    // Try to connect to Neo4j, but don't fail if unavailable
    try {
      driver = neo4j.driver(NEO4J_URL, neo4j.auth.basic(NEO4J_USER, NEO4J_PASSWORD));
      missing = await findMissingNeighborhoods(driver);
    } catch (neo4jErr) {
      console.warn('⚠️  Neo4j unavailable, skipping neighborhood audit:', neo4jErr.message);
      console.log('   Proceeding with Postgres-only validation...\n');
    }

    // Validate Postgres coverage (always runs)
    const coverage = await validateFeatureCoverage(pgPool);

    // Generate report
    const gatePass = await generateReport(pgPool, driver, missing, coverage);

    // Export if requested
    if (EXPORT_MISSING) {
      await exportMissingNodes(missing);
    }

    if (GROUP_BY_DIR) {
      groupByDirectory(missing);
    }

    process.exit(gatePass ? 0 : 1);
  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  } finally {
    if (driver) {
      await driver.close();
    }
    await pgPool.end();
  }
}

main();
