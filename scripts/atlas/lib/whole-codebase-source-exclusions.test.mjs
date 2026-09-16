import test from 'node:test';
import assert from 'node:assert/strict';

import {
  WHOLE_CODEBASE_EXCLUDE_GLOBS,
  buildRipgrepExcludeArgs,
  exclusionPolicyChecksum,
  proveRequiredRecurrenceExclusions,
} from './whole-codebase-source-exclusions.mjs';

test('exclusion policy covers known recurrence classes', () => {
  const proof = proveRequiredRecurrenceExclusions();
  assert.equal(proof.pass, true);
  assert.ok(Object.values(proof.classChecks).every(Boolean));
});

test('live-service and repair-backup trees are explicit exclusions', () => {
  assert.ok(WHOLE_CODEBASE_EXCLUDE_GLOBS.includes('**/qdrant-windows/**'));
  assert.ok(WHOLE_CODEBASE_EXCLUDE_GLOBS.includes('**/.svelte-error-fixes-backup/**'));

  const args = buildRipgrepExcludeArgs();
  assert.match(args, /--glob=!\*\*\/qdrant-windows\/\*\*/);
  assert.match(args, /--glob=!\*\*\/\.svelte-error-fixes-backup\/\*\*/);
});

test('policy checksum is deterministic and revision-addressed', () => {
  const first = exclusionPolicyChecksum();
  const second = exclusionPolicyChecksum();
  assert.equal(first, second);
  assert.match(first, /^sha256:[0-9a-f]{64}$/);
});
