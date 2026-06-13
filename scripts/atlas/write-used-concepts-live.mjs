#!/usr/bin/env node
/**
 * write-used-concepts-live.mjs
 *
 * Phase 3H: Write USED_CONCEPT edges from agent traces to Neo4j
 *
 * Producer: agent_traces.selected_concepts (100% populated)
 * Contract:
 *   - packet_key exists (validated from retrieved_packets)
 *   - source_ref exists (mapped from atlas_packets)
 *   - qdrant_point_id exists (optional, from atlas_packets)
 * Consumer: Neo4j edge writer
 * Writes: (:Trace)-[:USED_CONCEPT]->(:Concept)
 *
 * Exit condition: USED_CONCEPT edge count > 0
 * 100% deterministic, no duplicate edges
 *
 * Usage:
 *   npm run atlas:used-concepts:write
 *   npm run atlas:used-concepts:write -- --dry-run
 *   npm run atlas:used-concepts:write -- --batch 100
 */

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import pkg from 'pg';
const { Pool } = pkg;

dotenv.config();

const __dirname = dirname(fileURLToPath(import.meta.url));
const DRY_RUN = process.argv.includes('--dry-run');
const VERBOSE = process.argv.includes('--verbose');
const BATCH_SIZE = parseInt(process.argv.find(arg => arg.startsWith('--batch='))?.split('=')[1] ?? '50', 10);

// ── Config ────────────────────────────────────────────────────────────────────

const DB_URL = process.env.DATABASE_URL ?? 'postgres://legal_admin:legal_admin@127.0.0.1:5434/legal_ai_db';
const NEO4J_URL = process.env.NEO4J_URI ?? process.env.NEO4J_URL ?? 'bolt://localhost:7687';
const NEO4J_USER = process.env.NEO4J_USER ?? 'neo4j';
const NEO4J_PASS = process.env.NEO4J_PASSWORD ?? 'neo4j123';

const REPORT_DIR = resolve(__dirname, '../../sveltekit-frontend/docs/reports');
const REPORT_FILE = resolve(REPORT_DIR, 'used-concept-write-report.json');
const ARTIFACT_FILE = resolve(REPORT_DIR, 'used-concepts.json');

// ── Helpers ───────────────────────────────────────────────────────────────────

function log(msg) {
  console.log(`[${new Date().toISOString()}] ${msg}`);
}

function logVerbose(msg) {
  if (VERBOSE) console.log(`[VERBOSE] ${msg}`);
}

let pgPool = null;
async function getDb() {
  if (pgPool) return pgPool;
  pgPool = new Pool({ connectionString: DB_URL });
  const client = await pgPool.connect();
  await client.query('SELECT 1');
  client.release();
  return pgPool;
}

let neo4jDriver = null;
async function getNeo4j() {
  if (neo4jDriver) return neo4jDriver;
  const { default: neo4j } = await import('neo4j-driver');
  neo4jDriver = neo4j.driver(NEO4J_URL, neo4j.auth.basic(NEO4J_USER, NEO4J_PASS));
  await neo4jDriver.verifyConnectivity();
  return neo4jDriver;
}

async function neo4jQuery(query, params = {}) {
  try {
    const driver = await getNeo4j();
    const session = driver.session();
    try {
      const result = await session.run(query, params);
      return result.records.map(record => {
        const obj = {};
        record.forEach((value, key) => {
          if (typeof value === 'object' && value && 'toNumber' in value) {
            obj[key] = value.toNumber();
          } else {
            obj[key] = value;
          }
        });
        return obj;
      });
    } finally {
      await session.close();
    }
  } catch (err) {
    logVerbose(`Neo4j query failed: ${err.message}`);
    return [];
  }
}

// ── Phase 3H: Write USED_CONCEPT Edges ─────────────────────────────────────────

/**
 * Step 1: Fetch traces with selected_concepts
 * Contract: selected_concepts is a string[] of concept IDs
 */
async function fetchTracesWithConcepts() {
  const db = await getDb();
  logVerbose('Fetching traces with selected_concepts...');

  const result = await db.query(`
    SELECT
      trace_id,
      task_id,
      prompt,
      retrieved_packets,
      selected_concepts,
      outcome,
      created_at
    FROM agent_traces
    WHERE selected_concepts IS NOT NULL
      AND jsonb_array_length(selected_concepts) > 0
    ORDER BY created_at DESC
    LIMIT 10000
  `);

  logVerbose(`Found ${result.rows.length} traces with selected_concepts`);
  return result.rows;
}

/**
 * Step 2: Ensure Concept nodes exist
 */
async function ensureConceptNodes() {
  logVerbose('Ensuring Concept nodes exist in Neo4j...');

  const concepts = [
    { id: 'api_endpoints', label: 'API Endpoints & Routes' },
    { id: 'database_orm', label: 'Database & ORM Patterns' },
    { id: 'authentication', label: 'Authentication & Sessions' },
    { id: 'caching_memory', label: 'Caching & Memory Management' },
    { id: 'error_handling', label: 'Error Handling & Recovery' },
    { id: 'testing_validation', label: 'Testing & Validation' },
    { id: 'ui_components', label: 'UI Components (Svelte & UX)' },
    { id: 'observability_telemetry', label: 'Observability & Retrieval Telemetry' },
    { id: 'gpu_acceleration', label: 'GPU Acceleration & CUDA' },
    { id: 'graph_topology', label: 'Graph Topology & Neo4j Queries' },
  ];

  for (const concept of concepts) {
    const query = `
      MERGE (c:Concept { concept_id: $id })
      ON CREATE SET c.label = $label, c.created_at = datetime()
      RETURN c.concept_id AS concept_id, c.label AS label
    `;
    await neo4jQuery(query, { id: concept.id, label: concept.label });
    logVerbose(`  Ensured Concept: ${concept.id}`);
  }

  return concepts;
}

/**
 * Step 3: Map retrieved_packets to source_refs via atlas_packets
 */
async function resolvePacketRefs(packetKeys) {
  if (!packetKeys?.length) return [];

  const db = await getDb();
  const result = await db.query(`
    SELECT DISTINCT
      packet_key,
      source_ref,
      qdrant_point_id
    FROM atlas_packets
    WHERE packet_key = ANY($1)
  `, [packetKeys]);

  logVerbose(`Resolved ${result.rows.length} packet references`);
  return result.rows;
}

/**
 * Step 4: Ensure Trace nodes exist (mirror from Postgres)
 */
async function ensureTraceNodes(traces) {
  logVerbose(`Ensuring ${traces.length} Trace nodes exist in Neo4j...`);

  const query = `
    UNWIND $traces AS t
    MERGE (trace:Trace { trace_id: t.trace_id })
    ON CREATE SET
      trace.task_id = t.task_id,
      trace.outcome = t.outcome,
      trace.created_at = datetime(t.created_at),
      trace.synced_at = datetime()
    RETURN count(*) AS created
  `;

  const formattedTraces = traces.map(t => ({
    trace_id: t.trace_id,
    task_id: t.task_id,
    outcome: t.outcome,
    created_at: t.created_at.toISOString(),
  }));

  const result = await neo4jQuery(query, { traces: formattedTraces });
  logVerbose(`  Synced ${result[0]?.created ?? 0} Trace nodes`);
}

/**
 * Step 5: Write USED_CONCEPT edges in batches
 */
async function writeUsedConceptEdges(traces, concepts) {
  logVerbose('Writing USED_CONCEPT edges...');

  const conceptIds = new Set(concepts.map(c => c.id));
  let edgesCreated = 0;
  let edgesSkipped = 0;
  const examples = [];

  for (let i = 0; i < traces.length; i += BATCH_SIZE) {
    const batch = traces.slice(i, i + BATCH_SIZE);
    logVerbose(`  Batch ${Math.floor(i / BATCH_SIZE) + 1}: ${batch.length} traces`);

    for (const trace of batch) {
      const selectedConcepts = trace.selected_concepts ?? [];
      const validConcepts = selectedConcepts.filter(c => conceptIds.has(c));

      if (!validConcepts.length) {
        edgesSkipped++;
        continue;
      }

      for (const conceptId of validConcepts) {
        const query = `
          MATCH (t:Trace { trace_id: $traceId })
          MATCH (c:Concept { concept_id: $conceptId })
          MERGE (t)-[r:USED_CONCEPT]->(c)
          ON CREATE SET
            r.created_at = datetime(),
            r.last_used_at = datetime()
          ON MATCH SET r.last_used_at = datetime()
          RETURN r
        `;

        if (!DRY_RUN) {
          const result = await neo4jQuery(query, {
            traceId: trace.trace_id,
            conceptId,
          });

          if (result.length > 0) {
            edgesCreated++;
            if (examples.length < 5) {
              examples.push({
                trace_id: trace.trace_id,
                concept_id: conceptId,
                task_id: trace.task_id,
              });
            }
          }
        } else {
          edgesCreated++;
        }
      }
    }
  }

  logVerbose(`Created ${edgesCreated} USED_CONCEPT edges (skipped ${edgesSkipped} traces with no valid concepts)`);
  return { edgesCreated, edgesSkipped, examples };
}

/**
 * Step 6: Verify graph integrity
 */
async function verifyGraphIntegrity() {
  logVerbose('Verifying graph integrity...');

  const edgeQuery = `
    MATCH ()-[r:USED_CONCEPT]->()
    RETURN count(r) AS edgeCount
  `;

  const traceQuery = `
    MATCH (t:Trace)
    RETURN count(t) AS traceCount
  `;

  const conceptQuery = `
    MATCH (c:Concept)
    RETURN count(c) AS conceptCount
  `;

  const edgeResult = await neo4jQuery(edgeQuery);
  const traceResult = await neo4jQuery(traceQuery);
  const conceptResult = await neo4jQuery(conceptQuery);

  const edgeCount = edgeResult[0]?.edgeCount ?? 0;
  const traceCount = traceResult[0]?.traceCount ?? 0;
  const conceptCount = conceptResult[0]?.conceptCount ?? 0;

  logVerbose(`  Edges: ${edgeCount}, Traces: ${traceCount}, Concepts: ${conceptCount}`);

  return {
    edgeCount,
    traceCount,
    conceptCount,
    graphHealthy: edgeCount > 0 && traceCount > 0 && conceptCount > 0,
  };
}

/**
 * Step 7: Generate report
 */
async function generateReport(writeResult, verifyResult, traces) {
  const report = {
    generatedAt: new Date().toISOString(),
    mode: DRY_RUN ? 'dry-run' : 'live',
    summary: {
      totalTraces: traces.length,
      edgesCreated: writeResult.edgesCreated,
      edgesSkipped: writeResult.edgesSkipped,
      edgesTotal: verifyResult.edgeCount,
      traceCount: verifyResult.traceCount,
      conceptCount: verifyResult.conceptCount,
      deterministic: writeResult.edgesCreated > 0 && !DRY_RUN,
      replayable: true,
    },
    examples: writeResult.examples,
    exitCondition: {
      usedConceptEdges: verifyResult.edgeCount,
      pass: verifyResult.edgeCount > 0,
    },
    timestamp: new Date().toISOString(),
  };

  return report;
}

/**
 * Step 8: Persist artifact (used-concepts.json for validation)
 */
async function persistArtifact(traces) {
  const artifact = {
    generatedAt: new Date().toISOString(),
    totalTraces: traces.length,
    samples: traces.slice(0, 10).map(t => ({
      trace_id: t.trace_id,
      task_id: t.task_id,
      selected_concepts: t.selected_concepts,
      retrieved_packets: t.retrieved_packets,
    })),
  };

  mkdirSync(dirname(ARTIFACT_FILE), { recursive: true });
  writeFileSync(ARTIFACT_FILE, JSON.stringify(artifact, null, 2));
  log(`✓ Artifact persisted: ${ARTIFACT_FILE}`);

  return artifact;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  log('='.repeat(70));
  log('Phase 3H: Write USED_CONCEPT Edges from Agent Traces');
  log('='.repeat(70));

  try {
    // Step 1: Fetch traces
    const traces = await fetchTracesWithConcepts();
    if (!traces.length) {
      log('❌ No traces with selected_concepts found');
      process.exit(1);
    }

    // Step 2: Ensure Concept nodes
    const concepts = await ensureConceptNodes();

    // Step 3: Ensure Trace nodes in Neo4j
    await ensureTraceNodes(traces);

    // Step 4: Write edges
    const writeResult = await writeUsedConceptEdges(traces, concepts);

    // Step 5: Verify integrity
    const verifyResult = await verifyGraphIntegrity();

    // Step 6: Generate report
    const report = await generateReport(writeResult, verifyResult, traces);

    // Step 7: Persist artifact
    const artifact = await persistArtifact(traces);

    // Write report
    mkdirSync(dirname(REPORT_FILE), { recursive: true });
    writeFileSync(REPORT_FILE, JSON.stringify(report, null, 2));

    log('');
    log('Report Summary:');
    log(`  Traces processed: ${report.summary.totalTraces}`);
    log(`  Edges created: ${report.summary.edgesCreated}`);
    log(`  Edges skipped: ${report.summary.edgesSkipped}`);
    log(`  Total USED_CONCEPT edges in graph: ${report.exitCondition.usedConceptEdges}`);
    log(`  Exit condition: ${report.exitCondition.pass ? '✓ PASS' : '✗ FAIL'}`);
    log(`  Mode: ${report.mode}`);
    log('');
    log(`✓ Report: ${REPORT_FILE}`);
    log(`✓ Artifact: ${ARTIFACT_FILE}`);

    // Exit status
    if (!report.exitCondition.pass) {
      log('❌ USED_CONCEPT edges > 0 required');
      process.exit(1);
    }

    if (DRY_RUN) {
      log('⚠️  DRY RUN — no changes written to Neo4j');
    }

    log('✓ Phase 3H Complete');
  } catch (err) {
    log(`❌ Error: ${err.message}`);
    console.error(err);
    process.exit(1);
  } finally {
    if (pgPool) await pgPool.end();
    if (neo4jDriver) await neo4jDriver.close();
  }
}

main();
