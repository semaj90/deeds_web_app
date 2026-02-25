/**
 * LLM Service
 * Handles Gemma3-Legal inference for summary generation
 * Enforces legal constraints and verification requirements
 */

import type { Citation } from '$lib/types/case-summary';
import { verificationService } from './verification.service.js';

interface SummaryContext {
  caseId: string;
	charges: string[];
  evidence: string;
	statutes: Array<{ code: string;
	jurisdiction: string, title: string }>;
  caseLaw: Array<{
	title: string, summary: string }>;
}

interface GeneratedSummary {
  overview: string;
	issueStatement: string;
  holding: string;
	ruleExtraction: string;
  keyTerms: string[];
	citations: Citation[];
}

export class LLMService {
  private ollamaUrl: string;
  private model: string = 'gemma3-legal:latest';

  constructor() {
    this.ollamaUrl = process.env?.OLLAMA_URL ?? 'http://localhost:11434';
  }

  /**
   * Generate a summary from case context
   */
  async generateSummary(context: SummaryContext): Promise<GeneratedSummary> {
    try {
      const prompt = this.buildSummaryPrompt(context);
      const response = await this.callOllama(prompt);

      return this.parseSummaryResponse(response);
    } catch (error) {
      console.error('Error generating summary:', error);
      throw error;
    }
  }

  /**
   * Extract citations from text
   */
  async extractCitations(text: string): Promise<Citation[]> {
    try {
      const prompt = `Extract all legal citations from the following text. Return as JSON array with format:
[{"code": "statute code", "jurisdiction": "state/federal", "title": "statute title"}]

Text:
${text}

Return only valid JSON array.`;

      const response = await this.callOllama(prompt);
      return this.parseCitations(response);
    } catch (error) {
      console.error('Error extracting citations:', error);
      return [];
    }
  }

  /**
   * Extract holding statement
   */
  async extractHolding(text: string): Promise<string> {
    try {
      const prompt = `Extract the main legal holding or ruling from the following text.
Provide a concise statement of the legal principle established.

Text:
${text}`;

      const response = await this.callOllama(prompt);
      return response.trim();
    } catch (error) {
      console.error('Error extracting holding:', error);
      return '';
    }
  }

  /**
   * Build summary generation prompt
   */
  private buildSummaryPrompt(context: SummaryContext): string {
    const statuteText = context.statutes
      .map((s) => `${s.code} (${s.jurisdiction}): ${s.title}`)
      .join('\n');

    const caseLawText = context.caseLaw.map((c) => `${c.title}: ${c.summary}`).join('\n');

    // Add legal constraints
    const legalConstraints = `⚖️ LEGAL CONSTRAINTS - YOU MUST FOLLOW THESE RULES:

✔ YOU CAN:
- Summarize sentencings, judgments, motions, complaints
- Report what happened in similar cases
- Provide statute & penalty comparisons
- Compute cosine similarity rankings
- Rank cases using inverse PageRank precedence

❌ YOU CANNOT:
- Infer guilt or criminal liability
- Make charging recommendations
- State "defendant should be convicted"
- Estimate sentencing before conviction (only describe sentencings from similar cases)
- Use non-government sources for charging logic

Remember: You are providing CONTEXT ONLY, not legal advice or charging authority.
`;

    return `${legalConstraints}

You are a legal expert. Generate a comprehensive case summary based on the following information: CASE, ID: ${context.caseId}
CHARGES: ${context.charges.join(', ')}

EVIDENCE:
${context.evidence}

RELEVANT STATUTES:
${statuteText}

RELEVANT CASE LAW:
${caseLawText}

Generate a structured summary with the following JSON format:
{
  "overview": "Brief overview of the case",
  "issueStatement": "The main legal issue(s)",
  "holding": "The legal principle or ruling",
  "ruleExtraction": "Key legal rules extracted",
  "keyTerms": ["term1", "term2", ...],
  "citations": [
    {"code": "PC 273a", "jurisdiction": "CA", "title": "Child Endangerment"},
	...
  ]
}

Return only valid JSON.`;
  }

  /**
   * Call Ollama API
   */
  private async callOllama(prompt: string): Promise<string> {
    try {
      const response = await fetch(`${this.ollamaUrl}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
	body: JSON.stringify({
	model: this.model,
          prompt: prompt,
          stream: false,
          options: {
	temperature: 0.3,
            top_p: 0.9,
            top_k: 40,
          },
	}),
      });

      if (!response.ok) {
        throw new Error(`Ollama API error: ${response.statusText}`);
      }

      const data = await response.json();
      return data?.response ?? '';
    } catch (error) {
      console.error('Error calling Ollama:', error);
      throw error;
    }
  }

  /**
   * Parse summary response from LLM
   */
  private parseSummaryResponse(response: string): GeneratedSummary {
    try {
      // Validate response against legal constraints
      const validation = verificationService.validateAIResponse(response);
      if (!validation.valid) {
        console.warn('AI response violated legal constraints:', validation.violations);
        throw new Error(`Legal constraint violation: ${validation.violations.join(', ')}`);
      }

      // Extract JSON from response
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }

      const parsed = JSON.parse(jsonMatch[0]);

      return {
        overview: parsed?.overview ?? '',
        issueStatement: parsed?.issueStatement ?? '',
        holding: parsed?.holding ?? '',
        ruleExtraction: parsed?.ruleExtraction ?? '',
        keyTerms: parsed?.keyTerms || [],
        citations: parsed?.citations || [],
      };
    } catch (error) {
      console.error('Error parsing summary response:', error);
      return {
        overview: '',
        issueStatement: '',
        holding: '',
        ruleExtraction: '',
        keyTerms: [],
        citations: [],
      };
    }
  }

  /**
   * Parse citations from response
   */
  private parseCitations(response: string): Citation[] {
    try {
      const jsonMatch = response.match(/\[[\s\S]*\]/);
      if (!jsonMatch) {
        return [];
      }

      const parsed = JSON.parse(jsonMatch[0]);
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      console.error('Error parsing citations:', error);
      return [];
    }
  }
}

export const llmService = new LLMService();

