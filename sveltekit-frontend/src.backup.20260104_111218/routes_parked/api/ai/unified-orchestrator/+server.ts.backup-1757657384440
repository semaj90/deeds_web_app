/**
 * Unified AI Orchestrator API - Single endpoint for all LLM interactions
 * Routes requests through the LLM Orchestrator Bridge to optimal processing
 * Supports both local and server-side orchestrators with MCP multi-core integration
 */

import type { RequestHandler } from './$types.js';
import { json } from '@sveltejs/kit';
import { llmOrchestratorBridge } from '$lib/server/ai/llm-orchestrator-bridge.js';
import type { LLMBridgeRequest } from '$lib/server/ai/llm-orchestrator-bridge.js';
import { logger } from '$lib/server/ai/logger.js';

// Health check endpoint
export const GET: RequestHandler = async ({ url }) => {
  try {
    const status = await llmOrchestratorBridge.getStatus();
    const metrics = llmOrchestratorBridge.getPerformanceMetrics();
    const activeRequests = llmOrchestratorBridge.getActiveRequests();

    return json({
      service: 'unified-ai-orchestrator',
      timestamp: new Date().toISOString(),
      status: status.bridge.status,
      bridge: status.bridge,
      orchestrators: {
        server: status.serverOrchestrator,
        client: status.clientOrchestrator,
      },
      performance: metrics,
      activeRequests: {
        count: activeRequests.length,
        requests: activeRequests.map(req => ({
          id: req.id,
          type: req.type,
          priority: req.options?.priority || 'normal',
          timestamp: req.metadata?.timestamp || Date.now(),
        })),
      },
      capabilities: [
        'Smart orchestrator routing',
        'Multi-core MCP integration', 
        'Local and server-side models',
        'GPU acceleration support',
        'Realtime and batch processing',
        'Legal domain optimization',
        'Client-side WASM models',
        'Vector search and embeddings',
        'Document processing workflows',
      ],
      models: {
        server: ['gemma3-legal:latest', 'nomic-embed-text:latest'],
        client: ['gemma270m', 'legal-bert', 'onnx-embeddings'],
      },
    });
  } catch (error) {
    logger.error('[Unified Orchestrator] Health check failed:', error);
    return json(
      {
        service: 'unified-ai-orchestrator',
        status: 'error',
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
};

// Main orchestrator endpoint
export const POST: RequestHandler = async ({ request, fetch, url }) => {
  const startTime = performance.now();
  let requestData: any;

  try {
    requestData = await request.json();
    
    // Validate required fields
    if (!requestData.content && !requestData.messages && !requestData.prompt) {
      return json(
        {
          success: false,
          error: 'Missing required field: content, messages, or prompt',
          timestamp: new Date().toISOString(),
        },
        { status: 400 }
      );
    }

    // Normalize input format (support multiple input styles)
    const content = requestData.content || 
                   requestData.prompt || 
                   (requestData.messages ? extractContentFromMessages(requestData.messages) : '');

    // Create bridge request
    const bridgeRequest: LLMBridgeRequest = {
      id: generateRequestId(),
      type: determineRequestType(requestData),
      content,
      context: {
        userId: requestData.userId || requestData.context?.userId || 'anonymous',
        sessionId: requestData.sessionId || requestData.context?.sessionId || generateSessionId(),
        caseId: requestData.caseId || requestData.context?.caseId,
        documentType: requestData.documentType || requestData.context?.documentType,
        legalDomain: requestData.legalDomain || requestData.context?.legalDomain,
        previousContext: requestData.previousContext || requestData.context?.previousContext,
      },
      options: {
        model: requestData.model || requestData.options?.model || 'auto',
        priority: requestData.priority || requestData.options?.priority || 'normal',
        useGPU: requestData.useGPU ?? requestData.options?.useGPU ?? true,
        enableStreaming: requestData.stream ?? requestData.options?.enableStreaming ?? false,
        maxLatency: requestData.maxLatency || requestData.options?.maxLatency,
        temperature: requestData.temperature ?? requestData.options?.temperature ?? 0.3,
        maxTokens: requestData.maxTokens || requestData.max_tokens || requestData.options?.maxTokens || 1024,
      },
      metadata: {
        source: 'api',
        userAgent: request.headers.get('user-agent') || 'unknown',
        timestamp: Date.now(),
      },
    };

    logger.info(`[Unified Orchestrator] Processing ${bridgeRequest.type} request: ${bridgeRequest.id}`);

    // Process through bridge
    const result = await llmOrchestratorBridge.processRequest(bridgeRequest);

    // Format response based on request type
    const response = formatResponse(result, requestData, startTime);

    logger.info(
      `[Unified Orchestrator] Request ${bridgeRequest.id} completed: ` +
      `${result.orchestratorUsed} orchestrator, ${result.executionMetrics.totalLatency.toFixed(2)}ms`
    );

    return json(response);

  } catch (error) {
    logger.error('[Unified Orchestrator] Request failed:', error);
    
    const errorResponse = {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      details: error instanceof Error ? error.stack : undefined,
      orchestratorUsed: 'none',
      executionMetrics: {
        totalLatency: performance.now() - startTime,
        processingTime: 0,
        routingTime: 0,
      },
      requestId: requestData?.id || 'unknown',
      timestamp: new Date().toISOString(),
    };

    return json(errorResponse, { status: 500 });
  }
};

// Streaming endpoint for real-time responses
export const PATCH: RequestHandler = async ({ request }) => {
  try {
    const requestData = await request.json();
    
    // Enable streaming in bridge request
    const bridgeRequest: LLMBridgeRequest = {
      id: generateRequestId(),
      type: 'chat',
      content: requestData.content || requestData.prompt || '',
      options: {
        ...requestData.options,
        enableStreaming: true,
        priority: 'realtime',
      },
      metadata: {
        source: 'streaming_api',
        timestamp: Date.now(),
      },
    };

    // Create a readable stream for SSE
    const stream = new ReadableStream({
      async start(controller) {
        try {
          // For now, just process normally and return result
          // In future, this could use streaming from orchestrator
          const result = await llmOrchestratorBridge.processRequest(bridgeRequest);
          
          // Send as SSE event
          const data = `data: ${JSON.stringify(result)}\n\n`;
          controller.enqueue(new TextEncoder().encode(data));
          controller.close();
        } catch (error) {
          const errorData = `data: ${JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' })}\n\n`;
          controller.enqueue(new TextEncoder().encode(errorData));
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  } catch (error) {
    return json(
      { error: error instanceof Error ? error.message : 'Streaming failed' },
      { status: 500 }
    );
  }
};

// Helper functions

function extractContentFromMessages(messages: any[]): string {
  if (!Array.isArray(messages) || messages.length === 0) {
    return '';
  }
  
  // Get the last user message
  const lastMessage = messages[messages.length - 1];
  return lastMessage?.content || lastMessage?.text || '';
}

function determineRequestType(requestData: any): LLMBridgeRequest['type'] {
  // Explicit type specified
  if (requestData.type) {
    return requestData.type;
  }

  // Detect from endpoint or context
  if (requestData.workflow || requestData.workflowType) {
    return 'workflow';
  }
  
  if (requestData.documentType || requestData.document || requestData.content?.length > 1000) {
    return 'document_processing';
  }
  
  if (requestData.query || requestData.search || requestData.vector) {
    return 'search';
  }
  
  if (requestData.embed || requestData.embedding) {
    return 'embedding';
  }
  
  if (requestData.legalAnalysis || requestData.legalDomain || 
      (requestData.content && (requestData.content.includes('legal') || 
                              requestData.content.includes('contract') ||
                              requestData.content.includes('statute')))) {
    return 'legal_analysis';
  }
  
  // Default to chat
  return 'chat';
}

function formatResponse(result: any, originalRequest: any, startTime: number) {
  const baseResponse = {
    success: result.success,
    response: result.response,
    orchestratorUsed: result.orchestratorUsed,
    model: result.modelUsed,
    executionMetrics: {
      ...result.executionMetrics,
      apiLatency: performance.now() - startTime,
    },
    confidence: result.confidence,
    requestId: result.requestId,
    timestamp: new Date().toISOString(),
  };

  // Add additional fields based on original request format
  
  // OpenAI-compatible format
  if (originalRequest.messages) {
    return {
      ...baseResponse,
      choices: [
        {
          message: {
            role: 'assistant',
            content: result.response,
          },
          finish_reason: result.success ? 'stop' : 'error',
          index: 0,
        },
      ],
      usage: {
        prompt_tokens: Math.ceil((originalRequest.content || '').length / 4),
        completion_tokens: Math.ceil(result.response.length / 4),
        total_tokens: Math.ceil(((originalRequest.content || '') + result.response).length / 4),
      },
    };
  }

  // Legal analysis format
  if (originalRequest.type === 'legal_analysis' || originalRequest.legalAnalysis) {
    return {
      ...baseResponse,
      analysis: {
        summary: result.response,
        citations: result.citations || [],
        confidence: result.confidence || 0.8,
        recommendations: result.followupSuggestions || [],
      },
    };
  }

  // Document processing format
  if (originalRequest.type === 'document_processing' || originalRequest.document) {
    return {
      ...baseResponse,
      document: {
        summary: result.response,
        entities: result.entities || [],
        keyTerms: result.keyTerms || [],
        metadata: result.metadata || {},
      },
    };
  }

  // Search format
  if (originalRequest.type === 'search' || originalRequest.query) {
    return {
      ...baseResponse,
      search: {
        query: originalRequest.query || originalRequest.content,
        results: result.searchResults || [],
        summary: result.response,
        totalResults: result.totalResults || 0,
      },
    };
  }

  // Default format
  return baseResponse;
}

function generateRequestId(): string {
  return `unified_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

function generateSessionId(): string {
  return `session_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

// OPTIONS handler for CORS
export const OPTIONS: RequestHandler = async () => {
  return new Response(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PATCH, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
};