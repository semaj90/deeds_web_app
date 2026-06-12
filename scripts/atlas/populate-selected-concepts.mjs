#!/usr/bin/env node
/**
 * populate-selected-concepts.mjs
 *
 * Pipeline:
 * 1. Read agent_traces from Postgres.
 * 2. Extract and sync selected_concepts from retrieved_packets in Postgres.
 * 3. Seed Trace nodes and USED_CONCEPT relationships in Neo4j.
 * 4. Build a canonical mapping from concept_id to source_refs using concept_records, card registry, & parent_atlas_records.
 * 5. Backfill the concept_ids column in the atlas_packets table based on source_ref and feature_id matches.
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

function canonicalPath(input) {
  if (!input || typeof input !== 'string') return '';
  let s = input
    .replace(/\\/g, '/')
    .replace(/^file:\/+/i, '')
    .replace(/^\/?c:\//i, '')
    .replace(/^Users\/james\/Videos\/deeds-web-app\//i, '')
    .replace(/^deeds-web-app\//i, '')
    .replace(/^\.?\//, '')
    .toLowerCase();
  
  if (s.startsWith('src/')) {
    s = 'sveltekit-frontend/' + s;
  }
  return s;
}

async function main() {
  console.log('══ Populate Selected Concepts & Backfill Packets ════════════════');
  console.log(`  Mode: ${APPLY ? 'APPLY' : 'DRY-RUN'}`);
  console.log(`  Database: ${DATABASE_URL.replace(/:[^:@/]+@/, ':****@')}`);
  console.log(`  Neo4j: ${NEO4J_URI}`);

  const pool = new pg.Pool({ connectionString: DATABASE_URL, max: 3 });
  const driver = neo4j.driver(NEO4J_URI, neo4j.auth.basic(NEO4J_USER, NEO4J_PASS));
  const session = driver.session({ database: 'neo4j' });

  try {
    // ----------------------------------------------------
    // Step 1: Trace Concepts Sync & Neo4j USED_CONCEPT Seeding
    // ----------------------------------------------------
    console.log('\n--- Step 1: Seeding Neo4j USED_CONCEPT edges from traces ---');
    const { rows: traces } = await pool.query(`
      SELECT trace_id, task_id, prompt, retrieved_packets, selected_concepts, outcome, score
      FROM agent_traces
      ORDER BY created_at ASC
    `);

    console.log(`  Loaded ${traces.length} traces from Postgres.`);

    let traceCount = 0;
    let edgeCount = 0;
    const activeConceptNames = new Set();

    for (const trace of traces) {
      const traceId = trace.trace_id;
      const taskId = trace.task_id;
      const prompt = trace.prompt;
      const outcome = trace.outcome;
      const score = parseFloat(trace.score) || 1.0;
      
      let concepts = Array.isArray(trace.selected_concepts) ? trace.selected_concepts : [];
      
      // Derive from retrieved_packets if selected_concepts is empty
      if (concepts.length === 0 && Array.isArray(trace.retrieved_packets)) {
        const derived = [];
        for (const p of trace.retrieved_packets) {
          if (typeof p === 'string') {
            if (p.startsWith('concept:')) {
              derived.push(p.replace(/^concept:/, ''));
            } else if (p.startsWith('packet:')) {
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

      for (const c of concepts) {
        activeConceptNames.add(c);
      }

      if (concepts.length === 0) continue;

      traceCount++;

      if (APPLY) {
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
    }

    console.log(`  Trace nodes: ${APPLY ? 'Synced' : 'Dry-run preview'} (${traceCount})`);
    console.log(`  USED_CONCEPT edges: ${APPLY ? 'Created' : 'Dry-run preview'} (${edgeCount})`);
    console.log(`  Unique concepts extracted from traces: ${activeConceptNames.size} (${[...activeConceptNames].join(', ')})`);

    if (APPLY) {
      const verifyResult = await session.run(`
        MATCH ()-[r:USED_CONCEPT]->() RETURN count(r) as usedConceptEdges
      `);
      const verifiedCount = verifyResult.records[0]?.get('usedConceptEdges')?.toNumber() ?? 0;
      console.log(`  Neo4j verified USED_CONCEPT edges in DB: ${verifiedCount}`);
    }

    // ----------------------------------------------------
    // Step 2: Build concept-to-file mapping
    // ----------------------------------------------------
    console.log('\n--- Step 2: Building concept-to-file mapping ---');
    
    // Load card IDs to source_refs mapping from neschrom97-card-registry.json
    const cardIdToSourceRef = new Map();
    const registryPath = path.join(ROOT, 'docs/reports/neschrom97-card-registry.json');
    if (fs.existsSync(registryPath)) {
      try {
        console.log(`  Loading card registry from ${registryPath}...`);
        const registryData = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
        const mappings = registryData.mappings || [];
        for (const item of mappings) {
          if (item.card_id && item.source_ref) {
            cardIdToSourceRef.set(item.card_id, item.source_ref);
          }
        }
        console.log(`  Loaded ${cardIdToSourceRef.size} card path references from registry.`);
      } catch (e) {
        console.warn('  Failed to load card registry:', e.message);
      }
    }

    if (cardIdToSourceRef.size === 0) {
      // Fallback to parent records if registry load failed
      const { rows: parentRecords } = await pool.query(`
        SELECT id, source_ref, payload
        FROM parent_atlas_records
        WHERE (source_ref IS NOT NULL AND source_ref != '') OR (payload->>'source_ref' IS NOT NULL)
      `);
      for (const r of parentRecords) {
        let ref = r.source_ref || r.payload?.source_ref || '';
        if (ref) {
          cardIdToSourceRef.set(r.id, ref);
        }
      }
      console.log(`  Loaded ${cardIdToSourceRef.size} parent record path references (fallback).`);
    }

    // Fetch all concepts
    const { rows: conceptRecs } = await pool.query(`
      SELECT concept_id, evidence_cards, feature_ids FROM concept_records
    `);

    // Map: canonicalPath -> Set of concept_ids
    const pathToConcepts = new Map();
    // Map: featureId -> Set of concept_ids
    const featureToConcepts = new Map();

    for (const crec of conceptRecs) {
      const cid = crec.concept_id;
      
      // A. Map via evidence cards (source files)
      const cards = Array.isArray(crec.evidence_cards) ? crec.evidence_cards : [];
      for (const cardId of cards) {
        const rawPath = cardIdToSourceRef.get(cardId);
        if (rawPath) {
          const canon = canonicalPath(rawPath);
          if (!pathToConcepts.has(canon)) {
            pathToConcepts.set(canon, new Set());
          }
          pathToConcepts.get(canon).add(cid);
        }
      }

      // B. Map via feature IDs
      const fids = Array.isArray(crec.feature_ids) ? crec.feature_ids : [];
      for (const fid of fids) {
        if (fid) {
          if (!featureToConcepts.has(fid)) {
            featureToConcepts.set(fid, new Set());
          }
          featureToConcepts.get(fid).add(cid);
        }
      }
    }

    console.log(`  Mapped ${pathToConcepts.size} paths and ${featureToConcepts.size} features to concepts.`);

    // ----------------------------------------------------
    // Step 3: Backfill atlas_packets concept_ids
    // ----------------------------------------------------
    console.log('\n--- Step 3: Backfilling concept_ids in atlas_packets ---');
    
    const { rows: packets } = await pool.query(`
      SELECT packet_id, source_ref, feature_id, concept_ids FROM atlas_packets
    `);

    console.log(`  Scanning ${packets.length} packets in atlas_packets...`);

    let updatedCount = 0;
    
    for (const pkt of packets) {
      const pid = pkt.packet_id;
      const rawRef = pkt.source_ref;
      const fid = pkt.feature_id;
      
      const pktConcepts = new Set();
      
      // 1. Check path matches
      if (rawRef) {
        const canon = canonicalPath(rawRef);
        const matched = pathToConcepts.get(canon);
        if (matched) {
          for (const c of matched) pktConcepts.add(c);
        }
      }

      // 2. Check feature matches
      if (fid) {
        const matched = featureToConcepts.get(fid);
        if (matched) {
          for (const c of matched) pktConcepts.add(c);
        }
      }

      // If we found concepts, update the row if it changed
      if (pktConcepts.size > 0) {
        const conceptIdsArray = [...pktConcepts].sort();
        const existing = Array.isArray(pkt.concept_ids) ? pkt.concept_ids.sort() : [];
        
        const changed = JSON.stringify(conceptIdsArray) !== JSON.stringify(existing);
        
        if (changed) {
          updatedCount++;
          if (APPLY) {
            await pool.query(
              'UPDATE atlas_packets SET concept_ids = $1::text[] WHERE packet_id = $2',
              [conceptIdsArray, pid]
            );
          }
        }
      }
    }

    console.log(`  Packets requiring backfill/update: ${updatedCount}`);
    if (APPLY) {
      console.log(`  Successfully updated ${updatedCount} packets.`);
    } else {
      console.log('  Dry-run: no packets updated in database.');
    }

  } catch (err) {
    console.error('Error during selected concepts population:', err);
  } finally {
    await session.close();
    await driver.close();
    await pool.end();
    console.log('\n══ Process Finished ════════════════════════════════\n');
  }
}

main().catch(err => { console.error(err); process.exit(1); });
