import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDocumentationDemandV1, collectDocumentationSourceFiles, collectIndexedDocumentationRecords, collectNonNpmManifestFiles, parseNonNpmDependencyManifests } from './documentation-demand-v1.mjs';

const catalog = {
  catalogRevision: 'catalog-test-r1',
  sources: [
    { id: 'typescript', priority: 'P0', ecosystems: ['npm', 'typescript'], packages: ['typescript'], apiSurfaces: ['compiler'], urls: ['https://example.test/ts'] },
    { id: 'networkx', priority: 'P1', ecosystems: ['python'], packages: ['networkx'], apiSurfaces: ['graph'], urls: ['https://example.test/nx'] },
    { id: 'not-used', priority: 'P2', ecosystems: ['npm', 'typescript'], packages: ['unused-pkg'], apiSurfaces: [], urls: [] },
  ],
};
const inventory = { npm: { packages: [
  { name: 'typescript', declarations: [{ manifest: 'app/package.json', section: 'devDependencies', declaredRange: '^5', lockResolvedVersions: ['5.9.3'], installed: true, installedVersion: '5.9.3' }] },
  { name: 'unused-pkg', declarations: [] },
] } };
const sourceFiles = [
  { path: 'src/app.ts', language: 'typescript', text: "import ts from 'typescript';", sha256: 'sha-a' },
  { path: 'test/app.spec.ts', language: 'typescript', text: "import 'typescript';", sha256: 'sha-b' },
  { path: 'python/graph.py', language: 'python', text: 'import networkx as nx', sha256: 'sha-c' },
];

test('ranks catalog demand from distinct source import evidence and pinned versions', () => {
  const report = buildDocumentationDemandV1({ catalog, inventory, sourceFiles });
  const typescript = report.demands.find((item) => item.sourceId === 'typescript');
  const networkx = report.demands.find((item) => item.sourceId === 'networkx');
  const unused = report.demands.find((item) => item.sourceId === 'not-used');
  assert.equal(typescript.packages[0].sourceUse.distinctFiles, 2);
  assert.equal(typescript.packages[0].sourceUse.nonTestFiles, 1);
  assert.equal(typescript.packages[0].sourceUse.testFiles, 1);
  assert.deepEqual(typescript.packages[0].lockedVersions, ['5.9.3']);
  assert.equal(networkx.packages[0].sourceUse.nonTestFiles, 1);
  assert.ok(typescript.relevanceScore > networkx.relevanceScore);
  assert.equal(unused.packages[0].sourceUse.distinctFiles, 0);
  assert.equal(report.fetchPerformed, false);
  assert.equal(report.datastoreWritesPerformed, false);
});

test('produces deterministic demand and snapshot checksums for identical inputs', () => {
  const first = buildDocumentationDemandV1({ catalog, inventory, sourceFiles });
  const second = buildDocumentationDemandV1({ catalog, inventory, sourceFiles });
  assert.equal(first.demandChecksum, second.demandChecksum);
  assert.equal(first.sourceSnapshot.checksum, second.sourceSnapshot.checksum);
  assert.deepEqual(first.demands.map((item) => item.sourceId), second.demands.map((item) => item.sourceId));
});

test('binds dependency and corpus evidence files into the source snapshot', () => {
  const first = buildDocumentationDemandV1({ catalog, inventory, sourceFiles, inputFiles: [{ path: 'Cargo.toml', sha256: 'manifest-a' }] });
  const second = buildDocumentationDemandV1({ catalog, inventory, sourceFiles, inputFiles: [{ path: 'Cargo.toml', sha256: 'manifest-b' }] });
  assert.notEqual(first.sourceSnapshot.checksum, second.sourceSnapshot.checksum);
});

test('does not count arbitrary text mentions as imports', () => {
  const report = buildDocumentationDemandV1({
    catalog: { sources: [{ id: 'typescript', priority: 'P0', ecosystems: ['typescript'], packages: ['typescript'], urls: [] }] },
    inventory: { npm: { packages: [] } },
    sourceFiles: [{ path: 'src/comment.ts', language: 'typescript', text: '// typescript is mentioned, but not imported' }],
  });
  assert.equal(report.demands[0].packages[0].sourceUse.distinctFiles, 0);
});

test('parses Python, Go, and Rust declarations without calling declarations lockfiles', () => {
  const records = parseNonNpmDependencyManifests([
    { path: 'python/requirements-atlas.txt', text: 'networkx==3.6.1\npydantic>=2.0\n-r base.txt\n' },
    { path: 'python/pyproject.toml', text: '[project]\nname = "fixture"\ndependencies = [\n  "fastapi>=0.100",\n]\n[tool.other]\nplugins = ["not-a-dependency==1.2"]\n' },
    { path: 'services/go.mod', text: 'module example.test/app\nrequire (\n  github.com/jackc/pgx/v5 v5.7.1 // indirect\n)\n' },
    { path: 'Cargo.toml', text: '[workspace.dependencies]\nserde = "1.0.219"\n' },
    { path: 'crates/app/Cargo.toml', text: '[dependencies]\nserde = { workspace = true }\n' },
    { path: 'Cargo.lock', text: 'version = 4\n\n[[package]]\nname = "serde"\nversion = "1.0.219"\n' },
  ]);
  const networkx = records.find((item) => item.name === 'networkx');
  const serde = records.find((item) => item.name === 'serde');
  assert.equal(networkx.declaredVersion, '3.6.1');
  assert.deepEqual(networkx.lockedVersions, []);
  assert.equal(records.some((item) => item.name === 'not-a-dependency'), false);
  assert.equal(records.find((item) => item.name === 'github.com/jackc/pgx/v5').declaredVersion, 'v5.7.1');
  assert.equal(serde.declaredVersion, '1.0.219');
  assert.deepEqual(serde.lockedVersions, ['1.0.219']);
});

test('counts only actual OKF corpus records as indexed documentation coverage', () => {
  const files = [
    { path: 'docs/.okf/dev/raw/networkx/page.json', text: JSON.stringify({ schema_version: 'okf.dev.corpus.v1', source_id: 'networkx', url: 'https://networkx.org/documentation/stable/', content_hash: 'abc' }) },
    { path: 'docs/.okf/dev/planned.json', text: JSON.stringify({ source_id: 'networkx', url: 'https://networkx.org/documentation/stable/' }) },
  ];
  const fs = {
    readdirSync(directory) {
      const normalized = directory.replaceAll('\\', '/');
      if (normalized.endsWith('/docs/.okf/dev')) return [{ name: 'raw', isDirectory: () => true, isFile: () => false }, { name: 'planned.json', isDirectory: () => false, isFile: () => true }];
      if (normalized.endsWith('/docs/.okf/dev/raw')) return [{ name: 'networkx', isDirectory: () => true, isFile: () => false }];
      if (normalized.endsWith('/docs/.okf/dev/raw/networkx')) return [{ name: 'page.json', isDirectory: () => false, isFile: () => true }];
      return [];
    },
    readFileSync(file) { return files.find((item) => item.path.endsWith(file.split(/[\\/]/).slice(-3).join('/')) || item.path.endsWith(file.split(/[\\/]/).slice(-2).join('/')))?.text ?? files.find((item) => item.path.endsWith(file.split(/[\\/]/).pop()))?.text; },
  };
  const inventory = collectIndexedDocumentationRecords('C:/repo', fs);
  const report = buildDocumentationDemandV1({ catalog: { sources: [{ id: 'networkx', ecosystems: ['python'], packages: ['networkx'], urls: ['https://networkx.org/documentation/stable/'] }] }, inventory: { npm: { packages: [] } }, sourceFiles: [], indexedDocuments: inventory.records });
  assert.equal(inventory.records.length, 1);
  assert.equal(report.demands[0].indexedDocumentation.documentCount, 1);
  assert.equal(report.demands[0].indexedDocumentation.corpusRecordsAreNonCanonicalDocumentation, true);
});

test('ranks exact URL coverage gaps and ignores unrelated pages on a matching source host', () => {
  const report = buildDocumentationDemandV1({
    catalog: { sources: [
      { id: 'complete-source', priority: 'P1', ecosystems: [], packages: [], urls: ['https://docs-complete.example.test/one', 'https://docs-complete.example.test/two'] },
      { id: 'partial-source', priority: 'P1', ecosystems: [], packages: [], urls: ['https://docs-partial.example.test/one', 'https://docs-partial.example.test/two'] },
    ] },
    inventory: { npm: { packages: [] } },
    sourceFiles: [],
    indexedDocuments: [
      { sourceId: 'complete-source', host: 'docs-complete.example.test', url: 'https://docs-complete.example.test/one/', contentHash: 'sha256:one' },
      { sourceId: 'complete-source', host: 'docs-complete.example.test', url: 'https://docs-complete.example.test/two', contentHash: 'sha256:two' },
      { sourceId: 'partial-source', host: 'docs-partial.example.test', url: 'https://docs-partial.example.test/one', contentHash: 'sha256:one' },
      { sourceId: 'partial-source', host: 'docs-partial.example.test', url: 'https://docs-partial.example.test/unrelated', contentHash: 'sha256:other' },
    ],
  });
  const complete = report.demands.find((item) => item.sourceId === 'complete-source');
  const partial = report.demands.find((item) => item.sourceId === 'partial-source');
  assert.equal(report.rankingWeights.indexedDocumentationGap, 0.04);
  assert.equal(complete.indexedDocumentation.documentCount, 2);
  assert.equal(complete.indexedDocumentation.coverageRatio, 1);
  assert.equal(complete.fetchStatus, 'ALREADY_INDEXED');
  assert.equal(partial.indexedDocumentation.documentCount, 1);
  assert.equal(partial.indexedDocumentation.coverageRatio, 0.5);
  assert.equal(partial.fetchStatus, 'PLANNED_MISSING_URLS');
  assert.deepEqual(partial.indexedDocumentation.missingUrls, ['https://docs-partial.example.test/two']);
  assert.ok(partial.relevanceScore > complete.relevanceScore);
});

test('does not label demands without catalog URLs as fetchable', () => {
  const report = buildDocumentationDemandV1({
    catalog: { sources: [{ id: 'uncatalogued', priority: 'P2', ecosystems: [], packages: [], urls: [] }] },
    inventory: { npm: { packages: [] } },
    sourceFiles: [],
  });
  assert.equal(report.demands[0].fetchStatus, 'NO_CATALOG_URLS');
});

test('excludes Python virtual environments and installed packages from source and manifest evidence', () => {
  const root = 'C:/repo';
  const entries = new Map([
    [root, ['.venv-cu130', '.python311', 'python3.13', 'venv-atlas', 'src'].map((name) => ({ name, isDirectory: () => true, isFile: () => false }))],
    ...['.venv-cu130', '.python311', 'python3.13', 'venv-atlas'].map((name) => [`${root}/${name}`, [{ name: 'requirements.txt', isDirectory: () => false, isFile: () => true }, { name: 'installed.py', isDirectory: () => false, isFile: () => true }]]),
    [`${root}/src`, [
      { name: 'app.py', isDirectory: () => false, isFile: () => true },
      { name: 'site-packages', isDirectory: () => true, isFile: () => false },
    ]],
    [`${root}/src/site-packages`, [{ name: 'dependency.py', isDirectory: () => false, isFile: () => true }]],
  ]);
  const fs = {
    readdirSync(directory) {
      return entries.get(directory.replaceAll('\\', '/')) ?? [];
    },
    statSync() { return { size: 32 }; },
    readFileSync(file) { return Buffer.from(file.endsWith('app.py') ? 'import networkx' : 'installed dependency'); },
  };

  const sourceFiles = collectDocumentationSourceFiles(root, fs).files;
  const manifests = collectNonNpmManifestFiles(root, fs);
  assert.deepEqual(sourceFiles.map((file) => file.path), ['src/app.py']);
  assert.deepEqual(manifests, []);
});

test('excludes registered gitlink roots from first-party source and manifest evidence', () => {
  const root = 'C:/repo';
  const entries = new Map([
    [root, [
      { name: 'turbovec', isDirectory: () => true, isFile: () => false },
      { name: 'gsd_archives', isDirectory: () => true, isFile: () => false },
      { name: 'backup-2026-10-08', isDirectory: () => true, isFile: () => false },
      { name: 'scripts', isDirectory: () => true, isFile: () => false },
      { name: 'packages', isDirectory: () => true, isFile: () => false },
    ]],
    [`${root}/turbovec`, [
      { name: 'src', isDirectory: () => true, isFile: () => false },
      { name: 'Cargo.toml', isDirectory: () => false, isFile: () => true },
    ]],
    [`${root}/turbovec/src`, [{ name: 'lib.rs', isDirectory: () => false, isFile: () => true }]],
    [`${root}/gsd_archives`, [{ name: 'archived.ts', isDirectory: () => false, isFile: () => true }, { name: 'package.json', isDirectory: () => false, isFile: () => true }]],
    [`${root}/backup-2026-10-08`, [{ name: 'backup.py', isDirectory: () => false, isFile: () => true }, { name: 'requirements.txt', isDirectory: () => false, isFile: () => true }]],
    [`${root}/scripts`, [{ name: 'api-cleanup', isDirectory: () => true, isFile: () => false }]],
    [`${root}/scripts/api-cleanup`, [{ name: 'reports', isDirectory: () => true, isFile: () => false }]],
    [`${root}/scripts/api-cleanup/reports`, [{ name: 'backup-2025-12', isDirectory: () => true, isFile: () => false }]],
    [`${root}/scripts/api-cleanup/reports/backup-2025-12`, [{ name: 'snapshot.ts', isDirectory: () => false, isFile: () => true }]],
    [`${root}/packages`, [{ name: 'atlas.ts', isDirectory: () => false, isFile: () => true }]],
  ]);
  const fs = {
    readdirSync(directory) { return entries.get(directory.replaceAll('\\', '/')) ?? []; },
    statSync() { return { size: 24 }; },
    readFileSync(file) { return Buffer.from(file.endsWith('atlas.ts') ? 'import { x } from "zod";' : 'dependency code'); },
  };
  const options = { excludedRootDirs: ['turbovec'] };
  assert.deepEqual(collectDocumentationSourceFiles(root, fs, options).files.map((file) => file.path), ['packages/atlas.ts']);
  assert.deepEqual(collectNonNpmManifestFiles(root, fs, options), []);
});

test('excludes archive and timestamped backup trees from active source evidence', () => {
  const root = 'C:/repo';
  const entries = new Map([
    [root, ['src', 'gsd_archives', 'backup-2026-10-08'].map((name) => ({ name, isDirectory: () => true, isFile: () => false }))],
    [`${root}/src`, [{ name: 'main.ts', isDirectory: () => false, isFile: () => true }]],
    [`${root}/gsd_archives`, [{ name: 'old.ts', isDirectory: () => false, isFile: () => true }]],
    [`${root}/backup-2026-10-08`, [{ name: 'old.py', isDirectory: () => false, isFile: () => true }]],
  ]);
  const fs = {
    readdirSync(directory) { return entries.get(directory.replaceAll('\\', '/')) ?? []; },
    statSync() { return { size: 16 }; },
    readFileSync() { return Buffer.from(''); },
  };
  assert.deepEqual(collectDocumentationSourceFiles(root, fs).files.map((file) => file.path), ['src/main.ts']);
});
