import { bifrostChat } from '$lib/server/ollama.js';
import { ENV } from '$lib/server/env.server.js';

export interface AdminRecommendation {
  id: string;
  title: string;
  description: string;
  action_type: 'tool_call' | 'ui_navigation' | 'manual_audit';
  payload?: any;
  confidence: number;
}

/**
 * RecommendationEngine
 * 
 * Synthesizes KAG retrieval, reranked context, and intent analysis 
 * into actionable AI recommendations for the Admin Copilot.
 */
export class RecommendationEngine {
  /**
   * Generate recommendations based on the current context.
   */
  static async generate(
    query: string,
    intent: string,
    rerankedContext: any[],
    history: any[]
  ): Promise<AdminRecommendation[]> {
    const prompt = `
[RECOMMENDATION ENGINE]
Based on the following context, suggest 3 highly-relevant administrative actions.
Format each as a JSON object with: id, title, description, action_type, and confidence.

INTENT: ${intent}
QUERY: ${query}

TOP RERANKED CONTEXT:
${JSON.stringify(rerankedContext.slice(0, 3), null, 2)}

RECENT HISTORY:
${history.slice(-3).map(h => `${h.role}: ${h.content}`).join('\n')}

OUTPUT (JSON Array):
`.trim();

    try {
      const res = await bifrostChat(
        [{ role: 'user', content: prompt }],
        ENV.GEMMA4_MODEL,
        { temperature: 0.3, maxTokens: 1024, cacheKey: `rec:${query.slice(0, 32)}` }
      );

      const match = res.match(/\[[\s\S]*\]/);
      if (!match) return [];
      
      const recs = JSON.parse(match[0]);
      return recs.map((r: any) => ({
        ...r,
        id: r.id || Math.random().toString(36).slice(2, 9)
      }));
    } catch (err) {
      console.error('[RecommendationEngine] Failed to generate:', err);
      return [];
    }
  }
}
