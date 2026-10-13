import assert from 'node:assert/strict';
import test from 'node:test';
import { classifyExactQdrantPacketLinksV1 } from './classify-exact-qdrant-packet-link-v1.mjs';

test('accepts a single packet-point match with equal normalized source refs', () => {
  const result = classifyExactQdrantPacketLinksV1(
    [{ packet_key: 'p1', source_ref: 'sveltekit-frontend/src/a.ts' }],
    new Map([['p1', [{ pointId: 'q1', sourceRef: 'src/a.ts' }]]]),
  );

  assert.deepEqual(result, {
    eligible: [{
      packetKey: 'p1',
      pointId: 'q1',
      sourceRef: 'sveltekit-frontend/src/a.ts',
      packetRow: { packet_key: 'p1', source_ref: 'sveltekit-frontend/src/a.ts' },
    }],
    ambiguousSkipped: 0,
    sourceRefMismatchSkipped: 0,
  });
});

test('rejects a packet-key match whose source refs disagree', () => {
  const result = classifyExactQdrantPacketLinksV1(
    [{ packet_key: 'p1', source_ref: 'src/a.ts' }],
    new Map([['p1', [{ pointId: 'q1', sourceRef: 'src/b.ts' }]]]),
  );

  assert.equal(result.eligible.length, 0);
  assert.equal(result.sourceRefMismatchSkipped, 1);
});

test('rejects duplicate packet rows and multiple points as ambiguous', () => {
  const result = classifyExactQdrantPacketLinksV1(
    [
      { packet_key: 'p1', source_ref: 'src/a.ts' },
      { packet_key: 'p1', source_ref: 'src/a.ts' },
      { packet_key: 'p2', source_ref: 'src/b.ts' },
    ],
    new Map([
      ['p1', [{ pointId: 'q1', sourceRef: 'src/a.ts' }]],
      ['p2', [{ pointId: 'q2', sourceRef: 'src/b.ts' }, { pointId: 'q3', sourceRef: 'src/b.ts' }]],
    ]),
  );

  assert.equal(result.eligible.length, 0);
  assert.equal(result.ambiguousSkipped, 2);
});

test('rejects missing source refs instead of inferring identity', () => {
  const result = classifyExactQdrantPacketLinksV1(
    [{ packet_key: 'p1', source_ref: null }],
    new Map([['p1', [{ pointId: 'q1', sourceRef: 'src/a.ts' }]]]),
  );

  assert.equal(result.eligible.length, 0);
  assert.equal(result.sourceRefMismatchSkipped, 1);
});
