#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { projectQueryFeaturesV1, flattenQueryFeaturesV1 } from '../../src/lib/server/atlas/classification/query-feature-projection-v1.js';

const repoRoot = resolve(process.cwd(), '..');
const output = resolve(repoRoot, 'docs/reports/query-router-154-fixture-v1.json');

function digest(values: ArrayLike<number>): string {
  return createHash('sha256').update(Buffer.from(Float32Array.from(values).buffer)).digest('hex');
}

function classificationFixture(seed: number): number[] {
  const values = Array.from({ length: 768 }, (_, index) =>
    Math.sin((seed + 1) * (index + 1) * 0.017) + Math.cos((seed + 3) * (index + 5) * 0.011));
  const norm = Math.hypot(...values);
  return values.slice(0, 128).map((value) => value / Math.sqrt(values.slice(0, 128).reduce((sum, item) => sum + item * item, 0)));
}

const query = 'trace the current Graphify packet to chunk and AST lineage';
const features = projectQueryFeaturesV1(query);
const featureValues = flattenQueryFeaturesV1(features);
const classificationMrl128 = classificationFixture(7);
const tensor = Float32Array.from([...classificationMrl128, ...featureValues]);
const finite = Array.from(tensor).every(Number.isFinite);
const normalized = Math.abs(Math.hypot(...classificationMrl128) - 1) < 1e-5;
const report = {
  schema: 'ParentAtlasQueryRouter154FixtureV1',
  generatedAt: new Date().toISOString(),
  status: tensor.length === 154 && finite && normalized ? 'FIXTURE_PLUMBING_PROVEN' : 'FIXTURE_FAILED',
  evidenceClass: 'FIXTURE_ONLY',
  query,
  queryFeatureRevision: features.revision,
  classificationRepresentationId: 'classification_mrl_128',
  classificationModelExecuted: false,
  classificationMrl128Checksum: digest(classificationMrl128),
  deterministic26Checksum: digest(featureValues),
  tensorRevision: 'atlas.query-router-tensor.v1',
  tensorWidth: tensor.length,
  tensorChecksum: digest(tensor),
  checks: { width154: tensor.length === 154, finite, classificationL2Normalized: normalized, featureWidth26: featureValues.length === 26 },
  canonicalAuthority: false,
  writesPerformed: false,
  canonicalWritesAllowed: false,
  nextRequirement: 'REAL_REVISION_QUALIFIED_CLASSIFICATION_MRL_128_EXECUTION_AND_PARITY',
};
mkdirSync(resolve(repoRoot, 'docs/reports'), { recursive: true });
writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ status: report.status, tensorWidth: report.tensorWidth, output }, null, 2));
