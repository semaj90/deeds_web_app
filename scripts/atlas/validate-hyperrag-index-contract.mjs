#!/usr/bin/env node
import pg from 'pg';
import Redis from 'ioredis';
import { QdrantClient } from '@qdrant/js-client-rest';
import neo4j from 'neo4j-driver';
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const APPLY = process.argv.includes('--apply');
const LIMIT = Number(process.argv.find(a => a.startsWith('--limit='))?.split('=')[1] || 100);
const PG_URL = process.env.DATABASE_URL || 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';
const QDRANT_URL = process.env.QDRANT_URL || 'http://127.0.0.1:6333';
const COLLECTION = process.env.QDRANT_COLLECTION || 'codebase_chunks_768';
const REDIS_HOST = process.env.REDIS_HOST || '127.0.0.1';
const REDIS_PORT = Number(process.env.REDIS_PORT || 6379);
const REDIS_PASS = process.env.REDIS_PASSWORD || 'redis';
const NEO4J_URI = process.env.NEO4J_URI || 'bolt://127.0.0.1:7687';
const NEO4J_USER = process.env.NEO4J_USER || 'neo4j';
const NEO4J_PASS = process.env.NEO4J_PASSWORD || 'password';

const report = {
  generated_at: new Date().toISOString(),
  limit: LIMIT,
  status: 'unknown',
  counts: {},
  failures: [],
  samples: []
};

function fail(kind, row, error) {
  report.failures.push({
    kind,
    id: row?.id,
    packet_key: row?.packet_key,
    qdrant_id: row?.qdrant_id,
    feature_id: row?.feature_id,
    source_ref: row?.source_ref,
    error: String(error?.message || error)
  });
}

async function main() {
  const pgPool = new pg.Pool({ connectionString: PG_URL, max: 3 });
  const redis = new Redis({ host: REDIS_HOST, port: REDIS_PORT, password: REDIS_PASS });
  const qdrant = new QdrantClient({ url: QDRANT_URL });
  const driver = neo4j.driver(NEO4J_URI, neo4j.auth.basic(NEO4J_USER, NEO4J_PASS));

  try {
    const rows = await pgPool.query(`
      SELECT
        id,
        packet_key,
        source_ref,
        feature_id,
        som_cluster,
        kmeans_cluster,
        qdrant_id,
        summary,
        summary_embedding
      FROM codebase_chunk_index
      WHERE qdrant_id IS NOT NULL
        AND feature_id IS NOT NULL
        AND source_ref IS NOT NULL
      ORDER BY random()
      LIMIT $1
    `, [LIMIT]);

    report.counts.sampled = rows.rows.length;

    const collection = await qdrant.getCollection(COLLECTION);
    const vectorConfig = collection?.config?.params?.vectors || collection?.config?.vectors || {};
    const hasSummaryVector = JSON.stringify(vectorConfig).includes('summary_embeddinggemma');

    report.counts.qdrant_collection_ok = Boolean(collection);
    report.counts.qdrant_summary_vector_config = hasSummaryVector;

    for (const row of rows.rows) {
      const sample = {
        id: row.id,
        packet_key: row.packet_key,
        source_ref: row.source_ref,
        feature_id: row.feature_id,
        qdrant_id: row.qdrant_id,
        postgres: false,
        qdrant_payload: false,
        qdrant_vector_name_config: hasSummaryVector,
        redis_bitfrost: false,
        neo4j_packet: false,
        neo4j_kag_dag_edges: 0,
        ace_ready: false
      };

      try {
        sample.postgres = Boolean(row.summary && row.summary_embedding);
        if (!sample.postgres) fail('postgres_missing_summary_or_embedding', row, 'missing summary/embedding');
      } catch (e) {
        fail('postgres', row, e);
      }

      try {
        const points = await qdrant.retrieve(COLLECTION, {
          ids: [row.qdrant_id],
          with_payload: true,
          with_vector: false
        });

        const p = points?.[0];
        sample.qdrant_payload = Boolean(
          p?.payload &&
          p.payload.feature_id === row.feature_id &&
          (p.payload.source_ref === row.source_ref || p.payload.sourceRef === row.source_ref)
        );

        if (!sample.qdrant_payload) fail('qdrant_payload_mismatch', row, p?.payload || 'point missing');
      } catch (e) {
        fail('qdrant_retrieve', row, e);
      }

      try {
        const keys = [
          `bitfrost:qdrant:summary:${row.qdrant_id}`,
          `bitfrost:packet:${row.packet_key}`,
          `centroid:feature:${row.feature_id}`,
          `ace:context:${row.feature_id}`
        ];

        const exists = await Promise.all(keys.map(k => redis.exists(k)));
        sample.redis_bitfrost = exists.some(Boolean);

        if (!sample.redis_bitfrost) fail('redis_bitfrost_missing', row, `none of keys exist: ${keys.join(', ')}`);
      } catch (e) {
        fail('redis', row, e);
      }

      try {
        const session = driver.session();
        const res = await session.run(`
          MATCH (p)
          WHERE p.packet_key = $packet_key
             OR p.source_ref = $source_ref
             OR p.feature_id = $feature_id
          OPTIONAL MATCH (p)-[r]-()
          WHERE type(r) IN ['HAS_FEATURE','IN_SOM','ADJACENT_TO','KAG_HIT','DAG_HIT','ACE_HIT']
          RETURN count(DISTINCT p) AS packets, count(r) AS edges
        `, {
          packet_key: row.packet_key,
          source_ref: row.source_ref,
          feature_id: row.feature_id
        });

        await session.close();

        const rec = res.records[0];
        const packets = rec.get('packets').toNumber?.() ?? Number(rec.get('packets'));
        const edges = rec.get('edges').toNumber?.() ?? Number(rec.get('edges'));

        sample.neo4j_packet = packets > 0;
        sample.neo4j_kag_dag_edges = edges;
        sample.ace_ready = sample.neo4j_packet && edges > 0;

        if (!sample.neo4j_packet) fail('neo4j_packet_missing', row, 'no matching packet/source/feature node');
        if (edges === 0) fail('neo4j_edges_missing', row, 'no ACE/KAG/DAG/SOM/feature edges');
      } catch (e) {
        fail('neo4j', row, e);
      }

      report.samples.push(sample);
    }

    report.counts.postgres_ok = report.samples.filter(s => s.postgres).length;
    report.counts.qdrant_ok = report.samples.filter(s => s.qdrant_payload).length;
    report.counts.redis_ok = report.samples.filter(s => s.redis_bitfrost).length;
    report.counts.neo4j_ok = report.samples.filter(s => s.neo4j_packet).length;
    report.counts.ace_kag_dag_ok = report.samples.filter(s => s.ace_ready).length;

    report.status = report.failures.length === 0 ? 'PASS' : 'FAIL';

    mkdirSync(resolve('docs/reports'), { recursive: true });
    writeFileSync(
      resolve('docs/reports/hyperrag-index-contract-validation.json'),
      JSON.stringify(report, null, 2)
    );

    console.log(JSON.stringify(report, null, 2));
    process.exit(report.status === 'PASS' ? 0 : 1);
  } finally {
    await redis.quit().catch(() => {});
    await pgPool.end().catch(() => {});
    await driver.close().catch(() => {});
  }
}

main().catch(e => {
  console.error(e);
  process.exit(2);
});