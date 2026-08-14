import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import {
  buildQueryAdaptiveSamplingReceipt,
  sampleQueryAdaptiveCandidates,
  type QueryAdaptiveCandidate,
} from '../../sveltekit-frontend/src/lib/server/atlas/retrieval/query-adaptive-sampler.js';

const ROOT = resolve(import.meta.dirname, '../..');
const reportPath = resolve(ROOT, 'docs/reports/query-adaptive-sampling-proof.json');
const inputPath = resolve(ROOT, 'docs/reports/atlas-qas-candidate-features.jsonl');
const fixtureMode = process.argv.includes('--fixture');
const dailyMode = process.argv.includes('--daily');

const fixtureCandidate = (packetKey: string, sourceRef: string, semanticAffinity: number): QueryAdaptiveCandidate => ({
  packetKey,
  sourceRef,
  symbolVersionId: `symbol:${packetKey}`,
  workspaceRevision: 'workspace:fixture:r1',
  sourceRevision: 'source:fixture:r1',
  representationRevision: 'semantic_768:fixture:r1',
  featureRevision: 'features:fixture:r1',
  features: {
    semanticAffinity,
    lexicalAffinity: 0.3,
    graphAuthority: 0.4,
    astAffinity: 0.5,
    processAffinity: 0.2,
    domainAffinity: 0.6,
    priorExecutionSuccess: 0.2,
    reuseProbability: 0.3,
    recency: 0.5,
    memoryCost: 0.1,
    promotionCost: 0.1,
  },
});

function readCandidates(): QueryAdaptiveCandidate[] {
  if (fixtureMode) return [fixtureCandidate('packet:a', 'src/a.ts', 0.9), fixtureCandidate('packet:b', 'src/b.ts', 0.4)];
  if (!existsSync(inputPath)) return [];
  return readFileSync(inputPath, 'utf8').split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
}

const candidates = readCandidates();
const status = candidates.length > 0 ? (fixtureMode ? 'PROVEN_FIXTURE' : 'PROVEN_INPUT') : 'DEFERRED_NO_FEATURE_MATRIX';
const samples = candidates.length > 0
  ? sampleQueryAdaptiveCandidates({
      candidates,
      weights: { semantic: 1, lexical: 0.25, structural: 0.5, domain: 0.35, execution: 0.2 },
      sampleSize: Math.min(128, Math.max(1, candidates.length)),
      seed: 'graphify-daily:qas:r1',
    })
  : [];

const receipt = buildQueryAdaptiveSamplingReceipt({
  status,
  workspaceRevision: 'graphify-daily:unresolved',
  representationRevision: 'semantic_768:unresolved',
  queryRevision: 'graphify-daily:qas:r1',
  candidateCount: candidates.length,
  featureRevision: candidates[0]?.featureRevision ?? null,
  samples,
});

const report = {
  ...receipt,
  generatedAt: new Date().toISOString(),
  mode: fixtureMode ? 'fixture' : dailyMode ? 'daily' : 'input',
  inputPath: existsSync(inputPath) ? inputPath : null,
  algorithm: 'query-conditioned weighted deterministic sketch; Tang-inspired routing only',
  exactPromotion: 'selected identifiers must be fetched and validated by existing canonical retrieval owners',
  deferred: ['GEPA', 'GRPO', 'LoRA stitching', 'WebGPU/Dawn', 'GPU residency mutation', 'canonical writes'],
};

mkdirSync(dirname(reportPath), { recursive: true });
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ status, candidateCount: candidates.length, sampleCount: samples.length, reportPath }, null, 2));
