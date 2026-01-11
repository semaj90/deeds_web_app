import { cleanupTest, setupTest } from '$lib/test-utils/setup';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
;

describe('DiffApplier', () => {
  beforeEach(async () => {
    await setupTest();
  });

  afterEach(async () => {
    await cleanupTest();
  });

 it('TODO: add file-system harness test (temp dir) verifying hash mismatch blocks apply', () => {
 expect(true).toBe(true);
 });
});
