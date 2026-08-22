#!/usr/bin/env tsx

import { mkdir, readFile, writeFile } from 'node:fs/promises';
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
const PRODUCER_REVISION = 'atlas.code-revision-owner-canary.proof.v2';
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

function isCanonicalSourceRevision(value: string): boolean {
  return /^sha256:[a-f0-9]{64}$/i.test(value.trim());
}

function isLegacyGitRevision(value: string): boolean {
  return /^[a-f0-9]{40,64}$/i.test(value.trim());
}

function normalizeContentHash(value: unknown): string | null {
  const raw = String(value ?? '').trim().toLowerCase();
  if (/^[a-f0-9]{64}$/.test(raw)) return raw;
  const prefixed = /^sha256:([a-f0-9]{64})$/.exec(raw);
  return prefixed?.[1] ?? null;
}

function classifyStoredRevisionLayout(rows: Array<{ source_revision: unknown; content_hash: unknown }>): Pick<
  CodeRevisionStorageObservationV1,
  'sourceRevisionStorageSemantics' | 'sourceRevisionAuthorityField'
> {
  const sourceRevisions = rows
    .map((row) => String(row.source_revision ?? '').trim())
    .filter(Boolean);
  const contentHashes = rows
    .map((row) => normalizeContentHash(row.content_hash))
    .filter((value): value is string => Boolean(value));

  if (sourceRevisions.length === 0) {
    return {
      sourceRevisionStorageSemantics: 'UNKNOWN',
      sourceRevisionAuthorityField: 'NONE',
    };
  }

  if (sourceRevisions.every(isCanonicalSourceRevision)) {
    return {
      sourceRevisionStorageSemantics: 'CODE_SOURCE_REVISION_V1',
      sourceRevisionAuthorityField: 'SOURCE_REVISION',
    };
  }

  if (sourceRevisions.every(isLegacyGitRevision)) {
    if (contentHashes.length === rows.length && contentHashes.length > 0) {
      return {
        sourceRevisionStorageSemantics: 'LEGACY_GIT_SHA_WITH_CONTENT_HASH_V1',
        sourceRevisionAuthorityField: 'CONTENT_HASH',
      };
    }
    return {
      sourceRevisionStorageSemantics: 'LEGACY_GIT_SHA',
      sourceRevisionAuthorityField: 'NONE',
    };
  }

  return {
    sourceRevisionStorageSemantics: 'UNKNOWN',
    sourceRevisionAuthorityField: 'NONE',
  };
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
  let sourceRevisionAuthorityField: CodeRevisionStorageObservationV1['sourceRevisionAuthorityField'] = 'NONE';
  let persistedMatchingRows = 0;
  const notes: string[] = [
    'This proof is read-only and does not create or backfill Graphify lineage rows.',
    'CodeSourceRevisionV1 is sha256 of exact UTF-8 source bytes, encoded as sha256:<digest>.',
    'Historical graphify_files.source_revision may remain a Git provenance coordinate; it is never reinterpreted by this proof.',
    'Historical graphify_files.content_hash may serve as the exact-byte source-revision authority when it is a SHA-256 digest.',
    'A deterministic formula is not durable revision authority until a production writer and matching persisted canary are proven.',
  ];

  if (graphifyFilesPresent && fileColumns.has('source_revision') && fileColumns.has('content_hash')) {
    const sample = await pool.query(`
      SELECT source_revision, content_hash
      FROM public.graphify_files
      WHERE source_revision IS NOT NULL
        AND btrim(source_revision::text) <> ''
      ORDER BY source_revision
      LIMIT 100
    `);
    const layout = classifyStoredRevisionLayout(sample.rows);
    sourceRevisionStorageSemantics = layout.sourceRevisionStorageSemantics;
    sourceRevisionAuthorityField = layout.sourceRevisionAuthorityField;
    notes.push(`Observed graphify_files revision layout: ${sourceRevisionStorageSemantics}.`);
    notes.push(`Observed CodeSourceRevisionV1 authority field: ${sourceRevisionAuthorityField}.`);
  }

  if (graphifyRunsPresent && graphifyFilesPresent && requiredRunColumnsPresent && requiredFileColumnsPresent) {
    const digestCandidates = [
      authority.sourceContentDigest,
      `sha256:${authority.sourceContentDigest}`,
    ];

    if (sourceRevisionAuthorityField === 'SOURCE_REVISION') {
      const matching = await pool.query(`
        SELECT COUNT(*)::integer AS matches
        FROM public.graphify_files gf
        JOIN public.graphify_runs gr ON gr.run_id = gf.last_seen_run_id
        WHERE replace(gf.source_ref, '\\', '/') = $1
          AND lower(gr.repository_revision) = lower($2)
          AND gf.source_revision = $3
          AND lower(gf.content_hash) = ANY($4::text[])
      `, [authority.sourceRef, authority.workspaceRevision, authority.sourceRevision, digestCandidates]);
      persistedMatchingRows = Number(matching.rows[0]?.matches ?? 0);
    } else if (sourceRevisionAuthorityField === 'CONTENT_HASH') {
      const matching = await pool.query(`
        SELECT COUNT(*)::integer AS matches
        FROM public.graphify_files gf
        JOIN public.graphify_runs gr ON gr.run_id = gf.last_seen_run_id
        WHERE replace(gf.source_ref, '\\', '/') = $1
          AND lower(gr.repository_revision) = lower($2)
          AND lower(gf.content_hash) = ANY($3::text[])
          AND gf.source_revision ~* '^[a-f0-9]{40,64}$'
      `, [authority.sourceRef, authority.workspaceRevision, digestCandidates]);
      persistedMatchingRows = Number(matching.rows[0]?.matches ?? 0);
    }
  }

  // Repository census still has no trustworthy enrolled origin writer. Keep
  // this false until a canonical Graphify source-inventory writer computes
  // Git HEAD and exact-byte source digest inside its own write boundary.
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
    sourceRevisionAuthorityField,
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
    sourceRevisionStorageSemantics: receipt.storage.sourceRevisionStorageSemantics,
    sourceRevisionAuthorityField: receipt.storage.sourceRevisionAuthorityField,
    persistedMatchingRows: receipt.storage.persistedMatchingRows,
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
