import { describe, expect, it } from 'vitest';
import { buildSymbolRepairFunctionCatalogV0 } from './kernel-function-catalog-symbol-repair-v0.js';
import { findAtlasKernelFunctionV1 } from './kernel-function-catalog-v1.js';
import { buildSymbolRepairOperatorLibraryV0 } from './kernel-operator-library-symbol-repair-v0.js';

describe('buildSymbolRepairFunctionCatalogV0', () => {
  it('composes 3 real functions over the 15-operator library, sealed under one catalog checksum', () => {
    const catalog = buildSymbolRepairFunctionCatalogV0();
    expect(catalog.functions).toHaveLength(3);
    expect(catalog.taskClass).toBe('symbol_change_impact_analysis');
    expect(catalog.functions.every((fn) => fn.canonicalAuthority === false)).toBe(true);
    expect(catalog.functions.every((fn) => fn.mutationPolicy === 'READ_ONLY')).toBe(true);
  });

  it('every function is retrievable by id via the catalog helper', () => {
    const catalog = buildSymbolRepairFunctionCatalogV0();
    const fn = findAtlasKernelFunctionV1(catalog, 'fn:find_evidence_for_failed_typecheck');
    expect(fn).toBeDefined();
    expect(fn?.operatorGraph).toHaveLength(5);
  });

  it('is deterministic: same operator library produces the same catalogChecksum across builds', () => {
    const library = buildSymbolRepairOperatorLibraryV0();
    const a = buildSymbolRepairFunctionCatalogV0(library);
    const b = buildSymbolRepairFunctionCatalogV0(library);
    expect(a.catalogChecksum).toBe(b.catalogChecksum);
  });

  it('would refuse a function referencing an operator outside the library (regression guard)', () => {
    // Sanity check that the underlying builder chain still enforces the
    // bounded-operator guarantee even after routing through the catalog
    // wrapper — not just re-testing kernel-function-v1.ts in isolation.
    const library = buildSymbolRepairOperatorLibraryV0();
    expect(() => buildSymbolRepairFunctionCatalogV0({
      ...library,
      operators: library.operators.filter((op) => op.operatorId !== 'op:get_callers'),
    })).toThrow(/KERNEL_FUNCTION_UNDECLARED_OPERATOR:op:get_callers/);
  });
});
