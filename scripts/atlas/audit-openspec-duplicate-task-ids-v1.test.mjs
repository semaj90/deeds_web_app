import test from 'node:test';
import assert from 'node:assert/strict';
import { groupOpenDuplicateDeclaredIdsV1 } from './audit-openspec-duplicate-task-ids-v1.mjs';

test('reports open ambiguous IDs per change and retains completed duplicate context', () => {
  const groups = groupOpenDuplicateDeclaredIdsV1([
    { change: 'change-a', ledgerId: 'TASK-01', state: 'OPEN', taskIdentity: { basis: 'AMBIGUOUS_DECLARED_ID' }, source: 'a/tasks.md', line: 4, text: 'open row' },
    { change: 'change-a', ledgerId: 'TASK-01', state: 'DONE', taskIdentity: { basis: 'AMBIGUOUS_DECLARED_ID' }, source: 'a/tasks.md', line: 9, text: 'done duplicate' },
    { change: 'change-b', ledgerId: 'TASK-01', state: 'OPEN', taskIdentity: { basis: 'DECLARED_ID' }, source: 'b/tasks.md', line: 2, text: 'same id in another change is scoped' },
    { change: 'change-a', ledgerId: 'TASK-02', state: 'OPEN', taskIdentity: { basis: 'DECLARED_ID' }, source: 'a/tasks.md', line: 12, text: 'unique' },
  ]);

  assert.equal(groups.length, 1);
  assert.equal(groups[0].change, 'change-a');
  assert.equal(groups[0].id, 'TASK-01');
  assert.equal(groups[0].openAmbiguousOccurrences, 1);
  assert.deepEqual(groups[0].occurrences.map((item) => item.state), ['OPEN', 'DONE']);
});

test('does not report section-qualified or otherwise unique IDs as unresolved duplicates', () => {
  const groups = groupOpenDuplicateDeclaredIdsV1([
    { change: 'change-a', ledgerId: 'TASK-03', state: 'OPEN', taskIdentity: { basis: 'DECLARED_ID_SECTION_QUALIFIED' } },
    { change: 'change-a', ledgerId: 'TASK-03', state: 'OPEN', taskIdentity: { basis: 'DECLARED_ID_SECTION_QUALIFIED' } },
  ]);
  assert.deepEqual(groups, []);
});
