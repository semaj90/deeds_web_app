#!/usr/bin/env tsx

import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

import { loadAtlasEnv } from './load-atlas-env.mjs';
import { deriveCodeRevisionAuthorityV1 } from '$lib/server/atlas/indexing/code-revision-authority-v1.js';
import {
  classifyCodeRevisionOwnerCanaryV1,
  type CodeRevisionStorageObservationV1,
} from '$lib/server/atlas/indexing/code-revision-owner-canary-v1.js';

await loadAtlasEnv();

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FRONTEND = path.resolve(HERE, '../..');
const REPO_ROOT = path.resolve(FRONTEND, '..');
const DATABASE_URL = process.env.DATABASE_URL;
const PRODUCER_REVISION = 'atlas.code-revision-owner-canary.proof.v1';
const SAMPLE_SOURCE = path.resolve(
  REPO_ROOT,
  process.env.ATLAS_CODE_REVISION_CANARY_SOURCE
    ?? 'sveltekit-frontend/src/lib/server/atlas/indexing/code-revision-authority-v1.ts',
);
const OUTPUT = path.resolve(
  REPO_ROOT,
  process.env.ATLAS_CODE_REVISION_CANARY_OUT
    ?? 'docs/reports/code-revision-owner-canary.json',
);

if (!DATABASE_URL) throw new Error('DATABASE_URL_REQUIRED');

async function tableExists(pool: pg.Pool, tableName: string): Promise<boolean> {
  const result = await pool.query(`SELECT to_regclass($1) IS NOT NULL AS present`, [`public.${tableName}`]);
  return Boolean(result.rows[0]?.present);
}

async function columns(pool: pg.Pool, tableName: string): Promise<Set<string>> {
  const result = await pool.query(`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = $1
  `, [tableName]);
  return new Set(result.rows.map((row) => String(row.column_name)));
}

function classifyStoredSourceRevision(values: string[]): CodeRevisionStorageObservationV1['sourceRevisionStorageSemantics'] {
  const meaningful = values.map((value) => value.trim()).filter(Boolean);
  if (meaningful.length === 0) return 'UNKNOWN';
  if (meaningful.every((value) => /^sha256:[a-f0-9]{64}$/i.test(value))) return 'CODE_SOURCE_REVISION_V1';
  if (meaningful.every((value) => /^[a-f0-9]{40,64}$/i.test(value))) return 'LEGACY_GIT_SHA';
  return 'UNKNOWN';
}

const sourceText = await readFile(SAMPLE_SOURCE, 'utf8');
const authority = deriveCodeRevisionAuthorityV1({
  workspaceRoot: REPO_ROOT,
  absoluteSourcePath: SAMPLE_SOURCE,
  sourceText,
  producerRevision: PRODUCER_REVISION,
  canonicalWritesAllowed: false,
});

const pool = new pg.Pool({
  connectionString: DATABASE_URL,
  max: 1,
  connectionTimeoutMillis: 5_000,
  statement_timeout: 10_000,
});

await pool.query('BEGIN READ ONLY');
try {
  const graphifyRunsPresent = await tableExists(pool, 'graphify_runs');
  const graphifyFilesPresent = await tableExists(pool, 'graphify_files');
  const runColumns = graphifyRunsPresent ? await columns(pool, 'graphify_runs') : new Set<string>();
  const fileColumns = graphifyFilesPresent ? await columns(pool, 'graphify_files') : new Set<string>();
  const requiredRunColumns = ['run_id', 'repository_revision'];
  const requiredFileColumns = ['source_ref', 'source_revision', 'content_hash', 'last_seen_run_id'];
  const requiredRunColumnsPresent = requiredRunColumns.every((column) => runColumns.has(column));
  const requiredFileColumnsPresent = requiredFileColumns.every((column) => fileColumns.has(column));

  let sourceRevisionStorageSemantics: CodeRevisionStorageObservationV1['sourceRevisionStorageSemantics'] = 'UNKNOWN';
  let persistedMatchingRows = 0;
  const notes: string[] = [
    'This proof is read-only and does not create or backfill Graphify lineage rows.',
    'Code source revision semantics are defined by CodeSourceRevisionV1: sha256 of exact UTF-8 source bytes.',
    'A deterministic formula is not durable revision authority until a production writer and matching persisted canary are proven.',
  ];

  if (graphifyFilesPresent && fileColumns.has('source_revision')) {
    const sample = await pool.query(`
      SELECT source_revision
      FROM public.graphify_files
      WHERE source_revision IS NOT NULL AND btrim(source_revision::text) <> ''
      ORDER BY source_revision
      LIMIT 100
    `);
    sourceRevisionStorageSemantics = classifyStoredSourceRevision(
      sample.rows.map((row) => String(row.source_revision)),
    );
    notes.push(`Observed graphify_files source_revision semantics: ${sourceRevisionStorageSemantics}.`);
  }

  if (graphifyRunsPresent && graphifyFilesPresent && requiredRunColumnsPresent && requiredFileColumnsPresent) {
    const contentHashCandidates = [
      authority.sourceContentDigest,
      `sha256:${authority.sourceContentDigest}`,
    ];
    const matching = await pool.query(`
      SELECT COUNT(*)::integer AS matches
      FROM public.graphify_files gf
      JOIN public.graphify_runs gr ON gr.run_id = gf.last_seen_run_id
      WHERE replace(gf.source_ref, '\\', '/') = $1
        AND lower(gr.repository_revision) = lower($2)
        AND gf.source_revision = $3
        AND gf.content_hash = ANY($4::text[])
    `, [authority.sourceRef, authority.workspaceRevision, authority.sourceRevision, contentHashCandidates]);
    persistedMatchingRows = Number(matching.rows[0]?.matches ?? 0);
  }

  // The repository census found only the legacy/corrupted scripts/atlas/index-engine.ts
  // as a graphify_files writer. Do not treat that historical file as an enrolled
  // production revision-origin owner. A future integration must explicitly replace
  // this false value when the new authority writer is wired into the canonical job.
  const productionWriterPath: string | null = null;
  const productionWriterPresent = false;

  const storage: CodeRevisionStorageObservationV1 = {
    graphifyRunsPresent,
    graphifyFilesPresent,
    requiredRunColumnsPresent,
    requiredFileColumnsPresent,
    productionWriterPath,
    productionWriterPresent,
    productionWriterCreatesWorkspaceRevision: false,
    productionWriterCreatesSourceRevision: false,
    persistedMatchingRows,
    sourceRevisionStorageSemantics,
    notes,
  };

  const receipt = classifyCodeRevisionOwnerCanaryV1({
    authority,
    storage,
    producerRevision: PRODUCER_REVISION,
  });

  await mkdir(path.dirname(OUTPUT), { recursive: true });
  await writeFile(OUTPUT, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({
    status: receipt.status,
    workspaceRevision: receipt.authority.workspaceRevision,
    sourceRevision: receipt.authority.sourceRevision,
    sourceRef: receipt.authority.sourceRef,
    durableOwnerBound: receipt.durableOwnerBound,
    revisionOwnerProven: receipt.revisionOwnerProven,
    fanoutMayConsumeAsCanonical: receipt.fanoutMayConsumeAsCanonical,
    blockers: receipt.blockers,
    canonicalWriteAttempted: receipt.canonicalWriteAttempted,
    output: OUTPUT,
  }, null, 2));

  if (!receipt.revisionOwnerProven) process.exitCode = 3;
} finally {
  await pool.query('ROLLBACK');
  await pool.end();
}
