import { json, type RequestHandler } from '@sveltejs/kit';
import { summarizeWithGemma4 } from '$lib/server/llm/gemma4-summary-wrapper';

interface SummarizeRequest {
  content: string;
  maxTokens?: number;
  temperature?: number;
}

/**
 * POST /api/summarize
 * Summarize code/feature content via Gemma4 RotorQuant
 */
export const POST: RequestHandler = async ({ request }) => {
  try {
    const { content, maxTokens = 256, temperature = 0.3 } = (await request.json()) as SummarizeRequest;

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
