import { describe, expect, it } from 'vitest';
import { parseGdsRequest, requiresGdsApply } from './gds-request-policy.js';

describe('GDS request policy', () => {
  it('defaults to read-only d27 without apply', () => {
    const parsed = parseGdsRequest({});

    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data).toEqual({ action: 'd27', apply: false });
    expect(requiresGdsApply('d27')).toBe(false);
  });

  it('rejects unknown actions', () => {
    expect(parseGdsRequest({ action: 'drop-everything' }).success).toBe(false);
  });

  it('requires apply for mutation-capable actions', () => {
    expect(requiresGdsApply('pagerank')).toBe(true);
    expect(parseGdsRequest({ action: 'pagerank' }).success).toBe(true);
  });

  it('rejects undeclared request fields', () => {
    expect(parseGdsRequest({ action: 'd27', unsafeWriteTarget: 'qdrant' }).success).toBe(false);
  });

  it('rejects an explicit null body instead of treating it as omitted', () => {
    expect(parseGdsRequest(null).success).toBe(false);
  });
});
