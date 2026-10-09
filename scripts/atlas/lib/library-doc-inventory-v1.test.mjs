import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { inventoryNpm, inventoryNonNpmManifests } from './library-doc-inventory-v1.mjs';

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
  for (const dir of ['active', '.tmp/snapshot', 'deeds_labs/archive', 'gsd_archives', 'backup-2026-10-08', 'scripts/api-cleanup/reports/backup-2025-12']) {
    fs.mkdirSync(path.join(root, dir), { recursive: true });
    fs.writeFileSync(path.join(root, dir, 'package.json'), JSON.stringify({ name: dir, dependencies: { visible: '1' } }));
  }
  const report = inventoryNpm(root, { sources: [] });
  assert.deepEqual(report.manifests.map((manifest) => manifest.path), ['active/package.json']);
});

test('excludes gitlink manifests and Python environments from dependency evidence', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-doc-inventory-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ dependencies: { app_owned: '1.0.0' } }));
  fs.mkdirSync(path.join(root, 'turbovec'), { recursive: true });
  fs.writeFileSync(path.join(root, 'turbovec/package.json'), JSON.stringify({ dependencies: { submodule_only: '9.0.0' } }));
  fs.writeFileSync(path.join(root, 'turbovec/Cargo.toml'), '[package]\nname="turbovec"\n');
  fs.mkdirSync(path.join(root, '.python311'), { recursive: true });
  fs.writeFileSync(path.join(root, '.python311/requirements.txt'), 'environment_only==1.0.0\n');

  const options = { excludedRootDirs: ['turbovec'] };
  const npm = inventoryNpm(root, { sources: [] }, options);
  const nonNpm = inventoryNonNpmManifests(root, options);
  assert.deepEqual(npm.manifests.map((manifest) => manifest.path), ['package.json']);
  assert.deepEqual(npm.packages.map((item) => item.name), ['app_owned']);
  assert.deepEqual(nonNpm, []);
});
