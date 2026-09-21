import { describe, it, expect } from 'vitest';
import { applyGraphifyOwnerDecisionV1 } from '../../../scripts/atlas/lib/graphify-owner-decision-v1.mjs';

const CHOSEN = '74d50c86-8194-45ea-8c3d-61aab737ef83';
const WS = '11111111-1111-4111-8111-111111111111';
const REV = `sha256:${'a'.repeat(64)}`;

/** Recording fake pg client; `overrides` lets a test change what the readback SELECTs return. */
function fakeDb(opts: { status?: string; missing?: boolean; legacyAfter?: string[]; authorityAfter?: any[] } = {}) {
  const calls: { sql: string; params: unknown[] }[] = [];
  return {
    calls,
    async query(sql: string, params: unknown[] = []) {
      calls.push({ sql, params });
      if (/for update/.test(sql)) return { rows: opts.missing ? [] : [{ execution_id: CHOSEN, workspace_id: WS, workspace_revision: REV, status: opts.status ?? 'COMPLETED' }], rowCount: opts.missing ? 0 : 1 };
      if (/from public\.graphify_execution_authority where/.test(sql) && /select execution_id::text as execution_id, authority_state from/.test(sql)) return { rows: [], rowCount: 0 };
      if (/returning execution_id::text/.test(sql)) return { rows: [{ execution_id: CHOSEN }], rowCount: 1 };
      if (/canonical_authority is true$/.test(sql.trim()) || /and canonical_authority is true\s*$/.test(sql.trim())) return { rows: (opts.legacyAfter ?? [CHOSEN]).map((execution_id) => ({ execution_id })), rowCount: 1 };
      if (/selected_by, selection_receipt, imported_at, import_receipt/.test(sql)) {
        return { rows: opts.authorityAfter ?? [{ execution_id: CHOSEN, authority_state: 'SELECTED', selected_by: 'operator', selection_receipt: 'r-1', imported_at: null, import_receipt: null }], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    },
  };
}
const input = { chosenExecutionId: CHOSEN, selectedBy: 'operator', selectionReceipt: 'r-1' };

describe('graphify owner decision writes through the authority table', () => {
  it('refuses without real selection provenance and writes nothing', async () => {
    for (const bad of [{ ...input, selectedBy: '' }, { ...input, selectionReceipt: '  ' }, { ...input, selectedBy: undefined }]) {
      const db = fakeDb();
      await expect(applyGraphifyOwnerDecisionV1(db, bad as any)).rejects.toThrow(/SELECTION_PROVENANCE_REQUIRED/);
      expect(db.calls).toHaveLength(0);
    }
  });

  it('refuses a missing or unfinished execution before any write', async () => {
    const missing = fakeDb({ missing: true });
    await expect(applyGraphifyOwnerDecisionV1(missing, input)).rejects.toThrow(/EXECUTION_ID_NOT_FOUND/);
    const running = fakeDb({ status: 'RUNNING' });
    await expect(applyGraphifyOwnerDecisionV1(running, input)).rejects.toThrow(/EXECUTION_NOT_COMPLETED:RUNNING/);
    for (const db of [missing, running]) expect(db.calls.some((c) => /^\s*(update|insert)/i.test(c.sql.trim()))).toBe(false);
  });

  it('demotes others, upserts the authority row as SELECTED with provenance, then promotes the legacy field (in that order)', async () => {
    const db = fakeDb();
    const result = await applyGraphifyOwnerDecisionV1(db, input);
    const writes = db.calls.filter((c) => /^\s*(update|insert)/i.test(c.sql.trim()));
    expect(writes.map((c) => c.sql.trim().split(/\s+/).slice(0, 3).join(' '))).toEqual([
      'update public.graphify_executions set', 'insert into public.graphify_execution_authority', 'update public.graphify_executions set',
    ]);
    expect(writes[0].sql).toMatch(/canonical_authority = false/);
    expect(writes[1].sql).toMatch(/'SELECTED'/);
    expect(writes[1].params).toEqual([WS, REV, CHOSEN, 'operator', 'r-1']);
    expect(writes[2].sql).toMatch(/canonical_authority = true/);
    expect(result.authority[0].execution_id).toBe(CHOSEN);
  });

  it('never writes a NULL selected_by / selection_receipt for a SELECTED row', async () => {
    const db = fakeDb();
    await applyGraphifyOwnerDecisionV1(db, input);
    const insert = db.calls.find((c) => /insert into public\.graphify_execution_authority/.test(c.sql))!;
    expect(insert.params.slice(3).every((p) => typeof p === 'string' && p.length > 0)).toBe(true);
  });

  it('fails closed when the readback disagrees (two legacy canonicals, or authority points elsewhere)', async () => {
    await expect(applyGraphifyOwnerDecisionV1(fakeDb({ legacyAfter: [CHOSEN, 'other'] }), input)).rejects.toThrow(/OWNER_DECISION_READBACK_MISMATCH/);
    await expect(applyGraphifyOwnerDecisionV1(fakeDb({ authorityAfter: [{ execution_id: 'other', authority_state: 'SELECTED', selected_by: 'operator', selection_receipt: 'r-1', imported_at: null, import_receipt: null }] }), input)).rejects.toThrow(/OWNER_DECISION_READBACK_MISMATCH/);
  });
});
