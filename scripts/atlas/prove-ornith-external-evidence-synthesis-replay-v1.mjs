import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';

const GO_URL = (process.env.GO_RETRIEVAL_HTTP_URL ?? 'http://127.0.0.1:8100').replace(/\/$/, '');
const QDRANT_URL = (process.env.QDRANT_URL ?? 'http://127.0.0.1:6333').replace(/\/$/, '');
const ORNITH_URL = (process.env.ORNITH_URL ?? 'http://127.0.0.1:8090').replace(/\/$/, '');
const COLLECTION = 'chunks_web_search';
const QUERY = process.env.ATLAS_RESEARCH_ACE_QUERY ?? 'PostgreSQL pgvector';
const SOURCE_FILTER = ['github_issue'];
const MODEL = process.env.ORNITH_MODEL ?? 'ornith-1.5-9b';
const SEED = 1701;
const REPORT = 'docs/reports/ornith-external-evidence-synthesis-replay-v1.json';

const outputSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    answer: { type: 'string' },
    citations: {
      type: 'array',
      items: { type: 'string' },
    },
    uncertainty: { type: 'string' },
  },
  required: ['answer', 'citations', 'uncertainty'],
};

const digest = (value) => `sha256:${createHash('sha256').update(JSON.stringify(value)).digest('hex')}`;

async function search() {
  const response = await fetch(`${GO_URL}/search/research`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ query: QUERY, limit: 12, source_filter: SOURCE_FILTER, score_threshold: 0 }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`GO_RESEARCH_HTTP_${response.status}`);
  const body = await response.json();
  return Array.isArray(body.results) ? body.results : [];
}

async function readPoints(ids) {
  const response = await fetch(`${QDRANT_URL}/collections/${COLLECTION}/points`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ids, with_payload: true, with_vector: false }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`QDRANT_READBACK_HTTP_${response.status}`);
  const body = await response.json();
  return new Map((body.result ?? []).map((point) => [String(point.id), point]));
}

async function buildEvidence() {
  const results = await search();
  const unique = [...new Map(results.map((result) => [String(result.id), result])).values()];
  const points = await readPoints(unique.map((result) => String(result.id)));
  return unique.map((result, index) => {
    const pointId = String(result.id);
    const payload = points.get(pointId)?.payload ?? {};
    return {
      pointId,
      rank: index + 1,
      score: Number(result.score ?? 0),
      source: String(payload.source ?? ''),
      parentId: String(payload.parent_id ?? ''),
      title: payload.title ? String(payload.title) : null,
      url: payload.url ? String(payload.url) : null,
      text: String(payload.body ?? ''),
      contentChecksum: String(payload.content_checksum ?? ''),
      embeddingDimension: Number(payload.embedding_dimension ?? 0),
    };
  }).filter((item) => item.text && item.contentChecksum);
}

function buildPrompt(evidence) {
  return [
    'You are Ornith operating in evidence synthesis mode.',
    'Answer the user query only from the supplied external evidence.',
    'Return only JSON matching the response schema.',
    'Citations must use supplied point_id values. Do not invent URLs or facts.',
    `User query: ${QUERY}`,
    'External evidence:',
    ...evidence.map((item) => JSON.stringify({ point_id: item.pointId, title: item.title, url: item.url, text: item.text })),
  ].join('\n');
}

function validateSynthesis(parsed, evidence) {
  const allowedKeys = ['answer', 'citations', 'uncertainty'];
  const actualKeys = Object.keys(parsed).sort();
  if (JSON.stringify(actualKeys) !== JSON.stringify([...allowedKeys].sort())) {
    throw new Error(`ORNITH_SCHEMA_KEYS_INVALID:${JSON.stringify(actualKeys)}`);
  }
  if (typeof parsed.answer !== 'string' || !parsed.answer.trim()) {
    throw new Error('ORNITH_ANSWER_INVALID');
  }
  if (!Array.isArray(parsed.citations) || typeof parsed.uncertainty !== 'string') {
    throw new Error('ORNITH_SCHEMA_FIELDS_INVALID');
  }
  const byPointId = new Map(evidence.map((item) => [item.pointId, item]));
  for (const citation of parsed.citations) {
    if (typeof citation !== 'string' || !byPointId.has(citation)) {
      throw new Error(`ORNITH_CITATION_OUTSIDE_EVIDENCE:${String(citation)}`);
    }
  }
}

function detectReviewFlags(parsed, evidence) {
  const flags = [];
  const claimedDimensions = [...parsed.answer.matchAll(/vector\s*\(\s*(\d+)\s*\)/gi)].map((match) => Number(match[1]));
  const observedDimensions = [...new Set(evidence.map((item) => item.embeddingDimension).filter(Number.isInteger))];
  for (const dimension of claimedDimensions) {
    if (observedDimensions.length > 0 && !observedDimensions.includes(dimension)) {
      flags.push({ code: 'REPRESENTATION_DIMENSION_CONFLICT', claimed: dimension, observed: observedDimensions });
    }
  }
  return flags;
}

async function synthesize(prompt, evidence) {
  const response = await fetch(`${ORNITH_URL}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        {
          role: 'system',
          content: 'Return exactly one JSON object with only these top-level keys: answer, citations, uncertainty. Do not use summary, evidence, text, sources, or any other keys. Keep answer and each claim concise.',
        },
        { role: 'user', content: prompt },
      ],
      temperature: 0,
      top_p: 1,
      seed: SEED,
      reasoning_effort: 'none',
      chat_template_kwargs: { enable_thinking: false },
      cache_prompt: false,
      response_format: { type: 'json_schema', schema: outputSchema },
      max_tokens: 1200,
      stream: false,
    }),
    signal: AbortSignal.timeout(120_000),
  });
  if (!response.ok) throw new Error(`ORNITH_HTTP_${response.status}: ${await response.text()}`);
  const body = await response.json();
  const content = body.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || !content.trim()) {
    const choice = body.choices?.[0] ?? {};
    throw new Error(`ORNITH_EMPTY_CONTENT:${JSON.stringify({
      finishReason: choice.finish_reason ?? null,
      messageKeys: Object.keys(choice.message ?? {}),
      reasoningContentLength: typeof choice.message?.reasoning_content === 'string'
        ? choice.message.reasoning_content.length
        : 0,
      usage: body.usage ?? null,
    })}`);
  }
  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch (error) {
    throw new Error(`ORNITH_SCHEMA_PARSE_FAILED:${JSON.stringify({
      rawResponseChecksum: digest(content),
      rawResponsePreview: content.slice(0, 1200),
      rawResponseTail: content.slice(-1200),
      parseError: error instanceof Error ? error.message : String(error),
    })}`);
  }
  validateSynthesis(parsed, evidence);
  return { parsed, rawChecksum: digest(content), normalizedChecksum: digest(parsed) };
}

async function main() {
  const evidence = await buildEvidence();
  const prompt = buildPrompt(evidence);
  const runs = [];
  for (let i = 0; i < 3; i += 1) runs.push(await synthesize(prompt, evidence));
  const normalizedChecksums = runs.map((run) => run.normalizedChecksum);
  const report = {
    schema: 'atlas.ornith-external-evidence-synthesis-replay.v1',
    status: normalizedChecksums.every((checksum) => checksum === normalizedChecksums[0])
      ? 'ORNITH_EXTERNAL_EVIDENCE_SYNTHESIS_REPLAY_PROVEN'
      : 'ORNITH_EXTERNAL_EVIDENCE_SYNTHESIS_NONDETERMINISTIC',
    readOnly: true,
    query: QUERY,
    model: MODEL,
    seed: SEED,
    temperature: 0,
    topP: 1,
    reasoningEffort: 'none',
    promptCache: false,
    evidenceCount: evidence.length,
    evidenceChecksum: digest(evidence),
    promptChecksum: digest(prompt),
    rawResponseChecksums: runs.map((run) => run.rawChecksum),
    normalizedResponseChecksums: normalizedChecksums,
    schemaConstrained: true,
    citationsAreExternalPointIds: true,
    evidenceBindingsValidated: true,
    reviewPacket: {
      accepted: false,
      canonicalAuthority: false,
      answer: runs[0].parsed.answer,
      uncertainty: runs[0].parsed.uncertainty,
      citations: runs[0].parsed.citations.map((pointId) => {
      const item = evidence.find((candidate) => candidate.pointId === pointId);
        return { pointId, url: item?.url ?? null, contentChecksum: item?.contentChecksum ?? null };
      }),
    },
    reviewFlags: detectReviewFlags(runs[0].parsed, evidence),
    promotionBlockers: ['HUMAN_REVIEW_REQUIRED', 'EXTERNAL_CLAIM_NOT_CANONICAL'],
    writes: { postgres: false, qdrant: false, valkey: false, neo4j: false },
    promotion: 'REVIEW_ONLY',
    nextGate: 'HUMAN_REVIEW_OR_GROUNDED_CLAIM_ADMISSION',
  };
  await mkdir('docs/reports', { recursive: true });
  await writeFile(REPORT, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ ...report, report: REPORT }, null, 2));
}

main().catch((error) => {
  console.error(`[ornith-replay] ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
