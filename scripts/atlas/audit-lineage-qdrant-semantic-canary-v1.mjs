import fs from 'node:fs/promises';
import path from 'node:path';

const QDRANT_URL = (process.env.QDRANT_URL ?? 'http://127.0.0.1:6333').replace(/\/+$/, '');
const COLLECTION = process.env.ATLAS_QDRANT_COLLECTION ?? 'codebase_chunks_768';
const MAP_PATH = path.resolve('docs/reports/lineage-qualified-candidate-map-v1.json');
const REPORT_PATH = path.resolve('docs/reports/lineage-qdrant-semantic-canary-v1.json');

const text = (value) => value === null || value === undefined ? null : String(value);
const payloadValue = (payload, key) => payload?.[key] ?? payload?.[key.replace(/_([a-z])/g, (_, c) => c.toUpperCase())] ?? null;

async function main() {
  const candidateMap = JSON.parse(await fs.readFile(MAP_PATH, 'utf8'));
  const candidates = candidateMap.candidates ?? [];
  const expectedWorkspaceRevision = candidateMap.lineage?.workspaceRevision ?? candidateMap.workspaceRevision ?? null;
  const packetKeys = candidates.map((candidate) => candidate.packetKey).filter(Boolean);
  if (packetKeys.length === 0) throw new Error('CANARY_CANDIDATE_MAP_HAS_NO_PACKET_KEYS');

  const response = await fetch(`${QDRANT_URL}/collections/${encodeURIComponent(COLLECTION)}/points/scroll`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      limit: Math.max(100, packetKeys.length * 4),
      with_payload: true,
      with_vector: false,
      filter: { must: [{ key: 'packet_key', match: { any: packetKeys } }] },
    }),
    signal: AbortSignal.timeout(60000),
  });
  if (!response.ok) throw new Error(`QDRANT_SCROLL_HTTP_${response.status}`);
  const body = await response.json();
  const points = body.result?.points ?? [];
  const byPacket = new Map(candidates.map((candidate) => [candidate.packetKey, candidate]));
  const matches = [];
  const mismatches = [];
  const historical = [];

  for (const point of points) {
    const payload = point.payload ?? {};
    const packetKey = text(payloadValue(payload, 'packet_key'));
    const candidate = byPacket.get(packetKey);
    if (!candidate) continue;
    const observed = {
      pointId: text(point.id),
      packetKey,
      sourceRef: text(payloadValue(payload, 'source_ref')),
      sourceRevision: text(payloadValue(payload, 'source_revision')),
      workspaceRevision: text(payloadValue(payload, 'workspace_revision')),
      representationId: text(payloadValue(payload, 'representation_id')),
      representationRevision: text(payloadValue(payload, 'representation_revision')),
      embeddingDimension: Number(payloadValue(payload, 'embedding_dimension')) || null,
    };
    const failures = [];
    if (observed.sourceRef !== candidate.sourceRef) failures.push('SOURCE_REF_MISMATCH');
    if (observed.sourceRevision !== candidate.sourceRevision) failures.push('SOURCE_REVISION_MISMATCH');
    if (observed.workspaceRevision !== expectedWorkspaceRevision) failures.push('WORKSPACE_REVISION_MISMATCH');
    if (observed.representationId !== 'semantic_768') failures.push('REPRESENTATION_ID_MISMATCH');
    if (observed.embeddingDimension !== 768) failures.push('EMBEDDING_DIMENSION_MISMATCH');
    if (!observed.representationRevision) failures.push('REPRESENTATION_REVISION_MISSING');
    const result = { ...observed, candidateOrdinal: candidate.candidateOrdinal, failures };
    if (failures.length === 0) matches.push(result);
    else if (observed.workspaceRevision === null && observed.sourceRevision === null && observed.representationRevision === null) historical.push(result);
    else mismatches.push(result);
  }

  const packetCounts = new Map();
  for (const point of points) {
    const packetKey = text(payloadValue(point.payload ?? {}, 'packet_key'));
    if (byPacket.has(packetKey)) packetCounts.set(packetKey, (packetCounts.get(packetKey) ?? 0) + 1);
  }
  const currentCounts = new Map();
  for (const match of matches) currentCounts.set(match.packetKey, (currentCounts.get(match.packetKey) ?? 0) + 1);
  const missingPacketKeys = packetKeys.filter((key) => !currentCounts.has(key));
  const duplicatePacketKeys = [...currentCounts].filter(([, count]) => count > 1).map(([key]) => key);
  const report = {
    schema: 'atlas.lineage-qdrant-semantic-canary.v1',
    collection: COLLECTION,
    qdrantUrl: QDRANT_URL,
    candidateSnapshotRevision: candidateMap.candidateSnapshotRevision,
    ordinalMapChecksum: candidateMap.ordinalMapChecksum,
    workspaceRevision: expectedWorkspaceRevision,
    candidateCount: candidates.length,
    pointsReturned: points.length,
    exactMatches: matches.length,
    historicalPoints: historical.length,
    mismatches,
    missingPacketKeys,
    duplicatePacketKeys,
    promotionEligible: matches.length === candidates.length && mismatches.length === 0 && missingPacketKeys.length === 0 && duplicatePacketKeys.length === 0,
    status: matches.length === candidates.length && mismatches.length === 0 && missingPacketKeys.length === 0 && duplicatePacketKeys.length === 0
      ? 'CANARY_QDRANT_IDENTITY_PROVEN'
      : 'CANARY_QDRANT_IDENTITY_BLOCKED',
    canonicalAuthority: false,
    writes: false,
    matches,
    historical,
  };
  await fs.mkdir(path.dirname(REPORT_PATH), { recursive: true });
  await fs.writeFile(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({
    status: report.status,
    candidateCount: report.candidateCount,
    exactMatches: report.exactMatches,
    mismatches: report.mismatches.length,
    missing: report.missingPacketKeys.length,
    duplicates: report.duplicatePacketKeys.length,
    reportPath: REPORT_PATH,
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
