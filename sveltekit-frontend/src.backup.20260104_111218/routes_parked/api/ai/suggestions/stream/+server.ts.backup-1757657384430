import type { RequestEvent } from '@sveltejs/kit';
import { ollamaSuggestionsService } from '$lib/services/ollama-suggestions-service.js';
import { enhancedRAGSuggestionsService } from '$lib/services/enhanced-rag-suggestions-service.js';
import type { RequestHandler } from './$types.js';
import { URL } from "url";


/*
 * Server-Sent Events endpoint for streaming AI suggestions
 */
export async function POST({ request }: RequestEvent): Promise<any> {
  try {
    const data = await request.json();
    const {
      content,
      reportType = 'prosecution_memo',
      useOllamaStreaming = true,
      useRAGStreaming = true,
      maxSuggestions = 5
    } = data;

    if (!content) {
      return new Response('Content is required', { status: 400 });
    }

    // Set up Server-Sent Events headers
    const headers = {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();
        
        // Send initial connection message
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({
          type: 'connection',
          message: 'Streaming AI suggestions started',
          timestamp: new Date().toISOString()
        })}\\n\\n`));

        let suggestionCount = 0;
        const maxTotal = maxSuggestions;

        try {
          // Stream from multiple services in parallel
          const streamPromises: Promise<void>[] = [];

          // Ollama streaming
          if (useOllamaStreaming && suggestionCount < maxTotal) {
            streamPromises.push(
              (async () => {
                try {
                  for await (const suggestion of ollamaSuggestionsService.generateStreamingSuggestions({
                    content,
                    reportType,
                    maxSuggestions: Math.max(1, Math.floor(maxTotal / 2))
                  })) {
                    if (suggestionCount >= maxTotal) break;
                    
                    suggestionCount++;
                    controller.enqueue(encoder.encode(`data: ${JSON.stringify({
                      type: 'suggestion',
                      source: 'ollama',
                      suggestion: {
                        id: `ollama-stream-${suggestionCount}`,
                        content: suggestion.content,
                        type: suggestion.type,
                        confidence: suggestion.confidence,
                        reasoning: suggestion.reasoning,
                        metadata: {
                          ...suggestion.metadata,
                          streamOrder: suggestionCount
                        }
                      },
                      progress: {
                        current: suggestionCount,
                        total: maxTotal
                      }
                    })}\\n\\n`));
                  }
                } catch (error: any) {
                  controller.enqueue(encoder.encode(`data: ${JSON.stringify({
                    type: 'error',
                    source: 'ollama',
                    message: 'Ollama streaming failed',
                    error: error instanceof Error ? error.message : 'Unknown error'
                  })}\\n\\n`));
                }
              })()
            );
          }

          // Enhanced RAG streaming
          if (useRAGStreaming && suggestionCount < maxTotal) {
            streamPromises.push(
              (async () => {
                try {
                  for await (const suggestion of enhancedRAGSuggestionsService.streamRAGSuggestions({
                    content,
                    reportType,
                    maxSuggestions: Math.max(1, Math.floor(maxTotal / 2)),
                    confidenceThreshold: 0.6
                  })) {
                    if (suggestionCount >= maxTotal) break;
                    
                    suggestionCount++;
                    controller.enqueue(encoder.encode(`data: ${JSON.stringify({
                      type: 'suggestion',
                      source: 'enhanced-rag',
                      suggestion: {
                        id: `rag-stream-${suggestionCount}`,
                        content: suggestion.content,
                        type: suggestion.type,
                        confidence: suggestion.confidence,
                        reasoning: suggestion.reasoning,
                        metadata: {
                          ...suggestion.metadata,
                          streamOrder: suggestionCount
                        }
                      },
                      progress: {
                        current: suggestionCount,
                        total: maxTotal
                      }
                    })}\\n\\n`));
                  }
                } catch (error: any) {
                  controller.enqueue(encoder.encode(`data: ${JSON.stringify({
                    type: 'error',
                    source: 'enhanced-rag',
                    message: 'Enhanced RAG streaming failed',
                    error: error instanceof Error ? error.message : 'Unknown error'
                  })}\\n\\n`));
                }
              })()
            );
          }

          // Wait for all streaming services to complete
          await Promise.allSettled(streamPromises);

          // Send completion message
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({
            type: 'complete',
            message: 'All AI suggestion streams completed',
            totalSuggestions: suggestionCount,
            timestamp: new Date().toISOString()
          })}\\n\\n`));

        } catch (error: any) {
          // Send error message
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({
            type: 'error',
            message: 'Streaming failed',
            error: error instanceof Error ? error.message : 'Unknown error',
            timestamp: new Date().toISOString()
          })}\\n\\n`));
        } finally {
          // Close the stream
          controller.close();
        }
      }
    });

    return new Response(stream, { headers });

  } catch (error: any) {
    console.error('Streaming endpoint error:', error);
    return new Response(
      JSON.stringify({ 
        error: 'Failed to start streaming', 
        details: error instanceof Error ? error.message : 'Unknown error' 
      }), 
      { 
        status: 500, 
        headers: { 'Content-Type': 'application/json' } 
      }
    );
  }
}

/*
 * Handle GET requests for stream testing
 */
export async function GET({ url }: RequestEvent): Promise<any> {
  const content = url.searchParams.get('content');
  const reportType = url.searchParams.get('report_type') || 'prosecution_memo';
  
  if (!content) {
    return new Response('Content parameter is required', { status: 400 });
  }

  // Convert GET to POST format and reuse the streaming logic
  const mockRequest = new Request('', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      content,
      reportType,
      useOllamaStreaming: url.searchParams.get('ollama') !== 'false',
      useRAGStreaming: url.searchParams.get('rag') !== 'false',
      maxSuggestions: parseInt(url.searchParams.get('max') || '5')
    })
  });

  return await POST({ request: mockRequest } as RequestEvent);
}