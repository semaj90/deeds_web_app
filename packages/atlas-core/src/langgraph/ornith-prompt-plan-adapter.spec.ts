import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  computeOrnithPromptPlanChecksumV1,
  executeOrnithPromptPlanV1,
  type OrnithPromptPlanViewV1,
} from './ornith-prompt-plan-adapter.js';

function sha(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function makePlan(): { plan: OrnithPromptPlanViewV1; segmentContent: Array<{ ordinal: number; content: string }> } {
  const segmentContent = [
    { ordinal: 0, content: 'You are a bounded repair planner.' },
    { ordinal: 1, content: 'Return the next safe step for this verified error.' },
  ];
  const segments = segmentContent.map((entry, index) => ({
    ordinal: entry.ordinal,
    kind: index === 0 ? 'SYSTEM' as const : 'USER_QUERY' as const,
    packetKey: null,
    evidenceRefs: [`evidence:${index}`],
    contentChecksum: sha(entry.content),
    tokenCount: index === 0 ? 6 : 9,
  }));
  const payload = {
    schema: 'atlas.prompt-plan.v1' as const,
    requestId: 'req-ornith-adapter',
    contextManifestChecksum: sha('manifest'),
    tokenizerRevision: 'tokenizer:r1',
    promptTemplateRevision: 'prompt:r1',
    instructionRevision: 'instruction:r1',
    segments,
    totalTokens: 15,
    contextLimitTokens: 65_536,
    reservedOutputTokens: 8_192,
    maxInputTokens: 57_344,
  };
  return {
    segmentContent,
    plan: {
      ...payload,
      checksumSha256: computeOrnithPromptPlanChecksumV1(payload),
    },
  };
}

describe('Ornith PromptPlanV1 adapter', () => {
  it('resolves Ornith and dispatches only the compiled plan messages', async () => {
    const { plan, segmentContent } = makePlan();
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fetchImpl = (async (url: string | URL, init?: RequestInit) => {
      calls.push({ url: String(url), init });
      if (String(url).endsWith('/v1/models')) {
        return new Response(JSON.stringify({ data: [{ id: 'ornith-1.5-9b' }] }), { status: 200 });
      }
      return new Response(JSON.stringify({
        choices: [{ message: { content: 'Use the verified bounded repair path.' } }],
        usage: { prompt_tokens: 15, completion_tokens: 8 },
      }), { status: 200 });
    }) as typeof fetch;

    const result = await executeOrnithPromptPlanV1({
      baseUrl: 'http://127.0.0.1:8090',
      promptPlan: plan,
      segmentContent,
      fetchImpl,
    });

    expect(result.content).toContain('verified bounded repair path');
    expect(result.model).toBe('ornith-1.5-9b');
    expect(result.modelCalls).toBe(1);
    expect(result.datastoreWrites).toBe(false);
    expect(result.canonicalWrites).toBe(false);
    expect(result.hiddenStatePersisted).toBe(false);
    expect(calls).toHaveLength(2);
    const request = JSON.parse(String(calls[1]!.init?.body));
    expect(request.model).toBe('ornith-1.5-9b');
    expect(request.messages).toEqual([
      { role: 'system', content: segmentContent[0]!.content },
      { role: 'user', content: segmentContent[1]!.content },
    ]);
    expect(request.max_tokens).toBe(8_192);
    expect(request.temperature).toBe(0);
    expect(request.top_p).toBe(1);
    expect(request.cache_prompt).toBe(true);
    expect(request.reasoning_effort).toBe('none');
    expect(request.chat_template_kwargs).toEqual({ enable_thinking: false });
  });

  it('fails closed before generation when an ephemeral segment is not the admitted content', async () => {
    const { plan, segmentContent } = makePlan();
    let postCalls = 0;
    const fetchImpl = (async (url: string | URL) => {
      if (String(url).endsWith('/v1/chat/completions')) postCalls += 1;
      return new Response(JSON.stringify({ data: [{ id: 'ornith-1.5-9b' }] }), { status: 200 });
    }) as typeof fetch;

    await expect(executeOrnithPromptPlanV1({
      baseUrl: 'http://127.0.0.1:8090',
      promptPlan: plan,
      segmentContent: [{ ...segmentContent[0]!, content: 'unadmitted paraphrase' }, segmentContent[1]!],
      fetchImpl,
    })).rejects.toThrow('ORNITH_PROMPT_PLAN_CONTENT_CHECKSUM_MISMATCH:0');
    expect(postCalls).toBe(0);
  });

  it('fails closed when the expected model is not loaded', async () => {
    const { plan, segmentContent } = makePlan();
    const fetchImpl = (async () => new Response(JSON.stringify({ data: [{ id: 'other-model' }] }), { status: 200 })) as typeof fetch;

    await expect(executeOrnithPromptPlanV1({
      baseUrl: 'http://127.0.0.1:8090',
      promptPlan: plan,
      segmentContent,
      fetchImpl,
    })).rejects.toThrow('ORNITH_MODEL_NOT_LOADED:ornith-1.5-9b');
  });

  it('fails closed when the compiled plan checksum does not match its fields', async () => {
    const { plan, segmentContent } = makePlan();
    let postCalls = 0;
    const fetchImpl = (async (url: string | URL) => {
      if (String(url).endsWith('/v1/chat/completions')) postCalls += 1;
      return new Response(JSON.stringify({ data: [{ id: 'ornith-1.5-9b' }] }), { status: 200 });
    }) as typeof fetch;

    await expect(executeOrnithPromptPlanV1({
      baseUrl: 'http://127.0.0.1:8090',
      promptPlan: { ...plan, requestId: 'tampered-request' },
      segmentContent,
      fetchImpl,
    })).rejects.toThrow('ORNITH_PROMPT_PLAN_CHECKSUM_MISMATCH');
    expect(postCalls).toBe(0);
  });
});
