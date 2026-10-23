import assert from 'node:assert/strict';
import test from 'node:test';
import { buildDirectoryFeatureMatrixV1 } from './directory-feature-matrix-v1.mjs';

const directoryRows = [
  { directoryPath: 'src', profileLanguageCountsJson: '{"typescript":3}', roleCountsJson: '{"WORKTREE_FILE":3}' },
  { directoryPath: '.', profileLanguageCountsJson: '{"typescript":3,"UNMAPPED":1}', roleCountsJson: '{"WORKTREE_FILE":3,"DEPENDENCY_TREE":1}' },
];
const packageRows = [
  { directoryPath: 'src', ecosystem: 'npm', packageName: 'zod', subtreeReferenceCount: 2 },
];

test('builds deterministic sparse ordinals and keeps evidence families distinct', () => {
  const first = buildDirectoryFeatureMatrixV1({ directories: directoryRows, packageRows });
  const second = buildDirectoryFeatureMatrixV1({ directories: [...directoryRows].reverse(), packageRows });
  assert.deepEqual(first, second);
  assert.deepEqual(first.directoryRows, [{ ordinal: 0, directoryPath: '.' }, { ordinal: 1, directoryPath: 'src' }]);
  assert.deepEqual(first.featureRows.map(row => [row.featureKey, row.evidenceKind]), [
    ['language-profile:UNMAPPED', 'PROFILE_INVENTORY_COUNT'],
    ['language-profile:typescript', 'PROFILE_INVENTORY_COUNT'],
    ['package:npm:zod', 'ADVISORY_IMPORT_REFERENCE_COUNT'],
    ['path-role:DEPENDENCY_TREE', 'PATH_INVENTORY_COUNT'],
    ['path-role:WORKTREE_FILE', 'PATH_INVENTORY_COUNT'],
  ]);
  assert.equal(first.sparseRows.length, 7);
  assert.ok(first.sparseRows.every(row => row.value > 0));
});

test('rejects duplicate directory ordinals and missing package directories', () => {
  assert.throws(() => buildDirectoryFeatureMatrixV1({ directories: [...directoryRows, directoryRows[0]], packageRows }), /DIRECTORY_ORDINAL_INPUT_INVALID/);
  assert.throws(() => buildDirectoryFeatureMatrixV1({ directories: directoryRows, packageRows: [{ ...packageRows[0], directoryPath: 'missing' }] }), /PACKAGE_DIRECTORY_NOT_IN_ROLLUP/);
});

test('rejects malformed profile counts and negative values', () => {
  assert.throws(() => buildDirectoryFeatureMatrixV1({
    directories: [{ ...directoryRows[0], profileLanguageCountsJson: '{bad' }, directoryRows[1]], packageRows: [],
  }), /DIRECTORY_COUNT_JSON_INVALID/);
  assert.throws(() => buildDirectoryFeatureMatrixV1({
    directories: [{ ...directoryRows[0], profileLanguageCountsJson: '{"typescript":-1}' }, directoryRows[1]], packageRows: [],
  }), /DIRECTORY_COUNT_VALUE_INVALID/);
});
