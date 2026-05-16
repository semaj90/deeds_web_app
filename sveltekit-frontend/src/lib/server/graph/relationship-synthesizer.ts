import pg from 'pg';
import { getRedis } from '$lib/server/redis.js';
import { pool } from '$lib/server/db/client';
import { ENV } from '$lib/server/env.server.js';

const NEO4J_URL = ENV.NEO4J_URI;

export async function synthesizeCommunityRelationships() {
  console.log('[relationship-synthesizer] Starting inter-community synthesis...');

  // 1. Get community memberships from Redis or Postgres
  const { rows: reportRows } = await pool.query('SELECT community_id as id, cluster_ids FROM community_reports');
  const communityMap = new Map(); // clusterId -> communityId
  for (const row of reportRows) {
    for (const clusterId of row.cluster_ids) {
      communityMap.set(clusterId, row.id);
    }
  }

  // 2. Load cross-community edges from Neo4j
  let neo4j;
  try { neo4j = await import('neo4j-driver'); } catch { return; }
  const driver = neo4j.default.driver(NEO4J_URL, neo4j.default.auth.basic(ENV.NEO4J_USER, ENV.NEO4J_PASSWORD));
  const session = driver.session();

  const edges = [];
  try {
    const result = await session.run(`
      MATCH (a:CodebaseFile)-[:IMPORTS]->(b:CodebaseFile)
      WHERE a.gpuCluster IS NOT NULL AND b.gpuCluster IS NOT NULL
        AND a.gpuCluster <> b.gpuCluster
      RETURN a.gpuCluster AS src, b.gpuCluster AS dst, count(*) AS cnt
    `);

    for (const rec of result.records) {
      const src = rec.get('src');
      const dst = rec.get('dst');
      const cnt = rec.get('cnt');

      if (src == null || dst == null || cnt == null) continue;

      const srcC = typeof src === 'object' ? src.toNumber?.() ?? Number(src) : Number(src);
      const dstC = typeof dst === 'object' ? dst.toNumber?.() ?? Number(dst) : Number(dst);
      const weight = typeof cnt === 'object' ? cnt.toNumber?.() ?? Number(cnt) : Number(cnt);

      const srcComm = communityMap.get(srcC);
      const dstComm = communityMap.get(dstC);

      if (srcComm !== undefined && dstComm !== undefined && srcComm !== dstComm) {
        edges.push({ srcComm, dstComm, weight });
      }
    }
  } finally {
    await session.close();
    await driver.close();
  }

  // 3. Aggregate weights between communities
  const commEdges = new Map();
  for (const edge of edges) {
    const key = `${edge.srcComm}->${edge.dstComm}`;
    const existing = commEdges.get(key) || { src: edge.srcComm, dst: edge.dstComm, weight: 0 };
    existing.weight += edge.weight;
    commEdges.set(key, existing);
  }

  console.log(`[relationship-synthesizer] Found ${commEdges.size} unique inter-community bridges.`);

  // 4. Summarize (simplified for now, can add LLM later)
  for (const [key, bridge] of commEdges) {
    const { src, dst, weight } = bridge;
    const summary = `Community ${src} relies on Community ${dst} via ${weight} structural imports.`;
    const purpose = 'Structural Dependency';

    await pool.query(`
      INSERT INTO codebase_relationship_reports (src_community, dst_community, summary, purpose, weight)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (src_community, dst_community) DO UPDATE
      SET summary = EXCLUDED.summary, weight = EXCLUDED.weight, built_at = NOW()
    `, [src, dst, summary, purpose, weight]);
  }

  console.log('✓ Relationship synthesis complete.');
}
