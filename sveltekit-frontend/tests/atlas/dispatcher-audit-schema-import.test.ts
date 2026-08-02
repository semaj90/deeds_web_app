// @vitest-environment node
/**
 * Regression guard for the bigserial('id') -> bigserial('id', { mode:
 * 'number' }) fix (2026-08-01). Drizzle throws
 * "Cannot read properties of undefined (reading 'mode')" at module-eval
 * time when bigserial() is called without its required mode config —
 * this module import is the whole test; if the fix regresses, this
 * import throws and the test fails.
 */

import { describe, expect, it } from 'vitest';

describe('dispatcher-audit-schema module import', () => {
  it('imports without throwing', async () => {
    await expect(
      import('$lib/server/dispatcher/dispatcher-audit-schema.js')
    ).resolves.toBeDefined();
  });
});
