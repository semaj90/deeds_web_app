#!/usr/bin/env tsx

import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

import { loadAtlasEnv } from './load-atlas-env.mjs';
import { EMBEDDINGGEMMA_FULL768_V1 } from '$lib/server/vector/embeddinggemma-prefix384.js';

await loadAtlasEnv();

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FRONTEND = path.resolve(HERE, '../..');
const REPO_ROOT = path.resolve(FRONTEND, '..');
const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) throw new Error('DATABASE_URL_REQUIRED');

function arg(name: string): string | null {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] ?? null : null;
}
function normalizeRef(value: string): string {
  return value.replaceAll('\\', '/').replace(/^\.\//, '');
}
function digestHex(value: string): string {
  return value.toLowerCase().replace(/^sha256:/, '');
}
function parseVector(value: string): number[] {
  const parsed = value.trim().replace(/^\[/, '').replace(/\]$/, '').split(',').map((part) => Number(part));
  if (parsed.length !== 768 || parsed.some((item) => !Number.isFinite(item))) {
    throw new Error(`SEMANTIC_VECTOR_INVALID:${parsed.length}`);
  }
  return parsed;
}
function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

const workspaceRevision = arg('--workspace-revision') ?? process.env.ATLAS_FROZEN_SEMANTIC_WORKSPACE_REVISION ?? '';
if (!/^sha256:[a-f0-9]{64}$/.test(workspaceRevision)) {
  throw new Error('FROZEN_SEMANTIC_WORKSPACE_REVISION_REQUIRED');
}
const limit = Math.max(2, Math.min(100_000, Number(arg('--limit') ?? process.env.ATLAS_FROZEN_SEMANTIC_LIMIT ?? 5000)));
const output = path.resolve(
  REPO_ROOT,
  arg('--output') ?? process.env.ATLAS_FROZEN_SEMANTIC_SOURCE_OUT ?? '.tmp/aligned-snapshot/semantic-768-v2-source.ndjson',
);
const receiptPath = path.resolve(
  REPO_ROOT,
  arg('--receipt') ?? process.env.ATLAS_FROZEN_SEMANTIC_SOURCE_RECEIPT ?? '.tmp/aligned-snapshot/semantic-768-v2-source-receipt.json',
);
const representationRevision = EMBEDDINGGEMMA_FULL768_V1;

const pool = new pg.Pool({ connectionString: DATABASE_URL, max: 1, connectionTimeoutMillis: 5000, statement_timeout: 60_000 });
const client = await pool.connect();
try {
  await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');

  const columns = await client.query<{ table_name: string; column_name: string }>(`
    SELECT table_name,column_name
    FROM information_schema.columns
    WHERE table_schema='public'
      AND table_name IN ('atlas_packets','graphify_files','graphify_runs')
  `);
  const byTable = new Map<string, Set<string>>();
  for (const row of columns.rows) {
    const set = byTable.get(row.table_name) ?? new Set<string>();
    set.add(row.column_name);
    byTable.set(row.table_name, set);
  }
  const required: Record<string, string[]> = {
    atlas_packets: ['packet_key','source_ref','sha256','embedding'],
    graphify_files: ['source_ref','content_hash','code_source_revision','last_seen_run_id'],
    graphify_runs: ['run_id','workspace_revision','source_manifest_digest'],
  };
  const missing = Object.entries(required).flatMap(([table, names]) => names.filter((name) => !byTable.get(table)?.has(name)).map((name) => `${table}.${name}`));
  if (missing.length) throw new Error(`REVISION_QUALIFIED_SEMANTIC_EXPORT_SCHEMA_MISSING:${missing.join(',')}`);

  const result = await client.query<{
    packet_key: string;
    source_ref: string;
    packet_sha256: string;
    embedding_text: string;
    code_source_revision: string;
    content_hash: string;
    run_id: string;
    workspace_revision: string;
    source_manifest_digest: string;
  }>(`
    SELECT
      p.packet_key,
      p.source_ref,
      p.sha256 AS packet_sha256,
      p.embedding::text AS embedding_text,
      gf.code_source_revision,
      gf.content_hash,
      gf.last_seen_run_id::text AS run_id,
      gr.workspace_revision,
      gr.source_manifest_digest
    FROM public.atlas_packets p
    JOIN public.graphify_files gf
      ON replace(gf.source_ref, '\\', '/') = replace(p.source_ref, '\\', '/')
     AND lower(replace(gf.content_hash, 'sha256:', '')) = lower(replace(p.sha256, 'sha256:', ''))
    JOIN public.graphify_runs gr
      ON gr.run_id = gf.last_seen_run_id
    WHERE p.embedding IS NOT NULL
      AND p.packet_key IS NOT NULL
      AND p.sha256 ~ '^(sha256:)?[a-f0-9]{64}$'
      AND gf.code_source_revision ~ '^sha256:[a-f0-9]{64}$'
      AND gr.workspace_revision = $1
    ORDER BY p.packet_key, gf.code_source_revision, gf.last_seen_run_id
  `, [workspaceRevision]);

  type Candidate = (typeof result.rows)[number];
  const grouped = new Map<string, Candidate[]>();
  for (const row of result.rows) {
    const bucket = grouped.get(row.packet_key) ?? [];
    bucket.push(row);
    grouped.set(row.packet_key, bucket);
  }

  const accepted: Array<{
    canonical_id: string;
    canonical_revision: string;
    source_ref: string;
    representation_id: 'semantic_768';
    representation_revision: string;
    workspace_revision: string;
    embedding: number[];
  }> = [];
  const blocked: Array<{ packet_key: string; reason: string; logical_lineages: number }> = [];

  for (const packetKey of [...grouped.keys()].sort()) {
    const rows = grouped.get(packetKey)!;
    const lineage = new Map<string, Candidate>();
    for (const row of rows) {
      const key = JSON.stringify({
        sourceRef: normalizeRef(row.source_ref),
        sourceRevision: row.code_source_revision,
        contentHash: digestHex(row.content_hash),
        workspaceRevision: row.workspace_revision,
      });
      lineage.set(key, row);
    }
    if (lineage.size !== 1) {
      blocked.push({ packet_key: packetKey, reason: 'AMBIGUOUS_LOGICAL_LINEAGE', logical_lineages: lineage.size });
      continue;
    }
    const row = [...lineage.values()][0]!;
    if (digestHex(row.packet_sha256) !== digestHex(row.content_hash)) {
      blocked.push({ packet_key: packetKey, reason: 'PACKET_SOURCE_DIGEST_MISMATCH', logical_lineages: 1 });
      continue;
    }
    accepted.push({
      canonical_id: row.packet_key,
      canonical_revision: row.code_source_revision,
      source_ref: normalizeRef(row.source_ref),
      representation_id: 'semantic_768',
      representation_revision: representationRevision,
      workspace_revision: workspaceRevision,
      embedding: parseVector(row.embedding_text),
    });
    if (accepted.length >= limit) break;
  }

  if (accepted.length < 2) throw new Error(`REVISION_QUALIFIED_SEMANTIC_ROWS_INSUFFICIENT:${accepted.length}`);
  const ndjson = `${accepted.map((row) => JSON.stringify(row)).join('\n')}\n`;
  const canonicalOrderChecksum = sha256(JSON.stringify(accepted.map((row) => row.canonical_id)));
  const sourceRevisionChecksum = sha256(JSON.stringify(accepted.map((row) => [row.canonical_id, row.canonical_revision])));
  const receipt = {
    schema: 'atlas.frozen-semantic-v2-source-export.v1',
    status: 'REVISION_QUALIFIED_SOURCE_EXPORTED',
    workspaceRevision,
    representationId: 'semantic_768',
    representationRevision,
    requestedLimit: limit,
    joinedPhysicalRows: result.rows.length,
    uniquePacketCandidates: grouped.size,
    acceptedRows: accepted.length,
    blockedRows: blocked.length,
    blockedByReason: Object.fromEntries([...new Set(blocked.map((row) => row.reason))].sort().map((reason) => [reason, blocked.filter((row) => row.reason === reason).length])),
    canonicalOrderChecksum,
    sourceRevisionChecksum,
    ndjsonSha256: sha256(ndjson),
    sourceRevisionAuthority: 'graphify_files.code_source_revision',
    workspaceRevisionAuthority: 'graphify_runs.workspace_revision',
    representationAuthority: 'EMBEDDINGGEMMA_FULL768_V1',
    atlasPacketWorkspaceCacheEpochUsedAsAuthority: false,
    gitRevisionUsedAsAuthority: false,
    postgresWritesAttempted: false,
    qdrantWritesAttempted: false,
    canonicalAuthority: false,
    blockedSample: blocked.slice(0, 20),
  };

  await mkdir(path.dirname(output), { recursive: true });
  await mkdir(path.dirname(receiptPath), { recursive: true });
  await writeFile(output, ndjson, 'utf8');
  await writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ ...receipt, output, receiptPath }, null, 2));
} finally {
  await client.query('ROLLBACK').catch(() => undefined);
  client.release();
  await pool.end();
}
