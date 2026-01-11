import { describe, it, expect } from 'vitest';
import { unifiedDiffFromTexts } from '../unifiedDiff';

describe('DiffGenerator / unified diff properties', () => {
  it('produces deterministic output for same inputs', () => {
    const before = 'a\nb\nc\n';
    const after = 'a\nb\nC\n';
    const a = unifiedDiffFromTexts({
      filePath: 'x.ts',
      beforeText: before,
      afterText: after,
      contextLines: 3,
    });
    const b = unifiedDiffFromTexts({
      filePath: 'x.ts',
      beforeText: before,
      afterText: after,
      contextLines: 3,
    });
    expect(a.diffText).toBe(b.diffText);
    expect(a.beforeSha256).toBe(b.beforeSha256);
    expect(a.afterSha256).toBe(b.afterSha256);
  });

  it('includes correct header lines', () => {
    const r = unifiedDiffFromTexts({
      filePath: 'src/a.ts',
      beforeText: 'x\n',
      afterText: 'y\n',
      contextLines: 3,
    });
    expect(r.diffText).toContain('--- a/src/a.ts');
    expect(r.diffText).toContain('+++ b/src/a.ts');
  });

  it('no-change yields header-only diff (valid, deterministic)', () => {
    const r = unifiedDiffFromTexts({
      filePath: 'a.ts',
      beforeText: 'x\n',
      afterText: 'x\n',
      contextLines: 3,
    });
    expect(r.diffText).toContain('--- a/a.ts');
    expect(r.diffText).toContain('+++ b/a.ts');
  });
});
