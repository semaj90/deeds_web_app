/**
 * Multi-Modal Fusion Helper
 *
 * Combines VLM caption, OCR text, and extracted entities into a unified
 * document representation with weighted signal merging.
 *
 * Usage:
 *   const fused = await fuseVLMResults(vlmCaption, ocrText, entities);
 */

import { ENV } from '$lib/server/env.server.js';
import { traceEmbedding } from '$lib/server/observability/langfuse.js';

export interface FusedResult {
	summary: string;
	keywords: string[];
	embedding: number[];
	confidence: number;
	sources: {
		vlm: boolean;
		ocr: boolean;
		entities: boolean;
	};
}

const EMBEDDING_MODEL = ENV.OLLAMA_EMBED_MODEL;

// Signal weights for fusion
const WEIGHTS = {
	vlm: 0.5,
	ocr: 0.3,
	entities: 0.2
} as const;

/**
 * Fuse multiple analysis signals into a unified representation.
 *
 * @param vlmCaption - Caption from VLM analysis (may be null)
 * @param ocrText - OCR-extracted text (may be null)
 * @param entities - Extracted entities (names, dates, etc.)
 * @returns Fused result with combined embedding and keywords
 */
export async function fuseVLMResults(
	vlmCaption: string | null,
	ocrText: string | null,
	entities: string[]
): Promise<FusedResult> {
	const parts: Array<{ text: string; weight: number }> = [];

	if (vlmCaption?.trim()) {
		parts.push({ text: vlmCaption.trim(), weight: WEIGHTS.vlm });
	}
	if (ocrText?.trim()) {
		parts.push({ text: ocrText.trim(), weight: WEIGHTS.ocr });
	}
	if (entities.length > 0) {
		parts.push({ text: entities.join(', '), weight: WEIGHTS.entities });
	}

	if (parts.length === 0) {
		return {
			summary: '',
			keywords: [],
			embedding: [],
			confidence: 0,
			sources: { vlm: false, ocr: false, entities: false }
		};
	}

	// Build weighted summary
	const summary = parts.map((p) => p.text).join('\n');

	// Extract keywords from all sources
	const keywords = extractKeywords(summary);

	// Generate embedding from the combined text
	const embedding = await generateFusedEmbedding(summary);

	// Calculate confidence based on source availability and weights
	const totalWeight = parts.reduce((sum, p) => sum + p.weight, 0);
	const confidence = Math.min(totalWeight / 1.0, 1.0);

	return {
		summary: summary.slice(0, 500),
		keywords,
		embedding,
		confidence,
		sources: {
			vlm: !!vlmCaption?.trim(),
			ocr: !!ocrText?.trim(),
			entities: entities.length > 0
		}
	};
}

/** Generate embedding for the fused text via Ollama. */
async function generateFusedEmbedding(text: string): Promise<number[]> {
	try {
		return await traceEmbedding(text, EMBEDDING_MODEL, async () => {
			const ollamaUrl = ENV.OLLAMA_BASE_URL;
			const res = await fetch(`${ollamaUrl}/api/embeddings`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					model: EMBEDDING_MODEL,
					prompt: text.slice(0, 8000)
				}),
				signal: AbortSignal.timeout(10000)
			});

			if (!res.ok) return [];

			const data = await res.json();
			return data?.embedding ?? [];
		});
	} catch {
		return [];
	}
}

/** Extract keywords from text using simple tokenization + filtering. */
function extractKeywords(text: string): string[] {
	const stopWords = new Set([
		'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been',
		'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would',
		'could', 'should', 'may', 'might', 'shall', 'can', 'to', 'of',
		'in', 'for', 'on', 'with', 'at', 'by', 'from', 'as', 'and',
		'or', 'not', 'but', 'if', 'then', 'than', 'that', 'this', 'it'
	]);

	const words = text
		.toLowerCase()
		.replace(/[^\w\s]/g, '')
		.split(/\s+/)
		.filter((w) => w.length > 2 && !stopWords.has(w));

	// Count frequencies
	const freq = new Map<string, number>();
	for (const w of words) {
		freq.set(w, (freq.get(w) ?? 0) + 1);
	}

	// Return top 10 by frequency
	return Array.from(freq.entries())
		.sort((a, b) => b[1] - a[1])
		.slice(0, 10)
		.map(([word]) => word);
}
