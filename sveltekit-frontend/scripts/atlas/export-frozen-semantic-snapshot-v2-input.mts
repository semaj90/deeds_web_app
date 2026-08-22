#!/usr/bin/env tsx

import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

import { materializeWorkspaceRevisionOriginV1 } from '$lib/server/atlas/indexing/workspace-revision-origin-runtime-v1.js';
import { loadAtlasEnv } from './load-atlas-env.mjs';

await loadAtlasEnv();

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FRONTEND = path.resolve(HERE, '../..');
const REPO_ROOT = path.resolve(FRONTEND, '..');
const DATABASE_URL = process.env.DATABASE_URL;
const PRODUCER_REVISION = 'atlas.frozen-semantic-snapshot-v2-input-export.2026-08-21.v1';

function arg(name: string): string | null {
  const prefix = `--${name}=`;
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length) ?? null;
}

const requestedCount = Math.max(2, Math.min(100_000, Number(arg('count') ?? '5000')));
const requestedRepresentationRevision = Number(arg('representation-revision'));
if (!Number.isInteger(requestedRepresentationRevision) || requestedRepresentationRevision <= 0) {
  throw new Error('FROZEN_SEMANTIC_REPRESENTATION_REVISION_REQUIRED:pass --representation-revision=<positive atlas_packets revision>');
}
if (!DATABASE_URL) throw new Error('DATABASE_URL_REQUIRED');

const output = path.resolve(
  REPO_ROOT,
  arg('output') ?? '.tmp/aligned-snapshot/semantic-768-v2-input.jsonl',
);
const receiptPath = path.resolve(
  REPO_ROOT,
  arg('receipt') ?? '.tmp/aligned-snapshot/semantic-768-v2-export-receipt.json',
);

function sha256(value: string | Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

function normalizeSourceRef(value: string): string {
  return value.replaceAll('\\', '/').replace(/^\.\//, '');
}

function parseVector(value: string): number[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error('FROZEN_SEMANTIC_VECTOR_TEXT_INVALID');
  }
  if (!Array.isArray(parsed) || parsed.length !== 768) {
    throw new Error(`FROZEN_SEMANTIC_VECTOR_DIMENSION_MISMATCH:${Array.isArray(parsed) ? parsed.length : 'not-array'}`);
  }
  const vector = parsed.map(Number);
  if (vector.some((item) => !Number.isFinite(item))) {
    throw new Error('FROZEN_SEMANTIC_VECTOR_NONFINITE');
  }
  return vector;
}

const origin = materializeWorkspaceRevisionOriginV1({
  workspaceRoot: REPO_ROOT,
  repositoryId: 'semaj90/deeds_web_app',
  producerRevision: PRODUCER_REVISION,
});

const pool = new pg.Pool({
  connectionString: DATABASE_URL,
  max: 1,
  connectionTimeoutMillis: 5_000,
  statement_timeout: 30_000,
});
const client = await pool.connect();

try {
  await client.query('BEGIN READ ONLY');

  const schemaRows = await client.query<{ table_name: string; column_name: string }>(`
    SELECT table_name, column_name
      FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name IN ('graphify_runs', 'graphify_files', 'atlas_packets')
  `);
  const byTable = new Map<string, Set<string>>();
  for (const row of schemaRows.rows) {
    const set = byTable.get(row.table_name) ?? new Set<string>();
    set.add(row.column_name);
    byTable.set(row.table_name, set);
  }
  const required = new Map<string, string[]>([
    ['graphify_runs', ['run_id', 'workspace_id', 'repository_revision', 'workspace_revision', 'source_manifest_digest', 'completed_at', 'status']],
    ['graphify_files', ['workspace_id', 'source_ref', 'code_source_revision', 'content_hash', 'byte_length', 'last_seen_run_id']],
    ['atlas_packets', ['packet_key', 'source_ref', 'embedding', 'representation_revision', 'source_representation_id', 'source_dimension', 'encoder_revision', 'embedding_digest']],
  ]);
  const missing: string[] = [];
  for (const [table, columns] of required) {
    const observed = byTable.get(table) ?? new Set<string>();
    for (const column of columns) if (!observed.has(column)) missing.push(`${table}.${column}`);
  }
  if (missing.length > 0) {
    throw new Error(`FROZEN_SEMANTIC_SCHEMA_PREREQUISITE_MISSING:${missing.join(',')}`);
  }

  const runRows = await client.query<{
    run_id: string;
    workspace_id: string;
    repository_revision: string;
    workspace_revision: string;
    source_manifest_digest: string;
    completed_at: string | null;
    status: string;
  }>(`
    SELECT run_id::text, workspace_id::text, repository_revision, workspace_revision,
           source_manifest_digest, completed_at::text, status
      FROM public.graphify_runs
     WHERE workspace_revision = $1
       AND lower(source_manifest_digest) = lower($2)
       AND lower(repository_revision) = lower($3)
     ORDER BY completed_at DESC NULLS LAST, started_at DESC
     LIMIT 2
  `, [origin.record.workspaceRevision, origin.record.sourceManifestDigest, origin.record.baseCommitOid]);

  if (runRows.rowCount !== 1) {
    throw new Error(`GRAPHIFY_WORKSPACE_MANIFEST_RUN_NOT_UNIQUE:${runRows.rowCount ?? 0}`);
  }
  const run = runRows.rows[0]!;
  if (!run.completed_at) throw new Error('GRAPHIFY_WORKSPACE_MANIFEST_RUN_NOT_COMPLETED');

  const persistedRows = await client.query<{
    source_ref: string;
    code_source_revision: string | null;
    content_hash: string;
    byte_length: string;
  }>(`
    SELECT source_ref, code_source_revision, content_hash, byte_length::text
      FROM public.graphify_files
     WHERE last_seen_run_id = $1::uuid
     ORDER BY source_ref
  `, [run.run_id]);

  const persisted = new Map<string, { sourceRevision: string; contentDigest: string; byteLength: number }>();
  for (const row of persistedRows.rows) {
    const sourceRef = normalizeSourceRef(row.source_ref);
    if (persisted.has(sourceRef)) throw new Error(`GRAPHIFY_WORKSPACE_MANIFEST_DUPLICATE_SOURCE:${sourceRef}`);
    if (!row.code_source_revision) throw new Error(`GRAPHIFY_WORKSPACE_SOURCE_REVISION_MISSING:${sourceRef}`);
    persisted.set(sourceRef, {
      sourceRevision: row.code_source_revision,
      contentDigest: row.content_hash.replace(/^sha256:/, '').toLowerCase(),
      byteLength: Number(row.byte_length),
    });
  }

  const expected = new Map(origin.bindings.map((binding) => [normalizeSourceRef(binding.sourceRef), binding]));
  const missingSources: string[] = [];
  const extraSources: string[] = [];
  const mismatchedSources: string[] = [];
  for (const [sourceRef, binding] of expected) {
    const row = persisted.get(sourceRef);
    if (!row) {
      missingSources.push(sourceRef);
      continue;
    }
    if (
      row.sourceRevision !== binding.sourceRevision ||
      row.contentDigest !== binding.contentDigest.toLowerCase() ||
      row.byteLength !== binding.byteLength
    ) {
      mismatchedSources.push(sourceRef);
    }
  }
  for (const sourceRef of persisted.keys()) if (!expected.has(sourceRef)) extraSources.push(sourceRef);

  const workspaceComplete =
    persisted.size === expected.size &&
    missingSources.length === 0 &&
    extraSources.length === 0 &&
    mismatchedSources.length === 0;
  if (!workspaceComplete) {
    throw new Error(
      `GRAPHIFY_WORKSPACE_MANIFEST_NOT_COMPLETE:expected=${expected.size}:persisted=${persisted.size}` +
      `:missing=${missingSources.length}:extra=${extraSources.length}:mismatch=${mismatchedSources.length}`,
    );
  }

  const packetRows = await client.query<{
    packet_key: string;
    source_ref: string;
    canonical_revision: string;
    embedding_text: string;
    representation_revision: number;
    source_representation_id: string | null;
    source_dimension: number | null;
    encoder_revision: string | null;
    embedding_digest: string | null;
  }>(`
    SELECT p.packet_key,
           replace(p.source_ref, '\\', '/') AS source_ref,
           gf.code_source_revision AS canonical_revision,
           p.embedding::text AS embedding_text,
           p.representation_revision,
           p.source_representation_id,
           p.source_dimension,
           p.encoder_revision,
           p.embedding_digest
      FROM public.atlas_packets p
      JOIN public.graphify_files gf
        ON gf.last_seen_run_id = $1::uuid
       AND replace(gf.source_ref, '\\', '/') = replace(p.source_ref, '\\', '/')
     WHERE p.embedding IS NOT NULL
       AND p.packet_key IS NOT NULL AND length(btrim(p.packet_key)) > 0
       AND p.source_ref IS NOT NULL AND length(btrim(p.source_ref)) > 0
       AND gf.code_source_revision IS NOT NULL
       AND p.representation_revision = $2
       AND p.source_representation_id = 'semantic_768'
       AND p.source_dimension = 768
     ORDER BY p.packet_key
     LIMIT $3
  `, [run.run_id, requestedRepresentationRevision, requestedCount]);

  if (packetRows.rowCount !== requestedCount) {
    throw new Error(`FROZEN_SEMANTIC_ROW_COUNT_INSUFFICIENT:expected=${requestedCount}:observed=${packetRows.rowCount ?? 0}`);
  }

  const packetKeys = new Set<string>();
  const ndjsonRows: string[] = [];
  const encoderRevisions = new Set<string>();
  let rowsWithEmbeddingDigest = 0;
  for (const row of packetRows.rows) {
    if (packetKeys.has(row.packet_key)) throw new Error(`FROZEN_SEMANTIC_DUPLICATE_PACKET_KEY:${row.packet_key}`);
    packetKeys.add(row.packet_key);
    if (!/^sha256:[a-f0-9]{64}$/.test(row.canonical_revision)) {
      throw new Error(`FROZEN_SEMANTIC_SOURCE_REVISION_INVALID:${row.packet_key}`);
    }
    if (row.representation_revision !== requestedRepresentationRevision) {
      throw new Error(`FROZEN_SEMANTIC_REPRESENTATION_REVISION_DRIFT:${row.packet_key}`);
    }
    const embedding = parseVector(row.embedding_text);
    if (row.encoder_revision) encoderRevisions.add(row.encoder_revision);
    if (row.embedding_digest) rowsWithEmbeddingDigest += 1;
    ndjsonRows.push(JSON.stringify({
      canonical_id: row.packet_key,
      canonical_revision: row.canonical_revision,
      source_ref: normalizeSourceRef(row.source_ref),
      representation_id: 'semantic_768',
      embedding,
    }));
  }

  const ndjson = `${ndjsonRows.join('\n')}\n`;
  const inputFileChecksum = sha256(ndjson);
  const workspaceManifest = {
    schema: 'atlas.graphify-workspace-manifest-receipt.v1',
    complete: true,
    workspaceManifestRevision: origin.record.workspaceRevision,
    workspaceRevision: origin.record.workspaceRevision,
    sourceManifestDigest: origin.record.sourceManifestDigest,
    expectedSourceCount: expected.size,
    persistedSourceCount: persisted.size,
    graphifyRunId: run.run_id,
    graphifyWorkspaceId: run.workspace_id,
    graphifyRunStatus: run.status,
    repositoryRevision: run.repository_revision,
    baseCommitOid: origin.record.baseCommitOid,
    sourceBindingMismatches: 0,
    canonicalAuthority: false,
    producerRevision: PRODUCER_REVISION,
  };
  const receipt = {
    schema: 'atlas.frozen-semantic-snapshot-v2-input-export-receipt.v1',
    status: 'FROZEN_SEMANTIC_SNAPSHOT_V2_INPUT_EXPORTED',
    readOnlyDatabaseTransaction: true,
    canonicalWritesAttempted: false,
    workspaceManifest,
    representation: 'semantic_768',
    representationRevision: requestedRepresentationRevision,
    representationProvenanceScope: 'ATLAS_PACKETS_CONTRACT_ONLY_NOT_HISTORICAL_MODEL_PROVENANCE',
    encoderRevisionsObserved: [...encoderRevisions].sort(),
    rowsWithEmbeddingDigest,
    requestedRowCount: requestedCount,
    exportedRowCount: packetRows.rowCount,
    uniquePacketKeys: packetKeys.size,
    inputPath: output,
    inputFileChecksum,
    producerRevision: PRODUCER_REVISION,
  };

  await mkdir(path.dirname(output), { recursive: true });
  await mkdir(path.dirname(receiptPath), { recursive: true });
  await writeFile(output, ndjson, 'utf8');
  await writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({
    status: receipt.status,
    workspaceRevision: origin.record.workspaceRevision,
    sourceManifestDigest: origin.record.sourceManifestDigest,
    workspaceManifestComplete: true,
    representationRevision: requestedRepresentationRevision,
    exportedRowCount: packetRows.rowCount,
    inputFileChecksum,
    encoderRevisionsObserved: receipt.encoderRevisionsObserved,
    representationProvenanceScope: receipt.representationProvenanceScope,
    databaseWritesAttempted: false,
    output,
    receipt: receiptPath,
  }, null, 2));
} finally {
  try { await client.query('ROLLBACK'); } finally {
    client.release();
    await pool.end();
  }
}
