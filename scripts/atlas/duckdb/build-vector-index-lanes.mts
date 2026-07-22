#!/usr/bin/env node
/**
 * Build the 384-vector retrieval lanes from a frozen DuckDB snapshot.
 *
 * Steps:
 *  1. Freeze a deterministic 5,000-packet vector snapshot
 *  2. Upsert a Qdrant hybrid lane from the same snapshot
 *  3. Build a TurboVec shadow lane from the same snapshot
 *  4. Compare both lanes against a brute-force cosine reference
 *
 * Usage:
 *   npx tsx scripts/atlas/duckdb/build-vector-index-lanes.mts [--limit=5000] [--apply] [--compare]
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import {
  createAtlasDuckDB,
  attachCanonicalPostgres,
  buildVectorSnapshot,
  parsePgVector,
  vectorNorm,
} from '../../../packages/atlas-duckdb/src/index.ts';
import {
  COLLECTION_CONTRACTS,
  validateQdrantPayload,
  hashQdrantPayload,
} from '../../../sveltekit-frontend/src/lib/server/atlas/qdrant-collection-contracts.ts';
import { generateSparseVector } from '../../../sveltekit-frontend/src/lib/server/vector/bm42-sparse.ts';
import { EMBEDDINGGEMMA_PREFIX384_V1 } from '../../../sveltekit-frontend/src/lib/server/vector/embeddinggemma-prefix384.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..', '..');
const SNAPSHOT_DIR = path.join(REPO_ROOT, '.tmp', 'atlas-vector-snapshots');
const INPUT_PATH = path.join(SNAPSHOT_DIR, 'vector-snapshot-5k.ndjson');
const TURBOVEC_INPUT_PATH = path.join(SNAPSHOT_DIR, 'vector-snapshot-5k-turbovec-input.ndjson');
const TURBOVEC_OUTPUT_PATH = path.join(SNAPSHOT_DIR, 'vector-snapshot-5k-turbovec.ndjson');
const REPORT_PATH = path.join(REPO_ROOT, 'docs', 'reports', 'vector-index-lanes.json');
const QDRANT_COLLECTION = 'codebase_chunks_384_hybrid';
const QDRANT_DENSE_VECTOR = 'content';
const QDRANT_SUMMARY_VECTOR = 'summary';
const QDRANT_SPARSE_VECTOR = 'bm42_sparse';
const TURBOVEC_SHADOW_LIMIT = 4096;

const args = process.argv.slice(2);
const limit = parseIntegerFlag('--limit', 5000);
const apply = args.includes('--apply');
const compare = args.includes('--compare');
const sample = parseIntegerFlag('--sample', 25);
const topK = parseIntegerFlag('--topk', 10);

function parseIntegerFlag(name: string, fallback: number): number {
  const inline = args.find((value) => value.startsWith(`${name}=`));
  const raw = inline ? inline.slice(name.length + 1) : fallback.toString();
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function stableSha256(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function deterministicUuid(value: string): string {
  const hex = createHash('sha256').update(value).digest('hex');
  const bytes = hex.slice(0, 32).match(/.{1,2}/g) ?? [];
  if (bytes.length < 16) {
    return '00000000-0000-4000-8000-000000000000';
  }
  const b = bytes.map((chunk) => Number.parseInt(chunk, 16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  return [
    b.slice(0, 4).map((v) => v.toString(16).padStart(2, '0')).join(''),
    b.slice(4, 6).map((v) => v.toString(16).padStart(2, '0')).join(''),
    b.slice(6, 8).map((v) => v.toString(16).padStart(2, '0')).join(''),
    b.slice(8, 10).map((v) => v.toString(16).padStart(2, '0')).join(''),
    b.slice(10, 16).map((v) => v.toString(16).padStart(2, '0')).join(''),
  ].join('-');
}

function cosineSimilarity(a: readonly number[], b: readonly number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    const x = a[i];
    const y = b[i];
    dot += x * y;
    normA += x * x;
    normB += y * y;
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom > 0 ? dot / denom : 0;
}

function deriveLanguage(sourceRef: string): string {
  const lower = sourceRef.toLowerCase();
  if (lower.endsWith('.ts') || lower.endsWith('.tsx')) return 'typescript';
  if (lower.endsWith('.js') || lower.endsWith('.mjs') || lower.endsWith('.cjs')) return 'javascript';
  if (lower.endsWith('.py')) return 'python';
  if (lower.endsWith('.sql')) return 'sql';
  if (lower.endsWith('.json')) return 'json';
  if (lower.endsWith('.md')) return 'markdown';
  return 'unknown';
}

function normalizeText(value: unknown): string {
  return String(value ?? '').trim();
}

function makeQdrantPayload(row: {
  packet_key: string;
  source_ref: string;
  feature_id: string;
  title_id?: string | null;
  summary?: string | null;
  normalized_domain?: string | null;
  content_embedding_384: string | number[] | Float32Array;
}) {
  const embedding = parsePgVector(row.content_embedding_384);
  const contentHash = stableSha256({
    packet_key: row.packet_key,
    source_ref: row.source_ref,
    embedding_prefix: embedding.slice(0, 16),
    dimension: embedding.length,
  });
  const sparse = generateSparseVector(
    [
      `packet_key: ${row.packet_key}`,
      `source_ref: ${row.source_ref}`,
      `feature_id: ${row.feature_id}`,
      `title_id: ${row.title_id ?? ''}`,
      `summary: ${row.summary ?? ''}`,
      `domain_class: ${row.normalized_domain ?? ''}`,
    ]
      .filter(Boolean)
      .join('\n'),
  );

  const payload = {
    packet_key: row.packet_key,
    source_ref: row.source_ref,
    postgres_id: row.packet_key,
    content_hash: contentHash,
    contract_version: COLLECTION_CONTRACTS.codebase_chunks_384_hybrid.contractVersion,
    metadata_schema: 'atlas-semantic-metadata-v1',
    metadata_version: 1,
    file_path: row.source_ref,
    language: deriveLanguage(row.source_ref),
    embedding_model: EMBEDDINGGEMMA_PREFIX384_V1,
    embedding_dimension: 384,
    indexed_at: new Date().toISOString(),
    domain_class: row.normalized_domain ?? null,
    concepts: row.title_id ? [normalizeText(row.title_id)] : [],
    qdrant_point_id: row.packet_key,
    feature_id: row.feature_id,
    title_id: row.title_id ?? null,
    summary: row.summary ?? null,
    sparse_terms: sparse.indices.length,
  };

  validateQdrantPayload(payload as never);

  return {
    id: deterministicUuid(row.packet_key),
    vector: {
      [QDRANT_DENSE_VECTOR]: embedding,
      ...(sparse.indices.length > 0 ? { [QDRANT_SPARSE_VECTOR]: sparse } : {}),
    },
    payload,
    contentHash,
    embedding,
    sparse,
  };
}

async function qdrantFetch(pathname: string, init?: RequestInit) {
  const url = `${process.env.QDRANT_URL || 'http://127.0.0.1:6333'}${pathname}`;
  const res = await fetch(url, {
    headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
    ...init,
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Qdrant ${init?.method ?? 'GET'} ${pathname} -> ${res.status}: ${body}`);
  }
  return res.json();
}

async function ensureQdrantCollection() {
  try {
    await qdrantFetch(`/collections/${QDRANT_COLLECTION}`);
    return;
  } catch {
    await qdrantFetch(`/collections/${QDRANT_COLLECTION}`, {
      method: 'PUT',
      body: JSON.stringify({
        vectors: {
          [QDRANT_DENSE_VECTOR]: { size: 384, distance: 'Cosine' },
          [QDRANT_SUMMARY_VECTOR]: { size: 384, distance: 'Cosine' },
        },
        sparse_vectors: {
          [QDRANT_SPARSE_VECTOR]: {},
        },
        hnsw_config: { m: 16, ef_construct: 200 },
        on_disk_payload: true,
      }),
    });
  }
}

async function upsertQdrantPoints(points: Array<ReturnType<typeof makeQdrantPayload>>) {
  const batchSize = 128;
  let upserted = 0;
  for (let i = 0; i < points.length; i += batchSize) {
    const batch = points.slice(i, i + batchSize);
    await qdrantFetch(`/collections/${QDRANT_COLLECTION}/points?wait=true`, {
      method: 'PUT',
      body: JSON.stringify({
        points: batch.map((point) => ({
          id: point.id,
          vector: point.vector,
          payload: point.payload,
        })),
      }),
    });
    upserted += batch.length;
    process.stdout.write(`\r  Qdrant upserted ${upserted}/${points.length}`);
  }
  process.stdout.write('\n');
}

async function buildTurboVecShadow(inputPath: string, outputPath: string) {
  const script = path.join(REPO_ROOT, 'scripts', 'atlas', 'turbovec-gpu-consolidate.mjs');
  await new Promise<void>((resolve, reject) => {
    const child = spawn(process.execPath, [script, inputPath, outputPath], {
      cwd: REPO_ROOT,
      stdio: 'inherit',
      windowsHide: true,
    });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`TurboVec shadow build exited with code ${code}`));
    });
  });
}

async function bruteForceTopK(
  query: number[],
  rows: Array<{ packet_key: string; embedding: number[] }>,
  k: number,
) {
  const scored = rows.map((row) => ({
    packet_key: row.packet_key,
    score: cosineSimilarity(query, row.embedding),
  }));
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, k);
}

async function qdrantSearch(query: number[], k: number) {
  const response = await qdrantFetch(`/collections/${QDRANT_COLLECTION}/points/search`, {
    method: 'POST',
    body: JSON.stringify({
      vector: { name: QDRANT_DENSE_VECTOR, vector: query },
      limit: k,
      with_payload: true,
      with_vector: false,
    }),
  });

  const points = (response?.result ?? response?.points ?? []) as Array<{ id: string | number; score: number; payload?: Record<string, unknown> }>;
  return points.map((point) => ({
    packet_key: String(point.payload?.packet_key ?? point.id),
    score: Number(point.score ?? 0),
  }));
}

function loadTurboVecNeighbors(filePath: string) {
  return fs.readFile(filePath, 'utf8').then((text) =>
    text
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => JSON.parse(line) as { source_id: string; neighbor_id: string; similarity: number; topk_rank: number }),
  );
}

function topKOverlap(expected: Array<{ packet_key: string }>, actual: Array<{ packet_key: string }>) {
  const expectedSet = new Set(expected.map((row) => row.packet_key));
  let hit = 0;
  for (const row of actual) {
    if (expectedSet.has(row.packet_key)) hit++;
  }
  return expected.length > 0 ? hit / expected.length : 0;
}

async function main() {
  console.log(`🔨 Building 384-vector index lanes from snapshot (limit=${limit})`);
  console.log(`DuckDB threads: ${process.env.ATLAS_DUCKDB_THREADS || 'auto'}`);

  await fs.mkdir(SNAPSHOT_DIR, { recursive: true });

  const startedAt = performance.now();
  const db = await createAtlasDuckDB({ databasePath: path.join(SNAPSHOT_DIR, 'atlas-vector-index-lanes.duckdb') });

  try {
    const pgAlias = await attachCanonicalPostgres(db.connection);
    await buildVectorSnapshot(db.connection, pgAlias, {
      limit,
      outputTable: 'vector_snapshot_packets',
    });

    const rawRows = await db.connection.query(`
      SELECT packet_key, source_ref, feature_id, title_id, summary, normalized_domain, content_embedding_384
      FROM vector_snapshot_packets
      ORDER BY packet_key
    `);

    const rows = (rawRows as Array<Record<string, unknown>>).map((row) => {
      const embedding = parsePgVector(row.content_embedding_384);
      return {
        packet_key: String(row.packet_key ?? ''),
        source_ref: String(row.source_ref ?? ''),
        feature_id: String(row.feature_id ?? ''),
        title_id: row.title_id ? String(row.title_id) : null,
        summary: row.summary ? String(row.summary) : null,
        normalized_domain: row.normalized_domain ? String(row.normalized_domain) : null,
        embedding,
        norm: vectorNorm(embedding),
      };
    }).filter((row) => row.packet_key && row.source_ref && row.embedding.length === 384);

    const ndjson = rows.map((row) => JSON.stringify({
      id: deterministicUuid(row.packet_key),
      packet_key: row.packet_key,
      source_ref: row.source_ref,
      feature_id: row.feature_id,
      title_id: row.title_id,
      summary: row.summary,
      domain_class: row.normalized_domain,
      embedding: row.embedding,
    })).join('\n') + '\n';
    await fs.writeFile(INPUT_PATH, ndjson, 'utf8');

    const shadowRows = rows.slice(0, Math.min(rows.length, TURBOVEC_SHADOW_LIMIT));
    const shadowNdjson = shadowRows.map((row) => JSON.stringify({
      id: deterministicUuid(row.packet_key),
      packet_key: row.packet_key,
      source_ref: row.source_ref,
      feature_id: row.feature_id,
      title_id: row.title_id,
      summary: row.summary,
      domain_class: row.normalized_domain,
      embedding: row.embedding,
    })).join('\n') + '\n';
    await fs.writeFile(TURBOVEC_INPUT_PATH, shadowNdjson, 'utf8');

    const qdrantPoints = rows.map((row) => makeQdrantPayload({
      packet_key: row.packet_key,
      source_ref: row.source_ref,
      feature_id: row.feature_id,
      title_id: row.title_id,
      summary: row.summary,
      normalized_domain: row.normalized_domain,
      content_embedding_384: row.embedding,
    }));

    if (apply) {
      await ensureQdrantCollection();
      await upsertQdrantPoints(qdrantPoints);
    }

    await buildTurboVecShadow(TURBOVEC_INPUT_PATH, TURBOVEC_OUTPUT_PATH);

    const sampleRows = rows.slice(0, Math.min(sample, rows.length));
    const turboNeighbors = await loadTurboVecNeighbors(TURBOVEC_OUTPUT_PATH);
    const turboTopKBySource = new Map<string, Array<{ packet_key: string; score: number }>>();
    for (const edge of turboNeighbors) {
      const list = turboTopKBySource.get(edge.source_id) ?? [];
      list.push({ packet_key: edge.neighbor_id, score: edge.similarity });
      turboTopKBySource.set(edge.source_id, list);
    }

    const qdrantSamples = [];
    const bruteSamples = [];
    const turboSamples = [];

    for (const row of sampleRows) {
      const brute = await bruteForceTopK(row.embedding, rows, topK + 1);
      const qdrant = apply ? await qdrantSearch(row.embedding, topK) : [];
      const turbo = (turboTopKBySource.get(row.packet_key) ?? []).slice(0, topK);
      bruteSamples.push({
        packet_key: row.packet_key,
        topk: brute.slice(0, topK).map((item) => item.packet_key),
      });
      qdrantSamples.push({
        packet_key: row.packet_key,
        overlap: apply ? topKOverlap(brute.slice(0, topK).map((item) => ({ packet_key: item.packet_key })), qdrant) : null,
      });
      turboSamples.push({
        packet_key: row.packet_key,
        overlap: topKOverlap(brute.slice(0, topK).map((item) => ({ packet_key: item.packet_key })), turbo),
      });
    }

    const report = {
      generated_at: new Date().toISOString(),
      contract_version: EMBEDDINGGEMMA_PREFIX384_V1,
      snapshot: {
        limit,
        selected_rows: rows.length,
        input_path: path.relative(REPO_ROOT, INPUT_PATH),
        turbovec_input_path: path.relative(REPO_ROOT, TURBOVEC_INPUT_PATH),
        turbovec_output_path: path.relative(REPO_ROOT, TURBOVEC_OUTPUT_PATH),
        turbovec_shadow_limit: TURBOVEC_SHADOW_LIMIT,
        turbovec_shadow_rows: shadowRows.length,
      },
      qdrant: {
        collection: QDRANT_COLLECTION,
        applied: apply,
        upserted_rows: apply ? qdrantPoints.length : 0,
        sample_overlap_mean: apply && qdrantSamples.length
          ? qdrantSamples.reduce((sum, row) => sum + (row.overlap ?? 0), 0) / qdrantSamples.length
          : null,
      },
      turbovec: {
        shadow_built: true,
        shadow_rows: shadowRows.length,
        sample_overlap_mean: turboSamples.length
          ? turboSamples.reduce((sum, row) => sum + (row.overlap ?? 0), 0) / turboSamples.length
          : null,
      },
      reference: {
        brute_force: true,
        sample_rows: bruteSamples,
      },
      samples: {
        qdrant: qdrantSamples,
        turbovec: turboSamples,
      },
      duration_ms: Math.round(performance.now() - startedAt),
    };

    await fs.writeFile(REPORT_PATH, JSON.stringify(report, null, 2), 'utf8');
    console.log(`✓ Snapshot rows: ${rows.length}`);
    console.log(`✓ TurboVec shadow output: ${path.relative(REPO_ROOT, TURBOVEC_OUTPUT_PATH)}`);
    console.log(`✓ Report: ${path.relative(REPO_ROOT, REPORT_PATH)}`);
    if (apply) {
      console.log(`✓ Qdrant upserted: ${qdrantPoints.length}`);
      console.log(`✓ Qdrant sample overlap mean: ${report.qdrant.sample_overlap_mean?.toFixed(3) ?? 'n/a'}`);
    }
    console.log(`✓ TurboVec sample overlap mean: ${report.turbovec.sample_overlap_mean?.toFixed(3) ?? 'n/a'}`);
    console.log(`✅ Vector index lanes built in ${((performance.now() - startedAt) / 1000).toFixed(2)}s`);
  } finally {
    await db.close();
  }
}

main().catch((err) => {
  console.error(`❌ Vector lane build failed: ${err instanceof Error ? err.message : String(err)}`);
  if (err instanceof Error && err.stack) {
    console.error(err.stack);
  }
  process.exit(1);
});
