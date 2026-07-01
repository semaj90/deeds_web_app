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
import crypto from 'node:crypto';
import { loadRepoEnv, resolveDatabaseUrl, resolveRedisConfig } from '../../../scripts/atlas/connection-config.mjs';

const DRY_RUN = process.argv.includes('--dry-run');
const APPLY = process.argv.includes('--apply');
const LIMIT = parseInt(
  process.argv.find(arg => arg.startsWith('--limit='))?.split('=')[1] || '0'
) || 0;

const targetsArg = process.argv.find(arg => arg.startsWith('--targets='))?.split('=')[1] || 'redis,qdrant,neo4j';
const TARGETS = new Set(targetsArg.split(/[,\s]+/).map(t => t.trim()).filter(Boolean));
const repoEnv = loadRepoEnv(process.env);
Object.assign(process.env, repoEnv);
const DATABASE_URL = resolveDatabaseUrl(repoEnv);
const redisConfig = resolveRedisConfig(repoEnv);
const QDRANT_URL = repoEnv.QDRANT_URL || 'http://127.0.0.1:6333';
const OPENAI_EMBED_BASE_URL = String(repoEnv.OLLAMA_EMBED_BASE_URL || repoEnv.EMBED_SERVER_URL || 'http://127.0.0.1:8081').replace(/\/$/, '');
const EMBED_MODEL = repoEnv.OLLAMA_EMBED_MODEL || repoEnv.PRIMARY_EMBEDDING_MODEL || repoEnv.EMBED_MODEL || 'embeddinggemma:latest';
const CHROM97_COLLECTION = repoEnv.CHROM97_QDRANT_COLLECTION || 'chrom97_context_768';
const EXPECTED_DIM = Number(repoEnv.EMBEDDING_DIM || 768);

// DB Clients
const pgPool = new Pool({
  connectionString: DATABASE_URL,
});

const redis = new Redis({
  host: redisConfig.host,
  port: redisConfig.port,
  password: redisConfig.password,
  lazyConnect: true,
  maxRetriesPerRequest: 1,
  enableOfflineQueue: false,
  retryStrategy: () => null,
});

const qdrant = new QdrantClient({
  url: QDRANT_URL,
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

function stablePointId(packet: Chrom97Packet): string {
  const hex = crypto
    .createHash('sha256')
    .update([packet.packet_key, packet.source_ref, packet.feature_id].join('\n'))
    .digest('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

function compactText(parts: Array<unknown>, maxLength = 4096): string {
  return parts
    .flatMap((part) => Array.isArray(part) ? part : [part])
    .map((part) => String(part ?? '').trim())
    .filter(Boolean)
    .join('\n')
    .slice(0, maxLength);
}

function embeddingText(packet: Chrom97Packet): string {
  return compactText([
    packet.feature_label,
    packet.feature_id,
    packet.source_ref,
    packet.context?.domain_class,
    packet.context?.topology_label,
    packet.context?.summary,
    packet.features?.keywords,
    packet.features?.entities,
    packet.features?.ace_tags,
    packet.features?.kag_nodes,
  ]);
}

function neo4jRelationType(value: unknown): string {
  const normalized = String(value ?? 'RELATED_TO').trim().toUpperCase().replace(/[^A-Z0-9_]/g, '_');
  return /^[A-Z][A-Z0-9_]{0,63}$/.test(normalized) ? normalized : 'RELATED_TO';
}

async function embedTexts(texts: string[]): Promise<number[][]> {
  if (!texts.length) return [];
  const response = await fetch(`${OPENAI_EMBED_BASE_URL}/v1/embeddings`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ model: EMBED_MODEL, input: texts }),
    signal: AbortSignal.timeout(120000),
  });
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Embedding request failed: HTTP ${response.status} ${body.slice(0, 300)}`);
  }
  const json = await response.json();
  const vectors = Array.isArray(json?.data) ? json.data.map((row: any) => row?.embedding ?? []) : [];
  if (vectors.length !== texts.length) {
    throw new Error(`Embedding response count mismatch: expected ${texts.length}, got ${vectors.length}`);
  }
  for (const [idx, vector] of vectors.entries()) {
    if (!Array.isArray(vector) || vector.length !== EXPECTED_DIM) {
      throw new Error(`Embedding dimension mismatch at index ${idx}: expected ${EXPECTED_DIM}, got ${vector?.length ?? 0}`);
    }
  }
  return vectors;
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
    const collection = CHROM97_COLLECTION;
    try {
      await qdrant.getCollection(collection);
    } catch {
      console.log(`  Creating Qdrant collection: ${collection}`);
      await qdrant.createCollection(collection, {
        vectors: {
          size: EXPECTED_DIM,
          distance: 'Cosine',
        },
      });
    }

    const batchSize = 32;
    for (let offset = 0; offset < packets.length; offset += batchSize) {
      const batch = packets.slice(offset, offset + batchSize);
      const vectors = await embedTexts(batch.map(embeddingText));
      const points = batch.map((packet, idx) => ({
        id: stablePointId(packet),
        vector: vectors[idx],
        payload: {
          packet_key: packet.packet_key,
          feature_id: packet.feature_id,
          source_ref: packet.source_ref,
          feature_label: packet.feature_label,
          domain_class: packet.context.domain_class,
          topology_label: packet.context.topology_label,
          community_id: packet.context.community_id ?? null,
          keywords: packet.features.keywords,
          entities: packet.features.entities,
          ace_tags: packet.features.ace_tags,
          kag_nodes: packet.features.kag_nodes,
          som_cluster: packet.topology.som_cluster ?? null,
          pagerank: packet.topology.pagerank ?? null,
          confidence: packet.evidence.confidence,
          embedding_model: EMBED_MODEL,
          embedding_dim: EXPECTED_DIM,
          canonical: false,
          mirror_source: 'chrom97',
          payload_backfilled_at: new Date().toISOString(),
        },
      }));

      if (points.length > 0) {
        await qdrant.upsert(collection, { points });
        written += points.length;
      }
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
        const relationType = neo4jRelationType(edge.relation);
        await session.run(
          `
          MATCH (ctx:Chrom97Context {packet_key: $packet_key})
          MERGE (to:Feature {feature_id: $to_id})
          MERGE (from:Feature {feature_id: $from_id})
          MERGE (from)-[rel:${relationType}]->(to)
          SET rel.updated_at = datetime(),
              rel.source = 'chrom97'
          WITH ctx, from
          MERGE (ctx)-[:DERIVED_FROM {relation: $relation}]->(from)
          `,
          {
            packet_key: packet.packet_key,
            to_id: edge.to,
            from_id: edge.from,
            relation: relationType,
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
