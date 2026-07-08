#!/usr/bin/env node
/**
 * sync-community-from-neo4j.mjs
 *
 * Syncs louvainCommunityId from Neo4j Packet nodes → atlas_packets.community_id
 * and sets community_confidence = 0.70 for all synced packets.
 *
 * Join key: Neo4j p.path = 'sveltekit-frontend/' + ap.source_ref
 *
 * Usage:
 *   node scripts/atlas/sync-community-from-neo4j.mjs
 */

import pg from 'pg';
import neo4j from 'neo4j-driver';

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';
const NEO4J_URI      = 'bolt://127.0.0.1:7687';
const NEO4J_USER     = 'neo4j';
const NEO4J_PASSWORD = 'neo4j123';

const BATCH = 500;

async function main() {
  const driver = neo4j.driver(NEO4J_URI, neo4j.auth.basic(NEO4J_USER, NEO4J_PASSWORD));
  await driver.verifyConnectivity();
  const session = driver.session({ defaultAccessMode: neo4j.session.READ });

  console.log('Fetching Packet nodes with louvainCommunityId from Neo4j...');
  const result = await session.run(
    'MATCH (p:Packet) WHERE p.louvainCommunityId IS NOT NULL RETURN p.path AS path, p.louvainCommunityId AS community_id'
  );
  await session.close();
  await driver.close();

  const rows = result.records.map(r => ({
    path: r.get('path'),
    community_id: typeof r.get('community_id').toNumber === 'function'
      ? r.get('community_id').toNumber()
      : Number(r.get('community_id'))
  }));
  console.log(`Got ${rows.length} Packet nodes with louvainCommunityId`);

  // Build update pairs: source_ref = 'sveltekit-frontend/' + path
  const updates = rows.map(r => ({
    source_ref: 'sveltekit-frontend/' + r.path,
    community_id: r.community_id
  }));

  const pool = new pg.Pool({ connectionString: DATABASE_URL });
  let updated = 0;

  for (let i = 0; i < updates.length; i += BATCH) {
    const batch = updates.slice(i, i + BATCH);
    const srcRefs = batch.map(u => u.source_ref);
    const commIds = batch.map(u => u.community_id);
    const r = await pool.query(`
      UPDATE atlas_packets ap
      SET community_id = u.community_id::int,
          community_confidence = 0.70,
          updated_at = NOW()
      FROM (SELECT unnest($1::text[]) AS source_ref, unnest($2::int[]) AS community_id) u
      WHERE ap.source_ref = u.source_ref
        AND (ap.community_id IS NULL OR ap.community_id != u.community_id::int OR ap.community_confidence IS NULL OR ap.community_confidence = 0)
    `, [srcRefs, commIds]);
    updated += r.rowCount;
    if (i % 5000 === 0) process.stdout.write(`\r  Progress: ${Math.min(i + BATCH, updates.length)}/${updates.length}...`);
  }

  console.log(`\nUpdated: ${updated} packets with community data`);

  const v = await pool.query(`
    SELECT
      COUNT(*) FILTER (WHERE community_confidence > 0) as with_conf,
      COUNT(*) FILTER (WHERE community_confidence >= 0.65) as high_conf,
      COUNT(*) total
    FROM atlas_packets
  `);
  const { with_conf, high_conf, total } = v.rows[0];
  console.log(`Coverage: ${with_conf}/${total} (${Math.round(with_conf/total*100)}%) have community_confidence > 0`);
  console.log(`High conf (≥0.65): ${high_conf}/${total} (${Math.round(high_conf/total*100)}%)`);
  console.log(`Gate (≥95%): ${Math.round(with_conf/total*100) >= 95 ? 'PASS ✅' : 'PARTIAL ⚠️'}`);

  await pool.end();
}

main().catch(e => { console.error('Fatal:', e.message); process.exit(1); });