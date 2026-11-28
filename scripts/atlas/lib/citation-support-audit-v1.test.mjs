import test from 'node:test';
import assert from 'node:assert/strict';
import { auditCitedIdentifiers } from './citation-support-audit-v1.mjs';

test('flags a named authorization helper absent from the cited route window', () => {
  const sources = [
    { evidenceId: 'R1', content: 'const row = await getAuthorizedCase(caseId, userId);' },
    { evidenceId: 'R2', content: 'caseId = await resolveEvidenceCaseId(requestedCaseId, uploaderIntId);' },
  ];

  assert.deepEqual(
    auditCitedIdentifiers('The route calls `getAuthorizedCase` [R2].', sources),
    [{ identifier: 'getAuthorizedCase', citedIds: ['R2'] }],
  );
});

test('accepts a named helper when its cited excerpt contains it', () => {
  const sources = [{ evidenceId: 'R1', content: 'const row = await getAuthorizedCase(caseId, userId);' }];

  assert.deepEqual(auditCitedIdentifiers('The route calls `getAuthorizedCase` [R1].', sources), []);
});

test('does not interpret ordinary inline words as code identifiers', () => {
  assert.deepEqual(auditCitedIdentifiers('Review the `route` [E1].', [{ evidenceId: 'E1', content: 'route handler' }]), []);
});
