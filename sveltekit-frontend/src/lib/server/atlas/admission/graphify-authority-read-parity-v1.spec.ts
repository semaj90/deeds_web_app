import { describe, it, expect } from 'vitest';
import { compareAuthorityReadParityV1, loadAuthorityReadParityV1 } from './graphify-authority-read-parity-v1';

const row = (rev: string, exec: string) => ({ workspace_id: 'w', workspace_revision: `sha256:${rev.repeat(64)}`, execution_id: exec });

describe('graphify authority read parity (shadow mode)', () => {
  it('proves parity only when every revision matches', () => {
    const r = compareAuthorityReadParityV1([row('a', 'e1')], [row('a', 'e1')]);
    expect(r.status).toBe('PARITY_PROVEN');
    expect(r.counts.MATCH).toBe(1);
  });
  it('pre-02B state (boolean row, empty authority table) is BOOLEAN_ONLY and not proven', () => {
    const r = compareAuthorityReadParityV1([row('a', 'e1')], []);
    expect(r.status).toBe('PARITY_NOT_PROVEN');
    expect(r.reasons).toContain('BOOLEAN_ONLY:1');
  });
  it('different executions for one revision is MISMATCH', () => {
    const r = compareAuthorityReadParityV1([row('a', 'e1')], [row('a', 'e2')]);
    expect(r.counts.MISMATCH).toBe(1);
    expect(r.status).toBe('PARITY_NOT_PROVEN');
  });
  it('authority without a boolean row and two booleans for one revision are flagged', () => {
    expect(compareAuthorityReadParityV1([], [row('a', 'e1')]).counts.AUTHORITY_ONLY).toBe(1);
    expect(compareAuthorityReadParityV1([row('a', 'e1'), row('a', 'e2')], []).counts.BOOLEAN_CONFLICT).toBe(1);
  });
  it('nothing at all is not proven (no vacuous pass)', () => {
    expect(compareAuthorityReadParityV1([], []).status).toBe('PARITY_NOT_PROVEN');
  });
  it('loader issues SELECTs only', async () => {
    const seen: string[] = [];
    await loadAuthorityReadParityV1({ query: async (sql) => { seen.push(sql); return { rows: [] }; } });
    expect(seen).toHaveLength(2);
    for (const sql of seen) expect(sql.trim().toUpperCase().startsWith('SELECT')).toBe(true);
  });
});
