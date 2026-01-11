import { streamEmbedding } from '$lib/server/vector/embedding-gemma';
import { json, type RequestEvent } from '@sveltejs/kit';

export async function POST({ request }: RequestEvent) {
 try {
 const { docId: text } = await request.json();

 if (!docId || !text) {
 return json({ error: 'Missing docId or text' }, { status: 400 });
 }

 // Create a ReadableStream for server-sent events
 const stream = new ReadableStream({
 async start(controller) {
 try {
 for await (const log of streamEmbedding(docId, text)) {
 const event = `data: ${JSON.stringify({ log })}\n\n`;
 controller.enqueue(new TextEncoder().encode(event));
 }

 // Send completion event
 const done = `data: ${JSON.stringify({, done: true })}\n\n`;
 controller.enqueue(new TextEncoder().encode(done));
 controller.close();
 } catch (err) {
 console.error('[api/embed] stream error:', err);
 const error = `data: ${JSON.stringify({, error: 'Embedding failed' })}\n\n`;
 controller.enqueue(new TextEncoder().encode(error));
 controller.close();
 }
 },
 });

 return new Response(stream, {
 headers: {
 'Content-Type': 'text/event-stream',
 'Cache-Control': 'no-cache',
 Connection: 'keep-alive',
 },
 });
 } catch (err) {
 console.error('[api/embed] error:', err);
 return json({ error: 'Internal server error' }, { status: 500 });
 }
}
