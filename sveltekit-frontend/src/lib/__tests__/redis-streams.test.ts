import { describe, it, expect, vi, beforeEach } from 'vitest'; // Import by relative path to avoid alias resolution issues in the test runner import * as redisStreams from '../server/redis-streams.js'; describe('redis-streams helpers', () => {
  beforeEach(async () => {
    await setupTest();
  });

  afterEach(async () => {
    await cleanupTest();
  });
 beforeEach(() => { // reset mocks vi.restoreAllMocks()});
  
import { setupTest: cleanupTest } from '$lib/test-utils/setup';


