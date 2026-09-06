import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { runOrnithSynthesisNodeV1 } from './ornith-synthesis-node.js';
import { computeOrnithPromptPlanChecksumV1 } from './ornith-prompt-plan-adapter.js';

function sha(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function fixture() {
  const segmentContent = [
    { ordinal: 0, content: 'You are an evidence-bound repair agent.' },
    { ordinal: 1, content: 'Return one safe next step.' },
  ];
  const promptPlan = {
    schema: 'atlas.prompt-plan.v1' as const,
    requestId: 'worker-ornith-test',
    contextManifestChecksum: sha('manifest'),
    tokenizerRevision: 'tokenizer:r1',
    promptTemplateRevision: 'prompt:r1',
    instructionRevision: 'instruction:r1',
    segments: [
      {
        ordinal: 0,
        kind: 'SYSTEM' as const,
        packetKey: null,
        evidenceRefs: ['evidence:system'],
        contentChecksum: sha(segmentContent[0]!.content),
        tokenCount: 7,
      },
      {
        ordinal: 1,
        kind: 'USER_QUERY' as const,
        packetKey: null,
        evidenceRefs: ['evidence:query'],
        contentChecksum: sha(segmentContent[1]!.content),
        tokenCount: 6,
      },
    ],
    totalTokens: 13,
    contextLimitTokens: 65_536,
    reservedOutputTokens: 8_192,
    maxInputTokens: 57_344,
    checksumSha256: sha('plan'),
  };
  return {
    segmentContent,
    promptPlan: {
      ...promptPlan,
      checksumSha256: computeOrnithPromptPlanChecksumV1(promptPlan),
    },
  };
}

describe('LangGraph Ornith synthesis node integration', () => {
  it('routes a compiled plan through the worker node without persistence', async () => {
    const { promptPlan, segmentContent } = fixture();
    const calls: string[] = [];
    const fetchImpl = (async (url: string | URL) => {
      calls.push(String(url));
      if (String(url).endsWith('/v1/models')) {
        return new Response(JSON.stringify({ data: [{ id: 'ornith-1.5-9b' }] }), { status: 200 });
      }
      return new Response(JSON.stringify({
        choices: [{ message: { content: 'bounded synthesis result' } }],
      }), { status: 200 });
    }) as typeof fetch;

    const result = await runOrnithSynthesisNodeV1({
      prompt_plan: promptPlan,
      prompt_segment_content: segmentContent,
      step: 4,
      baseUrl: 'http://127.0.0.1:8090',
      fetchImpl,
    });

    expect(result).toEqual({ synthesis: 'bounded synthesis result', step: 5 });
    expect(calls).toEqual([
      'http://127.0.0.1:8090/v1/models',
      'http://127.0.0.1:8090/v1/chat/completions',
    ]);
  });

  it('returns a graph error and skips generation when plan content drifts', async () => {
    const { promptPlan, segmentContent } = fixture();
    let generationCalls = 0;
    const fetchImpl = (async (url: string | URL) => {
      if (String(url).endsWith('/v1/chat/completions')) generationCalls += 1;
      return new Response(JSON.stringify({ data: [{ id: 'ornith-1.5-9b' }] }), { status: 200 });
    }) as typeof fetch;

    const result = await runOrnithSynthesisNodeV1({
      prompt_plan: promptPlan,
      prompt_segment_content: [{ ordinal: 0, content: 'drifted content' }, segmentContent[1]!],
      step: 2,
      fetchImpl,
    });

    expect(result.error).toContain('ORNITH_PROMPT_PLAN_CONTENT_CHECKSUM_MISMATCH:0');
    expect(result.step).toBe(3);
    expect(generationCalls).toBe(0);
  });
});
