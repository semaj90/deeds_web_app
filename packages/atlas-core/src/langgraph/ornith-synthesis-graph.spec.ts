import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  buildBoundedOrnithSynthesisGraphV1,
  type OrnithSynthesisTurnV1,
} from './ornith-synthesis-graph.js';
import { computeOrnithPromptPlanChecksumV1 } from './ornith-prompt-plan-adapter.js';

function sha(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function turn(index: number): OrnithSynthesisTurnV1 {
  const segmentContent = [
    { ordinal: 0, content: 'You are an evidence-bound repair agent.' },
    { ordinal: 1, content: `Return the bounded result for turn ${index}.` },
  ];
  const promptPlan = {
      schema: 'atlas.prompt-plan.v1',
      requestId: `graph-turn-${index}`,
      contextManifestChecksum: sha(`manifest-${index}`),
      tokenizerRevision: 'tokenizer:graph-v1',
      promptTemplateRevision: 'prompt:graph-v1',
      instructionRevision: 'instruction:graph-v1',
      segments: [
        {
          ordinal: 0,
          kind: 'SYSTEM',
          packetKey: null,
          evidenceRefs: [`evidence:system:${index}`],
          contentChecksum: sha(segmentContent[0]!.content),
          tokenCount: 7,
        },
        {
          ordinal: 1,
          kind: 'USER_QUERY',
          packetKey: null,
          evidenceRefs: [`evidence:query:${index}`],
          contentChecksum: sha(segmentContent[1]!.content),
          tokenCount: 8,
        },
      ],
      totalTokens: 15,
      contextLimitTokens: 65_536,
      reservedOutputTokens: 8_192,
      maxInputTokens: 57_344,
      checksumSha256: sha(`plan-${index}`),
    } satisfies OrnithSynthesisTurnV1['prompt_plan'];
  return {
    prompt_plan: {
      ...promptPlan,
      checksumSha256: computeOrnithPromptPlanChecksumV1(promptPlan),
    },
    prompt_segment_content: segmentContent,
  };
}

describe('bounded Ornith synthesis LangGraph', () => {
  it('runs exactly two compiled turns through the shared adapter', async () => {
    const calls: Array<{ url: string; body?: Record<string, unknown> }> = [];
    const fetchImpl = (async (url: string | URL, init?: RequestInit) => {
      const body = init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : undefined;
      calls.push({ url: String(url), body });
      if (String(url).endsWith('/v1/models')) {
        return new Response(JSON.stringify({ data: [{ id: 'ornith-1.5-9b' }] }), { status: 200 });
      }
      const messages = body?.messages as Array<{ content?: string }> | undefined;
      const query = messages?.[1]?.content ?? '';
      return new Response(JSON.stringify({
        choices: [{ message: { content: query.includes('turn 0') ? 'graph result 0' : 'graph result 1' } }],
      }), { status: 200 });
    }) as typeof fetch;

    const graph = buildBoundedOrnithSynthesisGraphV1({
      turns: [turn(0), turn(1)],
      baseUrl: 'http://127.0.0.1:8090',
      fetchImpl,
    });
    const result = await graph.invoke({ turn: 0, syntheses: [] });

    expect(result.turn).toBe(2);
    expect(result.syntheses).toEqual(['graph result 0', 'graph result 1']);
    expect(result.error).toBeUndefined();
    expect(calls.map((call) => call.url)).toEqual([
      'http://127.0.0.1:8090/v1/models',
      'http://127.0.0.1:8090/v1/chat/completions',
      'http://127.0.0.1:8090/v1/models',
      'http://127.0.0.1:8090/v1/chat/completions',
    ]);
    expect(calls.filter((call) => call.body).every((call) =>
      call.body?.model === 'ornith-1.5-9b' &&
      call.body?.temperature === 0 &&
      call.body?.top_p === 1 &&
      call.body?.cache_prompt === true &&
      call.body?.reasoning_effort === 'none',
    )).toBe(true);
  });

  it('stops the graph after a failed compiled turn without a second generation', async () => {
    const calls: string[] = [];
    const fetchImpl = (async (url: string | URL) => {
      calls.push(String(url));
      return new Response(JSON.stringify({ data: [{ id: 'ornith-1.5-9b' }] }), { status: 200 });
    }) as typeof fetch;
    const first = turn(0);
    const graph = buildBoundedOrnithSynthesisGraphV1({
      turns: [
        { ...first, prompt_segment_content: [{ ordinal: 0, content: 'drifted' }, first.prompt_segment_content[1]! ] },
        turn(1),
      ],
      fetchImpl,
    });

    const result = await graph.invoke({ turn: 0, syntheses: [] });

    expect(result.error).toContain('ORNITH_PROMPT_PLAN_CONTENT_CHECKSUM_MISMATCH:0');
    expect(result.turn).toBe(1);
    expect(calls).toEqual([]);
  });
});
