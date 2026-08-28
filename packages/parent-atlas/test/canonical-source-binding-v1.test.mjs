import test from 'node:test';
import assert from 'node:assert/strict';
import { checksumCanonicalSourceBindings, resolveCanonicalSourceBinding } from '../../../scripts/atlas/lib/canonical-source-binding-v1.mjs';

const workspaceRevision = `sha256:${'a'.repeat(64)}`;
const sourceRevision = `sha256:${'b'.repeat(64)}`;
const observation = (sourceRef, contentDigest = `sha256:${'c'.repeat(64)}`) => ({ sourceRef, workspaceRevision, sourceRevision, contentDigest });

test('accepts exact current source reference', () => {
  const row = resolveCanonicalSourceBinding({ packetSourceRef: 'src/a.ts', currentWorkspaceRevision: workspaceRevision, observations: [observation('src/a.ts')] });
  assert.equal(row.classification, 'EXACT');
  assert.equal(row.canonicalAuthority, true);
});

test('accepts unique content-proven bridge', () => {
  const row = resolveCanonicalSourceBinding({ packetSourceRef: 'legacy/a.ts', packetContentDigest: 'sha256:c', currentWorkspaceRevision: workspaceRevision, observations: [observation('src/a.ts', 'sha256:c')] });
  assert.equal(row.classification, 'CONTENT_PROVEN');
});

test('accepts approved alias only', () => {
  const aliases = new Map([['src/a.ts', 'sveltekit-frontend/src/a.ts']]);
  const row = resolveCanonicalSourceBinding({ packetSourceRef: 'src/a.ts', currentWorkspaceRevision: workspaceRevision, observations: [observation('sveltekit-frontend/src/a.ts')], approvedAliases: aliases });
  assert.equal(row.classification, 'EXPLICIT_ALIAS');
});

test('rejects basename-style unresolved reference', () => {
  const row = resolveCanonicalSourceBinding({ packetSourceRef: 'a.ts', currentWorkspaceRevision: workspaceRevision, observations: [observation('src/a.ts')] });
  assert.equal(row.classification, 'UNRESOLVED');
  assert.equal(row.canonicalAuthority, false);
});

test('rejects ambiguous content bridge', () => {
  const row = resolveCanonicalSourceBinding({ packetSourceRef: 'legacy/a.ts', packetContentDigest: 'sha256:c', currentWorkspaceRevision: workspaceRevision, observations: [observation('src/a.ts', 'sha256:c'), observation('other/a.ts', 'sha256:c')] });
  assert.equal(row.classification, 'AMBIGUOUS');
});

test('rejects stale workspace observations', () => {
  const stale = { ...observation('src/a.ts'), workspaceRevision: `sha256:${'d'.repeat(64)}` };
  const row = resolveCanonicalSourceBinding({ packetSourceRef: 'src/a.ts', currentWorkspaceRevision: workspaceRevision, observations: [stale] });
  assert.equal(row.classification, 'UNRESOLVED');
});

test('rejects invalid current workspace revision', () => {
  const row = resolveCanonicalSourceBinding({ packetSourceRef: 'src/a.ts', currentWorkspaceRevision: 'git:old', observations: [] });
  assert.equal(row.classification, 'WORKSPACE_MISMATCH');
});

test('binding checksum is order independent', () => {
  const a = resolveCanonicalSourceBinding({ packetSourceRef: 'src/a.ts', currentWorkspaceRevision: workspaceRevision, observations: [observation('src/a.ts')] });
  const b = resolveCanonicalSourceBinding({ packetSourceRef: 'src/b.ts', currentWorkspaceRevision: workspaceRevision, observations: [observation('src/b.ts')] });
  assert.equal(checksumCanonicalSourceBindings([a, b]), checksumCanonicalSourceBindings([b, a]));
});
