// Legal AI Multi-Model Orchestrator
// Integrates Docker vLLM services with Nintendo Memory Management

import { UnifiedLegalCacheOrchestrator } from './unified-legal-cache-orchestrator';
import { NintendoMemoryManager } from './nintendo-memory-manager';

export interface LLMClient {
  baseUrl: string;
  model: string;
  healthEndpoint: string;
}

export interface QueryClassification {
  classification: 'simple' | 'complex_legal' | 'embedding' | 'cached';
  confidence: number;
  reasoning: string;
}

export interface OrchestrationResult {
  answer: string;
  model_used: string;
  cache_hit: boolean;
  memory_bank_used: string;
  response_time_ms: number;
  cost_saved: number;
}

export class LegalAIOrchestrator {
  private cacheOrchestrator: UnifiedLegalCacheOrchestrator;
  private memoryManager: NintendoMemoryManager;
  
  private clients: Record<string, LLMClient> = {
    fast_router: {
      baseUrl: 'http://localhost:8001/v1',
      model: 'ollama/gemma-3-270m-instruct-q6_k',
      healthEndpoint: 'http://localhost:8001/health'
    },
    legal_expert: {
      baseUrl: 'http://localhost:8000/v1',
      model: 'ollama/gemma-3-legal-2b-instruct-q6_k', 
      healthEndpoint: 'http://localhost:8000/health'
    },
    embedding_service: {
      baseUrl: 'http://localhost:11434/api',
      model: 'embeddinggemma:latest',
      healthEndpoint: 'http://localhost:11434/api/tags'
    }
  };

  constructor() {
    this.cacheOrchestrator = new UnifiedLegalCacheOrchestrator();
    this.memoryManager = new NintendoMemoryManager();
  }

  /**
   * Main orchestration method - Nintendo-style routing with memory management
   */
  async processQuery(query: string, context?: any[]): Promise<OrchestrationResult> {
    const startTime = Date.now();
    
    // Phase 1: Check Nintendo L3 Cache first (Redis)
    const cacheKey = this.generateCacheKey(query, context);
    const cached = await this.cacheOrchestrator.getCachedResponse(cacheKey);
    
    if (cached) {
      return {
        answer: cached.response,
        model_used: 'cache_hit',
        cache_hit: true,
        memory_bank_used: 'L3_CACHE',
        response_time_ms: Date.now() - startTime,
        cost_saved: cached.cost_saved || 0
      };
    }

    // Phase 2: Route query using fast model
    const classification = await this.classifyQuery(query);
    
    // Phase 3: Process based on classification with memory management
    let result: OrchestrationResult;
    
    switch (classification.classification) {
      case 'simple':
        result = await this.handleSimpleQuery(query, startTime);
        break;
        
      case 'complex_legal':
        result = await this.handleComplexLegalQuery(query, context, startTime);
        break;
        
      case 'embedding':
        result = await this.handleEmbeddingQuery(query, startTime);
        break;
        
      default:
        result = await this.handleSimpleQuery(query, startTime);
    }

    // Phase 4: Cache result using Nintendo memory management
    await this.cacheOrchestrator.cacheResponse(cacheKey, {
      response: result.answer,
      model_used: result.model_used,
      timestamp: Date.now(),
      cost_saved: result.cost_saved
    });

    // Phase 5: Update Nintendo memory bank status
    await this.memoryManager.updateBankUsage('L3', cacheKey.length);
    
    return result;
  }

  /**
   * Classify query using fast router model
   */
  private async classifyQuery(query: string): Promise<QueryClassification> {
    const prompt = `
    Analyze this query and classify it. Respond with just one word:
    - "simple" for basic questions, definitions, or factual queries
    - "complex_legal" for legal analysis, case law, contract review, or legal advice
    - "embedding" for document similarity or semantic search requests
    
    Query: "${query}"
    
    Classification:`;

    try {
      const response = await fetch(`${this.clients.fast_router.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.clients.fast_router.model,
          messages: [{ role: 'user', content: prompt }],
          max_tokens: 10,
          temperature: 0.1
        })
      });

      const data = await response.json();
      const classification = data.choices[0]?.message?.content?.trim().toLowerCase() || 'simple';
      
      return {
        classification: classification.includes('complex') ? 'complex_legal' : 
                      classification.includes('embedding') ? 'embedding' : 'simple',
        confidence: 0.9,
        reasoning: `Router classified as: ${classification}`
      };
    } catch (error) {
      console.warn('Router classification failed, defaulting to simple:', error);
      return {
        classification: 'simple',
        confidence: 0.5,
        reasoning: 'Fallback due to router error'
      };
    }
  }

  /**
   * Handle simple queries with fast model and L2 memory
   */
  private async handleSimpleQuery(query: string, startTime: number): Promise<OrchestrationResult> {
    try {
      // Check L2 cache first (system RAM)
      const l2CacheKey = `L2_SIMPLE:${this.hashQuery(query)}`;
      const l2Cached = await this.memoryManager.checkL2Cache(l2CacheKey);
      
      if (l2Cached) {
        return {
          answer: l2Cached,
          model_used: 'L2_cache',
          cache_hit: true,
          memory_bank_used: 'L2_SYSTEM_RAM',
          response_time_ms: Date.now() - startTime,
          cost_saved: 0.02
        };
      }

      const response = await fetch(`${this.clients.fast_router.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.clients.fast_router.model,
          messages: [{ role: 'user', content: query }],
          max_tokens: 512,
          temperature: 0.3
        })
      });

      const data = await response.json();
      const answer = data.choices[0]?.message?.content || 'Unable to process query';
      
      // Cache in L2 for rapid access
      await this.memoryManager.storeL2Cache(l2CacheKey, answer);
      
      return {
        answer,
        model_used: 'gemma-3-270m',
        cache_hit: false,
        memory_bank_used: 'L1_GPU_VRAM',
        response_time_ms: Date.now() - startTime,
        cost_saved: 0
      };
    } catch (error) {
      return {
        answer: 'Error processing simple query',
        model_used: 'error_fallback',
        cache_hit: false,
        memory_bank_used: 'none',
        response_time_ms: Date.now() - startTime,
        cost_saved: 0
      };
    }
  }

  /**
   * Handle complex legal queries with specialized model
   */
  private async handleComplexLegalQuery(
    query: string, 
    context: any[] = [], 
    startTime: number
  ): Promise<OrchestrationResult> {
    try {
      // Build enhanced legal prompt with context
      const enhancedPrompt = this.buildLegalPrompt(query, context);
      
      const response = await fetch(`${this.clients.legal_expert.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.clients.legal_expert.model,
          messages: [{ role: 'user', content: enhancedPrompt }],
          max_tokens: 2048,
          temperature: 0.1
        })
      });

      const data = await response.json();
      const answer = data.choices[0]?.message?.content || 'Unable to process legal query';
      
      return {
        answer,
        model_used: 'gemma-3-legal-2b',
        cache_hit: false,
        memory_bank_used: 'L1_GPU_VRAM_EXPERT',
        response_time_ms: Date.now() - startTime,
        cost_saved: 0
      };
    } catch (error) {
      // Fallback to simple model for basic legal questions
      return await this.handleSimpleQuery(query, startTime);
    }
  }

  /**
   * Handle embedding generation requests
   */
  private async handleEmbeddingQuery(query: string, startTime: number): Promise<OrchestrationResult> {
    try {
      const response = await fetch(`${this.clients.embedding_service.baseUrl}/embeddings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'embeddinggemma:latest',
          prompt: query
        })
      });

      const data = await response.json();
      const embedding = data.embedding;
      
      return {
        answer: `Generated embedding with ${embedding?.length || 0} dimensions`,
        model_used: 'embeddinggemma',
        cache_hit: false,
        memory_bank_used: 'L1_GPU_EMBEDDING',
        response_time_ms: Date.now() - startTime,
        cost_saved: 0
      };
    } catch (error) {
      return {
        answer: 'Error generating embedding',
        model_used: 'error_fallback',
        cache_hit: false,
        memory_bank_used: 'none',
        response_time_ms: Date.now() - startTime,
        cost_saved: 0
      };
    }
  }

  /**
   * Build enhanced legal prompt with context
   */
  private buildLegalPrompt(query: string, context: any[]): string {
    const contextStr = context?.length 
      ? `\n\nRelevant Context:\n${context.map(c => `- ${c.content || c}`).join('\n')}`
      : '';

    return `You are a specialized legal AI assistant. Provide accurate, comprehensive legal analysis.

IMPORTANT: Always include relevant legal principles, cite applicable laws when possible, and provide balanced analysis.

Query: ${query}${contextStr}

Legal Analysis:`;
  }

  /**
   * Generate cache key with Nintendo-style hashing
   */
  private generateCacheKey(query: string, context?: any[]): string {
    const contextHash = context?.length ? this.hashQuery(JSON.stringify(context)) : '';
    const queryHash = this.hashQuery(query);
    return `LEGAL_QUERY:${queryHash}${contextHash ? ':' + contextHash : ''}`;
  }

  /**
   * Simple hash function for Nintendo-style bank switching
   */
  private hashQuery(input: string): string {
    let hash = 0;
    for (let i = 0; i < input.length; i++) {
      const char = input.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(36).substring(0, 8);
  }

  /**
   * Health check for all services
   */
  async checkServiceHealth(): Promise<Record<string, boolean>> {
    const health: Record<string, boolean> = {};
    
    for (const [service, client] of Object.entries(this.clients)) {
      try {
        const response = await fetch(client.healthEndpoint, { 
          method: 'GET',
          timeout: 5000 
        } as RequestInit);
        health[service] = response.ok;
      } catch {
        health[service] = false;
      }
    }
    
    return health;
  }
}

// Export singleton instance
export const legalAIOrchestrator = new LegalAIOrchestrator();
