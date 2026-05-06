import { bifrostChat } from '$lib/server/ollama.js';
import { generateSingleEmbedding } from '$lib/server/grpc/embedding-client.js';
import { QdrantManager, deterministicPointId } from '$lib/server/vector/qdrant-manager.js';
import { db } from '$lib/server/db/client';
import { embeddedSummaries } from '$lib/server/db/schema.js';

/**
 * Summary Lens Generator: Produces multi-dimensional semantic "lenses"
 * for high-value codebase chunks, directories, or clusters.
 */
export async function generateSummaryLenses(params: {
	stableKey: string;
	targetType: string; // 'file' | 'dir' | 'cluster' | 'chunk'
	content: string;
	lenses: string[]; // ['purpose', 'risk', 'api_surface', 'retrieval_role']
}) {
	const qdrant = new QdrantManager();
	const results = [];

	for (const lensType of params.lenses) {
		try {
			// 1. Generate lens text via Gemma4
			const lensText = await generateLensText(params.content, lensType, params.targetType);

			// 2. Generate embedding
			const embedding = await generateSingleEmbedding(lensText);

			// 3. Store in Postgres (Audit record + Durable text)
			await db.insert(embeddedSummaries).values({
				stableKey: params.stableKey,
				sourceType: params.targetType,
				sourceHash: 'T2_SUMMARY', // Tier 2 summary marker
				summaryType: lensType,
				summaryText: lensText,
				model: 'gemma4-legal-vlm',
				embeddingModel: 'embeddinggemma',
				qdrantCollection: 'summary_lenses_768',
				updatedAt: new Date()
			}).onConflictDoUpdate({
				target: [embeddedSummaries.stableKey, embeddedSummaries.sourceHash, embeddedSummaries.summaryType],
				set: { summaryText: lensText, updatedAt: new Date() }
			});

			// 4. Store in Qdrant (Retrieval vector)
			await qdrant.client.upsert(qdrant.collections.summary_lenses, {
				wait: false,
				points: [{
					id: deterministicPointId(`${params.stableKey}:${lensType}`),
					vector: { summary: embedding },
					payload: {
						stable_key: params.stableKey,
						lens_type: lensType,
						text: lensText,
						target_type: params.targetType,
						generated_at: new Date().toISOString()
					}
				}]
			});

			results.push({ lensType, success: true, summaryText: lensText });
		} catch (error) {
			console.error(`[summary-lens] Failed to generate ${lensType} for ${params.stableKey}:`, error);
			results.push({ lensType, success: false, error: String(error) });
		}
	}

	return results;
}

async function generateLensText(content: string, lensType: string, targetType: string): Promise<string> {
	const prompts: Record<string, string> = {
		purpose: `Summarize the primary purpose and architectural role of this ${targetType}. Why does it exist and what problem does it solve?`,
		risk: `Identify potential risks, vulnerabilities, or maintenance "gotchas" in this ${targetType}. Focus on security, performance, and side effects.`,
		api_surface: `Document the public API surface of this ${targetType}. List exported functions, types, and their intent.`,
		retrieval_role: `If an agent is looking for information related to this ${targetType}, what specific keywords or concepts should trigger this result? Describe its relevance in a RAG pipeline.`,
		dependencies: `What are the critical upstream and downstream dependencies of this ${targetType}? How does it fit into the dependency graph?`
	};

	const prompt = prompts[lensType] ?? `Summarize this ${targetType} through the lens of ${lensType}.`;

	const response = await bifrostChat([
		{ role: 'system', content: 'You are a technical architect specializing in SvelteKit and agentic retrieval. Provide concise, high-density summaries.' },
		{ role: 'user', content: `${prompt}\n\nContent:\n${content.slice(0, 4000)}` }
	], 'gemma4-legal-vlm');

	return response.trim();
}
