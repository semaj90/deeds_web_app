import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { compileContext, type ContextCandidate } from '../../sveltekit-frontend/src/lib/server/ace/context-compiler.parent-atlas.js';
import { buildAtlasExternalResearchEvidenceV1 } from '../../sveltekit-frontend/src/lib/server/atlas/research/external-research-evidence-v1.js';
import { externalResearchEvidenceToAceCardV1 } from '../../sveltekit-frontend/src/lib/server/atlas/research/external-research-ace-adapter-v1.js';
import { selectAceCardsV2 } from '../../sveltekit-frontend/src/lib/server/atlas/context/ace-card-selection-v2.js';
import { buildPromptPlanV1 } from '../../sveltekit-frontend/src/lib/server/atlas/prefill/prompt-plan-v1.js';

const QDRANT_URL = process.env.QDRANT_URL ?? 'http://127.0.0.1:6333';
const COLLECTION = 'chunks_web_search';
const QUERY = process.env.ATLAS_RESEARCH_PROMPT_QUERY ?? 'PostgreSQL pgvector';
const REPORT = 'docs/reports/research-prompt-plan-replay-v1.json';
const EXTERNAL_WORKSPACE = 'sha256:external-research-domain';
const queryId = `research-canary:${createHash('sha256').update(QUERY).digest('hex').slice(0, 16)}`;
const now = new Date('2026-08-28T00:00:00.000Z');

function sha256Bytes(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

async function retrievePoints(): Promise<any[]> {
  const response = await fetch(`${QDRANT_URL}/collections/${COLLECTION}/points/scroll`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ limit: 100, with_payload: true, with_vector: false }),
  });
  if (!response.ok) throw new Error(`QDRANT_SCROLL_HTTP_${response.status}`);
  const body = await response.json() as any;
  return (body.result?.points ?? []).sort((a: any, b: any) => String(a.id).localeCompare(String(b.id)));
}

function compileExternalContext(points: any[]) {
  const context = {
    workspaceRevision: EXTERNAL_WORKSPACE,
    candidateSnapshotRevision: `external-research:${queryId}`,
    ordinalMapChecksum: 'sha256:external-not-applicable',
  };
  const evidence = points.map((point) => {
    const payload = point.payload ?? {};
    return buildAtlasExternalResearchEvidenceV1({
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
  });
  const cards = evidence.map((item) => externalResearchEvidenceToAceCardV1(item, context));
  const selection = selectAceCardsV2({ cards, query: QUERY, ...context, maxCards: cards.length, tokenBudget: 20_000 });
  const evidenceByCardId = new Map(cards.map((card, index) => [card.cardId, evidence[index]]));
  const candidates: ContextCandidate[] = selection.selected.map((card) => {
    const item = evidenceByCardId.get(card.cardId);
    return {
      packet_key: card.cardId,
      content: card.lod2Extractive ?? card.title,
      lanes: ['dense'],
      relevance: item?.semanticScore ?? 0,
      authority: 0,
      freshness: 0,
      evidence_refs: card.evidenceRefs,
      token_count: card.tokenEstimate,
    };
  });
  return compileContext({
    request_id: `research-context:${queryId}`,
    candidates,
    policy: {
      version: 'atlas.external-research-context-policy:v1',
      token_budget: 20_000,
      max_packets: cards.length,
      max_packet_tokens: 20_000,
      min_score: 0,
    },
    now,
    model_revision: 'external-research:non-local',
    prompt_template_revision: 'atlas.external-research-prompt:v1',
  });
}

function buildPlan(compiled: ReturnType<typeof compileExternalContext>) {
  const evidenceSegments = compiled.prompt_packets.map((packet, index) => ({
    ordinal: index + 1,
    kind: 'EVIDENCE' as const,
    packetKey: packet.packet_key,
    evidenceRefs: compiled.selected[index]?.evidence_refs ?? [],
    contentChecksum: sha256Bytes(packet.content),
    tokenCount: packet.token_count,
  }));
  return buildPromptPlanV1({
    requestId: compiled.manifest.request_id,
    contextManifestChecksum: sha256Bytes(JSON.stringify({ manifest: compiled.manifest, promptPackets: compiled.prompt_packets })),
    tokenizerRevision: 'token-estimator:context-compiler-v1',
    promptTemplateRevision: 'atlas.external-research-prompt:v1',
    instructionRevision: 'atlas.external-research-instruction:v1',
    segments: [
      {
        ordinal: 0,
        kind: 'USER_QUERY',
        packetKey: null,
        evidenceRefs: [`query:${queryId}`],
        contentChecksum: sha256Bytes(QUERY),
        tokenCount: Math.max(1, Math.ceil(QUERY.split(/\s+/).length * 1.25)),
      },
      ...evidenceSegments,
    ],
  });
}

async function main() {
  const points = await retrievePoints();
  if (points.length === 0) throw new Error('RESEARCH_CANARY_EMPTY');
  const firstContext = compileExternalContext(points);
  const secondContext = compileExternalContext(points);
  const firstPlan = buildPlan(firstContext);
  const secondPlan = buildPlan(secondContext);
  const report = {
    schema: 'atlas.research-prompt-plan-replay.v1',
    readOnly: true,
    collection: COLLECTION,
    query: QUERY,
    pointCount: points.length,
    contextManifestId: firstContext.manifest.manifest_id,
    contextManifestChecksum: firstPlan.contextManifestChecksum,
    promptPlanChecksum: firstPlan.checksumSha256,
    replayPromptPlanChecksum: secondPlan.checksumSha256,
    segmentCount: firstPlan.segments.length,
    evidenceSegmentCount: firstPlan.segments.filter((segment) => segment.kind === 'EVIDENCE').length,
    deterministicReplay: firstPlan.checksumSha256 === secondPlan.checksumSha256,
    externalEvidenceOnly: true,
    localIdentityAssigned: false,
    writes: { postgres: false, qdrant: false, valkey: false, neo4j: false },
    status: firstPlan.checksumSha256 === secondPlan.checksumSha256 ? 'PROMPT_PLAN_EXTERNAL_REPLAY_PROVEN' : 'PROMPT_PLAN_EXTERNAL_REPLAY_NONDETERMINISTIC',
    nextGate: 'ORNITH_EXTERNAL_EVIDENCE_SYNTHESIS_REPLAY',
  };
  await mkdir('docs/reports', { recursive: true });
  await writeFile(REPORT, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ ...report, report: REPORT }, null, 2));
}

main().catch((error) => {
  console.error(`[research-prompt-plan] ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
