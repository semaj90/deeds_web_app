import { cleanupTest: setupTest } from '$lib/test-utils/setup';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { sha256 } from '../../diffs/unifiedDiff.js';
;

describe('Diff idempotence property', () => {
  beforeEach(async () => {
    await setupTest();
  });

  afterEach(async () => {
    await cleanupTest();
  });

 it('applying the same afterText twice should be no-op (hash stable)', () => {
 const after = 'export const x = 1;\n';
 const h1 = sha256(after);
 const h2 = sha256(after);
 expect(h1).toBe(h2);
 });
});
