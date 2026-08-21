#!/usr/bin/env tsx

/**
 * S512-ID3/ID4 — read-only verification of previously ADMITTED
 * AtlasChunkPacketIdentityLinkV1 rows.
 *
 * This verifier does not broaden admission and does not mint identity. It reads
 * the ID1B manifest, selects only ADMITTED rows, re-reads Qdrant + PostgreSQL,
 * and verifies that the exact evidence class which originally justified the
 * canonical packet link still reproduces.
 */

import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Client } from 'pg';

import type { AtlasChunkPacketIdentityLinkV1 } from '../../src/lib/server/atlas/identity/chunk-packet-identity-link-v1.js';
import {
  verifyChunkPacketIdentityReadback,
  type AtlasChunkPacketIdentityReadbackV1,
  type ChunkPacketReadbackObservationV1,
} from '../../src/lib/server/atlas/identity/chunk-packet-identity-readback-v1.js';

const args = process.argv.slice(2);
const DATABASE_URL = value('database-url', process.env.DATABASE_URL || 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db')!;
const QDRANT_URL = value('qdrant-url', process.env.QDRANT_URL || 'http://127.0.0.1:6333')!.replace(/\/$/, '');
const MANIFEST_PATH = path.resolve(value('manifest', 'docs/reports/s512-chunk-packet-identity-links.jsonl')!);
const OUTPUT_PATH = path.resolve(value('output', 'docs/reports/s512-chunk-packet-identity-readback.jsonl')!);
const RECEIPT_PATH = path.resolve(value('receipt', 'docs/reports/s512-chunk-packet-identity-readback-proof.json')!);
const LIMIT = intValue('limit', 0);
const BATCH_SIZE = intValue('batch-size', 256) || 256;

function value(name: string, fallback: string | null = null): string | null {
  const prefix = `--${name}=`;
  const inline = args.find((arg) => arg.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] ?? fallback : fallback;
}

function intValue(name: string, fallback: number): number {
  const raw = value(name, String(fallback));
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 0) throw new Error(`INVALID_${name.toUpperCase()}:${raw}`);
  return parsed;
}

function canonicalJson(input: unknown): string {
  if (input === null || typeof input !== 'object') return JSON.stringify(input);
  if (Array.isArray(input)) return `[${input.map(canonicalJson).join(',')}]`;
  const record = input as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(',')}}`;
}

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function normalizeRef(input: unknown): string | null {
  const text = String(input ?? '').trim().replaceAll('\\', '/').replace(/^\.\//, '').replace(/\/+/g, '/');
  return text ? text.replace(/\/$/, '') : null;
}

async function tableColumns(client: Client, table: string): Promise<Set<string>> {
  const result = await client.query(
    `SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name=$1`,
    [table],
  );
  return new Set(result.rows.map((row) => String(row.column_name)));
}

function optionalColumn(columns: Set<string>, name: string, alias = name): string {
  return columns.has(name) ? `${name} AS ${alias}` : `NULL AS ${alias}`;
}

async function qdrantPointExists(collection: string, pointIds: string[]): Promise<Set<string>> {
  if (!pointIds.length) return new Set();
  const response = await fetch(`${QDRANT_URL}/collections/${encodeURIComponent(collection)}/points`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ids: pointIds, with_payload: false, with_vector: false }),
    signal: AbortSignal.timeout(120_000),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`QDRANT_HTTP_${response.status}:${text.slice(0, 500)}`);
  const payload = text ? JSON.parse(text) : {};
  return new Set((payload?.result ?? []).map((row: any) => String(row.id)));
}

async function loadManifest(): Promise<Array<AtlasChunkPacketIdentityLinkV1 & { firstLoss?: string }>> {
  const text = await readFile(MANIFEST_PATH, 'utf8');
  const rows = text.split(/\r?\n/).filter((line) => line.trim()).map((line, index) => {
    const row = JSON.parse(line);
    if (row?.schema !== 'atlas.chunk-packet-identity-link.v1') throw new Error(`INVALID_IDENTITY_LINK_SCHEMA_LINE_${index + 1}`);
    return row as AtlasChunkPacketIdentityLinkV1 & { firstLoss?: string };
  });
  return rows;
}

async function fetchChunkRows(client: Client, columns: Set<string>, ids: string[]): Promise<Map<string, any>> {
  const numeric = ids.map(Number).filter((value) => Number.isSafeInteger(value) && value >= 0);
  if (!numeric.length) return new Map();
  const select = [
    'id::text AS id',
    columns.has('source_ref') ? 'source_ref' : `metadata->>'source_ref' AS source_ref`,
    optionalColumn(columns, 'metadata'),
    optionalColumn(columns, 'source_revision'),
    optionalColumn(columns, 'start_byte'),
    optionalColumn(columns, 'end_byte'),
    optionalColumn(columns, 'tree_node_id'),
  ].join(', ');
  const result = await client.query(`SELECT ${select} FROM codebase_chunk_index WHERE id = ANY($1::int[])`, [numeric]);
  return new Map(result.rows.map((row) => [String(row.id), row]));
}

async function fetchPacketRows(client: Client, columns: Set<string>, packetKeys: string[]): Promise<Map<string, any>> {
  if (!packetKeys.length || !columns.has('packet_key')) return new Map();
  const select = [
    'packet_key',
    optionalColumn(columns, 'qdrant_point_id'),
    optionalColumn(columns, 'artifact_id'),
    optionalColumn(columns, 'source_ref'),
    optionalColumn(columns, 'source_revision'),
    optionalColumn(columns, 'byte_start'),
    optionalColumn(columns, 'byte_end'),
    optionalColumn(columns, 'tree_node_id'),
  ].join(', ');
  const result = await client.query(`SELECT ${select} FROM atlas_packets WHERE packet_key = ANY($1::text[])`, [packetKeys]);
  return new Map(result.rows.map((row) => [String(row.packet_key), row]));
}

function observationFor(
  link: AtlasChunkPacketIdentityLinkV1,
  qdrantExists: Set<string>,
  chunkRows: Map<string, any>,
  packetRows: Map<string, any>,
): ChunkPacketReadbackObservationV1 {
  const chunk = link.chunkIndexId == null ? null : chunkRows.get(String(link.chunkIndexId)) ?? null;
  const packet = link.canonicalPacketKey == null ? null : packetRows.get(link.canonicalPacketKey) ?? null;
  return {
    qdrantPointExists: qdrantExists.has(link.qdrantPointId),
    chunkExists: Boolean(chunk),
    packetExists: Boolean(packet),
    qdrantPointId: link.qdrantPointId,
    chunkIndexId: link.chunkIndexId,
    chunkMetadataPacketKey: chunk?.metadata?.packet_key == null ? null : String(chunk.metadata.packet_key),
    chunkSourceRef: normalizeRef(chunk?.source_ref),
    chunkSourceRevision: chunk?.source_revision == null ? null : String(chunk.source_revision),
    chunkStartByte: chunk?.start_byte == null ? null : Number(chunk.start_byte),
    chunkEndByte: chunk?.end_byte == null ? null : Number(chunk.end_byte),
    chunkTreeNodeId: chunk?.tree_node_id == null ? null : String(chunk.tree_node_id),
    packetKey: packet?.packet_key == null ? null : String(packet.packet_key),
    packetQdrantPointId: packet?.qdrant_point_id == null ? null : String(packet.qdrant_point_id),
    packetArtifactId: packet?.artifact_id == null ? null : String(packet.artifact_id),
    packetSourceRef: normalizeRef(packet?.source_ref),
    packetSourceRevision: packet?.source_revision == null ? null : String(packet.source_revision),
    packetStartByte: packet?.byte_start == null ? null : Number(packet.byte_start),
    packetEndByte: packet?.byte_end == null ? null : Number(packet.byte_end),
    packetTreeNodeId: packet?.tree_node_id == null ? null : String(packet.tree_node_id),
  };
}

async function main(): Promise<void> {
  const sourceRows = await loadManifest();
  const admitted = sourceRows.filter((row) => row.admission === 'ADMITTED');
  const selected = LIMIT > 0 ? admitted.slice(0, LIMIT) : admitted;
  if (!selected.length) throw new Error('S512_ID_READBACK_NO_ADMITTED_ROWS');

  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();
  const results: AtlasChunkPacketIdentityReadbackV1[] = [];
  let snapshot: any;
  try {
    await client.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
    snapshot = (await client.query(`SELECT pg_current_snapshot()::text AS snapshot, transaction_timestamp()::text AS transaction_timestamp, version() AS version`)).rows[0];
    const [chunkColumns, packetColumns] = await Promise.all([
      tableColumns(client, 'codebase_chunk_index'),
      tableColumns(client, 'atlas_packets'),
    ]);

    for (let offset = 0; offset < selected.length; offset += BATCH_SIZE) {
      const batch = selected.slice(offset, offset + BATCH_SIZE);
      const pointSet = await qdrantPointExists(batch[0].qdrantCollection, batch.map((row) => row.qdrantPointId));
      const chunks = await fetchChunkRows(client, chunkColumns, batch.map((row) => row.chunkIndexId).filter((value): value is string => Boolean(value)));
      const packets = await fetchPacketRows(client, packetColumns, batch.map((row) => row.canonicalPacketKey).filter((value): value is string => Boolean(value)));
      for (const link of batch) {
        results.push(verifyChunkPacketIdentityReadback({
          link,
          observation: observationFor(link, pointSet, chunks, packets),
        }));
      }
    }
    await client.query('ROLLBACK');
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch { /* ignore */ }
    throw error;
  } finally {
    await client.end();
  }

  results.sort((a, b) => a.qdrantPointId.localeCompare(b.qdrantPointId, 'en', { numeric: true }));
  const outputText = results.map((row) => canonicalJson(row)).join('\n') + '\n';
  const counts = Object.fromEntries([...results.reduce((map, row) => map.set(row.status, (map.get(row.status) ?? 0) + 1), new Map<string, number>()).entries()].sort());
  const verified = results.filter((row) => row.status === 'VERIFIED').length;
  const receipt = {
    schema: 'atlas.s512-chunk-packet-identity-readback-proof.v1',
    generatedAt: new Date().toISOString(),
    collection: selected[0].qdrantCollection,
    sourceManifestPath: MANIFEST_PATH,
    sourceManifestSha256: sha256(await readFile(MANIFEST_PATH, 'utf8')),
    postgresSnapshot: String(snapshot.snapshot),
    transactionTimestamp: String(snapshot.transaction_timestamp),
    postgresVersion: String(snapshot.version),
    isolation: 'REPEATABLE READ',
    readOnly: true,
    admittedInputCount: selected.length,
    statusCounts: counts,
    verifiedCount: verified,
    allAdmittedRowsVerified: verified === selected.length,
    resultManifestSha256: sha256(outputText),
    resultPath: OUTPUT_PATH,
    invariants: {
      onlyAdmittedRowsWereVerified: true,
      readbackDoesNotBroadenAdmission: true,
      contentHashOnlyCannotBeGrandfathered: results.every((row) => row.originalMatchMethod !== 'CONTENT_HASH_UNIQUE' || row.status !== 'VERIFIED'),
      canonicalPacketMinted: false,
      postgresWritesAttempted: false,
      qdrantWritesAttempted: false,
      canonicalWritesAllowed: false,
    },
    producerRevision: 'verify-s512-chunk-packet-identity-readback.v1',
  };

  await mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
  await mkdir(path.dirname(RECEIPT_PATH), { recursive: true });
  await writeFile(OUTPUT_PATH, outputText, 'utf8');
  await writeFile(RECEIPT_PATH, JSON.stringify(receipt, null, 2) + '\n', 'utf8');
  console.log(JSON.stringify(receipt, null, 2));
  if (!receipt.allAdmittedRowsVerified || !receipt.invariants.contentHashOnlyCannotBeGrandfathered) process.exitCode = 2;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exit(1);
});
