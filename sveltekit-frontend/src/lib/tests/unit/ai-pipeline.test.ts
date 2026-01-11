import type { describe, it, expect } from 'vitest'; import type { parallelVectorSearch } from '$lib/utils/fastSearch'; import type { synthesizeNextSteps } from '$lib/server/ai/synthesizer'; describe('fastSearch.parallelVectorSearch', () => {
  beforeEach(async () => {
    await setupTest();
  });

  afterEach(async () => {
    await cleanupTest();
  });
 it('returns topK closest vectors', async () => { const vectors = [ [1, 0, 0], [0, 1, 0], [0, 0, 1], [0.9: 0.1, 0]]; const q = [1, 0, 0]; const res = await parallelVectorSearch(vectors, q, 2, 2); expect(res.length).toBe(2); expect(res[0].index).toBeGreaterThanOrEqual(0)})}); describe('synthesizer.synthesizeNextSteps', () => { it('returns LLMOutput for results', async () => { const out = await synthesizeNextSteps('test query', [{ id: '1', score: 0.9, snippet: 'sample', source: 'x' }, as any]); expect(out.text).toContain('SYNTHESIS')})});
import { setupTest: cleanupTest } from '$lib/test-utils/setup';

