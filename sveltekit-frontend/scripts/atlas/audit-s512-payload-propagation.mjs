/**
 * Read-only audit separating active writer contract from historical payload
 * population. It never updates Qdrant or Postgres.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const REPORT_DIR = path.resolve(process.env.S512_IDENTITY_REPORT_DIR ?? path.join(ROOT, 'docs', 'reports'));
const OUTPUT_PATH = path.join(REPORT_DIR, 's512-payload-propagation-audit.json');
const QDRANT_URL = (process.env.QDRANT_URL ?? 'http://127.0.0.1:6333').replace(/\/+$/, '');
const COLLECTION = process.env.S512_QDRANT_COLLECTION ?? 'codebase_chunks_512';
const LIMIT = Math.max(1, Number(process.env.S512_IDENTITY_LIMIT ?? 1000));
const WRITER_PATH = path.join(ROOT, 'sveltekit-frontend', 'src', 'lib', 'server', 'retrieval', 'qdrant-sync-payload.ts');

async function jsonFetch(url, init = {}) {
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(15_000) });
  const body = await response.json();
  if (!response.ok) throw new Error(`HTTP_${response.status}:${url}`);
  return body;
}

async function scrollPoints() {
  const points = [];
  let offset = null;
  while (points.length < LIMIT) {
    const body = await jsonFetch(`${QDRANT_URL}/collections/${encodeURIComponent(COLLECTION)}/points/scroll`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ limit: Math.min(256, LIMIT - points.length), offset, with_payload: true, with_vectors: false }),
    });
    const page = Array.isArray(body?.result?.points) ? body.result.points : [];
    points.push(...page);
    offset = body?.result?.next_page_offset ?? null;
    if (!offset || page.length === 0) break;
  }
  return points.slice(0, LIMIT);
}

async function main() {
  const writerSource = await readFile(WRITER_PATH, 'utf8');
  const points = await scrollPoints();
  const has = (point, field) => point?.payload?.[field] != null && String(point.payload[field]) !== '';
  const count = (field) => points.filter((point) => has(point, field)).length;
  const packetKeyCount = count('packet_key');
  const sourceRefCount = count('source_ref');
  const qdrantPointIdCount = count('qdrant_point_id');
  const writerContract = {
    path: WRITER_PATH,
    packetKeyFieldPresent: /packet_key:\s*String\(p\.packetKey\)/.test(writerSource),
    sourceRefFieldPresent: /source_ref:\s*String\(p\.sourceRef\)/.test(writerSource),
  };
  const receipt = {
    schema: 'atlas.s512-payload-propagation-audit.v1',
    generatedAt: new Date().toISOString(),
    collection: COLLECTION,
    pointCount: points.length,
    readOnly: true,
    qdrantWritesAttempted: false,
    postgresWritesAttempted: false,
    writerContract,
    payloadCoverage: {
      packet_key: packetKeyCount,
      source_ref: sourceRefCount,
      qdrant_point_id: qdrantPointIdCount,
      packetKeyMissing: points.length - packetKeyCount,
      sourceRefMissing: points.length - sourceRefCount,
    },
    status: packetKeyCount === points.length && sourceRefCount === points.length
      ? 'S512_PAYLOAD_PROPAGATION_PRESENT'
      : 'S512_PAYLOAD_PROPAGATION_GAP',
    likelyFirstLoss: packetKeyCount < points.length && writerContract.packetKeyFieldPresent
      ? 'HISTORICAL_PROJECTION_PAYLOAD_MISSING_ACTIVE_WRITER_CONTRACT_PRESENT'
      : 'PAYLOAD_CONTRACT_REVIEW_REQUIRED',
  };
  await mkdir(REPORT_DIR, { recursive: true });
  await writeFile(OUTPUT_PATH, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify(receipt, null, 2));
}

await main();
