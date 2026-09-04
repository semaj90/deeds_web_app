#!/usr/bin/env node

/** Read-only audit of the existing aligned experiment parameters. */

import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../..');
const mapPath = resolve(root, 'docs/reports/candidate-ordinal-admission-v1.json');
const specPath = resolve(root, 'python/atlas_compute/aligned_snapshot_experiment.example.json');
const queryFreezePath = resolve(root, 'docs/reports/knn-query-population-freeze-v1.json');
const semanticKeysPath = resolve(root, 'python/atlas_compute/gpu_mini_fabric/fixtures/semantic-768-real-frozen-node-keys.json');
const outputPath = resolve(root, 'docs/reports/knn-parameter-freeze-v1.json');

const admission = JSON.parse(readFileSync(mapPath, 'utf8'));
const spec = JSON.parse(readFileSync(specPath, 'utf8'));
const queryFreeze = JSON.parse(readFileSync(queryFreezePath, 'utf8'));
const semanticKeys = JSON.parse(readFileSync(semanticKeysPath, 'utf8'));
const queryIds = Array.isArray(queryFreeze.queryCanonicalIds) ? queryFreeze.queryCanonicalIds : [];
const semanticKeySet = new Set(Array.isArray(semanticKeys) ? semanticKeys : []);
const queryPopulationIntersection = queryIds.filter((id) => semanticKeySet.has(id));
const parameters = {
  topK: Number(spec.k),
  distanceMetric: spec.metric,
  queryCanonicalIds: queryIds,
  kmeansClusters: Number(spec.kmeans_clusters),
  somGridRows: Number(spec.som_grid_rows),
  somGridColumns: Number(spec.som_grid_columns),
  somEpochs: Number(spec.som_epochs),
};
const parameterChecksum = createHash('sha256').update(JSON.stringify(parameters)).digest('hex');
const explicit = Number.isInteger(parameters.topK) && parameters.topK > 0
  && typeof parameters.distanceMetric === 'string' && parameters.distanceMetric.length > 0
  && queryIds.length > 0
  && Number.isInteger(parameters.kmeansClusters) && parameters.kmeansClusters > 0
  && parameters.somGridRows === 20 && parameters.somGridColumns === 20;

const report = {
  schema: 'atlas.knn-parameter-freeze.v1',
  mode: 'READ_ONLY_AUDIT',
  candidateAdmissionReport: 'docs/reports/candidate-ordinal-admission-v1.json',
  candidateSnapshotRevision: admission.candidateSnapshotRevision ?? null,
  ordinalMapChecksum: admission.ordinalMapChecksum ?? null,
  candidatePopulationRows: admission.population?.actualRows ?? null,
  sourceSpec: 'python/atlas_compute/aligned_snapshot_experiment.example.json',
  queryPopulationSource: 'docs/reports/knn-query-population-freeze-v1.json',
  queryPopulationChecksum: queryFreeze.queryPopulationChecksum ?? null,
  semanticSnapshotSource: 'python/atlas_compute/gpu_mini_fabric/fixtures/semantic-768-real-frozen-node-keys.json',
  semanticSnapshotRows: semanticKeys.length,
  queryPopulationIntersectionCount: queryPopulationIntersection.length,
  parameters,
  parameterChecksum: `sha256:${parameterChecksum}`,
  checks: {
    candidateAdmissionReady: admission.status === 'CANDIDATE_ORDINAL_ADMISSION_READY',
    topKExplicit: Number.isInteger(parameters.topK) && parameters.topK > 0,
    metricExplicit: typeof parameters.distanceMetric === 'string' && parameters.distanceMetric.length > 0,
    queryPopulationExplicit: queryIds.length > 0 && queryFreeze.mode === 'READ_ONLY_FREEZE',
    queryPopulationJoinsSemanticSnapshot: queryPopulationIntersection.length === queryIds.length,
    kmeansExplicit: Number.isInteger(parameters.kmeansClusters) && parameters.kmeansClusters > 0,
    som20x20Explicit: parameters.somGridRows === 20 && parameters.somGridColumns === 20,
  },
  status: explicit && admission.status === 'CANDIDATE_ORDINAL_ADMISSION_READY'
    && queryPopulationIntersection.length === queryIds.length
    ? 'KNN_PARAMETERS_READY'
    : 'KNN_PARAMETERS_BLOCKED',
  blocker: queryIds.length === 0
    ? 'The explicit query population freeze is empty.'
    : queryPopulationIntersection.length !== queryIds.length
      ? 'The frozen query population does not join the available semantic snapshot; freeze a matching semantic/candidate population before KNN.'
      : null,
  downstreamAllowed: false,
  writesPerformed: false,
  canonicalAuthority: false,
};

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ output: 'docs/reports/knn-parameter-freeze-v1.json', status: report.status, parameterChecksum: report.parameterChecksum }, null, 2));
