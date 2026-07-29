#!/usr/bin/env node

import pg from 'pg';
import crypto from 'node:crypto';

const packetKey = process.argv[2];
const collection = process.argv[3] || 'codebase_chunks_384';
const qdrantUrl = process.env.QDRANT_URL || 'http://127.0.0.1:6333';
const databaseUrl = process.env.DATABASE_URL || 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';

if (!packetKey) {
  throw new Error('Usage: npx tsx scripts/atlas/phase108d-qdrant-single-point-upsert.mts <packet_key> [collection]');
}

const pool = new pg.Pool({ connectionString: databaseUrl, max: 1 });

function parseVectorText(value) {
  const text = String(value ?? '').trim();
  if (!text) return [];
  return text
    .replace(/^\[/, '')
    .replace(/\]$/, '')
    .split(',')
    .map((item) => Number.parseFloat(item.trim()))
    .filter(Number.isFinite);
}

async function fetchPacket() {
  const { rows } = await pool.query(
    `
      SELECT
        p.packet_key,
        p.source_ref,
        p.feature_id,
        p.title_id,
        p.workspace_id,
        COALESCE(p.lineage_version, a.git_commit) AS workspace_revision,
        p.content_embedding_384::text AS embedding_text,
        COALESCE(p.content_hash, a.content_hash) AS content_hash
      FROM atlas_packets p
      LEFT JOIN atlas_artifacts a
        ON a.packet_key = p.packet_key
      WHERE p.packet_key = $1
      LIMIT 1
    `,
    [packetKey],
  );
  return rows[0] ?? null;
}

async function upsertPoint(row) {
  const vector = parseVectorText(row.embedding_text);
  if (vector.length !== 384) {
    throw new Error(`Expected 384-dim vector, got ${vector.length}`);
  }

  const pointId = isUuid(row.qdrant_point_id) ? row.qdrant_point_id : uuidFromText(row.packet_key);

  const point = {
    id: pointId,
    vector: {
      content: vector,
    },
      payload: {
        packet_key: row.packet_key,
        source_ref: row.source_ref,
        feature_id: row.feature_id,
        title_id: row.title_id,
        workspace_id: row.workspace_id,
        workspace_revision: row.workspace_revision,
        content_hash: row.content_hash,
        representation_id: 'dense_384',
        representation_name: 'dense_384',
        dimensions: 384,
      normalization: 'l2',
      qdrant_point_id: pointId,
      qdrant_collection: collection,
    },
  };

  const response = await fetch(`${qdrantUrl.replace(/\/$/, '')}/collections/${encodeURIComponent(collection)}/points?wait=true`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ points: [point] }),
  });

  if (!response.ok) {
    throw new Error(`Qdrant upsert failed: HTTP ${response.status} ${await response.text()}`);
  }

  return pointId;
}

async function markMirror(row) {
  const pointId = isUuid(row.qdrant_point_id) ? row.qdrant_point_id : uuidFromText(row.packet_key);
  await pool.query(
    `
      UPDATE atlas_packets
      SET qdrant_point_id = $2,
          qdrant_collection = $3,
          updated_at = now()
      WHERE packet_key = $1
    `,
    [row.packet_key, pointId, collection],
  );
}

function isUuid(value) {
  return typeof value === 'string'
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.trim());
}

function uuidFromText(value) {
  const hash = crypto.createHash('sha1').update(String(value)).digest('hex').slice(0, 32);
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-${hash.slice(12, 16)}-${hash.slice(16, 20)}-${hash.slice(20, 32)}`;
}

async function main() {
  const row = await fetchPacket();
  if (!row) {
    throw new Error(`No atlas_packets row found for ${packetKey}`);
  }

  const pointId = await upsertPoint(row);
  await markMirror(row);

  console.log(JSON.stringify({
    ok: true,
    packetKey: row.packet_key,
    sourceRef: row.source_ref,
    featureId: row.feature_id,
    contentHash: row.content_hash,
    workspaceRevision: row.workspace_revision,
    workspaceId: row.workspace_id,
    qdrantCollection: collection,
    qdrantPointId: pointId,
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}).finally(async () => {
  await pool.end();
});
