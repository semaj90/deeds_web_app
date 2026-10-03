import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import {
  computeOrnithPromptPlanChecksumV1,
  type OrnithPromptPlanViewV1,
} from '@deeds/atlas-core/langgraph/ornith-prompt-plan-adapter';
import { executeMastraPromptPlanV1 } from './prompt-plan-agent.js';

const text = 'Use the admitted evidence to answer briefly.';
const checksum = (value: string) => createHash('sha256').update(value, 'utf8').digest('hex');

function plan(): OrnithPromptPlanViewV1 {
  const base = {
    schema: 'atlas.prompt-plan.v1' as const,
    requestId: 'request-fixture-1',
    contextManifestChecksum: 'a'.repeat(64),
    tokenizerRevision: 'tokenizer-fixture-v1',
    promptTemplateRevision: 'template-fixture-v1',
    instructionRevision: 'instruction-fixture-v1',
    segments: [{
      ordinal: 0,
      kind: 'USER_QUERY' as const,
      packetKey: null,
      evidenceRefs: [],
      contentChecksum: checksum(text),
      tokenCount: 8,
    }],
    totalTokens: 8,
    contextLimitTokens: 1024,
    reservedOutputTokens: 64,
    maxInputTokens: 960,
  };
  return { ...base, checksumSha256: computeOrnithPromptPlanChecksumV1({ ...base, checksumSha256: '0'.repeat(64) }) };
}

describe('Mastra PromptPlan executor', () => {
  it('sends only the checksummed plan and preserves the caller-resolved model ID', async () => {
    const calls: Array<{ url: string; body: Record<string, unknown> }> = [];
    const fetchImpl = vi.fn(async (input: URL | string, init?: RequestInit) => {
      const url = String(input);
      const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
      calls.push({ url, body });
      return new Response(JSON.stringify({
        id: 'fixture',
        choices: [{ index: 0, message: { role: 'assistant', content: 'Answer grounded in the admitted evidence.' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 8, completion_tokens: 7 },
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    });

    const result = await executeMastraPromptPlanV1({
      baseUrl: 'http://fixture.invalid',
      resolvedModel: 'loaded-model-id-from-resolver',
      promptPlan: plan(),
      segmentContent: [{ ordinal: 0, content: text }],
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(result.model).toBe('loaded-model-id-from-resolver');
    expect(result.content).toBe('Answer grounded in the admitted evidence.');
    expect(result.canonicalAuthority).toBe(false);
    expect(result.writesPerformed).toBe(false);
    expect(result.durableStatePersisted).toBe(false);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe('http://fixture.invalid/v1/chat/completions');
    expect(calls[0]?.body.model).toBe('loaded-model-id-from-resolver');
    expect(calls[0]?.body.messages).toEqual([{ role: 'user', content: text }]);
    expect(calls[0]?.body.max_tokens).toBe(64);
    expect(calls[0]?.body.reasoning_effort).toBe('none');
    expect(calls[0]?.body.chat_template_kwargs).toEqual({ enable_thinking: false });
  });

  it('rejects segment drift before making a model request', async () => {
    const fetchImpl = vi.fn();
    await expect(executeMastraPromptPlanV1({
      baseUrl: 'http://fixture.invalid',
      resolvedModel: 'resolved-id',
      promptPlan: plan(),
      segmentContent: [{ ordinal: 0, content: 'changed bytes' }],
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })).rejects.toThrow('ORNITH_PROMPT_PLAN_CONTENT_CHECKSUM_MISMATCH:0');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('rejects hidden-reasoning markers returned by the model', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      choices: [{ message: { content: '<think>internal</think>public answer' } }],
    }), { status: 200, headers: { 'content-type': 'application/json' } }));
    await expect(executeMastraPromptPlanV1({
      baseUrl: 'http://fixture.invalid',
      resolvedModel: 'resolved-id',
      promptPlan: plan(),
      segmentContent: [{ ordinal: 0, content: text }],
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })).rejects.toThrow('MASTRA_PROMPT_PLAN_HIDDEN_REASONING_MARKER_REJECTED');
  });
});
