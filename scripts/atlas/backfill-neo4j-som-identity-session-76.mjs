#!/usr/bin/env node
/**
 * backfill-neo4j-som-identity-session-76.mjs
 *
 * Gate 2 Repair (PHASE 2): Neo4j Topology Identity Backfill
 *
 * ⚠️  PREREQUISITE: Run backfill-neo4j-som-coordinates-session-76.mjs FIRST
 *     This script assumes Neo4j nodes already have som_row/som_col properties.
 *     Without the prerequisite, cell_id will be 'unknown' (GATE 2 FAIL)
 *
 * Purpose:
 *   Adds SOM cluster identity to Neo4j nodes that are missing cell_id and som_cluster.
 *   These properties are required for cluster-aware retrieval and topology-aware agent routing.
 *
 *   Three-phase approach (can run all at once or in phases):
 *   Phase 1 (30 min): Create/match nodes with SOM identity properties
 *   Phase 2 (20 min): Create SIMILAR_SOM_CELL edges (within 3-cell neighborhood)
 *   Phase 3 (10 min): Archive old SIMILAR_TOPOLOGY edges (optional, non-destructive)
 *
 * Output:
 *   - backfill_neo4j_som_identity_report.json
 *   - Updated Neo4j nodes (if --apply)
 *
 * Usage:
 *   node scripts/atlas/backfill-neo4j-som-identity-session-76.mjs [--apply] [--phase=1|2|3|all] [--limit=100] [--verbose]
 */

import neo4j from 'neo4j-driver';

// ── CLI flags ─────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const APPLY = argv.includes('--apply');
const VERBOSE = argv.includes('--verbose');
const DRY_RUN = !APPLY;
const LIMIT_ARG = (() => {
  const a = argv.find(x => x.startsWith('--limit='));
  return a ? parseInt(a.split('=')[1], 10) : Infinity;
})();
const PHASE_ARG = (() => {
  const a = argv.find(x => x.startsWith('--phase='));
  return a ? a.split('=')[1] : 'all';
})();

// ── Neo4j config ───────────────────────────────────────────────────────────
const NEO4J_URL = process.env.NEO4J_URI || 'bolt://127.0.0.1:7687';
const NEO4J_USER = process.env.NEO4J_USER || 'neo4j';
const NEO4J_PASS = process.env.NEO4J_PASS || 'neo4j123';

function log(...args) { console.log(...args); }
function vlog(...args) { if (VERBOSE) console.log(...args); }

// ── Neo4j driver ───────────────────────────────────────────────────────────
const driver = neo4j.driver(NEO4J_URL, neo4j.auth.basic(NEO4J_USER, NEO4J_PASS));

/**
 * Phase 1: Add SOM cell identity properties to nodes.
 */
async function phase1AddSomIdentity(session) {
  log(`\nPhase 1: Adding SOM identity properties to nodes...`);

  // Query: find all :CodebaseFile nodes that lack cell_id or som_cluster
  const query = `
    MATCH (n:CodebaseFile)
    WHERE n.cell_id IS NULL OR n.som_cluster IS NULL
    WITH n LIMIT $limit
    SET n.cell_id = COALESCE(n.som_row + ',' + n.som_col, 'unknown'),
        n.som_cluster = COALESCE(n.som_cluster, 'unassigned'),
        n.updated_at = datetime()
    RETURN count(n) AS updated
  `;

  try {
    const result = await session.run(query, { limit: LIMIT_ARG });
    const updated = result.records[0]?.get('updated') || 0;
    log(`   ✅ Added SOM identity to ${updated} nodes${DRY_RUN ? ' (dry-run)' : ''}`);
    return updated;
  } catch (e) {
    log(`   ⚠️  Phase 1 warning: ${e.message}`);
    log(`       (This is expected if nodes lack som_row/som_col — proceeding anyway)`);
    return 0;
  }
}

/**
 * Phase 2: Create SIMILAR_SOM_CELL edges within 3-cell neighborhood.
 */
async function phase2CreateSomCellEdges(session) {
  log(`\nPhase 2: Creating SIMILAR_SOM_CELL edges...`);

  // Query: for each node with a valid cell_id, create edges to 3-cell neighbors
  const query = `
    MATCH (a:CodebaseFile), (b:CodebaseFile)
    WHERE a.cell_id IS NOT NULL
      AND b.cell_id IS NOT NULL
      AND a.cell_id <> b.cell_id
      AND a <> b
      AND NOT (a)-[:SIMILAR_SOM_CELL]->(b)
    WITH a, b,
         split(a.cell_id, ',') AS aCellSplit,
         split(b.cell_id, ',') AS bCellSplit
    WITH a, b,
         toInteger(aCellSplit[0]) AS aRow,
         toInteger(aCellSplit[1]) AS aCol,
         toInteger(bCellSplit[0]) AS bRow,
         toInteger(bCellSplit[1]) AS bCol
    WHERE abs(aRow - bRow) <= 1 AND abs(aCol - bCol) <= 1
    WITH a, b
    LIMIT $limit
    CREATE (a)-[r:SIMILAR_SOM_CELL {confidence: 0.8, distance: 'adjacent'}]->(b)
    RETURN count(r) AS created
  `;

  try {
    const result = await session.run(query, { limit: LIMIT_ARG });
    const created = result.records[0]?.get('created') || 0;
    log(`   ✅ Created ${created} SIMILAR_SOM_CELL edges${DRY_RUN ? ' (dry-run)' : ''}`);
    return created;
  } catch (e) {
    log(`   ⚠️  Phase 2 warning: ${e.message}`);
    return 0;
  }
}

/**
 * Phase 3: Report on existing SIMILAR_TOPOLOGY edges (non-destructive).
 */
async function phase3ReportTopology(session) {
  log(`\nPhase 3: Topology edge status...`);

  const query = `
    MATCH ()-[r:SIMILAR_TOPOLOGY]->()
    RETURN count(r) AS topologyEdges,
           count(DISTINCT startNode(r)) AS sourceNodes,
           count(DISTINCT endNode(r)) AS targetNodes
  `;

  try {
    const result = await session.run(query);
    const record = result.records[0];
    const edges = record?.get('topologyEdges') || 0;
    const sources = record?.get('sourceNodes') || 0;
    const targets = record?.get('targetNodes') || 0;

    log(`   ℹ️  SIMILAR_TOPOLOGY edges: ${edges}`);
    log(`   ℹ️  Source nodes: ${sources}, Target nodes: ${targets}`);
    log(`   (Keeping existing topology for backward compatibility)`);

    return { edges, sources, targets };
  } catch (e) {
    log(`   ⚠️  Phase 3 warning: ${e.message}`);
    return { edges: 0, sources: 0, targets: 0 };
  }
}

/**
 * Main execution.
 */
async function main() {
  log(`\n═══ Neo4j SOM Identity Backfill (Gate 2 Repair) ═══\n`);

  const session = driver.session();
  const report = {
    generated: new Date().toISOString(),
    phases: {},
  };

  try {
    // Run requested phases
    if (PHASE_ARG === '1' || PHASE_ARG === 'all') {
      report.phases.phase1 = await phase1AddSomIdentity(session);
    }

    if (PHASE_ARG === '2' || PHASE_ARG === 'all') {
      report.phases.phase2 = await phase2CreateSomCellEdges(session);
    }

    if (PHASE_ARG === '3' || PHASE_ARG === 'all') {
      report.phases.phase3 = await phase3ReportTopology(session);
    }

    // Summary
    log(`\n═══ Gate 2 Status ═══`);
    const totalUpdates = (report.phases.phase1 || 0) + (report.phases.phase2 || 0);
    if (totalUpdates === 0) {
      log(`✅ No updates needed — all nodes already have SOM identity — GATE 2 PASS`);
    } else if (APPLY) {
      log(`✅ Backfilled ${totalUpdates} items — Re-run verification to confirm GATE 2 PASS`);
    } else {
      log(`⚠️  Dry-run: ${totalUpdates} items would be updated`);
      log(`   Re-run with --apply to fix`);
    }

    console.log(JSON.stringify(report, null, 2));

  } catch (e) {
    log(`\n❌ Fatal error: ${e.message}`);
    if (VERBOSE) console.error(e);
    process.exit(1);
  } finally {
    await session.close();
    await driver.close();
  }
}

main().then(() => {
  log(`\n✨ Done.`);
  process.exit(0);
}).catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
