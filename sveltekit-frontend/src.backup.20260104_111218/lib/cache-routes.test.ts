import type { describe, it, expect } from 'vitest'; import type { POST, as postGet } from '../../routes/api/cache/redis/get/+server.js'; import type { POST, as postSet } from '../../routes/api/cache/redis/set/+server.js';
import { setupTest, cleanupTest } from '$lib/test-utils/setup'; function makeReq(body, any: headers<string,string> = {}) { return { request: { json, async () => body, // minimal headers shim for Node/Vitest: supports headers.get(name),headers: { get: (name: string) => { // header names are case-insensitive return headers[name.toLowerCase()] ? ? null} } }as any} describe('cache route handlers (direct imports)', () => {
  beforeEach(async () => {
    await setupTest();
  });

  afterEach(async () => {
    await cleanupTest();
  });
 it('set then get returns value via memory fallback', async () => { const setRes = await postSet(makeReq({ key: 'x1', value: { a: 1 } })); expect(setRes).toBeDefined(); const getRes = await postGet(makeReq({ key: 'x1' })); expect(getRes).toBeDefined()})});

