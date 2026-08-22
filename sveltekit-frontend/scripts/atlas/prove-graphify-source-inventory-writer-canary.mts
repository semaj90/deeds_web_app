#!/usr/bin/env tsx

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

import { loadAtlasEnv } from './load-atlas-env.mjs';
import {
  writeGraphifySourceInventoryFileInTransactionV1,
  type GraphifySourceInventoryStorageSemanticsV1,
} from '$lib/server/atlas/indexing/graphify-source-inventory-writer-v1.js';
import { resolveGitWorkspaceRevision } from '$lib/server/atlas/indexing/code-revision-authority-v1.js';

await loadAtlasEnv();

if (process.env.NODE_ENV === 'production') {
  console.error(JSON.stringify({
    schema: 'atlas.graphify-source-inventory-writer-canary.v1',
    status: 'REFUSED_PRODUCTION',
    canonicalWriteAttempted: false,
  }, null, 2));
  process.exit(2);
}

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FRONTEND = path.resolve(HERE, '../..');
const REPO_ROOT = path.resolve(FRONTEND, '..');
const DATABASE_URL = process.env.DATABASE_URL;
const APPLY = process.env.ATLAS_GRAPHIFY_REVISION_CANARY === '1';
const COMMIT = process.env.ATLAS_GRAPHIFY_REVISION_CANARY_COMMIT === '1';
const SOURCE = path.resolve(
  REPO_ROOT,
  process.env.ATLAS_GRAPHIFY_REVISION_CANARY_SOURCE
    ?? 'sveltekit-frontend/src/lib/server/atlas/indexing/code-revision-authority-v1.ts',
);

if (!DATABASE_URL) throw new Error('DATABASE_URL_REQUIRED');

function isLegacyGitRevision(value: string): boolean {
  return /^[a-f0-9]{40,64}$/i.test(value.trim());
}

function normalizeContentHash(value: unknown): string | null {
  const raw = String(value ?? '').trim().toLowerCase();
  const match = /^(?:sha256:)?([a-f0-9]{64})$/.exec(raw);
  return match?.[1] ?? null;
}

async function detectStorageSemantics(client: pg.PoolClient): Promise<GraphifySourceInventoryStorageSemanticsV1> {
  const result = await client.query(`
    SELECT source_revision, content_hash
      FROM graphify_files
     WHERE source_revision IS NOT NULL
       AND btrim(source_revision) <> ''
     ORDER BY source_revision
     LIMIT 100
  `);
  if (result.rows.length === 0) {
    throw new Error('GRAPHIFY_STORAGE_SEMANTICS_UNPROVEN_EMPTY_SAMPLE');
  }
  const revisions = result.rows.map((row) => String(row.source_revision));
  if (revisions.every((value) => /^sha256:[a-f0-9]{64}$/i.test(value))) {
    return 'CODE_SOURCE_REVISION_V1';
  }
  if (revisions.every(isLegacyGitRevision)
      && result.rows.every((row) => Boolean(normalizeContentHash(row.content_hash)))) {
    return 'LEGACY_GIT_SHA_WITH_CONTENT_HASH_V1';
  }
  throw new Error('GRAPHIFY_STORAGE_SEMANTICS_MISMATCH');
}

async function resolveWorkspaceId(client: pg.PoolClient, repositoryRevision: string): Promise<string> {
  const explicit = process.env.ATLAS_GRAPHIFY_REVISION_CANARY_WORKSPACE_ID?.trim();
  if (explicit) return explicit;

  const exact = await client.query(
    `SELECT workspace_id
       FROM graphify_runs
      WHERE lower(repository_revision) = lower($1)
      ORDER BY started_at DESC
      LIMIT 1`,
    [repositoryRevision],
  );
  if (exact.rowCount === 1) return String(exact.rows[0].workspace_id);

  const latest = await client.query(
    `SELECT workspace_id
       FROM graphify_runs
      ORDER BY started_at DESC
      LIMIT 1`,
  );
  if (latest.rowCount === 1) return String(latest.rows[0].workspace_id);
  throw new Error('GRAPHIFY_CANARY_WORKSPACE_ID_REQUIRED');
}

async function main() {
  const pool = new pg.Pool({
    connectionString: DATABASE_URL,
    max: 1,
    connectionTimeoutMillis: 5_000,
    statement_timeout: 15_000,
  });
  const client = await pool.connect();
  try {
    const workspaceRevision = resolveGitWorkspaceRevision({ workspaceRoot: REPO_ROOT });
    const storageSemantics = await detectStorageSemantics(client);
    const workspaceId = await resolveWorkspaceId(client, workspaceRevision);
    const sourceText = await readFile(SOURCE, 'utf8');

    if (!APPLY) {
      console.log(JSON.stringify({
        schema: 'atlas.graphify-source-inventory-writer-canary.v1',
        status: 'READY_CANARY_DISABLED',
        workspaceRevision,
        workspaceId,
        storageSemantics,
        source: path.relative(REPO_ROOT, SOURCE).replaceAll('\\', '/'),
        canonicalWriteAttempted: false,
        enableWith: 'ATLAS_GRAPHIFY_REVISION_CANARY=1',
        durableCommitRequires: 'ATLAS_GRAPHIFY_REVISION_CANARY_COMMIT=1',
      }, null, 2));
      return;
    }

    await client.query('BEGIN');
    const receipt = await writeGraphifySourceInventoryFileInTransactionV1({
      client,
      workspaceId,
      workspaceRoot: REPO_ROOT,
      absoluteSourcePath: SOURCE,
      sourceText,
      storageSemantics,
      parserContractVersion: 'graphify.parser.v0.1',
      extractionContractVersion: 'graphify.extractor.v0.1',
      producerRevision: 'atlas.graphify-source-inventory-writer-canary.v1',
      parserName: 'canary',
      parserVersion: 'v1',
    });

    const readback = await client.query(
      `SELECT gf.file_id, gf.source_ref, gf.source_revision, gf.content_hash,
              gf.byte_length, gr.repository_revision
         FROM graphify_files gf
         JOIN graphify_runs gr ON gr.run_id = gf.last_seen_run_id
        WHERE gf.file_id = $1
        FOR UPDATE`,
      [receipt.fileId],
    );
    if (readback.rowCount !== 1) throw new Error('GRAPHIFY_CANARY_READBACK_MISSING');
    const row = readback.rows[0];
    const readbackDigest = normalizeContentHash(row.content_hash);
    if (String(row.source_ref).replaceAll('\\', '/') !== receipt.sourceRef) {
      throw new Error('GRAPHIFY_CANARY_SOURCE_REF_MISMATCH');
    }
    if (String(row.repository_revision).toLowerCase() !== receipt.workspaceRevision.toLowerCase()) {
      throw new Error('GRAPHIFY_CANARY_WORKSPACE_REVISION_MISMATCH');
    }
    if (String(row.source_revision) !== receipt.storedSourceRevision) {
      throw new Error('GRAPHIFY_CANARY_STORED_SOURCE_REVISION_MISMATCH');
    }
    if (readbackDigest !== receipt.sourceContentDigest) {
      throw new Error('GRAPHIFY_CANARY_CONTENT_HASH_MISMATCH');
    }
    if (Number(row.byte_length) !== receipt.sourceByteLength) {
      throw new Error('GRAPHIFY_CANARY_BYTE_LENGTH_MISMATCH');
    }

    if (COMMIT) await client.query('COMMIT');
    else await client.query('ROLLBACK');

    console.log(JSON.stringify({
      schema: 'atlas.graphify-source-inventory-writer-canary.v1',
      status: COMMIT
        ? 'GRAPHIFY_REVISION_OWNER_CONTROLLED_PERSISTENCE_COMMITTED'
        : 'GRAPHIFY_REVISION_OWNER_WRITE_READBACK_PROVEN_ROLLED_BACK',
      workspaceId,
      workspaceRevision: receipt.workspaceRevision,
      sourceRef: receipt.sourceRef,
      codeSourceRevision: receipt.codeSourceRevision,
      storedSourceRevision: receipt.storedSourceRevision,
      sourceRevisionAuthorityField: receipt.sourceRevisionAuthorityField,
      sourceContentDigest: receipt.sourceContentDigest,
      storageSemantics: receipt.storageSemantics,
      runReadbackVerified: receipt.runReadbackVerified,
      fileReadbackVerified: receipt.fileReadbackVerified,
      transactionCommitted: COMMIT,
      canonicalWriteAttempted: true,
      fanoutMayConsumeAsCanonical: false,
      nextProof: COMMIT
        ? 'rerun prove-code-revision-owner-canary.mts; require REVISION_OWNER_PROVEN'
        : 'set ATLAS_GRAPHIFY_REVISION_CANARY_COMMIT=1 only in the intended controlled non-production proof DB',
    }, null, 2));
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch {}
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
