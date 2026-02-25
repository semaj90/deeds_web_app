import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { ENV } from '$lib/server/env.server.js';

/** POST /api/chat — Simple chat endpoint (also handles /api/chat-test callers) */
export const POST: RequestHandler = async ({ request }) => {
	try {
		const body = await request.json();

		// Support both { message } and { messages: [{ role, content }] } formats
		let userContent: string;
		if (body.messages && Array.isArray(body.messages)) {
			const lastUser = body.messages.filter((m: { role: string }) => m.role === 'user').pop();
			userContent = lastUser?.content || '';
		} else {
			userContent = body.message || body.prompt || '';
		}

		if (!userContent.trim()) {
			return json({ message: 'No message provided', response: '' }, { status: 400 });
		}

		const res = await fetch(`${ENV.OLLAMA_BASE_URL}/api/chat`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				model: 'gemma3-legal:latest',
				messages: [
					{ role: 'system', content: 'You are a helpful legal AI assistant.' },
					...(body.messages || [{ role: 'user', content: userContent }])
				],
				stream: false,
				options: { temperature: body.temperature ?? 0.7 }
			})
		});

		if (!res.ok) {
			return json({ message: 'AI service unavailable', response: '' }, { status: 502 });
		}

		const data = await res.json();
		const responseText = data.message?.content || '';

		return json({
			message: responseText,
			response: responseText,
			model: data.model || 'gemma3-legal:latest'
		});
	} catch (err) {
		console.error('[/api/chat]', err);
		return json({ message: 'Chat service error', response: '' }, { status: 503 });
	}
};
