/**
 * S512 ID4 readback. Rechecks admitted links against current Qdrant and
 * atlas_packets state in read-only mode. No INSERT, UPDATE, DELETE, or mint.
 */
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const { Pool } = pg;
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const REPORT_DIR = path.resolve(process.env.S512_IDENTITY_REPORT_DIR ?? path.join(ROOT, 'docs', 'reports'));
const AUDIT_PATH = path.join(REPORT_DIR, 's512-chunk-packet-identity-audit.json');
const MANIFEST_PATH = path.join(REPORT_DIR, 's512-chunk-packet-identity-links.jsonl');
const OUTPUT_PATH = path.join(REPORT_DIR, 's512-identity-readback.json');
const DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';
const QDRANT_URL = (process.env.QDRANT_URL ?? 'http://127.0.0.1:6333').replace(/\/+$/, '');
const COLLECTION = process.env.S512_QDRANT_COLLECTION ?? 'codebase_chunks_512';

function sha256(value) { return createHash('sha256').update(value, 'utf8').digest('hex'); }
function qdrantId(value) { return /^\d+$/.test(String(value)) ? Number(value) : String(value); }
function text(value) { return value == null ? null : String(value); }

async function jsonFetch(url, init = {}) {
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(15_000) });
  const bodyText = await response.text();
  let body = null;
  try { body = bodyText ? JSON.parse(bodyText) : null; } catch { body = { raw: bodyText.slice(0, 500) }; }
  if (!response.ok) throw new Error(`HTTP_${response.status}:${url}`);
  return body;
}

async function main() {
  const checks = [];
  const audit = JSON.parse(await readFile(AUDIT_PATH, 'utf8'));
  const manifestText = await readFile(MANIFEST_PATH, 'utf8');
  const links = manifestText.trim() ? manifestText.trimEnd().split('\n').map((line) => JSON.parse(line)) : [];
  const admitted = links.filter((link) => link.admission === 'ADMITTED');
  const exact = admitted.filter((link) => link.matchMethod === 'EXACT_QDRANT_POINT_LINK');
  const sourceHash = sha256(manifestText);
  if (audit.manifestSha256 !== sourceHash) throw new Error('MANIFEST_CHECKSUM_MISMATCH');
  if (exact.length === 0) {
    const receipt = {
      schema: 'atlas.s512-identity-readback.v1',
      generatedAt: new Date().toISOString(),
      collection: COLLECTION,
      sourceManifest: MANIFEST_PATH,
      manifestSha256: sourceHash,
      exactLinkCount: 0,
      qdrantPointCount: 0,
      atlasPacketRowCount: 0,
      readOnly: true,
      postgresWritesAttempted: false,
      qdrantWritesAttempted: false,
      canonicalPacketMinted: false,
      canonicalWritesAllowed: false,
      status: 'S512_ID4_NO_EXACT_LINKS_FOUND',
      failureCount: 0,
      failures: [],
      blockedReason: 'CURRENT_MANIFEST_HAS_NO_EXACT_QDRANT_POINT_LINKS',
    };
    await mkdir(REPORT_DIR, { recursive: true });
    await writeFile(OUTPUT_PATH, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
    console.log(JSON.stringify(receipt, null, 2));
    return;
  }

  const ids = exact.map((link) => qdrantId(link.qdrantPointId));
  const body = await jsonFetch(`${QDRANT_URL}/collections/${encodeURIComponent(COLLECTION)}/points`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ids, with_payload: true, with_vectors: false }),
  });
  const points = Array.isArray(body?.result) ? body.result : [];
  const pointById = new Map(points.map((point) => [String(point.id), point]));

  const pool = new Pool({ connectionString: DATABASE_URL, max: 1 });
  const client = await pool.connect();
  let packetRows = [];
  try {
    await client.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const columnsResult = await client.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'atlas_packets'
      ORDER BY ordinal_position
    `);
    const available = new Set(columnsResult.rows.map((row) => row.column_name));
    if (!available.has('packet_key') || !available.has('qdrant_point_id')) throw new Error('ATLAS_PACKETS_LINK_COLUMNS_MISSING');
    const selected = ['packet_key', 'qdrant_point_id', 'source_ref', 'canonical_source_ref', 'byte_start', 'byte_end']
      .filter((column) => available.has(column));
    const keys = exact.map((link) => link.canonicalPacketKey);
    const qids = exact.map((link) => String(link.qdrantPointId));
    const { rows } = await client.query(
      `SELECT ${selected.map((column) => `"${column}"`).join(', ')} FROM "atlas_packets"
       WHERE "packet_key"::text = ANY($1::text[]) OR "qdrant_point_id"::text = ANY($2::text[])`,
      [keys, qids],
    );
    packetRows = rows;
    await client.query('ROLLBACK');
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch {}
    throw error;
  } finally {
    client.release();
    await pool.end();
  }

  const packetByKey = new Map(packetRows.map((row) => [text(row.packet_key), row]));
  const failures = [];
  for (const link of exact) {
    const point = pointById.get(String(link.qdrantPointId));
    const packet = packetByKey.get(text(link.canonicalPacketKey));
    const payload = point?.payload ?? {};
    const payloadPacketKey = text(payload.packet_key ?? payload.packetKey);
    const payloadSourceRef = text(payload.source_ref ?? payload.sourceRef ?? payload.path);
    const packetPointId = text(packet?.qdrant_point_id);
    const expectedSourceRef = text(link.sourceRef);
    const sourceOk = expectedSourceRef == null || payloadSourceRef == null || expectedSourceRef === payloadSourceRef;
    if (!point || !packet || packetPointId !== text(link.qdrantPointId) || payloadPacketKey !== text(link.canonicalPacketKey) || !sourceOk) {
      failures.push({
        qdrantPointId: link.qdrantPointId,
        canonicalPacketKey: link.canonicalPacketKey,
        pointPresent: Boolean(point),
        packetPresent: Boolean(packet),
        packetPointId,
        payloadPacketKey,
        payloadSourceRef,
        expectedSourceRef,
      });
    }
  }

  const status = failures.length === 0
    ? 'S512_ID4_READBACK_PROVEN'
    : 'S512_ID4_READBACK_BLOCKED';
  const receipt = {
    schema: 'atlas.s512-identity-readback.v1',
    generatedAt: new Date().toISOString(),
    collection: COLLECTION,
    sourceManifest: MANIFEST_PATH,
    manifestSha256: sourceHash,
    exactLinkCount: exact.length,
    qdrantPointCount: points.length,
    atlasPacketRowCount: packetRows.length,
    readOnly: true,
    postgresWritesAttempted: false,
    qdrantWritesAttempted: false,
    canonicalPacketMinted: false,
    canonicalWritesAllowed: false,
    status,
    failureCount: failures.length,
    failures,
  };
  await mkdir(REPORT_DIR, { recursive: true });
  await writeFile(OUTPUT_PATH, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify(receipt, null, 2));
  if (failures.length > 0) process.exitCode = 4;
}

await main();
