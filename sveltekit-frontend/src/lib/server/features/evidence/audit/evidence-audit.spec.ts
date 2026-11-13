// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({ inserted: [] as Record<string, unknown>[], warn: vi.fn() }));

vi.mock('$lib/server/db/client', () => {
  const selectChain = (rows: unknown[]) => ({ from: () => ({ where: () => Object.assign(Promise.resolve(rows), { limit: async () => rows }) }) });
  let call = 0;
  return {
    db: {
      select: () => selectChain(call++ % 2 === 0 ? [{ title: 'T', description: 'D', metadata: { a: 1 } }] : [{ maxVersion: 0 }]),
      insert: () => ({ values: async (v: Record<string, unknown>) => { h.inserted.push(v); } }),
    },
  };
});
vi.mock('$lib/server/db/schema-postgres.js', () => ({
  evidenceAuditLog: {}, evidenceVersions: { version: 'v', evidenceId: 'e' }, evidence: { title: 't', description: 'd', metadata: 'm', id: 'i' },
}));
vi.mock('drizzle-orm', () => ({ eq: vi.fn(), desc: vi.fn(), sql: Object.assign(vi.fn(), { raw: vi.fn() }) }));

import { createEvidenceVersion } from './evidence-audit.js';

describe('createEvidenceVersion changed_by (uuid column, integer user ids)', () => {
  beforeEach(() => { h.inserted.length = 0; vi.spyOn(console, 'warn').mockImplementation(h.warn); h.warn.mockClear(); });

  it('stores NULL for an integer-style user id instead of failing the insert', async () => {
    await createEvidenceVersion('22222222-2222-4222-8222-222222222222', { changedBy: '1', changeReason: 'r' });
    expect(h.inserted).toHaveLength(1);
    expect(h.inserted[0]).toMatchObject({ version: 1, changedBy: null, changeReason: 'r', title: 'T' });
  });

  it('keeps a real uuid', async () => {
    const id = '33333333-3333-4333-8333-333333333333';
    await createEvidenceVersion('22222222-2222-4222-8222-222222222222', { changedBy: id });
    expect(h.inserted[0]).toMatchObject({ changedBy: id });
  });

  it('stores NULL when no user is given', async () => {
    await createEvidenceVersion('22222222-2222-4222-8222-222222222222');
    expect(h.inserted[0]).toMatchObject({ changedBy: null });
  });
});
