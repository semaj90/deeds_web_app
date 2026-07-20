import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { parseToolCalls, hasToolCalls } from '$lib/server/ai/tool-call-parser.js';

export const POST: RequestHandler = async ({ request }) => {
  try {
    const { content } = await request.json() as { content: string };

    if (!content) {
      return json({ error: 'No content provided' }, { status: 400 });
    }

    const hasCalls = hasToolCalls(content);
    const parsed = parseToolCalls(content);

    return json({
      success: true,
      input: {
        length: content.length,
        hasToolCallMarkers: hasCalls,
      },
      output: {
        toolCallCount: parsed.toolCalls.length,
        toolCalls: parsed.toolCalls,
        reasoningText: parsed.reasoningText.slice(0, 100),
        responseText: parsed.responseText.slice(0, 100),
      },
    });
  } catch (err) {
    console.error('[test/tool-calls]', err);
    return json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
};
