#!/usr/bin/env node

/** Freeze a bounded, explicit KNN query population from the admitted map. */

import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../..');
const mapPath = resolve(root, 'docs/reports/candidate-ordinal-corpus-v1.json');
const admissionPath = resolve(root, 'docs/reports/candidate-ordinal-admission-v1.json');
const outputPath = resolve(root, 'docs/reports/knn-query-population-freeze-v1.json');
const map = JSON.parse(readFileSync(mapPath, 'utf8'));
const admission = JSON.parse(readFileSync(admissionPath, 'utf8'));
const candidates = Array.isArray(map.candidates) ? map.candidates : [];
const queryCandidates = candidates.slice(0, Math.min(32, candidates.length));
const queryCanonicalIds = queryCandidates.map((candidate) => candidate.canonicalId);
const queryPopulationChecksum = createHash('sha256').update(JSON.stringify(queryCanonicalIds)).digest('hex');

const report = {
  schema: 'atlas.knn-query-population-freeze.v1',
  mode: 'READ_ONLY_FREEZE',
  candidateAdmissionReport: 'docs/reports/candidate-ordinal-admission-v1.json',
  candidateSnapshotRevision: admission.candidateSnapshotRevision ?? null,
  ordinalMapChecksum: admission.ordinalMapChecksum ?? null,
  selectionPolicy: 'EXPLICIT_FIRST_32_ADMITTED_ORDINALS',
  queryCanonicalIds,
  queryOrdinals: queryCandidates.map((candidate) => candidate.candidateOrdinal),
  queryCount: queryCanonicalIds.length,
  queryPopulationChecksum: `sha256:${queryPopulationChecksum}`,
  writesPerformed: false,
  canonicalAuthority: false,
};

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ output: 'docs/reports/knn-query-population-freeze-v1.json', queryCount: report.queryCount, queryPopulationChecksum: report.queryPopulationChecksum }, null, 2));
