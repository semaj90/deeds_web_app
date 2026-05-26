import process from 'node:process';
import { runChatCompletion } from '../../src/lib/server/ai/openai-facade.ts';

async function main() {
  const response = await runChatCompletion({
    model: 'gemma4-vlm',
    messages: [
      { role: 'system', content: 'Return strict JSON only.' },
      { role: 'user', content: 'Reply with {"ok":true}.' },
    ],
    temperature: 0,
    max_tokens: 32,
    stream: false,
  });

  if (response.yorha?.draftModel !== false) {
    throw new Error(`Expected draftModel=false, got ${String(response.yorha?.draftModel)}`);
  }

  if (typeof response.choices?.[0]?.message?.content !== 'string' || response.choices[0].message.content.length === 0) {
    throw new Error('Expected a non-empty completion');
  }

  console.log(
    JSON.stringify(
      {
        status: 'ok',
        model: response.model,
        draftModel: response.yorha?.draftModel,
        inferenceLane: response.yorha?.inferenceLane,
        cacheHit: response.yorha?.cacheHit,
      },
      null,
      2
    )
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('[ace-draft-off-json-smoke] failed:', err);
    process.exit(1);
  });
