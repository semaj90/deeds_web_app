// This module uses Google's official LangExtract library via the Python service.
// The service runs on port 8095 and uses the active llama-server text model for
// legacy keyword fallback when the structured extractor is unavailable.
import { langextractFetch } from '$lib/server/langextract-client.js';
import { ENV } from '$lib/server/env.server.js';
import { bifrostChat } from '$lib/server/ollama.js';

/**
 * Extract keywords from text using the LangExtract service.
 * Falls back to regex extraction if service unavailable.
 */
export async function extractKeywords(text: string): Promise<string[]> {
    try {
        // Try the LangExtract service first (more accurate, with health/URL resolution)
        const response = await langextractFetch('/extract', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                text: text.slice(0, 15000),
                extraction_type: 'legal',
                extraction_passes: 1,
                temperature: 0.3,
            }),
            signal: AbortSignal.timeout(10_000),
        });

        if (response?.ok) {
            const data = await response.json();
            // Extract unique keywords from entity texts
            const keywords = new Set<string>();
            for (const extraction of data.extractions || []) {
                if (extraction.extraction_text) {
                    keywords.add(extraction.extraction_text);
                }
            }
            if (keywords.size > 0) {
                return Array.from(keywords).slice(0, 20);
            }
        }
    } catch {
        // Fall through to legacy method
    }

    // Legacy fallback: direct llama-server call
    return extractKeywordsLegacy(text);
}

/**
 * Legacy keyword extraction via direct llama-server call.
 * Used when LangExtract service is unavailable.
 */
async function extractKeywordsLegacy(text: string): Promise<string[]> {
    try {
        const limitedText = text.slice(0, 8000);
        const prompt = `Extract the most important legal and factual keywords from this legal document.
Return ONLY a comma-separated list of keywords.
Limit to 15-20 keywords.
Document:
${limitedText}
Keywords:`;

        const rawKeywords = await bifrostChat(
            [{ role: 'user', content: prompt }],
            'gemma4-legal-iq4xs-direct.gguf',
            { temperature: 0.3, maxTokens: 200, timeoutMs: 5_000 }
        ).catch((err) => {
            console.warn('⚠️ llama-server error:', err);
            return '';
        });

        if (!rawKeywords) {
            return extractKeywordsFallback(text);
        }

        const keywords = rawKeywords
            .split(',')
            .map((k: string) => k.trim())
            .filter((k: string) => k.length > 0 && k.length < 100)
            .slice(0, 20);

        if (keywords.length === 0) {
            return extractKeywordsFallback(text);
        }
        return keywords;

    } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
            console.warn('⚠️ Gemma keyword extraction timed out');
        } else {
            console.warn('⚠️ Gemma keyword extraction failed:', error);
        }
        return extractKeywordsFallback(text);
    }
}

function extractKeywordsFallback(text: string): string[] {
    const keywords = new Set<string>();

    // Capitalized phrases
    const capitalizedRegex = /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g;
    const capitalizedMatches = text.match(capitalizedRegex) || [];
    capitalizedMatches.slice(0, 10).forEach(k => keywords.add(k));

    // Common legal terms
    const legalTerms = [
        'plaintiff', 'defendant', 'appellant', 'respondent',
        'contract', 'agreement', 'liability', 'damages',
        'court', 'jurisdiction', 'judgment', 'verdict',
        'evidence', 'testimony'
    ];

    legalTerms.forEach(term => {
        if (new RegExp(`\\b${term}\\b`, 'gi').test(text)) {
            keywords.add(term);
        }
    });

    return Array.from(keywords).slice(0, 20);
}
