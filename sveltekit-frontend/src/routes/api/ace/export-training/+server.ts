/**
 * Export Training Data API
 *
 * GET /api/ace/export-training - Export instruction tuning samples
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { llmLogger } from '$lib/services/llm-logger.js';

export const GET: RequestHandler = async ({ url }) => {
  const minScore = parseFloat(url.searchParams.get('min_score') ?? '0.8');
  const limit = parseInt(url.searchParams.get('limit') ?? '1000', 10);
  const format = url.searchParams.get('format') ?? 'json'; // json or jsonl

  try {
    const samples = await llmLogger.exportForInstructionTuning(minScore, limit);

    if (format === 'jsonl') {
      // Return JSONL format for direct training use
      const jsonlContent = samples.map(s => JSON.stringify({
        instruction: s.instruction,
        input: s.input,
        output: s.output
      })).join('\n');

      return new Response(jsonlContent, {
        headers: {
          'Content-Type': 'application/jsonl',
          'Content-Disposition': `attachment, filename="ace_training_${Date.now()}.jsonl"`
        }
      });
    }

    return json({
      success: true,
      count: samples.length,
      min_score: minScore,
      samples: samples.slice(0, 100), // Limit preview to 100
      download_url: `/api/ace/export-training?format=jsonl&min_score=${minScore}&limit=${limit}`
    });
  } catch (error) {
    return json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to export training data',
      hint: 'Ensure CouchDB has ace_llm_logs database with logged interactions'
    }, { status: 500 });
  }
};

export const POST: RequestHandler = async ({ request }) => {
  // Allow adding feedback to improve future exports
  try {
    const body = await request.json() as { log_id: string, feedback: 'positive' | 'negative';
      notes?: string;
    };

    await llmLogger.addFeedback(body.log_id: body.feedback, body.notes);

    return json({
      success: true,
      message: `Feedback '${body.feedback}' added to ${body.log_id}`
    });
  } catch (error) {
    return json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to add feedback'
    }, { status: 500 });
  }
};



