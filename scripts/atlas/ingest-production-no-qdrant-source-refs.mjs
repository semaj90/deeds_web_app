#!/usr/bin/env node
/**
 * Ingests the active-production Parent Atlas rows that have no Qdrant point.
 *
 * Dry-run by default. This is intentionally bounded to the normalized active
 * production set from report-production-no-qdrant.mjs and does not index
 * generated folders.
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { NORMALIZED_COVERAGE_CTE } from './report-production-qdrant-no-som.lib.mjs';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dir, '../..');

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const limitArg = args.find((arg) => arg.startsWith('--limit='));
const limitIndex = args.indexOf('--limit');
const LIMIT = Number(
  limitArg?.split('=')[1]
    ?? (limitIndex >= 0 ? args[limitIndex + 1] : null)
    ?? process.env.npm_config_limit
    ?? '100'
);

const COLLECTION = 'codebase_chunks_768';
const DIM = 768;
const MAX_CHARS = 4000;

function loadEnv() {
  const env = { ...process.env };
  for (const p of [
    path.join(ROOT, 'sveltekit-frontend', '.env.local'),
    path.join(ROOT, 'sveltekit-frontend', '.env'),
    path.join(ROOT, '.env.local'),
    path.join(ROOT, '.env'),
  ]) {
    if (!fs.existsSync(p)) continue;
    for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
      const m = line.trim().match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
      if (m && !env[m[1]]) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  }
  return env;
}

function normalizeRedisUrl(value) {
  const raw = String(value || 'redis://127.0.0.1:6379');
  return /^[a-z]+:\/\//i.test(raw) ? raw : `redis://${raw}`;
}

function sha256(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

function stableUuid(value) {
  const hex = sha256(value).slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

function normalizeSourceRef(value) {
  return String(value ?? '')
    .replace(/\\/g, '/')
    .replace(/^\/+/, '')
    .replace(/^(\.\.\/)+/, '')
    .replace(/^\.\/+/, '')
    .replace(/^sveltekit-frontend\//, '');
}

function sourcePath(sourceRef) {
  const clean = normalizeSourceRef(sourceRef);
  const candidates = [
    path.join(ROOT, clean),
    path.join(ROOT, 'sveltekit-frontend', clean),
  ];
  return candidates.find((candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isFile()) ?? candidates[0];
}

function inferTags(sourceRef, featureId) {
  const clean = normalizeSourceRef(sourceRef);
  const ext = path.extname(clean).replace('.', '');
  const parts = clean.split('/').filter(Boolean);
  return [...new Set([
    ext,
    parts[0],
    parts[1],
    featureId,
  ].filter(Boolean).map((tag) => String(tag).toLowerCase()))];
}

function nearestCentroid(vector, centroids) {
  if (!Array.isArray(vector) || !Array.isArray(centroids) || !centroids.length) return null;
  let best = -1;
  let bestDist = Infinity;
  for (let c = 0; c < centroids.length; c++) {
    const centroid = centroids[c];
    let dist = 0;
    for (let i = 0; i < DIM; i++) {
      const diff = Number(vector[i] ?? 0) - Number(centroid[i] ?? 0);
      dist += diff * diff;
      if (dist >= bestDist) break;
    }
    if (dist < bestDist) {
      best = c;
      bestDist = dist;
    }
  }
  return { centroid: best, distance: bestDist };
}

async function loadCentroids(env) {
  try {
    const { default: Redis } = await import('ioredis');
    const redis = new Redis(normalizeRedisUrl(env.REDIS_URL), {
      password: env.REDIS_PASSWORD || undefined,
      lazyConnect: true,
      enableOfflineQueue: false,
      maxRetriesPerRequest: 1,
    });
    if (redis.status === 'wait') await redis.connect();
    const [centroidsRaw, somGridRaw] = await Promise.all([
      redis.get('cluster:kmeans:k20:centroids'),
      redis.get('cluster:kmeans:k20:som:grid'),
    ]);
    await redis.quit().catch(() => {});
    return {
      centroids: centroidsRaw ? JSON.parse(centroidsRaw) : null,
      somGrid: somGridRaw ? JSON.parse(somGridRaw) : null,
    };
  } catch (err) {
    console.warn(`[ingest:no-qdrant] centroid cache unavailable: ${err.message}`);
    return { centroids: null, somGrid: null };
  }
}

async function embedViaLlamaServer(text, env) {
  const base = env.LOCAL_EMBEDDING_BASE_URL
    ?? env.EMBEDDING_BASE_URL
    ?? env.LOCAL_OPENAI_EMBEDDING_BASE_URL
    ?? 'http://127.0.0.1:8081';
  const model = env.LOCAL_EMBEDDING_MODEL ?? env.LOCAL_EMBEDDING_GEMMA_MODEL ?? 'embeddinggemma';
  const res = await fetch(`${base.replace(/\/$/, '')}/v1/embeddings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ input: text, model }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`llama-server embeddings HTTP ${res.status}`);
  const data = await res.json();
  return data.data?.[0]?.embedding ?? data.embedding ?? null;
}

async function embedViaOllama(text, env) {
  const base = env.OLLAMA_URL ?? 'http://127.0.0.1:11434';
  const model = env.EMBED_MODEL ?? 'embeddinggemma:latest';
  const res = await fetch(`${base.replace(/\/$/, '')}/api/embeddings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt: text, model }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`ollama embeddings HTTP ${res.status}`);
  const data = await res.json();
  return data.embedding ?? null;
}

async function embed(text, env) {
  try {
    const vector = await embedViaLlamaServer(text, env);
    if (Array.isArray(vector)) return { vector, backend: 'llama-server' };
  } catch (err) {
    console.warn(`[ingest:no-qdrant] llama-server embed fallback: ${err.message}`);
  }
  const vector = await embedViaOllama(text, env);
  return { vector, backend: 'ollama' };
}

async function qdrantUpsert(qdrantUrl, points) {
  const res = await fetch(`${qdrantUrl.replace(/\/$/, '')}/collections/${COLLECTION}/points?wait=true`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ points }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Qdrant upsert HTTP ${res.status}: ${body.slice(0, 400)}`);
  }
}

async function main() {
  const env = loadEnv();
  const qdrantUrl = env.QDRANT_URL ?? 'http://127.0.0.1:6333';
  const databaseUrl = env.DATABASE_URL
    ?? `postgresql://${env.DB_USER ?? 'legal_admin'}:${env.DB_PASSWORD ?? 'legal_password'}@${env.DB_HOST ?? '127.0.0.1'}:${env.DB_PORT ?? '5434'}/${env.DB_NAME ?? 'legal_ai_db'}`;

  console.log('══ Ingest Active Production No-Qdrant SourceRefs ═════');
  console.log(`  Mode:       ${APPLY ? 'APPLY' : 'DRY-RUN'}`);
  console.log(`  Limit:      ${LIMIT}`);
  console.log(`  Collection: ${COLLECTION}`);

  const pool = new pg.Pool({ connectionString: databaseUrl });
  const { rows } = await pool.query(`
    ${NORMALIZED_COVERAGE_CTE}
    SELECT source_ref, feature_id
    FROM active
    WHERE qdrant_point_id IS NULL
    ORDER BY source_ref
    LIMIT $1
  `, [LIMIT]);
  await pool.end();

  const { centroids, somGrid } = await loadCentroids(env);
  const points = [];
  const samples = [];
  let missingFiles = 0;
  let embedded = 0;
  let failed = 0;
  const backends = {};

  for (const row of rows) {
    const sourceRef = normalizeSourceRef(row.source_ref);
    const abs = sourcePath(sourceRef);
    if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) {
      missingFiles++;
      samples.push({ source_ref: sourceRef, status: 'missing_file' });
      continue;
    }

    try {
      const raw = fs.readFileSync(abs, 'utf8');
      const text = raw.slice(0, MAX_CHARS);
      const contentHash = sha256(raw);
      const chunkId = `card:${sourceRef}:${contentHash.slice(0, 16)}`;
      const { vector, backend } = await embed(`${sourceRef}\n${row.feature_id ?? ''}\n\n${text}`, env);
      if (!Array.isArray(vector) || vector.length !== DIM) {
        throw new Error(`invalid embedding dimension ${Array.isArray(vector) ? vector.length : typeof vector}`);
      }
      backends[backend] = (backends[backend] ?? 0) + 1;

      const nearest = nearestCentroid(vector, centroids);
      const grid = nearest ? somGrid?.find((item) => Number(item.centroid) === nearest.centroid) : null;
      const tags = inferTags(sourceRef, row.feature_id);
      const payload = {
        chunk_id: chunkId,
        sourceRef: `${sourceRef}#chunk-0`,
        sourceRefs: [sourceRef],
        source_refs: [sourceRef],
        file_path: sourceRef,
        relativePath: sourceRef,
        root: '.',
        area: sourceRef.split('/')[0] ?? '',
        kind: path.extname(sourceRef).replace('.', ''),
        tags,
        feature_id: row.feature_id ?? null,
        feature_ids: row.feature_id ? [row.feature_id] : [],
        feature_label: row.feature_id ?? null,
        schema_version: 1,
        chunk_index: 0,
        total_chunks: 1,
        content: text,
        content_hash: contentHash.slice(0, 16),
        indexed_at: new Date().toISOString(),
      };
      if (nearest && grid) {
        payload.gpuCluster = nearest.centroid;
        payload.som_cluster = nearest.centroid;
        payload.centroid_id = nearest.centroid;
        payload.somRow = grid.row ?? null;
        payload.somCol = grid.col ?? null;
      }

      points.push({
        id: stableUuid(chunkId),
        vector: {
          content: vector,
          signature: vector,
        },
        payload,
      });
      embedded++;
      if (samples.length < 15) {
        samples.push({
          source_ref: sourceRef,
          feature_id: row.feature_id ?? null,
          point_id: stableUuid(chunkId),
          som_cluster: payload.som_cluster ?? null,
          backend,
          status: APPLY ? 'would_write_or_written' : 'dry_run_ready',
        });
      }
    } catch (err) {
      failed++;
      samples.push({ source_ref: sourceRef, status: 'failed', error: err.message });
    }
  }

  let written = 0;
  if (APPLY && points.length) {
    for (let i = 0; i < points.length; i += 50) {
      const batch = points.slice(i, i + 50);
      await qdrantUpsert(qdrantUrl, batch);
      written += batch.length;
    }
  }

  const report = {
    timestamp: new Date().toISOString(),
    mode: APPLY ? 'apply' : 'dry-run',
    selected: rows.length,
    embedded,
    written,
    missingFiles,
    failed,
    backends,
    samples,
  };
  const reportPath = path.join(ROOT, '.tmp', 'production-no-qdrant-ingest-report.json');
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8');

  console.log('\n══ Results ═════════════════════════════════════════');
  console.log(`  Selected:      ${rows.length}`);
  console.log(`  Embedded:      ${embedded}`);
  console.log(`  Written:       ${written}`);
  console.log(`  Missing files: ${missingFiles}`);
  console.log(`  Failed:        ${failed}`);
  console.log(`  Backends:      ${JSON.stringify(backends)}`);
  console.log(`  Report:        ${reportPath}`);
  if (!APPLY) console.log('\n  [DRY-RUN] Pass --apply to write Qdrant points.');
}

main().catch((err) => {
  console.error(`\n✗ ${err.message}`);
  process.exit(1);
});
