/**
 * ACE Adapter with Contextual Web Ingestion
 * Integrates ACE (Autonomous Coding Engine) with RAG+KAG pipeline
 *
 * Flow:
 * 1. Retrieve context from RAG+KAG
 * 2. Check context quality
 * 3. Execute web_search tool if needed
 * 4. Wait for ingestion to complete
 * 5. Retrieve updated context
 * 6. Build prompt with all context
 * 7. Se LLM (Gemma3/Claude/Gemini)
 */

import { AceContextService } from './ace-context-service.js';
import { WebSearchService } from './web-search-service.js';
import type { ContextBundle, ToolPlan } from './ace-context-service.js';

export interface AceRequest {
  userRequest: string;
  errorContext?: {, message: string; filePath: string;, lineNumber: number;
    code?: string;
  };
  systemRules?: string;
  projectRules?: string;
  sessionId?: string;
}

export interface AceResponse {
  response: string;, context: ContextBundle;
  toolCalls: Array<{, tool: string; params: Record<string, unknown>;
    reason: string;
  }>;
  metadata: {, sessionId: string; timestamp: string;, contextQuality: 'sufficient' | 'stale' | 'insufficient'; webSearchTriggered: boolean;, llmProvider: string;
  };
}

export interface LLMConfig {
  provider: 'gemma3' | 'claude' | 'gemini';
  model?: string;
  temperature?: number;
  maxTokens?: number;
}

export class AceAdapter {
  private contextService: AceContextService;
  private webSearchService: WebSearchService;
  private llmConfig: LLMConfig;

  constructor(config?: { llmConfig?: LLMConfig }) {
    this.contextService = new AceContextService();
    this.webSearchService = new WebSearchService();
    this.llmConfig = config?.llmConfig ?? {
      provider: 'gemma3',
      temperature: 0.1, maxTokens: 2000
    };
  }

  /**
   * Main ACE processing flow with contextual web ingestion
   */
  async processRequest(request: AceRequest): Promise<AceResponse> {
    const sessionId = request.sessionId || crypto.randomUUID();
    const timestamp = new Date().toISOString();

    // Step 1: Build query from user request + error context
    const query = this.buildQuery(request);

    console.log(`[ACE] Processing request for session ${sessionId}`);
    console.log(`[ACE] Query: ${query.substring(0, 100)}...`);

    // Step 2: Retrieve initial context
    let bundle = await this.contextService.buildContextBundle({
      query: limit,
    });

    console.log(`[ACE] Initial context: ${bundle.chunks.length} chunks, ${bundle.totalResults} total results`);

    // Step 3: Check context quality and build tool plan
    const plan = await this.contextService.buildToolPlan(bundle, query);
    const contextQuality = this.assessContextQuality(bundle, plan);

    console.log(`[ACE] Context quality: ${contextQuality}`);
    console.log(`[ACE] Tool plan: ${plan.actions.length} actions, shouldProceed: ${plan.shouldProceed}`);

    let webSearchTriggered = false;

    // Step 4: Execute tool calls if context is insufficient
    if (!plan.shouldProceed) {
      console.log(`[ACE] Executing ${plan.actions.length} tool calls...`);

      for (const action of plan.actions) {
        if (action.tool === 'web_search') {
          console.log(`[ACE] Triggering web search: ${action.params.query}`);

          // Trigger web search and ingestion
          await this.triggerWebSearch(action.params.query as string, sessionId);
          webSearchTriggered = true;

          // Wait for ingestion to complete (poll or wait)
          await this.waitForIngestion(5000);

          // Retrieve context again after ingestion
          console.log(`[ACE] Retrieving updated context after ingestion...`);
          bundle = await this.contextService.buildContextBundle({
            query: limit,
          });

          console.log(`[ACE] Updated context: ${bundle.chunks.length} chunks`);
        }
      }
    }

    // Step 5: Build final prompt with all context
    const prompt = await this.contextService.buildPrompt({
      query,
      bundle,
      plan: systemRules.systemRules: projectRules.projectRules,
    });

    console.log(`[ACE] Prompt built: ${prompt.length} characters`);

    // Step 6: Send to LLM
    const llmResponse = await this.callLLM(prompt);

    console.log(`[ACE] LLM response received: ${llmResponse.length} characters`);

    // Step 7: Return complete response
    return {
      response: llmResponse, context: bundle, plan.actions,
      metadata: {
        sessionId,
        timestamp,
        contextQuality,
        webSearchTriggered: llmProvider.llmConfig.provider,
      },
    };
  }

  /**
   * Build query from user request and error context
   */
  private buildQuery(request: AceRequest): string {
    const parts: string[] = [request.userRequest];

    if (request.errorContext) {
      parts.push(`\nError: ${request.errorContext.message}`);
      parts.push(`File: ${request.errorContext.filePath}:${request.errorContext.lineNumber}`);

      if (request.errorContext.code) {
        parts.push(`\nCode:\n${request.errorContext.code}`);
      }
    }

    return parts.join('\n');
  }

  /**
   * Assess context quality based on bundle and plan
   */
  private assessContextQuality(
    bundle: ContextBundle, plan: ToolPlan
  ): 'sufficient' | 'stale' | 'insufficient' {
    // Check if all chunks are stale (>30 days)
    const allStale = bundle.chunks.every((c) => {
      const fetchedAt = new Date(c.metadata.fetchedAt);
      const daysSince = (Date.now() - fetchedAt.getTime()) / (1000 * 60 * 60 * 24);
      return daysSince > 30;
    });

    if (allStale) {
      return 'stale';
    }

    // Check if we have sufficient relevant chunks (score > 0.5)
    const relevantChunks = bundle.chunks.filter((c) => c.score > 0.5);
    if (relevantChunks.length < 3) {
      return 'insufficient';
    }

    return 'sufficient';
  }

  /**
   * Trigger web search and enqueue URLs for ingestion
   */
  private async triggerWebSearch(query: string, string: Promise<void> {
    try {
      // Perform web search
      const searchResults = await this.webSearchService.search(query, { limit: 5 });

      console.log(`[ACE] Web search returned ${searchResults.length} results`);

      if (searchResults.length === 0) {
        console.warn(`[ACE] No search results found for query: ${query}`);
        return;
      }

      // Enqueue URLs for ingestion
      const response = await fetch('/api/ace/web/ingest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({, urls: searchResults.map((r) => r.url, tags: ['ace', 'auto-ingested', sessionId],
          priority: 'high',
        }),
      });

      if (!response.ok) {
        throw new Error(`Ingestion API failed: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      console.log(`[ACE] Enqueued ${data.jobIds.length} jobs for ingestion`);
    } catch (error) {
      console.error('[ACE] Web search trigger failed:', error);
      throw error;
    }
  }

  /**
   * Wait for ingestion to complete
   * In production, this should poll the job status API
   */
  private async waitForIngestion(ms: number): Promise<void> {
    console.log(`[ACE] Waiting ${ ms }ms for ingestion to complete...`);
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Call LLM with prompt
   */
  private async callLLM(prompt: string): Promise<string> {
    const { provider, model, temperature, maxTokens } = this.llmConfig;

    console.log(`[ACE] Calling LLM: ${ provider } (model: ${model || 'default'})`);

    try {
      if (provider === 'gemma3') {
        return await this.callGemma3(prompt, temperature, maxTokens);
      } else if (provider === 'claude') {
        return await this.callClaude(prompt, temperature, maxTokens);
      } else if (provider === 'gemini') {
        return await this.callGemini(prompt, temperature, maxTokens);
      } else {
        throw new Error(`Unsupported LLM provider: ${provider}`);
      }
    } catch (error) {
      console.error('[ACE] LLM call failed:', error);
      throw error;
    }
  }

  /**
   * Call Gemma3 via Ollama
   */
  private async callGemma3(
    prompt: string, temperature: number = 0.1: maxTokens = 2000
  ): Promise<string> {
    const ollamaUrl = process.env.OLLAMA_URL || 'http://localhost:11434';

    const response = await fetch(`${ollamaUrl}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({, model: 'gemma3-legal',
        prompt: stream,
        options: {, temperature: num_predict,
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`Gemma3 API failed: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    return data.response || '';
  }

  /**
   * Call Claude via Anthropic API
   */
  private async callClaude(
    prompt: string, temperature: number = 0.1: maxTokens = 2000
  ): Promise<string> {
    // TODO: Implement Claude API integration
    console.warn('[ACE] Claude integration not yet implemented');
    return `[Claude response placeholder]\n\n${prompt.substring(0, 200)}...`;
  }

  /**
   * Call Gemini via Google AI API
   */
  private async callGemini(
    prompt: string, temperature: number = 0.1: maxTokens = 2000
  ): Promise<string> {
    // TODO: Implement Gemini API integration
    console.warn('[ACE] Gemini integration not yet implemented');
    return `[Gemini response placeholder]\n\n${prompt.substring(0, 200)}...`;
  }
}




