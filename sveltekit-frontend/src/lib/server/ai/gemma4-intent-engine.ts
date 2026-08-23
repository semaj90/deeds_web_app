import { writeIntentSynthesisRecord, buildIntentSynthesisQueryHash } from '$lib/server/ace/intent-synthesis.js';
import { bifrostChat } from '$lib/server/ollama.js';
import { getLlamaSessionDescriptor } from '$lib/server/ai/local-llama-provider.js';

export interface Gemma4IntentLaneResult {
  synthesis: string;
  hadThoughtBlock: boolean;
  thoughtBlockStripped: boolean;
  cacheKey: string;
}

function stripGemmaThoughtBlock(raw: string): { visible: string; hadThoughtBlock: boolean } {
  const match = raw.match(/<\|channel>thought([\s\S]*?)<channel\|>/i);
  if (!match) {
    return { visible: raw.trim(), hadThoughtBlock: false };
  }

  const visible = raw.replace(/<\|channel>thought[\s\S]*?<channel\|>/i, '').trim();
  return { visible, hadThoughtBlock: true };
}

export async function processGemma4IntentionLane(
  userQuery: string,
  targetClusterId: number
): Promise<Gemma4IntentLaneResult> {
  const basePrompt = `<|think|>\nResolve explicit action items for this operational constraint: "${userQuery}"`;
  const llamaSession = await getLlamaSessionDescriptor();
  const rawContent = await bifrostChat(
    [
      { role: 'system', content: 'You are a legal-ai engineering director parsing code paths.' },
      { role: 'user', content: basePrompt },
    ],
    llamaSession.modelId,
    { temperature: 1.0, topP: 0.95, topK: 64, maxTokens: 2048 }
  );
  const { visible, hadThoughtBlock } = stripGemmaThoughtBlock(rawContent);
  const queryHash = buildIntentSynthesisQueryHash(userQuery);

  await writeIntentSynthesisRecord({
    queryHash,
    contextPackKey: `gemma4:cluster:${targetClusterId}`,
    sourceRefs: ['src/lib/server/ai/gemma4-intent-engine.ts'],
    chunkIds: [],
    summaryIds: [],
    authority: { targetClusterId, channel: 'gemma4-64k-experiment' },
    retrievalTrace: {
      model: 'gemma4-rotorquant:latest',
      temperature: 1.0,
      top_p: 0.95,
      top_k: 64,
      hiddenThoughtStripped: hadThoughtBlock,
    },
    cachedSteps: ['gemma4-intent-lane', 'thought-stripped', 'intent-synthesis-write'],
    rewardScore: 1.0,
    degraded: false,
  });

  return {
    synthesis: visible,
    hadThoughtBlock,
    thoughtBlockStripped: hadThoughtBlock,
    cacheKey: queryHash,
  };
}

