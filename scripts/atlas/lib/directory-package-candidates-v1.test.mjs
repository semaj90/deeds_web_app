import assert from 'node:assert/strict';
import test from 'node:test';
import { aggregateDirectoryPackageCandidatesV1 } from './directory-package-candidates-v1.mjs';

const directories = [
  { directoryPath: '.', profileLanguageCountsJson: '{"typescript":2}' },
  { directoryPath: 'src', profileLanguageCountsJson: '{"typescript":2}' },
  { directoryPath: 'src/lib', profileLanguageCountsJson: '{"typescript":2}' },
];

test('rolls references to ancestors and counts files separately from references', () => {
  const references = [
    { sourcePath: 'src/lib/a.ts', ecosystem: 'npm', packageName: 'zod', installedVersionStatus: 'UNIQUE_IN_INVENTORY', installedVersion: '4.0.0' },
    { sourcePath: 'src/lib/a.ts', ecosystem: 'npm', packageName: 'zod', installedVersionStatus: 'UNIQUE_IN_INVENTORY', installedVersion: '4.0.0' },
    { sourcePath: 'src/lib/b.ts', ecosystem: 'npm', packageName: 'zod', installedVersionStatus: 'MISSING_OR_AMBIGUOUS', installedVersion: '' },
  ];
  const { rows, rejected } = aggregateDirectoryPackageCandidatesV1({ references, directories });
  assert.deepEqual(rejected, []);
  assert.deepEqual(rows.map(row => [row.directoryPath, row.directReferenceCount, row.subtreeReferenceCount, row.directFileCount, row.subtreeFileCount]), [
    ['.', 0, 3, 0, 2], ['src', 0, 3, 0, 2], ['src/lib', 3, 3, 2, 2],
  ]);
  assert.equal(rows[0].versionQualifiedReferenceCount, 2);
  assert.equal(rows[0].versionUnqualifiedReferenceCount, 1);
});

test('rejects source paths outside the frozen hierarchy', () => {
  const result = aggregateDirectoryPackageCandidatesV1({
    references: [{ sourcePath: 'missing/file.ts', ecosystem: 'npm', packageName: 'zod' }],
    directories,
  });
  assert.deepEqual(result.rows, []);
  assert.deepEqual(result.rejected, [{ sourcePath: 'missing/file.ts', reason: 'SOURCE_DIRECTORY_NOT_IN_HIERARCHY' }]);
});

test('ordering and version summaries are deterministic', () => {
  const items = [
    { sourcePath: 'src/lib/z.ts', ecosystem: 'pypi', packageName: 'numpy', installedVersionStatus: 'UNIQUE_IN_INVENTORY', installedVersion: '2.0' },
    { sourcePath: 'src/lib/a.ts', ecosystem: 'npm', packageName: 'zod', installedVersionStatus: 'UNIQUE_IN_INVENTORY', installedVersion: '4.0' },
  ];
  const first = aggregateDirectoryPackageCandidatesV1({ references: items, directories });
  const second = aggregateDirectoryPackageCandidatesV1({ references: [...items].reverse(), directories });
  assert.deepEqual(first, second);
});
