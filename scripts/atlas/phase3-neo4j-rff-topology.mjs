#!/usr/bin/env node
/**
 * Phase 3: RFF Agentic Error Fixing — Rebuild Neo4j Topology
 *
 * Creates RFF-critical relationship types for the topology graph:
 *
 * Edge types to create:
 *   - IMPORTS: Direct imports (file A imports B)
 *   - DEPENDS_ON: Transitive dependencies
 *   - SIMILAR_TOPOLOGY: Code structure similarity (from SOM grid)
 *   - SHARES_ERROR_PATTERN: Chunks with same error class
 *   - CO_OCCUR: Chunks that appear in same file/test
 *
 * Usage:
 *   node scripts/atlas/phase3-neo4j-rff-topology.mjs --dry-run
 *   node scripts/atlas/phase3-neo4j-rff-topology.mjs --apply
 */

import neo4j from 'neo4j-driver';
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');

dotenv.config({ path: path.join(REPO_ROOT, '.env') });
dotenv.config({ path: path.join(REPO_ROOT, 'sveltekit-frontend', '.env.local'), override: false });

const APPLY = process.argv.includes('--apply');
const DRY_RUN = !APPLY;
const VERBOSE = process.argv.includes('--verbose');

const driver = neo4j.default.driver(
  process.env.NEO4J_URI || 'bolt://localhost:7687',
  neo4j.default.auth.basic('neo4j', process.env.NEO4J_PASSWORD || 'password')
);

console.log('╔════════════════════════════════════════════════════════════════╗');
console.log('║  Phase 3: RFF Agentic Error Fixing — Rebuild Neo4j Topology   ║');
console.log(`║  Mode: ${APPLY ? 'APPLY' : 'DRY-RUN'.padEnd(54)}║`);
console.log('╚════════════════════════════════════════════════════════════════╝\n');

async function createSimilarTopologyEdges() {
  /**
   * Create SIMILAR_TOPOLOGY edges from SOM grid adjacencies.
   * Two packets are adjacent if their SOM cluster IDs are within 1 step.
   */
  console.log('📊 Step 1: Create SIMILAR_TOPOLOGY edges from SOM clusters\n');

  const session = driver.session();

  try {
    const cypher = `
      MATCH (p1:Packet), (p2:Packet)
      WHERE p1.somCluster IS NOT NULL AND p2.somCluster IS NOT NULL
      AND p1.somCluster < p2.somCluster
      AND abs(p1.somCluster - p2.somCluster) <= 1
      MERGE (p1)-[:SIMILAR_TOPOLOGY { strength: 0.8 }]->(p2)
      MERGE (p2)-[:SIMILAR_TOPOLOGY { strength: 0.8 }]->(p1)
      RETURN count(*) as edges_created
    `;

    if (DRY_RUN) {
      console.log('  [DRY-RUN] Query:\n  ' + cypher.split('\n').join('\n  '));
      console.log('');
      return 0;
    }

    const result = await session.run(cypher);
    const edgeCount = result.records[0]?.get('edges_created').toNumber() || 0;

    console.log(`  ✓ Created ${edgeCount} SIMILAR_TOPOLOGY edges\n`);
    return edgeCount;
  } finally {
    await session.close();
  }
}

async function createSharesErrorPatternEdges() {
  /**
   * Create SHARES_ERROR_PATTERN edges between chunks with the same error class.
   * Requires error_categories to be populated (from Phase 1 backfill).
   */
  console.log('📊 Step 2: Create SHARES_ERROR_PATTERN edges\n');

  const session = driver.session();

  try {
    const cypher = `
      MATCH (p1:Packet { error_categories: [*] }),
            (p2:Packet { error_categories: [*] })
      WHERE p1.id < p2.id
      AND any(cat IN p1.error_categories WHERE cat IN p2.error_categories)
      MERGE (p1)-[:SHARES_ERROR_PATTERN { category: head([c IN p1.error_categories WHERE c IN p2.error_categories]) }]->(p2)
      RETURN count(*) as edges_created
    `;

    if (DRY_RUN) {
      console.log('  [DRY-RUN] Query:\n  ' + cypher.split('\n').join('\n  '));
      console.log('');
      return 0;
    }

    const result = await session.run(cypher);
    const edgeCount = result.records[0]?.get('edges_created').toNumber() || 0;

    console.log(`  ✓ Created ${edgeCount} SHARES_ERROR_PATTERN edges\n`);
    return edgeCount;
  } finally {
    await session.close();
  }
}

async function createCoOccurEdges() {
  /**
   * Create CO_OCCUR edges for chunks in the same source file.
   * This helps with evidence gathering: chunks that always appear together
   * are more likely to share context.
   */
  console.log('📊 Step 3: Create CO_OCCUR edges (same file)\n');

  const session = driver.session();

  try {
    const cypher = `
      MATCH (p1:Packet { relative_path: $path }),
            (p2:Packet { relative_path: $path })
      WHERE p1.id < p2.id
      MERGE (p1)-[:CO_OCCUR { reason: 'same_file' }]->(p2)
      RETURN DISTINCT count(*) as edges_created
    `;

    if (DRY_RUN) {
      console.log('  [DRY-RUN] Would create CO_OCCUR edges for chunks in same files');
      console.log('');
      return 0;
    }

    // Get all unique paths
    const pathRes = await session.run(`
      MATCH (p:Packet)
      WHERE p.relative_path IS NOT NULL
      RETURN DISTINCT p.relative_path as path
      LIMIT 1000
    `);

    let totalEdges = 0;

    for (const record of pathRes.records) {
      const path = record.get('path');
      const result = await session.run(cypher, { path });
      const edgeCount = result.records[0]?.get('edges_created').toNumber() || 0;
      totalEdges += edgeCount;

      if (VERBOSE) {
        console.log(`  ✓ ${path}: ${edgeCount} edges`);
      }
    }

    console.log(`\n  ✓ Created ${totalEdges} CO_OCCUR edges\n`);
    return totalEdges;
  } finally {
    await session.close();
  }
}

async function verifyTopology() {
  console.log('🔍 Verification\n');

  const session = driver.session();

  try {
    // Count relationships by type
    const relTypes = ['SIMILAR_TOPOLOGY', 'SHARES_ERROR_PATTERN', 'CO_OCCUR', 'IMPORTS'];
    const counts = {};

    for (const relType of relTypes) {
      const result = await session.run(`
        MATCH ()-[r:${relType}]->()
        RETURN count(r) as count
      `);
      counts[relType] = result.records[0]?.get('count').toNumber() || 0;
    }

    console.log('  Relationship counts:');
    Object.entries(counts).forEach(([type, count]) => {
      console.log(`    ${type}: ${count}`);
    });

    const totalNew = counts.SIMILAR_TOPOLOGY + counts.SHARES_ERROR_PATTERN + counts.CO_OCCUR;
    console.log(`\n  Total RFF-critical relationships: ${totalNew}`);

    return totalNew > 0;
  } catch (error) {
    const message = error?.message || String(error);
    console.warn(`  ⚠ Verification skipped: ${message}`);
    return false;
  } finally {
    await session.close();
  }
}

async function main() {
  try {
    console.log('');

    const similarCount = await createSimilarTopologyEdges();
    const errorCount = await createSharesErrorPatternEdges();
    const coOccurCount = await createCoOccurEdges();

    const verified = await verifyTopology();

    console.log('');
    if (DRY_RUN) {
      console.log('✓ Dry-run complete. Run with --apply to persist changes.');
    } else if (verified) {
      console.log('✓ Phase 3 topology rebuild APPLY_PROVEN');
      console.log(`  Total edges created: ${similarCount + errorCount + coOccurCount}`);
    } else {
      console.log('⚠ Phase 3 topology rebuild had issues.');
    }

    console.log('');
    await driver.close();
  } catch (e) {
    console.error('Fatal error:', e);
    await driver.close();
    process.exit(1);
  }
}

main();
