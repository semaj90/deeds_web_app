import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { inventoryNpm } from './library-doc-inventory-v1.mjs';

test('counts direct declarations and preserves nested lock versions separately from installed state', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-doc-inventory-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, 'app/node_modules/@scope/pkg'), { recursive: true });
  fs.writeFileSync(path.join(root, 'app/package.json'), JSON.stringify({ name: 'app', dependencies: { '@scope/pkg': '^1', missing: '^2' } }));
  fs.writeFileSync(path.join(root, 'app/node_modules/@scope/pkg/package.json'), JSON.stringify({ version: '1.2.0' }));
  fs.writeFileSync(path.join(root, 'app/package-lock.json'), JSON.stringify({ lockfileVersion: 3, packages: {
    'node_modules/@scope/pkg': { version: '1.2.0' },
    'node_modules/parent/node_modules/@scope/pkg': { version: '2.0.0' },
  } }));
  const report = inventoryNpm(root, { sources: [{ id: 'scope-source', packages: ['@scope/pkg'] }] });
  const scoped = report.packages.find((pkg) => pkg.name === '@scope/pkg');
  assert.equal(report.manifestCount, 1);
  assert.deepEqual(scoped.declarations[0].lockResolvedVersions, ['1.2.0', '2.0.0']);
  assert.equal(scoped.declarations[0].installed, true);
  assert.equal(scoped.declarations[0].runtimeLoaded, 'NOT_PROBED');
  assert.deepEqual(scoped.catalogSources, ['scope-source']);
  assert.equal(report.packages.find((pkg) => pkg.name === 'missing').declarations[0].lockStatus, 'NOT_RESOLVED');
});

test('does not call a declared package installed when its root node_modules copy is absent', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-doc-inventory-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ dependencies: { absent: '1.x' } }));
  const report = inventoryNpm(root, { sources: [] });
  assert.equal(report.packages[0].declarations[0].installed, false);
  assert.equal(report.packages[0].declarations[0].lockStatus, 'NO_LOCKFILE');
});

test('excludes ignored temporary and archival trees from the active-repository census', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-doc-inventory-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  for (const dir of ['active', '.tmp/snapshot', 'deeds_labs/archive']) {
    fs.mkdirSync(path.join(root, dir), { recursive: true });
    fs.writeFileSync(path.join(root, dir, 'package.json'), JSON.stringify({ name: dir, dependencies: { visible: '1' } }));
  }
  const report = inventoryNpm(root, { sources: [] });
  assert.deepEqual(report.manifests.map((manifest) => manifest.path), ['active/package.json']);
});
