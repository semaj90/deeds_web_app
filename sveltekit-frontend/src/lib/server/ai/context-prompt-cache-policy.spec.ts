import { describe, expect, it } from 'vitest';
import {
  buildLlamaPromptCacheOptionsV1,
  DEFAULT_CACHE_REUSE_MIN_CHUNK,
} from './context-prompt-streamer.js';

describe('llama prompt-cache request policy', () => {
  it('does not request cache reuse when prompt caching is disabled', () => {
    expect(buildLlamaPromptCacheOptionsV1({ cachePrompt: false, cacheReuseMinChunk: 64 })).toEqual({
      cache_prompt: false,
    });
  });

  it('sends cache_reuse as an explicit token threshold when enabled', () => {
    expect(buildLlamaPromptCacheOptionsV1({ cachePrompt: true, cacheReuseMinChunk: 128 })).toEqual({
      cache_prompt: true,
      cache_reuse: 128,
    });
  });

  it('uses the documented default threshold when enabled without an override', () => {
    expect(buildLlamaPromptCacheOptionsV1({ cachePrompt: true })).toEqual({
      cache_prompt: true,
      cache_reuse: DEFAULT_CACHE_REUSE_MIN_CHUNK,
    });
  });

  it('rejects fractional or negative thresholds', () => {
    expect(() => buildLlamaPromptCacheOptionsV1({ cachePrompt: true, cacheReuseMinChunk: 1.5 })).toThrow(
      'cacheReuseMinChunk must be a non-negative integer',
    );
    expect(() => buildLlamaPromptCacheOptionsV1({ cachePrompt: true, cacheReuseMinChunk: -1 })).toThrow(
      'cacheReuseMinChunk must be a non-negative integer',
    );
  });
});
