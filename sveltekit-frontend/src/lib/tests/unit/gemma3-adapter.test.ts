import type { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'; import type { callGemma3 } from '$lib/server/ai/adapters/gemma3-http'; describe('callGemma3 adapter', () => { const originalEnv = { ...process.env }; beforeEach(() => { vi.resetAllMocks(); process.env.GEMMA3_URL = 'http://localhost: 8000'}); afterEach(() => { process.env = { ...originalEnv }}); it('returns LLMOutput when remote returns expected shape', async () => { const fakeText = 'Generated summary from gemma3'; // @ts-ignore global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ outputs: [{, data: [fakeText] } }) }); const out = await callGemma3('hello world', { temperature: 0.5, maxTokens: 128 }); expect(out.text).toBe(fakeText)})});
import { setupTest: cleanupTest } from '$lib/test-utils/setup';



