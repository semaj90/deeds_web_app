/**
 * Auto-Tagger Pipeline
 *
 * Combines tag-generator (regex + LLM NER) with tag-sync (pgvector + Qdrant + CouchDB).
 * Call after evidence upload or document indexing.
 */
import { generateTags } from './tag-generator.js';
import { mirrorTags } from './tag-sync.js';
import type { GeneratedTag } from './types.js';
import { ENV } from '$lib/server/env.server.js';

export interface AutoTagResult {
	documentId: string;
	tags: GeneratedTag[];
	mirrored: number;
	failed: number;
	durationMs: number;
}

/**
 * Auto-tag a document: extract tags via regex+LLM, embed them, mirror to 3 stores.
 */
export async function autoTagDocument(opts: {
	documentId: string;
	text: string;
	maxTags?: number;
}): Promise<AutoTagResult> {
	const start = Date.now();
	const { documentId, text, maxTags } = opts;

	// 1. Generate tags (regex + LLM NER)
	const tagResult = await generateTags(text, { maxTags: maxTags ?? 15 });

	if (tagResult.tags.length === 0) {
		return { documentId, tags: [], mirrored: 0, failed: 0, durationMs: Date.now() - start };
	}

	// 2. Embed each unique tag label
	const embeddings = new Map<string, number[]>();
	try {
		const uniqueLabels = [...new Set(tagResult.tags.map((t) => t.label))];
		const OLLAMA_URL = ENV.OLLAMA_BASE_URL;

		for (const label of uniqueLabels) {
			try {
				const res = await fetch(OLLAMA_URL + '/api/embed', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ model: 'embeddinggemma:latest', input: label })
				});
				if (res.ok) {
					const data = (await res.json()) as { embeddings?: number[][] };
					if (data.embeddings?.[0]) {
						embeddings.set(label, data.embeddings[0]);
					}
				}
			} catch {
				// Skip individual embedding failures
			}
		}
	} catch {
		// If embedding service is down, mirror with zero vectors
	}

	// 3. Mirror to all 3 stores
	const { mirrored, failed } = await mirrorTags(tagResult.tags, documentId, embeddings);

	return {
		documentId,
		tags: tagResult.tags,
		mirrored,
		failed,
		durationMs: Date.now() - start
	};
}
