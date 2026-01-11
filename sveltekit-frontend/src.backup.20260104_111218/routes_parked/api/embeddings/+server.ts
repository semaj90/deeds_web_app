/**
 * Embeddings API Route
 * Handles embedding generation and storage for workspace notes
 */

import { json, type RequestHandler } from '@sveltejs/kit';
import {
 generateEmbedding,
 generateAndStoreNoteEmbedding,
 retrieveRAGContext,
} from '$lib/server/services/embedding-service';
import { getOllamaEndpoint } from '$lib/utils/ollama-config';

/**
 * POST /api/embeddings
 * Generate embedding for text
 */
export const POST: RequestHandler = async ({ request }) => {
 try {
 const body = await request.json();
 const { text, noteId } = body as {
 text?: string;
 noteId?: string;
 };

 // Verify Ollama endpoint is configured
 const endpoint = getOllamaEndpoint();
 if (!endpoint) {
 return json({ error: 'Ollama endpoint not configured' }, { status: 500 });
 }

 // Generate embedding for text
 if (text) {
 const embedding = await generateEmbedding(text);
 return json({ embedding, model: 'embeddinggemma:latest' });
 }

 // Generate and store embedding for a note
 if (noteId && text) {
 const embedding = await generateAndStoreNoteEmbedding(noteId, text);
 return json({ embedding, noteId, stored: true });
 }

 return json(
 { error: 'Missing required parameters: text or (noteId and text)' },
 { status: 400 }
 );
 } catch (error) {
 console.error('Embedding generation error:', error);
 return json(
 { error: error instanceof Error ? error.message : 'Failed to generate embedding' },
 { status: 500 }
 );
 }
};

/**
 * GET /api/embeddings/rag-context
 * Retrieve RAG context for a workspace query
 */
export const GET: RequestHandler = async ({ url }) => {
 try {
 const workspaceId = url.searchParams.get('workspaceId');
 const query = url.searchParams.get('query');
 const topK = parseInt(url.searchParams.get('topK') || '5', 10);

 if (!workspaceId || !query) {
 return json({ error: 'Missing required parameters: workspaceId, query' }, { status: 400 });
 }

 const context = await retrieveRAGContext(workspaceId, query, topK);
 return json({ context, workspaceId, query });
 } catch (error) {
 console.error('RAG context retrieval error:', error);
 return json(
 { error: error instanceof Error ? error.message : 'Failed to retrieve RAG context' },
 { status: 500 }
 );
 }
};
