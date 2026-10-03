import { describe, expect, it } from 'vitest';
import { aceStreamRequestV1Schema } from './ace-stream-request-v1.js';

describe('AceStreamRequestV1', () => {
  it('accepts the query-only client contract', () => {
    expect(aceStreamRequestV1Schema.parse({ query: 'find the auth route' }))
      .toEqual({ query: 'find the auth route' });
  });

  it('rejects client-supplied ACE/BitFrost cache identity', () => {
    expect(aceStreamRequestV1Schema.safeParse({
      query: 'find the auth route',
      aceCacheIdentity: {
        cacheKind: 'ACE_PACKET',
        requestHash: 'ace:packet:forged',
        workspaceRevision: `sha256:${'a'.repeat(64)}`,
      },
    }).success).toBe(false);
  });
});
