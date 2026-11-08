import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { buildRepoLicenseInventoryV1, sha256 } from './repo-license-inventory-v1.mjs';

test('hashes tracked license documents and keeps dependency manifests separate', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'atlas-license-inventory-'));
  try {
    await mkdir(path.join(root, 'sveltekit-frontend'), { recursive: true });
    const license = 'Synthetic project terms\n';
    const pkg = JSON.stringify({ name: 'fixture', version: '1.0.0', license: 'MIT' });
    const lock = JSON.stringify({ lockfileVersion: 3, packages: { '': {}, 'node_modules/fixture': { version: '1.0.0', license: 'GPL-3.0-only' } } });
    await writeFile(path.join(root, 'LICENSE'), license);
    await writeFile(path.join(root, 'third-party.d.ts'), 'declare module "fixture";\n');
    await writeFile(path.join(root, 'THIRD-PARTY-NOTICES.md'), 'Synthetic notice\n');
    await writeFile(path.join(root, 'package.json'), pkg);
    await writeFile(path.join(root, 'package-lock.json'), lock);
    await writeFile(path.join(root, 'sveltekit-frontend', 'requirements.txt'), 'fixture==1.0\n');
    const report = await buildRepoLicenseInventoryV1({
      repoRoot: root,
      trackedPaths: ['LICENSE', 'third-party.d.ts', 'THIRD-PARTY-NOTICES.md', 'package.json', 'package-lock.json', 'sveltekit-frontend/requirements.txt'],
      workspaceRevision: 'fixture-revision'
    });

    assert.equal(report.sourceDocuments.length, 2);
    assert.ok(report.sourceDocuments.every((document) => !document.path.endsWith('.d.ts')));
    assert.equal(report.sourceDocuments[0].sha256, sha256(Buffer.from(license)));
    assert.equal(report.dependencyManifests.length, 1);
    assert.equal(report.dependencyManifests[0].path, 'sveltekit-frontend/requirements.txt');
    assert.ok(report.components.some((row) => row.name === 'fixture' && row.status === 'REVIEW_REQUIRED_POLICY_SENSITIVE_LICENSE'));
    assert.equal(report.warnings.some((warning) => warning.code === 'ROOT_PROJECT_LICENSE_NOT_FOUND'), false);
    assert.equal(report.authority, 'TRACKED_REPOSITORY_METADATA_ONLY_HUMAN_REVIEW_REQUIRED');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('reports missing root license and missing dependency metadata without promoting status', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'atlas-license-inventory-'));
  try {
    await writeFile(path.join(root, 'package.json'), JSON.stringify({ name: 'fixture-root' }));
    await writeFile(path.join(root, 'package-lock.json'), JSON.stringify({ packages: { 'node_modules/unknown': { version: '1.2.3' } } }));
    const report = await buildRepoLicenseInventoryV1({ repoRoot: root, trackedPaths: ['package.json', 'package-lock.json'] });
    assert.ok(report.warnings.some((warning) => warning.code === 'ROOT_PROJECT_LICENSE_NOT_FOUND'));
    assert.ok(report.components.some((row) => row.name === 'unknown' && row.status === 'REVIEW_REQUIRED_MISSING_LICENSE_METADATA'));
    assert.ok(report.limitations.some((item) => item.includes('legal conclusions')));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
