#!/usr/bin/env tsx

/**
 * S512-ID1B — read-only live candidate derivation for historical semantic_512.
 *
 * Reads Qdrant point IDs/payloads plus PostgreSQL identity tables under one
 * REPEATABLE READ / READ ONLY transaction. It never creates atlas_packets rows,
 * never updates Qdrant payloads and never aliases incompatible key namespaces.
 */

import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Client } from 'pg';

import {
  classifyChunkPacketIdentityLink,
  type AtlasChunkPacketIdentityLinkV1,
  type ChunkPacketCandidateEvidenceV1,
} from '../../src/lib/server/atlas/identity/chunk-packet-identity-link-v1.js';

const args = process.argv.slice(2);
const COLLECTION = value('collection', process.env.ATLAS_S512_COLLECTION || 'codebase_chunks_512')!;
const QDRANT_URL = value('qdrant-url', process.env.QDRANT_URL || 'http://127.0.0.1:6333')!.replace(/\/$/, '');
const DATABASE_URL = value('database-url', process.env.DATABASE_URL || 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db')!;
const LIMIT = intValue('limit', 0);
const PAGE_SIZE = intValue('page-size', 256) || 256;
const MANIFEST_PATH = path.resolve(value('manifest-out', 'docs/reports/s512-chunk-packet-identity-links.jsonl')!);
const RECEIPT_PATH = path.resolve(value('receipt-out', 'docs/reports/s512-chunk-packet-identity-audit.json')!);

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

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(',')}}`;
}

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function normalizeRef(value: unknown): string | null {
  const text = String(value ?? '').trim().replaceAll('\\', '/').replace(/^\.\//, '').replace(/\/+/g, '/');
  return text ? text.replace(/\/$/, '') : null;
}

async function postJson(url: string, body: unknown): Promise<any> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(120_000),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`HTTP_${response.status}:${url}:${text.slice(0, 500)}`);
  return text ? JSON.parse(text) : null;
}

async function tableColumns(client: Client, tableName: string): Promise<Set<string>> {
  const result = await client.query(
    `SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name=$1`,
    [tableName],
  );
  return new Set(result.rows.map((row) => String(row.column_name)));
}

function optionalColumn(columns: Set<string>, name: string, alias = name): string {
  return columns.has(name) ? `${name} AS ${alias}` : `NULL AS ${alias}`;
}

async function scrollPointPage(offset: unknown): Promise<{ points: any[]; next: unknown }> {
  const body: Record<string, unknown> = {
    limit: PAGE_SIZE,
    with_payload: true,
    with_vector: false,
  };
  if (offset !== null && offset !== undefined) body.offset = offset;
  const response = await postJson(`${QDRANT_URL}/collections/${encodeURIComponent(COLLECTION)}/points/scroll`, body);
  const result = response?.result ?? {};
  return { points: Array.isArray(result.points) ? result.points : [], next: result.next_page_offset ?? null };
}

type ChunkRow = {
  id: string;
  source_ref: string | null;
  content_hash: string | null;
  metadata: any;
  start_byte: number | null;
  end_byte: number | null;
  tree_node_id: string | null;
  source_revision: string | null;
};

type PacketRow = {
  packet_key: string | null;
  packet_id: string | null;
  artifact_id: string | null;
  source_ref: string | null;
  source_ref_key: string | null;
  qdrant_point_id: string | null;
  sha256: string | null;
  byte_start: number | null;
  byte_end: number | null;
  tree_node_id: string | null;
};

type SourceRefRow = {
  source_ref_key: string;
  relative_path: string | null;
  content_hash: string;
  start_byte: number | null;
  end_byte: number | null;
  commit_sha: string | null;
};

async function chunkRows(client: Client, columns: Set<string>, ids: number[]): Promise<Map<string, ChunkRow>> {
  if (!ids.length) return new Map();
  const sourceRefExpr = columns.has('source_ref') ? 'source_ref' : `metadata->>'source_ref'`;
  const select = [
    'id::text AS id',
    `${sourceRefExpr} AS source_ref`,
    optionalColumn(columns, 'content_hash'),
    optionalColumn(columns, 'metadata'),
    optionalColumn(columns, 'start_byte'),
    optionalColumn(columns, 'end_byte'),
    optionalColumn(columns, 'tree_node_id'),
    optionalColumn(columns, 'source_revision'),
  ].join(', ');
  const result = await client.query(`SELECT ${select} FROM codebase_chunk_index WHERE id = ANY($1::int[])`, [ids]);
  return new Map(result.rows.map((row) => [String(row.id), row as ChunkRow]));
}

async function packetRows(client: Client, columns: Set<string>, chunks: ChunkRow[], pointIds: string[]): Promise<PacketRow[]> {
  const packetKeys = [...new Set(chunks.map((row) => String(row.metadata?.packet_key ?? '').trim()).filter(Boolean))];
  const sourceRefs = [...new Set(chunks.map((row) => normalizeRef(row.source_ref)).filter((row): row is string => Boolean(row)))];
  const hashes = [...new Set(chunks.map((row) => String(row.content_hash ?? '').trim()).filter(Boolean))];
  const clauses: string[] = [];
  const params: unknown[] = [];
  const pushAny = (column: string, values: string[]) => {
    if (!columns.has(column) || !values.length) return;
    params.push(values);
    clauses.push(`${column} = ANY($${params.length}::text[])`);
  };
  pushAny('packet_key', packetKeys);
  pushAny('qdrant_point_id', pointIds);
  pushAny('artifact_id', pointIds);
  pushAny('source_ref', sourceRefs);
  pushAny('sha256', hashes);
  pushAny('packet_id', hashes);
  if (!clauses.length) return [];

  const select = [
    optionalColumn(columns, 'packet_key'),
    optionalColumn(columns, 'packet_id'),
    optionalColumn(columns, 'artifact_id'),
    optionalColumn(columns, 'source_ref'),
    optionalColumn(columns, 'source_ref_key'),
    optionalColumn(columns, 'qdrant_point_id'),
    optionalColumn(columns, 'sha256'),
    optionalColumn(columns, 'byte_start'),
    optionalColumn(columns, 'byte_end'),
    optionalColumn(columns, 'tree_node_id'),
  ].join(', ');
  const result = await client.query(`SELECT ${select} FROM atlas_packets WHERE ${clauses.join(' OR ')}`, params);
  return result.rows as PacketRow[];
}

async function sourceRefRows(client: Client, columns: Set<string>, hashes: string[]): Promise<SourceRefRow[]> {
  if (!columns.has('content_hash') || !hashes.length) return [];
  const select = [
    'source_ref_key',
    optionalColumn(columns, 'relative_path'),
    'content_hash',
    optionalColumn(columns, 'start_byte'),
    optionalColumn(columns, 'end_byte'),
    optionalColumn(columns, 'commit_sha'),
  ].join(', ');
  const result = await client.query(`SELECT ${select} FROM atlas_source_refs WHERE content_hash = ANY($1::text[])`, [hashes]);
  return result.rows as SourceRefRow[];
}

function addEvidence(target: ChunkPacketCandidateEvidenceV1[], value: ChunkPacketCandidateEvidenceV1): void {
  if (target.some((row) => row.method === value.method && row.packetKey === value.packetKey && row.evidenceRef === value.evidenceRef)) return;
  target.push(value);
}

function deriveEvidence(point: any, chunk: ChunkRow | undefined, packets: PacketRow[], sourceRefs: SourceRefRow[]): {
  evidence: ChunkPacketCandidateEvidenceV1[];
  firstLoss: string;
} {
  if (!chunk) return { evidence: [], firstLoss: 'QDRANT_POINT_NO_CHUNK' };
  const pointId = String(point.id);
  const sourceRef = normalizeRef(chunk.source_ref);
  const contentHash = String(chunk.content_hash ?? '').trim() || null;
  const metadataPacketKey = String(chunk.metadata?.packet_key ?? '').trim() || null;
  const evidence: ChunkPacketCandidateEvidenceV1[] = [];

  for (const packet of packets) {
    const packetKey = String(packet.packet_key ?? '').trim() || null;
    if (!packetKey) continue;
    const packetSourceRef = normalizeRef(packet.source_ref);
    const base = {
      source: 'atlas_packets',
      packetKey,
      sourceRef: packetSourceRef ?? sourceRef,
      sourceRevision: chunk.source_revision ?? null,
      startByte: packet.byte_start ?? chunk.start_byte ?? null,
      endByte: packet.byte_end ?? chunk.end_byte ?? null,
      contentHash,
      treeNodeId: packet.tree_node_id ?? chunk.tree_node_id ?? null,
    };

    if (metadataPacketKey && packetKey === metadataPacketKey) {
      addEvidence(evidence, { ...base, method: 'EXACT_CANONICAL_ID', evidenceRef: `codebase_chunk_index:${chunk.id}:metadata.packet_key` });
    }
    if ((packet.qdrant_point_id && String(packet.qdrant_point_id) === pointId) || (packet.artifact_id && String(packet.artifact_id) === pointId)) {
      addEvidence(evidence, { ...base, method: 'EXACT_QDRANT_POINT_LINK', evidenceRef: `atlas_packets:${packetKey}:qdrant_point` });
    }
    if (sourceRef && packetSourceRef === sourceRef && chunk.start_byte != null && chunk.end_byte != null && packet.byte_start === chunk.start_byte && packet.byte_end === chunk.end_byte) {
      addEvidence(evidence, { ...base, method: 'EXACT_SOURCE_SPAN', evidenceRef: `atlas_packets:${packetKey}:source_span` });
    }
    if (contentHash && ((packet.sha256 && packet.sha256 === contentHash) || (packet.packet_id && packet.packet_id === contentHash))) {
      addEvidence(evidence, { ...base, method: 'CONTENT_HASH_UNIQUE', evidenceRef: `atlas_packets:${packetKey}:content_hash` });
    }
  }

  const matchingSourceRefs = contentHash ? sourceRefs.filter((row) => row.content_hash === contentHash) : [];
  if (!evidence.length && matchingSourceRefs.length === 1) {
    const row = matchingSourceRefs[0];
    addEvidence(evidence, {
      source: 'atlas_source_refs',
      method: 'CONTENT_HASH_UNIQUE',
      packetKey: null,
      sourceRef: normalizeRef(row.relative_path) ?? sourceRef,
      sourceRevision: row.commit_sha,
      startByte: row.start_byte,
      endByte: row.end_byte,
      contentHash,
      treeNodeId: chunk.tree_node_id,
      evidenceRef: `atlas_source_refs:${row.source_ref_key}`,
    });
  }

  if (!evidence.length) return { evidence, firstLoss: 'CHUNK_NO_EXISTING_PACKET' };
  if (evidence.every((row) => row.method === 'CONTENT_HASH_UNIQUE')) return { evidence, firstLoss: 'CONTENT_HASH_ONLY' };
  return { evidence, firstLoss: 'CANDIDATE_EVIDENCE_PRESENT' };
}

async function main(): Promise<void> {
  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();
  const links: Array<AtlasChunkPacketIdentityLinkV1 & { firstLoss: string }> = [];
  try {
    await client.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const snapshotResult = await client.query(`SELECT pg_current_snapshot()::text AS snapshot, transaction_timestamp()::text AS transaction_timestamp, version() AS version`);
    const snapshot = snapshotResult.rows[0];
    const [chunkColumns, packetColumns, sourceRefColumns] = await Promise.all([
      tableColumns(client, 'codebase_chunk_index'),
      tableColumns(client, 'atlas_packets'),
      tableColumns(client, 'atlas_source_refs'),
    ]);

    let offset: unknown = null;
    let observed = 0;
    while (LIMIT === 0 || observed < LIMIT) {
      const page = await scrollPointPage(offset);
      let points = page.points;
      if (LIMIT > 0) points = points.slice(0, Math.max(0, LIMIT - observed));
      if (!points.length) break;
      observed += points.length;

      const numericIds = points.map((point) => Number(point.id)).filter((id) => Number.isSafeInteger(id) && id >= 0);
      const chunks = await chunkRows(client, chunkColumns, numericIds);
      const chunkList = [...chunks.values()];
      const packetList = await packetRows(client, packetColumns, chunkList, points.map((point) => String(point.id)));
      const hashes = [...new Set(chunkList.map((row) => String(row.content_hash ?? '').trim()).filter(Boolean))];
      const sourceRefList = await sourceRefRows(client, sourceRefColumns, hashes);

      for (const point of points) {
        const chunk = chunks.get(String(point.id));
        const derived = deriveEvidence(point, chunk, packetList, sourceRefList);
        const link = classifyChunkPacketIdentityLink({
          qdrantCollection: COLLECTION,
          qdrantPointId: String(point.id),
          chunkIndexId: chunk?.id ?? null,
          sourceRef: chunk?.source_ref ?? null,
          sourceRevision: chunk?.source_revision ?? null,
          evidence: derived.evidence,
        });
        const firstLoss = link.admission === 'ADMITTED'
          ? 'ADMITTED_EXISTING_PACKET'
          : link.matchMethod === 'AMBIGUOUS'
            ? 'AMBIGUOUS_PACKET'
            : derived.firstLoss;
        links.push({ ...link, firstLoss });
      }

      if (LIMIT > 0 && observed >= LIMIT) break;
      if (page.next === null || page.next === undefined) break;
      offset = page.next;
    }

    await client.query('ROLLBACK');

    links.sort((a, b) => a.qdrantPointId.localeCompare(b.qdrantPointId, 'en', { numeric: true }));
    const manifestText = links.map((row) => canonicalJson(row)).join('\n') + (links.length ? '\n' : '');
    const counts = <T extends string>(selector: (row: typeof links[number]) => T) =>
      Object.fromEntries([...links.reduce((map, row) => map.set(selector(row), (map.get(selector(row)) ?? 0) + 1), new Map<T, number>()).entries()].sort());

    const receipt = {
      schema: 'atlas.s512-chunk-packet-identity-audit.v1',
      generatedAt: new Date().toISOString(),
      collection: COLLECTION,
      qdrantUrl: QDRANT_URL,
      postgresSnapshot: String(snapshot.snapshot),
      transactionTimestamp: String(snapshot.transaction_timestamp),
      postgresVersion: String(snapshot.version),
      isolation: 'REPEATABLE READ',
      readOnly: true,
      observedPointCount: links.length,
      admissionCounts: counts((row) => row.admission),
      confidenceCounts: counts((row) => row.confidence),
      matchMethodCounts: counts((row) => row.matchMethod),
      firstLossCounts: counts((row) => row.firstLoss),
      manifestSha256: sha256(manifestText),
      manifestPath: MANIFEST_PATH,
      schemaCensus: {
        codebaseChunkIndex: [...chunkColumns].sort(),
        atlasPackets: [...packetColumns].sort(),
        atlasSourceRefs: [...sourceRefColumns].sort(),
      },
      invariants: {
        admittedRequiresExistingPacketKey: links.filter((row) => row.admission === 'ADMITTED').every((row) => Boolean(row.canonicalPacketKey)),
        contentHashOnlyNeverAdmitted: links.filter((row) => row.firstLoss === 'CONTENT_HASH_ONLY').every((row) => row.admission !== 'ADMITTED'),
        canonicalPacketMinted: false,
        postgresWritesAttempted: false,
        qdrantWritesAttempted: false,
        canonicalWritesAllowed: false,
      },
      producerRevision: 'audit-s512-chunk-packet-identity.v1',
    };

    await mkdir(path.dirname(MANIFEST_PATH), { recursive: true });
    await mkdir(path.dirname(RECEIPT_PATH), { recursive: true });
    await writeFile(MANIFEST_PATH, manifestText, 'utf8');
    await writeFile(RECEIPT_PATH, JSON.stringify(receipt, null, 2) + '\n', 'utf8');
    console.log(JSON.stringify(receipt, null, 2));
    if (!receipt.invariants.admittedRequiresExistingPacketKey || !receipt.invariants.contentHashOnlyNeverAdmitted) process.exitCode = 2;
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch { /* ignore */ }
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exit(1);
});
