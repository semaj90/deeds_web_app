#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import pg from 'pg';

const root = process.cwd();
const queuePath = path.resolve(root, '.tmp/atlas/golden-relevance-review-pool-bound-v1.ndjson');
const reportPath = path.resolve(root, 'docs/reports/current-semantic768-corpus-manifest-plan-v1.json');
const dbUrl = process.env.ATLAS_DATABASE_URL ?? 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';
const qdrantUrl = process.env.ATLAS_QDRANT_URL ?? 'http://127.0.0.1:6333';
const digest = (value) => `sha256:${crypto.createHash('sha256').update(value).digest('hex')}`;

const queue = fs.readFileSync(queuePath, 'utf8').split(/\r?\n/).filter(Boolean).map(JSON.parse);
const queryMaterial = queue.map((row) => `${row.evaluationQueryId}|${row.queryText}`).sort().join('\n');
let gitCommit = null;
try { gitCommit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(); } catch {}

const pool = new pg.Pool({ connectionString: dbUrl });
let postgresChunkCount = null;
let postgresPacketCount = null;
try {
  const result = await pool.query(`
    SELECT COUNT(*)::int AS chunks
    FROM codebase_chunk_index
    WHERE content_embedding_768 IS NOT NULL
  `);
  postgresChunkCount = result.rows[0].chunks;
  postgresPacketCount = null;
} finally {
  await pool.end();
}

let qdrant = { reachable: false, pointCount: null, collection: 'codebase_chunks_768' };
try {
  const response = await fetch(`${qdrantUrl}/collections/codebase_chunks_768`, { signal: AbortSignal.timeout(3000) });
  if (response.ok) {
    const payload = await response.json();
    qdrant = { reachable: true, pointCount: payload.result?.points_count ?? null, collection: 'codebase_chunks_768' };
  }
} catch {}

const manifest = {
  schema: 'atlas.evaluation-corpus-manifest-v1',
  status: 'CURRENT_SEMANTIC768_MANIFEST_PLANNED',
  canonicalAuthority: false,
  corpusVersion: `semantic768-${(gitCommit ?? 'unbound').slice(0, 12)}`,
  gitCommit,
  postgresPacketCount,
  postgresChunkCount,
  qdrantCollection: qdrant.collection,
  qdrantPointCount: qdrant.pointCount,
  embeddingModel: 'embeddinggemma:latest',
  embeddingDimension: 768,
  embeddingModelVersion: 'current-workstation-contract',
  querySetHash: digest(queryMaterial),
  judgmentSetHash: 'pending',
  queryCount: queue.length,
  qdrantMetadataReachable: qdrant.reachable,
  databaseWrites: false,
  importAllowed: false,
  nextRequiredStep: 'Complete reviewed grades and compute judgmentSetHash before registering this manifest.',
};
fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(manifest));
