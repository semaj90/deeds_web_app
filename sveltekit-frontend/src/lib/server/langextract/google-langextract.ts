// This module uses Google's Gemma model, served locally via Ollama.
import { OLLAMA_BASE_URL } from '$env/static/private';

/**
 * Extract keywords from text using Ollama
 */
export async function extractKeywords(text: string): Promise<string[]> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    try {
        const limitedText = text.slice(0, 8000);
        const prompt = `Extract the most important legal and factual keywords from this legal document.
Return ONLY a comma-separated list of keywords.
Limit to 15-20 keywords.
Document:
${limitedText}
Keywords:`;

        const response = await fetch(`${OLLAMA_BASE_URL}/api/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: 'gemma3:270m',
                prompt,
                stream: false,
                options: { temperature: 0.3, num_predict: 200 }
            }),
            signal: controller.signal
        });

        if (!response.ok) {
            console.warn('⚠️ Ollama error:', response.statusText);
            return extractKeywordsFallback(text);
        }

        const data: any = await response.json();
        const rawKeywords = data?.response ?? '';

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
    } finally {
        clearTimeout(timeoutId);
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
