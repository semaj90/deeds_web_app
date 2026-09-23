import assert from 'node:assert/strict';
import test from 'node:test';
import {
  canonicalAstSourceRefV1,
  comparableSourceRevisionV1,
  resolveAstGrepObservationTreeNodeV1,
  resolveAstGrepObservationTreeNodesV1,
} from '../dist/core/ast-grep-tree-node-resolution-v1.js';

const REV = 'a'.repeat(64);
const OTHER_REV = 'b'.repeat(64);
const obs = (o = {}) => ({ observation_id: 'obs-1', source_ref: 'src/a.ts', source_revision: `sha256:${REV}`, byte_start: 10, byte_end: 24, ...o });
const node = (o = {}) => ({ treeNodeId: 'tn-1', sourceRef: 'src/a.ts', sourceRevision: `sha256:${REV}`, startByte: 10, endByte: 24, upstreamNodeId: null, ...o });

test('POSITIVE: explicit upstream_node_id + ref + revision -> that exact treeNodeId', () => {
  const set = [node({ upstreamNodeId: 'up-1', startByte: 0, endByte: 100 }), node({ treeNodeId: 'tn-2', upstreamNodeId: 'up-2', startByte: 0, endByte: 100 })];
  const r = resolveAstGrepObservationTreeNodeV1(obs({ upstream_node_id: 'up-2' }), set);
  assert.deepEqual([r.status, r.treeNodeId, r.resolutionBasis, r.candidateCount], ['RESOLVED', 'tn-2', 'UPSTREAM_NODE_ID', 1]);
  assert.equal(r.canonicalAuthority, false);
});

test('POSITIVE: unique exact span -> treeNodeId (EXACT_SPAN)', () => {
  const r = resolveAstGrepObservationTreeNodeV1(obs(), [node(), node({ treeNodeId: 'tn-x', startByte: 30, endByte: 40 })]);
  assert.deepEqual([r.status, r.treeNodeId, r.resolutionBasis], ['RESOLVED', 'tn-1', 'EXACT_SPAN']);
});

test('POSITIVE: unique containing node when admitted; not when containment is frozen off', () => {
  const set = [node({ startByte: 0, endByte: 100 })];
  const yes = resolveAstGrepObservationTreeNodeV1(obs({ byte_start: 20, byte_end: 30 }), set);
  assert.deepEqual([yes.status, yes.treeNodeId, yes.resolutionBasis], ['RESOLVED', 'tn-1', 'UNIQUE_CONTAINING_NODE']);
  const no = resolveAstGrepObservationTreeNodeV1(obs({ byte_start: 20, byte_end: 30 }), set, { admitContainment: false });
  assert.deepEqual([no.status, no.treeNodeId, no.reason], ['UNRESOLVED', null, 'NO_NODE_MATCHES_SPAN']);
});

test('POSITIVE: non-ASCII UTF-8 byte positions (byte offsets differ from UTF-16 indexes)', () => {
  const source = '// é中😀\nfunction f() {}\n';
  const bytes = Buffer.from(source, 'utf8');
  const start = bytes.indexOf(Buffer.from('function f() {}', 'utf8'));
  const end = start + Buffer.byteLength('function f() {}', 'utf8');
  assert.notEqual(start, source.indexOf('function f() {}')); // proves bytes != chars
  const r = resolveAstGrepObservationTreeNodeV1(obs({ byte_start: start, byte_end: end }), [node({ startByte: start, endByte: end })]);
  assert.deepEqual([r.status, r.resolutionBasis], ['RESOLVED', 'EXACT_SPAN']);
  const charIndexed = resolveAstGrepObservationTreeNodeV1(obs({ byte_start: source.indexOf('function f() {}'), byte_end: source.indexOf('function f() {}') + 15 }), [node({ startByte: start, endByte: end })], { admitContainment: false });
  assert.notEqual(charIndexed.status, 'RESOLVED'); // char offsets are NOT accepted as byte offsets
});

test('POSITIVE: deterministic replay is byte-identical, order-independent for the candidate set', () => {
  const set = [node(), node({ treeNodeId: 'tn-9', startByte: 0, endByte: 5 })];
  const a = JSON.stringify(resolveAstGrepObservationTreeNodeV1(obs(), set));
  const b = JSON.stringify(resolveAstGrepObservationTreeNodeV1(obs(), [...set].reverse()));
  assert.equal(a, b);
});

test('NEGATIVE: missing / wrong / sentinel source revision fails closed', () => {
  for (const source_revision of ['', 'latest', 'workspace:0', 'sha256:short', undefined]) {
    const r = resolveAstGrepObservationTreeNodeV1(obs({ source_revision }), [node()]);
    assert.deepEqual([r.status, r.treeNodeId, r.reason], ['LINEAGE_MISMATCH', null, 'MISSING_OR_INVALID_SOURCE_REVISION']);
  }
  const wrong = resolveAstGrepObservationTreeNodeV1(obs({ source_revision: `sha256:${OTHER_REV}` }), [node()]);
  assert.deepEqual([wrong.status, wrong.reason], ['LINEAGE_MISMATCH', 'SOURCE_REVISION_MISMATCH']);
});

test('NEGATIVE: same byte span in another source, and same symbol name in another file, never resolve', () => {
  const r1 = resolveAstGrepObservationTreeNodeV1(obs(), [node({ sourceRef: 'src/other.ts' })]);
  assert.deepEqual([r1.status, r1.treeNodeId, r1.reason], ['UNRESOLVED', null, 'NO_CANDIDATES_FOR_SOURCE_REF']);
  const r2 = resolveAstGrepObservationTreeNodeV1(obs({ source_ref: 'src/b.ts' }), [node({ sourceRef: 'src/a.ts' }), node({ sourceRef: 'src/c.ts', treeNodeId: 'tn-c' })]);
  assert.equal(r2.treeNodeId, null);
});

test('NEGATIVE: two containing nodes and two same-span nodes are AMBIGUOUS, never first-wins', () => {
  const containing = resolveAstGrepObservationTreeNodeV1(obs({ byte_start: 20, byte_end: 30 }), [node({ startByte: 0, endByte: 100 }), node({ treeNodeId: 'tn-2', startByte: 15, endByte: 40 })]);
  assert.deepEqual([containing.status, containing.treeNodeId, containing.reason, containing.candidateCount], ['AMBIGUOUS', null, 'MULTIPLE_CONTAINING_NODES', 2]);
  const same = resolveAstGrepObservationTreeNodeV1(obs(), [node(), node({ treeNodeId: 'tn-2' })]);
  assert.deepEqual([same.status, same.treeNodeId, same.reason], ['AMBIGUOUS', null, 'MULTIPLE_NODES_WITH_SAME_SPAN']);
});

test('NEGATIVE: duplicate upstream_node_id candidates are AMBIGUOUS', () => {
  const r = resolveAstGrepObservationTreeNodeV1(obs({ upstream_node_id: 'up-1' }), [node({ upstreamNodeId: 'up-1', startByte: 0, endByte: 99 }), node({ treeNodeId: 'tn-2', upstreamNodeId: 'up-1', startByte: 0, endByte: 99 })]);
  assert.deepEqual([r.status, r.treeNodeId, r.reason], ['AMBIGUOUS', null, 'DUPLICATE_UPSTREAM_NODE_ID']);
});

test('NEGATIVE: a failed explicit upstream id does NOT fall through to an exact-span match', () => {
  const missing = resolveAstGrepObservationTreeNodeV1(obs({ upstream_node_id: 'up-missing' }), [node({ upstreamNodeId: 'up-1' })]); // span would match exactly
  assert.deepEqual([missing.status, missing.treeNodeId, missing.reason], ['UNRESOLVED', null, 'UPSTREAM_NODE_ID_NOT_IN_CANDIDATES']);
  const conflict = resolveAstGrepObservationTreeNodeV1(obs({ upstream_node_id: 'up-1', byte_start: 200, byte_end: 210 }), [node({ upstreamNodeId: 'up-1' })]);
  assert.deepEqual([conflict.status, conflict.treeNodeId, conflict.reason], ['LINEAGE_MISMATCH', null, 'UPSTREAM_NODE_ID_SPAN_CONFLICT']);
});

test('NEGATIVE: no AST candidate / chunk overlap without an exact node resolution / stale-revision projection-like row', () => {
  assert.equal(resolveAstGrepObservationTreeNodeV1(obs(), []).status, 'UNRESOLVED');
  const overlapOnly = resolveAstGrepObservationTreeNodeV1(obs({ byte_start: 20, byte_end: 60 }), [node({ startByte: 0, endByte: 30 })]); // partial overlap only
  assert.deepEqual([overlapOnly.status, overlapOnly.treeNodeId], ['UNRESOLVED', null]);
  const stale = resolveAstGrepObservationTreeNodeV1(obs(), [node({ sourceRevision: `sha256:${OTHER_REV}` })]);
  assert.deepEqual([stale.status, stale.treeNodeId], ['LINEAGE_MISMATCH', null]);
});

test('normalization: documented and limited (no case folding, prefix strip only, sha256 prefix equivalence only)', () => {
  assert.equal(canonicalAstSourceRefV1('sveltekit-frontend\\src\\a.ts'), 'src/a.ts');
  assert.equal(canonicalAstSourceRefV1('SRC/A.ts'), 'SRC/A.ts');
  assert.equal(comparableSourceRevisionV1(`sha256:${REV}`), REV);
  assert.equal(comparableSourceRevisionV1(REV), REV);
  assert.equal(comparableSourceRevisionV1('workspace:0'), null);
  const viaPrefix = resolveAstGrepObservationTreeNodeV1(obs({ source_ref: 'sveltekit-frontend/src/a.ts', source_revision: REV }), [node()]);
  assert.equal(viaPrefix.status, 'RESOLVED');
  // both raw forms present => root identity is not recoverable => AMBIGUOUS, never silently chosen
  const collide = resolveAstGrepObservationTreeNodeV1(obs(), [node({ sourceRef: 'sveltekit-frontend/src/a.ts' }), node({ treeNodeId: 'tn-2' })]);
  assert.deepEqual([collide.status, collide.treeNodeId], ['AMBIGUOUS', null]);
});

test('batch form parses observations with the shared schema and never claims canonical authority', () => {
  const sha = 'c'.repeat(64);
  const [row] = resolveAstGrepObservationTreeNodesV1({
    observations: [{ observation_id: 'o1', rule_id: 'r', source_ref: 'src/a.ts', source_revision: `sha256:${REV}`, byte_start: 10, byte_end: 24, matched_text_hash: sha, captures: {}, observation_kind: 'k', confidence: 1, extractor_revision: `sha256:${sha}`, canonical_authority: false }],
    candidates: [node()],
  });
  assert.deepEqual([row.status, row.treeNodeId, row.canonicalAuthority], ['RESOLVED', 'tn-1', false]);
});
