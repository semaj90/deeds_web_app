// Enhanced Chat API with LLM Orchestrator Bridge and MCP Multi-Core Integration
import type { RequestHandler } from '@sveltejs/kit';
import { json } from '@sveltejs/kit';
import { llmOrchestratorBridge } from '$lib/server/ai/llm-orchestrator-bridge.js';
import type { LLMBridgeRequest } from '$lib/server/ai/llm-orchestrator-bridge.js';
import { dev } from '$app/environment';
import { ollamaConfig } from '$lib/services/ollama-config-service.js';
import { ENV_CONFIG } from '$lib/config/environment.js';

export const POST: RequestHandler = async (event) => {
  const { request, fetch, url } = event;
  const startTime = performance.now();
  
  try {
    // Parse incoming messages
    const requestData = await request.json();
    const { messages, model = "auto", temperature = 0.7, stream = false } = requestData;
    
    if (!messages || !Array.isArray(messages)) {
      return json({ error: "Messages array is required" }, { status: 400 });
    }

    // Get the latest user message
    const lastMessage = messages[messages.length - 1];
    if (!lastMessage?.content) {
      return json({ error: "Message content is required" }, { status: 400 });
    }

    // Extract conversation context
    const conversationHistory = messages.slice(0, -1).map(msg => `${msg.role}: ${msg.content}`);

    // Create bridge request for intelligent routing
    const bridgeRequest: LLMBridgeRequest = {
      id: `chat_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      type: 'chat',
      content: lastMessage.content,
      context: {
        userId: requestData.userId || 'anonymous',
        sessionId: requestData.sessionId || `session_${Date.now()}`,
        previousContext: conversationHistory,
        legalDomain: detectLegalDomain(lastMessage.content),
      },
      options: {
        model: model === 'gemma3-legal:latest' ? 'gemma3-legal' : model,
        priority: stream ? 'realtime' : 'normal',
        useGPU: true,
        enableStreaming: stream,
        temperature,
        maxTokens: requestData.max_tokens || 1024,
        maxLatency: stream ? 500 : undefined, // Prefer fast models for streaming
      },
      metadata: {
        source: 'chat_api',
        userAgent: request.headers.get('user-agent') || 'unknown',
        timestamp: Date.now(),
      },
    };

    // Route through orchestrator bridge for optimal processing
    try {
      const result = await llmOrchestratorBridge.processRequest(bridgeRequest);
      
      if (!result.success) {
        throw new Error(result.error || 'Orchestrator processing failed');
      }

      const totalTime = performance.now() - startTime;
      
      if (dev) {
        console.log(`🚀 Chat API completed via ${result.orchestratorUsed} orchestrator in ${totalTime.toFixed(2)}ms`);
      }

      // Return OpenAI-compatible format
      return json({
        choices: [{
          message: {
            role: "assistant",
            content: result.response
          },
          finish_reason: "stop",
          index: 0
        }],
        usage: {
          total_tokens: Math.ceil((lastMessage.content + result.response).length / 4), // Rough estimate
          prompt_tokens: Math.ceil(lastMessage.content.length / 4),
          completion_tokens: Math.ceil(result.response.length / 4)
        },
        model: result.modelUsed,
        object: "chat.completion",
        created: Math.floor(Date.now() / 1000),
        id: result.requestId,
        orchestrator: {
          used: result.orchestratorUsed,
          confidence: result.confidence,
          executionMetrics: result.executionMetrics,
          gpuAccelerated: result.executionMetrics.gpuAccelerated,
        },
        response_time_ms: totalTime
      });

    } catch (orchestratorError) {
      console.warn('Orchestrator failed, falling back to direct Ollama:', orchestratorError);
      
      // Fallback to direct Ollama call
      return await fallbackToDirectOllama(lastMessage.content, model, temperature, startTime);
    }

  } catch (error: any) {
    console.error('Chat API error:', error);
    return json({ 
      error: "Failed to generate response",
      detail: error.message,
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
};

// Fallback function for direct Ollama calls
async function fallbackToDirectOllama(
  prompt: string, 
  model: string, 
  temperature: number, 
  startTime: number
) {
  try {
    const ollamaResponse = await fetch(`${DEFAULT_OLLAMA_URL}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: model === 'auto' ? 'gemma3-legal:latest' : model,
        prompt,
        stream: false,
        options: {
          temperature,
          num_predict: 1024,
          top_k: 40,
          top_p: 0.9,
          repeat_penalty: 1.1
        }
      })
    });

    if (!ollamaResponse.ok) {
      const errorText = await ollamaResponse.text();
      throw new Error(`Ollama error: ${errorText}`);
    }

    const data = await ollamaResponse.json();
    const totalTime = performance.now() - startTime;

    return json({
      choices: [{
        message: {
          role: "assistant",
          content: data.response || "No response generated"
        },
        finish_reason: "stop"
      }],
      usage: {
        total_tokens: data.eval_count || 0,
        prompt_tokens: data.prompt_eval_count || 0,
        completion_tokens: (data.eval_count || 0) - (data.prompt_eval_count || 0)
      },
      model: model,
      orchestrator: {
        used: 'fallback_ollama',
        confidence: 0.7,
        executionMetrics: {
          totalLatency: totalTime,
          processingTime: totalTime,
          routingTime: 0,
          gpuAccelerated: false,
        }
      },
      response_time_ms: totalTime
    });
  } catch (error) {
    throw new Error(`Fallback to direct Ollama failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

// Helper function to detect legal domain from content
function detectLegalDomain(content: string): string | undefined {
  const legalKeywords = {
    'contract': ['contract', 'agreement', 'terms', 'clause', 'breach'],
    'tort': ['negligence', 'liability', 'damages', 'injury', 'fault'],
    'criminal': ['criminal', 'prosecution', 'defendant', 'guilty', 'evidence'],
    'corporate': ['corporation', 'shareholder', 'board', 'merger', 'securities'],
    'property': ['property', 'real estate', 'title', 'deed', 'mortgage'],
    'family': ['divorce', 'custody', 'marriage', 'adoption', 'alimony'],
    'employment': ['employment', 'workplace', 'discrimination', 'wage', 'termination'],
  };

  const lowerContent = content.toLowerCase();
  
  for (const [domain, keywords] of Object.entries(legalKeywords)) {
    if (keywords.some(keyword => lowerContent.includes(keyword))) {
      return domain;
    }
  }
  
  return undefined;
}
