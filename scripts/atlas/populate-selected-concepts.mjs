#!/usr/bin/env node
/**
 * populate-selected-concepts.mjs
 *
 * Pipeline:
 * 1. Read agent_traces from Postgres
 * 2. Sync selected_concepts from retrieved_packets if missing
 * 3. Seed Trace nodes and USED_CONCEPT relationships in Neo4j
 *
 * Usage:
 *   node scripts/atlas/populate-selected-concepts.mjs --dry-run
 *   node scripts/atlas/populate-selected-concepts.mjs --apply
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import neo4j from 'neo4j-driver';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const ROOT  = path.resolve(__dir, '../..');
const APPLY = process.argv.includes('--apply');

function loadEnv() {
  for (const p of [
    path.join(ROOT, 'sveltekit-frontend', '.env'),
    path.join(ROOT, '.env'),
  ]) {
    if (!fs.existsSync(p)) continue;
    for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
      const m = line.trimEnd().match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
    break;
  }
}
loadEnv();

const DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';

const NEO4J_URI  = process.env.NEO4J_URI || process.env.NEO4J_URL || 'bolt://127.0.0.1:7687';
const NEO4J_USER = process.env.NEO4J_USER || 'neo4j';
const NEO4J_PASS = process.env.NEO4J_PASSWORD || process.env.NEO4J_PASS || 'neo4j123';

async function main() {
  console.log('══ Populate Selected Concepts (Trace Seeding) ════════════════');
  console.log(`  Mode: ${APPLY ? 'APPLY' : 'DRY-RUN'}`);
  console.log(`  Neo4j: ${NEO4J_URI}`);

  const pool = new pg.Pool({ connectionString: DATABASE_URL, max: 3 });
  const driver = neo4j.driver(NEO4J_URI, neo4j.auth.basic(NEO4J_USER, NEO4J_PASS));
  const session = driver.session({ database: 'neo4j' });

  try {
    // 1. Fetch traces from Postgres
    const { rows: traces } = await pool.query(`
      SELECT trace_id, task_id, prompt, retrieved_packets, selected_concepts, outcome, score
      FROM agent_traces
      ORDER BY created_at ASC
    `);

    console.log(`\n  Loaded ${traces.length} traces from Postgres.`);

    let traceCount = 0;
    let edgeCount = 0;

    for (const trace of traces) {
      const traceId = trace.trace_id;
      const taskId = trace.task_id;
      const prompt = trace.prompt;
      const outcome = trace.outcome;
      const score = parseFloat(trace.score) || 1.0;
      
      // Determine selected concepts
      let concepts = Array.isArray(trace.selected_concepts) ? trace.selected_concepts : [];
      
      // If empty, derive from retrieved_packets
      if (concepts.length === 0 && Array.isArray(trace.retrieved_packets)) {
        const derived = [];
        for (const p of trace.retrieved_packets) {
          if (typeof p === 'string') {
            if (p.startsWith('concept:')) {
              derived.push(p.replace(/^concept:/, ''));
            } else if (p.startsWith('packet:')) {
              // Extract potential concept name from packet name (e.g. packet:agent_intelligence:13 -> agent_intelligence)
              const parts = p.split(':');
              if (parts.length >= 2) {
                derived.push(parts[1]);
              }
            }
          }
        }
        concepts = [...new Set(derived)];
        
        if (concepts.length > 0 && APPLY) {
          await pool.query(
            'UPDATE agent_traces SET selected_concepts = $1::jsonb WHERE trace_id = $2',
            [JSON.stringify(concepts), traceId]
          );
        }
      }

      if (concepts.length === 0) continue;

      traceCount++;

      if (APPLY) {
        // Write to Neo4j
        // A. Merge Trace node
        await session.run(`
          MERGE (t:Trace { id: $traceId })
          ON CREATE SET t.taskId = $taskId, t.prompt = $prompt, t.outcome = $outcome, t.score = $score
          ON MATCH SET t.outcome = $outcome, t.score = $score
        `, { traceId, taskId, prompt, outcome, score });

        // B. Merge Concept nodes and create USED_CONCEPT relationships
        for (const conceptId of concepts) {
          await session.run(`
            MERGE (c:Concept { id: $conceptId })
            WITH c
            MATCH (t:Trace { id: $traceId })
            MERGE (t)-[r:USED_CONCEPT]->(c)
            ON CREATE SET r.weight = $score
            ON MATCH SET r.weight = $score
          `, { traceId, conceptId, score });
          edgeCount++;
        }
      } else {
        edgeCount += concepts.length;
      }

      if (traceCount % 100 === 0) {
        process.stdout.write(`\r  Processed: ${traceCount}/${traces.length} traces`);
      }
    }

    console.log(`\r  Processed: ${traceCount}/${traces.length} traces successfully.`);
    console.log(`  Trace nodes: ${APPLY ? 'Synced' : 'Dry-run preview'} (${traceCount})`);
    console.log(`  USED_CONCEPT edges: ${APPLY ? 'Created' : 'Dry-run preview'} (${edgeCount})`);

    // Verification check in Neo4j
    const verifyResult = await session.run(`
      MATCH ()-[r:USED_CONCEPT]->() RETURN count(r) as usedConceptEdges
    `);
    const verifiedCount = verifyResult.records[0]?.get('usedConceptEdges')?.toNumber() ?? 0;
    console.log(`\n  Neo4j verified USED_CONCEPT edges in DB: ${verifiedCount}`);

  } catch (err) {
    console.error('Error during selected concepts population:', err);
  } finally {
    await session.close();
    await driver.close();
    await pool.end();
    console.log('\n  Done.\n');
  }
}

main().catch(err => { console.error(err); process.exit(1); });
