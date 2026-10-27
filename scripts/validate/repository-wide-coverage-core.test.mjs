import test from 'node:test';
import assert from 'node:assert/strict';
import { accountMemberships } from './repository-wide-coverage-core.mjs';

const WS = `sha256:${'a'.repeat(64)}`;
const SRC = `sha256:${'b'.repeat(64)}`;
const present = () => ({ isSymbolicLink: () => false });

const member = (rel, overrides = {}) => ({ scope: 'repo:root', rel, sourceRef: rel, wsRev: WS, srcRev: SRC, hash: 'h', len: 1, ...overrides });
const run = (memberships, extra = {}) =>
  accountMemberships({
    memberships,
    bound: new Set(),
    legacyPacketRefs: new Set(),
    registryPresent: false,
    workspaceRevision: WS,
    rootScope: 'repo:root',
    lstat: present,
    ...extra,
  });
const dir = (result, name) => result.directories.find((entry) => entry.directory === name);

test('counts every file exactly once across nested directories, and totals reconcile', () => {
  const result = run([member('a/b/c/x.ts'), member('a/b/y.ts'), member('a/z.md'), member('top.json')]);
  assert.equal(result.directories.reduce((n, d) => n + d.selected, 0), 4);
  assert.equal(result.scopes.reduce((n, s) => n + s.selected, 0), 4);
  assert.equal(dir(result, 'repo:root :: a/b/c').selected, 1);
  assert.equal(dir(result, 'repo:root :: .').selected, 1);
});

test('reports duplicate paths and keeps both rows in the total', () => {
  const result = run([member('src/a.ts'), member('src/a.ts')]);
  assert.deepEqual(result.violations.duplicatePaths, ['repo:root:src/a.ts']);
  assert.equal(result.scopes[0].selected, 2);
});

test('detects case-folded collisions but not identical paths in different scopes', () => {
  const collision = run([member('Src/A.ts'), member('src/a.ts')]);
  assert.equal(collision.violations.caseFoldCollisions.length, 1);
  const separateScopes = run([member('src/a.ts'), member('src/a.ts', { scope: 'repo:turbovec', sourceRef: 'turbovec/src/a.ts' })]);
  assert.equal(separateScopes.violations.duplicatePaths.length, 0);
  assert.equal(separateScopes.violations.caseFoldCollisions.length, 0);
});

test('flags unsafe paths: absolute, parent traversal and NUL', () => {
  const result = run([member('/etc/passwd'), member('a/../b.ts'), member('x\u0000y.ts')]);
  assert.equal(result.violations.unsafePaths.length, 3);
});

test('flags symlinks only for the root scope', () => {
  const link = () => ({ isSymbolicLink: () => true });
  const result = run([member('linked.ts'), member('n.ts', { scope: 'repo:turbovec' })], { lstat: link });
  assert.deepEqual(result.violations.symlinks, ['linked.ts']);
});

test('records unsupported extensions explicitly instead of omitting them', () => {
  const result = run([member('a.toml'), member('b.proto'), member('c.ts'), member('LICENSE')]);
  assert.deepEqual(result.unsupported, { '.toml': 1, '.proto': 1, '(none)': 1 });
  assert.equal(result.parserCounts.typescript, 1);
});

test('missing source digest or stale workspace revision is not revision-qualified', () => {
  const result = run([member('ok.ts'), member('nodigest.ts', { srcRev: '' }), member('badhash.ts', { srcRev: 'sha256:xyz' }), member('stale.ts', { wsRev: `sha256:${'c'.repeat(64)}` })]);
  assert.equal(result.scopes[0].selected, 4);
  assert.equal(result.scopes[0].revisionQualified, 1);
});

test('nested scopes are never mapped, never disk-checked, never registry-qualified', () => {
  const result = run([member('x.ts', { scope: 'repo:turbovec' })], { registryPresent: true, lstat: () => assert.fail('nested scope must not be disk-checked') });
  assert.equal(result.scopes[0].nestedUnmapped, 1);
  assert.equal(result.scopes[0].registryIdentityQualified, 0);
  assert.equal(result.scopes[0].missingOnDisk, 0);
});

test('a missing root file is counted, and registry qualification needs the registry tables', () => {
  const missing = run([member('gone.ts')], { lstat: () => null });
  assert.equal(missing.scopes[0].missingOnDisk, 1);
  assert.equal(missing.scopes[0].registryIdentityQualified, 0);
  const withRegistry = run([member('a.ts')], { registryPresent: true });
  assert.equal(withRegistry.scopes[0].registryIdentityQualified, 1);
});

test('binding and legacy-packet observation are matched on source_ref, never on the path alone', () => {
  const result = run([member('a.ts', { sourceRef: 'repo/a.ts' })], { bound: new Set(['a.ts']), legacyPacketRefs: new Set(['a.ts']) });
  assert.equal(result.scopes[0].processedBound, 0);
  assert.equal(result.scopes[0].legacyPacketObserved, 0);
});
