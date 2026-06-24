#!/usr/bin/env node
/**
 * backfill-neo4j-som-coordinates-session-76.mjs
 *
 * PREREQUISITE for Gate 2 repair (must run BEFORE backfill-neo4j-som-identity)
 *
 * Purpose:
 *   Enriches Neo4j :CodebaseFile nodes with som_row and som_col coordinates
 *   from Postgres atlas_packets via source_ref join.
 *
 *   Without this step, Gate 2 repair cannot derive cell_id (it would get 'unknown').
 *
 * Output:
 *   - Neo4j nodes enriched with som_row, som_col properties
 *   - backfill_neo4j_som_coordinates_report.json
 *
 * Usage:
 *   node scripts/atlas/backfill-neo4j-som-coordinates-session-76.mjs [--apply] [--limit=100] [--verbose]
 */

import pg from 'pg';
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

// ── Config ─────────────────────────────────────────────────────────────────
const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';
const NEO4J_URL = process.env.NEO4J_URI || 'bolt://127.0.0.1:7687';
const NEO4J_USER = process.env.NEO4J_USER || 'neo4j';
const NEO4J_PASS = process.env.NEO4J_PASS || 'neo4j123';

function log(...args) { console.log(...args); }
function vlog(...args) { if (VERBOSE) console.log(...args); }

// ── Postgres pool ──────────────────────────────────────────────────────────
const pgPool = new pg.Pool({ connectionString: DATABASE_URL, max: 5 });

async function pgQuery(sql, params = []) {
  const { rows } = await pgPool.query(sql, params);
  return rows;
}

// ── Neo4j driver ───────────────────────────────────────────────────────────
const neo4jDriver = neo4j.driver(NEO4J_URL, neo4j.auth.basic(NEO4J_USER, NEO4J_PASS));

/**
 * Main execution.
 */
async function main() {
  log(`\n═══ Neo4j SOM Coordinates Backfill (Gate 2 Prerequisite) ═══\n`);

  const session = neo4jDriver.session();
  let processedCount = 0;
  let enrichedCount = 0;
  const report = {
    generated: new Date().toISOString(),
    prerequisite: true,
    dryRun: DRY_RUN,
    summary: {},
  };

  try {
    // Step 1: Fetch packets with SOM coordinates from Postgres
    log(`1. Fetching SOM coordinates from Postgres (atlas_packets)...`);

    const packets = await pgQuery(`
      SELECT source_ref, som_row, som_col
      FROM atlas_packets
      WHERE som_row IS NOT NULL AND som_col IS NOT NULL
      ORDER BY source_ref
      LIMIT $1
    `, [LIMIT_ARG === Infinity ? 20000 : LIMIT_ARG]);

    log(`   ✅ Fetched ${packets.length} packets with som_row/som_col`);

    // Step 2: Upsert SOM coordinates into Neo4j nodes
    log(`\n2. Enriching Neo4j nodes with SOM coordinates...`);

    const BATCH_SIZE = 100;
    for (let i = 0; i < packets.length; i += BATCH_SIZE) {
      const batch = packets.slice(i, i + BATCH_SIZE);

      // Build parameterized query with separate CASE clauses for row and col
      const params = {};
      const rowCases = [];
      const colCases = [];

      for (let j = 0; j < batch.length; j++) {
        const { source_ref, som_row, som_col } = batch[j];
        params[`ref_${j}`] = source_ref;
        params[`row_${j}`] = som_row;
        params[`col_${j}`] = som_col;

        rowCases.push(`WHEN $ref_${j} THEN $row_${j}`);
        colCases.push(`WHEN $ref_${j} THEN $col_${j}`);
      }

      const query = `
        MATCH (n:CodebaseFile)
        WHERE n.sourceRef IN [${batch.map((_, j) => `$ref_${j}`).join(', ')}]
        WITH n, n.sourceRef AS src
        SET n.som_row = CASE src
          ${rowCases.join(' ')}
          ELSE n.som_row
        END,
        n.som_col = CASE src
          ${colCases.join(' ')}
          ELSE n.som_col
        END,
        n.updatedAt = datetime()
        RETURN count(n) AS updated
      `;

      try {
        const result = await session.run(query, params);
        const updated = result.records[0]?.get('updated')?.low || 0;
        enrichedCount += updated;
        processedCount += batch.length;

        if ((i + batch.length) % 200 === 0) {
          process.stdout.write(`\r   ${Math.min(i + BATCH_SIZE, packets.length)}/${packets.length} processed`);
        }
      } catch (e) {
        log(`\n   ⚠️  Batch update failed: ${e.message}`);
        vlog(`      Trying single-query fallback...`);

        // Fallback: update nodes one at a time
        for (const { source_ref, som_row, som_col } of batch) {
          try {
            const singleQuery = `
              MATCH (n:CodebaseFile { sourceRef: $source_ref })
              SET n.som_row = $som_row, n.som_col = $som_col, n.updatedAt = datetime()
              RETURN count(n) AS updated
            `;

            const singleResult = await session.run(singleQuery, { source_ref, som_row, som_col });
            if ((singleResult.records[0]?.get('updated')?.low || 0) > 0) {
              enrichedCount++;
            }
          } catch (innerE) {
            vlog(`      ❌ ${source_ref}: ${innerE.message}`);
          }
        }
      }
    }

    process.stdout.write('\n');
    log(`\n   ✅ Enriched ${enrichedCount} nodes with SOM coordinates${DRY_RUN ? ' (dry-run)' : ''}`);

    // Step 3: Verify enrichment
    log(`\n3. Verifying SOM coordinate coverage...`);

    const verifyQuery = `
      MATCH (n:CodebaseFile)
      RETURN
        count(n) AS total_nodes,
        count(CASE WHEN n.som_row IS NOT NULL THEN 1 END) AS with_som_row,
        count(CASE WHEN n.som_col IS NOT NULL THEN 1 END) AS with_som_col
    `;

    const verifyResult = await session.run(verifyQuery);
    const record = verifyResult.records[0];
    const totalNodes = record.get('total_nodes')?.low || 0;
    const withRow = record.get('with_som_row')?.low || 0;
    const withCol = record.get('with_som_col')?.low || 0;

    log(`   ✅ Total nodes: ${totalNodes}`);
    log(`   ✅ With som_row: ${withRow} (${(withRow/totalNodes*100).toFixed(2)}%)`);
    log(`   ✅ With som_col: ${withCol} (${(withCol/totalNodes*100).toFixed(2)}%)`);

    report.summary = {
      packets_processed: processedCount,
      nodes_enriched: enrichedCount,
      total_nodes: totalNodes,
      with_som_row: withRow,
      with_som_col: withCol,
      coverage_pct: (withRow / totalNodes * 100).toFixed(2),
    };

    log(`\n═══ Gate 2 Prerequisite Status ═══`);
    if (withRow === totalNodes && withCol === totalNodes) {
      log(`✅ READY FOR GATE 2 REPAIR — All nodes have som_row/som_col`);
      log(`   Next: npm run atlas:gate:repair:neo4j:apply`);
    } else {
      log(`⚠️  INCOMPLETE — ${totalNodes - withRow} nodes missing SOM coordinates`);
      log(`   Re-run with --apply to populate more nodes`);
    }

  } catch (e) {
    log(`\n❌ Fatal error: ${e.message}`);
    if (VERBOSE) console.error(e);
    process.exit(1);
  } finally {
    await session.close();
    await pgPool.end();
    await neo4jDriver.close();
  }

  console.log(JSON.stringify(report, null, 2));
}

main().then(() => {
  log(`\n✨ Done.`);
  process.exit(0);
}).catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
