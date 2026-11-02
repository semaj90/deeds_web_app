/**
 * S512 identity census. Read-only by construction: the PostgreSQL session is
 * transaction_read_only and this script has no Qdrant or SQL mutation path.
 * It links existing packet identities only; it never mints atlas_packets rows.
 */
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const { Pool } = pg;
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const REPORT_DIR = path.resolve(process.env.S512_IDENTITY_REPORT_DIR ?? path.join(ROOT, 'docs', 'reports'));
const JSON_PATH = path.join(REPORT_DIR, 's512-chunk-packet-identity-audit.json');
const MANIFEST_PATH = path.join(REPORT_DIR, 's512-chunk-packet-identity-links.jsonl');
const DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';
const QDRANT_URL = (process.env.QDRANT_URL ?? 'http://127.0.0.1:6333').replace(/\/+$/, '');
const COLLECTION = process.env.S512_QDRANT_COLLECTION ?? 'codebase_chunks_512';
const LIMIT = Math.max(1, Number(process.env.S512_IDENTITY_LIMIT ?? 1000));

function sha256(value) { return createHash('sha256').update(value, 'utf8').digest('hex'); }
function unique(values) { return [...new Set(values.filter((value) => value != null && String(value) !== ''))].map(String).sort(); }
function tableName(schema, name) { return schema.some((row) => row.table_name === name) ? name : null; }

async function jsonFetch(url, init = {}) {
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(15_000) });
  const text = await response.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = { raw: text.slice(0, 500) }; }
  if (!response.ok) throw new Error(`HTTP_${response.status}:${url}`);
  return body;
}

async function scrollPoints() {
  const points = [];
  let offset = null;
  while (points.length < LIMIT) {
    const body = await jsonFetch(`${QDRANT_URL}/collections/${encodeURIComponent(COLLECTION)}/points/scroll`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ limit: Math.min(256, LIMIT - points.length), offset, with_payload: true, with_vectors: false }),
    });
    const result = body?.result ?? {};
    const page = Array.isArray(result.points) ? result.points : [];
    points.push(...page);
    offset = result.next_page_offset ?? null;
    if (!offset || page.length === 0) break;
  }
  return points.slice(0, LIMIT);
}

async function columns(client, table) {
  const { rows } = await client.query(`
    SELECT column_name FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = $1 ORDER BY ordinal_position
  `, [table]);
  return rows.map((row) => row.column_name);
}

function selectColumns(available, preferred) {
  return preferred.filter((name) => available.includes(name));
}

async function fetchCandidates(client, table, available, value, fields) {
  if (!table || value == null) return [];
  const usable = selectColumns(available, fields);
  const predicates = usable.filter((field) => field === 'packet_key' || field === 'source_ref' || field === 'content_hash' || field === 'sha256' || field === 'qdrant_point_id');
  if (usable.length === 0 || predicates.length === 0) return [];
  const clauses = predicates.map((field, index) => `"${field}"::text = $${index + 1}`).join(' OR ');
  const params = predicates.map(() => String(value));
  const { rows } = await client.query(`SELECT ${usable.map((field) => `"${field}"`).join(', ')} FROM "${table}" WHERE ${clauses} LIMIT 20`, params);
  return rows;
}

async function fetchCandidateRows(client, table, available, values, fields) {
  if (!table || values.length === 0) return [];
  const usable = selectColumns(available, fields);
  const predicates = usable.filter((field) => field === 'packet_key' || field === 'source_ref' || field === 'content_hash' || field === 'sha256' || field === 'qdrant_point_id');
  if (usable.length === 0 || predicates.length === 0) return [];
  const clauses = predicates.map((field) => `"${field}"::text = ANY($1::text[])`).join(' OR ');
  const { rows } = await client.query(`SELECT ${usable.map((field) => `"${field}"`).join(', ')} FROM "${table}" WHERE ${clauses} LIMIT 100000`, [values]);
  return rows;
}

function indexCandidateRows(rows, available) {
  const index = new Map();
  for (const row of rows) {
    for (const field of selectColumns(available, ['packet_key', 'source_ref', 'content_hash', 'sha256', 'qdrant_point_id'])) {
      const value = row[field];
      if (value == null || String(value) === '') continue;
      const key = String(value);
      const bucket = index.get(key) ?? [];
      bucket.push(row);
      index.set(key, bucket);
    }
  }
  return index;
}

function classify(point, candidates, sourceCandidates, packetCandidates) {
  const payload = point.payload ?? {};
  const pointId = String(point.id);
  const packetKey = payload.packet_key ?? payload.packetKey ?? null;
  const sourceRef = payload.source_ref ?? payload.sourceRef ?? payload.path ?? null;
  const contentHash = payload.content_hash ?? payload.contentHash ?? payload.sha256 ?? null;
  const candidatePacketKeys = unique([
    ...candidates.map((row) => row.packet_key ?? row.packetKey),
    ...sourceCandidates.map((row) => row.packet_key ?? row.packetKey),
  ]);
  const exactPayloadPacket = candidatePacketKeys.find((key) => key === String(packetKey)) ?? null;
  const exactPointRow = packetCandidates.find((row) =>
    row.packet_key != null && row.qdrant_point_id != null && String(row.qdrant_point_id) === pointId
  ) ?? null;
  const payloadStart = payload.byte_start ?? payload.start_byte ?? payload.startByte ?? null;
  const payloadEnd = payload.byte_end ?? payload.end_byte ?? payload.endByte ?? null;
  const exactSpanRow = packetCandidates.find((row) =>
    row.packet_key != null
    && payloadStart != null
    && payloadEnd != null
    && Number(row.byte_start) === Number(payloadStart)
    && Number(row.byte_end) === Number(payloadEnd)
    && (sourceRef == null || row.source_ref == null || String(row.source_ref) === String(sourceRef))
  ) ?? null;
  const exactPacket = exactPayloadPacket ?? exactPointRow?.packet_key ?? exactSpanRow?.packet_key ?? null;
  let matchMethod = 'UNRESOLVED';
  let confidence = 'NONE';
  let canonicalPacketKey = null;
  let firstLoss = 'QDRANT_POINT_NO_CHUNK';
  if (exactPacket) {
    matchMethod = exactPayloadPacket
      ? 'EXACT_CANONICAL_ID'
      : exactPointRow
        ? 'EXACT_QDRANT_POINT_LINK'
        : 'EXACT_SOURCE_SPAN';
    confidence = 'EXACT'; canonicalPacketKey = exactPacket; firstLoss = 'ADMITTED_EXISTING_PACKET';
  } else if (candidatePacketKeys.length > 1) {
    matchMethod = 'AMBIGUOUS'; confidence = 'AMBIGUOUS'; firstLoss = 'AMBIGUOUS_PACKET';
  } else if (candidatePacketKeys.length === 1) {
    // A source_ref/content_hash lookup is only a candidate until byte-span or
    // another exact canonical join is verified. Never admit it as a packet.
    matchMethod = contentHash ? 'CONTENT_HASH_UNIQUE' : 'UNRESOLVED';
    confidence = contentHash ? 'UNIQUE_DERIVATION' : 'NONE';
    canonicalPacketKey = candidatePacketKeys[0];
    firstLoss = contentHash ? 'CONTENT_HASH_ONLY' : 'CANDIDATE_EVIDENCE_PRESENT';
  } else if (contentHash || sourceRef) {
    matchMethod = 'UNRESOLVED'; firstLoss = 'CHUNK_NO_EXISTING_PACKET';
  }
  const admitted = Boolean(canonicalPacketKey && confidence === 'EXACT');
  return {
    schema: 'atlas.chunk-packet-identity-link.v1',
    qdrantCollection: COLLECTION,
    qdrantPointId: pointId,
    chunkIndexId: String(payload.chunk_id ?? payload.chunk_index_id ?? pointId),
    canonicalPacketKey,
    sourceRef: sourceRef == null ? null : String(sourceRef),
    sourceRevision: payload.source_revision ?? payload.sourceRevision ?? null,
    matchMethod,
    candidatePacketKeys,
    confidence,
    evidenceRefs: unique(['s512:read-only-census', sourceRef ? `source_ref:${sourceRef}` : null]),
    admission: admitted ? 'ADMITTED' : 'QUARANTINED',
    canonicalPacketMinted: false,
    canonicalWritesAllowed: false,
    firstLoss,
  };
}

async function main() {
  const pool = new Pool({ connectionString: DATABASE_URL, max: 1 });
  const report = {
    schema: 'atlas.s512-chunk-packet-identity-audit.v1',
    generatedAt: new Date().toISOString(),
    collection: COLLECTION,
    limit: LIMIT,
    readOnly: true,
    canonicalPacketMinted: false,
    postgresWritesAttempted: false,
    qdrantWritesAttempted: false,
    canonicalWritesAllowed: false,
    status: 'UNPROVEN',
  };
  try {
    const points = await scrollPoints();
    const client = await pool.connect();
    try {
      await client.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
      const tableRows = (await client.query(`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name = ANY($1::text[])`, [['codebase_chunk_index', 'atlas_packets', 'atlas_source_refs']])).rows;
      const tables = {};
      for (const row of tableRows) tables[row.table_name] = await columns(client, row.table_name);
      const packetTable = tableName(tableRows, 'atlas_packets');
      const chunkTable = tableName(tableRows, 'codebase_chunk_index');
      const sourceTable = tableName(tableRows, 'atlas_source_refs');
      const pointValues = unique(points.flatMap((point) => {
        const payload = point.payload ?? {};
        return [payload.packet_key ?? payload.packetKey, payload.source_ref ?? payload.sourceRef ?? payload.path, payload.content_hash ?? payload.contentHash ?? payload.sha256, point.id];
      }));
      const chunkRows = await fetchCandidateRows(client, chunkTable, tables[chunkTable] ?? [], pointValues, ['packet_key', 'source_ref', 'content_hash', 'sha256', 'qdrant_point_id', 'byte_start', 'byte_end', 'start_byte', 'end_byte']);
      const sourceRows = await fetchCandidateRows(client, sourceTable, tables[sourceTable] ?? [], pointValues, ['packet_key', 'source_ref', 'content_hash', 'sha256', 'start_byte', 'end_byte', 'relative_path']);
      const packetRows = await fetchCandidateRows(client, packetTable, tables[packetTable] ?? [], pointValues, ['packet_key', 'source_ref', 'content_hash', 'sha256', 'qdrant_point_id', 'byte_start', 'byte_end', 'source_path', 'canonical_source_ref']);
      const chunkIndex = indexCandidateRows(chunkRows, tables[chunkTable] ?? []);
      const sourceIndex = indexCandidateRows(sourceRows, tables[sourceTable] ?? []);
      const packetIndex = indexCandidateRows(packetRows, tables[packetTable] ?? []);
      const links = [];
      for (const point of points) {
        const payload = point.payload ?? {};
        const values = unique([payload.packet_key ?? payload.packetKey, payload.source_ref ?? payload.sourceRef ?? payload.path, payload.content_hash ?? payload.contentHash ?? payload.sha256, point.id]);
        const candidates = values.flatMap((value) => chunkIndex.get(value) ?? []);
        const sourceCandidates = values.flatMap((value) => sourceIndex.get(value) ?? []);
        const packetCandidates = values.flatMap((value) => packetIndex.get(value) ?? []);
        links.push(classify(point, [...candidates, ...packetCandidates], sourceCandidates, packetCandidates));
      }
      await client.query('ROLLBACK');
      const lines = links.map((link) => JSON.stringify(link)).join('\n') + (links.length ? '\n' : '');
      await mkdir(REPORT_DIR, { recursive: true });
      await writeFile(MANIFEST_PATH, lines, 'utf8');
      const count = (key) => links.filter((link) => link[key] === true).length;
      const counts = (key) => Object.fromEntries([...new Set(links.map((link) => link[key]))].sort().map((value) => [value, links.filter((link) => link[key] === value).length]));
      report.pointCount = links.length;
      report.manifestSha256 = sha256(lines);
      report.admissionCounts = counts('admission');
      report.confidenceCounts = counts('confidence');
      report.matchMethodCounts = counts('matchMethod');
      report.firstLossCounts = counts('firstLoss');
      report.schemaCensus = { tables: Object.fromEntries(Object.entries(tables).map(([name, value]) => [name, value])) };
      report.status = 'READ_ONLY_CENSUS_COMPLETE';
    } finally { client.release(); }
  } catch (error) {
    report.status = 'READ_ONLY_CENSUS_BLOCKED';
    report.error = error instanceof Error ? error.message : String(error);
  } finally {
    await pool.end();
  }
  await mkdir(REPORT_DIR, { recursive: true });
  await writeFile(JSON_PATH, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ status: report.status, report: JSON_PATH, manifest: MANIFEST_PATH, pointCount: report.pointCount ?? 0 }, null, 2));
  if (report.status === 'READ_ONLY_CENSUS_BLOCKED') process.exitCode = 4;
}

await main();
