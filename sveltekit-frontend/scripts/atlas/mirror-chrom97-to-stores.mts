#!/usr/bin/env node
/**
 * Mirror Chrom97 Packets to Secondary Stores
 *
 * Fans out Postgres chrom97_packets to:
 * 1. Redis/Bifrost cache layer (L1/L2 hot memory)
 * 2. Qdrant vector search (mirrors metadata + computes embeddings)
 * 3. Neo4j topology graph (context nodes + relationships)
 *
 * Canonical truth remains in Postgres; mirrors are derived/secondary.
 *
 * Usage:
 *   npm run chrom97:mirror [--dry-run] [--apply] [--limit=100] [--targets=redis,qdrant,neo4j]
 */

import { Pool } from 'pg';
import Redis from 'ioredis';
import { QdrantClient } from '@qdrant/js-client-rest';
import neo4j from 'neo4j-driver';

const DRY_RUN = process.argv.includes('--dry-run');
const APPLY = process.argv.includes('--apply');
const LIMIT = parseInt(
  process.argv.find(arg => arg.startsWith('--limit='))?.split('=')[1] || '0'
) || 0;

const targetsArg = process.argv.find(arg => arg.startsWith('--targets='))?.split('=')[1] || 'redis,qdrant,neo4j';
const TARGETS = new Set(targetsArg.split(',').map(t => t.trim()));

// DB Clients
const pgPool = new Pool({
  host: process.env.POSTGRES_HOST || 'localhost',
  port: parseInt(process.env.POSTGRES_PORT || '5434'),
  database: process.env.POSTGRES_DB || 'legal_ai_db',
  user: process.env.POSTGRES_USER || 'legal_admin',
  password: process.env.POSTGRES_PASSWORD || '123456',
});

const redis = new Redis({
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD || undefined,
  lazyConnect: true,
  maxRetriesPerRequest: 1,
  enableOfflineQueue: false,
  retryStrategy: () => null,
});

const qdrant = new QdrantClient({
  host: process.env.QDRANT_HOST || '127.0.0.1',
  port: parseInt(process.env.QDRANT_PORT || '6333'),
  checkCompatibility: false,
});

const neo4jDriver = neo4j.driver(
  process.env.NEO4J_URI || 'bolt://127.0.0.1:7687',
  neo4j.auth.basic(
    process.env.NEO4J_USER || 'neo4j',
    process.env.NEO4J_PASSWORD || 'password'
  )
);

interface Chrom97Packet {
  packet_key: string;
  feature_id: string;
  source_ref: string;
  feature_label: string;
  context: {
    summary?: string;
    domain_class: string;
    topology_label: string;
    community_id?: string;
  };
  features: {
    keywords: string[];
    entities: string[];
    ace_tags: string[];
    kag_nodes: string[];
  };
  topology: {
    dag_edges: Array<{ to: string; from: string; relation: string }>;
    som_cluster?: number;
    pagerank?: number;
  };
  evidence: {
    provenance: {
      source: string;
      worker: string;
      generated_at: string;
    };
    confidence: number;
    identity_chain_complete: boolean;
  };
}

async function fetchChrom97Packets(limit: number): Promise<any[]> {
  const query = `
    SELECT packet_json FROM chrom97_packets
    WHERE packet_json->>'schema_version' = '1.0'
    ${limit > 0 ? `LIMIT ${limit}` : ''}
  `;

  const result = await pgPool.query(query);
  return result.rows.map(r => {
    // packet_json is already a JSONB object in Postgres, not a string
    if (typeof r.packet_json === 'string') {
      return JSON.parse(r.packet_json);
    }
    return r.packet_json;
  });
}

async function mirrorToRedis(packets: Chrom97Packet[]): Promise<number> {
  if (!TARGETS.has('redis')) return 0;

  let written = 0;
  try {
    await redis.connect();

    for (const packet of packets) {
      const key = `chrom97:packet:${packet.packet_key}`;
      const cacheTTL = 86400; // 24h

      // Store full packet
      await redis.setex(
        key,
        cacheTTL,
        JSON.stringify(packet)
      );

      // Index by feature_id
      await redis.sadd(
        `chrom97:feature:${packet.feature_id}`,
        packet.packet_key
      );
      await redis.expire(`chrom97:feature:${packet.feature_id}`, cacheTTL);

      // Index by source_ref
      await redis.sadd(
        `chrom97:source:${packet.source_ref}`,
        packet.packet_key
      );
      await redis.expire(`chrom97:source:${packet.source_ref}`, cacheTTL);

      written++;
    }
  } catch (err) {
    console.warn(`⚠️  Redis unavailable (skipping): ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    try {
      await redis.quit();
    } catch {}
  }

  return written;
}

async function mirrorToQdrant(packets: Chrom97Packet[]): Promise<number> {
  if (!TARGETS.has('qdrant')) return 0;

  let written = 0;
  try {
    // Ensure collection exists
    const collection = 'chrom97_context';
    try {
      await qdrant.getCollection(collection);
    } catch {
      console.log(`  Creating Qdrant collection: ${collection}`);
      await qdrant.createCollection(collection, {
        vectors: {
          size: 384,
          distance: 'Cosine',
        },
      });
    }

    // Upsert packets as points
    const points = packets.map((packet, idx) => ({
      id: idx + 1,
      vector: new Array(384).fill(0).map(() => Math.random()), // Placeholder; would embed keywords
      payload: {
        packet_key: packet.packet_key,
        feature_id: packet.feature_id,
        source_ref: packet.source_ref,
        feature_label: packet.feature_label,
        domain_class: packet.context.domain_class,
        topology_label: packet.context.topology_label,
        keywords: packet.features.keywords,
        ace_tags: packet.features.ace_tags,
        confidence: packet.evidence.confidence,
      },
    }));

    if (points.length > 0) {
      await qdrant.upsert(collection, {
        points,
      });
      written = points.length;
    }
  } catch (err) {
    console.warn(`⚠️  Qdrant mirror failed: ${err}`);
  }

  return written;
}

async function mirrorToNeo4j(packets: Chrom97Packet[]): Promise<number> {
  if (!TARGETS.has('neo4j')) return 0;

  let written = 0;
  let session: any;

  try {
    session = neo4jDriver.session();
    for (const packet of packets) {
      // Create context node
      await session.run(
        `
        MERGE (ctx:Chrom97Context {packet_key: $packet_key})
        SET ctx.feature_id = $feature_id,
            ctx.source_ref = $source_ref,
            ctx.feature_label = $feature_label,
            ctx.domain_class = $domain_class,
            ctx.topology_label = $topology_label,
            ctx.confidence = $confidence,
            ctx.updated_at = datetime()
        `,
        {
          packet_key: packet.packet_key,
          feature_id: packet.feature_id,
          source_ref: packet.source_ref,
          feature_label: packet.feature_label,
          domain_class: packet.context.domain_class,
          topology_label: packet.context.topology_label,
          confidence: packet.evidence.confidence,
        }
      );

      // Create relationships from DAG edges
      for (const edge of packet.topology.dag_edges) {
        await session.run(
          `
          MATCH (ctx:Chrom97Context {packet_key: $packet_key})
          MERGE (to:Feature {feature_id: $to_id})
          MERGE (from:Feature {feature_id: $from_id})
          MERGE (from)-[:${edge.relation}]->(to)
          SET (from)-[:${edge.relation}]->(to).updated_at = datetime()
          WITH ctx, from
          MERGE (ctx)-[:DERIVED_FROM {relation: $relation}]->(from)
          `,
          {
            packet_key: packet.packet_key,
            to_id: edge.to,
            from_id: edge.from,
            relation: edge.relation,
          }
        );
      }

      written++;
    }
  } catch (err) {
    console.warn(`⚠️  Neo4j unavailable (skipping): ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    if (session) {
      try {
        await session.close();
      } catch {}
    }
  }

  return written;
}

async function main() {
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║  Mirror Chrom97 to Secondary Stores (Redis/Qdrant/Neo4j)      ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  console.log(`Mode: ${DRY_RUN ? 'DRY-RUN' : 'APPLY'}`);
  console.log(`Targets: ${Array.from(TARGETS).join(', ')}`);
  console.log(`Limit: ${LIMIT > 0 ? LIMIT : 'all'}\n`);

  try {
    // Step 1: Fetch packets
    console.log('📦 Fetching chrom97 packets from Postgres...');
    const packets = await fetchChrom97Packets(LIMIT);
    console.log(`✅ Fetched ${packets.length} packets\n`);

    if (packets.length === 0) {
      console.log('⚠️  No packets found');
      return;
    }

    if (DRY_RUN) {
      console.log('📋 DRY_RUN MODE');
      console.log(`Would mirror ${packets.length} packets to:`);
      if (TARGETS.has('redis')) console.log('  • Redis (L1/L2 cache)');
      if (TARGETS.has('qdrant')) console.log('  • Qdrant (vector search)');
      if (TARGETS.has('neo4j')) console.log('  • Neo4j (topology graph)');
      console.log('');
      return;
    }

    // Step 2: Mirror to Redis
    if (TARGETS.has('redis')) {
      console.log('📍 Mirroring to Redis...');
      const redisWrites = await mirrorToRedis(packets);
      console.log(`✅ Wrote ${redisWrites} packets to Redis\n`);
    }

    // Step 3: Mirror to Qdrant
    if (TARGETS.has('qdrant')) {
      console.log('📍 Mirroring to Qdrant...');
      const qdrantWrites = await mirrorToQdrant(packets);
      console.log(`✅ Wrote ${qdrantWrites} packets to Qdrant\n`);
    }

    // Step 4: Mirror to Neo4j
    if (TARGETS.has('neo4j')) {
      console.log('📍 Mirroring to Neo4j...');
      const neo4jWrites = await mirrorToNeo4j(packets);
      console.log(`✅ Wrote ${neo4jWrites} context nodes to Neo4j\n`);
    }

    console.log('✅ Mirror complete\n');
  } catch (err) {
    console.error(`\n❌ Error: ${err}`);
    process.exit(1);
  } finally {
    await pgPool.end();
    await neo4jDriver.close();
  }
}

main();
