import assert from 'node:assert/strict';
import test from 'node:test';
import { compareExternalDocProjectionV1, parsePgVectorLiteral } from './orf3a-external-doc-768-512-dry-run-v1.mjs';

function vectorFor(seed) {
  return Array.from({ length: 768 }, (_, index) => index < 512
    ? Math.sin((seed + 1) * (index + 1) * 0.013) + Math.cos((seed + 3) * (index + 2) * 0.007)
    : 0);
}

function rows(count = 5) {
  return Array.from({ length: count }, (_, index) => ({
    chunkId: `chunk-${index}`,
    pageId: `page-${index % 2}`,
    pageChecksum: `page-sha-${index % 2}`,
    chunkChecksum: `chunk-sha-${index}`,
    evidenceRevision: `revision-${index}`,
    vectorLiteral: `[${vectorFor(index).join(',')}]`,
  }));
}

test('parses pgvector output and rejects malformed/non-finite values', () => {
  assert.deepEqual(parsePgVectorLiteral('[1, 2.5, -3]'), [1, 2.5, -3]);
  assert.throws(() => parsePgVectorLiteral('1,2'), /ORF3A_VECTOR_LITERAL_INVALID/);
  assert.throws(() => parsePgVectorLiteral('[1,NaN]'), /ORF3A_VECTOR_NONFINITE/);
});

test('compares deterministic 768 vs normalized 512 neighbors while preserving identities/checksums', () => {
  const receipt = compareExternalDocProjectionV1(rows(), { queryCount: 3, kValues: [1, 2] });
  assert.equal(receipt.cohort.chunkCount, 5);
  assert.equal(receipt.cohort.queryCount, 3);
  assert.equal(receipt.cohort.sourceDimension, 768);
  assert.equal(receipt.cohort.projectedDimension, 512);
  assert.equal(receipt.cohort.exactIdentityParity, true);
  assert.equal(receipt.cohort.identityChecksum, receipt.cohort.projectedIdentityChecksum);
  assert.equal(receipt.cohort.pageChecksumCount, 2);
  assert.equal(receipt.cohort.chunkChecksumCount, 5);
  assert.equal(receipt.writesPerformed, false);
  assert.equal(receipt.modelCalls, 0);
  assert.equal(receipt.applied, false);
  assert.equal(receipt.promotionEligible, false);
  assert.equal(receipt.neighborOverlap.recallAt1, 1);
  assert.equal(receipt.neighborOverlap.recallAt2, 1);
});

test('fails closed for an empty corpus, zero vector, bad dimension, missing checksum, and duplicate identity', () => {
  assert.throws(() => compareExternalDocProjectionV1([]), /ORF3A_ZERO_CHUNKS/);
  const zero = rows();
  zero[0].vectorLiteral = `[${Array(768).fill(0).join(',')}]`;
  assert.throws(() => compareExternalDocProjectionV1(zero, { queryCount: 2, kValues: [1] }), /ORF3A_ZERO_VECTOR/);
  const wrongDimension = rows();
  wrongDimension[0].vectorLiteral = `[${Array(512).fill(1).join(',')}]`;
  assert.throws(() => compareExternalDocProjectionV1(wrongDimension, { queryCount: 2, kValues: [1] }), /ORF3A_SOURCE_DIMENSION_MISMATCH/);
  const missingChecksum = rows();
  missingChecksum[0].chunkChecksum = '';
  assert.throws(() => compareExternalDocProjectionV1(missingChecksum, { queryCount: 2, kValues: [1] }), /ORF3A_IDENTITY_FIELD_MISSING:chunkChecksum/);
  const duplicate = rows();
  duplicate[1].chunkId = duplicate[0].chunkId;
  assert.throws(() => compareExternalDocProjectionV1(duplicate, { queryCount: 2, kValues: [1] }), /ORF3A_DUPLICATE_CHUNK_ID/);
});
