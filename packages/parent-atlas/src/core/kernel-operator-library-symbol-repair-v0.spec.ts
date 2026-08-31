import { describe, expect, it } from 'vitest';
import { buildSymbolRepairOperatorLibraryV0 } from './kernel-operator-library-symbol-repair-v0.js';
import { KERNEL_OPERATOR_KIND_VALUES } from './kernel-operator-library-v1.js';

describe('buildSymbolRepairOperatorLibraryV0', () => {
  it('populates exactly 18 of the 24 operator kinds, each marked verifiedLive', () => {
    const library = buildSymbolRepairOperatorLibraryV0();
    expect(library.operators).toHaveLength(18);
    expect(library.operators.every((op) => op.verifiedLive)).toBe(true);
    expect(library.operators.every((op) => op.canonicalAuthority === false)).toBe(true);
  });

  it('every populated kind is a real value from the frozen 24-kind vocabulary', () => {
    const library = buildSymbolRepairOperatorLibraryV0();
    for (const op of library.operators) {
      expect(KERNEL_OPERATOR_KIND_VALUES).toContain(op.kind);
    }
  });

  it('has no duplicate operator ids or kinds', () => {
    const library = buildSymbolRepairOperatorLibraryV0();
    const ids = library.operators.map((op) => op.operatorId);
    const kinds = library.operators.map((op) => op.kind);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(kinds).size).toBe(kinds.length);
  });
});
