import { mkdir, writeFile } from 'node:fs/promises';
import { buildExternalEvidenceRecordV1, buildExternalEvidenceSetV1, selectExternalResearchEvidenceForAce } from '../../sveltekit-frontend/src/lib/server/atlas/research/external-research-evidence-set-v1.js';

const GO_URL = process.env.GO_RETRIEVAL_HTTP_URL ?? 'http://127.0.0.1:8100';
const QDRANT_URL = process.env.QDRANT_URL ?? 'http://127.0.0.1:6333';
const QUERY = process.env.ATLAS_RESEARCH_EVIDENCE_QUERY ?? 'PostgreSQL pgvector';
const SOURCE_FILTER = ['github_issue'];
const COLLECTION = 'chunks_web_search';
const REQUEST_ID = `research-evidence:${QUERY.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`;
const REPORT = 'docs/reports/research-evidence-boundary-v1.json';

async function goSearch(): Promise<any[]> {
  const response = await fetch(`${GO_URL.replace(/\/$/, '')}/search/research`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ query: QUERY, limit: 100, source_filter: SOURCE_FILTER, score_threshold: 0 }),
  });
  if (!response.ok) throw new Error(`GO_RESEARCH_HTTP_${response.status}`);
  const body = await response.json() as any;
  return Array.isArray(body.results) ? body.results : [];
}

async function qdrantReadback(ids: string[]): Promise<Map<string, any>> {
  const response = await fetch(`${QDRANT_URL}/collections/${COLLECTION}/points`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ids, with_payload: true, with_vector: false }),
  });
  if (!response.ok) throw new Error(`QDRANT_POINT_READBACK_HTTP_${response.status}`);
  const body = await response.json() as any;
  return new Map((body.result ?? []).map((point: any) => [String(point.id), point]));
}

async function buildSet() {
  const ranked = await goSearch();
  const unique = new Map<string, any>();
  for (const result of ranked) {
    const id = String(result.id ?? '');
    if (id && !unique.has(id)) unique.set(id, result);
  }
  const points = await qdrantReadback([...unique.keys()]);
  const candidates: any[] = [];
  for (const [rankIndex, result] of [...unique.values()].entries()) {
    const pointId = String(result.id);
    const point = points.get(pointId);
    if (!point) continue;
    const payload = point.payload ?? {};
    const parentExternalId = String(payload.parent_id ?? '');
    const fetchedAt = String(payload.fetched_at ?? '');
    if (!parentExternalId || !fetchedAt || Number.isNaN(Date.parse(fetchedAt))) continue;
    candidates.push(buildExternalEvidenceRecordV1({
      pointId,
      parentExternalId,
      segmentIndex: Number(payload.segment_index),
      source: String(payload.source),
      url: payload.url ? String(payload.url) : null,
      title: payload.title ? String(payload.title) : null,
      text: String(payload.body ?? ''),
      contentChecksum: String(payload.content_checksum),
      fetchedAt,
      provenanceClass: 'EXTERNAL_CITED',
      retrievalScore: Number(result.score ?? 0),
      retrievalRank: rankIndex + 1,
      retrievalOwner: 'go-retrieval',
      collection: COLLECTION,
      vectorName: 'content',
      embeddingDimension: 768,
      embeddingRevision: String(payload.embedding_revision ?? 'unknown'),
      candidateOrdinal: null,
      packetKey: null,
      workspaceRevision: null,
      sourceRevision: null,
      canonicalAuthority: false,
      localSourceGrounding: false,
      mutationAuthority: false,
    }));
  }
  const selected = selectExternalResearchEvidenceForAce(candidates, { maxCards: 6, perParentLimit: 2 });
  return buildExternalEvidenceSetV1({ requestId: REQUEST_ID, query: QUERY, filter: { source_filter: SOURCE_FILTER }, embeddingRevision: selected[0]?.embeddingRevision ?? 'unknown', evidence: selected });
}

async function main() {
  const first = await buildSet();
  const second = await buildSet();
  const report = {
    schema: 'atlas.research-evidence-boundary-replay.v1',
    readOnly: true,
    requestId: REQUEST_ID,
    query: QUERY,
    collection: COLLECTION,
    resultCount: first.resultCount,
    parentCount: new Set(first.evidence.map((item) => item.parentExternalId)).size,
    maxSegmentsPerParent: Math.max(0, ...[...new Set(first.evidence.map((item) => item.parentExternalId))].map((parent) => first.evidence.filter((item) => item.parentExternalId === parent).length)),
    evidenceSetChecksum: first.evidenceSetChecksum,
    replayEvidenceSetChecksum: second.evidenceSetChecksum,
    deterministicReplay: first.evidenceSetChecksum === second.evidenceSetChecksum,
    externalEvidenceOnly: true,
    canonicalAuthority: false,
    localIdentityAssigned: first.evidence.some((item) => item.candidateOrdinal !== null || item.packetKey !== null || item.workspaceRevision !== null || item.sourceRevision !== null),
    writes: { postgres: false, qdrant: false, valkey: false, neo4j: false },
    status: first.evidenceSetChecksum === second.evidenceSetChecksum ? 'EXT_EVIDENCE_SET_REPLAY_PROVEN' : 'EXT_EVIDENCE_SET_REPLAY_NONDETERMINISTIC',
    nextGate: 'ACE_EXTERNAL_PARENT_DIVERSITY_REPLAY',
  };
  await mkdir('docs/reports', { recursive: true });
  await writeFile(REPORT, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ ...report, report: REPORT }, null, 2));
}

main().catch((error) => {
  console.error(`[research-evidence-boundary] ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
