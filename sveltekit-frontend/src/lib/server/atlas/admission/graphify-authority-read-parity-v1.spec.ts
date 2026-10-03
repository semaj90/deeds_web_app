import { describe, it, expect } from 'vitest';
import { compareAuthorityReadParityV1, loadAuthorityReadParityV1 } from './graphify-authority-read-parity-v1';

const row = (rev: string, exec: string) => ({ workspace_id: 'w', workspace_revision: `sha256:${rev.repeat(64)}`, execution_id: exec });

describe('graphify authority read parity (shadow mode)', () => {
  it('0 legacy + 0 authority -> NO_SELECTION (no vacuous pass)', () => {
    const r = compareAuthorityReadParityV1([], []);
    expect(r.status).toBe('NO_SELECTION');
    expect(r.readParityProven).toBe(false);
  });
  it('1 legacy + 0 authority -> LEGACY_PRESENT_AUTHORITY_MISSING (pre-02B baseline)', () => {
    const r = compareAuthorityReadParityV1([row('a', 'e1')], []);
    expect(r.status).toBe('LEGACY_PRESENT_AUTHORITY_MISSING');
    expect(r.readParityProven).toBe(false);
    expect(r.revisions[0]).toMatchObject({ legacyExecutionIds: ['e1'], authorityExecutionIds: [] });
  });
  it('0 legacy + 1 authority -> AUTHORITY_PRESENT_LEGACY_MISSING', () => {
    expect(compareAuthorityReadParityV1([], [row('a', 'e1')]).status).toBe('AUTHORITY_PRESENT_LEGACY_MISSING');
  });
  it('1 legacy + same authority -> PARITY_PROVEN', () => {
    const r = compareAuthorityReadParityV1([row('a', 'e1')], [row('a', 'e1')]);
    expect(r.status).toBe('PARITY_PROVEN');
    expect(r.readParityProven).toBe(true);
  });
  it('1 legacy + different authority -> SELECTION_MISMATCH', () => {
    expect(compareAuthorityReadParityV1([row('a', 'e1')], [row('a', 'e2')]).status).toBe('SELECTION_MISMATCH');
  });
  it('>1 legacy -> MULTIPLE_LEGACY_CANONICAL_ROWS', () => {
    expect(compareAuthorityReadParityV1([row('a', 'e1'), row('a', 'e2')], []).status).toBe('MULTIPLE_LEGACY_CANONICAL_ROWS');
  });
  it('>1 authority -> MULTIPLE_AUTHORITY_ROWS (not collapsed by a Map)', () => {
    const r = compareAuthorityReadParityV1([row('a', 'e1')], [row('a', 'e1'), row('a', 'e2')]);
    expect(r.status).toBe('MULTIPLE_AUTHORITY_ROWS');
    expect(r.revisions[0].authorityExecutionIds).toEqual(['e1', 'e2']);
    expect(r.readParityProven).toBe(false);
  });
  it('one bad revision blocks overall parity even when another matches', () => {
    const r = compareAuthorityReadParityV1([row('a', 'e1'), row('b', 'e3')], [row('a', 'e1')]);
    expect(r.counts.PARITY_PROVEN).toBe(1);
    expect(r.status).toBe('LEGACY_PRESENT_AUTHORITY_MISSING');
  });
  it('never synthesizes a missing authority row from the legacy boolean', () => {
    const r = compareAuthorityReadParityV1([row('a', 'e1')], []);
    expect(r.revisions[0].authorityExecutionIds).toEqual([]);
    expect(r.counts.PARITY_PROVEN).toBe(0);
  });
  it('runtime owner stays legacy and mutation is never authorized', () => {
    for (const r of [compareAuthorityReadParityV1([], []), compareAuthorityReadParityV1([row('a', 'e1')], [row('a', 'e1')])]) {
      expect(r.runtimeOwner).toBe('LEGACY_CANONICAL_AUTHORITY');
      expect(r.mutationAuthorized).toBe(false);
      expect(r.writesPerformed).toBe(false);
    }
  });
  it('loader issues SELECTs only', async () => {
    const seen: string[] = [];
    await loadAuthorityReadParityV1({ query: async (sql) => { seen.push(sql); return { rows: [] }; } });
    expect(seen).toHaveLength(2);
    for (const sql of seen) expect(sql.trim().toUpperCase().startsWith('SELECT')).toBe(true);
  });
});
