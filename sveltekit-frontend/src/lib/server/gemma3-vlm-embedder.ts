/**
 * Gemma-3 VLM Embedder Service
 * Generates multimodal embeddings using Gemma-3 Vision Language Model via Ollama.
 * Falls back to text-only embedding when VLM unavailable.
 *
 * Uses 768-dim embeddings (EmbeddingGemma) for consistency with Qdrant collections.
 */

import { ENV } from '$lib/server/env.server.js';

export interface VLMEmbeddingResult {
	embedding: number[];
	modality: 'text' | 'vision' | 'layout' | 'multimodal';
	confidence: number;
	metadata: {
		model: string;
		quantization: string;
		dimension: number;
		processingTimeMs: number;
	};
}

export interface MultimodalContent {
	text?: string;
	imageBase64?: string;
	layoutBoxes?: Array<{
		type: string;
		bbox: [number, number, number, number];
		content: string;
	}>;
	ocrText?: string;
	seals?: Array<{
		type: string;
		confidence: number;
		bbox: [number, number, number, number];
	}>;
}

const EMBEDDING_DIMENSION = 768;
const VLM_MODEL = 'gemma3-legal:latest';
const EMBEDDING_MODEL = 'embeddinggemma:latest';

/**
 * Generate a multimodal embedding by:
 * 1. Using Gemma3 VLM to generate a text description of the visual content
 * 2. Embedding that text description via EmbeddingGemma (768-dim)
 */
export async function generateVLMEmbedding(content: MultimodalContent): Promise<VLMEmbeddingResult> {
	const startTime = Date.now();
	const ollamaUrl = ENV.OLLAMA_BASE_URL;

	try {
		// Build a text representation from all available modalities
		const textParts: string[] = [];

		if (content.text) {
			textParts.push(content.text);
		}

		if (content.ocrText) {
			textParts.push(`OCR text: ${content.ocrText}`);
		}

		if (content.layoutBoxes?.length) {
			const layoutDesc = content.layoutBoxes
				.map((b) => `${b.type}: ${b.content}`)
				.join('; ');
			textParts.push(`Layout: ${layoutDesc}`);
		}

		if (content.seals?.length) {
			const sealDesc = content.seals
				.map((s) => `${s.type} (confidence: ${s.confidence.toFixed(2)})`)
				.join(', ');
			textParts.push(`Detected seals: ${sealDesc}`);
		}

		// If we have an image, use Gemma3 VLM to generate a caption
		if (content.imageBase64) {
			try {
				const vlmRes = await fetch(`${ollamaUrl}/api/generate`, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						model: VLM_MODEL,
						prompt: 'Describe this image in detail for legal analysis. Include: people, objects, text, setting, and any notable features.',
						images: [content.imageBase64],
						stream: false,
						options: { temperature: 0.3, num_predict: 200 }
					}),
					signal: AbortSignal.timeout(15000)
				});

				if (vlmRes.ok) {
					const vlmData = await vlmRes.json();
					if (vlmData.response) {
						textParts.push(`VLM caption: ${vlmData.response}`);
					}
				}
			} catch {
				// VLM unavailable — continue with text-only
			}
		}

		const combinedText = textParts.join('\n').slice(0, 8000);
		if (!combinedText) {
			return createEmptyResult(startTime);
		}

		// Generate 768-dim embedding via EmbeddingGemma
		const embedding = await generateOllamaEmbedding(combinedText, ollamaUrl);

		return {
			embedding,
			modality: content.imageBase64 ? 'multimodal' : 'text',
			confidence: embedding.length === EMBEDDING_DIMENSION ? 0.9 : 0,
			metadata: {
				model: VLM_MODEL,
				quantization: 'Q4_K_M',
				dimension: EMBEDDING_DIMENSION,
				processingTimeMs: Date.now() - startTime
			}
		};
	} catch (err) {
		console.warn('[VLM-Embedder] Embedding failed:', err);
		return createEmptyResult(startTime);
	}
}

/**
 * Generate a text-only embedding via EmbeddingGemma (768-dim).
 */
export async function generateTextEmbedding(text: string): Promise<VLMEmbeddingResult> {
	const startTime = Date.now();
	const ollamaUrl = ENV.OLLAMA_BASE_URL;

	try {
		const embedding = await generateOllamaEmbedding(text, ollamaUrl);

		return {
			embedding,
			modality: 'text',
			confidence: embedding.length === EMBEDDING_DIMENSION ? 0.95 : 0,
			metadata: {
				model: EMBEDDING_MODEL,
				quantization: 'BF16',
				dimension: EMBEDDING_DIMENSION,
				processingTimeMs: Date.now() - startTime
			}
		};
	} catch (err) {
		console.warn('[VLM-Embedder] Text embedding failed:', err);
		return createEmptyResult(startTime);
	}
}

/** Call Ollama embeddings API and return the vector. */
async function generateOllamaEmbedding(text: string, ollamaUrl: string): Promise<number[]> {
	const res = await fetch(`${ollamaUrl}/api/embeddings`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			model: EMBEDDING_MODEL,
			prompt: text.slice(0, 8000)
		}),
		signal: AbortSignal.timeout(10000)
	});

	if (!res.ok) {
		throw new Error(`Ollama embedding API ${res.status}`);
	}

	const data = await res.json();
	return data?.embedding ?? [];
}

function createEmptyResult(startTime: number): VLMEmbeddingResult {
	return {
		embedding: new Array(EMBEDDING_DIMENSION).fill(0),
		modality: 'text',
		confidence: 0,
		metadata: {
			model: 'fallback',
			quantization: 'none',
			dimension: EMBEDDING_DIMENSION,
			processingTimeMs: Date.now() - startTime
		}
	};
}
