
import type { PageServerLoad, Actions } from './$types';
import { fail } from '@sveltejs/kit';
import { createQdrantService } from '$lib/server/db/qdrant-integration';
import { tryEmbedOllama } from '$lib/server/embeddings/ollama';

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
            const embedResult = await tryEmbedOllama(query);
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


