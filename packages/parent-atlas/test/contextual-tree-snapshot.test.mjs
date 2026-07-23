import assert from 'node:assert/strict';
import { test } from 'node:test';

const { compileContextualTreeSnapshot, ContextualTreeSnapshotError } = await import('../dist/index.js');

const packets = [
  { packet_key: 'packet:a', source_ref: 'src/lib/a.ts', content_hash: 'hash-a', tree_node_id: '11111111-1111-4111-8111-111111111111', feature_id: 'feature.a' },
  { packet_key: 'packet:b', source_ref: 'src/lib/b.ts', content_hash: 'hash-b', tree_node_id: '22222222-2222-4222-8222-222222222222', feature_id: 'feature.b' },
];

test('contextual tree snapshot is deterministic across input order', () => {
  const first = compileContextualTreeSnapshot({ workspace_id: 'deeds-web-app', packets });
  const second = compileContextualTreeSnapshot({ workspace_id: 'deeds-web-app', packets: [...packets].reverse() });
  assert.equal(first.snapshot_id, second.snapshot_id);
  assert.equal(first.source_manifest_hash, second.source_manifest_hash);
  assert.equal(first.topology_hash, second.topology_hash);
  assert.deepEqual(first.nodes, second.nodes);
  assert.deepEqual(first.edges, second.edges);
  assert.ok(first.nodes.some((node) => node.node_key === 'repository:deeds-web-app'));
  assert.ok(first.edges.some((edge) => edge.edge_type === 'MATERIALIZES'));
});

test('contextual tree snapshot records invalid packets without inventing identities', () => {
  const snapshot = compileContextualTreeSnapshot({ workspace_id: 'deeds-web-app', packets: [...packets, { packet_key: '', source_ref: '', content_hash: '' }] });
  assert.equal(snapshot.exclusions.length, 1);
  assert.equal(snapshot.exclusions[0].reason, 'INVALID_PACKET');
  assert.equal(snapshot.nodes.some((node) => node.packet_key === ''), false);
});

test('contextual tree snapshot rejects duplicate canonical packet keys', () => {
  assert.throws(
    () => compileContextualTreeSnapshot({ workspace_id: 'deeds-web-app', packets: [...packets, { ...packets[0], content_hash: 'different' }] }),
    (error) => error instanceof ContextualTreeSnapshotError && error.evidence.kind === 'DUPLICATE_PACKET_KEY',
  );
});

test('contextual tree snapshot changes when canonical content changes', () => {
  const before = compileContextualTreeSnapshot({ workspace_id: 'deeds-web-app', packets });
  const after = compileContextualTreeSnapshot({ workspace_id: 'deeds-web-app', packets: [{ ...packets[0], content_hash: 'new-hash' }, packets[1]] });
  assert.notEqual(before.snapshot_id, after.snapshot_id);
  assert.notEqual(before.topology_hash, after.topology_hash);
});
