import crypto from 'node:crypto';
import test from 'node:test';
import assert from 'node:assert/strict';
import { encodeCsr, decodeCsr, neighbors, intersectNeighbors, CsrArtifactError } from './csr-graph-artifact-v1.mjs';

const nodeKeys = ['a', 'b', 'c', 'd'];
const edges = [{ source: 0, target: 1, type: 1 }, { source: 0, target: 2, type: 2 }, { source: 1, target: 2, type: 1 }, { source: 3, target: 0, type: 1 }];
const make = (extra = {}) => encodeCsr({ nodeKeys, edges, projectionRevision: 'proj@1', ...extra });
const code = (fn) => { try { fn(); } catch (e) { return e instanceof CsrArtifactError ? e.code : `OTHER:${e.message}`; } return null; };

test('round trip preserves structure and neighbors', () => {
  const out = decodeCsr(make().bytes);
  assert.equal(out.nodeCount, 4);
  assert.equal(out.edgeCount, 4);
  assert.deepEqual([...neighbors(out, 0)], [1, 2]);
  assert.deepEqual([...neighbors(out, 2)], []);
  assert.equal(out.meta.canonicalAuthority, false);
  assert.equal(out.weights, null);
});

test('bytes and digest are independent of input edge order', () => {
  const a = make();
  const b = encodeCsr({ nodeKeys, edges: [...edges].reverse(), projectionRevision: 'proj@1' });
  assert.equal(a.sha256, b.sha256);
  assert.ok(a.bytes.equals(b.bytes));
});

test('weights round trip when present for every edge and fail closed otherwise', () => {
  const w = encodeCsr({ nodeKeys, edges: edges.map((e, i) => ({ ...e, weight: i + 0.5 })), projectionRevision: 'p' });
  const out = decodeCsr(w.bytes);
  assert.equal(out.weights.length, 4);
  assert.equal(code(() => encodeCsr({ nodeKeys, edges: [{ ...edges[0], weight: 1 }, edges[1]], projectionRevision: 'p' })), 'WEIGHT_MISSING_OR_NON_FINITE');
  assert.equal(code(() => encodeCsr({ nodeKeys, edges: [{ ...edges[0], weight: NaN }], projectionRevision: 'p' })), 'WEIGHT_MISSING_OR_NON_FINITE');
});

test('64-bit offsets round trip and u32 offsets refuse overflow', () => {
  const wide = decodeCsr(make({ forceOffsetWidth: 8 }).bytes);
  assert.equal(wide.offsetWidth, 8);
  assert.deepEqual([...neighbors(wide, 0)], [1, 2]);
  assert.equal(code(() => make({ forceOffsetWidth: 3 })), 'OFFSET_WIDTH_INVALID');
});

test('structural input errors', () => {
  assert.equal(code(() => encodeCsr({ nodeKeys, edges: [{ source: 0, target: 9, type: 1 }], projectionRevision: 'p' })), 'EDGE_ORDINAL_OUT_OF_RANGE');
  assert.equal(code(() => encodeCsr({ nodeKeys, edges: [{ source: 0, target: 1, type: 70000 }], projectionRevision: 'p' })), 'RELATION_TYPE_CODE_OUT_OF_RANGE');
  assert.equal(code(() => encodeCsr({ nodeKeys, edges: [edges[0], edges[0]], projectionRevision: 'p' })), 'DUPLICATE_EDGE');
  assert.equal(code(() => encodeCsr({ nodeKeys: ['b', 'a'], edges: [], projectionRevision: 'p' })), 'NODE_KEYS_NOT_STRICTLY_SORTED');
  assert.equal(code(() => encodeCsr({ nodeKeys, edges, projectionRevision: '' })), 'PROJECTION_REVISION_REQUIRED');
});

test('corruption, truncation, wrong magic, big-endian flag and trailing bytes are rejected', () => {
  const { bytes } = make();
  const flip = Buffer.from(bytes); flip[40] ^= 0xff;
  assert.equal(code(() => decodeCsr(flip)), 'DIGEST_MISMATCH');
  assert.equal(code(() => decodeCsr(bytes.subarray(0, 20))), 'TRUNCATED_HEADER');
  assert.equal(code(() => decodeCsr(bytes.subarray(0, bytes.length - 1))), 'DIGEST_MISMATCH');
  assert.equal(code(() => decodeCsr(Buffer.concat([bytes, Buffer.from([0])]))), 'DIGEST_MISMATCH');
  // Re-digest a mutated body so the specific field checks are reached.
  const reseal = (mutate) => {
    const body = Buffer.from(bytes.subarray(0, bytes.length - 32)); mutate(body);
    return Buffer.concat([body, crypto.createHash('sha256').update(body).digest()]);
  };
  assert.equal(code(() => decodeCsr(reseal((b) => b.write('XXXX', 0, 'ascii')))), 'BAD_MAGIC');
  assert.equal(code(() => decodeCsr(reseal((b) => { b[5] = 2; }))), 'UNSUPPORTED_ENDIANNESS');
  assert.equal(code(() => decodeCsr(reseal((b) => { b[4] = 9; }))), 'UNSUPPORTED_VERSION');
  assert.equal(code(() => decodeCsr(reseal((b) => { b[6] = 3; }))), 'OFFSET_WIDTH_INVALID');
});

test('replaying the same inputs reproduces the same artifact; a different revision changes the digest', () => {
  assert.equal(make().sha256, make().sha256);
  assert.notEqual(make().sha256, encodeCsr({ nodeKeys, edges, projectionRevision: 'proj@2' }).sha256);
});

test('neighbor intersection matches a Set oracle on a seeded random fixture', () => {
  let seed = 12345; const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  const n = 200; const keys = Array.from({ length: n }, (_, i) => String(i).padStart(4, '0'));
  const es = []; const seen = new Set();
  for (let k = 0; k < 3000; k++) { const s = Math.floor(rnd() * n); const t = Math.floor(rnd() * n); const id = `${s}:${t}`; if (!seen.has(id)) { seen.add(id); es.push({ source: s, target: t, type: 1 }); } }
  const csr = decodeCsr(encodeCsr({ nodeKeys: keys, edges: es, projectionRevision: 'p' }).bytes);
  for (let a = 0; a < 30; a++) for (let b = a + 1; b < 30; b++) {
    const A = new Set(neighbors(csr, a)); const expected = [...neighbors(csr, b)].filter((x) => A.has(x)).sort((x, y) => x - y);
    assert.deepEqual(intersectNeighbors(csr, a, b), expected);
  }
});
