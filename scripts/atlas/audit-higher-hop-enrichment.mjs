#!/usr/bin/env node
/**
 * audit-higher-hop-enrichment.mjs
 *
 * Producer script for Lane 1B: Higher-Hop Enrichment
 *
 * Measures supernode pressure by querying Neo4j for existing USED_CONCEPT edges
 * per concept node. Classifies concepts as "safe" (<500 edges) or "deferred" (≥500).
 *
 * This audit informs the classifier and seeding strategy to avoid overwhelming
 * the graph with unbound edge proliferation.
 *
 * Usage:
 *   node scripts/atlas/audit-higher-hop-enrichment.mjs
 *   node scripts/atlas/audit-higher-hop-enrichment.mjs --verbose
 *   node scripts/atlas/audit-higher-hop-enrichment.mjs --save
 *
 * Output:
 *   docs/reports/higher-hop-enrichment-pressure-audit.json
 *
 * Exit code: 0 (success), 1 (error)
 */

import neo4j from 'neo4j-driver';
import pg from 'pg';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const { Pool } = pg;
const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dir, '../..');

// Configuration
const NEO4J_URI = process.env.NEO4J_URI || 'bolt://127.0.0.1:7687';
const NEO4J_USER = process.env.NEO4J_USER || 'neo4j';
const NEO4J_PASSWORD = process.env.NEO4J_PASSWORD || 'neo4j123';
const DATABASE_URL =
  process.env.DATABASE_URL || 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';

const VERBOSE = process.argv.includes('--verbose');
const SAVE = process.argv.includes('--save');
const PRESSURE_THRESHOLD_SAFE = 500; // Concepts with <500 edges = safe to seed
const PRESSURE_THRESHOLD_DEFERRED = 500; // Concepts with ≥500 edges = deferred

// ── Main ──────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n═══ Audit Higher-Hop Enrichment (Lane 1B) ═══\n');

  const driver = neo4j.driver(NEO4J_URI, neo4j.auth.basic(NEO4J_USER, NEO4J_PASSWORD));
  const pgPool = new Pool({ connectionString: DATABASE_URL });

  try {
    // Step 1: Load canonical concept list from Postgres
    const { rows: conceptRows } = await pgPool.query(`
      SELECT DISTINCT concept_id, concept_name
      FROM concepts
      WHERE concept_id IS NOT NULL
      ORDER BY concept_id
    `);

    if (conceptRows.length === 0) {
      console.error('❌ No concepts found in Postgres. Aborting.');
      process.exit(1);
    }

    console.log(`✓ Loaded ${conceptRows.length} concepts from Postgres`);

    // Step 2: For each concept, count existing USED_CONCEPT edges in Neo4j
    const conceptPressure = [];
    let totalEdgesInGraph = 0;

    for (const { concept_id, concept_name } of conceptRows) {
      const session = driver.session();
      try {
        const result = await session.run(
          `
          MATCH (c:Concept {concept_id: $conceptId})
          OPTIONAL MATCH (c)<-[r:USED_CONCEPT]-()
          RETURN count(r) AS edge_count
          `,
          { conceptId: concept_id }
        );

        const edgeCount = result.records[0]?.get('edge_count') || 0;
        totalEdgesInGraph += edgeCount;

        const pressure = edgeCount >= PRESSURE_THRESHOLD_DEFERRED ? 'deferred' : 'safe';

        conceptPressure.push({
          concept_id,
          concept_name,
          edge_count: edgeCount,
          pressure,
          safe_to_seed: pressure === 'safe'
        });

        if (VERBOSE) {
          console.log(`  ${concept_id.padEnd(30)} edges=${edgeCount} pressure=${pressure}`);
        }
      } finally {
        await session.close();
      }
    }

    // Step 3: Load traces from Postgres to understand source volume
    const { rows: traceRows } = await pgPool.query(`
      SELECT COUNT(*) AS trace_count,
             COUNT(DISTINCT jsonb_array_elements(selected_concepts)->>'concept_id')
               AS unique_concepts_in_traces
      FROM agent_traces
      WHERE selected_concepts IS NOT NULL
        AND jsonb_array_length(selected_concepts) > 0
    `);

    const traceCount = traceRows[0]?.trace_count || 0;
    const uniqueConceptsInTraces = traceRows[0]?.unique_concepts_in_traces || 0;

    // Step 4: Build report
    const safeCount = conceptPressure.filter(c => c.pressure === 'safe').length;
    const deferredCount = conceptPressure.filter(c => c.pressure === 'deferred').length;

    const report = {
      generated_at: new Date().toISOString(),
      pressure_threshold_safe: PRESSURE_THRESHOLD_SAFE,
      pressure_threshold_deferred: PRESSURE_THRESHOLD_DEFERRED,
      concept_inventory: {
        total_concepts: conceptRows.length,
        safe_concepts: safeCount,
        deferred_concepts: deferredCount
      },
      current_graph_state: {
        total_edges_in_graph: totalEdgesInGraph,
        avg_edges_per_concept: conceptRows.length > 0
          ? Math.round(totalEdgesInGraph / conceptRows.length)
          : 0
      },
      trace_inventory: {
        total_traces: Number(traceCount),
        unique_concepts_in_traces: Number(uniqueConceptsInTraces),
        avg_concepts_per_trace: traceCount > 0 ? (uniqueConceptsInTraces / traceCount).toFixed(2) : 0
      },
      concepts: conceptPressure.sort((a, b) => b.edge_count - a.edge_count),
      gates: {
        concepts_classified: conceptPressure.length > 0 ? 'PASS' : 'FAIL',
        safe_concepts_available: safeCount > 0 ? 'PASS' : 'DEFER',
        trace_inventory_available: traceCount > 0 ? 'PASS' : 'FAIL'
      }
    };

    // Step 5: Output and save
    console.log(`\n✓ Concept Pressure Analysis`);
    console.log(`  Safe concepts:     ${safeCount}/${conceptRows.length}`);
    console.log(`  Deferred concepts: ${deferredCount}/${conceptRows.length}`);
    console.log(`  Total edges in graph: ${totalEdgesInGraph}`);
    console.log(`  Avg edges/concept: ${report.current_graph_state.avg_edges_per_concept}`);

    console.log(`\n✓ Trace Inventory`);
    console.log(`  Total traces:      ${traceCount}`);
    console.log(`  Unique concepts:   ${uniqueConceptsInTraces}`);
    console.log(`  Avg concepts/trace: ${report.trace_inventory.avg_concepts_per_trace}`);

    if (SAVE) {
      const reportDir = join(ROOT, 'docs', 'reports');
      mkdirSync(reportDir, { recursive: true });
      const reportPath = join(reportDir, 'higher-hop-enrichment-pressure-audit.json');
      writeFileSync(reportPath, JSON.stringify(report, null, 2));
      console.log(`\n✓ Report saved: ${reportPath}`);
    }

    console.log(`\n✓ Audit complete. Safe to seed from ${safeCount} concepts.\n`);

    process.exit(0);
  } catch (err) {
    console.error(`\n❌ Error: ${err.message}`);
    if (VERBOSE) console.error(err.stack);
    process.exit(1);
  } finally {
    await pgPool.end();
    await driver.close();
  }
}

main();
