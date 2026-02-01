import { json } from '@sveltejs/kit';
import type { RAGService } from '$lib/server/rag';
import type { DrizzleTypes } from '$lib/types/enhanced-svelte5-types';

const rag = new RAGService();

export const POST = async ({ request }) => {
 const { query } = await request.json();
 if (!query) return json({ error: 'Missing query' }, { status: 400 });

 try {
 const results = await rag.search(query);
 return json({ success: true, results });
 } catch (error) {
 console.error('Search error:', error);
 return json({ error: 'Search failed', details: error.message }, { status: 500 });
 }
};


