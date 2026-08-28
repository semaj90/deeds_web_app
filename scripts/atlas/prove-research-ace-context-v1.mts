import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { buildAtlasExternalResearchEvidenceV1 } from '../../sveltekit-frontend/src/lib/server/atlas/research/external-research-evidence-v1.js';
import { externalResearchEvidenceToAceCardV1 } from '../../sveltekit-frontend/src/lib/server/atlas/research/external-research-ace-adapter-v1.js';
import { selectAceCardsV2 } from '../../sveltekit-frontend/src/lib/server/atlas/context/ace-card-selection-v2.js';

const QDRANT_URL = process.env.QDRANT_URL ?? 'http://127.0.0.1:6333';
const COLLECTION = 'chunks_web_search';
const QUERY = process.env.ATLAS_RESEARCH_ACE_QUERY ?? 'PostgreSQL pgvector';
const REPORT = 'docs/reports/research-ace-context-replay-v1.json';
const queryId = `research-canary:${createHash('sha256').update(QUERY).digest('hex').slice(0, 16)}`;

function sha256(value: unknown): string {
  return `sha256:${createHash('sha256').update(JSON.stringify(value)).digest('hex')}`;
}

async function qdrantRetrieve(): Promise<any[]> {
  const scroll = await fetch(`${QDRANT_URL}/collections/${COLLECTION}/points/scroll`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ limit: 100, with_payload: true, with_vector: false }),
  });
  if (!scroll.ok) throw new Error(`QDRANT_SCROLL_HTTP_${scroll.status}`);
  const body = await scroll.json() as any;
  return (body.result?.points ?? []).sort((a: any, b: any) => String(a.id).localeCompare(String(b.id)));
}

function buildSelection(points: any[]) {
  const cards = points.map((point) => {
    const payload = point.payload ?? {};
    const evidence = buildAtlasExternalResearchEvidenceV1({
      queryId,
      sourceKind: payload.source,
      externalId: payload.chunk_id,
      url: payload.url,
      title: payload.title,
      text: payload.body,
      semanticScore: Math.max(0, Math.min(1, Number(payload.score) || 0)),
      fetchedAt: payload.fetched_at,
      retrievalRevision: payload.ingestion_schema_revision ?? 'research-ingest:unknown',
    });
    return externalResearchEvidenceToAceCardV1(evidence, {
      workspaceRevision: 'sha256:external-research-domain',
      candidateSnapshotRevision: `external-research:${queryId}`,
      ordinalMapChecksum: 'sha256:external-not-applicable',
    });
  });
  const context = {
    workspaceRevision: 'sha256:external-research-domain',
    candidateSnapshotRevision: `external-research:${queryId}`,
    ordinalMapChecksum: 'sha256:external-not-applicable',
  };
  return selectAceCardsV2({ cards, query: QUERY, ...context, maxCards: points.length, tokenBudget: 20_000 });
}

async function main() {
  const points = await qdrantRetrieve();
  if (points.length === 0) throw new Error('RESEARCH_CANARY_EMPTY');
  const first = buildSelection(points);
  const second = buildSelection(points);
  const report = {
    schema: 'atlas.research-ace-context-replay.v1',
    readOnly: true,
    collection: COLLECTION,
    query: QUERY,
    pointCount: points.length,
    selectedCount: first.selected.length,
    rejectedCount: first.rejected.length,
    selectionChecksum: first.checksum,
    replaySelectionChecksum: second.checksum,
    deterministicReplay: first.checksum === second.checksum,
    externalEvidenceOnly: true,
    localIdentityAssigned: false,
    writes: { postgres: false, qdrant: false, valkey: false, neo4j: false },
    status: first.checksum === second.checksum ? 'ACE_EXTERNAL_REPLAY_PROVEN' : 'ACE_EXTERNAL_REPLAY_NONDETERMINISTIC',
    nextGate: 'CONTEXT_MANIFEST_EXTERNAL_REPLAY',
  };
  await mkdir('docs/reports', { recursive: true });
  await writeFile(REPORT, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ ...report, report: REPORT }, null, 2));
}

main().catch((error) => {
  console.error(`[research-ace-context] ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
