import { describe, expect, it } from 'vitest';
import {
  createGraphAuthorityV2Repository,
} from './graph-authority-v2';

describe('graph authority v2 repository', () => {
  it('creates the repository surface used by the app layer', () => {
    const stubDb = {
      insert: () => ({ values: () => ({ onConflictDoUpdate: () => Promise.resolve(undefined) }) }),
      update: () => ({ set: () => ({ where: () => ({ returning: async () => [] }) }) }),
      select: () => ({ from: () => ({ where: async () => [] }) }),
    };

    const repo = createGraphAuthorityV2Repository(stubDb);
    expect(typeof repo.createGraphSnapshotV2).toBe('function');
    expect(typeof repo.upsertGraphResolutionIssueV2).toBe('function');
    expect(typeof repo.validateGraphSnapshotV2).toBe('function');
    expect(typeof repo.persistGraphAuthorityRunV2).toBe('function');
    expect(typeof repo.persistGraphAuthorityScoresV2).toBe('function');
  });
});
