import { describe, expect, it } from 'vitest';
import {
  buildContextCacheKey,
  getContextCachePath,
  resolveContextCacheSources,
} from '$lib/server/ace/llm-context-cache.js';

const baseIdentity = {
  queryHash: 'query-a',
  modelName: 'gemma4-legal-vlm:latest',
  modelQuant: 'iq4_xs',
  backend: 'openai-facade',
  tokenizerHash: 'tok-a',
  systemPromptHash: 'sys-a',
  toolDefinitionsHash: 'tools-a',
  repoGitSha: 'repo-a',
  corpusHash: 'corpus-a',
  evidenceBundleHash: 'evidence-a',
  ragBundleHash: 'rag-a',
  graphSnapshotHash: 'graph-a',
  retrievalModeHash: 'retrieval-a',
  sectionTypesHash: 'section-a',
  personaKey: 'neutral',
  tokenAwarePacking: true,
  userId: 'user-a',
  caseId: 'case-a',
  conversationId: 'conv-a',
  filePath: 'src/lib/server/ace/context-assembler.ts',
};

describe('llm-context-cache', () => {
  it('builds a stable key for the same identity', () => {
    const keyA = buildContextCacheKey(baseIdentity);
    const keyB = buildContextCacheKey({ ...baseIdentity });
    expect(keyA).toBe(keyB);
  });

  it('misses when repo sha changes', () => {
    const keyA = buildContextCacheKey(baseIdentity);
    const keyB = buildContextCacheKey({ ...baseIdentity, repoGitSha: 'repo-b' });
    expect(keyA).not.toBe(keyB);
  });

  it('misses when system prompt hash changes', () => {
    const keyA = buildContextCacheKey(baseIdentity);
    const keyB = buildContextCacheKey({ ...baseIdentity, systemPromptHash: 'sys-b' });
    expect(keyA).not.toBe(keyB);
  });

  it('uses the first available cache source', async () => {
    const calls: string[] = [];
    const hit = await resolveContextCacheSources([
      async () => {
        calls.push('redis');
        return null;
      },
      async () => {
        calls.push('postgres');
        return {
          summary: 'cached summary',
          chunk_ids: ['chunk-1'],
          graph_paths: ['a|b|c'],
          tool_policy: { allowWriteTools: false },
          prefix_tokens_estimated: 123,
          cache_hit: true,
          retrieval_skipped: true,
          backend: 'openai-facade',
          model_name: 'gemma4-legal-vlm:latest',
          model_quant: 'iq4_xs',
          tokenizer_hash: 'tok-a',
          system_prompt_hash: 'sys-a',
          tool_definitions_hash: 'tools-a',
          repo_git_sha: 'repo-a',
          corpus_hash: 'corpus-a',
          rag_bundle_hash: 'rag-a',
          graph_snapshot_hash: 'graph-a',
        };
      },
      async () => {
        calls.push('local');
        return null;
      },
    ]);

    expect(calls).toEqual(['redis', 'postgres']);
    expect(hit?.summary).toBe('cached summary');
  });

  it('falls back to full retrieval when all sources miss', async () => {
    const hit = await resolveContextCacheSources([async () => null, async () => null, async () => null]);
    expect(hit).toBeNull();
  });

  it('maps cache keys to NVMe JSON paths', () => {
    const cacheKey = buildContextCacheKey(baseIdentity);
    expect(getContextCachePath(cacheKey)).toContain(`.cache\\ace\\context-packs\\${cacheKey}.json`);
  });
});
