import { describe, it, expect } from 'vitest';
import { loadAuthorityShadowV1, observeAuthorityShadowV1 } from './graphify-authority-shadow-read-v1';

const W = '11111111-1111-4111-8111-111111111111';
const R = `sha256:${'a'.repeat(64)}`;
const scope = { workspaceId: W, workspaceRevision: R };
const row = (exec: string, extra: Record<string, string> = {}) => ({ workspace_id: W, workspace_revision: R, execution_id: exec, ...extra });

describe('graphify authority shadow observation', () => {
  it('legacy X + authority X -> PARITY_PROVEN, runtimeSelection X', () => {
    const o = observeAuthorityShadowV1([row('X')], [row('X', { authority_state: 'LEGACY_IMPORTED' })], scope);
    expect(o).toMatchObject({ parityStatus: 'PARITY_PROVEN', readParityProven: true, runtimeSelection: 'X', authorityExecutionId: 'X', authorityState: 'LEGACY_IMPORTED' });
  });
  it('legacy X + authority missing -> not proven, runtimeSelection still X', () => {
    const o = observeAuthorityShadowV1([row('X')], [], scope);
    expect(o).toMatchObject({ parityStatus: 'LEGACY_PRESENT_AUTHORITY_MISSING', readParityProven: false, runtimeSelection: 'X', authorityExecutionId: null });
  });
  it('legacy X + authority Y -> SELECTION_MISMATCH, runtimeSelection still X (never Y)', () => {
    const o = observeAuthorityShadowV1([row('X')], [row('Y')], scope);
    expect(o).toMatchObject({ parityStatus: 'SELECTION_MISMATCH', runtimeSelection: 'X', authorityExecutionId: 'Y' });
  });
  it('legacy missing + authority X -> AUTHORITY_PRESENT_LEGACY_MISSING, runtime selection stays absent', () => {
    const o = observeAuthorityShadowV1([], [row('X')], scope);
    expect(o).toMatchObject({ parityStatus: 'AUTHORITY_PRESENT_LEGACY_MISSING', runtimeSelection: null, legacyExecutionId: null });
  });
  it('multiple authority rows fail closed and pick none', () => {
    const o = observeAuthorityShadowV1([row('X')], [row('X'), row('Y')], scope);
    expect(o).toMatchObject({ parityStatus: 'MULTIPLE_AUTHORITY_ROWS', readParityProven: false, authorityExecutionId: null, runtimeSelection: 'X' });
  });
  it('multiple legacy rows fail closed and pick none (runtime selection absent)', () => {
    const o = observeAuthorityShadowV1([row('X'), row('Y')], [], scope);
    expect(o).toMatchObject({ parityStatus: 'MULTIPLE_LEGACY_CANONICAL_ROWS', legacyExecutionId: null, runtimeSelection: null });
  });
  it('nothing in scope -> NO_SELECTION; rows from other revisions are ignored', () => {
    const other = { workspace_id: W, workspace_revision: `sha256:${'b'.repeat(64)}`, execution_id: 'Z' };
    expect(observeAuthorityShadowV1([other], [other], scope).parityStatus).toBe('NO_SELECTION');
  });
  it('every observation keeps the legacy owner and forbids mutation', () => {
    for (const o of [observeAuthorityShadowV1([row('X')], [row('X')], scope), observeAuthorityShadowV1([], [], scope)]) {
      expect(o.runtimeOwner).toBe('LEGACY_CANONICAL_AUTHORITY');
      expect(o.mutationAuthorized).toBe(false);
      expect(o.shadowAuthorityObserved).toBe(true);
    }
  });
  it('loader issues two scoped SELECTs only', async () => {
    const seen: string[] = [];
    await loadAuthorityShadowV1({ query: async (sql) => { seen.push(sql); return { rows: [] }; } }, scope);
    expect(seen).toHaveLength(2);
    for (const sql of seen) expect(sql.trim().toUpperCase().startsWith('SELECT')).toBe(true);
  });
});
