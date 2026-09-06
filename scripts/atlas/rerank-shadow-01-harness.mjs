#!/usr/bin/env node
/**
 * RERANK-SHADOW-02/03 — ORNITH-RERANK-SHADOW-01 frozen fixture + comparison harness.
 * Real calls only: Ollama /api/embed (EmbeddingGemma), :8099/rerank (mxbai cross-encoder),
 * llama-server /v1/chat/completions (Ornith judge). No production DB/Qdrant writes.
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const OLLAMA = 'http://127.0.0.1:11434';
const MXBAI = 'http://127.0.0.1:8099';
const LLAMA = 'http://127.0.0.1:8090';
const REPORT_PATH = resolve(process.cwd(), 'docs/reports/rerank-shadow-01-live-fixture-v1.json');

// Frozen fixture: real content from this session's own work. Ground truth labeled by hand
// against files actually read/written this session — not fabricated.
const FIXTURE = [
  {
    query: 'Which function sums duplicate-identity RRF scores instead of discarding them?',
    candidates: [
      { id: 'service-merge', text: 'export function mergeDuplicateIdentityScores(results) { const key = r.symbol_version_id ?? r.packet_key ?? r.id; ... merged.set(key, { ...representative, score: existing.score + r.score }); }', relevant: true },
      { id: 'rrf-tologicallane', text: 'function toLogicalLaneName(value) { const normalized = value.trim().toLowerCase(); return normalizeRetrievalLane(normalized) ?? (normalized || "dispatcher"); }', relevant: false },
      { id: 'lane-aliases', text: 'export function normalizeRetrievalLane(value) { if (DENSE_LANE_ALIAS_SET.has(normalized)) return "dense"; if (LEXICAL_LANE_ALIAS_SET.has(normalized)) return "lexical"; return undefined; }', relevant: false },
      { id: 'model-resolution', text: 'export function assertRuntimeIdentityIsMocked(resolution, expectedMockedId) { if (!resolution.runtimeDiscovered) throw new Error(...); }', relevant: false },
      { id: 'helper-card', text: 'export function canDispatchDirectly(candidate) { return candidate.rank === 0 && candidate.similarity >= HELPER_ROUTING_DIRECT_DISPATCH_THRESHOLD; }', relevant: false },
    ],
  },
  {
    query: 'Which contract enforces that batch extraction never runs on the full corpus, only a bounded candidate subset?',
    candidates: [
      { id: 'evidence-card', text: 'export function assertExtractionBatchBounded(candidateCount) { if (candidateCount > CANDIDATE_EVIDENCE_EXTRACTION_MAX_BATCH) throw new Error("exceeds the bounded maximum"); }', relevant: true },
      { id: 'firecrawl-provider', text: 'export async function loadFirecrawl() { if (cached) return cached; const mod = await import("@mendable/firecrawl-js"); ... }', relevant: false },
      { id: 'relevance-scores', text: 'export function shouldEscalateToTextRelevance(cheapScoresDescending) { if (cheapScoresDescending.length < 2) return false; ... }', relevant: false },
      { id: 'fusion-contribution', text: 'export interface FusionContributionV1 { canonicalId: string; logicalLane: string; rank: number; weight: number; executorId: string; provenanceRefs: string[]; }', relevant: false },
      { id: 'helper-card-2', text: 'export const HelperCardV1Schema = z.object({ helperId: id, capabilities: z.string().min(1), supportedTaskFamilies: z.array(z.string().min(1)).min(1), ... }).strict();', relevant: false },
    ],
  },
  {
    query: 'Which module centralizes the optional dynamic import of the Firecrawl SDK behind one documented type-check exception?',
    candidates: [
      { id: 'firecrawl-provider-2', text: 'export async function loadFirecrawl() { try { const mod = await import("@mendable/firecrawl-js"); const FirecrawlCtor = mod.default ?? mod; cached = { status: "AVAILABLE", FirecrawlCtor }; } catch (err) { cached = { status: "UNAVAILABLE", reason: err.message }; } return cached; }', relevant: true },
      { id: 'youtube-transcript', text: 'async function fetchViaFirecrawlMarkdown(videoId) { const apiKey = ENV.FIRECRAWL_API_KEY; if (!apiKey) return null; const firecrawl = await loadFirecrawl(); ... }', relevant: false },
      { id: 'candidate-evidence-2', text: 'export const CandidateEvidenceCardV1Schema = z.object({ canonicalId: id, packetKey: id, sourceRef: z.string().min(1), ... }).strict();', relevant: false },
      { id: 'model-resolution-2', text: 'export const MODEL_RESOLUTION_SOURCE_VALUES = ["REQUEST_ALIAS", "CONFIG", "LLAMA_V1_MODELS", "LLAMA_PROPS"];', relevant: false },
      { id: 'retrieval-lane-2', text: 'const DENSE_LANE_ALIASES = ["dense", "dense_384", "dense_768", "qdrant", "qdrant_vector", "qdrant_768", "turbovec", "turbovec_ann", "cuvs", "cagra"];', relevant: false },
    ],
  },
];

async function ollamaEmbed(text) {
  const res = await fetch(`${OLLAMA}/api/embed`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'embeddinggemma:latest', input: text }),
  });
  const data = await res.json();
  return data.embeddings[0];
}

function cosine(a, b) {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

async function mxbaiRerank(query, candidates) {
  const t0 = performance.now();
  const res = await fetch(`${MXBAI}/rerank`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, candidates: candidates.map(c => ({ packet_key: c.id, text: c.text })) }),
  });
  const data = await res.json();
  return {
    modelId: data.model_id ?? null,
    ranked: data.ranked,
    latencyMs: performance.now() - t0,
    vramPeakMb: data.vram_peak_mb,
  };
}

async function ornithJudge(query, candidateText) {
  const t0 = performance.now();
  const res = await fetch(`${LLAMA}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'ornith-1.5-9b',
      messages: [
        { role: 'system', content: 'You judge whether a code candidate is relevant to a query. Reply with ONLY a number 0-100 representing relevance confidence. No other text.' },
        { role: 'user', content: `Query: ${query}\n\nCandidate:\n${candidateText}\n\nRelevance score (0-100):` },
      ],
      temperature: 0,
      max_tokens: 8,
      stream: false,
    }),
  });
  const data = await res.json();
  const content = data.choices?.[0]?.message?.content ?? '0';
  const score = parseFloat(content.match(/\d+/)?.[0] ?? '0') / 100;
  return { score: isNaN(score) ? 0 : score, latencyMs: performance.now() - t0 };
}

function metricsFor(rankedIds, relevantIds) {
  const relevantSet = new Set(relevantIds);
  const top1 = rankedIds[0];
  const top1Correct = relevantSet.has(top1) ? 1 : 0;
  let mrr = 0;
  for (let i = 0; i < rankedIds.length; i++) {
    if (relevantSet.has(rankedIds[i])) { mrr = 1 / (i + 1); break; }
  }
  const recallAt3 = rankedIds.slice(0, 3).some(id => relevantSet.has(id)) ? 1 : 0;
  return { top1Correct, mrr, recallAt3 };
}

async function main() {
  const results = { embeddingGemma: [], mxbai: [], ornith: [] };

  for (const item of FIXTURE) {
    const relevantIds = item.candidates.filter(c => c.relevant).map(c => c.id);

    // EmbeddingGemma bi-encoder cosine
    const qEmbed = await ollamaEmbed(item.query);
    const embedScores = [];
    for (const c of item.candidates) {
      const cEmbed = await ollamaEmbed(c.text);
      embedScores.push({ id: c.id, score: cosine(qEmbed, cEmbed) });
    }
    embedScores.sort((a, b) => b.score - a.score);
    results.embeddingGemma.push({ query: item.query, ranked: embedScores.map(s => s.id), metrics: metricsFor(embedScores.map(s => s.id), relevantIds) });

    // mxbai cross-encoder
    const mxbaiResult = await mxbaiRerank(item.query, item.candidates);
    const mxbaiRankedIds = mxbaiResult.ranked.map(r => r.packet_key);
    results.mxbai.push({ query: item.query, ranked: mxbaiRankedIds, latencyMs: mxbaiResult.latencyMs, vramPeakMb: mxbaiResult.vramPeakMb, metrics: metricsFor(mxbaiRankedIds, relevantIds) });

    // Ornith judge (score each candidate independently)
    const ornithScores = [];
    let ornithLatencyTotal = 0;
    for (const c of item.candidates) {
      const r = await ornithJudge(item.query, c.text);
      ornithScores.push({ id: c.id, score: r.score });
      ornithLatencyTotal += r.latencyMs;
    }
    ornithScores.sort((a, b) => b.score - a.score);
    results.ornith.push({ query: item.query, ranked: ornithScores.map(s => s.id), latencyMsTotal: ornithLatencyTotal, metrics: metricsFor(ornithScores.map(s => s.id), relevantIds) });
  }

  function summarize(method, arr) {
    const n = arr.length;
    const top1Agreement = arr.reduce((s, r) => s + r.metrics.top1Correct, 0) / n;
    const mrrAvg = arr.reduce((s, r) => s + r.metrics.mrr, 0) / n;
    const recallAt3Avg = arr.reduce((s, r) => s + r.metrics.recallAt3, 0) / n;
    return { method, n, top1Agreement, mrrAvg, recallAt3Avg };
  }

  const summary = [
    summarize('EmbeddingGemma (bi-encoder cosine)', results.embeddingGemma),
    summarize('mxbai-rerank-base-v2 (cross-encoder)', results.mxbai),
    summarize('Ornith-1.5-9b (LLM judge, 0-100 score)', results.ornith),
  ];

  const report = {
    schema: 'atlas.rerank-shadow-01-live-fixture.v1',
    generatedAt: new Date().toISOString(),
    readOnly: true,
    fixtureOnly: true,
    candidateIdentityQualified: false,
    productionPromotionAttempted: false,
    servedOrderChanged: false,
    datastoreWritesPerformed: false,
    qdrantWritesPerformed: false,
    cacheWritesPerformed: false,
    methods: {
      embeddingGemma: { endpoint: `${OLLAMA}/api/embed`, model: 'embeddinggemma:latest' },
      mxbai: { endpoint: `${MXBAI}/rerank`, model: 'mixedbread-ai/mxbai-rerank-base-v2' },
      ornith: { endpoint: `${LLAMA}/v1/chat/completions`, model: 'ornith-1.5-9b' },
    },
    summary,
    detail: results,
    status: 'LIVE_FIXTURE_OBSERVED_NOT_PRODUCTION_PROOF',
    nextGate: 'REVISION_QUALIFIED_POST_FUSION_SHADOW',
  };

  await mkdir(dirname(REPORT_PATH), { recursive: true });
  await writeFile(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ ...report, reportPath: REPORT_PATH }, null, 2));
}

main().catch(e => { console.error('FAILED:', e); process.exit(1); });
