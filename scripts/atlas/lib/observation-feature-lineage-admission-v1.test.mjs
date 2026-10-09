import test from 'node:test';
import assert from 'node:assert/strict';
import { validateObservationFeaturePlanLineageV1, validateObservationFeaturePlanRowsV1 } from './observation-feature-lineage-admission-v1.mjs';

const hash = (letter) => `sha256:${letter.repeat(64)}`;
const digest = 'a'.repeat(64);
const validRow = () => ({
  packetKey: 'packet:1',
  sourceRef: 'src/a.ts',
  sourceRevision: hash('b'),
  featureRevision: 'ast-features:v1',
  registryRevision: 'feature-registry:v1',
  inputDigest: digest,
  evidenceRefs: ['source-span:src/a.ts:0-12'],
});

test('admits a fully lineage-qualified plan row', () => {
  assert.deepEqual(validateObservationFeaturePlanLineageV1(validRow(), hash('c')), { admitted: true, reasons: [] });
});

test('rejects a missing source revision', () => {
  const result = validateObservationFeaturePlanLineageV1({ ...validRow(), sourceRevision: null }, hash('c'));
  assert.equal(result.admitted, false);
  assert.ok(result.reasons.includes('SOURCE_REVISION_UNQUALIFIED'));
});

test('rejects an unqualified cohort revision', () => {
  const result = validateObservationFeaturePlanLineageV1(validRow(), 'workspace:0');
  assert.ok(result.reasons.includes('WORKSPACE_REVISION_UNQUALIFIED'));
});

test('rejects absent registry revision and source evidence refs', () => {
  const result = validateObservationFeaturePlanLineageV1({ ...validRow(), registryRevision: null, evidenceRefs: ['packet:1'] }, hash('c'));
  assert.ok(result.reasons.includes('REGISTRY_REVISION_MISSING'));
  assert.ok(result.reasons.includes('SOURCE_EVIDENCE_REFS_MISSING'));
});

test('rejects malformed input digest', () => {
  const result = validateObservationFeaturePlanLineageV1({ ...validRow(), inputDigest: 'not-a-digest' }, hash('c'));
  assert.ok(result.reasons.includes('INPUT_DIGEST_MISSING_OR_INVALID'));
});

test('reports every rejected row without admitting a partial batch', () => {
  const result = validateObservationFeaturePlanRowsV1([validRow(), { ...validRow(), packetKey: '' }], hash('c'));
  assert.equal(result.admitted, false);
  assert.equal(result.rowCount, 2);
  assert.equal(result.rejected.length, 1);
  assert.ok(result.rejected[0].reasons.includes('PACKET_KEY_MISSING'));
});
