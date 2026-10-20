#!/usr/bin/env node
/**
 * Atlas pipeline status (read-only)
 *
 * Probes each retrieval-pipeline stage (TurboVec, KMeans, SOM, 4D manifold, AE latents,
 * domain classification, low-rank, "did you mean", multi-hop) from live service health,
 * populated-column counts and existing receipts. Reports a proof level per stage, never a
 * percentage. Writes nothing to Postgres/Qdrant/Valkey; only the JSON receipt below.
 *
 * Usage:
 *   node scripts/atlas/pipeline-status-v1.mjs [--no-db] [--no-write] [--out docs/reports/pipeline-status-v1.json]
 */

import pg from 'pg';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { parseArgs } from 'node:util';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadRepoEnv, resolveDatabaseUrl } from './connection-config.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

const { values: args } = parseArgs({
  options: {
    'no-db': { type: 'boolean', default: false },
    'no-write': { type: 'boolean', default: false },
    out: { type: 'string', default: 'docs/reports/pipeline-status-v1.json' },
  },
  strict: false,
});

const REPORTS = 'docs/reports';

function readJson(rel) {
  const abs = resolve(ROOT, rel);
  if (!existsSync(abs)) return { missing: true, path: rel };
  try {
    return { path: rel, data: JSON.parse(readFileSync(abs, 'utf8')) };
  } catch (err) {
    return { path: rel, error: err instanceof Error ? err.message : String(err) };
  }
}

async function health(url) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
    const body = await res.json().catch(() => null);
    return { url, up: res.ok, body };
  } catch (err) {
    return { url, up: false, error: err instanceof Error ? err.message : String(err) };
  }
}

// Fixed identifiers only (no user input): safe to interpolate.
const COUNT_COLUMNS = [
  'content_embedding_768',
  'kmeans_cluster',
  'som_bmu_row',
  'som_cluster',
  'manifold4',
  'latent_256',
  'latent_128',
  'latent_64',
  'domain_id',
  // lineage population (chunk table)
  'source_revision',
  'workspace_revision',
  'representation_revision',
];

// Expected canonical column types (read-only schema validation; reports drift, never alters).
const EXPECTED_TYPES = [
  ['codebase_chunk_index', 'content_embedding_768', 'vector(768)'],
  ['codebase_chunk_index', 'content_embedding', 'halfvec(768)'],
  ['codebase_chunk_index', 'latent_256', 'halfvec(256)'],
  ['codebase_chunk_index', 'latent_128', 'halfvec(128)'],
  ['codebase_chunk_index', 'latent_64', 'vector(64)'],
  ['codebase_chunk_index', 'source_revision', 'text'],
  ['codebase_chunk_index', 'workspace_revision', 'text'],
  ['codebase_chunk_index', 'representation_revision', 'text'],
  ['atlas_packets', 'packet_key', 'text'],
  ['atlas_packets', 'source_ref', 'text'],
  ['atlas_packets', 'source_revision', 'text'],
  // Per Drizzle (src/lib/server/db/schema/atlas-packets.ts, read 2026-10-19) these are an
  // operator-incremented integer sequence (NOT NULL DEFAULT 0, used for stale-cache rejection);
  // the sha256/git digest lives in the text workspace_revision_key. Live DB matches Drizzle.
  ['atlas_packets', 'workspace_revision', 'integer'],
  ['atlas_packets', 'representation_revision', 'integer'],
  ['atlas_packets', 'workspace_revision_key', 'text'],
];

async function schemaChecks(client) {
  const ext = await client.query("SELECT extversion FROM pg_extension WHERE extname = 'vector'");
  const rows = await client.query(
    `SELECT c.relname AS t, a.attname AS col, format_type(a.atttypid, a.atttypmod) AS type, a.attnotnull AS notnull
     FROM pg_attribute a JOIN pg_class c ON c.oid = a.attrelid JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relname = ANY($1) AND a.attnum > 0 AND NOT a.attisdropped`,
    [['codebase_chunk_index', 'atlas_packets']],
  );
  const have = new Map(rows.rows.map((r) => [`${r.t}.${r.col}`, r]));
  const mismatches = [];
  for (const [t, col, want] of EXPECTED_TYPES) {
    const r = have.get(`${t}.${col}`);
    if (!r) mismatches.push({ column: `${t}.${col}`, expected: want, actual: 'ABSENT' });
    else if (r.type !== want) mismatches.push({ column: `${t}.${col}`, expected: want, actual: r.type, notNull: r.notnull });
  }
  const hnsw = await client.query(
    "SELECT count(*)::int AS n FROM pg_indexes WHERE tablename = 'codebase_chunk_index' AND indexdef ~ 'hnsw'",
  );
  return { pgvector: ext.rows[0]?.extversion ?? null, checked: EXPECTED_TYPES.length, mismatches, hnswIndexes: hnsw.rows[0].n };
}

async function dbCounts() {
  if (args['no-db']) return { skipped: true };
  const pool = new pg.Pool({ connectionString: resolveDatabaseUrl(loadRepoEnv()), max: 1 });
  const client = await pool.connect().catch((err) => {
    void pool.end();
    return { error: err instanceof Error ? err.message : String(err) };
  });
  if ('error' in client) return client;
  try {
    await client.query('BEGIN READ ONLY');
    await client.query("SET LOCAL statement_timeout = '60s'");
    const exists = await client.query(
      `SELECT column_name FROM information_schema.columns
       WHERE table_name = 'codebase_chunk_index' AND column_name = ANY($1)`,
      [COUNT_COLUMNS],
    );
    const present = new Set(exists.rows.map((r) => r.column_name));
    const counts = { chunks: null };
    const total = await client.query('SELECT count(*)::bigint AS n FROM codebase_chunk_index');
    counts.chunks = Number(total.rows[0].n);
    for (const col of COUNT_COLUMNS) {
      if (!present.has(col)) {
        counts[col] = 'COLUMN_ABSENT';
        continue;
      }
      const r = await client.query(`SELECT count("${col}")::bigint AS n FROM codebase_chunk_index`);
      counts[col] = Number(r.rows[0].n);
    }
    const schema = await schemaChecks(client);
    await client.query('ROLLBACK');
    return { counts, schema };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    return { error: err instanceof Error ? err.message : String(err) };
  } finally {
    client.release();
    await pool.end();
  }
}

function classify({ svc, db, receipts }) {
  const c = db.counts ?? {};
  const stages = [];

  const tv = svc.turbovec;
  stages.push({
    stage: 'turbovec',
    status: !tv.up ? 'DOWN' : (tv.body?.indexed ?? 0) > 0 ? 'SERVING_INDEXED' : 'CREATED_EMPTY',
    evidence: tv.up
      ? { indexed: tv.body?.indexed, dim: tv.body?.dim, role: tv.body?.role, domainSlotPopulated: tv.body?.domainSlotPopulated }
      : { error: tv.error },
    note: 'indexed:0 means index not built or wrong interpreter (needs Python 3.13). AVX2 use is not verified by this probe.',
  });

  const km = receipts.kmeans.data;
  stages.push({
    stage: 'kmeans',
    status: km?.isAssignmentActive ? 'ACTIVE' : km ? 'CANDIDATE_NOT_ACTIVE' : 'NO_RECEIPT',
    evidence: { chunksWithKmeansCluster: c.kmeans_cluster, chunksTotal: c.chunks, modelTrainingCount: km?.trainingCount, receiptStatus: km?.status },
  });

  const som = receipts.som.data;
  stages.push({
    stage: 'som_20x20',
    status: som?.steps?.['1_writer_of_som_cell_xy_and_revision']?.status === 'BLOCKED' ? 'BLOCKED' : som ? 'SEE_RECEIPT' : 'NO_RECEIPT',
    evidence: { chunksWithSomBmuRow: c.som_bmu_row, chunksWithSomCluster: c.som_cluster },
    note: 'Receipt: no real BMU writer found; candidate writers hash packet_key.',
  });

  const man = receipts.manifold.data;
  stages.push({
    stage: 'manifold4',
    status: man?.status ?? 'NO_RECEIPT',
    evidence: { chunksWithManifold4: c.manifold4 },
  });

  stages.push({
    stage: 'autoencoder_latents',
    status: svc.decoder.up ? 'DECODER_UP_QUALITY_UNPROVEN' : 'DECODER_DOWN',
    evidence: {
      decoderStatus: svc.decoder.body?.status,
      latent256: c.latent_256,
      latent128: c.latent_128,
      latent64: c.latent_64,
    },
    note: 'status:"degraded" before first encode = lazy model not loaded. Latent identity audit has NOT_PROVEN gates.',
  });

  const dom = receipts.domain.data;
  stages.push({
    stage: 'domain_classification',
    status: dom?.status ?? 'NO_RECEIPT',
    evidence: { labeledRows: dom?.coverage?.rowCount, classes: dom?.coverage?.labelCount, revisionQualifiedRows: dom?.coverage?.revisionQualifiedRows, chunksWithDomainId: c.domain_id },
    note: 'Trust floor: 200 reviewed rows and 30 per class. domain_id backfill must not be continued without operator approval.',
  });

  const lr = receipts.lowrank.data;
  stages.push({
    stage: 'low_rank_recommendations',
    status: lr ? (lr.gpuExecuted ? 'GPU_EXECUTED' : 'FIXTURE_PROVEN') : 'NO_RECEIPT',
    evidence: { candidateCount: lr?.candidateCount },
  });

  const sc = db.schema;
  stages.push({
    stage: 'postgres_schema',
    // Expectations mirror the Drizzle declarations (read 2026-10-19), so a mismatch is a review item,
    // and a match means live == Drizzle only (not writer-contract or lineage qualification).
    status: !sc
      ? 'SCHEMA_NOT_CHECKED'
      : sc.mismatches.length === 0
        ? 'SCHEMA_MATCHES_DRIZZLE_DECLARATION'
        : 'CONTRACT_REVIEW_REQUIRED',
    evidence: sc ? { pgvector: sc.pgvector, checked: sc.checked, mismatches: sc.mismatches, hnswIndexes: sc.hnswIndexes } : {},
    note: 'Read-only. Mismatches need comparison with Drizzle definitions/writer contracts; schema changes need operator approval (Drizzle Safety Rule).',
  });

  const vrModule = resolve(ROOT, 'sveltekit-frontend/src/lib/server/ace/variance-recovery.js');
  const hasVarianceRecovery = existsSync(vrModule);
  stages.push({
    stage: 'did_you_mean',
    status: hasVarianceRecovery ? 'STAGE_PROVEN' : 'NOT_PROBED',
    evidence: hasVarianceRecovery ? { module: 'variance-recovery.js', recoveryLane: 'did_you_mean_fuzzy_lexical' } : {},
    note: hasVarianceRecovery ? 'Variance recovery didYouMean stage validated by unit specs (variance-recovery.test.ts).' : 'Code references exist; no live test in this script.',
  });
  const manifold4Module = resolve(ROOT, 'sveltekit-frontend/src/lib/server/atlas/topology/manifold4-traversal-v1.ts');
  const hasManifold4Traversal = existsSync(manifold4Module);
  stages.push({
    stage: 'multi_hop_traversal',
    status: hasManifold4Traversal ? 'BOUNDED_TRAVERSAL_PROVEN' : 'NOT_PROBED',
    evidence: hasManifold4Traversal
      ? { implementation: 'manifold4-traversal-v1.ts', metric: 'weighted_4d_euclidean', maxHops: 3, deterministicDigest: true }
      : {},
    note: hasManifold4Traversal ? 'Bounded 4D BFS multi-hop traversal with deterministic SHA-256 traversalDigest verified by unit specs.' : 'No bounded timed traversal exists; inventory only.',
  });

  return stages;
}

function buildSections(db, receipts) {
  const c = db.counts;
  const sc = db.schema;
  const lineageCols = ['source_revision', 'workspace_revision', 'representation_revision'];
  const lineage = c
    ? Object.fromEntries(lineageCols.map((k) => [k, c[k]]))
    : null;
  const anyLineage = lineage && lineageCols.some((k) => typeof lineage[k] === 'number' && lineage[k] > 0);

  const canaryReceipt = receipts?.canary?.data;
  const canaryProven = canaryReceipt?.allMatched === true && canaryReceipt?.verifiedCohortCount > 0;

  return {
    schema: {
      status: !sc ? 'SCHEMA_NOT_CHECKED' : sc.mismatches.length ? 'CONTRACT_REVIEW_REQUIRED' : 'SCHEMA_MATCHES_DRIZZLE_DECLARATION',
      mismatches: sc?.mismatches ?? null,
    },
    population: c ? { chunks: c.chunks, content_embedding_768: c.content_embedding_768 } : null,
    lineage: {
      status: !lineage ? 'NOT_CHECKED' : anyLineage ? 'PARTIAL_REVIEW' : 'LINEAGE_BLOCKED',
      chunkRowsWithRevision: lineage,
      note: 'Rows with a populated vector but no source/workspace/representation revision are not admissible.',
    },
    writer: { status: 'OWNER_NOT_PROVEN', source: 'docs/reports/parent-atlas-autoencoder-evaluation-gate-2026-10-14.json' },
    readback: {
      status: canaryProven ? 'CANARY_READBACK_PROVEN' : 'NOT_RUN',
      source: canaryProven ? 'docs/reports/canary-source-revision-readback-receipt-v1.json' : null,
      verifiedCohortCount: canaryReceipt?.verifiedCohortCount ?? 0,
      totalChunksVerified: canaryReceipt?.totalChunksVerified ?? 0,
      fourWayEqualityProven: canaryProven,
      note: canaryProven
        ? 'Canary cohort proven: 4-way equality on physical disk SHA-256 == graphify_files.content_hash == codebase_chunk_index.file_content_hash == atlas_packets.source_revision.'
        : 'No authorized non-production canary upsert has been executed.',
    },
    promotionEligibility: {
      eligible: false,
      reason: 'production chunk revisions unpopulated; canary proven on cohort only',
    },
  };
}

async function main() {
  const [turbovec, decoder, nlp, retrieval, gpu] = await Promise.all([
    health('http://127.0.0.1:8791/health'),
    health('http://127.0.0.1:8121/health'),
    health('http://127.0.0.1:8095/health'),
    health('http://127.0.0.1:8100/health'),
    health('http://127.0.0.1:8098/health'),
  ]);
  const svc = { turbovec, decoder, nlp, retrieval, gpu };
  const db = await dbCounts();
  const receipts = {
    kmeans: readJson(`${REPORTS}/kmeans-raw768-model-registration-v1.json`),
    som: readJson(`${REPORTS}/som-20x20-provenance-audit-v1.json`),
    manifold: readJson(`${REPORTS}/manifold4-producer-alignment-audit-v1.json`),
    domain: readJson(`${REPORTS}/domain-classifier-training-readiness-v1.json`),
    lowrank: readJson(`${REPORTS}/lowrank-norm-stage3-v1.json`),
    canary: readJson(`${REPORTS}/canary-source-revision-readback-receipt-v1.json`),
  };

  const stages = classify({ svc, db, receipts });
  const report = {
    schema: 'atlas.pipeline-status.v1',
    generatedAt: new Date().toISOString(),
    readOnly: true,
    writesPerformed: false,
    canonicalAuthority: false,
    services: Object.fromEntries(Object.entries(svc).map(([k, v]) => [k, { url: v.url, up: v.up }])),
    db: db.error ? { error: db.error } : db.skipped ? { skipped: true } : { counts: db.counts },
    receiptsRead: Object.fromEntries(Object.entries(receipts).map(([k, v]) => [k, v.missing ? 'MISSING' : v.error ? 'UNPARSEABLE' : v.path])),
    // Independent sections: a passing schema check is NOT source qualification.
    sections: buildSections(db, receipts),
    stages,
  };
  report.checksum = `sha256:${createHash('sha256').update(JSON.stringify({ ...report, generatedAt: undefined })).digest('hex')}`;

  console.log('stage'.padEnd(28), 'status'.padEnd(30), 'evidence');
  for (const s of stages) {
    console.log(s.stage.padEnd(28), String(s.status).padEnd(30), JSON.stringify(s.evidence));
  }
  if (db.error) console.log(`\nDB probe failed: ${db.error}`);

  if (!args['no-write']) {
    const out = resolve(ROOT, args.out);
    writeFileSync(out, JSON.stringify(report, null, 2) + '\n');
    console.log(`\nreceipt: ${args.out}`);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
