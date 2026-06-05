#!/usr/bin/env node
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { Pool } from 'pg';
import { config as loadEnv } from 'dotenv';

// Load env
for (const dir of [process.cwd(), resolve(process.cwd(), '..')]) {
  for (const envFile of ['.env', '.env.local', '.env.development', '.env.development.local']) {
    const envPath = resolve(dir, envFile);
    if (existsSync(envPath)) loadEnv({ path: envPath, override: false });
  }
}

const ROOT = resolve(process.cwd());
const REPORTS_DIR = join(ROOT, 'docs', 'reports');
const QDRANT_URL = process.env.QDRANT_URL ?? 'http://localhost:6333';
let QDRANT_COLLECTION = process.env.QDRANT_COLLECTION ?? 'codebase_chunks_768';
if (QDRANT_COLLECTION === 'legal_documents') {
  QDRANT_COLLECTION = 'codebase_chunks_768';
}
const DATABASE_URL =
  process.env.DATABASE_URL ??
  process.env.POSTGRES_URL ??
  'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';

const args = new Set(process.argv.slice(2));
const dryRun = args.has('--dry-run');
const sampleQdrant = args.has('--sample-qdrant');
const limitArg = [...process.argv.slice(2)].find((arg) => arg.startsWith('--limit='));
const limit = limitArg ? Math.max(1, Number(limitArg.split('=')[1]) || 25) : 25;
const batchSize = 100;

function writeJson(pathname, value) {
  mkdirSync(join(pathname, '..'), { recursive: true });
  writeFileSync(pathname, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function writeText(pathname, value) {
  mkdirSync(join(pathname, '..'), { recursive: true });
  writeFileSync(pathname, value, 'utf8');
}

function buildSourceRefs(relativePath) {
  const path = String(relativePath ?? '').trim();
  if (!path) return [];
  return [path];
}

async function buildQdrantPointIndex() {
  const index = new Map();
  let offset = null;
  let guard = 0;
  while (guard < 200) {
    guard++;
    const res = await fetch(`${QDRANT_URL}/collections/${QDRANT_COLLECTION}/points/scroll`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        limit: 256,
        offset,
        with_payload: true,
        with_vector: false,
      }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) break;
    const data = await res.json();
    const points = Array.isArray(data?.result?.points) ? data.result.points : [];
    for (const point of points) {
      const payload = point?.payload ?? {};
      const filePath = String(payload.file_path ?? payload.relativePath ?? '').trim();
      if (!filePath || point?.id === null || point?.id === undefined) continue;
      const ids = index.get(filePath) ?? [];
      ids.push(point.id);
      index.set(filePath, ids);
    }
    const next = data?.result?.next_page_offset;
    if (next === null || next === undefined || points.length === 0) break;
    offset = next;
  }
  return index;
}

async function qdrantCoverageSample(sampleLimit = 25) {
  try {
    const res = await fetch(`${QDRANT_URL}/collections/${QDRANT_COLLECTION}/points/scroll`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        limit: sampleLimit,
        with_payload: true,
        with_vector: false,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      return { ok: false, status: res.status, total: 0, withSourceRefs: 0, coverage: 0 };
    }
    const data = await res.json();
    const points = Array.isArray(data?.result?.points) ? data.result.points : [];
    const withSourceRefs = points.filter((point) => {
      const payload = point?.payload ?? {};
      const refs = Array.isArray(payload.sourceRefs)
        ? payload.sourceRefs
        : Array.isArray(payload.source_refs)
          ? payload.source_refs
          : [];
      return refs.length > 0;
    }).length;
    return {
      ok: true,
      status: res.status,
      total: points.length,
      withSourceRefs,
      coverage: points.length > 0 ? Number((withSourceRefs / points.length).toFixed(3)) : 0,
      sample: points,
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      total: 0,
      withSourceRefs: 0,
      coverage: 0,
      sample: [],
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function main() {
  if (!DATABASE_URL) {
    throw new Error('DATABASE_URL or POSTGRES_URL is required');
  }
  const pool = new Pool({ connectionString: DATABASE_URL, max: 2 });
  const startedAt = new Date().toISOString();
  const before = await qdrantCoverageSample(limit);
  const pointIndex = sampleQdrant ? new Map() : await buildQdrantPointIndex();

  let attempted = 0;
  let updated = 0;
  let skipped = 0;

  if (sampleQdrant) {
    const sample = before.ok ? await qdrantCoverageSample(limit) : { ok: false, total: 0, sample: [] };
    const points = Array.isArray(sample.sample) ? sample.sample : [];
    attempted = points.length;
    if (!dryRun) {
      await Promise.all(
        points.map(async (point) => {
          const payload = point?.payload ?? {};
          const relativePath = String(payload.relativePath ?? payload.file_path ?? '').trim();
          const sourceRefs = buildSourceRefs(relativePath);
          if (!point?.id || sourceRefs.length === 0) {
            skipped++;
            return;
          }
          try {
            const res = await fetch(`${QDRANT_URL}/collections/${QDRANT_COLLECTION}/points/payload`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                points: [point.id],
                payload: {
                  sourceRefs,
                  source_refs: sourceRefs,
                },
              }),
              signal: AbortSignal.timeout(15_000),
            });
            if (res.ok) {
              updated++;
            } else {
              skipped++;
            }
          } catch {
            skipped++;
          }
        })
      );
    } else {
      skipped = points.length;
    }
  } else {
    try {
      const { rows } = await pool.query(
        `SELECT DISTINCT relative_path
         FROM codebase_chunk_index
         WHERE relative_path IS NOT NULL
           AND relative_path <> ''
           AND relative_path <> '__unknown__'
         ORDER BY relative_path`
      );

      for (let i = 0; i < rows.length; i += batchSize) {
        const batch = rows.slice(i, i + batchSize);
        if (dryRun) {
          attempted += batch.length;
          skipped += batch.length;
          continue;
        }

        await Promise.all(
          batch.map(async (row) => {
            const sourceRefs = buildSourceRefs(row.relative_path);
            attempted++;
            if (sourceRefs.length === 0) {
              skipped++;
              return;
            }

            try {
              const pointIds = pointIndex.get(row.relative_path) ?? [];
              if (pointIds.length === 0) {
                skipped++;
                return;
              }
              const res = await fetch(`${QDRANT_URL}/collections/${QDRANT_COLLECTION}/points/payload`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  points: pointIds,
                  payload: {
                    sourceRefs,
                    source_refs: sourceRefs,
                  },
                }),
                signal: AbortSignal.timeout(15_000),
              });
              if (res.ok) {
                updated++;
              } else {
                skipped++;
              }
            } catch {
              skipped++;
            }
          })
        );
      }
    } finally {
      await pool.end().catch(() => {});
    }
  }

  const after = dryRun ? before : await qdrantCoverageSample(limit);
  const report = {
    generatedAt: new Date().toISOString(),
    startedAt,
    dryRun,
    sampleQdrant,
    sampleLimit: limit,
    qdrantUrl: QDRANT_URL,
    collection: QDRANT_COLLECTION,
    attempted,
    updated,
    skipped,
    qdrantBefore: before,
    qdrantAfter: after,
  };

  const jsonPath = join(REPORTS_DIR, 'qdrant-source-refs-backfill-latest.json');
  const mdPath = join(REPORTS_DIR, 'qdrant-source-refs-backfill-latest.md');
  writeJson(jsonPath, report);
  writeText(mdPath, [
    '# Qdrant SourceRefs Backfill',
    '',
    `Generated: ${report.generatedAt}`,
    `Dry run: ${dryRun ? 'yes' : 'no'}`,
    `Collection: ${QDRANT_COLLECTION}`,
    `Attempted: ${attempted}`,
    `Updated: ${updated}`,
    `Skipped: ${skipped}`,
    `Coverage before: ${before.coverage}`,
    `Coverage after: ${after.coverage}`,
  ].join('\n'));

  console.log(JSON.stringify({ ok: true, report }, null, 2));
}

main().catch((error) => {
  console.error('[atlas:qdrant:source-refs:backfill] Failed:', error);
  process.exitCode = 1;
});
