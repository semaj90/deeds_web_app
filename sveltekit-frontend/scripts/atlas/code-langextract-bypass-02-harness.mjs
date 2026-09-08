#!/usr/bin/env node
/**
 * CODE-LANGEXTRACT-RERANK-BYPASS-02 — compares (1) RRF -> mxbai (today's path) against
 * (2) RRF -> evidence features -> conditional mxbai (the proposed path), on the same fixture and
 * ground truth `scripts/atlas/rerank-shadow-01-harness.mjs` already used and hand-labeled.
 * Fixture is duplicated here rather than imported (same precedent as
 * rerank-shadow-01-format-ablation.mjs, which independently re-shaped the same candidates) — the
 * evidence-feature router needs the query/candidate pairing in this file's own shape.
 *
 * The "cheap router" is a deliberate, simple hand-specified threshold rule per tasks.md BYPASS-02a
 * — NOT a trained XGBoost/logistic model, which is explicitly out of scope for this proof.
 * Read-only. No production writes, no datastore writes, no mxbai/production promotion.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const MXBAI = 'http://127.0.0.1:8099';
const REPORT_PATH = resolve(process.cwd(), 'docs/reports/code-langextract-bypass-02-results-v1.json');

// Same 3 queries/candidates/ground-truth as rerank-shadow-01-harness.mjs (real code from this
// session's own work, hand-labeled relevant/irrelevant against files actually read/written).
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

const STOPWORDS = new Set(['which', 'that', 'this', 'only', 'from', 'with', 'does', 'runs', 'never', 'instead', 'discarding']);

function extractKeywords(query) {
  return query
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 4 && !STOPWORDS.has(w));
}

/** Cheap hand-specified router feature: does the candidate's id/text contain a query keyword. */
function exactKeywordMatchScore(candidate, keywords) {
  const haystack = `${candidate.id} ${candidate.text}`.toLowerCase();
  return keywords.filter((kw) => haystack.includes(kw)).length;
}

async function mxbaiRerank(query, candidates) {
  const res = await fetch(`${MXBAI}/rerank`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, candidates: candidates.map((c) => ({ packet_key: c.id, text: c.text })) }),
  });
  return res.json();
}

function metricsFor(rankedIds, relevantIds) {
  const relevantSet = new Set(relevantIds);
  const top1Correct = relevantSet.has(rankedIds[0]) ? 1 : 0;
  let mrr = 0;
  let firstHitRank = null;
  for (let i = 0; i < rankedIds.length; i++) {
    if (relevantSet.has(rankedIds[i])) { mrr = 1 / (i + 1); firstHitRank = i + 1; break; }
  }
  const recallAt3 = rankedIds.slice(0, 3).some((id) => relevantSet.has(id)) ? 1 : 0;
  const recallAt5 = rankedIds.slice(0, 5).some((id) => relevantSet.has(id)) ? 1 : 0;
  // nDCG@10 with binary relevance (single relevant doc per query in this fixture)
  let dcg = 0;
  for (let i = 0; i < Math.min(10, rankedIds.length); i++) {
    if (relevantSet.has(rankedIds[i])) dcg += 1 / Math.log2(i + 2);
  }
  const idcg = 1; // ideal: the one relevant doc at rank 1
  const ndcg10 = dcg / idcg;
  return { top1Correct, mrr, recallAt3, recallAt5, ndcg10, firstHitRank };
}

async function runBaseline(item) {
  const relevantIds = item.candidates.filter((c) => c.relevant).map((c) => c.id);
  const t0 = performance.now();
  const result = await mxbaiRerank(item.query, item.candidates);
  const latencyMs = performance.now() - t0;
  const rankedIds = result.ranked.map((r) => r.packet_key);
  return { rankedIds, latencyMs, mxbaiCalled: true, metrics: metricsFor(rankedIds, relevantIds) };
}

async function runEvidenceConditional(item) {
  const relevantIds = item.candidates.filter((c) => c.relevant).map((c) => c.id);
  const keywords = extractKeywords(item.query);
  const scored = item.candidates.map((c) => ({ id: c.id, score: exactKeywordMatchScore(c, keywords) }));
  const maxScore = Math.max(...scored.map((s) => s.score));
  const topScorers = scored.filter((s) => s.score === maxScore);

  // Router rule: confident (skip mxbai) only when there is a UNIQUE top scorer with score > 0.
  const routerConfident = maxScore > 0 && topScorers.length === 1;

  if (routerConfident) {
    const rankedIds = [...scored].sort((a, b) => b.score - a.score).map((s) => s.id);
    return {
      rankedIds,
      latencyMs: 0,
      mxbaiCalled: false,
      routerScores: scored,
      metrics: metricsFor(rankedIds, relevantIds),
    };
  }

  // Ambiguous -> fall through to mxbai (today's behavior, preserved as the fallback).
  const t0 = performance.now();
  const result = await mxbaiRerank(item.query, item.candidates);
  const latencyMs = performance.now() - t0;
  const rankedIds = result.ranked.map((r) => r.packet_key);
  return {
    rankedIds,
    latencyMs,
    mxbaiCalled: true,
    routerScores: scored,
    metrics: metricsFor(rankedIds, relevantIds),
  };
}

function summarize(label, runs) {
  const n = runs.length;
  const avg = (fn) => runs.reduce((s, r) => s + fn(r), 0) / n;
  const mxbaiCallsAvoidedPct = (runs.filter((r) => !r.mxbaiCalled).length / n) * 100;
  return {
    label,
    n,
    mxbaiCallsAvoidedPct,
    top1Agreement: avg((r) => r.metrics.top1Correct),
    mrrAvg: avg((r) => r.metrics.mrr),
    recallAt5Avg: avg((r) => r.metrics.recallAt5),
    ndcg10Avg: avg((r) => r.metrics.ndcg10),
    latencyMsAvg: avg((r) => r.latencyMs),
  };
}

async function main() {
  const baselineRuns = [];
  const evidenceRuns = [];

  for (const item of FIXTURE) {
    baselineRuns.push({ query: item.query, ...(await runBaseline(item)) });
    evidenceRuns.push({ query: item.query, ...(await runEvidenceConditional(item)) });
  }

  const report = {
    schema: 'atlas.code-langextract-bypass-02.v1',
    generatedAt: new Date().toISOString(),
    readOnly: true,
    productionPromotionAttempted: false,
    sampleSizeCaveat: `N=${FIXTURE.length} queries — far too small for statistical significance; this is an illustrative proof-of-mechanism, not a production benchmark. Do not cite these numbers as representative recall/latency figures.`,
    routerDescription: 'Hand-specified threshold rule (unique top exact-keyword-match scorer with score > 0) — NOT a trained XGBoost/logistic model, per tasks.md BYPASS-02a scope.',
    summary: {
      baseline_RRF_then_mxbai: summarize('RRF -> mxbai (baseline)', baselineRuns),
      proposed_evidence_conditional_mxbai: summarize('RRF -> evidence features -> conditional mxbai', evidenceRuns),
    },
    detail: { baselineRuns, evidenceRuns },
  };

  await mkdir(dirname(REPORT_PATH), { recursive: true });
  await writeFile(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ ...report, reportPath: REPORT_PATH }, null, 2));
}

main().catch((e) => { console.error('FAILED:', e); process.exit(1); });
