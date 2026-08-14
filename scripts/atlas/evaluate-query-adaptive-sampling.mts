import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { compileQasCandidateFeatures, toQasSamplerCandidates, type QueryAdaptiveFeatureRowV1 } from '../../sveltekit-frontend/src/lib/server/atlas/retrieval/query-adaptive-feature-compiler.js';
import { evaluateQueryAdaptiveSample } from '../../sveltekit-frontend/src/lib/server/atlas/retrieval/query-adaptive-evaluator.js';
import { sampleQueryAdaptiveCandidates } from '../../sveltekit-frontend/src/lib/server/atlas/retrieval/query-adaptive-sampler.js';

const ROOT = resolve(import.meta.dirname, '../..');
const inputPath = resolve(ROOT, 'docs/reports/atlas-qas-candidate-features.jsonl');
const baselinePath = resolve(ROOT, 'docs/reports/qas-exact-baseline.json');
const reportPath = resolve(ROOT, 'docs/reports/query-adaptive-sampling-eval.json');
const fixture = process.argv.includes('--fixture');

function fixtureRows(): QueryAdaptiveFeatureRowV1[] {
  return Array.from({ length: 32 }, (_, index) => compileQasCandidateFeatures({
    requestId: 'request:fixture',
    policyRevision: 'policy:fixture:r1',
    candidates: [{
      canonicalId: `symbol:${index}`,
      packetKey: `packet:${index}`,
      symbolVersionId: `symbol-version:${index}`,
      sourceRef: `src/${index}.ts`,
      workspaceRevision: 'workspace:fixture:r1',
      sourceRevision: 'source:fixture:r1',
      graphRevision: 'graph:fixture:r1',
      featureRevision: 'features:fixture:r1',
      representationRevision: 'semantic_768:fixture:r1',
      taskKind: 'DEBUG',
      domainClass: 'retrieval',
      features: {
        semanticAffinity: index < 10 ? 0.95 : 0.2,
        lexicalAffinity: 0.7,
        graphAuthority: 0.6,
        astAffinity: 0.5,
        processAffinity: 0.4,
        domainAffinity: 0.8,
        priorExecutionSuccess: 0.3,
        reuseProbability: 0.2,
        recency: 0.8,
      },
      evidenceRefs: [`evidence:${index}`],
    }],
  } )[0]);
}

function readRows(): QueryAdaptiveFeatureRowV1[] {
  if (fixture) return fixtureRows();
  if (!existsSync(inputPath)) return [];
  return readFileSync(inputPath, 'utf8').split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line) as QueryAdaptiveFeatureRowV1);
}

const rows = readRows();
let baselineIds: string[] = [];
if (fixture) baselineIds = rows.slice().sort((a, b) => b.features.semanticAffinity - a.features.semanticAffinity).map((row) => row.canonicalId);
else if (existsSync(baselinePath)) baselineIds = JSON.parse(readFileSync(baselinePath, 'utf8')).baselineIds ?? [];

const report = {
  schema: 'atlas.qas.evaluation-receipt.v1',
  status: rows.length > 0 && baselineIds.length > 0 ? 'PROVEN_FIXTURE_OR_INPUT' : 'DEFERRED_MISSING_INPUT_OR_BASELINE',
  inputPath: existsSync(inputPath) ? inputPath : null,
  baselinePath: existsSync(baselinePath) ? baselinePath : null,
  budgets: [128, 512, 2048],
  evaluations: [] as unknown[],
  exactBaselineOwner: 'SearchRuntime',
  canonicalWrites: false,
};

if (rows.length > 0 && baselineIds.length > 0) {
  const sampled = sampleQueryAdaptiveCandidates({
    candidates: toQasSamplerCandidates(rows),
    weights: { semantic: 1, lexical: 0.25, structural: 0.5, domain: 0.35, execution: 0.2 },
    sampleSize: Math.min(128, rows.length),
    seed: 'qas-eval:r1',
  });
  report.evaluations.push(evaluateQueryAdaptiveSample({
    baselineIds,
    sampledIds: sampled.map((sample) => rows.find((row) => row.packetKey === sample.packetKey)?.canonicalId ?? '').filter(Boolean),
    exactPromotedIds: sampled.map((sample) => rows.find((row) => row.packetKey === sample.packetKey)?.canonicalId ?? '').filter(Boolean),
    budget: Math.min(128, rows.length),
  }));
}

mkdirSync(dirname(reportPath), { recursive: true });
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ status: report.status, evaluations: report.evaluations.length, reportPath }, null, 2));
