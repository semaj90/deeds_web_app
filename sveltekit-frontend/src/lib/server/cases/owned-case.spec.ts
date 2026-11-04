import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  select: vi.fn(),
  from: vi.fn(),
  where: vi.fn(),
  limit: vi.fn(),
}));

vi.mock('$lib/server/db/client.js', () => ({
  db: { select: mocks.select },
}));

import { requireOwnedCaseId, scopedChatCaseId } from './owned-case.js';

const CASE_ID = '12345678-1234-1234-1234-123456789abc';

describe('case owner gate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.select.mockReturnValue({ from: mocks.from });
    mocks.from.mockReturnValue({ where: mocks.where });
    mocks.where.mockReturnValue({ limit: mocks.limit });
  });

  it('parses board and case history IDs without rewriting the client namespace', () => {
    expect(scopedChatCaseId(`board-${CASE_ID}`)).toBe(CASE_ID);
    expect(scopedChatCaseId(`case-${CASE_ID}`)).toBe(CASE_ID);
    expect(scopedChatCaseId(`session-${CASE_ID}`)).toBeNull();
    expect(scopedChatCaseId('board-invalid')).toBeNull();
  });

  it('rejects malformed cases and invalid users before any database read', async () => {
    expect(await requireOwnedCaseId('not-a-uuid', 5)).toBeNull();
    expect(await requireOwnedCaseId(CASE_ID, 0)).toBeNull();
    expect(await requireOwnedCaseId(CASE_ID, Number.NaN)).toBeNull();
    expect(mocks.select).not.toHaveBeenCalled();
  });

  it('rejects an existing case that is not owned by this user', async () => {
    mocks.limit.mockResolvedValue([]);
    expect(await requireOwnedCaseId(CASE_ID, 22)).toBeNull();
    expect(mocks.where).toHaveBeenCalledOnce();
  });

  it('returns the case ID only when owner-qualified lookup succeeds', async () => {
    mocks.limit.mockResolvedValue([{ id: CASE_ID }]);
    expect(await requireOwnedCaseId(CASE_ID, 22)).toBe(CASE_ID);
    expect(mocks.where).toHaveBeenCalledOnce();
  });
});
