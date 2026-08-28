import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { buildExternalEvidenceRecordV1, selectExternalResearchEvidenceForAce } from '../../sveltekit-frontend/src/lib/server/atlas/research/external-research-evidence-set-v1.js';
import { buildSynthesisReceiptV1, SynthesisOutputV1Schema, validateSynthesisCitations } from '../../sveltekit-frontend/src/lib/server/atlas/research/synthesis-receipt-v1.js';

const GO_URL = process.env.GO_RETRIEVAL_HTTP_URL ?? 'http://127.0.0.1:8100';
const QDRANT_URL = process.env.QDRANT_URL ?? 'http://127.0.0.1:6333';
const ORNITH_URL = process.env.ORNITH_URL ?? 'http://127.0.0.1:8090';
const MODEL = process.env.ORNITH_MODEL ?? 'local';
const QUERY = process.env.ATLAS_RESEARCH_SYNTHESIS_QUERY ?? 'What does PostgreSQL pgvector provide for vector search?';
const COLLECTION = 'chunks_web_search';
const REQUEST_ID = `research-synthesis:${createHash('sha256').update(QUERY).digest('hex').slice(0, 16)}`;
const CONTEXT_MANIFEST_ID = 'context:314e96d86a8420e1d9c77169';
const PROMPT_PLAN_CHECKSUM = 'e2dc83ce912e139fb0e05dbd8016f1de09d39d3d0a413d36fdf2594a03e6c592';
const REPORT = 'docs/reports/research-ornith-synthesis-replay-v1.json';

async function getEvidence() {
  const search = await fetch(`${GO_URL.replace(/\/$/, '')}/search/research`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ query: 'PostgreSQL pgvector', limit: 100, source_filter: ['github_issue'], score_threshold: 0 }),
  });
  if (!search.ok) throw new Error(`GO_RESEARCH_HTTP_${search.status}`);
  const results = (await search.json() as any).results ?? [];
  const unique = [...new Map(results.map((item: any) => [String(item.id), item])).values()];
  const pointsResponse = await fetch(`${QDRANT_URL}/collections/${COLLECTION}/points`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ids: unique.map((item: any) => String(item.id)), with_payload: true, with_vector: false }),
  });
  if (!pointsResponse.ok) throw new Error(`QDRANT_POINT_READBACK_HTTP_${pointsResponse.status}`);
  const points = new Map<string, any>(((await pointsResponse.json() as any).result ?? []).map((point: any) => [String(point.id), point]));
  const candidates = unique.flatMap((result: any, index: number) => {
    const payload = points.get(String(result.id))?.payload ?? {};
    const fetchedAt = String(payload.fetched_at ?? '');
    if (!payload.parent_id || !payload.body || !fetchedAt || Number.isNaN(Date.parse(fetchedAt))) return [];
    return [buildExternalEvidenceRecordV1({
      pointId: String(result.id), parentExternalId: String(payload.parent_id), segmentIndex: Number(payload.segment_index),
      source: String(payload.source), url: payload.url ? String(payload.url) : null, title: payload.title ? String(payload.title) : null,
      text: String(payload.body), contentChecksum: String(payload.content_checksum), fetchedAt,
      provenanceClass: 'EXTERNAL_CITED', retrievalScore: Number(result.score ?? 0), retrievalRank: index + 1,
      retrievalOwner: 'go-retrieval', collection: COLLECTION, vectorName: 'content', embeddingDimension: 768,
      embeddingRevision: String(payload.embedding_revision ?? 'unknown'), candidateOrdinal: null, packetKey: null,
      workspaceRevision: null, sourceRevision: null, canonicalAuthority: false, localSourceGrounding: false, mutationAuthority: false,
    })];
  });
  return selectExternalResearchEvidenceForAce(candidates, { maxCards: 6, perParentLimit: 2 });
}

function makePrompt(evidence: Awaited<ReturnType<typeof getEvidence>>) {
  const sources = evidence.map((item) => `[${item.externalEvidenceId}] ${item.title ?? item.source}\n${item.text}`).join('\n\n');
  return `Answer the question using only the cited evidence below. Return JSON matching the required schema. Every citation ID must be copied exactly from the evidence. Do not invent local Atlas IDs, tools, actions, or uncited facts.\n\nQuestion: ${QUERY}\n\nEvidence:\n${sources}`;
}

async function runOnce(prompt: string, allowedIds: Set<string>) {
  const response = await fetch(`${ORNITH_URL.replace(/\/$/, '')}/v1/chat/completions`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    signal: AbortSignal.timeout(20_000),
    body: JSON.stringify({
      model: MODEL, messages: [{ role: 'user', content: prompt }], tools: [], tool_choice: 'none',
      temperature: 0, top_p: 1, seed: 17, max_tokens: 600, reasoning_effort: 'none',
      response_format: { type: 'json_schema', json_schema: { name: 'atlas_external_research_synthesis_v1', strict: true, schema: { type: 'object', additionalProperties: false, required: ['answer', 'citations', 'confidence'], properties: { answer: { type: 'string' }, citations: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['externalEvidenceId', 'quote'], properties: { externalEvidenceId: { type: 'string' }, quote: { type: 'string' } } } }, confidence: { type: 'number', minimum: 0, maximum: 1 } } } } },
    }),
  });
  if (!response.ok) throw new Error(`ORNITH_HTTP_${response.status}`);
  const body = await response.json() as any;
  const content = body.choices?.[0]?.message?.content;
  if (typeof content !== 'string') throw new Error('ORNITH_RESPONSE_CONTENT_MISSING');
  const output = SynthesisOutputV1Schema.parse(JSON.parse(content));
  const unsupported = validateSynthesisCitations(output, allowedIds);
  if (unsupported.length) throw new Error(`ORNITH_UNSUPPORTED_CITATIONS_${unsupported.length}`);
  return output;
}

async function main() {
  const evidence = await getEvidence();
  if (!evidence.length) throw new Error('EXTERNAL_EVIDENCE_EMPTY');
  const allowedIds = new Set(evidence.map((item) => item.externalEvidenceId));
  const prompt = makePrompt(evidence);
  const firstOutput = await runOnce(prompt, allowedIds);
  const secondOutput = await runOnce(prompt, allowedIds);
  const first = buildSynthesisReceiptV1({ requestId: REQUEST_ID, promptPlanChecksum: PROMPT_PLAN_CHECKSUM, contextManifestId: CONTEXT_MANIFEST_ID, modelRevision: MODEL, citedEvidenceIds: firstOutput.citations.map((item) => item.externalEvidenceId), unsupportedCitationCount: 0, output: firstOutput, canonicalAuthority: false, mutationAuthority: false });
  const second = buildSynthesisReceiptV1({ requestId: REQUEST_ID, promptPlanChecksum: PROMPT_PLAN_CHECKSUM, contextManifestId: CONTEXT_MANIFEST_ID, modelRevision: MODEL, citedEvidenceIds: secondOutput.citations.map((item) => item.externalEvidenceId), unsupportedCitationCount: 0, output: secondOutput, canonicalAuthority: false, mutationAuthority: false });
  const report = { schema: 'atlas.research-ornith-synthesis-replay.v1', readOnly: true, requestId: REQUEST_ID, model: MODEL, evidenceCount: evidence.length, citedEvidenceCount: first.citedEvidenceIds.length, responseChecksum: first.responseChecksum, replayResponseChecksum: second.responseChecksum, deterministicReplay: first.responseChecksum === second.responseChecksum, toolsEnabled: false, canonicalAuthority: false, writes: { postgres: false, qdrant: false, valkey: false, neo4j: false }, status: first.responseChecksum === second.responseChecksum ? 'ORNITH_EXTERNAL_SYNTHESIS_REPLAY_PROVEN' : 'ORNITH_EXTERNAL_SYNTHESIS_NONDETERMINISTIC', nextGate: 'EXTERNAL_SYNTHESIS_REVIEW_OR_LDR_FACADE' };
  await mkdir('docs/reports', { recursive: true });
  await writeFile(REPORT, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ ...report, report: REPORT }, null, 2));
}

main().catch(async (error) => {
  const report = { schema: 'atlas.research-ornith-synthesis-replay.v1', readOnly: true, status: 'ORNITH_EXTERNAL_SYNTHESIS_BLOCKED', error: error instanceof Error ? error.message : String(error), toolsEnabled: false, writes: { postgres: false, qdrant: false, valkey: false, neo4j: false } };
  await mkdir('docs/reports', { recursive: true });
  await writeFile(REPORT, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.error(JSON.stringify({ ...report, report: REPORT }, null, 2));
  process.exitCode = 1;
});
