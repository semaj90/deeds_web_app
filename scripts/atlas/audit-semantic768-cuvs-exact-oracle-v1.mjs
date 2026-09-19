#!/usr/bin/env node

/**
 * Read-only ANN-01 audit. Reconciles the existing bounded live cuVS receipt
 * with the TypeScript client boundary; it does not call or mutate the sidecar.
 */
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const readJson = (relativePath) => JSON.parse(fs.readFileSync(path.join(root, relativePath), 'utf8'));
const source = fs.readFileSync(path.join(root, 'sveltekit-frontend/src/lib/server/atlas/retrieval/atlas-rapids-semantic768-client.ts'), 'utf8');
const live = readJson('docs/reports/gpu-knn-exact-runtime-proof.json');
const lineage = readJson('docs/reports/current-lineage-closure-v1.json');
const freeze = readJson('docs/reports/candidate-population-freeze-v1.json');

const checks = {
  liveFixtureProven: live.status === 'PROVEN_ON_LIVE_FIXTURE',
  backendExact: live.backend === 'cuvs.brute_force' && live.gates?.GPU_KNN_02_EXACT_SEMANTIC_768 === 'PASS',
  representation: live.representationId === 'semantic_768' && live.dimension === 768,
  identityPreserved: live.identityContract === 'packetKey+sourceRevision' && live.gates?.GPU_KNN_04_IDENTITY_AND_REVISION_PRESERVED === 'PASS',
  clientEndpoint: source.includes("/v1/knn/exact") && source.includes("backend: 'cuvs.brute_force'"),
  clientRepresentationGuard: source.includes("representationId !== 'semantic_768'") && source.includes('SEMANTIC768_DIMENSION'),
  mutationFree: Object.values(live.mutations ?? {}).every((value) => value === false),
};

const fixtureProven = Object.values(checks).every(Boolean);
const report = {
  schema: 'atlas.semantic768-cuvs-exact-oracle-audit.v1',
  status: fixtureProven ? 'CUVS_EXACT_ORACLE_PROVEN_BOUNDED_FIXTURE' : 'CUVS_EXACT_ORACLE_AUDIT_FAILED',
  checks,
  liveFixture: {
    sourceReport: 'docs/reports/gpu-knn-exact-runtime-proof.json',
    endpoint: live.endpoint,
    device: live.device,
    backend: live.backend,
    backendVersion: live.backendVersion,
    representationId: live.representationId,
    dimension: live.dimension,
    corpusRows: live.corpusRows,
    runs: live.runs?.length ?? 0,
  },
  currentEligibility: {
    lineageStatus: lineage.status ?? null,
    candidateFreezeStatus: freeze.status ?? null,
    liveCurrentCohortEligible: false,
    reason: 'bounded oracle proof does not admit the current source cohort',
  },
  cagra: {
    role: 'CHALLENGER_ONLY',
    comparisonRun: live.gates?.GPU_KNN_05_EXACT_VS_CAGRA_RECALL ?? 'NOT_RUN',
  },
  canonicalAuthority: false,
  downstreamAllowed: false,
  writesPerformed: false,
};

const reportPath = path.join(root, 'docs/reports/semantic768-cuvs-exact-oracle-v1.json');
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));

