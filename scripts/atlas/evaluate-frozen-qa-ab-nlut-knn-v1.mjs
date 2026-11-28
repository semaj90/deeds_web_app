#!/usr/bin/env node
/**
 * Frozen Cohort A/B Evaluator:
 * Compares baseline exactThenQaLexical (9/10 prose, 10/10 exact, 0/5 negative)
 * against Stage-0 exact guard + matchNesLutMask -> batchCosineTopKMasked
 * (live :8094 EmbeddingGemma2) behind a calibrated cosine floor tau and RRF.
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { evaluateLookup, readQaFixtureTerms, verifyFrozenSymbolSource } from './evaluate-frozen-qa-symbol-lookup-v1.mjs';

const ROOT = realpathSync(fileURLToPath(new URL('../../', import.meta.url)));
const require = createRequire(import.meta.url);
const digest = (bytes) => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
const key = ({ method, route }) => `${method} ${route}`;
const METHOD_RE = /^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)$/i;

const addonCandidates = [
  path.join(ROOT, 'simd-bridge/cpp/build-x64-cuda/Release/tensorrt_bridge.node'),
  path.join(ROOT, 'simd-bridge/cpp/build-x64-fallback/Release/tensorrt_bridge.node'),
  path.join(ROOT, 'simd-bridge/build/Release/tensorrt_bridge.node'),
];
const addonPath = addonCandidates.find((p) => existsSync(p));
if (!addonPath) throw new Error('TENSORRT_BRIDGE_NODE_NOT_FOUND');
const addon = require(addonPath);

async function embedTexts(texts) {
  const res = await fetch('http://127.0.0.1:8094/embed', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ texts }),
  });
  if (!res.ok) throw new Error(`EMBED_8094_HTTP_${res.status}`);
  const data = await res.json();
  const dims = Number(data.dims ?? 768);
  const raw = Array.isArray(data.embeddings)
    ? data.embeddings
    : (data.embeddings[String(dims)] ?? data.embeddings['768']);
  const vectors = Array.isArray(raw[0])
    ? raw
    : Array.from({ length: texts.length }, (_, i) => raw.slice(i * dims, (i + 1) * dims));
  return { modelId: data.model_id, dims, vectors };
}

function measureField(cases, field) {
  const expected = cases.filter(({ expectedId }) => expectedId !== null);
  const rank = (item) => item[field].indexOf(item.expectedId) + 1;
  return {
    positiveQueries: expected.length,
    hitsAt1: expected.filter((item) => rank(item) === 1).length,
    hitsAt3: expected.filter((item) => rank(item) > 0 && rank(item) <= 3).length,
    mrrAt3: Number((expected.reduce((sum, item) => sum + (rank(item) ? 1 / rank(item) : 0), 0) / (expected.length || 1)).toFixed(4)),
    negativeQueriesWithHits: cases.filter((item) => item.expectedId === null && item[field].length > 0).length,
  };
}

const corpusDir = path.join(ROOT, '.tmp/review/frozen-qa-symbol-corpus-v1');
const qaReportPath = path.join(ROOT, '.tmp/review/qa-feature-route-cohort-pass-2-v1.json');
const specPath = path.join(ROOT, 'sveltekit-frontend/tests/lane-contracts/qa-feature-route-cohort.spec.ts');

const receipt = JSON.parse(readFileSync(path.join(corpusDir, 'receipt.json'), 'utf8'));
const corpusBytes = readFileSync(path.join(corpusDir, 'symbols.json'));
if (digest(corpusBytes) !== receipt.symbolCorpusSha256) throw new Error('FROZEN_SYMBOL_CORPUS_DRIFT');
const corpus = JSON.parse(corpusBytes);
for (const row of corpus.symbols) {
  verifyFrozenSymbolSource(row, readFileSync(path.resolve(ROOT, row.file)));
}
const { qaTerms } = readQaFixtureTerms(corpus.symbols, JSON.parse(readFileSync(qaReportPath, 'utf8')), readFileSync(specPath, 'utf8'));
const baseline = evaluateLookup(corpus.symbols, { qaTerms });

const ids = corpus.symbols.map(key);
const docTexts = corpus.symbols.map((row) =>
  [row.method, row.route, row.featureLabel, row.file, row.languageId, ...(qaTerms.get(key(row)) ?? [])].join(' ')
);
const nonExactCases = baseline.cases.filter((c) => c.kind !== 'EXACT');
const queryTexts = nonExactCases.map((c) => c.query);

const { modelId, dims, vectors: allVecs } = await embedTexts([...docTexts, ...queryTexts]);
const n = corpus.symbols.length;
const corpusMat = new Float32Array(n * dims);
for (let i = 0; i < n; i++) corpusMat.set(allVecs[i], i * dims);

// NES-LUT bitmask: 0x01 = FIXTURE_ROUTE, 0x02 = OTHER
const lut = new Uint8Array(corpus.symbols.map((r) => (r.role === 'FIXTURE_ROUTE' ? 0x01 : 0x02)));
const activeMask = addon.matchNesLutMask(lut, new Uint8Array([0x01, 0x02]), 0);
const outIdx = new Int32Array(3);
const outScores = new Float32Array(3);

const denseResultsByQuery = new Map();
let maxNegativeDenseScore = -1;
for (let qi = 0; qi < nonExactCases.length; qi++) {
  const c = nonExactCases[qi];
  const structured = METHOD_RE.test(c.query) || /^(?:[a-z]+\s+)?\//i.test(c.query);
  if (structured) {
    denseResultsByQuery.set(c.query, { structured: true, hits: [] });
    continue;
  }
  const qVec = new Float32Array(allVecs[n + qi]);
  const res = addon.batchCosineTopKMasked(qVec, corpusMat, n, dims, 3, activeMask, outIdx, outScores);
  const hits = [];
  for (let j = 0; j < res.count; j++) {
    hits.push({ id: ids[res.indices[j]], score: Number(res.scores[j].toFixed(4)) });
  }
  if (c.kind === 'NEGATIVE' && hits[0]) {
    maxNegativeDenseScore = Math.max(maxNegativeDenseScore, hits[0].score);
  }
  denseResultsByQuery.set(c.query, { structured: false, hits });
}

const calibratedTau = Number((maxNegativeDenseScore + 0.01).toFixed(4));
const abCases = baseline.cases.map((c) => {
  if (c.kind === 'EXACT') {
    return { ...c, nlutMaskedDenseFloor: c.exact, nlutMaskedRrf: c.exact };
  }
  const dInfo = denseResultsByQuery.get(c.query);
  if (dInfo.structured) {
    return { ...c, nlutMaskedDenseFloor: c.exact, nlutMaskedRrf: c.exact };
  }
  const denseFloorHits = dInfo.hits.filter((h) => h.score >= calibratedTau).map((h) => h.id);
  // RRF fusing exactThenQaLexical + calibrated dense hits
  const rrfScores = new Map();
  c.exactThenQaLexical.forEach((id, idx) => rrfScores.set(id, (rrfScores.get(id) ?? 0) + 1 / (60 + idx + 1)));
  denseFloorHits.forEach((id, idx) => rrfScores.set(id, (rrfScores.get(id) ?? 0) + 1 / (60 + idx + 1)));
  const rrfTop3 = [...rrfScores.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([id]) => id);
  return {
    ...c,
    denseTop3Raw: dInfo.hits,
    nlutMaskedDenseFloor: denseFloorHits,
    nlutMaskedRrf: rrfTop3,
  };
});

const summary = Object.fromEntries(['EXACT', 'PROSE', 'NEGATIVE'].map((kind) => [
  kind,
  {
    exactThenQaLexical: measureField(abCases.filter((r) => r.kind === kind), 'exactThenQaLexical'),
    nlutMaskedDenseFloor: measureField(abCases.filter((r) => r.kind === kind), 'nlutMaskedDenseFloor'),
    nlutMaskedRrf: measureField(abCases.filter((r) => r.kind === kind), 'nlutMaskedRrf'),
  },
]));

const outReport = {
  schema: 'atlas.frozen-qa-ab-nlut-knn.v1',
  generatedAt: new Date().toISOString(),
  status: 'PROPOSAL_ONLY',
  embedModel: modelId,
  dims,
  runtimeSupportsAvx2: addon.nesLutSupportsAvx2() === 1,
  maxNegativeDenseScore,
  calibratedTau,
  summary,
  aceStatusMissDetail: abCases.find((c) => c.expectedId === 'GET /api/ace/status' && c.query.includes('somebody else')),
};

const outPath = path.join(ROOT, '.tmp/atlas/frozen-qa-ab-nlut-knn-v1.json');
mkdirSync(path.dirname(outPath), { recursive: true });
writeFileSync(outPath, `${JSON.stringify(outReport, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(outReport, null, 2));
