
import type { PageServerLoad, Actions } from './$types';
import { fail } from '@sveltejs/kit';
import { createQdrantService } from '$lib/server/db/qdrant-integration';
import { tryEmbedCanonical } from '$lib/server/embedding/canonical-embed.js';
import { createSearchRuntime } from '$lib/server/retrieval/search-runtime.js';

export const load: PageServerLoad = async ({ locals }) => {
    return {
        user: locals.user
    };
};

export const actions: Actions = {
    vectorSearch: async ({ request }) => {
        const formData = await request.formData();
        const query = formData.get('query') as string;

        if (!query) {
            return fail(400, { error: 'Query is empty' });
        }

        try {
            // 1. Generate embedding
            const embedResult = await tryEmbedCanonical(query, { timeoutMs: 5000 });
            if (!embedResult || !embedResult.embedding) {
                return fail(500, { error: 'Failed to generate embedding' });
            }

            // 2. Search Qdrant
            const qdrant = createQdrantService();
            const results = await qdrant.search('legal_knowledge', embedResult.embedding, 10);

            return { success: true, results };
        } catch (error) {
            console.error('Vector search failed:', error);
            return fail(500, { error: 'Search failed' });
        }
    },
    hyperRagSearch: async ({ request }) => {
        const formData = await request.formData();
        const query = formData.get('query') as string;
        const mode = (formData.get('mode') as string) || 'codebase';
        const synthesize = formData.get('synthesize') === 'on';

        if (!query) {
            return fail(400, { error: 'Query is empty' });
        }

        try {
            const runtime = createSearchRuntime();
            const result = await runtime.search({
                text: query,
                topK: 10
            });

            return {
                success: true,
                hyperRagResult: {
                    query,
                    mode,
                    synthesis: synthesize ? null : null,
                    summaryLenses: [],
                    hits: result.packets.map((packet) => ({
                        id: (packet as any).packetKey ?? (packet as any).packet_key,
                        score: (packet as any).retrieval?.crossEncoderScore ?? (packet as any).retrieval?.xgboostScore ?? (packet as any).retrieval?.rrfScore ?? 0,
                        title: (packet as any).semantic?.title ?? (packet as any).semanticTitle ?? (packet as any).title ?? '',
                        sourcePath: (packet as any).sourceRef ?? (packet as any).source_ref ?? '',
                        text: (packet as any).summary ?? '',
                        signals: {
                            topoClass: (packet as any).classification?.domainClass ?? (packet as any).domainClass ?? undefined,
                            pagerank: (packet as any).topology?.pageRank ?? undefined,
                            clusterMatch: (packet as any).topology?.somCell ?? undefined,
                            lexicalBoost: undefined,
                        },
                        reasons: ['retrieval:canonical'],
                    })),
                },
            };
        } catch (error) {
            console.error('HyperRAG search failed:', error);
            return fail(500, { error: 'HyperRAG search failed' });
        }
    },
	enhanceTags: async ({ request }) => {
        // Placeholder for AI tag enhancement
        return { success: true, tags: ['enhanced', 'ai-tag'] };
    },
	analyzeFile: async ({ request }) => {
        // Placeholder for file analysis
        return { success: true, analysis: 'File analysis pending implementation' };
    },
	generateClusterSummaries: async ({ request }) => {
         // Placeholder
         return { success: true, summary: 'Cluster summary generation pending' };
    },
	loadGraph: async ({ request }) => {
         // Placeholder for Neo4j graph loading
         return { success: true, nodes: [], edges: [] };
    }
};


