import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const directory = path.join(root, '.tmp/atlas');
const digest = value => `sha256:${createHash('sha256').update(value).digest('hex')}`;
const census = JSON.parse(fs.readFileSync(path.join(directory, 'identity-review-census-input-v2.json'), 'utf8'));
const summary = JSON.parse(fs.readFileSync(path.join(directory, 'identity-review-manifest-summary-v2.json'), 'utf8'));
const bytes = fs.readFileSync(path.join(directory, 'identity-review-manifest-v2.jsonl'));
const records = bytes.toString('utf8').trim().split('\n').map(line => JSON.parse(line));
assert.equal(digest(bytes), summary.manifestChecksum);
assert.equal(digest(JSON.stringify(census)), summary.inputChecksum);
const expected = new Map();
for (const occurrence of census.mappingRows) {
  if (!occurrence.feature_id) continue;
  if (!expected.has(occurrence.feature_id)) expected.set(occurrence.feature_id, []);
  expected.get(occurrence.feature_id).push(occurrence);
}
for (const [key, occurrences] of expected) {
  if (new Set(occurrences.map(row => row.source_ref).filter(Boolean)).size < 2) expected.delete(key);
}
const localRecords = records.filter(record => record.recordKind === 'MULTI_SOURCE_LOCAL_ID');
assert.equal(localRecords.length, expected.size);
assert.equal(new Set(localRecords.map(record => record.localFeatureId)).size, expected.size);
for (const record of localRecords) {
  assert.deepEqual(record.occurrences, expected.get(record.localFeatureId));
  assert.deepEqual(record.sourceRefs, [...new Set(record.occurrences.map(row => row.source_ref).filter(Boolean))].sort());
  assert.equal(record.equivalenceStatus, 'UNKNOWN');
  assert.equal(record.canonicalFeatureId, null);
  assert.equal(record.mappingDecision, 'NOT_MAPPED');
  assert.equal(record.reviewPriority, record.localFeatureId.includes('.') ? 'HIGH' : 'NORMAL');
}
assert.deepEqual(records.filter(record => record.recordKind === 'PRODUCT_FEATURE_CANDIDATE').map(record => record.candidate), census.productCandidates);
assert.equal(localRecords.length, summary.multiSourceIdsCovered);
assert.equal(localRecords.filter(record => record.reviewPriority === 'HIGH').length, summary.dottedIdsPrioritized);
const receipt = { schema: 'atlas.identity-review-manifest-readback.v1', status: 'PASS',
  observedAt: new Date().toISOString(), manifestChecksum: summary.manifestChecksum,
  localIdsVerified: localRecords.length, candidatesVerified: census.productCandidates.length,
  productionWritesPerformed: 0, canonicalAuthority: false };
fs.writeFileSync(path.join(directory, 'identity-review-manifest-readback-v2.json'), JSON.stringify(receipt, null, 2) + '\n');
console.log(JSON.stringify(receipt));
