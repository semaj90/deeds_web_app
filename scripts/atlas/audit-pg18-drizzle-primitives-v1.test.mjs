import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assertReadOnlySql,
  inspectDrizzleSchemaMappings,
  verifyAlignedBitsetBlobRoundTrip,
  verifyRfc9162MerkleContract,
} from './audit-pg18-drizzle-primitives-v1.mjs';

test('assertReadOnlySql rejects mutating SQL keywords and allows SELECT/EXPLAIN', () => {
  assert.doesNotThrow(() =>
    assertReadOnlySql('EXPLAIN (ANALYZE, BUFFERS, SETTINGS, FORMAT JSON) SELECT * FROM legal_nodes')
  );
  assert.throws(() => assertReadOnlySql('UPDATE legal_nodes SET citation_label = NULL'));
  assert.throws(() => assertReadOnlySql('CREATE INDEX idx_foo ON legal_nodes (id)'));
});

test('verifyAlignedBitsetBlobRoundTrip enforces 64-byte PostgreSQL varlena alignment and exact ordinals', () => {
  const res = verifyAlignedBitsetBlobRoundTrip(1024, [0, 7, 63, 64, 127, 255, 512, 1023]);
  assert.equal(res.magicValid, true);
  assert.equal(res.pgMemoryAlignmentMod64, 0);
  assert.equal(res.popcount, 8);
  assert.equal(res.allOrdinalsVerified, true);
  assert.equal(res.alignedPayloadBytes, 128);
  assert.equal(res.webgpuU32WordCount, 32);
});

test('verifyRfc9162MerkleContract verifies deterministic 0x00/0x01 Merkle root and merkel->merkle alias', () => {
  const res = verifyRfc9162MerkleContract();
  assert.equal(res.deterministicParity, true);
  assert.equal(res.tamperDetected, true);
  assert.equal(res.taxonomyMerkelToMerkleAliasPresent, true);
  assert.match(res.merkleTreeHash, /^sha256:[0-9a-f]{64}$/);
});

test('inspectDrizzleSchemaMappings finds bytea customType, jsonb, vector, gin, and hnsw definitions', () => {
  const mappings = inspectDrizzleSchemaMappings();
  assert.equal(mappings.length, 4);
  const totalBytea = mappings.reduce((acc, m) => acc + m.customTypeByteaCount, 0);
  const totalJsonb = mappings.reduce((acc, m) => acc + m.jsonbColumnCount, 0);
  assert.ok(totalBytea >= 4, `Expected >= 4 customType bytea definitions, got ${totalBytea}`);
  assert.ok(totalJsonb >= 10, `Expected >= 10 jsonb column definitions, got ${totalJsonb}`);
});
