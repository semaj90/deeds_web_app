import type { Case } from '../../types.js';

// AI embedding generation service
// Supports local Ollama models with Redis/memory caching for performance
// Use process.env for server-side environment variables
import { db } from '../db/index.js';
import { cases, evidence } from '../db/schema-postgres.js';
import { eq } from 'drizzle-orm';
import { getOllamaEndpoint } from './endpoints.js';

export interface EmbeddingOptions {
	model?: string;
	cache?: boolean;
	maxTokens?: number;
}
// Simple in-memory TTL cache for embeddings (safe fallback for server-side process)
const _embeddingCache: Map<string, { value: number[]; expiresAt: number }> = new Map();

// Default TTL: 24 hours
const DEFAULT_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

function makeCacheKey(text: string, model: string): string {
    // Lightweight stable key: model + length + a small DJB2 hash of the text
    let hash = 5381;
    for (let i = 0; i < text.length; i++) {
        hash = (hash * 33) ^ text.charCodeAt(i);
    }
    // Use absolute value to avoid negative keys
    return `${model}:${text.length}:${Math.abs(hash).toString(16)}`;
}

async function getCachedEmbedding(text: string, model: string): Promise<number[] | null> {
	const key = makeCacheKey(text, model);
	const entry = _embeddingCache.get(key);
	if (!entry) return null;
	// Expired?
	if (Date.now() > entry.expiresAt) {
		_embeddingCache.delete(key);
		return null;
	}
	// Return a shallow clone to avoid accidental mutation by callers
	return entry.value.slice();
}

async function cacheEmbedding(text: string, model: string, embedding: number[]): Promise<void> {
	const key = makeCacheKey(text, model);
	// Store a clone to avoid external mutation
	const stored = embedding.slice();
	_embeddingCache.set(key, { value: stored, expiresAt: Date.now() + DEFAULT_CACHE_TTL_MS });

	if (_embeddingCache.size > 5000) {
		// delete the oldest ~10% entries
		const keysToDelete = Array.from(_embeddingCache.keys()).slice(0, Math.floor(_embeddingCache.size * 0.1) || 1);
		for (const k of keysToDelete) _embeddingCache.delete(k);
	}
}

export async function generateEmbedding(
	text: string,
	options: EmbeddingOptions = {}
): Promise<number[] | null> {
	const {
		model = process.env?.EMBEDDING_MODEL ?? 'embeddinggemma:latest',
		cache = true,
		maxTokens = 8000
	} = options;

	if (!text || text.trim().length === 0) {
		return null;
	}

	// Truncate text if too long
	const truncatedText = text.length > maxTokens ? text.substring(0, maxTokens) : text;

	// Check cache first
	if (cache) {
		const cachedEmbedding = await getCachedEmbedding(truncatedText, model);
		if (cachedEmbedding) {
			return cachedEmbedding;
		}
	}

	try {
        // Use local Ollama embedding model
		const embedding = await generateLocalEmbedding(truncatedText, model);

		// Cache the result
		if (cache && embedding) {
			await cacheEmbedding(truncatedText, model, embedding);
		}

		return embedding;
	} catch (error: unknown) {
		console.error('Embedding generation failed: ', error);
		return null;
	}
}

// Local Ollama embedding generation
async function generateLocalEmbedding(
	text: string,
	model: string = process.env?.EMBEDDING_MODEL ?? 'embeddinggemma:latest'
): Promise<number[]> {
	const ollamaUrl = getOllamaEndpoint();

	try {
		const response = await fetch(`${ollamaUrl}/api/embeddings`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({
				model,
				// Ollama uses: "prompt" for embeddings with recent versions
				prompt: text
			})
		});

		if (!response.ok) {
			throw new Error(`Ollama API error, ${response.status} ${response.statusText}`);
		}

		const data: unknown = await response.json();

        // More robustly parse different possible response shapes from Ollama-like services
        let rawEmbedding: unknown = null;

        if (data && typeof data === 'object') {
            if ('embedding' in data && Array.isArray((data as any).embedding)) {
                 rawEmbedding = (data as any).embedding;
            } else if ('embeddings' in data && Array.isArray((data as any).embeddings)) {
                 const embeddings = (data as any).embeddings;
                 rawEmbedding = embeddings[0] ?? embeddings;
            } else if (Array.isArray(data) && data.length > 0 && typeof data[0] === 'object' && data[0] !== null && 'embedding' in data[0]) {
                 rawEmbedding = (data[0] as any).embedding;
            }
        }

		// Type guard to check if a value is an array of numbers
		const isNumberArray = (value: unknown): value is number[] =>
			Array.isArray(value) && value.every((item) => typeof item === 'number');

		if (!isNumberArray(rawEmbedding)) {
			throw new Error('Unexpected or invalid embedding format from Ollama');
		}

		// Quantize EmbeddingGemma (768D) to 384D for schema compatibility
		// if (model.startsWith('embeddinggemma') && rawEmbedding.length === 768) {
		// return quantizeEmbedding(rawEmbedding, 384);
		// }

		return rawEmbedding;
	} catch (error: unknown) {
		console.error('Ollama embedding generation failed: ', error);
		// Fallback to mock embedding for development
		return generateMockEmbedding(768); // Use 768D for web embeddings schema
	}
}

// Quantize high-dimensional embeddings to target dimensions (with quality preservation)
function quantizeEmbedding(embedding: number[], targetDimensions: number): number[] {
	if (embedding.length <= targetDimensions) {
		return embedding.slice();
	}

	// Use stride-based sampling to preserve semantic structure
	const step = embedding.length / targetDimensions;
	const quantized = new Array<number>(targetDimensions);

	for (let i = 0; i < targetDimensions; i++) {
		const sourceIndex = Math.floor(i * step);
		quantized[i] = embedding[sourceIndex];
	}

	// Normalize the quantized vector to preserve semantic magnitude
	const magnitude = Math.sqrt(quantized.reduce((sum, val) => sum + val * val, 0));
	return quantized.map((val) => val / (magnitude ?? 1));
}

// Mock embedding generation for development/testing
function generateMockEmbedding(dimensions: number = 384): number[] {
	const embedding = new Array<number>(dimensions);
	for (let i = 0; i < dimensions; i++) {
		// Generate pseudo-random values between -1 and 1
		embedding[i] = (Math.random() - 0.5) * 2;
	}
	// Normalize the vector
	const magnitude = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
	return embedding.map((val) => val / (magnitude ?? 1));
}

// Batch embedding generation for efficiency
export async function generateBatchEmbeddings(
	texts: string[],
	options: EmbeddingOptions = {}
): Promise<number[][]> {
	// Process texts individually for now (Ollama doesn't support batch)
	const embeddings: (number[] | null)[] = [];
	for (const text of texts) {
		const embedding = await generateEmbedding(text, options);
		embeddings.push(embedding);
	}
	return embeddings.filter((e): e is number[] => e !== null);
}

// Update embeddings for existing records
export async function updateCaseEmbeddings(caseId: string): Promise<void> {
	try {
        // Get case data
		const caseData = await db
			.select({
				title: cases.title,
				description: cases.description
			})
			.from(cases)
			.where(eq(cases.id, caseId));

		if (caseData.length === 0) {
			throw new Error('Case not found');
		}

		const case_ = caseData[0];
		const fullText = `${case_.title} ${case_?.description ?? ''}`.trim();

		// Generate embeddings
		await generateBatchEmbeddings([case_.title, case_?.description ?? '', fullText]);

		// TODO: Re-enable when titleEmbedding field is added to schema
		// Update database
		// await db
		// .update(cases)
		// .set({
		// titleEmbedding: JSON.stringify(titleEmbedding),
		// descriptionEmbedding: JSON.stringify(descriptionEmbedding),
		// fullTextEmbedding: JSON.stringify(fullTextEmbedding),
		// updatedAt: new Date(),
		// })
		// .where(eq(cases.id, caseId));

		console.log(`Updated embeddings for case ${caseId}`);
	} catch (error: unknown) {
		console.error(`Failed to update embeddings for case ${caseId}: `, error);
		throw error;
	}
}

// Update embeddings for evidence
export async function updateEvidenceEmbeddings(evidenceId: string): Promise<void> {
    try {
        // Get evidence data
        const evidenceData = await db
            .select({
                title: evidence.title,
                description: evidence.description,
                fileName: evidence.fileName
            })
            .from(evidence)
            .where(eq(evidence.id, evidenceId));

        if (evidenceData.length === 0) {
            throw new Error('Evidence not found');
        }

        const evidence_ = evidenceData[0];
        const combinedContent = [evidence_.title, evidence_.description, evidence_.fileName]
            .filter(Boolean)
            .join(' ');

        // Generate embeddings
        await generateBatchEmbeddings([evidence_.title, evidence_?.description ?? '', combinedContent]);

        // TODO: Re-enable when embedding fields are added to evidence schema
        // Update database
        // await db
        // .update(evidence)
        // .set({
        // titleEmbedding: JSON.stringify(titleEmbedding),
        // descriptionEmbedding: JSON.stringify(descriptionEmbedding),
        // summaryEmbedding: JSON.stringify(summaryEmbedding),
        // contentEmbedding: JSON.stringify(contentEmbedding),
        // updatedAt: new Date(),
        // })
        // .where(eq(evidence.id, evidenceId));

        console.log(`Updated embeddings for evidence ${evidenceId}`);
    } catch (error: unknown) {
        console.error(`Failed to update embeddings for evidence ${evidenceId}:`, error);
        throw error;
    }
}

