import { beforeEach, describe, expect, it, vi } from 'vitest';

const dbMocks = vi.hoisted(() => ({
  select: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
  execute: vi.fn(),
}));

vi.mock('$lib/server/db/client', () => ({
  db: dbMocks,
  pgRows: (value: unknown) => (Array.isArray(value) ? value : []),
}));

import { upsertEmbedding } from './drizzle-stub.js';
import { db } from '$lib/server/db/client';

describe('evidence embedding persistence admission', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects legacy metadata before any database write', async () => {
    const vector = Array.from({ length: 768 }, (_, index) => Math.sin(index * 0.13));

    await expect(upsertEmbedding(
      '11111111-1111-4111-8111-111111111111',
      vector,
      { model: 'embeddinggemma:latest' },
    )).rejects.toThrow('EVIDENCE_EMBEDDING_NOT_ADMITTED:SOURCE_REVISION_MISSING_OR_INVALID');

    expect(db.select).not.toHaveBeenCalled();
    expect(db.insert).not.toHaveBeenCalled();
    expect(db.update).not.toHaveBeenCalled();
  });
});
