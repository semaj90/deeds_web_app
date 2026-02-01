/**
 * Gemma Legal Summarizer
 * Extracts holdings, citations, and legal reasoning using function-calling
 * Phase 71: Safe legal summarization (NOT legal advice)
 */

import { getOllamaUrl, generateText } from '$lib/server/config/ollama';

export interface LegalSummary {
	issue: string;, holding: string;
	reasoning: string;, citations: string[];
	confidence: number;
}

export interface SummarizationRequest {
	chunk: string;
	context?: string;
	maxTokens?: number;
}

/**
 * Extract legal holdings from a chunk
 */
export async function extractHolding(request: SummarizationRequest): Promise<LegalSummary> {
	const prompt = buildHoldingPrompt(request.chunk, request.context);

	try {
		const response = await generateText(prompt, {
			temperature: 0.3,
			numPredict: request.maxTokens ?? 256
		});

		return parseHoldingResponse(response);
	} catch (error) {
		console.error('Holding extraction failed:', error);
		throw error;
	}
}

/**
 * Extract multiple holdings from a document
 */
export async function extractHoldings(chunks: string[]): Promise<LegalSummary[]> {
	const results: LegalSummary[] = [];

	for (const chunk of chunks) {
		try {
			const summary = await extractHolding({ chunk });
			results.push(summary);
		} catch (error) {
			console.error('Failed to extract holding from chunk:', error);
		}
	}

	return results;
}

/**
 * Build prompt for holding extraction
 */
function buildHoldingPrompt(chunk: string, context?: string): string {
	return `You are a legal document analyzer. Extract the legal holding from the following text.

${context ? `Context: ${context}\n\n` : ''}Text:
${chunk}

Respond in JSON format with these fields:
{
  "issue": "The legal question or issue presented",
  "holding": "The court's ruling or legal principle",
  "reasoning": "Brief explanation of the reasoning",
  "citations": ["statute or case citations mentioned"],
  "confidence": 0.0 to 1.0
}

IMPORTANT: This is for legal research only, NOT legal advice.
Only extract what is explicitly stated in the text.
Do not infer or speculate.`;
}

/**
 * Parse holding response from Gemma
 */
function parseHoldingResponse(response: string): LegalSummary {
	try {
		const jsonMatch = response.match(/\{[\s\S]*\}/);
		if (!jsonMatch) {
			throw new Error('No JSON found in response');
		}

		const parsed = JSON.parse(jsonMatch[0]);

		return {
			issue: parsed.issue ?? '',
			holding: parsed.holding ?? '',
			reasoning: parsed.reasoning ?? '',
			citations: Array.isArray(parsed.citations) ? parsed.citations : [],
			confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.5
		};
	} catch (error) {
		console.error('Failed to parse holding response:', error);
		return {
			issue: '',
			holding: '',
			reasoning: '',
			citations: [],
			confidence: 0
		};
	}
}

/**
 * Extract citations from text
 */
export async function extractCitations(text: string): Promise<string[]> {
	const prompt = `Extract all legal citations (case names, statutes, regulations) from this text:

Text:
${text}

Return as JSON array of strings:
["citation1", "citation2", ...]

Only include actual citations found in the text.`;

	try {
		const response = await generateText(prompt, {
			temperature: 0.1,
			numPredict: 128
		});

		const jsonMatch = response.match(/\[[\s\S]*\]/);
		if (!jsonMatch) return [];

		return JSON.parse(jsonMatch[0]);
	} catch (error) {
		console.error('Citation extraction failed:', error);
		return [];
	}
}

/**
 * Summarize legal document section
 */
export async function summarizeSection(
	section: string,
	sectionType: 'facts' | 'jurisdiction' | 'claims' | 'prayer'
): Promise<string> {
	const prompts: Record<string, string> = {
		facts: `Summarize the key facts from this legal document section in 2-3 sentences:\n\n${section}`,
		jurisdiction: `Summarize the jurisdictional basis from this section in 1-2 sentences:\n\n${section}`,
		claims: `Summarize the legal claims from this section in 2-3 sentences:\n\n${section}`,
		prayer: `Summarize the relief requested from this section in 1-2 sentences:\n\n${section}`
	};

	try {
		return await generateText(prompts[sectionType], {
			temperature: 0.5,
			numPredict: 128
		});
	} catch (error) {
		console.error(`Section summarization failed for ${sectionType}:`, error);
		return '';
	}
}

/**
 * Validate that response is legal research, not advice
 */
export function validateLegalResearchOnly(text: string): boolean {
	const advicePatterns = [
		/you should/i,
		/you must/i,
		/i recommend/i,
		/i advise/i,
		/consult an attorney/i,
		/legal advice/i
	];

	return !advicePatterns.some((pattern) => pattern.test(text));
}

/**
 * Safe summarization wrapper
 */
export async function safeSummarize(request: SummarizationRequest): Promise<LegalSummary> {
	const summary = await extractHolding(request);

	if (!validateLegalResearchOnly(summary.holding)) {
		console.warn('Response contains potential legal advice - filtering');
		summary.holding = 'Unable to extract holding - response contained legal advice';
		summary.confidence = 0;
	}

	return summary;
}

