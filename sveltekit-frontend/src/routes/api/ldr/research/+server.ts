/**
 * Local Deep Research API Endpoint
 * Standalone endpoint for testing LDR before integration into main pipeline
 *
 * GET /api/ldr/research?q=<query> - Synchronous research
 * POST /api/ldr/research - Stream research with SSE
 */

import { json, type RequestHandler } from '@sveltejs/kit';
import { runLocalDeepResearch, streamLocalDeepResearchSynthesis, type LDRConfig } from '$lib/server/ldr/ldr-orchestrator';

/**
 * GET /api/ldr/research?q=<query>
 * Synchronous LDR execution (blocks until complete)
 */
export const GET: RequestHandler = async ({ url, locals }) => {
  // Auth guard: require authenticated user
  if (!locals.user) {
    return json({ error: 'Unauthorized' }, { status: 401 });
  }

  const query = url.searchParams.get('q');
  if (!query || query.trim().length === 0) {
    return json({ error: 'Missing query parameter: q' }, { status: 400 });
  }

  const config: LDRConfig = {
    maxWebResults: parseInt(url.searchParams.get('maxResults') ?? '15', 10),
    maxDocumentsToFetch: parseInt(url.searchParams.get('maxDocs') ?? '10', 10),
    temperature: parseFloat(url.searchParams.get('temperature') ?? '0.3')
  };

  try {
    const result = await runLocalDeepResearch(query, config);

    return json({
      query,
      result,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error('[LDR API] GET error:', errorMsg);

    return json(
      { error: 'Local Deep Research failed', details: errorMsg },
      { status: 500 }
    );
  }
};

/**
 * POST /api/ldr/research
 * Streaming LDR execution with Server-Sent Events
 *
 * Request body:
 * {
 *   "query": "What are the requirements for evidence admissibility?",
 *   "maxResults": 15,
 *   "maxDocs": 10,
 *   "temperature": 0.3
 * }
 *
 * Response: text/event-stream with chunks:
 * data: {"type":"chunk","content":"Some text..."}
 * data: {"type":"complete","result":{...}}
 * data: {"type":"error","error":"..."}
 */
export const POST: RequestHandler = async ({ request, locals }) => {
  // Auth guard
  if (!locals.user) {
    return json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Parse request
  let body: { query?: string; maxResults?: number; maxDocs?: number; temperature?: number };
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { query, maxResults = 15, maxDocs = 10, temperature = 0.3 } = body;

  if (!query || query.trim().length === 0) {
    return json({ error: 'Missing required field: query' }, { status: 400 });
  }

  const config: LDRConfig = {
    maxWebResults: maxResults,
    maxDocumentsToFetch: maxDocs,
    temperature
  };

  // Return SSE stream
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        await streamLocalDeepResearchSynthesis(
          query,
          (chunk) => {
            const event = JSON.stringify({ type: 'chunk', content: chunk });
            controller.enqueue(encoder.encode(`data: ${event}\n\n`));
          },
          config
        );

        // Finalize with empty line
        controller.enqueue(encoder.encode('data: {"type":"complete"}\n\n'));
        controller.close();
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        console.error('[LDR API] POST stream error:', errorMsg);

        const event = JSON.stringify({ type: 'error', error: errorMsg });
        controller.enqueue(encoder.encode(`data: ${event}\n\n`));
        controller.close();
      }
    }
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    }
  });
};
