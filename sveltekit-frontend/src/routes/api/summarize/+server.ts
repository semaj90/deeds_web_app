import { json, type RequestHandler } from '@sveltejs/kit';
import { z } from 'zod';
import { summarizeWithGemma4 } from '$lib/server/llm/gemma4-summary-wrapper';

const SummarizeRequestSchema = z.object({
  content: z.string().min(1),
  maxTokens: z.number().int().positive().max(4096).optional(),
  temperature: z.number().min(0).max(2).optional()
});

/**
 * POST /api/summarize
 * Summarize code/feature content via Gemma4 RotorQuant
 */
export const POST: RequestHandler = async ({ request, locals }) => {
  if (!locals.user) {
    return json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const parsed = SummarizeRequestSchema.safeParse(await request.json());
    if (!parsed.success) {
      return json(
        { error: 'Invalid request body', issues: parsed.error.issues },
        { status: 400 }
      );
    }
    const { content, maxTokens = 256, temperature = 0.3 } = parsed.data;

    if (!content || content.trim().length === 0) {
      return json(
        { error: 'Content is required' },
        { status: 400 }
      );
    }

    const result = await summarizeWithGemma4({
      prompt: content,
      maxTokens,
      temperature
    });

    return json(result, { status: 200 });
  } catch (error) {
    console.error('Summarization error:', error);
    return json(
      { error: (error as Error).message || 'Summarization failed' },
      { status: 500 }
    );
  }
};
