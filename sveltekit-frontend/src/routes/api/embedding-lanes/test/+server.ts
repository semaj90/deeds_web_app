/**
 * Embedding Lanes Test Endpoint
 * POST /api/embedding-lanes/test
 *
 * Test the embedding orchestrator across all lanes
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { embeddingOrchestrator } from '$lib/server/retrieval/embedding-orchestrator';
import { logger } from '$lib/server/logger';

interface TestRequest {
  text: string;
  lane?: 'primary-768d' | 'fallback-512d' | 'multimodal-clip-512d';
  type?: 'document' | 'query' | 'image' | 'audio';
}

interface TestResult {
  success: boolean;
  lane: string;
  dimension: number;
  embedding_length: number;
  model: string;
  confidence: number;
  processing_time_ms: number;
  cached: boolean;
  error?: string;
}

export const POST: RequestHandler = async ({ request }) => {
  try {
    const body = (await request.json()) as TestRequest;
    const { text, type = 'query' } = body;

    if (!text || text.trim().length === 0) {
      return json(
        { error: 'Missing or empty text parameter' },
        { status: 400 }
      );
    }

    // Embed the text
    const result = await embeddingOrchestrator.embed({
      text: text.trim(),
      type,
      metadata: { source: 'api-test' }
    });

    const testResult: TestResult = {
      success: true,
      lane: result.lane,
      dimension: result.dimension,
      embedding_length: result.embedding.length,
      model: result.model,
      confidence: result.confidence,
      processing_time_ms: result.processingTimeMs,
      cached: result.cached
    };

    logger.info('[EmbeddingLanesTest] Test successful', {
      text_length: text.length,
      result: testResult
    });

    return json(testResult);
  } catch (error) {
    const errorMessage = String(error);
    logger.error('[EmbeddingLanesTest] Test failed', { error: errorMessage });

    return json(
      {
        success: false,
        error: errorMessage
      },
      { status: 500 }
    );
  }
};

/**
 * GET endpoint for diagnostics
 */
export const GET: RequestHandler = async () => {
  try {
    const diags = embeddingOrchestrator.getDiagnostics();

    return json({
      status: 'ok',
      diagnostics: diags,
      endpoints: {
        test: 'POST /api/embedding-lanes/test (with { text, type? })',
        diagnostics: 'GET /api/embedding-lanes/test'
      }
    });
  } catch (error) {
    return json(
      {
        status: 'error',
        error: String(error)
      },
      { status: 500 }
    );
  }
};
