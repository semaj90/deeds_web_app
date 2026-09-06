#!/usr/bin/env node
/**
 * RERANK-SHADOW-04 follow-up: isolates whether the candidate-text FORMAT (not the model) explains
 * mxbai's poor showing in rerank-shadow-01-harness.mjs. Same queries/candidates/ground-truth as
 * that harness, but each candidate is now wrapped in the SOURCE:/SYMBOL:/KIND:/CALLS: format
 * scripts/reranker-sidecar.py's own docstring documents as the expected "Atlas canonical shape" —
 * only the candidate TEXT format changes, nothing else (same model, same query, same ground truth).
 */

const MXBAI = 'http://127.0.0.1:8099';

const FIXTURE = [
  {
    query: 'Which function sums duplicate-identity RRF scores instead of discarding them?',
    candidates: [
      { id: 'service-merge', source: 'src/lib/server/retrieval/service.ts', symbol: 'mergeDuplicateIdentityScores', kind: 'function', calls: 'Map.set, Map.get', body: 'const key = r.symbol_version_id ?? r.packet_key ?? r.id; merged.set(key, { ...representative, score: existing.score + r.score });', relevant: true },
      { id: 'rrf-tologicallane', source: 'src/lib/server/retrieval/rrf-fuse.ts', symbol: 'toLogicalLaneName', kind: 'function', calls: 'normalizeRetrievalLane', body: 'const normalized = value.trim().toLowerCase(); return normalizeRetrievalLane(normalized) ?? (normalized || "dispatcher");', relevant: false },
      { id: 'lane-aliases', source: 'src/lib/server/retrieval/retrieval-lane-aliases.ts', symbol: 'normalizeRetrievalLane', kind: 'function', calls: 'Set.has', body: 'if (DENSE_LANE_ALIAS_SET.has(normalized)) return "dense"; if (LEXICAL_LANE_ALIAS_SET.has(normalized)) return "lexical"; return undefined;', relevant: false },
      { id: 'model-resolution', source: 'src/lib/server/atlas/contracts/model-resolution-v1.ts', symbol: 'assertRuntimeIdentityIsMocked', kind: 'function', calls: 'Error', body: 'if (!resolution.runtimeDiscovered) throw new Error("runtimeDiscovered=false...");', relevant: false },
      { id: 'helper-card', source: 'src/lib/server/atlas/contracts/helper-card-v1.ts', symbol: 'canDispatchDirectly', kind: 'function', calls: 'none', body: 'return candidate.rank === 0 && candidate.similarity >= HELPER_ROUTING_DIRECT_DISPATCH_THRESHOLD;', relevant: false },
    ],
  },
  {
    query: 'Which contract enforces that batch extraction never runs on the full corpus, only a bounded candidate subset?',
    candidates: [
      { id: 'evidence-card', source: 'src/lib/server/atlas/contracts/candidate-evidence-card-v1.ts', symbol: 'assertExtractionBatchBounded', kind: 'function', calls: 'Error', body: 'if (candidateCount > CANDIDATE_EVIDENCE_EXTRACTION_MAX_BATCH) throw new Error("exceeds the bounded maximum");', relevant: true },
      { id: 'firecrawl-provider', source: 'src/lib/server/retrieval/optional-firecrawl-provider.ts', symbol: 'loadFirecrawl', kind: 'function', calls: 'import', body: 'if (cached) return cached; const mod = await import("@mendable/firecrawl-js");', relevant: false },
      { id: 'relevance-scores', source: 'src/lib/server/atlas/contracts/candidate-relevance-scores-v1.ts', symbol: 'shouldEscalateToTextRelevance', kind: 'function', calls: 'none', body: 'if (cheapScoresDescending.length < 2) return false;', relevant: false },
      { id: 'fusion-contribution', source: 'src/lib/server/retrieval/fusion-contribution-v1.ts', symbol: 'FusionContributionV1', kind: 'interface', calls: 'none', body: 'canonicalId: string; logicalLane: string; rank: number; weight: number; executorId: string; provenanceRefs: string[];', relevant: false },
      { id: 'helper-card-2', source: 'src/lib/server/atlas/contracts/helper-card-v1.ts', symbol: 'HelperCardV1Schema', kind: 'const', calls: 'z.object', body: 'helperId: id, capabilities: z.string().min(1), supportedTaskFamilies: z.array(z.string().min(1)).min(1)', relevant: false },
    ],
  },
  {
    query: 'Which module centralizes the optional dynamic import of the Firecrawl SDK behind one documented type-check exception?',
    candidates: [
      { id: 'firecrawl-provider-2', source: 'src/lib/server/retrieval/optional-firecrawl-provider.ts', symbol: 'loadFirecrawl', kind: 'function', calls: 'import', body: 'try { const mod = await import("@mendable/firecrawl-js"); const FirecrawlCtor = mod.default ?? mod; cached = { status: "AVAILABLE", FirecrawlCtor }; } catch (err) { cached = { status: "UNAVAILABLE", reason: err.message }; }', relevant: true },
      { id: 'youtube-transcript', source: 'src/lib/server/retrieval/youtube-transcript.ts', symbol: 'fetchViaFirecrawlMarkdown', kind: 'function', calls: 'loadFirecrawl', body: 'const apiKey = ENV.FIRECRAWL_API_KEY; if (!apiKey) return null; const firecrawl = await loadFirecrawl();', relevant: false },
      { id: 'candidate-evidence-2', source: 'src/lib/server/atlas/contracts/candidate-evidence-card-v1.ts', symbol: 'CandidateEvidenceCardV1Schema', kind: 'const', calls: 'z.object', body: 'canonicalId: id, packetKey: id, sourceRef: z.string().min(1)', relevant: false },
      { id: 'model-resolution-2', source: 'src/lib/server/atlas/contracts/model-resolution-v1.ts', symbol: 'MODEL_RESOLUTION_SOURCE_VALUES', kind: 'const', calls: 'none', body: '["REQUEST_ALIAS", "CONFIG", "LLAMA_V1_MODELS", "LLAMA_PROPS"]', relevant: false },
      { id: 'retrieval-lane-2', source: 'src/lib/server/retrieval/retrieval-lane-aliases.ts', symbol: 'DENSE_LANE_ALIASES', kind: 'const', calls: 'none', body: '["dense", "dense_384", "dense_768", "qdrant", "qdrant_vector", "qdrant_768", "turbovec", "turbovec_ann", "cuvs", "cagra"]', relevant: false },
    ],
  },
];

function formatCandidate(c) {
  return `SOURCE: ${c.source}\nSYMBOL: ${c.symbol}\nKIND: ${c.kind}\nCALLS: ${c.calls}\n\n${c.body}`;
}

async function mxbaiRerank(query, candidates) {
  const res = await fetch(`${MXBAI}/rerank`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, candidates: candidates.map(c => ({ packet_key: c.id, text: formatCandidate(c) })) }),
  });
  return res.json();
}

function metricsFor(rankedIds, relevantIds) {
  const relevantSet = new Set(relevantIds);
  const top1Correct = relevantSet.has(rankedIds[0]) ? 1 : 0;
  let mrr = 0;
  for (let i = 0; i < rankedIds.length; i++) { if (relevantSet.has(rankedIds[i])) { mrr = 1 / (i + 1); break; } }
  const recallAt3 = rankedIds.slice(0, 3).some(id => relevantSet.has(id)) ? 1 : 0;
  return { top1Correct, mrr, recallAt3 };
}

async function main() {
  const perQuery = [];
  for (const item of FIXTURE) {
    const relevantIds = item.candidates.filter(c => c.relevant).map(c => c.id);
    const result = await mxbaiRerank(item.query, item.candidates);
    const rankedIds = result.ranked.map(r => r.packet_key);
    perQuery.push({ query: item.query, ranked: result.ranked, metrics: metricsFor(rankedIds, relevantIds) });
  }
  const n = perQuery.length;
  const summary = {
    method: 'mxbai-rerank-base-v2 (SOURCE/SYMBOL/KIND-formatted candidates)',
    n,
    top1Agreement: perQuery.reduce((s, r) => s + r.metrics.top1Correct, 0) / n,
    mrrAvg: perQuery.reduce((s, r) => s + r.metrics.mrr, 0) / n,
    recallAt3Avg: perQuery.reduce((s, r) => s + r.metrics.recallAt3, 0) / n,
  };
  console.log(JSON.stringify({ summary, perQuery }, null, 2));
}

main().catch(e => { console.error('FAILED:', e); process.exit(1); });
