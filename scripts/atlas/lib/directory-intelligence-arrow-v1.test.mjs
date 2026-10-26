import test from 'node:test';
import assert from 'node:assert/strict';
import { tableFromIPC } from 'apache-arrow';
import { buildDirectoryPathArrowV1 } from './directory-intelligence-arrow-v1.mjs';

const rows = [
  { relativePath: '.', entryKind: 'DIRECTORY', role: 'DIRECTORY', extension: null, sizeBytes: null,
    dotPath: false, editPolicy: 'INVENTORY_ONLY_NEVER_EDIT', indexingStatus: 'NOT_APPLICABLE',
    mappedLanguageId: null, parserEligibility: 'NOT_PARSER_INPUT', graphifyMembership: 'NOT_APPLICABLE' },
  { relativePath: '$$$BODY', entryKind: 'FILE', role: 'REPOSITORY_METADATA', extension: null, sizeBytes: 5,
    dotPath: false, editPolicy: 'INVENTORY_ONLY_NEVER_EDIT', indexingStatus: 'NOT_IN_GIT_SOURCE_SCOPE',
    mappedLanguageId: null, parserEligibility: 'AUDIT_ONLY', graphifyMembership: 'NOT_LISTED_IN_UNQUALIFIED_SNAPSHOT' },
  { relativePath: '.git/config', entryKind: 'FILE', role: 'REPOSITORY_METADATA', extension: null, sizeBytes: 10,
    dotPath: true, editPolicy: 'INVENTORY_ONLY_NEVER_EDIT', indexingStatus: 'NOT_IN_GIT_SOURCE_SCOPE',
    mappedLanguageId: null, parserEligibility: 'AUDIT_ONLY', graphifyMembership: 'NOT_LISTED_IN_UNQUALIFIED_SNAPSHOT' },
  { relativePath: 'src/main.ts', entryKind: 'FILE', role: 'WORKTREE_FILE', extension: '.ts', sizeBytes: 20,
    dotPath: false, editPolicy: 'INVENTORY_ONLY_NEVER_EDIT', indexingStatus: 'IN_GIT_SOURCE_SCOPE',
    mappedLanguageId: 'typescript', parserEligibility: 'PROFILE_CANDIDATE', graphifyMembership: 'SNAPSHOT_MEMBER_UNQUALIFIED' },
];

async function* iterable(items) { for (const item of items) yield item; }

test('Arrow path snapshot is deterministic and round-trips all audit fields', async () => {
  const one = await buildDirectoryPathArrowV1(iterable(rows));
  const replay = await buildDirectoryPathArrowV1(iterable(rows));
  assert.deepEqual(Buffer.from(one.bytes), Buffer.from(replay.bytes));
  const table = tableFromIPC(one.bytes);
  assert.equal(table.numRows, rows.length);
  assert.deepEqual(Array.from({ length: rows.length }, (_, index) => table.getChild('relativePath').get(index)), rows.map(row => row.relativePath));
  assert.equal(table.getChild('dotPath').get(2), true);
  assert.equal(table.getChild('extensionPresent').get(2), false);
  assert.equal(table.getChild('sizeBytes').get(3), '20');
  assert.equal(table.getChild('graphifyMembership').get(3), 'SNAPSHOT_MEMBER_UNQUALIFIED');
});

test('Arrow path snapshot enforces a maximum row bound', async () => {
  await assert.rejects(buildDirectoryPathArrowV1(iterable(rows), { maxRows: 2 }), /ROW_LIMIT/);
});
