import { ENV } from '$lib/server/env.server.js';
import { getRedis } from '$lib/server/redis.js';
import { db } from '$lib/server/db/client.js';
import { sql } from 'drizzle-orm';
import { getNeo4jDriver } from '$lib/server/neo4j-driver.js';
import { embedText } from '$lib/server/embedding/embed.js';
import crypto from 'crypto';

export interface MultihopOpts {
  query: string;
  sourceRefs?: string[];
  featureIds?: string[];
  maxHops?: number;
  topK?: number;
}

export interface MultihopPacket {
  source_refs: string[];
  feature_ids: string[];
  lane_ids: string[];
  cluster_id: string;
  som_cluster: string;
  centroid_id: string;
  qdrant_hits: any[];
  neo4j_neighbors: string[];
  topology_path: string[];
  authority_score: number;
  redis_hot_keys: string[];
  runtime_packet_refs: string[];
}

export async function retrieveMultihopContext(opts: MultihopOpts): Promise<MultihopPacket> {
  const query = opts.query || '';
  const topK = opts.topK ?? 10;
  const maxHops = opts.maxHops ?? 2;
  const inputSourceRefs = opts.sourceRefs ?? [];
  const inputFeatureIds = opts.featureIds ?? [];

  const redis = getRedis();
  const queryHash = crypto.createHash('sha256').update(query).digest('hex');
  const cacheKey = `bitfrost:multihop:${queryHash}`;

  // 1. Redis BitFrost Cache Check
  try {
    const cached = await redis.get(cacheKey);
    if (cached) {
      console.log(`[BitFrost Cache] Cache hit for query hash: ${queryHash}`);
      return JSON.parse(cached);
    }
  } catch (err: any) {
    console.warn(`[BitFrost Cache] Read error: ${err.message}`);
  }

  const sourceRefsSet = new Set<string>();
  const featureIdsSet = new Set<string>();
  const laneIdsSet = new Set<string>(['multihop-retrieval']);
  const qdrantHits: any[] = [];
  const neo4jNeighbors: string[] = [];
  const topologyPath: string[] = [];
  let clusterId = '';
  let somCluster = '';
  let centroidId = '';
  let compositeAuthorityScore = 0.0;
  const redisHotKeys = [cacheKey];
  const runtimePacketRefs: string[] = [];

  // Populate input filter parameters
  for (const ref of inputSourceRefs) {
    if (ref && !ref.startsWith('feature:')) {
      sourceRefsSet.add(ref);
    }
  }
  for (const fid of inputFeatureIds) {
    if (fid) featureIdsSet.add(fid);
  }

  // 2. Qdrant Search
  let embedding: number[] | null = null;
  if (query) {
    try {
      embedding = await embedText(query);
    } catch (err: any) {
      console.warn(`[Embed] Embedding query failed: ${err.message}`);
    }
  }

  if (embedding) {
    const qdrantUrl = ENV.QDRANT_URL || 'http://127.0.0.1:6333';
    try {
      const res = await fetch(`${qdrantUrl}/collections/codebase_chunks_768/points/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vector: { name: 'content', vector: embedding },
          limit: topK,
          with_payload: true
        }),
        signal: AbortSignal.timeout(10000)
      });
      if (res.ok) {
        const data = await res.json() as any;
        const hits = data.result ?? [];
        laneIdsSet.add('qdrant');
        
        for (const hit of hits) {
          const payload = hit.payload || {};
          const ref = (payload.sourceRef || payload.relativePath || payload.file_path || '') as string;
          if (ref && !ref.startsWith('feature:')) {
            sourceRefsSet.add(ref);
            qdrantHits.push({
              id: hit.id,
              score: hit.score,
              source_ref: ref,
              snippet: (payload.text || payload.content || '').slice(0, 150)
            });
          }
          const fId = (payload.feature_id || payload.phase_lane || '') as string;
          if (fId) {
            featureIdsSet.add(fId);
          }
        }
      }
    } catch (err: any) {
      console.warn(`[Qdrant] Retrieval failed: ${err.message}`);
    }
  }

  // 3. Parent Atlas source_ref + feature_id expansion
  const refList = [...sourceRefsSet];
  if (refList.length > 0) {
    try {
      // Query parent_atlas_documents (via direct SQL injection wrapper)
      const padRows = await db.execute(sql`
        SELECT source_ref, feature_id, rel_path, qdrant_point_id
        FROM parent_atlas_documents
        WHERE source_ref = ANY(ARRAY[${sql.join(refList.map(r => sql`${r}`), sql`, `)}])
      `);
      const padResults = Array.isArray(padRows) ? padRows : (padRows as any).rows ?? [];
      laneIdsSet.add('postgres-parent-atlas');

      for (const row of padResults) {
        if (row.feature_id) {
          featureIdsSet.add(row.feature_id);
        }
      }

      // Query atlas_feature_map
      const afmRows = await db.execute(sql`
        SELECT source_ref, feature_id, related_feature_ids, cluster_id, centroid_id, som_cluster, qdrant_point_id
        FROM atlas_feature_map
        WHERE source_ref = ANY(ARRAY[${sql.join(refList.map(r => sql`${r}`), sql`, `)}])
      `);
      const afmResults = Array.isArray(afmRows) ? afmRows : (afmRows as any).rows ?? [];

      for (const row of afmResults) {
        if (row.feature_id) featureIdsSet.add(row.feature_id);
        if (row.cluster_id) clusterId = row.cluster_id;
        if (row.som_cluster) somCluster = row.som_cluster;
        if (row.centroid_id) centroidId = row.centroid_id;

        const relFeatures = typeof row.related_feature_ids === 'string'
          ? JSON.parse(row.related_feature_ids)
          : row.related_feature_ids || [];
        if (Array.isArray(relFeatures)) {
          for (const rel of relFeatures) {
            if (rel) featureIdsSet.add(rel);
          }
        }
      }
    } catch (err: any) {
      console.warn(`[Postgres Atlas] Linage expansion failed: ${err.message}`);
    }
  }

  // 4. Neo4j 1-2 hop contextual tree traversal
  const expandedRefs = [...sourceRefsSet];
  if (expandedRefs.length > 0) {
    try {
      const driver = getNeo4jDriver();
      const session = driver.session({ database: 'neo4j' });
      
      const cypherQuery = `
        MATCH (f)
        WHERE (f.stableKey IN $refs OR f.sourceRef IN $refs OR f.id IN $refs)
        MATCH p = (f)-[r:IMPORTS|CONTAINS|BELONGS_TO_CLUSTER|REFERENCES|EVIDENCE_FOR|DOCUMENTS|CONSULTED*1..${maxHops}]-(n)
        WHERE n.stableKey IS NOT NULL AND NOT n.stableKey STARTS WITH 'feature:'
        RETURN DISTINCT
          n.stableKey AS neighbor,
          n.graphPageRank AS graphPageRank,
          [rel in relationships(p) | type(rel)] AS relTypes
        LIMIT 30
      `;

      const res = await session.run(cypherQuery, { refs: expandedRefs });
      laneIdsSet.add('neo4j-graph');

      let totalPR = 0;
      let prCount = 0;

      for (const record of res.records) {
        const neighbor = record.get('neighbor');
        const pr = record.get('graphPageRank') ?? 0;
        const relTypes = record.get('relTypes') ?? [];

        if (neighbor && !neighbor.startsWith('feature:')) {
          neo4jNeighbors.push(neighbor);
          if (!sourceRefsSet.has(neighbor)) {
            sourceRefsSet.add(neighbor);
          }
          if (pr > 0) {
            totalPR += pr;
            prCount++;
          }
          // Capture topology path edges
          for (const rType of relTypes) {
            if (rType) topologyPath.push(rType);
          }
        }
      }

      if (prCount > 0) {
        compositeAuthorityScore = totalPR / prCount;
      }

      await session.close();
    } catch (err: any) {
      console.warn(`[Neo4j Graph] Multi-hop expansion error: ${err.message}`);
    }
  }

  // 5. Query task_semantic_packets joins safely by feature_id
  const featureList = [...featureIdsSet];
  if (featureList.length > 0) {
    try {
      const taskRows = await db.execute(sql`
        SELECT id::text AS id, feature_id
        FROM task_semantic_packets
        WHERE feature_id = ANY(ARRAY[${sql.join(featureList.map(r => sql`${r}`), sql`, `)}])
        LIMIT 10
      `);
      const taskResults = Array.isArray(taskRows) ? taskRows : (taskRows as any).rows ?? [];
      for (const row of taskResults) {
        runtimePacketRefs.push(`task:${row.id}`);
      }
    } catch (err: any) {
      console.warn(`[Postgres Task] Query failed: ${err.message}`);
    }
  }

  // 6. Build the assembled packet
  const packet: MultihopPacket = {
    source_refs: [...sourceRefsSet].filter(ref => ref && !ref.startsWith('feature:')),
    feature_ids: [...featureIdsSet],
    lane_ids: [...laneIdsSet],
    cluster_id: clusterId || 'unassigned',
    som_cluster: somCluster || 'unassigned',
    centroid_id: centroidId || 'unassigned',
    qdrant_hits: qdrantHits,
    neo4j_neighbors: [...new Set(neo4jNeighbors)],
    topology_path: [...new Set(topologyPath)],
    authority_score: Number(compositeAuthorityScore.toFixed(4)),
    redis_hot_keys: redisHotKeys,
    runtime_packet_refs: runtimePacketRefs
  };

  // 7. Cache packet in Redis (TTL = 1 hour)
  try {
    await redis.set(cacheKey, JSON.stringify(packet), 'EX', 3600);
  } catch (err: any) {
    console.warn(`[BitFrost Cache] Write error: ${err.message}`);
  }

  return packet;
}
