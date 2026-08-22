#!/usr/bin/env tsx

import { access, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

import { loadAtlasEnv } from './load-atlas-env.mjs';
import { deriveCodeRevisionAuthorityV1 } from '$lib/server/atlas/indexing/code-revision-authority-v1.js';
import {
  classifyCodeRevisionOwnerCanaryV1,
  type CodeRevisionStorageObservationV1,
} from '$lib/server/atlas/indexing/code-revision-owner-canary-v1.js';
import { materializeWorkspaceRevisionOriginV1 } from '$lib/server/atlas/indexing/workspace-revision-origin-runtime-v1.js';

await loadAtlasEnv();

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FRONTEND = path.resolve(HERE, '../..');
const REPO_ROOT = path.resolve(FRONTEND, '..');
const DATABASE_URL = process.env.DATABASE_URL;
const PRODUCER_REVISION = 'atlas.code-revision-owner-canary.proof.v4';
const CANONICAL_WRITER_RELATIVE = 'sveltekit-frontend/src/lib/server/atlas/indexing/graphify-source-inventory-writer-v1.ts';
const CANONICAL_WRITER = path.resolve(REPO_ROOT, CANONICAL_WRITER_RELATIVE);
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

function classifyLegacyLayout(rows: Array<{ source_revision: unknown; content_hash: unknown }>): Pick<
  CodeRevisionStorageObservationV1,
  'sourceRevisionStorageSemantics' | 'sourceRevisionAuthorityField'
> {
  const sourceRevisions = rows.map((row) => String(row.source_revision ?? '').trim()).filter(Boolean);
  const contentHashes = rows.map((row) => normalizeContentHash(row.content_hash));
  if (sourceRevisions.length === 0) return { sourceRevisionStorageSemantics: 'UNKNOWN', sourceRevisionAuthorityField: 'NONE' };
  if (sourceRevisions.every(isCanonicalSourceRevision)) {
    return { sourceRevisionStorageSemantics: 'CODE_SOURCE_REVISION_V1', sourceRevisionAuthorityField: 'SOURCE_REVISION' };
  }
  if (sourceRevisions.every(isLegacyGitRevision)) {
    if (contentHashes.length === rows.length && contentHashes.every(Boolean)) {
      return { sourceRevisionStorageSemantics: 'LEGACY_GIT_SHA_WITH_CONTENT_HASH_V1', sourceRevisionAuthorityField: 'CONTENT_HASH' };
    }
    return { sourceRevisionStorageSemantics: 'LEGACY_GIT_SHA', sourceRevisionAuthorityField: 'NONE' };
  }
  return { sourceRevisionStorageSemantics: 'UNKNOWN', sourceRevisionAuthorityField: 'NONE' };
}

const origin = materializeWorkspaceRevisionOriginV1({
  workspaceRoot: REPO_ROOT,
  repositoryId: 'semaj90/deeds_web_app',
  producerRevision: PRODUCER_REVISION,
});
const relativeSample = path.relative(REPO_ROOT, SAMPLE_SOURCE).replaceAll('\\', '/');
const sampleBinding = origin.bindings.find((binding) => binding.sourceRef === relativeSample);
if (!sampleBinding) throw new Error(`CODE_REVISION_CANARY_SOURCE_NOT_IN_WORKSPACE_MANIFEST:${relativeSample}`);
const authority = deriveCodeRevisionAuthorityV1({
  workspaceRoot: REPO_ROOT,
  absoluteSourcePath: SAMPLE_SOURCE,
  workspaceRecord: origin.record,
  sourceBinding: sampleBinding,
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
  const logicalWorkspaceRevisionColumnsPresent = runColumns.has('workspace_revision') && runColumns.has('source_manifest_digest');
  const logicalCodeSourceRevisionColumnPresent = fileColumns.has('code_source_revision');

  let sourceRevisionStorageSemantics: CodeRevisionStorageObservationV1['sourceRevisionStorageSemantics'] = 'UNKNOWN';
  let sourceRevisionAuthorityField: CodeRevisionStorageObservationV1['sourceRevisionAuthorityField'] = 'NONE';
  let persistedMatchingRows = 0;
  const notes: string[] = [
    'Read-only proof; no Graphify lineage row is created or backfilled.',
    'workspaceRevision comes from WorkspaceRevisionRecordV1: sha256 of the sorted exact indexed source-byte manifest.',
    'graphify_runs.repository_revision is historical Git provenance and is compared only to baseGitCommitOid.',
    'CodeSourceRevisionV1 is sha256:<exact source byte digest>.',
    'The v2 durable layout stores logical workspace_revision and code_source_revision without reinterpreting legacy provenance columns.',
  ];

  if (logicalWorkspaceRevisionColumnsPresent && logicalCodeSourceRevisionColumnPresent) {
    sourceRevisionStorageSemantics = 'GRAPHIFY_REVISION_AUTHORITY_V2';
    sourceRevisionAuthorityField = 'CODE_SOURCE_REVISION';
    notes.push('Graphify revision-authority v2 columns are present.');
  } else if (graphifyFilesPresent && fileColumns.has('source_revision') && fileColumns.has('content_hash')) {
    const sample = await pool.query(`
      SELECT source_revision, content_hash
      FROM public.graphify_files
      WHERE source_revision IS NOT NULL
        AND btrim(source_revision::text) <> ''
      ORDER BY source_revision
      LIMIT 100
    `);
    const layout = classifyLegacyLayout(sample.rows);
    sourceRevisionStorageSemantics = layout.sourceRevisionStorageSemantics;
    sourceRevisionAuthorityField = layout.sourceRevisionAuthorityField;
    notes.push(`Pre-v2 compatibility layout: ${sourceRevisionStorageSemantics}; safe for migration decision only.`);
  }

  if (graphifyRunsPresent && graphifyFilesPresent && requiredRunColumnsPresent && requiredFileColumnsPresent
      && logicalWorkspaceRevisionColumnsPresent && logicalCodeSourceRevisionColumnPresent) {
    const matching = await pool.query(`
      SELECT COUNT(*)::integer AS matches
      FROM public.graphify_files gf
      JOIN public.graphify_runs gr ON gr.run_id = gf.last_seen_run_id
      WHERE replace(gf.source_ref, '\\', '/') = $1
        AND lower(gr.repository_revision) = lower($2)
        AND gr.workspace_revision = $3
        AND lower(gr.source_manifest_digest) = lower($4)
        AND gf.code_source_revision = $5
        AND lower(gf.content_hash) = lower($6)
        AND gf.byte_length = $7
    `, [
      authority.sourceRef,
      authority.baseGitCommitOid,
      authority.workspaceRevision,
      authority.workspaceSourceManifestDigest,
      authority.sourceRevision,
      authority.sourceContentDigest,
      authority.sourceByteLength,
    ]);
    persistedMatchingRows = Number(matching.rows[0]?.matches ?? 0);
  }

  let productionWriterPresent = false;
  try {
    await access(CANONICAL_WRITER);
    productionWriterPresent = true;
  } catch {
    productionWriterPresent = false;
  }
  const productionWriterPath = productionWriterPresent ? CANONICAL_WRITER_RELATIVE : null;
  if (productionWriterPresent) notes.push(`Canonical writer source present: ${CANONICAL_WRITER_RELATIVE}.`);

  const storage: CodeRevisionStorageObservationV1 = {
    graphifyRunsPresent,
    graphifyFilesPresent,
    requiredRunColumnsPresent,
    requiredFileColumnsPresent,
    logicalWorkspaceRevisionColumnsPresent,
    logicalCodeSourceRevisionColumnPresent,
    productionWriterPath,
    productionWriterPresent,
    productionWriterCreatesWorkspaceRevision: productionWriterPresent,
    productionWriterCreatesSourceRevision: productionWriterPresent,
    persistedMatchingRows,
    sourceRevisionStorageSemantics,
    sourceRevisionAuthorityField,
    notes,
  };

  const receipt = classifyCodeRevisionOwnerCanaryV1({ authority, storage, producerRevision: PRODUCER_REVISION });

  await mkdir(path.dirname(OUTPUT), { recursive: true });
  await writeFile(OUTPUT, `${JSON.stringify({ ...receipt, workspaceOrigin: { record: origin.record, skipped: origin.skipped } }, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({
    status: receipt.status,
    workspaceRevision: receipt.authority.workspaceRevision,
    baseGitCommitOid: receipt.authority.baseGitCommitOid,
    sourceRevision: receipt.authority.sourceRevision,
    sourceRef: receipt.authority.sourceRef,
    sourceRevisionStorageSemantics: receipt.storage.sourceRevisionStorageSemantics,
    sourceRevisionAuthorityField: receipt.storage.sourceRevisionAuthorityField,
    logicalWorkspaceRevisionColumnsPresent,
    logicalCodeSourceRevisionColumnPresent,
    productionWriterPresent,
    persistedMatchingRows,
    revisionOwnerProven: receipt.revisionOwnerProven,
    fanoutMayConsumeAsCanonical: receipt.fanoutMayConsumeAsCanonical,
    blockers: receipt.blockers,
    canonicalWriteAttempted: false,
    output: OUTPUT,
  }, null, 2));

  if (!receipt.revisionOwnerProven) process.exitCode = 3;
} finally {
  await pool.query('ROLLBACK');
  await pool.end();
}
