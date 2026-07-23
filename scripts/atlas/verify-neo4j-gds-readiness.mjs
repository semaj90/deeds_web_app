#!/usr/bin/env node
/**
 * Smoke test 4: Neo4j GDS readiness
 *
 * Checks:
 *   - Packet nodes > 0
 *   - SourceRef nodes > 0
 *   - FROM_SOURCE edges > 0
 *   - USED_CONCEPT edges > 0 (advisory — needs write-used-concept-edges first)
 *   - SIMILAR_TOPOLOGY or ADJACENT_TO edges > 0
 *
 * Usage:
 *   node scripts/atlas/verify-neo4j-gds-readiness.mjs
 */

import neo4j from 'neo4j-driver';
import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve('.', '.env') });
config({ path: resolve('.', 'sveltekit-frontend/.env.local'), override: false });

const NEO4J_URI = process.env.NEO4J_URI || 'bolt://localhost:7687';
const NEO4J_PASSWORD = process.env.NEO4J_PASSWORD || 'neo4j123';
const NEO4J_USER = process.env.NEO4J_USER || 'neo4j';

let exitCode = 0;

function check(label, ok, value, warn = false) {
  const icon = ok ? '✅' : (warn ? '⚠️ ' : '❌');
  console.log(`  ${icon} ${label}: ${value}`);
  if (!ok && !warn) exitCode = 1;
}

async function countNodes(session, label) {
  const res = await session.run(`MATCH (n:${label}) RETURN count(n) AS c`);
  return res.records[0]?.get('c')?.toNumber?.() ?? 0;
}

async function countEdges(session, type) {
  const res = await session.run(`MATCH ()-[r:${type}]->() RETURN count(r) AS c`);
  return res.records[0]?.get('c')?.toNumber?.() ?? 0;
}

async function main() {
  console.log('\n╔══════════════════════════════════════════════════╗');
  console.log('║  Smoke Test 4: Neo4j GDS Readiness              ║');
  console.log('╚══════════════════════════════════════════════════╝\n');

  const driver = neo4j.driver(NEO4J_URI, neo4j.auth.basic(NEO4J_USER, NEO4J_PASSWORD));
  const session = driver.session({ defaultAccessMode: neo4j.session.READ });

  try {
    // Node counts
    const packetCount = await countNodes(session, 'Packet');
    const sourceRefCount = await countNodes(session, 'SourceRef');
    const conceptCount = await countNodes(session, 'Concept');

    check('Packet nodes > 0', packetCount > 0, packetCount);
    check('SourceRef nodes > 0', sourceRefCount > 0, sourceRefCount, sourceRefCount === 0);
    check('Concept nodes present (advisory)', conceptCount > 0, conceptCount, true);

    // Edge counts
    const fromSource = await countEdges(session, 'FROM_SOURCE');
    const usedConcept = await countEdges(session, 'USED_CONCEPT');
    const similarTopo = await countEdges(session, 'SIMILAR_TOPOLOGY');
    const adjacentTo = await countEdges(session, 'ADJACENT_TO');
    const topoTotal = similarTopo + adjacentTo;

    check('FROM_SOURCE edges > 0', fromSource > 0, fromSource, fromSource === 0);
    check('USED_CONCEPT edges > 0 (needed for PageRank)', usedConcept > 0, usedConcept,
      usedConcept === 0);
    check('SIMILAR_TOPOLOGY or ADJACENT_TO edges > 0', topoTotal > 0,
      `SIMILAR_TOPOLOGY=${similarTopo}, ADJACENT_TO=${adjacentTo}`,
      topoTotal === 0);

    // GDS plugin check
    console.log('\n  GDS plugin check:');
    try {
      const gdsRes = await session.run(`CALL gds.version()`);
      const ver = gdsRes.records[0]?.get('gdsVersion') ?? 'unknown';
      check('Neo4j GDS plugin installed', true, `version ${ver}`);
    } catch (err) {
      check('Neo4j GDS plugin installed', false,
        `not available — ${err.message.split('\n')[0]}`);
    }

    // packet_key coverage on Packet nodes
    if (packetCount > 0) {
      const keyRes = await session.run(`
        MATCH (p:Packet)
        RETURN
          count(p) AS total,
          sum(CASE WHEN p.packet_key IS NOT NULL THEN 1 ELSE 0 END) AS with_key,
          sum(CASE WHEN p.source_ref IS NOT NULL THEN 1 ELSE 0 END) AS with_ref
      `);
      const kr = keyRes.records[0];
      const tot = kr.get('total')?.toNumber?.() ?? 0;
      const wk = kr.get('with_key')?.toNumber?.() ?? 0;
      const wr = kr.get('with_ref')?.toNumber?.() ?? 0;
      console.log('\n  Packet node identity coverage:');
      check('Packet.packet_key populated', wk > 0, `${wk}/${tot}`, wk < tot);
      check('Packet.source_ref populated', wr > 0, `${wr}/${tot}`, wr < tot);
    }

    console.log('\n  Run order to fix gaps:');
    if (usedConcept === 0) {
      console.log('    1. node scripts/atlas/write-used-concept-edges-from-packets.mjs --apply');
    }
    console.log('    2. Run scripts/atlas/compute-pagerank-neo4j-v2.mjs for fixture parity; legacy authority materialization is disabled.');

  } catch (err) {
    console.error(`\n❌ Neo4j error: ${err.message}`);
    exitCode = 1;
  } finally {
    await session.close();
    await driver.close();
  }

  console.log(`\n  Result: ${exitCode === 0 ? '✅ PASS' : '❌ FAIL'}\n`);
  process.exit(exitCode);
}

main();
