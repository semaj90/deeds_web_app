import { describe, expect, it } from 'vitest';
import { deriveCodeSourceRevisionV1 } from './code-source-revision-v1.js';

describe('code source revision v1', () => {
  it('is deterministic for identical UTF-8 source bytes', () => {
    const first = deriveCodeSourceRevisionV1('export const foo = 1;');
    const second = deriveCodeSourceRevisionV1('export const foo = 1;');
    expect(second).toEqual(first);
    expect(first.sourceRevision).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  it('changes when source content changes, including line shifts', () => {
    const original = deriveCodeSourceRevisionV1('export const foo = 1;');
    const shifted = deriveCodeSourceRevisionV1('\nexport const foo = 1;');
    expect(shifted.sourceRevision).not.toBe(original.sourceRevision);
    expect(shifted.byteLength).toBeGreaterThan(original.byteLength);
  });

  it('rejects empty source instead of producing the empty SHA sentinel', () => {
    expect(() => deriveCodeSourceRevisionV1('')).toThrow(/non-empty/);
  });
});
