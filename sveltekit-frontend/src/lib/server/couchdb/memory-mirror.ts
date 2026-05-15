/**
 * Memory mirror: on CouchDB _changes, propagate a MemoryDoc to:
 *   1. Redis hot cache              (wiki:note:{stableKey}, TTL 6h)
 *   2. Postgres embedded_summaries  (upsert via db.execute)
 *   3. Qdrant synthesis_memory_768  (embed + upsert, when embedding available)
 *   4. Neo4j                        (:WikiNote/:ResearchNote)-[:DOCUMENTS]->
 *
 * All steps are non-fatal: failures are logged, not thrown.
 * The mirror status is written back to the CouchDB doc as _lastMirrorAt.
 */

import { getRedis } from '$lib/server/redis.js';
import { pool } from '$lib/server/db/client';
import type { MemoryDatabase, MemoryDoc } from './mango-indexes.js';
import { ENV } from '$lib/server/env.server.js';

// ── Redis mirror ──────────────────────────────────────────────────────────────

const REDIS_TTL_SECONDS = 6 * 3600; // 6h

async function mirrorToRedis(doc: MemoryDoc): Promise<void> {
  const redis = getRedis();
  const key = `wiki:note:${doc.stableKey}`;
  const payload = JSON.stringify({
    type:         doc.type,
    stableKey:    doc.stableKey,
    clusterKey:   doc.clusterKey,
    tags:         doc.tags,
    gainScore:    doc.gainScore,
    trustTier:    doc.trustTier,
    manifold4:    doc.manifold4,
    lastSyncedAt: doc.lastSyncedAt ?? new Date().toISOString(),
  });
  await redis.setex(key, REDIS_TTL_SECONDS, payload);
}

// ── Postgres mirror ───────────────────────────────────────────────────────────

async function mirrorToPostgres(dbName: MemoryDatabase, doc: MemoryDoc): Promise<void> {
  if (!doc.stableKey || !doc.type) return;

  const metaJson = JSON.stringify({
    type:         doc.type,
    source:       doc.source,
    gainScore:    doc.gainScore,
    trustTier:    doc.trustTier,
    manifold4:    doc.manifold4,
    outputMeta:   doc.outputMeta,
    couchId:      doc._id,
    couchDb:      dbName,
  });

  // Upsert into embedded_summaries using its stable_key column
  await pool.query(
    `INSERT INTO embedded_summaries (stable_key, type, cluster_key, tags, metadata, synced_at, created_at)
     VALUES ($1, $2, $3, $4::text[], $5::jsonb, NOW(), NOW())
     ON CONFLICT (stable_key) DO UPDATE
       SET type        = EXCLUDED.type,
           cluster_key = EXCLUDED.cluster_key,
           tags        = EXCLUDED.tags,
           metadata    = EXCLUDED.metadata,
           synced_at   = NOW()`,
    [
      doc.stableKey,
      doc.type,
      doc.clusterKey ?? null,
      doc.tags ?? [],
      metaJson,
    ],
  );
}

// ── Neo4j mirror ──────────────────────────────────────────────────────────────

async function mirrorToNeo4j(dbName: MemoryDatabase, doc: MemoryDoc): Promise<void> {
  const neo4jUrl  = ENV.NEO4J_HTTP_URL;
  const neo4jAuth = 'Basic ' + Buffer.from(
    ENV.NEO4J_USER + ':' + ENV.NEO4J_PASSWORD
  ).toString('base64');

  const label = doc.type === 'wiki_note' || doc.type === 'directory_summary' || doc.type === 'cluster_summary'
    ? 'WikiNote'
    : doc.type === 'research_note'
    ? 'ResearchNote'
    : 'MemoryNode';

  const cypher = `
    MERGE (m:${label} {stableKey: $stableKey})
    SET m.type       = $type,
        m.clusterKey = $clusterKey,
        m.tags       = $tags,
        m.gainScore  = $gainScore,
        m.trustTier  = $trustTier,
        m.couchDb    = $couchDb,
        m.couchId    = $couchId,
        m.updatedAt  = datetime()
    WITH m
    FOREACH (ck IN CASE WHEN $clusterKey IS NOT NULL THEN [$clusterKey] ELSE [] END |
      MERGE (c:Cluster {stableKey: ck})
      MERGE (m)-[:DOCUMENTS]->(c)
    )
  `;

  const res = await fetch(neo4jUrl + '/db/neo4j/tx/commit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: neo4jAuth },
    body: JSON.stringify({
      statements: [{
        statement: cypher,
        parameters: {
          stableKey:  doc.stableKey,
          type:       doc.type,
          clusterKey: doc.clusterKey ?? null,
          tags:       doc.tags ?? [],
          gainScore:  doc.gainScore ?? null,
          trustTier:  doc.trustTier ?? null,
          couchDb:    dbName,
          couchId:    doc._id,
        },
      }],
    }),
  });

  if (!res.ok) throw new Error(`[memory-mirror] Neo4j upsert failed: ${res.status}`);
}

// ── Orchestrator ──────────────────────────────────────────────────────────────

export async function mirrorMemoryDoc(dbName: MemoryDatabase, doc: MemoryDoc): Promise<void> {
  const t0 = Date.now();
  const errors: string[] = [];

  // 1. Redis
  await mirrorToRedis(doc).catch((e) => errors.push('redis: ' + String(e)));

  // 2. Postgres
  await mirrorToPostgres(dbName, doc).catch((e) => errors.push('postgres: ' + String(e)));

  // 3. Neo4j
  await mirrorToNeo4j(dbName, doc).catch((e) => errors.push('neo4j: ' + String(e)));

  if (errors.length > 0) {
    console.warn(
      `[memory-mirror] ${doc.stableKey} mirrored with errors (${Date.now() - t0}ms):`,
      errors
    );
  }
}
