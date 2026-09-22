import { describe, it, expect } from 'vitest';
import { qualifySymbolRevisionsV1, assertQualifiedSymbolRevisionsV1, SymbolRevisionRejectedError } from './symbol-revision-qualification-v1';

const Q = 'sha256:' + 'a'.repeat(64);

describe('SymbolRevisionQualificationV1', () => {
  it('accepts sha256-qualified revisions', () => {
    expect(qualifySymbolRevisionsV1('atlas_symbol_versions', [{ field: 'source_revision', value: Q }, { field: 'workspace_revision', value: Q }]).ok).toBe(true);
  });
  it('rejects workspace:N placeholders without conversion', () => {
    const v = qualifySymbolRevisionsV1('atlas_symbol_versions', [{ field: 'workspace_revision', value: 'workspace:0' }]);
    expect(v.ok).toBe(false);
    expect(v.violations[0]).toMatchObject({ shape: 'PLACEHOLDER', code: 'WORKSPACE_REVISION_PLACEHOLDER' });
  });
  it('rejects a 40-hex Git commit id and does not accept prefixing', () => {
    const oid = '1bb240fb20f1d4ba5651d8a4da9a10c9d6337aaf';
    expect(qualifySymbolRevisionsV1('atlas_symbol_versions', [{ field: 'source_revision', value: oid }]).violations[0].shape).toBe('SHORT_OID');
    expect(qualifySymbolRevisionsV1('atlas_symbol_versions', [{ field: 'source_revision', value: `sha256:${oid}` }]).ok).toBe(false);
  });
  it('rejects missing, empty, and uppercase-hex values', () => {
    for (const value of [null, undefined, '', 'sha256:' + 'A'.repeat(64)]) {
      expect(qualifySymbolRevisionsV1('atlas_symbol_registry', [{ field: 'created_from_source_revision', value }]).ok).toBe(false);
    }
  });
  it('assert throws a typed error listing every violation', () => {
    try {
      assertQualifiedSymbolRevisionsV1('atlas_symbol_versions', [{ field: 'source_revision', value: 'x' }, { field: 'workspace_revision', value: null }]);
      throw new Error('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(SymbolRevisionRejectedError);
      expect((e as SymbolRevisionRejectedError).verdict.violations).toHaveLength(2);
    }
  });
});
