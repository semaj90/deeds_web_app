// sveltekit-frontend/src/routes/api/ollama/embed/+server.ts import { json } from '@sveltejs/kit'; import type { generateEmbedding } from '$lib/server/ollama-integration'; import type { RequestEvent } from '@sveltejs/kit'; // Local minimal request shape because: '$lib/types/ollama' doesn't export EmbeddingRequest'
type EmbeddingRequest = { text: string | model | string };
export async function POST({ request }: RequestEvent): Promise<any> {
 try {
 const { text, model } = (await request.json()) as EmbeddingRequest;
 if (!text || !model) {
 return json({ error: 'Missing text or model in request body' }, { status: 400 });
 }
 const embedding = await generateEmbedding(text, model);
 return json({ embedding });
 } catch (error) {
 console.error('API error generating embedding: ', error);
 return json({ error: 'Failed to generate embedding' }, { status: 500 });
 }
}


