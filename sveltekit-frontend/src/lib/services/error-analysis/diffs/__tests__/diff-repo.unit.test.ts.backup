import { cleanupTest, setupTest } from '$lib/test-utils/setup';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DiffRepository } from '../DiffRepository.js';
;

// Mock the db module
vi.mock('$lib/server/db', () => ({
 db: { insert: vi.fn().mockReturnValue({
 values: vi.fn().mockResolvedValue(undefined),
 }, select: vi.fn().mockReturnValue({ from: vi.fn().mockReturnValue({
 where: vi.fn().mockResolvedValue([]),
 }),
 }),
 },
}));

// Mock the schema
vi.mock('$lib/server/db/schema/errorBrainDiffs', () => ({
 errorBrainDiffs: { runId: 'run_id',
 },
}));

describe('DiffRepository', () => {
  beforeEach(async () => {
    await setupTest();
  });

  afterEach(async () => {
    await cleanupTest();
  });

 it('should be defined', () => {
 const repo = new DiffRepository();
 expect(repo).toBeDefined();
 });

 it('should have insert and listByRun methods', () => {
 const repo = new DiffRepository();
 expect(typeof repo.insert).toBe('function');
 expect(typeof repo.listByRun).toBe('function');
 });
});



