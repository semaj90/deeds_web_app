import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { buildAtlasExternalResearchEvidenceV1 } from '../../sveltekit-frontend/src/lib/server/atlas/research/external-research-evidence-v1.js';
import { externalResearchEvidenceToAceCardV1 } from '../../sveltekit-frontend/src/lib/server/atlas/research/external-research-ace-adapter-v1.js';
import { selectAceCardsV2 } from '../../sveltekit-frontend/src/lib/server/atlas/context/ace-card-selection-v2.js';
import { compileContext, type ContextCandidate } from '../../sveltekit-frontend/src/lib/server/ace/context-compiler.parent-atlas.js';
import { buildPromptPlanV1 } from '../../sveltekit-frontend/src/lib/server/atlas/prefill/prompt-plan-v1.js';
import { buildExternalEvidenceRecordV1, selectExternalResearchEvidenceForAce } from '../../sveltekit-frontend/src/lib/server/atlas/research/external-research-evidence-set-v1.js';

const GO_URL = process.env.GO_RETRIEVAL_HTTP_URL ?? 'http://127.0.0.1:8100';
const QDRANT_URL = process.env.QDRANT_URL ?? 'http://127.0.0.1:6333';
const QUERY = process.env.ATLAS_RESEARCH_ACE_QUERY ?? 'PostgreSQL pgvector';
const COLLECTION = 'chunks_web_search';
const SOURCE_FILTER = ['github_issue'];
const WORKSPACE = 'sha256:external-research-domain';
const QUERY_ID = `research-canary:${createHash('sha256').update(QUERY).digest('hex').slice(0, 16)}`;
const REPORT = 'docs/reports/research-ace-diversity-context-v1.json';
const NOW = new Date('2026-08-28T00:00:00.000Z');

async function goSearch(): Promise<any[]> {
  const response = await fetch(`${GO_URL.replace(/\/$/, '')}/search/research`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ query: QUERY, limit: 100, source_filter: SOURCE_FILTER, score_threshold: 0 }),
  });
  if (!response.ok) throw new Error(`GO_RESEARCH_HTTP_${response.status}`);
  const body = await response.json() as any;
  return Array.isArray(body.results) ? body.results : [];
}

async function readPoints(ids: string[]): Promise<Map<string, any>> {
  const response = await fetch(`${QDRANT_URL}/collections/${COLLECTION}/points`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ids, with_payload: true, with_vector: false }),
  });
  if (!response.ok) throw new Error(`QDRANT_POINT_READBACK_HTTP_${response.status}`);
  const body = await response.json() as any;
  return new Map((body.result ?? []).map((point: any) => [String(point.id), point]));
}

async function buildSelection() {
  const ranked = await goSearch();
  const unique = [...new Map(ranked.map((result) => [String(result.id), result])).values()];
  const points = await readPoints(unique.map((result) => String(result.id)));
  const candidates = unique.flatMap((result, rankIndex) => {
    const pointId = String(result.id);
    const payload = points.get(pointId)?.payload ?? {};
    const fetchedAt = String(payload.fetched_at ?? '');
    if (!payload.parent_id || !fetchedAt || Number.isNaN(Date.parse(fetchedAt))) return [];
    return [buildExternalEvidenceRecordV1({
      pointId,
      parentExternalId: String(payload.parent_id),
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
      retrievalOwner: 'go-retrieval', collection: COLLECTION, vectorName: 'content',
      embeddingDimension: 768,
      embeddingRevision: String(payload.embedding_revision ?? 'unknown'),
      candidateOrdinal: null, packetKey: null, workspaceRevision: null, sourceRevision: null,
      canonicalAuthority: false, localSourceGrounding: false, mutationAuthority: false,
    })];
  });
  const evidence = selectExternalResearchEvidenceForAce(candidates, { maxCards: 6, perParentLimit: 2 });
  const cards = evidence.map((item) => externalResearchEvidenceToAceCardV1(buildAtlasExternalResearchEvidenceV1({
    queryId: QUERY_ID,
    sourceKind: item.source as any,
    externalId: item.parentExternalId,
    url: item.url,
    title: item.title,
    text: item.text,
    semanticScore: Math.max(0, Math.min(1, item.retrievalScore)),
    fetchedAt: item.fetchedAt,
    retrievalRevision: item.embeddingRevision,
  }), { workspaceRevision: WORKSPACE, candidateSnapshotRevision: `external-research:${QUERY_ID}`, ordinalMapChecksum: 'sha256:external-not-applicable' }));
  const ace = selectAceCardsV2({ cards, query: QUERY, workspaceRevision: WORKSPACE, candidateSnapshotRevision: `external-research:${QUERY_ID}`, ordinalMapChecksum: 'sha256:external-not-applicable', maxCards: 6, tokenBudget: 20_000 });
  const evidenceByCard = new Map(cards.map((card, index) => [card.cardId, evidence[index]]));
  const candidatesForContext: ContextCandidate[] = ace.selected.map((card) => ({
    packet_key: card.cardId,
    content: card.lod2Extractive ?? card.title,
    lanes: ['dense'], relevance: evidenceByCard.get(card.cardId)?.retrievalScore ?? 0,
    authority: 0, freshness: 0, evidence_refs: card.evidenceRefs, token_count: card.tokenEstimate,
  }));
  const context = compileContext({
    request_id: `research-context:${QUERY_ID}`, candidates: candidatesForContext,
    policy: { version: 'atlas.external-research-context-policy:v1', token_budget: 20_000, max_packets: 6, max_packet_tokens: 20_000, min_score: 0 },
    now: NOW, model_revision: 'external-research:non-local', prompt_template_revision: 'atlas.external-research-prompt:v1',
  });
  const contextChecksum = createHash('sha256').update(JSON.stringify({ manifest: context.manifest, promptPackets: context.prompt_packets })).digest('hex');
  const plan = buildPromptPlanV1({
    requestId: context.manifest.request_id,
    contextManifestChecksum: contextChecksum,
    tokenizerRevision: 'token-estimator:context-compiler-v1',
    promptTemplateRevision: 'atlas.external-research-prompt:v1',
    instructionRevision: 'atlas.external-research-instruction:v1',
    segments: [
      { ordinal: 0, kind: 'USER_QUERY', packetKey: null, evidenceRefs: [`query:${QUERY_ID}`], contentChecksum: createHash('sha256').update(QUERY).digest('hex'), tokenCount: Math.max(1, Math.ceil(QUERY.split(/\s+/).length * 1.25)) },
      ...context.prompt_packets.map((packet, index) => ({ ordinal: index + 1, kind: 'EVIDENCE' as const, packetKey: packet.packet_key, evidenceRefs: context.selected[index]?.evidence_refs ?? [], contentChecksum: createHash('sha256').update(packet.content).digest('hex'), tokenCount: packet.token_count })),
    ],
  });
  return { evidence, ace, context, plan };
}

async function main() {
  const first = await buildSelection();
  const second = await buildSelection();
  const report = {
    schema: 'atlas.research-ace-diversity-context-replay.v1', readOnly: true, query: QUERY,
    sourceFilter: SOURCE_FILTER, collection: COLLECTION,
    evidenceSetCount: first.evidence.length, aceSelectedCount: first.ace.selected.length,
    contextSelectedCount: first.context.manifest.selected_packet_keys.length, promptSegmentCount: first.plan.segments.length,
    evidenceSetChecksum: createHash('sha256').update(JSON.stringify(first.evidence)).digest('hex'),
    aceChecksum: first.ace.checksum, replayAceChecksum: second.ace.checksum,
    contextManifestId: first.context.manifest.manifest_id, replayContextManifestId: second.context.manifest.manifest_id,
    promptPlanChecksum: first.plan.checksumSha256, replayPromptPlanChecksum: second.plan.checksumSha256,
    deterministicReplay: first.ace.checksum === second.ace.checksum && first.context.manifest.manifest_id === second.context.manifest.manifest_id && first.plan.checksumSha256 === second.plan.checksumSha256,
    externalEvidenceOnly: true, localIdentityAssigned: false,
    writes: { postgres: false, qdrant: false, valkey: false, neo4j: false },
    status: first.plan.checksumSha256 === second.plan.checksumSha256 ? 'ACE_DIVERSITY_CONTEXT_REPLAY_PROVEN' : 'ACE_DIVERSITY_CONTEXT_REPLAY_NONDETERMINISTIC',
    nextGate: 'ORNITH_EXTERNAL_EVIDENCE_SYNTHESIS_REPLAY',
  };
  await mkdir('docs/reports', { recursive: true });
  await writeFile(REPORT, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ ...report, report: REPORT }, null, 2));
}

main().catch((error) => { console.error(`[research-ace-diversity] ${error instanceof Error ? error.message : String(error)}`); process.exitCode = 1; });
