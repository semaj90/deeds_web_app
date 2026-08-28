import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { compileContext, type ContextCandidate } from '../../sveltekit-frontend/src/lib/server/ace/context-compiler.parent-atlas.js';
import { buildAtlasExternalResearchEvidenceV1 } from '../../sveltekit-frontend/src/lib/server/atlas/research/external-research-evidence-v1.js';
import { externalResearchEvidenceToAceCardV1 } from '../../sveltekit-frontend/src/lib/server/atlas/research/external-research-ace-adapter-v1.js';
import { selectAceCardsV2 } from '../../sveltekit-frontend/src/lib/server/atlas/context/ace-card-selection-v2.js';

const QDRANT_URL = process.env.QDRANT_URL ?? 'http://127.0.0.1:6333';
const COLLECTION = 'chunks_web_search';
const QUERY = process.env.ATLAS_RESEARCH_CONTEXT_QUERY ?? 'PostgreSQL pgvector';
const REPORT = 'docs/reports/research-context-manifest-replay-v1.json';
const EXTERNAL_WORKSPACE = 'sha256:external-research-domain';
const queryId = `research-canary:${createHash('sha256').update(QUERY).digest('hex').slice(0, 16)}`;
const now = new Date('2026-08-28T00:00:00.000Z');

async function qdrantRetrieve(): Promise<any[]> {
  const response = await fetch(`${QDRANT_URL}/collections/${COLLECTION}/points/scroll`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ limit: 100, with_payload: true, with_vector: false }),
  });
  if (!response.ok) throw new Error(`QDRANT_SCROLL_HTTP_${response.status}`);
  const body = await response.json() as any;
  return (body.result?.points ?? []).sort((a: any, b: any) => String(a.id).localeCompare(String(b.id)));
}

function buildReplay(points: any[]) {
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
  const selection = selectAceCardsV2({
    cards,
    query: QUERY,
    ...context,
    maxCards: cards.length,
    tokenBudget: 20_000,
  });
  const byCardId = new Map(cards.map((card) => [card.cardId, card]));
  const candidates: ContextCandidate[] = selection.selected.map((card) => {
    const evidenceItem = evidence.find((item) => card.evidenceRefs.includes(`external:${item.evidenceChecksum}`));
    return {
      packet_key: card.cardId,
      content: card.lod2Extractive ?? card.title,
      lanes: ['dense'],
      relevance: evidenceItem?.semanticScore ?? 0,
      authority: 0,
      freshness: 0,
      evidence_refs: card.evidenceRefs,
      token_count: card.tokenEstimate,
      source_ref: undefined,
      source_revision: undefined,
      workspace_revision: undefined,
      representation_revision: undefined,
      feature_revision: undefined,
    };
  });
  if (byCardId.size !== cards.length) throw new Error('EXTERNAL_CARD_INDEX_BUILD_FAILED');
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

function stableManifestDigest(compiled: ReturnType<typeof compileContext>): string {
  return `sha256:${createHash('sha256').update(JSON.stringify({
    manifest: compiled.manifest,
    promptPackets: compiled.prompt_packets,
  })).digest('hex')}`;
}

async function main() {
  const points = await qdrantRetrieve();
  if (points.length === 0) throw new Error('RESEARCH_CANARY_EMPTY');
  const first = buildReplay(points);
  const second = buildReplay(points);
  const firstDigest = stableManifestDigest(first);
  const secondDigest = stableManifestDigest(second);
  const report = {
    schema: 'atlas.research-context-manifest-replay.v1',
    readOnly: true,
    collection: COLLECTION,
    query: QUERY,
    pointCount: points.length,
    aceSelectedCount: first.selected.length,
    contextSelectedCount: first.manifest.selected_packet_keys.length,
    rejectedCount: first.rejected.length,
    manifestId: first.manifest.manifest_id,
    replayManifestId: second.manifest.manifest_id,
    manifestChecksum: firstDigest,
    replayManifestChecksum: secondDigest,
    deterministicReplay: firstDigest === secondDigest && first.manifest.manifest_id === second.manifest.manifest_id,
    externalEvidenceOnly: true,
    localIdentityAssigned: first.manifest.identity?.complete ?? false,
    selectedSourceRefs: first.manifest.source_refs,
    writes: { postgres: false, qdrant: false, valkey: false, neo4j: false },
    status: firstDigest === secondDigest ? 'CONTEXT_MANIFEST_EXTERNAL_REPLAY_PROVEN' : 'CONTEXT_MANIFEST_EXTERNAL_REPLAY_NONDETERMINISTIC',
    nextGate: 'PROMPT_PLAN_EXTERNAL_REPLAY',
  };
  await mkdir('docs/reports', { recursive: true });
  await writeFile(REPORT, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ ...report, report: REPORT }, null, 2));
}

main().catch((error) => {
  console.error(`[research-context-manifest] ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
