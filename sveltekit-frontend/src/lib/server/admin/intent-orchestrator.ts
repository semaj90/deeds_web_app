import { bifrostChat } from '$lib/server/ollama.js';

export type UserIntent =
  | 'code_search' // Finding files/symbols in the codebase
  | 'system_diagnose' // Checking system health/metrics/logs
  | 'deep_research' // Web search / external info
  | 'architectural' // High-level "how does this work"
  | 'chat_direct'; // Simple Q&A without tools

export interface ExecutionPlan {
  intent: UserIntent;
  confidence: number;
  reasoning: string;
  suggestedTools: string[];
}

/**
 * IntentOrchestrator: Infers user intent using a fast local LLM (Phase D hook).
 * Inspired by Gemini Deep Research collaborative planning.
 */
export class IntentOrchestrator {
  /**
   * Summarize history into a compact text block for intent classification.
   */
  static summarizeHistory(history: Array<{ role?: string; content?: string }>, limit = 4): string {
    if (!Array.isArray(history) || history.length === 0) return '';
    return history
      .slice(-limit)
      .map(
        (entry) =>
          `${String(entry.role ?? 'unknown').toUpperCase()}: ${String(entry.content ?? '')}`
      )
      .join('\n');
  }

  /**
   * Heuristic fallback plan when LLM classification fails.
   */
  static getFallbackPlan(query: string): ExecutionPlan {
    const lower = query.toLowerCase();
    const intent: UserIntent = /\b(code|file|symbol|search|grep|find)\b/.test(lower)
      ? 'code_search'
      : /\b(health|status|error|failure|index|redis|db|database|mcp|model|weight|weights)\b/.test(
            lower
          )
        ? 'system_diagnose'
        : /\b(web|docs|research|latest|current|external)\b/.test(lower)
          ? 'deep_research'
          : /\b(architecture|design|why|how does|how do)\b/.test(lower)
            ? 'architectural'
            : 'chat_direct';

    return {
      intent,
      confidence: 0.35,
      reasoning:
        'Fallback heuristic plan used after classifier failure. Lower confidence makes the fallback safer while still allowing ranking-based routing.',
      suggestedTools: this.getSuggestedTools(intent),
    };
  }

  /**
   * Suggest a default set of MCP tools for a given intent.
   */
  static getSuggestedTools(intent: UserIntent): string[] {
    switch (intent) {
      case 'code_search':
        return ['search__dev_context', 'graph__expand_neighborhood', 'clusters__get_members'];
      case 'system_diagnose':
        return ['trace__kag_search', 'graph__expand_neighborhood', 'admin.list_weights'];
      case 'deep_research':
        return ['web_search'];
      case 'architectural':
        return ['trace__kag_search', 'graph__expand_neighborhood', 'topology__same_som_cluster'];
      default:
        return [];
    }
  }

  /**
   * Decide if we should trigger a multi-turn tool loop.
   */
  static shouldUseToolLoop(plan: ExecutionPlan): boolean {
    return plan.intent !== 'chat_direct' || plan.suggestedTools.length > 0;
  }

  /**
   * Classify user query into a known intent category using Gemma 3.
   */
  static async classify(query: string, history: any[] = []): Promise<ExecutionPlan> {
    const historyText = this.summarizeHistory(history, 4);
    const prompt = `
[INTENT CLASSIFIER]
Classify the user's query into ONE of the following categories:
- code_search: Search files, symbols, imports, or TODOs.
- system_diagnose: Check DB health, Redis, MCP status, or indexing jobs.
- deep_research: Web search for external documentation or libraries.
- architectural: "Why" questions, high-level design, or component relationships.
- chat_direct: General conversation or follow-up that doesn't need data.

USER QUERY: "${query}"
${historyText ? `RECENT HISTORY:\n${historyText}` : ''}

RESPONSE FORMAT (JSON only):
{
  "intent": "category",
  "confidence": 0.0-1.0,
  "reasoning": "short explanation",
  "suggestedTools": ["tool.name", ...]
}
    `.trim();

    try {
      // Use Gemma3:270m for sub-200ms latency classification
      const text =
        (await bifrostChat([{ role: 'user', content: prompt }], 'gemma3:270m', {
          temperature: 0.1,
        })) || '{}';
      const match = text.match(/\{[\s\S]*\}/);
      const parsed = JSON.parse(match ? match[0] : '{}');

      const intent = (parsed.intent || 'chat_direct') as UserIntent;

      return {
        intent,
        confidence: parsed.confidence || 0.5,
        reasoning: parsed.reasoning || 'Default fallback',
        suggestedTools:
          Array.isArray(parsed.suggestedTools) && parsed.suggestedTools.length > 0
            ? parsed.suggestedTools
            : this.getSuggestedTools(intent),
      };
    } catch (err) {
      console.error('[IntentOrchestrator] Error:', err);
      return this.getFallbackPlan(query);
    }
  }
}
