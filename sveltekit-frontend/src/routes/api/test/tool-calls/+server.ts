import { json } from '@sveltejs/kit';
import { dev } from '$app/environment';
import { z } from 'zod';
import type { RequestHandler } from './$types';
import { parseToolCalls, hasToolCalls } from '$lib/server/ai/tool-call-parser.js';

const ToolCallsTestBodySchema = z.object({
  content: z.string().min(1)
});

export const POST: RequestHandler = async ({ request, locals }) => {
  if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });
  if (!dev) return json({ error: 'Test endpoints are dev-only' }, { status: 403 });

  try {
    const validated = ToolCallsTestBodySchema.safeParse(await request.json());
    if (!validated.success) {
      return json(
        { error: 'Invalid request body', issues: validated.error.issues },
        { status: 400 }
      );
    }
    const { content } = validated.data;

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
