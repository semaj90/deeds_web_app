import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';

const QDRANT_URL = process.env.QDRANT_URL ?? 'http://127.0.0.1:6333';
const COLLECTION = 'chunks_web_search';
const INGESTION_SCHEMA_REVISION = 'atlas.research-ingest:v2';
const REPORT = 'docs/reports/research-point-identity-v1.json';

function expectedPointId(payload) {
  const digest = createHash('sha256')
    .update(JSON.stringify({
      source: payload.source,
      parentExternalId: payload.parent_id,
      url: payload.url,
      segmentIndex: payload.segment_index,
      contentChecksum: payload.content_checksum,
      ingestionSchemaRevision: INGESTION_SCHEMA_REVISION,
    }))
    .digest('hex');
  const hex = digest.slice(0, 32).split('');
  hex[12] = '5';
  hex[16] = ['8', '9', 'a', 'b'][Number.parseInt(hex[16], 16) % 4];
  const raw = hex.join('');
  return `${raw.slice(0, 8)}-${raw.slice(8, 12)}-${raw.slice(12, 16)}-${raw.slice(16, 20)}-${raw.slice(20)}`;
}

async function main() {
  const response = await fetch(`${QDRANT_URL}/collections/${COLLECTION}/points/scroll`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ limit: 100, with_payload: true, with_vector: false }),
  });
  if (!response.ok) throw new Error(`QDRANT_SCROLL_HTTP_${response.status}`);
  const body = await response.json();
  const points = body.result?.points ?? [];
  const rows = points.map((point) => {
    const payload = point.payload ?? {};
    const actual = String(point.id);
    const expected = expectedPointId(payload);
    return {
      pointId: actual,
      expectedPointId: expected,
      deterministicMatch: actual === expected,
      uuidShape: /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(actual),
      source: payload.source ?? null,
      parentExternalId: payload.parent_id ?? null,
      segmentIndex: payload.segment_index ?? null,
      contentChecksum: payload.content_checksum ?? null,
    };
  });
  const report = {
    schema: 'atlas.research-point-identity-v1',
    collection: COLLECTION,
    pointCount: rows.length,
    deterministicMatches: rows.filter((row) => row.deterministicMatch).length,
    uuidShapeMatches: rows.filter((row) => row.uuidShape).length,
    algorithm: 'sha256-derived-uuid-shaped-v1',
    formalUuidV5: false,
    projectionIdentityOnly: true,
    canonicalAtlasIdentity: false,
    writes: { postgres: false, qdrant: false, valkey: false, neo4j: false },
    status: rows.length > 0 && rows.every((row) => row.deterministicMatch && row.uuidShape)
      ? 'RESEARCH_POINT_IDENTITY_PROVEN'
      : 'RESEARCH_POINT_IDENTITY_FAILED',
    rows,
  };
  await mkdir('docs/reports', { recursive: true });
  await writeFile(REPORT, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ ...report, report: REPORT }, null, 2));
}

main().catch((error) => {
  console.error(`[research-point-identity] ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
