#!/usr/bin/env node
/**
 * write-packet-concept-edges.mjs
 *
 * Creates USED_CONCEPT edges in Neo4j from atlas_packets.concept_ids.
 * Matches Packet nodes by p.path = source_ref.
 * Creates Concept nodes (MERGE) if they don't exist.
 *
 * Usage:
 *   node scripts/atlas/write-packet-concept-edges.mjs          # dry-run
 *   node scripts/atlas/write-packet-concept-edges.mjs --apply
 *   node scripts/atlas/write-packet-concept-edges.mjs --apply --limit=1000
 */

import pg from 'pg';
import neo4j from 'neo4j-driver';

const { Pool } = pg;

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';
const NEO4J_URI      = process.env.NEO4J_URI      || 'bolt://127.0.0.1:7687';
const NEO4J_USER     = process.env.NEO4J_USER     || 'neo4j';
const NEO4J_PASSWORD = process.env.NEO4J_PASSWORD || 'neo4j123';

const APPLY      = process.argv.includes('--apply');
const LIMIT_ARG  = process.argv.find(a => a.startsWith('--limit='));
const MAX_ROWS   = LIMIT_ARG ? parseInt(LIMIT_ARG.split('=')[1], 10) : Infinity;
const BATCH_SIZE = 200;

// Noisy tokens to skip (path fragments, single chars, numbers)
const SKIP_TOKENS = new Set(['src', 'lib', 'server', 'routes', 'api', 'app', 'components',
  'utils', 'types', 'index', 'ts', 'js', 'mjs', 'svelte', 'json', 'md', 'txt', 'css']);

function isUsefulConcept(label) {
  if (!label || typeof label !== 'string') return false;
  const s = label.trim().toLowerCase();
  if (s.length < 3 || s.length > 80) return false;
  if (/^[0-9]+$/.test(s)) return false;
  if (SKIP_TOKENS.has(s)) return false;
  if (/^[a-z]$/.test(s)) return false;
  return true;
}

async function main() {
  const pool = new Pool({ connectionString: DATABASE_URL });

  // Load packets with concept_ids that have a source_ref
  const { rows } = await pool.query(`
    SELECT packet_key, source_ref, concept_ids
    FROM atlas_packets
    WHERE concept_ids IS NOT NULL
      AND cardinality(concept_ids) > 0
      AND source_ref IS NOT NULL
      AND source_ref != ''
    ORDER BY packet_key
    LIMIT $1
  `, [MAX_ROWS === Infinity ? 1_000_000 : MAX_ROWS]);

  await pool.end();

  // Build (source_ref, concept) pairs
  let pairs = [];
  let noisyDropped = 0;
  for (const row of rows) {
    for (const raw of (row.concept_ids ?? [])) {
      if (isUsefulConcept(raw)) {
        pairs.push({ source_ref: row.source_ref, concept: raw.trim().toLowerCase() });
      } else {
        noisyDropped++;
      }
    }
  }

  const uniqueConcepts = new Set(pairs.map(p => p.concept));
  console.log(`\n═══ Write Packet→Concept USED_CONCEPT Edges ${APPLY ? '(APPLY)' : '(dry-run)'} ═══`);
  console.log(`Packets with concept_ids: ${rows.length}`);
  console.log(`Edge pairs planned:       ${pairs.length}`);
  console.log(`Unique concepts:          ${uniqueConcepts.size}`);
  console.log(`Noisy tokens dropped:     ${noisyDropped}`);
  console.log(`Top 20 concepts:          ${[...uniqueConcepts].sort().slice(0, 20).join(', ')}`);

  if (!APPLY) {
    console.log('\n(dry-run — run with --apply to commit)');
    return;
  }

  // Connect to Neo4j
  const driver = neo4j.driver(NEO4J_URI, neo4j.auth.basic(NEO4J_USER, NEO4J_PASSWORD));
  await driver.verifyConnectivity();

  let edgesCreated = 0;
  let errors = 0;

  // Process in batches
  for (let i = 0; i < pairs.length; i += BATCH_SIZE) {
    const batch = pairs.slice(i, i + BATCH_SIZE);
    const session = driver.session({ defaultAccessMode: neo4j.session.WRITE });
    try {
      await session.executeWrite(async tx => {
        for (const { source_ref, concept } of batch) {
          // Strip common path prefixes to match Neo4j's relative path format
          const neoPath = source_ref
            .replace(/^sveltekit-frontend\//, '')
            .replace(/^deeds-web-app\/sveltekit-frontend\//, '');
          await tx.run(`
            MATCH (p:Packet {path: $path})
            MERGE (c:Concept {label: $label})
            ON CREATE SET c.created_at = datetime()
            MERGE (p)-[:USED_CONCEPT]->(c)
          `, { path: neoPath, label: concept });
          edgesCreated++;
        }
      });
    } catch (err) {
      errors++;
      console.error(`Batch ${i}-${i + BATCH_SIZE} error:`, err.message);
    } finally {
      await session.close();
    }

    if ((i / BATCH_SIZE) % 10 === 0) {
      process.stdout.write(`\r  Progress: ${Math.min(i + BATCH_SIZE, pairs.length)}/${pairs.length} pairs...`);
    }
  }

  await driver.close();

  console.log(`\n\nDone. Edges written: ${edgesCreated}, errors: ${errors}`);
  console.log(`Gate (≥10000): ${edgesCreated >= 10000 ? 'PASS ✅' : 'PARTIAL ⚠️ (need more concept_ids populated)'}`);
}

main().catch(err => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
