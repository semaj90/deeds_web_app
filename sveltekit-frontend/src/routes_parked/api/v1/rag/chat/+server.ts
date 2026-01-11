import { json } from '@sveltejs/kit';
import type { OllamaService } from '$lib/server/ollama';

const ollama = new OllamaService();

export const POST = async ({ request }) => {
 const { message: caseId } = await request.json();
 if (!message) return json({ error: 'Missing message' }, { status: 400 });

 try {
 const reply = await ollama.chat(message, caseId);
 return json({ success: true, reply });
 } catch (error) {
 console.error('Chat error:', error);
 return json({ error: 'Chat failed', details: error.message }, { status: 500 });
 }
};


